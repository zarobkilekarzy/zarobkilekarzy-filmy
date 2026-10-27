#!/usr/bin/env node
// Napisy do filmu: SRT i WebVTT w trzech językach z jednego zapisu czasu mowy (FILM.voice z silnika —
// wyrównanie lektora ElevenLabs). Polski = kwestie lektora z liczbami cyframi (SHOWN w film.js),
// angielski i czeski = <film>/napisy/{en,cs}.json (polska kwestia → tłumaczenie).
//
//   node silnik/napisy.mjs filmy/<nazwa>            → <film>/wynik/napisy/<nazwa>.{pl,en,cs}.{srt,vtt}
//   node silnik/napisy.mjs filmy/<nazwa> --brakujace → szkielet brakujących tłumaczeń (do wklejenia w napisy/*.json)
//
// Gdzie: YouTube (SRT lub VTT, każdy język osobno), X (SRT — „Upload caption file” pod filmem), strona (VTT jako
// <track kind="captions">), Facebook/LinkedIn (SRT). TikTok i Shorts mają napisy rysowane w kadrze przez silnik.
// Kwoty w tłumaczeniach: {≈EUR:123000} albo {≈CZK:123000} — przeliczenie po średnim kursie NBP (tabela A) z dnia
// generowania, zaokrąglone w dół do trzech cyfr znaczących.
import fs from 'node:fs';
import path from 'node:path';
import { openFilm, filmDir, closeServer } from './przegladarka.mjs';

const LANGS = ['pl', 'en', 'cs'];
const MAX_LINE = 42, MAX_LINES = 2, MAX_CPS = 17, MIN_DUR = 1.0, TAIL = 0.6;

const argv = process.argv.slice(2);
const { abs: DIR, rel: FILM_REL, archive } = filmDir(argv.find((a) => !a.startsWith('--')));
const NAME = path.basename(DIR);

const page = await openFilm({ film: FILM_REL, archive });
const FILM = await page.evaluate('window.FILM');
const SHOWN = await page.evaluate('typeof SHOWN === "undefined" ? {} : SHOWN');
// nazwa marki czytana przez lektora (plansza końcówki): w każdym języku ten sam zapis nazwy, bez tłumaczenia
const BRAND = await page.evaluate('typeof NAZWA_LEKTOR === "undefined" || !NAZWA_LEKTOR ? null : [NAZWA_LEKTOR, NAZWA + NAZWA_PRZYROSTEK]');
const brand = (t) => (BRAND && t === BRAND[0] ? BRAND[1] : undefined);
page.close(); closeServer();
if (!FILM.voice.length) { console.log('Film nie ma nagrania lektora (lektor.js) — napisy liczy się z czasów mowy.'); process.exit(1); }

const tr = Object.fromEntries(LANGS.slice(1).map((l) => {
  const f = path.join(DIR, 'napisy', `${l}.json`);
  return [l, fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null];
}));

if (argv.includes('--brakujace')) {
  for (const l of LANGS.slice(1)) {
    const miss = FILM.voice.map((v) => v.text).filter((t) => !tr[l]?.[t] && !brand(t));
    console.log(`\n${l}: ${miss.length} brakujących`);
    if (miss.length) console.log(JSON.stringify(Object.fromEntries(miss.map((t) => [t, ''])), null, 2));
  }
  process.exit(0);
}

/* ---------- kwoty w obcej walucie: kurs NBP ---------- */
const rates = {};
async function rate(code) {
  if (rates[code]) return rates[code];
  const r = await fetch(`https://api.nbp.pl/api/exchangerates/rates/a/${code.toLowerCase()}/?format=json`);
  if (!r.ok) throw new Error(`NBP ${code}: HTTP ${r.status}`);
  const j = await r.json();
  return (rates[code] = { mid: j.rates[0].mid, date: j.rates[0].effectiveDate });
}
const floor3 = (x) => { const p = 10 ** Math.max(0, Math.floor(Math.log10(x)) - 2); return Math.floor(x / p) * p; };
const group = (n, sep) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
async function money(text, lang) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(/\{≈(EUR|CZK):(\d+)\}/g)) {
    const { mid } = await rate(m[1]);
    const v = group(floor3(Number(m[2]) / mid), lang === 'en' ? ',' : ' ');
    const s = lang === 'en' ? (m[1] === 'EUR' ? `≈ €${v}` : `≈ CZK ${v}`) : `≈ ${v} ${m[1] === 'EUR' ? '€' : 'Kč'}`;
    out.push(text.slice(last, m.index), s);
    last = m.index + m[0].length;
  }
  return out.join('') + text.slice(last);
}

