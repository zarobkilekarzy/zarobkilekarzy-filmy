#!/usr/bin/env node
// Serwer plików (podgląd filmu, odtwarzacz, eksport). Adres /x szuka pliku najpierw w katalogu projektu z filmami
// (PROJEKT), potem w generatorze (ROOT: silnik/, odtwarzacz/, szablon/, node_modules/). Zapis tylko dwóch plików filmu:
// POST /api/zapisz?film=filmy/<nazwa>&plik=uwagi.json|znaczniki.json (treść = JSON).
//
//   node silnik/serwer.mjs [--port 4471]   → http://127.0.0.1:4471/odtwarzacz/?film=szablon (podgląd, oś czasu, uwagi)
// GET /api/wersja?film=… → { wersja } (git describe) · GET /api/pliki?film=… → MP4 z <film>/wynik/
// GET /api/dzwiek?film=…[&v=1] → miks dźwięku dla odtwarzacza, pion osobno (eksport --tylko-dzwiek, gdy plik starszy od treści filmu)
// GET /api/napisy?film=… → { pl, en, cs } adresy VTT (silnik/napisy.mjs, gdy brak plików albo są starsze od tekstów)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Katalog projektu z filmami: FILMY_PROJEKT, inaczej repo, w którym generator jest submodułem, inaczej sam generator
export const PROJEKT = (() => {
  if (process.env.FILMY_PROJEKT) return path.resolve(process.env.FILMY_PROJEKT);
  try {
    const sup = execFileSync('git', ['-C', ROOT, 'rev-parse', '--show-superproject-working-tree'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (sup) return sup;
  } catch {}
  return ROOT;
})();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.mp4': 'video/mp4', '.png': 'image/png', '.svg': 'image/svg+xml', '.vtt': 'text/vtt; charset=utf-8',
};
const WRITABLE = new Set(['uwagi.json', 'znaczniki.json']);

const isFilm = (dir) => fs.existsSync(path.join(dir, 'film.js')) || fs.existsSync(path.join(dir, 'proto', 'film.js'));
/** Ścieżka z adresu (/filmy/x/lektor/a.wav) → plik w projekcie albo w generatorze; null, gdy nie ma, wychodzi poza nie
    albo prowadzi przez plik lub katalog ukryty (.env z kluczem lektora, .git) */
export function plik(p) {
  for (const base of new Set([PROJEKT, ROOT])) {
    const f = path.resolve(base, `.${p}`), rel = path.relative(base, f);
    if (rel.startsWith('..') || path.isAbsolute(rel) || rel.split(path.sep).some((s) => s.startsWith('.'))) continue;
    if (fs.existsSync(f)) return f;
  }
  return null;
}

// Zapis tylko z odtwarzacza tego serwera: Host = adres lokalny (obrona przed DNS rebinding), a Origin, jeśli jest, ten sam.
// Przeglądarka dołącza Origin do każdego POST-a, więc obca strona nie przejdzie; skrypty bez Origin (curl, node) tak.
function sameOrigin(req) {
  const host = req.headers.host ?? '';
  if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host)) return false;
  return req.headers.origin == null || req.headers.origin === `http://${host}`;
}

