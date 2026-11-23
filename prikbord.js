



const PB_DOELEN = [['jammen', 'Jammen'], ['band', 'Band'], ['invallen', 'Invallen'], ['projecten', 'Projecten']];
const PB_LEEFTIJDEN = ['13-15', '16-18', '19-24', '25-34', '35+'];
const PB_SPELER = {
  'Achtergrondzang': 'achtergrondzanger', 'Akoestische gitaar': 'gitarist', 'Basgitaar': 'bassist', 'Cello': 'cellist',
  'Conga / Bongo': 'percussionist', 'DJ / Electronica': 'DJ', 'Drums': 'drummer', 'Elektrische gitaar': 'gitarist',
  'Keyboard': 'toetsenist', 'Mondharmonica': 'mondharmonicaspeler', 'Percussie overig': 'percussionist', 'Piano': 'pianist',
  'Saxofoon': 'saxofonist', 'Songwriting': 'songwriter', 'Tamboerijn': 'percussionist', 'Trompet': 'trompettist',
  'Ukulele': 'ukulelespeler', 'Viool': 'violist', 'Zang': 'zanger'
};
const PB_VOLGORDE = [['nieuwste', 'Nieuwste'], ['score', 'Beste match'], ['afstand', 'Dichtstbijzijnde']];
const PB_STRAAL_STANDAARD = 25;
const PB_DAG = 24 * 3600 * 1000;

let pbTab = 'alle';
let pbLaag = null;
let pbLijst = [];
let pbOpen = null;
let pbMijn = [];
let pbFilters = { soort: '', doel: '', instrument: '', volgorde: 'nieuwste' };
let pbFiltersOpen = false;
let pbVolgnr = 0;
let pbForm = null;
let pbVanBand = null;
let pbVanBuiten = false;

function pbHoofd(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }


function pbSpelers(instrumenten, elk) {
  if (elk || !instrumenten || !instrumenten.length) return 'Muzikanten';
  const namen = [...new Set(instrumenten.map(i => PB_SPELER[i] || i.toLowerCase()))];
  if (namen.length === 1) return pbHoofd(namen[0]);
  return pbHoofd(namen.slice(0, -1).join(', ') + ' of ' + namen[namen.length - 1]);
}
function pbTitel(o) {
  const t = pbSpelers(o.instrumenten, o.elk_instrument) + ' ' + (o.soort === 'beschikbaar' ? 'beschikbaar' : 'gezocht');
  return o.toevoeging ? `${t}: ${o.toevoeging}` : t;
}

const PB_GEZAMENLIJK = 'Gezamenlijke nummers:';
function pbGedeeldTekst(o) {
  const n = o.gedeeld;
  return `${PB_GEZAMENLIJK} ${n}`;
}
function pbDoelNaam(d) { const r = PB_DOELEN.find(x => x[0] === d); return r ? r[1] : ''; }

function pbDatum(iso) {
  const d = new Date(iso);
  const opties = { day: 'numeric', month: 'long' };
  if (d.getFullYear() !== new Date().getFullYear()) opties.year = 'numeric';
  return d.toLocaleDateString('nl-NL', opties);
}
function pbDagenOver(o) { return Math.max(0, Math.ceil((new Date(o.loopt_tot) - Date.now()) / PB_DAG)); }
function pbLeeftijdTekst(o) {
  if (o.band_id) {
    if (o.leden_min == null) return '';
    return o.leden_min === o.leden_max ? `leden ${o.leden_min} jaar` : `leden ${o.leden_min}–${o.leden_max} jaar`;
  }
  return o.leeftijd != null ? `${o.leeftijd} jaar` : '';
}
function pbVoorWie(o) {
  const g = o.leeftijden || [];
  if (g.length === PB_LEEFTIJDEN.length) return 'Voor elke leeftijd';
  return 'Voor ' + g.map(x => x === '35+' ? '35+' : x).join(', ') + ' jaar';
}


const PB_MIJ = { instrumenten: [], genres: [], bands: [], leeftijd: null, naam: '', foto: '', plaats: '', voor: null };

async function pbMijLaden() {
  if (!currentUser || !hasOwnProfile) return;
  if (PB_MIJ.voor === currentUser.id) return;
  try {
    const mid = await getMyMusicianId();
    const [ik, instr, gen, geb, bands] = await Promise.all([
      db.from('musicians').select('weergavenaam, username, avatar_url, city').eq('id', mid).maybeSingle(),
      db.from('musician_instruments').select('instrument').eq('musician_id', mid),
      db.from('musician_genres').select('genre').eq('musician_id', mid),
      db.rpc('tt_get_my_birth_date'),
      db.from('bands').select('id, name, city, genres, soort, avatar_url, band_members(musician_id, status)').eq('founder_id', mid)
    ]);
    const leeftijd = d => { if (!d) return null; const g = new Date(d), n = new Date(); let a = n.getFullYear() - g.getFullYear(); if (n < new Date(n.getFullYear(), g.getMonth(), g.getDate())) a--; return a; };
    PB_MIJ.naam = ik.data ? (ik.data.weergavenaam || ik.data.username || '') : '';
    PB_MIJ.foto = ik.data ? ik.data.avatar_url : '';
    PB_MIJ.plaats = ik.data ? ik.data.city : '';
    PB_MIJ.instrumenten = (instr.data || []).map(x => x.instrument);
    PB_MIJ.genres = (gen.data || []).map(x => x.genre);
    PB_MIJ.leeftijd = leeftijd(geb.data);
    PB_MIJ.bands = bands.data || [];
    const leden = [...new Set(PB_MIJ.bands.flatMap(b => (b.band_members || []).filter(x => x.status === 'bevestigd').map(x => x.musician_id)))];
    if (leden.length) {
      const { data: ages } = await db.rpc('tt_musicians_ages', { ids: leden });
      const per = Object.fromEntries((ages || []).map(a => [a.id, a.age]));
      PB_MIJ.bands.forEach(b => {
        const l = (b.band_members || []).filter(x => x.status === 'bevestigd').map(x => per[x.musician_id]).filter(x => x != null);
        b.leden_min = l.length ? Math.min(...l) : null; b.leden_max = l.length ? Math.max(...l) : null;
      });
    }
    PB_MIJ.voor = currentUser.id;
  } catch (e) { logCaught('pbMijLaden', e); }
}


function openPrikbord(tab) {
  openZoekScherm('prikbord', { geenZoek: true });
  pbMijLaden().then(() => { if (pbTab === 'alle' && !pbLaag) pbTekenLijst(); });
  pbZetTab(tab || 'alle');
}

function pbZetTab(tab) {
  pbTab = tab;
  pbLaag = null;
  pbVanBuiten = false;
  ['mijn', 'reacties'].forEach(t => {
    const b = document.getElementById('pbTab-' + t);
    if (b) { b.classList.toggle('active', t === tab); b.setAttribute('aria-pressed', t === tab ? 'true' : 'false'); }
  });
  pbToonLaag();
  if (tab === 'alle') { pbInitFilters(); pbOnthoudHerstellen().finally(pbLaden); }
  if (tab === 'mijn') pbMijnLaden();
  if (tab === 'reacties') pbReactiesLaden();
}

function pbToonLaag() {
  const vakken = { lijst: !pbLaag, oproep: pbLaag === 'oproep', plaatsen: pbLaag === 'plaatsen' || pbLaag === 'voorbeeld' };
  const el = id => document.getElementById(id);
  el('pbLijstScherm').style.display = vakken.lijst ? 'block' : 'none';
  el('pbOproepScherm').style.display = vakken.oproep ? 'block' : 'none';
  el('pbPlaatsenScherm').style.display = vakken.plaatsen ? 'block' : 'none';
  el('pbFormVak').style.display = pbLaag === 'plaatsen' ? 'block' : 'none';
  el('pbVoorbeeldVak').style.display = pbLaag === 'voorbeeld' ? 'block' : 'none';
  ['pbAlleVak', 'pbMijnVak', 'pbReactiesVak'].forEach((id, i) => {
    el(id).style.display = ['alle', 'mijn', 'reacties'][i] === pbTab ? 'block' : 'none';
  });
  if (typeof werkTerugKnopBij === 'function') werkTerugKnopBij();
  window.scrollTo({ top: 0, behavior: 'instant' });
}



function pbWissel(tab) { pbZetTab(pbTab === tab ? 'alle' : tab); }


