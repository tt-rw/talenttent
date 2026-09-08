// ─── Zoekfunctie ─────────────────────────────────────────────────────────────

const GOAL_LABELS = {
  oefenen: 'Samen oefenen',
  band:    'Band starten',
  optreden:'Optreden',
  alles:   'Alles!'
};

const LEVEL_LABELS = { basis: 'Basis', bijna: 'Bijna', podium: 'Podiumklaar' };

// TT-47 (herzien 09-08-2026): concrete ambitie-vragen naast het abstracte
// doelveld — alleen ter aanvulling van het profiel, bewust geen zoekfilter
// (besluit Ronald, 09-08-2026). Eerste versie had een aparte "wil je
// optreden?"-vraag die dubbel op de doelkaart "Optreden" zat; vervangen door
// een vraag over muzikale groei, die geen overlap heeft met het doelveld.
// Nog niet definitief (Ronald, 09-08-2026: "dit is nog niet goed genoeg") —
// doel en ambitie voelen nog te dicht bij elkaar, komt terug in een latere sessie.
const REHEARSAL_LABELS = {
  dagelijks:       'Dagelijks',
  wekelijks:       'Wekelijks',
  paar_per_maand:  'Paar keer per maand',
  losse_jams:      'Losse jams, als het uitkomt',
  per_project:     'Projectmatig'
};
const AMBITION_LABELS = {
  verbeteren: 'Mezelf verbeteren op mijn instrument',
  stijlen:    'Nieuwe stijlen ontdekken',
  eigen_werk: 'Samen nummers/eigen werk maken',
  plezier:    'Gewoon plezier, geen groot plan'
};
// TT-52 (12-08-2026): repertoire-type, optioneel, per profiel (niet per nummer).
// Losse waarden gekozen (niet 'eigen_werk' hergebruikt) omdat musical_ambition.eigen_werk
// een andere betekenis heeft: dat is een wens ("samen nummers/eigen werk maken"),
// dit veld is een feit over het huidige repertoire ("covers/eigen nummers/beide").
const REPERTOIRE_TYPE_LABELS = {
  covers: 'Covers',
  eigen:  'Eigen nummers',
  beide:  'Allebei'
};

let filterInstruments = [];
let filterGenres      = [];
let filterGoal        = null;
let searchSortMode    = 'score';
// TT-01: Zoekvoorkeuren (⋯-menu op "Vind een muzikant") — instrumenten die
// je zoekt in een ander (musician_wanted) + e-maildigestvoorkeur. Beïnvloedt
// alleen de digest op de achtergrond, nooit de live zoekresultaten hierboven.
let wantedInstruments  = [];
let digestFrequencyValue = 'daily';
let emailThemeValue = 'light';
let lastMusicianResults = [];
// TT-30 (07-08-2026): lijst- of kaartweergave voor de zoekresultaten, per
// tabblad apart onthouden (localStorage) — Ronald: "bij veel matches neig ik
// naar regels, maar bij veel profielfoto's is een kaart ook tof", dus geen
// vaste keuze maar een toggle die de gebruiker zelf zet.
// TT-U13 (12-08-2026): op een telefoon zijn kaarten de standaard, niet de
// lijst. Je verkoopt mensen, geen records; op een rij is de foto 44px.
// Een eigen keuze blijft leidend — die staat in localStorage.
function standaardWeergave() {
  try { return window.matchMedia('(max-width: 560px)').matches ? 'grid' : 'list'; }
  catch (e) { return 'list'; }
}
let musicianViewMode = localStorage.getItem('tt_musicianViewMode') || standaardWeergave();
// TT-U13: zet de markering in beide schakelaars gelijk aan de werkelijke
// stand. De HTML markeert "Lijst" vast; op een telefoon klopt dat niet meer.
function syncViewToggles() {
  [['#musicianViewToggle', musicianViewMode], ['#bandViewToggle', bandViewMode]].forEach(([sel, mode]) => {
    const wrap = document.querySelector(sel);
    if (!wrap) return;
    wrap.querySelectorAll('.segmented-btn').forEach(x => x.classList.remove('selected'));
    wrap.querySelector(`[data-view="${mode}"]`)?.classList.add('selected');
  });
}

function setMusicianViewMode(mode) {
  musicianViewMode = mode;
  try { localStorage.setItem('tt_musicianViewMode', mode); } catch(e) {}
  document.querySelectorAll('#musicianViewToggle .segmented-btn').forEach(x => x.classList.remove('selected'));
  document.querySelector(`#musicianViewToggle [data-view="${mode}"]`).classList.add('selected');
  if (lastMusicianResults.length) renderCappedMusicianResults();
}
// Afstand per muzikant-id, gevuld door zoekresultaten (gewoon zoeken en setlist-
// zoeken). Gebruikt om de afstand ook te tonen als iemand het profiel opent
// vanuit een resultatenlijst — zonder de postcode zelf ooit te tonen (TT-04).
let musicianDistanceCache = {};

// TT-10 (05-08-2026): welk zoektabblad nu actief is, zodat configureSearchAccess()
// (draait bij elk bezoek aan "Zoeken") weet welke zoekfunctie automatisch
// opnieuw moet draaien.
let currentSearchMode = 'musician';

// Debounce-timers voor tekstvelden die automatisch verversen: een klik op een
// tag mag direct verversen, maar bij typen (naam/plaats/leeftijd) wachten we
// een fractie van een seconde na de laatste toetsaanslag, anders zoekt de app
// bij elke letter opnieuw — hakkelig en onnodig zwaar.
let musicianAutoSearchTimeout = null;
let bandAutoSearchTimeout = null;
let setlistAutoSearchTimeout = null;

// TT-84 (10-08-2026, externe review 2.3): volgnummers tegen verouderde
// resultaten. De debounce hierboven wacht 400 ms na de laatste toetsaanslag,
// maar stopt een zoekopdracht die al onderweg is niet. Op een traag mobiel
// netwerk kan zoekopdracht A dus ná zoekopdracht B binnenkomen. Het scherm
// toont dan het antwoord op filters die de gebruiker net heeft aangepast.
// Elke zoekopdracht krijgt nu een nummer. Alleen het antwoord met het hoogste
// nummer mag het scherm en de resultaatlijst nog aanraken.
let musicianSearchSeq = 0;
let bandSearchSeq = 0;
let setlistSearchSeq = 0;

function scheduleMusicianAutoSearch() {
  clearTimeout(musicianAutoSearchTimeout);
  musicianAutoSearchTimeout = setTimeout(() => runSearch(), 400);
}
function scheduleBandAutoSearch() {
  clearTimeout(bandAutoSearchTimeout);
  bandAutoSearchTimeout = setTimeout(() => runBandSearch(), 400);
}
function scheduleSetlistAutoSearch() {
  clearTimeout(setlistAutoSearchTimeout);
  // Zonder minstens 1 opgegeven nummer heeft zoeken geen betekenis — dan
  // stilzwijgend niets doen i.p.v. een foutmelding te tonen terwijl iemand
  // nog gewoon de plaats/straal aan het intypen is.
  setlistAutoSearchTimeout = setTimeout(() => { if (setlistWantedSongs.length) runSetlistSearch(); }, 400);
}

function sortMusicianList(list) {
  list.sort((a, b) => {
    if (a.isStale !== b.isStale) return a.isStale ? 1 : -1;
    if (searchSortMode === 'distance' && a.distance_km != null && b.distance_km != null) {
      return a.distance_km - b.distance_km;
    }
    if (searchSortMode === 'newest') {
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    }
    // TT-55 (12-08-2026): bij een gelijke (of ontbrekende) matchscore besliste
    // dit voorheen `return 0` — een onvoorspelbare volgorde uit de database.
    // Vastgelegd gedrag: bij gelijke stand eerst afstand, dan naam.
    if (a.matchScore != null && b.matchScore != null && a.matchScore !== b.matchScore) {
      return b.matchScore - a.matchScore;
    }
    if (a.distance_km != null && b.distance_km != null && a.distance_km !== b.distance_km) {
      return a.distance_km - b.distance_km;
    }
    const nameA = (displayNameOf(a) || '').toLowerCase();
    const nameB = (displayNameOf(b) || '').toLowerCase();
    return nameA.localeCompare(nameB, 'nl');
  });
  return list;
}

