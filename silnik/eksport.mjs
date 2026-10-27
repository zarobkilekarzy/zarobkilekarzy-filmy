#!/usr/bin/env node
// Eksport filmu do MP4: silnik renderuje każdą klatkę w Chromium bez okna (window.capture / captureBlur → PNG),
// dźwięk (FILM.ticks, FILM.piks, FILM.tones) syntetyzuje ten skrypt, lektora (FILM.voice) dokłada ffmpeg; całość −16 LUFS.
// Pliki wideo idą do <film>/wynik/ (poza gitem), z wersją z gita w nazwie.
//
//   node silnik/eksport.mjs filmy/<nazwa>                 → 16:9, 1080p60, supersampling ×3, motion blur 8, crf 12 (X)
//   node silnik/eksport.mjs filmy/<nazwa> --vert          → pion 1080×1920 (TikTok, YouTube Shorts)
//   node silnik/eksport.mjs filmy/<nazwa> --szkic         → szybki podgląd: 30 kl./s, bez blura, kodowanie w przeglądarce (mediabunny)
//   node silnik/eksport.mjs filmy/<nazwa> --stills 0,5.2 [--vert] [--sz]   → wynik/klatki/*.png (--sz: strefy aplikacji)
//   node silnik/eksport.mjs filmy/<nazwa> --tylko-dzwiek [--vert]  → wynik/<nazwa>[-pion]-dzwiek.wav (miks do odtwarzacza)
//   node silnik/eksport.mjs filmy/<nazwa> --wersja <nazwa>/v2   → render starej wersji z taga (tymczasowy git worktree)
//   --fps 60 · --blur 8 · --ss 3 · --crf 12 · --rownolegle 3 (osobne procesy Chromium) · --out plik.mp4
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openFilm, filmDir, closeServer, ROOT, plik } from './przegladarka.mjs';

const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : null; };
const flag = (name) => argv.includes(name);
const { abs: DIR, rel: FILM_REL, archive } = filmDir(argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--')));
if (archive) { console.log(`Film z archiwum ma własny eksport: node ${FILM_REL}/eksport.mjs`); process.exit(1); }
const NAME = path.basename(DIR);
const VERT = flag('--vert'), SZKIC = flag('--szkic');

/* ---------- stara wersja: worktree z taga, eksport tamtym kodem ---------- */
// Repo filmu = generator (film w filmy/ generatora) albo własne repo z filmami, w którym generator jest submodułem —
// wtedy silnik bierzemy z commita submodułu przypiętego w tagu (stary film renderuje się kodem, z którym powstał).
if (arg('--wersja')) {
  const tag = arg('--wersja');
  const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { encoding: 'utf8' }).trim();
  const top = git(DIR, 'rev-parse', '--show-toplevel');
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), 'film-wersja-'));
  const cleanup = [() => git(top, 'worktree', 'remove', '--force', wt)];
  git(top, 'worktree', 'add', '--detach', wt, tag);
  try {
    let engine = wt;
    const sub = path.relative(top, ROOT);
    if (sub && !sub.startsWith('..')) {
      const pinned = git(wt, 'ls-tree', 'HEAD', sub).split(/\s+/)[2];
      if (!pinned) throw new Error(`${tag}: w tej wersji nie ma submodułu ${sub}`);
      engine = path.join(wt, sub);
      fs.rmSync(engine, { recursive: true, force: true });
      git(ROOT, 'worktree', 'add', '--detach', engine, pinned);   // commit musi być w lokalnym repo generatora (git fetch)
      cleanup.unshift(() => git(ROOT, 'worktree', 'remove', '--force', engine));
    }
    fs.symlinkSync(path.join(ROOT, 'node_modules'), path.join(engine, 'node_modules'));
    const rest = argv.filter((a, i) => a !== '--wersja' && argv[i - 1] !== '--wersja' && a !== FILM_REL && path.resolve(a) !== DIR);
    const out = path.join(DIR, 'wynik', `${NAME}${VERT ? '-pion' : ''}-${tag.replaceAll('/', '-')}.mp4`);
    const script = path.join(engine, 'silnik/eksport.mjs');
    if (!fs.existsSync(script)) throw new Error(`${tag}: brak silnik/eksport.mjs w tej wersji — uruchom eksport z jej katalogu ręcznie`);
    execFileSync(process.execPath, [script, path.join(wt, path.relative(top, DIR)), ...rest, ...(arg('--out') ? [] : ['--out', out])],
      { stdio: 'inherit', env: { ...process.env, FILMY_PROJEKT: wt } });
  } finally {
    for (const f of cleanup) f();
  }
  process.exit(0);
}

