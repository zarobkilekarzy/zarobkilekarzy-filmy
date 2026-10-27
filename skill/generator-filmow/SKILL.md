---
name: generator-filmow
description: Praca nad krótkim filmem objaśniającym w generatorze zarobkilekarzy-filmy (kadry rysowane kodem, 16:9 i pion 9:16, lektor ElevenLabs, napisy, źródła). Prowadzi przez scenariusz, kod ujęć, klatki kontrolne i ich oglądanie, kontrolę przed publikacją i poprawki z uwag odtwarzacza montażowego. Użyj, gdy ktoś chce zrobić albo poprawić film w tym generatorze, prosi o klatki, poprawki kadru, kontrolę filmu albo o przejrzenie uwag z odtwarzacza. Działa po polsku.
---

# Film w generatorze zarobkilekarzy-filmy

Pomagasz zrobić krótki film objaśniający: kluczowa liczba, mechanizm, źródło. Kadry to kod (`film.js`), kwestie
lektora to tekst (`teksty.js`), źródła to dane (`zrodla.json`). Z jednego kodu powstaje wersja 16:9 i pion 9:16.

**Ty piszesz kod kadrów i pilnujesz procesu. Treść należy do człowieka**: teza, liczby, źródła i tekst lektora
pochodzą od niego albo z materiałów, które wskazał. Nie dopisujesz liczb ani twierdzeń bez źródła. Gdy czegoś brakuje —
pytasz. Rozmawiasz po polsku, krótko.

## Najpierw: gdzie jest generator, a gdzie filmy

Ustal układ, zanim cokolwiek uruchomisz:

- **Filmy w repo generatora** — w katalogu są `silnik/` i `szablon/`. Polecenia: `npm run …` albo `node silnik/…`.
- **Filmy we własnym repo, generator jako submoduł** — w katalogu jest `generator/silnik/`. Polecenia: `node generator/…`
  (albo `npm run …`, jeśli repo ma takie skrypty). Generator sam znajduje filmy w repo nadrzędnym.
- Inny układ — katalog z filmami wskazuje zmienna `FILMY_PROJEKT`.

Niżej `G/` oznacza katalog generatora (`.` albo `generator`). Sprawdź stanowisko: `node G/narzedzia/sprawdz.mjs` —
ostatnia linia mówi, skąd generator bierze filmy. Ścieżki filmów podajesz względem katalogu projektu: `filmy/<nazwa>`.

Jeśli projekt ma własne zasady (`AGENTS.md`, `CLAUDE.md`, `kontrola-reczna.md`, README z procesem) — przeczytaj je;
mają pierwszeństwo przed tym plikiem. Opis generatora i wszystkich funkcji do rysowania: `G/README.md`.

## Kolejność pracy

Każdy krok kończy się czymś, co człowiek może ocenić. Nie przeskakuj do kodu przed akceptacją scenariusza
i nie rób całego pionu przed akceptacją kilku jego kadrów.

### 1. Scenariusz

`node G/narzedzia/nowy.mjs <nazwa>` tworzy `filmy/<nazwa>/` z szablonu. Zacznij od `scenariusz.md`:
pomysł w 1–2 zdaniach, tabela ujęć (`id`, co widać, kwestia lektora, klucz źródła), szacunek długości
(znaki lektora / 16 zn./s + czas na doczytanie kadrów). Pierwsze ujęcie = okładka: kluczowa liczba widoczna od t = 0.

Dopytaj o każdą liczbę: skąd jest, czy to fakt, szacunek, model, doniesienia czy przepis. Bez źródła liczba nie wchodzi
do filmu. **Pokaż scenariusz i poczekaj na akceptację.**

### 2. Treść filmu: trzy pliki

- `zrodla.json` — klucz → `stopka` (pełne źródło w 16:9), `krotko` (pion, do ~70 znaków), `typ`, `liczby`
  (każda liczba pokazana w kadrach ujęć z tym źródłem, w tym samym zapisie), `linki` (https, materiał pierwotny).