function pbTerug() {
  if (pbLaag === 'voorbeeld') { pbLaag = 'plaatsen'; pbToonLaag(); return true; }
  if (pbLaag === 'plaatsen') {
    const dicht = () => {
      pbLaag = null; pbVanBand = null;
      if (pbVanBuiten) { pbVanBuiten = false; zoekSchermTerug(); return; }
      pbToonLaag();
    };
    if (pbFormHeeftInvoer()) {
      vraagOpslaanBijTerug('Oproep plaatsen?', 'Plaatsen', 'Niet plaatsen', () => pbNaarVoorbeeld(), dicht);
      return true;
    }
    if (pbVanBuiten) { pbVanBuiten = false; pbLaag = null; pbVanBand = null; return false; }
    dicht(); return true;
  }
  if (pbLaag === 'oproep') {
    if (pbVanBuiten) { pbVanBuiten = false; pbLaag = null; return false; }
    pbLaag = null; pbToonLaag(); return true;
  }
  return false;
}


function pbInitFilters() {
  if (CHOICE_FIELDS.pbStraal) return;
  initWheelField({
    id: 'pbStraal', fieldId: 'pbStraalField', menuId: 'pbStraalMenu', inputs: ['pbStraal'],
    rijen: STRAAL_RIJEN, value: [PB_STRAAL_STANDAARD], clearTo: [PB_STRAAL_STANDAARD],
    isActief: (v) => Number(v[0]) !== PB_STRAAL_STANDAARD, format: (v) => `${v[0]} km`, onChange: pbLaden
  });
  const keuze = (id, rijen, sleutel) => initChoiceField({
    id, fieldId: id + 'Field', menuId: id + 'Menu',
    rijen: () => rijen.map(([w, t]) => ({ t, gekozen: pbFilters[sleutel] === w })),
    kies: (i) => { const w = rijen[i][0]; pbFilters[sleutel] = pbFilters[sleutel] === w && sleutel !== 'volgorde' ? '' : w; pbFiltersBijwerken(); },
    ververs: () => {
      const r = rijen.find(x => x[0] === pbFilters[sleutel]);
      const el = document.getElementById(id + 'Field');
      zetVeldTekst(el.querySelector('.wheel-field-label'), r ? r[1] : LEEG_VELD);
      el.classList.toggle('is-set', !!pbFilters[sleutel] && sleutel !== 'volgorde');
    }
  });
  keuze('pbSoort', [['gezocht', 'Gezocht'], ['beschikbaar', 'Beschikbaar']], 'soort');
  keuze('pbDoel', PB_DOELEN, 'doel');
  keuze('pbInstrument', INSTRUMENTS.map(i => [i, i]), 'instrument');
  keuze('pbVolgorde', PB_VOLGORDE, 'volgorde');
}

function pbFiltersBijwerken() {
  ['pbSoort', 'pbDoel', 'pbInstrument', 'pbVolgorde'].forEach(refreshChoiceField);
  const n = ['soort', 'doel', 'instrument'].filter(k => pbFilters[k]).length;
  document.getElementById('pbFiltersTekst').textContent = n ? `Filters (${n})` : 'Filters';
  pbTekenLijst();
  pbOnthoudBijwerken();
}

function togglePbFilters() {
  pbFiltersOpen = !pbFiltersOpen;
  document.getElementById('pbFilterVak').hidden = !pbFiltersOpen;
  const k = document.getElementById('pbFiltersKnop');
  k.setAttribute('aria-expanded', pbFiltersOpen ? 'true' : 'false');
  k.classList.toggle('open', pbFiltersOpen);
}

function pbWissen() {
  pbFilters = { soort: '', doel: '', instrument: '', volgorde: pbFilters.volgorde };
  pbFiltersBijwerken();
}

async function pbLaden() {
  const nr = ++pbVolgnr;
  const vak = document.getElementById('pbResultaat');
  if (!pbLijst.length) ladenTonen(vak);
  try {
    const plaats = document.getElementById('pbPlaats').value;
    const vertrek = await zoekVertrekpunt(plaats);
    const straal = Number(document.getElementById('pbStraal').value) || PB_STRAAL_STANDAARD;
    const { data, error } = await db.rpc('tt_prikbord', { p_lat: vertrek.lat, p_lng: vertrek.lng, p_straal_km: straal });
    if (nr !== pbVolgnr) return;
    if (error) throw error;
    pbVertrek = Object.assign({ tekst: plaats }, vertrek);
    pbLijst = data || [];
    pbTekenLijst();
    pbOnthoudBijwerken();
  } catch (e) {
    if (nr !== pbVolgnr) return;
    logCaught('pbLaden', e);
    vak.innerHTML = foutStaatHTML(e, 'het prikbord laden', 'pbLaden()');
  }
}

let pbPlaatsTimer = null;
function pbPlaatsInvoer() { clearTimeout(pbPlaatsTimer); pbPlaatsTimer = setTimeout(pbLaden, 500); }


function pbPastBijMij(o) {
  const mijn = (PB_MIJ.instrumenten || []);
  if (o.soort === 'gezocht') return o.elk_instrument || (o.instrumenten || []).some(i => mijn.includes(i));
  return false;
}

function pbGefilterd() {
  const f = pbFilters;
  let rijen = pbLijst.filter(o =>
    (!f.soort || o.soort === f.soort) && (!f.doel || o.doel === f.doel)
    && (!f.instrument || o.elk_instrument || (o.instrumenten || []).includes(f.instrument)));
  const nieuw = o => new Date(o.verlengd_op || o.geplaatst_op).getTime();
  const km = o => o.km == null ? Infinity : Number(o.km);
  if (f.volgorde === 'afstand') rijen.sort((a, b) => km(a) - km(b) || nieuw(b) - nieuw(a));
  else if (f.volgorde === 'score') rijen.sort((a, b) =>
    Math.floor(km(a) / 5) - Math.floor(km(b) / 5) || (pbPastBijMij(b) - pbPastBijMij(a)) || nieuw(b) - nieuw(a));
  else rijen.sort((a, b) => nieuw(b) - nieuw(a));
  return rijen;
}

function pbRijHTML(o) {




  const metaRegel = [pbDoelNaam(o.doel), (o.genres || [])[0], o.naam, pbLeeftijdTekst(o), afstandTekst(o.km)].filter(Boolean).map(escHtml).join(' · ');
  const gedeeld = o.gedeeld && !o.eigen ? `<div class="pb-rij-gedeeld">${escHtml(pbGedeeldTekst(o))}</div>` : '';
  return `
    <div class="result-row pb-rij" onclick="pbOpenOproep('${jsAttr(o.id)}')">
      <div class="result-row-top">
        <div class="result-row-avatar${o.band_id ? ' result-vierkant' : ''}">${fotoHTML(o.foto, o.naam) || ZONDER_FOTO_HTML}</div>
        <div class="result-row-main">
          <div class="result-row-name"><span class="result-row-naam">${escHtml(pbTitel(o))}</span></div>
          <div class="result-row-meta">${metaRegel}</div>
          ${gedeeld}
        </div>
      </div>
    </div>`;
}

function pbTekenLijst() {
  const vak = document.getElementById('pbResultaat');
  if (!vak) return;
  const rijen = pbGefilterd();
  if (!rijen.length) {
    const metFilters = ['soort', 'doel', 'instrument'].some(k => pbFilters[k]);
    vak.innerHTML = metFilters
      ? emptyStateHTML('Geen oproepen met deze filters', 'Zet een filter uit of vergroot je straal.')
      : emptyStateHTML('Nog geen oproepen bij jou in de buurt', 'Plaats de eerste: wie zoek je, of waarvoor ben je beschikbaar?', 'Oproep plaatsen', 'pbPlaatsenStart()');
    return;
  }
  vak.innerHTML = `<div class="results-header"><span class="results-count">${rijen.length === 1 ? '1 oproep' : rijen.length + ' oproepen'}</span></div>`
    + `<div class="results-list">${rijen.map(pbRijHTML).join('')}</div>`;
}


function pbOpenOproep(id) {
  const o = pbLijst.find(x => x.id === id) || (pbMijn.find(x => x.oproep.id === id) || {}).oproep;
  if (!o) return;
  pbOpen = o;
  pbLaag = 'oproep';
  document.getElementById('pbOproepInhoud').innerHTML = pbOproepHTML(o, false);
  pbToonLaag();
}