// Sorteren staat bij het resultaat: her-sorteert direct de al opgehaalde
// resultaten, geen nieuwe zoekopdracht nodig.
function setSearchSortMode(el, mode) {
  // "Dichtstbijzijnde" zonder afstandsgegevens (geen Plaats ingevuld als
  // vertrekpunt) zou de knop laten oplichten zonder dat er iets verandert —
  // verwarrend. Geef dan een duidelijke melding i.p.v. stilzwijgend niets doen.
  if (mode === 'distance' && lastMusicianResults.length && !lastMusicianResults.some(m => m.distance_km != null)) {
    showToast('Vul een plaats in bij de zoekfilters om op afstand te sorteren.');
    return;
  }
  searchSortMode = mode;
  document.querySelectorAll('#filterSortMode .segmented-btn').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
  if (lastMusicianResults.length) {
    sortMusicianList(lastMusicianResults);
    renderCappedMusicianResults();
  }
}

function initSearchFilters() {
  if (PICKERS.filterInstruments) return; // al ingevuld

  // TT-55/TT-183: maximaal 1 instrument, Zang en Songwriting als losse
  // uitzonderingen die niet meetellen voor die limiet — afgehandeld door
  // de generieke picker (singleMax + exceptionValues), zie
  // choosePickerListValue().
  initPicker({
    id: 'filterInstruments',
    fieldId: 'filterInstrumentsField', badgeRowId: 'filterInstrumentsBadgeRow',
    options: INSTRUMENTS, getList: () => filterInstruments,
    singleMax: true, exceptionValues: ['Zang', 'Songwriting'],
    placeholder: 'Kies een instrument',
    sheetTitle: 'Kies een instrument',
    onChange: runSearch
  });

  initPicker({
    id: 'filterGenres',
    fieldId: 'filterGenresField', badgeRowId: 'filterGenresBadgeRow',
    options: GENRES, getList: () => filterGenres,
    placeholder: 'Kies een genre',
    sheetTitle: 'Kies een genre',
    onChange: runSearch
  });

  // TT-01: geen singleMax — dit is een opgeslagen voorkeur voor de digest,
  // geen live resultatenlijst. De max-1-regel (TT-55) gold specifiek voor
  // een overzichtelijke resultatenlijst; die reden geldt hier niet.
  initPicker({
    id: 'wantedInstruments',
    fieldId: 'wantedInstrumentsField', badgeRowId: 'wantedInstrumentsBadgeRow',
    options: INSTRUMENTS, getList: () => wantedInstruments,
    placeholder: 'Instrument kiezen',
    sheetTitle: 'Instrument kiezen'
  });

  const goalWrap = document.getElementById('filterGoals');
  Object.entries(GOAL_LABELS).forEach(([val, label]) => {
    const t = document.createElement('div');
    t.className = 'tag';
    t.textContent = label;
    t.style.fontSize = '12px';
    t.style.padding = '6px 12px';
    t.onclick = () => {
      document.querySelectorAll('#filterGoals .tag').forEach(x => x.classList.remove('selected'));
      if (filterGoal === val) { filterGoal = null; }
      else { filterGoal = val; t.classList.add('selected'); }
      runSearch();
    };
    goalWrap.appendChild(t);
  });
}

// Straal-invoer strikt uitlezen: 0 km moet ook echt 0 km betekenen (0 is
// falsy in JS, dus "|| 25" zou 0 onterecht vervangen door de standaardwaarde).
function parseRadiusInput(id) {
  const raw = document.getElementById(id).value;
  if (raw === '' || raw == null) return 25;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 25;
}

// Straal in stappen van 5 km (04-08-2026): voorkomt onbedoeld extreem kleine
// stralen (bijv. 1 km) waarbinnen zelfs grote steden nauwelijks passen.
// Rondt ook handmatig getypte waarden af op het dichtstbijzijnde veelvoud van 5.
function snapRadiusToStep(el) {
  let v = parseFloat(el.value);
  if (!Number.isFinite(v)) v = 25;
  v = Math.max(5, Math.round(v / 5) * 5);
  el.value = v;
}

// TT-136 (23-08-2026): Meer filters-toggle, gedeeld door beide zoektabs.
// Blijft simpel bewust: geen state die het scherm zelf onthoudt tussen
// bezoeken — alleen binnen dezelfde sessie, zodat een net geopende sectie
// niet weer dichtklapt zodra iemand terugkomt van een ander scherm.
function toggleMoreFilters(which) {
  const el = document.getElementById(which + 'MoreFilters');
  const btn = document.getElementById(which + 'MoreFiltersToggle');
  if (!el || !btn) return;
  const opening = el.style.display === 'none';
  el.style.display = opening ? 'block' : 'none';
  btn.textContent = opening ? 'Minder filters ▴' : 'Meer filters ▾';
}

// Filters wissen — zet zoekscherm terug naar lege staat, leegt ook het resultaat.
function resetMusicianSearch() {
  document.getElementById('filterName').value = '';
  document.getElementById('filterCity').value = '';
  document.getElementById('filterCityStatus').textContent = '';
  document.getElementById('filterAgeMin').value = '';
  document.getElementById('filterAgeMax').value = '';
  document.getElementById('filterNiveauMin').value = '';
  document.getElementById('filterNiveauMax').value = '';
  document.getElementById('filterRadius').value = 25;
  filterInstruments = [];
  filterGenres = [];
  filterGoal = null;
  renderPickerBadges(PICKERS.filterInstruments);
  renderPickerBadges(PICKERS.filterGenres);
  document.querySelectorAll('#filterGoals .tag').forEach(t => t.classList.remove('selected'));
  selectSortModeByValue('filterSortMode', hasOwnProfile ? 'score' : 'distance');
  // TT-10: niet leeg laten staan — meteen opnieuw zoeken zonder filters,
  // consistent met "bij openen/wisselen van tabblad altijd een resultaat".
  runSearch();
}