function version() {
  try { return execFileSync('git', ['-C', DIR, 'describe', '--tags', '--match', `${NAME}/*`, '--dirty', '--always'], { encoding: 'utf8' }).trim().replaceAll('/', '-'); }
  catch { return 'bez-wersji'; }
}
const FPS = Number(arg('--fps') ?? (SZKIC ? 30 : 60));
const STILLS = arg('--stills')?.split(',').map(Number);
// naświetlanie 1/60 s: przy 60 kl./s to migawka 360°, w wersji 30 kl./s (co druga klatka) — klasyczne 180°
const BLUR = SZKIC ? 0 : Number(arg('--blur') ?? 8), EXPOSURE = 1 / 60;
// supersampling: kadr rysowany w ×SS i zmniejszany w przeglądarce — bez moiry na cienkich kreskowaniach
const SS = SZKIC ? 1 : Number(arg('--ss') ?? 3);
// jakość: crf 12 dla mastera na X (drobne kreskowania nie rozmywają się w kompresji)
const CRF = String(arg('--crf') ?? 12);
const PAR = SZKIC || STILLS ? 1 : Math.max(1, Number(arg('--rownolegle') ?? 3));
const OUT_DIR = path.join(DIR, 'wynik');
fs.mkdirSync(OUT_DIR, { recursive: true });
const OUT = arg('--out') ? path.resolve(arg('--out'))
  : path.join(OUT_DIR, `${NAME}${VERT ? '-pion' : ''}${SZKIC ? '-szkic' : ''}-${version()}.mp4`);

const pages = [await openFilm({ film: FILM_REL, v: VERT, ss: SS, sz: flag('--sz') })];
const FILM = await pages[0].evaluate('window.FILM');
const frameOn = (page) => async (t) => Buffer.from((await page.evaluate(BLUR > 1 ? `captureBlur(${t}, ${EXPOSURE}, ${BLUR})` : `capture(${t})`)).slice('data:image/png;base64,'.length), 'base64');
const done = (code = 0) => { pages.forEach((p) => p.close()); closeServer(); process.exit(code); };

/* ---------- klatki kontrolne ---------- */

if (STILLS) {
  const dir = path.join(OUT_DIR, 'klatki');
  fs.mkdirSync(dir, { recursive: true });
  const frame = frameOn(pages[0]);
  for (const t of STILLS) {
    const f = path.join(dir, `${VERT ? 'pion-' : ''}t${t.toFixed(2).replace('.', '_')}.png`);
    fs.writeFileSync(f, await frame(t));
    console.log(path.relative(process.cwd(), f));
  }
  done();
}

/* ---------- sam dźwięk (odtwarzacz): pamięć po treści ---------- */
// Miks dla odtwarzacza liczy się od nowa tylko wtedy, gdy zmieniło się to, co słychać (czasy, tony, klipy lektora, kod
// miksu) — zmiana samego obrazu w film.js zostawia gotowy plik. Klucz: skrót tych danych w pliku .json obok .wav.
const SOUND_OUT = path.join(OUT_DIR, `${NAME}${VERT ? '-pion' : ''}-dzwiek.wav`), SOUND_META = SOUND_OUT.replace(/\.wav$/, '.json');
const SOUND_KEY = createHash('sha1').update(JSON.stringify([FILM.dur, FILM.ticks, FILM.piks, FILM.tones,
  (FILM.voice ?? []).map((v) => [v.file, v.at, v.start, v.from, v.to, fs.statSync(plik(v.file) ?? '.').mtimeMs]),
  fs.readFileSync(fileURLToPath(import.meta.url), 'utf8')])).digest('hex');
