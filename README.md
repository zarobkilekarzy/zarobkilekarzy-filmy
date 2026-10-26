# zarobkilekarzy.pl — filmy

Repozytorium prywatne. Silnik filmów, szablon, scenariusze, napisy i generatory. Każdy film powstaje
w **dwóch wersjach z jednego kodu**: 16:9 (X, strona) i pion 9:16 (TikTok, YouTube Shorts).
**Pliki wideo nie trafiają do repo** — leżą lokalnie w `wynik/` i odtwarza je eksport z kodu danej wersji.

```sh
git clone --recurse-submodules https://github.com/zarobkilekarzy/zarobkilekarzy-filmy.git
npm install
npm run sprawdz                         # Node, ffmpeg, Chromium, submoduł marki, klucz lektora
npm run nowy -- <nazwa>                 # filmy/<nazwa>/ z szablonu
npm run serwer                          # http://127.0.0.1:4471/silnik/?film=filmy/<nazwa>  (?v=1 pion, ?sz=1 strefy)
```

## Struktura

| Katalog | Co |
| --- | --- |
| `silnik/` | Wspólny kod wszystkich filmów: typografia i ruch (`silnik.js`), czas ujęć, render i podgląd (`silnik-start.js`), ładowanie filmu (`start.mjs`), eksport, lektor, napisy, kontrola, pliki na stronę. Fonty strony w `silnik/fonty/`. |
| `marka/` | Submoduł [zarobkilekarzy-branding](https://github.com/zarobkilekarzy/zarobkilekarzy-branding): kolory i znak „Puls” (silnik czyta je przez `silnik/marka.mjs`), fonty TTF dla generatorów. Przypięty do commita — stary film renderuje się z tą marką, z którą powstał. |
| `szablon/` | Wzór filmu: `film.js` (ujęcia `draw` + `drawV`), `teksty.js`, `zrodla.json`, `napisy/{en,cs}.json`, `scenariusz.md`, `wersje.md`. |
| `filmy/<nazwa>/` | Filmy na wspólnym silniku — tylko treść. |
| `scenariusze/` | Pomysły i scenariusze filmów, których jeszcze nie ma. |
| `odtwarzacz/` | Odtwarzacz montażowy: oś czasu z ujęciami i falą dźwięku, zaznaczanie fragmentów z uwagami, przesuwanie znaczników. |
| `generatory/` | `promo/` (promo profilu „kardiomonitor”), `publikacja/` (miniatury, teksty i napisy do serwisów, strona z podglądem). |
| `archiwum/` | Filmy sprzed wydzielenia silnika, każdy z własnym kodem (`proto/`, `eksport.mjs`) — opis w `archiwum/README.md`. |
| `narzedzia/` | `nowy.mjs`, `sprawdz.mjs`. |

## Film: pliki

| Plik | Co |
| --- | --- |
| `film.js` | Treść: `SHOWN` (napisy cyframi), `ZNACZNIKI`, `SHOTS` (`draw` 16:9, `drawV` pion, `src` = klucz źródła), `sound()`. |
| `teksty.js` | Kwestie lektora pod `id` ujęcia; liczby słowami, pełne zdania. Tablica = osobne klipy z pauzą. |
| `lektor.js`, `lektor/` | Nagranie ElevenLabs z wyrównaniem znaków (w repo — nagrania kosztują kredyty i drugi raz nie wyjdą tak samo). |
| `zrodla.json` | Klucz → `stopka` (16:9), `krotko` (pion), `typ` (fakt, szacunek, model, doniesienia, prawo), `liczby`, `linki`. Jedno źródło dla kadrów, napisów ze źródłami na stronę i kontroli liczb. |
| `znaczniki.json` | Poprawki nazwanych znaczników z odtwarzacza (`{ nazwa: sekundy }`). |
| `uwagi.json` | Uwagi z odtwarzacza (fragment ujęcia, treść, rodzaj, stan). |
| `napisy/en.json`, `napisy/cs.json` | Tłumaczenia kwestii (polska kwestia → tekst). Kwoty: `{≈EUR:123000}`, `{≈CZK:123000}`. |
| `scenariusz.md`, `wersje.md`, `kontrola.md` | Scenariusz i decyzje, historia wersji, lista kontrolna ostatniej wersji. |
| `wynik/` | **Poza gitem**: MP4, klatki, napisy, pliki na stronę. |

## Nazwane znaczniki

Pomysł z Motion Canvas („time events”). W `film.js`:

```js
const ZNACZNIKI = { kwota: { ujecie: 'liczba', fraza: 'sto', przesun: -0.1 } };
// w ujęciu: const c = Z('kwota');   → chwila od cięcia, w której lektor mówi „sto”, minus 0,1 s
```

Odtwarzacz pokazuje znaczniki na osi; przesunięcie myszką zapisuje się w `znaczniki.json` jako poprawka względem
frazy, więc znacznik zostaje na miejscu także po nowym nagraniu lektora.

## Proces (kolejność ustalona z userem)

1. **Scenariusz** (`scenariusz.md`) — akceptacja przed kodem.
2. **Prototyp 16:9** bez lektora (przycisk „lektor (syntezator)” = mowa systemu, tylko do wyczucia tempa).
3. **Szkic pionu**: 3–4 kadry (`--vert --stills`), pytanie „podoba się?”, dopiero potem reszta.
4. **Lektor**: `npm run lektor -- filmy/<nazwa> plan` → `calosc` → `python3 -I silnik/lektor_przygotuj.py filmy/<nazwa>`.
   Głos „Piotr” (`o2xdfKUpc1Bwq7RchZuW`), Multilingual v2; klucz w `.env` (`ELEVENLABS_API_KEY`) albo w Keychain (`zl-elevenlabs`).
5. **Montaż w odtwarzaczu**: uwagi na fragmentach, przesuwanie znaczników.
6. **Napisy**: `npm run napisy -- filmy/<nazwa>` (PL z lektora, EN i CS z `napisy/*.json`).
7. **Kontrola**: `npm run kontrola -- filmy/<nazwa> --plik …mp4 --siec` → `kontrola.md`; błędy blokują publikację.
8. **Wersja**: wpis w `wersje.md`, commit, `git tag -a <nazwa>/vN`.
9. **Eksport** obu wersji; master 16:9 na X, pion na TikTok i Shorts; `npm run strona -- …` gdy film idzie na stronę.

## Eksport

```sh
node silnik/eksport.mjs filmy/<nazwa>                  # 16:9 → wynik/<nazwa>-<wersja>.mp4 (X)
node silnik/eksport.mjs filmy/<nazwa> --vert           # pion → wynik/<nazwa>-pion-<wersja>.mp4 (TikTok, Shorts)
node silnik/eksport.mjs filmy/<nazwa> --szkic          # szybki podgląd: WebCodecs w przeglądarce (mediabunny), 30 kl./s
node silnik/eksport.mjs filmy/<nazwa> --stills 0,5.2 [--vert] [--sz]   # klatki kontrolne
node silnik/eksport.mjs filmy/<nazwa> --tylko-dzwiek   # miks do odtwarzacza (fala dźwięku)
node silnik/eksport.mjs filmy/<nazwa> --wersja <nazwa>/v2               # stara wersja z taga
```

Domyślnie: supersampling ×3 (bez moiry na kreskowaniach), motion blur 8 próbek, H.264 crf 12, 60 kl./s, trzy procesy
Chromium równolegle. **Render bez GPU** (`--disable-gpu`): z GPU klatka zależała od tego, co Chromium rysował wcześniej
(ta sama chwila wychodziła inaczej w filmie i w klatce kontrolnej). Bez GPU wynik nie zależy od kolejności klatek,
więc render równoległy daje plik identyczny ze zwykłym.

## Napisy

`npm run napisy -- filmy/<nazwa>` → `wynik/napisy/<nazwa>.{pl,en,cs}.{srt,vtt}`. Czasy z nagrania lektora; do 2 linii
po 42 znaki, spacje niełamiące w liczbach, przy jednostkach i po jednoliterowych spójnikach; ostrzeżenie powyżej 17 znaków
na sekundę. `--brakujace` wypisuje szkielet brakujących tłumaczeń. Kwoty w tłumaczeniach po średnim kursie NBP z dnia
generowania (zaokrąglone w dół do trzech cyfr znaczących).

Gdzie: YouTube (SRT lub VTT), X („Upload caption file (.srt)” pod wgranym filmem), strona (VTT jako `<track>`),
Facebook i LinkedIn (SRT). TikTok i Shorts: napisy rysowane w kadrze przez silnik.

## Na stronie

`npm run strona -- filmy/<nazwa> --master <plik 16:9>` → `wynik/strona/<nazwa>/`: MP4 30 kl./s z klatką kluczową co 2 s,
**≤ 25 MiB** (limit pliku statycznego Workera; crf rośnie, aż się zmieści), HLS (Safari na iPhonie wymaga Range przy MP4,
a Worker go nie obsługuje), okładka WebP z pierwszej klatki, napisy VTT. `--do ../zarobkilekarzy.pl` kopiuje do
`public/film/<nazwa>/` — tylko na wyraźne polecenie; dalej `FilmData` w `src/data/film.ts`, podgląd, commit po akceptacji.

## Zasady treści

- Każda liczba ma źródło w `zrodla.json` (kontrola to sprawdza): pełne w stopce 16:9, krótkie w pionie, linki w napisach na stronie.
- Przykład modelowy podpisany wprost; mechanizmy ilustrowane prawdziwymi sprawami; zarzut ≠ fakt.
- Film trzyma się obowiązującego prawa. Bez nazwisk.
- Pierwsza klatka = okładka na X: kluczowa liczba widoczna od t = 0.
- 16:9: kluczowa liczba 250–300 px, etykieta Plex Mono wersalikami, podpis 64–84 px, stopka ze źródłem.
- Pion: hierarchia jak w 16:9 (liczba na całą szerokość — `fitSize`, podpisy 60–110 px, napisy lektora 54 px drugim planem);
  `drawV` projektujemy na polu 70–1010 × 360–1420, silnik wpisuje je w strefę bezpieczną. Nie „wciskać” kadru 16:9 w pion.

## Kolory, znak, fonty

Kolory motywów i linia EKG znaku pochodzą z `marka/` (`silnik/marka.mjs`). Repo marki (cc1cad7) nie ma jeszcze tła,
linii i kolorów wykresów — te tokeny są w `silnik/marka.mjs` jako literały z `src/styles/tokens.css` strony. Fonty
silnika to zmienne woff2 strony (`silnik/fonty/`, OFL), bo marka ma tylko statyczne TTF bez Inter Tight 600; generatory
SVG (resvg) używają TTF z `marka/fonty/`.
