




const PB_DOELEN = [['band', 'Band'], ['jammen', 'Jammen'], ['invallen', 'Invallen'], ['projecten', 'Projecten']];
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



const PB_ZANG = ['Zang', 'Achtergrondzang'];
const PB_ZANG_VORMEN = { gezocht: [['zanger', 'Zanger'], ['zangeres', 'Zangeres'], ['beide', 'Zanger of zangeres']],
                         beschikbaar: [['zanger', 'Zanger'], ['zangeres', 'Zangeres']] };
function pbHeeftZang(instrumenten) { return (instrumenten || []).some(i => PB_ZANG.includes(i)); }
function pbSpeler(instrument, zangVorm) {
  const naam = PB_SPELER[instrument] || instrument.toLowerCase();
  if (!PB_ZANG.includes(instrument)) return naam;
  if (zangVorm === 'zangeres') return naam + 'es';
  if (zangVorm === 'beide') return `${naam} of ${naam}es`;
  return naam;
}


function pbSpelers(instrumenten, elk, zangVorm) {
  if (elk || !instrumenten || !instrumenten.length) return 'muzikanten';
  const namen = [...new Set(instrumenten.map(i => pbSpeler(i, zangVorm)))];
  if (namen.length === 1) return namen[0];
  return namen.slice(0, -1).join(', ') + ' of ' + namen[namen.length - 1];
}


function pbTitel(o) {
  const wie = pbSpelers(o.instrumenten, o.elk_instrument, o.zang_vorm);
  const naam = o.naam || '';
  if (o.soort === 'beschikbaar') return `${naam} is beschikbaar als ${wie}`;
  return wie === 'muzikanten' ? `${naam} zoekt muzikanten` : `${naam} zoekt een ${wie}`;
}


function pbTitelKort(o) {
  return pbHoofd(pbSpelers(o.instrumenten, o.elk_instrument, o.zang_vorm)) + (o.soort === 'beschikbaar' ? ' beschikbaar' : ' gezocht');
}
function pbTitelHTML(o, klasse) {
  return `<span class="${klasse || 'result-row-naam'} pb-titel" data-kort="${escHtml(pbTitelKort(o))}">${escHtml(pbTitel(o))}</span>`;
}

function pbTitelsPassen(root) {
  (root || document).querySelectorAll('.pb-titel[data-kort]').forEach(t => {
    if (t.scrollWidth > t.clientWidth + 1 && t.textContent !== t.dataset.kort) t.textContent = t.dataset.kort;
  });
}

function pbInstrumentKlein(i) { return !i ? '' : /^[A-Z]{2}/.test(i) ? i : i.charAt(0).toLowerCase() + i.slice(1); }




function pbRegelHTML(o, metAfstand) {
  const voor = [o.plaatser_naam, o.soort === 'beschikbaar' ? '' : pbInstrumentKlein(o.plaatser_instrument)].filter(Boolean);
  const na = [(o.genres || [])[0], o.band_id ? '' : (o.leeftijd != null ? `${o.leeftijd} jaar` : ''), metAfstand === false ? '' : afstandTekst(o.km)].filter(Boolean);
  return `<span class="pb-regel-kort">${escHtml(voor.join(' · '))}</span>${na.length ? `<span class="pb-regel-vast">${voor.length ? '&nbsp;·&nbsp;' : ''}${escHtml(na.join(' · '))}</span>` : ''}`;
}

const PB_GEZAMENLIJK = 'Gezamenlijke nummers:';
function pbGedeeldTekst(o) {
  const n = o.gedeeld;
  return `${PB_GEZAMENLIJK} ${n}`;
}

function pbDoelenTekst(doelen) { return PB_DOELEN.filter(([w]) => (doelen || []).includes(w)).map(x => x[1]).join(' · '); }

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
  const alle = PB_LEEFTIJDEN, g = alle.filter(x => (o.leeftijden || []).includes(x));
  if (g.length === alle.length) return 'Elke leeftijd';
  const van = x => parseInt(x, 10), tot = x => x === '35+' ? null : parseInt(x.split('-')[1], 10);
  const stukken = [];
  for (let i = 0; i < g.length;) {
    let j = i;
    while (j + 1 < g.length && alle.indexOf(g[j + 1]) === alle.indexOf(g[j]) + 1) j++;
    stukken.push([van(g[i]), tot(g[j])]);
    i = j + 1;
  }
  if (stukken.length === 1 && stukken[0][1] === null) return `Vanaf ${stukken[0][0]} jaar`;
  return stukken.map(([a, b]) => b === null ? `${a}+` : `${a}–${b}`).join(' en ') + ' jaar';
}


const PB_MIJ = { instrumenten: [], instrumentenNiveau: [], bands: [], leeftijd: null, naam: '', foto: '', plaats: '', voor: null };

