


const LEVEL_LABELS = { basis: 'Basis', bijna: 'Bijna', podium: 'Podium' };




let filterInstruments = [];
let filterGenres      = [];
let searchSortMode    = 'score';




const STRAAL_STAPPEN = [5, 10, 15, 25, 50, 100];
const STRAAL_STANDAARD = 10;
const STRAAL_RIJEN = STRAAL_STAPPEN.map(km => ({ t: `${km} km`, waarden: [km] }));



const LEEFTIJD_GROEPEN = [[13, 15], [16, 18], [19, 24], [25, 34], [35, '']];
const LEEFTIJD_RIJEN = LEEFTIJD_GROEPEN.map(([van, tot]) => ({ t: tot === '' ? `${van}+` : `${van}-${tot}`, waarden: [van, tot] }));
const NIVEAU_RIJEN = [1, 2, 3, 4, 5].map(n => ({ t: String(n), waarden: [n, n] }));





function straalOpStap(km) {
  const n = Number(km);
  if (!n) return STRAAL_STANDAARD;
  return STRAAL_STAPPEN.find(s => s >= n) || STRAAL_STAPPEN[STRAAL_STAPPEN.length - 1];
}
function leeftijdOpGroepen(min, max) {
  if (min === '' && max === '') return ['', ''];
  const groep = (n) => LEEFTIJD_GROEPEN.find(([van, tot]) => tot === '' || Number(n) <= tot);
  return [min === '' ? LEEFTIJD_GROEPEN[0][0] : groep(min)[0], max === '' ? '' : groep(max)[1]];
}



let digestFrequencyValue = 'daily';

let instellingenDigest = { mid: null, waarde: null };
let instellingenNaam = { mid: null, naam: '' };


let lastZoekResultaten = [];


let zoekVerruimd = null;

let laatsteZoekVertrek = null;
let setlistVerruimd = null;









let musicianViewMode = (() => {
  try { return localStorage.getItem('tt_zoekWeergave') || 'list'; }
  catch (e) { return 'list'; }
})();


function syncViewToggles() {
  const musicianSel = document.getElementById('musicianViewToggle');
  if (musicianSel) musicianSel.value = musicianViewMode;
  refreshChoiceField('weergave');
}

function setMusicianViewMode(mode) {
  musicianViewMode = mode;
  try { localStorage.setItem('tt_zoekWeergave', mode); } catch(e) {}
  const sel = document.getElementById('musicianViewToggle');
  if (sel) sel.value = mode;
  refreshChoiceField('weergave');
  if (lastZoekResultaten.length) renderCappedZoekResultaten();
}



let musicianDistanceCache = {};










let zoekScherm = 'start';
let zoekSchermDirect = false;

let zoekSoort = 'alles';
const ZOEK_SOORTEN = ['alles', 'muzikanten', 'bands'];
const ZOEK_SCHERMEN = ['start', 'muzikanten', 'mixmatch'];
const ZOEK_SCHERM_IDS = { start: 'zoekStart', muzikanten: 'searchModeMusician', mixmatch: 'searchModeSetlist' };


function zetZoekScherm(scherm) {
  if (!ZOEK_SCHERMEN.includes(scherm)) scherm = 'start';
  zoekScherm = scherm;
  if (scherm === 'start') zoekSchermDirect = false;
  Object.keys(ZOEK_SCHERM_IDS).forEach(k => {
    const el = document.getElementById(ZOEK_SCHERM_IDS[k]);
    if (el) el.style.display = k === scherm ? 'block' : 'none';
  });
  bewaarZoekStand();
  if (typeof werkTerugKnopBij === 'function') werkTerugKnopBij();
}


function openZoekScherm(scherm, opties) {
  opties = opties || {};
  zetZoekScherm(scherm);
  zoekSchermDirect = !!opties.direct;
  if (!opties.stil) window.scrollTo({ top: 0, behavior: 'instant' });
  if (scherm === 'muzikanten') { initSearchFilters(); if (!opties.geenZoek) runSearch(); }
  if (scherm === 'mixmatch') {
    initSetlistSearchFilters();
    setlistZoekVerversen();
  }
}








function openZoekMuzikanten(mode) {
  showView('search', mode);

  openZoekScherm('muzikanten', { geenZoek: true });
}


function zoekSchermTerug() {
  const direct = zoekSchermDirect && navStack.length;
  zetZoekScherm('start');
  if (direct) { popNavStap(); return; }
  window.scrollTo({ top: 0, behavior: 'instant' });
}




function bewaarZoekStand() {
  try { sessionStorage.setItem('tt-zoekstand', JSON.stringify({ scherm: zoekScherm, soort: zoekSoort })); } catch (e) { }
}
function herstelZoekStand() {
  let stand = null;
  try { stand = JSON.parse(sessionStorage.getItem('tt-zoekstand') || 'null'); } catch (e) { return; }
  if (!stand) return;
  if (ZOEK_SOORTEN.includes(stand.soort)) zetZoekSoortKnoppen(stand.soort);
  if (ZOEK_SCHERMEN.includes(stand.scherm)) zetZoekScherm(stand.scherm);
}

function zetZoekSoortKnoppen(soort) {
  zoekSoort = soort;
  const ids = { alles: 'zoekSoortAllesBtn', muzikanten: 'zoekSoortMuzikantenBtn', bands: 'zoekSoortBandsBtn' };
  Object.keys(ids).forEach(k => {
    const b = document.getElementById(ids[k]);
    if (!b) return;
    b.classList.toggle('active', k === soort);
    b.setAttribute('aria-selected', k === soort ? 'true' : 'false');
  });
}

function setZoekSoort(soort) {
  if (!ZOEK_SOORTEN.includes(soort)) return;
  zetZoekSoortKnoppen(soort);
  bewaarZoekStand();
  runSearch();
}









let zoekFiltersOpen = false;
function aantalZoekFilters() {
  const waarde = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  return [!!waarde('filterName').trim(),
          filterInstruments.length > 0,
          !!(waarde('filterNiveauMin') || waarde('filterNiveauMax')),
          !!(waarde('filterAgeMin') || waarde('filterAgeMax')),
          filterGenres.length > 0].filter(Boolean).length;
}
function zetFiltersTeller() {
  const el = document.getElementById('zoekFiltersTekst');
  if (!el) return;
  const n = aantalZoekFilters();
  el.textContent = n ? `Filters (${n})` : 'Filters';
}
function zetZoekFilters(open) {
  zoekFiltersOpen = !!open;
  const vak = document.getElementById('zoekFilterVak');
  const knop = document.getElementById('zoekFiltersKnop');
  if (vak) vak.hidden = !zoekFiltersOpen;
  if (knop) {
    knop.setAttribute('aria-expanded', zoekFiltersOpen ? 'true' : 'false');
    knop.classList.toggle('open', zoekFiltersOpen);
  }
}
function toggleZoekFilters() { zetZoekFilters(!zoekFiltersOpen); }



function openZoekNiveauInfo() {
  if (zoekSoort === 'bands') openBandNiveauInfoModal();
  else openMusicianNiveauInfoModal();
}





let musicianAutoSearchTimeout = null;
let setlistAutoSearchTimeout = null;








let musicianSearchSeq = 0;
let setlistSearchSeq = 0;

function scheduleMusicianAutoSearch() {
  clearTimeout(musicianAutoSearchTimeout);
  musicianAutoSearchTimeout = setTimeout(() => runSearch(), 400);
}
function scheduleSetlistAutoSearch() {
  clearTimeout(setlistAutoSearchTimeout);



  setlistAutoSearchTimeout = setTimeout(() => { if (setlistWantedSongs.length) runSetlistSearch(); }, 400);
}












function musicianFilterScore(m) {
  let score = 0;
  if (filterInstruments.length) {
    const mine = (m.musician_instruments || []).map(x => x.instrument);
    score += 3 * filterInstruments.filter(i => mine.includes(i)).length;
  }
  if (filterGenres.length) {
    const mine = (m.musician_genres || []).map(x => x.genre);
    score += 2 * filterGenres.filter(g => mine.includes(g)).length;
  }
  return score;
}
function bandFilterScore(b) {
  let score = 0;
  if (filterInstruments.length) {
    const gezocht = (b.band_wanted || []).map(w => w.instrument);
    score += 3 * filterInstruments.filter(i => gezocht.includes(i)).length;
  }
  if (filterGenres.length) {
    score += 2 * filterGenres.filter(g => (b.genres || []).includes(g)).length;
  }
  return score;
}













function actiefStandVraag(soort, ids) {
  return vraagNu(db.rpc(soort === 'band' ? 'tt_band_actief_stand' : 'tt_actief_stand', { ids }));
}
async function zetActiefStand(soort, lijst, vraag) {
  lijst.forEach(x => { x.actiefGroep = 0; x.actiefRang = 0; });
  if (!lijst.length) return;
  try {
    const { data, error } = await (vraag || actiefStandVraag(soort, lijst.map(x => x.id)));
    if (error) throw error;
    const perId = {};
    (data || []).forEach(r => { perId[r.id] = r; });
    lijst.forEach(x => {
      const r = perId[x.id];
      x.actiefGroep = r ? r.groep : 2;
      x.actiefRang  = r ? r.rang  : Number.MAX_SAFE_INTEGER;
    });
  } catch (e) {
    logCaught('zetActiefStand', e);
  }
}

function vergelijkActiefGroep(a, b) {
  return (a.actiefGroep || 0) - (b.actiefGroep || 0);
}



function zoekNaamVan(x) {
  return (x.soort === 'band' ? (x.name || '') : displayNameOf(x)).toLowerCase();
}

function bandZoekt(b) {
  return (b.band_wanted || []).length > 0;
}













const ZOEK_RING_KM = 5;
function zoekRing(x) {
  return x.distance_km != null ? Math.floor(x.distance_km / ZOEK_RING_KM) : 0;
}
function zoekCompleteBand(x) {
  return x.soort === 'band' && !bandZoekt(x) ? 1 : 0;
}
function sortZoekLijst(list) {
  list.sort((a, b) => {
    if (searchSortMode === 'score') {
      const ring = zoekRing(a) - zoekRing(b);
      if (ring) return ring;
      const compleet = zoekCompleteBand(a) - zoekCompleteBand(b);
      if (compleet) return compleet;
      const groep = vergelijkActiefGroep(a, b);
      if (groep) return groep;
      if (a.distance_km != null && b.distance_km != null) {
        const km = Math.round(a.distance_km) - Math.round(b.distance_km);
        if (km) return km;
      }
      if (a.matchScore !== b.matchScore) return (b.matchScore || 0) - (a.matchScore || 0);
      return zoekNaamVan(a).localeCompare(zoekNaamVan(b), 'nl');
    }
    const groep = vergelijkActiefGroep(a, b);
    if (groep) return groep;
    if (searchSortMode === 'distance' && a.distance_km != null && b.distance_km != null && a.distance_km !== b.distance_km) {
      return a.distance_km - b.distance_km;
    }
    if (searchSortMode === 'actief' && a.actiefRang !== b.actiefRang) return a.actiefRang - b.actiefRang;
    return zoekNaamVan(a).localeCompare(zoekNaamVan(b), 'nl');
  });
  return list;
}