function pbOproepHTML(o, voorbeeld) {
  const wie = [o.naam, pbLeeftijdTekst(o), o.plaats, voorbeeld ? '' : afstandTekst(o.km)].filter(Boolean).map(escHtml).join(' · ');
  const doelRegel = [pbDoelNaam(o.doel), ...(o.genres || []).slice(0, 2)].filter(Boolean).map(escHtml).join(' · ');
  const datum = o.verlengd_op ? `Verlengd tot ${pbDatum(o.loopt_tot)}` : `Geplaatst op ${pbDatum(o.geplaatst_op || new Date().toISOString())}`;
  const feiten = [
    ['Leeftijd', escHtml(pbVoorWie(o))]
  ];
  if (o.band_id && o.band_soort) feiten.push(['Muziek', escHtml({ eigen: 'Eigen nummers', covers: 'Coverband', beide: 'Eigen nummers en covers' }[o.band_soort] || '')]);
  let knop = '';
  if (!voorbeeld) {
    if (o.eigen) knop = `<button type="button" class="btn btn-ghost pb-knop" onclick="pbOpenMijn('${jsAttr(o.id)}')">Bekijk de reacties</button>`;
    else if (!currentUser || !hasOwnProfile) knop = `<button type="button" class="btn btn-primary pb-knop" onclick="pbZonderProfiel()">Maak een profiel en reageer</button>`;
    else if (o.soort === 'beschikbaar') knop = `<button type="button" class="btn btn-primary pb-knop" data-bericht-id="${escHtml(o.plaatser_id)}" onclick="openMessageComposer('${jsAttr(o.plaatser_id)}','${jsAttr(o.naam)}')">Stuur een bericht</button>`;
    else if (o.gereageerd) knop = `<button type="button" class="btn btn-primary pb-knop" disabled>Je hebt gereageerd</button>`;
    else knop = `<button type="button" class="btn btn-primary pb-knop" id="pbIkDoeMeeKnop" onclick="pbReagerenOpen()">Ik doe mee</button>`;
  }
  return `
    <div class="pb-oproep">
      <div class="pb-oproep-kop" ${voorbeeld ? '' : `onclick="${o.band_id ? `openBandScherm('${jsAttr(o.band_id)}')` : `openProfielScherm('${jsAttr(o.plaatser_id)}')`}"`}>
        <div class="result-row-avatar pb-oproep-foto${o.band_id ? ' result-vierkant' : ''}">${fotoHTML(o.foto, o.naam) || ZONDER_FOTO_HTML}</div>
        <div class="pb-oproep-wie">
          <div class="pb-oproep-titel">${escHtml(pbTitel(o))}</div>
          <div class="result-row-meta">${doelRegel}</div>
          <div class="result-row-meta">${wie}</div>
        </div>
      </div>
      <p class="pb-oproep-tekst">${escHtml(o.tekst || '')}</p>
      <dl class="pb-feiten">${feiten.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      ${o.gedeeld && !o.eigen ? `<p class="pb-oproep-gedeeld">${escHtml(pbGedeeldTekst(o))}</p>` : ''}
      ${o.media_gewenst && o.soort === 'gezocht' ? '<p class="pb-oproep-media">Graag met een video of link.</p>' : ''}
      <p class="pb-oproep-datum">${datum}</p>
      ${knop}
    </div>`;
}


async function pbOpenBandOproep(bandId, instrument) {
  try {
    const { data: id, error } = await db.rpc('tt_band_oproep', { p_band: bandId, p_instrument: instrument });
    if (error) throw error;
    if (!id) { openBandScherm(bandId); return; }
    const { data, error: e2 } = await db.rpc('tt_prikbord', { p_lat: null, p_lng: null, p_straal_km: 100, p_id: id });
    if (e2) throw e2;
    if (!data || !data.length) { openBandScherm(bandId); return; }
    pbOpenVanBuiten(data[0]);
  } catch (e) {
    logCaught('pbOpenBandOproep', e);
    openBandScherm(bandId);
  }
}


function pbOpenVanBuiten(o) {
  pbLijst = pbLijst.filter(x => x.id !== o.id).concat(o);
  if (huidigeView !== 'search') showView('search', 'behoud');
  openZoekScherm('prikbord', { geenZoek: true, direct: true });
  pbTab = 'alle';
  pbMijLaden();
  pbOpenOproep(o.id);
  pbVanBuiten = true;
}

function pbZonderProfiel() {
  if (!currentUser) { showView('register'); return; }
  showView('register');
}


async function pbReagerenOpen() {
  const o = pbOpen;
  if (!o) return;
  const vak = document.getElementById('pbReagerenInhoud');
  document.getElementById('pbReagerenKop').textContent = 'Reageren op ' + pbTitel(o);
  document.getElementById('pbBoodschap').value = '';
  vak.innerHTML = '';
  ladenTonen(vak);
  document.getElementById('pbReagerenModal').classList.add('visible');
  syncModalScrollLock();
  try {
    const mid = await getMyMusicianId();
    await pbMijLaden();
    const { data: media } = await db.from('musician_media').select('media_type').eq('musician_id', mid).in('media_type', ['video', 'link']).limit(1);
    const heeftMedia = !!(media && media.length);
    const naam = o.band_id ? o.naam : (o.naam || '');
    vak.innerHTML = `
      <p class="pb-reageren-uitleg">${escHtml(naam)} ziet je profiel: je niveau, je video's en links${o.gedeeld ? ' en jullie gezamenlijke nummers' : ''}.</p>
      ${pbEersteAfspraakTonen() ? `
        <div class="melding pb-afspraak-melding">
          <div class="melding-kop">De eerste afspraak</div>
          <div class="melding-tekst">${escHtml(PB_TIPS.eersteAfspraak)}</div>
        </div>` : ''}
      ${o.media_gewenst && !heeftMedia ? `
        <div class="melding pb-media-melding">
          <div class="melding-kop">${escHtml(naam)} ziet graag een video of link</div>
          <div class="melding-tekst">Je kunt ook zonder reageren.</div>
          <div class="knoppen-stapel"><button type="button" class="btn btn-ghost" onclick="pbMediaToevoegen()">Video of link toevoegen</button></div>
        </div>` : ''}`;
  } catch (e) {
    logCaught('pbReagerenOpen', e);
    vak.innerHTML = '';
  }
}
function pbReagerenSluiten() { document.getElementById('pbReagerenModal').classList.remove('visible'); syncModalScrollLock(); }
function pbMediaToevoegen() { pbReagerenSluiten(); if (typeof openTegelScreenVanuit === 'function') openTegelScreenVanuit('mediahoek'); else showView('profieltegels'); }

async function pbReagerenVersturen() {
  const o = pbOpen;
  const tekst = document.getElementById('pbBoodschap').value;
  const { error } = await db.rpc('tt_oproep_reageren', { p_oproep: o.id, p_boodschap: tekst });
  if (error) { showToast(friendlyErrorMessage(error, 'je reactie versturen')); return; }
  pbReagerenSluiten();
  o.gereageerd = true;
  document.getElementById('pbOproepInhoud').innerHTML = pbOproepHTML(o, false);
  showToast('Je reactie is verstuurd.');
}


const PB_TIPS = {
  gezocht: {
    intro: 'Zorg dat meteen duidelijk is wie jullie zijn en wie jullie zoeken.',
    punten: [
      ['Wie zijn jullie?', 'Welke muziek maken jullie? Wie zitten er in de band? Noem ook een paar bands die jullie inspireren.'],
      ['Wie zoeken jullie?', 'Welk instrument zoek je? Welk niveau of welke ervaring is nodig?'],
      ['Wat zijn jullie plannen?', 'Willen jullie eigen muziek maken, optreden of vooral samen spelen? Vertel ook hoe serieus jullie het aanpakken.'],
      ['Hoe vaak repeteren jullie?', 'Waar en wanneer repeteren jullie? Zijn er kosten of andere praktische afspraken?'],
      ['Laat zien wie jullie zijn!', 'Is jullie band relaxed, gezellig of juist ambitieus? Schrijf zoals jullie zijn en maak de oproep persoonlijk.']
    ],
    reageren: 'Zet een demo of opname in Je mediahoek of bij Onze media. Hou het contact eerst via de app; later kun je alsnog je e-mailadres of telefoonnummer doorgeven.'
  },
  beschikbaar: {
    intro: 'Zorg dat meteen duidelijk is wie je bent en wat je zoekt.',
    punten: [
      ['Wie ben je?', 'Wat speel je, en hoe lang al? Welke muziek maak je graag? Noem ook een paar bands die je inspireren.'],
      ['Wat zoek je?', 'Een band, samen jammen, invallen of een project? Eigen nummers of covers?'],
      ['Wat zijn je plannen?', 'Wil je optreden, eigen muziek maken of vooral samen spelen? Vertel ook hoe serieus je het aanpakt.'],
      ['Wanneer kun je?', 'Hoe vaak en op welke dagen kun je repeteren? Hoe ver wil je reizen?'],
      ['Laat zien wie je bent!', 'Schrijf zoals je bent en maak de oproep persoonlijk.']
    ],
    reageren: 'Zet een demo of opname in Je mediahoek. Hou het contact eerst via de app; later kun je alsnog je e-mailadres of telefoonnummer doorgeven.'
  },

  eersteAfspraak: 'Ken je elkaar nog niet? Spreek dan af op een plek waar ook anderen zijn, zoals een oefenruimte of muziekschool.',
  slot: 'Wees duidelijk en concreet. Hoe beter iemand weet waar die bij aansluit, hoe groter de kans op een goede match!'
};

