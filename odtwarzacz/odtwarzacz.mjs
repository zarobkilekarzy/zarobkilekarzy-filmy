// Odtwarzacz montażowy: kadr (silnik na żywo albo gotowy MP4) + oś czasu wavesurfer z ujęciami, uwagami
// i nazwanymi znacznikami. Uwagi → <film>/uwagi.json, przesunięte znaczniki → <film>/znaczniki.json (przez serwer).
// Uwaga jest przypięta do ujęcia (`ujecie` + `od`/`do` od jego cięcia), więc zostaje na miejscu po zmianie montażu.
import WaveSurfer from '/node_modules/wavesurfer.js/dist/wavesurfer.esm.js';
import RegionsPlugin from '/node_modules/wavesurfer.js/dist/plugins/regions.esm.js';
import TimelinePlugin from '/node_modules/wavesurfer.js/dist/plugins/timeline.esm.js';

const q = new URLSearchParams(location.search);
const FILM = (q.get('film') ?? 'szablon').replace(/^\/+|\/+$/g, '');
const FPS = 30;
const $ = (id) => document.getElementById(id);
const S = { vert: q.get('v') === '1', sz: false, src: 'live', film: null, uwagi: [], poprawki: {}, rate: 1, loop: false, sel: null,
  pinArmed: false, pending: null, t: 0, wersja: '—', subs: { lang: null, urls: null, cues: {} } };

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
function drawFrame(t) { if (S.src === 'live') frameWin()?.renderAt?.(t); }

// Film z archiwum (własny kod w proto/): ta sama strona prototypu, bez jej pasków; ujęcia z window.SHOTS.
const ARCHIVE_CSS = '.bar, #vo { display: none !important; } #wrap { max-width: none !important; } html, body { background: transparent !important; overflow: hidden; }';
async function loadLive() {
  fitFrame();
  iframe?.remove(); video?.remove(); video = null;
  iframe = document.createElement('iframe');
  const vq = `${S.vert ? 'v=1&' : ''}${S.sz ? 'sz=1&' : ''}`;
  iframe.src = S.archive ? `/${FILM}/proto/?${vq}` : `/silnik/?film=${encodeURIComponent(FILM)}&embed=1&${vq}`;
  $('frame').prepend(iframe);
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const w = frameWin();
    if (w?.FILM_ERROR) { msg(`Film: ${w.FILM_ERROR}`); return false; }
    if (w?.FILM_READY) {
      S.film = w.FILM;
      if (S.archive) {
        const st = w.document.createElement('style'); st.textContent = ARCHIVE_CSS; w.document.head.append(st);
        S.film = { ...w.FILM, znaczniki: [], shots: (w.SHOTS ?? []).map((s, n) => ({ id: s.id ?? String(n), n, t0: s.t0, t1: s.t1 })) };
      }
      drawFrame(S.t); return true;
    }
  }
  msg('Film się nie załadował.'); return false;
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
    video.src = $('mp4').value; video.playsInline = true;
    $('frame').prepend(video);
    opts = { media: video };
  } else {
    msg('Przygotowuję dźwięk filmu…');
    const r = await fetch(`/api/dzwiek?film=${encodeURIComponent(FILM)}`);
    if (!r.ok) { msg(`Dźwięk: ${await r.text()}`); return; }
    opts = { url: (await r.json()).url };
    msg();
  }
  ws = WaveSurfer.create({
    container: '#wave', height: 92, waveColor: '#56627A', progressColor: '#6E9BFF', cursorColor: '#EEF2F8', cursorWidth: 1,
    normalize: true, ...opts,
    plugins: [regions, TimelinePlugin.create({ container: '#timeline', height: 18, style: { color: '#8691A5', fontSize: '11px' } })],
  });
  // `ready` tylko raz: wavesurfer potrafi zgłosić go ponownie i cofnąć czas do starego S.t
  ws.once('ready', () => { ws.setPlaybackRate(S.rate); ws.setTime(Math.min(S.t, ws.getDuration())); paintRegions(); });
  ws.on('timeupdate', onTime);
  ws.on('seeking', onTime);
  // po przebudowie osi: scena ma znowu stałą wysokość; mierzenie w trakcie (bez fali) dawało za duży kadr
  requestAnimationFrame(fitFrame);
  ws.on('play', () => { $('play').textContent = '❚❚'; });
  ws.on('pause', () => { $('play').textContent = '▶'; });
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