function setSearchSortMode(mode) {



  if (mode === 'distance' && lastZoekResultaten.length && !lastZoekResultaten.some(x => x.distance_km != null)) {
    showToast('Vul een plaats in om op afstand te sorteren.');
    document.getElementById('filterSortMode').value = searchSortMode;
    refreshChoiceField('sorteren');
    return;
  }
  searchSortMode = mode;
  const sel = document.getElementById('filterSortMode');
  if (sel) sel.value = mode;
  refreshChoiceField('sorteren');
  if (lastZoekResultaten.length) {
    sortZoekLijst(lastZoekResultaten);
    renderCappedZoekResultaten(true);
  }
}



function pickerVeldTekst(lijst) {
  return lijst.length ? lijst.join(', ') : LEEG_VELD;
}

function initSearchFilters() {
  if (PICKERS.filterInstruments) return;





  initPicker({
    id: 'filterInstruments',
    fieldId: 'filterInstrumentsField', menuId: 'filterInstrumentsMenu',
    options: INSTRUMENTS, getList: () => filterInstruments,
    singleMax: true, exceptionValues: ['Zang', 'Achtergrondzang', 'Songwriting'],
    inVeld: pickerVeldTekst,
    onChange: runSearch
  });

  initPicker({
    id: 'filterGenres',
    fieldId: 'filterGenresField', menuId: 'filterGenresMenu',
    options: GENRES, getList: () => filterGenres,
    inVeld: pickerVeldTekst,
    onChange: runSearch
  });




  initWheelField({
    id: 'radius',
    fieldId: 'filterRadiusField', menuId: 'filterRadiusMenu',
    inputs: ['filterRadius'],
    rijen: STRAAL_RIJEN,
    value: [STRAAL_STANDAARD],
    clearTo: [STRAAL_STANDAARD],


    isActief: (v) => Number(v[0]) !== STRAAL_STANDAARD,
    format: (v) => `${v[0]} km`,
    onChange: runSearch
  });

  initWheelField({
    id: 'leeftijd',
    fieldId: 'filterAgeField', menuId: 'filterAgeMenu',
    inputs: ['filterAgeMin', 'filterAgeMax'],
    rijen: LEEFTIJD_RIJEN,
    bereik: true,
    value: ['', ''],
    format: (v) => leeftijdKort(v[0], v[1]),
    onChange: runSearch
  });



  initWheelField({
    id: 'niveau',
    fieldId: 'filterNiveauField', menuId: 'filterNiveauMenu',
    inputs: ['filterNiveauMin', 'filterNiveauMax'],
    rijen: NIVEAU_RIJEN,
    bereik: true,
    value: ['', ''],
    format: (v) => niveauKort(v[0], v[1]),
    onChange: runSearch
  });


  initChoiceField({ id: 'sorteren', fieldId: 'filterSortModeField',
                    menuId: 'filterSortModeMenu', selectId: 'filterSortMode' });
  initChoiceField({ id: 'weergave', fieldId: 'musicianViewToggleField',
                    menuId: 'musicianViewToggleMenu', selectId: 'musicianViewToggle' });
  syncViewToggles();
}




function leeftijdKort(min, max) {
  if (min === '' && max === '') return LEEG_VELD;
  if (min !== '' && max === '') return `${min}+ jaar`;
  if (min === '' && max !== '') return `t/m ${max} jaar`;
  if (min === max) return `${min} jaar`;
  return `${min} - ${max} jaar`;
}

function niveauKort(min, max) {
  if (min === '' && max === '') return LEEG_VELD;
  if (min !== '' && max === '') return `${min}+`;
  if (String(min) === String(max)) return String(min);
  return `${min} - ${max}`;
}



function parseRadiusInput(id) {
  const raw = document.getElementById(id).value;
  if (raw === '' || raw == null) return 25;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 25;
}

















const STRAAL_LADDER = [10, 25, 50, 100, 250, 500];
const STRAAL_LANDELIJK = 500;


function volgendeStraal(huidig) {
  if (huidig == null) return undefined;
  for (const r of STRAAL_LADDER) {
    if (r > huidig) return r;
  }
  return undefined;
}



function verruimStap(vorige, radius) {
  const naar = volgendeStraal(radius);
  return naar === undefined ? null : { van: vorige ? vorige.van : radius, naar };
}
function verruimLeeg(vorige, radius) {
  return { van: vorige ? vorige.van : null, naar: radius, leeg: true };
}






function sprongTrede(van, rijen) {
  const afstanden = rijen.map(r => r.distance_km).filter(d => d != null);
  const dichtst = afstanden.length ? Math.min(...afstanden) : Infinity;
  const ondergrens = volgendeStraal(van) ?? STRAAL_LANDELIJK;
  return STRAAL_LADDER.find(r => r >= ondergrens && r >= dichtst) ?? STRAAL_LANDELIJK;
}
function binnenTrede(rijen, trede) {
  return rijen.filter(r => r.distance_km == null || r.distance_km <= trede);
}

function straalTekst(km) {
  return km == null ? 'je zoekgebied' : `${km} km`;
}






function verruimdNotice(verruimd, meervoud) {
  if (!verruimd || verruimd.leeg) return '';
  const staart = verruimd.naar >= STRAAL_LANDELIJK
    ? `Dit zijn de dichtstbijzijnde ${meervoud} in heel Nederland.`
    : `Dit zijn de dichtstbijzijnde ${meervoud}, tot ${verruimd.naar} km.`;
  return `<p class="zoek-uitleg">Binnen ${straalTekst(verruimd.van)} vonden we nog geen match. ${staart}</p>`;
}


function zoekMeervoud() {
  return zoekSoort === 'bands' ? 'bands' : zoekSoort === 'muzikanten' ? 'muzikanten' : 'muzikanten en bands';
}





function resetMusicianSearch() {
  document.getElementById('filterName').value = '';


  setWheelFieldValues('leeftijd', ['', ''], false);
  setWheelFieldValues('niveau',   ['', ''], false);
  filterInstruments.length = 0;
  filterGenres.length = 0;
  renderPickerBadges(PICKERS.filterInstruments);
  renderPickerBadges(PICKERS.filterGenres);
  selectSortModeByValue('filterSortMode', 'score');
  refreshChoiceField('sorteren');
  runSearch();
}

















function zoekMuzikantVoorRol(instrument, plaats, bandNaam, invaller, bandId) {
  sluitAlleMenus();


  showView('search', 'behoud');
  initSearchFilters();
  document.getElementById('filterName').value = '';
  document.getElementById('filterCity').value = plaats || '';
  setWheelFieldValues('leeftijd', ['', ''], false);
  setWheelFieldValues('niveau',   ['', ''], false);
  setWheelFieldValues('radius',   [STRAAL_STANDAARD], false);
  filterInstruments.length = 0;
  if (instrument) filterInstruments.push(instrument);
  filterGenres.length = 0;
  renderPickerBadges(PICKERS.filterInstruments);
  renderPickerBadges(PICKERS.filterGenres);
  if (plaats) scheduleSearchCityStatus('filterCity', 'filterCityStatus');


  if (!onthoudToegepast && hasOwnProfile) {
    onthoudToegepast = true;
    laadBewaardeZoek().then(z => zetOnthoudVink(!!z)).catch(e => logCaught('zoekMuzikantVoorRol', e));
  }
  zetZoekSoortKnoppen('muzikanten');
  zetZoekFilters(!!instrument);

  openZoekScherm('muzikanten', { direct: true, geenZoek: true });
  zoekRolBand = (!invaller && bandId) ? { id: bandId, naam: bandNaam || '', rol: instrument || '' } : null;
  const melding = document.getElementById('zoekRolMelding');
  const rond = plaats ? `Muzikanten rond ${escHtml(plaats)}.` : 'Muzikanten bij jou in de buurt.';
  const band = escHtml(bandNaam || 'je band');
  melding.innerHTML = invaller
    ? `<p class="melding-tekst"><strong>Invaller ${escHtml(instrument)} voor ${band}.</strong> ${rond} Vraag ze in een bericht.</p>`
    : `<p class="melding-tekst"><strong>${instrument ? escHtml(instrument) : 'Lid'} voor ${band}.</strong> ${rond} Open een profiel om uit te nodigen.</p>`;
  melding.hidden = false;
}







function isEigenProfiel(id) {
  return !!myMusicianId && id === myMusicianId;
}





async function zoekMuzikantenOphalen(radius, origin) {
  const matchInfo = {};
  let musicians = [], actief = null;
  if (hasOwnProfile) {
    const { data: matches, error: rpcErr } = await db.rpc('tt_search_musicians', {
      searcher_id: origin.mid, radius_km: radius,
      origin_lat: origin.lat, origin_lng: origin.lng
    });
    if (rpcErr) throw rpcErr;
    if (!matches.length) return { lijst: [], matchInfo };
    matches.forEach(m => { matchInfo[m.musician_id] = m; });
    const ids = matches.map(m => m.musician_id);

    actief = actiefStandVraag('muzikant', ids);


    const [{ data, error }, { data: ages, error: ageErr }] = await Promise.all([


      inDelen(ids, deel => db.from('musicians').select(`
      id, weergavenaam, username, city,
      avatar_url,
      musician_instruments(instrument, niveau),
      musician_genres(genre)
    `).in('id', deel)),
      db.rpc('tt_musicians_ages', { ids })]);
    if (error) throw error;
    musicians = data || [];
    if (!ageErr && ages) {
      berichtRechtLeeftijden(ids, ages);
      const ageById = {};
      ages.forEach(a => { ageById[a.id] = a.age; });
      musicians.forEach(m => { m.age = ageById[m.id]; });
    }


  } else {
    const { data: matches, error: rpcErr } = await db.rpc('tt_search_musicians_anon', {
      origin_lat: origin.lat, origin_lng: origin.lng,
      radius_km: origin.lat != null ? radius : null,
    });
    if (rpcErr) throw rpcErr;
    if (!matches.length) return { lijst: [], matchInfo };
    matches.forEach(m => { matchInfo[m.musician_id] = m; });
    const ids = matches.map(m => m.musician_id);
    actief = actiefStandVraag('muzikant', ids);
    const namenVraag = vraagNu(db.rpc('tt_weergavenamen', { ids }));


    const { data, error } = await db.rpc('tt_get_musicians_lijst', { ids });
    if (error) throw error;



    musicians = (data || []).map(m => ({
      id: m.id, username: m.username, age: m.age, city: m.city,
      avatar_url: m.avatar_url,
      musician_instruments: (m.instrument_levels || []).map(x => ({ instrument: x.instrument, niveau: x.niveau })),
      musician_genres: (m.genres || []).map(g => ({ genre: g })),
    }));
    await weergavenamenToevoegen(musicians, namenVraag);
  }
  musicians.forEach(m => { m.soort = 'muzikant'; });
  return { lijst: musicians, matchInfo, actief };
}