function pbEersteAfspraakTonen() { return PB_MIJ.leeftijd != null && PB_MIJ.leeftijd <= 21; }
function pbTipsOpen() {
  const t = PB_TIPS[(pbForm && pbForm.soort) || 'gezocht'];
  document.getElementById('pbTipsInhoud').innerHTML = `
    <h2 class="hoofdstuk-kop">Zo schrijf je een goede oproep</h2>
    <p class="pb-tips-intro">${escHtml(t.intro)}</p>
    <ol class="pb-tips">${t.punten.map(([k, u]) => `<li><strong>${escHtml(k)}</strong> ${escHtml(u)}</li>`).join('')}</ol>
    <p class="pb-tips-intro"><strong>Maak reageren makkelijk!</strong> ${escHtml(t.reageren)}</p>
    ${pbEersteAfspraakTonen() ? `<p class="pb-tips-intro"><strong>De eerste afspraak.</strong> ${escHtml(PB_TIPS.eersteAfspraak)}</p>` : ''}
    <p class="pb-tips-intro">${escHtml(PB_TIPS.slot)}</p>`;
  document.getElementById('pbTipsModal').classList.add('visible');
  syncModalScrollLock();
}
function pbTipsSluiten() { document.getElementById('pbTipsModal').classList.remove('visible'); syncModalScrollLock(); }


function pbLegeForm() {
  return { wie: 'ik', soort: 'gezocht', doel: '', instrumenten: [], elk: false,
           leeftijden: [], plaats: '', straal: PB_STRAAL_STANDAARD, tekst: '', media: false };
}

async function pbPlaatsenStart(vanBand) {
  if (!currentUser || !hasOwnProfile) { pbZonderProfiel(); return; }
  await pbMijLaden();
  pbForm = pbLegeForm();
  pbVanBand = vanBand || null;
  if (pbVanBand) { pbForm.wie = pbVanBand.band_id; pbForm.doel = 'band'; pbForm.instrumenten = pbVanBand.instrumenten.slice(); }
  pbLaag = 'plaatsen';
  pbTekenForm();
  pbToonLaag();
  veldGroeit(document.getElementById('pbTekst'));
}

function pbFormHeeftInvoer() {
  if (!pbForm) return false;
  return !!(pbForm.leeftijden.length || (pbForm.tekst.trim() && !pbIsLeidraad(pbForm.tekst)) || (!pbVanBand && (pbForm.doel || pbForm.instrumenten.length)));
}

function pbKnoppen(naam, keuzes, huidig, uit) {
  return `<div class="segmented-control pb-keuzes" data-naam="${naam}">` + keuzes.map(([w, t]) =>
    `<button type="button" class="segmented-btn${huidig === w ? ' selected' : ''}" ${uit && uit(w) ? 'disabled aria-disabled="true"' : ''} onclick="pbKies('${naam}','${jsAttr(w)}')">${escHtml(t)}</button>`).join('') + '</div>';
}

function pbBeheerdeBands() { return (PB_MIJ.bands || []); }



const PB_LEIDRAAD = {
  gezocht: ['Wie zijn jullie? (muziek, bandleden, inspiratie)', 'Wie zoeken jullie? (instrument, niveau, ervaring)',
    'Wat zijn jullie plannen? (eigen muziek, optreden, samen spelen)', 'Hoe vaak en waar repeteren jullie?',
    'Hoe zijn jullie? (relaxed, gezellig of ambitieus)'],
  beschikbaar: ['Wie ben je? (wat je speelt, hoe lang al, inspiratie)', 'Wat zoek je? (band, jammen, invallen, project)',
    'Wat zijn je plannen? (eigen muziek, optreden, samen spelen)', 'Wanneer kun je repeteren, en hoe ver wil je reizen?',
    'Hoe ben je? (relaxed, gezellig of ambitieus)']
};
function pbLeidraadTekst(soort) { return PB_LEIDRAAD[soort].join('\n\n\n') + '\n'; }
function pbIsLeidraad(t) {
  const schoon = x => x.replace(/\s+/g, ' ').trim();
  return ['gezocht', 'beschikbaar'].some(k => schoon(t) === schoon(pbLeidraadTekst(k)));
}







const PB_VANAF_19 = ['19-24', '25-34', '35+'];
function pbMijnLeeftijd() { return PB_MIJ.leeftijd == null ? 99 : PB_MIJ.leeftijd; }
function pbLeeftijdenVoorOpslaan(f) {
  const g = f.leeftijden.slice();
  if (g.length && pbMijnLeeftijd() >= 19 && !g.some(x => PB_VANAF_19.includes(x))) g.push(...PB_VANAF_19);
  return PB_LEEFTIJDEN.filter(x => g.includes(x));
}
function pbGroepen() {
  const l = pbMijnLeeftijd();
  if (l < 16) return ['13-15', '16-18'];
  return l >= 19 ? PB_LEEFTIJDEN.filter(g => g !== '13-15') : PB_LEEFTIJDEN.slice();
}

function pbKeuzeveldHTML(id, label, veldId) {
  return `<div class="field" id="${veldId}"><label>${label}</label><div class="menu-anchor">
    <div class="wheel-field" id="${id}Field" aria-label="${label}"><span class="wheel-field-label"></span></div>
    <div class="choice-menu menu-breed" id="${id}Menu" role="listbox" aria-label="${label}"></div></div></div>`;
}

function pbTekenForm() {
  const f = pbForm;
  if (!f.tekst.trim() || pbIsLeidraad(f.tekst)) f.tekst = pbLeidraadTekst(f.soort);
  const bands = pbBeheerdeBands();
  const band = f.wie !== 'ik';
  const html = `
    ${bands.length ? `<div class="field"><label>Wie plaatst?</label>${pbKnoppen('wie', [['ik', 'Ik'], ...bands.map(b => [b.id, b.name])], f.wie)}</div>` : ''}
    <div class="field">${pbKnoppen('soort', [['gezocht', 'Muzikant gezocht'], ['beschikbaar', 'Muzikant beschikbaar']], f.soort, w => band && w === 'beschikbaar')}</div>
    ${pbKeuzeveldHTML('pbFDoel', 'Waarvoor?', 'pbVeldDoel')}
    ${pbKeuzeveldHTML('pbFInstrument', 'Instrument', 'pbVeldInstrument')}
    ${pbKeuzeveldHTML('pbFLeeftijden', 'Leeftijden die je oproep zien', 'pbVeldLeeftijden')}
    <div class="field"><label for="pbToevoeging">Toevoeging aan de kop (niet verplicht)</label>
      <input type="text" id="pbToevoeging" maxlength="40" value="${escHtml(f.toevoeging || '')}" placeholder="Bijv. thrash en prog metal" oninput="pbForm.toevoeging=this.value"></div>
    <div class="field" id="pbVeldTekst"><label for="pbTekst" class="label-with-info label-info-naast">Tekst <button type="button" class="niveau-info-btn" onclick="pbTipsOpen()" title="Zo schrijf je een goede oproep" aria-label="Zo schrijf je een goede oproep">i</button></label>
      <textarea id="pbTekst" class="bio-voorbeeld" maxlength="2000" rows="3" oninput="pbForm.tekst=this.value; veldGroeit(this); clearFieldError(this); updateCharCounter('pbTekst','pbTekstTeller',2000)"
        placeholder="${f.soort === 'beschikbaar' ? 'Bijv. Ik drum sinds twee jaar en zoek een band die op zaterdag repeteert.' : 'Bijv. We jammen op donderdagavond in Den Haag en zoeken een drummer die van funk houdt.'}">${escHtml(f.tekst)}</textarea>
      <div class="teken-teller" id="pbTekstTeller"></div></div>
    <div class="field"><label class="zoek-onthoud${f.soort === 'beschikbaar' ? ' pb-uit' : ''}"><input type="checkbox" id="pbMedia" ${f.media ? 'checked' : ''} ${f.soort === 'beschikbaar' ? 'disabled' : ''} onchange="pbForm.media=this.checked"><span>Graag met een video of link</span></label></div>
    <button type="button" class="btn btn-primary pb-knop" onclick="pbNaarVoorbeeld()">Oproep plaatsen</button>`;
  document.getElementById('pbFormInhoud').innerHTML = html;
  pbFormVelden();
  const ta = document.getElementById('pbTekst');
  if (ta) veldGroeit(ta);
}

