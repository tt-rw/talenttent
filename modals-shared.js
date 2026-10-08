// ─── Kies-en-badge component (TT-116, 21-08-2026) ───────────────────────────
// Eén herbruikbaar patroon voor het kiezen van instrumenten en genres, dat
// het altijd-zichtbare knoppenraster vervangt door een pulldown-veld: tik
// erop, een volledig-scherm lijst opent, kies een item. Gekozen items
// blijven staan als badge tot verwijderd. Gebruikt op 7 van de 8 plekken in
// de app (genre × 4, instrument-filter × 2, "wij zoeken nog" bij een band).
// De achtste plek — de eigen instrumentkeuze in de wizard, mét niveau — is
// een aparte, iets uitgebreidere versie hieronder (init/renderInstrumentBadges
// e.v.), omdat die een extra niveaustap nodig heeft.
//
// De onderliggende arrays (state.genres, filterInstruments, enz.) blijven
// ongewijzigd de bron van waarheid — dit component tekent alleen de UI
// eromheen en muteert die arrays in-place (push/splice), nooit een nieuwe
// array toewijzen. Zo blijft alle bestaande zoek-/opslaglogica intact.

// TT-124 (22-08-2026): gedwongen regelafbreking weggehaald op Ronalds
// verzoek — de badge is nu breed genoeg voor de volledige naam op één
// regel (zie .picker-badge hieronder, was 108px, nu 168px). Was eerder
// ingevoerd om een lelijke afbreking te voorkomen in de kleine badge; die
// reden vervalt nu de badge zelf breed genoeg is.
function pickerDisplayLabel(value) {
  return escHtml(value);
}

// Haalt een tekst tussen haakjes aan het eind weg. "1. Beginner (Bedroom)"
// -> "1. Beginner". Ronalds instructie (21-08-2026): geen haakjes meer bij
// niveaunamen, overal waar ze getoond worden.
function stripParenthetical(s) {
  return String(s).replace(/\s*\([^)]*\)\s*$/, '').trim();
}

const PICKERS = {}; // registry: picker-id -> cfg, voor badges/verwijderen vanuit innerHTML

function initPicker(cfg) {
  PICKERS[cfg.id] = cfg;
  cfg.fieldEl = document.getElementById(cfg.fieldId);
  cfg.badgeRowEl = document.getElementById(cfg.badgeRowId);
  cfg.fieldEl.onclick = () => openPickerList(cfg.id);
  renderPickerBadges(cfg);
  return cfg;
}

function renderPickerBadges(cfg) {
  const list = cfg.getList();
  // 21-08-2026 (Ronald): het veld toont altijd dezelfde vaste tekst, geen
  // teller meer — de badges eronder laten al zien wat er gekozen is.
  document.getElementById(cfg.fieldId + 'Label').textContent = cfg.placeholder;
  // Huisstijl §13.1: de foutmarkering verdwijnt zodra de gebruiker het veld
  // wijzigt. Een keuzeveld is geen invoerveld en geeft geen 'input'; daarom
  // hier, zodra er iets gekozen is (gevonden in TT-385 fase 4).
  if (list.length) clearFieldError(cfg.fieldEl);
  cfg.badgeRowEl.innerHTML = list.map(v => `
    <div class="picker-badge">
      <button type="button" class="picker-badge-remove" aria-label="${escAttr(v)} verwijderen" onclick="removePickerValue('${jsAttr(cfg.id)}','${jsAttr(v)}')"><span aria-hidden="true">✕</span></button>
      <div class="picker-badge-label">${pickerDisplayLabel(v)}</div>
    </div>`).join('');
}

let activeListPickerId = null;

function openPickerList(id) {
  activeListPickerId = id;
  document.getElementById('pickerListTitle').textContent = PICKERS[id].sheetTitle;
  renderPickerListItems();
  document.getElementById('pickerListModal').classList.add('visible');
}

function closePickerList() {
  document.getElementById('pickerListModal').classList.remove('visible');
  activeListPickerId = null;
}