async function runSearch() {
  const seq = ++musicianSearchSeq; // TT-84: zie toelichting bij musicianSearchSeq
  const resultsEl = document.getElementById('searchResults');
  // TT-10: bij automatisch verversen (filter aangeklikt/getypt) blijft het
  // bestaande resultaat gewoon staan tot het nieuwe binnen is — geen
  // steeds terugkerende laadanimatie die het scherm laat "knipperen". Alleen
  // bij de allereerste zoekopdracht (nog niets op het scherm) tonen we 'm.
  if (!resultsEl.innerHTML.trim()) {
    resultsEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted);">
      <div class="save-spinner" style="margin:0 auto 16px;"></div>Muzikanten zoeken...
    </div>`;
  }

  try {
    // Naam + Plaats: werken altijd, zowel met matching (bovenop de straal)
    // als zonder eigen profiel (als directe zoekopdracht) — vindbaarheid (Presentatie).
    const nameQuery = document.getElementById('filterName').value.trim().toLowerCase();
    const cityQuery = document.getElementById('filterCity').value.trim().toLowerCase();
    const radius = parseRadiusInput('filterRadius');

    let musicians;
    let matchInfo = {}; // id -> { distance_km, score, is_stale }
    let originResolved = false; // straal actief? dan Plaats niet ook als tekstfilter toepassen

    if (hasOwnProfile) {
      // TT-80 (10-08-2026, bevinding Ronald): vroeger gebruikte deze RPC
      // altijd je eigen locatie als vertrekpunt, wat je ook in Plaats typte
      // — "Delft, 25 km" gaf dan gewoon je eigen straal terug, met Delft
      // alleen als (kansloze) extra tekstfilter erbovenop. Afgesproken
      // gedrag: Plaats wordt automatisch gevuld met je eigen stad voor
      // gebruiksgemak, maar is altijd overschrijfbaar — en typ je iets
      // anders, dan wordt dát het nieuwe vertrekpunt voor de straal, net
      // als bij een bezoeker zonder eigen profiel.
      const mid = await getMyMusicianId();
      const myCity = await getMyCity();
      const typedCity = document.getElementById('filterCity').value.trim();
      const usesOwnCity = !typedCity || (!!myCity && typedCity.toLowerCase() === myCity.toLowerCase());
      const origin = usesOwnCity ? { lat: null, lng: null } : await resolveSearchOrigin(typedCity);

      const { data: matches, error: rpcErr } = await db.rpc('tt_search_musicians', {
        searcher_id: mid, radius_km: radius,
        origin_lat: origin.lat, origin_lng: origin.lng
      });
      if (rpcErr) throw rpcErr;
      if (seq !== musicianSearchSeq) return; // TT-84
      if (!matches.length) { lastMusicianResults = []; renderSearchResults([]); return; }
      matches.forEach(m => { matchInfo[m.musician_id] = m; });

      const ids = matches.map(m => m.musician_id);
      // B-01 tweede stap (18-08-2026): birth_date staat niet meer in deze
      // select. Een ingelogde gebruiker mag de kolom niet meer rechtstreeks
      // lezen (zie tt-b01-tweede-stap-geboortedatum.sql) — ook niet van
      // zichzelf, dat raakt deze zoekresultatenlijst toch niet. Leeftijd komt
      // apart binnen via tt_musicians_ages(), zelfde functie als bij het
      // profiel-modal hieronder.
      const { data, error } = await db.from('musicians').select(`
        id, fname, username, city, zip, bio, goal,
        profile_color, avatar_url, updated_at,
        musician_instruments(instrument, niveau),
        musician_genres(genre),
        musician_songs(song_title, song_artist, mastery_level)
      `).in('id', ids);
      if (error) throw error;
      musicians = data;

      if (ids.length) {
        const { data: ages, error: ageErr } = await db.rpc('tt_musicians_ages', { ids });
        if (!ageErr && ages) {
          const ageById = {};
          ages.forEach(a => { ageById[a.id] = a.age; });
          musicians.forEach(m => { m.age = ageById[m.id]; });
        }
        // Gaat tt_musicians_ages om wat voor reden dan ook mis: musicians
        // blijft gewoon gevuld, alleen zonder leeftijd — geen kapot scherm.
        // ageOf() valt dan terug op calcAgeFromISO(undefined) = 0, niet ideaal
        // maar geen crash. Zie ook TT-U31-achtige foutafhandeling elders.
      }

      // Straal is altijd actief voor een ingelogde gebruiker (eigen stad, of
      // het getypte alternatief hierboven) — Plaats mag dus nooit óók nog
      // als letterlijk tekstfilter gelden, anders vallen matches uit een
      // andere plaats binnen die straal er onterecht uit. Uitzondering: een
      // getypte plaats die nergens matcht (origin.lat blijft dan leeg) —
      // dan valt terug op je eigen locatie als straal, maar blijft Plaats
      // wél als tekstfilter gelden, zodat een tikfout niet stilzwijgend
      // wordt genegeerd.
      originResolved = usesOwnCity || origin.lat != null;
    } else {
      // Zonder eigen profiel: anonieme RPC's. Vertrekpunt voor straal/afstand
      // is het Plaats-veld hierboven (indien leeg of geen match: alle
      // muzikanten, geen straal/afstand).
      const origin = await resolveSearchOrigin(document.getElementById('filterCity').value);
      originResolved = origin.lat != null;
      const { data: matches, error: rpcErr } = await db.rpc('tt_search_musicians_anon', {
        origin_lat: origin.lat, origin_lng: origin.lng,
        radius_km: origin.lat != null ? radius : null,
      });
      if (rpcErr) throw rpcErr;
      if (seq !== musicianSearchSeq) return; // TT-84
      if (!matches.length) { lastMusicianResults = []; renderSearchResults([]); return; }
      matches.forEach(m => { matchInfo[m.musician_id] = m; });

      const ids = matches.map(m => m.musician_id);
      const { data, error } = await db.rpc('tt_get_musicians_public', { ids });
      if (error) throw error;
      // TT-43: fname wordt hier bewust NIET overgenomen, ook niet als de RPC
      // het (nog) meestuurt. Zo ziet een bezoeker zonder profiel altijd de
      // gebruikersnaam, onafhankelijk van wat er server-side is aangepast.
      musicians = (data || []).map(m => ({
        // B-02 (12-08-2026): de publieke functie geeft de leeftijd terug in
        // plaats van de geboortedatum. Een geboortedatum van een minderjarige
        // hoort niet bij een bezoeker zonder account te komen.
        // birth_date staat er nog naast als terugval: zolang script C nog niet
        // is gedraaid, geeft de functie dat veld nog. ageOf() kiest zelf.
        id: m.id, username: m.username, age: m.age, birth_date: m.birth_date, city: m.city,
        bio: m.bio, goal: m.goal, profile_color: m.profile_color, avatar_url: m.avatar_url,
        updated_at: m.updated_at,
        // TT-51 (12-08-2026, RPC-restpunt gesloten): instrument_levels bevat
        // instrument + niveau samen — vervangt de eerdere platte instruments-
        // lijst zodat het niveaufilter ook voor uitgelogde bezoekers werkt.
        musician_instruments: (m.instrument_levels || []).map(x => ({ instrument: x.instrument, niveau: x.niveau })),
        musician_genres: (m.genres || []).map(g => ({ genre: g })),
        musician_songs: m.songs || [],
      }));
    }

    // Client-side filters (naam, plaats, leeftijd, instrument, niveau, genre, doel)
    const ageMin = parseInt(document.getElementById('filterAgeMin').value) || 0;
    const ageMax = parseInt(document.getElementById('filterAgeMax').value) || 150;
    // TT-51: niveau-bereik, aaneengesloten (1-5). Leeg = geen ondergrens/bovengrens.
    const niveauMinVal = document.getElementById('filterNiveauMin').value;
    const niveauMaxVal = document.getElementById('filterNiveauMax').value;
    const niveauMin = niveauMinVal ? parseInt(niveauMinVal) : 1;
    const niveauMax = niveauMaxVal ? parseInt(niveauMaxVal) : 5;
    const niveauFilterActive = !!(niveauMinVal || niveauMaxVal);
    // Als Plaats als vertrekpunt is herkend (straal actief) of een postcode is,
    // dan niet óók nog als letterlijk tekstfilter toepassen — anders vallen
    // buurplaatsen binnen de straal (bijv. Den Haag bij "Delft") er onterecht uit.
    const cityIsPostcode = /^[1-9][0-9]{3}$/.test(cityQuery.replace(/\s/g,''));
    const skipCityTextFilter = originResolved || cityIsPostcode;

    const filtered = musicians.filter(m => {
      const age = ageOf(m);
      if (age < ageMin || age > ageMax) return false;
      if (filterGoal && m.goal !== filterGoal) return false;
      // TT-43: het naamveld doorzoekt precies dát wat je in de lijst ook ziet
      // — voor een bezoeker is m.fname leeg, dus dan blijft het zoeken op
      // gebruikersnaam. Anders zou je op een naam kunnen zoeken die je zelf
      // nergens te zien krijgt.
      if (nameQuery && !`${m.fname || ''} ${m.username || ''}`.toLowerCase().includes(nameQuery)) return false;
      if (cityQuery && !skipCityTextFilter && !(m.city || '').toLowerCase().includes(cityQuery)) return false;
      if (filterInstruments.length) {
        const mInstr = m.musician_instruments.map(x => x.instrument);
        if (!filterInstruments.some(i => mInstr.includes(i))) return false;
      }
      // TT-51: niveau-bereik toepassen op de niveaus van (a) de hierboven
      // gekozen instrument(en), of (b) alle instrumenten van de muzikant als
      // er geen instrument is gekozen. Ontbrekende niveaudata (anonieme
      // bezoeker, of oude rij zonder niveau) sluit een muzikant niet uit —
      // liever te veel resultaten tonen dan iemand onterecht laten verdwijnen.
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

    // Matchscore/afstand toevoegen (indien beschikbaar) en sorteren:
    // altijd eerst actieve profielen, verouderde (>6 mnd) profielen onderaan,
    // en binnen elke groep op de gekozen sorteermodus.
    filtered.forEach(m => {
      const info = matchInfo[m.id];
      m.distance_km = info ? info.distance_km : null;
      m.matchScore  = info ? info.score : null;
      m.isStale     = info ? info.is_stale : false;
      musicianDistanceCache[m.id] = m.distance_km;
    });
    if (seq !== musicianSearchSeq) return; // TT-84: nieuwere zoekopdracht loopt al
    sortMusicianList(filtered);
    lastMusicianResults = filtered;
    renderCappedMusicianResults();

  } catch(e) {
    if (seq !== musicianSearchSeq) return; // TT-84: fout van een verouderde zoekopdracht niet tonen
    resultsEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--danger);">Zoeken is niet gelukt: ${friendlyErrorMessage(e)}</div>`;
  }
}

// TT-10 (05-08-2026): nooit meer dan dit aantal tegelijk tonen, ook niet
// zonder filters — bij duizenden/tienduizenden profielen zou de browser
// anders vastlopen en het dataverkeer onnodig groot worden. Bij meer treffers
// dan dit aantal: gewoon de eerste N (op de gekozen sortering) tonen, met een
// duidelijke melding erboven i.p.v. stilzwijgend afkappen.
const SEARCH_RESULT_LIMIT = 50;

