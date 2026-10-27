#!/usr/bin/env node
// Lista kontrolna filmu → <film>/kontrola.md (commitowana z każdą wersją). Część automatyczna liczy się od nowa,
// część ręczna (kontrola-reczna.md projektu albo silnik/kontrola-reczna.md) zachowuje odhaczone pola z poprzedniego kontrola.md.
//
//   node silnik/kontrola.mjs filmy/<nazwa>                          → źródła, liczby, czas czytania, strefy pionu, lektor
//   node silnik/kontrola.mjs filmy/<nazwa> --plik wynik/x.mp4 [--plik wynik/x-pion.mp4]   → + głośność, metadane, długość
//   node silnik/kontrola.mjs filmy/<nazwa> --siec                   → + czy linki źródeł odpowiadają
//
// Kod wyjścia 1, gdy są błędy (uwagi nie blokują).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { openFilm, filmDir, closeServer, ROOT, PROJEKT } from './przegladarka.mjs';

const argv = process.argv.slice(2);
const files = argv.flatMap((a, i) => (argv[i - 1] === '--plik' ? [path.resolve(a)] : []));
const { abs: DIR, rel: FILM_REL, archive } = filmDir(argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--plik'));
if (archive) { console.log('Film z archiwum ma własny kod — kontrola działa dla filmów na wspólnym silniku.'); process.exit(1); }
const NAME = path.basename(DIR);

const errors = [], notes = [], ok = [];
const err = (sec, s) => errors.push([sec, s]), note = (sec, s) => notes.push([sec, s]);

/* ---------- dane z silnika ---------- */
const h = await openFilm({ film: FILM_REL });
const FILM = await h.evaluate('window.FILM');
const SHOWN = await h.evaluate('typeof SHOWN === "undefined" ? {} : SHOWN');
const TEKSTY = await h.evaluate('window.TEKSTY');
const insEnd = await h.evaluate('inspect([0.999])');
h.close();
const v = await openFilm({ film: FILM_REL, v: true });
const insV = await v.evaluate('inspect([0.3, 0.6, 0.999])');
v.close(); closeServer();
const ZRODLA = JSON.parse(fs.readFileSync(path.join(DIR, 'zrodla.json'), 'utf8'));

/* ---------- 1. źródła ---------- */
const TYPY = new Set(['fakt', 'szacunek', 'model', 'doniesienia', 'prawo']);
for (const [k, z] of Object.entries(ZRODLA)) {
  if (!z.stopka) err('źródła', `„${k}”: brak stopki`);
  if (!TYPY.has(z.typ)) err('źródła', `„${k}”: typ „${z.typ ?? ''}” — dozwolone: ${[...TYPY].join(', ')}`);
  if (!z.linki?.length) err('źródła', `„${k}”: brak linku do źródła`);
  for (const l of z.linki ?? []) if (!/^https:\/\//.test(l.url ?? '')) err('źródła', `„${k}”: link „${l.url ?? ''}” nie jest adresem https`);
  if ((z.krotko ?? z.stopka ?? '').length > 70) note('źródła', `„${k}”: krótkie źródło w pionie ma ${z.krotko.length} znaków (2 linie ≈ 70)`);
  if (/example\.org/.test(JSON.stringify(z.linki ?? []))) err('źródła', `„${k}”: przykładowy link z szablonu`);
}
const used = new Set(FILM.shots.map((s) => s.src).filter(Boolean));
for (const s of FILM.shots) if (s.src && !ZRODLA[s.src] && !s.src.includes(' ')) err('źródła', `ujęcie „${s.id}”: klucz źródła „${s.src}” nie istnieje w zrodla.json`);
for (const s of FILM.shots) if (s.src && s.src.includes(' ')) note('źródła', `ujęcie „${s.id}”: źródło wpisane tekstem w film.js — przenieś do zrodla.json`);
for (const k of Object.keys(ZRODLA)) if (!used.has(k)) note('źródła', `„${k}” nie jest użyte w żadnym ujęciu`);

if (argv.includes('--siec')) {
  for (const [k, z] of Object.entries(ZRODLA)) for (const l of z.linki ?? []) {
    try {
      const r = await fetch(l.url, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'user-agent': 'Mozilla/5.0' } });
      if (r.status >= 400) err('źródła', `„${k}”: ${l.url} → HTTP ${r.status}`); else ok.push(`link „${k}” odpowiada (${r.status})`);
    } catch (e) { err('źródła', `„${k}”: ${l.url} → ${e.message}`); }
  }
}

