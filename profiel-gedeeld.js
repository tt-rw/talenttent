// ─── profiel-gedeeld.js ───────────────────────────────────────────────────
// TT-168. Eén bron voor functies die zowel profiel-v2.html als (later, na
// akkoord) index.html gebruiken — geen dubbele versies van dezelfde functie.
// Verwacht een globale Supabase-client met de naam `db`, aangemaakt door het
// bestand dat dit script laadt, vóórdat een van onderstaande functies wordt
// aangeroepen.

// ─── Meldingen ────────────────────────────────────────────────────────────

let toastTimer;
function showToast(msg, duration) {
  const el = document.getElementById('appToast');
  if (!el) { console.warn('Toast:', msg); return; }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), duration || 3500);
}

// Zelfde vertaling als in index.html — technische Supabase-/netwerkfouten
// worden begrijpelijke NL-tekst. Zie index.html voor de volledige lijst; hier
// alleen de gevallen die in profiel-v2.html kunnen voorkomen.
function friendlyErrorMessage(err) {
  const msg = (err && err.message) ? err.message : String(err || '');
  console.error('Technische foutmelding:', msg);
  if (/failed to fetch|network|networkerror/i.test(msg)) {
    return 'Geen verbinding kunnen maken. Controleer je internetverbinding en probeer het opnieuw.';
  }
  if (/JWT|token|session|auth/i.test(msg)) {
    return 'Je sessie is verlopen. Log opnieuw in en probeer het nog eens.';
  }
  if (/duplicate key|unique constraint/i.test(msg)) {
    return 'Dit bestaat al. Kies een andere naam en probeer het opnieuw.';
  }
  if (/permission denied|rls/i.test(msg)) {
    return 'Je hebt geen toestemming voor deze actie.';
  }
  return 'Er ging iets mis. Probeer het opnieuw.';
}