async function zoekBandsOphalen(radius, origin) {
  const matchInfo = {};
  let bands = [], actief = null;
  if (hasOwnProfile) {
    const { data: matches, error: rpcErr } = await db.rpc('tt_search_bands_for_musician', {
      searcher_id: origin.mid, radius_km: radius,
      origin_lat: origin.lat, origin_lng: origin.lng
    });
    if (rpcErr) throw rpcErr;
    if (!matches.length) return { lijst: [], matchInfo };
    matches.forEach(m => { matchInfo[m.band_id] = m; });
    const ids = matches.map(m => m.band_id);
    actief = actiefStandVraag('band', ids);


    const { data, error } = await inDelen(ids, deel => db.from('bands').select(`id, name, city, genres, status, niveau, avatar_url, band_members(status), band_wanted(instrument)`).in('id', deel));
    if (error) throw error;
    bands = data || [];
  } else {
    const { data: matches, error: rpcErr } = await db.rpc('tt_search_bands_anon', {
      origin_lat: origin.lat, origin_lng: origin.lng,
      radius_km: origin.lat != null ? radius : null,
    });
    if (rpcErr) throw rpcErr;
    if (!matches.length) return { lijst: [], matchInfo };
    matches.forEach(m => { matchInfo[m.band_id] = m; });
    const ids = matches.map(m => m.band_id);
    actief = actiefStandVraag('band', ids);
    const { data, error } = await db.rpc('tt_get_bands_public', { ids });
    if (error) throw error;


    bands = (data || []).map(b => ({
      id: b.id, name: b.name, city: b.city, genres: b.genres || [], status: b.status,
      niveau: b.niveau,
      avatar_url: b.avatar_url || null,
      band_members: (b.members || []).map(() => ({ status: 'bevestigd' })),
      band_wanted: (b.wanted || []).map(i => ({ instrument: i })),
    }));
  }
  bands.forEach(b => { b.soort = 'band'; });
  return { lijst: bands, matchInfo, actief };
}





async function runSearch(straalOverride, sprongVan) {
  const seq = ++musicianSearchSeq;
  const resultsEl = document.getElementById('searchResults');

  if (!onthoudToegepast && hasOwnProfile) await onthoudHerstellen();
  if (seq !== musicianSearchSeq) return;
  zetFiltersTeller();
  if (straalOverride === undefined) zoekVerruimd = null;



  if (!resultsEl.innerHTML.trim()) ladenTonen(resultsEl);

  try {


    const nameTerm = naamZoekTerm(document.getElementById('filterName').value);
    const cityQuery = document.getElementById('filterCity').value.trim().toLowerCase();
    const radius = straalOverride !== undefined ? straalOverride : parseRadiusInput('filterRadius');
    const ageMinVal = document.getElementById('filterAgeMin').value;
    const ageMaxVal = document.getElementById('filterAgeMax').value;
    const leeftijdGekozen = !!(ageMinVal || ageMaxVal);


    const metMuzikanten = zoekSoort !== 'bands';
    const metBands = zoekSoort !== 'muzikanten' && !leeftijdGekozen;


    if (!metMuzikanten && !metBands) {
      lastZoekResultaten = [];
      zoekVerruimd = null;
      renderZoekResultaten([], { leeftijdBijBands: true });
      return;
    }




    const ruimerZoeken = (straalActief) => {


      if (nameTerm || !straalActief) return undefined;
      const stap = verruimStap(zoekVerruimd, radius);
      if (!stap) return undefined;
      zoekVerruimd = stap;
      return stap.naar;
    };
    const geenResultaat = () => {
      lastZoekResultaten = [];

      zoekVerruimd = (straalOverride !== undefined && volgendeStraal(radius) === undefined)
        ? verruimLeeg(zoekVerruimd, radius) : null;
      renderZoekResultaten([], { verruimd: zoekVerruimd, naamGezocht: !!nameTerm, straal: radius });
    };





    let origin, originResolved, vertrek;
    if (hasOwnProfile) {
      const mid = await getMyMusicianId();
      const typedCity = document.getElementById('filterCity').value.trim();
      const o = await zoekVertrekpunt(typedCity);
      vertrek = o;
      const usesOwnCity = o.eigen;
      const myCity = o.plaats;
      origin = { mid, lat: o.lat, lng: o.lng };




      originResolved = usesOwnCity || o.lat != null;


      laatsteZoekVertrek = originResolved ? {
        plaats: usesOwnCity ? null : typedCity,
        plaatsTekst: usesOwnCity ? (myCity || 'je woonplaats') : typedCity,
        lat: usesOwnCity ? null : o.lat,
        lng: usesOwnCity ? null : o.lng,
        straal: parseRadiusInput('filterRadius'),
      } : null;
    } else {
      const o = await resolveSearchOrigin(document.getElementById('filterCity').value);
      vertrek = o;
      origin = { mid: null, lat: o.lat, lng: o.lng };
      originResolved = o.lat != null;
    }



    const getyptePlaats = document.getElementById('filterCity').value;
    if (plaatsIsOnbekend(getyptePlaats, vertrek)) {
      if (seq !== musicianSearchSeq) return;
      lastZoekResultaten = [];
      zoekVerruimd = null;
      resultsEl.innerHTML = '';
      await plaatsOnbekendTonen('filterCity', 'filterCityStatus', getyptePlaats, () => runSearch());
      return;
    }
    clearFieldError('filterCity');

    const leeg = { lijst: [], matchInfo: {} };
    const [muz, bnd] = await Promise.all([
      metMuzikanten ? zoekMuzikantenOphalen(radius, origin) : leeg,
      metBands ? zoekBandsOphalen(radius, origin) : leeg
    ]);
    if (seq !== musicianSearchSeq) return;


    const ageMin = parseInt(ageMinVal) || 0;
    const ageMax = parseInt(ageMaxVal) || 150;

    const niveauMinVal = document.getElementById('filterNiveauMin').value;
    const niveauMaxVal = document.getElementById('filterNiveauMax').value;
    const niveauMin = niveauMinVal ? parseInt(niveauMinVal) : 1;
    const niveauMax = niveauMaxVal ? parseInt(niveauMaxVal) : 5;
    const niveauFilterActive = !!(niveauMinVal || niveauMaxVal);



    const cityIsPostcode = /^[1-9][0-9]{3}$/.test(cityQuery.replace(/\s/g,''));
    const skipCityTextFilter = originResolved || cityIsPostcode;
    const plaatsPast = (stad) => !cityQuery || skipCityTextFilter || (stad || '').toLowerCase().includes(cityQuery);

    const muzikanten = muz.lijst.filter(m => {


      if (isGeblokkeerd(m.id)) return false;
      if (isEigenProfiel(m.id)) return false;
      const age = ageOf(m);
      if (age < ageMin || age > ageMax) return false;


      if (!naamMatcht(nameTerm, displayNameOf(m))) return false;
      if (!plaatsPast(m.city)) return false;
      if (filterInstruments.length) {
        const mInstr = m.musician_instruments.map(x => x.instrument);
        if (!filterInstruments.some(i => mInstr.includes(i))) return false;
      }



      if (niveauFilterActive) {
        const relevantInstr = filterInstruments.length
          ? m.musician_instruments.filter(x => filterInstruments.includes(x.instrument))
          : m.musician_instruments;
        const levels = relevantInstr.map(x => x.niveau).filter(n => n != null);
        if (levels.length && !levels.some(n => n >= niveauMin && n <= niveauMax)) return false;
      }
      if (filterGenres.length) {
        const mGenres = m.musician_genres.map(x => x.genre);
        if (!filterGenres.some(g => mGenres.includes(g))) return false;
      }
      return true;
    });

    const bands = bnd.lijst.filter(b => {
      if (!naamMatcht(nameTerm, b.name)) return false;
      if (!plaatsPast(b.city)) return false;
      if (filterGenres.length && !filterGenres.some(g => (b.genres || []).includes(g))) return false;

      if (filterInstruments.length) {
        const gezocht = (b.band_wanted || []).map(w => w.instrument);
        if (!filterInstruments.some(i => gezocht.includes(i))) return false;
      }

      if (niveauFilterActive && b.niveau != null && (b.niveau < niveauMin || b.niveau > niveauMax)) return false;
      return true;
    });


    muzikanten.forEach(m => {
      const info = muz.matchInfo[m.id];
      m.distance_km = info ? info.distance_km : null;
      m.matchScore  = musicianFilterScore(m);
      musicianDistanceCache[m.id] = m.distance_km;
    });
    bands.forEach(b => {
      const info = bnd.matchInfo[b.id];
      b.distance_km = info ? info.distance_km : null;
      b.matchScore  = bandFilterScore(b);
    });




    if (!muzikanten.length && !bands.length) {
      const v = ruimerZoeken(originResolved);
      if (v !== undefined) return runSearch(STRAAL_LANDELIJK, radius);
      geenResultaat(); return;
    }
    let zoekMuz = muzikanten, zoekBnd = bands;
    if (sprongVan !== undefined) {
      const trede = sprongTrede(sprongVan, muzikanten.concat(bands));
      zoekMuz = binnenTrede(muzikanten, trede);
      zoekBnd = binnenTrede(bands, trede);
      zoekVerruimd = { van: zoekVerruimd ? zoekVerruimd.van : sprongVan, naar: trede };
    }
    await Promise.all([zetActiefStand('muzikant', zoekMuz, muz.actief), zetActiefStand('band', zoekBnd, bnd.actief)]);
    if (seq !== musicianSearchSeq) return;
    lastZoekResultaten = sortZoekLijst(zoekMuz.concat(zoekBnd));
    renderCappedZoekResultaten(true);

  } catch(e) {
    logCaught('runSearch', e);
    if (seq !== musicianSearchSeq) return;
    resultsEl.innerHTML = foutStaatHTML(e, 'zoeken', 'runSearch()');
  }
}






const ZOEK_PAGINA = 50;
const ZOEK_VOORUIT = 20;
let zoekGetoond = ZOEK_PAGINA, setlistGetoond = ZOEK_PAGINA, gedeeldGetoond = ZOEK_PAGINA;


function zoekItemHTML(x, kaarten) {
  if (x.soort === 'band') return kaarten ? bandCardHTML(x) : bandRowHTML(x);
  return kaarten ? musicianCardHTML(x) : musicianRowHTML(x);
}




