#!/usr/bin/env node
// Nowy film z szablonu: node narzedzia/nowy.mjs <nazwa>  → filmy/<nazwa>/ (bez wynik/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
if (!/^[a-z0-9-]+$/.test(name ?? '')) { console.log('użycie: node narzedzia/nowy.mjs <nazwa> (małe litery, cyfry, myślniki)'); process.exit(1); }
const dst = path.join(ROOT, 'filmy', name);
if (fs.existsSync(dst)) { console.log(`filmy/${name} już istnieje`); process.exit(1); }
fs.cpSync(path.join(ROOT, 'szablon'), dst, { recursive: true, filter: (s) => !s.includes(`${path.sep}wynik`) && !s.endsWith('kontrola.md') });
console.log(`filmy/${name}/ — zacznij od scenariusz.md; podgląd: npm run serwer → /silnik/?film=filmy/${name}`);