// ─── Tekst-veiligheid (zelfde functies als index.html) ───────────────────

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}
function escAttr(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
}
function jsAttr(s) { return escHtml(escAttr(s)); }
function likeSafe(s) {
  return String(s ?? '').replace(/[%_*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}
function orValue(s) {
  return '"' + String(s ?? '').replace(/["\\]/g, '') + '"';
}

// ─── Datum ─────────────────────────────────────────────────────────────────

function formatBirthDate(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 8);
  if (v.length >= 5) v = v.slice(0,2) + '-' + v.slice(2,4) + '-' + v.slice(4);
  else if (v.length >= 3) v = v.slice(0,2) + '-' + v.slice(2);
  input.value = v;
}
function toISODate(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split('-');
  return `${yyyy}-${mm}-${dd}`;
}
function fromISODate(iso) {
  if (!iso) return '';
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}-${mm}-${yyyy}`;
}

// ─── Plaatsnaam-schrijfwijze (TT-80, zelfde regels als index.html) ───────

function normalizeCityName(city) {
  const ALTIJD_KLEIN = new Set(["'s", "'t", "’s", "’t"]);
  const KLEIN_TENZIJ_EERSTE_WOORD = new Set(['aan','de','den','der','het','in','onder','op','over','te','ten','ter','van','bij']);
  return city
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (ALTIJD_KLEIN.has(word)) return word;
      if (i > 0 && KLEIN_TENZIJ_EERSTE_WOORD.has(word)) return word;
      let result;
      if (/^('s-|’s-|'t-|’t-)/.test(word)) {
        result = word.slice(0, 3) + word.slice(3).replace(/\b\w/g, c => c.toUpperCase());
      } else {
        result = word.replace(/\b\w/g, c => c.toUpperCase());
      }
      return result.replace(/\bIj/g, 'IJ');
    })
    .join(' ');
}
const CITY_NAME_EXCEPTIONS = {
  "'s-gravenhage": 'Den Haag', "s gravenhage": 'Den Haag', "s-gravenhage": 'Den Haag', "den haag": 'Den Haag',
  "'s-hertogenbosch": 'Den Bosch', "s hertogenbosch": 'Den Bosch', "s-hertogenbosch": 'Den Bosch', "den bosch": 'Den Bosch',
};
function pickDisplayCity(officialCity, altField) {
  const key = (officialCity || '').toLowerCase().replace(/[’']/g, "'").trim();
  if (CITY_NAME_EXCEPTIONS[key]) return CITY_NAME_EXCEPTIONS[key];
  return normalizeCityName(officialCity || '');
}

// ─── Postcode → plaats (PDOK, met terugval op de cache) ──────────────────
// Zelfde bron en dezelfde tt_cache_postcode/tt_check_username_available
// RPC's als index.html — geen aparte, nieuwe databaselogica.

function lookupPostcodeCity(normalized) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  return (async () => {
    try {
      const url = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free?fq=postcode:${normalized}*&fq=type:postcode&fl=woonplaatsnaam,postcode&rows=1`;
      const res  = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('PDOK niet bereikbaar');
      const data = await res.json();
      const doc  = data?.response?.docs?.[0];
      if (doc?.woonplaatsnaam) {
        const { data: alt } = await db.from('postcode_cache').select('alternatieve_schrijfwijzen').eq('postcode', normalized).maybeSingle();
        const displayCity = pickDisplayCity(doc.woonplaatsnaam, alt?.alternatieve_schrijfwijzen);
        const officialName = doc.woonplaatsnaam;
        const altList = (alt?.alternatieve_schrijfwijzen || '').split(';').map(s => s.trim()).filter(Boolean);
        if (officialName.toLowerCase() !== displayCity.toLowerCase()
            && !altList.some(a => a.toLowerCase() === officialName.toLowerCase())) {
          altList.push(officialName);
        }
        db.rpc('tt_cache_postcode', {
          p_postcode: normalized,
          p_city: displayCity,
          p_alt: altList.join(';') || null
        }).then(() => {}).catch(() => {});
        return { found: true, city: displayCity, source: 'pdok' };
      }
      const { data: cachedNF } = await db.from('postcode_cache').select('city, alternatieve_schrijfwijzen').eq('postcode', normalized).maybeSingle();
      if (cachedNF?.city) return { found: true, city: pickDisplayCity(cachedNF.city, cachedNF.alternatieve_schrijfwijzen), source: 'cache' };
      return { found: false, reason: 'notfound' };
    } catch (e) {
      clearTimeout(timer);
      try {
        const { data: cached } = await db.from('postcode_cache').select('city, alternatieve_schrijfwijzen').eq('postcode', normalized).maybeSingle();
        if (cached?.city) return { found: true, city: pickDisplayCity(cached.city, cached.alternatieve_schrijfwijzen), source: 'cache' };
      } catch (e2) { }
      return { found: false, reason: 'error' };
    }
  })();
}

const citySuggestCache = new Map();
async function searchCitySuggestions(q) {
  const cacheKey = q.toLowerCase();
  if (citySuggestCache.has(cacheKey)) return citySuggestCache.get(cacheKey);
  const pattern = orValue('%' + likeSafe(q) + '%');
  const { data, error } = await db.from('postcode_cache')
    .select('city, alternatieve_schrijfwijzen')
    .or(`city.ilike.${pattern},alternatieve_schrijfwijzen.ilike.${pattern}`)
    .limit(50);
  if (error) return [];
  const seen = new Set();
  const names = [];
  (data || []).forEach(row => {
    const display = pickDisplayCity(row.city, row.alternatieve_schrijfwijzen);
    const key = display.toLowerCase();
    if (display && !seen.has(key)) { seen.add(key); names.push(display); }
  });
  names.sort((a, b) => a.localeCompare(b, 'nl'));
  const top = names.slice(0, 8);
  citySuggestCache.set(cacheKey, top);
  return top;
}

// ─── Gebruikersnaam ────────────────────────────────────────────────────────

