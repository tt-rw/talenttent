// ─── TT-41: banduitnodigingen bevestigen ─────────────────────────────────────
// Bewust een banner op Mijn Profiel en niet een bericht in de inbox (besluit
// Ronald, 08-08-2026): één klik, geen tussenscherm, en het staat op de plek
// waar iemand na het inloggen sowieso terechtkomt. De banner verschijnt alleen
// als er daadwerkelijk iets open staat — geen lege plek in het scherm.
async function loadBandInvites(musicianId) {
  const el = document.getElementById('bandInvitesBanner');
  if (!el) return;
  el.innerHTML = '';
  try {
    const { data, error } = await db.from('band_members')
      .select('band_id, bands(name, city)')
      .eq('musician_id', musicianId).eq('status', 'aangevraagd');
    // TT-230: Supabase gooit hier niets — een mislukte vraag komt terug als
    // `error` naast lege data. Zonder deze regel viel dat samen met "geen
    // uitnodigingen" en verdween de fout spoorloos.
    if (error) { logCaught('loadBandInvites', error); return; }
    if (!data || !data.length) return;

    el.innerHTML = data.map(inv => {
      const naam = inv.bands?.name || 'Een band';
      const plaats = inv.bands?.city || '';
      return `
      <div class="melding">
        <p class="melding-kop">${escHtml(naam)} wil je als lid</p>
        <p class="melding-tekst">${escHtml(plaats)}${plaats ? ' · ' : ''}Je staat pas op het bandprofiel als je dit bevestigt.</p>
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="respondToBandInvite('${jsAttr(inv.band_id)}', false)">Weigeren</button>
          <button class="btn btn-primary" onclick="respondToBandInvite('${jsAttr(inv.band_id)}', true)">Bevestigen</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    logCaught('loadBandInvites', e);
    // Een mislukte uitnodigingencheck mag Mijn Profiel nooit blokkeren —
    // stilzwijgend niets tonen is hier beter dan een foutmelding bovenaan.
  }
}

async function respondToBandInvite(bandId, accept) {
  const mid = await getMyMusicianId();
  if (!mid) return;
  try {
    const { error } = await db.from('band_members')
      .update({ status: accept ? 'bevestigd' : 'geweigerd' })
      .eq('band_id', bandId).eq('musician_id', mid);
    if (error) throw error;
    showToast(accept ? 'Je staat nu als lid op het bandprofiel.' : 'Uitnodiging geweigerd.');
    loadBandInvites(mid);
    if (accept) profielBandsVerversen();
  } catch (e) {
    logCaught('respondToBandInvite', e);
    showToast(friendlyErrorMessage(e));
  }
}

// V-16 (13-08-2026): banner op Mijn Profiel voor een bevestigd lid dat is
// gevraagd het oprichterschap over te nemen (band_members.founder_offer).
// Vereist het losse script F-V16-oprichterschap-aanbod.sql — zonder die
// kolom faalt de vraag stil en blijft de banner leeg, net als bij een
// mislukte loadBandInvites()-aanroep hierboven.
async function loadFounderOffers(musicianId) {
  const el = document.getElementById('founderOfferBanner');
  if (!el) return;
  el.innerHTML = '';
  // 22-08-2026 (Ronald): een overnameverzoek trekt zichzelf na 7 dagen in —
  // geen cron-taak beschikbaar, dus deze controle draait "lazy" mee bij elke
  // keer dat de banner wordt opgebouwd. Fouten hier zijn nooit blokkerend.
  // Niet blokkerend voor de banner, wel loggen (TT-230).
  try { await db.rpc('tt_expire_old_founder_offers'); }
  catch (e) { logCaught('loadFounderOffers/expire', e); }
  try {
    const { data, error } = await db.from('band_members')
      .select('band_id, bands(name, city)')
      .eq('musician_id', musicianId).eq('status', 'bevestigd').eq('founder_offer', true);
    // TT-230: zie loadBandInvites() hierboven. Ontbreekt de kolom
    // `founder_offer`, of blokkeert een RLS-regel de vraag, dan staat dat
    // vanaf nu in de console en in app_error_log.
    if (error) { logCaught('loadFounderOffers', error); return; }
    if (!data || !data.length) return;

    el.innerHTML = data.map(off => {
      const naam = off.bands?.name || 'Een band';
      return `
      <div class="melding">
        <p class="melding-kop">De beheerder van ${escHtml(naam)} stopt</p>
        <p class="melding-tekst">Wil jij het beheer overnemen? Zeg je nee, dan blijft de huidige beheerder voorlopig aan.</p>
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="respondToFounderOffer('${jsAttr(off.band_id)}', false)">Nee, liever niet</button>
          <button class="btn btn-primary" onclick="respondToFounderOffer('${jsAttr(off.band_id)}', true)">Ik neem het over</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    logCaught('loadFounderOffers', e);
    // Zelfde keuze als loadBandInvites(): stilzwijgend niets tonen i.p.v.
    // Mijn Profiel blokkeren met een foutmelding.
  }
}

async function respondToFounderOffer(bandId, accept) {
  const mid = await getMyMusicianId();
  if (!mid) return;
  try {
    if (accept) {
      // 22-08-2026: dit liep eerder via drie losse schrijfacties vanuit de
      // sessie van de ACCEPTERENDE gebruiker — die had op dat moment nog
      // geen founder-rechten, dus twee van de drie faalden stil (geen
      // foutmelding, gewoon 0 rijen geraakt). Gevolg, live aangetroffen: de
      // oude beheerder bleef naast de nieuwe als "Oprichter" staan. Nu één
      // databasefunctie die dit met verhoogde rechten in één keer doet, na
      // een eigen controle dat er echt een openstaand aanbod is.
      const { error } = await db.rpc('tt_accept_founder_offer', { p_band_id: bandId });
      if (error) throw error;
      showToast('Je bent nu beheerder van deze band.');
    } else {
      // TT-230: het resultaat werd hier niet gelezen. Mislukte de schrijfactie,
      // dan zag de gebruiker toch "Aanbod geweigerd" en bleef het aanbod staan.
      const { error } = await db.from('band_members').update({ founder_offer: false, founder_offer_at: null }).eq('band_id', bandId).eq('musician_id', mid);
      if (error) throw error;
      showToast('Aanbod geweigerd.');
    }
    loadFounderOffers(mid);
    loadMyBands();
    if (accept) profielBandsVerversen();
  } catch (e) {
    logCaught('respondToFounderOffer', e);
    showToast(friendlyErrorMessage(e));
  }
}

// V-16: de oprichter geeft aan te willen stoppen. Is er niemand anders
// bevestigd, dan is overdragen zinloos — direct de keuze voor opheffen.
// Zijn er wel anderen, dan gaat eerst het aanbod uit; de oprichter blijft
// oprichter totdat iemand "Ik neem het over" heeft geklikt (of totdat hij
// het aanbod intrekt en zelf voor opheffen kiest).
async function askFounderTransfer(bandId) {
  try {
    const { data: band, error } = await db.from('bands')
      .select('name, band_members(musician_id, status)').eq('id', bandId).single();
    if (error || !band) throw error || new Error('Kon band niet laden.');
    const mid = await getMyMusicianId();
    const others = (band.band_members || []).filter(m => m.status === 'bevestigd' && m.musician_id !== mid);

    if (!others.length) {
      showConfirm(
        `Je bent het enige bevestigde lid van "${band.name}". Er is niemand om het beheer aan over te dragen. Stoppen betekent dat de band wordt opgeheven.`,
        () => dissolveBand(bandId),
        'Band opheffen',
        true
      );
      return;
    }

    showConfirm(
      `Je vraagt ${others.length === 1 ? 'het andere bevestigde lid' : `de ${others.length} andere bevestigde leden`} van "${band.name}" of iemand het beheer wil overnemen. Neemt niemand het over, dan blijf jij voorlopig beheerder.`,
      () => sendFounderOffer(bandId, others.map(m => m.musician_id)),
      'Vragen'
    );
  } catch (e) {
    logCaught('askFounderTransfer', e);
    showToast(friendlyErrorMessage(e));
  }
}

async function sendFounderOffer(bandId, memberIds) {
  try {
    // 22-08-2026 (Ronald): een overnameverzoek trekt zichzelf na 7 dagen in
    // — founder_offer_at is het moment waarop die klok gaat lopen.
    const { error } = await db.from('band_members').update({ founder_offer: true, founder_offer_at: new Date().toISOString() }).eq('band_id', bandId).in('musician_id', memberIds);
    if (error) throw error;
    showToast('Gevraagd of iemand het overneemt. Je ziet het hier zodra iemand reageert.');
    loadMyBands();
    // TT-127-restpunt (27-08-2026): de knop toont meteen "Aanbod intrekken",
    // niet pas na sluiten en heropenen. Sinds TT-385 staat hij in het blok
    // Bandbeheer van Bandprofiel bewerken.
    if (bewerkBandId === bandId) renderBandBeheer();
  } catch (e) {
    logCaught('sendFounderOffer', e);
    showToast(friendlyErrorMessage(e));
  }
}

async function withdrawFounderOffer(bandId) {
  try {
    const { error } = await db.from('band_members').update({ founder_offer: false, founder_offer_at: null }).eq('band_id', bandId);
    if (error) throw error;
    showToast('Aanbod ingetrokken.');
    loadMyBands();
    if (bewerkBandId === bandId) renderBandBeheer();
  } catch (e) {
    logCaught('withdrawFounderOffer', e);
    showToast(friendlyErrorMessage(e));
  }
}

// TT-312 (25-09-2026): "Gezocht", de leden en de band in één
// databasefunctie, in één transactie. Vroeger wiste de app "Gezocht" en de
// leden zonder foutcontrole, en pas daarna de band. Mislukte dat laatste,
// dan bleef een band over zonder leden en zonder beheerder. Zelfde oplossing
// als TT-281.
async function dissolveBand(bandId) {
  try {
    const { error } = await db.rpc('tt_dissolve_band', { p_band_id: bandId });
    if (error) throw error;
    showToast('Band opgeheven.');
    // TT-385: opheffen gebeurt in Bandprofiel bewerken. Dat scherm hoort dan
    // bij een band die er niet meer is; terug naar Mijn Bands.
    if (bewerkBandId === bandId) { showView('bands'); return; }
    loadMyBands();
  } catch (e) {
    logCaught('dissolveBand', e);
    showToast('Opheffen is niet gelukt: ' + friendlyErrorMessage(e));
  }
}

// V-16: een gewoon lid verlaat de band zelf — geen overdracht nodig, de
// oprichter blijft gewoon oprichter.
// TT-385 (huisstijl §19): de vraag noemt het gevolg, de knop de handeling.
// Zelfde vorm als "Uit de band" hieronder.
function leaveBand(bandId, bandName) {
  showConfirm(
    `Je staat dan niet meer in de bezetting van ${bandName}.`,
    () => executeLeaveBand(bandId),
    'Band verlaten'
  );
}

// Het blok Bands op Mijn Profiel (TT-385 punt 17) wordt bij het openen van
// het scherm geladen. Verandert je lidmaatschap terwijl Mijn Profiel eronder
// openstaat (de bandpagina opent erbovenop), dan moet het blok mee. Bevinding
// Ronald, 06-10-2026: na "Band verlaten" bleef de band op het profiel staan.
function profielBandsVerversen() {
  if (document.getElementById('view-myprofile')?.classList.contains('active')) loadMyProfile();
}

async function executeLeaveBand(bandId) {
  const mid = await getMyMusicianId();
  if (!mid) return;
  try {
    // .select(): zonder dat meldt de database ook succes als de regels de
    // verwijdering weigeren (0 rijen geraakt, geen fout; zie TT-230).
    const { data, error } = await db.from('band_members').delete().eq('band_id', bandId).eq('musician_id', mid).select('musician_id');
    if (error) throw error;
    if (!data || !data.length) throw new Error('Band verlaten is niet gelukt.');
    showToast('Je hebt de band verlaten.');
    // TT-385: band verlaten kan ook vanaf de bandpagina; die gaat dan dicht.
    document.getElementById('bandModal').classList.remove('visible');
    loadMyBands();
    profielBandsVerversen();
  } catch (e) {
    logCaught('executeLeaveBand', e);
    showToast(friendlyErrorMessage(e));
  }
}

// V-16: de oprichter kan zelf ook een lid uit de band halen (i.p.v. wachten
// tot iemand zelf vertrekt).
// TT-385 (keuze a van Ronald: "alsof een bandlid een ding is wat je
// weggooit"): "Uit de band" in plaats van "Verwijderen". De vraag noemt het
// gevolg (huisstijl §19), zonder rood. Sinds TT-385 achter de drie puntjes in
// de rij van het lid, in de tegel Onze bezetting.
function removeMember(bandId, musicianId, memberName, bandName) {
  showConfirm(
    `${memberName} staat dan niet meer in de bezetting van ${bandName}.`,
    () => executeRemoveMember(bandId, musicianId, memberName),
    'Uit de band'
  );
}

async function executeRemoveMember(bandId, musicianId, memberName) {
  try {
    const { error } = await db.from('band_members').delete().eq('band_id', bandId).eq('musician_id', musicianId);
    if (error) throw error;
    showToast(`${memberName} is uit de band.`);
    loadMyBands();
    // De lijst in Onze bezetting klopt meteen, niet pas na heropenen.
    if (bewerkBandId === bandId) bbLaadLeden();
  } catch (e) {
    logCaught('executeRemoveMember', e);
    showToast(friendlyErrorMessage(e));
  }
}

// ─── Mijn bands ───────────────────────────────────────────────────────────────

// ─── De korte wizard (TT-385 fase 4, 02-10-2026, besluiten Ronald) ──────────
// Eén scherm met drie vragen: naam, postcode en plaats, genres. Daarna staat
// de band en opent de privé bandpagina. De balk begint op 0% en loopt 5% op
// per ingevuld veld, tot de 15% waarop de bandpagina begint (besluit a).
// De wizard staat in view-bands, op de plek van de lijst: geen zestiende view.
// Hij is een stap in de geschiedenis, zoals een tegelscherm. Dus de
// terugknop in de kop en die van het toestel sluiten eerst de wizard, met
// dezelfde vraag "Terug zonder opslaan?" als een tegel (TT-302). De
// afhandeling staat in de popstate van core.js.
let bandState = { genres: [] }; // de genres die de wizard kiest
let bandWizardStap = false;   // de wizard staat als stap in de geschiedenis
let bandWizardDaarna = null;  // wat er gebeurt zodra die stap terug is

function bandWizardOpen() {
  const form = document.getElementById('createBandForm');
  return !!form && form.style.display === 'block';
}

function zetBandWizardZichtbaar(aan) {
  document.getElementById('createBandForm').style.display = aan ? 'block' : 'none';
  document.getElementById('mijnBandsKop').style.display = aan ? 'none' : 'flex';
  document.getElementById('myBandsList').style.display = aan ? 'none' : '';
}

async function showCreateBandForm() {
  if (bandWizardOpen()) return;
  // TT-336 (besluit Ronald, 1a): een band oprichten kan pas na de klik in de
  // mail. Eerst vragen, dan pas de wizard: anders vult iemand alles in voor
  // niets. Om dezelfde reden eerst het profiel.
  const wacht = await emailWachtOpBevestiging();
  if (wacht) { showToast(emailBevestigMelding(wacht, 'een band oprichten')); return; }
  if (!(await getMyMusicianId())) { showToast('Maak eerst een muzikantprofiel aan.'); return; }
  resetBandForm();
  zetBandWizardZichtbaar(true);
  window.scrollTo(0, 0);
  if (!bandWizardStap) bandWizardStap = safeHistoryPush({ view: 'bands', wizard: true }, '#bands');
  werkTerugKnopBij(); // TT-301: een open wizard is een stap terug
  initBandForm();
  bandWizardBalkBij();
  setTimeout(() => document.getElementById('bandName')?.focus(), 50);
}

// Sluit de wizard. Staat hij als stap in de geschiedenis, dan gaat die stap
// terug. `daarna` draait pas als die stap weg is: anders sluit de terugstap
// meteen het venster dat `daarna` opent.
function sluitBandWizard(daarna) {
  ontwapenTerug();
  resetBandForm();
  zetBandWizardZichtbaar(false);
  if (bandWizardStap) {
    bandWizardDaarna = daarna || null;
    history.back();
  } else if (daarna) {
    daarna();
  }
}

// De balk loopt 5% op per ingevuld veld: drie velden samen zijn de 15%
// waarop de bandpagina begint.
function bandWizardBalkBij() {
  const plek = document.getElementById('bandWizardBalk');
  if (!plek) return;
  const ingevuld = [
    !!document.getElementById('bandName').value.trim(),
    bandPostcodeResolved && !!document.getElementById('bandCity').value.trim(),
    bandState.genres.length > 0
  ].filter(Boolean).length;
  plek.innerHTML = voortgangsBalkHTML(Math.round(BAND_START_PCT * ingevuld / 3));
}

// Staat er iets ingevuld? Dan vraagt Terug eerst "Terug zonder opslaan?".
function hasUnsavedBandFormInput() {
  const nameEl = document.getElementById('bandName');
  const zipEl = document.getElementById('bandZip');
  return !!((nameEl && nameEl.value.trim()) || (zipEl && zipEl.value.trim()) || bandState.genres.length);
}

function resetBandForm() {
  bandState = { genres: [] };
  bandPostcodeResolved = false;
  bandPostcodeFailStreak = 0;
  bandPostcodeManualMode = false;
  bandCitySource = 'pdok';
  const nameEl = document.getElementById('bandName');
  const zipEl = document.getElementById('bandZip');
  const cityEl = document.getElementById('bandCity');
  if (nameEl) nameEl.value = '';
  if (zipEl) zipEl.value = '';
  if (cityEl) { cityEl.value = ''; cityEl.readOnly = true; cityEl.style.cursor = 'not-allowed'; cityEl.style.opacity = '0.85'; }
  const statusEl = document.getElementById('bandPostcodeStatus');
  if (statusEl) statusEl.textContent = '';
  clearFieldErrors('createBandForm');
  if (PICKERS.bandGenre) renderPickerBadges(PICKERS.bandGenre);
  // Bekijk hier de postcode van het formulier, niet die van de tegel.
  bandPostcodeDoel = 'band';
}

// Lid uitnodigen (de zoeklijst in #addMemberModal). Sinds TT-385 geopend
// vanuit de tegel Onze bezetting.
let addMemberBandId = null;
let memberSearchTimer = null;

let addMemberBandName = ''; // V-18: nodig voor de tekst in het uitnodigingsbericht

// TT-253: de gekozen instrumenten (hooguit één) en de velden van Lid
// uitnodigen. Dezelfde componenten als Vind een muzikant (initPicker,
// initWheelField), geen eigen variant.
const memberSearchInstruments = [];
function memberSearchVeldenInit() {
  if (PICKERS.memberSearchInstruments) return;
  const zoek = () => searchMembersToAdd(document.getElementById('memberSearchInput').value);
  initPicker({
    id: 'memberSearchInstruments',
    fieldId: 'memberSearchInstrumentsField', badgeRowId: 'memberSearchInstrumentsBadgeRow',
    options: INSTRUMENTS, getList: () => memberSearchInstruments,
    singleMax: true,
    placeholder: 'Kies een instrument',
    sheetTitle: 'Kies een instrument',
    onChange: zoek
  });
  initWheelField({
    id: 'memberRadius',
    fieldId: 'memberSearchRadiusField',
    title: 'Straal',
    unit: 'km',
    // '' heet in het wiel "Alle", zoals elke lege stand (initWheel()).
    columns: [{ inputId: 'memberSearchRadius', values: [''].concat(WHEEL_RADIUS), ariaLabel: 'Zoekstraal in kilometers' }],
    value: [''],
    clearTo: [''],
    format: (v) => v[0] ? `${v[0]} km` : 'Alle',
    hint:   (v) => v[0] ? `Straal ${v[0]} km` : 'Elke afstand',
    onChange: zoek
  });
}

function openAddMemberModal(bandId, bandName) {
  addMemberBandId = bandId;
  addMemberBandName = bandName || '';
  document.getElementById('memberSearchInput').value = '';
  // TT-253 (02-10-2026): instrument is een keuzeveld en straal een wielveld,
  // zoals in Vind een muzikant. Eén keer opgebouwd, bij elke opening leeg:
  // anders blijft een eerdere keuze onopgemerkt actief bij de volgende band.
  memberSearchVeldenInit();
  memberSearchInstruments.length = 0;
  renderPickerBadges(PICKERS.memberSearchInstruments);
  setWheelFieldValues('memberRadius', [''], false);
  const cityEl = document.getElementById('memberSearchCity');
  if (cityEl) cityEl.value = '';
  const cityStatusEl = document.getElementById('memberSearchCityStatus');
  if (cityStatusEl) cityStatusEl.textContent = '';
  document.getElementById('memberSearchResults').innerHTML = '<p style="color:var(--muted);font-size:13px;">Typ minimaal 2 tekens, kies een instrument, of vul een plaats in, om te zoeken.</p>';
  document.getElementById('addMemberModal').classList.add('visible');
  setTimeout(() => document.getElementById('memberSearchInput')?.focus(), 50);
}

function searchMembersToAdd(query) {
  clearTimeout(memberSearchTimer);
  const q = query.trim();
  const instrument = memberSearchInstruments[0] || ''; // TT-253: keuzeveld i.p.v. <select>
  // TT-163-bugfix (27-08-2026, live gemeld door Ronald): het nieuwe
  // Plaats-veld (memberSearchCity) triggerde nog geen zoekopdracht — de
  // guard hieronder kende alleen naam en instrument als startvoorwaarde,
  // dus bij alleen een getypte plaats bleef de melding "Typ minimaal 2
  // tekens..." staan en werd er nooit gezocht. Plaats telt nu ook mee.
  const cityTyped = (document.getElementById('memberSearchCity')?.value || '').trim();
  const resEl = document.getElementById('memberSearchResults');
  // TT-26: jokertekens (%, _, *) uit de zoekterm halen, anders kan een getypt
  // %-teken het ilike-patroon veel breder maken dan de gebruiker bedoelt.
  const qSafe = likeSafe(q);
  // V-17 (13-08-2026): zoeken kan nu ook zónder getypte naam, zolang er een
  // instrument gekozen is — dat was precies de klacht ("je moet al weten
  // wie je zoekt"). TT-163: of zolang er een plaats getypt is.
  if (!instrument && !cityTyped && (q.length < 2 || qSafe.length < 2)) {
    resEl.innerHTML = '<p style="color:var(--muted);font-size:13px;">Typ minimaal 2 tekens, kies een instrument, of vul een plaats in, om te zoeken.</p>';
    return;
  }
  resEl.innerHTML = '<p style="color:var(--muted);font-size:13px;">Zoeken...</p>';
  memberSearchTimer = setTimeout(async () => {
    try {
      const { data: existing } = await db.from('band_members').select('musician_id').eq('band_id', addMemberBandId);
      const existingIds = (existing||[]).map(x => x.musician_id);

      // TT-43: zoeken op voornaam óf gebruikersnaam — een oprichter kent zijn
      // toekomstige bandlid soms alleen van diens profielnaam.
      // TT-56 (12-08-2026): accepts_band_invites erbij, om de "Uitnodigen"-
      // knop hieronder te kunnen verbergen voor wie dat heeft uitgezet.
      // V-17: bij een gekozen instrument gebruiken we !inner zodat de filter
      // op musician_instruments.instrument ook echt de resultatenlijst raakt
      // (zonder !inner filtert een geneste relatie alleen de sub-rijen, niet
      // welke muzikanten worden teruggegeven).
      // TT-163-bugfix, vervolg: bij naam of instrument filtert de database
      // zelf al voor (ilike/eq), dus 15 is ruim genoeg. Zoek je alleen op
      // Plaats, dan filtert de database hier nog niets — de rijen komen in
      // willekeurige/onbepaalde volgorde binnen, en pas hierna wordt op
      // afstand gefilterd. Bij 15 zou een muzikant binnen de straal gemist
      // kunnen worden als hij toevallig niet bij de eerste 15 zit. Ruimer bij
      // een plaats-only zoekopdracht; een échte serverside geo-filter is
      // groter werk en hoort bij TT-28 (filtering/paginering naar de
      // database), niet bij deze bugfix.
      const fetchLimit = (instrument || (q.length >= 2 && qSafe.length >= 2)) ? 15 : 200;
      let qb = db.from('musicians').select(
        instrument
          ? 'id, fname, username, city, accepts_band_invites, musician_instruments!inner(instrument)'
          : 'id, fname, username, city, accepts_band_invites, musician_instruments(instrument)'
      ).limit(fetchLimit);
      if (instrument) qb = qb.eq('musician_instruments.instrument', instrument);
      if (q.length >= 2 && qSafe.length >= 2) qb = qb.or(`fname.ilike.%${qSafe}%,username.ilike.%${qSafe}%`);

      const { data: musicians, error } = await qb;
      if (error) throw error;

      let filtered = (musicians||[]).filter(m => !existingIds.includes(m.id));
      if (!filtered.length) {
        resEl.innerHTML = '<p style="color:var(--muted);font-size:13px;">Geen (nieuwe) muzikanten gevonden.</p>';
        return;
      }

      // V-17-restpunt (13-08-2026) + TT-163 (27-08-2026): afstand ophalen via
      // tt_musician_distances — een eigen, kleine databasefunctie die alleen
      // een getal (km) teruggeeft, nooit ruwe coördinaten van een ander
      // (B-01). Sinds TT-163 accepteert de functie ook een eigen
      // origin_lat/origin_lng: getypt in het Plaats-veld hierboven
      // (memberSearchCity), via de bestaande resolveSearchOrigin() — dat
      // zijn coördinaten van een postcode/plaatsnaam uit postcode_cache,
      // geen persoonsgegevens (dezelfde functie die runSearch() al gebruikt).
      // Leeg Plaats-veld: origin_lat/origin_lng blijven null, de functie
      // valt dan vanzelf terug op de eigen locatie van searcher_id — precies
      // het gedrag van vóór TT-163.
      const radiusVal = document.getElementById('memberSearchRadius')?.value.trim();
      const radius = radiusVal ? parseInt(radiusVal, 10) : null;
      const cityQuery = document.getElementById('memberSearchCity')?.value.trim();
      const origin = cityQuery ? await resolveSearchOrigin(cityQuery) : { lat: null, lng: null };
      try {
        const { data: distances, error: distErr } = await db.rpc('tt_musician_distances', {
          searcher_id: await getMyMusicianId(),
          musician_ids: filtered.map(m => m.id),
          origin_lat: origin.lat,
          origin_lng: origin.lng
        });
        if (!distErr && distances) {
          const distMap = {};
          distances.forEach(d => { distMap[d.musician_id] = d.distance_km; });
          filtered.forEach(m => { m.distance_km = distMap[m.id] != null ? distMap[m.id] : null; });
          if (radius) {
            filtered = filtered.filter(m => m.distance_km == null || m.distance_km <= radius);
          }
          filtered.sort((a, b) => {
            if (a.distance_km == null && b.distance_km == null) return 0;
            if (a.distance_km == null) return 1;
            if (b.distance_km == null) return -1;
            return a.distance_km - b.distance_km;
          });
        }
      } catch (distE) {
        logCaught('searchMembersToAdd', distE);
        // Stil falen: afstand is een verrijking, geen vereiste voor deze zoekopdracht.
      }

      if (!filtered.length) {
        resEl.innerHTML = '<p style="color:var(--muted);font-size:13px;">Geen (nieuwe) muzikanten binnen deze straal gevonden.</p>';
        return;
      }
      resEl.innerHTML = filtered.map(m => {
        const memberName = displayNameOf(m);
        // TT-56 (12-08-2026): wie accepts_band_invites heeft uitgezet, krijgt
        // hier geen "Uitnodigen"-knop. Deze tekst is alleen zichtbaar voor de
        // zoekende oprichter zelf, in dit besloten beheerscherm — geen
        // zichtbaar label op het publieke profiel van de muzikant zelf.
        // V-18 (13-08-2026): een uitnodiging kwam tot nu toe zonder woorden
        // aan — alleen een banner op Mijn Profiel, geen uitleg waarom. De
        // knop opent nu eerst een kort tekstveld i.p.v. meteen uit te nodigen.
        const inviteAction = m.accepts_band_invites === false
          ? `<span style="font-size:12px;color:var(--muted);">Niet open voor uitnodigingen</span>`
          : `<button class="btn btn-ghost" onclick="openInviteNote(this, '${jsAttr(m.id)}', '${jsAttr(memberName)}')">Uitnodigen</button>`;
        return `
        <div class="member-search-row lijst-rij" style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--merk);color:var(--merk-tekst);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${escHtml(memberName[0].toUpperCase())}</div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:14px;">${escHtml(memberName)}</div>
            <div style="font-size:12px;color:var(--muted);">${escHtml(m.city||'')}${m.distance_km != null ? ` · ${m.distance_km.toFixed(1)} km` : ''}${(m.musician_instruments||[]).length ? ' · ' + escHtml(m.musician_instruments.map(x=>x.instrument).slice(0,2).join(', ')) : ''}</div>
          </div>
          <span class="member-invite-action">${inviteAction}</span>
        </div>`; }).join('');
    } catch (e) {
      logCaught('searchMembersToAdd', e);
      resEl.innerHTML = `<p style="color:var(--danger);font-size:13px;">${friendlyErrorMessage(e)}</p>`;
    }
  }, 300);
}

// TT-41 (08-08-2026): een oprichter kon iemand voorheen zonder diens medeweten
// als lid op het bandprofiel zetten. Vanaf nu ontstaat er een uitnodiging
// (status 'aangevraagd'); pas als de muzikant zelf bevestigt via de banner op
// Mijn Profiel wordt het 'bevestigd' en is het lidmaatschap zichtbaar.
// V-18 (13-08-2026): opent een kort tekstveld in de resultatenrij i.p.v.
// meteen uit te nodigen — zo kan de oprichter een reden meegeven.
function openInviteNote(btnEl, musicianId, memberName) {
  const row = btnEl.closest('.member-search-row');
  if (!row) return;
  row.innerHTML = `
    <div style="width:100%;">
      <div style="font-size:13px;margin-bottom:8px;">Uitnodiging aan <strong>${escHtml(memberName)}</strong> — voeg eventueel een korte boodschap toe:</div>
      <textarea class="invite-note-input" maxlength="300" placeholder="Bijv. we zoeken een bassist voor onze covers, jouw profiel past goed bij ons!" style="width:100%;min-height:60px;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'Roboto',sans-serif;font-size:14px;"></textarea>
      <div class="btn-row" style="margin-top:8px;">
        <button class="btn btn-ghost" onclick="searchMembersToAdd(document.getElementById('memberSearchInput').value)">Annuleren</button>
        <button class="btn btn-primary" onclick="sendInviteWithNote(this, '${jsAttr(musicianId)}')">Uitnodiging versturen</button>
      </div>
    </div>`;
  row.querySelector('.invite-note-input')?.focus();
}

function sendInviteWithNote(btnEl, musicianId) {
  const row = btnEl.closest('.member-search-row');
  const note = row?.querySelector('.invite-note-input')?.value.trim() || '';
  addBandMember(musicianId, note);
}

async function addBandMember(musicianId, note) {
  try {
    // TT-56 (12-08-2026): defensieve check naast de verborgen knop hierboven
    // — zelfde patroon als de akkoord-checkbox bij registratie (TT-63): de
    // UI verbergt de knop, maar een verse controle vlak vóór het schrijven
    // voorkomt dat een verouderd scherm (bijv. een openstaand zoekresultaat
    // van vóór iemand net zijn instelling wijzigde) alsnog een uitnodiging
    // verstuurt.
    const { data: target, error: checkErr } = await db.from('musicians')
      .select('accepts_band_invites').eq('id', musicianId).single();
    if (checkErr) throw checkErr;
    if (target && target.accepts_band_invites === false) {
      showToast('Deze muzikant staat niet open voor band-uitnodigingen.');
      return false;
    }

    const { error } = await db.from('band_members').insert({
      band_id: addMemberBandId, musician_id: musicianId, role: 'Lid', status: 'aangevraagd'
    });
    if (error) throw error;

    // V-18: de boodschap komt binnen als gewoon bericht, zodat de ontvanger
    // weet waarom hij gevraagd wordt — niet alleen een naam op een banner.
    const trimmedNote = (note || '').trim();
    const bandLabel = addMemberBandName ? `"${addMemberBandName}"` : 'onze band';
    const text = trimmedNote
      ? `Je bent uitgenodigd voor de band ${bandLabel}. ${trimmedNote}`
      : `Je bent uitgenodigd voor de band ${bandLabel}. Bekijk de uitnodiging op je profiel.`;
    await insertMessage(musicianId, text);

    showToast('Uitnodiging verstuurd.');
    document.getElementById('addMemberModal').classList.remove('visible');
    loadMyBands();
    // TT-385: uitnodigen gebeurt vanuit Onze bezetting; de uitnodiging staat
    // daar meteen in de lijst.
    if (bewerkBandId === addMemberBandId) bbLaadLeden();
    return true;
  } catch (e) {
    logCaught('addBandMember', e);
    showToast(friendlyErrorMessage(e));
    return false;
  }
}

function initBandForm() {
  if (!PICKERS.bandGenre) {
    initPicker({
      id: 'bandGenre',
      fieldId: 'bandGenreField', badgeRowId: 'bandGenreBadgeRow',
      options: GENRES, getList: () => bandState.genres,
      placeholder: 'Kies een genre',
      sheetTitle: 'Kies een genre',
      onChange: bandWizardBalkBij // TT-385 fase 4: de balk loopt mee
    });
  }
  // Bij hergebruik van een al bestaande picker (tweede keer dat het
  // formulier opent) staan de badges nog op de vorige band — opnieuw
  // tekenen op basis van de huidige bandState.
  renderPickerBadges(PICKERS.bandGenre);
}

// TT-51-uitbreiding (12-08-2026): Tabel 1 uit niveaubepaling-naslagwerk.md,
// 1-op-1 overgenomen. Hardcoded (geen build-stap om een .md-bestand in te
// lezen in deze losse-bestand-app) — bij een tekstwijziging in het naslagwerk
// moet deze lijst hier ook worden bijgewerkt.
const NIVEAU_INFO_BAND_HEADERS = ['Ervaring', 'Samenspel en timing', 'Podiumpresentatie', 'Techniek en geluid', 'Optredens en boekingen'];
const NIVEAU_INFO_BAND_ROWS = [
  ['1. Beginner (Startend)',
    'Iedereen speelt een beetje zijn eigen tempo. Samen stoppen of starten is echt lastig. Als er iemand fladdert, stopt het hele nummer.',
    'Iedereen staat als een standbeeld op zijn eigen vierkante meter. Ongemakkelijke stiltes tussen de nummers door het stemmen.',
    'Je oefent op kleine versterkers die snel gaan piepen. Je hebt nog geen idee hoe je jezelf goed hoort over een monitor.',
    'Geen demo of Insta-pagina. Je speelt alleen in de garage of oefenruimte voor jezelf en je ouders.'],
  ['2. Gevorderde Beginner (Garageband)',
    'Jullie spelen complete nummers van begin tot eind uit. Het ritme is oké, maar het klinkt nog als één grote muur van geluid zonder dynamiek.',
    'Er is af en toe oogcontact met het publiek. De setlist heeft een logische volgorde, maar muzikanten kijken nog veel naar hun instrument.',
    'Je bezit eigen spullen die krachtig genoeg zijn voor een klein optreden en kunt de geluidsman vertellen wat je nodig hebt.',
    'Je hebt een paar vette live-filmpjes op socials. Je regelt zelf, of via een bandcommunity je optredens in de buurt, zoals in een jongerencentrum of kroeg.'],
  ['3. Half-Gevorderd (Live-Amateur)',
    'De band klinkt strak. Jullie beheersen de onderlinge dynamiek (zachter spelen tijdens de zang). Kleine live-fouten worden direct opgevangen.',
    'Comfortabele podiumpresentatie; praatjes tussendoor lopen natuurlijk. De band heeft een duidelijke, herkenbare visuele stijl die past bij het genre.',
    'Kan zelfstandig een degelijke monitorsound afstellen; begrijpt het belang van een gecontroleerd en helder podiumvolume.',
    'Beschikt over een nette digitale perskit (EPK) en demo. De band speelt 10 tot 20 keer per jaar tegen een leuke onkostenvergoeding.'],
  ['4. Gevorderd (Semi-Pro)',
    'Extreem strakke timing; de ritmesectie (drums/bas) fungeert als een machine. De band communiceert blindelings via non-verbale cues.',
    'Professionele uitstraling; sterke frontman/vrouw met publieksregie. De show is een non-stop concept zonder dode momenten.',
    'Reist met een vaste eigen geluidstechnicus; maakt standaard gebruik van een gecentraliseerd In-Ear systeem en clicktracks.',
    'Professionele website en actieve marketing. De band boekt 20 tot 40 grote shows per jaar via vaste contracten en marktconforme uitkoopgagen.'],
  ['5. Professioneel (Top-act / Industry)',
    'Studio-kwaliteit op het podium. Perfecte muzikale synergie met absolute vrijheid voor feilloze live-improvisatie en unieke arrangementen.',
    'Volledig geregisseerde en geproduceerde show inclusief custom lichtshow en visuals; consistente top-performance onafhankelijk van zaalgrootte.',
    'Eigen high-end technische crew (FOH, monitor, systeemtechnici); reproduceerbare, merk-identieke signature sound op elk festival.',
    'Exclusieve vertegenwoordiging door professionele boekingskantoren en management; live-optredens vormen de hoofdinkomst voor alle leden.'],
];

function openBandNiveauInfoModal() {
  // V-21 + 21-08-2026: geen tekst tussen haakjes meer bij niveaunamen —
  // alleen de eerste kolom (de naam), de overige kolommen blijven ongewijzigd.
  const rowsHTML = NIVEAU_INFO_BAND_ROWS.map(r => `<tr>${r.map((c, i) => `<td>${escHtml(i === 0 ? stripParenthetical(c) : c)}</td>`).join('')}</tr>`).join('');
  document.getElementById('niveauInfoModalContent').innerHTML = `
    <div class="filter-title" style="margin-bottom:4px;">Ervaringsindeling voor bands</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">Kies de ervaring waar je het dichtst bij in de buurt zit. Zie het als een richtlijn, geen examen.</p>
    <div class="niveau-info-wrap">
      <table class="niveau-info-table">
        <thead><tr>${NIVEAU_INFO_BAND_HEADERS.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
    <div class="filter-title" style="font-size:15px;margin-bottom:8px;">Belangrijk: gebruik dit systeem als jouw kompas</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px;">Geen enkele muzikant of band past perfect in één enkel hokje, en dat is volstrekt normaal. Je kunt bijvoorbeeld technisch heel ver zijn (Ervaring 4), maar nog nooit op een podium hebben gestaan (Ervaring 1). Of je band speelt superstrak samen (Ervaring 3), maar jullie hebben je zakelijke randzaken nog niet op orde (Ervaring 2).</p>
    <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">Zie deze ervaringsbeschrijvingen dan ook puur als een praktische richtlijn, niet als een set onwrikbare wetten.</p>
    <div class="filter-title" style="font-size:15px;margin-bottom:8px;">Hoe kies je jullie ervaring?</div>
    <p style="font-size:13px;color:var(--muted);">Loop de criteria per ervaringsniveau rustig langs. Kijk niet naar waar je één losse vaardigheid hebt zitten, maar kijk naar het grotere plaatje. Kies simpelweg de ervaring waar jij of je band het dichtst bij in de buurt zit en waar je jezelf het meest in herkent. Het is geen examen, maar een hulpmiddel om te ontdekken waar je nu staat en waar je naartoe kunt groeien!</p>
  `;
  document.getElementById('niveauInfoModal').classList.add('visible');
}

// ─── Band aanmaken, Mijn bands en het bandvenster ──────────────────────────────
// Verplaatst uit musicians.js (26-09-2026). Inhoud ongewijzigd.

// TT-252 (11-09-2026): de knop "Band aanmaken" liet zich twee keer indrukken.
// De tweede tik maakte een echte tweede band met dezelfde oprichter, en
// opruimen kon alleen via "Band opheffen" — een pad dat een nieuwe gebruiker
// niet kent. Deze vlag sluit de tweede aanroep buiten zolang de eerste loopt.
// De opslaanlaag hieronder dekt de tik ook af, maar een vlag werkt ook als die
// laag ooit ontbreekt.
let bandSaveBusy = false;

// TT-252: de vlag gaat meteen aan, vóór de eerste `await`. Zat hij pas na
// getMyMusicianId(), dan glipte de tweede tik er alsnog langs: die aanroep
// begint tijdens het wachten, ziet de vlag nog op false staan en maakt een
// tweede band. Gemeten met twee aanroepen direct achter elkaar: twee inserts
// in `bands`. Het `finally` zet de vlag altijd terug, ook bij een afgekeurd
// veld. Het echte werk staat in saveBandRun() hieronder — zo blijft de vlag
// één laag apart en hoeft geen enkele bestaande regel te verschuiven.
async function saveBand() {
  if (bandSaveBusy) return;
  bandSaveBusy = true;
  try { await saveBandRun(); }
  finally { bandSaveBusy = false; }
}

async function saveBandRun() {
  const name = document.getElementById('bandName').value.trim();
  const zip  = document.getElementById('bandZip').value.trim();
  const city = document.getElementById('bandCity').value.trim();
  // TT-247 (12-09-2026): alle fouten tegelijk, elk bij zijn eigen veld —
  // dezelfde vorm als de registratiewizard. Muzikantkant en bandkant volgen
  // dezelfde regels (huisstijl, besluit Ronald 11-09-2026). Tot nu toe waren
  // dit drie opeenvolgende toasts, één per keer.
  // Het bandformulier staat in view-bands, niet in #bandModal — die modal is
  // de bandweergave. Gemeten 12-09-2026; met 'bandModal' als bereik werd er
  // niets opgeruimd.
  clearFieldErrors('view-bands');
  const fouten = [];
  if (!name) fouten.push(['bandName', 'Vul een bandnaam in']);
  if (!zip || !bandPostcodeResolved || !city) {
    fouten.push(['bandZip', 'Vul een geldige postcode in. De plaats wordt dan automatisch ingevuld']);
  }
  if (!bandState.genres.length) fouten.push(['bandGenreField', 'Kies minimaal één genre']);
  if (showFieldErrors(fouten)) return;

  const mid = await getMyMusicianId();
  // Gaat niet over een veld in dit formulier, maar over je account — toast.
  if (!mid) { showToast('Maak eerst een muzikantprofiel aan.'); return; }

  // TT-252: de laag blokkeert het scherm tijdens het opslaan, zodat een tweede
  // tik de knop ook fysiek niet meer bereikt. TT-251: zonder die laag was er
  // ook geen enkele aanduiding dat er iets gebeurde. Zelfde component als de
  // wizard (showSaving), zodat muzikantkant en bandkant hetzelfde aanvoelen.
  // TT-385 fase 3: dit formulier maakt alleen nog een band aan. Bewerken
  // gebeurt in de tegels van Bandprofiel bewerken.
  showSaving('Band aanmaken...', 'Heel even geduld, dit duurt maar een paar seconden.');

  try {
    // Zelfde voorzorg als bij createAccountAndProfile() (23-08-2026): alleen
    // 'id' terugvragen i.p.v. een kale .select(). Niet omdat hier een
    // bekende kolombeperking is gevonden — geen enkel veld hier is dat
    // vandaag — maar een kale select() vraagt onnodig alle kolommen op
    // terwijl alleen band.id verderop wordt gebruikt.
    // TT-385 fase 4: de wizard vraagt alleen naam, plaats en genres. De
    // status volgt uit de open rollen (punt 7); een nieuwe band heeft er nog
    // geen. Bandfoto, ervaring, Wie zijn we en de bezetting vult de beheerder
    // later aan in de tegels.
    const { data: band, error: bErr } = await db.from('bands').insert({
      name, city: normalizeCityName(city), zip,
      genres: bandState.genres,
      status: bandStatusAfgeleid(0, false), founder_id: mid, city_source: bandCitySource,
    }).select('id').single();
    if (bErr) throw bErr;
    const bandId = band.id;
    const { error: mErr } = await db.from('band_members').insert({ band_id: bandId, musician_id: mid, role: 'Oprichter', status: 'bevestigd' });
    if (mErr) throw mErr;

    loadMyBands();
    hideSaving();
    // TT-251 (11-09-2026): wie zijn eerste band aanmaakt, is precies op dat
    // moment het onzekerst. Een korte melding met de bandnaam erin.
    // TT-385 fase 4: daarna opent de privé bandpagina, met elke lege sectie
    // als uitnodiging (besluit 1 en 2).
    sluitBandWizard(() => {
      openBandModal(bandId);
      showToast(`${name} staat. Vul hem aan wanneer je wilt.`);
    });
  } catch(e) {
    hideSaving();
    logCaught('saveBand', e);
    showToast(friendlyErrorMessage(e));
  }
}

async function loadMyBands() {
  const el = document.getElementById('myBandsList');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:32px;">Laden...</div>';
  // 22-08-2026: zelfde lazy vervalcontrole als in loadFounderOffers() —
  // Mijn Bands kan ook los daarvan geopend worden.
  // Niet blokkerend voor de lijst, wel loggen (TT-230).
  try { await db.rpc('tt_expire_old_founder_offers'); }
  catch (e) { logCaught('loadMyBands/expire', e); }

  const mid = await getMyMusicianId();
  if (!mid) {
    // TT-248: via de vaste vorm uit huisstijl §15, net als elke andere lege staat.
    el.innerHTML = emptyStateHTML(
      'Nog geen profiel',
      'Maak je muzikantprofiel aan om een band te kunnen oprichten.',
      'Profiel aanmaken →',
      "showView('register')"
    );
    return;
  }

  const { data: memberships } = await db.from('band_members').select('band_id').eq('musician_id', mid).eq('status', 'bevestigd');
  if (!memberships?.length) {
    // TT-248: stond hier als grijze tekst zonder uitweg, tien regels onder de
    // lege staat hierboven die wél een knop had. Nu dezelfde vaste vorm.
    el.innerHTML = emptyStateHTML(
      'Nog geen bands',
      'Richt je eigen band op, of wacht tot iemand je uitnodigt.',
      'Band aanmaken →',
      'showCreateBandForm()'
    );
    return;
  }

  const bandIds = memberships.map(m => m.band_id);
  const { data: bands } = await db.from('bands')
    .select(`*, band_members(musician_id, role, status, founder_offer), band_wanted(instrument)`)
    .in('id', bandIds).order('updated_at', { ascending: false });

  // TT-385 fase 4 (besluit Ronald bij punt 11): de bandkaart toont de
  // vierkante bandfoto, de naam, plaats en genres, de status en de open
  // rollen als tag. Geen leden: "dat zie je als je het profiel opent". Een
  // tik op de kaart opent de bandpagina; voor de beheerder is dat de privé
  // bandpagina, met de balk.
  el.innerHTML = (bands || []).map(b => {
    const confirmed = (b.band_members||[]).filter(m => m.status === 'bevestigd');
    const isFounder = b.founder_id === mid;
    // V-16 (13-08-2026): staat er al een lopend overname-aanbod (founder_offer)?
    // Dan geen nieuwe "Ik stop als bandleider"-knop, maar de wachtstand.
    const offerPending = isFounder && confirmed.some(m => m.founder_offer);
    const open = (b.band_wanted || []).map(w => w.instrument);
    const status = bandStatusLabel(b.pauze, confirmed.length, open.length);
    const tags = (status ? tagSolid(status) : '') + open.map(i => tagSolid('+ ' + i)).join('');
    // 22-08-2026 (Ronald): de drie losse knoppen (Band bewerken/+ Lid
    // toevoegen/Ik stop als beheerder) worden één klein ⋯-menu, zelfde
    // patroon als het profielmenu (zie huisstijl-en-consistentie.md §8).
    // Elke band in de lijst heeft zijn eigen knop/menu, dus geen vaste id's
    // — toggleBandMoreMenu() werkt met event.currentTarget in plaats daarvan.
    const founderMenuHTML = isFounder ? `
      <div class="profile-actions-menu-wrap" style="flex-shrink:0;" onclick="event.stopPropagation();">
        <button class="nav-menu-btn" onclick="toggleBandMoreMenu(event)" aria-label="Meer opties voor ${escAttr(b.name)}" title="Meer">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
        </button>
        <div class="inline-menu-dropdown">
          <button class="nav-menu-item" onclick="closeAllBandMoreMenus();openBandTegels('${jsAttr(b.id)}');">Bandprofiel bewerken</button>
          <button class="nav-menu-item" onclick="closeAllBandMoreMenus();openBandTegels('${jsAttr(b.id)}','bandBezetting');">Bandleden beheren</button>
        </div>
      </div>` : '';
    return `<div class="band-card" onclick="openBandModal('${jsAttr(b.id)}')">
      <div class="band-card-header">
        ${b.avatar_url ? `<img src="${safeUrl(b.avatar_url)}" alt="${escHtml(b.name)}" class="band-avatar" style="object-fit:cover;">` : `<div class="band-avatar">${AVATAR_T_FALLBACK}</div>`}
        <div style="flex:1;">
          <div class="band-name">${escHtml(b.name)}</div>
          <div class="band-meta">${escHtml(b.city||'')}${b.city&&b.genres?.length?' · ':''}${escHtml((b.genres||[]).slice(0,2).join(', '))}</div>
        </div>
        ${isFounder ? founderMenuHTML : `<button class="btn btn-ghost" onclick="event.stopPropagation(); leaveBand('${jsAttr(b.id)}','${jsAttr(b.name)}');">Band verlaten</button>`}
      </div>
      ${offerPending ? `
      <div style="padding:0 20px;">
        <div style="font-size:12px;color:var(--muted);padding:8px 0;border-top:1px solid var(--border);">Gevraagd of iemand het beheer overneemt — wachten op reactie.</div>
      </div>` : ''}
      ${tags ? `<div class="band-card-body"><div class="profile-badges">${tags}</div></div>` : ''}
    </div>`;
  }).join('');
}

// ─── De bandpagina (TT-385, fase 2, 02-10-2026) ──────────────────────────────
// Besluiten Ronald, TT-385 in actielijst.md. De bandpagina heeft dezelfde
// opbouw als het muzikantprofiel (huisstijl §10, §10.2): banner, een rij met
// links de bandfoto en rechts delen en ⋯, daaronder de naam. Dan de tags, de
// bezetting met gezichten, Wie zijn we, eigen nummers, foto's en video's,
// socials en covers. Alleen wat is ingevuld staat erop. Geen bandchat: de
// knop onderin stuurt een bericht aan de contactpersoon.
// Twee wegen naar dezelfde gegevens: met een eigen profiel leest de app de
// tabellen zelf; zonder eigen profiel komt alles uit tt_get_bands_public, die
// voor een bezoeker zonder account afschermt (TT-385 punt 9). Beide wegen
// leveren één vorm op (bandUitTabellen() en bandUitPubliek()), zodat de
// pagina zelf maar één functie heeft.

// Wat voor band (TT-385 punt 15). De waarden staan zo in bands.soort.
const BAND_SOORT_LABELS = { eigen: 'Eigen nummers', covers: 'Coverband', beide: 'Eigen nummers en covers' };

// De drie socials (TT-385 punt 10): alleen Instagram, TikTok en YouTube. Het
// echte logo, geen tekst (Ronald, 02-10-2026: "die herkent de doelgroep
// meteen"; "gebruik de echte logo's … nu is de lijn te dik"). Instagram is
// zelf een lijn-logo, met een dunnere lijn dan de andere tekens; TikTok en
// YouTube zijn vlakke logo's. Een veld bevat een volledige link of een
// gebruikersnaam; van een naam maakt bandSocialLink() de link.
const BAND_SOCIALS = [
  { veld: 'instagram', naam: 'Instagram', basis: 'https://www.instagram.com/',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"></rect><circle cx="12" cy="12" r="4.25"></circle><circle cx="17.25" cy="6.75" r="1" fill="currentColor" stroke="none"></circle></svg>' },
  { veld: 'tiktok', naam: 'TikTok', basis: 'https://www.tiktok.com/@',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.5 2.5h3c.3 2.4 2.1 4.2 4.5 4.5v3c-1.7 0-3.3-.5-4.5-1.4v6.4a5.5 5.5 0 1 1-5.5-5.5v3a2.5 2.5 0 1 0 2.5 2.5z"></path></svg>' },
  { veld: 'youtube', naam: 'YouTube', basis: 'https://www.youtube.com/@',
    svg: '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true"><path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2C2 8.8 2 12 2 12s0 3.2.4 4.8a2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8c.4-1.6.4-4.8.4-4.8s0-3.2-.4-4.8zM10 15V9l5.2 3z"></path></svg>' }
];

function bandSocialLink(soc, waarde) {
  const w = String(waarde || '').trim();
  if (!w) return null;
  if (/^https?:\/\//i.test(w)) return safeUrl(w);
  const naam = w.replace(/^@/, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(naam)) return null;
  return soc.basis + naam;
}

function vandaagISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Met een eigen profiel: de tabellen zelf. Een invaller van vóór vandaag
// telt niet meer (TT-385, besluit Ronald: "de app"); de nachttaak ruimt hem
// later op.
async function bandUitTabellen(id) {
  const { data: b, error } = await db.from('bands')
    .select(`*, band_members(role, status, joined_at, musicians(id, fname, username, avatar_url, musician_instruments(instrument))), band_wanted(instrument), band_media(media_type, url, platform, in_banner, created_at), band_nummers(titel, url, platform, created_at), band_covers(song_title, song_artist), band_invallers(instrument, datum)`)
    .eq('id', id).single();
  if (error) throw error;
  if (!b) return null;
  const opTijd = (x, y) => String(x.created_at || '').localeCompare(String(y.created_at || ''));
  const leden = (b.band_members || [])
    .filter(m => m.status === 'bevestigd' && m.musicians)
    .sort((x, y) => String(x.joined_at || '').localeCompare(String(y.joined_at || '')))
    .map(m => ({
      id: m.musicians.id, naam: displayNameOf(m.musicians), avatar_url: m.musicians.avatar_url || null,
      instrumenten: (m.musicians.musician_instruments || []).map(i => i.instrument), rol: m.role
    }));
  const beheerder = leden.find(l => l.rol === 'Oprichter');
  const beheerderId = b.founder_id || (beheerder ? beheerder.id : null);
  const vandaag = vandaagISO();
  return {
    id: b.id, name: b.name, city: b.city, description: b.description, niveau: b.niveau,
    avatar_url: b.avatar_url || null, genres: b.genres || [], soort: b.soort || null, pauze: !!b.pauze,
    instagram: b.instagram, tiktok: b.tiktok, youtube: b.youtube, afgeschermd: false,
    leden, beheerderId,
    contact: leden.find(l => l.id === b.contact_id) || leden.find(l => l.id === beheerderId) || null,
    wanted: (b.band_wanted || []).map(w => w.instrument),
    invallers: (b.band_invallers || []).filter(v => String(v.datum) >= vandaag)
      .sort((x, y) => String(x.datum).localeCompare(String(y.datum))),
    media: (b.band_media || []).slice().sort(opTijd),
    nummers: (b.band_nummers || []).slice().sort(opTijd),
    covers: b.band_covers || []
  };
}

// Zonder eigen profiel: de publieke functie. TT-43: alleen de gebruikersnaam
// van een lid, nooit de voornaam. TT-04: geen postcode.
async function bandUitPubliek(id) {
  const { data, error } = await db.rpc('tt_get_bands_public', { ids: [id] });
  if (error) throw error;
  const row = (data || [])[0];
  if (!row) return null;
  const leden = (row.members || []).map(m => ({
    id: m.id || null, naam: displayNameOf({ username: m.username }), avatar_url: m.avatar_url || null,
    instrumenten: m.instruments || [], rol: m.role || 'Lid'
  }));
  return {
    id: row.id, name: row.name, city: row.city, description: row.description, niveau: row.niveau,
    avatar_url: row.avatar_url || null, genres: row.genres || [], soort: row.soort || null, pauze: !!row.pauze,
    instagram: row.instagram, tiktok: row.tiktok, youtube: row.youtube, afgeschermd: !!row.afgeschermd,
    leden, beheerderId: null,
    contact: leden.find(l => l.id && l.id === row.contact_id) || null,
    wanted: row.wanted || [], invallers: row.invallers || [],
    media: row.media || [], nummers: row.nummers || [], covers: row.covers || []
  };
}

// De datum van een invaller, voluit leesbaar: "za 14 nov".
function invallerDatum(datum) {
  const d = new Date(String(datum) + 'T12:00:00');
  if (isNaN(d)) return escHtml(String(datum || ''));
  return escHtml(d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''));
}

// Eén gezicht in de bezetting. Zonder foto (of afgeschermd) de T, zoals de
// lege profielfoto (huisstijl §18.7).
function bezettingLidHTML(l) {
  const foto = safeUrl(l.avatar_url);
  const gezicht = foto
    ? `<img class="bezetting-gezicht" src="${foto}" alt="">`
    : `<span class="bezetting-gezicht bezetting-gezicht-t">${AVATAR_T_FALLBACK}</span>`;
  const rol = l.instrumenten.length ? l.instrumenten.join(' · ') : roleLabel(l.rol);
  return `<div class="bezetting-lid">${gezicht}<div class="bezetting-naam">${escHtml(l.naam)}</div><div class="bezetting-rol">${escHtml(rol)}</div></div>`;
}

// Een open plek in de bezetting: een vaste rol (band_wanted) of een invaller
// voor één optreden. Voor een bezoeker geen knop (besluit Ronald, (e)); voor
// de beheerder opent een tik Zoeken met dat instrument en de plaats van de
// band (TT-385 punt 7). Die tik komt binnen als `actie`.
function bezettingOpenHTML(instrument, regels, actie) {
  const inhoud = `<span class="bezetting-gezicht bezetting-open-rondje" aria-hidden="true">+</span><div class="bezetting-naam">${escHtml(instrument)}</div>${regels.map(r => `<div class="bezetting-rol">${r}</div>`).join('')}`;
  return actie
    ? `<button type="button" class="bezetting-lid bezetting-open" onclick="${actie}" aria-label="Zoek ${escAttr(instrument)}">${inhoud}</button>`
    : `<div class="bezetting-lid bezetting-open">${inhoud}</div>`;
}

// Een lege plek op je eigen bandpagina is een uitnodiging, geen leeg vak
// (TT-385 punt 2). Een tik opent de tegel waar het hoort.
function bandUitnodigingHTML(tekst, bandId, tegel) {
  return `<button type="button" class="add-link-btn" onclick="openBandTegels('${jsAttr(bandId)}','${tegel}')">${escHtml(tekst)}</button>`;
}

function bandSectieHTML(titel, inhoud) {
  return `<div class="profile-media"><div class="profile-media-title">${titel}</div>${inhoud}</div>`;
}

// ─── Je bands op je muzikantprofiel (TT-385 punt 17, fase 5) ─────────────────
// Uit de tekening van Ronald: zodra je een uitnodiging accepteert, staat de
// band op je eigen profiel, in een blok Bands onder de bio. Op Mijn Profiel en
// in het muzikantvenster gelijk, voor elke kijker. Een tik opent de
// bandpagina. Twee stappen: tt_musician_band_ids geeft de bands waarvan de
// muzikant bevestigd lid is; tt_get_bands_public levert naam, foto en rol, met
// dezelfde afscherming als de bandpagina (TT-385 punt 9). Zo bestaat die
// afscherming maar op één plek. Mislukt het, dan staat er geen blok.
async function profielBandsOphalen(musicianId) {
  if (!musicianId) return [];
  try {
    const { data: rijen, error } = await db.rpc('tt_musician_band_ids', { mid: musicianId });
    if (error) throw error;
    const ids = (rijen || []).map(r => r.band_id).filter(Boolean);
    if (!ids.length) return [];
    const { data, error: fout } = await db.rpc('tt_get_bands_public', { ids });
    if (fout) throw fout;
    return ids.map(id => (data || []).find(b => b.id === id)).filter(Boolean).map(b => {
      const ik = (b.members || []).find(x => x.id === musicianId) || {};
      return { id: b.id, naam: b.name, foto: b.avatar_url || null, instrumenten: ik.instruments || [], rol: ik.role || 'Lid' };
    });
  } catch (e) {
    logCaught('profielBandsOphalen', e);
    return [];
  }
}

// Eén rij per band, in de vorm van een rij in Onze bezetting, met de
// vierkante bandfoto. Eronder de instrumenten, en "Beheerder" voor de
// beheerder.
function profielBandsHTML(bands) {
  if (!bands || !bands.length) return '';
  return bandSectieHTML('Bands', bands.map(b => {
    const foto = safeUrl(b.foto);
    const beeld = foto
      ? `<img class="bb-foto bb-foto-vierkant" src="${foto}" alt="">`
      : `<span class="bb-foto bb-foto-t bb-foto-vierkant" aria-hidden="true">${AVATAR_T_FALLBACK}</span>`;
    const sub = b.instrumenten.concat(b.rol === 'Oprichter' ? [roleLabel(b.rol)] : []).join(' · ');
    return `<button type="button" class="bb-rij profiel-band-rij" onclick="openBandModal('${jsAttr(b.id)}')">${beeld}<span class="bb-tekst"><span class="bb-naam">${escHtml(b.naam)}</span>${sub ? `<span class="bb-sub">${escHtml(sub)}</span>` : ''}</span></button>`;
  }).join(''));
}

function bandNummerHTML(n) {
  if (n.afgeschermd) {
    return `<div class="band-nummer"><span class="media-mini media-afgeschermd" role="img" aria-label="Alleen zichtbaar met een account"><span class="avatar-t">T</span></span>` +
      `<span class="band-nummer-tekst"><span class="band-nummer-titel">${escHtml(n.titel)}</span><span class="band-nummer-sub">Alleen met een account</span></span></div>`;
  }
  const url = safeUrl(n.url);
  if (!url) return '';
  const platform = n.platform || detectPlatform(url);
  const ytId = extractYouTubeId(url);
  const mini = ytId
    ? `<span class="media-mini"><img src="https://img.youtube.com/vi/${escAttr(ytId)}/hqdefault.jpg" alt=""></span>`
    : `<span class="media-mini"><span class="media-mini-platform">${escHtml(platform)}</span></span>`;
  return `<button type="button" class="band-nummer" onclick="openMediaSpeler('${jsAttr(url)}', 'link', '${jsAttr(n.titel)}', '${jsAttr(platform)}')">${mini}` +
    `<span class="band-nummer-tekst"><span class="band-nummer-titel">${escHtml(n.titel)}</span><span class="band-nummer-sub">${escHtml(platform)}</span></span></button>`;
}

function bandSocialsHTML(b) {
  const knoppen = BAND_SOCIALS.map(soc => {
    const waarde = b[soc.veld];
    // Afgeschermd (besluit Ronald, (f)): het logo staat er gedempt, zonder
    // link. De database geeft dan een lege tekst in plaats van de link.
    if (b.afgeschermd && waarde === '') {
      return `<span class="social-knop social-dicht" role="img" aria-label="${soc.naam}, alleen zichtbaar met een account">${soc.svg}</span>`;
    }
    const link = bandSocialLink(soc, waarde);
    if (!link) return '';
    return `<a class="social-knop" href="${escAttr(link)}" target="_blank" rel="noopener noreferrer" aria-label="${soc.naam} van ${escAttr(b.name)}">${soc.svg}</a>`;
  }).join('');
  return knoppen ? `<div class="socials">${knoppen}</div>` : '';
}

// De pagina zelf. kijker: 'beheerder', 'lid', 'bezoeker' (eigen profiel) of
// 'gast' (geen eigen profiel).
function bandPaginaHTML(b, kijker) {
  const beheer = kijker === 'beheerder';
  const foto = safeUrl(b.avatar_url);
  // De beheerder tikt op een lege bandfoto om er een te kiezen (TT-385 punt 2).
  const fotoHTML = foto
    ? `<img class="bandfoto" src="${foto}" alt="${escHtml(b.name)}" onclick="openMediaLightbox('${jsAttr(foto)}')">`
    : beheer
      ? `<button type="button" class="bandfoto bandfoto-leeg bandfoto-kies" onclick="openBandTegels('${jsAttr(b.id)}','bandWie')" aria-label="Kies een bandfoto">${AVATAR_T_FALLBACK}</button>`
      : `<div class="bandfoto bandfoto-leeg">${AVATAR_T_FALLBACK}</div>`;

  // Het ⋯-menu: een lid kan de band verlaten (TT-385 punt 13); een bezoeker
  // meldt de band (TT-06, de inhoud zet zetVeiligheidMenu() erin). De
  // beheerder bewerkt hier zijn bandprofiel (TT-385 fase 3).
  let menuHTML = '';
  if (beheer) {
    menuHTML = `<span class="profiel-menu-plek"><div class="profile-actions-menu-wrap">
        <button class="nav-menu-btn" onclick="toggleBandMoreMenu(event)" aria-label="Meer opties voor ${escAttr(b.name)}" title="Meer">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
        </button>
        <div class="inline-menu-dropdown">
          <button class="nav-menu-item" onclick="sluitAlleMenus();openBandTegels('${jsAttr(b.id)}')">Bandprofiel bewerken</button>
        </div>
      </div></span>`;
  } else if (kijker === 'lid') {
    menuHTML = `<span class="profiel-menu-plek"><div class="profile-actions-menu-wrap">
        <button class="nav-menu-btn" onclick="toggleBandMoreMenu(event)" aria-label="Meer opties voor ${escAttr(b.name)}" title="Meer">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
        </button>
        <div class="inline-menu-dropdown">
          <button class="nav-menu-item" onclick="sluitAlleMenus();leaveBand('${jsAttr(b.id)}','${jsAttr(b.name)}')">Band verlaten</button>
        </div>
      </div></span>`;
  } else if (kijker !== 'beheerder') {
    menuHTML = '<span id="bandModalActies" class="profiel-menu-plek"></span>';
  }

  // "Zoekend" en "compleet" volgen uit de open rollen, niet uit een los
  // veld (TT-385 punt 7). Een invaller telt niet mee (besluit Ronald).
  // Besluit Ronald (02-10-2026, na fase 3): zolang er naast de beheerder
  // niemand is en geen open rol, staat er geen statustag. "Compleet" zou
  // dan niet kloppen.
  const zoekend = b.wanted.length > 0;
  const status = bandStatusLabel(b.pauze, b.leden.length, b.wanted.length);
  const tags = [
    ...b.genres.map(g => tagSolid(g)),
    BAND_SOORT_LABELS[b.soort] ? tagSolid(BAND_SOORT_LABELS[b.soort]) : '',
    status ? tagSolid(status) : '',
    bandErvaringTagHTML(b.niveau, zoekend)
  ].join('');

  // De beheerder van een pagina die nog niet af is, krijgt bij delen eerst
  // één zin over wat er mist (besluit Ronald, g).
  const voortgang = beheer ? bandVoortgang(b) : null;
  const deelActie = voortgang && voortgang.pct < 100 ? `openBandDeelBlad('${jsAttr(b.id)}')` : null;
  const bannerHTML = profielBannerHTML(b.media);
  let h = `
    ${bannerHTML}
    <div class="profiel-kop${bannerHTML ? ' op-banner' : ''}">
      <div class="profiel-kop-rij">
        ${fotoHTML}
        ${profielKnoppenHTML('band', b.id, b.name, menuHTML, deelActie)}
      </div>
      <div class="profile-name">${escHtml(b.name)}</div>
      <div class="profiel-regels"><div class="profile-meta" style="margin-bottom:0;">${escHtml(b.city || '')}</div></div>
    </div>
    <div class="profile-badges">${tags}</div>`;

  // Een lege plek is voor de beheerder een uitnodiging (TT-385 punt 2); voor
  // iedereen anders staat er niets.
  const uitnodiging = (tekst, tegel) => beheer ? bandUitnodigingHTML(tekst, b.id, tegel) : '';
  // Een tik op een open rol of invaller opent Zoeken, alleen voor de beheerder.
  const zoek = (instrument, datum) => beheer
    ? `zoekMuzikantVoorRol('${jsAttr(instrument)}','${jsAttr(b.city || '')}','${jsAttr(b.name)}','${jsAttr(datum || '')}','${jsAttr(b.id)}')` : null;

  // 1. De bezetting met gezichten. Een uitgenodigd lid staat er niet op.
  if (b.leden.length || b.wanted.length || b.invallers.length) {
    h += bandSectieHTML('Bezetting', `<div class="bezetting">${
      b.leden.map(bezettingLidHTML).join('') +
      b.wanted.map(w => bezettingOpenHTML(w, ['gezocht'], zoek(w))).join('') +
      b.invallers.map(v => bezettingOpenHTML(v.instrument, ['invaller', invallerDatum(v.datum)], zoek(v.instrument, v.datum))).join('')
    }</div>${voortgang && !voortgang.af.bezetting ? uitnodiging('+ Wie spelen er in de band?', 'bandBezetting') : ''}`);
  }
  // 2. Wie zijn we, direct onder de bezetting (besluit Ronald, (c)).
  if (b.description) h += bandSectieHTML('Wie zijn we', `<p class="band-bio">${escHtml(b.description)}</p>`);
  else if (beheer) h += bandSectieHTML('Wie zijn we', uitnodiging('+ Vertel wie jullie zijn', 'bandWie'));
  // 3. Eigen nummers.
  const nummers = b.nummers.map(bandNummerHTML).join('');
  if (nummers) h += bandSectieHTML('Onze nummers', nummers);
  else if (beheer && voortgang.telt.nummers) h += bandSectieHTML('Onze nummers', uitnodiging('+ Laat horen hoe jullie klinken', 'bandMuziek'));
  // 4. Foto's en video's, en links: dezelfde functie als bij de muzikant.
  // profielMediaHTML() geeft altijd tekst terug (met een toelichting erin);
  // tel dus zelf of er iets te tonen is.
  if (b.media.some(x => safeUrl(x.url) || x.afgeschermd)) h += profielMediaHTML(b.media);
  else if (beheer) h += bandSectieHTML("Foto's en video's", uitnodiging("+ Foto's en video's toevoegen", 'bandMedia'));
  // 5. Socials.
  const socials = bandSocialsHTML(b);
  if (socials) h += bandSectieHTML('Volg ons', socials);
  else if (beheer) h += bandSectieHTML('Volg ons', uitnodiging('+ Instagram, TikTok of YouTube', 'bandMedia'));
  // 6. Covers, op dezelfde volgorde als het repertoire van een muzikant.
  if (b.covers.length) {
    const rijen = [...b.covers].sort((x, y) => compareArtistTitle(x.song_artist, x.song_title, y.song_artist, y.song_title))
      .map(c => `<div class="profile-song-row"><span><strong>${escHtml(c.song_artist)}</strong> — <span style="color:var(--muted)">${escHtml(c.song_title)}</span></span></div>`).join('');
    h += bandSectieHTML(`Covers (${b.covers.length} ${b.covers.length === 1 ? 'nummer' : 'nummers'})`, rijen);
  } else if (beheer && voortgang.telt.covers) {
    h += bandSectieHTML('Covers', uitnodiging('+ Welke covers spelen jullie?', 'bandMuziek'));
  }
  // De balk staat onderaan, zoals op Mijn Profiel; alleen de beheerder ziet
  // hem (besluit Ronald, j).
  if (voortgang) h += voortgangsBalkHTML(voortgang.pct);
  return h;
}

// ─── De voortgang van een bandpagina (TT-385, besluiten Ronald a en b) ────────
// Na de korte wizard staat de band op 15%. Daarna tellen negen onderdelen
// even zwaar mee tot 100%. Geen geheugen: weghalen laat de balk teruglopen,
// verder loopt hij nooit terug. De namen staan in de zin van het deelblad.
const BAND_ONDERDELEN = [
  { sleutel: 'bandfoto',  naam: 'een bandfoto',        af: b => !!b.avatar_url },
  { sleutel: 'wie',       naam: 'Wie zijn we',         af: b => !!(b.description || '').trim() },
  // Aanname (Claude): de bezetting telt als er naast de beheerder nog een
  // lid of een open rol is. Een uitgenodigd lid telt nog niet.
  { sleutel: 'bezetting', naam: 'de bezetting',        af: b => b.leden.length > 1 || b.wanted.length > 0 },
  // Besluit Ronald (02-10-2026, na fase 3): bij een coverband telt "eigen
  // nummers" niet mee, bij een band met alleen eigen nummers "covers" niet.
  { sleutel: 'nummers',   naam: 'eigen nummers',       af: b => b.nummers.length > 0, telt: b => b.soort !== 'covers' },
  { sleutel: 'media',     naam: "foto's en video's",   af: b => b.media.length > 0 },
  { sleutel: 'socials',   naam: 'socials',             af: b => BAND_SOCIALS.some(soc => String(b[soc.veld] || '').trim()) },
  { sleutel: 'covers',    naam: 'covers',              af: b => b.covers.length > 0, telt: b => b.soort !== 'eigen' },
  { sleutel: 'ervaring',  naam: 'jullie ervaring',     af: b => !!b.niveau },
  { sleutel: 'soort',     naam: 'wat voor band jullie zijn', af: b => !!b.soort }
];
const BAND_START_PCT = 15;

function bandVoortgang(b) {
  const af = {};
  const telt = {};
  BAND_ONDERDELEN.forEach(o => { af[o.sleutel] = !!o.af(b); telt[o.sleutel] = !o.telt || !!o.telt(b); });
  const tellend = BAND_ONDERDELEN.filter(o => telt[o.sleutel]);
  const aantal = tellend.filter(o => af[o.sleutel]).length;
  return {
    pct: Math.round(BAND_START_PCT + (100 - BAND_START_PCT) * aantal / tellend.length),
    af,
    telt,
    mist: tellend.filter(o => !af[o.sleutel]).map(o => o.naam)
  };
}

// "a, b en c"
function opsommingNL(lijst) {
  if (lijst.length < 2) return lijst.join('');
  return lijst.slice(0, -1).join(', ') + ' en ' + lijst[lijst.length - 1];
}

// ─── Het deelblad (TT-385, besluit Ronald g) ─────────────────────────────────
// Alleen voor de beheerder, alleen zolang de pagina niet af is: één zin over
// wat er nog mist, dan het deelmenu van de telefoon. "Eerst aanvullen" opent
// Bandprofiel bewerken. Een bladwijzer, dezelfde vorm als het wiel (§7.1).
let bandDeelGegevens = null;

function openBandDeelBlad(bandId) {
  const b = bandDeelGegevens && bandDeelGegevens.id === bandId ? bandDeelGegevens : null;
  if (!b) return;
  const v = bandVoortgang(b);
  document.getElementById('bandDeelTekst').textContent = `Nog niet op je pagina: ${opsommingNL(v.mist)}.`;
  document.getElementById('bandDeelModal').classList.add('visible');
}
function sluitBandDeelBlad() {
  document.getElementById('bandDeelModal').classList.remove('visible');
}
function bandDeelBladDelen() {
  const b = bandDeelGegevens;
  sluitBandDeelBlad();
  if (b) shareProfile('band', b.id, b.name);
}
function bandDeelBladAanvullen() {
  const b = bandDeelGegevens;
  sluitBandDeelBlad();
  if (b) openBandTegels(b.id);
}

// De knop onderin: alleen voor wie geen lid is (besluit Ronald, punt 6).
function bandVoetHTML(b, kijker) {
  if (kijker === 'beheerder' || kijker === 'lid') return '';
  if (kijker === 'gast') {
    return `<button class="btn btn-primary" style="width:100%;" onclick="document.getElementById('bandModal').classList.remove('visible'); showView('register')">Maak een profiel aan om contact te leggen</button>`;
  }
  if (!b.contact) return '';
  return `<button class="btn btn-primary" style="width:100%;" onclick="openMessageComposer('${jsAttr(b.contact.id)}','${jsAttr(b.contact.naam)}','${jsAttr(b.name)}')">Stuur een bericht aan de band →</button>`;
}

async function openBandModal(id) {
  const modal = document.getElementById('bandModal');
  const vak = document.getElementById('bandModalContent');
  const voet = document.getElementById('bandModalFooter');
  vak.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">Laden...</div>';
  voet.innerHTML = '';
  modal.classList.add('visible');

  let b = null;
  try {
    b = hasOwnProfile ? await bandUitTabellen(id) : await bandUitPubliek(id);
  } catch (e) {
    logCaught('openBandModal', e);
  }
  if (!b) { vak.innerHTML = '<p style="color:var(--danger)">Kon band niet laden.</p>'; return; }

  const ik = hasOwnProfile ? myMusicianId : null;
  const kijker = !hasOwnProfile ? 'gast'
    : (ik && ik === b.beheerderId) ? 'beheerder'
    : (ik && b.leden.some(l => l.id === ik)) ? 'lid' : 'bezoeker';

  bandDeelGegevens = kijker === 'beheerder' ? b : null;
  vak.innerHTML = bandPaginaHTML(b, kijker);
  voet.innerHTML = bandVoetHTML(b, kijker);
  // Zelfde volgorde als bij het muzikantvenster: pas na het plaatsen meten
  // en laten schuiven (TT-265, TT-249, TT-293).
  profielBannerStarten(vak);
  mediaTitelsBijwerken(vak);
  fitProfileName(vak);
  fitKopLogo(document.getElementById('bandModalBox'));
  // TT-06: melden. Een band is te melden, niet te blokkeren.
  if (kijker === 'bezoeker' || kijker === 'gast') zetVeiligheidMenu('bandModalActies', 'band', b.id, b.name);
}

// ═══════════════════════════════════════════════════════════════════════════
// Bandprofiel bewerken (TT-385, fase 3, 02-10-2026)
// ═══════════════════════════════════════════════════════════════════════════
// Besluiten Ronald, TT-385 punt 4 en 13: vier tegels zoals bij de muzikant,
// daaronder het blok Bandbeheer. Alleen de beheerder bewerkt (de database
// weigert het anderen). Het scherm is hetzelfde tegelscherm als Profiel
// bewerken (musicians.js): dezelfde terugknop, dezelfde vraag "Terug zonder
// opslaan?" en dezelfde stap in de geschiedenis. Elke tegel slaat met Opslaan
// alleen zijn eigen gegevens op. Uitnodigen, een uitnodiging intrekken en een
// lid uit de band halen gaan meteen: daar is een ander bij betrokken, en elk
// heeft zijn eigen vraag of melding.

let bewerkBandId = null;   // de band in Bandprofiel bewerken; leeg = je eigen profiel
let bewerkBandNaam = '';
let bewerkBandStad = '';

const BAND_TILES = [
  { id: 'bandWie',       title: 'Wie zijn we',    sub: 'bandfoto - naam - plaats - ervaring - bio' },
  { id: 'bandBezetting', title: 'Onze bezetting', sub: 'leden - open rollen - invallers - contactpersoon' },
  { id: 'bandMuziek',    title: 'Onze muziek',    sub: 'wat voor band - genres - eigen nummers - covers' },
  { id: 'bandMedia',     title: 'Onze media',     sub: "foto's - video's - links - banner - socials" }
];

// De statustag op de bandpagina en op de bandkaart in Mijn Bands: één functie,
// zodat beide plekken altijd hetzelfde zeggen (TT-385 fase 4). Besluit Ronald
// (02-10-2026, na fase 3): zolang er naast de beheerder niemand is en geen
// open rol, geen tag; "Compleet" zou dan niet kloppen.
function bandStatusLabel(pauze, aantalLeden, aantalOpenRollen) {
  if (pauze) return 'We spelen even niet';
  if (aantalLeden <= 1 && !aantalOpenRollen) return '';
  return aantalOpenRollen ? 'Zoekend' : 'Compleet';
}

// "Zoekend" of "compleet" volgt uit de open rollen; "We spelen even niet"
// gaat voor (TT-385 punt 7). Een invaller telt niet mee (besluit Ronald).
// De waarde staat in bands.status, zodat Zoeken hem leest zoals voorheen.
function bandStatusAfgeleid(aantalOpenRollen, pauze) {
  if (pauze) return 'inactief';
  return aantalOpenRollen ? 'zoekend' : 'compleet';
}

// Openen vanaf de bandpagina (⋯ → Bandprofiel bewerken, een uitnodiging of de
// lege bandfoto) of vanaf Mijn Bands. `tegel` opent meteen één tegel.
function openBandTegels(bandId, tegel) {
  sluitAlleMenus();
  document.getElementById('bandModal').classList.remove('visible');
  sluitBandDeelBlad();
  bewerkBandId = bandId;
  showView('profieltegels');
  if (tegel && bewerkBandId === bandId && TEGEL_SCREENS[tegel]) openTegelScreen(tegel);
}

function waardeVan(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

// Haalt de band op die nu bewerkt wordt. Geeft null bij een fout, of als er
// intussen een andere band open staat.
async function bandBewerkGegevens(kolommen) {
  const id = bewerkBandId;
  if (!id) return null;
  const { data, error } = await db.from('bands').select(kolommen).eq('id', id).single();
  if (error || !data) {
    logCaught('bandBewerkGegevens', error || new Error('Band niet gevonden.'));
    showToast('Kon de band niet laden: ' + friendlyErrorMessage(error || new Error('Band niet gevonden.')));
    return null;
  }
  if (id !== bewerkBandId) return null;
  if (data.name) bewerkBandNaam = data.name;
  if (data.city) bewerkBandStad = data.city;
  return data;
}

// ─── Het overzicht: vier tegels en Bandbeheer ────────────────────────────────

function renderBandTegels() {
  document.getElementById('bandTegelsWrap').innerHTML = tegelsHTML(BAND_TILES);
  renderBandBeheer();
}

let bandBeheerOpenRollen = 0;

async function renderBandBeheer() {
  const el = document.getElementById('bandBeheerBlok');
  const id = bewerkBandId;
  if (!el || !id) return;
  el.innerHTML = '';
  try {
    const { data: b, error } = await db.from('bands')
      .select('name, city, pauze, band_wanted(instrument), band_members(musician_id, status, founder_offer)')
      .eq('id', id).single();
    if (error || !b) throw error || new Error('Band niet gevonden.');
    if (id !== bewerkBandId) return;
    bewerkBandNaam = b.name || '';
    bewerkBandStad = b.city || '';
    bandBeheerOpenRollen = (b.band_wanted || []).length;
    // V-16: loopt er al een aanbod om het beheer over te nemen? Dan zegt de
    // knop "Aanbod intrekken", met de wachtstand eronder.
    const aanbod = (b.band_members || []).some(m => m.status === 'bevestigd' && m.founder_offer);
    // De knop "Band opheffen" is destructief en staat daarom omlijnd in rood
    // (huisstijl §5), onder de rest. De vraag ervoor noemt het gevolg (§19).
    el.innerHTML = `
      <div class="profile-media-title">Bandbeheer</div>
      <div class="field">
        <label>Spelen jullie nu?</label>
        <div class="segmented-control segmented-vol" id="bandPauzeKeuze">
          <button type="button" class="segmented-btn${b.pauze ? '' : ' selected'}" onclick="zetBandPauze(false)">We spelen</button>
          <button type="button" class="segmented-btn${b.pauze ? ' selected' : ''}" onclick="zetBandPauze(true)">We spelen even niet</button>
        </div>
        <p class="field-hint">Spelen jullie even niet, dan staat dat als tag op jullie bandpagina.</p>
      </div>
      <div class="knoppen-stapel">
        <button type="button" class="btn btn-ghost" onclick="${aanbod ? `withdrawFounderOffer('${jsAttr(id)}')` : `askFounderTransfer('${jsAttr(id)}')`}">${aanbod ? 'Aanbod intrekken' : 'Beheer overdragen'}</button>
        <button type="button" class="btn btn-danger" onclick="vraagBandOpheffen()">Band opheffen</button>
      </div>
      ${aanbod ? '<p class="field-hint">Gevraagd of iemand het beheer overneemt. Wachten op reactie.</p>' : ''}`;
  } catch (e) {
    logCaught('renderBandBeheer', e);
    // TT-230: nooit stil verdwijnen; zeg wat er niet lukt.
    el.innerHTML = `<div class="profile-media-title">Bandbeheer</div>
      <p class="field-hint">Bandbeheer is nu niet beschikbaar. Probeer het later opnieuw.</p>`;
  }
}

// "We spelen even niet" werkt meteen, zonder Opslaan — zoals de schakelaars
// in Instellingen.
async function zetBandPauze(aan) {
  const id = bewerkBandId;
  if (!id) return;
  try {
    const { error } = await db.from('bands')
      .update({ pauze: aan, status: bandStatusAfgeleid(bandBeheerOpenRollen, aan) }).eq('id', id);
    if (error) throw error;
    showToast('Wijzigingen opgeslagen.');
    renderBandBeheer();
    loadMyBands();
  } catch (e) {
    logCaught('zetBandPauze', e);
    showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(e));
  }
}

function vraagBandOpheffen() {
  const id = bewerkBandId;
  if (!id) return;
  showConfirm(
    `${bewerkBandNaam || 'De band'} verdwijnt dan voor alle leden, met de foto's, nummers en covers. Dat is niet terug te draaien.`,
    () => dissolveBand(id),
    'Band opheffen',
    true
  );
}

// ─── Tegel: Wie zijn we ──────────────────────────────────────────────────────
// Bandfoto, naam, postcode en plaats, ervaring (TT-385 punt 14) en de tekst
// "Wie zijn we". De bandfoto gaat naar de eigen map van de band
// (bands/<band-id>/, zie projectinstructies §10), niet naar die van de
// beheerder: anders verdwijnt hij als de beheerder vertrekt.

let bwSnapshot = null;
let bwFotoUrl = null;
let bwFotoBezig = false;
let bwNiveau = null;

function bwFieldSnapshot() {
  return JSON.stringify({
    naam: waardeVan('bwNaam'), zip: waardeVan('bwZip'), city: waardeVan('bwCity'),
    bio: waardeVan('bwBio'), foto: bwFotoUrl || null, niveau: bwNiveau || null
  });
}

async function openBandWie() {
  clearFieldErrors('bandWieScreen');
  const b = await bandBewerkGegevens('name, zip, city, city_source, description, niveau, avatar_url');
  if (!b) return;
  // De postcode loopt via de opzoekroute van de band (postcode.js).
  bandPostcodeDoel = 'bw';
  bandPostcodeResolved = !!(b.zip && b.city);
  bandPostcodeFailStreak = 0;
  bandPostcodeManualMode = false;
  bandCitySource = b.city_source || 'pdok';
  const stad = document.getElementById('bwCity');
  stad.readOnly = true;
  stad.style.cursor = 'not-allowed';
  document.getElementById('bwPostcodeStatus').textContent = '';
  document.getElementById('bwNaam').value = b.name || '';
  document.getElementById('bwZip').value = b.zip || '';
  stad.value = b.city || '';
  document.getElementById('bwBio').value = b.description || '';
  bwFotoUrl = b.avatar_url || null;
  bwFotoBezig = false;
  bwNiveau = b.niveau || null;
  bwRenderFoto();
  bwRenderErvaring();
  bwRenderBioPreview();
  bwSnapshot = bwFieldSnapshot();
}

function bwRenderFoto() {
  const vak = document.getElementById('bwFotoPreview');
  const url = safeUrl(bwFotoUrl);
  vak.innerHTML = url ? `<img src="${url}" alt="bandfoto">` : '<span class="avatar-t">T</span>';
  document.getElementById('bwFotoRemoveBtn').classList.toggle('visible', !!url);
}

function bwFotoKiezen(file) {
  if (!file) return;
  const typeProblem = fileTypeProblem(file, AVATAR_MIME_TYPES, AVATAR_TYPE_LABEL);
  if (typeProblem) { showToast(typeProblem); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('Afbeelding is te groot. Maximum 5 MB.'); return; }
  const id = bewerkBandId;
  const vak = document.getElementById('bwFotoPreview');
  vak.style.position = 'relative';
  vak.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="bandfoto">
    <div class="avatar-uploading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);border-radius:12px;">
      <div class="save-spinner" style="width:24px;height:24px;border-width:3px;margin:0;"></div>
    </div>`;
  bwFotoBezig = true;
  uploadAvatarFile(file, 'bands/' + id).then(({ url }) => {
    bwFotoBezig = false;
    if (id !== bewerkBandId) return;
    bwFotoUrl = url;
    bwRenderFoto();
  }).catch(e => {
    bwFotoBezig = false;
    logCaught('bwFotoKiezen', e);
    showToast(friendlyErrorMessage(e));
    bwRenderFoto();
  });
}

// TT-381: het kruisje vraagt eerst, zoals bij de profielfoto. De foto is pas
// weg na Opslaan.
function bwVraagFotoWeg() {
  showConfirm('Bandfoto verwijderen?', () => { bwFotoUrl = null; bwRenderFoto(); }, 'Ja, verwijderen');
}

function bwRenderErvaring() {
  const el = document.getElementById('bwErvaring');
  if (!el) return;
  renderStarPicker(el, bwNiveau || 0, (n) => { bwNiveau = n; bwRenderErvaring(); });
}

function bwRenderBioPreview() {
  const waarde = waardeVan('bwBio');
  const preview = document.getElementById('bwBioPreview');
  if (waarde) {
    preview.textContent = waarde.length > 70 ? waarde.slice(0, 70) + '…' : waarde;
    preview.style.color = 'var(--text)';
  } else {
    preview.textContent = 'Bijv. Vier vrienden uit Den Haag. We maken gitaarliedjes...';
    preview.style.color = 'var(--muted)';
  }
}

async function saveBandWie() {
  clearFieldErrors('bandWieScreen');
  // TT-247: alle fouten tegelijk, elk bij zijn eigen veld — dezelfde teksten
  // als het formulier Band aanmaken.
  const naam = waardeVan('bwNaam');
  const zip = waardeVan('bwZip');
  const city = waardeVan('bwCity');
  const fouten = [];
  if (!naam) fouten.push(['bwNaam', 'Vul een bandnaam in']);
  if (!zip || !bandPostcodeResolved || !city) {
    fouten.push(['bwZip', 'Vul een geldige postcode in. De plaats wordt dan automatisch ingevuld']);
  }
  if (showFieldErrors(fouten)) return;
  if (bwFotoBezig) { showToast('De bandfoto wordt nog geüpload. Even geduld.'); return; }
  if (bwFieldSnapshot() === bwSnapshot) return;

  const { error } = await db.from('bands').update({
    name: naam, zip, city: normalizeCityName(city), city_source: bandCitySource,
    description: waardeVan('bwBio') || null,
    niveau: bwNiveau || null,
    avatar_url: bwFotoUrl || null
  }).eq('id', bewerkBandId);
  if (error) {
    logCaught('saveBandWie', error);
    showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(error));
    return;
  }
  bewerkBandNaam = naam;
  bewerkBandStad = normalizeCityName(city);
  bwSnapshot = bwFieldSnapshot();
  showToast('Wijzigingen opgeslagen.');
  loadMyBands();
}

// ─── Tegel: Onze bezetting ───────────────────────────────────────────────────
// Leden, uitnodigingen, open rollen (TT-385 punt 7), invallers (punt 16) en
// de contactpersoon (punt 6). Wat je met iemand kunt, zit achter de drie
// puntjes in zijn rij (Ronald: "het moet veel subtieler, meer functioneel").

let bbLeden = [];          // bevestigde leden
let bbUitgenodigd = [];    // uitgenodigd, nog geen antwoord
let bbWanted = [];         // open rollen (gaat mee met Opslaan)
let bbInvallers = [];      // { id, instrument, datum } (gaat mee met Opslaan)
let bbInvalInstrument = [];
let bbContact = '';
let bbBeheerderId = null;
let bbPauze = false;
let bbSnapshot = null;

function bbFieldSnapshot() {
  return JSON.stringify({
    wanted: bbWanted,
    invallers: bbInvallers.map(v => [v.id || null, v.instrument, v.datum]),
    contact: bbContact || null
  });
}

async function openBandBezetting() {
  bbInvalFormulier(false);
  const b = await bandBewerkGegevens('name, city, founder_id, contact_id, pauze, band_wanted(instrument), band_invallers(id, instrument, datum)');
  if (!b) return;
  bbBeheerderId = b.founder_id;
  bbPauze = !!b.pauze;
  bbWanted = (b.band_wanted || []).map(w => w.instrument);
  bbInvallers = bbInvallersUit(b.band_invallers);

  // Het knopje "+ Open rol toevoegen" opent de gewone instrumentenlijst.
  // Wat gekozen is, staat als rij in de lijst erboven, niet als badge.
  initPicker({
    id: 'bbWanted', fieldId: 'bbRolKnop', badgeRowId: 'bbRolBadges',
    options: INSTRUMENTS, getList: () => bbWanted,
    placeholder: '+ Open rol toevoegen', sheetTitle: 'Welk instrument zoeken jullie?',
    onChange: bbRenderOpen
  });
  initPicker({
    id: 'bbInval', fieldId: 'bbInvalInstrument', badgeRowId: 'bbInvalInstrumentBadges',
    options: INSTRUMENTS, getList: () => bbInvalInstrument, singleMax: true,
    placeholder: 'Kies een instrument', sheetTitle: 'Kies een instrument'
  });
  // Eén keer aanmelden: initChoiceField() hangt luisteraars aan het veld.
  if (!CHOICE_FIELDS['band-contact']) {
    initChoiceField({ id: 'band-contact', fieldId: 'bbContactVeld', menuId: 'bbContactMenu', selectId: 'bbContactKeuze' });
  }
  await bbLaadLeden(b.contact_id);
  bbRenderOpen();
  bbRenderInvallers();
  bbSnapshot = bbFieldSnapshot();
}

// Een invaller van vóór vandaag telt niet meer; de nachttaak ruimt hem op.
function bbInvallersUit(rijen) {
  const vandaag = vandaagISO();
  return (rijen || [])
    .map(v => ({ id: v.id || null, instrument: v.instrument, datum: String(v.datum) }))
    .filter(v => v.datum >= vandaag)
    .sort((x, y) => x.datum.localeCompare(y.datum));
}

// Leden en uitnodigingen. Los van de rest, want uitnodigen, intrekken en
// uit de band halen gaan meteen; wat nog niet is opgeslagen, blijft staan.
async function bbLaadLeden(contactStart) {
  const id = bewerkBandId;
  if (!id) return;
  const { data, error } = await db.from('band_members')
    .select('musician_id, role, status, joined_at, musicians(id, fname, username, avatar_url, musician_instruments(instrument))')
    .eq('band_id', id);
  if (error) {
    logCaught('bbLaadLeden', error);
    showToast('Kon de leden niet laden: ' + friendlyErrorMessage(error));
    return;
  }
  if (id !== bewerkBandId) return;
  const opVolgorde = (x, y) => String(x.joined_at || '').localeCompare(String(y.joined_at || ''));
  const naarLid = m => ({
    id: m.musician_id, naam: displayNameOf(m.musicians), avatar_url: (m.musicians && m.musicians.avatar_url) || null,
    instrumenten: ((m.musicians && m.musicians.musician_instruments) || []).map(i => i.instrument), rol: m.role
  });
  bbLeden = (data || []).filter(m => m.status === 'bevestigd').sort(opVolgorde).map(naarLid);
  bbUitgenodigd = (data || []).filter(m => m.status === 'aangevraagd').sort(opVolgorde).map(naarLid);
  // De contactpersoon is een bevestigd lid; anders de beheerder.
  const gewenst = contactStart !== undefined ? contactStart : bbContact;
  bbContact = bbLeden.some(l => l.id === gewenst) ? gewenst : bbBeheerderId;
  bbRenderLeden();
}

function bbFotoHTML(url, wacht) {
  const veilig = safeUrl(url);
  const extra = wacht ? ' bb-wacht' : '';
  return veilig
    ? `<img class="bb-foto${extra}" src="${veilig}" alt="">`
    : `<span class="bb-foto bb-foto-t${extra}" aria-hidden="true">${AVATAR_T_FALLBACK}</span>`;
}

// Eén rij: foto, naam, een regel eronder (al als HTML), en rechts de drie
// puntjes met wat je met deze rij kunt. Zelfde menu als op Mijn Bands.
function bbRijHTML(beeldHTML, naam, subHTML, menuItemsHTML) {
  const menu = menuItemsHTML ? `<div class="profile-actions-menu-wrap">
      <button class="nav-menu-btn" onclick="toggleBandMoreMenu(event)" aria-label="Meer opties voor ${escAttr(naam)}" title="Meer">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
      </button>
      <div class="inline-menu-dropdown">${menuItemsHTML}</div>
    </div>` : '';
  return `<div class="bb-rij">${beeldHTML}<div class="bb-tekst"><div class="bb-naam">${escHtml(naam)}</div><div class="bb-sub">${subHTML}</div></div>${menu}</div>`;
}

function bbRenderLeden() {
  const ik = myMusicianId;
  document.getElementById('bbLeden').innerHTML = bbLeden.map(l => {
    const isBeheerder = l.id === bbBeheerderId;
    const delen = [l.instrumenten.join(' · '), isBeheerder ? 'beheerder' : ''].filter(Boolean);
    const sub = delen.length ? delen.join(' · ') : roleLabel(l.rol).toLowerCase();
    // De beheerder haalt zichzelf niet uit de band: dat is beheer overdragen
    // of de band opheffen (Bandbeheer).
    const menu = isBeheerder ? '' :
      `<button class="nav-menu-item" onclick="sluitAlleMenus();removeMember('${jsAttr(bewerkBandId)}','${jsAttr(l.id)}','${jsAttr(l.naam)}','${jsAttr(bewerkBandNaam)}')">Uit de band</button>`;
    return bbRijHTML(bbFotoHTML(l.avatar_url), l.naam + (l.id === ik ? ' (jij)' : ''), escHtml(sub), menu);
  }).join('');

  document.getElementById('bbUitgenodigdBlok').hidden = !bbUitgenodigd.length;
  document.getElementById('bbUitgenodigd').innerHTML = bbUitgenodigd.map(l =>
    bbRijHTML(bbFotoHTML(l.avatar_url, true), l.naam, 'uitgenodigd, nog geen antwoord',
      `<button class="nav-menu-item" onclick="sluitAlleMenus();bbIntrekken('${jsAttr(l.id)}','${jsAttr(l.naam)}')">Uitnodiging intrekken</button>`)
  ).join('');

  // De contactpersoon kies je uit de bevestigde leden.
  const sel = document.getElementById('bbContactKeuze');
  sel.innerHTML = bbLeden.map(l => `<option value="${escAttr(l.id)}">${escHtml(l.naam + (l.id === ik ? ' (jij)' : ''))}</option>`).join('');
  sel.value = bbContact || '';
  refreshChoiceField('band-contact');
}

function bbRenderOpen() {
  const rondje = '<span class="bb-foto bezetting-open-rondje" aria-hidden="true">+</span>';
  document.getElementById('bbOpen').innerHTML = bbWanted.map((w, i) => bbRijHTML(rondje, w, 'open rol',
    `<button class="nav-menu-item" onclick="sluitAlleMenus();bbZoekNaar(bbWanted[${i}])">Zoek een muzikant</button>` +
    `<button class="nav-menu-item" onclick="sluitAlleMenus();bbRolWeg(${i})">Open rol weghalen</button>`)).join('');
}

function bbRolWeg(i) {
  bbWanted.splice(i, 1);
  bbRenderOpen();
}

function bbRenderInvallers() {
  const rondje = '<span class="bb-foto bezetting-open-rondje" aria-hidden="true">+</span>';
  document.getElementById('bbInvallers').innerHTML = bbInvallers.map((v, i) => bbRijHTML(rondje, v.instrument, `invaller · ${invallerDatum(v.datum)}`,
    `<button class="nav-menu-item" onclick="sluitAlleMenus();bbZoekNaar(bbInvallers[${i}].instrument, bbInvallers[${i}].datum)">Zoek een invaller</button>` +
    `<button class="nav-menu-item" onclick="sluitAlleMenus();bbInvallerWeg(${i})">Invaller weghalen</button>`)).join('');
}

function bbInvallerWeg(i) {
  bbInvallers.splice(i, 1);
  bbRenderInvallers();
}

// Zoeken verlaat dit scherm. Staat er nog iets open, dan eerst opslaan:
// anders is het weg.
function bbZoekNaar(instrument, datum) {
  if (!instrument) return;
  if (tegelHeeftWijzigingen()) { showToast('Sla eerst je wijzigingen op.'); return; }
  zoekMuzikantVoorRol(instrument, bewerkBandStad, bewerkBandNaam, datum || '', bewerkBandId);
}

function bbInvalFormulier(open) {
  const form = document.getElementById('bbInvalForm');
  if (!form) return;
  form.hidden = !open;
  document.getElementById('bbInvalOpen').hidden = !!open;
  if (open) {
    bbInvalInstrument.length = 0;
    if (PICKERS.bbInval) renderPickerBadges(PICKERS.bbInval);
    document.getElementById('bbInvalDatum').value = '';
    clearFieldErrors('bbInvalForm');
  }
}

function bbInvalToevoegen() {
  clearFieldErrors('bbInvalForm');
  const instrument = bbInvalInstrument[0];
  const tekst = waardeVan('bbInvalDatum');
  let iso = '';
  if (/^\d{2}-\d{2}-\d{4}$/.test(tekst)) {
    const kandidaat = toISODate(tekst);
    const d = new Date(kandidaat + 'T12:00:00');
    // Een datum als 31-02 bestaat niet; de browser schuift die door.
    if (!isNaN(d) && d.getDate() === Number(tekst.slice(0, 2))) iso = kandidaat;
  }
  const fouten = [];
  if (!instrument) fouten.push(['bbInvalInstrument', 'Kies een instrument']);
  if (!iso) fouten.push(['bbInvalDatum', 'Vul de datum in als dd-mm-jjjj']);
  else if (iso < vandaagISO()) fouten.push(['bbInvalDatum', 'Kies een datum vanaf vandaag']);
  if (showFieldErrors(fouten)) return;
  bbInvallers.push({ id: null, instrument, datum: iso });
  bbInvallers.sort((x, y) => x.datum.localeCompare(y.datum));
  bbInvalFormulier(false);
  bbRenderInvallers();
}

function bbLidUitnodigen() {
  if (bewerkBandId) openAddMemberModal(bewerkBandId, bewerkBandNaam);
}

// Een uitnodiging intrekken gaat meteen: wie nog niet antwoordde, staat ook
// nog nergens op de bandpagina.
async function bbIntrekken(musicianId, naam) {
  const id = bewerkBandId;
  if (!id) return;
  try {
    const { error } = await db.from('band_members').delete()
      .eq('band_id', id).eq('musician_id', musicianId).eq('status', 'aangevraagd');
    if (error) throw error;
    showToast(`Uitnodiging aan ${naam} ingetrokken.`);
    bbLaadLeden();
    loadMyBands();
  } catch (e) {
    logCaught('bbIntrekken', e);
    showToast(friendlyErrorMessage(e));
  }
}

async function saveBandBezetting() {
  if (bbFieldSnapshot() === bbSnapshot) return;
  const id = bewerkBandId;
  if (!id) return;
  try {
    // TT-281: de open rollen in één transactie, zoals voorheen.
    const { error: wErr } = await db.rpc('tt_save_band_wanted', { p_band_id: id, p_instruments: bbWanted });
    if (wErr) throw wErr;
    // Invallers: alleen wat wegging weghalen en wat nieuw is toevoegen. Zo
    // gaat er bij een fout halverwege nooit een bestaande invaller verloren.
    const eerder = JSON.parse(bbSnapshot).invallers.map(v => v[0]).filter(Boolean);
    const nogDaar = bbInvallers.map(v => v.id).filter(Boolean);
    const weg = eerder.filter(x => !nogDaar.includes(x));
    if (weg.length) {
      const { error } = await db.from('band_invallers').delete().in('id', weg);
      if (error) throw error;
    }
    const nieuw = bbInvallers.filter(v => !v.id);
    if (nieuw.length) {
      const { error } = await db.from('band_invallers')
        .insert(nieuw.map(v => ({ band_id: id, instrument: v.instrument, datum: v.datum })));
      if (error) throw error;
    }
    // Leeg is de beheerder (projectinstructies §10): zo volgt de
    // contactpersoon vanzelf als het beheer wordt overgedragen.
    const { error: bErr } = await db.from('bands').update({
      contact_id: bbContact && bbContact !== bbBeheerderId ? bbContact : null,
      status: bandStatusAfgeleid(bbWanted.length, bbPauze)
    }).eq('id', id);
    if (bErr) throw bErr;
    // De nieuwe invallers hebben nu een id.
    const { data: rijen, error: rErr } = await db.from('band_invallers').select('id, instrument, datum').eq('band_id', id);
    if (rErr) throw rErr;
    bbInvallers = bbInvallersUit(rijen);
    bbRenderInvallers();
    bbSnapshot = bbFieldSnapshot();
    showToast('Wijzigingen opgeslagen.');
    loadMyBands();
  } catch (e) {
    logCaught('saveBandBezetting', e);
    showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(e));
  }
}

// ─── Tegel: Onze muziek ──────────────────────────────────────────────────────
// Wat voor band (TT-385 punt 15), genres, eigen nummers als titel en link
// (punt 8) en covers met dezelfde zoekvelden als bij de muzikant.

const BAND_SOORT_KEUZES = [['eigen', 'Eigen nummers'], ['covers', 'Coverband'], ['beide', 'Beide']];

let bmzSoort = null;
let bmzGenres = [];
let bmzNummers = [];   // { id, titel, url }
let bcCovers = [];     // { id, title, artist }
let bmzSnapshot = null;

function bmzFieldSnapshot() {
  return JSON.stringify({
    soort: bmzSoort, genres: bmzGenres,
    nummers: bmzNummers.map(n => [n.id || null, n.titel.trim(), n.url.trim()]).filter(n => n[0] || n[1] || n[2]),
    covers: bcCovers.map(c => [c.id || null, c.title, c.artist])
  });
}

async function openBandMuziek() {
  clearFieldErrors('bandMuziekScreen');
  songZoekLeeg('bc');
  const b = await bandBewerkGegevens('name, city, soort, genres, band_nummers(id, titel, url, created_at), band_covers(id, song_title, song_artist)');
  if (!b) return;
  bmzZet(b);
  initPicker({
    id: 'bmzGenre', fieldId: 'bmzGenreField', badgeRowId: 'bmzGenreBadgeRow',
    options: GENRES, getList: () => bmzGenres,
    placeholder: 'Kies een genre', sheetTitle: 'Kies een genre'
  });
  bmzRenderSoort();
  bmzRenderNummers();
  bcRenderCovers();
  bmzSnapshot = bmzFieldSnapshot();
}

function bmzZet(b) {
  bmzSoort = b.soort || null;
  bmzGenres.length = 0;
  (b.genres || []).forEach(g => bmzGenres.push(g));
  bmzNummers = (b.band_nummers || [])
    .slice().sort((x, y) => String(x.created_at || '').localeCompare(String(y.created_at || '')))
    .map(n => ({ id: n.id, titel: n.titel || '', url: n.url || '' }));
  bcCovers = (b.band_covers || []).map(c => ({ id: c.id, title: c.song_title, artist: c.song_artist }));
}

function bmzRenderSoort() {
  document.getElementById('bmzSoort').innerHTML = BAND_SOORT_KEUZES.map(([waarde, label]) =>
    `<button type="button" class="segmented-btn${bmzSoort === waarde ? ' selected' : ''}" onclick="bmzKiesSoort('${waarde}')">${escHtml(label)}</button>`).join('');
}

// Nog een tik op de gekozen knop zet hem uit, zoals "Wat speel je vooral?".
function bmzKiesSoort(waarde) {
  bmzSoort = bmzSoort === waarde ? null : waarde;
  bmzRenderSoort();
}

function bmzNummerRijHTML(n, i) {
  const veilig = safeUrl(n.url);
  return `
    <div class="media-rij">
      <button type="button" class="media-mini" onclick="bmzSpeel(${i})" aria-label="Afspelen"${veilig ? '' : ' disabled'}>${mediaLinkMiniatuurHTML(n.url)}</button>
      <div class="media-rij-tekst">
        <input type="text" class="nummer-titel" id="bmzTitel${i}" value="${escAttr(n.titel)}" placeholder="Titel van het nummer" aria-label="Titel van het nummer" maxlength="80" autocomplete="off" oninput="bmzNummers[${i}].titel = this.value">
        <input type="url" class="media-rij-url" id="bmzUrl${i}" value="${escAttr(n.url)}" placeholder="https://youtube.com/watch?v=..." aria-label="Link naar het nummer" oninput="bmzNummers[${i}].url = this.value" onchange="bmzRenderNummers()">
      </div>
      <button type="button" class="song-remove" onclick="bmzNummerWeg(${i})" aria-label="Nummer weghalen">✕</button>
    </div>`;
}

// Tijdens het typen alleen de waarde bijhouden; hertekenen gebeurt als het
// veld verlaten wordt (huisstijl §18.2).
function bmzRenderNummers() {
  document.getElementById('bmzNummers').innerHTML = bmzNummers.map(bmzNummerRijHTML).join('');
}

function bmzNummerErbij() {
  bmzNummers.push({ id: null, titel: '', url: '' });
  bmzRenderNummers();
  document.getElementById(`bmzTitel${bmzNummers.length - 1}`)?.focus();
}

function bmzNummerWeg(i) {
  bmzNummers.splice(i, 1);
  bmzRenderNummers();
}

function bmzSpeel(i) {
  const n = bmzNummers[i];
  if (!n || !safeUrl(n.url)) return;
  openMediaSpeler(n.url, 'link', n.titel.trim() || null, detectPlatform(n.url));
}

// Covers: kiezen uit de zoekvelden (jstOnArtistSearch met voorvoegsel bc).
function bcAddCover(title, artist) {
  if (bcCovers.find(c => c.title === title && c.artist === artist)) return;
  bcCovers.push({ id: null, title, artist });
  songZoekLeeg('bc');
  bcRenderCovers();
}

// Zelfde lijst en zelfde volgorde als het repertoire van een muzikant, zonder
// beheersing. Weghalen vraagt eerst "Zeker?", zoals in Je setlist (TT-226).
function bcRenderCovers() {
  const volgorde = bcCovers.map((c, i) => i)
    .sort((a, b) => compareArtistTitle(bcCovers[a].artist, bcCovers[a].title, bcCovers[b].artist, bcCovers[b].title));
  document.getElementById('bcCoversLijst').innerHTML = volgorde.map(i => {
    const c = bcCovers[i];
    return `<div class="profile-song-row"><span><strong>${escHtml(c.artist)}</strong> — <span style="color:var(--muted)">${escHtml(c.title)}</span></span>${
      c._zeker
        ? `<button type="button" class="song-remove" style="width:auto;padding:0 8px;font-size:11px;font-weight:700;color:var(--danger);" onclick="bcCoverWeg(${i})" title="Bevestig weghalen">Zeker?</button>`
        : `<button type="button" class="song-remove" onclick="bcCoverWeg(${i})" title="Weghalen" aria-label="Haal ${escAttr(c.title)} weg">✕</button>`
    }</div>`;
  }).join('');
  document.getElementById('bcCoversLeeg').hidden = bcCovers.length > 0;
}

function bcCoverWeg(i) {
  if (!bcCovers[i]) return;
  if (!bcCovers[i]._zeker) {
    bcCovers.forEach(c => delete c._zeker);
    bcCovers[i]._zeker = true;
    bcRenderCovers();
    // Een tik ergens anders zet de knop terug (TT-226). Pas ná deze tik.
    setTimeout(() => {
      document.addEventListener('click', function bcBuiten(e) {
        if (e.target.closest && e.target.closest('.song-remove')) return;
        if (bcCovers.some(c => c._zeker)) { bcCovers.forEach(c => delete c._zeker); bcRenderCovers(); }
      }, { once: true });
    }, 0);
    return;
  }
  bcCovers.splice(i, 1);
  bcRenderCovers();
}

async function saveBandMuziek() {
  clearFieldErrors('bandMuziekScreen');
  const fouten = [];
  if (!bmzGenres.length) fouten.push(['bmzGenreField', 'Kies minimaal één genre']);
  bmzNummers.forEach((n, i) => {
    const titel = n.titel.trim();
    const url = n.url.trim();
    if (!titel && !url) return; // een lege rij valt gewoon weg
    if (!titel) fouten.push([`bmzTitel${i}`, 'Vul de titel in']);
    if (!/^https?:\/\//i.test(url)) fouten.push([`bmzUrl${i}`, 'Vul een link in die begint met https://']);
  });
  if (showFieldErrors(fouten)) return;
  if (bmzFieldSnapshot() === bmzSnapshot) return;
  const id = bewerkBandId;
  if (!id) return;
  try {
    const { error: bErr } = await db.from('bands').update({ soort: bmzSoort, genres: bmzGenres.slice() }).eq('id', id);
    if (bErr) throw bErr;

    // Eigen nummers en covers: alleen wat wegging weghalen, wat wijzigde
    // bijwerken en wat nieuw is toevoegen. Bij een fout halverwege gaat er
    // zo nooit iets verloren dat er al stond.
    const eerder = JSON.parse(bmzSnapshot);
    const nummers = bmzNummers.filter(n => n.titel.trim() || n.url.trim());
    const nummerWeg = eerder.nummers.map(n => n[0]).filter(x => x && !nummers.some(n => n.id === x));
    if (nummerWeg.length) {
      const { error } = await db.from('band_nummers').delete().in('id', nummerWeg);
      if (error) throw error;
    }
    for (const n of nummers.filter(n => n.id)) {
      const oud = eerder.nummers.find(x => x[0] === n.id);
      if (oud && oud[1] === n.titel.trim() && oud[2] === n.url.trim()) continue;
      const { error } = await db.from('band_nummers')
        .update({ titel: n.titel.trim(), url: n.url.trim(), platform: detectPlatform(n.url.trim()) }).eq('id', n.id);
      if (error) throw error;
    }
    const nieuweNummers = nummers.filter(n => !n.id);
    if (nieuweNummers.length) {
      const { error } = await db.from('band_nummers').insert(nieuweNummers.map(n =>
        ({ band_id: id, titel: n.titel.trim(), url: n.url.trim(), platform: detectPlatform(n.url.trim()) })));
      if (error) throw error;
    }
    const coverWeg = eerder.covers.map(c => c[0]).filter(x => x && !bcCovers.some(c => c.id === x));
    if (coverWeg.length) {
      const { error } = await db.from('band_covers').delete().in('id', coverWeg);
      if (error) throw error;
    }
    const nieuweCovers = bcCovers.filter(c => !c.id);
    if (nieuweCovers.length) {
      const { error } = await db.from('band_covers').insert(nieuweCovers.map(c =>
        ({ band_id: id, song_title: c.title, song_artist: c.artist })));
      if (error) throw error;
    }

    // De nieuwe rijen hebben nu een id; de zoekvelden blijven staan.
    const b = await bandBewerkGegevens('soort, genres, band_nummers(id, titel, url, created_at), band_covers(id, song_title, song_artist)');
    if (!b) return;
    bmzZet(b);
    renderPickerBadges(PICKERS.bmzGenre);
    bmzRenderSoort();
    bmzRenderNummers();
    bcRenderCovers();
    bmzSnapshot = bmzFieldSnapshot();
    showToast('Wijzigingen opgeslagen.');
    loadMyBands();
  } catch (e) {
    logCaught('saveBandMuziek', e);
    showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(e));
  }
}

// ─── Tegel: Onze media ───────────────────────────────────────────────────────
// Dezelfde vorm en dezelfde gedeelde functies als Je mediahoek (huisstijl
// §18.2); deze functies heten bm... (mediaFnNaam). Foto's en video's gaan
// naar de eigen map van de band. Daaronder de drie socials (punt 10).

let bmMediaFiles = [];   // { id, url, path, type, uploading, inBanner, name }
let bmMediaLinks = [];   // { id, url, inBanner }
let bmSnapshot = null;
let bmOrigineel = [];    // [id, url, in_banner] zoals in de database

function bmFieldSnapshot() {
  return JSON.stringify({
    files: bmMediaFiles.map(m => [m.id || null, m.url, m.type, !!m.uploading, !!m.inBanner]),
    links: bmMediaLinks.map(l => [l.id || null, l.url, !!l.inBanner]),
    instagram: waardeVan('bmInstagram'), tiktok: waardeVan('bmTiktok'), youtube: waardeVan('bmYoutube')
  });
}

async function openBandMedia() {
  clearFieldErrors('bandMediaScreen');
  const scherm = document.getElementById('bandMediaScreen');
  scherm.querySelectorAll('.media-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  scherm.querySelectorAll('.media-pane').forEach((p, i) => p.classList.toggle('active', i === 0));
  const b = await bandBewerkGegevens('name, city, instagram, tiktok, youtube, band_media(id, media_type, url, platform, in_banner, created_at)');
  if (!b) return;
  bmZet(b);
  bmSnapshot = bmFieldSnapshot();
}

function bmZet(b) {
  const opTijd = (x, y) => String(x.created_at || '').localeCompare(String(y.created_at || ''));
  const rijen = (b.band_media || []).slice().sort(opTijd);
  bmOrigineel = rijen.map(r => [r.id, r.url, !!r.in_banner]);
  bmMediaFiles = rijen.filter(r => r.media_type === 'foto' || r.media_type === 'video')
    .map(r => ({ id: r.id, name: '', url: r.url, path: null, type: r.media_type, uploading: false, inBanner: !!r.in_banner }));
  bmMediaLinks = rijen.filter(r => r.media_type === 'link').map(r => ({ id: r.id, url: r.url, inBanner: !!r.in_banner }));
  document.getElementById('bmInstagram').value = b.instagram || '';
  document.getElementById('bmTiktok').value = b.tiktok || '';
  document.getElementById('bmYoutube').value = b.youtube || '';
  bmRenderMediaGrid();
  bmRenderLinksList();
}

function switchBmMediaTab(tab, el) {
  const scherm = document.getElementById('bandMediaScreen');
  scherm.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
  scherm.querySelectorAll('.media-pane').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(tab === 'upload' ? 'bmPaneUpload' : 'bmPaneLinks').classList.add('active');
}

function bmHandleDrop(e) {
  e.preventDefault();
  document.getElementById('bmDropZone').classList.remove('drag-over');
  bmHandleFileSelect(e.dataTransfer.files);
}

function bmHandleFileSelect(files) {
  const id = bewerkBandId;
  Array.from(files).forEach(file => {
    if (bmMediaFiles.length >= 8) { showToast('Maximum 8 bestanden.'); return; }
    const isVideo = (file.type || '').toLowerCase().startsWith('video/');
    const typeProblem = fileTypeProblem(file, MEDIA_MIME_TYPES, MEDIA_TYPE_LABEL);
    if (typeProblem) { showToast(`"${file.name}": ${typeProblem}`); return; }
    if (file.size > 50 * 1024 * 1024) { showToast(`"${file.name}" is te groot. Maximum 50 MB.`); return; }
    const entry = { id: null, name: file.name, url: URL.createObjectURL(file), path: null, type: isVideo ? 'video' : 'foto', uploading: true, inBanner: false };
    bmMediaFiles.push(entry);
    bmRenderMediaGrid();
    uploadMediaFile(file, 'bands/' + id).then(({ url, path }) => {
      entry.url = url;
      entry.path = path;
      entry.uploading = false;
      bmRenderMediaGrid();
    }).catch(e => {
      logCaught('bmUploadMedia', e);
      showToast(`"${file.name}": ${friendlyErrorMessage(e)}`);
      const idx = bmMediaFiles.indexOf(entry);
      if (idx !== -1) bmMediaFiles.splice(idx, 1);
      bmRenderMediaGrid();
    });
  });
}

function bmRenderMediaGrid() {
  document.getElementById('bmMediaGrid').innerHTML = bmMediaFiles.map((m, i) => mediaTegelHTML(m, i, 'bm')).join('');
  bannerTellerBijwerken('bmBannerTeller', bmMediaFiles, bmMediaLinks);
}

function bmToggleMediaBanner(i) {
  const m = bmMediaFiles[i];
  if (!m) return;
  if (!bannerKeuzeMag(bannerAantal(bmMediaFiles, bmMediaLinks), !m.inBanner)) return;
  m.inBanner = !m.inBanner;
  bannerKnopStandZetten('bmMediaGrid', i, m.inBanner);
  bannerTellerBijwerken('bmBannerTeller', bmMediaFiles, bmMediaLinks);
}

function bmSpeelMedia(i) {
  const m = bmMediaFiles[i];
  if (!m || !m.url) return;
  if (m.type === 'foto') { openMediaLightbox(m.url); return; }
  openMediaSpeler(m.url, 'video', m.name || '', '');
}

// Een net geüpload bestand dat weer weg gaat, gaat ook uit de opslag. Een
// bestand dat al op de pagina stond, blijft daar tot Opslaan.
function bmRemoveMedia(i) {
  const entry = bmMediaFiles[i];
  bmMediaFiles.splice(i, 1);
  bmRenderMediaGrid();
  if (entry && entry.path) {
    db.storage.from('media').remove([entry.path]).then(() => {}, e => logCaught('bmRemoveMedia', e));
  }
}

function bmAddLinkRow() {
  bmMediaLinks.push({ id: null, url: '', inBanner: false });
  bmRenderLinksList();
}

function bmRenderLinksList() {
  const lijst = document.getElementById('bmLinksList');
  lijst.innerHTML = bmMediaLinks.map((l, i) => mediaLinkRijHTML(l, i, 'bm')).join('');
  mediaTitelsBijwerken(lijst);
  bannerTellerBijwerken('bmBannerTeller', bmMediaFiles, bmMediaLinks);
}

function bmUpdateLinkUrl(i, el) {
  if (!bmMediaLinks[i]) return;
  bmMediaLinks[i].url = el.value;
}

function bmToggleLinkBanner(i) {
  const l = bmMediaLinks[i];
  if (!l) return;
  if (!l.url.trim()) { showToast('Vul eerst de link in.'); return; }
  if (!bannerKeuzeMag(bannerAantal(bmMediaFiles, bmMediaLinks), !l.inBanner)) return;
  l.inBanner = !l.inBanner;
  bannerKnopStandZetten('bmLinksList', i, l.inBanner);
  bannerTellerBijwerken('bmBannerTeller', bmMediaFiles, bmMediaLinks);
}

function bmSpeelLink(i) {
  const l = bmMediaLinks[i];
  if (!l || !l.url.trim()) return;
  openMediaSpeler(l.url, 'link', null, detectPlatform(l.url));
}

function bmRemoveLink(i) {
  bmMediaLinks.splice(i, 1);
  bmRenderLinksList();
}

const BAND_SOCIAL_VELDEN = { instagram: 'bmInstagram', tiktok: 'bmTiktok', youtube: 'bmYoutube' };

async function saveBandMedia() {
  clearFieldErrors('bandMediaScreen');
  // Een social is een gebruikersnaam of een link; van een naam maakt de
  // bandpagina zelf de link (bandSocialLink()).
  const fouten = [];
  BAND_SOCIALS.forEach(soc => {
    const waarde = waardeVan(BAND_SOCIAL_VELDEN[soc.veld]);
    if (waarde && !bandSocialLink(soc, waarde)) {
      fouten.push([BAND_SOCIAL_VELDEN[soc.veld], 'Vul een gebruikersnaam in, of een link die begint met https://']);
    }
  });
  if (showFieldErrors(fouten)) return;
  if (bmMediaFiles.some(m => m.uploading)) { showToast('Er wordt nog een bestand geüpload. Even geduld.'); return; }
  if (bmFieldSnapshot() === bmSnapshot) return;
  const id = bewerkBandId;
  if (!id) return;
  try {
    const { error: sErr } = await db.from('bands').update({
      instagram: waardeVan('bmInstagram') || null,
      tiktok: waardeVan('bmTiktok') || null,
      youtube: waardeVan('bmYoutube') || null
    }).eq('id', id);
    if (sErr) throw sErr;

    // Alleen wat wegging weghalen, wat wijzigde bijwerken en wat nieuw is
    // toevoegen (zie Onze muziek). De volgorde blijft die van binnenkomst.
    const nu = bmMediaFiles.filter(m => m.url && !m.url.startsWith('blob:'))
      .map(m => ({ id: m.id, media_type: m.type, url: m.url, platform: null, in_banner: !!m.inBanner }))
      .concat(bmMediaLinks.filter(l => l.url.trim())
        .map(l => ({ id: l.id, media_type: 'link', url: l.url.trim(), platform: detectPlatform(l.url.trim()), in_banner: !!l.inBanner })));
    const weg = bmOrigineel.map(r => r[0]).filter(x => !nu.some(m => m.id === x));
    if (weg.length) {
      const { error } = await db.from('band_media').delete().in('id', weg);
      if (error) throw error;
    }
    for (const m of nu.filter(m => m.id)) {
      const oud = bmOrigineel.find(r => r[0] === m.id);
      if (oud && oud[1] === m.url && oud[2] === m.in_banner) continue;
      const { error } = await db.from('band_media').update({ url: m.url, platform: m.platform, in_banner: m.in_banner }).eq('id', m.id);
      if (error) throw error;
    }
    const nieuw = nu.filter(m => !m.id);
    if (nieuw.length) {
      const { error } = await db.from('band_media').insert(nieuw.map(m =>
        ({ band_id: id, media_type: m.media_type, url: m.url, platform: m.platform, in_banner: m.in_banner })));
      if (error) throw error;
    }

    const b = await bandBewerkGegevens('instagram, tiktok, youtube, band_media(id, media_type, url, platform, in_banner, created_at)');
    if (!b) return;
    bmZet(b);
    bmSnapshot = bmFieldSnapshot();
    showToast('Wijzigingen opgeslagen.');
    loadMyBands();
  } catch (e) {
    logCaught('saveBandMedia', e);
    showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(e));
  }
}

// ─── Uitnodigen vanuit Zoeken (besluit Ronald, 02-10-2026, na fase 3) ─────────
// Een tik op een open rol opent Zoeken (zoekMuzikantVoorRol()). Het venster
// van een muzikant uit die zoekopdracht krijgt dan de knop "Uitnodigen voor
// <band>", boven de berichtknop. Alleen voor een vaste rol: een invaller
// vraag je in een bericht. De band staat in zoekRolBand tot Zoeken opnieuw
// opent (configureSearchAccess()). Wie al lid of uitgenodigd is, krijgt geen
// knop.
let zoekRolBand = null; // { id, naam }

async function rolUitnodigKnopPlaatsen(musicianId) {
  const band = zoekRolBand;
  const voet = document.getElementById('profielSchermVoet');
  if (!band || !hasOwnProfile || !voet || !musicianId || musicianId === myMusicianId) return;
  if (typeof blokkeerIkZelf === 'function' && blokkeerIkZelf(musicianId)) return;
  const { data, error } = await db.from('band_members').select('status')
    .eq('band_id', band.id).eq('musician_id', musicianId);
  if (error) { logCaught('rolUitnodigKnopPlaatsen', error); return; }
  if (zoekRolBand !== band || (data || []).length) return;
  if (voet.querySelector('.rol-uitnodig-knop')) return;
  voet.insertAdjacentHTML('afterbegin',
    `<button class="btn btn-ghost rol-uitnodig-knop" onclick="rolUitnodigen('${jsAttr(musicianId)}')">Uitnodigen voor ${escHtml(band.naam)}</button>`);
}

async function rolUitnodigen(musicianId) {
  const band = zoekRolBand;
  if (!band) return;
  addMemberBandId = band.id;
  addMemberBandName = band.naam;
  const gelukt = await addBandMember(musicianId, '');
  if (gelukt) document.querySelector('#profielSchermVoet .rol-uitnodig-knop')?.remove();
}