// TT-63-fix (23-08-2026): zie toelichting bij het legalModal-element hierboven.
// Geen aparte tekst — hergebruikt de inhoud van view-terms/view-privacy/
// view-gedragscode (dezelfde .doc-view-HTML), zodat de tekst nergens dubbel
// staat en nooit uit elkaar kan groeien tussen wizard en de losse pagina's.
const LEGAL_VIEW_IDS = { terms: 'view-terms', privacy: 'view-privacy', gedragscode: 'view-gedragscode' };
function openLegalModal(type) {
  const sourceView = document.getElementById(LEGAL_VIEW_IDS[type]);
  if (!sourceView) return;
  const docContent = sourceView.querySelector('.doc-view');
  document.getElementById('legalModalContent').innerHTML = docContent ? docContent.innerHTML : '';
  document.getElementById('legalModal').classList.add('visible');
}
function closeLegalModal() {
  document.getElementById('legalModal').classList.remove('visible');
}

function renderPickerListItems() {
  const cfg = PICKERS[activeListPickerId];
  if (!cfg) return;
  const list = cfg.getList();
  const wrap = document.getElementById('pickerListItems');
  wrap.innerHTML = cfg.options.map(opt => {
    const isSelected = list.includes(opt);
    return `<div class="picker-list-item${isSelected ? ' selected' : ''}" onclick="choosePickerListValue('${jsAttr(opt)}')">${pickerDisplayLabel(opt)}${isSelected ? '<span class="picker-list-item-check" aria-hidden="true">✓</span>' : ''}</div>`;
  }).join('');
}

function choosePickerListValue(value) {
  const cfg = PICKERS[activeListPickerId];
  if (!cfg) return;
  const list = cfg.getList();
  // Herzien 25-08-2026 (Ronald, UX-feedback): klikken op een al-gekozen item
  // zet het nu uit (toggle) i.p.v. het opnieuw toe te voegen — logisch nu het
  // item zichtbaar blijft staan met een vinkje.
  if (list.includes(value)) {
    const idx = list.indexOf(value);
    list.splice(idx, 1);
    renderPickerBadges(cfg);
    if (cfg.onChange) cfg.onChange();
    if (!cfg.singleMax) renderPickerListItems();
    else closePickerList();
    return;
  }
  if (cfg.singleMax) {
    // TT-55/TT-183: maximaal 1 instrument, met losse uitzonderingen (Zang,
    // Songwriting) die niet meetellen voor die limiet.
    const exceptions = cfg.exceptionValues || [];
    if (exceptions.includes(value)) {
      if (!list.includes(value)) list.push(value);
    } else {
      const kept = list.filter(v => exceptions.includes(v));
      list.length = 0;
      kept.forEach(v => list.push(v));
      list.push(value);
    }
    renderPickerBadges(cfg);
    if (cfg.onChange) cfg.onChange();
    closePickerList();
    return;
  }
  // TT-134 (23-08-2026): een meervoudig veld (bijv. genre, of "Wij zoeken
  // nog" bij een band) sloot voorheen ook na één keuze — voor drie genres
  // moest het volledig-scherm-keuzescherm dus drie keer apart geopend
  // worden. Nu blijft het open; alleen de gekozen waarde verdwijnt uit de
  // resterende lijst. De gebruiker sluit zelf met het kruisje zodra hij
  // klaar is.
  if (!list.includes(value)) list.push(value);
  renderPickerBadges(cfg);
  if (cfg.onChange) cfg.onChange();
  renderPickerListItems();
}

function removePickerValue(id, value) {
  const cfg = PICKERS[id];
  if (!cfg) return;
  const list = cfg.getList();
  const idx = list.indexOf(value);
  if (idx !== -1) list.splice(idx, 1);
  renderPickerBadges(cfg);
  if (cfg.onChange) cfg.onChange();
}