function usernameFormatValid(u) {
  return /^[A-Za-z0-9_]{3,20}$/.test(u);
}
const RESERVED_USERNAME_WORDS = [
  'admin', 'administrator', 'beheer', 'beheerder', 'moderator', 'moderatie', 'mod',
  'support', 'helpdesk', 'klantenservice', 'systeem', 'system', 'root', 'owner', 'eigenaar',
  'official', 'officieel', 'staff', 'medewerker', 'team', 'webmaster', 'superuser', 'developer', 'ontwikkelaar',
];
function isReservedUsername(value) {
  const v = value.toLowerCase();
  if (v.includes('talent') && v.includes('tent')) return true;
  return RESERVED_USERNAME_WORDS.some(w => v.includes(w));
}
// Roept dezelfde tt_check_username_available-RPC aan als index.html.
async function checkUsernameAvailability(value, excludeId) {
  if (!usernameFormatValid(value)) return { ok: false, reason: 'Alleen letters, cijfers en underscore, 3-20 tekens.' };
  if (isReservedUsername(value)) return { ok: false, reason: 'Deze gebruikersnaam is niet beschikbaar. Kies een andere.' };
  try {
    const { data, error } = await db.rpc('tt_check_username_available', { uname: value, exclude_id: excludeId || null });
    if (error) throw error;
    return data ? { ok: true } : { ok: false, reason: 'Al in gebruik, kies een andere.' };
  } catch (e) {
    return { ok: false, reason: friendlyErrorMessage(e), technical: true };
  }
}

// ─── Bio-prompts (TT-...: aanvullen, niet overschrijven) ─────────────────

function applyBioPrompt(el, text) {
  const current = el.value;
  if (!current.trim()) {
    el.value = text;
  } else {
    const sep = /[\s\n]$/.test(current) ? '' : ' ';
    el.value = current + sep + text;
  }
  el.focus();
  el.setSelectionRange(el.value.length, el.value.length);
  return el.value;
}

// ─── Instrumenten en genres: vaste lijsten (TT-168, 1-op-1 uit index.html) ─

const INSTRUMENTS = [
  'Basgitaar', 'Cello', 'Conga / Bongo', 'DJ / Electronica', 'Drums',
  'Gitaar, akoestisch', 'Gitaar, elektrisch', 'Harmonica (mondharmonica)',
  'Keyboard', 'Piano', 'Saxofoon', 'Tamboerijn', 'Trompet', 'Ukulele',
  'Viool', 'Zang'
];
const GENRES = [
  'Blues', 'Country', 'Electronic', 'Folk / Akoestisch', 'Funk', 'Hip-hop',
  'Indie', 'Jazz', 'Klassiek', 'Metal', 'Pop', 'Punk', 'R&B / Soul',
  'Reggae', 'Rock'
];

