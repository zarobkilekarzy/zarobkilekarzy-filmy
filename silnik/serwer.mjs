#!/usr/bin/env node
// Serwer plików z katalogu repo (podgląd filmu, odtwarzacz, eksport). Zapis tylko dwóch plików filmu:
// POST /api/zapisz?film=filmy/<nazwa>&plik=uwagi.json|znaczniki.json (treść = JSON).
//
//   node silnik/serwer.mjs [--port 4471]   → http://127.0.0.1:4471/silnik/?film=szablon · /odtwarzacz/?film=…
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.png': 'image/png', '.svg': 'image/svg+xml', '.vtt': 'text/vtt; charset=utf-8',
};
const WRITABLE = new Set(['uwagi.json', 'znaczniki.json']);

function inRoot(p) { const f = path.resolve(ROOT, `.${p}`); return f === ROOT || f.startsWith(ROOT + path.sep) ? f : null; }

async function save(req, res, url) {
  const film = url.searchParams.get('film') ?? '', plik = url.searchParams.get('plik') ?? '';
  const dir = inRoot(`/${film}`);
  if (!WRITABLE.has(plik) || !dir || !fs.existsSync(path.join(dir, 'film.js'))) { res.writeHead(400).end('zły film albo plik'); return; }
  let body = '';
  for await (const chunk of req) body += chunk;
  const data = JSON.parse(body);                                   // błąd składni → 500, plik zostaje bez zmian
  fs.writeFileSync(path.join(dir, plik), `${JSON.stringify(data, null, 2)}\n`);
  res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
}

// Pliki wideo z obsługą Range (przewijanie <video> w odtwarzaczu)
function send(req, res, file) {
  const size = fs.statSync(file).size, type = MIME[path.extname(file)] ?? 'application/octet-stream';
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? '');
  if (!m) { res.writeHead(200, { 'content-type': type, 'content-length': size, 'accept-ranges': 'bytes', 'cache-control': 'no-store' }); fs.createReadStream(file).pipe(res); return; }
  const a = m[1] ? +m[1] : 0, b = m[2] ? Math.min(+m[2], size - 1) : size - 1;
  res.writeHead(206, { 'content-type': type, 'content-length': b - a + 1, 'content-range': `bytes ${a}-${b}/${size}`, 'accept-ranges': 'bytes' });
  fs.createReadStream(file, { start: a, end: b }).pipe(res);
}

export function createServer() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'POST' && url.pathname === '/api/zapisz') { save(req, res, url).catch((e) => res.writeHead(500).end(String(e))); return; }
    const p = inRoot(decodeURIComponent(url.pathname));
    const file = p && (url.pathname.endsWith('/') ? path.join(p, 'index.html') : p);
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    send(req, res, file);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--port'), port = i > 0 ? +process.argv[i + 1] : 4471;
  createServer().listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/silnik/?film=szablon  ·  /odtwarzacz/?film=szablon`));
}
