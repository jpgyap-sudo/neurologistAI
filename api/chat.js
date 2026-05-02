const fs = require('fs');
const path = require('path');
const { z } = require('zod');
const OpenAI = require('openai');
const { searchKnowledge } = require('./lib/knowledge');
const { webCounterCheck } = require('./lib/web-check');
const { handleOptions, readJsonBody, setCors } = require('./lib/request');
const { validateAnswer } = require('./lib/validate');

// ===== ZOD SCHEMAS =====
const ChatRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["system", "user", "assistant"]),
    content: z.string()
  })).optional(),
  message: z.string().optional(),
  agent: z.enum(["auto", "radiology", "neurology", "rehab", "medication", "general", "research"]).optional().default("auto"),
  context: z.object({
    imagingMetrics: z.any().optional(),
    lpResults: z.any().optional(),
    dadTimeline: z.any().optional(),
    currentScanSummary: z.any().optional(),
    scanContext: z.string().optional(),
    reportFields: z.any().optional()
  }).optional().default({}),
  scanContext: z.string().optional(),
  reportFields: z.any().optional(),
  counterCheck: z.boolean().optional().default(true)
}).refine(data => data.messages || data.message, {
  message: "Either messages or message must be provided"
});

// ===== AGENT ROUTER =====
const AGENT_KEYWORDS = {
  radiology: ['scan', 'ct', 'mri', 'ventricle', 'hydrocephalus', 'desh', 'imaging', 'report', 'x-ray', 'ultrasound', 'pet', 'angiography', 'radiograph', 'tomography', 'contrast', 'effacement', 'sulci', 'fissure', 'evans index', 'callosal angle', 'temporal horn', 'edema', 'flair', 't1', 't2', 'dwu', 'dwi', 'slice', 'dicom', 'attenuation', 'hyperdense', 'hypodense', 'mass effect', 'midline shift'],
  neurology: ['neuro', 'consciousness', 'mcs', 'crs-r', 'seizure', 'stroke', 'icp', 'gcs', 'coma', 'vegetative', 'minimally conscious', 'alertness', 'arousal', 'cognition', 'dementia', 'parkinson', 'als', 'myasthenia', 'meningitis', 'encephalitis', 'subarachnoid', 'subdural', 'epidural', 'hematoma', 'aneurysm', 'vasospasm', 'cerebral perfusion', 'herniation', 'brain death', 'neuro exam', 'pupil', 'reflex', 'tone', 'clonus', 'babinski', 'nystagmus', 'aphasia', 'apraxia', 'ataxia', 'neuropathy', 'myelopathy', 'synkinesis'],
  medication: ['drug', 'med', 'amantadine', 'baclofen', 'interaction', 'prescription', 'pharmacy', 'pharmacology', 'dose', 'dosage', 'taper', 'withdrawal', 'side effect', 'adverse', 'contraindication', 'sedative', 'hypnotic', 'antipsychotic', 'anticholinergic', 'antiepileptic', 'antihypertensive', 'neurostimulant', 'methylphenidate', 'modafinil', 'tizanidine', 'antibiotic', 'vancomycin', 'phenytoin', 'levetiracetam', 'mannitol', 'hypertonic', 'aspirin', 'clopidogrel', 'warfarin', 'heparin', ' doac ', 'anticoagulant', 'thrombolytic', 'rtpa', 'alteplase'],
  rehab: ['therapy', 'rehab', 'pt', 'ot', 'speech', 'swallow', 'mobility', 'physical therapy', 'occupational therapy', 'physiotherapy', 'speech therapy', 'slt', 'splint', 'brace', 'walker', 'wheelchair', 'gait', 'balance', 'transfer', 'bowel', 'bladder', 'spasticity', 'contracture', 'pressure sore', 'bedsore', 'decubitus', 'learned non-use', 'constraint induced', 'cims', 'bobath', 'ndt', 'functional electrical stimulation', 'fes', 'botulinum', 'botox', 'tone', 'rom', 'prom', 'arom', 'mrc', 'fac', 'fm ', 'fugl-meyer', 'barthel', 'mrs', 'rankin'],
  research: ['study', 'evidence', 'paper', 'pubmed', 'trial', 'guideline', 'systematic review', 'meta-analysis', 'cohort', 'case series', 'case report', 'randomized', 'rct', 'clinical trial', 'phase ', 'protocol', 'inclusion', 'exclusion', 'endpoint', 'outcome', 'biomarker', 'efficacy', 'effectiveness', 'recommendation', 'consensus', 'society', 'aans', 'cns', 'aan', 'nice', 'sign', 'asa', 'esh', 'ich e9', 'ich e6', 'gcp', 'prisma', 'cochrane', 'medline', 'scopus', 'embase', 'cinahl', 'literature', 'bibliography', 'citation', 'reference']
};

