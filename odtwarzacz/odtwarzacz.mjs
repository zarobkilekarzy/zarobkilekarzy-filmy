// Odtwarzacz montażowy — jedyne narzędzie do oglądania filmu (/silnik/ bez parametrów tu przekierowuje): kadr (silnik
// na żywo albo gotowy MP4), miniatury ujęć, pasek przewijania i oś czasu wavesurfer z ujęciami, uwagami i nazwanymi
// znacznikami. Uwagi → <film>/uwagi.json, przesunięte znaczniki → <film>/znaczniki.json (przez serwer).
// Uwaga jest przypięta do ujęcia (`ujecie` + `od`/`do` od jego cięcia), więc zostaje na miejscu po zmianie montażu.
import WaveSurfer from '/node_modules/wavesurfer.js/dist/wavesurfer.esm.js';
import RegionsPlugin from '/node_modules/wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from '/node_modules/wavesurfer.js/dist/plugins/timeline.esm.js';

const q = new URLSearchParams(location.search);
const FILM = (q.get('film') ?? 'szablon').replace(/^\/+|\/+$/g, '');
const FPS = 30;
const $ = (id) => document.getElementById(id);
const S = { vert: q.get('v') === '1', sz: q.get('sz') === '1', src: 'live', film: null, uwagi: [], poprawki: {}, rate: 1, loop: false, sel: null,
  pinArmed: false, pending: null, t: Number(/t=([\d.]+)/.exec(location.hash)?.[1] ?? 0), wersja: '—', tts: false, curShot: null,
  subs: { lang: null, urls: null, cues: {} } };
const ICON = {
  play: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5v11L12 7z" fill="currentColor"/></svg>',
  pause: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 1.5h3v11H3zM8 1.5h3v11H8z" fill="currentColor"/></svg>',
  prev: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 1.5h2v11H2zM12 1.5v11L4.5 7z" fill="currentColor"/></svg>',
  next: '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M10 1.5h2v11h-2zM2 1.5v11L9.5 7z" fill="currentColor"/></svg>',
};

// Wybrane opcje są w adresie (?film=…&v=1&tempo=1.5…): odświeżenie strony i skopiowany link otwierają odtwarzacz
// tak samo. W adresie tylko wartości inne niż domyślne; czas (#t=) zostaje w kotwicy.
const FILTERS = { wszystkie: '', zrobione: 'zrobiona' };          // domyślny filtr uwag: otwarte
function saveOpts() {
  const o = { v: S.vert && 1, sz: S.sz && 1, kadr: S.src === 'mp4' && 'mp4', plik: S.src === 'mp4' && $('mp4').value.split('/').at(-1),
    tempo: S.rate !== 1 && S.rate, petla: S.loop && 1, os: Number($('zoom').value), napisy: S.subs.lang, lektor: S.tts && 1,
    uwagi: Object.keys(FILTERS).find((k) => FILTERS[k] === $('filter').value) };
  const qs = Object.entries(o).filter(([, x]) => x).map(([k, x]) => `&${k}=${encodeURIComponent(x)}`).join('');
  history.replaceState(null, '', `?film=${encodeURIComponent(FILM).replace(/%2F/g, '/')}${qs}${location.hash}`);
}

