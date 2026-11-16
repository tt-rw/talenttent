
let postcodeSearchTimeout = null;
let postcodeResolved = false;









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









function pickDisplayCity(officialCity, altField) {
  const key = (officialCity || '').toLowerCase().replace(/[’']/g, "'").trim();
  if (CITY_NAME_EXCEPTIONS[key]) return CITY_NAME_EXCEPTIONS[key];
  return normalizeCityName(officialCity || '');
}






async function lookupPostcodeCity(normalized) {
  try {
    const { data, error } = await db.from('postcode_cache')
      .select('city, alternatieve_schrijfwijzen')
      .eq('postcode', normalized)
      .maybeSingle();
    if (error) throw error;
    if (data?.city) return { found: true, city: pickDisplayCity(data.city, data.alternatieve_schrijfwijzen), source: 'cache' };
    return { found: false, reason: 'notfound' };
  } catch (e) {
    logCaught('lookupPostcodeCity', e);
    return { found: false, reason: 'error' };
  }
}

function enableManualCity(kind) {
  const isBand   = kind === 'band';

  const cityId   = isBand ? BAND_POSTCODE_VELDEN[bandPostcodeDoel].city : 'city';
  const statusId = isBand ? BAND_POSTCODE_VELDEN[bandPostcodeDoel].status : 'postcodeStatus';
  const field = document.getElementById(cityId);
  field.readOnly = false;
  field.style.cursor = '';
  field.value = '';
  field.placeholder = 'Typ je plaatsnaam en kies uit de lijst';
  const statusEl = document.getElementById(statusId);
  zetUitslag(statusId, '');
  statusEl.style.color = 'var(--text)';
  statusEl.textContent = 'We kunnen je plaats even niet automatisch ophalen — vul Plaats zelf in.';
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
  const field = document.getElementById(isBand ? BAND_POSTCODE_VELDEN[bandPostcodeDoel].city : 'city');
  field.readOnly = true;
  field.style.cursor = 'not-allowed';


  if (isBand) bandPostcodeManualMode = false;
  else postcodeManualMode = false;
}

let postcodeFailStreak = 0;
let postcodeManualMode = false;

function onPostcodeInput(value) {
  postcodeResolved = false;
  state.citySource = 'cache';
  document.getElementById('city').value = '';
  state.city = '';
  const statusEl = document.getElementById('postcodeStatus');
  clearTimeout(postcodeSearchTimeout);

  const digits = value.trim().replace(/\D/g, '');
  document.getElementById('zip').value = digits;
  const match = digits.match(/^[1-9][0-9]{3}$/);
  statusEl.textContent = '';
  if (!match) {
    zetUitslag('postcodeStatus', '');
    return;
  }
  const normalized = digits;
  zetUitslag('postcodeStatus', 'Zoeken…');

  postcodeSearchTimeout = setTimeout(async () => {
    const outcome = await lookupPostcodeCity(normalized);
    if (outcome.found) {
      postcodeFailStreak = 0;
      if (postcodeManualMode) relockCity('musician');
      state.citySource = outcome.source;
      applyResolvedCity(outcome.city, normalized, statusEl);
    } else if (outcome.reason === 'notfound') {
      enableManualCity('musician');
    } else {
      postcodeFailStreak++;
      if (postcodeFailStreak >= 2) {
        enableManualCity('musician');
      } else {
        zetUitslag('postcodeStatus', '');
        statusEl.style.color = 'var(--text)';
        statusEl.textContent = 'Postcode controleren lukt nu niet. Controleer je verbinding en vul de postcode nog eens in.';
      }
    }
  }, 500);
}

function applyResolvedCity(cityName, normalizedZip, statusEl) {
  document.getElementById('city').value = cityName;
  state.city = cityName;
  state.zip  = normalizedZip;
  postcodeResolved = true;
  wizHoesBijwerken();


  statusEl.textContent = '';
  zetUitslag('postcodeStatus', '');
}



let bandPostcodeResolved = false;
let bandPostcodeSearchTimeout;
let bandPostcodeFailStreak = 0;
let bandPostcodeManualMode = false;
let bandCitySource = 'cache';







const BAND_POSTCODE_VELDEN = {
  band: { zip: 'bandZip', city: 'bandCity', status: 'bandPostcodeStatus' },
  bw:   { zip: 'bwZip',   city: 'bwCity',   status: 'bwPostcodeStatus' }
};
let bandPostcodeDoel = 'band';

function applyResolvedBandCity(cityName, statusEl) {
  document.getElementById(BAND_POSTCODE_VELDEN[bandPostcodeDoel].city).value = cityName;
  bandPostcodeResolved = true;
  statusEl.textContent = '';
  zetUitslag(BAND_POSTCODE_VELDEN[bandPostcodeDoel].status, '');
}

function onBandPostcodeInput(value, doel) {
  bandPostcodeDoel = doel || 'band';
  const velden = BAND_POSTCODE_VELDEN[bandPostcodeDoel];
  bandPostcodeResolved = false;
  bandCitySource = 'cache';
  document.getElementById(velden.city).value = '';
  const statusEl = document.getElementById(velden.status);
  clearTimeout(bandPostcodeSearchTimeout);

  const digits = value.trim().replace(/\D/g, '');
  document.getElementById(velden.zip).value = digits;
  const match = digits.match(/^[1-9][0-9]{3}$/);
  statusEl.textContent = '';
  if (!match) {
    zetUitslag(velden.status, '');
    return;
  }
  const normalized = digits;
  zetUitslag(velden.status, 'Zoeken…');

  bandPostcodeSearchTimeout = setTimeout(async () => {
    const outcome = await lookupPostcodeCity(normalized);
    if (outcome.found) {
      bandPostcodeFailStreak = 0;
      if (bandPostcodeManualMode) relockCity('band');
      bandCitySource = outcome.source;
      applyResolvedBandCity(outcome.city, statusEl);
    } else if (outcome.reason === 'notfound') {
      enableManualCity('band');
    } else {
      bandPostcodeFailStreak++;
      if (bandPostcodeFailStreak >= 2) {
        enableManualCity('band');
      } else {
        zetUitslag(velden.status, '');
        statusEl.style.color = 'var(--text)';
        statusEl.textContent = 'Postcode controleren lukt nu niet. Controleer je verbinding en vul de postcode nog eens in.';
      }
    }
  }, 500);
}








async function resolveSearchOrigin(rawText) {
  const raw = (rawText || '').trim();
  if (!raw) return { lat: null, lng: null };
  try {
    const { data, error } = await db.rpc('tt_resolve_search_origin', { query_text: raw });
    if (error) throw error;
    const row = (data || [])[0];
    return { lat: row?.lat ?? null, lng: row?.lng ?? null };
  } catch (e) {
    logCaught('resolveSearchOrigin', e);

    return { lat: null, lng: null, fout: true };
  }
}








async function zoekVertrekpunt(tekst) {
  const getypt = (tekst || '').trim();
  if (hasOwnProfile) {
    const mijnPlaats = await getMyCity();
    if (!getypt || (!!mijnPlaats && getypt.toLowerCase() === mijnPlaats.toLowerCase())) {
      return { lat: null, lng: null, eigen: true, plaats: mijnPlaats };
    }
  }
  const o = await resolveSearchOrigin(getypt);
  return { lat: o.lat, lng: o.lng, eigen: false, plaats: null, fout: !!o.fout };
}








function plaatsIsOnbekend(tekst, vertrek) {
  const t = (tekst || '').trim();

  if (!t || /^\d{1,3}$/.test(t)) return false;
  return !vertrek.eigen && !vertrek.fout && vertrek.lat == null;
}


function lettersVerschil(a, b) {
  let vorige = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const rij = [i];
    for (let j = 1; j <= b.length; j++) {
      rij[j] = Math.min(vorige[j] + 1, rij[j - 1] + 1, vorige[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    vorige = rij;
  }
  return vorige[b.length];
}









async function plaatsDieErOpLijkt(tekst) {
  const t = (tekst || '').trim().toLowerCase();
  if (likeSafe(t).length < 2) return null;
  const begin = likeSafe(t.slice(0, 1));
  const eind = t.length >= 4 ? likeSafe(t.slice(-3)) : '';
  const vraag = patroon => db.from('postcode_cache')
    .select('city, alternatieve_schrijfwijzen')
    .ilike('city', patroon)
    .limit(1000);
  const antwoorden = await Promise.all([
    begin ? vraag(begin + '%') : { data: [] },
    eind.length === 3 ? vraag('%' + eind) : { data: [] }
  ]);
  const fout = antwoorden.find(a => a.error);
  if (fout) throw fout.error;
  const data = antwoorden.flatMap(a => a.data || []);
  let beste = null, besteVerschil = 3;
  const gezien = new Set();
  data.forEach(rij => {
    const naam = pickDisplayCity(rij.city, rij.alternatieve_schrijfwijzen);
    if (!naam || gezien.has(naam)) return;
    gezien.add(naam);
    const verschil = lettersVerschil(t, naam.toLowerCase());
    if (verschil < besteVerschil || (verschil === besteVerschil && beste && naam.localeCompare(beste, 'nl') < 0)) {
      beste = naam; besteVerschil = verschil;
    }
  });
  return beste;
}




async function plaatsOnbekendTonen(veldId, statusId, tekst, zoekOpnieuw) {
  const veld = document.getElementById(veldId);
  if (!veld) return;
  let suggestie = null;
  try { suggestie = await plaatsDieErOpLijkt(tekst); }
  catch (e) { logCaught('plaatsDieErOpLijkt', e); }
  if (veld.value.trim() !== (tekst || '').trim()) return;
  if (!suggestie) { setFieldError(veld, 'Deze plaats herkennen we niet.'); return; }
  setFieldError(veld, 'Bedoel je: ' + suggestie + '?');
  const regel = veldFoutAnker(veld).nextElementSibling;
  const span = regel && regel.querySelector('span');
  if (!span) return;
  const knop = document.createElement('button');
  knop.type = 'button';
  knop.className = 'bedoel-link';
  knop.textContent = suggestie;
  knop.addEventListener('click', () => {
    veld.value = suggestie;
    clearFieldError(veld);
    updateSearchCityStatus(veldId, statusId);
    zoekOpnieuw();
  });
  span.textContent = 'Bedoel je: ';
  span.append(knop, '?');
}











const searchCityStatusTimeouts = {};
const searchCityStatusSeq = {};

function scheduleSearchCityStatus(inputId, statusId) {
  clearTimeout(searchCityStatusTimeouts[statusId]);

  const oud = document.getElementById(statusId);
  if (oud) oud.textContent = '';
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



  if (searchCityStatusSeq[statusId] !== seq) return;





  const zelfde = display && display.toLowerCase() === raw.toLowerCase();
  statusEl.textContent = display && !zelfde ? display : '';
  plaatsAchterPlaatsen(inputEl, statusEl);
}






function plaatsAchterPlaatsen(inputEl, statusEl) {
  if (!inputEl.dataset.plaatsAchter && typeof ResizeObserver === 'function') {
    inputEl.dataset.plaatsAchter = '1';
    new ResizeObserver(() => plaatsAchterPlaatsen(inputEl, statusEl)).observe(inputEl);
  }
  if (!statusEl.textContent || !inputEl.offsetWidth) return;
  const cs = getComputedStyle(inputEl);
  const meet = plaatsAchterPlaatsen.c || (plaatsAchterPlaatsen.c = document.createElement('canvas').getContext('2d'));
  meet.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const links = inputEl.offsetLeft + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)
    + meet.measureText(inputEl.value).width + 8;
  const rechts = inputEl.offsetLeft + inputEl.offsetWidth - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
  statusEl.style.left = links + 'px';
  statusEl.style.maxWidth = Math.max(0, rechts - links) + 'px';
  statusEl.style.top = (inputEl.offsetTop + (inputEl.offsetHeight - statusEl.offsetHeight) / 2) + 'px';
}







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
    logCaught('resolveCityDisplayName', e);
    return null;
  }
}





let citySearchTimeout = null;
const citySuggestCache = new Map();






let citySearchSeq = 0;
function onCitySearchInput(value, listId) {
  const ac = document.getElementById(listId);
  const q = (value || '').trim();
  clearTimeout(citySearchTimeout);
  const seq = ++citySearchSeq;
  const leeg = () => { ac.classList.remove('open'); ac.innerHTML = ''; };


  if (/^\d{4}$/.test(q) || q.length < 2) { leeg(); return; }


  if (likeSafe(q).length < 2) { leeg(); return; }

  const cacheKey = q.toLowerCase();
  if (citySuggestCache.has(cacheKey)) {
    renderCitySuggestions(ac, citySuggestCache.get(cacheKey), listId);
    return;
  }

  citySearchTimeout = setTimeout(async () => {
    try {


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
      if (seq !== citySearchSeq) return;
      renderCitySuggestions(ac, top, listId);
    } catch (e) {
      logCaught('onCitySearchInput', e);
      if (seq === citySearchSeq) ac.classList.remove('open');
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
    wizHoesBijwerken();
    document.getElementById('postcodeStatus').textContent = '';
    zetUitslag('postcodeStatus', '');
    closeAC(listId);
    return;
  }
  if (listId === 'acBandCityManualList' || listId === 'bwCityAc') {
    const velden = BAND_POSTCODE_VELDEN[listId === 'bwCityAc' ? 'bw' : 'band'];
    document.getElementById(velden.city).value = name;
    bandCitySource = 'manual';
    bandPostcodeResolved = true;
    document.getElementById(velden.status).textContent = '';
    zetUitslag(velden.status, '');
    closeAC(listId);
    return;
  }


  if (listId === 'wbjCityAc') {
    document.getElementById('wbjCity').value = name;
    wbjPostcodeManualMode = true;
    const statusEl = document.getElementById('wbjPostcodeStatus');
    statusEl.textContent = '';
    zetUitslag('wbjPostcodeStatus', '');
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


    updateSearchCityStatus(target.field, target.status);
  }
  closeAC(listId);
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







