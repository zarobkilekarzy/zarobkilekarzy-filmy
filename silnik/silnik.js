// Silnik filmów (opis: README.md repo; marka: silnik/marka.mjs). Styl zarobkilekarzy.pl: kobalt + granat + biel, Inter Tight,
// etykiety Plex Mono, linie 1 px, ostre narożniki. Każda klatka zależy tylko od t (render(t)), więc ten sam
// kod służy do podglądu i do eksportu klatka po klatce. Jeden kod, dwie wersje: 16:9 (X, strona) i ?v=1 —
// pion 1080×1920 (TikTok, YouTube Shorts). Treść filmu: <film>/film.js; ładuje je silnik/start.mjs.
'use strict';

// ?v=1 — wersja pionowa 1080×1920 (TikTok, Reels, Shorts): kadry z `drawV`, napisy lektora na dole kadru.
const VERT = new URLSearchParams(location.search).get('v') === '1';
const W = VERT ? 1080 : 1920, H = VERT ? 1920 : 1080, M = VERT ? 70 : 120;
// pion: logo pod paskiem aplikacji, stopka ze źródłem nad napisami, dół kadru wolny (opis posta w aplikacji)
const LOGO_Y = VERT ? 252 : 62, FOOT_Y = 1024, CAP_Y = 1306;
// Pion: strefy, których nie zasłania interfejs TikToka i YouTube Shorts (pasek u góry ok. 240–290 px,
// opis i nazwa kanału na dole od ok. 1250 px, kolumna przycisków z prawej ok. 180 px). Kadry z `drawV`
// są projektowane na polu 70–1010 × 360–1420 i wpisywane w pole bezpieczne SAFE (skala 0,74) wyśrodkowane na ekranie:
// środek pola = środek ekranu (x 540), więc pole zajmuje x 192–888 — prawa krawędź kończy się przed kolumną przycisków.
// Z najazdem kamery skala jest mniejsza (silnik-start.js), żeby pole po pełnym przybliżeniu nadal mieściło się w 192–888.
const SAFE = { y: 430, from: 360, k: 0.74, right: 900 };

// Motywy kadrów (noc / dzień / kobalt), linia EKG znaku i napisy marki — silnik/marka.mjs.
const TH = window.MARKA.TH;
const [NAZWA, NAZWA_PRZYROSTEK = ''] = window.MARKA.NAZWA, HASLO = window.MARKA.HASLO, KONTO = window.MARKA.KONTO;
const NAZWA_LEKTOR = window.MARKA.NAZWA_LEKTOR ?? '';
const F = { disp: '"Inter Tight", sans-serif', body: 'Plex, sans-serif', mono: '"Plex Mono", monospace' };

// Supersampling do eksportu (?ss=2): kadr rysowany w 3840×2160, zmniejszany przy zapisie klatki.
const SS = Math.max(1, Number(new URLSearchParams(location.search).get('ss')) || 1);
const cv = document.getElementById('c');
cv.width = W * SS; cv.height = H * SS;
const ctx = cv.getContext('2d');
let th = TH.dark;

