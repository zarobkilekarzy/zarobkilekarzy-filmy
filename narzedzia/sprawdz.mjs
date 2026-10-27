#!/usr/bin/env node
// Czy to stanowisko ma wszystko do pracy nad filmami (bez wypisywania sekretów).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, PROJEKT, CHROME } from '../silnik/przegladarka.mjs';

const has = (cmd, args = ['-version']) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n')[0]; } catch { return null; } };
const key = (() => {
  if (process.env.ELEVENLABS_API_KEY) return 'zmienna środowiskowa';
  for (const dir of new Set([PROJEKT, ROOT])) {
    const env = path.join(dir, '.env');
    if (fs.existsSync(env) && /^\s*ELEVENLABS_API_KEY\s*=/m.test(fs.readFileSync(env, 'utf8'))) return path.relative(process.cwd(), env) || '.env';
  }
  try { execFileSync('security', ['find-generic-password', '-a', process.env.USER, '-s', 'zl-elevenlabs'], { stdio: 'ignore' }); return 'Keychain (zl-elevenlabs)'; } catch { return null; }
})();
const rows = [
  ['Node ≥ 22.4 (fetch, WebSocket)', Number(process.versions.node.split('.')[0]) > 22 || (process.versions.node.startsWith('22.') && Number(process.versions.node.split('.')[1]) >= 4) ? process.version : null],
  ['ffmpeg', has('ffmpeg')], ['ffprobe', has('ffprobe')], ['python3 (lektor_przygotuj.py)', has('python3', ['--version'])],
  ['Chromium albo Chrome bez okna (zmienna CHROME)', fs.existsSync(CHROME) || has(CHROME, ['--version']) ? CHROME : null],
  ['node_modules (npm install)', fs.existsSync(path.join(ROOT, 'node_modules/mediabunny')) ? 'jest' : null],
  ['klucz ElevenLabs (tylko do nagrań lektora)', key],
];
let bad = 0;
for (const [n, v] of rows) { console.log(`${v ? '✓' : '✗'} ${n}${v ? ` — ${v}` : ''}`); if (!v && !n.startsWith('klucz')) bad++; }
console.log(`  filmy z: ${PROJEKT}${PROJEKT === ROOT ? ' (generator)' : ''}`);
process.exit(bad ? 1 : 0);