// ─── Eigen instrumenten — instrument kiezen in een lijst, niveau inline ─────
// TT-410a (08-10-2026, besluit Ronald): het instrument kies je nog in een
// keuzelaag (#instrumentLevelModal, alleen de lijst), het niveau kies je
// inline, onder de badges van het veld. Eén paneel per veld, voor één
// instrument tegelijk: je tikt een badge om het paneel te openen of te
// sluiten. De wizard EN het tegelscherm "Wat speel je" delen dit via een
// cfg-registry (zelfde patroon als initPicker() hierboven). cfg: { id,
// fieldId, badgeRowId, getInstruments, getLevels, onChange }. Per cfg houdt
// de registry bij welk instrument openstaat (`openInstrument`) en of de
// uitleg openstaat (`uitlegOpen`). Een instrument zonder niveau mag: het niveau
// is geen slagboom (TT-U09, 12-08-2026); de badge zegt dan "Kies niveau".
const INSTRUMENT_PICKERS = {};
let activeInstrumentPickerId = null;

function initInstrumentPicker(cfg) {
  INSTRUMENT_PICKERS[cfg.id] = cfg;
  cfg.openInstrument = null;
  cfg.uitlegOpen = false;
  const rij = document.getElementById(cfg.badgeRowId);
  const paneelId = cfg.badgeRowId + 'Niveau';
  if (!document.getElementById(paneelId)) {
    const paneel = document.createElement('div');
    paneel.id = paneelId;
    paneel.className = 'niveau-paneel';
    paneel.hidden = true;
    rij.insertAdjacentElement('afterend', paneel);
  }
  document.getElementById(cfg.fieldId).onclick = () => openInstrumentPicker(cfg.id);
  renderInstrumentBadges(cfg.id);
  return cfg;
}

// Korte namen zonder cijfer én zonder haakjes, afgeleid van Tabel 2 in
// niveaubepaling-naslagwerk.md (NIVEAU_INFO_MUSICIAN_ROWS verderop). Eén
// bron, geen tweede lijst.
function instrumentLevelLabels() {
  return NIVEAU_INFO_MUSICIAN_ROWS.map(r => stripParenthetical(String(r[0]).replace(/^\d+\.\s*/, '')));
}

// TT-116: korte toelichting per niveau. Voorlopige tekst — Ronald schrijft de
// definitieve versie (sessie 21-08-2026, "optie 1"). Tot dan: eerste zin van
// de kolom "Technische beheersing" uit dezelfde tabel, zodat er geen tweede
// bron ontstaat.
function instrumentLevelBlurbs() {
  return NIVEAU_INFO_MUSICIAN_ROWS.map(r => {
    const firstSentence = String(r[1]).split('. ')[0].replace(/\.+$/, '');
    return firstSentence + '.';
  });
}

function renderInstrumentBadges(id) {
  const cfg = INSTRUMENT_PICKERS[id];
  const wrap = document.getElementById(cfg.badgeRowId);
  const list = cfg.getInstruments();
  const levels = cfg.getLevels();
  // 21-08-2026 (Ronald): vaste tekst, geen teller — zelfde reden als bij
  // renderPickerBadges() hierboven.
  document.getElementById(cfg.fieldId + 'Label').textContent = 'Kies een instrument';
  wrap.innerHTML = list.map(i => {
    const n = levels[i] || 0;
    const open = cfg.openInstrument === i;
    const onder = n ? '<div class="picker-badge-stars">' + '★'.repeat(n) + '</div>'
                    : '<div class="picker-badge-stars picker-badge-stars-leeg">Kies niveau</div>';
    return `
    <div class="picker-badge has-level${open ? ' open' : ''}" onclick="toggleInstrumentNiveau('${jsAttr(id)}','${jsAttr(i)}')">
      <button type="button" class="picker-badge-remove" aria-label="${escAttr(i)} verwijderen" onclick="event.stopPropagation();quickRemoveInstrument('${jsAttr(id)}','${jsAttr(i)}')">✕</button>
      <div class="picker-badge-label">${pickerDisplayLabel(i)}</div>
      ${onder}
    </div>`;
  }).join('');
  renderInstrumentPaneel(id);
}