function renderSearchResults(musicians, opts) {
  opts = opts || {};
  const el = document.getElementById('searchResults');
  const total = opts.total != null ? opts.total : musicians.length;

  if (!total) {
    el.innerHTML = `
      <div class="no-results">
        <p style="font-size:16px;font-weight:600;margin-bottom:8px;">Geen muzikanten gevonden</p>
        <p style="font-size:13px;">Pas je filters of zoekstraal aan, en controleer of je eigen postcode in je profiel klopt.</p>
      </div>`;
    return;
  }

  const locationHint = opts.showLocationHint
    ? `<p style="font-size:12px;color:var(--muted);margin:0 0 12px;">Dit zijn ${musicians.length} willekeurige muzikanten uit heel Nederland — vul een plaats in voor resultaten bij jou in de buurt.</p>`
    : '';
  const cappedNotice = total > musicians.length
    ? `<p style="font-size:12px;color:var(--muted);margin:0 0 12px;">Toont de eerste ${musicians.length} van ${total} resultaten — voeg een filter toe of verklein je zoekstraal voor een preciezer overzicht.</p>`
    : '';

  el.innerHTML = `
    <div class="results-header">
      <span class="results-count">${total} muzikant${total !== 1 ? 'en' : ''} gevonden</span>
    </div>
    ${locationHint}${cappedNotice}
    <div class="${musicianViewMode === 'grid' ? 'results-grid-view' : 'results-list'}">
      ${musicians.map(m => musicianViewMode === 'grid' ? musicianCardHTML(m) : musicianRowHTML(m)).join('')}
    </div>`;
}

// Gedeeld door runSearch() en setSearchSortMode() — zorgt dat afkappen tot
// SEARCH_RESULT_LIMIT en de bijbehorende meldingen altijd hetzelfde werken,
// ongeacht of het resultaat net is opgehaald of alleen opnieuw gesorteerd.
function renderCappedMusicianResults() {
  const total = lastMusicianResults.length;
  const shown = lastMusicianResults.slice(0, SEARCH_RESULT_LIMIT);
  const cityFilled = !!document.getElementById('filterCity').value.trim();
  const showLocationHint = !hasOwnProfile && !cityFilled && total > 0;
  renderSearchResults(shown, { total, showLocationHint });
}

// TT-29 (07-08-2026): klein lijn-icoon (envelop) op muzikant-rijen, geeft in
// één oogopslag aan dat contact/bericht sturen mogelijk is. Gedeeld door
// musicianRowHTML() en musicianSetlistRowHTML() — niet gebruikt bij
// bandRowHTML(), want berichten bestaan alleen muzikant-naar-muzikant.
const MESSAGE_ICON_SVG = `<svg class="result-row-msg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><title>Bericht sturen mogelijk</title><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"></path></svg>`;

// TT-33 (07-08-2026): zonder profielfoto (of zonder identiteit, uitgelogd)
// tonen we altijd de "T" van het logo i.p.v. de voorletter van de naam —
// consistente merkherkenning i.p.v. een willekeurige letter per gebruiker
// (Ronald: "geef iedereen dan een typische T van het logo"). Zelfde lettertype
// als het woordmerk (--font-display).
const AVATAR_T_FALLBACK = `<span style="font-family:'Alfa Slab One','Roboto',sans-serif;">T</span>`;

// Extreem overzichtelijk gehouden (04-08-2026): alleen naam, plaats(+afstand)
// en instrument/genre-badges. Matchscore/vibe/doel/repertoire-preview zijn
// bewust van de rij af — die zie je pas in de detailmodal na een klik.
// Lijstweergave i.p.v. kaarten (04-08-2026) — duidelijker scanbaar bij veel resultaten.
// TT-43 (08-08-2026): één plek die bepaalt welke naam een ander te zien
// krijgt. Ronalds besluit: het verbergen van de echte voornaam was bedoeld
// voor NIET-ingelogd zoeken; wie zelf een profiel heeft, mag de voornaam wél
// zien (dat maakt de presentatie van de muzikant persoonlijker). Technisch
// regelt de database dat: de publieke RPC tt_get_musicians_public geeft geen
// fname meer terug, dus voor een bezoeker zonder profiel is m.fname simpelweg
// leeg en valt deze functie automatisch terug op de gebruikersnaam. Er is dus
// geen aparte hasOwnProfile-check nodig op elke weergaveplek.
function displayNameOf(m) {
  return (m && (m.fname || m.username)) || 'Muzikant';
}

// Bugfix/rename 19-08-2026 (Ronald): de zichtbare rol heet voortaan
// "Beheerder" i.p.v. "Oprichter" — één beheerder per band, geen meervoud.
// De opgeslagen waarde in band_members.role blijft letterlijk 'Oprichter';
// alleen de weergave verandert. Dat voorkomt een databasescript en risico op
// bestaande rijen. Elke plek die role aan de gebruiker toont, gaat via deze
// functie — nooit meer m.role rechtstreeks in de HTML.
function roleLabel(role) {
  return role === 'Oprichter' ? 'Beheerder' : (role || 'Lid');
}

function musicianRowHTML(m) {
  const col     = safeColor(m.profile_color, '#f5c518');
  const instruments = m.musician_instruments.map(x => x.instrument);
  const genres      = m.musician_genres.map(x => x.genre);

  // TT-38 (07-08-2026) / TT-43 (08-08-2026): uitgelogde bezoekers zien de
  // gebruikersnaam, ingelogde muzikanten de echte voornaam — zie
  // displayNameOf(). De foto is voor iedereen zichtbaar (Ronald: die is te
  // belangrijk voor de presentatie om achter een login te zetten).
  const avatarSrc = safeUrl(m.avatar_url);
  const displayName = displayNameOf(m);
  const avatarHTML = avatarSrc ? `<img src="${avatarSrc}" alt="${escHtml(displayName)}">` : AVATAR_T_FALLBACK;
  const nameHTML = escHtml(displayName);

  return `
    <div class="result-row" style="border-left-color:${col};" onclick="openMusicianModal('${jsAttr(m.id)}')">
      <div class="result-row-top">
        <div class="result-row-avatar" style="background:${col};">${avatarHTML}</div>
        <div class="result-row-main">
          <div class="result-row-name">${nameHTML}</div>
          <div class="result-row-meta">${escHtml(m.city || '')}${m.distance_km != null ? ` · ${m.distance_km.toFixed(1)} km` : ''}</div>
        </div>
        <div class="result-row-msg-btn" onclick="openRowMessageIcon(event,'${jsAttr(m.id)}','${jsAttr(displayName)}')">${MESSAGE_ICON_SVG}</div>
      </div>
      <div class="result-row-badges">
        ${overflowBadgeHTML(instruments, col, 2)}
        ${overflowBadgeHTML(genres, '#6ec8d8', 2)}
      </div>
    </div>`;
}

// TT-30 (07-08-2026): kaartweergave als alternatief voor musicianRowHTML()
// hierboven — zelfde onderliggende data en dezelfde openMusicianModal()-klik,
// alleen fotogericht in plaats van compact. Kiesbaar via de "Weergave"-
// toggle (Ronald: "bij veel profielfoto's is een kaart ook tof"), naast
// (niet i.p.v.) de bestaande rijenlijst — voorkeur wordt onthouden per
// tabblad (localStorage).
function musicianCardHTML(m) {
  const col = safeColor(m.profile_color, '#f5c518');
  const instruments = m.musician_instruments.map(x => x.instrument);
  const genres = m.musician_genres.map(x => x.genre);

  const avatarSrc = safeUrl(m.avatar_url);
  const displayName = displayNameOf(m);
  const photoHTML = avatarSrc ? `<img src="${avatarSrc}" alt="${escHtml(displayName)}">` : AVATAR_T_FALLBACK;
  const nameHTML = escHtml(displayName);

  return `
    <div class="result-card" onclick="openMusicianModal('${jsAttr(m.id)}')">
      <div class="result-card-photo" style="background:${col};">${photoHTML}</div>
      <div class="result-card-top-row">
        <div class="result-card-name">${nameHTML}</div>
        <div class="result-card-msg-btn" onclick="openRowMessageIcon(event,'${jsAttr(m.id)}','${jsAttr(displayName)}')">${MESSAGE_ICON_SVG}</div>
      </div>
      <div class="result-card-meta">${escHtml(m.city || '')}${m.distance_km != null ? ` · ${m.distance_km.toFixed(1)} km` : ''}</div>
      <div class="result-card-badges-line">${overflowBadgeHTML(instruments, col, 2)}</div>
      <div class="result-card-badges-line">${overflowBadgeHTML(genres, '#6ec8d8', 2)}</div>
    </div>`;
}

// ─── Band zoekfunctie ────────────────────────────────────────────────────────