// TT-51-uitbreiding: Tabel 2 uit niveaubepaling-naslagwerk.md, 1-op-1
// overgenomen uit index.html — zelfde tekst, één inhoudelijke bron. Twee
// bestanden omdat profiel-v2.html geen build-stap heeft om index.html of
// een los .md-bestand in te lezen.
const NIVEAU_INFO_MUSICIAN_HEADERS = ['Niveau', 'Technische beheersing', 'Gehoor en muziektheorie', 'Voorbereiden en repeteren', 'Live spelen en flexibiliteit'];
const NIVEAU_INFO_MUSICIAN_ROWS = [
  ['1. Beginner (Bedroom)',
    'Je kent de basisakkoorden of een paar toffe drumbeats. Je speelt vooral losse intro\'s of riffjes van TikTok en YouTube. Je timing schommelt.',
    'Je kunt akkoorden nog niet echt op gehoor naspelen. Je hebt internettabs, YouTube-tutorials of eenvoudige bladmuziek nodig.',
    'Je hebt echt een leraar of hulp nodig om een nieuw nummer te leren. Je oefent nog een beetje onregelmatig.',
    'Je speelt eigenlijk altijd op hetzelfde volume. Als de band stopt of iets anders doet dan de opname, ben je de draad kwijt.'],
  ['2. Gevorderde Beginner (Jammer)',
    'Je speelt complete nummers vloeiend uit. Je basistechniek (barré-akkoorden, ademsteun, fills) is stabiel en kost steeds minder moeite.',
    'Je herkent eenvoudige basisschema\'s. Je kunt nummers thuis uitzoeken en naspelen door goed naar de originele track te luisteren.',
    'Je studeert thuis zelfstandig de nummers in die zijn afgesproken. Je kent je partijen uit je hoofd als je naar de repetitie komt.',
    'Je luistert naar de rest en past je volume aan. Je kunt een simpele eigen fill of solo verzinnen die past bij de structuur van het nummer.'],
  ['3. Half-Gevorderd (Gig-Ready)',
    'Fysieke techniek is een automatisme; constante strakke timing. Je hebt een goede, bewuste controle over je eigen klankkleur en sound.',
    'Kan makkelijk improviseren en solo\'s construeren over bekende toonsoorten; sterke functionele basiskennis van muziektheorie.',
    'Bedenkt en schrijft eigen partijen uit. Heeft minimale repetitietijd nodig om een volledige live-set van anderhalf uur te beheersen.',
    'Herstelt live-fouten onmiddellijk zonder dat het opvalt; speelt moeiteloos met een clicktrack of In-Ear monitor.'],
  ['4. Gevorderd (Set-Leider)',
    'Zeer brede technische bagage; lost instrument-technische problemen direct live op; schakelt moeiteloos tussen uiteenlopende genres.',
    'Kan live on-the-fly transponeren naar een andere toonsoort; pikt complexe harmonieën en akkoordenschema\'s direct op gehoor op.',
    'Kan fungeren als muzikaal leider (MD); arrangeert efficiënt partijen voor andere bandleden en levert kant-en-klare prestaties aan.',
    'Volledige controle over dynamiek; levert studio-waardige prestaties onder live-fysieke spanning (zoals intense podiumactie of dans).'],
  ['5. Professioneel',
    'Grenzeloze techniek; beschikt over een internationaal onderscheidende, direct herkenbare \'signature sound\' en artistieke identiteit.',
    'Absoluut gehoor of uitzonderlijk ontwikkeld relatief gehoor; leest direct complexe chord charts of partituren vanaf papier (sight-reading).',
    'Volledig autonoom en multi-inzetbaar; beheerst een complete setlist binnen 24 uur; de vaste eerste keuze voor high-end studio- en sessiewerk.',
    'Volledige controle over emotie en klank; anticipeert en adapteert onmiddellijk aan elke onverwachte live-situatie of tempowisseling.'],
];

function stripParenthetical(s) {
  return String(s).replace(/\s*\([^)]*\)\s*$/, '').trim();
}
function pickerDisplayLabel(value) {
  return escHtml(value);
}
function instrumentLevelLabels() {
  return NIVEAU_INFO_MUSICIAN_ROWS.map(r => stripParenthetical(String(r[0]).replace(/^\d+\.\s*/, '')));
}
function instrumentLevelBlurbs() {
  return NIVEAU_INFO_MUSICIAN_ROWS.map(r => {
    const firstSentence = String(r[1]).split('. ')[0].replace(/\.+$/, '');
    return firstSentence + '.';
  });
}