if (flag('--tylko-dzwiek') && fs.existsSync(SOUND_OUT) && fs.existsSync(SOUND_META)
  && JSON.parse(fs.readFileSync(SOUND_META, 'utf8')).key === SOUND_KEY) {
  const now = new Date();
  fs.utimesSync(SOUND_OUT, now, now);                       // serwer porównuje daty plików — dźwięk jest aktualny
  console.log(`${path.relative(process.cwd(), SOUND_OUT)} · ${FILM.dur.toFixed(1)} s (bez zmian w dźwięku)`);
  done();
}

/* ---------- dźwięk: tony z film.js (tykanie, pik monitora) + ściszanie pod lektorem ---------- */

const RATE = 48000;
const samples = Math.round(FILM.dur * RATE);
const pcm = new Float32Array(samples);
const TAU = 2 * Math.PI;
// tyknięcie: krótki ton (2 ms narastania, 45 ms wybrzmienia); w unisonie trzy wysokości naraz
function tick(t, freqs, gain) {
  const s0 = Math.round(t * RATE);
  for (let i = 0; i < 0.2 * RATE && s0 + i < samples; i++) {
    const tau = i / RATE;
    const env = tau < 0.002 ? tau / 0.002 : Math.exp(-(tau - 0.002) / 0.012);
    freqs.forEach((f, k) => { pcm[s0 + i] += (gain / (k ? 1.4 : 1)) * env * Math.sin(TAU * f * tau); });
  }
}
function pik(t, gain) {
  const s0 = Math.round(t * RATE);
  for (let i = 0; i < 0.5 * RATE && s0 + i < samples; i++) {
    const tau = i / RATE;
    const env = tau < 0.008 ? tau / 0.008 : Math.exp(-(tau - 0.008) / 0.07);
    const thump = Math.exp(-tau / 0.06) * Math.sin(TAU * (45 + 35 * Math.exp(-tau / 0.03)) * tau);
    pcm[s0 + i] += gain * env * (Math.sin(TAU * 700 * tau) + 0.5 * Math.sin(TAU * 350 * tau)) + gain * 0.8 * thump;
  }
}
for (const k of FILM.ticks) tick(k.t, k.f, k.g * 1.6);
for (const p of FILM.piks) pik(p.t ?? p, 0.12 * (p.g ?? 1));
// ton ciągły (np. asystolia w końcówce): faza od początku filmu, więc tony stykające się na cięciu nie trzaskają
for (const k of FILM.tones ?? []) {
  const i0 = Math.max(0, Math.round(k.from * RATE)), i1 = Math.min(samples, Math.round(k.to * RATE));
  for (let i = i0; i < i1; i++) {
    const t = i / RATE, env = k.g * Math.max(0, Math.min(1, (t - k.from) / (k.in ?? 0.01), (k.to - t) / (k.out ?? 0.05)));
    k.f.forEach((f, j) => { pcm[i] += (j ? 0.5 : 1) * env * Math.sin(TAU * f * t); });
  }
}
// pod mową lektora tętno, tło i pisk schodzą o ok. 8 dB (rampa 80 ms na wejściu i wyjściu)
const VOICE = FILM.voice ?? [];
const DUCK = 0.45, RAMP = 0.08;
if (VOICE.length) {
  for (let i = 0; i < samples; i++) {
    const t = i / RATE;
    let g = 1;
    for (const v of VOICE) {
      const k = Math.min(1, Math.max(0, Math.min((t - (v.from - RAMP)) / RAMP, ((v.to + RAMP) - t) / RAMP)));
      if (k > 0) g = Math.min(g, 1 - (1 - DUCK) * k);
    }
    pcm[i] *= g;
  }
}
let peak = 0;
for (const v of pcm) peak = Math.max(peak, Math.abs(v));
const norm = peak > 0.3 ? 0.3 / peak : 1; // szczyt ok. −10 dBFS
const wav = Buffer.alloc(44 + samples * 4);
wav.write('RIFF', 0); wav.writeUInt32LE(36 + samples * 4, 4); wav.write('WAVE', 8);
wav.write('fmt ', 12); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(2, 22);
wav.writeUInt32LE(RATE, 24); wav.writeUInt32LE(RATE * 4, 28); wav.writeUInt16LE(4, 32); wav.writeUInt16LE(16, 34);
wav.write('data', 36); wav.writeUInt32LE(samples * 4, 40);
pcm.forEach((v, i) => {
  const x = Math.max(-1, Math.min(1, v * norm)) * 32767;
  wav.writeInt16LE(Math.round(x), 44 + i * 4);
  wav.writeInt16LE(Math.round(x), 46 + i * 4);
});
const wavPath = path.join(os.tmpdir(), `film-${process.pid}.wav`);
fs.writeFileSync(wavPath, wav);

