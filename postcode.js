// ─── Postcode → woonplaats (PDOK Locatieserver, gratis overheidsdienst) ─────
let postcodeSearchTimeout = null;
let postcodeResolved = false;

// TT-80 (10-08-2026, zelf gevonden bij het testen van de datafix): na de
// datamigratie staat postcode_cache.city al gewoon op "Den Haag"/"Den Bosch"
// — maar pickDisplayCity() herkende alleen de rúwe officiële naam als
// uitzondering, en viel voor "Den Haag" zelf terug op het eerste item in
// alternatieve_schrijfwijzen (dat nu net de oude officiële naam bevat, want
// die is daar door dezelfde migratie ingezet). Resultaat: "Den Haag" typen
// gaf alsnog "'s Gravenhage" terug. Idempotent gemaakt: de gangbare naam
// zelf is nu ook een geldige sleutel, wijst naar zichzelf.
const CITY_NAME_EXCEPTIONS = {
  "'s-gravenhage": 'Den Haag',
  "s gravenhage": 'Den Haag',
  "s-gravenhage": 'Den Haag',
  "den haag": 'Den Haag',
  "'s-hertogenbosch": 'Den Bosch',
  "s hertogenbosch": 'Den Bosch',
  "s-hertogenbosch": 'Den Bosch',
  "den bosch": 'Den Bosch',
};