function label(text, color) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = `font: 500 10px 'Plex Mono', monospace; letter-spacing: .05em; color: ${color}; padding: 2px 4px; white-space: nowrap; pointer-events: none;`;
  return el;
}
function paintRegions() {
  if (!regions) return;
  adding = true;
  regions.clearRegions();
  shots().forEach((s, i) => {
    const r = regions.addRegion({ id: `s-${s.id}`, start: s.t0, end: s.t1, drag: false, resize: false,
      color: i % 2 ? 'rgba(110,155,255,0.10)' : 'rgba(110,155,255,0.04)', content: label(`${s.n} ${s.id}`, '#8691A5') });
    r.element.style.pointerEvents = 'none';
  });
  visible().forEach((u, i) => {
    const a = absOf(u);
    if (!a) return;
    regions.addRegion({ id: `u-${u.id}`, start: a[0], end: Math.max(a[1], a[0] + 0.08), drag: true, resize: true,
      color: uwagaColor(u), content: label(`${i + 1}`, '#EDB54A') });
  });
  for (const z of S.film?.znaczniki ?? []) {
    regions.addRegion({ id: `z-${z.name}`, start: z.t, drag: true, resize: false, color: '#6E9BFF', content: label(z.name, '#6E9BFF') });
  }
  adding = false;
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
  ws.setTime(t);
  setTimeout(() => { seekBusy = false; flushSeek(); }, 60);
}

function onTime(t) {
  S.t = t;
  $('time').textContent = `${fmtT(t)} · ${shotAt(t)?.id ?? ''}`;
  if (S.loop && S.sel && ws.isPlaying() && t >= S.sel.region.end) ws.setTime(S.sel.region.start);
  drawFrame(t);
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
      ${u.rozwiazanie ? `<div class="mono" style="color:var(--ok);margin-top:4px">✓ ${u.rozwiazanie}</div>` : ''}
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
$('pins').addEventListener('click', (e) => {
  if (!S.pinArmed) return;
  const b = $('pins').getBoundingClientRect();
  const pin = { x: round3((e.clientX - b.left) / b.width), y: round3((e.clientY - b.top) / b.height), format: S.vert ? 'pion' : '16:9' };
  setPin(false); ws.pause();
  openForm(S.t, S.t + 0.5, null, pin);
});
function setPin(on) { S.pinArmed = on; $('pins').classList.toggle('armed', on); $('pin').classList.toggle('on', on); $('pins').style.pointerEvents = on ? 'auto' : 'none'; }

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
  if (lang && !S.subs.cues[lang]) S.subs.cues[lang] = parseVtt(await (await fetch(S.subs.urls[lang], { cache: 'no-store' })).text());
  S.subs.lang = lang;
  $('subs').textContent = `napisy: ${lang ? lang.toUpperCase() : 'wył.'}`; toggle('subs', !!lang);
  renderCaption();
}
async function cycleSubs() {
  if (!S.subs.urls) await loadSubs();
  const avail = LANGS.filter((l) => S.subs.urls[l]);
  if (!avail.length) { msg('Brak napisów: film nie ma nagrania lektora z tekstem (FILM.voice).'); return; }
  const order = [null, ...avail], next = order[(order.indexOf(S.subs.lang) + 1) % order.length];
  const missing = LANGS.filter((l) => !S.subs.urls[l]);
  msg(next && missing.length ? `Brak napisów ${missing.join(', ').toUpperCase()} — tłumaczenia w ${FILM}/napisy/<język>.json` : '');
  await setSubs(next);
}
function renderCaption() {
  const c = S.subs.lang && S.subs.cues[S.subs.lang]?.find((x) => S.t >= x.from && S.t < x.to);
  const box = $('caption');
  if (box.dataset.text === (c?.text ?? '')) return;
  box.dataset.text = c?.text ?? ''; box.innerHTML = '';
  if (c) { const sp = document.createElement('span'); sp.textContent = c.text; box.append(sp); }
}

