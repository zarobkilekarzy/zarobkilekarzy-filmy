// Treść filmu — PRZYKŁAD do podmiany (opis: README.md repo). Ładowane między silnik.js a silnik-start.js;
// silnik potrzebuje stąd: SHOWN, ZNACZNIKI, SHOTS i sound(). Źródła: zrodla.json (klucz → stopka, krótko, linki).
// Każde ujęcie ma `draw` (16:9, 1920×1080) i `drawV` (pion, projektowany na polu 70–1010 × 360–1420;
// silnik wpisuje je w strefę bezpieczną TikToka i Shorts). Teksty lektora: teksty.js pod tym samym `id`.
'use strict';

/* ---------- nazwane znaczniki ---------- */
// Z('nazwa') = chwila od cięcia, w której lektor dochodzi do frazy (+ przesun). Odtwarzacz przesuwa je na osi
// i zapisuje poprawki w znaczniki.json — w kodzie zostaje sama nazwa.
const ZNACZNIKI = {
  kwota: { ujecie: 'liczba', fraza: 'sto', przesun: -0.1 },
  osoba: { ujecie: 'haslo', fraza: 'Jedna osoba', przesun: -0.1 },
  suma: { ujecie: 'haslo', fraza: 'Jedna suma', przesun: -0.1 },
  anonimowo: { ujecie: 'haslo', fraza: 'Anonimowo', przesun: -0.1 },
};

/* ---------- napisy w pionie: liczby cyframi ---------- */
// tekst kwestii lektora (słowami) → tekst napisu (cyframi; spacja niełamiąca między liczbą a jednostką)
const SHOWN = {
  'To jest sto dwadzieścia trzy tysiące złotych.': 'To jest 123 000 zł.',
};

/* ---------- ujęcia ---------- */
// d = minimalna długość (s); silnik wydłuża ujęcie do długości mowy + VO_PAD + hold.
// hold = cisza po kwestii (czas na doczytanie), gap = pauza między klipami kwestii,
// zip = linia EKG na początku aktu, bare = bez logo, noCap = bez napisów w pionie (gdy kadr mówi to samo).
// group = ujęcia o tym samym układzie (np. ten sam wykres): najazd kamery idzie ciągle przez całą grupę;
// w kolejnym ujęciu grupy elementy, które już stoją, nie wchodzą od nowa (etykieta `mono(…, lt, -1)`).
const SHOTS = [
  { id: 'otwarcie', d: 2.6, theme: 'blue', src: 'przyklad',
    // pierwsza klatka = okładka na X: kluczowa liczba widoczna od t = 0
    draw(lt) {
      mono('Etykieta · kontekst liczby', M, 330, lt, -1);
      txt('123 000 zł', M, 640, { size: 300, weight: 600 });
      rise('Pytanie, które otwiera film?', M, 790, 84, lt, 0.6, { weight: 400 });
    },
    drawV(lt) {
      mono('Etykieta · kontekst liczby', M, 400, lt, -1, { size: 30 });
      const size = fitSize('123 000 zł', 300, 600);
      txt('123 000 zł', M, 450 + size * 0.78, { size, weight: 600, max: 9999 });
      rise('Pytanie, które', M, 900, 150, lt, 0.6, { weight: 400 });
      rise('otwiera film?', M, 1060, 150, lt, 0.75, { weight: 400 });
    } },
  { id: 'liczba', d: 3.5, hold: 0.6, theme: 'dark', zip: true, src: 'przyklad',
    // liczba wchodzi razem ze słowem lektora (znacznik „kwota”), podpis — chwilę po niej
    draw(lt) {
      const c = Z('kwota');
      mono('Etykieta kadru', M, 330, lt, 0.05);
      txt(`${fmt(count(123000, lt, c, 0.6))} zł`, M, 610, { size: 260, weight: 300, color: th.accent, alpha: seg(lt, c - 0.05, c + 0.1) });
      rise('podpis pod liczbą', M, 710, 64, lt, c + 0.5, { weight: 400, color: th.muted });
    },
    drawV(lt) {
      const c = Z('kwota'), size = fitSize('123 000 zł', 300), y = 470 + size * 0.75;
      mono('Etykieta kadru', M, 380, lt, 0.05, { size: 32 });
      txt(`${fmt(count(123000, lt, c, 0.6))} zł`, M, y, { size, weight: 300, color: th.accent, alpha: seg(lt, c - 0.05, c + 0.1), max: 9999 });
      rise('podpis pod liczbą', M, y + 150, 110, lt, c + 0.5, { weight: 400, color: th.muted });
    } },
  { id: 'pointa', d: 2.5, hold: 0.8, theme: 'light', src: '',
    // zdanie-pointa: w pionie po dwa słowa w linii, stopień dobrany do najdłuższej linii
    draw(lt) {
      rise('Krótkie zdanie', M, 480, 180, lt, 0);
      rise('w dwóch liniach.', M, 680, 180, lt, 0.4, { color: th.accent });
    },
    drawV(lt) {
      const size = fitSize('w dwóch liniach.', 240, 600);
      rise('Krótkie zdanie', M, 760, size, lt, 0);
      rise('w dwóch liniach.', M, 760 + size * 1.05, size, lt, 0.3, { color: th.accent });
    } },
  { id: 'haslo', d: 2.4, gap: 0.45, hold: 1.0, theme: 'blue', src: '', noCap: true,
    draw(lt) {
      rise('Jedna osoba.', M, 400, 170, lt, Z('osoba'));
      rise('Jedna suma.', M, 600, 170, lt, Z('suma'));
      rise('Anonimowo.', M, 800, 170, lt, Z('anonimowo'), { weight: 400 });
    },
    drawV(lt) {
      const size = fitSize('Jedna osoba.', 300, 600);
      rise('Jedna osoba.', M, 640, size, lt, Z('osoba'));
      rise('Jedna suma.', M, 640 + size * 1.25, size, lt, Z('suma'));
      rise('Anonimowo.', M, 640 + size * 2.5, size, lt, Z('anonimowo'), { weight: 400 });
    } },
  { id: 'plansza', d: 3.5, theme: 'blue', bare: true, src: '', draw: endCard, drawV: endCardV },
];

/* ---------- dźwięk ---------- */
// Wywoływane po ułożeniu ujęć: T('id') = początek ujęcia, T('id') + Z('znacznik') = chwila znacznika.
// TICKS: [{ t, f: [Hz…], g }] — krótkie tony (np. tykanie), PIKS: [t…] — pik monitora (700 + 350 Hz).
// Eksport ścisza wszystko pod mową lektora (ok. −7 dB) i normalizuje całość do −16 LUFS.
function sound() {
  return { TICKS: [], PIKS: [0.02, T('plansza') + 0.1] };
}
