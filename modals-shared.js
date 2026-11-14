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
  cfg.badgeRowEl = cfg.badgeRowId ? document.getElementById(cfg.badgeRowId) : null;
  // TT-543 draaiwielen (besluiten Ronald 09-11-2026): elk veld klapt het
  // keuzemenu uit, zoals Straal, Leeftijd en Niveau in Zoeken (utils.js).
  // Deel 2 (besluiten Ronald 10-11-2026, sessie 109): ook buiten Zoeken, het
  // venster met de lijst bestaat niet meer. "1B": het menu toont alle keuzes,
  // een gekozen keuze als pil, en blijft open; een tik op een gekozen keuze
  // haalt hem weg. Sinds blok 2 van TT-543 onderdeel 6 (11-11-2026) heeft geen
  // veld meer één keuze: de invaller kiest nu zoals een open rol.
  // De luisteraars zitten aan het veld; een tegel die opnieuw een cfg maakt,
  // gebruikt daarom altijd de nieuwste (PICKERS[cfg.id]).
  const c = () => PICKERS[cfg.id];
  pickerMenuKoppelen({
    id: 'picker-' + cfg.id, fieldId: cfg.fieldId, menuId: cfg.menuId, rij: cfg.badgeRowEl,
    meer: true, label: cfg.toevoegen || cfg.placeholder,
    rijen: () => c().options.map(o => ({ t: o, gekozen: c().getList().includes(o) })),
    kies: (i) => {
      pickerWaardeWissel(c(), c().options[i]);
      renderPickerBadges(c());
      if (c().onChange) c().onChange();
    },
    ververs: cfg.inVeld ? () => renderPickerBadges(c()) : null,
  });
  renderPickerBadges(cfg);
  return cfg;
}

// TT-543 draaiwielen deel 2 (besluiten Ronald 10-11-2026, sessie 109). Het
// menu onder een keuzeveld buiten Zoeken. Staat het menu niet in de HTML
// (menuId), dan hoort het bij "+ Instrument" of "+ Genre": het staat dan in het
// raster van de keuzes, direct onder de laatste regel, waar de knop staat, en
// schuift mee als het raster groeit. "3/4 in het midden" (besluit Ronald, vraag
// 2 en 2b, R2): .menu-breed in styles.css.
function pickerMenuKoppelen(o) {
  let menuId = o.menuId;
  if (!menuId) {
    menuId = o.fieldId + 'Menu';
    if (!document.getElementById(menuId)) {
      const menu = document.createElement('div');
      menu.className = 'choice-menu menu-breed';
      menu.id = menuId;
      menu.setAttribute('role', 'listbox');
      if (o.label) menu.setAttribute('aria-label', o.label);
      o.rij.appendChild(menu);
    }
  }
  initChoiceField({ id: o.id, fieldId: o.fieldId, menuId, meer: o.meer, rijen: o.rijen, kies: o.kies,
    ververs: o.ververs || undefined, naSluiten: o.naSluiten });
}

// Tekent de keuzes in een raster opnieuw, zonder het menu dat erin staat en de
// donkere laag ervoor (menuLaagOpen() in core.js): die blijven staan terwijl je
// kiest (een nieuw menu zou opnieuw uitklappen; zonder laag sluit een tik
// ernaast niet meer).
function pickerRijTekenen(rij, html) {
  [...rij.childNodes].forEach(n => { if (!(n.classList && (n.classList.contains('choice-menu') || n.classList.contains('menu-laag')))) n.remove(); });
  rij.insertAdjacentHTML('afterbegin', html);
}

