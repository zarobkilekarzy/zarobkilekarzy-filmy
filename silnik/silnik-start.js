// Silnik, część 2 (po <film>/film.js): czasy ujęć, dźwięk, lektor, render, odtwarzacz i eksport.
'use strict';

/* ---------- czas ujęć ---------- */
// Ujęcie trwa co najmniej: wejście lektora + mowa (z pauzami między klipami) + oddech + czas na
// doczytanie kadru (hold).
SHOTS.forEach((s, i) => { IDX[s.id] = i; });
PARTS = SHOTS.map((s) => { const l = window.TEKSTY[s.id]; return Array.isArray(l) ? l : l ? [l] : []; });
LINES = PARTS.map((p) => p.join(' '));
gapOf = (n) => (SHOTS[n].gap ?? GAP) * PAUSE_K;
SHOTS.forEach((s, i) => { s.n = i; s.d = Math.max(s.d, LINES[i] ? VO_IN + speech(i) + VO_PAD + (s.hold ?? 0) * PAUSE_K : 0); });
let acc = 0;
SHOTS.forEach((s) => { s.t0 = acc; acc += s.d; s.t1 = acc; });
const DUR = acc;
const shotAt = (t) => SHOTS.find((s) => t >= s.t0 && t < s.t1) ?? SHOTS.at(-1);

/* ---------- dźwięk: projekt w proto/film.js (sound) ---------- */
const T = (id) => SHOTS[IDX[id]].t0;
const { TICKS = [], PIKS = [] } = sound();
// Klipy lektora na osi filmu: mowa (c.start w pliku) zaczyna się w partStart po cięciu.
const VOICE = PARTS.flatMap((parts, n) => parts.map((_, k) => [n, k])).filter(([n, k]) => clipOf(n, k)).map(([n, k]) => {
  const c = clipOf(n, k), from = SHOTS[n].t0 + partStart(n, k);
  return { file: REC.dir + c.wav, start: c.start, at: from - c.start, from, to: from + c.speech, text: c.text, align: c.align };
});

if (VERT) document.getElementById('wrap').style.maxWidth = 'min(100vw, calc((100vh - 140px) * 9 / 16))';

/* ---------- odtwarzacz ---------- */