/* ---------- ruch ---------- */

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (t, a, b) => clamp01((t - a) / (b - a));
const outExpo = (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp01(x)));
const outBack = (x) => { x = clamp01(x); const c = 1.6; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const inOut = (x) => { x = clamp01(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
const lerp = (a, b, k) => a + (b - a) * k;
const fmt = (n) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/* ---------- typografia ---------- */

function setFont(size, weight, font, track) {
  ctx.font = `${weight} ${size}px ${font}`;
  ctx.letterSpacing = `${size * track}px`;
}
function measure(s, size, weight = 500, font = F.disp, track = -0.03) {
  ctx.save(); setFont(size, weight, font, track);
  const w = ctx.measureText(s).width;
  ctx.restore();
  return w;
}
/** Tekst; `max` zmniejsza stopień, gdy napis nie mieści się w szerokości. */
function txt(s, x, y, o = {}) {
  let { size = 64, weight = 500, color = th.ink, alpha = 1, align = 'left', font = F.disp, track = -0.03, max = W - 2 * M } = o;
  if (alpha <= 0) return size;
  const w = measure(s, size, weight, font, track);
  if (w > max) size *= max / w;
  if (INSPECT) inspectTxt(s, x, y, size, Math.min(w, max), align);
  ctx.save();
  ctx.globalAlpha *= alpha;
  setFont(size, weight, font, track);
  ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.fillText(s, x, y);
  ctx.restore();
  return size;
}
/** Etykieta jak na infografikach v2: Plex Mono, wersaliki, rozstrzelenie. */
function mono(s, x, y, lt, at, o = {}) {
  const p = outExpo(seg(lt, at, at + 0.25));
  if (p <= 0) return;
  // pisanie „maszynowe”: znaki dochodzą w ciągu 0,25 s
  const n = Math.ceil(s.length * p);
  txt(s.toUpperCase().slice(0, n), x, y, { size: 26, weight: 500, font: F.mono, track: 0.06, color: th.accent, ...o });
}
/** Wjazd od dołu spod maski (szwajcarski „rise”). */
function rise(s, x, y, size, lt, at, o = {}) {
  const p = outExpo(seg(lt, at, at + (o.d ?? 0.34)));
  if (p <= 0) return;
  const weight = o.weight ?? 600, max = o.max ?? W - 2 * M;
  let w = measure(s, size, weight);
  if (w > max) { size *= max / w; w = max; }
  const ax = o.align === 'center' ? x - w / 2 : o.align === 'right' ? x - w : x;
  ctx.save();
  ctx.beginPath(); ctx.rect(ax - 30, y - size * 1.02, w + 60, size * 1.3); ctx.clip();
  txt(s, x, y + (1 - p) * size * 1.15, { ...o, size, weight });
  ctx.restore();
}
/** Uderzenie: wejście z lekkim przeskalowaniem. */
function slam(s, x, y, size, lt, at, o = {}) {
  const p = seg(lt, at, at + 0.24);
  if (p <= 0) return;
  const k = 1 + 0.22 * (1 - outExpo(p));
  ctx.save();
  ctx.translate(x, y); ctx.scale(k, k);
  txt(s, 0, 0, { weight: 600, ...o, size, alpha: (o.alpha ?? 1) * Math.min(1, p * 4) });
  ctx.restore();
}
const count = (target, lt, at, d = 0.55) => target * outExpo(seg(lt, at, at + d));

/* ---------- kontrola: co i gdzie rysuje kadr ---------- */
// silnik/kontrola.mjs włącza INSPECT = [] i renderuje każde ujęcie; txt() dopisuje napis z prostokątem
// w pikselach klatki (po wszystkich przekształceniach, także wpisaniu pionu w SAFE). `part` mówi, czy
// napis jest treścią kadru (draw/drawV), czy dodatkiem silnika (logo, źródło, napisy, plansza).
let INSPECT = null, INSPECT_PART = '';
function inspectTxt(s, x, y, size, w, align) {
  const m = ctx.getTransform(), k = 1 / SS;
  const x0 = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
  const pts = [[x0, y - size * 0.75], [x0 + w, y + size * 0.2]].map(([u, v]) => [(m.a * u + m.c * v + m.e) * k, (m.b * u + m.d * v + m.f) * k]);
  INSPECT.push({ s, part: INSPECT_PART, size: size * Math.hypot(m.a, m.b) * k, x0: pts[0][0], y0: pts[0][1], x1: pts[1][0], y1: pts[1][1] });
}

function rect(x, y, w, h, color, alpha = 1) {
  if (alpha <= 0 || w <= 0 || h <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = color; ctx.fillRect(x, y, w, h); ctx.restore();
}
function frame(x, y, w, h, color, lw = 2, alpha = 1, dash = null) {
  if (alpha <= 0 || w <= 0 || h <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = lw;
  if (dash) ctx.setLineDash(dash);
  ctx.strokeRect(x, y, w, h); ctx.restore();
}
/** Kreskowanie ukośne — znak „umowy cywilnoprawnej” i dyżuru. */
// Rzadkie i grube linie: gęste kreskowanie dawało moirę po pomniejszeniu filmu w odtwarzaczu i na telefonie.
function hatch(x, y, w, h, color, alpha = 1, gap = 28) {
  if (alpha <= 0 || w <= 0 || h <= 0) return;
  ctx.save(); ctx.globalAlpha *= alpha;
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.strokeStyle = color; ctx.lineWidth = gap * 0.22;
  ctx.beginPath();
  for (let u = x - h; u < x + w; u += gap) { ctx.moveTo(u, y + h); ctx.lineTo(u + h, y); }
  ctx.stroke(); ctx.restore();
  frame(x + 1, y + 1, w - 2, h - 2, color, 2, alpha);
}
function hline(x0, x1, y, color = th.line, k = 1, lw = 1) {
  if (k <= 0) return;
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw;
  ctx.beginPath(); ctx.moveTo(x0, y + 0.5); ctx.lineTo(lerp(x0, x1, k), y + 0.5); ctx.stroke(); ctx.restore();
}
function seg2(x0, y0, x1, y1, color, lw = 2, k = 1, dash = null) {
  if (k <= 0) return;
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = lw;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(lerp(x0, x1, k), lerp(y0, y1, k)); ctx.stroke(); ctx.restore();
}

/* ---------- znaki miejsc (opcjonalnie): A pełny atrament, B kobalt, C kreskowanie ---------- */

function fillKind(kind, x, y, w, h, alpha = 1) {
  if (kind === 'A') rect(x, y, w, h, th.ink, alpha);
  else if (kind === 'B') rect(x, y, w, h, th.accent, alpha);
  else hatch(x, y, w, h, th.accent, alpha);
}
/** Znak miejsca: kwadrat z literą. `k` = skala wejścia. */
function place(kind, x, y, s, k = 1, alpha = 1) {
  if (k <= 0 || alpha <= 0) return;
  const ss = s * k, ox = x + (s - ss) / 2, oy = y + (s - ss) / 2;
  fillKind(kind, ox, oy, ss, ss, alpha);
  const col = kind === 'C' ? th.accent : th.bg;
  if (kind === 'C') rect(x + s / 2 - ss * 0.23, y + s / 2 - ss * 0.25, ss * 0.46, ss * 0.5, th.bg, alpha);
  txt(kind, x + s / 2, y + s / 2 + s * 0.17, { size: s * 0.48 * k, weight: 600, font: F.mono, track: 0, align: 'center', color: col, alpha });
}

/* ---------- znak i stopka ---------- */

// Znak serwisu X (src/icons.ts: x), w układzie 24×24.
const X_LOGO = new Path2D('M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z');
// Linia EKG ze znaku (silnik/marka.mjs), w układzie 24×24.
const ECG = window.MARKA.ECG;
function mark(x, y, s, k = 1) {
  rect(x, y, s, s, th.mark);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, s * k, s); ctx.clip();
  ctx.strokeStyle = th.markLine; ctx.lineWidth = (s / 24) * 2; ctx.lineJoin = 'miter'; ctx.miterLimit = 5;
  ctx.beginPath();
  ECG.forEach(([u, v], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, x + (u / 24) * s, y + (v / 24) * s));
  ctx.stroke(); ctx.restore();
}
// pion: logo i krótkie źródło wyrównane do lewej krawędzi wyśrodkowanego pola kadru (nie do brzegu ekranu)
const lx = () => (VERT ? W / 2 + (M - W / 2) * SAFE.k : M);
function logo() {
  mark(lx(), LOGO_Y, 40);
  const w = measure(NAZWA, 34, 500);
  txt(NAZWA, lx() + 54, LOGO_Y + 32, { size: 34, weight: 500 });
  txt(NAZWA_PRZYROSTEK, lx() + 54 + w, LOGO_Y + 32, { size: 34, weight: 500, color: th.wordDim });
}
// Źródła: <film>/zrodla.json — klucz ujęcia (`src: 'klucz'`) → pełna stopka 16:9 i krótka linia pionu.
// Z tego samego pliku biorą się napisy ze źródłami na stronę i kontrola liczb (silnik/kontrola.mjs).
const ZRODLA = window.ZRODLA ?? {};
const srcFull = (s) => ZRODLA[s]?.stopka ?? s;
const srcShort = (s) => ZRODLA[s]?.krotko ?? srcFull(s);
function source(s) {
  if (VERT) { sourceV(s); return; }
  s = srcFull(s);
  ctx.save();
  setFont(17, 400, F.mono, 0);
  const words = s.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > W - 2 * M && line) { lines.push(line); line = w; } else line = next;
  }
  lines.push(line);
  ctx.restore();
  hline(M, W - M, FOOT_Y - 34 - (lines.length - 1) * 26, th.line);
  lines.forEach((l, i) => txt(l, M, FOOT_Y - (lines.length - 1 - i) * 26, { size: 17, weight: 400, font: F.mono, track: 0, color: th.muted, max: 9999 }));
}
/** Pion: zamiast stopki — krótkie źródło pod logo (pełne źródła są w napisach pod filmem na stronie). */
function sourceV(s) {
  const short = srcShort(s);
  ctx.save(); setFont(22, 500, F.mono, 0.04);
  const words = short.split(' '), lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > SAFE.right - lx() && line) { lines.push(line); line = w; } else line = next;
  }
  lines.push(line); ctx.restore();
  lines.slice(0, 2).forEach((l, i) => txt(l, lx(), LOGO_Y + 74 + i * 28, { size: 22, weight: 500, font: F.mono, track: 0.04, color: th.muted, max: 9999 }));
}
/** Przejście na początku aktu: linia EKG ze znaku przelatuje przez cały kadr. */
function zip(lt) {
  const p = seg(lt, 0, 0.22), fade = 1 - seg(lt, 0.22, 0.4);
  if (fade <= 0) return;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.beginPath(); ctx.rect(0, 0, W * outExpo(p), H); ctx.clip();
  ctx.strokeStyle = th.accent; ctx.lineWidth = 6; ctx.lineJoin = 'miter'; ctx.miterLimit = 5;
  ctx.beginPath();
  ECG.forEach(([u, v], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, (u / 24) * W, H / 2 + (v - 14) * 32));
  ctx.stroke(); ctx.restore();
}


