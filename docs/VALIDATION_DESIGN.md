# Cross-Validation Layer Design Spec

**Status:** Draft  
**Scope:** Design only — no implementation.  
**Owner:** Architect / AI Validation Layer  

---

## 1. Overview & Goals

The current `/api/chat` pipeline generates an AI answer in a single pass and assigns confidence via a naive heuristic (`hasLocal && hasWeb && isSpecialist && highOverlap`). The model never re-reads its own output against the evidence that was retrieved. This creates a risk of hallucinated details, unsupported clinical claims, or contradictions with PubMed abstracts or local knowledge chunks.

**Goals of the validation layer:**
1. **Second-pass fact-checking** — Ask the same AI provider (via a cheaper model) to compare the generated answer against every source that was retrieved.
2. **Structured critique** — Produce a machine-readable JSON assessment listing contradictions, unsupported claims, supported claims, and a suggested confidence level.
3. **Safer user-facing output** — Override the heuristic confidence downward when the validator disagrees, and flag `requiresHumanReview` when high-severity contradictions are found.
4. **Graceful degradation** — If the validator fails (timeout, API error), preserve the original answer and mark the response as needing human review.
5. **Cost & latency control** — Use a smaller/cheaper model for validation, truncate long source payloads to a token budget, and enforce a short timeout.

---

## 2. Data Flow Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│                          POST /api/chat                              │
└─────────────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────┐
│ classifyAgent()      │───► agent prompt, overlapScore
└──────────────────────┘
    │
    ▼
┌──────────────────────┐
│ searchKnowledge()    │───► top-8 local chunks (BM25)
└──────────────────────┘
    │
    ▼
┌──────────────────────┐
│ webCounterCheck()    │───► up to 5 PubMed abstracts
└──────────────────────┘
    │
    ▼
┌──────────────────────┐
│ computeConfidence()  │───► heuristic confidence (existing)
└──────────────────────┘
    │
    ▼
┌──────────────────────┐     ┌─────────────────────────────┐
│ callAI()             │────►│ First-pass LLM generation   │
│ (primary model)      │     │ answer + reasoning            │
└──────────────────────┘     └─────────────────────────────┘
    │
    │ answer === null ?
    ├─YES──► buildFallbackAnswer() ──► SKIP validation ──► return
    │
    ▼ NO
┌──────────────────────┐     ┌─────────────────────────────┐
│ validateAnswer()     │────►│ Second-pass LLM fact-check  │
│ (cheaper model)      │     │ structured JSON critique      │
└──────────────────────┘     └─────────────────────────────┘
    │
    ▼
┌──────────────────────┐
│ mergeValidation()    │───► stricter confidence, human-review flag,
└──────────────────────┘     validation object appended
    │
    ▼
┌──────────────────────┐
│ HTTP 200 JSON resp   │
└──────────────────────┘
```

---

## 3. `api/lib/validate.js` Interface Spec

### 3.1 Exported Function

```javascript
/**
 * Cross-validate a first-pass AI answer against retrieved sources.
 *
 * @param {Object} params
 * @param {string} params.answer           — The first-pass AI-generated answer.
 * @param {Array<Object>} params.sources   — All evidence sources retrieved for the query.
 *   Each element is either:
 *     { type: 'local', path: string, text: string, score: number }
 *   or
 *     { type: 'pubmed', title: string, abstract: string|null, authors: string[],
 *       journal: string, pubDate: string, url: string }
 * @param {string} params.query            — The original user message.
 * @param {Object|null} params.scanContext — Any scan metadata / report fields.
 * @param {string} params.agent            — Agent key used for routing (e.g. 'neurology').
 * @returns {Promise<ValidationResult>}
 */
