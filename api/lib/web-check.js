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

async function fetchXml(url) {
  const response = await fetch(url, {
    headers: { accept: 'application/xml' }
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

function extractTag(xml, tagName) {
  const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function extractAllTags(xml, tagName) {
  const regex = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'gi');
  const matches = [];
  let m;
  while ((m = regex.exec(xml)) !== null) {
    matches.push(m[1].trim());
  }
  return matches;
}

function parsePubMedArticle(articleXml) {
  const pmid = extractTag(articleXml, 'PMID') || '';

  // Title can be ArticleTitle or BookTitle
  const title = extractTag(articleXml, 'ArticleTitle') || extractTag(articleXml, 'BookTitle') || '';

  // Abstract – may contain multiple AbstractText nodes with Label attributes
  let abstract = null;
  const abstractBlock = extractTag(articleXml, 'Abstract');
  if (abstractBlock) {
    const texts = extractAllTags(abstractBlock, 'AbstractText');
    if (texts.length > 0) {
      abstract = texts.join(' ').replace(/\s+/g, ' ').trim();
    }
  }

  // Authors
  const authorListXml = extractTag(articleXml, 'AuthorList') || '';
  const authorMatches = authorListXml.match(/<Author(?:\s[^>]*)?>[\s\S]*?<\/Author>/gi) || [];
  const authors = authorMatches.map(authorXml => {
    const lastName = extractTag(authorXml, 'LastName');
    const foreName = extractTag(authorXml, 'ForeName') || extractTag(authorXml, 'Initials');
    if (lastName && foreName) return `${lastName} ${foreName}`;
    return lastName || foreName || null;
  }).filter(Boolean).slice(0, 6);

  // Journal / source
  const journalXml = extractTag(articleXml, 'Journal') || '';
  const journal = extractTag(journalXml, 'Title') || '';

  // PubDate
  let pubDate = '';
  const journalIssueXml = extractTag(journalXml, 'JournalIssue') || '';
  const pubDateXml = extractTag(journalIssueXml, 'PubDate') || extractTag(articleXml, 'PubDate');
  if (pubDateXml) {
    const medlineDate = extractTag(pubDateXml, 'MedlineDate');
    if (medlineDate) {
      pubDate = medlineDate;
    } else {
      const year = extractTag(pubDateXml, 'Year') || '';
      const month = extractTag(pubDateXml, 'Month') || '';
      const day = extractTag(pubDateXml, 'Day') || '';
      pubDate = [year, month, day].filter(Boolean).join('-');
    }
  }

  return {
    pmid,
    title: compactText(title),
    abstract: abstract ? compactText(abstract) : null,
    authors,
    source: compactText(journal),
    pubDate: compactText(pubDate)
  };
}

async function searchPubMed(query, limit = 5) {
  const encodedQuery = encodeURIComponent(query);
  const searchUrl = `${PUBMED_BASE}/esearch.fcgi?db=pubmed&retmode=json&retmax=${limit}&sort=relevance&term=${encodedQuery}`;
  const searchData = await fetchJson(searchUrl);
  const ids = searchData?.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  const efetchUrl = `${PUBMED_BASE}/efetch.fcgi?db=pubmed&id=${ids.join(',')}&retmode=xml`;
  const xml = await fetchXml(efetchUrl);

  const articleMatches = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/gi) || [];
  const parsedArticles = articleMatches.map(parsePubMedArticle).filter(a => a.title);

  const byPmid = new Map(parsedArticles.map(a => [a.pmid, a]));

  return ids.map(id => {
    const article = byPmid.get(String(id));
    if (!article) return null;
    return {
      source: 'PubMed',
      pmid: article.pmid,
      id: article.pmid,                 // backward compatibility
      title: article.title,
      abstract: article.abstract,
      authors: article.authors,
      journal: article.source,          // backward compatibility
      sourceName: article.source,       // explicit name
      pubDate: article.pubDate,
      published: article.pubDate,       // backward compatibility
      url: `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`
    };
  }).filter(Boolean);
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