// ─── Generieke kies-en-badge-picker (TT-116-patroon, meervoudig, geen niveau)
// Zelfde cfg-registry-patroon als index.html: initPicker(cfg) registreert,
// de rest tekent en muteert cfg.getList() in-place. Hier gebruikt voor
// genre; blijft generiek zodat een volgende tegel (bijv. een toekomstige
// "Wat zoek je"-koppeling) 'm kan hergebruiken zonder kopie.
const PICKERS = {};
let activeListPickerId = null;

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
  document.getElementById(cfg.fieldId + 'Label').textContent = cfg.placeholder;
  cfg.badgeRowEl.innerHTML = list.map(v => `
    <div class="picker-badge">
      <button type="button" class="picker-badge-remove" aria-label="${escAttr(v)} verwijderen" onclick="removePickerValue('${jsAttr(cfg.id)}','${jsAttr(v)}')"><span aria-hidden="true">✕</span></button>
      <div class="picker-badge-label">${pickerDisplayLabel(v)}</div>
    </div>`).join('');
}
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
    if (value === cfg.exceptionValue) {
      if (!list.includes(value)) list.push(value);
    } else {
      const kept = (cfg.exceptionValue && list.includes(cfg.exceptionValue)) ? [cfg.exceptionValue] : [];
      list.length = 0;
      kept.forEach(v => list.push(v));
      list.push(value);
    }
    renderPickerBadges(cfg);
    if (cfg.onChange) cfg.onChange();
    closePickerList();
    return;
  }
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

// ─── Instrumentpicker mét niveau (TT-51/TT-116) ──────────────────────────
// Zelfde tweetraps-modal als index.html (eerst instrument kiezen, dan
// niveau). Daar hardcoded op één globale state.instruments/state.
// instrumentLevels; hier generiek gemaakt met een cfg-object — nodig omdat
// profiel-v2.html geen wizard-brede state kent, maar een aparte, smalle
// state per tegel (zie saveWatSpeelJe() in profiel-v2.html).
// cfg: { id, fieldId, badgeRowId, getInstruments, getLevels, onChange }
const INSTRUMENT_PICKERS = {};
let activeInstrumentPickerId = null;
let instrumentLevelTarget = null; // { instrument, cameFromList }