async function validateAnswer({ answer, sources, query, scanContext, agent })
```

### 3.2 Return Type: `ValidationResult`

```typescript
interface ValidationResult {
  contradictions: Array<{
    claim: string;           // sentence or clause from the answer
    source_excerpt: string;  // relevant sentence from the source
    severity: 'high' | 'moderate' | 'low';
  }>;
  unsupported_claims: string[];   // claims in answer with no source support
  supported_claims: string[];     // claims well-supported by sources
  suggested_confidence: 'high' | 'moderate' | 'low';
  requiresHumanReview: boolean;   // true if any high-severity contradiction
  validation_summary: string;     // 1-2 sentence user-facing summary
}
```

### 3.3 Internal Helpers (private)

| Function | Signature | Purpose |
|----------|-----------|---------|
|`resolveValidationModel()`|`() => { baseUrl, apiKey, model, label } \| null`|Picks the cheaper mapped model (see §8) or `VALIDATION_MODEL` env override. Returns `null` when no provider is configured.|
|`truncateSources(sources, maxChars)`|`(Array<Object>, number) => Array<Object>`|Truncates each source text so the total JSON-serialized source block stays under `maxChars`. Priority: keep PubMed abstracts intact up to a per-source cap, then trim local chunks. Never drop a source entirely unless it is empty.|
|`truncateAnswer(answer, maxChars)`|`(string, number) => string`|Hard-truncates answer with ellipsis if it exceeds budget.|
|`buildValidatorPrompt({ query, answer, sources, scanContext })`|`(...) => string`|Assembles the system + user prompt sent to the validation model.|
|`parseValidatorJson(raw)`|`(string) => ValidationResult`|Strips markdown fences, attempts `JSON.parse`, applies schema defaults for missing fields.|

---

## 4. Validation Prompt Template

### 4.1 System Prompt

```text
You are a clinical fact-checker. Your job is to compare an AI-generated answer against retrieved evidence and produce a structured critique.

RULES:
1. Only evaluate claims of fact, clinical statements, and numerical assertions. Do not penalize polite phrasing, caveats, or generic safe-harbor statements (e.g., "consult a clinician").
2. A claim is "contradicted" only when a source explicitly states the opposite or provides incompatible data.
3. A claim is "unsupported" when no source mentions it or provides evidence for it. Do NOT mark a claim unsupported just because it is not literally quoted; paraphrased agreement counts as support.
4. Severity:
   - high: direct contradiction of a clinical fact, dosage, or guideline.
   - moderate: partial mismatch, outdated interpretation, or overstatement.
   - low: minor discrepancy in wording that does not change clinical meaning.
5. Suggested confidence:
   - high: all key claims are supported and none are contradicted.
   - moderate: most claims supported, maybe minor unsupported details or low-severity contradictions.
   - low: any high-severity contradiction OR more than ~30% of factual claims unsupported.
6. requiresHumanReview must be true if any contradiction severity is "high".
7. validation_summary must be 1-2 concise sentences suitable for a non-technical user.
8. Output ONLY valid JSON. No markdown fences, no commentary outside the JSON.
```

### 4.2 User Prompt (assembled by `buildValidatorPrompt`)

```text
Original user query:
---
{{query}}
---

AI-generated answer to validate:
---
{{truncated_answer}}
---

Scan context / report fields:
---
{{scan_context_json}}
---

Retrieved evidence sources ({{source_count}} total):
{{sources_block}}

Produce the JSON assessment now.
```

Where `{{sources_block}}` serializes each source:

- **PubMed**:
  ```text
  [PubMed] {{title}} ({{journal}}, {{pubDate}})
  {{abstract}}
  ```
- **Local**:
  ```text
  [Local] {{path}} (BM25 score: {{score}})
  {{text}}
  ```

---

## 5. `api/chat.js` Integration Points

### 5.1 Imports (top of file, add after existing requires)

```javascript
const { validateAnswer } = require('./lib/validate');
```

### 5.2 Post-`callAI` validation block

**Location:** Immediately after the `try/callAI` block (around line 204-208) and before the `if (!answer)` fallback.

**Logic:**

```javascript
let validation = null;

// Only validate if we got a real AI answer (not a fallback / error string)
const gotRealAnswer = answer && !answer.includes('AI model note:');
if (gotRealAnswer && provider) {
  try {
    validation = await validateAnswer({
      answer,
      sources: [
        ...localMatches.map(m => ({ type: 'local', ...m })),
        ...(webResult?.sources || []).map(s => ({ type: 'pubmed', ...s }))
      ],
      query: message,
      scanContext: { scanContext, reportFields },
      agent
    });
  } catch (validationError) {
    validation = {
      error: validationError.message,
      requiresHumanReview: true
    };
  }
}
```

### 5.3 Confidence & review-flag merge

**Location:** Between validation and the `res.status(200).json(...)` call (around line 214).

Replace the simple assignment with:

```javascript
let finalConfidence = confidence;               // heuristic value
let finalRequiresHumanReview = requiresHumanReview; // heuristic flag

