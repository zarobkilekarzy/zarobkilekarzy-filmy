#!/usr/bin/env node
// Ujęcia filmu z czasami (po nagraniu lektora) i otwarte uwagi z odtwarzacza w czasie filmu — do klatek kontrolnych.
//
//   node narzedzia/ujecia.mjs filmy/<nazwa>          → tabela ujęć, uwagi, gotowe --stills
//   node narzedzia/ujecia.mjs filmy/<nazwa> --json   → to samo jako JSON (dla agentów i skryptów)
import fs from 'node:fs';
import path from 'node:path';
import { openFilm, filmDir, closeServer } from '../silnik/przegladarka.mjs';

const argv = process.argv.slice(2);
const { abs: DIR, rel: FILM_REL, archive } = filmDir(argv.find((a) => !a.startsWith('--')));
if (archive) { console.log('Film z archiwum ma własny kod — ujęcia czyta tylko film na wspólnym silniku.'); process.exit(1); }

const h = await openFilm({ film: FILM_REL });
const FILM = await h.evaluate('window.FILM');
const nagranie = await h.evaluate('!!window.LEKTOR');
h.close(); closeServer();

const r2 = (x) => Math.round(x * 100) / 100;
// klatki kontrolne ujęcia: połowa (ruch) i koniec (pełny kadr, 0,05 s przed cięciem)
const shots = FILM.shots.map((s) => ({ ...s, d: r2(s.t1 - s.t0), klatki: [r2((s.t0 + s.t1) / 2), r2(s.t1 - 0.05)] }));
const uwagiFile = path.join(DIR, 'uwagi.json');
const uwagi = (fs.existsSync(uwagiFile) ? JSON.parse(fs.readFileSync(uwagiFile, 'utf8')) : [])
  .filter((u) => u.stan !== 'zrobiona')
  .map((u) => {
    const s = shots.find((x) => x.id === u.ujecie);
    return { ...u, od_filmu: s ? r2(s.t0 + u.od) : null, do_filmu: s ? r2(s.t0 + u.do) : null, klatka: s ? r2(s.t0 + (u.od + u.do) / 2) : null };
  });
const out = { film: FILM_REL, dur: r2(FILM.dur), lektor: nagranie ? 'nagranie' : 'szacunek (brak lektor.js)', ujecia: shots, uwagi,
  stills: [0, ...shots.map((s) => s.klatki[1])].join(',') };

if (argv.includes('--json')) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }

const pad = (s, n) => String(s).padEnd(n);
console.log(`${FILM_REL} · ${out.dur.toFixed(2)} s · lektor: ${out.lektor}\n`);
console.log(`${pad('n', 3)}${pad('id', 16)}${pad('od', 8)}${pad('do', 8)}${pad('motyw', 9)}${pad('źródło', 14)}klatki`);
for (const s of shots) console.log(`${pad(s.n, 3)}${pad(s.id, 16)}${pad(s.t0.toFixed(2), 8)}${pad(s.t1.toFixed(2), 8)}${pad(s.theme, 9)}${pad(s.src || '—', 14)}${s.klatki.join(', ')}`);
console.log(`\nwszystkie ujęcia (okładka + pełny kadr każdego): --stills ${out.stills}`);
if (!uwagi.length) { console.log('otwartych uwag: brak'); process.exit(0); }
console.log(`\notwarte uwagi (${uwagi.length}):`);
for (const u of uwagi) {
  const pin = u.pinezka ? ` · pinezka ${u.pinezka.format} x ${u.pinezka.x} y ${u.pinezka.y}` : '';
  console.log(`- [${u.id}] ${u.rodzaj} · „${u.ujecie}” ${u.od_filmu ?? '?'}–${u.do_filmu ?? '?'} s${pin} → --stills ${u.klatka ?? '?'}${u.pinezka?.format === 'pion' ? ' --vert' : ''}\n  ${u.tekst}`);
}