const msg = (s = '') => { $('msg').textContent = s; };
const fmtT = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`;
const round3 = (x) => Math.round(x * 1000) / 1000;
async function getJSON(url, fallback) { try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : fallback; } catch { return fallback; } }
async function save(plik, data) {
  const r = await fetch(`/api/zapisz?film=${encodeURIComponent(FILM)}&plik=${plik}`, { method: 'POST', body: JSON.stringify(data) });
  if (!r.ok) msg(`Nie zapisano ${plik}: ${await r.text()}`);
}

/* ---------- ujęcia i czas ---------- */
const shots = () => S.film?.shots ?? [];
const dur = () => S.film?.dur ?? ws?.getDuration() ?? 0;
const shotAt = (t) => shots().find((s) => t >= s.t0 && t < s.t1) ?? shots().at(-1);
const shotById = (id) => shots().find((s) => s.id === id);
const absOf = (u) => { const s = shotById(u.ujecie); return s ? [s.t0 + u.od, s.t0 + u.do] : null; };
function relOf(start, end) { const s = shotAt(start); return { ujecie: s.id, od: round3(start - s.t0), do: round3(end - s.t0) }; }

/* ---------- kadr ---------- */
let iframe = null, video = null;
// Kadr wpisany w scenę z zachowaniem proporcji; liczony z rozmiaru sceny, który od kadru nie zależy.
function fitFrame() {
  const r = $('stage').getBoundingClientRect(), ar = S.vert ? 9 / 16 : 16 / 9, pad = 32;
  let w = Math.max(0, r.width - pad), h = w / ar;
  if (h > r.height - pad) { h = Math.max(0, r.height - pad); w = h * ar; }
  $('frame').style.width = `${Math.floor(w)}px`; $('frame').style.height = `${Math.floor(h)}px`;
  $('frame').classList.toggle('pion', S.vert);
}
new ResizeObserver(fitFrame).observe($('stage'));
function frameWin() { return iframe?.contentWindow; }
// Podgląd ujęcia (klik w rozdział): głowica na początku ujęcia, a kadr pokazuje jego pełną klatkę — do pierwszego
// ruchu głowicy albo „play”, które gra ujęcie od początku.
function drawFrame(t) {
  if (S.still && (Math.abs(t - S.still.at) > 0.02 || ws?.isPlaying())) S.still = null;
  $('still').hidden = !S.still;
  if (S.src === 'live') frameWin()?.renderAt?.(S.still?.show ?? t);
}

// Film z archiwum (własny kod w proto/): ta sama strona prototypu, bez jej pasków; ujęcia z window.SHOTS.
const ARCHIVE_CSS = '.bar, #vo { display: none !important; } #wrap { max-width: none !important; } html, body { background: transparent !important; overflow: hidden; }';
/* ---------- ekran ładowania: interfejs zablokowany, dopóki film i dźwięk nie są gotowe ---------- */
let busyTimer = null;
function busy(text, sub = '') {
  clearInterval(busyTimer);
  const el = $('busy');
  if (!text) { el.hidden = true; return; }
  el.hidden = false; el.classList.remove('err'); $('busy-retry').hidden = true;
  $('busy-text').textContent = text; $('busy-sub').textContent = sub;
  const t0 = Date.now(), tick = () => { $('busy-time').textContent = `${Math.floor((Date.now() - t0) / 1000)} s`; };
  tick(); busyTimer = setInterval(tick, 500);
}
function busyError(text) {
  clearInterval(busyTimer);
  $('busy').hidden = false; $('busy').classList.add('err'); $('busy-retry').hidden = false;
  $('busy-text').textContent = text; $('busy-time').textContent = '';
  $('busy-sub').textContent = 'Popraw film i kliknij „spróbuj ponownie” (szczegóły w konsoli serwera).';
}
$('busy-retry').onclick = () => location.reload();

async function loadLive() {
  busy('Ładuję film…');
  fitFrame();
  iframe?.remove(); video?.remove(); video = null;
  iframe = document.createElement('iframe');
  const vq = `${S.vert ? 'v=1&' : ''}${S.sz ? 'sz=1&' : ''}`;
  iframe.src = S.archive ? `/${FILM}/proto/?${vq}` : `/silnik/?film=${encodeURIComponent(FILM)}&embed=1&${vq}`;
  $('frame').prepend(iframe);
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const w = frameWin();
    if (w?.FILM_ERROR) { busyError(`Film: ${w.FILM_ERROR}`); return false; }
    if (w?.FILM_READY) {
      S.film = w.FILM;
      if (S.archive) {
        const st = w.document.createElement('style'); st.textContent = ARCHIVE_CSS; w.document.head.append(st);
        S.film = { ...w.FILM, znaczniki: [], shots: (w.SHOTS ?? []).map((s, n) => ({ id: s.id ?? String(n), n, t0: s.t0, t1: s.t1 })) };
      }
      buildStrip(); renderScrub();
      $('tts').disabled = !S.film.lines?.some((l, n) => l && !recorded(n));
      drawFrame(S.t); return true;
    }
  }
  busyError('Film się nie załadował.'); return false;
}

/* ---------- miniatury ujęć i pasek przewijania ---------- */
// Miniatura = pełny kadr ujęcia tuż przed cięciem, rysowany przez silnik w ramce.
function buildStrip() {
  const w = frameWin(), src = w?.document.getElementById('c');
  if (!w?.renderAt || !src) return;
  const h = 54, iw = Math.round((h * src.width) / src.height), cv = document.createElement('canvas');
  cv.height = h * 2; cv.width = iw * 2;
  const c = cv.getContext('2d');
  c.imageSmoothingQuality = 'high';
  const items = shots().map((s) => {
    w.renderAt(Math.max(s.t0, s.t1 - 0.05));
    c.drawImage(src, 0, 0, cv.width, cv.height);
    const el = document.createElement('button');
    el.className = 'thumb'; el.dataset.id = s.id;
    el.title = `${s.n} ${s.id} · ${fmtT(s.t0)}–${fmtT(s.t1)} (${(s.t1 - s.t0).toFixed(1)} s)\nklik: pełny kadr, ▶ gra od początku · dwuklik: od razu gra`;
    el.innerHTML = `<img alt="" src="${cv.toDataURL('image/jpeg', 0.85)}" style="width:${iw}px"><span style="max-width:${Math.max(iw, 64)}px"><span class="n">${s.n}</span>${s.id}</span>`;
    // klik: głowica na początku ujęcia, a kadr = pełny kadr z miniatury (pierwsza klatka bywa pusta — elementy dopiero
    // wchodzą); „play” gra ujęcie od początku. Dwuklik: od razu odtwarzanie.
    el.onclick = () => { ws?.pause(); S.still = { at: s.t0 + 0.001, show: Math.max(s.t0, s.t1 - 0.05) }; seek(s.t0 + 0.001); };
    el.ondblclick = () => { seek(s.t0 + 0.001); setTimeout(() => ws?.play(), 80); };
    return el;
  });
  $('strip').replaceChildren(...items);
  w.renderAt(S.t);
  S.curShot = null; highlight(S.t);
}
// Pasek przewijania: cały film, ujęcia na przemian, uwagi jako kreski. Przeciąganie przewija (kadr rysuje się od razu).
function renderScrub() {
  const box = $('scrub'), head = $('scrub-head'), d = dur();
  box.querySelectorAll('.part, .tick').forEach((e) => e.remove());
  if (!d) return;
  const pct = (x) => `${(x / d) * 100}%`;
  for (const s of shots()) {
    const el = document.createElement('div');
    el.className = 'part'; el.dataset.id = s.id; el.title = `${s.n} ${s.id}`;
    el.style.left = pct(s.t0); el.style.width = pct(s.t1 - s.t0);
    box.insertBefore(el, head);
  }
  for (const u of visible()) {
    const a = absOf(u);
    if (!a) continue;
    const el = document.createElement('div');
    el.className = 'tick'; el.style.left = pct(a[0]); el.style.width = `max(3px, ${pct(a[1] - a[0])})`;
    box.insertBefore(el, head);
  }
  S.curShot = null; highlight(S.t);
}
{
  let wasPlaying = false;
  const box = $('scrub'), at = (e) => { const b = box.getBoundingClientRect(); return Math.min(dur(), Math.max(0, ((e.clientX - b.left) / b.width) * dur())); };
  box.addEventListener('pointerdown', (e) => { if (!ws) return; wasPlaying = ws.isPlaying(); ws.pause(); box.setPointerCapture(e.pointerId); seek(at(e)); });
  box.addEventListener('pointermove', (e) => { if (box.hasPointerCapture(e.pointerId)) seek(at(e)); });
  box.addEventListener('pointerup', (e) => { box.releasePointerCapture(e.pointerId); if (wasPlaying) ws.play(); });
}
/** Głowica paska, bieżące ujęcie na pasku i w miniaturach; przy zmianie ujęcia w trakcie grania — syntezator lektora. */
function highlight(t) {
  const d = dur();
  if (d) $('scrub-head').style.left = `${(t / d) * 100}%`;
  const s = shotAt(t);
  if (!s || s.id === S.curShot) return;
  S.curShot = s.id;
  document.querySelectorAll('.thumb, #scrub .part').forEach((el) => el.classList.toggle('current', el.dataset.id === s.id));
  document.querySelector(`.thumb[data-id="${CSS.escape(s.id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  if (S.tts && ws?.isPlaying()) speak(s.n);
}
/** Poprzednie / następne ujęcie; „wstecz” najpierw wraca na początek bieżącego (jak w odtwarzaczach). */
function jump(dir) {
  const cur = shotAt(S.t);
  if (!cur) return;
  const i = dir < 0 && S.t - cur.t0 > 0.25 ? cur.n : cur.n + dir;
  const s = shots()[Math.max(0, Math.min(shots().length - 1, i))];
  seek(s.t0 + 0.001);
}