function render(t) {
  render.t = t;
  const s = shotAt(t);
  const lt = t - s.t0;
  th = TH[typeof s.theme === 'function' ? s.theme(lt) : s.theme];
  ctx.setTransform(SS, 0, 0, SS, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = th.bg; ctx.fillRect(0, 0, W, H);
  // najazd kamery: w grupie ujęć o tym samym układzie (`group`) liczony przez całą grupę — bez skoku na cięciu
  const span = s.group ? SHOTS.filter((x) => x.group === s.group) : [s];
  const k = 1 + 0.025 * ((t - span[0].t0) / (span.at(-1).t1 - span[0].t0));
  ctx.save();
  if (VERT) { ctx.translate(SAFE.x, SAFE.y); ctx.scale(SAFE.k, SAFE.k); ctx.translate(-SAFE.x, -SAFE.from); }
  ctx.translate(W / 2, H / 2); ctx.scale(k, k); ctx.translate(-W / 2, -H / 2);
  INSPECT_PART = s.bare ? 'plansza' : 'kadr';
  if (!VERT) s.draw(lt, s.d);
  else if (s.drawV) s.drawV(lt, s.d);
  else txt(`kadr „${s.id}” — pion w przygotowaniu`, M, H / 2, { size: 40, weight: 500, color: th.muted });
  INSPECT_PART = 'silnik';
  ctx.restore();
  if (!s.bare) logo();
  if (s.src) source(s.src);
  if (VERT && !s.noCap) caption(render.t ?? 0);
  if (s.zip) zip(lt);
  if (VERT && SAFE_OVERLAY) safeOverlay();
}
// ?sz=1 — podgląd stref interfejsu (tylko do kontroli, nie do eksportu filmu)
const SAFE_OVERLAY = new URLSearchParams(location.search).get('sz') === '1';
function safeOverlay() {
  ctx.save();
  const zone = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  // TikTok: pasek 240, dół od 1260, kolumna przycisków 900–1080 od 840
  zone(0, 0, W, 240, 'rgba(255,0,80,0.28)'); zone(0, 1260, W, H - 1260, 'rgba(255,0,80,0.28)'); zone(900, 840, 180, 420, 'rgba(255,0,80,0.28)');
  // Shorts: pasek 288, dół od 1248, prawa kolumna 192
  ctx.strokeStyle = '#FFD400'; ctx.lineWidth = 4; ctx.setLineDash([16, 10]);
  ctx.strokeRect(48, 288, W - 48 - 192, 1248 - 288);
  ctx.restore();
}

const state = { t: 0, playing: false, sound: false, tts: false, last: 0, shot: -1 };
const $ = (id) => document.getElementById(id);
const seek = $('seek'), tl = $('tl'), playBtn = $('play'), sndBtn = $('snd'), ttsBtn = $('tts'), voEl = $('vo');
seek.max = DUR;
let actx = null;

function tone(freqs, gain, dur, attack = 0.002) {
  if (!actx) return;
  const t0 = actx.currentTime;
  freqs.forEach((f, i) => {
    const o = actx.createOscillator(), v = actx.createGain();
    o.frequency.value = f;
    v.gain.setValueAtTime(0, t0);
    v.gain.linearRampToValueAtTime(gain / (i ? 1.4 : 1), t0 + attack);
    v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(v).connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  });
}
const tick = (k) => tone(k.f, k.g, 0.045);
const pik = () => tone([700, 350], 0.18, 0.22, 0.008);
const playing = new Set();
function voice(v) {
  const a = new Audio(v.file);
  a.currentTime = v.start + Math.max(0, state.t - v.from);
  a.play().catch(() => {});
  playing.add(a); a.onended = () => playing.delete(a);
}
const hush = () => { playing.forEach((a) => a.pause()); playing.clear(); };

function speak(n) {
  if (!state.tts || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  if (!LINES[n]) return;
  const u = new SpeechSynthesisUtterance(LINES[n]);
  u.lang = 'pl-PL'; u.rate = 1.15;
  const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith('pl'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}

function show() {
  render(state.t);
  seek.value = state.t;
  const s = shotAt(state.t);
  tl.textContent = `${state.t.toFixed(1).padStart(4, '0')} / ${DUR.toFixed(1)} s · ujęcie ${s.n}`;
  voEl.textContent = LINES[s.n] ? `Lektor: ${LINES[s.n]}` : '—';
}

function loop(now) {
  if (state.playing) {
    const dt = Math.min(0.1, (now - state.last) / 1000), prev = state.t;
    state.t = Math.min(DUR, state.t + dt);
    if (state.sound) {
      // pod mową lektora tykanie ciszej (jak w eksporcie)
      const duck = VOICE.some((v) => state.t >= v.from - 0.08 && state.t <= v.to + 0.08) ? 0.45 : 1;
      for (const k of TICKS) if (k.t > prev && k.t <= state.t) tick({ ...k, g: k.g * duck });
      for (const p of PIKS) if (p > prev && p <= state.t) pik();
      for (const v of VOICE) if (v.from > prev && v.from <= state.t) voice(v);
    }
    const s = shotAt(state.t);
    if (s.n !== state.shot) { state.shot = s.n; if (!VOICE.length) speak(s.n); }
    if (state.t >= DUR) { state.playing = false; playBtn.textContent = '▶'; }
    show();
  }
  state.last = now;
  requestAnimationFrame(loop);
}

function toggle() {
  if (state.t >= DUR) state.t = 0;
  state.playing = !state.playing;
  playBtn.textContent = state.playing ? '❚❚' : '▶';
  state.shot = -1;
  if (!state.playing) { window.speechSynthesis?.cancel(); hush(); }
}
function needAudio() { if (!actx) actx = new AudioContext(); }

playBtn.onclick = toggle;
sndBtn.onclick = () => {
  state.sound = !state.sound; if (state.sound) needAudio();
  sndBtn.textContent = `dźwięk: ${state.sound ? 'wł.' : 'wył.'}`;
  sndBtn.classList.toggle('on', state.sound);
};
ttsBtn.onclick = () => {
  state.tts = !state.tts;
  if (!state.tts) window.speechSynthesis?.cancel();
  ttsBtn.textContent = `lektor (syntezator): ${state.tts ? 'wł.' : 'wył.'}`;
  ttsBtn.classList.toggle('on', state.tts);
};
seek.oninput = () => { state.t = +seek.value; state.shot = -1; hush(); show(); };
document.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  if (e.code === 'ArrowRight') { state.t = Math.min(DUR, state.t + 0.5); show(); }
  if (e.code === 'ArrowLeft') { state.t = Math.max(0, state.t - 0.5); show(); }
});
SHOTS.forEach((s) => {
  const b = document.createElement('button');
  b.textContent = String(s.n);
  b.onclick = () => { state.t = s.t0; state.shot = -1; show(); };
  $('scenes').append(b);
});
function fromHash() {
  const m = location.hash.match(/t=([\d.]+)/);
  if (m) { state.t = Math.min(DUR, +m[1]); show(); }
}
window.addEventListener('hashchange', fromHash);
window.renderAt = (t) => { state.t = t; show(); };
window.SHOTS = SHOTS;
// Klatka do eksportu zawsze w 1920×1080: przy supersamplingu (?ss=2) zmniejszona z wysoką jakością
// wygładzania — cienkie kreskowania nie dają wtedy moiry.
const outCv = document.createElement('canvas');
outCv.width = W; outCv.height = H;
const outCtx = outCv.getContext('2d');
outCtx.imageSmoothingEnabled = true; outCtx.imageSmoothingQuality = 'high';
function png(src) {
  if (SS === 1) return src.toDataURL('image/png');
  outCtx.drawImage(src, 0, 0, W, H);
  return outCv.toDataURL('image/png');
}
window.capture = (t) => { render(t); return png(cv); };
// Motion blur: klatka = średnia z `n` renderów w czasie naświetlania [t, t + exposure); próbki nie
// przechodzą przez cięcie.
const accCv = document.createElement('canvas');
accCv.width = W * SS; accCv.height = H * SS;
const accCtx = accCv.getContext('2d');
function blurFrame(t, exposure, n) {
  const s0 = shotAt(t);
  for (let k = 0; k < n; k++) {
    render(Math.min(t + (k / n) * exposure, s0.t1 - 1e-4));
    accCtx.globalAlpha = 1 / (k + 1);
    accCtx.drawImage(cv, 0, 0);
  }
  return accCv;
}
window.captureBlur = (t, exposure, n) => png(blurFrame(t, exposure, n));
window.FILM = { dur: DUR, ticks: TICKS, piks: PIKS, voice: VOICE.map(({ _w, ...v }) => v), lines: LINES, vert: VERT,
  shots: SHOTS.map((s) => ({ id: s.id, n: s.n, t0: s.t0, t1: s.t1, src: s.src ?? '', theme: typeof s.theme === 'string' ? s.theme : 'zmienny', bare: !!s.bare })),
  // nazwane znaczniki na osi filmu: czas bez poprawki z odtwarzacza (`base`) i z poprawką (`t`)
  znaczniki: Object.entries(typeof ZNACZNIKI === 'undefined' ? {} : ZNACZNIKI).map(([name, z]) => {
    const t0 = SHOTS[IDX[z.ujecie]].t0;
    return { name, ujecie: z.ujecie, fraza: z.fraza ?? null, base: t0 + zAt(z), t: t0 + Z(name) };
  }) };
// Kontrola (silnik/kontrola.mjs): napisy rysowane w chwilach `at` (ułamki długości ujęcia), z prostokątami w pikselach klatki.
window.inspect = (at = [0.5, 0.999]) => SHOTS.map((s) => {
  const seen = new Map();
  for (const a of at) {
    INSPECT = [];
    render(s.t0 + a * s.d);
    for (const r of INSPECT) if (!seen.has(r.s + r.part)) seen.set(r.s + r.part, r);
  }
  INSPECT = null;
  return { id: s.id, n: s.n, d: s.d, src: s.src ?? '', bare: !!s.bare, texts: [...seen.values()] };
});

Promise.all(['500 20px "Inter Tight"', '300 20px "Inter Tight"', '600 20px "Inter Tight"', '400 20px "Inter Tight"',
  '500 20px "Plex Mono"', '400 20px "Plex Mono"']
  .map((f) => document.fonts.load(f, 'zł ąęółśżźćń ×–'))).finally(() => {
  show();
  fromHash();
  requestAnimationFrame(loop);
  window.FILM_READY = true;
});