function pbFormVelden() {
  const f = pbForm;
  const instrKeuzes = () => (f.soort === 'beschikbaar' ? PB_MIJ.instrumenten : ['Elk instrument'].concat(INSTRUMENTS));
  const veld = (id, tekst) => {
    const el = document.getElementById(id + 'Field');
    if (!el) return;
    el.ttKeuzeVeld = null;
    return el;
  };
  ['pbFDoel', 'pbFInstrument', 'pbFLeeftijden'].forEach(veld);
  initChoiceField({
    id: 'pbFDoel', fieldId: 'pbFDoelField', menuId: 'pbFDoelMenu',
    rijen: () => PB_DOELEN.map(([w, t]) => ({ t, gekozen: f.doel === w })),
    kies: (i) => { f.doel = PB_DOELEN[i][0]; refreshChoiceField('pbFDoel'); clearFieldError(document.getElementById('pbFDoelField')); },
    ververs: () => pbVeldTekst('pbFDoel', f.doel ? pbDoelNaam(f.doel) : '', 'Kies waarvoor')
  });
  initChoiceField({
    id: 'pbFInstrument', fieldId: 'pbFInstrumentField', menuId: 'pbFInstrumentMenu', meer: true,
    rijen: () => instrKeuzes().map(t => ({ t, gekozen: t === 'Elk instrument' ? f.elk : f.instrumenten.includes(t) })),
    kies: (i) => { pbKiesInstrument(instrKeuzes()[i]); },
    ververs: () => pbVeldTekst('pbFInstrument', f.elk ? 'Elk instrument' : f.instrumenten.join(', '), 'Kies een instrument')
  });

  const groepen = pbGroepen();
  f.leeftijden = f.leeftijden.filter(g => groepen.includes(g));
  initChoiceField({
    id: 'pbFLeeftijden', fieldId: 'pbFLeeftijdenField', menuId: 'pbFLeeftijdenMenu', meer: true,
    rijen: () => groepen.map(g => ({ t: g + ' jaar', gekozen: f.leeftijden.includes(g) })),
    kies: (i) => { pbKiesLeeftijd(groepen[i]); },
    ververs: () => pbVeldTekst('pbFLeeftijden', PB_LEEFTIJDEN.filter(g => f.leeftijden.includes(g)).join(', ') + (f.leeftijden.length ? ' jaar' : ''), 'Kies leeftijden')
  });
}

function pbVeldTekst(id, tekst, leeg) {
  const el = document.getElementById(id + 'Field');
  if (!el) return;
  const l = el.querySelector('.wheel-field-label');
  l.textContent = tekst || leeg;
  l.classList.toggle('leeg', !tekst);
}

function pbKies(naam, w) {
  const f = pbForm;
  if (naam === 'wie') { f.wie = w; if (w !== 'ik') { f.soort = 'gezocht'; } }
  if (naam === 'soort') { f.soort = w; f.instrumenten = []; f.elk = false; if (w === 'beschikbaar') f.media = false; }
  if (naam === 'doel') f.doel = w;
  const y = window.scrollY;
  pbTekenForm();
  window.scrollTo({ top: y, behavior: 'instant' });
}
function pbKiesInstrument(w) {
  const f = pbForm;
  if (w === 'Elk instrument') { f.elk = !f.elk; if (f.elk) f.instrumenten = []; }
  else { f.elk = false; f.instrumenten = f.instrumenten.includes(w) ? f.instrumenten.filter(x => x !== w) : f.instrumenten.concat(w); }
  refreshChoiceField('pbFInstrument');
  clearFieldError(document.getElementById('pbFInstrumentField'));
}
function pbKiesLeeftijd(g) {
  const f = pbForm;
  f.leeftijden = f.leeftijden.includes(g) ? f.leeftijden.filter(x => x !== g) : f.leeftijden.concat(g);
  refreshChoiceField('pbFLeeftijden');
  clearFieldError(document.getElementById('pbFLeeftijdenField'));
}

function pbFormFouten() {
  const f = pbForm;
  const fouten = [];
  if (!f.doel) fouten.push(['pbFDoelField', 'Kies waarvoor']);
  if (!f.elk && !f.instrumenten.length) fouten.push(['pbFInstrumentField', 'Kies een instrument']);
  if (!f.leeftijden.length) fouten.push(['pbFLeeftijdenField', 'Kies minstens één leeftijd']);
  if (!f.tekst.trim() || pbIsLeidraad(f.tekst)) fouten.push(['pbTekst', 'Schrijf je eigen tekst bij de punten']);
  return fouten;
}

function pbVoorbeeldOproep() {
  const f = pbForm;
  const band = f.wie !== 'ik' ? pbBeheerdeBands().find(b => b.id === f.wie) : null;
  return {
    soort: f.soort, doel: f.doel, instrumenten: f.instrumenten, elk_instrument: f.elk,
    leeftijden: pbLeeftijdenVoorOpslaan(f), tekst: f.tekst.trim(), toevoeging: (f.toevoeging || '').trim(), media_gewenst: f.media, geplaatst_op: new Date().toISOString(),
    band_id: band ? band.id : null, naam: band ? band.name : (PB_MIJ.naam || ''), foto: band ? band.avatar_url : PB_MIJ.foto,
    leeftijd: band ? null : PB_MIJ.leeftijd, leden_min: band ? band.leden_min : null, leden_max: band ? band.leden_max : null,
    plaats: band ? band.city : PB_MIJ.plaats, genres: band ? band.genres : (PB_MIJ.genres || []), band_soort: band ? band.soort : null
  };
}

function pbNaarVoorbeeld() {
  const fouten = pbFormFouten();
  if (fouten.length) {
    fouten.forEach(([id, t]) => setFieldError(document.getElementById(id), t));
    document.getElementById(fouten[0][0]).scrollIntoView({ block: 'center' });
    return;
  }
  document.getElementById('pbVoorbeeldInhoud').innerHTML = pbOproepHTML(pbVoorbeeldOproep(), true);
  pbLaag = 'voorbeeld';
  pbToonLaag();
}

async function pbPlaatsen() {
  const f = pbForm;
  const p = {
    soort: f.soort, doel: f.doel, instrumenten: f.instrumenten, elk_instrument: f.elk,
    leeftijden: pbLeeftijdenVoorOpslaan(f), tekst: f.tekst.trim(), toevoeging: (f.toevoeging || '').trim(), media_gewenst: f.media, straal_km: f.straal
  };
  if (f.wie !== 'ik') p.band_id = f.wie;


  if (f.id) p.id = f.id;
  const { error } = await db.rpc('tt_oproep_opslaan', { p });
  if (error) { showToast(friendlyErrorMessage(error, 'je oproep plaatsen')); return; }
  pbForm = null; pbVanBand = null;
  showToast('Je oproep staat op het prikbord.');
  pbZetTab('mijn');
}


function pbVraagOproepVoorRol(bandId, instrumenten) {
  const band = (PB_MIJ.bands || []).find(b => b.id === bandId);
  const naam = band ? band.name : 'jullie band';
  const wie = pbSpelers(instrumenten, false).toLowerCase();
  showConfirm(`Dan zien muzikanten bij jou in de buurt dat ${naam} een ${wie} zoekt, en kunnen ze reageren.`, () => {
    showView('search', 'behoud');
    openZoekScherm('prikbord', { geenZoek: true, direct: true });
    pbPlaatsenStart({ band_id: bandId, instrumenten }).then(() => { pbVanBuiten = true; });
  }, 'Oproep plaatsen', false, 'Nee, dank je', 'Ook een oproep op het prikbord?');
}