function initInstrumentPicker(cfg) {
  INSTRUMENT_PICKERS[cfg.id] = cfg;
  document.getElementById(cfg.fieldId).onclick = () => openInstrumentPicker(cfg.id);
  renderInstrumentBadges(cfg.id);
  return cfg;
}
function renderInstrumentBadges(id) {
  const cfg = INSTRUMENT_PICKERS[id];
  const wrap = document.getElementById(cfg.badgeRowId);
  const list = cfg.getInstruments();
  const levels = cfg.getLevels();
  document.getElementById(cfg.fieldId + 'Label').textContent = 'Kies een instrument';
  wrap.innerHTML = list.map(i => {
    const n = levels[i] || 0;
    const stars = n ? '★'.repeat(n) : '';
    return `
    <div class="picker-badge has-level" onclick="reopenInstrumentBadge('${jsAttr(id)}','${jsAttr(i)}')">
      <button type="button" class="picker-badge-remove" aria-label="${escAttr(i)} verwijderen" onclick="event.stopPropagation();quickRemoveInstrument('${jsAttr(id)}','${jsAttr(i)}')"><span aria-hidden="true">✕</span></button>
      <div class="picker-badge-label">${pickerDisplayLabel(i)}</div>
      <div class="picker-badge-stars">${stars}</div>
    </div>`;
  }).join('');
}
function quickRemoveInstrument(id, instrument) {
  const cfg = INSTRUMENT_PICKERS[id];
  const list = cfg.getInstruments();
  const idx = list.indexOf(instrument);
  if (idx !== -1) list.splice(idx, 1);
  delete cfg.getLevels()[instrument];
  renderInstrumentBadges(id);
  if (cfg.onChange) cfg.onChange();
}
function openInstrumentPicker(id) {
  activeInstrumentPickerId = id;
  renderInstrumentPickItems();
  document.getElementById('instrumentPickStep').style.display = 'block';
  document.getElementById('instrumentLevelStep').style.display = 'none';
  document.getElementById('instrumentLevelFooter').style.display = 'none';
  document.getElementById('instrumentLevelBackBtn').hidden = true;
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
  const cfg = INSTRUMENT_PICKERS[activeInstrumentPickerId];
  cfg.getInstruments().push(instrument);
  showInstrumentLevelStep(instrument, /* cameFromList */ true);
}
function reopenInstrumentBadge(id, instrument) {
  activeInstrumentPickerId = id;
  document.getElementById('instrumentLevelModal').classList.add('visible');
  showInstrumentLevelStep(instrument, /* cameFromList */ false);
}
function showInstrumentLevelStep(instrument, cameFromList) {
  instrumentLevelTarget = { instrument, cameFromList };
  document.getElementById('instrumentPickStep').style.display = 'none';
  document.getElementById('instrumentLevelStep').style.display = 'block';
  document.getElementById('instrumentLevelFooter').style.display = 'block';
  document.getElementById('instrumentLevelTitle').textContent = 'Wat is je huidige niveau voor ' + instrument + '?';
  document.getElementById('instrumentLevelSubtitle').textContent =
    cameFromList ? 'Kies het niveau waar je het dichtst bij in de buurt zit.' : 'Niveau wijzigen.';
  document.getElementById('instrumentLevelBackBtn').hidden = !cameFromList;
  renderInstrumentLevelChoices();
}
function backToInstrumentPick() {
  if (!instrumentLevelTarget || !instrumentLevelTarget.cameFromList) return;
  const cfg = INSTRUMENT_PICKERS[activeInstrumentPickerId];
  const levels = cfg.getLevels();
  if (!levels[instrumentLevelTarget.instrument]) {
    const list = cfg.getInstruments();
    const idx = list.indexOf(instrumentLevelTarget.instrument);
    if (idx !== -1) list.splice(idx, 1);
    renderInstrumentBadges(activeInstrumentPickerId);
  }
  openInstrumentPicker(activeInstrumentPickerId);
}
function renderInstrumentLevelChoices() {
  if (!instrumentLevelTarget) return;
  const cfg = INSTRUMENT_PICKERS[activeInstrumentPickerId];
  const huidig = cfg.getLevels()[instrumentLevelTarget.instrument] || 0;
  const labels = instrumentLevelLabels();
  const blurbs = instrumentLevelBlurbs();
  const rows = labels.map((label, idx) => {
    const value = idx + 1;
    let stars = '';
    for (let i = 1; i <= 5; i++) stars += '<span class="' + (i <= value ? 'filled' : '') + '">' + (i <= value ? '\u2605' : '\u2606') + '</span>';
    return '<button type="button" class="level-choice' + (value === huidig ? ' selected' : '') + '"'
      + ' aria-pressed="' + (value === huidig) + '" onclick="setInstrumentLevel(' + value + ')">'
      + '<span class="level-choice-stars">' + stars + '</span>'
      + '<span style="display:flex;flex-direction:column;text-align:left;">'
      + '<span class="level-choice-label">' + escHtml(label) + '</span>'
      + '<span class="picker-level-blurb">' + escHtml(blurbs[idx]) + '</span></span>'
      + '</button>';
  }).join('');
  document.getElementById('instrumentLevelChoices').innerHTML = rows;
  equalizeLevelChoiceHeights();
}
function equalizeLevelChoiceHeights() {
  const buttons = document.querySelectorAll('#instrumentLevelChoices .level-choice');
  if (!buttons.length) return;
  buttons.forEach(b => { b.style.height = 'auto'; });
  const maxHeight = Math.max(...Array.from(buttons).map(b => b.getBoundingClientRect().height));
  buttons.forEach(b => { b.style.height = maxHeight + 'px'; });
}
function setInstrumentLevel(value) {
  if (!instrumentLevelTarget) return;
  const cfg = INSTRUMENT_PICKERS[activeInstrumentPickerId];
  cfg.getLevels()[instrumentLevelTarget.instrument] = value;
  renderInstrumentBadges(activeInstrumentPickerId);
  if (cfg.onChange) cfg.onChange();
  closeInstrumentLevelSheet();
}
function removeInstrumentFromSheet() {
  if (!instrumentLevelTarget) return;
  quickRemoveInstrument(activeInstrumentPickerId, instrumentLevelTarget.instrument);
  closeInstrumentLevelSheet();
}
function closeInstrumentLevelSheet() {
  const cfg = INSTRUMENT_PICKERS[activeInstrumentPickerId];
  if (cfg && instrumentLevelTarget && instrumentLevelTarget.cameFromList && !cfg.getLevels()[instrumentLevelTarget.instrument]) {
    const list = cfg.getInstruments();
    const idx = list.indexOf(instrumentLevelTarget.instrument);
    if (idx !== -1) list.splice(idx, 1);
    renderInstrumentBadges(activeInstrumentPickerId);
  }
  document.getElementById('instrumentLevelModal').classList.remove('visible');
  document.getElementById('instrumentPickStep').style.display = 'block';
  document.getElementById('instrumentLevelStep').style.display = 'none';
  document.getElementById('instrumentLevelFooter').style.display = 'none';
  document.getElementById('instrumentLevelBackBtn').hidden = true;
  instrumentLevelTarget = null;
}