/* ---------- 2. liczby: każda liczba w kadrze i w napisach lektora jest w `liczby` źródła ujęcia ---------- */
const NUM = /\d[\d \u00a0]*(?:[,.]\d+)?/g;
const norm = (s) => s.replace(/[ \u00a0]/g, '').replace(/[.,]$/, '');
const allowed = (src) => new Set((ZRODLA[src]?.liczby ?? []).flatMap((x) => [...String(x).matchAll(NUM)].map((m) => norm(m[0]))));
for (const s of insEnd) {
  const nums = new Set(s.texts.filter((t) => t.part === 'kadr').flatMap((t) => [...t.s.matchAll(NUM)].map((m) => norm(m[0]))));
  if (!nums.size) continue;
  if (!s.src) { err('liczby', `ujęcie „${s.id}”: liczby ${[...nums].join(', ')} bez źródła`); continue; }
  const a = allowed(s.src), miss = [...nums].filter((n) => !a.has(n));
  if (miss.length) err('liczby', `ujęcie „${s.id}”: ${miss.join(', ')} nie ma w liczby[] źródła „${s.src}”`);
}
const shotAt = (t) => FILM.shots.find((s) => t >= s.t0 && t < s.t1) ?? FILM.shots.at(-1);
for (const vo of FILM.voice) {
  const shown = SHOWN[vo.text];
  if (!shown) continue;
  const s = shotAt(vo.from), nums = [...shown.matchAll(NUM)].map((m) => norm(m[0]));
  const a = allowed(s.src), miss = nums.filter((n) => !a.has(n));
  if (miss.length) err('liczby', `napis „${shown}” (ujęcie „${s.id}”): ${miss.join(', ')} nie ma w liczby[] źródła`);
}
for (const [id, l] of Object.entries(TEKSTY)) for (const t of [l].flat()) if (/\d/.test(t)) err('lektor', `„${id}”: cyfry w tekście lektora („${t}”) — liczby słowami`);
for (const vo of FILM.voice) if (/\d/.test(vo.text) && !SHOWN[vo.text]) note('lektor', `„${vo.text}”: brak wpisu w SHOWN`);
const withNums = FILM.voice.filter((vo) => /(tysi|milion|miliard|procent|dziesi|naście|sto\b|set\b)/i.test(vo.text) && !SHOWN[vo.text]);
for (const vo of withNums) note('lektor', `„${vo.text}”: liczba słowami bez wpisu w SHOWN — napisy pokażą słowa zamiast cyfr`);
if (!FILM.voice.length) note('lektor', 'brak nagrania lektora (lektor.js) — długości ujęć to szacunek');

/* ---------- 3. czas na doczytanie kadru ---------- */
const READ_CPS = 15;
for (const s of insEnd) {
  const chars = s.texts.filter((t) => t.part === 'kadr').reduce((n, t) => n + t.s.length, 0);
  if (chars && chars / s.d > READ_CPS) note('czytanie', `ujęcie „${s.id}”: ${chars} znaków w ${s.d.toFixed(1)} s (${(chars / s.d).toFixed(1)} zn./s > ${READ_CPS}) — wydłuż hold albo skróć tekst`);
}

/* ---------- 4. pion: treść kadru w strefie bezpiecznej TikToka i Shorts ---------- */
// część wspólna obu serwisów: x 48–888 (Shorts: prawa kolumna 192), y 288–1248; przyciski TikToka: x > 900 od y 840
for (const s of insV) for (const t of s.texts.filter((x) => x.part === 'kadr')) {
  const bad = t.x0 < 48 - 1 || t.x1 > 888 + 1 || t.y0 < 288 - 1 || t.y1 > 1248 + 1 || (t.x1 > 900 && t.y1 > 840);
  if (bad) err('pion', `ujęcie „${s.id}”: „${t.s.slice(0, 40)}” wychodzi poza strefę (x ${t.x0.toFixed(0)}–${t.x1.toFixed(0)}, y ${t.y0.toFixed(0)}–${t.y1.toFixed(0)})`);
  if (t.size < 22) note('pion', `ujęcie „${s.id}”: „${t.s.slice(0, 40)}” ma ${t.size.toFixed(0)} px — na telefonie za drobne`);
}