async function save(req, res, url) {
  const film = url.searchParams.get('film') ?? '', nazwa = url.searchParams.get('plik') ?? '';
  const dir = plik(`/${film}`);
  if (!WRITABLE.has(nazwa) || !dir || !isFilm(dir)) { res.writeHead(400).end('zły film albo plik'); return; }
  let body = '';
  for await (const chunk of req) body += chunk;
  const data = JSON.parse(body);                                   // błąd składni → 500, plik zostaje bez zmian
  fs.writeFileSync(path.join(dir, nazwa), `${JSON.stringify(data, null, 2)}\n`);
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
    if (req.method === 'POST' && url.pathname === '/api/zapisz') {
      if (!sameOrigin(req)) { res.writeHead(403).end('zapis tylko z odtwarzacza na tym serwerze'); return; }
      save(req, res, url).catch((e) => res.writeHead(500).end(String(e)));
      return;
    }
    if (url.pathname === '/api/wersja') {
      // wersja filmu z gita (tag <nazwa>/vN + commit) — odtwarzacz zapisuje ją przy uwagach
      const dir = plik(`/${url.searchParams.get('film') ?? ''}`), name = path.basename(dir ?? '');
      let v = '—';
      try { v = execFileSync('git', ['-C', dir, 'describe', '--tags', '--match', `${name}/*`, '--dirty', '--always'], { encoding: 'utf8' }).trim(); } catch {}
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ wersja: v }));
      return;
    }
    if (url.pathname === '/api/napisy') {
      const film = url.searchParams.get('film') ?? '', dir = plik(`/${film}`);
      if (!dir || !isFilm(dir)) { res.writeHead(400).end('zły film'); return; }
      const name = path.basename(dir), subs = path.join(dir, 'wynik', 'napisy');
      const vtt = (l) => path.join(subs, `${name}.${l}.vtt`);
      const src = ['film.js', 'teksty.js', 'lektor.js', 'proto/film.js', 'proto/lektor.js', 'napisy/en.json', 'napisy/cs.json']
        .map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f));
      const newest = Math.max(...src.map((f) => fs.statSync(f).mtimeMs));
      const reply = () => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(Object.fromEntries(['pl', 'en', 'cs']
        .map((l) => [l, fs.existsSync(vtt(l)) ? `/${film}/wynik/napisy/${name}.${l}.vtt?${fs.statSync(vtt(l)).mtimeMs}` : null]))));
      if (fs.existsSync(vtt('pl')) && fs.statSync(vtt('pl')).mtimeMs >= newest) { reply(); return; }
      // kod wyjścia 1 = brak części tłumaczeń; języki, które się udały, i tak są zapisane
      execFile(process.execPath, [path.join(ROOT, 'silnik', 'napisy.mjs'), dir], () => reply());
      return;
    }
    if (url.pathname === '/api/pliki' || url.pathname === '/api/dzwiek') {
      const film = url.searchParams.get('film') ?? '', dir = plik(`/${film}`);
      if (!dir || !isFilm(dir)) { res.writeHead(400).end('zły film'); return; }
      const out = path.join(dir, 'wynik');
      if (url.pathname === '/api/pliki') {
        const mp4 = fs.existsSync(out) ? fs.readdirSync(out).filter((f) => f.endsWith('.mp4')).sort((a, b) => fs.statSync(path.join(out, b)).mtimeMs - fs.statSync(path.join(out, a)).mtimeMs) : [];
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(mp4.map((f) => `/${film}/wynik/${f}`)));
        return;
      }
      // pion ma własny dźwięk: krótsza wersja (ujęcia `pion: false` wypadają) ma inne czasy
      const vert = url.searchParams.get('v') === '1', wav = path.join(out, `${path.basename(dir)}${vert ? '-pion' : ''}-dzwiek.wav`);
      const src = ['film.js', 'teksty.js', 'lektor.js', 'znaczniki.json', 'proto/film.js'].map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f));
      const fresh = fs.existsSync(wav) && src.every((f) => fs.statSync(f).mtimeMs <= fs.statSync(wav).mtimeMs);
      const reply = () => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ url: `/${film}/wynik/${path.basename(wav)}?${fs.statSync(wav).mtimeMs}` }));
      if (fresh) { reply(); return; }
      if (!fs.existsSync(path.join(dir, 'film.js'))) {
        // archiwum: własny kod bez --tylko-dzwiek — dźwięk z najnowszego pliku 16:9 w wynik/
        const mp4 = fs.existsSync(out) && fs.readdirSync(out).filter((f) => f.endsWith('.mp4') && !/pion|9x16/.test(f))
          .sort((a, b) => fs.statSync(path.join(out, b)).mtimeMs - fs.statSync(path.join(out, a)).mtimeMs)[0];
        if (!mp4) { res.writeHead(404).end(`film z archiwum: włóż gotowy plik 16:9 do ${film}/wynik/ albo wyeksportuj go (node ${film}/eksport.mjs)`); return; }
        execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(out, mp4), '-vn', '-ac', '2', '-ar', '48000', wav], (e, _o, stderr) => (e ? res.writeHead(500).end(stderr || String(e)) : reply()));
        return;
      }
      execFile(process.execPath, [path.join(ROOT, 'silnik', 'eksport.mjs'), dir, '--tylko-dzwiek', ...(vert ? ['--vert'] : [])], (e, _o, stderr) => (e ? res.writeHead(500).end(stderr || String(e)) : reply()));
      return;
    }
    // jedno narzędzie: adres główny prowadzi do odtwarzacza (podgląd na żywo, oś czasu, uwagi)
    if (url.pathname === '/') { res.writeHead(302, { location: '/odtwarzacz/?film=szablon' }).end(); return; }
    const p = plik(decodeURIComponent(url.pathname));
    const file = p && (url.pathname.endsWith('/') ? path.join(p, 'index.html') : p);
    if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    send(req, res, file);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf('--port'), port = i > 0 ? +process.argv[i + 1] : 4471;
  createServer().listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/odtwarzacz/?film=szablon\nfilmy z: ${PROJEKT}`));
}
