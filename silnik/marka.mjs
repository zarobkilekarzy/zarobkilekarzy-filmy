// Marka kadrów: kolory motywów i znak „Puls” zarobkilekarzy.pl (logo interfejsu: silnik/logo.svg, silnik/znak.svg).
// Własna marka = podmiana tego pliku (te same eksporty) i obu plików SVG — reszta silnika czyta tylko je.
// Motywy kadrów: noc (dark) i dzień (light) = tokeny strony, trzeci „kadr” (blue) = pełny kolor marki.

// Kolory strony (src/styles/tokens.css); n* = wartości trybu nocnego
const C = {
  blue: '#2664EC', ink: '#040B1B', muted: '#666E80',
  nBlue: '#6E9BFF', nMuted: '#8691A5', nInk: '#EEF2F8', nAmber: '#EDB54A',
};
// Znak „Puls”: linia EKG w kwadracie 24×24 (tylko łamana — M x y, H x, L x y)
const EKG = 'M0 14H7.5L10 5.5 13.5 18.5 15.5 14H24';

// Napisy marki w kadrze: logo (nazwa + przyrostek przygaszony), plansza końcowa (hasło, konto na X; null = bez konta)
export const NAZWA = ['zarobkilekarzy', '.pl'];
export const HASLO = 'Każda liczba ma źródło.';
export const KONTO = '@ZarobkiLekarzy';

export const TH = {
  dark: { bg: '#0A0F1C', ink: C.nInk, muted: C.nMuted, accent: C.nBlue, line: 'rgba(238,242,248,0.16)',
    chart: '#56627A', soft: '#2E374C', amber: C.nAmber, mark: C.blue, markLine: '#FFFFFF', wordDim: 'rgba(255,255,255,0.5)' },
  light: { bg: '#FFFFFF', ink: C.ink, muted: C.muted, accent: C.blue, line: '#D5DAE2',
    chart: '#A3ADBD', soft: '#D3D9E2', amber: '#8A5A00', mark: C.blue, markLine: '#FFFFFF', wordDim: C.muted },
  blue: { bg: C.blue, ink: '#FFFFFF', muted: 'rgba(255,255,255,0.72)', accent: '#FFFFFF', line: 'rgba(255,255,255,0.3)',
    chart: 'rgba(255,255,255,0.45)', soft: 'rgba(255,255,255,0.2)', amber: '#FFD27A', mark: '#FFFFFF', markLine: C.blue, wordDim: 'rgba(255,255,255,0.6)' },
};

// Linia EKG znaku „Puls” jako punkty w układzie 24×24 (ścieżka: M x y, H x, L x y …)
export const ECG = (() => {
  const pts = [];
  let y = 0;
  for (const [, cmd, args] of EKG.matchAll(/([MHL])([^MHL]*)/g)) {
    const n = args.trim().split(/[\s,]+/).map(Number);
    if (cmd === 'H') n.forEach((x) => pts.push([x, y]));
    else for (let i = 0; i < n.length; i += 2) { pts.push([n[i], n[i + 1]]); y = n[i + 1]; }
  }
  return pts;
})();