function lijstVerderControleren() {
  const lijsten = [
    { el: 'searchResults', data: lastZoekResultaten, n: zoekGetoond, zet: v => { zoekGetoond = v; },
      html: (x) => zoekItemHTML(x, musicianViewMode === 'grid') },
    { el: 'setlistSearchResults', data: lastSetlistResults, n: setlistGetoond, zet: v => { setlistGetoond = v; },
      html: (x) => musicianSetlistRowHTML(x) },
    { el: 'gedeeldResults', data: gedeeldResultaat, n: gedeeldGetoond, zet: v => { gedeeldGetoond = v; },
      html: (x, i) => gedeeldRijHTML(x, i) },
  ];
  lijsten.forEach(l => {
    if (!l.data || l.data.length <= l.n) return;
    const el = document.getElementById(l.el);
    const lijst = el && el.querySelector('.results-list, .zoek-kaarten');
    if (!lijst || !lijst.offsetParent) return;
    const rijen = lijst.children;
    if (rijen.length !== l.n) return;
    const rij = rijen[Math.max(0, l.n - ZOEK_VOORUIT - 1)];
    if (rij.getBoundingClientRect().top >= window.innerHeight) return;
    const tot = Math.min(l.data.length, l.n + ZOEK_PAGINA);
    lijst.insertAdjacentHTML('beforeend', l.data.slice(l.n, tot).map((x, j) => l.html(x, l.n + j)).join(''));
    l.zet(tot);
  });
}
window.addEventListener('scroll', lijstVerderControleren, { passive: true });


function zoekTelling(lijst, total) {
  const muz = lijst.filter(x => x.soort === 'muzikant').length;
  const bnd = lijst.length - muz;
  if (total > lijst.length) return `${total} gevonden`;
  const m = muz ? `${muz} muzikant${muz !== 1 ? 'en' : ''}` : '';
  const b = bnd ? `${bnd} band${bnd !== 1 ? 's' : ''}` : '';
  return `${[m, b].filter(Boolean).join(' en ')} gevonden`;
}

function renderZoekResultaten(lijst, opts) {
  opts = opts || {};
  const el = document.getElementById('searchResults');
  const total = opts.total != null ? opts.total : lijst.length;

  if (!total) {




    const wat = zoekMeervoud();
    let kop, uitleg;
    if (opts.leeftijdBijBands) {


      kop = 'Geen bands bij deze leeftijd';
      uitleg = 'Een band heeft geen leeftijd. Haal de leeftijd weg om bands te zien.';
    } else if (opts.naamGezocht) {
      const wie = { muzikanten: ['Deze muzikant staat er niet', 'Niemand'],
                    bands: ['Deze band staat er niet', 'Geen band'],
                    alles: ['Deze naam staat er niet', 'Geen muzikant of band'] }[zoekSoort];
      kop = wie[0];
      uitleg = `${wie[1]} met deze naam binnen ${straalTekst(opts.straal)}. Controleer de spelling, of vergroot je zoekstraal.`;
    } else {
      kop = `Geen ${wat} gevonden`;
      uitleg = opts.verruimd && opts.verruimd.leeg
        ? `Ook in heel Nederland voldoet niemand aan deze filters. Haal een filter weg.`
        : 'Pas je filters of zoekstraal aan, en controleer of je eigen postcode in je profiel klopt.';
    }
    el.innerHTML = `
      <div class="no-results">
        <p class="no-results-kop">${kop}</p>
        <p class="no-results-tekst">${uitleg}</p>
      </div>`;
    onthoudBijwerken();
    return;
  }

  const verruimd = verruimdNotice(opts.verruimd, zoekMeervoud());
  const locationHint = opts.showLocationHint
    ? `<p class="zoek-uitleg">Dit zijn ${total} willekeurige ${zoekMeervoud()} uit heel Nederland — vul een plaats in voor resultaten bij jou in de buurt.</p>`
    : '';
  const kaarten = musicianViewMode === 'grid';
  el.innerHTML = `
    <div class="results-header">
      <span class="results-count">${zoekTelling(opts.alle || lijst, total)}</span>
    </div>
    ${verruimd}${locationHint}
    <div class="${kaarten ? 'zoek-kaarten' : 'results-list'}">
      ${lijst.map(x => zoekItemHTML(x, kaarten)).join('')}
    </div>`;
  onthoudBijwerken();
  setTimeout(lijstVerderControleren, 0);
}





function renderCappedZoekResultaten(vanBoven) {
  if (vanBoven) zoekGetoond = ZOEK_PAGINA;
  const total = lastZoekResultaten.length;
  const shown = lastZoekResultaten.slice(0, zoekGetoond);
  const cityFilled = !!document.getElementById('filterCity').value.trim();
  const showLocationHint = !hasOwnProfile && !cityFilled && total > 0;
  renderZoekResultaten(shown, { total, alle: lastZoekResultaten, showLocationHint, verruimd: zoekVerruimd });
}






const MESSAGE_ICON_SVG = `<svg class="result-row-msg-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><title>Bericht sturen mogelijk</title><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"></path></svg>`;






const ZONDER_FOTO_HTML = '<span class="schijnwerper" aria-hidden="true"></span>';








function displayNameOf(m) {
  if (!m) return 'Muzikant';
  if (m.weergavenaam !== undefined) return m.weergavenaam || 'Muzikant';
  return m.username || 'Muzikant';
}






function roleLabel(role) {
  return role === 'Oprichter' ? 'Beheerder' : (role || 'Lid');
}



function eersteGekozen(lijst) {
  const gekozen = lijst.find(v => filterInstruments.includes(v) || filterGenres.includes(v));
  return gekozen || lijst[0] || '';
}





function afstandTekst(km) {
  if (km == null || km === '' || isNaN(Number(km))) return '';
  return `${Math.max(1, Math.round(Number(km)))} km`;
}







function zoekRijHTML(opts) {
  const meta = [opts.eerste, opts.plaats, opts.afstand].filter(Boolean).map(escHtml).join(' · ');
  return `
    <div class="result-row" onclick="${opts.klik}">
      <div class="result-row-top">
        <div class="result-row-avatar${opts.vierkant ? ' result-vierkant' : ''}">${opts.foto}</div>
        <div class="result-row-main">
          <div class="result-row-name"><span class="result-row-naam">${escHtml(opts.naam)}</span>${opts.vierkant ? '<span class="result-row-soort">BAND</span>' : ''}</div>
          <div class="result-row-meta">${meta}</div>
        </div>
        ${opts.rechts || ''}
      </div>
    </div>`;
}

function musicianRowHTML(m) {


  const displayName = displayNameOf(m);
  return zoekRijHTML({
    klik: `openProfielScherm('${jsAttr(m.id)}')`,
    foto: fotoHTML(m.avatar_url, displayName) || ZONDER_FOTO_HTML,
    naam: displayName,
    eerste: eersteGekozen((m.musician_instruments || []).map(x => x.instrument)),
    plaats: m.city || '',
    afstand: afstandTekst(m.distance_km),
    rechts: `<div class="result-row-msg-btn" data-bericht-id="${escHtml(m.id)}" onclick="openRowMessageIcon(event,'${jsAttr(m.id)}','${jsAttr(displayName)}')">${MESSAGE_ICON_SVG}</div>`
  });
}









function zoekKaartHTML(o) {
  const plaats = [o.plaats, o.afstand].filter(Boolean).map(escHtml).join(' · ');
  const eerste = (o.band ? '<span class="result-row-soort">BAND</span>' + (o.eerste ? ' · ' : '') : '') + escHtml(o.eerste || '');
  return `
    <div class="zoek-kaart" onclick="${o.klik}">
      <div class="zoek-kaart-foto">${o.foto || ZONDER_FOTO_HTML}${o.hoek ? `<div class="zoek-kaart-hoek">${o.hoek}</div>` : ''}</div>
      <div class="zoek-kaart-tekst">
        <div class="zoek-kaart-naam">${escHtml(o.naam)}</div>
        <div class="zoek-kaart-regel">${eerste}</div>
        <div class="zoek-kaart-regel">${plaats}</div>
      </div>
    </div>`;
}

function musicianCardHTML(m) {
  const displayName = displayNameOf(m);
  return zoekKaartHTML({
    klik: `openProfielScherm('${jsAttr(m.id)}')`,
    foto: fotoHTML(m.avatar_url, displayName),
    naam: displayName,
    eerste: eersteGekozen((m.musician_instruments || []).map(x => x.instrument)),
    plaats: m.city || '',
    afstand: afstandTekst(m.distance_km),
    hoek: `<div class="result-row-msg-btn" data-bericht-id="${escHtml(m.id)}" onclick="openRowMessageIcon(event,'${jsAttr(m.id)}','${jsAttr(displayName)}')">${MESSAGE_ICON_SVG}</div>`
  });
}




function instrumentInZin(naam) {
  const w = String(naam || '');
  return /^[A-Z]{2,}\b/.test(w) ? w : w.charAt(0).toLowerCase() + w.slice(1);
}






function bandRowHTML(b) {
  const gezocht = (b.band_wanted || []).map(w => w.instrument);
  const zoekt = gezocht.length ? eersteGekozen(gezocht) : '';
  return zoekRijHTML({
    klik: `openBandScherm('${jsAttr(b.id)}')`,
    foto: fotoHTML(b.avatar_url, b.name) || ZONDER_FOTO_HTML,
    vierkant: true,
    naam: b.name || '',
    eerste: eersteGekozen(b.genres || []),
    plaats: b.city || '',
    afstand: afstandTekst(b.distance_km),
    rechts: zoekt ? `<span class="result-row-zoekt"><span>Zoekt</span><span>${escHtml(instrumentInZin(zoekt))}</span></span>` : ''
  });
}




function bandCardHTML(b) {
  const gezocht = (b.band_wanted || []).map(w => w.instrument);
  const zoekt = gezocht.length ? eersteGekozen(gezocht) : '';
  return zoekKaartHTML({
    klik: `openBandScherm('${jsAttr(b.id)}')`,
    foto: fotoHTML(b.avatar_url, b.name),
    band: true,
    naam: b.name || '',
    eerste: eersteGekozen(b.genres || []),
    plaats: b.city || '',
    afstand: afstandTekst(b.distance_km),
    hoek: zoekt ? `<span class="zoek-kaart-zoekt">Zoekt ${escHtml(instrumentInZin(zoekt))}</span>` : ''
  });
}









let setlistWantedSongs = [];
let selectedSetlistArtist = null;
let setlistItunesSearchTimeout = null;
let filterSetlistInstruments = [];




let lastSetlistResults = [];






function sortSetlistList(list) {
  list.sort((a, b) => {
    const groep = vergelijkActiefGroep(a, b);
    if (groep) return groep;
    if (a.matchCount !== b.matchCount) return b.matchCount - a.matchCount;
    if (a.distance_km != null && b.distance_km != null && a.distance_km !== b.distance_km) {
      return a.distance_km - b.distance_km;
    }
    const nameA = (displayNameOf(a) || '').toLowerCase();
    const nameB = (displayNameOf(b) || '').toLowerCase();
    return nameA.localeCompare(nameB, 'nl');
  });
  return list;
}


function renderCappedSetlistResults(vanBoven) {
  if (vanBoven) setlistGetoond = ZOEK_PAGINA;
  const total = lastSetlistResults.length;
  renderSetlistResults(lastSetlistResults.slice(0, setlistGetoond), { total, verruimd: setlistVerruimd });
}






