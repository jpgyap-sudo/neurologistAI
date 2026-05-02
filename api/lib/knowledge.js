const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const SOURCE_DIRS = [
  'agents',
  'clinical',
  'docs',
  'reports',
  'resources',
  'skills',
  'data'
];
const SOURCE_EXTENSIONS = new Set(['.md', '.json', '.yaml', '.yml', '.txt']);
const MAX_FILE_BYTES = 500_000;

function walkFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      out.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SOURCE_EXTENSIONS.has(ext)) out.push(fullPath);
    }
  }
  return out;
}

function chunkText(text, size = 1600, overlap = 200) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!normalized) return [];
  const chunks = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    chunks.push(normalized.slice(cursor, cursor + size));
    cursor += size - overlap;
  }
  return chunks;
}

function tokenize(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 3)
  );
}

let _cachedChunks = null;

function loadKnowledgeChunks() {
  if (_cachedChunks) return _cachedChunks;

  const files = SOURCE_DIRS.flatMap(dir => walkFiles(path.join(ROOT, dir)));
  const chunks = [];

  for (const filePath of files) {
    const stat = fs.statSync(filePath);
    if (stat.size > MAX_FILE_BYTES) continue;

    const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
    const text = fs.readFileSync(filePath, 'utf8');
    chunkText(text).forEach((chunk, index) => {
      chunks.push({
        id: `${relPath}#${index + 1}`,
        path: relPath,
        chunk_index: index + 1,
        text: chunk
      });
    });
  }

  _cachedChunks = chunks;
  return chunks;
}

function searchKnowledge(query, limit = 8) {
  const queryTokens = tokenize(query);
  const chunks = loadKnowledgeChunks();

  return chunks
    .map(chunk => {
      const chunkTokens = tokenize(`${chunk.path} ${chunk.text}`);
      let score = 0;
      for (const token of queryTokens) {
        if (chunkTokens.has(token)) score += 2;
        if (chunk.path.toLowerCase().includes(token)) score += 3;
      }
      return { ...chunk, score };
    })
    .filter(chunk => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function knowledgeStats() {
  const chunks = loadKnowledgeChunks();
  const fileSet = new Set(chunks.map(chunk => chunk.path));
  return {
    source_dirs: SOURCE_DIRS,
    file_count: fileSet.size,
    chunk_count: chunks.length,
    files: Array.from(fileSet).sort()
  };
}

module.exports = {
  loadKnowledgeChunks,
  searchKnowledge,
  knowledgeStats
};
