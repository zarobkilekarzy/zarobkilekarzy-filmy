#!/usr/bin/env node
// Pliki filmu na stronę zarobkilekarzy.pl z mastera 16:9: MP4 do 25 MiB (limit pliku statycznego Workera), HLS
// (Safari na iPhonie potrzebuje Range przy MP4, a Worker go nie obsługuje — HLS to obchodzi), okładka WebP
// (pierwsza klatka) i napisy VTT do <track>. Bez metadanych poza enkoderem.
//
//   node silnik/strona.mjs filmy/<nazwa> --master filmy/<nazwa>/wynik/<plik>.mp4 [--nazwa <slug>]
//        → <film>/wynik/strona/<slug>/{<slug>.mp4, <slug>.webp, hls/, <slug>.<język>.vtt}
//   … --do ../zarobkilekarzy.pl   → kopia do public/film/<slug>/ w repo strony (tylko na wyraźne polecenie;
//        dalej jak przy każdej zmianie strony: podgląd, commit i push dopiero po „wypchnij”)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { filmDir } from './przegladarka.mjs';

const argv = process.argv.slice(2);
const arg = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const { abs: DIR } = filmDir(argv.find((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--')));
const master = arg('--master') && path.resolve(arg('--master'));
if (!master || !fs.existsSync(master)) { console.log('podaj --master <plik mp4 16:9>'); process.exit(1); }
const slug = arg('--nazwa') ?? path.basename(DIR);
const out = path.join(DIR, 'wynik', 'strona', slug);
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'hls'), { recursive: true });
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });
const LIMIT = 25 * 2 ** 20;

// 30 kl./s, klatka kluczowa co 2 s (równe kawałki HLS); crf rośnie, aż plik zmieści się w limicie
const mp4 = path.join(out, `${slug}.mp4`);
let crf = 22;
for (;; crf += 2) {
  ff('-i', master, '-map_metadata', '-1', '-vf', 'fps=30', '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
    '-crf', String(crf), '-preset', 'slow', '-g', '60', '-keyint_min', '60', '-sc_threshold', '0',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', mp4);
  if (fs.statSync(mp4).size <= LIMIT || crf >= 30) break;
}
const mib = fs.statSync(mp4).size / 2 ** 20;
ff('-i', mp4, '-map_metadata', '-1', '-c', 'copy', '-f', 'hls', '-hls_time', '4', '-hls_playlist_type', 'vod', '-hls_segment_type', 'fmp4',
  '-hls_fmp4_init_filename', 'init.mp4', '-hls_segment_filename', path.join(out, 'hls', 'seg-%02d.m4s'), path.join(out, 'hls', `${slug}.m3u8`));
const png = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', master, '-frames:v', '1', '-f', 'image2pipe', '-c:v', 'png', '-'], { maxBuffer: 64 * 2 ** 20 });
await sharp(png).webp({ quality: 82 }).toFile(path.join(out, `${slug}.webp`));
const subs = path.join(DIR, 'wynik', 'napisy');
const vtts = fs.existsSync(subs) ? fs.readdirSync(subs).filter((f) => f.endsWith('.vtt')) : [];
for (const f of vtts) fs.copyFileSync(path.join(subs, f), path.join(out, f.replace(/^[^.]+/, slug)));
console.log(`${path.relative(process.cwd(), out)}/ · MP4 ${mib.toFixed(1)} MiB (crf ${crf})${mib * 2 ** 20 > LIMIT ? ' — PONAD 25 MiB' : ''} · HLS · okładka · ${vtts.length} VTT`);

if (arg('--do')) {
  const site = path.resolve(arg('--do'));
  if (!fs.existsSync(path.join(site, 'astro.config.mjs'))) { console.log(`${site}: to nie jest repo strony`); process.exit(1); }
  const dst = path.join(site, 'public', 'film', slug);
  fs.cpSync(out, dst, { recursive: true });
  console.log(`→ ${dst} (niezacommitowane; FilmData w src/data/film.ts uzupełnia się ręcznie)`);
}