/* ---------- syntezator lektora (przed nagraniem: do wyczucia tempa) ---------- */
// Czyta kwestię ujęcia na jego początku — tylko te, których nie ma w nagraniu (nagranie gra w ścieżce dźwięku).
const recorded = (n) => { const s = shots()[n]; return !!s && (S.film?.voice ?? []).some((v) => v.from >= s.t0 && v.from < s.t1); };
function speak(n) {
  if (!window.speechSynthesis) return;
  speechSynthesis.cancel();
  const line = S.film?.lines?.[n];
  if (!line || recorded(n)) return;
  const u = new SpeechSynthesisUtterance(line);
  u.lang = 'pl-PL'; u.rate = Math.min(2, S.rate * 1.1);
  const v = speechSynthesis.getVoices().find((x) => x.lang?.startsWith('pl'));
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
function setPlaying(on) {
  $('play').innerHTML = on ? ICON.pause : ICON.play;
  if (!on) window.speechSynthesis?.cancel();
  else if (S.tts) speak(shotAt(S.t)?.n);
}
/** Krótki znak na kadrze po kliknięciu (start / pauza). */
function flash(icon) {
  const el = $('paused');
  el.querySelector('span').innerHTML = icon.replace('width="14" height="14"', 'width="28" height="28"');
  el.classList.add('show');
  clearTimeout(flash.t); flash.t = setTimeout(() => el.classList.remove('show'), 450);
}

/* ---------- oś czasu ---------- */
let ws = null, regions = null, adding = false;
async function buildWave() {
  ws?.destroy();
  regions = RegionsPlugin.create();
  let opts;
  if (S.src === 'mp4') {
    iframe?.remove(); iframe = null;
    video?.remove();                                   // poprzedni plik nie może zostać pod nowym
    video = document.createElement('video');
    busy('Wczytuję plik MP4…');
    video.src = $('mp4').value; video.playsInline = true;
    $('frame').prepend(video);
    opts = { media: video };
  } else {
    busy(`Przygotowuję dźwięk filmu${S.vert ? ' (pion)' : ''}…`, 'Liczy się od nowa tylko po zmianie dźwięku (czasy ujęć, lektor) — wtedy kilkanaście sekund.');
    const r = await fetch(`/api/dzwiek?film=${encodeURIComponent(FILM)}${S.vert ? '&v=1' : ''}`);
    if (!r.ok) {
      const e = await r.text();
      if (S.archive) { busy(null); msg(`Dźwięk: ${e}`); return; }      // film z archiwum da się oglądać bez dźwięku
      busyError(`Dźwięk: ${e}`); return;
    }
    opts = { url: (await r.json()).url };
  }
  ws = WaveSurfer.create({
    container: '#wave', height: 92, waveColor: '#56627A', progressColor: '#6E9BFF', cursorColor: '#FFFFFF', cursorWidth: 2,
    normalize: true, ...opts,
    plugins: [regions, TimelinePlugin.create({ container: '#timeline', height: 18, style: { color: '#8691A5', fontSize: '11px' } })],
  });
  // `ready` tylko raz: wavesurfer potrafi zgłosić go ponownie i cofnąć czas do starego S.t
  ws.once('ready', () => {
    // dźwięk innej długości niż film = inna wersja (np. stary serwer daje pionowi dźwięk 16:9) — lektor by się rozjechał
    const gap = ws.getDuration() - (S.film?.dur ?? ws.getDuration());
    if (S.src === 'live' && !S.archive && Math.abs(gap) > 0.5) {
      busyError(`Dźwięk ma ${ws.getDuration().toFixed(1)} s, a film ${S.film.dur.toFixed(1)} s. Serwer jest pewnie starszy niż odtwarzacz — uruchom go ponownie.`);
      return;
    }
    ws.setPlaybackRate(S.rate); ws.setTime(Math.min(S.t, ws.getDuration()));
    if (Number($('zoom').value)) ws.zoom(Number($('zoom').value));
    paintRegions(); busy(null);
  });
  ws.on('error', (e) => busyError(`Dźwięk: ${e?.message ?? e}`));
  ws.on('timeupdate', onTime);
  ws.on('seeking', onTime);
  // po przebudowie osi: scena ma znowu stałą wysokość; mierzenie w trakcie (bez fali) dawało za duży kadr
  requestAnimationFrame(fitFrame);
  ws.on('play', () => { S.still = null; drawFrame(S.t); setPlaying(true); });
  ws.on('pause', () => setPlaying(false));
  regions.enableDragSelection({ color: 'rgba(237,181,74,0.30)' });
  regions.on('region-created', (r) => { if (!adding) openForm(r.start, r.end, r); });
  regions.on('region-updated', onRegionMoved);
  regions.on('region-clicked', (r, e) => {
    e.stopPropagation();
    const u = S.uwagi.find((x) => `u-${x.id}` === r.id);
    if (u || r === S.pending?.region) select({ region: r, uwaga: u ?? null });
    ws.setTime(r.start);
  });
}

// Podpis na fali: numer ujęcia i uwagi u góry (nazwy ujęć są w miniaturach), znaczniki u dołu w trzech rzędach
// (`row`) — inaczej nachodziły na siebie.
function label(text, color, row = -1) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `font: 500 11px Plex, sans-serif; color: ${color}; padding: 2px 4px; white-space: nowrap; pointer-events: none;
    ${row >= 0 ? `position: absolute; bottom: ${row * 13}px; left: 0;` : 'max-width: 100%; overflow: hidden; text-overflow: ellipsis;'}`;
  return el;
}
function paintRegions() {
  if (!regions) return;
  adding = true;
  regions.clearRegions();
  shots().forEach((s, i) => {
    const r = regions.addRegion({ id: `s-${s.id}`, start: s.t0, end: s.t1, drag: false, resize: false,
      color: i % 2 ? 'rgba(110,155,255,0.10)' : 'rgba(110,155,255,0.04)', content: label(`${s.n}`, '#8691A5') });
    r.element.style.pointerEvents = 'none';
  });
  visible().forEach((u, i) => {
    const a = absOf(u);
    if (!a) return;
    regions.addRegion({ id: `u-${u.id}`, start: a[0], end: Math.max(a[1], a[0] + 0.08), drag: true, resize: true,
      color: uwagaColor(u), content: label(`${i + 1}`, '#EDB54A') });
  });
  (S.film?.znaczniki ?? []).forEach((z, i) => {
    regions.addRegion({ id: `z-${z.name}`, start: z.t, drag: true, resize: false, color: '#6E9BFF', content: label(z.name, '#6E9BFF', i % 3) });
  });
  adding = false;
  renderScrub();
  // zaznaczona uwaga po przerysowaniu: nowy obiekt regionu
  if (S.sel?.uwaga) {
    const r = regions.getRegions().find((x) => x.id === `u-${S.sel.uwaga.id}`);
    select(r && S.uwagi.includes(S.sel.uwaga) ? { region: r, uwaga: S.sel.uwaga } : null);
  }
}

