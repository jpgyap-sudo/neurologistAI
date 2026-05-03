const fs = require('fs');
const path = require('path');

// 1. Prompt file existence check
const promptsDir = path.join(process.cwd(), 'agents/prompts');
const requiredPrompts = [
  'radiology_agent.md',
  'neurology_agent.md',
  'medication_review_agent.md',
  'rehab_agent.md',
  'research_librarian_agent.md',
  'mri_brain_agent.md'
];
console.log('=== Agent Prompt Files ===');
for (const f of requiredPrompts) {
  const exists = fs.existsSync(path.join(promptsDir, f));
  console.log(`${f}: ${exists ? 'EXISTS' : 'MISSING'}`);
}

// 2. Knowledge stats
const { knowledgeStats } = require('../api/lib/knowledge.js');
const stats = knowledgeStats();
console.log('\n=== Knowledge Stats ===');
console.log('Total files discovered:', stats.file_count);
console.log('Total chunks:', stats.chunk_count);
const strokeFiles = stats.files.filter(f => f.startsWith('clinical/stroke_recovery/'));
const hydroFiles = stats.files.filter(f => f.startsWith('clinical/hydrocephalus/'));
console.log('Stroke recovery files:', strokeFiles.length, '(expected ~12)');
console.log('Hydrocephalus files:', hydroFiles.length, '(expected ~8)');
console.log('Sample stroke files:', strokeFiles.slice(0, 3));
console.log('Sample hydro files:', hydroFiles.slice(0, 3));

// 3. Check classifyAgent/computeConfidence exportability from api/chat.js
const chatMod = require('../api/chat.js');
console.log('\n=== api/chat.js exports ===');
console.log('typeof default export:', typeof chatMod);
console.log('keys:', Object.keys(chatMod));

// 4. Inline classifyAgent test (copy logic for smoke test)
const AGENT_KEYWORDS = {
  radiology: ['scan', 'ct', 'mri', 'ventricle', 'hydrocephalus', 'desh', 'imaging', 'report', 'x-ray', 'ultrasound', 'pet', 'angiography', 'radiograph', 'tomography', 'contrast', 'effacement', 'sulci', 'fissure', 'evans index', 'callosal angle', 'temporal horn', 'edema', 'flair', 't1', 't2', 'dwu', 'dwi', 'slice', 'dicom', 'attenuation', 'hyperdense', 'hypodense', 'mass effect', 'midline shift'],
  neurology: ['neuro', 'consciousness', 'mcs', 'crs-r', 'seizure', 'stroke', 'icp', 'gcs', 'coma', 'vegetative', 'minimally conscious', 'alertness', 'arousal', 'cognition', 'dementia', 'parkinson', 'als', 'myasthenia', 'meningitis', 'encephalitis', 'subarachnoid', 'subdural', 'epidural', 'hematoma', 'aneurysm', 'vasospasm', 'cerebral perfusion', 'herniation', 'brain death', 'neuro exam', 'pupil', 'reflex', 'tone', 'clonus', 'babinski', 'nystagmus', 'aphasia', 'apraxia', 'ataxia', 'neuropathy', 'myelopathy', 'synkinesis'],
  nph_ex_vacuo: ['nph vs ex vacuo', 'ex vacuo', 'shunt responsive', 'csf drainage response', 'tap test', 'hydrocephalus ex vacuo differentiation', 'normal pressure hydrocephalus vs atrophy'],
  medication: ['drug', 'med', 'amantadine', 'baclofen', 'interaction', 'prescription', 'pharmacy', 'pharmacology', 'dose', 'dosage', 'taper', 'withdrawal', 'side effect', 'adverse', 'contraindication', 'sedative', 'hypnotic', 'antipsychotic', 'anticholinergic', 'antiepileptic', 'antihypertensive', 'neurostimulant', 'methylphenidate', 'modafinil', 'tizanidine', 'antibiotic', 'vancomycin', 'phenytoin', 'levetiracetam', 'mannitol', 'hypertonic', 'aspirin', 'clopidogrel', 'warfarin', 'heparin', ' doac ', 'anticoagulant', 'thrombolytic', 'rtpa', 'alteplase'],
  rehab: ['therapy', 'rehab', 'pt', 'ot', 'speech', 'swallow', 'mobility', 'physical therapy', 'occupational therapy', 'physiotherapy', 'speech therapy', 'slt', 'splint', 'brace', 'walker', 'wheelchair', 'gait', 'balance', 'transfer', 'bowel', 'bladder', 'spasticity', 'contracture', 'pressure sore', 'bedsore', 'decubitus', 'learned non-use', 'constraint induced', 'cims', 'bobath', 'ndt', 'functional electrical stimulation', 'fes', 'botulinum', 'botox', 'tone', 'rom', 'prom', 'arom', 'mrc', 'fac', 'fm ', 'fugl-meyer', 'barthel', 'mrs', 'rankin'],
  research: ['study', 'evidence', 'paper', 'pubmed', 'trial', 'guideline', 'systematic review', 'meta-analysis', 'cohort', 'case series', 'case report', 'randomized', 'rct', 'clinical trial', 'phase ', 'protocol', 'inclusion', 'exclusion', 'endpoint', 'outcome', 'biomarker', 'efficacy', 'effectiveness', 'recommendation', 'consensus', 'society', 'aans', 'cns', 'aan', 'nice', 'sign', 'asa', 'esh', 'ich e9', 'ich e6', 'gcp', 'prisma', 'cochrane', 'medline', 'scopus', 'embase', 'cinahl', 'literature', 'bibliography', 'citation', 'reference'],
  mri_brain: ['mri brain', 'brain mri', 'mr brain', 'brain mr', 'mri specialist', 'mri neuroradiology', 'mri brain evans', 'mri desh', 'mri callosal', 'mri ventriculomegaly', 'mri nph', 'mri hydrocephalus', 'mri sequence', 'mri quality', 'mri artifact', 'mri flair', 'mri t1', 'mri t2', 'mri transependymal']
};

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordMatches(text, keyword) {
  const compact = String(keyword).trim().toLowerCase();
  if (!compact) return false;
  const escaped = escapeRegex(compact).replace(/\s+/g, '\\s+');
  if (/^[a-z0-9]+(?:\s+[a-z0-9]+)*$/.test(compact)) {
    return new RegExp(`\\b${escaped}\\b`, 'i').test(text);
  }
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
}

