const SYSTEM_PROMPT = `You are a clinical fact-checker. Your job is to compare an AI-generated answer against retrieved evidence and produce a structured critique.

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
8. Output ONLY valid JSON. No markdown fences, no commentary outside the JSON.`;

function resolveValidationModel(baseModel) {
  if (process.env.VALIDATION_MODEL) {
    return process.env.VALIDATION_MODEL;
  }
  const map = {
    'gpt-4.1': 'gpt-4.1-mini',
    'gpt-4.1-mini': 'gpt-4.1-mini',
    'moonshot-v1-32k': 'moonshot-v1-8k',
    'moonshot-v1-8k': 'moonshot-v1-8k'
  };
  return map[baseModel] || baseModel;
}

function resolveAIProvider(mappedModel) {
  if (process.env.KIMI_API_KEY) {
    return {
      apiKey: process.env.KIMI_API_KEY,
      baseUrl: 'https://api.moonshot.cn/v1',
      model: mappedModel,
      label: mappedModel
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: 'https://api.openai.com/v1',
      model: mappedModel,
      label: mappedModel
    };
  }
  return null;
}

function truncateText(text, maxChars) {
  const str = String(text || '').replace(/\s+/g, ' ').trim();
  if (str.length <= maxChars) return str;
  return str.slice(0, maxChars - 3) + '...';
}

function truncateSources(sources, maxChars = 6000) {
  const local = (sources.local || []).map(s => ({
    type: 'local',
    path: s.path || '',
    text: s.text || '',
    score: typeof s.score === 'number' ? s.score : 0
  }));
  const web = (sources.web || []).map(s => ({
    type: 'pubmed',
    title: s.title || '',
    abstract: s.abstract || '',
    authors: s.authors || [],
    journal: s.journal || s.sourceName || s.source || '',
    pubDate: s.pubDate || s.published || '',
    url: s.url || ''
  }));

  const pubmedCap = 1200;
  const localCap = 800;

  for (const s of web) {
    s.abstract = truncateText(s.abstract, pubmedCap);
  }
  for (const s of local) {
    s.text = truncateText(s.text, localCap);
  }

  function buildBlock(items) {
    return items.map(s => {
      if (s.type === 'pubmed') {
        return `[PubMed] ${s.title} (${s.journal}, ${s.pubDate})\n${s.abstract}`;
      }
      return `[Local] ${s.path} (BM25 score: ${s.score})\n${s.text}`;
    }).join('\n\n');
  }

  local.sort((a, b) => b.score - a.score);

  let allItems = [...web, ...local];
  let block = buildBlock(allItems);
  if (block.length <= maxChars) return allItems;

  for (let i = local.length - 1; i >= 0; i--) {
    allItems = [...web, ...local.slice(0, i)];
    block = buildBlock(allItems);
    if (block.length <= maxChars) break;
  }

  if (block.length > maxChars) {
    const remaining = maxChars;
    const headers = allItems.map(() => 80).reduce((a, b) => a + b, 0);
    const perItem = Math.max(100, Math.floor((remaining - headers) / allItems.length));
    allItems = allItems.map(s => {
      if (s.type === 'pubmed') {
        return { ...s, abstract: truncateText(s.abstract, perItem) };
      }
      return { ...s, text: truncateText(s.text, perItem) };
    });
    block = buildBlock(allItems);
    if (block.length > maxChars) {
      block = block.slice(0, maxChars);
    }
  }

  if (block.length > maxChars) {
    console.warn('[validate] Sources truncated to fit budget:', block.length, 'chars');
  }

  return allItems;
}

function buildValidatorPrompt({ query, answer, sources, scanContext, agent, reportFields }) {
  const truncatedAnswer = truncateText(answer, 2000);
  const queryText = truncateText(query, 1000);
  const scanJson = JSON.stringify({ scanContext, reportFields }).slice(0, 1000);

  const items = truncateSources(sources, 6000);
  const sourcesBlock = items.map(s => {
    if (s.type === 'pubmed') {
      return `[PubMed] ${s.title} (${s.journal}, ${s.pubDate})\n${s.abstract}`;
    }
    return `[Local] ${s.path} (BM25 score: ${s.score})\n${s.text}`;
  }).join('\n\n');

  const userPrompt = `Original user query:
---
${queryText}
---

AI-generated answer to validate:
---
${truncatedAnswer}
---

Scan context / report fields:
---
${scanJson}
---

Retrieved evidence sources (${items.length} total):
${sourcesBlock}

Produce the JSON assessment now.`;

  return {
    system: SYSTEM_PROMPT,
    user: userPrompt
  };
}

function parseValidatorJson(raw) {
  let cleaned = String(raw || '').trim();

  const fenceStart = cleaned.indexOf('```');
  if (fenceStart !== -1) {
    const firstNewline = cleaned.indexOf('\n', fenceStart);
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1);
    } else {
      cleaned = cleaned.slice(fenceStart + 3);
    }
    const fenceEnd = cleaned.lastIndexOf('```');
    if (fenceEnd !== -1) {
      cleaned = cleaned.slice(0, fenceEnd);
    }
    cleaned = cleaned.trim();
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    return {
      error: `Validator JSON parse failed: ${err.message}`,
      requiresHumanReview: true
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      error: 'Validator returned non-object JSON',
      requiresHumanReview: true
    };
  }

  const contradictions = Array.isArray(parsed.contradictions)
    ? parsed.contradictions.filter(c => c && typeof c === 'object')
    : [];
  const unsupported_claims = Array.isArray(parsed.unsupported_claims) ? parsed.unsupported_claims : [];
  const supported_claims = Array.isArray(parsed.supported_claims) ? parsed.supported_claims : [];
  const validation_summary = typeof parsed.validation_summary === 'string' ? parsed.validation_summary : '';
  let suggested_confidence = parsed.suggested_confidence;
  if (!['high', 'moderate', 'low'].includes(suggested_confidence)) {
    suggested_confidence = 'low';
  }
  const requiresHumanReview = !!parsed.requiresHumanReview || contradictions.some(c => c.severity === 'high');

  return {
    contradictions,
    unsupported_claims,
    supported_claims,
    suggested_confidence,
    requiresHumanReview,
    validation_summary
  };
}

async function validateAnswer({ answer, sources, query, scanContext, agent, reportFields }) {
  const baseModel = (process.env.AI_MODEL || '').trim();
  const mappedModel = resolveValidationModel(baseModel);
  const provider = resolveAIProvider(mappedModel);

  if (!provider) {
    return {
      error: 'No AI provider configured for validation',
      requiresHumanReview: true
    };
  }

  const prompt = buildValidatorPrompt({ query, answer, sources, scanContext, agent, reportFields });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: provider.model,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Validation AI request failed (${provider.label}): ${response.status} ${text}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';

    const result = parseValidatorJson(raw);
    if (result.error) {
      return { ...result, model_used: provider.label };
    }

    return {
      ...result,
      model_used: provider.label
    };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return {
        error: 'Validation AI request timed out after 15s',
        requiresHumanReview: true,
        model_used: provider.label
      };
    }
    return {
      error: err.message,
      requiresHumanReview: true,
      model_used: provider.label
    };
  }
}

module.exports = {
  validateAnswer,
  resolveValidationModel,
  buildValidatorPrompt,
  parseValidatorJson
};