/* ---------- zaznaczenie ---------- */
// S.sel = { region, uwaga } — świeżo przeciągnięty fragment (uwaga: null) albo kliknięta uwaga. Pętla gra zaznaczenie.
const uwagaColor = (u) => (u.stan === 'zrobiona' ? 'rgba(134,145,165,0.18)' : 'rgba(237,181,74,0.28)');
function select(sel) {
  if (S.sel?.uwaga && S.sel.region !== sel?.region) S.sel.region.setOptions({ color: uwagaColor(S.sel.uwaga) });
  S.sel = sel;
  if (sel?.uwaga) sel.region.setOptions({ color: 'rgba(237,181,74,0.6)' });
  $('unsel').hidden = !sel;
  $('deluw').hidden = !sel?.uwaga;
}
/** Usuwa zaznaczenie: nowy fragment znika z osi (i formularz z nim), zapisana uwaga tylko przestaje być zaznaczona. */
function clearSelection() {
  if (S.pending) closeForm(); else select(null);
}
async function deleteUwaga(u) {
  if (!confirm(`Usunąć uwagę „${u.tekst.slice(0, 80)}”?`)) return;
  S.uwagi = S.uwagi.filter((x) => x !== u);
  select(null);
  await save('uwagi.json', S.uwagi); paintRegions(); renderList(); renderPins();
}

