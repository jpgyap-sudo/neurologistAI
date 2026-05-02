const { webCounterCheck } = require('./lib/web-check');
const { handleOptions, readJsonBody, setCors } = require('./lib/request');

module.exports = async function handler(req, res) {
  if (handleOptions(req, res)) return;
  setCors(res);

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const body = await readJsonBody(req);
    const query = String(body?.query || '').trim();
    if (!query) {
      res.status(400).json({ error: 'Missing query' });
      return;
    }

    const result = await webCounterCheck(query, Number(body?.limit || 5));
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      error: 'web_check_failed',
      message: error.message
    });
  }
};
