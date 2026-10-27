#!/usr/bin/env node
// Serwer plików z katalogu repo (podgląd filmu, odtwarzacz, eksport). Zapis tylko dwóch plików filmu:
// POST /api/zapisz?film=filmy/<nazwa>&plik=uwagi.json|znaczniki.json (treść = JSON).
//
//   node silnik/serwer.mjs [--port 4471]   → http://127.0.0.1:4471/silnik/?film=szablon · /odtwarzacz/?film=…
// GET /api/wersja?film=… → { wersja } (git describe) · GET /api/pliki?film=… → MP4 z <film>/wynik/
// GET /api/dzwiek?film=… → miks dźwięku dla odtwarzacza (eksport --tylko-dzwiek, gdy plik starszy od treści filmu)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
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
    if (url.pathname === '/api/wersja') {
      // wersja filmu z gita (tag <nazwa>/vN + commit) — odtwarzacz zapisuje ją przy uwagach
      const name = path.basename(url.searchParams.get('film') ?? '');
      let v = '—';
      try { v = execFileSync('git', ['-C', ROOT, 'describe', '--tags', '--match', `${name}/*`, '--dirty', '--always'], { encoding: 'utf8' }).trim(); } catch {}
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ wersja: v }));
      return;
    }
    if (url.pathname === '/api/pliki' || url.pathname === '/api/dzwiek') {
      const film = url.searchParams.get('film') ?? '', dir = inRoot(`/${film}`);
      if (!dir || !fs.existsSync(path.join(dir, 'film.js'))) { res.writeHead(400).end('zły film'); return; }
      const out = path.join(dir, 'wynik');
      if (url.pathname === '/api/pliki') {
        const mp4 = fs.existsSync(out) ? fs.readdirSync(out).filter((f) => f.endsWith('.mp4')).sort((a, b) => fs.statSync(path.join(out, b)).mtimeMs - fs.statSync(path.join(out, a)).mtimeMs) : [];
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(mp4.map((f) => `/${film}/wynik/${f}`)));
        return;
      }
      const wav = path.join(out, `${path.basename(dir)}-dzwiek.wav`);
      const src = ['film.js', 'teksty.js', 'lektor.js', 'znaczniki.json'].map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f));
      const fresh = fs.existsSync(wav) && src.every((f) => fs.statSync(f).mtimeMs <= fs.statSync(wav).mtimeMs);
      const reply = () => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ url: `/${film}/wynik/${path.basename(wav)}?${fs.statSync(wav).mtimeMs}` }));
      if (fresh) { reply(); return; }
      execFile(process.execPath, [path.join(ROOT, 'silnik', 'eksport.mjs'), dir, '--tylko-dzwiek'], (e, _o, stderr) => (e ? res.writeHead(500).end(stderr || String(e)) : reply()));
      return;
    }
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