async function onRegionMoved(r) {
  if (r.id.startsWith('u-')) {
    const u = S.uwagi.find((x) => `u-${x.id}` === r.id);
    select({ region: r, uwaga: u });
    Object.assign(u, relOf(r.start, r.end));
    await save('uwagi.json', S.uwagi); renderList();
  } else if (r.id.startsWith('z-')) {
    const z = S.film.znaczniki.find((x) => `z-${x.name}` === r.id);
    const d = round3(r.start - z.base);
    if (Math.abs(d) < 0.001) delete S.poprawki[z.name]; else S.poprawki[z.name] = d;
    await save('znaczniki.json', S.poprawki);
    msg(`Znacznik „${z.name}”: ${d >= 0 ? '+' : ''}${d.toFixed(3)} s względem frazy — przeładowuję kadr`);
    await reload();
  }
}

// Przewijanie klawiszami: kadr od razu, a media dostają tylko ostatni czas z serii — przy szybkich, kolejnych
// przypisaniach currentTime element audio zostawał na pierwszym.
let seekTo = null, seekBusy = false;
function seek(t) {
  seekTo = t; onTime(t);
  if (!seekBusy) flushSeek();
}
function flushSeek() {
  if (seekTo == null) return;
  const t = seekTo; seekTo = null; seekBusy = true;
  ws?.setTime(t);
  setTimeout(() => { seekBusy = false; flushSeek(); }, 60);
}

function onTime(t) {
  S.t = t;
  const s = shotAt(t);
  $('time').textContent = `${fmtT(t)} / ${fmtT(dur())}`;
  $('shot').textContent = s ? `ujęcie ${s.n} · ${s.id}` : '';
  if (S.loop && S.sel && ws?.isPlaying() && t >= S.sel.region.end) ws.setTime(S.sel.region.start);
  drawFrame(t);
  highlight(t);
  renderPins();
  renderCaption();
  document.querySelectorAll('.uwaga').forEach((el) => {
    const u = S.uwagi.find((x) => x.id === el.dataset.id), a = u && absOf(u);
    el.classList.toggle('current', !!a && t >= a[0] - 0.05 && t <= a[1] + 0.05);
  });
}