function renderPickerBadges(cfg) {
  const list = cfg.getList();
  // TT-520 (26-10-2026): in de filters van Zoeken staat de keuze in het veld
  // zelf ("–", "Drums, Zang"), zoals Leeftijd en Niveau ernaast. Geen
  // badges eronder: de velden staan daar in twee kolommen. `inVeld` geeft de
  // tekst; het veld krijgt de rand van een filter dat aanstaat (.is-set) en
  // het streepje van de lege stand is grijs (.leeg, zie zetVeldTekst()).
  // TT-543 draaiwielen deel 2 (besluit Ronald 10-11-2026, vraag 4: "B"): een
  // formulierveld (sinds blok 2: Rol bij uitnodigen) toont leeg een grijze aanwijzing in het midden
  // (`leegTekst`) en krijgt geen gele rand: die rand is de stand van een
  // filter dat aanstaat (huisstijl §7.1).
  if (cfg.inVeld) {
    const label = document.getElementById(cfg.fieldId + 'Label');
    if (cfg.leegTekst && !list.length) {
      label.textContent = cfg.leegTekst;
      label.classList.add('leeg');
    } else {
      zetVeldTekst(label, cfg.inVeld(list));
    }
    if (!cfg.leegTekst) cfg.fieldEl.classList.toggle('is-set', list.length > 0);
    if (list.length) clearFieldError(cfg.fieldEl);
    return;
  }
  // 21-08-2026 (Ronald): het veld toont altijd dezelfde vaste tekst, geen
  // teller meer — de badges eronder laten al zien wat er gekozen is.
  document.getElementById(cfg.fieldId + 'Label').textContent = cfg.placeholder;
  // Huisstijl §13.1: de foutmarkering verdwijnt zodra de gebruiker het veld
  // wijzigt. Een keuzeveld is geen invoerveld en geeft geen 'input'; daarom
  // hier, zodra er iets gekozen is (gevonden in TT-385 fase 4).
  if (list.length) clearFieldError(cfg.fieldEl);
  pickerRijTekenen(cfg.badgeRowEl, list.map(v => `
    <div class="picker-badge">
      <button type="button" class="picker-badge-remove" aria-label="${escHtml(v)} verwijderen" onclick="removePickerValue('${jsAttr(cfg.id)}','${jsAttr(v)}')"><span aria-hidden="true">✕</span></button>
      <div class="picker-badge-label">${pickerDisplayLabel(v)}</div>
    </div>`).join(''));
  pickerToevoegenPlaatsen(cfg, cfg.badgeRowEl, false);
}