async function pbMijnLaden() {
  const vak = document.getElementById('pbMijnLijst');
  if (!currentUser || !hasOwnProfile) { vak.innerHTML = emptyStateHTML('Nog geen profiel', 'Met een profiel plaats je een oproep.', 'Profiel aanmaken', "showView('register')"); return; }
  if (!pbMijn.length) ladenTonen(vak);
  const { data, error } = await db.rpc('tt_mijn_oproepen');
  if (error) { logCaught('pbMijnLaden', error); vak.innerHTML = foutStaatHTML(error, 'je oproepen laden', 'pbMijnLaden()'); return; }
  pbMijn = data || [];
  if (!pbMijn.length) { vak.innerHTML = emptyStateHTML('Nog geen oproepen', 'Zoek je iemand, of ben je beschikbaar?', 'Oproep plaatsen', 'pbPlaatsenStart()'); return; }
  vak.innerHTML = pbMijn.map(pbMijnHTML).join('');
}

function pbMijnHTML(m) {
  const o = m.oproep;
  const reacties = m.reacties || [];
  const nieuw = reacties.filter(r => r.nieuw).length;
  const dagen = pbDagenOver(o);
  const regel = `${reacties.length === 1 ? '1 reactie' : reacties.length + ' reacties'}${nieuw ? ` (${nieuw} nieuw)` : ''} · nog ${dagen === 1 ? '1 dag' : dagen + ' dagen'}`;
  const verlengen = dagen <= 10;
  return `
    <div class="pb-mijn" id="pbMijn-${escHtml(o.id)}">
      <div class="pb-mijn-kop">
        <div class="pb-oproep-titel">${escHtml(pbTitel(o))}</div>
        <div class="result-row-meta">${escHtml(pbDoelNaam(o.doel))}${o.band_id ? '' : ''}</div>
        <div class="result-row-meta">${escHtml(regel)}</div>
      </div>
      <div class="pb-reacties">${reacties.length ? reacties.map(r => pbReactieHTML(o, r)).join('') : '<p class="pb-leeg-regel">Nog geen reacties.</p>'}</div>
      <div class="btn-row pb-mijn-knoppen">
        <button type="button" class="btn btn-ghost" onclick="pbAanpassen('${jsAttr(o.id)}')">Aanpassen</button>
        <button type="button" class="btn btn-ghost" onclick="pbGevonden('${jsAttr(o.id)}')">Gevonden</button>
        <button type="button" class="btn btn-ghost" ${verlengen ? '' : 'disabled'} onclick="pbVerlengen('${jsAttr(o.id)}')">Verlengen</button>
      </div>
    </div>`;
}

function pbReactieHTML(o, r) {
  const wie = [r.leeftijd != null ? r.leeftijd + ' jaar' : '', r.plaats, afstandTekst(r.km)].filter(Boolean).map(escHtml).join(' · ');
  const extra = [r.niveau ? '★'.repeat(r.niveau) : '', r.media ? (r.media.type === 'video' ? 'video' : 'link') : '',
    r.gedeeld ? `${PB_GEZAMENLIJK} ${r.gedeeld}` : ''].filter(Boolean).map(escHtml).join(' · ');
  const knop = r.status === 'uitgenodigd'
    ? `<span class="pb-status">Uitgenodigd</span>`
    : `<button type="button" class="btn btn-primary pb-klein" onclick="event.stopPropagation(); pbUitnodigen('${jsAttr(r.id)}','${jsAttr(r.musician_id)}','${jsAttr(r.naam)}','${jsAttr(o.id)}')">Uitnodigen</button>`;
  return `
    <div class="result-row pb-reactie" onclick="openProfielScherm('${jsAttr(r.musician_id)}')">
      <div class="result-row-top">
        <div class="result-row-avatar">${fotoHTML(r.foto, r.naam) || ZONDER_FOTO_HTML}</div>
        <div class="result-row-main">
          <div class="result-row-name"><span class="result-row-naam">${escHtml(r.naam)}</span>${r.nieuw ? '<span class="pb-nieuw">Nieuw</span>' : ''}</div>
          <div class="result-row-meta">${wie}</div>
          ${extra ? `<div class="result-row-meta">${extra}</div>` : ''}
          ${r.boodschap ? `<div class="pb-boodschap">${escHtml(r.boodschap)}</div>` : ''}
        </div>
        ${knop}
      </div>
    </div>`;
}

function pbOpenMijn(id) { pbZetTab('mijn'); }




async function pbUitnodigen(reactieId, musicianId, naam, oproepId) {
  const m = pbMijn.find(x => x.oproep.id === oproepId);
  if (!m) return;
  await pbMijLaden();
  if (!PB_MIJ.naam) { showToast(friendlyErrorMessage(null, 'uitnodigen')); return; }
  const { error } = await db.rpc('tt_reactie_uitnodigen', { p_reactie: reactieId });
  if (error) { showToast(friendlyErrorMessage(error, 'uitnodigen')); return; }
  const r = (m.reacties || []).find(x => x.id === reactieId);
  if (r) r.status = 'uitgenodigd';
  const vak = document.getElementById('pbMijnLijst');
  if (vak && pbTab === 'mijn') vak.innerHTML = pbMijn.map(pbMijnHTML).join('');
  const mid = await getMyMusicianId();
  const tekst = TT_TEKSTEN.oproepUitnodiging.replace('{naam}', PB_MIJ.naam).replace('{titel}', pbTitel(m.oproep));
  const { error: e2 } = await db.from('messages').insert({ sender_id: mid, recipient_id: musicianId, body: tekst, oproep_id: oproepId });
  if (e2) { logCaught('pbUitnodigen', e2); showToast(friendlyErrorMessage(e2, 'je uitnodiging versturen')); return; }
  openMessageComposer(musicianId, naam);
}

async function pbGevonden(id) {
  showConfirm('Heb je gevonden wie je zocht? De oproep gaat van het prikbord. Wie reageerde en niet gekozen is, krijgt een vriendelijk bericht.',
    async () => {
      const { error } = await db.rpc('tt_oproep_sluiten', { p_id: id, p_reden: 'gevonden' });
      if (error) { showToast(friendlyErrorMessage(error, 'de oproep sluiten')); return; }
      showToast('Gefeliciteerd! De oproep is gesloten.');
      pbMijnLaden();
    }, 'Gevonden', false, 'Annuleren', 'Gevonden?');
}

async function pbVerlengen(id) {
  const { data, error } = await db.rpc('tt_oproep_verlengen', { p_id: id });
  if (error) { showToast(friendlyErrorMessage(error, 'de oproep verlengen')); return; }
  showToast(`Verlengd tot ${pbDatum(data)}.`);
  pbMijnLaden();
}

async function pbAanpassen(id) {
  await pbMijLaden();
  const m = pbMijn.find(x => x.oproep.id === id);
  if (!m) return;
  const o = m.oproep;
  pbForm = { id: o.id, wie: o.band_id || 'ik', soort: o.soort, doel: o.doel, instrumenten: o.instrumenten || [],
             elk: o.elk_instrument, leeftijden: o.leeftijden || [], plaats: o.plaats || '', straal: o.straal_km, tekst: o.tekst || '', toevoeging: o.toevoeging || '', media: o.media_gewenst };
  pbLaag = 'plaatsen';
  pbTekenForm();
  document.getElementById('pbFormInhoud').insertAdjacentHTML('beforeend',
    `<button type="button" class="btn btn-danger pb-knop" onclick="pbVerwijderen('${jsAttr(o.id)}')">Oproep verwijderen</button>`);
  pbToonLaag();
  veldGroeit(document.getElementById('pbTekst'));
}

function pbVerwijderen(id) {
  showConfirm('Wie reageerde, krijgt een vriendelijk bericht.', async () => {
    const { error } = await db.rpc('tt_oproep_sluiten', { p_id: id, p_reden: 'verwijderd' });
    if (error) { showToast(friendlyErrorMessage(error, 'de oproep verwijderen')); return; }
    pbForm = null;
    showToast('Oproep verwijderd.');
    pbZetTab('mijn');
  }, 'Verwijderen', false, 'Annuleren', 'Oproep verwijderen?');
}


