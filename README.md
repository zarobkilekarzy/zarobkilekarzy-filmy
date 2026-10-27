# Generator filmów zarobkilekarzy.pl

Generator krótkich filmów objaśniających z liczbami i źródłami — takich jak filmy na
[zarobkilekarzy.pl/media](https://zarobkilekarzy.pl/media/). Kadry rysuje kod (canvas w przeglądarce), więc film
to kilka plików tekstowych w repo: scenariusz, ujęcia, teksty lektora, źródła. Z jednego kodu powstają **dwie wersje**:
16:9 (X, YouTube, strona WWW) i pion 9:16 (TikTok, YouTube Shorts, Reels).

Co dostajesz:

- **Podgląd na żywo** w przeglądarce — zmiana w `film.js` widać po przeładowaniu, z przewijaniem i listą ujęć.
- **Eksport do MP4**: 1080p60, supersampling, motion blur, H.264, dźwięk znormalizowany do −16 LUFS; szybki szkic
  w kilka sekund (WebCodecs w przeglądarce).
- **Lektor** z ElevenLabs z wyrównaniem do znaków: ujęcia same wydłużają się do długości mowy, a elementy kadru
  mogą wchodzić dokładnie na wybrane słowo (*nazwane znaczniki*).
- **Napisy** SRT i WebVTT (polskie z nagrania lektora, tłumaczenia z plików JSON), w pionie rysowane w kadrze.
- **Źródła** przypięte do ujęć: pełna stopka w 16:9, krótka linia w pionie, lista linków do opisu filmu.
- **Kontrola** przed publikacją: czy każda liczba ma źródło, czy tekst zdąży się przeczytać, czy pion nie wchodzi pod
  przyciski aplikacji, głośność i metadane gotowego pliku.
- **Odtwarzacz montażowy**: oś czasu z ujęciami i falą dźwięku, uwagi przypięte do fragmentów, przesuwanie znaczników myszką.
- **Wersje**: tag w gicie = wersja filmu; starą wersję eksport renderuje tamtym kodem.

Wszystko w Node.js bez frameworka; przeglądarka (Chromium) rysuje klatki, ffmpeg skleja obraz z dźwiękiem.

## Wymagania

- Node.js ≥ 22.4, ffmpeg i ffprobe, Python 3 (tylko do przygotowania nagrań lektora).
- Chromium albo Google Chrome. Generator szuka ich w typowych miejscach na macOS i Linuksie; inną ścieżkę podaj
  w zmiennej `CHROME`, np. `CHROME=/usr/bin/chromium npm run eksport -- …`.
- Do lektora: konto ElevenLabs i klucz API (`ELEVENLABS_API_KEY` w środowisku albo w pliku `.env`). Bez klucza
  podgląd i eksport działają, a długość mowy liczy się szacunkowo (16 znaków na sekundę).

## Szybki start

```sh
git clone https://github.com/zarobkilekarzy/zarobkilekarzy-filmy.git
cd zarobkilekarzy-filmy
npm install
npm run sprawdz              # czy jest Node, ffmpeg, Chromium, klucz lektora
npm run serwer               # http://127.0.0.1:4471/silnik/?film=szablon
```

Szablon to krótki film-przykład z pięcioma ujęciami. Pion: `?film=szablon&v=1`, strefy TikToka i Shorts: `&sz=1`,
konkretna chwila: `#t=6.5`. Odtwarzacz montażowy: `http://127.0.0.1:4471/odtwarzacz/?film=szablon`.

Własny film:

```sh
npm run nowy -- moj-film                             # filmy/moj-film/ — kopia szablonu
npm run serwer                                       # /silnik/?film=filmy/moj-film
npm run eksport -- filmy/moj-film --szkic            # szybki szkic MP4
npm run eksport -- filmy/moj-film                    # 16:9 → filmy/moj-film/wynik/moj-film-<wersja>.mp4
npm run eksport -- filmy/moj-film --vert             # pion 9:16
```

Pliki wideo, klatki i napisy trafiają do `<film>/wynik/` — ten katalog jest w `.gitignore`, bo każdy plik da się
odtworzyć z kodu danej wersji.

## Jak zbudowany jest film

Katalog filmu (wzór: `szablon/`):

| Plik | Co w nim jest |
| --- | --- |
| `scenariusz.md` | Pomysł, tabela ujęć (kadr, lektor, źródło), szacunek długości, decyzje. Najpierw scenariusz, potem kod. |
| `film.js` | Ujęcia (`SHOTS`), nazwane znaczniki (`ZNACZNIKI`), napisy z liczbami cyframi (`SHOWN`), dźwięk (`sound()`). |
| `teksty.js` | Kwestie lektora pod `id` ujęcia. Liczby słowami, pełne zdania. Tablica = osobne klipy z pauzą między nimi. |
| `lektor.js`, `lektor/` | Nagranie lektora z wyrównaniem znaków. Bez nagrania: `window.LEKTOR = null` (długość szacowana). |
| `zrodla.json` | Klucz źródła → `stopka` (16:9), `krotko` (pion), `typ` (fakt, szacunek, model, doniesienia, prawo), `liczby`, `linki`. |
| `znaczniki.json`, `uwagi.json` | Zapisuje je odtwarzacz montażowy: poprawki znaczników i uwagi do fragmentów. |
| `napisy/en.json`, `napisy/cs.json` | Tłumaczenia napisów: polska kwestia → tekst. Kwoty: `{≈EUR:123000}`, `{≈CZK:123000}`. |
| `wersje.md`, `kontrola.md` | Historia wersji i lista kontrolna ostatniej wersji (`kontrola.md` pisze `npm run kontrola`). |

Skrypty filmu nie są modułami: `film.js` ładuje się między `silnik/silnik.js` a `silnik/silnik-start.js` i korzysta
wprost z ich funkcji i stałych.

### Ujęcia

Każde ujęcie w `SHOTS` to obiekt:

| Pole | Znaczenie |
| --- | --- |
| `id` | Nazwa ujęcia; pod nią są kwestie w `teksty.js` i znaczniki. Kolejność ujęć można zmieniać. |
| `d` | Minimalna długość w sekundach. Silnik wydłuża ujęcie do długości mowy + oddech + `hold`. |
| `hold`, `gap` | Cisza po kwestii (czas na doczytanie kadru) i pauza między klipami kwestii. |
| `theme` | `'dark'`, `'light'`, `'blue'` (motywy z `silnik/marka.mjs`) albo funkcja `(lt) => motyw`. |
| `src` | Klucz źródła z `zrodla.json` — stopka w kadrze. Pusty = bez stopki. |
| `draw(lt, d)` | Kadr 16:9, 1920×1080. `lt` = czas od cięcia (s), `d` = długość ujęcia. |
| `drawV(lt, d)` | Kadr pionowy, projektowany na polu 70–1010 × 360–1420; silnik wpisuje go w strefę bezpieczną aplikacji. |
| `zip` | Linia EKG przelatuje przez kadr na początku ujęcia (początek aktu). |
| `group` | Ujęcia o tym samym układzie: najazd kamery idzie ciągle przez całą grupę. |
| `bare`, `noCap` | Bez logo i stopki (plansza) · bez napisów lektora w pionie (gdy kadr mówi to samo). |

Kadr rysuje się od zera w każdej klatce i zależy tylko od czasu — dzięki temu podgląd, klatka kontrolna i film są
identyczne, a eksport może renderować klatki równolegle.

### Funkcje do rysowania

Najczęściej używane (pełna lista z opisami: `silnik/silnik.js`):

| Funkcja | Co robi |
| --- | --- |
| `txt(s, x, y, { size, weight, color, alpha, align, font, max })` | Tekst; `max` zmniejsza stopień, gdy napis się nie mieści. |
| `mono(s, x, y, lt, at)` | Etykieta wersalikami (Plex Mono), wpisywana znak po znaku od chwili `at`. |
| `rise(s, x, y, size, lt, at, o)` | Wiersz wjeżdża od dołu spod maski. |
| `slam(s, x, y, size, lt, at, o)` | Wejście z lekkim przeskalowaniem. |
| `count(cel, lt, at, d)` + `fmt(n)` | Licznik dochodzący do liczby · zapis z odstępami tysięcy (`123 000`). |
| `fitSize(s, max, weight)` | Stopień, przy którym napis wypełnia szerokość kadru (pion). |
| `seg(t, a, b)`, `outExpo`, `outBack`, `inOut`, `lerp` | Postęp 0–1 między chwilami `a` i `b` i krzywe ruchu. |
| `rect`, `frame`, `hatch`, `hline`, `seg2` | Prostokąt, ramka, kreskowanie, linia pozioma, odcinek (z animowaną długością `k`). |
| `place(rodzaj, x, y, s, k)`, `mark(x, y, s, k)` | Kwadrat z literą A/B/C · znak marki. |
| `Z('nazwa')` | Chwila nazwanego znacznika od cięcia — niżej. |
| `endCard`, `endCardV` | Plansza końcowa (logo, hasło, konto) do użycia jako `draw` i `drawV`. |

Stałe: `W`, `H` (wymiary kadru), `M` (margines), `VERT` (czy pion), `th` (kolory bieżącego motywu: `bg`, `ink`, `muted`,
`accent`, `line`, `chart`, `soft`, `amber`).

### Nazwane znaczniki

Pomysł z Motion Canvas („time events”). Znacznik to chwila, w której lektor dochodzi do frazy:

```js
const ZNACZNIKI = { kwota: { ujecie: 'liczba', fraza: 'sto', przesun: -0.1 } };
// w ujęciu: const c = Z('kwota');   → chwila od cięcia, w której lektor mówi „sto”, minus 0,1 s
```

Zamiast frazy można podać stałe `t` od cięcia. Odtwarzacz pokazuje znaczniki na osi; przeciągnięcie zapisuje się
w `znaczniki.json` jako poprawka względem frazy, więc znacznik zostaje na miejscu także po nowym nagraniu lektora.

## Lektor

```sh
npm run lektor -- filmy/moj-film plan        # klipy i liczba znaków (≈ kredyty ElevenLabs), bez sieci
npm run lektor -- filmy/moj-film calosc      # nagranie brakujących klipów → filmy/moj-film/lektor/…/lektor.json
python3 -I silnik/lektor_przygotuj.py filmy/moj-film   # przycięte klipy + filmy/moj-film/lektor.js
```

Klucz API: `ELEVENLABS_API_KEY` w środowisku, w `.env` projektu albo generatora, na macOS także w pęku kluczy
(wpis `zl-elevenlabs`). Klip o tym samym tekście nagrywa się raz — przy poprawkach dogrywane są tylko zmienione
zdania, a stare klipy zostają dla starszych wersji filmu. Nagrania warto trzymać w repo: kosztują kredyty i drugi raz
nie wyjdą tak samo. Głos, model i tempo ustawia się na początku `silnik/lektor.mjs` (domyślnie polski głos „Piotr”
z biblioteki ElevenLabs, Multilingual v2). Przed nagraniem przycisk „lektor (syntezator)” w podglądzie czyta tekst
głosem systemu — do wyczucia tempa.

## Odtwarzacz montażowy

`npm run serwer` → `http://127.0.0.1:4471/odtwarzacz/?film=filmy/<nazwa>`

- Kadr **na żywo** (silnik rysuje klatkę) albo **plik MP4** z `wynik/`; przyciski 16:9 / pion, `strefy` = TikTok i Shorts.
- Oś czasu: ujęcia, fala dźwięku (miks robi serwer), nazwane znaczniki (przeciągnięcie = poprawka), uwagi.
- **Uwagi**: przeciągnięcie po fali albo `N` → treść i rodzaj → `uwagi.json`, przypięte do ujęcia. `P` = pinezka w kadrze.
  `Esc` usuwa zaznaczenie, `Delete` — klikniętą uwagę, `L` zapętla zaznaczony fragment.
- **Napisy** na kadrze: `C` przełącza wył. → PL → EN → CS.
- Klawisze: spacja, `←` `→` klatka, `⇧←` `⇧→` sekunda, `R` przeładowanie filmu.

## Napisy

`npm run napisy -- filmy/<nazwa>` → `wynik/napisy/<nazwa>.{pl,en,cs}.{srt,vtt}`. Czasy pochodzą z nagrania lektora;
do 2 linii po 42 znaki, spacje niełamiące w liczbach i po jednoliterowych spójnikach, ostrzeżenie powyżej 17 znaków
na sekundę. Polskie napisy pokazują liczby cyframi według mapy `SHOWN` z `film.js`. `--brakujace` wypisuje szkielet
brakujących tłumaczeń. Kwoty w tłumaczeniach przelicza się po średnim kursie NBP z dnia generowania.

Gdzie: YouTube (SRT lub VTT), X („Upload caption file”), strona WWW (VTT jako `<track>`), Facebook i LinkedIn (SRT).
TikTok i Shorts: napisy rysowane w kadrze przez silnik.

## Kontrola przed publikacją

```sh
npm run kontrola -- filmy/<nazwa>                                  # źródła, liczby, czas czytania, strefy pionu, lektor
npm run kontrola -- filmy/<nazwa> --plik filmy/<nazwa>/wynik/x.mp4 # + głośność, szczyt, metadane, limity serwisów
npm run kontrola -- filmy/<nazwa> --siec                           # + czy linki źródeł odpowiadają
```

Wynik: `<film>/kontrola.md`, kod wyjścia 1 przy błędach. Część ręczna listy pochodzi z `kontrola-reczna.md` w katalogu
projektu z filmami, a gdy go nie ma — z `silnik/kontrola-reczna.md`; odhaczone pola przechodzą do kolejnej kontroli.

## Eksport

```sh
node silnik/eksport.mjs filmy/<nazwa>                  # 16:9 → wynik/<nazwa>-<wersja>.mp4
node silnik/eksport.mjs filmy/<nazwa> --vert           # pion 1080×1920
node silnik/eksport.mjs filmy/<nazwa> --szkic          # szybki podgląd: WebCodecs w przeglądarce, 30 kl./s
node silnik/eksport.mjs filmy/<nazwa> --stills 0,5.2 [--vert] [--sz]   # klatki kontrolne PNG
node silnik/eksport.mjs filmy/<nazwa> --tylko-dzwiek   # sam miks dźwięku
node silnik/eksport.mjs filmy/<nazwa> --wersja <nazwa>/v2               # stara wersja z taga
```

Opcje: `--fps 60`, `--blur 8` (próbki motion blur), `--ss 3` (supersampling), `--crf 12`, `--rownolegle 3` (procesy
Chromium), `--out plik.mp4`. Render idzie **bez GPU** (`--disable-gpu`): z GPU klatka zależała od tego, co przeglądarka
rysowała wcześniej, a bez niego wynik nie zależy od kolejności klatek — render równoległy daje plik identyczny ze zwykłym.

**Wersje**: wersja filmu = tag `<nazwa>/vN` w gicie (`git tag -a moj-film/v1 -m "…"`) i wpis w `wersje.md`. Nazwa pliku
zawiera wersję z `git describe`; `--wersja` renderuje stary film w tymczasowym `git worktree` kodem z tamtego taga.

## Film na stronę WWW

`npm run strona -- filmy/<nazwa> --master <plik 16:9>` → `wynik/strona/<nazwa>/`: MP4 30 kl./s z klatką kluczową co 2 s,
do 25 MiB (limit pliku statycznego w Cloudflare Workers; jakość spada, aż plik się zmieści), HLS (Safari na iPhonie
wymaga obsługi Range dla MP4), okładka WebP z pierwszej klatki i napisy VTT. `--do <repo strony Astro>` kopiuje
całość do `public/film/<nazwa>/` w tym repo.

## Filmy we własnym repo

Filmy nie muszą leżeć w `filmy/` generatora. Najwygodniej trzymać je w osobnym repo, a generator dodać jako submoduł —
wtedy tag filmu przypina także wersję generatora, więc stary film zawsze renderuje się tym kodem, z którym powstał:

```sh
git submodule add https://github.com/zarobkilekarzy/zarobkilekarzy-filmy.git generator
npm --prefix generator install
node generator/narzedzia/nowy.mjs moj-film      # → filmy/moj-film/ w Twoim repo
node generator/silnik/serwer.mjs                # /silnik/?film=filmy/moj-film
node generator/silnik/eksport.mjs filmy/moj-film
```

Generator sam wykrywa, że jest submodułem, i szuka filmów w repo nadrzędnym. W innym układzie (np. dwa sąsiednie
katalogi) wskaż katalog z filmami w zmiennej `FILMY_PROJEKT`. Serwer szuka plików najpierw w projekcie z filmami, potem
w generatorze — `szablon` i interfejs są zawsze dostępne.

## Własna marka

Kolory motywów, linia znaku i napisy marki w kadrze (nazwa, hasło planszy końcowej, konto na X) są w jednym pliku:
`silnik/marka.mjs`. Logo interfejsu to `silnik/logo.svg` i `silnik/znak.svg`. Podmień te trzy pliki — reszta silnika
czyta markę tylko z nich. Fonty (Inter Tight, IBM Plex Sans i Mono, licencja OFL) są w `silnik/fonty/`; inne fonty
podłącza `silnik/fonty.css`, a nazwy rodzin ustawia stała `F` w `silnik/silnik.js`.

Proporcje kadru są dobrane do serwisów: w 16:9 kluczowa liczba 250–300 px, etykieta wersalikami, podpis 64–84 px,
stopka ze źródłem; w pionie liczba na całą szerokość (`fitSize`), podpisy 60–110 px, napisy lektora 54 px. Pierwsza
klatka jest okładką na X — kluczowa liczba powinna być widoczna od t = 0.

## Struktura repo

| Katalog | Co |
| --- | --- |
| `silnik/` | Rysowanie i ruch (`silnik.js`), czas ujęć, render i podgląd (`silnik-start.js`), ładowanie filmu (`start.mjs`), marka (`marka.mjs`), serwer, eksport, lektor, napisy, kontrola, pliki na stronę, fonty. |
| `odtwarzacz/` | Odtwarzacz montażowy. |
| `szablon/` | Wzór filmu — kopiuje go `npm run nowy`. |
| `filmy/` | Miejsce na filmy, jeśli trzymasz je w repo generatora. |
| `narzedzia/` | `nowy.mjs` (film z szablonu), `sprawdz.mjs` (czy stanowisko ma wszystko). |

## Licencja

Kod: licencja MIT (`LICENSE`). Nie obejmuje ona marki zarobkilekarzy.pl — nazwy, logo i znaku „Puls” w
`silnik/marka.mjs`, `silnik/logo.svg` i `silnik/znak.svg`; w swoich filmach użyj własnej marki. Fonty w `silnik/fonty/`:
SIL Open Font License 1.1 (pliki `OFL-*.txt`).

## In English

A generator for short explainer videos with numbers and sources, used for the films on
[zarobkilekarzy.pl](https://zarobkilekarzy.pl/en/). Frames are drawn by code on a canvas, so one codebase yields both a
16:9 and a 9:16 vertical cut. It renders frame-exact MP4s in headless Chromium, records voice-over with ElevenLabs
(character-level alignment drives the timing), writes SRT/WebVTT captions, checks sources and safe zones before
publishing, and ships an editing player with comments and draggable markers. Code and documentation are in Polish;
the commands above work as written. MIT licence; the zarobkilekarzy.pl brand is not included in it.