let filterBandGenresList = [];
let filterBandWantedList = [];
// 25-08-2026 (Ronald): bands moeten standaard zichtbaar zijn, ook als ze
// geen leden zoeken. Geen default-filter meer op status — "Zoekend" is nu
// een filter dat de gebruiker zelf aanzet, geen voorgeselecteerde standaard.
let filterBandStatusVal  = null;
let bandSearchSortMode   = 'score';
let myMusicianId = null;
// TT-56 (12-08-2026): opt-out voor band-uitnodigingen. Bijgehouden als eigen
// variabele (net als myMusicianId) zodat de knop op Mijn Profiel zijn tekst
// kan tonen zonder steeds opnieuw te hoeven laden.
let myAcceptsBandInvites = true;
let lastBandResults = [];
// TT-30 (07-08-2026): zie musicianViewMode hierboven — zelfde patroon, apart
// onthouden per tabblad.
let bandViewMode = localStorage.getItem('tt_bandViewMode') || standaardWeergave();
function setBandViewMode(mode) {
  bandViewMode = mode;
  try { localStorage.setItem('tt_bandViewMode', mode); } catch(e) {}
  document.querySelectorAll('#bandViewToggle .segmented-btn').forEach(x => x.classList.remove('selected'));
  document.querySelector(`#bandViewToggle [data-view="${mode}"]`).classList.add('selected');
  if (lastBandResults.length) renderCappedBandResults();
}

function sortBandList(list) {
  list.sort((a, b) => {
    if (a.isStale !== b.isStale) return a.isStale ? 1 : -1;
    if (bandSearchSortMode === 'distance' && a.distance_km != null && b.distance_km != null) {
      return a.distance_km - b.distance_km;
    }
    if (bandSearchSortMode === 'newest') {
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    }
    // TT-55 (12-08-2026): zelfde vastgelegde tie-break als sortMusicianList()
    // — bij gelijke stand eerst afstand, dan naam, i.p.v. het voormalige
    // onvoorspelbare `return 0`.
    if (a.matchScore != null && b.matchScore != null && a.matchScore !== b.matchScore) {
      return b.matchScore - a.matchScore;
    }
    if (a.distance_km != null && b.distance_km != null && a.distance_km !== b.distance_km) {
      return a.distance_km - b.distance_km;
    }
    return (a.name || '').toLowerCase().localeCompare((b.name || '').toLowerCase(), 'nl');
  });
  return list;
}

// Sorteren staat bij het resultaat: her-sorteert direct de al opgehaalde
// resultaten, geen nieuwe zoekopdracht nodig.
function setBandSearchSortMode(el, mode) {
  if (mode === 'distance' && lastBandResults.length && !lastBandResults.some(b => b.distance_km != null)) {
    showToast('Vul een plaats in bij de zoekfilters om op afstand te sorteren.');
    return;
  }
  bandSearchSortMode = mode;
  document.querySelectorAll('#filterBandSortMode .segmented-btn').forEach(x => x.classList.remove('selected'));
  el.classList.add('selected');
  if (lastBandResults.length) {
    sortBandList(lastBandResults);
    renderCappedBandResults();
  }
}

let bandState = { genres: [], status: 'zoekend', wanted: [], color: '#3ecfff', niveau: null, avatarUrl: null, avatarPath: null };

function initBandSearchFilters() {
  if (!PICKERS.filterBandGenres) {
    initPicker({
      id: 'filterBandGenres',
      fieldId: 'filterBandGenresField', badgeRowId: 'filterBandGenresBadgeRow',
      options: GENRES, getList: () => filterBandGenresList,
      placeholder: 'Kies een genre',
      sheetTitle: 'Kies een genre',
      onChange: runBandSearch
    });
  }
  if (!PICKERS.filterBandWanted) {
    // TT-55-uitbreiding: zelfde patroon als het muzikanten-instrumentfilter
    // — maximaal 1 instrument, Zang en Songwriting als losse uitzonderingen.
    initPicker({
      id: 'filterBandWanted',
      fieldId: 'filterBandWantedField', badgeRowId: 'filterBandWantedBadgeRow',
      options: INSTRUMENTS, getList: () => filterBandWantedList,
      singleMax: true, exceptionValues: ['Zang', 'Songwriting'],
      placeholder: 'Kies een instrument',
      sheetTitle: 'Kies een instrument',
      onChange: runBandSearch
    });
  }
}

function toggleBandStatusFilter(el, val) {
  el.classList.toggle('selected');
  filterBandStatusVal = el.classList.contains('selected') ? val : null;
  runBandSearch();
}

// Filters wissen — zet zoekscherm terug naar lege staat, zoekt daarna direct
// opnieuw (TT-10: nooit een leeg resultaat achterlaten na het wissen).
function resetBandSearch() {
  document.getElementById('filterBandName').value = '';
  document.getElementById('filterBandCity').value = '';
  document.getElementById('filterBandCityStatus').textContent = '';
  document.getElementById('filterBandRadius').value = 25;
  document.getElementById('filterBandNiveauMin').value = '';
  document.getElementById('filterBandNiveauMax').value = '';
  filterBandGenresList = [];
  filterBandWantedList = [];
  filterBandStatusVal = null;
  renderPickerBadges(PICKERS.filterBandGenres);
  renderPickerBadges(PICKERS.filterBandWanted);
  document.querySelectorAll('#filterBandStatus .tag').forEach(t => t.classList.remove('selected'));
  selectSortModeByValue('filterBandSortMode', hasOwnProfile ? 'score' : 'distance');
  runBandSearch();
}