async function pbMijLaden() {
  if (!currentUser || !hasOwnProfile) return;
  if (PB_MIJ.voor === currentUser.id) return;
  try {
    const mid = await getMyMusicianId();
    const [ik, instr, geb, bands] = await Promise.all([
      db.from('musicians').select('weergavenaam, username, avatar_url, city').eq('id', mid).maybeSingle(),
      db.from('musician_instruments').select('instrument, niveau').eq('musician_id', mid),
      db.rpc('tt_get_my_birth_date'),
      db.from('bands').select('id, name, city, soort, avatar_url, band_members(musician_id, status, rollen)').eq('founder_id', mid)
    ]);
    const leeftijd = d => { if (!d) return null; const g = new Date(d), n = new Date(); let a = n.getFullYear() - g.getFullYear(); if (n < new Date(n.getFullYear(), g.getMonth(), g.getDate())) a--; return a; };
    PB_MIJ.naam = ik.data ? (ik.data.weergavenaam || ik.data.username || '') : '';
    PB_MIJ.foto = ik.data ? ik.data.avatar_url : '';
    PB_MIJ.plaats = ik.data ? ik.data.city : '';
    PB_MIJ.instrumenten = (instr.data || []).map(x => x.instrument);
    PB_MIJ.instrumentenNiveau = instr.data || [];
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

const PB_DUIDING = {
  alle: 'Oproepen van anderen.',
  mijn: 'Jouw oproepen. Tik op een oproep voor de kandidaten.',
  reacties: 'Oproepen waarop je reageerde. Tik op een oproep voor je bericht.'
};
function pbZetTab(tab) {
  pbTab = tab;
  pbLaag = null;
  pbVanBuiten = false;
  ['mijn', 'reacties'].forEach(t => {
    const b = document.getElementById('pbTab-' + t);
    if (b) { b.classList.toggle('active', t === tab); b.setAttribute('aria-pressed', t === tab ? 'true' : 'false'); }
  });

  const duiding = document.getElementById('pbDuiding');
  if (duiding) duiding.textContent = PB_DUIDING[tab] || '';
  pbToonLaag();
  if (tab === 'alle') { pbInitFilters(); pbOnthoudHerstellen().finally(pbLaden); }
  if (tab === 'mijn') { pbMijnLaden(); pbTegelGetal(); }
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
  pbTitelsPassen();
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
      if (pbForm.id) vraagOpslaanBijTerug('Wijzigingen opslaan?', 'Opslaan', 'Niet opslaan', () => pbNaarVoorbeeld(), dicht);
      else vraagOpslaanBijTerug('Oproep plaatsen?', 'Plaatsen', 'Niet plaatsen', () => pbNaarVoorbeeld(), dicht);
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
    const [vertrek] = await Promise.all([zoekVertrekpunt(plaats), currentUser && hasOwnProfile && !myMusicianId ? getMyMusicianId() : null]);
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




function pbVanMij(o) { return !!myMusicianId && o.plaatser_id === myMusicianId; }
function pbGefilterd() {
  const f = pbFilters;
  let rijen = pbLijst.filter(o => !pbVanMij(o) &&
    (!f.soort || o.soort === f.soort) && (!f.doel || (o.doelen || []).includes(f.doel))
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




  const gedeeld = o.gedeeld && !o.eigen ? `<div class="pb-rij-gedeeld">${escHtml(pbGedeeldTekst(o))}</div>` : '';
  return `
    <div class="result-row pb-rij" onclick="pbOpenOproep('${jsAttr(o.id)}')">
      <div class="result-row-top">
        <div class="result-row-avatar${o.band_id ? ' result-vierkant' : ''}">${fotoHTML(o.foto, o.naam) || ZONDER_FOTO_HTML}</div>
        <div class="result-row-main">
          <div class="result-row-name pb-eenregel">${pbTitelHTML(o)}</div>
          <div class="result-row-meta pb-eenregel">${pbRegelHTML(o)}</div>
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
  pbTitelsPassen(vak);
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

  const wieKort = [o.plaatser_naam, o.soort === 'beschikbaar' ? '' : pbInstrumentKlein(o.plaatser_instrument)].filter(Boolean).join(' · ');
  const wieVast = [pbLeeftijdTekst(o), o.plaats, voorbeeld ? '' : afstandTekst(o.km)].filter(Boolean).join(' · ');
  const wie = `<span class="pb-regel-kort">${escHtml(wieKort)}</span>${wieVast ? `<span class="pb-regel-vast">${wieKort ? '&nbsp;·&nbsp;' : ''}${escHtml(wieVast)}</span>` : ''}`;
  const doelRegel = [pbDoelenTekst(o.doelen), ...(o.genres || [])].filter(Boolean).map(escHtml).join(' · ');
  const datum = o.verlengd_op ? `Verlengd tot ${pbDatum(o.loopt_tot)}` : `Geplaatst op ${pbDatum(o.geplaatst_op || new Date().toISOString())}`;
  const feiten = [
    ['Leeftijd', escHtml(pbVoorWie(o))]
  ];
  if (o.band_id && o.band_soort) feiten.push(['Muziek', escHtml({ eigen: 'Eigen nummers', covers: 'Coverband', beide: 'Eigen nummers en covers' }[o.band_soort] || '')]);


  const koppen = pbVakKoppen(!!o.band_id, o.soort);
  const vakken = PB_VAK_SLEUTELS.map((k, i) => (o.vakken || {})[k] ? `<div class="pb-vak-kop">${escHtml(koppen[i])}</div><p class="pb-oproep-tekst">${escHtml(o.vakken[k])}</p>` : '').join('');
  let knop = '';
  if (!voorbeeld) {
    if (pbVanMij(o)) knop = `<button type="button" class="btn btn-ghost pb-knop" onclick="pbOpenMijn('${jsAttr(o.id)}')">Bekijk de kandidaten</button>`;
    else if (o.eigen) knop = '';


    else if (!currentUser || !hasOwnProfile) knop = `<button type="button" class="btn btn-primary pb-knop" onclick="profielKeuzeOpen({ soort: 'oproep', id: '${jsAttr(o.id)}' })">${o.soort === 'beschikbaar' ? 'Stuur een bericht' : 'Reageren'}</button>`;
    else if (o.soort === 'beschikbaar') knop = `<button type="button" class="btn btn-primary pb-knop" data-bericht-id="${escHtml(o.plaatser_id)}" onclick="pbBerichtOproep('${jsAttr(o.id)}')">Stuur een bericht</button>`;
    else if (o.gereageerd) knop = `<button type="button" class="btn btn-primary pb-knop" disabled>Je hebt gereageerd</button>`;
    else knop = `<button type="button" class="btn btn-primary pb-knop" id="pbReagerenKnop" onclick="pbReagerenOpen()">Reageren</button>`;
  }
  return `
    <div class="pb-oproep">
      <div class="pb-oproep-kop" ${voorbeeld ? '' : `onclick="${o.band_id ? `openBandScherm('${jsAttr(o.band_id)}')` : `openProfielScherm('${jsAttr(o.plaatser_id)}')`}"`}>
        <div class="result-row-avatar pb-oproep-foto${o.band_id ? ' result-vierkant' : ''}">${fotoHTML(o.foto, o.naam) || ZONDER_FOTO_HTML}</div>
        <div class="pb-oproep-wie">
          <div class="pb-oproep-titel pb-eenregel">${pbTitelHTML(o, 'pb-oproep-titel-tekst')}</div>
          <div class="result-row-meta">${doelRegel}</div>
          <div class="result-row-meta pb-eenregel">${wie}</div>
        </div>
      </div>
      <div class="pb-vakken">${vakken}</div>
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



function pbBerichtOproep(id) {
  const o = pbLijst.find(x => x.id === id) || pbOpen;
  if (!o) return;
  gesprekTekstKlaar(o.plaatser_id, o.naam, PB_TT.bericht.replace('{naam}', o.naam), o.id);
}


async function pbReagerenOpen() {
  const o = pbOpen;
  if (!o) return;
  const vak = document.getElementById('pbReagerenInhoud');
  document.getElementById('pbReagerenKop').textContent = 'Reageren';


  const naamPlaatser = o.naam || '';
  document.getElementById('pbReagerenSub').innerHTML = `<p class="pb-eenregel">Oproep: ${escHtml(pbTitel(o))}</p><p>${escHtml(naamPlaatser)} ziet je profiel${o.gedeeld ? ' en jullie gezamenlijke nummers' : ''}.</p>`;
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
  if (showFieldErrors([bioVoorbeeldFout('pbBoodschap', 'reactie')])) return;
  const { error } = await db.rpc('tt_oproep_reageren', { p_oproep: o.id, p_boodschap: tekst });
  if (error) { showToast(friendlyErrorMessage(error, 'je reactie versturen')); return; }
  pbReagerenSluiten();
  o.gereageerd = true;
  document.getElementById('pbOproepInhoud').innerHTML = pbOproepHTML(o, false);
  showToast('Reactie verstuurd. Het antwoord vind je in Berichten.');
}


const PB_TIPS = {

  eersteAfspraak: 'Ken je elkaar nog niet? Spreek dan af op een plek waar ook anderen zijn, zoals een oefenruimte of muziekschool.'
};

function pbEersteAfspraakTonen() { return PB_MIJ.leeftijd != null && PB_MIJ.leeftijd <= 21; }



const PB_LEES_DIT_EERST = [
  ['Weet wat je zoekt', 'Welk instrument, welk niveau, en waarvoor: jammen, een vaste band, invallen of een project. Vraag een niveau dat bij jou of je band past, en zeg eerlijk wat jij of jullie willen bereiken.'],
  ['Laat je energie zien', 'Rustig, gezellig of fanatiek: vertel het. Dan reageren de mensen die bij je passen. Schrijf gewoon en duidelijk; een neutrale toon werkt altijd.'],
  ['Zet je media klaar', 'Een filmpje, een demo of een link op je profiel zegt meer dan veel woorden.'],
  ['Wees concreet', 'Noem dagen, plaatsen en kosten. Wie twijfelt, reageert niet.'],
  ['Denk aan wie reageert', 'Die is misschien ook wat zenuwachtig. Maak de eerste stap klein en duidelijk. Een goede klik is net zo belangrijk als goed samen spelen.'],
  ['Hou het kort', 'Een paar zinnen per vak is meestal genoeg.']
];




const PB_VAK_SLEUTELS = ['wie', 'wil', 'zoek', 'waar', 'kennis', 'verder'];
const PB_VAK_MAX = 600;
const PB_VAK_TELLER = 480;
function pbVakKoppen(band, soort) {
  if (band) return ['Wie zijn we', 'Wat willen we', 'Wie zoeken we', 'Wanneer en waar', 'Kennismaken', 'Verder nog'];
  return ['Wie ben ik', 'Wat wil ik', soort === 'beschikbaar' ? 'Wat zoek ik' : 'Wie zoek ik', 'Wanneer en waar', 'Kennismaken', 'Verder nog'];
}
const PB_VOORBEELDEN = {




  band: {
    wie: ['Coverband', 'Band met eigen nummers', 'Beginnende band'],
    vakken: {
      wie: { tips: ['Welke muziek spelen jullie? Noem een paar artiesten als referentie.', 'Wie zitten er in de band, en hoe oud zijn jullie ongeveer?', 'Schrijf kort en duidelijk, in een neutrale toon.', 'Zet een demo of opname bij Onze media. Dan hoort iemand meteen hoe jullie klinken.'],
        vb: ['Een coverband van vier scholieren tussen 16 en 18 uit Den Haag: zang, gitaar, drums en keyboard. We spelen pop- en rocknummers die iedereen kent, van Coldplay tot Doe Maar.',
          'Een rockband van drie muzikanten van 17 tot 19 uit Delft. We schrijven eigen nummers, met Arctic Monkeys en Royal Blood als referentie.',
          'Een punkband met gitaar, bas en zang, alle drie 15 jaar. We schrijven onze eerste eigen nummers.'] },
      wil: { tips: ['Wat willen jullie: optreden, eigen nummers maken of vooral samen spelen?', 'Wat ligt er al: nummers, een set, een oefenruimte?', 'Zeg het eerlijk. Willen jullie allemaal hetzelfde, dan houdt een band het langer vol.'],
        vb: ['We willen een vaste set van tien nummers en daarmee spelen op schoolfeesten en open podia. Eerst maken we de bezetting compleet.',
          'Er liggen zes eigen nummers die bijna speelklaar zijn. Dit jaar willen we een demo opnemen en optreden in jongerencentra.',
          'We willen beter worden en dit jaar ons eerste optreden doen, bijvoorbeeld op het schoolfeest.'] },
      zoek: { tips: ['Welk instrument zoek je, en welk niveau is nodig?', 'Vertel ook hoe jullie samenwerken. Dat telt net zo zwaar als iemands niveau.', 'Wat vraag je van iemand: elke week komen, thuis oefenen, meedenken over nummers?'],
        vb: ['Een bassist die zijn instrument goed beheerst en elke week kan repeteren. Meezingen is mooi meegenomen.',
          'Een drummer die strak speelt, goed luistert en mee wil schrijven aan eigen nummers.',
          'Een drummer die net als wij nog leert. Afspraken nakomen vinden we net zo belangrijk als techniek.'] },
      waar: { tips: ['Noem een dag en een plek, zoals zaterdagmiddag in Den Haag-Zuid.', 'Hoe vaak repeteren jullie, en hoe lang?', 'Zijn er kosten, zoals de huur van de oefenruimte? Zeg het meteen.'],
        vb: ['Elke zaterdagmiddag van 13.00 tot 16.00 uur in een oefenruimte in Den Haag-Zuid. De huur delen we.',
          'Elke vrijdagavond in de oefenruimte van het jongerencentrum in Delft. Daar staat een drumstel.',
          'Elke woensdag na school, van 16.00 tot 18.00 uur, in het jongerencentrum in Rijswijk.'] },
      kennis: { tips: ['Een keer samen spelen zegt meer dan veel berichten.', 'Stel een kleine eerste stap voor, zoals één nummer samen spelen.', 'Wil je horen hoe iemand speelt? Vraag om een filmpje of een opname.', 'Hou het contact eerst via de app. Later kun je je e-mailadres of telefoonnummer nog geven.'],
        vb: ['Stuur ons een bericht via de app. Daarna spreken we af om twee nummers samen te spelen.',
          'Stuur een bericht, het liefst met een filmpje of opname. Daarna spelen we een keer samen en kijken we of het muzikaal en persoonlijk klikt.',
          'Stuur ons een filmpje van jezelf, al is het met je telefoon. Daarna spreken we af in de oefenruimte.'] },
      verder: { tips: ['Alles wat nog niet in een ander vak past, zoals iets wat al vaststaat of wat iemand moet meenemen.', 'Laat je dit vak leeg, dan staat het niet in je oproep.'],
        vb: ['Ken je iemand die past? Deel de oproep dan.',
          'Ideeën voor nieuwe nummers zijn welkom.',
          'Je hoeft alleen je stokken mee te nemen.'] }
    }
  },

  ik: {
    wie: ['Colin, gitarist', 'Dylan, beginnende drummer', 'Lisa, zangeres'],
    vakken: {
      wie: { tips: ['Noem je instrument, hoe lang je speelt en welke muziek je maakt.', 'Hoe oud ben je ongeveer, en waar woon je?', 'Noem een paar artiesten of bands als referentie.', 'Zet een filmpje of opname in Je mediahoek. Dan hoort iemand meteen hoe je speelt.'],
        vb: ['Colin, 17, uit Den Haag. Ik speel vier jaar gitaar, vooral rock en indie, met Arctic Monkeys en Royal Blood als referentie.',
          'Dylan, 15, uit Rijswijk. Ik drum sinds een jaar en heb les op de muziekschool. Ik luister veel naar pop en punk.',
          'Lisa, 19, uit Leiden. Ik zing soul en pop en speel een beetje piano. Ik heb drie jaar in een koor gezongen.'] },
      wil: { tips: ['Wat wil je: optreden, eigen nummers maken of vooral samen spelen?', 'Hoe serieus pak je het aan? Hoeveel tijd heb je per week?', 'Zeg het eerlijk. Dan vind je mensen die hetzelfde willen.'],
        vb: ['Ik wil in een band die eigen nummers maakt en optreedt. Ik oefen elke dag en heb tijd voor één repetitie per week.',
          'Ik wil beter worden door samen te spelen. Optreden mag later, als ik er klaar voor ben.',
          'Ik wil een paar keer per maand zingen, en val ook in bij een band.'] },
      zoek: { tips: ['Welk instrument zoek je, en welk niveau?', 'Vertel ook hoe je met anderen omgaat. Dat telt net zo zwaar als iemands niveau.', 'Wat vraag je van iemand: elke week komen, thuis oefenen, meedenken over nummers?'],
        vb: ['Een bassist en een drummer om samen een band te beginnen. Je speelt minstens een jaar en komt afspraken na.',
          'Andere beginners die samen willen oefenen. Je hoeft nog niet goed te zijn: we leren van elkaar.',
          'Een gitarist of pianist om samen covers te spelen. Je luistert goed en zegt eerlijk wat je vindt.'] },
      zoekBeschikbaar: { tips: ['Wat voor band zoek je: welke muziek, welke leeftijd, welk niveau?', 'Wat heb je te bieden? Denk ook aan een eigen versterker of een plek om te oefenen.', 'Bij wat voor groep pas je: rustig, gezellig of fanatiek?'],
        vb: ['Een rockband met eigen nummers, met muzikanten tussen 16 en 20. Ik heb een eigen versterker en denk graag mee over nummers.',
          'Een band van beginners die geduld heeft. Ik kom elke week en oefen thuis.',
          'Een coverband of een groep die soms een zangeres nodig heeft. Ik leer snel nieuwe nummers.'] },
      waar: { tips: ['Noem de dagen waarop je kunt, en hoe ver je wilt reizen.', 'Heb je een plek om te oefenen, of zoek je die nog?', 'Zijn er kosten die je wilt delen, zoals de huur van een oefenruimte? Zeg het meteen.'],
        vb: ['Ik kan op zaterdag en zondag. Met de fiets of de tram kom ik overal in Den Haag.',
          'Ik kan op woensdagmiddag en in het weekend, in Rijswijk of Delft. Een oefenruimte heb ik nog niet.',
          'Ik kan op doordeweekse avonden, in Leiden en omgeving. De huur van een oefenruimte deel ik graag.'] },
      kennis: { tips: ['Een keer samen spelen zegt meer dan veel berichten.', 'Stel een kleine eerste stap voor, zoals één nummer samen spelen.', 'Wijs op je filmpje of opname. Dan weet de ander wat hij kan verwachten.', 'Hou het contact eerst via de app. Later kun je je e-mailadres of telefoonnummer nog geven.'],
        vb: ['Eerst een bericht hier in de app. Daarna een keer samen spelen, zonder verplichtingen, om te kijken of het klikt.',
          'Op mijn profiel staat een filmpje. Daarna spreken we af om één nummer samen te spelen.',
          'Ik kom graag een keer langs bij een repetitie. Na afloop kijken we samen of het klikt.'] },
      verder: { tips: ['Alles wat nog niet in een ander vak past, zoals wat je zelf meeneemt of wat al vaststaat.', 'Laat je dit vak leeg, dan staat het niet in je oproep.'],
        vb: ['Ik heb een eigen gitaar en versterker.', 'In de zomervakantie ben ik drie weken weg.', 'Ik kan ook de tweede stem zingen.'] }
    }
  }
};

function pbVakInhoud(sleutel) {
  const f = pbForm || {};
  const soort = f.wie && f.wie !== 'ik' ? 'band' : 'ik';
  const set = PB_VOORBEELDEN[soort];
  const vak = set.vakken[soort === 'ik' && sleutel === 'zoek' && f.soort === 'beschikbaar' ? 'zoekBeschikbaar' : sleutel];
  const tips = vak.tips.concat(sleutel === 'kennis' && pbEersteAfspraakTonen() ? [PB_TIPS.eersteAfspraak] : []);
  return { tips, vb: vak.vb, wie: set.wie };
}

function pbLeesDitEerst() {
  voorbeeldBladOpen('Lees dit eerst', `<ol class="pb-tips">${PB_LEES_DIT_EERST.map(([k, t]) => `<li><strong>${escHtml(k)}.</strong> ${escHtml(t)}</li>`).join('')}</ol>`);
}
function pbVoorbeeldenOpen(i) {
  const sleutel = PB_VAK_SLEUTELS[i];
  const v = pbVakInhoud(sleutel);
  const koppen = pbVakKoppen(pbForm.wie !== 'ik', pbForm.soort);
  voorbeeldBladOpen(koppen[i], voorbeeldenHTML(v.tips, v.wie, v.vb, n => `pbVoorbeeldGebruiken(${i},${n})`));
}
function pbVoorbeeldGebruiken(i, n) {
  const sleutel = PB_VAK_SLEUTELS[i];
  const tekst = pbVakInhoud(sleutel).vb[n];
  const t = document.getElementById('pbVak-' + sleutel);
  const zet = () => {
    t.value = tekst; pbForm.vakken[sleutel] = tekst;
    voorbeeldBladSluiten(); veldGroeit(t); clearFieldError(t); pbVakTeller(sleutel);
    t.focus(); t.setSelectionRange(t.value.length, t.value.length);
  };
  if (t.value.trim() && t.value.trim() !== tekst) showConfirm('Je tekst in dit vak wordt vervangen door het voorbeeld.', zet, 'Vervangen', false, 'Annuleren', 'Tekst vervangen?');
  else zet();
}
function pbVakTeller(sleutel) {
  updateCharCounter('pbVak-' + sleutel, 'pbVakTeller-' + sleutel, PB_VAK_MAX, PB_VAK_TELLER);
}
function pbVakInvoer(el, sleutel) {
  pbForm.vakken[sleutel] = el.value; veldGroeit(el); clearFieldError(el); pbVakTeller(sleutel);
}



function pbLegeForm() {
  return { wie: 'ik', soort: 'gezocht', doelen: [], instrumenten: [], elk: false, zangVorm: '', genres: [],
           leeftijden: [], plaats: '', straal: null, vakken: {}, media: false, kaderGezien: false };
}

async function pbPlaatsenStart(vanBand) {
  if (!currentUser || !hasOwnProfile) { profielKeuzeOpen({ soort: 'plaatsen' }); return; }
  await pbMijLaden();
  pbForm = pbLegeForm();
  pbVanBand = vanBand || null;
  if (pbVanBand) { pbForm.wie = pbVanBand.band_id; pbForm.doelen = ['band']; pbForm.instrumenten = pbVanBand.instrumenten.slice(); }
  pbLaag = 'plaatsen';
  pbTekenForm();
  pbToonLaag();
  pbVakkenGroeien();
}




function pbFormSleutel(f) {
  return JSON.stringify([f.wie, f.soort, f.doelen.slice().sort(), f.instrumenten, !!f.elk, f.zangVorm || '', f.genres,
    f.leeftijden.slice().sort(), f.plaats.trim(), f.straal || null, PB_VAK_SLEUTELS.map(k => (f.vakken[k] || '').trim()), !!f.media]);
}


function pbFormKnopTekst(f) {
  if (f.id) return 'Opslaan';
  return f.kaderGezien ? 'Toch plaatsen' : 'Oproep plaatsen';
}
function pbFormHeeftInvoer() {
  if (!pbForm) return false;
  const f = pbForm;
  if (f.id) return pbFormSleutel(f) !== f.begin;
  return !!(f.leeftijden.length || f.genres.length || f.plaats.trim() || f.straal || PB_VAK_SLEUTELS.some(k => (f.vakken[k] || '').trim())
    || (!pbVanBand && (f.doelen.length || f.instrumenten.length)));
}



function pbKnoppen(naam, keuzes, huidig, uit) {
  return `<div class="segmented-control segmented-vol pb-keuzes" data-naam="${naam}">` + keuzes.map(([w, t]) =>
    `<button type="button" class="segmented-btn${huidig === w ? ' selected' : ''}" aria-pressed="${huidig === w ? 'true' : 'false'}" ${uit && uit(w) ? 'disabled aria-disabled="true"' : ''} onclick="pbKies('${naam}','${jsAttr(w)}')">${escHtml(t)}</button>`).join('') + '</div>';
}

function pbBeheerdeBands() { return (PB_MIJ.bands || []); }







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




function pbZangVeldHTML(f) {
  return pbKeuzeveldHTML('pbFZang', f.soort === 'beschikbaar' ? 'Je bent beschikbaar als' : 'Je zoekt een', 'pbVeldZang');
}
function pbZangVeld() {
  const f = pbForm;
  const keuzes = () => PB_ZANG_VORMEN[f.soort];
  const el = document.getElementById('pbFZangField');
  if (el) el.ttKeuzeVeld = null;
  initChoiceField({
    id: 'pbFZang', fieldId: 'pbFZangField', menuId: 'pbFZangMenu',
    rijen: () => keuzes().map(([w, t]) => ({ t, gekozen: f.zangVorm === w })),
    kies: (i) => { const w = keuzes()[i][0]; f.zangVorm = f.zangVorm === w ? '' : w; refreshChoiceField('pbFZang');
      clearFieldError(document.getElementById('pbFZangField')); },
    ververs: () => { const k = keuzes().find(([w]) => w === f.zangVorm);
      pbVeldTekst('pbFZang', k ? k[1] : '', keuzes().map(x => x[1]).slice(0, 2).join(' · ') + (keuzes().length > 2 ? '…' : '')); }
  });
}

function pbTekenForm() {
  const f = pbForm;
  const bands = pbBeheerdeBands();
  const band = f.wie !== 'ik';
  const koppen = pbVakKoppen(band, f.soort);
  const html = `
    ${bands.length ? pbKeuzeveldHTML('pbFWie', 'Wie plaatst?', 'pbVeldWie') : ''}
    <div class="field">${pbKnoppen('soort', [['gezocht', 'Gezocht'], ['beschikbaar', 'Beschikbaar']], f.soort, w => band && w === 'beschikbaar')}</div>
    ${pbKeuzeveldHTML('pbFDoel', f.soort === 'beschikbaar' ? 'Waarvoor ben je beschikbaar?' : 'Waarvoor zoek je een muzikant?', 'pbVeldDoel')}
    ${pbKeuzeveldHTML('pbFInstrument', 'Instrument', 'pbVeldInstrument')}
    ${pbHeeftZang(f.instrumenten) ? pbZangVeldHTML(f) : ''}
    ${pbKeuzeveldHTML('pbFGenre', 'Genre', 'pbVeldGenre')}
    ${pbKeuzeveldHTML('pbFLeeftijden', 'Leeftijden die je oproep zien', 'pbVeldLeeftijden')}
    <div class="field" id="pbVeldPlaats"><div class="filter-row-city">
      <div class="city-search-wrap frc-plaats"><label for="pbFPlaats">Plaats</label>
        <input type="text" id="pbFPlaats" placeholder="Bijv. Den Haag" autocomplete="off" value="${escHtml(f.plaats)}" oninput="pbForm.plaats=this.value; clearFieldError(this)"></div>
      <div class="frc-straal"><label>Afstand</label><div class="menu-anchor">
        <div class="wheel-field" id="pbFAfstandField" aria-label="Afstand"><span class="wheel-field-label"></span></div>
        <div class="choice-menu" id="pbFAfstandMenu" role="listbox" aria-label="Afstand"></div></div></div>
    </div></div>
    ${PB_VAK_SLEUTELS.map((k, i) => `<div class="field">
      <div class="label-rij zoek-label-rij"><label for="pbVak-${k}">${escHtml(koppen[i])}</label>
        <button type="button" class="zoek-filters-knop pb-voorbeelden-knop" onclick="pbVoorbeeldenOpen(${i})" aria-label="Voorbeelden bij ${escHtml(koppen[i])}">Voorbeelden</button></div>
      <textarea id="pbVak-${k}" class="pb-vak" maxlength="${PB_VAK_MAX}" rows="3" oninput="pbVakInvoer(this,'${k}')">${escHtml(f.vakken[k] || '')}</textarea>
      <div class="teken-teller" id="pbVakTeller-${k}" hidden></div></div>`).join('')}
    <div class="field"><label class="zoek-onthoud${f.soort === 'beschikbaar' ? ' pb-uit' : ''}"><input type="checkbox" id="pbMedia" ${f.media ? 'checked' : ''} ${f.soort === 'beschikbaar' ? 'disabled' : ''} onchange="pbForm.media=this.checked"><span>Graag met een video of link</span></label></div>
    ${f.kaderGezien ? PB_KADER_HTML : ''}
    <button type="button" class="btn btn-primary pb-knop" id="pbNaarVoorbeeldKnop" onclick="pbNaarVoorbeeld()">${pbFormKnopTekst(f)}</button>`;
  document.querySelector('#pbFormVak .scherm-titel').textContent = f.id ? 'Oproep aanpassen' : 'Oproep plaatsen';
  document.getElementById('pbFormInhoud').innerHTML = html;
  pbFormVelden();
  PB_VAK_SLEUTELS.forEach(pbVakTeller);
}


const PB_KADER_HTML = `<div class="melding pb-kader" id="pbKader" role="alert"><div class="melding-kop">Je oproep is nog niet compleet</div>
  <div class="melding-tekst">Een volledige oproep zorgt voor betere reacties.</div></div>`;
function pbVakkenGroeien() { PB_VAK_SLEUTELS.forEach(k => veldGroeit(document.getElementById('pbVak-' + k))); }

function pbFormVelden() {
  const f = pbForm;
  const instrKeuzes = () => (f.soort === 'beschikbaar' ? PB_MIJ.instrumenten : ['Elk instrument'].concat(INSTRUMENTS));
  ['pbFWie', 'pbFDoel', 'pbFInstrument', 'pbFGenre', 'pbFLeeftijden', 'pbFAfstand', 'pbFZang'].forEach(id => {
    const el = document.getElementById(id + 'Field');
    if (el) el.ttKeuzeVeld = null;
  });


  const wieKeuzes = () => [['ik', PB_MIJ.naam || 'Ik'], ...pbBeheerdeBands().map(b => [b.id, b.name])];
  initChoiceField({
    id: 'pbFWie', fieldId: 'pbFWieField', menuId: 'pbFWieMenu',
    rijen: () => wieKeuzes().map(([w, t]) => ({ t, gekozen: f.wie === w })),
    kies: (i) => { const w = wieKeuzes()[i][0]; if (w !== f.wie) pbKies('wie', w); },
    ververs: () => { const k = wieKeuzes().find(([w]) => w === f.wie); pbVeldTekst('pbFWie', k ? k[1] : '', 'Kies wie plaatst'); }
  });


  initChoiceField({
    id: 'pbFDoel', fieldId: 'pbFDoelField', menuId: 'pbFDoelMenu', meer: true,
    rijen: () => PB_DOELEN.map(([w, t]) => ({ t, gekozen: f.doelen.includes(w) })),
    kies: (i) => { const w = PB_DOELEN[i][0]; f.doelen = f.doelen.includes(w) ? f.doelen.filter(x => x !== w) : f.doelen.concat(w);
      refreshChoiceField('pbFDoel'); clearFieldError(document.getElementById('pbFDoelField')); pbDubbelWeg(); },
    ververs: () => pbVeldTekst('pbFDoel', pbDoelenTekst(f.doelen), 'Band · Jammen · Invallen…')
  });
  initChoiceField({
    id: 'pbFInstrument', fieldId: 'pbFInstrumentField', menuId: 'pbFInstrumentMenu', meer: true,
    rijen: () => instrKeuzes().map(t => ({ t, gekozen: t === 'Elk instrument' ? f.elk : f.instrumenten.includes(t) })),
    kies: (i) => { pbKiesInstrument(instrKeuzes()[i]); },
    ververs: () => pbVeldTekst('pbFInstrument', f.elk ? 'Elk instrument' : f.instrumenten.join(', '), 'Kies een instrument')
  });


  initChoiceField({
    id: 'pbFGenre', fieldId: 'pbFGenreField', menuId: 'pbFGenreMenu', meer: true, kop: 'Kies hoogstens 3',
    rijen: () => GENRES.map(t => ({ t, gekozen: f.genres.includes(t) })),
    kies: (i) => { const g = GENRES[i];
      if (f.genres.includes(g)) f.genres = f.genres.filter(x => x !== g);
      else if (f.genres.length < 3) f.genres = f.genres.concat(g);
      refreshChoiceField('pbFGenre'); },
    ververs: () => pbVeldTekst('pbFGenre', f.genres.join(', '), 'Kies hoogstens 3')
  });

  const groepen = pbGroepen();
  f.leeftijden = f.leeftijden.filter(g => groepen.includes(g));
  initChoiceField({
    id: 'pbFLeeftijden', fieldId: 'pbFLeeftijdenField', menuId: 'pbFLeeftijdenMenu', meer: true,
    rijen: () => groepen.map(g => ({ t: g + ' jaar', gekozen: f.leeftijden.includes(g) })),
    kies: (i) => { pbKiesLeeftijd(groepen[i]); },
    ververs: () => pbVeldTekst('pbFLeeftijden', PB_LEEFTIJDEN.filter(g => f.leeftijden.includes(g)).join(', ') + (f.leeftijden.length ? ' jaar' : ''), 'Kies leeftijden')
  });


  initChoiceField({
    id: 'pbFAfstand', fieldId: 'pbFAfstandField', menuId: 'pbFAfstandMenu',
    rijen: () => STRAAL_STAPPEN.map(km => ({ t: `${km} km`, gekozen: f.straal === km })),
    kies: (i) => { const km = STRAAL_STAPPEN[i]; f.straal = f.straal === km ? null : km; refreshChoiceField('pbFAfstand'); },
    ververs: () => { const el = document.getElementById('pbFAfstandField'); if (el) zetVeldTekst(el.querySelector('.wheel-field-label'), f.straal ? `${f.straal} km` : LEEG_VELD); }
  });  if (pbHeeftZang(f.instrumenten)) pbZangVeld();
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
  if (naam === 'soort') { f.soort = w; f.instrumenten = []; f.elk = false; f.zangVorm = ''; if (w === 'beschikbaar') f.media = false; }
  const y = window.scrollY;
  pbTekenForm();
  pbVakkenGroeien();
  window.scrollTo({ top: y, behavior: 'instant' });
}
function pbKiesInstrument(w) {
  const f = pbForm;
  const zangVoor = pbHeeftZang(f.instrumenten);
  if (w === 'Elk instrument') { f.elk = !f.elk; if (f.elk) f.instrumenten = []; }
  else { f.elk = false; f.instrumenten = f.instrumenten.includes(w) ? f.instrumenten.filter(x => x !== w) : f.instrumenten.concat(w); }
  refreshChoiceField('pbFInstrument');
  clearFieldError(document.getElementById('pbFInstrumentField'));
  f.dubbel = false;

  if (zangVoor !== pbHeeftZang(f.instrumenten)) {
    if (!pbHeeftZang(f.instrumenten)) f.zangVorm = '';
    const oud = document.getElementById('pbVeldZang');
    if (oud) oud.remove();
    if (pbHeeftZang(f.instrumenten)) { document.getElementById('pbVeldInstrument').insertAdjacentHTML('afterend', pbZangVeldHTML(f)); pbZangVeld(); }
  }
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
  if (!f.doelen.length) fouten.push(['pbFDoelField', 'Kies waarvoor']);
  if (!f.elk && !f.instrumenten.length) fouten.push(['pbFInstrumentField', 'Kies een instrument']);
  if (pbHeeftZang(f.instrumenten) && !f.zangVorm) fouten.push(['pbFZangField', f.soort === 'beschikbaar' ? 'Kies zanger of zangeres' : 'Kies zanger, zangeres of allebei']);
  if (!f.leeftijden.length) fouten.push(['pbFLeeftijdenField', 'Kies minstens één leeftijd']);
  PB_VAK_SLEUTELS.forEach(k => {
    const t = (f.vakken[k] || '').trim();
    if (t && pbVakInhoud(k).vb.includes(t)) fouten.push(['pbVak-' + k, f.wie !== 'ik' ? 'Pas het voorbeeld aan, zodat het over jullie gaat' : 'Pas het voorbeeld aan, zodat het over jou gaat']);
  });
  return fouten;
}

function pbVoorbeeldOproep() {
  const f = pbForm;
  const band = f.wie !== 'ik' ? pbBeheerdeBands().find(b => b.id === f.wie) : null;
  const vakken = {};
  PB_VAK_SLEUTELS.forEach(k => { const t = (f.vakken[k] || '').trim(); if (t) vakken[k] = t; });
  return {
    soort: f.soort, doelen: PB_DOELEN.map(x => x[0]).filter(w => f.doelen.includes(w)), instrumenten: f.instrumenten, elk_instrument: f.elk,
    zang_vorm: pbHeeftZang(f.instrumenten) ? f.zangVorm || null : null, genres: f.genres.slice(),
    leeftijden: pbLeeftijdenVoorOpslaan(f), vakken, media_gewenst: f.media, geplaatst_op: new Date().toISOString(),
    band_id: band ? band.id : null, naam: band ? band.name : (PB_MIJ.naam || ''), plaatser_naam: PB_MIJ.naam || '',
    plaatser_instrument: pbMijnInstrument(band), foto: band ? band.avatar_url : PB_MIJ.foto,
    leeftijd: band ? null : PB_MIJ.leeftijd, leden_min: band ? band.leden_min : null, leden_max: band ? band.leden_max : null,
    plaats: f.plaats.trim() || (band ? band.city : PB_MIJ.plaats), band_soort: band ? band.soort : null
  };
}


function pbMijnInstrument(band) {
  const rollen = band && ((band.band_members || []).find(x => x.musician_id === myMusicianId) || {}).rollen;
  if (rollen && rollen.length) return rollen[0];
  return (PB_MIJ.instrumentenNiveau || []).slice().sort((a, b) => (b.niveau || 0) - (a.niveau || 0) || a.instrument.localeCompare(b.instrument))
    .map(x => x.instrument)[0] || '';
}





function pbDubbeleOproep(f) {
  const band = f.wie !== 'ik' ? f.wie : null;
  const m = pbMijn.find(({ oproep: o }) => o.id !== f.id && (o.status || 'open') === 'open' && new Date(o.loopt_tot) > Date.now()
    && o.soort === f.soort && (o.doelen || []).some(d => f.doelen.includes(d)) && (band ? o.band_id === band : !o.band_id)
    && ((f.elk && o.elk_instrument) || (o.instrumenten || []).some(i => f.instrumenten.includes(i))));
  return m ? m.oproep : null;
}
function pbDubbelTekst(o) { return `Je hebt al de oproep "${pbTitel(o)}". Pas die aan bij Mijn Oproepen.`; }
function pbDubbelWeg() {
  if (!pbForm || !pbForm.dubbel) return;
  pbForm.dubbel = false;
  clearFieldError(document.getElementById('pbFInstrumentField'));
}

async function pbNaarVoorbeeld() {
  const f = pbForm;
  const mijnVraag = vraagNu(db.rpc('tt_mijn_oproepen'));
  const fouten = pbFormFouten();

  f.lat = null; f.lng = null;
  if (f.plaats.trim()) {
    const o = await resolveSearchOrigin(f.plaats);
    if (o.fout) { showToast(friendlyErrorMessage(null, 'je plaats opzoeken')); return; }
    if (o.lat == null) fouten.push(['pbFPlaats', 'Deze plaats herkennen we niet.']);
    else { f.lat = o.lat; f.lng = o.lng; }
  }
  const { data: mijn, error: mijnFout } = await mijnVraag;
  if (mijnFout) logCaught('pbNaarVoorbeeld', mijnFout);
  else pbMijn = mijn || [];
  const dubbel = !fouten.some(([id]) => id === 'pbFInstrumentField') && pbDubbeleOproep(f);

  if (dubbel) { fouten.splice(fouten.length && fouten[0][0] === 'pbFDoelField' ? 1 : 0, 0, ['pbFInstrumentField', pbDubbelTekst(dubbel)]); f.dubbel = true; }
  if (fouten.length) {
    fouten.forEach(([id, t]) => setFieldError(document.getElementById(id), t));
    document.getElementById(fouten[0][0]).scrollIntoView({ block: 'center' });
    return;
  }
  if (!f.kaderGezien && PB_VAK_SLEUTELS.slice(0, 5).some(k => !(f.vakken[k] || '').trim())) {
    f.kaderGezien = true;
    const knop = document.getElementById('pbNaarVoorbeeldKnop');
    knop.insertAdjacentHTML('beforebegin', PB_KADER_HTML);
    knop.textContent = pbFormKnopTekst(f);
    document.getElementById('pbKader').scrollIntoView({ block: 'center' });
    return;
  }
  document.getElementById('pbVoorbeeldInhoud').innerHTML = pbOproepHTML(pbVoorbeeldOproep(), true);
  document.getElementById('pbPlaatsenKnop').textContent = f.id ? 'Opslaan' : 'Plaatsen';
  pbLaag = 'voorbeeld';
  pbToonLaag();
}

async function pbPlaatsen() {
  const f = pbForm;
  const o = pbVoorbeeldOproep();
  const p = {
    soort: f.soort, doelen: o.doelen, instrumenten: f.instrumenten, elk_instrument: f.elk, zang_vorm: o.zang_vorm, genres: o.genres,
    leeftijden: o.leeftijden, vakken: o.vakken, media_gewenst: f.media,
    plaats: f.plaats.trim(), lat: f.lat, lng: f.lng, straal_km: f.straal
  };
  if (f.wie !== 'ik') p.band_id = f.wie;


  if (f.id) p.id = f.id;
  const { error } = await db.rpc('tt_oproep_opslaan', { p });
  if (error && /al een oproep/.test(error.message || '')) {

    const { data: mijn } = await vraagNu(db.rpc('tt_mijn_oproepen'));
    if (mijn) pbMijn = mijn;
    const dubbel = pbDubbeleOproep(f);
    pbLaag = 'plaatsen'; pbToonLaag();
    const veld = document.getElementById('pbFInstrumentField');
    setFieldError(veld, dubbel ? pbDubbelTekst(dubbel) : error.message);
    f.dubbel = true;
    veld.scrollIntoView({ block: 'center' });
    return;
  }
  if (error) { showToast(friendlyErrorMessage(error, 'je oproep plaatsen')); return; }
  pbForm = null; pbVanBand = null;
  showToast(f.id ? 'Je oproep is aangepast.' : 'Je oproep staat op het prikbord.');
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




const PB_PIJL_OMLAAG = '<svg class="zoek-filters-pijl" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
let pbMijnOpen = null;
let pbKandidaatOpen = null;
async function pbMijnLaden() {
  const vak = document.getElementById('pbMijnLijst');
  if (!currentUser || !hasOwnProfile) { vak.innerHTML = emptyStateHTML('Nog geen profiel', 'Met een profiel plaats je een oproep.', 'Profiel aanmaken', "showView('register')"); return; }
  if (!pbMijn.length) ladenTonen(vak);
  const { data, error } = await db.rpc('tt_mijn_oproepen');
  if (error) { logCaught('pbMijnLaden', error); vak.innerHTML = foutStaatHTML(error, 'je oproepen laden', 'pbMijnLaden()'); return; }
  pbMijn = data || [];
  pbMijnTekenen();
}
function pbMijnTekenen() {
  const vak = document.getElementById('pbMijnLijst');
  if (!vak) return;
  if (!pbMijn.length) { vak.innerHTML = emptyStateHTML('Nog geen oproepen', 'Zoek je iemand, of ben je beschikbaar?', 'Oproep plaatsen', 'pbPlaatsenStart()'); return; }
  vak.innerHTML = pbMijn.map(pbMijnHTML).join('');
  pbTitelsPassen(vak);
}
function pbDagenTekst(o) { const d = pbDagenOver(o); return d === 1 ? 'Nog 1 dag' : `Nog ${d} dagen`; }
function pbMijnHTML(m) {
  const o = m.oproep;
  const reacties = m.reacties || [];
  const open = pbMijnOpen === o.id;
  const telling = !reacties.length ? 'Geen reacties' : reacties.length === 1 ? '1 kandidaat' : `${reacties.length} kandidaten`;
  const verlengen = pbDagenOver(o) <= 10;
  return `
    <div class="result-row pb-kaart-oproep${open ? ' open' : ''}" id="pbMijn-${escHtml(o.id)}">
      <div class="pb-klap" role="button" tabindex="0" aria-expanded="${open}" onclick="pbMijnKlap('${jsAttr(o.id)}')">
        <div class="result-row-top">
          <div class="result-row-avatar${o.band_id ? ' result-vierkant' : ''}">${fotoHTML(o.foto, o.naam) || ZONDER_FOTO_HTML}</div>
          <div class="result-row-main">
            <div class="result-row-name pb-eenregel">${pbTitelHTML(o)}<span class="pb-pijl">${PB_PIJL_OMLAAG}</span></div>
            <div class="result-row-meta pb-eenregel"><span class="pb-regel-kort">${escHtml(telling)}</span><span class="pb-rechts">${escHtml(pbDagenTekst(o))}</span></div>
          </div>
        </div>
      </div>
      ${open ? `<div class="pb-open">
        ${reacties.length ? `<div class="pb-kandidaten">${reacties.map(r => pbReactieHTML(o, r)).join('')}</div>` : ''}
        <div class="btn-row pb-mijn-knoppen">
          <button type="button" class="btn btn-ghost" onclick="pbAanpassen('${jsAttr(o.id)}')">Aanpassen</button>
          <button type="button" class="btn btn-ghost" ${verlengen ? '' : 'disabled'} onclick="pbVerlengen('${jsAttr(o.id)}')">Verlengen</button>
          <button type="button" class="btn btn-ghost" onclick="pbVerwijderen('${jsAttr(o.id)}')">Verwijderen</button>
        </div></div>` : ''}
    </div>`;
}

function pbMijnKlap(id) {
  pbMijnOpen = pbMijnOpen === id ? null : id;
  pbKandidaatOpen = null;
  pbMijnTekenen();
}




function pbReactieHTML(o, r) {
  const wie = [r.leeftijd != null ? r.leeftijd + ' jaar' : '', afstandTekst(r.km)].filter(Boolean).map(escHtml).join(' · ');
  const rechts = r.status === 'uitgenodigd'
    ? '<span class="pb-rechts">Uitgenodigd</span>'
    : `<button type="button" class="zoek-filters-knop pb-uitnodigen" onclick="event.stopPropagation(); pbUitnodigen('${jsAttr(r.id)}','${jsAttr(r.musician_id)}','${jsAttr(r.naam)}','${jsAttr(o.id)}')">Uitnodigen</button>`;
  const open = pbKandidaatOpen === r.id;
  const extra = [r.media ? (r.media.type === 'video' ? 'Video' : 'Link') : '',
    r.gedeeld ? (r.gedeeld === 1 ? '1 gezamenlijk nummer' : `${r.gedeeld} gezamenlijke nummers`) : ''].filter(Boolean).join(' · ');
  const d = new Date(r.created_at);
  const wanneer = `${dagLabel(d)} ${d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
  return `
    <div class="pb-kandidaat${open ? ' open' : ''}" role="button" tabindex="0" onclick="pbKandidaatKlap('${jsAttr(r.id)}','${jsAttr(o.id)}')">
      <div class="result-row-top">
        <div class="result-row-avatar">${fotoHTML(r.foto, r.naam) || ZONDER_FOTO_HTML}</div>
        <div class="result-row-main">
          <div class="result-row-name pb-eenregel"><span class="result-row-naam">${escHtml(r.naam)}</span>${r.nieuw ? '<span class="pb-nieuw">Nieuw</span>' : ''}</div>
          <div class="result-row-meta pb-eenregel"><span class="pb-regel-kort">${wie}</span>${rechts}</div>
        </div>
      </div>
      ${open ? `<div class="pb-kandidaat-vak">
        ${extra ? `<p class="pb-extra">${escHtml(extra)}</p>` : ''}
        ${r.boodschap ? `<div class="pb-ballon"><div class="message-bubble other">${escHtml(r.boodschap)}<span class="message-bubble-time">${escHtml(wanneer)}</span></div></div>` : ''}
        <button type="button" class="stille-link pb-profiel" onclick="event.stopPropagation(); openProfielScherm('${jsAttr(r.musician_id)}')">Profiel bekijken</button>
      </div>` : ''}
    </div>`;
}

function pbKandidaatKlap(reactieId, oproepId) {
  pbKandidaatOpen = pbKandidaatOpen === reactieId ? null : reactieId;
  const m = pbMijn.find(x => x.oproep.id === oproepId);
  const r = m && (m.reacties || []).find(x => x.id === reactieId);
  if (r && r.nieuw) {
    r.nieuw = false;
    db.rpc('tt_reactie_gezien', { p_reactie: reactieId }).then(({ error }) => {
      if (error) logCaught('pbKandidaatKlap', error); else pbTegelGetal();
    });
  }
  pbMijnTekenen();
}

function pbOpenMijn(id) { pbMijnOpen = id || null; pbZetTab('mijn'); }





function pbUitnodigen(reactieId, musicianId, naam, oproepId) {
  const m = pbMijn.find(x => x.oproep.id === oproepId);
  if (!m) return;
  const tekst = (m.oproep.band_id ? PB_TT.uitnodigenBand : PB_TT.uitnodigen).replace('{naam}', naam);
  gesprekTekstKlaar(musicianId, naam, tekst, oproepId, reactieId);
}

async function pbNaUitnodigen(reactieId) {
  const { error } = await db.rpc('tt_reactie_uitnodigen', { p_reactie: reactieId });
  if (error) { logCaught('pbNaUitnodigen', error); return; }
  pbMijn.forEach(m => (m.reacties || []).forEach(r => { if (r.id === reactieId) r.status = 'uitgenodigd'; }));
  if (pbTab === 'mijn') pbMijnTekenen();
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
  pbForm = Object.assign(pbLegeForm(), { id: o.id, wie: o.band_id || 'ik', soort: o.soort, doelen: (o.doelen || []).slice(),
    instrumenten: (o.instrumenten || []).slice(), elk: o.elk_instrument, zangVorm: o.zang_vorm || '', genres: (o.genres || []).slice(),
    leeftijden: (o.leeftijden || []).slice(), plaats: o.plaats || '', straal: o.straal_km || null,
    vakken: Object.assign({}, o.vakken || {}), media: o.media_gewenst });
  pbLaag = 'plaatsen';
  pbTekenForm();
  pbForm.begin = pbFormSleutel(pbForm);
  pbToonLaag();
  pbVakkenGroeien();
}






let pbWegKeuze = null;
function pbLijstje(namen) { return namen.length > 1 ? namen.slice(0, -1).join(', ') + ' en ' + namen[namen.length - 1] : namen[0]; }
function pbWegZin() {
  const m = pbMijn.find(x => x.oproep.id === pbWegKeuze.oproep);
  const kandidaten = (m && m.reacties) || [];
  if (!kandidaten.length) return 'Er zijn geen reacties. Je oproep verdwijnt.';
  if (pbWegKeuze.gekozen == null) return 'Kies wie het is geworden.';
  const gekozen = kandidaten.find(r => r.musician_id === pbWegKeuze.gekozen);
  const rest = kandidaten.filter(r => r !== gekozen).map(r => r.naam);
  const zin = rest.length ? `${pbLijstje(rest)} ${rest.length > 1 ? 'krijgen' : 'krijgt'} een vriendelijk bericht van TalentTent.` : '';

  return [gekozen ? `Het gesprek met ${gekozen.naam} opent met een bericht dat klaarstaat; pas het aan en verstuur het.` : '', zin, 'Je oproep sluit meteen.'].filter(Boolean).join(' ');
}
function pbVerwijderen(id) {
  const m = pbMijn.find(x => x.oproep.id === id);
  if (!m) return;
  const kandidaten = m.reacties || [];
  pbWegKeuze = { oproep: id, gekozen: null };
  document.getElementById('pbWegKop').textContent = kandidaten.length ? 'Wie is het geworden?' : 'Oproep verwijderen?';
  document.getElementById('pbWegKeuzes').innerHTML = kandidaten.length ? [...kandidaten.map(r => [r.musician_id, r.naam]), ['', 'Niemand']].map(([w, t]) =>
    `<button type="button" class="segmented-btn pb-weg-keuze" aria-pressed="false" data-w="${escHtml(w)}" onclick="pbWegKies(this)">${escHtml(t)}</button>`).join('') : '';
  pbWegBijwerken();
  document.getElementById('pbWegBlad').classList.add('visible');
  syncModalScrollLock();
}
function pbWegKies(knop) { pbWegKeuze.gekozen = knop.dataset.w; pbWegBijwerken(); }
function pbWegBijwerken() {
  document.querySelectorAll('#pbWegKeuzes .pb-weg-keuze').forEach(b => {
    const aan = b.dataset.w === pbWegKeuze.gekozen;
    b.classList.toggle('selected', aan); b.setAttribute('aria-pressed', aan ? 'true' : 'false');
  });
  document.getElementById('pbWegZin').textContent = pbWegZin();
  const m = pbMijn.find(x => x.oproep.id === pbWegKeuze.oproep);
  document.getElementById('pbWegKnop').disabled = !!(m && (m.reacties || []).length) && pbWegKeuze.gekozen == null;
}
function pbWegSluiten() { document.getElementById('pbWegBlad').classList.remove('visible'); syncModalScrollLock(); }
async function pbWegBevestigen() {
  const k = pbWegKeuze;
  if (!k) return;
  const m = pbMijn.find(x => x.oproep.id === k.oproep);
  const gekozen = k.gekozen ? (m.reacties || []).find(r => r.musician_id === k.gekozen) : null;
  const { error } = await db.rpc('tt_oproep_sluiten', { p_id: k.oproep, p_reden: gekozen ? 'gevonden' : 'verwijderd', p_gekozen: gekozen ? gekozen.musician_id : null });
  if (error) { showToast(friendlyErrorMessage(error, 'de oproep verwijderen')); return; }
  pbWegSluiten();
  pbWegKeuze = null; pbMijnOpen = null;
  if (!gekozen) { showToast('Je oproep is verwijderd.'); pbMijnLaden(); pbTegelGetal(); return; }

  const tekst = (m.oproep.band_id ? PB_TT.gekozenBand : PB_TT.gekozen).replace('{naam}', gekozen.naam);


  pbMijn = pbMijn.filter(x => x.oproep.id !== k.oproep);
  pbMijnTekenen();
  pbTegelGetal();
  gesprekTekstKlaar(gekozen.musician_id, gekozen.naam, tekst);
}





let pbReacties = [];
let pbReactieOpen = null;
async function pbReactiesLaden() {
  const vak = document.getElementById('pbReactiesLijst');
  if (!currentUser || !hasOwnProfile) { vak.innerHTML = emptyStateHTML('Nog geen profiel', 'Met een profiel reageer je op een oproep.', 'Profiel aanmaken', "showView('register')"); return; }
  if (!pbReacties.length) ladenTonen(vak);
  const { data, error } = await db.rpc('tt_mijn_reacties');
  if (error) { logCaught('pbReactiesLaden', error); vak.innerHTML = foutStaatHTML(error, 'je reacties laden', 'pbReactiesLaden()'); return; }
  pbReacties = data || [];
  pbReactiesTekenen();
}
function pbReactiesTekenen() {
  const vak = document.getElementById('pbReactiesLijst');
  if (!vak) return;
  if (!pbReacties.length) { vak.innerHTML = emptyStateHTML('Nog geen reacties', 'Tik op een oproep en kies Reageren.', 'Alle oproepen', "pbZetTab('alle')"); return; }
  vak.innerHTML = pbReacties.map(r => {
    const o = r.oproep;
    const isOpen = o.status === 'open';
    const stand = !isOpen ? 'Gesloten' : r.status === 'uitgenodigd' ? 'Je bent uitgenodigd' : 'Reactie verstuurd';
    const open = pbReactieOpen === r.id;
    const d = new Date(r.created_at);
    const wanneer = `${dagLabel(d)} ${d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}`;
    const knoppen = isOpen ? [`<button type="button" class="btn btn-ghost" onclick="pbReactieOproep('${jsAttr(o.id)}')">Oproep bekijken</button>`,
      r.status === 'uitgenodigd' ? `<button type="button" class="btn btn-ghost" onclick="openMessageComposer('${jsAttr(o.plaatser_id)}','${jsAttr(o.naam)}')">Naar het gesprek</button>` : '',
      `<button type="button" class="btn btn-ghost" onclick="pbIntrekken('${jsAttr(r.id)}')">Intrekken</button>`].filter(Boolean)

      : r.status === 'uitgenodigd' ? [`<button type="button" class="btn btn-ghost" onclick="openMessageComposer('${jsAttr(o.plaatser_id)}','${jsAttr(o.naam)}')">Naar het gesprek</button>`] : [];
    return `
      <div class="result-row pb-kaart-oproep${open ? ' open' : ''}">
        <div class="pb-klap" role="button" tabindex="0" aria-expanded="${open}" onclick="pbReactieKlap('${jsAttr(r.id)}')">
          <div class="result-row-top">
            <div class="result-row-avatar${o.band_id ? ' result-vierkant' : ''}">${fotoHTML(o.foto, o.naam) || ZONDER_FOTO_HTML}</div>
            <div class="result-row-main">
              <div class="result-row-name pb-eenregel">${pbTitelHTML(o)}<span class="pb-pijl">${PB_PIJL_OMLAAG}</span></div>
              <div class="result-row-meta pb-eenregel"><span class="pb-regel-kort">${isOpen ? escHtml(pbDagenTekst(o)) : ''}</span><span class="pb-rechts">${escHtml(stand)}</span></div>
            </div>
          </div>
        </div>
        ${open ? `<div class="pb-open">
          ${r.boodschap ? `<div class="pb-ballon"><div class="message-bubble own">${escHtml(r.boodschap)}<span class="message-bubble-time">${escHtml(wanneer)}</span></div></div>` : ''}
          ${knoppen.length ? `<div class="btn-row pb-mijn-knoppen">${knoppen.join('')}</div>` : ''}
        </div>` : ''}
      </div>`;
  }).join('');
  pbTitelsPassen(vak);
}
function pbReactieKlap(id) { pbReactieOpen = pbReactieOpen === id ? null : id; pbReactiesTekenen(); }
async function pbReactieOproep(id) {
  const { data, error } = await db.rpc('tt_prikbord', { p_lat: null, p_lng: null, p_straal_km: 100, p_id: id });
  if (error) { logCaught('pbReactieOproep', error); showToast(friendlyErrorMessage(error, 'de oproep openen')); return; }
  if (!data || !data.length) { showToast(PB_LINK_WEG); return; }
  pbLijst = pbLijst.filter(x => x.id !== data[0].id).concat(data[0]);
  pbOpenOproep(data[0].id);
}

function pbIntrekken(id) {
  showConfirm('De plaatser krijgt een bericht dat je niet meer meedoet.', async () => {
    const { error } = await db.rpc('tt_reactie_intrekken', { p_reactie: id });
    if (error) { showToast(friendlyErrorMessage(error, 'je reactie intrekken')); return; }
    showToast('Je reactie is ingetrokken.');
    pbReactieOpen = null;
    pbReactiesLaden();
  }, 'Intrekken', false, 'Annuleren', 'Reactie intrekken?');
}




async function pbOpenKaartje(id) {
  const { data, error } = await db.rpc('tt_prikbord', { p_lat: null, p_lng: null, p_straal_km: 100, p_id: id });
  if (error) { logCaught('pbOpenKaartje', error); return; }
  if (!data || !data.length) { showToast(PB_LINK_WEG); return; }
  pbOpenVanBuiten(data[0]);
}






const PB_TT = {
  oproep_bedankt: 'De oproep "{titel}" is afgesloten. Bedankt voor je interesse en succes met zoeken.',
  reactie_ingetrokken: '{naam} doet niet meer mee met je oproep "{titel}".',
  oproep_loopt_af: 'Je oproep "{titel}" loopt over 10 dagen af. Ben je nog op zoek? Verleng de oproep bij Mijn Oproepen. Heb je iemand gevonden? Verwijder dan de oproep, dan krijgen de andere kandidaten bericht.',
  nieuwe_reacties: '{aantal} nieuwe kandidaten voor "{titel}".',
  nieuwe_reactie: '1 nieuwe kandidaat voor "{titel}".',
  nieuwe_reacties_meer: 'Nieuwe kandidaten: {lijst}.',
  reacties_op: '{aantal} voor "{titel}"',
  oproepen: 'Er zijn {aantal} nieuwe oproepen bij jou in de buurt.',
  oproep: 'Er is 1 nieuwe oproep bij jou in de buurt.',
  knopPrikbord: 'Naar het prikbord',

  knopMijn: 'Naar Mijn Oproepen',
  knopReacties: 'Naar Mijn Reacties',


  uitnodigen: 'Hoi {naam}, leuk dat je reageerde op mijn oproep. Zullen we binnenkort afspreken? Wat denk je van …?',
  uitnodigenBand: 'Hoi {naam}, leuk dat je reageerde op onze oproep. Zullen we binnenkort afspreken? Wat denk je van …?',
  bericht: 'Hoi {naam}, ik zag je oproep. Zullen we binnenkort afspreken? Wat denk je van …?',
  gekozen: 'Hoi {naam}, ik wil graag met je verder. Zullen we snel afspreken? Wat denk je van …?',
  gekozenBand: 'Hoi {naam}, we willen graag met je verder. Zullen we snel afspreken? Wat denk je van …?'
};
function pbTtNaam(id, band, info) {
  if (band && info && info.bands[band]) return info.bands[band].name;
  const m = info && info.muzikanten[id];
  return m ? displayNameOf(m) : 'De plaatser';
}

function pbTtTitel(x, info) {
  return pbTitel({ instrumenten: x.instrumenten, elk_instrument: x.elk, soort: x.oproep_soort || x.soort, zang_vorm: x.zang_vorm,
    naam: pbTtNaam(x.plaatser, x.band, info) });
}
function pbTtKernzin(inh, info) {
  if (inh.soort === 'oproepen') {
    const n = (inh.oproepen || []).length + (Number(inh.meer) || 0);
    return n === 1 ? PB_TT.oproep : PB_TT.oproepen.replace('{aantal}', n);
  }

  if (inh.soort === 'nieuwe_reacties') {
    const lijst = (inh.oproepen || []).map(x => ({ aantal: x.aantal, titel: pbTtTitel(x, info) }));
    if (!lijst.length) return '';
    if (lijst.length === 1) {
      const x = lijst[0];
      return (x.aantal === 1 ? PB_TT.nieuwe_reactie : PB_TT.nieuwe_reacties.replace('{aantal}', x.aantal)).replace('{titel}', x.titel);
    }
    const delen = lijst.map(x => PB_TT.reacties_op.replace('{aantal}', x.aantal).replace('{titel}', x.titel));
    return PB_TT.nieuwe_reacties_meer.replace('{lijst}', delen.slice(0, -1).join(', ') + ' en ' + delen[delen.length - 1]);
  }
  const naam = inh.soort === 'reactie_ingetrokken' ? pbTtNaam(inh.wie, null, info) : '';
  return (PB_TT[inh.soort] || '').replace('{naam}', naam).replace('{titel}', pbTtTitel(inh, info));
}
function pbTtBerichtHTML(bericht, info) {
  const inh = bericht.inhoud || {};
  const kop = pbTtKernzin(inh, info);
  if (!kop) return '';
  const mijn = ['reactie_ingetrokken', 'oproep_loopt_af', 'nieuwe_reacties'].includes(inh.soort);
  const tab = mijn ? 'mijn' : inh.soort === 'oproep_bedankt' ? 'reacties' : 'alle';
  const knop = `<button type="button" class="tt-meer" onclick="openPrikbordVanuitBericht('${tab}')">${escHtml({ mijn: PB_TT.knopMijn, reacties: PB_TT.knopReacties, alle: PB_TT.knopPrikbord }[tab])}</button>`;
  const tijd = new Date(bericht.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });


  const rijen = inh.soort === 'oproepen' ? (inh.oproepen || []).filter(x => x.soort && !isGeblokkeerd(x.plaatser)).map(x => {
    const bi = x.band && info.bands[x.band], mi = info.muzikanten[x.plaatser];
    const o = { instrumenten: x.instrumenten, elk_instrument: x.elk, soort: x.soort, zang_vorm: x.zang_vorm, band_id: x.band || null,
      naam: bi ? bi.name : mi ? displayNameOf(mi) : '', plaatser_naam: mi ? displayNameOf(mi) : '', plaatser_instrument: x.plaatser_instrument,
      genres: x.genres || [], leeftijd: x.leeftijd, km: x.km };
    return `<button type="button" class="bb-rij bb-rij-knop" onclick="pbOpenKaartje('${jsAttr(x.id)}')">${bbFotoHTML(bi ? bi.avatar_url : mi && mi.avatar_url, false, !!bi)}<span class="bb-tekst"><span class="bb-naam pb-eenregel">${pbTitelHTML(o, 'pb-bb-titel')}</span><span class="bb-sub pb-eenregel">${pbRegelHTML(o)}</span></span></button>`;
  }).join('') : '';
  if (rijen) setTimeout(() => pbTitelsPassen(document.getElementById('messagesThreadList')), 0);
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
  pbReacties = []; pbMijnOpen = null; pbKandidaatOpen = null; pbReactieOpen = null; pbWegKeuze = null;
  Object.assign(PB_MIJ, { instrumenten: [], instrumentenNiveau: [], bands: [], leeftijd: null, naam: '', foto: '', plaats: '', voor: null });
  pbBewaard = undefined; pbBewaardVoor = null; pbVertrek = null; pbOproepenAan = null;
  ['pbResultaat', 'pbMijnLijst', 'pbReactiesLijst', 'pbOproepInhoud', 'pbFormInhoud', 'pbVoorbeeldInhoud', 'pbReagerenInhoud', 'voorbeeldBladInhoud', 'pbWegKeuzes']
    .forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = ''; });
  ['pbReagerenModal', 'voorbeeldBlad', 'pbWegBlad'].forEach(id => { const el = document.getElementById(id); if (el) el.classList.remove('visible'); });
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
  if (error) { logCaught('pbTegelGetal', error); return; }
  [el, el2].forEach(e => { if (e) { e.textContent = data || ''; e.hidden = !data; } });
}

pbReagerenVersturen = slotOm(pbReagerenVersturen, 'pbVersturenKnop');
pbPlaatsen = slotOm(pbPlaatsen, 'pbPlaatsenKnop');
pbVerlengen = slotOm(pbVerlengen);
pbUitnodigen = slotOm(pbUitnodigen);
pbNaarVoorbeeld = slotOm(pbNaarVoorbeeld, 'pbNaarVoorbeeldKnop');
pbWegBevestigen = slotOm(pbWegBevestigen, 'pbWegKnop');