if (validation && !validation.error) {
  // Override confidence downward if validator is stricter
  const strictness = { high: 3, moderate: 2, low: 1 };
  if (strictness[validation.suggested_confidence] < strictness[finalConfidence]) {
    finalConfidence = validation.suggested_confidence;
  }
  // Human review if either layer says so
  finalRequiresHumanReview = finalRequiresHumanReview || validation.requiresHumanReview;
}
```

### 5.4 Response payload

Update the `res.status(200).json({ ... })` object:

```javascript
res.status(200).json({
  answer,
  confidence: finalConfidence,
  requiresHumanReview: finalRequiresHumanReview,
  agentUsed: agent,
  local_sources: localMatches.map(match => ({
    path: match.path,
    chunk_index: match.chunk_index,
    score: match.score
  })),
  web_sources: webResult?.sources || [],
  model_used: provider ? provider.label : 'local-fallback',
  validation                           // NEW — null when skipped
});
```

### 5.5 Summary of line-level changes

| Line(s) | Change |
|---------|--------|
| ~4 | Add `validateAnswer` import. |
| ~204-212 | Insert validation block after `callAI()` and before fallback. |
| ~199-200 | Replace `confidence` / `requiresHumanReview` with mutable `finalConfidence` / `finalRequiresHumanReview` and merge logic. |
| ~214-226 | Add `validation` key to JSON response. |

---

## 6. Response Schema Changes

### 6.1 New top-level field

```json
{
  "answer": "...",
  "confidence": "moderate",
  "requiresHumanReview": true,
  "agentUsed": "neurology",
  "local_sources": [...],
  "web_sources": [...],
  "model_used": "gpt-4.1-mini",
  "validation": {
    "contradictions": [
      {
        "claim": "...",
        "source_excerpt": "...",
        "severity": "high"
      }
    ],
    "unsupported_claims": ["..."],
    "supported_claims": ["..."],
    "suggested_confidence": "low",
    "requiresHumanReview": true,
    "validation_summary": "One high-severity contradiction was found regarding dosage."
  }
}
```

### 6.2 Validation-skipped shape

When the AI API is down and a fallback answer is returned:

```json
{
  "validation": null
}
```

### 6.3 Validation-error shape

When the validator AI call fails:

```json
{
  "validation": {
    "error": "Validation AI request failed (gpt-4.1-mini): 504 Gateway Timeout",
    "requiresHumanReview": true
  }
}
```

---

## 7. Error Handling & Fallback Behavior

| Scenario | Behavior |
|----------|----------|
| **Primary AI succeeds** | Proceed to validation. If validation succeeds, merge. If validation fails, return original answer + `validation.error` + `requiresHumanReview: true`. |
| **Primary AI fails (API down)** | `buildFallbackAnswer()` is used. `validation` is set to `null`. Existing heuristic confidence and `requiresHumanReview` are preserved. |
| **Validation model not configured** | Skip validation silently (`validation: null`). Do not fail the request. |
| **Validation AI returns non-JSON** | `parseValidatorJson` catches parse failure, returns `validation.error` + `requiresHumanReview: true`. |
| **Validation AI timeout (>15s)** | Abort fetch, treat as error case above. |
| **Source budget exceeded** | `truncateSources` caps total serialized sources to ~6,000 characters (proxy for ~1,500 tokens). Answer capped to ~2,000 characters. Truncation is logged via `console.warn`. |

---

## 8. Cost / Latency Considerations

### 8.1 Cheaper-model mapping

The validator should **not** reuse the heavy primary model unless no cheaper option exists.

| Primary Model | Default Validation Model | Rationale |
|---------------|--------------------------|-----------|
| `moonshot-v1-32k` | `moonshot-v1-8k` | Faster, lower per-token cost. |
| `moonshot-v1-128k` | `moonshot-v1-8k` | Same rationale. |
| `gpt-4.1` | `gpt-4.1-mini` | ~10× cheaper, lower latency. |
| `gpt-4.1-mini` | `gpt-4.1-nano` | If available; otherwise stay on `gpt-4.1-mini`. |
| `gpt-4o` | `gpt-4.1-mini` | Cost optimization. |

**Override:** If `process.env.VALIDATION_MODEL` is set, it takes precedence over the hardcoded map.

### 8.2 Budgets & truncation

- **Source block:** max 6,000 characters (approx. 1,500 tokens).
- **Answer:** max 2,000 characters (approx. 500 tokens).
- **Query + context:** max 1,000 characters (approx. 250 tokens).
- **Timeout:** 15 seconds for the validation fetch.

These numbers keep the second call well under most model context windows while limiting cost.

### 8.3 Caching opportunity (future)

Validation results for identical `(answer_hash, source_hash)` tuples could be cached in-memory for 5 minutes. This is **not** required in the initial design but noted for later optimization.

---

## 9. Testing Strategy

### 9.1 Unit tests for `api/lib/validate.js`

Create `tests/validate.test.js` (or equivalent) using a lightweight test runner (e.g., Node built-in `node:test`).

| Test Case | What to Assert |
|-----------|----------------|
| **Happy path** | Mock fetch returns valid JSON. Assert output contains all required fields and correct `suggested_confidence`. |
| **JSON with markdown fences** | Input contains ` ```json ... ``` `. Assert `parseValidatorJson` strips fences and parses correctly. |
| **Truncation** | Feed 20 long sources. Assert total serialized character length ≤ budget and no source is dropped empty. |
| **Model mapping** | Set `AI_MODEL=gpt-4.1` and assert `resolveValidationModel()` returns `gpt-4.1-mini` (or `VALIDATION_MODEL` override). |
| **API failure** | Mock fetch to throw / return 500. Assert returned object has `error` string and `requiresHumanReview: true`. |
| **Timeout** | Mock fetch that never resolves. Assert abort signal fires and error object is returned. |

### 9.2 Integration tests for `/api/chat`

Extend `scripts/integration_smoke.js` (or create `tests/chat.integration.test.js`):

| Test Case | What to Assert |
|-----------|----------------|
| **End-to-end with validation** | POST valid chat request. Assert `validation` object exists, contains `contradictions`, `supported_claims`, etc. |
| **Confidence override** | Use a mock validator that returns `suggested_confidence: "low"` while heuristic is `"moderate"`. Assert final `confidence === "low"`. |
| **Human-review flag** | Mock validator returns a high-severity contradiction. Assert `requiresHumanReview === true` even if heuristic says `false`. |
| **Fallback skip** | Force primary AI to fail (e.g., bad API key). Assert `validation === null` and response still returns 200. |
| **Validation error fallback** | Primary AI succeeds, but validator mock throws. Assert `validation.error` is present and `requiresHumanReview === true`. |

### 9.3 Prompt robustness tests

| Test Case | What to Assert |
|-----------|----------------|
| **Adversarial answer** | Inject a claim that directly contradicts a PubMed abstract. Assert validator flags it as `high` severity. |
| **Unsupported claim** | Inject a fabricated statistic. Assert it appears in `unsupported_claims`. |
| **Safe-harbor pass-through** | Answer contains only cautious generic language ("consult a clinician"). Assert `supported_claims` may be empty but no false `high` severity is raised. |

---

## 10. Open Questions / Future Work

1. **Token-based truncation:** The current budget uses character counts as a proxy. If the project later adds a tokenizer dependency (e.g., `gpt-tokenizer` or `tiktoken`), switch `truncateSources` and `truncateAnswer` to token budgets for higher precision.
2. **Citation alignment:** Future iterations could require the validator to return `source_index` integers so the UI can highlight exactly which source supports or contradicts each claim.
3. **Multi-turn validation:** For conversational threads, the validator could receive prior messages as additional context to avoid flagging restatements of earlier supported claims.

---

## 11. Appendix: File Checklist (for implementation phase)

- [ ] Create `api/lib/validate.js` with `validateAnswer`, `resolveValidationModel`, `truncateSources`, `truncateAnswer`, `buildValidatorPrompt`, `parseValidatorJson`.
- [ ] Modify `api/chat.js` — import validator, insert post-`callAI` block, merge confidence/review flags, append `validation` to response.
- [ ] Add `VALIDATION_MODEL` to `.env.example` and document in `docs/VERCEL_ASSISTANT.md`.
- [ ] Write unit tests (`tests/validate.test.js`).
- [ ] Write / extend integration smoke tests (`scripts/integration_smoke.js`).
- [ ] Verify no regression in fallback path when AI provider is absent.
