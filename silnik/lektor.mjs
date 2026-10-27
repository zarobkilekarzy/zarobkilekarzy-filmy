#!/usr/bin/env node
// Lektor do filmu przez API ElevenLabs — po jednym klipie na zdanie z <film>/teksty.js.
// Klucz API: zmienna ELEVENLABS_API_KEY, potem plik .env projektu z filmami albo generatora (gitignored), na końcu
// pęk kluczy macOS (Keychain), wpis zl-elevenlabs. Skrypt klucza nie wypisuje.
//
//   node silnik/lektor.mjs filmy/<nazwa> plan     → klipy i liczba znaków, bez sieci
//   node silnik/lektor.mjs filmy/<nazwa> calosc   → brakujące klipy + <film>/lektor/<model>/<głos>-x<tempo>/lektor.json
//   potem: python3 -I silnik/lektor_przygotuj.py filmy/<nazwa>   → przycięte klipy + <film>/lektor.js
//
// Klip o tym samym tekście nagrywa się raz: przy kolejnych wersjach filmu skrypt dogrywa tylko nowe zdania
// (nowe pliki mają w nazwie skrót tekstu), a stare zostają — także dla zarchiwizowanych wersji.
//
// Głos: Piotr (biblioteka ElevenLabs, VOICE niżej — własny głos = inny identyfikator), Multilingual v2, tempo ×1,0 (wolniej = mniej ciszy między kwestiami),
// kontekst tylko poprzedniego klipu (z następnym model dogrywał na końcu szum).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { ROOT, PROJEKT } from './serwer.mjs';

const [filmArg, cmd] = process.argv.slice(2);
const HERE = path.resolve(filmArg ?? '.');
if (!fs.existsSync(path.join(HERE, 'teksty.js'))) { console.log('użycie: node silnik/lektor.mjs filmy/<nazwa> plan | calosc'); process.exit(1); }
const API = 'https://api.elevenlabs.io';
const VOICE = 'o2xdfKUpc1Bwq7RchZuW', MODEL = 'eleven_multilingual_v2', SPEED = 1.0, SEED = 1717;
const VOICE_SETTINGS = { stability: 0.55, similarity_boost: 0.75, style: 0, use_speaker_boost: true, speed: SPEED };

const win = {};
new Function('window', fs.readFileSync(path.join(HERE, 'teksty.js'), 'utf8'))(win);
const CLIPS = Object.entries(win.TEKSTY).flatMap(([shot, l]) => (Array.isArray(l) ? l : l ? [l] : []).map((text, part) => ({ shot, part, text })));

function key() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  for (const env of [path.join(PROJEKT, '.env'), path.join(ROOT, '.env')]) {
    if (!fs.existsSync(env)) continue;
    const m = fs.readFileSync(env, 'utf8').match(/^\s*ELEVENLABS_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m);
    if (m) return m[1].trim();
  }
  return execFileSync('security', ['find-generic-password', '-a', process.env.USER, '-s', 'zl-elevenlabs', '-w'], { encoding: 'utf8' }).trim();
}

async function api(pathname, init = {}) {
  const res = await fetch(API + pathname, { ...init, headers: { 'xi-api-key': key(), 'content-type': 'application/json', ...(init.headers ?? {}) } });
  if (!res.ok) throw new Error(`${pathname}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

if (cmd === 'plan') {
  CLIPS.forEach((c) => console.log(`${String(c.shot).padStart(2)}.${c.part}  ${String(c.text.length).padStart(3)} zn.  ${c.text}`));
  console.log(`razem ${CLIPS.reduce((n, c) => n + c.text.length, 0)} znaków (≈ tyle kredytów)`);
} else if (cmd === 'calosc') {
  const dir = path.join(HERE, 'lektor', MODEL, `${VOICE}-x${SPEED}`);
  fs.mkdirSync(dir, { recursive: true });
  const json = path.join(dir, 'lektor.json');
  const have = new Map((fs.existsSync(json) ? JSON.parse(fs.readFileSync(json, 'utf8')).clips : []).map((c) => [c.text, c]));
  const out = [];
  for (const [i, c] of CLIPS.entries()) {
    const old = have.get(c.text);
    if (old && fs.existsSync(path.join(dir, old.file))) { out.push({ ...c, file: old.file, align: old.align }); continue; }
    const body = { text: c.text, model_id: MODEL, voice_settings: VOICE_SETTINGS, seed: SEED, language_code: 'pl' };
    if (i > 0) body.previous_text = CLIPS[i - 1].text;
    const r = await api(`/v1/text-to-speech/${VOICE}/with-timestamps?output_format=mp3_44100_128`, { method: 'POST', body: JSON.stringify(body) });
    const file = `${c.shot}-${createHash('sha1').update(c.text).digest('hex').slice(0, 8)}.mp3`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(r.audio_base64, 'base64'));
    const a = r.alignment;
    out.push({ ...c, file, align: { chars: a.characters.join(''), t: a.character_start_times_seconds } });
    console.log(`nowy  ${c.shot}.${c.part}  ${a.character_end_times_seconds.at(-1).toFixed(2)} s  ${c.text}`);
  }
  fs.writeFileSync(path.join(dir, 'lektor.json'), JSON.stringify({ voice: VOICE, model: MODEL, settings: VOICE_SETTINGS, seed: SEED, clips: out }, null, 2));
  console.log(`→ ${path.relative(process.cwd(), dir)}`);
} else {
  console.log('użycie: plan | calosc');
}
