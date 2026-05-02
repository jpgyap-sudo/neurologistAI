const PUBMED_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' }
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function searchPubMed(query, limit = 5) {
  const encodedQuery = encodeURIComponent(query);
  const searchUrl = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax=${limit}&sort=relevance&term=${encodedQuery}`;
  const searchData = await fetchJson(searchUrl);
  const ids = searchData?.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  const summaryUrl = `${PUBMED_BASE}/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`;
  const summaryData = await fetchJson(summaryUrl);

  return ids.map(id => {
    const item = summaryData?.result?.[id] || {};
    const authors = Array.isArray(item.authors)
      ? item.authors.slice(0, 4).map(author => author.name).filter(Boolean)
      : [];

    return {
      source: 'PubMed',
      id,
      title: compactText(item.title),
      authors,
      published: compactText(item.pubdate),
      journal: compactText(item.fulljournalname || item.source),
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`
    };
  }).filter(item => item.title);
}

async function webCounterCheck(query, limit = 5) {
  const pubmed = await searchPubMed(query, limit);
  return {
    query,
    searched_at: new Date().toISOString(),
    sources: pubmed
  };
}

module.exports = {
  webCounterCheck
};