// Lektor: każdy klip przesunięty o v.at, potem wspólna szyna lektora: filtr dolnozaporowy (dudnienie), de-esser (głoski
// syczące) i łagodna kompresja. Bez niej szczyty mowy dobijały do ogranicznika normalizacji — dynamiczny loudnorm
// przycinał je co chwilę i lektor brzmiał ostro, syczał. Całość do −16 LUFS: pomiar, potem stałe wzmocnienie
// (bez pompowania głośności) i ogranicznik tylko na pojedynczych szczytach. Wynik: gotowa ścieżka WAV, którą eksport dokłada do obrazu.
const voiceIn = VOICE.flatMap((v) => {
  const f = plik(v.file);
  if (!f) throw new Error(`brak pliku lektora ${v.file}`);
  return ['-i', f];
});
const afmt = `aformat=sample_rates=${RATE}:channel_layouts=stereo`;
// highshelf + lowpass: łagodniejsze „s”, „sz”, „cz” i schowane artefakty MP3 z syntezatora. Ogranicznik z wyprzedzeniem
// (alimiter) ścina rzadkie szczyty mowy 11,5 dB nad zmierzoną głośnością lektora, więc ogranicznik na końcu miksu prawie
// nie pracuje na głosie; próg zależy od nagrania, więc liczy go osobny pomiar.
const VOICE_FX = 'highpass=f=70,highshelf=f=6000:g=-3,lowpass=f=11500,deesser=i=0.7:m=0.6:f=0.5,'
  + 'acompressor=threshold=0.1:ratio=3:attack=5:release=120:knee=6';