async function pbReactiesLaden() {
  const vak = document.getElementById('pbReactiesLijst');
  if (!currentUser || !hasOwnProfile) { vak.innerHTML = emptyStateHTML('Nog geen profiel', 'Met een profiel reageer je op een oproep.', 'Profiel aanmaken', "showView('register')"); return; }
  ladenTonen(vak);
  const { data, error } = await db.rpc('tt_mijn_reacties');
  if (error) { logCaught('pbReactiesLaden', error); vak.innerHTML = foutStaatHTML(error, 'je reacties laden', 'pbReactiesLaden()'); return; }
  const rijen = data || [];
  if (!rijen.length) { vak.innerHTML = emptyStateHTML('Nog geen reacties', 'Tik op een oproep en kies Ik doe mee.', 'Alle oproepen', "pbZetTab('alle')"); return; }
  vak.innerHTML = rijen.map(r => {
    const o = r.oproep;
    const stand = o.status === 'open' ? (r.status === 'uitgenodigd' ? 'Uitgenodigd' : 'Verstuurd') : 'Gesloten';
    return `
      <div class="result-row pb-reactie">
        <div class="result-row-top">
          <div class="result-row-avatar${o.band_id ? ' result-vierkant' : ''}">${fotoHTML(o.foto, o.naam) || ZONDER_FOTO_HTML}</div>
          <div class="result-row-main">
            <div class="result-row-name"><span class="result-row-naam">${escHtml(pbTitel(o))}</span></div>
            <div class="result-row-meta">${[o.naam, o.plaats].filter(Boolean).map(escHtml).join(' · ')}</div>
          </div>
          <span class="pb-status">${stand}</span>
        </div>
        ${o.status === 'open' ? `<button type="button" class="stille-link pb-intrekken" onclick="pbIntrekken('${jsAttr(r.id)}')">Reactie intrekken</button>` : ''}
      </div>`;
  }).join('');
}

function pbIntrekken(id) {
  showConfirm('De plaatser krijgt een bericht dat je niet meer meedoet.', async () => {
    const { error } = await db.rpc('tt_reactie_intrekken', { p_reactie: id });
    if (error) { showToast(friendlyErrorMessage(error, 'je reactie intrekken')); return; }
    showToast('Je reactie is ingetrokken.');
    pbReactiesLaden();
  }, 'Intrekken', false, 'Annuleren', 'Reactie intrekken?');
}


async function pbKaartjeVullen(id) {
  const el = document.querySelector(`.gesprek-oproep[data-oproep="${CSS.escape(id)}"]`);
  if (!el) return;
  const { data, error } = await db.rpc('tt_oproep_kaarten', { p_ids: [id] });
  if (error || !data || !data.length) { el.remove(); return; }
  const o = data[0];
  const open = o.status === 'open';
  el.innerHTML = `<div class="gesprek-oproep-titel">${escHtml(pbTitel(o))}</div>
    <div class="result-row-meta">${[pbDoelNaam(o.doel), o.naam, open ? '' : 'gesloten'].filter(Boolean).map(escHtml).join(' · ')}</div>`;
  if (open) { el.setAttribute('role', 'button'); el.onclick = () => pbOpenKaartje(o.id); }
}
async function pbOpenKaartje(id) {
  const { data, error } = await db.rpc('tt_prikbord', { p_lat: null, p_lng: null, p_straal_km: 100, p_id: id });
  if (error) { logCaught('pbOpenKaartje', error); return; }
  if (!data || !data.length) { showToast(PB_LINK_WEG); return; }
  pbOpenVanBuiten(data[0]);
}


const PB_TT = {
  oproep_bedankt: '{naam} heeft de oproep {titel} afgesloten. Bedankt voor je reactie en succes met zoeken.',
  reactie_ingetrokken: '{naam} doet niet meer mee met je oproep {titel}.',
  oproep_loopt_af: 'Je oproep {titel} loopt over 10 dagen af. Zoek je nog? Verleng hem bij Mijn oproepen.',
  nieuwe_reacties: '{aantal} nieuwe reacties op {titel}.',
  nieuwe_reactie: '1 nieuwe reactie op {titel}.',
  nieuwe_reacties_meer: 'Nieuwe reacties: {lijst}.',
  reacties_op: '{aantal} op {titel}',
  oproepen: 'Er zijn {aantal} nieuwe oproepen bij jou in de buurt.',
  oproep: 'Er is 1 nieuwe oproep bij jou in de buurt.',
  knopPrikbord: 'Naar het prikbord',
  knopMijn: 'Mijn oproepen'
};
function pbTtNaam(id, band, info) {
  if (band && info && info.bands[band]) return info.bands[band].name;
  const m = info && info.muzikanten[id];
  return m ? displayNameOf(m) : 'De plaatser';
}
function pbTtKernzin(inh, info) {
  const titel = pbTitel({ instrumenten: inh.instrumenten, elk_instrument: inh.elk, soort: inh.oproep_soort, toevoeging: inh.toevoeging });
  const naam = pbTtNaam(inh.soort === 'reactie_ingetrokken' ? inh.wie : inh.plaatser, inh.soort === 'reactie_ingetrokken' ? null : inh.band, info);
  if (inh.soort === 'oproepen') {
    const n = (inh.oproepen || []).length + (Number(inh.meer) || 0);
    return n === 1 ? PB_TT.oproep : PB_TT.oproepen.replace('{aantal}', n);
  }

  if (inh.soort === 'nieuwe_reacties') {
    const lijst = (inh.oproepen || []).map(x => ({ aantal: x.aantal,
      titel: pbTitel({ instrumenten: x.instrumenten, elk_instrument: x.elk, soort: x.oproep_soort, toevoeging: x.toevoeging }) }));
    if (!lijst.length) return '';
    if (lijst.length === 1) {
      const x = lijst[0];
      return (x.aantal === 1 ? PB_TT.nieuwe_reactie : PB_TT.nieuwe_reacties.replace('{aantal}', x.aantal)).replace('{titel}', x.titel);
    }
    const delen = lijst.map(x => PB_TT.reacties_op.replace('{aantal}', x.aantal).replace('{titel}', x.titel));
    return PB_TT.nieuwe_reacties_meer.replace('{lijst}', delen.slice(0, -1).join(', ') + ' en ' + delen[delen.length - 1]);
  }
  return (PB_TT[inh.soort] || '').replace('{naam}', naam).replace('{titel}', titel);
}
function pbTtBerichtHTML(bericht, info) {
  const inh = bericht.inhoud || {};
  const kop = pbTtKernzin(inh, info);
  if (!kop) return '';
  const mijn = ['reactie_ingetrokken', 'oproep_loopt_af', 'nieuwe_reacties'].includes(inh.soort);
  const knop = `<button type="button" class="tt-meer" onclick="openPrikbordVanuitBericht('${mijn ? 'mijn' : 'alle'}')">${escHtml(mijn ? PB_TT.knopMijn : PB_TT.knopPrikbord)}</button>`;
  const tijd = new Date(bericht.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });

  const rijen = inh.soort === 'oproepen' ? (inh.oproepen || []).filter(x => x.soort && !isGeblokkeerd(x.plaatser)).map(x => {
    const bi = x.band && info.bands[x.band], mi = info.muzikanten[x.plaatser];
    const naam = bi ? bi.name : mi ? displayNameOf(mi) : '';
    const regel1 = [pbDoelNaam(x.doel), naam].filter(Boolean).join(' · ');
    const regel2 = [bi ? bi.city : mi && mi.city, afstandTekst(x.km)].filter(Boolean).join(' · ');
    const titel = pbTitel({ instrumenten: x.instrumenten, elk_instrument: x.elk, soort: x.soort, toevoeging: x.toevoeging });
    return `<button type="button" class="bb-rij bb-rij-knop" onclick="pbOpenKaartje('${jsAttr(x.id)}')">${bbFotoHTML(bi ? bi.avatar_url : mi && mi.avatar_url, false, !!bi)}<span class="bb-tekst"><span class="bb-naam">${escHtml(titel)}</span>${regel1 ? `<span class="bb-sub">${escHtml(regel1)}</span>` : ''}${regel2 ? `<span class="bb-sub">${escHtml(regel2)}</span>` : ''}</span></button>`;
  }).join('') : '';
  return `<div class="message-bubble other tt-bericht"><div class="tt-bericht-kop">${escHtml(kop)}</div>${rijen}${knop}<div class="message-bubble-time">${escHtml(tijd)}</div></div>`;
}
function openPrikbordVanuitBericht(tab) {
  showView('search', 'behoud');
  openZoekScherm('prikbord', { geenZoek: true, direct: true });
  pbMijLaden();
  pbZetTab(tab);
}