- `teksty.js` — kwestie pod `id` ujęcia. **Liczby słowami**, pełne zdania. Tablica = osobne klipy z pauzą.
- `film.js` — `SHOTS` (ujęcia), `ZNACZNIKI` (chwile, w których lektor mówi frazę), `SHOWN` (kwestia słowami → napis
  cyframi), `sound()`. Zasady pisania kadrów: `references/kadr.md`. Przeczytaj przed pierwszą zmianą `film.js`.

Najpierw wszystkie ujęcia w 16:9 (`draw`). Pion (`drawV`) — w kroku 4.

### 3. Klatki kontrolne i oglądanie PNG

Po każdej zmianie kadru **zobacz wynik, zanim pokażesz go człowiekowi**.

```sh
node G/narzedzia/ujecia.mjs filmy/<nazwa>                       # czasy ujęć, proponowane klatki, otwarte uwagi
node G/silnik/eksport.mjs filmy/<nazwa> --stills 0,2.55,6.32    # → filmy/<nazwa>/wynik/klatki/t0_00.png, t2_55.png …
node G/silnik/eksport.mjs filmy/<nazwa> --vert --stills 2.55    # pion → wynik/klatki/pion-t2_55.png
node G/silnik/eksport.mjs filmy/<nazwa> --vert --sz --stills …  # pion ze strefami interfejsu TikToka i Shorts
```

`ujecia.mjs` podaje dla każdego ujęcia dwie chwile: połowę (ruch w toku) i koniec (pełny kadr, 0,05 s przed cięciem)
oraz gotową listę „okładka + pełny kadr każdego ujęcia”. Klatki renderują się w kilka sekund; czasy ujęć zmieniają się
po nagraniu lektora — sprawdzaj je od nowa.

Otwórz każdy PNG narzędziem, które pokazuje Ci obraz, i sprawdź:

- czy nic nie wychodzi poza kadr ani nie nachodzi na stopkę ze źródłem, logo, napisy lektora (pion);
- hierarchię: jedna rzecz najważniejsza (liczba), etykieta i podpis wyraźnie mniejsze;
- czy liczba w kadrze jest identyczna z tą w `zrodla.json` (zapis, jednostka, zaokrąglenie);
- czy pierwsza klatka (t = 0) ma kluczową liczbę — to okładka na X;
- kontrast na każdym motywie (`dark`, `light`, `blue`) i czy nic nie jest za drobne (w pionie poniżej ~22 px po skali);
- w pionie ze strefami (`--sz`): treść poza zaznaczonymi strefami pasków i przycisków aplikacji.

Opisz człowiekowi, co widzisz i co poprawiłeś; pokaż mu ścieżki PNG. **Zmiana wyglądu = najpierw klatki i pytanie
„podoba się?”**, dopiero potem kolejne ujęcia w tym samym stylu.

Przy zmianie, która nie powinna ruszyć innych ujęć (refaktoryzacja, poprawka jednego kadru), zrób klatki przed i po:
skopiuj `wynik/klatki/` na bok, wyrenderuj te same chwile i porównaj `cmp` — różnica tylko tam, gdzie miała być.

### 4. Pion

Najpierw 3–4 kluczowe kadry `drawV` (okładka, najtrudniejszy wykres, plansza), klatki `--vert --sz`, pytanie
„podoba się?”. Dopiero po akceptacji reszta. Pion to osobna kompozycja, nie pomniejszony kadr 16:9 (`references/kadr.md`).

### 5. Lektor (płatny)

```sh
node G/silnik/lektor.mjs filmy/<nazwa> plan       # klipy i liczba znaków — bez sieci, za darmo
node G/silnik/lektor.mjs filmy/<nazwa> calosc     # nagranie brakujących klipów — ZUŻYWA KREDYTY ElevenLabs
python3 -I G/silnik/lektor_przygotuj.py filmy/<nazwa>
```

**Nigdy nie uruchamiaj `calosc` bez wyraźnej zgody człowieka** — pokaż wynik `plan` (liczba znaków ≈ kredyty)
i zapytaj. Nagrywa się dopiero zaakceptowany tekst. Poprawka jednego zdania dogrywa tylko to zdanie.
Po nagraniu czasy ujęć się zmieniają: znowu `ujecia.mjs` i klatki. Znaczniki (`Z('nazwa')`) same idą za frazą.