/* ---------- typografia napisu ---------- */
// spacje niełamiące: grupy cyfr, liczba + jednostka, jednoliterowe spójniki i przyimki na końcu linii (pl, cs)
function bind(s, lang) {
  s = s.replace(/(\d) (?=\d{3}\b)/g, '$1 ').replace(/(\d) (?=(zł|mln|mld|tys\.|h|%|€|Kč|PLN|CZK|EUR)(?![\p{L}]))/gu, '$1 ');
  if (lang !== 'en') s = s.replace(/(^|[\s ])([aiouwzkvsAIOUWZKVS]) /g, '$1$2 ');
  return s;
}
const len = (s) => [...s].length;
/** Dzieli tekst na kawałki ≤ MAX_LINE × MAX_LINES, najchętniej po zdaniu, potem po przecinku, potem po słowie. */
function chunks(s) {
  if (len(s) <= MAX_LINE * MAX_LINES) return [s];
  const cap = MAX_LINE * MAX_LINES;
  for (const re of [/(?<=[.!?…])\s+/g, /(?<=[,;:–])\s+/g, / /g]) {
    const parts = s.split(re);
    if (parts.length < 2) continue;
    const res = [];
    let cur = '';
    for (const p of parts) {
      const next = cur ? `${cur} ${p}` : p;
      if (cur && len(next) > cap) { res.push(cur); cur = p; } else cur = next;
    }
    res.push(cur);
    if (res.every((c) => len(c) <= cap)) return res;
    return res.flatMap((c) => chunks(c));
  }
  return [s];
}
/** Łamie napis na najwyżej dwie linie, możliwie równe. */
function lines(s) {
  if (len(s) <= MAX_LINE) return [s];
  let best = null;
  for (let i = s.indexOf(' '); i > 0; i = s.indexOf(' ', i + 1)) {
    const a = s.slice(0, i), b = s.slice(i + 1);
    // krótki przyimek albo spójnik na końcu pierwszej linii („za”, „na”, „do”) czyta się gorzej niż nierówne linie
    const score = Math.max(len(a), len(b)) + (len(a) > MAX_LINE || len(b) > MAX_LINE ? 1000 : 0) + (/(^|\s)\p{L}{1,2}$/u.test(a) ? 8 : 0);
    if (!best || score < best.score) best = { score, l: [a, b] };
  }
  return best ? best.l : [s];
}

/* ---------- napisy jednego języka ---------- */
async function cues(lang) {
  const out = [], warn = [], missing = [];
  for (const [i, v] of FILM.voice.entries()) {
    let text = lang === 'pl' ? (SHOWN[v.text] ?? v.text) : tr[lang]?.[v.text] ?? brand(v.text);
    if (!text) { missing.push(v.text); continue; }
    text = bind(await money(text, lang), lang);
    const next = FILM.voice[i + 1]?.from ?? FILM.dur;
    const end = Math.min(v.to + TAIL, next - 0.04);
    const parts = chunks(text), total = parts.reduce((n, p) => n + len(p), 0);
    let t = v.from;
    for (const p of parts) {
      const d = ((v.to - v.from) * len(p)) / total;
      const from = t, to = p === parts.at(-1) ? Math.max(end, Math.min(from + MIN_DUR, next - 0.04)) : t + d;
      t += d;
      const cps = len(p) / (to - from);
      if (cps > MAX_CPS) warn.push(`${cps.toFixed(1)} zn./s  ${p}`);
      out.push({ from, to, lines: lines(p) });
    }
  }
  return { out, warn, missing };
}

const ts = (t, sep) => {
  const ms = Math.round(t * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`;
};
const srt = (c) => c.map((x, i) => `${i + 1}\n${ts(x.from, ',')} --> ${ts(x.to, ',')}\n${x.lines.join('\n')}\n`).join('\n');
const vtt = (c, lang) => `WEBVTT\nLanguage: ${lang}\n\n${c.map((x) => `${ts(x.from, '.')} --> ${ts(x.to, '.')}\n${x.lines.join('\n')}\n`).join('\n')}`;

const OUT = path.join(DIR, 'wynik', 'napisy');
fs.mkdirSync(OUT, { recursive: true });
let problems = 0;
for (const lang of LANGS) {
  if (lang !== 'pl' && !tr[lang]) { console.log(`${lang}: brak ${path.relative(process.cwd(), path.join(DIR, 'napisy', `${lang}.json`))} — pomijam`); continue; }
  const { out, warn, missing } = await cues(lang);
  if (missing.length) { problems++; console.log(`${lang}: brak tłumaczenia ${missing.length} kwestii (--brakujace pokaże szkielet)`); continue; }
  fs.writeFileSync(path.join(OUT, `${NAME}.${lang}.srt`), srt(out));
  fs.writeFileSync(path.join(OUT, `${NAME}.${lang}.vtt`), vtt(out, lang));
  console.log(`${lang}: ${out.length} napisów → ${path.relative(process.cwd(), OUT)}/${NAME}.${lang}.{srt,vtt}`);
  warn.forEach((w) => console.log(`  uwaga, szybko: ${w}`));
}
for (const [code, r] of Object.entries(rates)) console.log(`kurs NBP ${code}: ${r.mid} zł (${r.date})`);
process.exit(problems ? 1 : 0);
