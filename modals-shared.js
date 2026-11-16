



















function pickerDisplayLabel(value) {
  return escHtml(value);
}




function stripParenthetical(s) {
  return String(s).replace(/\s*\([^)]*\)\s*$/, '').trim();
}

const PICKERS = {};

function initPicker(cfg) {
  PICKERS[cfg.id] = cfg;
  cfg.fieldEl = document.getElementById(cfg.fieldId);
  cfg.badgeRowEl = cfg.badgeRowId ? document.getElementById(cfg.badgeRowId) : null;









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





function pickerRijTekenen(rij, html) {
  [...rij.childNodes].forEach(n => { if (!(n.classList && (n.classList.contains('choice-menu') || n.classList.contains('menu-laag')))) n.remove(); });
  rij.insertAdjacentHTML('afterbegin', html);
}

function renderPickerBadges(cfg) {
  const list = cfg.getList();









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


  document.getElementById(cfg.fieldId + 'Label').textContent = cfg.placeholder;



  if (list.length) clearFieldError(cfg.fieldEl);
  pickerRijTekenen(cfg.badgeRowEl, list.map(v => `
    <div class="picker-badge">
      <button type="button" class="picker-badge-remove" aria-label="${escHtml(v)} verwijderen" onclick="removePickerValue('${jsAttr(cfg.id)}','${jsAttr(v)}')"><span aria-hidden="true">✕</span></button>
      <div class="picker-badge-label">${pickerDisplayLabel(v)}</div>
    </div>`).join(''));
  pickerToevoegenPlaatsen(cfg, cfg.badgeRowEl, false);
}












const TOEVOEG_VELDEN = {};
function pickerToevoegenPlaatsen(cfg, rij, rijen) {


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
  rij.insertBefore(veld, rij.querySelector(':scope > .menu-laag, :scope > .choice-menu'));
}





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



function pickerWaardeWissel(cfg, value) {
  const list = cfg.getList();
  if (list.includes(value)) {
    list.splice(list.indexOf(value), 1);
    return false;
  }
  if (cfg.singleMax) {


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




  pickerMenuKoppelen({
    id: 'instrument-' + cfg.id, fieldId: cfg.fieldId, rij, meer: false, label: 'Instrument',
    rijen: () => INSTRUMENTS.map(i => ({ t: i, gekozen: c().getInstruments().includes(i) })),
    kies: (n) => instrumentMenuKies(cfg.id, INSTRUMENTS[n]),
    naSluiten: () => instrumentNiveauNaMenu(cfg.id),
  });
  renderInstrumentBadges(cfg.id);
  return cfg;
}




function instrumentLevelLabels() {
  return NIVEAU_INFO_MUSICIAN_ROWS.map(r => stripParenthetical(String(r[0]).replace(/^\d+\.\s*/, '')));
}







const NIVEAU_ZINNEN = [
  'Je speelt je eerste nummers en oefent nog met tutorials.',
  'Je speelt hele nummers uit en zoekt ze zelf uit. Je basistechniek is stabiel.',
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


  document.getElementById(cfg.fieldId + 'Label').textContent = 'Kies een instrument';
  if (list.length) clearFieldError(cfg.fieldId);


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



  if (paneel) {
    const open = wrap.classList.contains('instrument-rijen') && wrap.querySelector('.picker-badge.open');
    if (open) open.after(paneel); else wrap.after(paneel);
  }
  renderInstrumentPaneel(id);
}



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
  cfg.openInstrument = null;
  cfg.uitlegOpen = false;
  renderInstrumentBadges(id);
  if (cfg.onChange) cfg.onChange();
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



function instrumentMenuKies(id, instrument) {
  const cfg = INSTRUMENT_PICKERS[id];
  if (cfg.getInstruments().includes(instrument)) { quickRemoveInstrument(id, instrument); return; }
  cfg.getInstruments().push(instrument);
  (cfg.nieuwInMenu = cfg.nieuwInMenu || []).push(instrument);
  renderInstrumentBadges(id);
  if (cfg.onChange) cfg.onChange();
}



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











function starDisplayHTML(niveau, alleenGevuld) {
  const n = Number(niveau);
  if (!Number.isInteger(n) || n < 1 || n > 5) return '';





  const filled = `<span class="star-display-filled">${'★'.repeat(n)}</span>`;
  const empty = (n < 5 && !alleenGevuld) ? `<span class="star-display-empty">${'☆'.repeat(5 - n)}</span>` : '';
  return `<span class="star-display">${filled}${empty}</span>`;
}




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