// ─── Niveau-toelichting (volledige tabel, i-knop) ────────────────────────
function openMusicianNiveauInfoModal() {
  const rowsHTML = NIVEAU_INFO_MUSICIAN_ROWS.map(r => `<tr>${r.map((c, i) => `<td>${escHtml(i === 0 ? stripParenthetical(c) : c)}</td>`).join('')}</tr>`).join('');
  document.getElementById('niveauInfoModalContent').innerHTML = `
    <div class="filter-title" style="margin-bottom:4px;">Niveau-indeling per instrument</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">Kies per instrument het niveau waar je het dichtst bij in de buurt zit. Zie het als een richtlijn, geen examen.</p>
    <div class="niveau-info-wrap">
      <table class="niveau-info-table">
        <thead><tr>${NIVEAU_INFO_MUSICIAN_HEADERS.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>`;
  document.getElementById('niveauInfoModal').classList.add('visible');
}

// ─── URL-veiligheid (TT-05, 1-op-1 uit index.html) ────────────────────────
// javascript:-URL's zijn het echte risico bij een <img src>/<a href> die
// rechtstreeks uit gebruikersinvoer of de database komt. blob: is
// toegestaan voor de lokale foto-preview (URL.createObjectURL).
function safeUrl(u) {
  const s = String(u ?? '').trim();
  return /^(https?:\/\/|blob:)/i.test(s) ? escHtml(s) : '';
}

// ─── Bestandsupload naar Supabase Storage (TT-02/TT-87, 1-op-1 uit index.html)
// Verwacht dezelfde twee buckets als index.html: 'avatars' en 'media'.

const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const AVATAR_TYPE_LABEL = 'JPG, PNG, GIF of WEBP';
const MEDIA_MIME_TYPES = AVATAR_MIME_TYPES.concat(['video/mp4', 'video/quicktime']);
const MEDIA_TYPE_LABEL = 'JPG, PNG, GIF, WEBP, MP4 of MOV';

// Geeft null terug als het bestand mag. Geeft anders een leesbare melding.
function fileTypeProblem(file, allowedTypes, typeLabel) {
  const type = (file.type || '').toLowerCase();
  if (allowedTypes.includes(type)) return null;
  if (type === 'image/heic' || type === 'image/heif') {
    return 'Dit fotoformaat (HEIC) werkt niet. Zet op je iPhone in Instellingen → Camera → Indelingen de optie "Meest compatibel" aan, of sla de foto op als JPG.';
  }
  return `Dit bestandsformaat werkt niet. Gebruik ${typeLabel}.`;
}