/* ---------- lektor ---------- */
// Kwestie: proto/teksty.js (tablica = osobne klipy z pauzą `gap` między nimi). Nagranie: proto/lektor.js
// (ElevenLabs, z wyrównaniem znaków). Bez nagrania długość mowy to szacunek: znaki / VO_RATE.
// cueAt('id', 'fraza') = chwila od początku ujęcia, w której lektor dochodzi do frazy — tam wchodzą wiersze.
// Ujęcia mają identyfikatory (`id`); teksty i klipy są do nich przypięte, więc kolejność można zmieniać.
const VO_RATE = 16, VO_IN = 0.15, VO_PAD = 0.45, GAP = 0.5;
// lektor ×1,0 mówi wolniej, więc cisze z `gap` i `hold` są krótsze (mniej dziur w narracji)
const PAUSE_K = 0.6;
let PARTS = [], LINES = [], IDX = {};                         // wypełniane po zdefiniowaniu SHOTS
const REC = window.LEKTOR;
const clipOf = (n, k) => REC?.clips.find((c) => c.text === PARTS[n][k]);
const partLen = (n, k) => clipOf(n, k)?.speech ?? PARTS[n][k].length / VO_RATE;
let gapOf = () => GAP;
/** Początek k-tego klipu ujęcia n, licząc od cięcia. */
const partStart = (n, k) => { let t = VO_IN; for (let j = 0; j < k; j++) t += partLen(n, j) + gapOf(n); return t; };
const speech = (n) => (PARTS[n].length ? partStart(n, PARTS[n].length - 1) + partLen(n, PARTS[n].length - 1) - VO_IN : 0);
function cueAt(n, phrase) {
  if (typeof n === 'string') n = IDX[n];
  const k = Math.max(0, PARTS[n].findIndex((p) => p.includes(phrase)));
  const c = clipOf(n, k), i = PARTS[n][k].indexOf(phrase);
  if (c && i >= 0) return partStart(n, k) + Math.max(0, c.align.t[c.align.chars.indexOf(phrase)] - c.start);
  return partStart(n, k) + Math.max(0, i) / VO_RATE;
}