async function runBandSearch() {
  const seq = ++bandSearchSeq; // TT-84: zie toelichting bij musicianSearchSeq
  const resultsEl = document.getElementById('bandSearchResults');
  if (!resultsEl.innerHTML.trim()) {
    resultsEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted);">Bands zoeken...</div>`;
  }
  try {
    // Naam + Plaats: werken altijd, zowel met matching (bovenop de straal)
    // als zonder eigen profiel (als directe zoekopdracht) — vindbaarheid (Presentatie).
    const nameQuery = document.getElementById('filterBandName').value.trim().toLowerCase();
    const cityQuery = document.getElementById('filterBandCity').value.trim().toLowerCase();
    const radius = parseRadiusInput('filterBandRadius');

    let bands;
    let matchInfo = {}; // id -> { distance_km, score, is_stale }
    let originResolved = false; // straal actief? dan Plaats niet ook als tekstfilter toepassen

    if (hasOwnProfile) {
      // TT-80: zelfde fix als in runSearch() — zie de toelichting daar.
      const mid = await getMyMusicianId();
      const myCity = await getMyCity();
      const typedCity = document.getElementById('filterBandCity').value.trim();
      const usesOwnCity = !typedCity || (!!myCity && typedCity.toLowerCase() === myCity.toLowerCase());
      const origin = usesOwnCity ? { lat: null, lng: null } : await resolveSearchOrigin(typedCity);

      const { data: matches, error: rpcErr } = await db.rpc('tt_search_bands_for_musician', {
        searcher_id: mid, radius_km: radius,
        origin_lat: origin.lat, origin_lng: origin.lng
      });
      if (rpcErr) throw rpcErr;
      if (seq !== bandSearchSeq) return; // TT-84
      if (!matches.length) { lastBandResults = []; renderBandSearchResults([]); return; }
      matches.forEach(m => { matchInfo[m.band_id] = m; });

      const ids = matches.map(m => m.band_id);
      let query = db.from('bands').select(`id, name, city, genres, status, description, profile_color, updated_at, niveau, band_members(musician_id, status, musicians(fname, profile_color)), band_wanted(instrument)`).in('id', ids);
      if (filterBandStatusVal) query = query.eq('status', filterBandStatusVal);
      const { data, error } = await query;
      if (error) throw error;
      bands = data;

      // Zelfde redenering als in runSearch(): straal is altijd actief
      // (eigen stad, of het getypte alternatief hierboven), dus Plaats mag
      // niet óók nog als letterlijk tekstfilter gelden — behalve als de
      // getypte plaats nergens matcht, dan blijft het als tekstfilter tellen.
      originResolved = usesOwnCity || origin.lat != null;
    } else {
      // Zonder eigen profiel: anonieme RPC's. Vertrekpunt voor straal/afstand
      // is het Plaats-veld hierboven (indien leeg of geen match: alle bands,
      // geen straal/afstand). Geen instrumentfilter — je zoekt geen band op
      // instrument als bezoeker.
      const origin = await resolveSearchOrigin(document.getElementById('filterBandCity').value);
      originResolved = origin.lat != null;
      const { data: matches, error: rpcErr } = await db.rpc('tt_search_bands_anon', {
        origin_lat: origin.lat, origin_lng: origin.lng,
        radius_km: origin.lat != null ? radius : null,
      });
      if (rpcErr) throw rpcErr;
      if (seq !== bandSearchSeq) return; // TT-84
      if (!matches.length) { lastBandResults = []; renderBandSearchResults([]); return; }
      matches.forEach(m => { matchInfo[m.band_id] = m; });

      const ids = matches.map(m => m.band_id);
      let { data, error } = await db.rpc('tt_get_bands_public', { ids });
      if (error) throw error;
      if (filterBandStatusVal) data = (data || []).filter(b => b.status === filterBandStatusVal);
      bands = (data || []).map(b => ({
        id: b.id, name: b.name, city: b.city, genres: b.genres || [], status: b.status,
        description: b.description, profile_color: b.profile_color, updated_at: b.updated_at,
        niveau: b.niveau, // TT-51 (12-08-2026, RPC-restpunt gesloten)
        band_members: (b.members || []).map(x => ({ status: 'bevestigd', musicians: { fname: x.fname, profile_color: x.profile_color } })),
        band_wanted: (b.wanted || []).map(i => ({ instrument: i })),
      }));
    }

    // Als Plaats als vertrekpunt is herkend (straal actief) of een postcode is,
    // dan niet óók nog als letterlijk tekstfilter toepassen — anders vallen
    // buurplaatsen binnen de straal (bijv. Den Haag bij "Delft") er onterecht uit.
    const cityIsPostcode = /^[1-9][0-9]{3}$/.test(cityQuery.replace(/\s/g,''));
    const skipCityTextFilter = originResolved || cityIsPostcode;

    // TT-51: niveau van de band zelf, bereik, aaneengesloten. Ontbrekende
    // niveaudata (band heeft nog geen niveau gekozen, of anonieme bezoeker)
    // sluit de band niet uit — zie dezelfde redenering bij runSearch().
    const bandNiveauMinVal = document.getElementById('filterBandNiveauMin').value;
    const bandNiveauMaxVal = document.getElementById('filterBandNiveauMax').value;
    const bandNiveauMin = bandNiveauMinVal ? parseInt(bandNiveauMinVal) : 1;
    const bandNiveauMax = bandNiveauMaxVal ? parseInt(bandNiveauMaxVal) : 5;
    const bandNiveauFilterActive = !!(bandNiveauMinVal || bandNiveauMaxVal);

    const filtered = (bands || []).filter(b => {
      if (nameQuery && !(b.name || '').toLowerCase().includes(nameQuery)) return false;
      if (cityQuery && !skipCityTextFilter && !(b.city || '').toLowerCase().includes(cityQuery)) return false;
      if (filterBandGenresList.length && !filterBandGenresList.some(g => (b.genres||[]).includes(g))) return false;
      if (hasOwnProfile && filterBandWantedList.length) {
        const wanted = (b.band_wanted||[]).map(w => w.instrument);
        if (!filterBandWantedList.some(i => wanted.includes(i))) return false;
      }
      if (bandNiveauFilterActive && b.niveau != null && (b.niveau < bandNiveauMin || b.niveau > bandNiveauMax)) return false;
      return true;
    });

    // Matchscore/afstand toevoegen en sorteren: actieve profielen eerst,
    // verouderde (>6 mnd) altijd onderaan, daarbinnen op gekozen sorteermodus.
    filtered.forEach(b => {
      const info = matchInfo[b.id];
      b.distance_km = info ? info.distance_km : null;
      b.matchScore  = info ? info.score : null;
      b.isStale     = info ? info.is_stale : false;
    });
    if (seq !== bandSearchSeq) return; // TT-84: nieuwere zoekopdracht loopt al
    sortBandList(filtered);
    lastBandResults = filtered;
    renderCappedBandResults();
  } catch(e) {
    if (seq !== bandSearchSeq) return; // TT-84: fout van een verouderde zoekopdracht niet tonen
    resultsEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--danger);">Zoeken is niet gelukt: ${friendlyErrorMessage(e)}</div>`;
  }
}

function renderBandSearchResults(bands, opts) {
  opts = opts || {};
  const el = document.getElementById('bandSearchResults');
  const total = opts.total != null ? opts.total : bands.length;

  if (!total) {
    el.innerHTML = `<div class="no-results"><p style="font-size:16px;font-weight:600;margin-bottom:8px;">Geen bands gevonden</p><p style="font-size:13px;">Pas je filters of zoekstraal aan, en controleer of je eigen postcode in je profiel klopt.</p></div>`;
    return;
  }
  const locationHint = opts.showLocationHint
    ? `<p style="font-size:12px;color:var(--muted);margin:0 0 12px;">Dit zijn ${bands.length} willekeurige bands uit heel Nederland — vul een plaats in voor resultaten bij jou in de buurt.</p>`
    : '';
  const cappedNotice = total > bands.length
    ? `<p style="font-size:12px;color:var(--muted);margin:0 0 12px;">Toont de eerste ${bands.length} van ${total} resultaten — voeg een filter toe of verklein je zoekstraal voor een preciezer overzicht.</p>`
    : '';
  const statusLabels = { zoekend: 'Zoekend', compleet: 'Compleet', inactief: 'Inactief' };
  el.innerHTML = `<div class="results-header"><span class="results-count">${total} band${total !== 1 ? 's' : ''} gevonden</span></div>
    ${locationHint}${cappedNotice}
    <div class="${bandViewMode === 'grid' ? 'results-grid-view' : 'results-list'}">${bands.map(b => bandViewMode === 'grid' ? bandCardHTML(b, statusLabels) : bandRowHTML(b, statusLabels)).join('')}</div>`;
}

// Zelfde patroon als renderCappedMusicianResults() hierboven.
function renderCappedBandResults() {
  const total = lastBandResults.length;
  const shown = lastBandResults.slice(0, SEARCH_RESULT_LIMIT);
  const cityFilled = !!document.getElementById('filterBandCity').value.trim();
  const showLocationHint = !hasOwnProfile && !cityFilled && total > 0;
  renderBandSearchResults(shown, { total, showLocationHint });
}

// Lijstweergave i.p.v. kaarten (04-08-2026) — duidelijker scanbaar bij veel resultaten.
function bandRowHTML(b, statusLabels) {
  const col = safeColor(b.profile_color, '#3ecfff');
  const wanted = (b.band_wanted||[]).slice(0,3);
  const status = statusLabels[b.status] ? b.status : '';
  return `
    <div class="result-row" style="border-left-color:${col};" onclick="openBandModal('${jsAttr(b.id)}')">
      <div class="result-row-top">
        <div class="result-row-avatar" style="background:${col};border-radius:10px;">${AVATAR_T_FALLBACK}</div>
        <div class="result-row-main">
          <div class="result-row-name">${escHtml(b.name)}${bandStarDisplayHTML(b)}</div>
          <div class="result-row-meta">
            ${escHtml(b.city || '')}${b.distance_km != null ? ` · ${b.distance_km.toFixed(1)} km` : ''}
            <span class="band-status-badge band-status-${status}" style="margin-left:8px;">${escHtml(statusLabels[status] || b.status)}</span>
          </div>
        </div>
      </div>
      <div class="result-row-badges">
        ${wanted.map(w => tagSolid('+ ' + w.instrument, '#6ec8d8')).join('')}
      </div>
    </div>`;
}

// TT-30 (07-08-2026): kaartweergave voor bands, zelfde patroon als
// musicianCardHTML() hierboven — kiesbaar via de "Weergave"-toggle. Geen
// berichten-icoon (in tegenstelling tot de muzikant-varianten): berichten
// bestaan vooralsnog alleen muzikant-naar-muzikant, niet naar een band.
function bandCardHTML(b, statusLabels) {
  const col = safeColor(b.profile_color, '#3ecfff');
  const wanted = (b.band_wanted||[]).slice(0,3);
  const status = statusLabels[b.status] ? b.status : '';
  return `
    <div class="result-card" onclick="openBandModal('${jsAttr(b.id)}')">
      <div class="result-card-photo" style="background:${col};border-radius:8px;">${AVATAR_T_FALLBACK}</div>
      <div class="result-card-name">${escHtml(b.name)}${bandStarDisplayHTML(b)}</div>
      <div class="result-card-meta">
        ${escHtml(b.city || '')}${b.distance_km != null ? ` · ${b.distance_km.toFixed(1)} km` : ''}
        <span class="band-status-badge band-status-${status}" style="margin-left:8px;">${escHtml(statusLabels[status] || b.status)}</span>
      </div>
      <div class="result-card-badges">
        ${wanted.map(w => tagSolid('+ ' + w.instrument, '#6ec8d8')).join('')}
      </div>
    </div>`;
}