let mmFiltersOpen = false;
function zetMmFiltersTeller() {
  const el = document.getElementById('mmFiltersTekst');
  if (el) el.textContent = filterSetlistInstruments.length ? 'Filters (1)' : 'Filters';
}
function zetMmFilters(open) {
  mmFiltersOpen = !!open;
  const vak = document.getElementById('mmFilterVak');
  const knop = document.getElementById('mmFiltersKnop');
  if (vak) vak.hidden = !mmFiltersOpen;
  if (knop) {
    knop.setAttribute('aria-expanded', mmFiltersOpen ? 'true' : 'false');
    knop.classList.toggle('open', mmFiltersOpen);
  }
}
function toggleMmFilters() { zetMmFilters(!mmFiltersOpen); }




function initSetlistSearchFilters() {
  if (!PICKERS.filterSetlistInstruments) {
    initPicker({
      id: 'filterSetlistInstruments',
      fieldId: 'filterSetlistInstrumentsField', menuId: 'filterSetlistInstrumentsMenu',
      options: INSTRUMENTS, getList: () => filterSetlistInstruments,
      singleMax: true, exceptionValues: ['Zang', 'Achtergrondzang', 'Songwriting'],
      inVeld: pickerVeldTekst,
      onChange: () => { zetMmFiltersTeller(); if (setlistWantedSongs.length) runSetlistSearch(); }
    });
  }



  if (!WHEEL_FIELDS['setlist-straal']) {
    initWheelField({
      id: 'setlist-straal',
      fieldId: 'filterSetlistRadiusField', menuId: 'filterSetlistRadiusMenu',
      inputs: ['filterSetlistRadius'],
      rijen: STRAAL_RIJEN,
      value: [STRAAL_STANDAARD],
      clearTo: [STRAAL_STANDAARD],
      isActief: (v) => Number(v[0]) !== STRAAL_STANDAARD,
      format: (v) => `${v[0]} km`,
      onChange: () => { if (setlistWantedSongs.length) runSetlistSearch(); }
    });
  }
}






function mmKruisHTML(actie, label) {
  return `<button type="button" class="song-remove" onclick="event.stopPropagation(); ${actie}" title="Verwijderen" aria-label="${escHtml(label)}">${RIJ_KRUIS}</button>`;
}
function renderSetlistSongsList() {
  const list = document.getElementById('setlistSongsList');
  list.hidden = !setlistWantedSongs.length;
  list.innerHTML = setlistWantedSongs.map((s, i) => `
    <div class="mm-nummer-rij">
      ${nummerTekstHTML(s.artist, s.title || 'Alle nummers')}
      ${mmKruisHTML(`removeSetlistSong(${i})`, `Verwijder ${s.title || s.artist}`)}
    </div>`).join('');
  mmSetlijstTekenen();
}


function setlistNummerErbij(title, artist) {
  if (setlistWantedSongs.find(s => s.title === title && s.artist === artist)) return false;


  const alleenArtiest = setlistWantedSongs.findIndex(s => !s.title && s.artist === artist);
  if (alleenArtiest !== -1) setlistWantedSongs.splice(alleenArtiest, 1);
  setlistWantedSongs.push({ title, artist });
  return true;
}

function addSetlistSong(title, artist) {
  if (!setlistNummerErbij(title, artist)) return;
  document.getElementById('setlistArtistSearch').value = '';
  document.getElementById('setlistTrackSearch').value = '';
  document.getElementById('setlistTrackSearchWrap').style.display = 'none';
  closeAC('acSetlistTrackList');
  closeAC('acSetlistArtistList');
  selectedSetlistArtist = null;
  renderSetlistSongsList();
  setTimeout(() => document.getElementById('setlistArtistSearch').focus(), 0);
  runSetlistSearch();
}

function removeSetlistSong(i) {
  setlistWantedSongs.splice(i, 1);
  renderSetlistSongsList();


  if (setlistWantedSongs.length) runSetlistSearch();
  else document.getElementById('setlistSearchResults').innerHTML = '';
}












let mmSetlijstNummers = [];
let mmSetlijstOpen = false;
let mmSetlijstFout = false;
let mmSetlijstSeq = 0;

async function mmSetlijstTonen() {
  const knop = document.getElementById('mmSetlijstKnop');
  if (!knop) return;
  const seq = ++mmSetlijstSeq;
  const mid = hasOwnProfile ? await getMyMusicianId() : null;
  if (seq !== mmSetlijstSeq) return;
  if (!mid) { knop.hidden = true; zetMmSetlijst(false); return; }
  const { data, error } = await db.from('musician_songs').select('song_title, song_artist').eq('musician_id', mid);
  if (seq !== mmSetlijstSeq) return;

  mmSetlijstFout = !!error;
  if (error) logCaught('mmSetlijstTonen', error);
  mmSetlijstNummers = (data || []).map(s => ({ artist: s.song_artist || '', title: s.song_title || '' }))
    .filter(s => s.artist && s.title)
    .sort((a, b) => compareArtistTitle(a.artist, a.title, b.artist, b.title));
  knop.hidden = !mmSetlijstFout && !mmSetlijstNummers.length;
  if (knop.hidden) zetMmSetlijst(false);
  else mmSetlijstTekenen();
}

function zetMmSetlijst(open) {
  mmSetlijstOpen = !!open;
  const knop = document.getElementById('mmSetlijstKnop');
  const lijst = document.getElementById('mmSetlijst');
  if (knop) { knop.classList.toggle('open', mmSetlijstOpen); knop.setAttribute('aria-expanded', mmSetlijstOpen ? 'true' : 'false'); }
  if (lijst) lijst.hidden = !mmSetlijstOpen;
  if (mmSetlijstOpen) mmSetlijstTekenen();
}
function toggleMmSetlijst() { zetMmSetlijst(!mmSetlijstOpen); }

function mmSetlijstGekozen(s) {
  const a = s.artist.toLowerCase(), t = s.title.toLowerCase();
  return setlistWantedSongs.findIndex(w => (w.artist || '').toLowerCase() === a && (w.title || '').toLowerCase() === t);
}

function mmSetlijstTekenen() {
  const lijst = document.getElementById('mmSetlijst');
  if (!lijst || !mmSetlijstOpen) return;
  if (mmSetlijstFout) { lijst.innerHTML = '<div class="picker-list-empty">Je setlist laden lukt nu niet. Controleer je verbinding en probeer het opnieuw.</div>'; return; }
  lijst.innerHTML = mmSetlijstNummers.map((s, i) => {
    const gekozen = mmSetlijstGekozen(s) !== -1;
    return `<div class="picker-list-item${gekozen ? ' selected' : ''}" role="option" aria-selected="${gekozen}" onclick="mmSetlijstKies(${i})">`
      + `<span class="mm-setlijst-tekst">${escHtml(s.artist)}<span class="mm-setlijst-nummer"> · ${escHtml(s.title)}</span></span>`
      + `${gekozen ? '<span class="picker-list-item-check" aria-hidden="true">✓</span>' : ''}</div>`;
  }).join('');
}

function mmSetlijstKies(i) {
  const s = mmSetlijstNummers[i];
  if (!s) return;
  const al = mmSetlijstGekozen(s);
  if (al !== -1) { removeSetlistSong(al); return; }
  if (!setlistNummerErbij(s.title, s.artist)) return;
  renderSetlistSongsList();
  runSetlistSearch();
}


async function onSetlistArtistSearch(q) {
  const ac = document.getElementById('acSetlistArtistList');
  clearTimeout(setlistItunesSearchTimeout);
  const nr = artiestVraagStart(ac);
  if (q.length < 2) { ac.classList.remove('open'); return; }

  ac.innerHTML = '<div class="ac-item"><span>Zoeken...</span></div>';
  ac.classList.add('open');

  const cacheKey = q.toLowerCase();
  if (itunesArtistCache.has(cacheKey)) {
    renderArtistResults(ac, itunesArtistCache.get(cacheKey), q, 'selectSetlistArtist');
    return;
  }

  setlistItunesSearchTimeout = setTimeout(async () => {
    try {
      const artists = await itunesArtiestenOphalen(q);
      itunesArtistCache.set(cacheKey, artists);
      if (!artiestVraagNogActueel(ac, nr)) return;
      renderArtistResults(ac, artists, q, 'selectSetlistArtist');
    } catch(e) {
      logCaught('onSetlistArtistSearch', e);
      if (artiestVraagNogActueel(ac, nr)) ac.innerHTML = AC_FOUT_HTML;
    }
  }, 400);
}

function selectSetlistArtist(id, name) {
  selectedSetlistArtist = { id, name };
  document.getElementById('setlistArtistSearch').value = name;
  closeAC('acSetlistArtistList');
  const wrap = document.getElementById('setlistTrackSearchWrap');

  wrap.style.display = '';

  document.getElementById('setlistTrackSearchLabel').textContent = `Nummer van ${name}`;
  document.getElementById('setlistTrackSearch').value = '';
  closeAC('acSetlistTrackList');


  if (!setlistWantedSongs.find(x => x.artist === name)) {
    setlistWantedSongs.push({ title: '', artist: name });
    renderSetlistSongsList();
    runSetlistSearch();
  }
}



async function onSetlistTrackSearch(q) {
  const ac = document.getElementById('acSetlistTrackList');
  if (!selectedSetlistArtist) return;
  if (q.length < 1) { ac.classList.remove('open'); return; }

  ac.innerHTML = '<div class="ac-item"><span>Zoeken...</span></div>';
  ac.classList.add('open');

  try {
    const songs = await fetchArtistSongs(selectedSetlistArtist.id);
    renderTrackResults(ac, songs, q, selectedSetlistArtist, 'addSetlistSong', setlistWantedSongs);
  } catch(e) {
    logCaught('onSetlistTrackSearch', e);
    ac.innerHTML = AC_FOUT_HTML;
  }
}

function resetSetlistSearch() {
  setlistWantedSongs = [];
  selectedSetlistArtist = null;
  document.getElementById('setlistArtistSearch').value = '';
  document.getElementById('setlistTrackSearch').value = '';
  document.getElementById('setlistTrackSearchWrap').style.display = 'none';


  filterSetlistInstruments = [];
  if (PICKERS.filterSetlistInstruments) renderPickerBadges(PICKERS.filterSetlistInstruments);
  zetMmFiltersTeller();
  lastSetlistResults = [];
  setlistVerruimd = null;
  renderSetlistSongsList();
  document.getElementById('setlistSearchResults').innerHTML = '';
}


