// Kolory i znak z repo marki (submoduł marka/) — silnik nie przepisuje ich ręcznie.
// Motywy kadrów: noc i dzień = tokeny strony, trzeci „kadr” = pełny kobalt.
// marka/kolory.mjs (cc1cad7) ma tylko podstawowe tokeny; tła, linie i kolory wykresów są tu jako literały
// z src/styles/tokens.css strony (--bg, --line-2, --chart, --chart-soft, --amber) — do podmiany, gdy marka je dostanie.
import { C } from '../marka/marka/kolory.mjs';
import { EKG } from '../marka/marka/znak.mjs';

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
