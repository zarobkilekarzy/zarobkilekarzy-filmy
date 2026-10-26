// Chromium bez okna przez DevTools Protocol (tylko moduły wbudowane Node: fetch, WebSocket).
// Wspólne dla eksportu, napisów i kontroli: otwiera stronę filmu i czeka, aż silnik powie FILM_READY.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer, ROOT } from './serwer.mjs';

export { ROOT };
export const CHROME = process.env.CHROME ?? '/Applications/Chromium.app/Contents/MacOS/Chromium';

let server = null, serverPort = 0;
async function ensureServer() {
  if (server) return serverPort;
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  serverPort = server.address().port;
  return serverPort;
}

/** Katalog filmu względem repo (np. `filmy/doba`, `szablon`) z argumentu wiersza poleceń. Filmy z archiwum
    (własny kod w proto/) też się otwierają — napisy i kontrola działają, jeśli strona wystawia FILM.voice. */
export function filmDir(arg) {
  if (!arg) throw new Error('podaj katalog filmu, np. filmy/<nazwa> albo szablon');
  const abs = path.resolve(arg);
  const rel = path.relative(ROOT, abs).split(path.sep).join('/');
  const archive = !fs.existsSync(path.join(abs, 'film.js')) && fs.existsSync(path.join(abs, 'proto', 'film.js'));
  if (rel.startsWith('..') || !(archive || fs.existsSync(path.join(abs, 'film.js')))) throw new Error(`${arg}: to nie jest katalog filmu (brak film.js)`);
  return { abs, rel, archive };
}

/** Otwiera film w osobnym Chromium. params: { film, archive?, v, ss, sz } → { evaluate, close } */
export async function openFilm(params) {
  const port = await ensureServer();
  const q = new URLSearchParams({ ss: String(params.ss ?? 1) });
  if (!params.archive) q.set('film', params.film);
  if (params.v) q.set('v', '1');
  if (params.sz) q.set('sz', '1');
  const url = `http://127.0.0.1:${port}/${params.archive ? `${params.film}/proto/` : 'silnik/'}?${q}`;

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'film-chromium-'));
  // --disable-gpu: rasteryzacja programowa. Z GPU klatka zależała od historii renderu (pamięć glifów):
  // ta sama chwila wychodziła inaczej w filmie i w klatce kontrolnej, a render równoległy różnił się od zwykłego.
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio', '--hide-scrollbars',
    '--force-device-scale-factor=1', '--window-size=1920,1200', ...(process.env.CHROME_FLAGS?.split(' ').filter(Boolean) ?? []), 'about:blank'], { stdio: 'ignore' });
  const close = () => {
    try { chrome.kill(); } catch {}
    // Chromium dopisuje do profilu jeszcze chwilę po zabiciu — porządek najlepiej, jak się da
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}
  };
  process.on('exit', close);

  let devPort = null;
  for (let i = 0; i < 100 && !devPort; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const f = path.join(profile, 'DevToolsActivePort');
    if (fs.existsSync(f)) devPort = fs.readFileSync(f, 'utf8').split('\n')[0];
  }
  if (!devPort) throw new Error('Chromium nie wystartował (brak DevToolsActivePort)');
  const targets = await (await fetch(`http://127.0.0.1:${devPort}/json/list`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (!m.id || !pending.has(m.id)) return;
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) rej(new Error(m.error.message)); else res(m.result);
  };
  const send = (method, p = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params: p }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Page.navigate', { url });
  for (let i = 0; i < 200; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const st = await evaluate('({ ready: window.FILM_READY === true, err: window.FILM_ERROR ?? null })').catch(() => ({}));
    if (st.err) { close(); throw new Error(`film: ${st.err}`); }
    if (st.ready) break;
    if (i === 199) { close(); throw new Error('Strona filmu się nie załadowała'); }
  }
  return { evaluate, close, url };
}

export function closeServer() { server?.close(); server = null; }