async function runSetlistSearch(straalOverride, sprongVan, songVooraf) {
  const seq = ++setlistSearchSeq;
  const resultsEl = document.getElementById('setlistSearchResults');
  if (!setlistWantedSongs.length) { showToast('Kies minimaal één band of artiest.'); return; }
  if (straalOverride === undefined) setlistVerruimd = null;

  if (!resultsEl.innerHTML.trim()) ladenTonen(resultsEl);

  try {
    const titles  = setlistWantedSongs.map(s => s.title);
    const artists = setlistWantedSongs.map(s => s.artist);
    const radius  = straalOverride !== undefined ? straalOverride : parseRadiusInput('filterSetlistRadius');



    const ruimerZoeken = (straalActief) => {
      if (!straalActief) return undefined;
      const stap = verruimStap(setlistVerruimd, radius);
      if (!stap) return undefined;
      setlistVerruimd = stap;
      return stap.naar;
    };
    const geenResultaat = (straalActief) => {
      lastSetlistResults = [];
      setlistVerruimd = (straalActief && straalOverride !== undefined && volgendeStraal(radius) === undefined)
        ? verruimLeeg(setlistVerruimd, radius) : null;
      renderSetlistResults([], { verruimd: setlistVerruimd });
    };









    const songVraag = songVooraf ? Promise.resolve(songVooraf)
      : Promise.resolve(db.rpc('tt_search_musicians_by_songlist_anon', { titles, artists }));
    const getyptePlaats = document.getElementById('filterSetlistCity').value;
    const vertrek = await zoekVertrekpunt(getyptePlaats);
    if (seq !== setlistSearchSeq) return;
    if (plaatsIsOnbekend(getyptePlaats, vertrek)) {
      lastSetlistResults = [];
      setlistVerruimd = null;
      resultsEl.innerHTML = '';
      await plaatsOnbekendTonen('filterSetlistCity', 'filterSetlistCityStatus', getyptePlaats, () => runSetlistSearch());
      return;
    }
    clearFieldError('filterSetlistCity');

    const [songResult, radiusResult] = await Promise.all([
      songVraag,
      (async () => {










        if (!vertrek.eigen) {
          const origin = vertrek;
          if (origin.lat == null) return { data: null, error: null };
          return db.rpc('tt_search_musicians_anon', {
            origin_lat: origin.lat, origin_lng: origin.lng, radius_km: radius
          });
        }
        if (hasOwnProfile) {
          const mid = await getMyMusicianId();


          return db.rpc('tt_search_musicians', {
            searcher_id: mid, radius_km: radius,
            origin_lat: null, origin_lng: null
          });
        }
        return { data: null, error: null };
      })(),
    ]);

    if (songResult.error) throw songResult.error;
    if (seq !== setlistSearchSeq) return;
    const songMatches = songResult.data || [];
    if (!songMatches.length) { lastSetlistResults = []; renderSetlistResults([]); return; }
    const songMatchIds = new Set(songMatches.map(m => m.musician_id));




    let distanceMap = {};
    let radiusIds = null;

    if (radiusResult.error) throw radiusResult.error;
    if (radiusResult.data) {
      radiusIds = new Set(radiusResult.data.map(m => m.musician_id));
      radiusResult.data.forEach(m => { distanceMap[m.musician_id] = m.distance_km; });
    }

    let ids = Array.from(songMatchIds);
    if (radiusIds) ids = ids.filter(id => radiusIds.has(id));



    if (!ids.length) {
      const v = ruimerZoeken(!!radiusIds);
      if (v !== undefined) return runSetlistSearch(STRAAL_LANDELIJK, radius, songResult);
      geenResultaat(!!radiusIds); return;
    }

    let musicians;
    const actief = actiefStandVraag('muzikant', ids);
    if (hasOwnProfile) {

      const { data, error } = await inDelen(ids, deel => db.from('musicians').select(`
        id, weergavenaam, username, city, avatar_url,
        musician_songs(song_title, song_artist, mastery_level),
        musician_instruments(instrument, niveau)
      `).in('id', deel));
      if (error) throw error;
      musicians = data;
    } else {
      const namenVraag = vraagNu(db.rpc('tt_weergavenamen', { ids }));
      const { data, error } = await db.rpc('tt_get_musicians_public', { ids });
      if (error) throw error;
      musicians = (data || []).map(m => ({
        id: m.id, username: m.username, city: m.city,
        avatar_url: m.avatar_url,
        musician_songs: m.songs || [],
        musician_instruments: (m.instrument_levels || []).map(x => ({ instrument: x.instrument, niveau: x.niveau })),
      }));
      await weergavenamenToevoegen(musicians, namenVraag);
    }




    if (filterSetlistInstruments.length) {
      musicians = musicians.filter(m => {
        const mInstr = (m.musician_instruments || []).map(x => x.instrument);
        return filterSetlistInstruments.some(i => mInstr.includes(i));
      });
    }



    musicians.forEach(m => {
      const own = (m.musician_songs || []).map(s => `${(s.song_title||'').toLowerCase()}|||${(s.song_artist||'').toLowerCase()}`);
      const eigenArtiesten = (m.musician_songs || []).map(x => (x.song_artist || '').toLowerCase());
      m.matchedNumbers = setlistWantedSongs
        .map((s, i) => (s.title
            ? own.includes(`${s.title.toLowerCase()}|||${s.artist.toLowerCase()}`)
            : eigenArtiesten.includes(s.artist.toLowerCase())) ? i + 1 : null)
        .filter(n => n !== null);
      m.matchCount = m.matchedNumbers.length;
      m.distance_km = distanceMap[m.id] != null ? distanceMap[m.id] : null;
      musicianDistanceCache[m.id] = m.distance_km;
    });









    if (hasOwnProfile) await getMyMusicianId();
    const filtered = musicians.filter(m => m.matchCount > 0 && !isGeblokkeerd(m.id) && !isEigenProfiel(m.id));

    if (seq !== setlistSearchSeq) return;

    if (!filtered.length) {
      const v = ruimerZoeken(!!radiusIds);
      if (v !== undefined) return runSetlistSearch(STRAAL_LANDELIJK, radius, songResult);
      geenResultaat(!!radiusIds); return;
    }
    let getoond = filtered;
    if (sprongVan !== undefined) {
      const trede = sprongTrede(sprongVan, filtered);
      getoond = binnenTrede(filtered, trede);
      setlistVerruimd = { van: setlistVerruimd ? setlistVerruimd.van : sprongVan, naar: trede };
    }
    await zetActiefStand('muzikant', getoond, actief);
    if (seq !== setlistSearchSeq) return;
    lastSetlistResults = sortSetlistList(getoond);
    renderCappedSetlistResults(true);

  } catch(e) {
    logCaught('runSetlistSearch', e);
    if (seq !== setlistSearchSeq) return;
    resultsEl.innerHTML = foutStaatHTML(e, 'zoeken', 'runSetlistSearch()');
  }
}

function renderSetlistResults(musicians, opts) {
  opts = opts || {};
  const el = document.getElementById('setlistSearchResults');
  const total = opts.total != null ? opts.total : musicians.length;

  if (!total) {


    const uitleg = opts.verruimd && opts.verruimd.leeg
      ? 'Niemand in de Tent heeft een match met deze setlist, ook niet buiten je zoekgebied.'
      : 'Niemand in de Tent (binnen je zoekgebied) heeft (nog) een match met deze setlist.';
    el.innerHTML = `
      <div class="no-results">
        <p class="no-results-kop">Geen muzikanten gevonden</p>
        <p class="no-results-tekst">${uitleg}</p>
      </div>`;
    return;
  }
  const verruimd = verruimdNotice(opts.verruimd, 'muzikanten');
  el.innerHTML = `
    <div class="results-header">
      <span class="results-count">${total} muzikant${total !== 1 ? 'en' : ''} gevonden</span>
    </div>
    ${verruimd}
    <div class="results-list">
      ${musicians.map(musicianSetlistRowHTML).join('')}
    </div>`;
  setTimeout(lijstVerderControleren, 0);
}





function mmTellingHTML(n, van) {
  return `<span class="mm-telling">${n} van ${van}</span>`;
}





function musicianSetlistRowHTML(m) {
  const displayName = displayNameOf(m);
  const instr = (m.musician_instruments || []).map(x => x.instrument);
  return zoekRijHTML({
    klik: `openProfielScherm('${jsAttr(m.id)}')`,
    foto: fotoHTML(m.avatar_url, displayName) || ZONDER_FOTO_HTML,
    naam: displayName,
    eerste: instr.find(v => filterSetlistInstruments.includes(v)) || instr[0] || '',
    plaats: m.city || '',
    afstand: afstandTekst(m.distance_km),
    rechts: mmTellingHTML(m.matchCount, setlistWantedSongs.length)
  });
}




















const GEDEELD_MIN = 2;
const GEDEELD_MAX = 20;




let setlistSoort = 'nummers';
let gedeeldGekozen = [];
let gedeeldResultaat = [];
let gedeeldOpen = new Set();
let gedeeldSearchSeq = 0;
let gedeeldNaamSeq = 0;
let gedeeldNaamTimeout = null;
let gedeeldSuggestieRijen = [];
let gedeeldEigenId = null;



const MM_VRAAG = {
  nummers: 'Kies muzikanten en zie wat jullie samen spelen.',
  muzikanten: 'Kies nummers en zie wie ze ook speelt.'
};

function setSetlistSoort(soort) {
  setlistSoort = soort === 'nummers' ? 'nummers' : 'muzikanten';
  const nummers = setlistSoort === 'nummers';
  document.getElementById('setlistDeelMuzikanten').style.display = nummers ? 'none' : '';
  document.getElementById('setlistDeelNummers').style.display = nummers ? '' : 'none';
  const knoppen = { muzikanten: 'setlistSoortMuzikantenBtn', nummers: 'setlistSoortNummersBtn' };
  Object.entries(knoppen).forEach(([k, id]) => {
    const b = document.getElementById(id);
    b.classList.toggle('active', k === setlistSoort);
    b.setAttribute('aria-selected', k === setlistSoort ? 'true' : 'false');
  });
  const vraag = document.getElementById('mmVraag');
  if (vraag) vraag.textContent = MM_VRAAG[setlistSoort];
  setlistZoekVerversen();
}


function setlistZoekVerversen() {
  if (setlistSoort === 'nummers') {
    gedeeldEigenToevoegen().then(veranderd => {
      if (!veranderd && gedeeldGekozen.length >= GEDEELD_MIN) runGedeeldSearch();
    });
  } else {
    mmSetlijstTonen();
    if (setlistWantedSongs.length) runSetlistSearch();
  }
}


function onGedeeldNaamInput(ruw) {
  clearTimeout(gedeeldNaamTimeout);
  const ac = document.getElementById('acGedeeldNaamList');
  const term = naamZoekTerm(ruw);
  if (!term || term.tekst.length < 2) { ac.classList.remove('open'); return; }
  gedeeldNaamTimeout = setTimeout(() => gedeeldSuggesties(term), 300);
}