// ─── Setlist-zoekfunctie ─────────────────────────────────────────────────────
// Herzien ontwerp (04-08-2026, Ronald): zelfde Artiest→Nummer-zoekvelden als
// bij de profiel-repertoirestap i.p.v. los vrij-tekstveld. De zoeker (band)
// bouwt zo een genummerde setlist op (#1, #2, ...); exacte titel+artiest-match
// tegen het repertoire van muzikanten. Hoe meer nummers matchen, hoe hoger de
// muzikant in het resultaat. Geen ingelogd/uitgelogd-verschil in mogelijkheden
// — alleen de databaseroute verschilt (publieke RPC vs. directe tabeltoegang).

let setlistWantedSongs = [];       // { title, artist }, volgorde = volgnummer
let selectedSetlistArtist = null;  // { id, name }
let setlistItunesSearchTimeout = null;
let filterSetlistInstruments = []; // TT-139: harde instrumentfilter, zelfde patroon als TT-55

// TT-139: instrumentpicker voor Setlist-zoeken, zelfde patroon als
// initSearchFilters()/initBandSearchFilters() — maximaal 1 instrument,
// Zang en Songwriting als losse uitzonderingen (singleMax + exceptionValues).
function initSetlistSearchFilters() {
  if (PICKERS.filterSetlistInstruments) return; // al ingevuld
  initPicker({
    id: 'filterSetlistInstruments',
    fieldId: 'filterSetlistInstrumentsField', badgeRowId: 'filterSetlistInstrumentsBadgeRow',
    options: INSTRUMENTS, getList: () => filterSetlistInstruments,
    singleMax: true, exceptionValues: ['Zang', 'Songwriting'],
    placeholder: 'Kies een instrument',
    sheetTitle: 'Kies een instrument',
    onChange: () => { if (setlistWantedSongs.length) runSetlistSearch(); }
  });
}

function renderSetlistSongsList() {
  const list = document.getElementById('setlistSongsList');
  if (!setlistWantedSongs.length) { list.innerHTML = ''; return; }
  list.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-top:4px;">
      ${setlistWantedSongs.map((s,i) => `
        <div style="display:flex;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);gap:12px;">
          <span style="font-family:'Roboto',sans-serif;font-size:14px;font-weight:700;color:var(--accent);width:26px;flex-shrink:0;">#${i+1}</span>
          <div style="flex:1;">
            <div style="font-size:15px;font-weight:600;">${escHtml(s.title)}</div>
            <div style="font-size:12px;color:var(--muted);">${escHtml(s.artist)}</div>
          </div>
          <button class="song-remove" onclick="removeSetlistSong(${i})" title="Verwijderen">✕</button>
        </div>
      `).join('')}
    </div>`;
}

function addSetlistSong(title, artist) {
  if (setlistWantedSongs.find(s => s.title === title && s.artist === artist)) return;
  setlistWantedSongs.push({ title, artist });
  document.getElementById('setlistArtistSearch').value = '';
  document.getElementById('setlistTrackSearch').value = '';
  document.getElementById('setlistTrackSearchWrap').style.display = 'none';
  closeAC('acSetlistTrackList');
  closeAC('acSetlistArtistList');
  selectedSetlistArtist = null;
  renderSetlistSongsList();
  setTimeout(() => document.getElementById('setlistArtistSearch').focus(), 0);
  runSetlistSearch(); // TT-10: direct verversen, minstens 1 nummer is nu bekend
}

function removeSetlistSong(i) {
  setlistWantedSongs.splice(i, 1);
  renderSetlistSongsList();
  // TT-10: bij het laatste nummer weghalen is er niets meer om op te matchen —
  // resultaat netjes leegmaken i.p.v. het oude resultaat te laten staan.
  if (setlistWantedSongs.length) runSetlistSearch();
  else document.getElementById('setlistSearchResults').innerHTML = '';
}

// Stap A: artiest zoeken (zelfde iTunes-aanpak als profiel-repertoire, TT-139).
async function onSetlistArtistSearch(q) {
  const ac = document.getElementById('acSetlistArtistList');
  if (q.length < 2) { ac.classList.remove('open'); return; }

  ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted)">Zoeken...</span></div>';
  ac.classList.add('open');

  const cacheKey = q.toLowerCase();
  if (itunesArtistCache.has(cacheKey)) {
    renderArtistResults(ac, itunesArtistCache.get(cacheKey), q, 'selectSetlistArtist');
    return;
  }

  clearTimeout(setlistItunesSearchTimeout);
  setlistItunesSearchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=7&country=NL`
      );
      const data = await res.json();
      const artists = (data.results || []).slice(0, 6);
      itunesArtistCache.set(cacheKey, artists);
      renderArtistResults(ac, artists, q, 'selectSetlistArtist');
    } catch(e) {
      ac.innerHTML = '<div class="ac-item"><span style="color:var(--danger)">Zoekopdracht mislukt</span></div>';
    }
  }, 400);
}

function selectSetlistArtist(id, name) {
  selectedSetlistArtist = { id, name };
  document.getElementById('setlistArtistSearch').value = name;
  closeAC('acSetlistArtistList');
  const wrap = document.getElementById('setlistTrackSearchWrap');
  wrap.style.display = 'block';
  document.getElementById('setlistTrackSearchLabel').textContent = `Nummer van ${name}`;
  document.getElementById('setlistTrackSearch').value = '';
  document.getElementById('setlistTrackSearch').focus();
  closeAC('acSetlistTrackList');
}

// Stap B: nummer zoeken binnen geselecteerde artiest — lokaal filteren,
// zelfde cache (fetchArtistSongs) als bij het profiel-repertoire.
async function onSetlistTrackSearch(q) {
  const ac = document.getElementById('acSetlistTrackList');
  if (!selectedSetlistArtist) return;
  if (q.length < 1) { ac.classList.remove('open'); return; }

  ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted)">Zoeken...</span></div>';
  ac.classList.add('open');

  try {
    const songs = await fetchArtistSongs(selectedSetlistArtist.id);
    renderTrackResults(ac, songs, q, selectedSetlistArtist, 'addSetlistSong', setlistWantedSongs);
  } catch(e) {
    ac.innerHTML = '<div class="ac-item"><span style="color:var(--danger)">Zoekopdracht mislukt</span></div>';
  }
}

function resetSetlistSearch() {
  setlistWantedSongs = [];
  selectedSetlistArtist = null;
  document.getElementById('setlistArtistSearch').value = '';
  document.getElementById('setlistTrackSearch').value = '';
  document.getElementById('setlistTrackSearchWrap').style.display = 'none';
  document.getElementById('filterSetlistCity').value = '';
  document.getElementById('filterSetlistCityStatus').textContent = '';
  document.getElementById('filterSetlistRadius').value = 25;
  filterSetlistInstruments = [];
  if (PICKERS.filterSetlistInstruments) renderPickerBadges(PICKERS.filterSetlistInstruments);
  renderSetlistSongsList();
  document.getElementById('setlistSearchResults').innerHTML = '';
}