// Het paneel onder de badges: vijf compacte keuzes (sterren en naam), één zin
// over het gekozen niveau, en een klapper met de uitleg van alle niveaus.
function renderInstrumentPaneel(id) {
  const cfg = INSTRUMENT_PICKERS[id];
  const paneel = document.getElementById(cfg.badgeRowId + 'Niveau');
  const instrument = cfg.openInstrument;
  if (!instrument || !cfg.getInstruments().includes(instrument)) {
    cfg.openInstrument = null;
    paneel.hidden = true;
    paneel.innerHTML = '';
    return;
  }
  const huidig = cfg.getLevels()[instrument] || 0;
  const labels = instrumentLevelLabels();
  const blurbs = instrumentLevelBlurbs();
  const keuzes = labels.map((label, idx) => {
    const value = idx + 1;
    let stars = '';
    for (let i = 1; i <= 5; i++) stars += '<span class="' + (i <= value ? 'filled' : '') + '">' + (i <= value ? '★' : '☆') + '</span>';
    return '<button type="button" class="level-choice' + (value === huidig ? ' selected' : '') + '"'
      + ' aria-pressed="' + (value === huidig) + '" onclick="setInstrumentLevel(\'' + jsAttr(id) + '\',' + value + ')">'
      + '<span class="level-choice-stars">' + stars + '</span>'
      + '<span class="level-choice-label">' + escHtml(label) + '</span></button>';
  }).join('');
  const zin = huidig ? blurbs[huidig - 1] : 'Kies het niveau waar je het dichtst bij in de buurt zit.';
  const uitleg = cfg.uitlegOpen
    ? '<div class="niveau-uitleg">' + labels.map((label, idx) =>
        '<p><strong>' + escHtml(label) + '</strong> — ' + escHtml(blurbs[idx]) + '</p>').join('') + '</div>'
    : '';
  paneel.innerHTML =
    '<div class="niveau-paneel-titel">Niveau voor ' + pickerDisplayLabel(instrument) + '</div>'
    + keuzes
    + '<p class="picker-level-blurb">' + escHtml(zin) + '</p>'
    + '<button type="button" class="niveau-uitleg-knop" aria-expanded="' + !!cfg.uitlegOpen + '" onclick="toggleNiveauUitleg(\'' + jsAttr(id) + '\')">Wat betekenen de niveaus?</button>'
    + uitleg;
  paneel.hidden = false;
}

// Tik op een badge: het paneel van dat instrument opent, of sluit als het al open stond.
function toggleInstrumentNiveau(id, instrument) {
  const cfg = INSTRUMENT_PICKERS[id];
  cfg.openInstrument = cfg.openInstrument === instrument ? null : instrument;
  cfg.uitlegOpen = false;
  renderInstrumentBadges(id);
}

function toggleNiveauUitleg(id) {
  const cfg = INSTRUMENT_PICKERS[id];
  cfg.uitlegOpen = !cfg.uitlegOpen;
  renderInstrumentPaneel(id);
}

function setInstrumentLevel(id, value) {
  const cfg = INSTRUMENT_PICKERS[id];
  if (!cfg.openInstrument) return;
  cfg.getLevels()[cfg.openInstrument] = value;
  renderInstrumentBadges(id);
  if (cfg.onChange) cfg.onChange(); // zie toelichting bij removePickerValue-patroon, 13-08-2026
}

function quickRemoveInstrument(id, instrument) {
  const cfg = INSTRUMENT_PICKERS[id];
  const list = cfg.getInstruments();
  const idx = list.indexOf(instrument);
  if (idx !== -1) list.splice(idx, 1);
  delete cfg.getLevels()[instrument];
  if (cfg.openInstrument === instrument) cfg.openInstrument = null;
  renderInstrumentBadges(id);
  if (cfg.onChange) cfg.onChange();
}

// De keuzelaag met de instrumentenlijst. Een tik op een instrument voegt het
// toe, sluit de laag en opent het paneel voor het niveau.
function openInstrumentPicker(id) {
  activeInstrumentPickerId = id;
  renderInstrumentPickItems();
  document.getElementById('instrumentLevelModal').classList.add('visible');
}