async function uploadToStorage(bucket, userId, file, maxBytes, maxLabel, allowedTypes, typeLabel) {
  if (file.size > maxBytes) throw new Error(`Bestand is te groot. Maximum ${maxLabel}.`);
  if (allowedTypes) {
    const problem = fileTypeProblem(file, allowedTypes, typeLabel);
    if (problem) throw new Error(problem);
  }
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await db.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false });
  if (upErr) throw upErr;
  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, path };
}
function uploadAvatarFile(file, userId) {
  return uploadToStorage('avatars', userId, file, 5 * 1024 * 1024, '5 MB', AVATAR_MIME_TYPES, AVATAR_TYPE_LABEL);
}
function uploadMediaFile(file, userId) {
  return uploadToStorage('media', userId, file, 50 * 1024 * 1024, '50 MB', MEDIA_MIME_TYPES, MEDIA_TYPE_LABEL);
}

// ─── Platform herkennen bij een mediakoppeling (1-op-1 uit index.html) ────
function detectPlatform(url) {
  if (url.includes('youtube') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('instagram')) return 'Instagram';
  if (url.includes('soundcloud')) return 'SoundCloud';
  if (url.includes('tiktok')) return 'TikTok';
  if (url.includes('spotify')) return 'Spotify';
  return 'Link';
}

// ─── Subtiele annuleer-bevestiging (TT-179, i.p.v. window.confirm) ───────
// Ronald (01-09-2026): de browser-eigen confirm()-popup is veel te groot en
// opvallend. Vervangen door een klein waarschuwingsregeltje vlak boven de
// actieknoppen — dezelfde plek waar de ogen al zijn. Eerste klik op
// Annuleren toont de waarschuwing, een tweede, aparte klik bevestigt.
// Zelfde onderliggende patroon als de V-19-bandformulier-bevestiging in
// index.html, hier generiek gemaakt voor hergebruik door alle vijf tegels.
// ─── Annuleren-knop die zelf van functie wisselt (TT-181-vervolg,
// 01-09-2026) ──────────────────────────────────────────────────────────
// Ronald: een apart waarschuwingsvlak (rood, later amber) voelde te zwaar
// voor "niet opgeslagen". Vervangen door hetzelfde patroon als een nummer
// verwijderen bij Je setlist: de knop verandert zelf. Alleen bij een
// wijziging wordt de knoptekst "Zeker weten? Niet opgeslagen." (geel, niet
// vetgedrukt). Een tweede klik op diezelfde knop bevestigt. Een klik
// ergens anders op het scherm zet de knop terug naar gewoon "Annuleren".
function handleCancelClick(btnId, hasChanges, onConfirm, confirmText) {
  const text = confirmText || 'Zeker weten? Niet opgeslagen.';
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (!hasChanges()) { onConfirm(); return; }
  if (btn.dataset.armed === '1') {
    btn.dataset.armed = '';
    btn.textContent = btn.dataset.originalText;
    btn.classList.remove('btn-cancel-armed');
    onConfirm();
    return;
  }
  btn.dataset.armed = '1';
  btn.dataset.originalText = btn.textContent;
  btn.textContent = text;
  btn.classList.add('btn-cancel-armed');
  // Pas ná deze klik een listener toevoegen — anders vangt hij de huidige,
  // nog bubbelende klik meteen weer af.
  setTimeout(() => {
    document.addEventListener('click', function onOutsideClick(e) {
      if (btn.dataset.armed !== '1') return;
      if (e.target === btn) return;
      btn.dataset.armed = '';
      btn.textContent = btn.dataset.originalText;
      btn.classList.remove('btn-cancel-armed');
    }, { once: true });
  }, 0);
}
// Bij het openen van een tegel eventuele "Zeker?"-status opruimen — dekt
// browser-terug of een directe hash-wijziging, die geen klik-event geven.
function resetCancelButton(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn || btn.dataset.armed !== '1') return;
  btn.dataset.armed = '';
  btn.textContent = btn.dataset.originalText || btn.textContent;
  btn.classList.remove('btn-cancel-armed');
}