/* ---------- nazwane znaczniki (pomysł z Motion Canvas: „time events”) ---------- */
// film.js deklaruje ZNACZNIKI = { nazwa: { ujecie, fraza?, t?, przesun? } }: chwila, w której lektor dochodzi
// do frazy (albo stałe t od cięcia) + przesunięcie. Odtwarzacz zapisuje poprawki z osi czasu w <film>/znaczniki.json
// ({ nazwa: sekundy }) — dzięki temu znacznik przeżywa nowe nagranie lektora. Z('nazwa') = czas od początku ujęcia.
const POPRAWKI = window.ZNACZNIKI_POPRAWKI ?? {};
function zAt(z) { return (z.fraza != null ? cueAt(z.ujecie, z.fraza) : z.t ?? 0) + (z.przesun ?? 0); }
function Z(name) {
  const z = ZNACZNIKI[name];
  if (!z) throw new Error(`nieznany znacznik „${name}” (dopisz go do ZNACZNIKI w film.js)`);
  return zAt(z) + (POPRAWKI[name] ?? 0);
}


/* ---------- pion: dopasowanie stopnia i napisy lektora ---------- */
/** Pion: stopień, przy którym napis wypełnia szerokość kadru (najwyżej `max`). */
const fitSize = (str, max, weight = 300) => Math.min(max, max * (W - 2 * M) / measure(str, max, weight));
// Napisy: kwestia od początku mowy do końca + 0,6 s (albo do następnej); słowo jaśnieje, gdy lektor
// je wypowiada (wyrównanie znaków z ElevenLabs). Napisy są drugim planem: mniejsze od treści kadru.
// Liczby pokazują cyframi — mapa SHOWN (tekst lektora → tekst napisu) w proto/film.js.
// napisy wyśrodkowane w kadrze; szerokość linii ograniczona, żeby nie wchodziły pod przyciski aplikacji
const CAP = { size: 54, line: 68, w: 800, cx: W / 2 };
function captionAt(t) {
  for (let i = 0; i < VOICE.length; i++) {
    const v = VOICE[i], next = VOICE[i + 1]?.from ?? Infinity;
    if (t >= v.from - 0.05 && t < Math.min(v.to + 0.6, next - 0.02)) return v;
  }
  return null;
}
function capWords(v) {
  if (v._w) return v._w;
  const shown = SHOWN[v.text];
  if (shown) {
    let from = 0;
    return (v._w = shown.split(' ').map((w) => { const i = shown.indexOf(w, from); from = i + w.length; return { w, at: v.from + (i / shown.length) * (v.to - v.from) }; }));
  }
  let from = 0;
  return (v._w = v.text.split(' ').map((w) => {
    const i = v.text.indexOf(w, from); from = i + w.length;
    const ai = v.align ? v.align.chars.indexOf(w, Math.max(0, i - 3)) : -1;
    return { w, at: ai >= 0 ? v.from + (v.align.t[ai] - v.start) : v.from + (i / v.text.length) * (v.to - v.from) };
  }));
}
function caption(t) {
  const v = captionAt(t);
  if (!v) return;
  ctx.save();
  setFont(CAP.size, 600, F.disp, -0.03);
  const space = ctx.measureText(' ').width, fade = Math.min(1, (t - v.from + 0.05) / 0.15);
  // łamanie na linie, potem każda linia wyśrodkowana
  const lines = [];
  let cur = [], lw = 0;
  for (const wd of capWords(v)) {
    const ww = ctx.measureText(wd.w).width;
    if (cur.length && lw + space + ww > CAP.w) { lines.push({ words: cur, w: lw }); cur = []; lw = 0; }
    lw += (cur.length ? space : 0) + ww;
    cur.push({ ...wd, ww });
  }
  if (cur.length) lines.push({ words: cur, w: lw });
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = th.ink;
  lines.forEach((ln, i) => {
    let x = CAP.cx - ln.w / 2;
    for (const { w, at, ww } of ln.words) {
      ctx.globalAlpha = fade * (t >= at - 0.03 ? 1 : 0.35);
      ctx.fillText(w, x, CAP_Y + i * CAP.line);
      x += ww + space;
    }
  });
  ctx.restore();
}


