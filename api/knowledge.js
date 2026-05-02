const { knowledgeStats, searchKnowledge } = require('./lib/knowledge');
const { handleOptions, setCors } = require('./lib/request');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  setCors(res);
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const query = String(req.query.q || '').trim();
  if (query) {
    res.status(200).json({
      query,
      matches: searchKnowledge(query, Number(req.query.limit || 8))
    });
    return;
  }

  res.status(200).json(knowledgeStats());
};