// TT-80 (10-08-2026, bevinding Ronald: "dit geldt niet alleen voor Den Haag
// maar ook voor andere steden"). Geverifieerd: deze functie liet ALTIJD het
// eerste item van alternatieve_schrijfwijzen winnen van de eigenlijk al
// juiste city-waarde, voor elke stad — niet alleen Den Haag/Den Bosch. Dat
// veld blijft wél gewoon bruikbaar om op te zoeken (ILIKE-matches elders in
// de code, ongewijzigd) — alleen niet meer om de weergavenaam mee te kiezen.
// city (eventueel via CITY_NAME_EXCEPTIONS) is nu altijd de bron van
// waarheid voor wat er getoond wordt.
function pickDisplayCity(officialCity, altField) {
  const key = (officialCity || '').toLowerCase().replace(/[’']/g, "'").trim();
  if (CITY_NAME_EXCEPTIONS[key]) return CITY_NAME_EXCEPTIONS[key];
  return normalizeCityName(officialCity || '');
}

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
        // TT-80 (10-08-2026, bevinding Ronald): hier stond eerder de rauwe
        // PDOK-naam (bijv. "'s-Gravenhage") die in de cache belandde, terwijl
        // displayCity hierboven al de gangbare naam ("Den Haag") berekende —
        // maar alleen voor dit ene scherm. tt_resolve_search_origin() zoekt
        // rechtstreeks op postcode_cache.city, dus elke nieuwe postcode-
        // opzoeking zette de zoekfunctie zo steeds weer stuk. Nu wordt de
        // gangbare naam zelf opgeslagen; de officiële naam blijft
        // terugvindbaar via alternatieve_schrijfwijzen.
        const officialName = doc.woonplaatsnaam;
        const altList = (alt?.alternatieve_schrijfwijzen || '').split(';').map(s => s.trim()).filter(Boolean);
        if (officialName.toLowerCase() !== displayCity.toLowerCase()
            && !altList.some(a => a.toLowerCase() === officialName.toLowerCase())) {
          altList.push(officialName);
        }
        // B-03 (12-08-2026): schrijft niet meer rechtstreeks in de tabel.
        // De open INSERT/UPDATE-regels stonden toe dat iedereen — ook zonder
        // account — coördinaten kon overschrijven, en daarmee elke afstand in
        // de app. De functie tt_cache_postcode raakt latitude/longitude nooit
        // aan en controleert het postcodeformaat.
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

function enableManualCity(kind) {
  const isBand   = kind === 'band';
  const cityId   = isBand ? 'bandCity' : 'city';
  const statusId = isBand ? 'bandPostcodeStatus' : 'postcodeStatus';
  const field = document.getElementById(cityId);
  field.readOnly = false;
  field.style.cursor = '';
  field.style.opacity = '';
  field.value = '';
  field.placeholder = 'Typ je plaatsnaam en kies uit de lijst';
  const statusEl = document.getElementById(statusId);
  statusEl.style.color = 'var(--accent2)';
  statusEl.textContent = 'We kunnen je plaats even niet automatisch ophalen — vul hem hieronder zelf in.';
  if (isBand) {
    bandPostcodeResolved = false;
    bandCitySource = 'manual';
    bandPostcodeManualMode = true;
  } else {
    state.city = '';
    postcodeResolved = false;
    state.citySource = 'manual';
    postcodeManualMode = true;
  }
  field.focus();
}

function relockCity(kind) {
  const isBand = kind === 'band';
  const field = document.getElementById(isBand ? 'bandCity' : 'city');
  field.readOnly = true;
  field.style.cursor = 'not-allowed';
  field.style.opacity = '0.85';
  if (isBand) bandPostcodeManualMode = false;
  else postcodeManualMode = false;
}

let postcodeFailStreak = 0;
let postcodeManualMode = false;

function onPostcodeInput(value) {
  postcodeResolved = false;
  state.citySource = 'pdok';
  document.getElementById('city').value = '';
  state.city = '';
  const statusEl = document.getElementById('postcodeStatus');
  clearTimeout(postcodeSearchTimeout);

  const digits = value.trim().replace(/\D/g, '');
  document.getElementById('zip').value = digits;
  const match = digits.match(/^[1-9][0-9]{3}$/);
  if (!match) {
    statusEl.textContent = '';
    return;
  }
  const normalized = digits;
  statusEl.style.color = 'var(--muted)';
  statusEl.textContent = 'Bezig met opzoeken...';

  postcodeSearchTimeout = setTimeout(async () => {
    const outcome = await lookupPostcodeCity(normalized);
    if (outcome.found) {
      postcodeFailStreak = 0;
      if (postcodeManualMode) relockCity('musician');
      state.citySource = outcome.source;
      applyResolvedCity(outcome.city, normalized, statusEl, `Gevonden: ${outcome.city}`);
    } else if (outcome.reason === 'notfound') {
      enableManualCity('musician');
    } else {
      postcodeFailStreak++;
      if (postcodeFailStreak >= 2) {
        enableManualCity('musician');
      } else {
        statusEl.style.color = 'var(--danger)';
        statusEl.textContent = 'Kon postcode nu niet controleren. Probeer het nog eens.';
      }
    }
  }, 500);
}

let postcodeStatusHideTimeout;
function applyResolvedCity(cityName, normalizedZip, statusEl, msg) {
  document.getElementById('city').value = cityName;
  state.city = cityName;
  state.zip  = normalizedZip;
  postcodeResolved = true;
  statusEl.style.color = 'var(--accent)';
  statusEl.textContent = msg;
  // Punt 6 (25-08-2026, Ronald): melding verdwijnt na 2 seconden — het
  // bevestigt alleen het moment zelf, hoeft niet te blijven staan.
  clearTimeout(postcodeStatusHideTimeout);
  postcodeStatusHideTimeout = setTimeout(() => { statusEl.textContent = ''; }, 2000);
}

// ─── Postcode-opzoeking voor bands (zelfde aanpak als bij muzikanten) ────

let bandPostcodeResolved = false;
let editingBandId = null;
let bandPostcodeSearchTimeout;
let bandPostcodeFailStreak = 0;
let bandPostcodeManualMode = false;
let bandCitySource = 'pdok';

let bandPostcodeStatusHideTimeout;
function applyResolvedBandCity(cityName, statusEl, msg) {
  document.getElementById('bandCity').value = cityName;
  bandPostcodeResolved = true;
  statusEl.style.color = 'var(--accent)';
  statusEl.textContent = msg;
  clearTimeout(bandPostcodeStatusHideTimeout);
  bandPostcodeStatusHideTimeout = setTimeout(() => { statusEl.textContent = ''; }, 2000);
}

function onBandPostcodeInput(value) {
  bandPostcodeResolved = false;
  bandCitySource = 'pdok';
  document.getElementById('bandCity').value = '';
  const statusEl = document.getElementById('bandPostcodeStatus');
  clearTimeout(bandPostcodeSearchTimeout);

  const digits = value.trim().replace(/\D/g, '');
  document.getElementById('bandZip').value = digits;
  const match = digits.match(/^[1-9][0-9]{3}$/);
  if (!match) {
    statusEl.textContent = '';
    return;
  }
  const normalized = digits;
  statusEl.style.color = 'var(--muted)';
  statusEl.textContent = 'Bezig met opzoeken...';

  bandPostcodeSearchTimeout = setTimeout(async () => {
    const outcome = await lookupPostcodeCity(normalized);
    if (outcome.found) {
      bandPostcodeFailStreak = 0;
      if (bandPostcodeManualMode) relockCity('band');
      bandCitySource = outcome.source;
      applyResolvedBandCity(outcome.city, statusEl, `Gevonden: ${outcome.city}`);
    } else if (outcome.reason === 'notfound') {
      enableManualCity('band');
    } else {
      bandPostcodeFailStreak++;
      if (bandPostcodeFailStreak >= 2) {
        enableManualCity('band');
      } else {
        statusEl.style.color = 'var(--danger)';
        statusEl.textContent = 'Kon postcode nu niet controleren. Probeer het nog eens.';
      }
    }
  }, 500);
}

// ─── Vertrekpunt voor zoeken zonder eigen profiel ───────────────────────────
// Het bestaande Plaats-veld (filterCity/filterBandCity) doet zonder eigen
// profiel dubbele dienst: gewoon tekstfilter, én het vertrekpunt voor
// straal/afstand/sortering. Opzoeking gebeurt server-side via
// tt_resolve_search_origin() (04-08-2026, performance) — voorheen werden
// hiervoor tot 300 rijen uit postcode_cache naar de browser gestuurd en
// dáár gemiddeld; nu doet de database dat zelf in één lichte aanvraag.
async function resolveSearchOrigin(rawText) {
  const raw = (rawText || '').trim();
  if (!raw) return { lat: null, lng: null };
  try {
    const { data, error } = await db.rpc('tt_resolve_search_origin', { query_text: raw });
    if (error) throw error;
    const row = (data || [])[0];
    return { lat: row?.lat ?? null, lng: row?.lng ?? null };
  } catch (e) {
    return { lat: null, lng: null };
  }
}

// TT-160 (27-08-2026, Ronalds voorstel): het Plaats-veld op de drie
// zoekpagina's (Muzikanten/Bands/Setlist) blijft precies zo werken als
// eerst — postcode óf plaatsnaam typen mag allebei, zie onCitySearchInput()
// hieronder. Nieuw is een permanente bevestigingsregel eronder ("Gevonden:
// 'plaatsnaam'"), zodat altijd zichtbaar is welke plaats de zoekopdracht nu
// echt gebruikt. Losstaand van de melding op het profiel-/bandformulier
// (postcodeStatus/bandPostcodeStatus, TT-150) — die verdwijnt bewust nog
// steeds na 2 seconden tijdens het typen; dat gedrag is hier niet aangeraakt.
// Hergebruikt dezelfde tabel (postcode_cache) als de plaatsnaam-suggesties
// verderop — geen nieuwe databasefunctie nodig.
const searchCityStatusTimeouts = {};
const searchCityStatusSeq = {};

function scheduleSearchCityStatus(inputId, statusId) {
  clearTimeout(searchCityStatusTimeouts[statusId]);
  searchCityStatusTimeouts[statusId] = setTimeout(() => updateSearchCityStatus(inputId, statusId), 300);
}

async function updateSearchCityStatus(inputId, statusId) {
  const inputEl = document.getElementById(inputId);
  const statusEl = document.getElementById(statusId);
  if (!inputEl || !statusEl) return;
  const raw = inputEl.value.trim();
  if (!raw) { statusEl.textContent = ''; return; }

  const seq = (searchCityStatusSeq[statusId] = (searchCityStatusSeq[statusId] || 0) + 1);
  const display = await resolveCityDisplayName(raw);
  // Is er intussen alweer getypt (of een ander veld heeft dezelfde statusEl
  // niet, maar de zoekopdracht kan wel voorbij zijn gestreefd)? Dan is dit
  // antwoord verouderd — niet meer tonen.
  if (searchCityStatusSeq[statusId] !== seq) return;
  statusEl.textContent = display ? `Gevonden: ${display}` : '';
}

// Zoekt de kanonieke plaatsnaam op bij een getypte postcode (exacte 4
// cijfers) of een getypte naam (exacte match, ongeacht hoofdletters, tegen
// de officiële naam of een bekende alternatieve schrijfwijze — dezelfde
// tabel als de suggesties). Geen brede/gedeeltelijke match: bij een half
// getypte naam staat er nog niets, tot de naam klopt of iemand een suggestie
// kiest (die de canonieke naam meteen invult, zie selectCitySuggestion()).
async function resolveCityDisplayName(raw) {
  try {
    if (/^\d{4}$/.test(raw)) {
      const { data, error } = await db.from('postcode_cache')
        .select('city, alternatieve_schrijfwijzen')
        .eq('postcode', raw)
        .maybeSingle();
      if (error || !data) return null;
      return pickDisplayCity(data.city, data.alternatieve_schrijfwijzen);
    }
    const pattern = orValue(likeSafe(raw));
    const { data, error } = await db.from('postcode_cache')
      .select('city, alternatieve_schrijfwijzen')
      .or(`city.ilike.${pattern},alternatieve_schrijfwijzen.ilike.${pattern}`)
      .limit(1);
    if (error || !data || !data.length) return null;
    return pickDisplayCity(data[0].city, data[0].alternatieve_schrijfwijzen);
  } catch (e) {
    return null;
  }
}

// ─── Plaatsnaam-suggesties bij zoeken (Muzikant/Band/Setlist zonder eigen profiel) ─
// Vult de Plaats-velden aan met de officiële/eenduidige schrijfwijze uit de
// bestaande postcode_cache-tabel (dezelfde tabel/aanpak als bij postcode-invoer
// op het profiel) — puur lezend, geen nieuwe tabellen of schema-wijzigingen nodig.
let citySearchTimeout = null;
const citySuggestCache = new Map(); // query (lowercase) -> canonical city names[]

function onCitySearchInput(value, listId) {
  const ac = document.getElementById(listId);
  const q = (value || '').trim();

  // Een postcode heeft hier geen plaatsnaam-suggesties nodig
  if (/^\d{4}$/.test(q) || q.length < 2) { ac.classList.remove('open'); return; }
  // TT-26: als er na het weghalen van jokertekens niets bruikbaars overblijft
  // (bijv. iemand typt alleen "%%"), niets zoeken i.p.v. alles matchen.
  if (likeSafe(q).length < 2) { ac.classList.remove('open'); return; }

  const cacheKey = q.toLowerCase();
  if (citySuggestCache.has(cacheKey)) {
    renderCitySuggestions(ac, citySuggestCache.get(cacheKey), listId);
    return;
  }

  clearTimeout(citySearchTimeout);
  citySearchTimeout = setTimeout(async () => {
    try {
      // TT-26: jokertekens eruit + waarde tussen quotes, zodat een komma of %
      // in de zoekterm de .or()-syntax niet openbreekt.
      const pattern = orValue('%' + likeSafe(q) + '%');
      const { data, error } = await db.from('postcode_cache')
        .select('city, alternatieve_schrijfwijzen')
        .or(`city.ilike.${pattern},alternatieve_schrijfwijzen.ilike.${pattern}`)
        .limit(50);
      if (error) throw error;

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
      renderCitySuggestions(ac, top, listId);
    } catch (e) {
      ac.classList.remove('open');
    }
  }, 300);
}

function renderCitySuggestions(ac, names, listId) {
  if (!names.length) { ac.classList.remove('open'); return; }
  ac.innerHTML = names.map(name =>
    `<div class="ac-item" onmousedown="selectCitySuggestion('${jsAttr(name)}','${jsAttr(listId)}')">${escHtml(name)}</div>`
  ).join('');
  ac.classList.add('open');
}

function selectCitySuggestion(name, listId) {
  if (listId === 'acCityManualList') {
    document.getElementById('city').value = name;
    state.city = name;
    state.citySource = 'manual';
    postcodeResolved = true;
    document.getElementById('postcodeStatus').textContent = `Gekozen: ${name}`;
    document.getElementById('postcodeStatus').style.color = 'var(--accent)';
    closeAC(listId);
    return;
  }
  if (listId === 'acBandCityManualList') {
    document.getElementById('bandCity').value = name;
    bandCitySource = 'manual';
    bandPostcodeResolved = true;
    document.getElementById('bandPostcodeStatus').textContent = `Gekozen: ${name}`;
    document.getElementById('bandPostcodeStatus').style.color = 'var(--accent)';
    closeAC(listId);
    return;
  }
  // TT-168-overgang (02-09-2026): tegel "Wie ben je" — eigen, lokale
  // wbjPostcodeManualMode-variabele i.p.v. de wizard-brede postcodeManualMode.
  if (listId === 'wbjCityAc') {
    document.getElementById('wbjCity').value = name;
    wbjPostcodeManualMode = true;
    const statusEl = document.getElementById('wbjPostcodeStatus');
    statusEl.textContent = `Gekozen: ${name}`;
    statusEl.style.color = 'var(--accent)';
    closeAC(listId);
    return;
  }
  const fieldMap = {
    acFilterCityList: { field: 'filterCity', status: 'filterCityStatus' },
    acFilterBandCityList: { field: 'filterBandCity', status: 'filterBandCityStatus' },
    acFilterSetlistCityList: { field: 'filterSetlistCity', status: 'filterSetlistCityStatus' }
  };
  const target = fieldMap[listId];
  if (target) {
    document.getElementById(target.field).value = name;
    // TT-160: een gekozen suggestie is al de kanonieke naam — meteen tonen,
    // niet wachten op de getypte-tekst-vertraging.
    updateSearchCityStatus(target.field, target.status);
  }
  closeAC(listId);
}

// Convert DD-MM-YYYY to YYYY-MM-DD for database storage
function toISODate(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split('-');
  return `${yyyy}-${mm}-${dd}`;
}

function fromISODate(iso) {
  if (!iso) return '';
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}-${mm}-${yyyy}`;
}

let editingMusicianId = null;
// TT-168-overgang (02-09-2026): editSnapshot/buildEditSnapshot() zijn
// vervallen — die vergeleken de wizard-state tijdens het bewerken van een
// bestaand profiel via de wizard (TT-143). Elke tegel heeft nu zijn eigen,
// vergelijkbare snapshot-functie (bijv. wbjFieldSnapshot()), lokaal bij de
// tegel zelf.

