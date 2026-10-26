#!/usr/bin/env node
// Czy to stanowisko ma wszystko do pracy nad filmami (bez wypisywania sekretów).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME ?? '/Applications/Chromium.app/Contents/MacOS/Chromium';
const has = (cmd, args = ['-version']) => { try { return execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n')[0]; } catch { return null; } };
const key = (() => {
  if (process.env.ELEVENLABS_API_KEY) return 'zmienna środowiskowa';
  if (fs.existsSync(path.join(ROOT, '.env')) && /^\s*ELEVENLABS_API_KEY\s*=/m.test(fs.readFileSync(path.join(ROOT, '.env'), 'utf8'))) return '.env';
  try { execFileSync('security', ['find-generic-password', '-a', process.env.USER, '-s', 'zl-elevenlabs'], { stdio: 'ignore' }); return 'Keychain (zl-elevenlabs)'; } catch { return null; }
})();
const rows = [
  ['Node ≥ 22.4 (fetch, WebSocket)', Number(process.versions.node.split('.')[0]) > 22 || (process.versions.node.startsWith('22.') && Number(process.versions.node.split('.')[1]) >= 4) ? process.version : null],
  ['ffmpeg', has('ffmpeg')], ['ffprobe', has('ffprobe')], ['python3 (lektor_przygotuj.py)', has('python3', ['--version'])],
  ['Chromium bez okna', fs.existsSync(CHROME) ? CHROME : null],
  ['submoduł marki (marka/)', fs.existsSync(path.join(ROOT, 'marka/marka/kolory.mjs')) ? 'jest' : null],
  ['node_modules (npm install)', fs.existsSync(path.join(ROOT, 'node_modules/mediabunny')) ? 'jest' : null],
  ['klucz ElevenLabs (tylko do nagrań)', key],
];
let bad = 0;
for (const [n, v] of rows) { console.log(`${v ? '✓' : '✗'} ${n}${v ? ` — ${v}` : ''}`); if (!v) bad++; }
if (!fs.existsSync(path.join(ROOT, 'marka/marka/kolory.mjs'))) console.log('  → git submodule update --init');
process.exit(bad ? 1 : 0);