function classifyAgent(message) {
  const lower = String(message || '').toLowerCase();
  let bestAgent = 'neurology';
  let bestScore = 0;
  for (const [agent, keywords] of Object.entries(AGENT_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (keywordMatches(lower, kw)) score += 1;
    }
    if (agent === 'mri_brain' && /\b(?:mri|mr)\b/i.test(lower) && /\b(?:brain|ventric|hydrocephalus|nph|desh|evans|callosal|flair|t1|t2)\b/i.test(lower)) {
      score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestAgent = agent;
    }
  }
  return { agent: bestAgent, overlapScore: bestScore };
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

console.log('\n=== classifyAgent Smoke Tests ===');
console.log(JSON.stringify(classifyAgent('What does the CT scan show for hydrocephalus?')));
console.log(JSON.stringify(classifyAgent('Recommended medication for stroke recovery?')));
console.log(JSON.stringify(classifyAgent('Physical therapy for spasticity?')));
console.log(JSON.stringify(classifyAgent('Latest PubMed research on NPH?')));
const mriBrainClassification = classifyAgent('mri brain evans index and desh pattern');
console.log(JSON.stringify(mriBrainClassification));
console.assert(mriBrainClassification.agent === 'mri_brain', 'MRI brain query should route to mri_brain');

console.log('\n=== computeConfidence Smoke Tests ===');
console.log(computeConfidence({agent:'radiology', overlapScore:2, localMatches:[{}], webResult:{sources:[{}]}}));
console.log(computeConfidence({agent:'neurology', overlapScore:0, localMatches:[], webResult:null}));
console.log(computeConfidence({agent:'rehab', overlapScore:1, localMatches:[{}], webResult:null}));

// 5. Validation layer smoke tests
const { validateAnswer, resolveValidationModel, parseValidatorJson } = require('../api/lib/validate.js');

console.log('\n=== resolveValidationModel ===');
console.assert(resolveValidationModel('gpt-4.1') === 'gpt-4.1-mini', 'gpt-4.1 -> gpt-4.1-mini');
console.assert(resolveValidationModel('gpt-4.1-mini') === 'gpt-4.1-mini', 'gpt-4.1-mini stays');
console.assert(resolveValidationModel('moonshot-v1-32k') === 'moonshot-v1-8k', 'moonshot-v1-32k -> moonshot-v1-8k');
console.assert(resolveValidationModel('moonshot-v1-8k') === 'moonshot-v1-8k', 'moonshot-v1-8k stays');
console.assert(resolveValidationModel('unknown-model') === 'unknown-model', 'unknown stays');
process.env.VALIDATION_MODEL = 'custom-model';
console.assert(resolveValidationModel('gpt-4.1') === 'custom-model', 'env override works');
delete process.env.VALIDATION_MODEL;

console.log('\n=== parseValidatorJson ===');
const fenced = '```json\n{"contradictions":[],"unsupported_claims":[],"supported_claims":[],"suggested_confidence":"high","requiresHumanReview":false,"validation_summary":"All good."}\n```';
const parsedGood = parseValidatorJson(fenced);
console.assert(parsedGood.suggested_confidence === 'high', 'fenced JSON parsed');
console.assert(parsedGood.requiresHumanReview === false, 'requiresHumanReview false');

const parsedBad = parseValidatorJson('not json');
console.assert(typeof parsedBad.error === 'string', 'bad JSON returns error string');
console.assert(parsedBad.requiresHumanReview === true, 'bad JSON requiresHumanReview true');

async function runValidationSmokeTests() {
  const originalFetch = global.fetch;
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  const originalAiModel = process.env.AI_MODEL;

  process.env.OPENAI_API_KEY = 'fake-key';
  process.env.AI_MODEL = 'gpt-4.1';

  // Success path
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify({
        contradictions: [],
        unsupported_claims: [],
        supported_claims: ['Rest helps recovery.'],
        suggested_confidence: 'moderate',
        requiresHumanReview: false,
        validation_summary: 'Mostly supported.'
      }) } }]
    })
  });

  const successResult = await validateAnswer({
    answer: 'The patient should rest.',
    sources: { local: [{ path: 'clinical/rest.md', text: 'Rest is beneficial.', score: 3 }], web: [] },
    query: 'Should the patient rest?',
    scanContext: '',
    agent: 'neurology',
    reportFields: null
  });

  console.log('\n=== validateAnswer (mocked success) ===');
  console.assert(successResult && typeof successResult === 'object', 'result is object');
  console.assert(Array.isArray(successResult.contradictions), 'contradictions is array');
  console.assert(Array.isArray(successResult.supported_claims), 'supported_claims is array');
  console.assert(['high','moderate','low'].includes(successResult.suggested_confidence), 'suggested_confidence valid');
  console.assert(typeof successResult.requiresHumanReview === 'boolean', 'requiresHumanReview is boolean');
  console.assert(typeof successResult.model_used === 'string', 'model_used is string');

  // Error path
  global.fetch = async () => { throw new Error('Network failure'); };

  const errorResult = await validateAnswer({
    answer: 'Test',
    sources: { local: [], web: [] },
    query: 'Q',
    scanContext: '',
    agent: 'neurology',
    reportFields: null
  });

  console.log('\n=== validateAnswer (mocked error) ===');
  console.assert(typeof errorResult.error === 'string', 'error result has error string');
  console.assert(errorResult.requiresHumanReview === true, 'error result requires human review');

  // Timeout path (abort)
  global.fetch = async (_url, { signal }) => {
    return new Promise((_resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout')), 20000);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timer);
          const err = new Error('Aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
    });
  };

  const timeoutResult = await validateAnswer({
    answer: 'Test',
    sources: { local: [], web: [] },
    query: 'Q',
    scanContext: '',
    agent: 'neurology',
    reportFields: null
  });

  console.log('\n=== validateAnswer (mocked timeout) ===');
  console.assert(typeof timeoutResult.error === 'string', 'timeout result has error string');
  console.assert(timeoutResult.requiresHumanReview === true, 'timeout result requires human review');

  global.fetch = originalFetch;
  if (originalOpenAiKey === undefined) {
    delete process.env.OPENAI_API_KEY;
  } else {
    process.env.OPENAI_API_KEY = originalOpenAiKey;
  }
  if (originalAiModel === undefined) {
    delete process.env.AI_MODEL;
  } else {
    process.env.AI_MODEL = originalAiModel;
  }

  console.log('\n=== DONE ===');
}

runValidationSmokeTests().catch(err => {
  console.error('Validation smoke tests failed:', err);
  process.exit(1);
});
