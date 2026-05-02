const fs = require('fs');
const https = require('https');

// Read .env.local
let env = {};
try {
  const c = fs.readFileSync('.env.local', 'utf8');
  c.split(/\r?\n/).forEach(l => {
    const idx = l.indexOf('=');
    if (idx > 0) env[l.slice(0, idx)] = l.slice(idx + 1).trim();
  });
} catch (e) {
  // ignore
}

const key = env.KIMI_API_KEY || '';
const base = env.KIMI_BASE_URL || 'https://api.moonshot.cn/v1';

if (!key) {
  console.log('Key found: NO');
  console.log('Conclusion: MISSING KEY');
  process.exit(1);
}

const masked = key.slice(-4).padStart(key.length, '*');
console.log('Key found: ' + masked);
console.log('Base URL: ' + base);

const u = new URL(base + '/models');
const opts = {
  hostname: u.hostname,
  path: u.pathname,
  port: 443,
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  }
};

const req = https.request(opts, res => {
  let d = '';
  res.on('data', chunk => d += chunk);
  res.on('end', () => {
    console.log('Status: ' + res.statusCode);
    console.log('Body: ' + d.slice(0, 1000));
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('Conclusion: WORKING');
    } else if (res.statusCode === 401) {
      console.log('Conclusion: INVALID KEY');
    } else {
      console.log('Conclusion: API ERROR');
    }
  });
});

req.on('error', e => {
  console.log('Error: ' + e.message);
  console.log('Conclusion: NETWORK ERROR');
});

req.end();