function detectAgent(messages) {
  const last = messages[messages.length - 1]?.content?.toLowerCase() || "";
  let bestAgent = 'neurology';
  let bestScore = 0;

  for (const [agent, keywords] of Object.entries(AGENT_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (last.includes(kw.toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  return bestAgent;
}

function classifyAgent(message) {
  const lower = message.toLowerCase();
  let bestAgent = 'neurology';
  let bestScore = 0;

  for (const [agent, keywords] of Object.entries(AGENT_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score += 1;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }

  return { agent: bestAgent, overlapScore: bestScore };
}

const AGENT_FILE_MAP = {
  radiology: 'radiology_agent.md',
  neurology: 'neurology_agent.md',
  medication: 'medication_review_agent.md',
  rehab: 'rehab_agent.md',
  research: 'research_librarian_agent.md'
};

function loadAgentPrompt(agent) {
  const filename = AGENT_FILE_MAP[agent];
  if (!filename) return '';
  const filePath = path.join(process.cwd(), 'agents/prompts', filename);
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (e) {
    console.warn(`Failed to load agent prompt for ${agent}:`, e.message);
    return '';
  }
}

function buildSystemPrompt(agent) {
  const generic = [
    'You are the NeuroAI assistant inside a clinical decision-support imaging app.',
    'Do not diagnose, replace a radiologist, or issue treatment directives.',
    'Use cautious terms: supports, argues against, indeterminate, requires clinician confirmation.',
    'Separate loaded scan facts, local app knowledge, web counter-check evidence, uncertainty, and doctor-facing next steps.',
    'If asked to diagnose the image, explain that validated clinical diagnosis requires licensed clinician interpretation and that the app can only provide decision support.'
  ].join('\n');

  const agentSpecific = loadAgentPrompt(agent);
  if (!agentSpecific) return generic;
  return `${generic}\n\n${agentSpecific}`;
}

function excerpt(text, max = 700) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function wantsWebCheck(message) {
  return /(web|internet|pubmed|source|citation|evidence|guideline|counter.?check|latest|research|paper|study|diagnos|finding|impression|hydrocephalus|nph|ex vacuo|hemorrhage|stroke|shunt|callosal|desh)/i.test(message);
}

function computeConfidence({ agent, overlapScore, localMatches, webResult }) {
  const hasLocal = Array.isArray(localMatches) && localMatches.length > 0;
  const hasWeb = webResult && Array.isArray(webResult.sources) && webResult.sources.length > 0;
  const isSpecialist = agent !== 'neurology';
  const highOverlap = overlapScore >= 2;

  if (hasLocal && hasWeb && isSpecialist && highOverlap) return 'high';
  if (hasLocal || hasWeb || isSpecialist) return 'moderate';
  return 'low';
}

function buildFallbackAnswer({ message, scanContext, localMatches, webResult }) {
  const sections = [];

  sections.push('I can support clinician-review analysis, but I cannot provide a standalone medical diagnosis.');

  if (scanContext) {
    sections.push(`Loaded scan context:\n${scanContext}`);
  }

  if (localMatches.length > 0) {
    sections.push(`Local app knowledge used:\n${localMatches.map(match => `- ${match.path}: ${excerpt(match.text, 260)}`).join('\n')}`);
  } else {
    sections.push('Local app knowledge used: no strong local match found for this question.');
  }

  if (webResult?.sources?.length) {
    sections.push(`Web counter-check sources:\n${webResult.sources.map(source => `- ${source.title} (${source.journal || 'journal not listed'}, ${source.published || 'date not listed'}) ${source.url}`).join('\n')}`);
  } else if (webResult) {
    sections.push('Web counter-check sources: no PubMed results found for this query.');
  }

  sections.push(`Clinician-facing next step:\nUse the local findings, scan metadata, and cited evidence to write a cautious report section with supporting features, features against, uncertainty, and doctor-facing questions. Do not treat this as a diagnosis.`);

  return sections.join('\n\n');
}

function buildModelInput({ message, scanContext, reportFields, localMatches, webResult }) {
  return [
    `User question:\n${message}`,
    scanContext ? `Loaded scan context:\n${scanContext}` : 'Loaded scan context: none provided.',
    reportFields ? `Current report fields:\n${JSON.stringify(reportFields, null, 2)}` : 'Current report fields: none provided.',
    `Local app knowledge:\n${localMatches.map(match => `[${match.path}]\n${match.text}`).join('\n\n') || 'No local matches.'}`,
    `Web counter-check:\n${JSON.stringify(webResult || { sources: [] }, null, 2)}`
  ].join('\n\n---\n\n');
}

function resolveAIProvider() {
  if (process.env.KIMI_API_KEY) {
    return {
      apiKey: process.env.KIMI_API_KEY,
      baseUrl: process.env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1',
      model: process.env.KIMI_MODEL || process.env.AI_MODEL || 'moonshot-v1-32k',
      label: process.env.KIMI_MODEL || process.env.AI_MODEL || 'moonshot-v1-32k'
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: 'https://api.openai.com/v1',
      model: process.env.AI_MODEL || 'gpt-4.1-mini',
      label: process.env.AI_MODEL || 'gpt-4.1-mini'
    };
  }
  return null;
}

async function callAI({ message, scanContext, reportFields, localMatches, webResult, agent }) {
  const provider = resolveAIProvider();
  if (!provider) return null;

  const client = new OpenAI({
    apiKey: provider.apiKey,
    baseURL: provider.baseUrl
  });

  try {
    const completion = await client.chat.completions.create({
      model: provider.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: buildSystemPrompt(agent) },
        { role: 'user', content: buildModelInput({ message, scanContext, reportFields, localMatches, webResult }) }
      ]
    });
    return completion.choices?.[0]?.message?.content?.trim() || null;
  } catch (error) {
    throw new Error(`AI request failed (${provider.label}): ${error.message}`);
  }
}

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJsonBody(req);

    // Zod validation with backward compatibility
    let parsed;
    try {
      parsed = ChatRequestSchema.parse(body);
    } catch (zodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: zodError.errors || zodError.message
      });
    }

    // Normalize input shapes (upgrade pack uses messages[]; legacy uses message string)
    let messages = parsed.messages || [];
    const scanContext = parsed.context?.scanContext || parsed.scanContext || '';
    const reportFields = parsed.context?.reportFields || parsed.reportFields || null;

    if (!parsed.messages && parsed.message) {
      messages = [{ role: 'user', content: parsed.message }];
    }

    if (messages.length === 0) {
      res.status(400).json({ error: 'Missing message' });
      return;
    }

    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const message = lastUserMessage ? lastUserMessage.content : '';

    // Detect / resolve agent
    const selectedAgent = parsed.agent === 'auto' ? detectAgent(messages) : parsed.agent;

    // Knowledge base + web check
    const { agent: classifiedAgent, overlapScore } = classifyAgent(message);
    const localMatches = searchKnowledge(`${message}\n${scanContext}`, 8);
    const shouldWebCheck = parsed.counterCheck !== false && wantsWebCheck(message);
    const webResult = shouldWebCheck ? await webCounterCheck(message, 5) : null;

    let finalConfidence = computeConfidence({ agent: selectedAgent, overlapScore, localMatches, webResult });
    let finalRequiresHumanReview = finalConfidence === 'low';

    const provider = resolveAIProvider();
    let answer = null;
    try {
      answer = await callAI({ message, scanContext, reportFields, localMatches, webResult, agent: selectedAgent });
    } catch (error) {
      answer = `${buildFallbackAnswer({ message, scanContext, localMatches, webResult })}\n\nAI model note: ${error.message}`;
    }

    if (!answer) {
      answer = buildFallbackAnswer({ message, scanContext, localMatches, webResult });
    }

    let validation = null;
    const gotRealAnswer = answer && !answer.includes('AI model note:');
    if (gotRealAnswer && provider) {
      try {
        validation = await validateAnswer({
          answer,
          sources: {
            local: localMatches,
            web: webResult?.sources || []
          },
          query: message,
          scanContext,
          agent: selectedAgent,
          reportFields
        });
      } catch (validationError) {
        validation = {
          error: validationError.message,
          requiresHumanReview: true
        };
      }
    }

    if (validation && !validation.error) {
      const strictness = { high: 3, moderate: 2, low: 1 };
      if (strictness[validation.suggested_confidence] < strictness[finalConfidence]) {
        finalConfidence = validation.suggested_confidence;
      }
      finalRequiresHumanReview = finalRequiresHumanReview || validation.requiresHumanReview;
    }

    res.status(200).json({
      reply: answer,
      answer,
      confidence: finalConfidence,
      requiresHumanReview: finalRequiresHumanReview,
      agentUsed: selectedAgent,
      agent: selectedAgent,
      local_sources: localMatches.map(match => ({
        path: match.path,
        chunk_index: match.chunk_index,
        score: match.score
      })),
      web_sources: webResult?.sources || [],
      model_used: provider ? provider.label : 'local-fallback',
      validation
    });
  } catch (error) {
    res.status(500).json({
      error: 'chat_failed',
      message: error.message
    });
  }
};