/* ---------- uwagi ---------- */
const visible = () => S.uwagi.filter((u) => !$('filter').value || u.stan === $('filter').value);
function openForm(start, end, region = null, pin = null) {
  if (S.pending?.region && !S.pending.saved) S.pending.region.remove();   // poprzedni, niezapisany fragment
  S.pending = { start, end: Math.max(end, start), region, pin };
  select(region ? { region, uwaga: null } : null);
  const s = shotAt(start);
  $('form-where').textContent = `ujęcie ${s.n} „${s.id}” · ${fmtT(start)}–${fmtT(end)}${pin ? ' · pinezka' : ''}`;
  $('form').classList.add('open');
  $('form-text').value = '';
  $('form-text').focus();
}
function closeForm() {
  if (S.pending?.region && !S.pending.saved) S.pending.region.remove();
  if (S.sel && S.sel.region === S.pending?.region) select(null);
  S.pending = null; $('form').classList.remove('open');
}
async function saveForm() {
  const p = S.pending, text = $('form-text').value.trim();
  if (!p || !text) return;
  p.saved = true;
  S.uwagi.push({ id: Date.now().toString(36), ...relOf(p.start, p.end), tekst: text, rodzaj: $('form-kind').value, stan: 'otwarta',
    pinezka: p.pin, wersja: S.wersja, utworzono: new Date().toISOString().slice(0, 16) });
  await save('uwagi.json', S.uwagi);
  closeForm(); paintRegions(); renderList(); renderPins();
}
function renderList() {
  const list = visible().map((u) => ({ u, a: absOf(u) })).sort((x, y) => (x.a?.[0] ?? 1e9) - (y.a?.[0] ?? 1e9));
  $('list').innerHTML = list.length ? '' : `<div class="empty">Brak uwag. Przeciągnij po fali dźwięku, żeby zaznaczyć fragment,
    albo naciśnij <kbd>N</kbd> w bieżącym miejscu. Pinezka (<kbd>P</kbd>) wskazuje miejsce w kadrze.</div>`;
  list.forEach(({ u, a }, i) => {
    const el = document.createElement('div');
    el.className = `uwaga${u.stan === 'zrobiona' ? ' done' : ''}`; el.dataset.id = u.id;
    el.innerHTML = `<div class="meta"><span class="mono" style="color:var(--amber)">${i + 1}</span>
      <span class="mono">${a ? fmtT(a[0]) : 'ujęcia nie ma'}</span><span class="chip">${u.ujecie}</span><span class="chip">${u.rodzaj}</span>
      ${u.pinezka ? '<span class="chip">pinezka</span>' : ''}</div><div class="txt"></div>
      ${u.rozwiazanie ? `<div style="color:var(--ok);margin-top:4px">✓ ${u.rozwiazanie}</div>` : ''}
      <div class="act"><button data-a="stan">${u.stan === 'zrobiona' ? 'otwórz ponownie' : 'zrobione'}</button><button data-a="del">usuń</button></div>`;
    el.querySelector('.txt').textContent = u.tekst;
    el.onclick = async (e) => {
      const act = e.target.dataset?.a;
      if (act === 'stan') { u.stan = u.stan === 'zrobiona' ? 'otwarta' : 'zrobiona'; await save('uwagi.json', S.uwagi); paintRegions(); renderList(); return; }
      if (act === 'del') { await deleteUwaga(u); return; }
      const r = regions?.getRegions().find((x) => x.id === `u-${u.id}`);
      if (r) { select({ region: r, uwaga: u }); ws.setTime(r.start); }
    };
    $('list').append(el);
  });
}
function renderPins() {
  const box = $('pins'), fmt = S.vert ? 'pion' : '16:9';
  box.innerHTML = '';
  visible().forEach((u, i) => {
    const a = absOf(u);
    if (!u.pinezka || u.pinezka.format !== fmt || !a || S.t < a[0] - 0.3 || S.t > a[1] + 0.3) return;
    const el = document.createElement('div');
    el.className = 'pin'; el.textContent = i + 1;
    el.style.left = `${u.pinezka.x * 100}%`; el.style.top = `${u.pinezka.y * 100}%`;
    el.title = u.tekst; box.append(el);
  });
}
// Kliknięcie w kadr: start / pauza; z uzbrojoną pinezką — miejsce nowej uwagi.
$('pins').addEventListener('click', (e) => {
  if (!S.pinArmed) {
    if (!ws) return;
    const willPlay = !ws.isPlaying();
    ws.playPause(); flash(willPlay ? ICON.play : ICON.pause);
    return;
  }
  const b = $('pins').getBoundingClientRect();
  const pin = { x: round3((e.clientX - b.left) / b.width), y: round3((e.clientY - b.top) / b.height), format: S.vert ? 'pion' : '16:9' };
  setPin(false); ws.pause();
  openForm(S.t, S.t + 0.5, null, pin);
});
function setPin(on) { S.pinArmed = on; $('pins').classList.toggle('armed', on); $('pin').classList.toggle('on', on); }