/* ---------- plansza końcowa (16:9 i pion) ---------- */
// k = ile linii znaku jest narysowane (endCard: linia rysuje się na wejściu; końcówka `ending`: znak już stoi)
function card(lt, k) {
  const L = VERT ? { s: 280, mark: 420, name: 940, fs: fitSize(NAZWA + NAZWA_PRZYROSTEK, 150, 500), haslo: 1080, hs: 72, handle: 1230, hz: 44 }
    : { s: 180, mark: 230, name: 600, fs: 110, haslo: 720, hs: 56, handle: 820, hz: 30 };
  mark(W / 2 - L.s / 2, L.mark, L.s, k);
  const w1 = measure(NAZWA, L.fs, 500), w2 = measure(NAZWA_PRZYROSTEK, L.fs, 500);
  const x = W / 2 - (w1 + w2) / 2, a = seg(lt, 0.3, 0.5);
  txt(NAZWA, x, L.name, { size: L.fs, weight: 500, alpha: a, max: 9999 });
  txt(NAZWA_PRZYROSTEK, x + w1, L.name, { size: L.fs, weight: 500, color: th.wordDim, alpha: a, max: 9999 });
  rise(HASLO, W / 2, L.haslo, L.hs, lt, 0.55, { weight: 400, align: 'center' });
  handle(lt, L.handle, L.hz);
}
function endCard(lt) { card(lt, outExpo(seg(lt, 0.1, 0.6))); }
function endCardV(lt) { card(lt, outExpo(seg(lt, 0.1, 0.6))); }
/** znak serwisu X i nazwa konta, wyśrodkowane */
function handle(lt, y, size) {
  if (!KONTO) return;
  const ha = seg(lt, 0.8, 1.0), hw = measure(KONTO, size, 500, F.mono, 0.04), gap = size * 0.45;
  const x0 = W / 2 - (size + gap + hw) / 2;
  ctx.save(); ctx.globalAlpha = ha; ctx.fillStyle = th.ink;
  ctx.translate(x0, y - size * 0.86); ctx.scale(size / 24, size / 24); ctx.fill(X_LOGO); ctx.restore();
  txt(KONTO, x0 + size + gap, y, { size, weight: 500, font: F.mono, track: 0.04, color: th.ink, alpha: ha });
}