async function runSetlistSearch() {
  const seq = ++setlistSearchSeq; // TT-84: zie toelichting bij musicianSearchSeq
  const resultsEl = document.getElementById('setlistSearchResults');
  if (!setlistWantedSongs.length) { showToast('Voeg minimaal één nummer toe aan de setlist.'); return; }

  if (!resultsEl.innerHTML.trim()) {
    resultsEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--muted);">
      <div class="save-spinner" style="margin:0 auto 16px;"></div>Zoeken...
    </div>`;
  }

  try {
    const titles  = setlistWantedSongs.map(s => s.title);
    const artists = setlistWantedSongs.map(s => s.artist);
    const radius  = parseRadiusInput('filterSetlistRadius');

    // Repertoire-match en straal-match zijn onafhankelijk van elkaar —
    // tegelijk opvragen i.p.v. na elkaar (performance, 04-08-2026).
    const [songResult, radiusResult] = await Promise.all([
      db.rpc('tt_search_musicians_by_songlist_anon', { titles, artists }),
      (async () => {
        // Bugfix 05-08-2026 (gevonden door Ronald): het Plaats-veld werd
        // genegeerd zodra je een eigen profiel had — de straal werd dan
        // altijd vanaf je eigen postcode berekend, ook als je hier expliciet
        // een andere plaats had ingetypt (bijv. "Rotterdam" terwijl je eigen
        // profiel in Delft staat). Dat gaf verwarrende/onjuiste afstanden.
        // Nu: een ingevulde Plaats heeft altijd voorrang; eigen postcode is
        // alleen nog de fallback als het veld leeg is.
        const cityVal = document.getElementById('filterSetlistCity').value.trim();
        if (cityVal) {
          const origin = await resolveSearchOrigin(cityVal);
          if (origin.lat == null) return { data: null, error: null };
          return db.rpc('tt_search_musicians_anon', {
            origin_lat: origin.lat, origin_lng: origin.lng, radius_km: radius
          });
        }
        if (hasOwnProfile) {
          const mid = await getMyMusicianId();
          // TT-159 (27-08-2026, bugfix/aanname): deze aanroep miste
          // origin_lat/origin_lng — dezelfde tt_search_musicians-functie
          // krijgt die in runSearch() wél altijd mee (zie hierboven). Zonder
          // een expliciet getypte Plaats hier (cityVal leeg, anders was deze
          // tak niet bereikt) is er geen ander vertrekpunt dan de eigen
          // postcode van de zoeker — vandaar null/null, exact zoals
          // runSearch() dat doet via `usesOwnCity`.
          return db.rpc('tt_search_musicians', {
            searcher_id: mid, radius_km: radius,
            origin_lat: null, origin_lng: null
          });
        }
        return { data: null, error: null };
      })(),
    ]);

    if (songResult.error) throw songResult.error;
    if (seq !== setlistSearchSeq) return; // TT-84
    const songMatches = songResult.data || [];
    if (!songMatches.length) { renderSetlistResults([]); return; }
    const songMatchIds = new Set(songMatches.map(m => m.musician_id));

    // Straal toepassen om het zoekgebied te beperken: ingevulde Plaats heeft
    // voorrang (zie hierboven), anders eigen postcode (ingelogd) of geen
    // straalbeperking (uitgelogd zonder Plaats ingevuld).
    let distanceMap = {};
    let radiusIds = null; // null = geen straalbeperking (geen vertrekpunt bekend)

    if (radiusResult.error) throw radiusResult.error;
    if (radiusResult.data) {
      radiusIds = new Set(radiusResult.data.map(m => m.musician_id));
      radiusResult.data.forEach(m => { distanceMap[m.musician_id] = m.distance_km; });
    }

    let ids = Array.from(songMatchIds);
    if (radiusIds) ids = ids.filter(id => radiusIds.has(id));
    if (!ids.length) { renderSetlistResults([]); return; }

    let musicians;
    if (hasOwnProfile) {
      const { data, error } = await db.from('musicians').select(`
        id, fname, username, city, zip, profile_color, avatar_url, updated_at,
        musician_songs(song_title, song_artist, mastery_level),
        musician_instruments(instrument, niveau)
      `).in('id', ids);
      if (error) throw error;
      musicians = data;
    } else {
      const { data, error } = await db.rpc('tt_get_musicians_public', { ids });
      if (error) throw error;
      musicians = (data || []).map(m => ({
        id: m.id, username: m.username, city: m.city, // TT-43/TT-04: geen fname of postcode voor bezoekers
        profile_color: m.profile_color, avatar_url: m.avatar_url, updated_at: m.updated_at,
        musician_songs: m.songs || [],
        musician_instruments: (m.instrument_levels || []).map(x => ({ instrument: x.instrument, niveau: x.niveau })),
      }));
    }

    // TT-139: harde instrumentfilter, zelfde regel als bij Muzikanten/Bands
    // (TT-55) — maximaal 1 instrument + optioneel Zang, vóór de repertoire-
    // matching toepassen.
    if (filterSetlistInstruments.length) {
      musicians = musicians.filter(m => {
        const mInstr = (m.musician_instruments || []).map(x => x.instrument);
        return filterSetlistInstruments.some(i => mInstr.includes(i));
      });
    }

    // Per muzikant bepalen welke volgnummers uit de gezochte setlist matchen
    // (exacte titel+artiest, case-insensitive) en hoeveel er in totaal matchen.
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    musicians.forEach(m => {
      const own = (m.musician_songs || []).map(s => `${(s.song_title||'').toLowerCase()}|||${(s.song_artist||'').toLowerCase()}`);
      m.matchedNumbers = setlistWantedSongs
        .map((s, i) => own.includes(`${s.title.toLowerCase()}|||${s.artist.toLowerCase()}`) ? i + 1 : null)
        .filter(n => n !== null);
      m.matchCount = m.matchedNumbers.length;
      m.isStale = m.updated_at ? (new Date(m.updated_at) < sixMonthsAgo) : false;
      m.distance_km = distanceMap[m.id] != null ? distanceMap[m.id] : null;
      musicianDistanceCache[m.id] = m.distance_km;
    });

    // Hoe meer nummers matchen, hoe hoger in het resultaat; bij gelijke stand
    // dichtstbijzijnde eerst (indien bekend).
    const filtered = musicians.filter(m => m.matchCount > 0);
    filtered.sort((a, b) => {
      if (a.isStale !== b.isStale) return a.isStale ? 1 : -1;
      if (a.matchCount !== b.matchCount) return b.matchCount - a.matchCount;
      if (a.distance_km != null && b.distance_km != null && a.distance_km !== b.distance_km) {
        return a.distance_km - b.distance_km;
      }
      return (a.fname || '').localeCompare(b.fname || '', 'nl');
    });

    if (seq !== setlistSearchSeq) return; // TT-84: nieuwere zoekopdracht loopt al
    renderSetlistResults(filtered.slice(0, SEARCH_RESULT_LIMIT), { total: filtered.length });

  } catch(e) {
    if (seq !== setlistSearchSeq) return; // TT-84: fout van een verouderde zoekopdracht niet tonen
    resultsEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--danger);">Zoeken is niet gelukt: ${friendlyErrorMessage(e)}</div>`;
  }
}

function renderSetlistResults(musicians, opts) {
  opts = opts || {};
  const el = document.getElementById('setlistSearchResults');
  const total = opts.total != null ? opts.total : musicians.length;

  if (!total) {
    el.innerHTML = `
      <div class="no-results">
        <p style="font-size:16px;font-weight:600;margin-bottom:8px;">Geen muzikanten gevonden</p>
        <p style="font-size:13px;">Niemand in de Tent (binnen je zoekgebied) heeft (nog) een match met deze setlist.</p>
      </div>`;
    return;
  }
  const cappedNotice = total > musicians.length
    ? `<p style="font-size:12px;color:var(--muted);margin:0 0 12px;">Toont de eerste ${musicians.length} van ${total} resultaten — voeg meer nummers toe of verklein je zoekstraal voor een preciezer overzicht.</p>`
    : '';
  el.innerHTML = `
    <div class="results-header">
      <span class="results-count">${total} muzikant${total !== 1 ? 'en' : ''} gevonden</span>
    </div>
    ${cappedNotice}
    <div class="results-list">
      ${musicians.map(m => musicianSetlistRowHTML(m)).join('')}
    </div>`;
}

// Compact gehouden: volledige nummertitels zijn te veel info voor één regel
// (Ronald) — toont i.p.v. daarvan het aantal treffers + de volgnummers.
function musicianSetlistRowHTML(m) {
  const col = safeColor(m.profile_color, '#f5c518');
  const avatarSrc = safeUrl(m.avatar_url);
  const displayName = displayNameOf(m);
  const avatarHTML = avatarSrc ? `<img src="${avatarSrc}" alt="${escHtml(displayName)}">` : AVATAR_T_FALLBACK;
  const nameHTML = escHtml(displayName);
  const total = setlistWantedSongs.length;

  return `
    <div class="result-row" style="border-left-color:${col};" onclick="openMusicianModal('${jsAttr(m.id)}')">
      <div class="result-row-top">
        <div class="result-row-avatar" style="background:${col};">${avatarHTML}</div>
        <div class="result-row-main">
          <div class="result-row-name">${nameHTML}</div>
          <div class="result-row-meta">${escHtml(m.city || '')}${m.distance_km != null ? ` · ${m.distance_km.toFixed(1)} km` : ''}</div>
        </div>
        <div class="result-row-msg-btn" onclick="openRowMessageIcon(event,'${jsAttr(m.id)}','${jsAttr(displayName)}')">${MESSAGE_ICON_SVG}</div>
      </div>
      <div class="result-row-badges">
        ${tagSolid(`${m.matchCount}/${total} match${m.matchCount !== 1 ? 'es' : ''}: ${m.matchedNumbers.map(n => '#' + Number(n)).join(', ')}`, col)}
      </div>
    </div>`;
}