/* ---------- napisy na kadrze (VTT z silnik/napisy.mjs, generowane przez serwer, gdy ich brak) ---------- */
const LANGS = ['pl', 'en', 'cs'];
const toSec = (s) => s.split(':').reduce((acc, x) => acc * 60 + Number(x), 0);
function parseVtt(text) {
  return text.split(/\r?\n\r?\n/).map((b) => b.split(/\r?\n/)).flatMap((lines) => {
    const i = lines.findIndex((l) => l.includes('-->'));
    if (i < 0) return [];
    const [from, to] = lines[i].split('-->').map((x) => toSec(x.trim().split(/\s/)[0]));
    return [{ from, to, text: lines.slice(i + 1).join('\n') }];
  });
}
async function loadSubs() {
  msg('Przygotowuję napisy…');
  S.subs.urls = await getJSON(`/api/napisy?film=${encodeURIComponent(FILM)}`, {});
  S.subs.cues = {};
  msg();
}
async function setSubs(lang) {
  if (lang && !S.subs.cues[lang]) S.subs.cues[lang] = S.subs.urls[lang] ? parseVtt(await (await fetch(S.subs.urls[lang], { cache: 'no-store' })).text()) : [];
  S.subs.lang = lang;
  $('subs').textContent = `napisy: ${lang ? lang.toUpperCase() : 'wył.'}`; toggle('subs', !!lang);
  renderCaption(); saveOpts();
}
// języki z plikiem VTT; PL także bez niego, gdy są kwestie bez nagrania (napis szacunkowy)
const availSubs = () => LANGS.filter((l) => S.subs.urls[l] || (l === 'pl' && S.film?.lines?.some((x, n) => x && !recorded(n))));
async function cycleSubs() {
  if ($('subs').disabled) return;
  if (!S.subs.urls) await loadSubs();
  const avail = availSubs();
  if (!avail.length) { msg('Brak napisów: film nie ma nagrania lektora z tekstem (FILM.voice).'); return; }
  const order = [null, ...avail], next = order[(order.indexOf(S.subs.lang) + 1) % order.length];
  const missing = LANGS.filter((l) => !S.subs.urls[l]);
  msg(next && missing.length ? `Brak napisów ${missing.join(', ').toUpperCase()} — tłumaczenia w ${FILM}/napisy/<język>.json` : '');
  await setSubs(next);
}
function renderCaption() {
  let c = S.subs.lang && S.subs.cues[S.subs.lang]?.find((x) => S.t >= x.from && S.t < x.to);
  // kwestia bez nagrania: cały tekst przez czas ujęcia (szacunek — czasy zdań da dopiero nagranie lektora)
  if (!c && S.subs.lang === 'pl') { const s = shotAt(S.t), line = s && !recorded(s.n) && S.film?.lines?.[s.n]; if (line) c = { text: line, est: true }; }
  const box = $('caption');
  if (box.dataset.text === (c?.text ?? '')) return;
  box.dataset.text = c?.text ?? ''; box.innerHTML = '';
  if (c) { const sp = document.createElement('span'); sp.textContent = c.text; sp.classList.toggle('est', !!c.est); box.append(sp); }
}

/* ---------- sterowanie ---------- */
async function reload() {
  const t = S.t;
  S.poprawki = await getJSON(`/${FILM}/znaczniki.json`, {});
  // po zmianie kodu mogły się zmienić czasy ujęć i dźwięk — fala od nowa (dźwięk z pamięci, gdy się nie zmienił)
  if (S.src === 'live' && await loadLive()) await buildWave();
  S.t = t; paintRegions(); drawFrame(t);
  // napisy od nowa (zmieniony tekst lektora albo tłumaczenie)
  if (S.subs.urls) { const lang = S.subs.lang; await loadSubs(); await setSubs(S.subs.urls[lang] ? lang : null); }
}
const toggle = (id, on) => $(id).classList.toggle('on', on);
$('play').onclick = () => ws?.playPause();
// Format (16:9 / pion) wybierają tylko te przyciski — także w trybie MP4, gdzie decyduje o liście plików.
async function setFormat(vert) {
  S.vert = vert; toggle('fmt-h', !vert); toggle('fmt-v', vert);
  // w pionie napisy rysuje silnik w kadrze (a czasy są inne niż w VTT z 16:9)
  $('subs').disabled = vert; if (vert && S.subs.lang) await setSubs(null);
  saveOpts();
  if (S.src === 'mp4') await showMp4(); else if (await loadLive()) await buildWave();
}
$('fmt-h').onclick = () => setFormat(false);
$('fmt-v').onclick = () => setFormat(true);
$('sz').onclick = async () => { S.sz = !S.sz; toggle('sz', S.sz); saveOpts(); if (S.src === 'live') await loadLive(); };
$('rate').onchange = () => { S.rate = Number($('rate').value); ws?.setPlaybackRate(S.rate); $('rate').blur(); saveOpts(); };
$('prev').onclick = () => jump(-1);
$('next').onclick = () => jump(1);
function setTts(on) {
  S.tts = on; toggle('tts', on); $('tts').textContent = `lektor syntez.: ${on ? 'wł.' : 'wył.'}`;
  if (!on) window.speechSynthesis?.cancel(); else if (ws?.isPlaying()) speak(shotAt(S.t)?.n);
}
$('tts').onclick = () => { setTts(!S.tts); saveOpts(); };
$('keys').onclick = () => { $('help').hidden = !$('help').hidden; toggle('keys', !$('help').hidden); };
$('loop').onclick = () => { S.loop = !S.loop; toggle('loop', S.loop); saveOpts(); };
$('reload').onclick = reload;
$('pin').onclick = () => setPin(!S.pinArmed);
$('filter').onchange = () => { paintRegions(); renderList(); renderPins(); saveOpts(); };
$('zoom').oninput = () => ws?.zoom(Number($('zoom').value));
$('zoom').onchange = saveOpts;                     // po puszczeniu suwaka: Safari nie pozwala na setki replaceState
$('form-save').onclick = saveForm;
$('form-cancel').onclick = closeForm;
$('unsel').onclick = clearSelection;
$('deluw').onclick = () => S.sel?.uwaga && deleteUwaga(S.sel.uwaga);
$('subs').onclick = cycleSubs;
$('src-live').onclick = async () => {
  S.src = 'live'; toggle('src-live', true); toggle('src-mp4', false); $('mp4').hidden = true; saveOpts();
  await loadLive(); await buildWave();
};
const isVertFile = (f) => /-pion|9x16/.test(f.split('/').at(-1));
/** Kadr z pliku MP4 (`want` = nazwa pliku z adresu; bez niej najnowszy w danym formacie). */
async function showMp4(want) {
  const files = (await getJSON(`/api/pliki?film=${encodeURIComponent(FILM)}`, [])).filter((f) => isVertFile(f) === S.vert);
  if (!files.length) { msg(`W ${FILM}/wynik/ nie ma pliku MP4 w formacie ${S.vert ? 'pion' : '16:9'} — najpierw eksport (np. --szkic${S.vert ? ' --vert' : ''}).`); return false; }
  msg();
  $('mp4').innerHTML = files.map((f) => `<option value="${f}">${f.split('/').at(-1)}</option>`).join('');
  const pick = files.find((f) => f.split('/').at(-1) === want);
  if (pick) $('mp4').value = pick;
  $('mp4').hidden = false; S.src = 'mp4'; toggle('src-live', false); toggle('src-mp4', true); saveOpts();
  await buildWave();
  return true;
}
$('src-mp4').onclick = () => showMp4();
$('mp4').onchange = () => { saveOpts(); buildWave(); };
document.addEventListener('keydown', (e) => {
  if (e.target.matches?.('textarea, input, select')) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) saveForm();
    if (e.key === 'Escape') closeForm();
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const step = e.shiftKey ? 1 : 1 / FPS, now = S.t, k = e.key.toLowerCase();
  const keys = { ' ': () => ws?.playPause(), arrowright: () => ws && seek(Math.min(ws.getDuration(), now + step)),
    arrowleft: () => ws && seek(Math.max(0, now - step)), n: () => { ws?.pause(); openForm(now, now + 1); },
    p: () => setPin(!S.pinArmed), l: () => $('loop').click(), r: () => reload(), c: () => cycleSubs(),
    '[': () => jump(-1), ']': () => jump(1), home: () => seek(0), end: () => seek(Math.max(0, dur() - 0.05)), '?': () => $('keys').click(),
    escape: () => { clearSelection(); setPin(false); $('help').hidden = true; toggle('keys', false); },
    delete: () => S.sel?.uwaga && deleteUwaga(S.sel.uwaga), backspace: () => S.sel?.uwaga && deleteUwaga(S.sel.uwaga) };
  // preventDefault: inaczej litera skrótu trafia do pola uwagi, które właśnie dostało fokus
  if (keys[k]) { e.preventDefault(); keys[k](); }
});

