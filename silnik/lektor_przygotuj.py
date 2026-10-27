#!/usr/bin/env python3
"""Przygotowanie klipów lektora do filmu: przycięcie ogonów i <film>/lektor.js.

  python3 -I silnik/lektor_przygotuj.py filmy/<nazwa> [<katalog z lektor.json>]

Bez drugiego argumentu: najnowszy lektor.json w <film>/lektor/.

Ogon: model potrafi po pauzie na końcu dograć ułamek sekundy szumu. Jeśli po ostatniej pauzie
(≥ 0,1 s ciszy) zostaje mniej niż 0,4 s dźwięku, tniemy na początku tej pauzy (+50 ms) z wyciszeniem
50 ms. Wynik: NN-k.wav obok NN-k.mp3; `speech` = długość mowy po przycięciu. Wyrównanie znaków
(`align`) zostaje — film.js liczy z niego, kiedy lektor dochodzi do danej frazy.
"""
import json, os, re, subprocess, sys
from pathlib import Path

FILM = Path(sys.argv[1]).resolve()
D = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else max((FILM / 'lektor').rglob('lektor.json'), key=lambda p: p.stat().st_mtime).parent
L = json.loads((D / 'lektor.json').read_text())


def duration(f):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(f)],
                                capture_output=True, text=True, check=True).stdout)


def silences(f, noise='-45dB', d=0.1):
    r = subprocess.run(['ffmpeg', '-nostdin', '-hide_banner', '-i', str(f), '-af', f'silencedetect=noise={noise}:d={d}', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r'silence_start: ([\d.]+)', r)]
    en = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', r)]
    return list(zip(st, en + [None] * (len(st) - len(en))))


for c in L['clips']:
    src = D / c['file']
    total = duration(src)
    sil = [(a, b if b is not None else total) for a, b in silences(src)]
    start = sil[0][1] if sil and sil[0][0] < 0.02 else 0.0
    end = total
    tail = [s for s in sil if s[0] > start + 0.3]
    if tail:
        a, b = tail[-1]
        if total - b < 0.4:
            end = min(total, a + 0.05)
    wav = src.with_suffix('.wav')
    fade = max(0.0, end - 0.05)
    subprocess.run(['ffmpeg', '-nostdin', '-y', '-loglevel', 'error', '-i', str(src), '-af',
                    f'atrim=0:{end:.3f},afade=t=out:st={fade:.3f}:d=0.05', '-ar', '48000', '-ac', '1', str(wav)], check=True)
    c.update(wav=wav.name, start=round(start, 3), end=round(end, 3), speech=round(end - start, 3))
    print(f"{c['shot']:2}.{c['part']}  mowa {c['speech']:5.2f} s  ucięty ogon {total - end:4.2f} s  {c['text']}")

(D / 'lektor.json').write_text(json.dumps(L, ensure_ascii=False, indent=2))
rel = D.relative_to(FILM).as_posix()          # względem katalogu filmu — film można przenieść
js = {'dir': f'{rel}/', 'voice': L['voice'], 'speed': L['settings']['speed'],
      'clips': [{k: c[k] for k in ('shot', 'part', 'text', 'wav', 'start', 'end', 'speech', 'align')} for c in L['clips']]}
(FILM / 'lektor.js').write_text(
    f"// Lektor (ElevenLabs, tempo ×{L['settings']['speed']}) — wygenerowane przez lektor_przygotuj.py z {rel}/lektor.json\n"
    f"window.LEKTOR = {json.dumps(js, ensure_ascii=False)};\n")
print(f"razem mowy {sum(c['speech'] for c in L['clips']):.1f} s → {os.path.relpath(FILM / 'lektor.js')}")