### 6. Uwagi z odtwarzacza montażowego

Człowiek ogląda film w odtwarzaczu (`node G/silnik/serwer.mjs` → `/odtwarzacz/?film=filmy/<nazwa>`) i zaznacza
fragmenty z uwagami. Trafiają do `filmy/<nazwa>/uwagi.json`:

```json
{ "id": "m9x2k", "ujecie": "liczba", "od": 1.2, "do": 1.8, "tekst": "Liczba wchodzi za wcześnie",
  "rodzaj": "tempo", "stan": "otwarta", "pinezka": { "x": 0.3, "y": 0.5, "format": "16:9" }, "wersja": "…" }
```

`od`/`do` liczą się od cięcia ujęcia `ujecie`; `pinezka` (opcjonalna) to miejsce w kadrze, ułamki szerokości
i wysokości. `node G/narzedzia/ujecia.mjs filmy/<nazwa>` wypisuje otwarte uwagi z czasem w filmie i gotowym `--stills`.

Dla każdej otwartej uwagi: wyrenderuj klatkę z tej chwili (w formacie pinezki), obejrzyj, popraw, wyrenderuj ponownie
i porównaj. Potem ustaw `"stan": "zrobiona"` w `uwagi.json` — nie usuwaj uwag. Gdy uwaga jest niejasna albo
dotyczy treści (liczba, teza, źródło) — zapytaj, zamiast zgadywać. `rodzaj` podpowiada, gdzie szukać: `tekst`
(kadr albo `teksty.js`), `tempo` (`d`, `hold`, `gap`, znaczniki), `grafika`, `dźwięk` (`sound()`), `rzetelność` (źródła).

Przesunięte w odtwarzaczu znaczniki zapisują się w `znaczniki.json` — nie przepisuj ich na sztywne czasy w `film.js`.

### 7. Kontrola

```sh
node G/silnik/kontrola.mjs filmy/<nazwa>                          # źródła, liczby, czytanie, strefy pionu, lektor
node G/silnik/kontrola.mjs filmy/<nazwa> --siec                   # + czy linki źródeł odpowiadają
node G/silnik/kontrola.mjs filmy/<nazwa> --plik filmy/<nazwa>/wynik/<plik>.mp4   # + głośność, metadane, długość
```

Wynik: `filmy/<nazwa>/kontrola.md`. **Błędy blokują publikację** — napraw je wszystkie. Uwagi przejrzyj i albo popraw,
albo powiedz człowiekowi, dlaczego zostają. Część ręczną listy (pola `- [ ]`) odhacza człowiek, nie Ty — możesz
wskazać, które punkty Twoim zdaniem są spełnione i dlaczego.

### 8. Eksport i wersja

```sh
node G/silnik/eksport.mjs filmy/<nazwa> --szkic    # szybki podgląd całości (sekundy)
node G/silnik/eksport.mjs filmy/<nazwa>            # 16:9, jakość docelowa (minuty)
node G/silnik/eksport.mjs filmy/<nazwa> --vert     # pion
node G/silnik/napisy.mjs filmy/<nazwa>             # SRT i VTT (PL z lektora; EN i CS z napisy/*.json)
```

Wersja = wpis w `wersje.md` + tag `git tag -a <nazwa>/vN`. Tag, commit i publikację robisz tylko na prośbę człowieka.
Pliki wideo i klatki (`wynik/`) nie trafiają do gita.

## Kiedy pytać, zamiast działać

- liczba, źródło, teza albo kwestia lektora — zawsze człowiek;
- nagranie lektora (`calosc`), commit, tag, push, publikacja — tylko na wyraźną prośbę;
- nowy styl kadru albo pierwszy pion — klatki i „podoba się?”;
- uwaga z odtwarzacza, której nie rozumiesz;
- zmiana w `G/silnik/` (wspólny kod wszystkich filmów) — zapytaj; zwykle wystarczy funkcja w `film.js`.