/* ---------- start ---------- */
$('title').textContent = FILM.split('/').at(-1);
document.title = `Odtwarzacz — ${FILM.split('/').at(-1)}`;
toggle('fmt-h', !S.vert); toggle('fmt-v', S.vert); toggle('sz', S.sz);
$('play').innerHTML = ICON.play; $('prev').innerHTML = ICON.prev; $('next').innerHTML = ICON.next;
fitFrame();
setPin(false);
// opcje z adresu (zapisuje je saveOpts); format i strefy są już w S
{
  const rate = q.get('tempo');
  if ([...$('rate').options].some((o) => o.value === rate)) { $('rate').value = rate; S.rate = Number(rate); }
  S.loop = q.get('petla') === '1'; toggle('loop', S.loop);
  $('zoom').value = Number(q.get('os')) || 0;
  if (Object.hasOwn(FILTERS, q.get('uwagi') ?? '')) $('filter').value = FILTERS[q.get('uwagi')];
  if (q.get('lektor') === '1') setTts(true);
}
S.wersja =(await getJSON(`/api/wersja?film=${encodeURIComponent(FILM)}`, {})).wersja ?? '—';
$('wersja').textContent = S.wersja;
S.archive = !(await fetch(`/${FILM}/film.js`, { method: 'HEAD' })).ok && (await fetch(`/${FILM}/proto/film.js`, { method: 'HEAD' })).ok;
if (S.archive) $('wersja').textContent += ' · archiwum (własny kod, bez znaczników)';
S.uwagi = await getJSON(`/${FILM}/uwagi.json`, []);
S.poprawki = await getJSON(`/${FILM}/znaczniki.json`, {});
$('subs').disabled = S.vert;
if (await loadLive()) {
  // kadr z pliku MP4, gdy adres go wskazuje i plik jest; inaczej na żywo
  if (!(q.get('kadr') === 'mp4' && await showMp4(q.get('plik')))) await buildWave();
  renderList();
  const lang = q.get('napisy');
  if (lang && !S.vert) { await loadSubs(); if (availSubs().includes(lang)) await setSubs(lang); }
}
saveOpts();                                        // adres bez wartości, których nie dało się przywrócić
window.ODTWARZACZ = S;
Object.defineProperty(S, "ws", { get: () => ws });