const voiceBus = (fx) => [
  ...VOICE.map((v, k) => { const ms = Math.max(0, Math.round(v.at * 1000)); return `[${k + 1}:a]adelay=${ms}|${ms},${afmt}[v${k}]`; }),
  `${VOICE.map((_, k) => `[v${k}]`).join('')}amix=inputs=${VOICE.length}:normalize=0,${fx}[vo]`,
];
const LN = 'loudnorm=I=-16:TP=-1.5:LRA=11';
const ffInfo = (args) => {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-nostats', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr.split('\n').slice(-5).join(' ')}`);
  return r.stderr;
};
const measure = (graph, out) => {
  const err = ffInfo(['-i', wavPath, ...voiceIn, '-filter_complex', `${graph};[${out}]${LN}:print_format=json[m]`, '-map', '[m]', '-f', 'null', '-']);
  return JSON.parse(err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1));
};
let MIX = `[0:a]${afmt}[bg];[bg]anull[mix]`;
if (VOICE.length) {
  const iv = Number(measure(voiceBus(VOICE_FX).join(';'), 'vo').input_i);
  const limit = Math.min(1, Math.max(0.0625, 10 ** ((iv + 11.5) / 20)));
  MIX = [`[0:a]${afmt}[bg]`, ...voiceBus(`${VOICE_FX},alimiter=limit=${limit.toFixed(4)}:attack=5:release=60:level=false`),
    '[bg][vo]amix=inputs=2:normalize=0:duration=first[mix]'].join(';');
}
const mixPath = path.join(os.tmpdir(), `film-${process.pid}-miks.wav`);
{
  // stałe wzmocnienie do −16 LUFS i ogranicznik z wyprzedzeniem na końcu (−2 dBFS, szczyt prawdziwy ok. −1,5 dBTP):
  // ścina tylko pojedyncze krótkie szczyty (piki tła, rzadkie głoski) zamiast zmieniać głośność w czasie jak loudnorm
  const m = measure(MIX, 'mix'), gain = -16 - Number(m.input_i);
  if (process.env.MIKS_DEBUG) console.log('pomiar miksu:', m.input_i, 'LUFS, szczyt', m.input_tp, 'dBTP, wzmocnienie', gain.toFixed(2), 'dB');
  const norm = Number.isFinite(gain) ? `volume=${gain.toFixed(2)}dB,alimiter=limit=0.79:attack=3:release=50:level=false` : 'anull';
  ffInfo(['-i', wavPath, ...voiceIn, '-filter_complex', `${MIX};[mix]${norm},aresample=${RATE}[aout]`, '-map', '[aout]', '-c:a', 'pcm_s16le', mixPath]);
}
fs.rmSync(wavPath, { force: true });
const ffmpeg = (args) => new Promise((ok, fail) => {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: ['pipe', 'inherit', 'inherit'] });
  ff.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg: kod ${code}`))));
  ffmpeg.proc = ff;
});

if (flag('--tylko-dzwiek')) {
  fs.copyFileSync(mixPath, SOUND_OUT); fs.rmSync(mixPath, { force: true });
  fs.writeFileSync(SOUND_META, JSON.stringify({ key: SOUND_KEY }));
  console.log(`${path.relative(process.cwd(), SOUND_OUT)} · ${FILM.dur.toFixed(1)} s`);
  done();
}

const N = Math.round(FILM.dur * FPS);
const t0 = Date.now();

/* ---------- szkic: kodowanie w przeglądarce (WebCodecs przez mediabunny), ffmpeg tylko dokłada dźwięk ---------- */
if (SZKIC) {
  const raw = path.join(os.tmpdir(), `film-${process.pid}-szkic.mp4`);
  const b64 = await pages[0].evaluate(`window.szkic(${FPS})`);
  fs.writeFileSync(raw, Buffer.from(b64, 'base64'));
  await ffmpeg(['-i', raw, '-i', mixPath, '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-shortest', OUT]);
  fs.rmSync(raw, { force: true }); fs.rmSync(mixPath, { force: true });
  console.log(`${path.relative(process.cwd(), OUT)} · szkic ${FPS} kl./s · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  done();
}

/* ---------- wideo: PAR procesów Chromium renderuje co PAR-tą klatkę, zapis w kolejności ---------- */

for (let k = 1; k < PAR; k++) pages.push(await openFilm({ film: FILM_REL, v: VERT, ss: SS, sz: flag('--sz') }));
const enc = ffmpeg(['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
  '-i', mixPath, '-map', '0:v', '-map', '1:a',
  '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', CRF, '-preset', 'slow', '-tune', 'animation',
  '-c:a', 'aac', '-b:a', '192k', '-ar', String(RATE),
  '-movflags', '+faststart', '-shortest', OUT]);
const stdin = ffmpeg.proc.stdin;

const ready = new Map();                    // klatka → PNG czekające na zapis
const WINDOW = PAR * 4;                     // ile klatek naprzód wolno renderować (pamięć)
let written = 0, wake = null;
const nudge = () => { const w = wake; wake = null; w?.(); };
const workers = pages.map((page, j) => (async () => {
  const frame = frameOn(page);
  for (let i = j; i < N; i += PAR) {
    while (i - written >= WINDOW) await new Promise((r) => { const prev = wake; wake = () => { prev?.(); r(); }; });
    ready.set(i, await frame(i / FPS));
    nudge();
  }
})());
while (written < N) {
  if (!ready.has(written)) { await new Promise((r) => { const prev = wake; wake = () => { prev?.(); r(); }; }); continue; }
  const png = ready.get(written); ready.delete(written);
  if (!stdin.write(png)) await new Promise((r) => stdin.once('drain', r));
  written++;
  nudge();
  if (written % FPS === 0) process.stdout.write(`\r${written}/${N} klatek · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
await Promise.all(workers);
stdin.end();
await enc;
fs.rmSync(mixPath, { force: true });
console.log(`\n${path.relative(process.cwd(), OUT)} · ${N} klatek, ${FILM.dur.toFixed(1)} s, ${FPS} kl./s, ×${PAR} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
done();