/* ---------- końcówka: linia EKG zamarza w znak marki ---------- */
// `...ending()` na końcu SHOTS dokleja dwa ujęcia na kobalcie. Pierwsze: linia EKG biegnie przez kadr jak na
// kardiomonitorze, kilka uderzeń z pikiem; gdy głowica mija miejsce znaku, linia zamarza (serce staje — ciągły ton)
// i płynnie staje się znakiem: płaska linia grubieje w kwadrat, a ostatnie uderzenie zostaje w nim jako linia znaku.
// Drugie: plansza — pod znakiem nazwa, hasło i konto, lektor czyta nazwę (NAZWA_LEKTOR z marki; kwestia pod tym samym
// id w teksty.js filmu ma pierwszeństwo, '' = bez lektora). Dźwięk przynoszą same ujęcia (pole `sound`).
// Opcje: ids (identyfikatory obu ujęć), beats (liczba uderzeń; ostatnie zamarza w znaku).
function ending(o = {}) {
  const { ids = ['serce', 'plansza'], beats = 3 } = o;
  const BEAT = 0.8, FREEZE = 0.22, MORPH = 0.75;
  const times = Array.from({ length: beats }, (_, k) => 0.35 + k * BEAT), tf = times.at(-1) + FREEZE;
  // znak stoi tam, gdzie na planszy (card); linia biegnie na wysokości linii znaku, ostatni wierzchołek trafia w znak
  const s = VERT ? 280 : 180, mx = W / 2 - s / 2, my = VERT ? 420 : 230, u = s / 24;
  const base = ECG[0][1], y0 = my + base * u, R = ECG.reduce((a, p) => (p[1] < a[1] ? p : a)), xR = mx + R[0] * u;
  const i0 = ECG.findIndex((p) => p[1] !== base) - 1, i1 = ECG.findLastIndex((p) => p[1] !== base) + 1;
  // głowica startuje przy lewej krawędzi ekranu (pion: zza krawędzi, żeby uderzenia nie stały za gęsto)
  const x0 = VERT ? -120 : 0, v = (xR - x0) / times.at(-1), LW = VERT ? 7 : 6;
  // linia: zespoły QRS znaku w miejscach uderzeń; sy = skala w pionie (na monitorze 2u, w znaku u)
  const pts = (sy) => [[x0, y0], ...times.flatMap((t) => ECG.slice(i0, i1 + 1)
    .map(([a, b]) => [xR - v * (times.at(-1) - t) + (a - R[0]) * u, y0 + (b - base) * sy])), [x0 + W, y0]];
  const stroke = (p, color, lw, alpha = 1) => {
    ctx.save(); ctx.globalAlpha *= alpha; ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.lineJoin = 'miter'; ctx.miterLimit = 5;
    ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.restore();
  };
  const clip = (x, y, w, h) => { ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); };
  const yAt = (p, x) => { const i = p.findIndex((q) => q[0] >= x); if (i <= 0) return y0; const [a, b] = [p[i - 1], p[i]]; return b[0] === a[0] ? b[1] : lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0])); };
  // ślad monitora do głowicy hx: przygaszony, najświeższy odcinek jaśnieje ku głowicy, głowica = mały kwadrat
  function trace(hx, alpha) {
    const p = pts(2 * u), tail = VERT ? 200 : 320;
    clip(x0 - LW, 0, hx - x0 + LW, H);
    stroke(p, th.ink, LW, 0.5 * alpha);
    clip(hx - tail, 0, tail, H);
    const g = ctx.createLinearGradient(hx - tail, 0, hx, 0);
    g.addColorStop(0, withAlpha(th.ink, 0)); g.addColorStop(1, th.ink);
    stroke(p, g, LW, alpha);
    ctx.restore(); ctx.restore();
    rect(hx - LW * 1.3, yAt(p, hx) - LW * 1.3, LW * 2.6, LW * 2.6, th.ink, alpha);
  }

  function monitor(lt) {
    const hf = x0 + v * tf;
    if (lt < tf) { trace(x0 + v * lt, 1); return; }
    const k = inOut(seg(lt, tf + 0.1, tf + 0.1 + MORPH));
    if (k >= 1) { mark(mx, my, s, 1); return; }
    // poza znakiem zamarznięty ślad gaśnie; w znaku rozjaśnia się do pełnej bieli, a linia (dorysowana do prawej
    // krawędzi) grubieje w kwadrat, w którym zostaje linia znaku
    const on = seg(k, 0, 0.3);
    clip(0, 0, mx, H); trace(hf, 1 - k); ctx.restore();
    clip(mx + s, 0, W, H); trace(hf, 1 - k); ctx.restore();
    clip(mx, 0, s, H); trace(hf, 1 - on); ctx.restore();
    const fill = lerp(Math.min(hf, mx + s), mx + s, k), sy = lerp(2 * u, u, k), lw = lerp(LW, 2 * u, k);
    const top = lerp(y0 - LW / 2, my, k), h = lerp(LW, s, k);
    clip(mx, 0, fill - mx, H); stroke(pts(sy), th.mark, lw, on); ctx.restore();
    rect(mx, top, fill - mx, h, th.mark, on);
    clip(mx, top, fill - mx, h); stroke(pts(sy), th.markLine, lw, seg(k, 0, 0.35)); ctx.restore();
  }

  return [
    { id: ids[0], d: tf + 0.1 + MORPH + 0.25, theme: 'blue', bare: true, noCap: true, src: '', group: ids[0],
      draw: monitor, drawV: monitor,
      // piki na uderzeniach; od zamarznięcia ciągły ton, który cichnie z wejściem lektora na planszy
      sound(d) {
        const c0 = IDX[ids[1]] != null ? T(ids[1]) - T(ids[0]) : d;
        return { piks: times, tones: [{ from: tf, to: c0 + 0.5, f: [700, 350], g: 0.06, in: 0.008, out: 0.6 }] };
      } },
    { id: ids[1], d: 2.6, theme: 'blue', bare: true, noCap: true, src: '', group: ids[0], vo: NAZWA_LEKTOR,
      draw: (lt) => card(lt + 0.25, 1), drawV: (lt) => card(lt + 0.25, 1) },
  ];
}
/** Kolor #RRGGBB z przezroczystością (gradienty śladu); inne zapisy bez zmian. */
function withAlpha(c, a) {
  const m = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(c);
  return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${a})` : c;
}