async function gedeeldSuggesties(term) {
  const seq = ++gedeeldNaamSeq;
  const ac = document.getElementById('acGedeeldNaamList');
  if (gedeeldGekozen.length >= GEDEELD_MAX) {
    ac.innerHTML = `<div class="ac-item"><span>Je hebt al ${GEDEELD_MAX} muzikanten gekozen.</span></div>`;
    ac.classList.add('open');
    return;
  }

  if (!ac.classList.contains('open')) {
    ac.innerHTML = '<div class="ac-item"><span>Zoeken...</span></div>';
    ac.classList.add('open');
  }
  try {
    const treffers = await gedeeldNaamZoeken(term);
    if (seq !== gedeeldNaamSeq) return;
    gedeeldSuggestieRijen = treffers;
    if (!treffers.length) {
      ac.innerHTML = '<div class="ac-item"><span>Niemand met deze naam.</span></div>';
      ac.classList.add('open');
      return;
    }
    ac.innerHTML = treffers.map(m => `
      <div class="ac-item" onmousedown="addGedeeldMuzikant('${jsAttr(m.id)}')">
        <strong>${highlight(displayNameOf(m), term.tekst)}</strong>
        <span>${escHtml(gedeeldMeta(m))}</span>
      </div>`).join('');
    ac.classList.add('open');
  } catch (e) {
    logCaught('gedeeldSuggesties', e);
    if (seq !== gedeeldNaamSeq) return;
    ac.innerHTML = AC_FOUT_HTML;
    ac.classList.add('open');
  }
}










async function gedeeldNaamZoeken(term) {
  const { data, error } = await db.rpc('tt_zoek_op_naam', {
    term: term.tekst, exact: term.exact, zonder: gedeeldGekozen.map(g => g.id) });
  if (error) throw error;
  return (data || []).filter(m => !isGeblokkeerd(m.id)).map(m => ({
    id: m.id, weergavenaam: m.weergavenaam, city: m.city, avatar_url: m.avatar_url,
    musician_instruments: m.instrument ? [{ instrument: m.instrument }] : [],
    distance_km: m.distance_km
  }));
}


function gedeeldMeta(m) {
  const delen = [];
  if (m.city) delen.push(m.city);
  if (m.distance_km != null) delen.push(afstandTekst(m.distance_km));
  return delen.join(' · ');
}



async function gedeeldMuzikantenLaden(ids) {
  if (hasOwnProfile) {
    const velden = 'id, weergavenaam, username, city, musician_songs(song_title, song_artist, mastery_level)';
    const { data, error } = await inDelen(ids, deel => db.from('musicians').select(velden).in('id', deel));
    if (error) throw error;
    return (data || []).map(m => ({ ...m, musician_songs: m.musician_songs || [] }));
  }
  const namenVraag = vraagNu(db.rpc('tt_weergavenamen', { ids }));
  const { data, error } = await db.rpc('tt_get_musicians_public', { ids });
  if (error) throw error;
  const rijen = (data || []).map(m => ({
    id: m.id, username: m.username, city: m.city, avatar_url: m.avatar_url,
    musician_instruments: (m.instrument_levels || []).map(x => ({ instrument: x.instrument })),
    musician_songs: m.songs || []
  }));
  await weergavenamenToevoegen(rijen, namenVraag);
  return rijen;
}



function gedeeldGekozenRecord(m) {
  return {
    id: m.id, naam: displayNameOf(m), city: m.city || '', distance_km: m.distance_km,
    foto: m.avatar_url || '', instrument: ((m.musician_instruments || [])[0] || {}).instrument || ''
  };
}

function addGedeeldMuzikant(id) {
  const ac = document.getElementById('acGedeeldNaamList');
  closeAC('acGedeeldNaamList');
  if (gedeeldGekozen.some(g => g.id === id)) return;
  if (gedeeldGekozen.length >= GEDEELD_MAX) {
    showToast(`Je kunt maximaal ${GEDEELD_MAX} muzikanten kiezen.`);
    return;
  }
  const m = gedeeldSuggestieRijen.find(x => x.id === id);
  if (!m) return;
  gedeeldGekozen.push(gedeeldGekozenRecord(m));
  const veld = document.getElementById('gedeeldNaam');
  veld.value = '';
  if (ac) ac.innerHTML = '';
  renderGedeeldGekozen();
  setTimeout(() => veld.focus(), 0);
  if (gedeeldGekozen.length >= GEDEELD_MIN) runGedeeldSearch();
}





async function gedeeldEigenToevoegen() {
  try {
    const mid = hasOwnProfile ? await getMyMusicianId() : null;
    if (mid === gedeeldEigenId) return false;
    if (gedeeldEigenId) {
      const i = gedeeldGekozen.findIndex(g => g.id === gedeeldEigenId);
      if (i !== -1) gedeeldGekozen.splice(i, 1);
    }
    gedeeldEigenId = mid;
    if (mid && !gedeeldGekozen.some(g => g.id === mid)) {
      const { data, error } = await db.from('musicians').select('id, weergavenaam, username, city, avatar_url, musician_instruments(instrument)').eq('id', mid).maybeSingle();
      if (error) throw error;
      if (data && gedeeldGekozen.length < GEDEELD_MAX) {
        gedeeldGekozen.unshift(gedeeldGekozenRecord({ ...data, distance_km: null }));
      }
    }
    renderGedeeldGekozen();
    if (gedeeldGekozen.length >= GEDEELD_MIN) runGedeeldSearch();
    else { gedeeldResultaat = []; gedeeldOpen.clear(); renderGedeeldResults(); }
    return true;
  } catch (e) {
    logCaught('gedeeldEigenToevoegen', e);
    return false;
  }
}

function removeGedeeldMuzikant(i) {
  const weg = gedeeldGekozen.splice(i, 1)[0];
  renderGedeeldGekozen();
  if (weg) gedeeldResultaat.forEach(n => { delete n.spelers[weg.id]; });
  if (gedeeldGekozen.length >= GEDEELD_MIN) runGedeeldSearch();
  else { gedeeldResultaat = []; gedeeldOpen.clear(); renderGedeeldResults(); }
}






function renderGedeeldGekozen() {
  const list = document.getElementById('gedeeldGekozenList');
  const teller = document.getElementById('gedeeldTeller');
  list.hidden = !gedeeldGekozen.length;
  list.innerHTML = gedeeldGekozen.map((g, i) => {
    return zoekRijHTML({
      klik: `openProfielScherm('${jsAttr(g.id)}')`,
      foto: fotoHTML(g.foto, g.naam) || ZONDER_FOTO_HTML,
      naam: g.naam,
      eerste: g.instrument,
      plaats: g.city,
      afstand: afstandTekst(g.distance_km),
      rechts: mmKruisHTML(`removeGedeeldMuzikant(${i})`, `Verwijder ${g.naam}`)
    });
  }).join('');
  const nog = gedeeldGekozen.length ? GEDEELD_MIN - gedeeldGekozen.length : 0;
  teller.textContent = nog > 0 ? `Kies nog ${nog} ${nog === 1 ? 'muzikant' : 'muzikanten'}.` : '';
}

function resetGedeeldSearch() {
  gedeeldGekozen = [];
  gedeeldEigenId = null;
  gedeeldResultaat = [];
  gedeeldOpen.clear();
  gedeeldSuggestieRijen = [];
  document.getElementById('gedeeldNaam').value = '';
  closeAC('acGedeeldNaamList');
  renderGedeeldGekozen();
  renderGedeeldResults();
  gedeeldEigenToevoegen();
}

async function runGedeeldSearch() {
  const seq = ++gedeeldSearchSeq;
  const el = document.getElementById('gedeeldResults');
  if (gedeeldGekozen.length < GEDEELD_MIN) {
    showToast(`Kies minstens ${GEDEELD_MIN} muzikanten.`);
    return;
  }
  if (!el.innerHTML.trim()) ladenTonen(el);
  try {
    const muzikanten = await gedeeldMuzikantenLaden(gedeeldGekozen.map(g => g.id));
    if (seq !== gedeeldSearchSeq) return;
    const nummers = new Map();
    muzikanten.forEach(m => {
      (m.musician_songs || []).forEach(s => {
        const titel = (s.song_title || '').trim();
        const artiest = (s.song_artist || '').trim();
        if (!titel) return;


        const sleutel = `${titel.toLowerCase()}|||${artiest.toLowerCase()}`;
        if (!nummers.has(sleutel)) nummers.set(sleutel, { sleutel, titel, artiest, spelers: {} });
        nummers.get(sleutel).spelers[m.id] = LEVEL_LABELS[s.mastery_level] ? s.mastery_level : '';
      });
    });
    gedeeldResultaat = sortGedeeldList(
      [...nummers.values()].filter(n => Object.keys(n.spelers).length >= GEDEELD_MIN)
    );
    const nog = new Set(gedeeldResultaat.map(n => n.sleutel));
    gedeeldOpen = new Set([...gedeeldOpen].filter(k => nog.has(k)));
    gedeeldGetoond = ZOEK_PAGINA;
    renderGedeeldResults();
  } catch (e) {
    logCaught('runGedeeldSearch', e);
    if (seq !== gedeeldSearchSeq) return;
    el.innerHTML = foutStaatHTML(e, 'zoeken', 'runGedeeldSearch()');
  }
}

function gedeeldAantal(n) { return Object.keys(n.spelers).length; }




function sortGedeeldList(lijst) {
  const vgl = (a, b) => a.localeCompare(b, 'nl', { sensitivity: 'base' });
  return lijst.sort((a, b) => (gedeeldAantal(b) - gedeeldAantal(a))
    || vgl(a.artiest, b.artiest) || vgl(a.titel, b.titel));
}

function renderGedeeldResults() {
  const el = document.getElementById('gedeeldResults');
  if (!el) return;
  if (gedeeldGekozen.length < GEDEELD_MIN) { el.innerHTML = ''; return; }
  const totaal = gedeeldResultaat.length;
  if (!totaal) {
    el.innerHTML = `
      <div class="no-results">
        <p class="no-results-kop">Geen gedeelde nummers</p>
        <p class="no-results-tekst">Geen van deze nummers staat bij minstens 2 van deze muzikanten in het repertoire.</p>
      </div>`;
    return;
  }
  const getoond = gedeeldResultaat.slice(0, gedeeldGetoond);



  el.innerHTML = `
    <div class="results-header">
      <span class="results-count">${totaal} ${totaal === 1 ? 'nummer dat' : 'nummers die'} minstens ${GEDEELD_MIN} van jullie spelen</span>
    </div>
    <div class="results-list">
      ${getoond.map((n, i) => gedeeldRijHTML(n, i)).join('')}
    </div>`;
  setTimeout(lijstVerderControleren, 0);
}




const NIVEAU_RANG = { podium: 0, bijna: 1, basis: 2 };
function gedeeldSpelersVolgorde(n) {
  const rang = g => {
    if (!Object.prototype.hasOwnProperty.call(n.spelers, g.id)) return 9;
    const lvl = n.spelers[g.id];
    return NIVEAU_RANG[lvl] != null ? NIVEAU_RANG[lvl] : 5;
  };
  return gedeeldGekozen.map((g, k) => ({ g, k, r: rang(g) }))
    .sort((a, b) => (a.r - b.r) || (a.k - b.k)).map(x => x.g);
}




