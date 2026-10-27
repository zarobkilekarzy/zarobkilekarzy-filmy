# Jak pisać kadry w `film.js`

Pełna lista funkcji z parametrami: `G/README.md` („Funkcje do rysowania”) i komentarze w `G/silnik/silnik.js`.
Wzór działającego filmu: `G/szablon/film.js`.

## Zasada nadrzędna: kadr zależy tylko od czasu

`draw(lt, d)` i `drawV(lt, d)` rysują kadr od zera w każdej klatce; `lt` = sekundy od cięcia ujęcia, `d` = jego długość.
Eksport renderuje klatki w dowolnej kolejności i w kilku procesach naraz, więc:

- żadnego stanu między klatkami (zmiennych liczonych „przy poprzedniej klatce”, liczników, `push` do tablic);
- żadnego `Math.random()` ani `Date` — losowość tylko z ziarna zależnego od indeksu elementu;
- animacja = funkcja `lt`: `seg(lt, a, b)` (postęp 0–1 między chwilami), krzywe `outExpo`, `outBack`, `inOut`, `lerp`.

Skrypty filmu nie są modułami: masz wprost dostęp do funkcji silnika (`txt`, `rise`, `mono`, `count`, `fitSize`, `rect`,
`hatch`…) i stałych (`W`, `H`, `M`, `VERT`, `th`). Własne funkcje pomocnicze dopisuj w `film.js`, nie w silniku.

## Czas: znaczniki zamiast sztywnych sekund

Element, który ma wejść „na słowo”, wiąż ze znacznikiem:

```js
const ZNACZNIKI = { kwota: { ujecie: 'liczba', fraza: 'sto', przesun: -0.1 } };
// w draw: const c = Z('kwota'); txt(..., { alpha: seg(lt, c - 0.05, c + 0.1) });
```

Fraza musi występować dosłownie w kwestii tego ujęcia w `teksty.js`. Bez nagrania czas frazy jest szacowany
(16 zn./s), po nagraniu — z wyrównania znaków lektora. Człowiek może przesunąć znacznik w odtwarzaczu; poprawka
trafia do `znaczniki.json` i zostaje po nowym nagraniu. Nie zamieniaj znaczników na liczby w kodzie.

Długość ujęcia ustawia silnik: co najmniej `d`, a z lektorem — mowa + oddech + `hold`. Za mało czasu na doczytanie
kadru (kontrola: > 15 zn./s) → większy `hold` albo krótszy tekst w kadrze.

## 16:9 (1920 × 1080)

- Margines `M` = 120 px. Logo u góry (dodaje silnik, chyba że `bare: true`), stopka ze źródłem na dole (gdy `src`).
- Kluczowa liczba 250–300 px, etykieta `mono(…)` wersalikami, podpis 64–84 px. Jedna rzecz najważniejsza na kadr.
- `txt(…, { max })` zmniejsza stopień, gdy napis się nie mieści (domyślnie szerokość kadru minus marginesy).
- Kadr nie może wchodzić na pas stopki (ok. 950–1080 px w pionie kadru, gdy ujęcie ma źródło).

## Pion (1080 × 1920)

- `drawV` projektujesz na polu **70–1010 × 360–1420**; silnik wpisuje je w strefę bezpieczną (skala 0,74, z najazdem kamery trochę mniej; środek pola = środek ekranu), dodaje logo,
  krótkie źródło pod logo i napisy lektora na dole. Nie rysuj nic poza tym polem.
- Hierarchia jak w 16:9, ale większa: liczba na całą szerokość — `fitSize(tekst, max, waga)`, podpisy 60–110 px.
- Treść kadru nie może być mniejsza niż ok. 22 px po skali (kontrola ostrzega).
- Pion to osobna kompozycja: wiersze łam krócej (2 słowa w linii), wykresy układaj w pionie. Nie pomniejszaj kadru 16:9.
- `noCap: true`, gdy kadr pokazuje dokładnie to, co mówi lektor (bez podwójnego tekstu).
- Sprawdzaj ze strefami: `--vert --sz --stills …`.

## Liczby, napisy, źródła

- W kadrze liczby cyframi, ze spacją tysięcy: `fmt(123000)` → `123 000`; jednostka po spacji (`zł`, `%`, `h`).
- Każda liczba w kadrze ujęcia musi być w `liczby` źródła tego ujęcia (`src`) — w tym samym zapisie. Kontrola to sprawdza.
- Lektor mówi liczby słowami (`teksty.js`); `SHOWN` mapuje całą kwestię na napis z cyframi
  (`'To jest sto dwadzieścia trzy tysiące złotych.': 'To jest 123 000 zł.'`). Brak wpisu = napisy ze słowami.
- Szacunek, model, przykład — podpisane wprost w kadrze albo w stopce (`typ` w `zrodla.json` i słowo w `stopka`).

## Opcje ujęcia

| pole | kiedy |
|---|---|
| `theme` | `'dark'`, `'light'`, `'blue'` albo `(lt) => …`; zmiana motywu = zmiana aktu, nie każdego ujęcia |
| `zip: true` | początek aktu: linia znaku przelatuje przez kadr |
| `group: 'nazwa'` | kolejne ujęcia na tym samym układzie (np. wykres): najazd kamery idzie ciągle, elementy już stojące nie wchodzą od nowa (`mono(…, lt, -1)`) |
| `bare: true` | plansza bez logo i stopki (np. `endCard`) |
| `hold`, `gap` | czas na doczytanie po kwestii, pauza między klipami kwestii |
| `pion: false` | ujęcie tylko w 16:9 (krótszy pion); w `sound()` sprawdzaj `IDX.id != null` |
| `sound(d)` | dźwięk przypięty do ujęcia (`ticks`, `piks`, `tones`, czasy od cięcia) — opis w README, „Dźwięk” |

Koniec filmu: `...ending()` zamiast własnej planszy — wspólna końcówka marki (linia EKG zamarza w znak, plansza,
lektor czyta nazwę; README, „Końcówka”). Bez treści filmu: adres czy wezwanie należą do ostatniego ujęcia filmu.
Nie dopisuj jej pików, tonu ani kwestii w `sound()` i `teksty.js` filmu.

## Częste błędy

- Kadr wygląda dobrze w połowie ujęcia, ale nie na końcu (element zjeżdża albo znika) — oglądaj obie klatki z `ujecia.mjs`.
- Liczba w kadrze zaokrąglona inaczej niż w źródle → błąd kontroli; popraw kadr albo `liczby`, nie wyłączaj sprawdzenia.
- Napis tuż przy krawędzi — po najeździe kamery (do 2,5% powiększenia) wychodzi poza kadr. Zostaw zapas.
- Zmiana `id` ujęcia odcina jego kwestie w `teksty.js`, znaczniki i uwagi w `uwagi.json` — zmieniaj wszędzie albo wcale.
