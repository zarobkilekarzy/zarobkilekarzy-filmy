// Ładowanie filmu: marka (kolory, znak) → dane filmu (zrodla.json, znaczniki.json) → skrypty w ustalonej
// kolejności. Skrypty filmu są zwykłymi skryptami (nie modułami): dzielą jedną przestrzeń nazw z silnikiem,
// tak jak w prototypach sprzed wydzielenia silnika.
import * as MARKA from './marka.mjs';

const q = new URLSearchParams(location.search);
const film = `/${(q.get('film') ?? 'szablon').replace(/^\/+|\/+$/g, '')}/`;
if (q.get('embed') === '1') document.body.classList.add('embed');
document.title = `Film — ${film.split('/').filter(Boolean).at(-1)}`;

async function json(file, fallback) {
  const r = await fetch(film + file, { cache: 'no-store' });
  return r.ok ? r.json() : fallback;
}
function script(src) {
  return new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = `${src}?${Date.now()}`;            // bez cache: zmiana w film.js widać po przeładowaniu
    s.onload = ok; s.onerror = () => fail(new Error(`nie wczytano ${src}`));
    document.body.append(s);
  });
}

window.addEventListener('error', (e) => { window.FILM_ERROR = e.message; document.getElementById('err').textContent = e.message; });
try {
  window.MARKA = MARKA;
  window.FILM_DIR = film;
  window.ZRODLA = await json('zrodla.json', {});
  window.ZNACZNIKI_POPRAWKI = await json('znaczniki.json', {});
  for (const src of [`${film}teksty.js`, `${film}lektor.js`, 'silnik.js', `${film}film.js`, 'silnik-start.js']) await script(src);
} catch (e) {
  document.getElementById('err').textContent = String(e.stack ?? e);
  window.FILM_ERROR = String(e);
}

// Szkic filmu (eksport --szkic): klatki kodowane w przeglądarce przez WebCodecs (mediabunny) — sekundy zamiast
// minut; bez supersamplingu i blura, dźwięk dokłada potem ffmpeg. Wynik: MP4 bez dźwięku jako base64.
window.szkic = async (fps = 30) => {
  const mb = await import('/node_modules/mediabunny/dist/bundles/mediabunny.mjs');
  const codec = (await mb.canEncodeVideo('avc')) ? 'avc' : 'vp9';
  const output = new mb.Output({ format: new mb.Mp4OutputFormat(), target: new mb.BufferTarget() });
  const src = new mb.CanvasSource(document.getElementById('c'), { codec, bitrate: mb.QUALITY_HIGH });
  output.addVideoTrack(src, { frameRate: fps });
  await output.start();
  const n = Math.round(window.FILM.dur * fps);
  for (let i = 0; i < n; i++) { window.renderAt(i / fps); await src.add(i / fps, 1 / fps); }
  await output.finalize();
  const bytes = new Uint8Array(output.target.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