function renderInstrumentPickItems() {
  const cfg = INSTRUMENT_PICKERS[activeInstrumentPickerId];
  const remaining = INSTRUMENTS.filter(i => !cfg.getInstruments().includes(i));
  const wrap = document.getElementById('instrumentPickItems');
  if (!remaining.length) {
    wrap.innerHTML = '<div class="picker-list-empty">Alles al gekozen</div>';
    return;
  }
  wrap.innerHTML = remaining.map(i =>
    `<div class="picker-list-item" onclick="pickInstrumentFromSheet('${jsAttr(i)}')">${pickerDisplayLabel(i)}</div>`
  ).join('');
}

function pickInstrumentFromSheet(instrument) {
  const id = activeInstrumentPickerId;
  const cfg = INSTRUMENT_PICKERS[id];
  cfg.getInstruments().push(instrument);
  if (cfg.onChange) cfg.onChange(); // zie toelichting bij removePickerValue-patroon, 13-08-2026
  closeInstrumentPicker();
  cfg.openInstrument = instrument;
  cfg.uitlegOpen = false;
  renderInstrumentBadges(id);
  const paneel = document.getElementById(cfg.badgeRowId + 'Niveau');
  if (paneel && paneel.scrollIntoView) paneel.scrollIntoView({ block: 'nearest' });
}

function closeInstrumentPicker() {
  document.getElementById('instrumentLevelModal').classList.remove('visible');
}

// ─── Niveau: sterren 1-5 (TT-51, 12-08-2026) ─────────────────────────────────
// Twee losse velden, geen verband ertussen (vastgelegd in
// niveaubepaling-naslagwerk.md): niveau per instrument (musician_instruments)
// en niveau van de band (bands). Zelfde widget voor beide.

// Alleen-lezen weergave, bijv. op een profiel of in een zoekresultaat.
// Geen ster als niveau ontbreekt (oude/onvolledige data) — dan liever niets
// tonen dan een verzonnen niveau suggereren.
function starDisplayHTML(niveau) {
  const n = Number(niveau);
  if (!Number.isInteger(n) || n < 1 || n > 5) return '';
  // TT-51-fix (12-08-2026): gevulde en lege sterren in aparte spans met een
  // eigen kleur (goud/grijs), niet alleen op glyphvorm (★ vs ☆) vertrouwen —
  // op sommige lettertypen/besturingssystemen zijn ★ en ☆ bij 12px nauwelijks
  // te onderscheiden, waardoor alle 5 sterren als "gevuld" oogden (gemeld
  // door Ronald: 3 sterren gekozen, na opslaan leken het er 5).
  const filled = `<span class="star-display-filled">${'★'.repeat(n)}</span>`;
  const empty = n < 5 ? `<span class="star-display-empty">${'☆'.repeat(5 - n)}</span>` : '';
  return `<span class="star-display">${filled}${empty}</span>`;
}

// TT-51-uitbreiding (12-08-2026, Ronalds beslissing): de ervaring van de band
// toont alleen zolang de band iemand zoekt. Het niveau blijft wel opgeslagen.
// TT-316 (24-09-2026, besluit Ronald): het niveau staat op het profiel, niet
// in een lijst — niet in de zoekresultaten en niet op Mijn Bands.
// TT-385 (02-10-2026, punt 14): op de bandpagina een tag "Ervaring" met de
// sterren, niet meer achter de naam. "Zoekend" volgt uit de open rollen.
function bandErvaringTagHTML(niveau, zoekend) {
  if (!zoekend) return '';
  const sterren = starDisplayHTML(niveau);
  return sterren ? `<span class="tag-solid">Ervaring ${sterren}</span>` : '';
}

// Klikbare sterrenkiezer. `getValue`/`setValue` laten deze functie werken voor
// zowel een los instrument (wizard) als de band zelf (bandformulier) zonder
// twee bijna-identieke functies te hoeven onderhouden.
function renderStarPicker(container, currentValue, onSelect) {
  container.innerHTML = '';
  container.className = 'star-picker';
  for (let n = 1; n <= 5; n++) {
    const s = document.createElement('span');
    s.className = 'star' + (currentValue && n <= currentValue ? ' filled' : '');
    s.textContent = '★';
    s.setAttribute('role', 'button');
    s.title = `${n} van 5`;
    s.onclick = () => onSelect(n);
    container.appendChild(s);
  }
}

