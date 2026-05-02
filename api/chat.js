const { searchKnowledge } = require('./lib/knowledge');
const { webCounterCheck } = require('./lib/web-check');
const { handleOptions, readJsonBody, setCors } = require('./lib/request');

function excerpt(text, max = 700) {
  const compact = String(text || '').replace(/\s+/g, ' ').trim();
  return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function wantsWebCheck(message) {
  return /(web|internet|pubmed|source|citation|evidence|guideline|counter.?check|latest|research|paper|study|diagnos|finding|impression|hydrocephalus|nph|ex vacuo|hemorrhage|stroke|shunt|callosal|desh)/i.test(message);
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

async function callOpenAI({ message, scanContext, reportFields, localMatches, webResult }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: [
        'You are the NeuroAI assistant inside a clinical decision-support imaging app.',
        'Do not diagnose, replace a radiologist, or issue treatment directives.',
        'Use cautious terms: supports, argues against, indeterminate, requires clinician confirmation.',
        'Separate loaded scan facts, local app knowledge, web counter-check evidence, uncertainty, and doctor-facing next steps.',
        'If asked to diagnose the image, explain that validated clinical diagnosis requires licensed clinician interpretation and that the app can only provide decision support.'
      ].join('\n'),
      input: buildModelInput({ message, scanContext, reportFields, localMatches, webResult })
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  if (data.output_text) return data.output_text;

  const textParts = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) textParts.push(content.text);
    }
  }
  return textParts.join('\n').trim() || null;
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
    const message = String(body?.message || '').trim();
    if (!message) {
      res.status(400).json({ error: 'Missing message' });
      return;
    }

    const scanContext = String(body?.scanContext || '').trim();
    const reportFields = body?.reportFields || null;
    const localMatches = searchKnowledge(`${message}\n${scanContext}`, 8);
    const shouldWebCheck = body?.counterCheck !== false && wantsWebCheck(message);
    const webResult = shouldWebCheck ? await webCounterCheck(message, 5) : null;

    let answer = null;
    try {
      answer = await callOpenAI({ message, scanContext, reportFields, localMatches, webResult });
    } catch (error) {
      answer = `${buildFallbackAnswer({ message, scanContext, localMatches, webResult })}\n\nAI model note: ${error.message}`;
    }

    if (!answer) {
      answer = buildFallbackAnswer({ message, scanContext, localMatches, webResult });
    }

    res.status(200).json({
      answer,
      local_sources: localMatches.map(match => ({
        path: match.path,
        chunk_index: match.chunk_index,
        score: match.score
      })),
      web_sources: webResult?.sources || [],
      model_used: process.env.OPENAI_API_KEY ? (process.env.OPENAI_MODEL || 'gpt-4.1-mini') : 'local-fallback'
    });
  } catch (error) {
    res.status(500).json({
      error: 'chat_failed',
      message: error.message
    });
  }
};