/* ---------- 5. pliki wideo ---------- */
const LIMITS = [['X (bez Premium)', 140], ['YouTube Shorts', 180], ['TikTok', 600]];
const META_OK = new Set(['encoder', 'major_brand', 'minor_version', 'compatible_brands', 'handler_name', 'vendor_id', 'language']);
for (const f of files) {
  const name = path.relative(DIR, f);
  if (!fs.existsSync(f)) { err('plik', `${name}: nie ma pliku`); continue; }
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', f], { encoding: 'utf8' }));
  const tags = [probe.format.tags ?? {}, ...probe.streams.map((s) => s.tags ?? {})].flatMap((t) => Object.keys(t));
  const extra = [...new Set(tags.filter((k) => !META_OK.has(k)))];
  if (extra.length) err('plik', `${name}: metadane ${extra.join(', ')} — w pliku ma być tylko enkoder`); else ok.push(`${name}: metadane czyste`);
  const dur = Number(probe.format.duration), mib = Number(probe.format.size) / 2 ** 20;
  const over = LIMITS.filter(([, l]) => dur > l).map(([n, l]) => `${n} ${l} s`);
  note('plik', `${name}: ${dur.toFixed(1)} s, ${mib.toFixed(1)} MiB${over.length ? ` — dłuższy niż: ${over.join(', ')}` : ''}`);
  const r = spawnSync('ffmpeg', ['-nostats', '-hide_banner', '-i', f, '-map', '0:a', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const I = Number(/I:\s+(-?[\d.]+) LUFS/.exec(r.stderr.split('Summary:').at(-1))?.[1]);
  const TP = Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(r.stderr.split('Summary:').at(-1))?.[1]);
  if (Number.isNaN(I)) err('plik', `${name}: brak ścieżki dźwięku`);
  else {
    if (Math.abs(I + 16) > 1) err('plik', `${name}: głośność ${I} LUFS (cel −16 ±1)`); else ok.push(`${name}: głośność ${I} LUFS`);
    if (TP > -1) err('plik', `${name}: szczyt ${TP} dBTP (najwyżej −1)`); else ok.push(`${name}: szczyt ${TP} dBTP`);
  }
}

/* ---------- raport ---------- */
const version = (() => { try { return execFileSync('git', ['-C', DIR, 'describe', '--tags', '--match', `${NAME}/*`, '--dirty', '--always'], { encoding: 'utf8' }).trim(); } catch { return '—'; } })();
const out = path.join(DIR, 'kontrola.md');
const prev = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
// część ręczna: kontrola-reczna.md projektu z filmami (własne zasady redakcyjne), inaczej ogólna z silnika
const manualFile = [path.join(PROJEKT, 'kontrola-reczna.md'), path.join(ROOT, 'silnik', 'kontrola-reczna.md')].find((f) => fs.existsSync(f));
const manual = fs.readFileSync(manualFile, 'utf8').trim().split('\n').map((l) => {
  const item = l.replace(/^- \[ \] /, '');
  const old = [...prev.matchAll(/^- \[x\] (.+)$/gm)].find((m) => m[1].startsWith(item));
  return old ? `- [x] ${old[1]}` : l;
}).join('\n');
const list = (xs) => xs.map(([sec, s]) => `- **${sec}**: ${s}`).join('\n') || '- brak';
const md = `# Kontrola: ${NAME}

Wersja: \`${version}\` · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} · ${files.length ? `pliki: ${files.map((f) => path.relative(DIR, f)).join(', ')}` : 'bez plików wideo'}

**${errors.length ? `${errors.length} błędów` : 'bez błędów'}, ${notes.length} uwag.** Część automatyczna: \`node ${path.relative(PROJEKT, path.join(ROOT, 'silnik', 'kontrola.mjs'))} ${FILM_REL}\`.

## Błędy (blokują publikację)
${list(errors)}

## Uwagi
${list(notes)}

## Sprawdzone automatycznie
- źródła: ${Object.keys(ZRODLA).length} wpisów w zrodla.json, ${used.size} użytych w ujęciach
- liczby w kadrach (koniec każdego ujęcia) i w napisach lektora porównane z \`liczby\` źródeł
- czas czytania: ≤ ${READ_CPS} znaków na sekundę ujęcia
- pion: treść kadrów w strefie x 48–888, y 288–1248 (TikTok i Shorts)
${ok.map((s) => `- ${s}`).join('\n')}

## Do odhaczenia ręcznie (zostaje między uruchomieniami; dopisz po myślniku, kto i kiedy)
${manual}
`;
fs.writeFileSync(out, md);
console.log(`${path.relative(process.cwd(), out)} · ${errors.length} błędów, ${notes.length} uwag`);
errors.forEach(([s, e]) => console.log(`  błąd ${s}: ${e}`));
process.exit(errors.length ? 1 : 0);