/* ---------- sterowanie ---------- */
async function reload() {
  const t = S.t;
  S.poprawki = await getJSON(`/${FILM}/znaczniki.json`, {});
  if (S.src === 'live') await loadLive();
  S.t = t; paintRegions(); drawFrame(t);
  // napisy od nowa (zmieniony tekst lektora albo tłumaczenie)
  if (S.subs.urls) { const lang = S.subs.lang; await loadSubs(); await setSubs(S.subs.urls[lang] ? lang : null); }
}
const toggle = (id, on) => $(id).classList.toggle('on', on);
$('play').onclick = () => ws?.playPause();
// Format (16:9 / pion) wybierają tylko te przyciski — także w trybie MP4, gdzie decyduje o liście plików.
async function setFormat(vert) {
  S.vert = vert; toggle('fmt-h', !vert); toggle('fmt-v', vert);
  if (S.src === 'mp4') await showMp4(); else await loadLive();
}
$('fmt-h').onclick = () => setFormat(false);
$('fmt-v').onclick = () => setFormat(true);
$('sz').onclick = async () => { S.sz = !S.sz; toggle('sz', S.sz); if (S.src === 'live') await loadLive(); };
$('rate').onclick = () => { S.rate = S.rate === 1 ? 0.5 : S.rate === 0.5 ? 0.25 : 1; ws?.setPlaybackRate(S.rate); $('rate').textContent = `tempo ${S.rate}×`; };
$('loop').onclick = () => { S.loop = !S.loop; toggle('loop', S.loop); };
$('reload').onclick = reload;
$('pin').onclick = () => setPin(!S.pinArmed);
$('filter').onchange = () => { paintRegions(); renderList(); renderPins(); };
$('zoom').oninput = () => ws?.zoom(Number($('zoom').value));
$('form-save').onclick = saveForm;
$('form-cancel').onclick = closeForm;
$('unsel').onclick = clearSelection;
$('deluw').onclick = () => S.sel?.uwaga && deleteUwaga(S.sel.uwaga);
$('subs').onclick = cycleSubs;
$('src-live').onclick = async () => { S.src = 'live'; toggle('src-live', true); toggle('src-mp4', false); $('mp4').hidden = true; await loadLive(); await buildWave(); };
const isVertFile = (f) => /-pion|9x16/.test(f.split('/').at(-1));
async function showMp4() {
  const files = (await getJSON(`/api/pliki?film=${encodeURIComponent(FILM)}`, [])).filter((f) => isVertFile(f) === S.vert);
  if (!files.length) { msg(`W ${FILM}/wynik/ nie ma pliku MP4 w formacie ${S.vert ? 'pion' : '16:9'} — najpierw eksport (np. --szkic${S.vert ? ' --vert' : ''}).`); return false; }
  msg();
  $('mp4').innerHTML = files.map((f) => `<option value="${f}">${f.split('/').at(-1)}</option>`).join('');
  $('mp4').hidden = false; S.src = 'mp4'; toggle('src-live', false); toggle('src-mp4', true);
  await buildWave();
  return true;
}
$('src-mp4').onclick = showMp4;
$('mp4').onchange = () => buildWave();
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
    escape: () => { clearSelection(); setPin(false); },
    delete: () => S.sel?.uwaga && deleteUwaga(S.sel.uwaga), backspace: () => S.sel?.uwaga && deleteUwaga(S.sel.uwaga) };
  // preventDefault: inaczej litera skrótu trafia do pola uwagi, które właśnie dostało fokus
  if (keys[k]) { e.preventDefault(); keys[k](); }
});

/* ---------- start ---------- */
$('title').textContent = FILM.split('/').at(-1);
document.title = `Odtwarzacz — ${FILM.split('/').at(-1)}`;
toggle('fmt-h', !S.vert); toggle('fmt-v', S.vert);
fitFrame();
setPin(false);
S.wersja = (await getJSON(`/api/wersja?film=${encodeURIComponent(FILM)}`, {})).wersja ?? '—';
$('wersja').textContent = S.wersja;
S.archive = !(await fetch(`/${FILM}/film.js`, { method: 'HEAD' })).ok && (await fetch(`/${FILM}/proto/film.js`, { method: 'HEAD' })).ok;
if (S.archive) $('wersja').textContent += ' · archiwum (własny kod, bez znaczników)';
S.uwagi = await getJSON(`/${FILM}/uwagi.json`, []);
S.poprawki = await getJSON(`/${FILM}/znaczniki.json`, {});
if (await loadLive()) { await buildWave(); renderList(); }
window.ODTWARZACZ = S;
Object.defineProperty(S, "ws", { get: () => ws });