const PB_LINK_WEG = 'Deze oproep staat niet meer op het prikbord.';
async function pbOpenVanLink(id) {
  if (id === 'mijn' || id === 'reacties') { openPrikbordVanuitBericht(currentUser && hasOwnProfile ? id : 'alle'); return; }
  openPrikbordVanuitBericht('alle');
  if (!id) return;
  const { data, error } = await db.rpc('tt_prikbord', { p_lat: null, p_lng: null, p_straal_km: 100, p_id: id });
  if (error) { logCaught('pbOpenVanLink', error); return; }
  if (!data || !data.length) { showToast(PB_LINK_WEG); return; }
  pbLijst = pbLijst.filter(x => x.id !== data[0].id).concat(data[0]);
  pbOpenOproep(data[0].id);
}




let pbBewaard;
let pbBewaardVoor = null;
let pbVertrek = null;
let pbOnthoudBezig = false;
let pbOnthoudTimer = null;
function pbOnthoudVink(aan) { const v = document.getElementById('pbOnthoud'); if (v) v.checked = !!aan; }
async function pbOnthoudHerstellen() {
  if (!currentUser || !hasOwnProfile) { pbOnthoudVink(false); return; }
  if (pbBewaardVoor === currentUser.id) { pbOnthoudVink(!!pbBewaard); return; }
  try {
    const mid = await getMyMusicianId();
    const { data, error } = await db.from('prikbord_zoek').select('*').eq('musician_id', mid).maybeSingle();
    if (error) throw error;
    pbBewaard = data || null;
    pbBewaardVoor = currentUser.id;
  } catch (e) {
    logCaught('pbOnthoudHerstellen', e);
    return;
  }
  pbOnthoudVink(!!pbBewaard);
  const z = pbBewaard;
  if (!z) return;
  pbFilters = { soort: z.soort || '', doel: z.doel || '', instrument: z.instrument || '', volgorde: z.volgorde || 'nieuwste' };
  document.getElementById('pbPlaats').value = z.plaats || '';
  setWheelFieldValues('pbStraal', [z.straal_km || PB_STRAAL_STANDAARD], false);
  pbFiltersBijwerken();
}
function pbHuidigeZoek() {
  const v = pbVertrek || {};
  return {
    soort: pbFilters.soort || null, doel: pbFilters.doel || null, instrument: pbFilters.instrument || null,
    volgorde: pbFilters.volgorde || 'nieuwste',
    plaats: (v.tekst || '').trim().slice(0, 80) || null,
    origin_lat: v.eigen ? null : v.lat, origin_lng: v.eigen ? null : v.lng,
    straal_km: Number(document.getElementById('pbStraal').value) || PB_STRAAL_STANDAARD
  };
}
async function pbOnthoudKlik(vink) {
  if (!currentUser || !hasOwnProfile) {
    vink.checked = false;
    showToast('Maak een profiel aan, dan onthouden we je zoekopdracht.');
    return;
  }
  if (pbOnthoudBezig) { vink.checked = !vink.checked; return; }
  const aan = vink.checked;
  pbOnthoudBezig = true;
  try {
    const mid = await getMyMusicianId();
    if (aan) {
      if (!pbVertrek || plaatsIsOnbekend(pbVertrek.tekst, pbVertrek)) {
        vink.checked = false;
        showToast('Vul een plaats in, dan onthouden we je zoekopdracht.');
        return;
      }
      const rij = Object.assign({ musician_id: mid, bijgewerkt: new Date().toISOString() }, pbHuidigeZoek());
      const { error } = await db.from('prikbord_zoek').upsert(rij, { onConflict: 'musician_id' });
      if (error) throw error;
      pbBewaard = rij;
    } else {
      const { error } = await db.from('prikbord_zoek').delete().eq('musician_id', mid);
      if (error) throw error;
      pbBewaard = null;
    }
    pbBewaardVoor = currentUser.id;
  } catch (e) {
    logCaught('pbOnthoudKlik', e);
    vink.checked = !aan;
    showToast(friendlyErrorMessage(e, aan ? 'je zoekopdracht onthouden' : 'je zoekopdracht vergeten'));
  } finally {
    pbOnthoudBezig = false;
  }
}

function pbOnthoudBijwerken() {
  clearTimeout(pbOnthoudTimer);
  const vink = document.getElementById('pbOnthoud');
  if (!vink || !vink.checked || !pbBewaard || !pbVertrek || plaatsIsOnbekend(pbVertrek.tekst, pbVertrek)) return;
  pbOnthoudTimer = setTimeout(async () => {
    if (!pbBewaard || pbOnthoudBezig) return;
    const nu = pbHuidigeZoek();
    if (Object.keys(nu).every(k => (pbBewaard[k] ?? null) === nu[k])) return;
    try {
      const { error } = rijenGeraakt(await db.from('prikbord_zoek').update(Object.assign({ bijgewerkt: new Date().toISOString() }, nu))
        .eq('musician_id', pbBewaard.musician_id).select('musician_id'));
      if (error) throw error;
      pbBewaard = Object.assign({}, pbBewaard, nu);
    } catch (e) {
      logCaught('pbOnthoudBijwerken', e);
    }
  }, 800);
}


let pbOproepenAan = null;
function pbOproepenTonen(aan) {
  pbOproepenAan = aan;
  document.querySelectorAll('#oproepenControl .segmented-btn').forEach(b =>
    b.classList.toggle('selected', b.dataset.mode === (aan ? 'aan' : 'uit')));
}
async function pbOproepenZetten(aan) {
  const oud = pbOproepenAan;
  if (aan === oud) return;
  pbOproepenTonen(aan);
  try {
    const mid = await getMyMusicianId();
    const { error } = rijenGeraakt(await db.from('musicians').update({ oproepen_melden: aan }).eq('id', mid).select('id'));
    if (error) throw error;
  } catch (e) {
    logCaught('pbOproepenZetten', e);
    pbOproepenTonen(oud);
    showToast(friendlyErrorMessage(e, 'je keuze opslaan'));
  }
}





function pbAllesWissen() {
  pbVolgnr++;
  clearTimeout(pbPlaatsTimer); clearTimeout(pbOnthoudTimer);
  pbTab = 'alle'; pbLaag = null; pbLijst = []; pbOpen = null; pbMijn = [];
  pbFilters = { soort: '', doel: '', instrument: '', volgorde: 'nieuwste' };
  pbForm = null; pbVanBand = null; pbVanBuiten = false;
  Object.assign(PB_MIJ, { instrumenten: [], genres: [], bands: [], leeftijd: null, naam: '', foto: '', plaats: '', voor: null });
  pbBewaard = undefined; pbBewaardVoor = null; pbVertrek = null; pbOproepenAan = null;
  ['pbResultaat', 'pbMijnLijst', 'pbReactiesLijst', 'pbOproepInhoud', 'pbFormInhoud', 'pbVoorbeeldInhoud', 'pbReagerenInhoud', 'pbTipsInhoud']
    .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  ['pbReagerenModal', 'pbTipsModal'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('visible'); });
  ['pbTegelGetal', 'pbMijnGetal'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; });
  const plaats = document.getElementById('pbPlaats');
  if (plaats) plaats.value = '';
  if (CHOICE_FIELDS.pbStraal) setWheelFieldValues('pbStraal', [PB_STRAAL_STANDAARD], false);
  ['pbSoort', 'pbDoel', 'pbInstrument', 'pbVolgorde'].forEach(id => { if (CHOICE_FIELDS[id]) refreshChoiceField(id); });
  const ft = document.getElementById('pbFiltersTekst');
  if (ft) ft.textContent = 'Filters';
  pbOnthoudVink(false);
  syncModalScrollLock();
}


async function pbTegelGetal() {
  const el = document.getElementById('pbTegelGetal');
  const el2 = document.getElementById('pbMijnGetal');
  if (!currentUser || !hasOwnProfile) { [el, el2].forEach(e => e && (e.hidden = true)); return; }
  const { data, error } = await db.rpc('tt_nieuwe_reacties');
  if (error) return;
  [el, el2].forEach(e => { if (e) { e.textContent = data || ''; e.hidden = !data; } });
}

pbReagerenVersturen = slotOm(pbReagerenVersturen, 'pbVersturenKnop');
pbPlaatsen = slotOm(pbPlaatsen, 'pbPlaatsenKnop');
pbVerlengen = slotOm(pbVerlengen);
pbUitnodigen = slotOm(pbUitnodigen);