function gedeeldRijHTML(n, i) {
  const open = gedeeldOpen.has(n.sleutel);
  const paneelId = `gedeeldPaneel${i}`;
  const spelers = gedeeldSpelersVolgorde(n).map(g => {
    const speelt = Object.prototype.hasOwnProperty.call(n.spelers, g.id);
    const lvl = speelt ? n.spelers[g.id] : '';
    return `
      <div class="gedeeld-speler${speelt ? '' : ' niet'}">
        <span class="gedeeld-speler-foto">${fotoHTML(g.foto, '') || ZONDER_FOTO_HTML}</span>
        <button type="button" class="gedeeld-speler-naam" onclick="openProfielScherm('${jsAttr(g.id)}')">${escHtml(g.naam)}</button>
        ${speelt
          ? (lvl ? `<span class="level-pill">${escHtml(LEVEL_LABELS[lvl])}</span>` : '')
          : '<span class="gedeeld-speler-niet">Speelt dit niet</span>'}
      </div>`;
  }).join('');
  return `
    <div class="gedeeld-rij${open ? ' open' : ''}" data-sleutel="${escHtml(n.sleutel)}">
      <button type="button" class="gedeeld-rij-kop" aria-expanded="${open}" aria-controls="${paneelId}"
        onclick="toggleGedeeldRij('${jsAttr(n.sleutel)}')">
        ${nummerTekstHTML(n.artiest, n.titel)}
        ${mmTellingHTML(gedeeldAantal(n), gedeeldGekozen.length)}
      </button>
      ${open ? `<div class="gedeeld-paneel" id="${paneelId}"><div class="gedeeld-paneel-binnen">${spelers}</div></div>` : ''}
    </div>`;
}





const GEDEELD_KLAP_MS = 250;
function gedeeldRijEl(sleutel) {
  return [...document.querySelectorAll('#gedeeldResults .gedeeld-rij')].find(r => r.dataset.sleutel === sleutel);
}
function gedeeldZonderBeweging() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}
function toggleGedeeldRij(sleutel) {
  const rust = gedeeldZonderBeweging();
  if (gedeeldOpen.has(sleutel)) {
    gedeeldOpen.delete(sleutel);
    const rij = gedeeldRijEl(sleutel);
    const paneel = rij && rij.querySelector('.gedeeld-paneel');
    if (rust || !paneel) { renderGedeeldResults(); return; }
    rij.classList.remove('open');
    rij.querySelector('.gedeeld-rij-kop').setAttribute('aria-expanded', 'false');
    paneel.style.height = paneel.offsetHeight + 'px';
    void paneel.offsetHeight;
    paneel.style.height = '0px';
    setTimeout(() => { if (!gedeeldOpen.has(sleutel)) renderGedeeldResults(); }, GEDEELD_KLAP_MS);
    return;
  }
  gedeeldOpen.add(sleutel);
  renderGedeeldResults();
  if (rust) return;
  const rij = gedeeldRijEl(sleutel);
  const paneel = rij && rij.querySelector('.gedeeld-paneel');
  if (!paneel) return;
  const hoog = paneel.scrollHeight;
  rij.classList.remove('open');
  paneel.style.height = '0px';
  void paneel.offsetHeight;
  rij.classList.add('open');
  paneel.style.height = hoog + 'px';
  setTimeout(() => { paneel.style.height = ''; }, GEDEELD_KLAP_MS);
}
























let bewaardeZoek = undefined;
let onthoudToegepast = false;
let onthoudBijwerkTimer = null;

async function laadBewaardeZoek() {
  const mid = await getMyMusicianId();
  if (!mid) { bewaardeZoek = null; return null; }
  const { data, error } = await db.from('musician_saved_search')
    .select('*').eq('musician_id', mid).maybeSingle();
  if (error) throw error;
  bewaardeZoek = data || null;
  return bewaardeZoek;
}

function wisBewaardeZoek() {
  bewaardeZoek = undefined; laatsteZoekVertrek = null; onthoudToegepast = false;
  clearTimeout(onthoudBijwerkTimer);
  zetOnthoudVink(false);
}

function zetOnthoudVink(aan) {
  const vink = document.getElementById('zoekOnthoud');
  if (vink) vink.checked = !!aan;
}




function huidigeZoek() {
  const v = laatsteZoekVertrek;
  const gevonden = (document.getElementById('filterCityStatus') || {}).textContent || '';
  const plaatsTekst = /^\d{4}$/.test(v.plaatsTekst || '') && gevonden.trim() ? gevonden.trim() : v.plaatsTekst;
  const getal = (id) => { const x = document.getElementById(id).value; return x ? parseInt(x) : null; };
  return {
    soort: zoekSoort,
    volgorde: searchSortMode,
    instruments: filterInstruments.slice(),
    genres: filterGenres.slice(),
    age_min: getal('filterAgeMin'), age_max: getal('filterAgeMax'),
    niveau_min: getal('filterNiveauMin'), niveau_max: getal('filterNiveauMax'),
    radius_km: v.straal,
    plaats: v.plaats, plaats_tekst: plaatsTekst,
    origin_lat: v.lat, origin_lng: v.lng,
  };
}


function zoekTekst(z) {
  const soort = { alles: 'Muzikanten en bands', muzikanten: 'Muzikanten', bands: 'Bands' }[z.soort || 'alles'];
  const delen = [soort, z.instruments && z.instruments.length ? z.instruments.join(', ') : 'Alle instrumenten'];
  if (z.genres && z.genres.length) delen.push(z.genres.join(', '));
  if (z.age_min != null || z.age_max != null) {
    delen.push(z.age_max == null ? `vanaf ${z.age_min} jaar`
      : z.age_min == null ? `tot en met ${z.age_max} jaar`
      : `${z.age_min} t/m ${z.age_max} jaar`);
  }
  if (z.niveau_min != null || z.niveau_max != null) {
    delen.push(z.niveau_max == null ? `niveau ${z.niveau_min} en hoger`
      : z.niveau_min == null ? `niveau tot en met ${z.niveau_max}`
      : z.niveau_min === z.niveau_max ? `niveau ${z.niveau_min}`
      : `niveau ${z.niveau_min} t/m ${z.niveau_max}`);
  }
  delen.push(`binnen ${Number(z.radius_km)} km van ${z.plaats_tekst || 'je woonplaats'}`);
  return delen.join(' · ');
}

function zelfdeZoek(a, b) {
  const lijst = (x) => (x || []).slice().sort().join('|');
  return (a.soort || 'alles') === (b.soort || 'alles') && (a.volgorde || 'score') === (b.volgorde || 'score')
    && lijst(a.instruments) === lijst(b.instruments) && lijst(a.genres) === lijst(b.genres)
    && a.age_min == b.age_min && a.age_max == b.age_max
    && a.niveau_min == b.niveau_min && a.niveau_max == b.niveau_max
    && Number(a.radius_km) === Number(b.radius_km)
    && (a.plaats || '').toLowerCase() === (b.plaats || '').toLowerCase();
}




async function onthoudHerstellen() {
  onthoudToegepast = true;
  if (!hasOwnProfile) { zetOnthoudVink(false); return; }
  try {
    if (bewaardeZoek === undefined) await laadBewaardeZoek();
  } catch (e) {
    logCaught('onthoudHerstellen', e);
    return;
  }
  const z = bewaardeZoek;
  zetOnthoudVink(!!z);
  if (!z) return;
  const tekst = x => (x == null ? '' : String(x));
  filterInstruments.length = 0; (z.instruments || []).forEach(x => filterInstruments.push(x));
  filterGenres.length = 0; (z.genres || []).forEach(x => filterGenres.push(x));
  renderPickerBadges(PICKERS.filterInstruments);
  renderPickerBadges(PICKERS.filterGenres);
  setWheelFieldValues('leeftijd', leeftijdOpGroepen(tekst(z.age_min), tekst(z.age_max)), false);
  setWheelFieldValues('niveau', [tekst(z.niveau_min), tekst(z.niveau_max)], false);
  setWheelFieldValues('radius', [straalOpStap(z.radius_km)], false);
  if (z.plaats) {
    document.getElementById('filterCity').value = z.plaats;
    updateSearchCityStatus('filterCity', 'filterCityStatus');
  }
  if (ZOEK_SOORTEN.includes(z.soort)) { zetZoekSoortKnoppen(z.soort); bewaarZoekStand(); }
  selectSortModeByValue('filterSortMode', z.volgorde || 'score');
  refreshChoiceField('sorteren');
}


let onthoudBezig = false;
let onthoudDoel = false;
async function onthoudKlik(vink) {
  if (!hasOwnProfile) {
    vink.checked = false;
    showToast('Maak een profiel aan, dan onthouden we je zoekopdracht.');
    return;
  }


  if (onthoudBezig) { vink.checked = onthoudDoel; return; }
  const aan = vink.checked;
  onthoudBezig = true;
  onthoudDoel = aan;
  try {
    const mid = await getMyMusicianId();
    if (!mid) { vink.checked = false; return; }
    if (aan) {
      if (!laatsteZoekVertrek) {
        vink.checked = false;
        showToast('Vul een plaats in, dan onthouden we je zoekopdracht.');
        return;
      }
      const rij = Object.assign({ musician_id: mid }, huidigeZoek());
      const { error } = await db.from('musician_saved_search').upsert(rij, { onConflict: 'musician_id' });
      if (error) throw error;
      bewaardeZoek = Object.assign({}, bewaardeZoek || {}, rij);
    } else {
      const { error } = await db.from('musician_saved_search').delete().eq('musician_id', mid);
      if (error) throw error;
      bewaardeZoek = null;
    }
  } catch (e) {
    logCaught('onthoudKlik', e);
    vink.checked = !aan;
    showToast(friendlyErrorMessage(e, aan ? 'je zoekopdracht onthouden' : 'je zoekopdracht vergeten'));
  } finally {
    onthoudBezig = false;
  }
}



function onthoudBijwerken() {
  clearTimeout(onthoudBijwerkTimer);
  const vink = document.getElementById('zoekOnthoud');
  if (!vink || !vink.checked || !hasOwnProfile || !bewaardeZoek || !laatsteZoekVertrek) return;
  onthoudBijwerkTimer = setTimeout(async () => {
    if (!bewaardeZoek || !laatsteZoekVertrek || onthoudBezig) return;
    const nu = huidigeZoek();
    if (zelfdeZoek(bewaardeZoek, nu)) return;
    try {
      const { error } = await db.from('musician_saved_search').update(nu).eq('musician_id', bewaardeZoek.musician_id);
      if (error) throw error;
      bewaardeZoek = Object.assign({}, bewaardeZoek, nu);
    } catch (e) {
      logCaught('onthoudBijwerken', e);
    }
  }, 800);
}




async function vulBewaardeZoekInInstellingen() {
  const plek = document.getElementById('bewaardeZoekInstellingen');
  if (!plek) return;
  try {
    await laadBewaardeZoek();
  } catch (e) {
    logCaught('vulBewaardeZoekInInstellingen', e);
    plek.innerHTML = '';
    return;
  }
  plek.innerHTML = bewaardeZoek
    ? `<p class="voorkeur-uitleg bewaard-zoek-tekst">${escHtml(zoekTekst(bewaardeZoek))}</p>`
    : `<p class="voorkeur-uitleg">Nog geen. Zet in Zoeken het vinkje Onthoud mijn zoekopdracht aan.</p>`;
}