// TT-543 blok 4 (besluit Ronald 07-11-2026, voorstel 22): in Profiel aanmaken en
// Wat speel je staat geen keuzeveld boven de keuzes. Het veld zelf is de laatste
// knop van het raster, "+ Instrument" of "+ Genre", in de stippelvorm van
// "+ Toevoegen" in Je mediahoek; een tik opent het keuzemenu. Instrumenten
// staan dan als rijen onder elkaar, met de sterren rechts (voorstel 21 C).
// Alleen voor een keuze met `toevoegen` in zijn cfg: Profiel aanmaken, Wat speel
// je, en sinds draaiwielen deel 2 ook de genres van een band (besluit Ronald
// 10-11-2026, vraag 3: "A").
// Het veld staat ín het raster; een nieuwe tekening van het raster haalt het even
// uit de pagina. Daarom onthoudt de app het element per veld, de eerste keer dat
// het er nog los staat (ook als een tegel opnieuw een cfg maakt).
const TOEVOEG_VELDEN = {};
function pickerToevoegenPlaatsen(cfg, rij, rijen) {
  // Staat het veld al in het raster, dan blijft het daar, ook als een cfg zonder
  // `toevoegen` het raster opnieuw tekent (anders raakt het veld weg).
  const bekend = TOEVOEG_VELDEN[cfg.fieldId];
  if (!cfg.toevoegen && !bekend) return;
  const veld = bekend || (TOEVOEG_VELDEN[cfg.fieldId] = document.getElementById(cfg.fieldId));
  if (!veld.classList.contains('picker-toevoegen')) {
    veld.classList.add('picker-toevoegen');
    veld.dataset.toevoegen = cfg.toevoegen;
    veld.insertAdjacentHTML('afterbegin', PLUS_TEKEN);
  }
  veld.querySelector('.picker-field-label').textContent = cfg.toevoegen || veld.dataset.toevoegen;
  rij.classList.add('met-toevoegen');
  rij.classList.toggle('instrument-rijen', rijen);
  rij.insertBefore(veld, rij.querySelector(':scope > .menu-laag, :scope > .choice-menu')); // zonder menu: achteraan
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

// Zet een waarde aan of uit in de lijst van een keuzeveld; geeft terug of de
// waarde nu gekozen is. Gebruikt door het keuzemenu van elk veld (initPicker()).
function pickerWaardeWissel(cfg, value) {
  const list = cfg.getList();
  if (list.includes(value)) {
    list.splice(list.indexOf(value), 1);
    return false;
  }
  if (cfg.singleMax) {
    // TT-55/TT-183: maximaal 1 instrument, met losse uitzonderingen (Zang,
    // Achtergrondzang, Songwriting) die niet meetellen voor die limiet.
    const exceptions = cfg.exceptionValues || [];
    if (!exceptions.includes(value)) {
      const kept = list.filter(v => exceptions.includes(v));
      list.length = 0;
      kept.forEach(v => list.push(v));
    }
  }
  list.push(value);
  return true;
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

// ─── Eigen instrumenten — instrument kiezen in het keuzemenu, niveau inline ──
// TT-410a (08-10-2026, besluit Ronald): het niveau kies je inline, onder de
// badges van het veld. Het instrument kies je sinds TT-543 draaiwielen deel 2
// (besluiten Ronald 10-11-2026, sessie 109) in het keuzemenu onder
// "+ Instrument", zoals in Zoeken: alle instrumenten, een gekozen instrument als
// pil. Sinds TT-602 sluit het menu na één tik. Een tik op een gekozen instrument haalt het
// weg, met zijn niveau. Gaat het menu dicht, dan opent het niveau vanzelf onder
// het nieuwe instrument zonder niveau; overslaan mag (vraag 5: "het
// keuzeveld moet openen, maar de gebruiker kan besluiten om (nu) geen keuze te
// maken"). Eén paneel per veld, voor één
// instrument tegelijk: je tikt een badge om het paneel te openen of te
// sluiten. De wizard EN het tegelscherm "Wat speel je" delen dit via een
// cfg-registry (zelfde patroon als initPicker() hierboven). cfg: { id,
// fieldId, badgeRowId, getInstruments, getLevels, onChange }. Per cfg houdt
// de registry bij welk instrument openstaat (`openInstrument`) en of de
// uitleg openstaat (`uitlegOpen`). Een instrument zonder niveau mag: het niveau
// is geen slagboom (TT-U09, 12-08-2026); de badge zegt dan "Kies niveau".
const INSTRUMENT_PICKERS = {};

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
  const c = () => INSTRUMENT_PICKERS[cfg.id];
  // TT-602 (besluit Ronald 14-11-2026: "A wordt het."): bij "+ Instrument" sluit
  // het menu na één tik en opent meteen het niveau van dat instrument; voor
  // een volgend instrument opnieuw "+ Instrument". Wijzigt 1B alleen hier;
  // Genre en Zoeken blijven open (een instrument heeft een vervolgvraag).
  pickerMenuKoppelen({
    id: 'instrument-' + cfg.id, fieldId: cfg.fieldId, rij, meer: false, label: 'Instrument',
    rijen: () => INSTRUMENTS.map(i => ({ t: i, gekozen: c().getInstruments().includes(i) })),
    kies: (n) => instrumentMenuKies(cfg.id, INSTRUMENTS[n]),
    naSluiten: () => instrumentNiveauNaMenu(cfg.id),
  });
  renderInstrumentBadges(cfg.id);
  return cfg;
}

// Korte namen zonder cijfer én zonder haakjes, afgeleid van Tabel 2 in
// niveaubepaling-naslagwerk.md (NIVEAU_INFO_MUSICIAN_ROWS verderop). Eén
// bron, geen tweede lijst.
function instrumentLevelLabels() {
  return NIVEAU_INFO_MUSICIAN_ROWS.map(r => stripParenthetical(String(r[0]).replace(/^\d+\.\s*/, '')));
}

// TT-572 (besluit Ronald 14-11-2026, "akkoord"): de korte zin per niveau is
// algemeen en klopt voor elk instrument, ook voor zang. Tot dan was het de
// eerste zin van "Technische beheersing" (TT-116), met drums en akkoorden erin.
// Teksten per instrument komen na de livegang.
const NIVEAU_ZINNEN = [
  'Je speelt je eerste nummers en oefent nog met tutorials.',
  'Je speelt hele nummers uit en zoekt ze zelf uit.',
  'Je speelt strak en bent klaar voor een optreden.',
  'Je speelt alles live, ook in andere stijlen, en kunt een band leiden.',
  'Je speelt op topniveau en hebt een eigen, herkenbare sound.'
];
function instrumentLevelBlurbs() {
  return NIVEAU_ZINNEN.slice();
}

function renderInstrumentBadges(id) {
  const cfg = INSTRUMENT_PICKERS[id];
  const wrap = document.getElementById(cfg.badgeRowId);
  const list = cfg.getInstruments();
  const levels = cfg.getLevels();
  // 21-08-2026 (Ronald): vaste tekst, geen teller — zelfde reden als bij
  // renderPickerBadges() hierboven.
  document.getElementById(cfg.fieldId + 'Label').textContent = 'Kies een instrument';
  if (list.length) clearFieldError(cfg.fieldId); // TT-444: zoals renderPickerBadges()
  // Het niveaupaneel kan ín het raster staan (zie hieronder); een nieuwe tekening
  // haalt het daar weg, dus eerst vasthouden.
  const paneel = document.getElementById(cfg.badgeRowId + 'Niveau');
  pickerRijTekenen(wrap, list.map(i => {
    const n = levels[i] || 0;
    const open = cfg.openInstrument === i;
    const onder = n ? '<div class="picker-badge-stars">' + '★'.repeat(n) + '</div>'
                    : '<div class="picker-badge-stars picker-badge-stars-leeg">Kies niveau</div>';
    return `
    <div class="picker-badge has-level${open ? ' open' : ''}" onclick="toggleInstrumentNiveau('${jsAttr(id)}','${jsAttr(i)}')">
      <button type="button" class="picker-badge-remove" aria-label="${escHtml(i)} verwijderen" onclick="event.stopPropagation();quickRemoveInstrument('${jsAttr(id)}','${jsAttr(i)}')">✕</button>
      <div class="picker-badge-label">${pickerDisplayLabel(i)}</div>
      ${onder}
    </div>`;
  }).join(''));
  pickerToevoegenPlaatsen(cfg, wrap, true);
  // TT-543 blok 4 (besluit Ronald 07-11-2026, a): in de rijen opent het
  // niveaupaneel direct onder het instrument waarop je tikte, boven "+ Instrument".
  // Anders (geen rijen, of geen open instrument) staat het onder het raster.
  if (paneel) {
    const open = wrap.classList.contains('instrument-rijen') && wrap.querySelector('.picker-badge.open');
    if (open) open.after(paneel); else wrap.after(paneel);
  }
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

// TT-543 blok 4 (besluit Ronald 07-11-2026): een tik op een niveau kiest het en
// klapt het paneel meteen dicht ("als je niveau aanklikt, dan moet dat (grote)
// niveauscherm direct inklappen"). Wijzigen: tik op de rij van het instrument.
function setInstrumentLevel(id, value) {
  const cfg = INSTRUMENT_PICKERS[id];
  if (!cfg.openInstrument) return;
  cfg.getLevels()[cfg.openInstrument] = value;
  cfg.openInstrument = null;
  cfg.uitlegOpen = false;
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

// Een tik in het menu: een nieuw instrument komt erbij (zonder niveau), een
// gekozen instrument gaat weg, met zijn niveau.
function instrumentMenuKies(id, instrument) {
  const cfg = INSTRUMENT_PICKERS[id];
  if (cfg.getInstruments().includes(instrument)) { quickRemoveInstrument(id, instrument); return; }
  cfg.getInstruments().push(instrument);
  (cfg.nieuwInMenu = cfg.nieuwInMenu || []).push(instrument);
  renderInstrumentBadges(id);
  if (cfg.onChange) cfg.onChange(); // zie toelichting bij removePickerValue-patroon, 13-08-2026
}

// Het menu is dicht: het niveau opent onder het eerste instrument dat er in dit
// menu bij kwam en nog geen niveau heeft (besluit Ronald 10-11-2026, vraag 5: A).
function instrumentNiveauNaMenu(id) {
  const cfg = INSTRUMENT_PICKERS[id];
  const nieuw = cfg.nieuwInMenu || [];
  cfg.nieuwInMenu = null;
  const eerste = cfg.getInstruments().find(i => nieuw.includes(i) && !cfg.getLevels()[i]);
  if (!eerste) return;
  cfg.openInstrument = eerste;
  cfg.uitlegOpen = false;
  renderInstrumentBadges(id);
  const paneel = document.getElementById(cfg.badgeRowId + 'Niveau');
  if (paneel && paneel.scrollIntoView) paneel.scrollIntoView({ block: 'nearest' });
}

// ─── Niveau: sterren 1-5 (TT-51, 12-08-2026) ─────────────────────────────────
// Twee losse velden, geen verband ertussen (vastgelegd in
// niveaubepaling-naslagwerk.md): niveau per instrument (musician_instruments)
// en niveau van de band (bands). Zelfde widget voor beide.

// Alleen-lezen weergave, bijv. op een profiel of in een zoekresultaat.
// Geen ster als niveau ontbreekt (oude/onvolledige data) — dan liever niets
// tonen dan een verzonnen niveau suggereren.
// TT-543 onderdeel 3 (besluit Ronald 08-11-2026): op het muzikantprofiel
// alleen de gevulde sterren (`alleenGevuld`); elders blijven de lege erbij.
function starDisplayHTML(niveau, alleenGevuld) {
  const n = Number(niveau);
  if (!Number.isInteger(n) || n < 1 || n > 5) return '';
  // TT-51-fix (12-08-2026): gevulde en lege sterren in aparte spans met een
  // eigen kleur (goud/grijs), niet alleen op glyphvorm (★ vs ☆) vertrouwen —
  // op sommige lettertypen/besturingssystemen zijn ★ en ☆ bij 12px nauwelijks
  // te onderscheiden, waardoor alle 5 sterren als "gevuld" oogden (gemeld
  // door Ronald: 3 sterren gekozen, na opslaan leken het er 5).
  const filled = `<span class="star-display-filled">${'★'.repeat(n)}</span>`;
  const empty = (n < 5 && !alleenGevuld) ? `<span class="star-display-empty">${'☆'.repeat(5 - n)}</span>` : '';
  return `<span class="star-display">${filled}${empty}</span>`;
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

