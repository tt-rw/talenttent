// ─── TT-09: onboarding hervatten na een refresh ──────────────────────────────
// Zolang het profiel nog niet is afgerond, bewaren we een kleine momentopname
// in de browser — nooit het wachtwoord.
//
// Gewijzigd 22-09-2026 (TT-42, besluit Ronald): dit stond in sessionStorage en
// staat nu in localStorage. Het oude besluit — "bij het sluiten van het
// tabblad vervalt dit bewust" — kan niet blijven staan naast route A: een
// 13-jarige wacht tot veertien dagen op de klik van zijn ouder, en al zijn
// antwoorden staan zolang alleen in zijn eigen browser. Sluit hij het tabblad,
// dan zou hij alles kwijt zijn. De omzetting geldt voor iedereen, niet alleen
// voor 13-15-jarigen: een maat wordt in de standaard doorgevoerd, nooit per
// scherm omzeild (projectinstructies §2 regel 11). Bijvangst: ook een
// dertigjarige die halverwege stopt, vindt zijn werk terug.
// TT-570 (06-11-2026, besluit Ronald): het account ontstaat niet meer na
// stap 1, maar samen met het profiel bij de laatste knop, voor iedereen. Tot
// dan staat alles alleen hier, net als bij route A.
const ONBOARDING_STORAGE_KEY = 'tt_onboarding_v1';

function saveOnboardingProgress() {
  // TT-42: bij route A bestaat er nog geen account, dus state.onboarding staat
  // nog uit. Dan is state.ouderRoute de reden om wél te bewaren.
  if (!state.onboarding && !state.ouderRoute) return;
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({
      userId: currentUser?.id || null,
      ouderRoute: !!state.ouderRoute,
      regEmail: state.regEmail || '',
      akkoord: !!document.getElementById('consentCheckbox')?.checked,
      // TT-543 (06-11-2026): de wizard telt 4 stappen. "stap" vervangt "step",
      // zodat een opname van vóór die dag herkenbaar is (zie opgeslagenStap()).
      stap: state.currentStep,
      fname: state.fname, lname: state.lname, birth_date: state.birth_date,
      username: state.username,
      city: state.city, zip: state.zip, bio: state.bio, citySource: state.citySource,
      naamTonen: state.naamTonen,
      instruments: state.instruments, instrumentLevels: state.instrumentLevels, genres: state.genres, songs: state.songs,
      mediaLinks: state.mediaLinks
      // Bewust NIET bewaard: regPassword, avatarUrl (blob-url overleeft een
      // refresh toch niet — zie bekende beperking TT-02), mediaFiles.
    }));
  } catch (e) {
    // localStorage kan vol of uitgeschakeld zijn (bijv. privénavigatie in
    // sommige browsers) — dan negeren we dit stil, de rest van de app blijft
    // gewoon werken, alleen de refresh-bescherming valt dan weg.
    console.error('Kon onboarding-voortgang niet bewaren:', e);
  }
}

function clearOnboardingProgress() {
  try { localStorage.removeItem(ONBOARDING_STORAGE_KEY); } catch (e) { /* zie boven */ }
}

// Vult de wizard-velden op basis van de huidige `state`, bij het hervatten
// van een registratie (hervatRegistratie()).
function populateWizardFieldsFromState() {
  document.getElementById('fname').value = state.fname;
  document.getElementById('lname').value = state.lname;
  document.getElementById('birth_date').value = state.birth_date;
  document.getElementById('zip').value = state.zip;
  document.getElementById('username').value = state.username || '';
  // Al een geldige, van jezelf bekende gebruikersnaam — geen "controleren..."
  // nodig, dat zou hier alleen verwarren (lijkt bezet terwijl het van jezelf is).
  usernameCheckedValue = state.username || '';
  usernameAvailable = !!state.username;
  zetUitslag('usernameStatus', state.username ? 'Huidige naam' : '', true);
  const cityFieldPWF = document.getElementById('city');
  cityFieldPWF.value = state.city;
  if (state.citySource === 'manual') {
    cityFieldPWF.readOnly = false; cityFieldPWF.style.cursor = '';
  } else {
    cityFieldPWF.readOnly = true; cityFieldPWF.style.cursor = 'not-allowed';
  }
  document.getElementById('postcodeStatus').textContent = '';
  document.getElementById('bio').value = state.bio;
  naamKeuzeBijwerken(WIZ_NAAM, state.naamTonen);

  renderInstrumentBadges('wizard');
  if (PICKERS.genre) renderPickerBadges(PICKERS.genre);

  renderSongs();
  renderMediaGrid();

  const avatarPreview = document.getElementById('avatarPreview');
  if (state.avatarUrl) {
    avatarPreview.innerHTML = `<img ${kleinFotoAttr(safeUrl(state.avatarUrl))} alt="profielfoto">`;
    document.getElementById('avatarRemoveBtn').classList.add('visible');
  } else {
    avatarPreview.innerHTML = ''; // TT-517 fase 6: de schijnwerper met silhouet (styles.css)
    document.getElementById('avatarRemoveBtn').classList.remove('visible');
  }
}

// Kale lezer.
function leesOpgeslagenVoortgang() {
  try { return JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) || 'null'); }
  catch (e) { return null; }
}

// TT-570: de momentopname van een registratie die nog loopt. Een opname met
// `mid` is van vóór TT-570 (account na stap 1) en telt niet meer. Bestaat er
// sinds de laatste knop wél een account maar geen profiel (de rest liep stuk),
// dan hoort de opname bij precies dat account: een ander account ziet hem nooit.
function leesRegistratieVoortgang() {
  const saved = leesOpgeslagenVoortgang();
  if (!saved || saved.mid) return null;
  if (saved.userId && (!currentUser || saved.userId !== currentUser.id)) return null;
  return saved;
}

// TT-42: route A — er is dan nog geen account en geen ingelogde gebruiker.
function leesOuderVoortgang() {
  const saved = leesRegistratieVoortgang();
  return saved && saved.ouderRoute && !currentUser ? saved : null;
}

// Een registratie hervatten. Draait bij het openen van de wizard. TT-570:
// voor iedereen, niet alleen route A: wie halverwege stopt, gaat in deze
// browser verder waar hij was. Loopt de registratie in dit tabblad al
// (state staat aan), dan blijft alles zoals het is: wat nog niet bewaard is,
// mag niet worden overschreven door de opname.
// TT-42: het kind van route A komt hier terug na de mail van zijn ouder, of
// gewoon omdat hij de app weer opent terwijl hij nog wacht.
// Geeft true als er iets is hervat.
function hervatRegistratie() {
  if (state.onboarding || state.ouderRoute) return false;
  const saved = leesRegistratieVoortgang();
  if (!saved || (saved.ouderRoute && currentUser)) return false;

  state.ouderRoute = !!saved.ouderRoute;
  state.onboarding = !saved.ouderRoute;
  state.regEmail = saved.regEmail || '';
  vulStateUitVoortgang(saved);
  populateWizardFieldsFromState();
  const emailVeld = document.getElementById('regEmail');
  if (emailVeld && !currentUser) emailVeld.value = state.regEmail;
  const vinkje = document.getElementById('consentCheckbox');
  if (vinkje && saved.akkoord) { vinkje.checked = true; updateSubmitProfileState(); }
  if (!state.ouderRoute) { goTo(opgeslagenStap(saved)); return true; }

  const aanvraag = ouderAanvraagLezen();
  if (!aanvraag) { goTo(opgeslagenStap(saved)); ouderLeeftijdsregel(); return true; }

  // Wacht hij nog, dan het wachtscherm; is de ouder akkoord, dan het
  // wachtwoordscherm. ouderStandVerversen() binnen ouderWachtTonen() haalt de
  // actuele stand op en schuift zo nodig zelf door.
  goTo(opgeslagenStap(saved));
  ouderLeeftijdsregel();
  if (aanvraag.stand === 'goedgekeurd') ouderWachtwoordTonen();
  else ouderWachtTonen();
  return true;
}

// TT-543 (06-11-2026, besluit Ronald): stap 3 "Wat wil je nu?" is weg; de
// wizard telt 4 stappen. Een opname van vóór die dag heeft "step" in de oude
// telling (0 tot en met 4): de setlist was 3 en de media 4, nu 2 en 3. De oude
// doelstap (2) wordt de setlist.
function opgeslagenStap(saved) {
  if (Number.isInteger(saved.stap)) return saved.stap;
  const oud = saved.step || 0;
  return oud >= 3 ? oud - 1 : oud;
}

// Zet één opgeslagen momentopname terug in `state`. Gedeeld door beide
// hervatroutes, zodat ze nooit uit elkaar kunnen lopen.
function vulStateUitVoortgang(saved) {
  state.fname = saved.fname || '';
  state.lname = saved.lname || '';
  state.username = saved.username || '';
  state.birth_date = saved.birth_date || '';
  state.city = saved.city || '';
  state.zip = saved.zip || '';
  state.bio = saved.bio || '';
  state.naamTonen = saved.naamTonen === 'gebruikersnaam' ? 'gebruikersnaam' : 'echt';
  state.citySource = saved.citySource || 'pdok';
  state.instruments = saved.instruments || [];
  state.instrumentLevels = saved.instrumentLevels || {};
  state.genres = saved.genres || [];
  state.songs = saved.songs || [];
  // TT-543 blok 3: een lege link (uit een opname van vóór het raster) telt niet.
  state.mediaLinks = (saved.mediaLinks || []).filter(l => l && String(l.url || '').trim());
  postcodeResolved = !!state.zip;
}

// TT-168-overgang (02-09-2026): bewerken loopt niet langer via de wizard.
// "Profiel bewerken" opent nu het tegeloverzicht (openTegelOverview()) —
// vijf losse subschermen, elk met een eigen smalle opslaanfunctie die
// alleen de eigen kolommen raakt. De oude aanpak (het hele state-object
// vullen en de wizard in "bewerkmodus" zetten) is vervallen; de wizard is
// voortaan uitsluitend voor het aanmaken van een nieuw account.
async function editMyProfile() {
  const mid = await getMyMusicianId();
  if (!mid) { geenProfielMelding('Je hebt nog geen profiel om te bewerken.'); return; }
  showView('profieltegels');
}
// Profielvolledigheid — alleen zichtbaar voor de eigenaar op "Mijn profiel"
// (Presentatie: profielstatus direct zichtbaar). Gebaseerd op echte opgeslagen
// data, niet op tijdelijke registratie-state.
function renderCompletenessMeter(m) {
  // TT-386 (30-09-2026, besluit Ronald): alleen de titel en een lage balk.
  // Het percentage staat direct achter het gele stuk, als een finish.
  // Geen vinkjes en geen tiptekst meer.
  const checks = [
    !!m.avatar_url,
    (m.bio || '').length > 20,
    (m.musician_instruments||[]).length > 0,
    (m.musician_genres||[]).length > 0,
    (m.musician_songs||[]).length >= 3,
    (m.musician_media||[]).length > 0,
  ];
  const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return voortgangsBalkHTML(pct, 'completenessMeter');
}

// TT-385 (besluit Ronald, punt 3): de band krijgt dezelfde balk en dezelfde
// functie. Alleen het getal verschilt: dat rekent elke kant zelf uit.
function voortgangsBalkHTML(pct, id) {
  return `
    <div${id ? ` id="${id}"` : ''} class="completeness-wrap">
      <div class="completeness-label">Profielvolledigheid</div>
      <div class="completeness-rij" role="progressbar" aria-label="Profielvolledigheid" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        ${pct > 0 ? `<div class="completeness-fill" style="flex:${pct};"></div>` : ''}
        <span class="completeness-pct">${pct}%</span>
        ${pct < 100 ? `<div class="completeness-rest" style="flex:${100 - pct};"></div>` : ''}
      </div>
    </div>`;
}


async function loadMyProfile(opties) {
  if (!currentUser) return;
  renderEmailBevestigBanner(); // TT-336
  const el = document.getElementById('myProfileContent');
  // Tabwissel: staat er al een geladen profiel van deze gebruiker, laat dat staan tot de nieuwe er is.
  if (!(opties && opties.behoud && el.dataset.klaar === currentUser.id)) {
    delete el.dataset.klaar;
    el.innerHTML = '<div style="color:var(--muted);padding:40px;text-align:center;">Laden...</div>';
  }

  // Bugfix 19-08-2026 (Ronald, live gemeld): dit was tot vandaag een
  // sterretje-select. Sinds B-01 tweede stap (18-08-2026) mag authenticated
  // birth_date niet meer lezen, ook niet van zichzelf. Postgres staat een
  // sterretje-select alleen toe als je écht alle kolommen mag lezen — kan dat
  // niet, dan faalt de hele vraag (geen gedeeltelijk resultaat). Precies dat
  // gebeurde hier: elk ingelogd profiel zag zijn eigen profiel niet meer, met
  // "Nog geen profiel" als gevolg. Zelfde oplossing als eerder al toegepast
  // bij de zoekresultaten en de profielmodal: vaste kolomlijst, geen
  // birth_date, leeftijd apart via tt_musicians_ages().
  // TT-367: leeftijd, bands en de stand van Delen hangen alleen af van het id.
  // Ze lopen tegelijk met het profiel, niet een voor een erna.
  const bijvragen = (id) => Promise.all([
    db.rpc('tt_musicians_ages', { ids: [id] }), profielBandsOphalen(id), profielDeelStand(id)]);
  const voorafId = myMusicianId;
  const vooraf = voorafId ? bijvragen(voorafId) : null;
  const { data: m, error } = await db.from('musicians')
    .select(`id, weergavenaam, username, city, bio,
             avatar_url, accepts_band_invites,
             musician_instruments(instrument, niveau), musician_genres(genre),
             musician_songs(song_title, song_artist, mastery_level),
             musician_media(media_type, url, platform, in_banner, created_at, uitsnede)`)
    .eq('user_id', currentUser.id)
    .single();

  // TT-561: een storing is geen "geen profiel". PGRST116 = geen rij.
  if (error && error.code !== 'PGRST116') {
    logCaught('loadMyProfile', error);
    el.innerHTML = foutStaatHTML(error, 'je profiel laden', 'loadMyProfile()');
    return;
  }
  if (error || !m) {
    // TT-248 (11-09-2026): inhoudelijk ongewijzigd, nu via de vaste vorm uit
    // huisstijl §15. Dit was het voorbeeld waar de andere lege staten naar
    // toe zijn gebracht.
    el.innerHTML = emptyStateHTML(
      'Nog geen profiel',
      'Maak je muzikantprofiel aan om gevonden te worden.',
      'Profiel aanmaken →',
      "showView('register')"
    );
    return;
  }

  const [{ data: myAges }, mijnBands, deelAan] = await (voorafId === m.id ? vooraf : bijvragen(m.id));
  m.age = (myAges && myAges[0]) ? myAges[0].age : undefined;
  m.bands = mijnBands; // TT-385 punt 17: het blok Bands
  m.beschikbaar = m.accepts_band_invites !== false; // TT-457: de zin niet beschikbaar

  // TT-120 (22-08-2026): "Jouw pad op The Talent Tent" (TT-48) staat niet
  // meer op Mijn Profiel. De functie renderProgressPanel() is op 16-09-2026
  // verwijderd als dode code; terug te vinden in commit 05f8ddd.
  el.innerHTML = buildMusicianDetailHTML(m, true) + renderCompletenessMeter(m);
  el.dataset.klaar = currentUser.id;
  // TT-517 fase 4: zie de toelichting in laadProfielScherm() — pas starten
  // als de hoes in de pagina staat.
  hoesStarten(el);
  mediaTitelsBijwerken(el);
  // TT-249: naam passend maken zodra hij in de pagina staat. Mijn Profiel is
  // het krapste scherm. Sinds TT-380 staat het ⋯-menu onder de naam.
  fitProfileName(el);
  loadBandInvites(m.id);

  // TT-56 (12-08-2026), TT-457: beschikbaarheid — de tegel weerspiegelt de
  // huidige stand. m.accepts_band_invites komt mee via de select hierboven.
  myBeschikbaar = m.accepts_band_invites !== false;
  updateBeschikbaarToggleBtn();
  // TT-410b: de stand van "Delen via link" komt uit één kleine vraag, zodat
  // Mijn Profiel ook laadt als het databasescript nog niet is gedraaid.
  myDeelAan = deelAan;
  updateDelenToggleBtn();
}

// TT-437 (07-10-2026, besluit Ronald): de keuze staat in Instellingen (tegel
// "Beschikbaarheid", sinds TT-457 de plaats van "Band-uitnodigingen"), niet
// meer in het ⋯-menu van Mijn Profiel. Het verborgen <select> is de bron van
// waarheid, zoals bij Thema.
function updateBeschikbaarToggleBtn() {
  const sel = document.getElementById('beschikbaarKeuze');
  if (!sel) return;
  sel.value = myBeschikbaar ? 'ja' : 'nee';
  refreshChoiceField('beschikbaar');
}

// TT-457 (10-10-2026, besluit Ronald): een muzikant kan zichzelf als niet
// beschikbaar zetten. Zijn profiel toont dan de zin "Momenteel niet
// beschikbaar." (nietBeschikbaarMeldingHTML() in
// utils.js) en een bandbeheerder kan hem niet meer uitnodigen (TT-56, TT-41).
// Het profiel blijft in alle zoekresultaten staan en een los bericht blijft
// mogelijk. De kolom heet nog `accepts_band_invites`: waar betekent beschikbaar.
async function zetBeschikbaarheid(beschikbaar) {
  if (!myMusicianId) return;
  try {
    const { error } = rijenGeraakt(await db.from('musicians')
      .update({ accepts_band_invites: beschikbaar })
      .eq('id', myMusicianId).select('id'));
    if (error) throw error;
    myBeschikbaar = beschikbaar;
    updateBeschikbaarToggleBtn();
    showToast(beschikbaar ? 'Je staat weer als beschikbaar.' : 'Je staat nu als niet beschikbaar.');
  } catch (e) {
    logCaught('zetBeschikbaarheid', e);
    showToast(friendlyErrorMessage(e, 'je beschikbaarheid opslaan'));
    updateBeschikbaarToggleBtn(); // de tegel toont weer de stand van de database
  }
}

// TT-437: de twee profielinstellingen in Instellingen laden hun stand bij het
// openen van het scherm. Zonder profiel (alleen een account) is er niets om
// in te stellen: het blok blijft dan weg.
async function laadInstellingen() {
  const blok = document.getElementById('instellingenProfielBlok');
  if (!blok) return;
  const mid = await getMyMusicianId();
  blok.style.display = mid ? '' : 'none';
  if (!mid) return;
  try {
    const { data, error } = await db.from('musicians').select('accepts_band_invites').eq('id', mid).single();
    if (error) throw error;
    myBeschikbaar = data.accepts_band_invites !== false;
  } catch (e) {
    logCaught('laadInstellingen', e);
  }
  updateBeschikbaarToggleBtn();
  myDeelAan = await profielDeelStand(mid);
  updateDelenToggleBtn();
}

// ─── Submit → opslaan in Supabase ────────────────────────────────────────────

// Bevinding Ronald (10-08-2026): akkoord met Voorwaarden/Privacyverklaring/
// Gedragscode moet een expliciete handeling zijn, niet impliciet via de klik
// op "Profiel aanmaken" zelf. Alleen relevant bij een nieuw account (zie
// showView('register') hierboven, dat de checkbox bij bewerken verbergt).
function updateSubmitProfileState() {
  const box = document.getElementById('consentCheckbox');
  const btn = document.getElementById('submitProfileBtn');
  if (!box || !btn) return;
  btn.disabled = !box.checked;
  // TT-42: bij route A kan er een lange onderbreking tussen dit vinkje en het
  // aanmaken van het account zitten. Het vinkje gaat daarom mee in de
  // momentopname, anders staat het na terugkomst weer uit.
  saveOnboardingProgress();
}

// Schrijft het hele profiel weg: de rij en, in één databasefunctie, de
// instrumenten, genres, nummers en media. TT-570: de laatste stap van de
// wizard, voor elke registratie. Ook bij een tweede poging nadat de eerste
// halverwege stukliep: dan bestaat de rij al en klopt het resultaat toch.
async function persistEditedProfile(mid) {
  if (!mid) return;
  const { error: uErr } = rijenGeraakt(await db.from('musicians').update({
    fname:            state.fname,
    lname:            state.lname || null,
    username:         state.username,
    birth_date:       toISODate(state.birth_date),
    city:             state.city,
    zip:              state.zip || null,
    bio:              state.bio || null,
    naam_tonen:       state.naamTonen,
    avatar_url:       state.avatarUrl || null,
    ...wazigVeld(state.avatarUrl),
    city_source:      state.citySource || 'pdok',
    profile_complete: true, // de klik op "Profiel aanmaken". Bij 16+ wacht de database eerst op de bevestiging (TT-336)
  }).eq('id', mid).select('id'));
  if (uErr) throw new Error(uErr.message);
  opslagOpruimen('avatars', currentUser && currentUser.id, [state.avatarUrl]);

  // TT-281 (23-09-2026): wissen en opnieuw vullen gebeurt in één
  // databasefunctie, in één transactie. Mislukt één stap, dan blijft alles
  // zoals het was. Vroeger wiste de app eerst zonder controle en vulde daarna
  // aan; mislukte het aanvullen, dan was de oude data weg.
  // Al geüploade Storage-bestanden zelf blijven gewoon staan (alleen de
  // koppeling in musician_media wordt hier ververst); verwijderde foto's/
  // video's zijn al apart uit Storage opgeruimd door removeMedia().
  const linkMedia = state.mediaLinks
    .filter(l => l.url.trim())
    .map(l => ({ media_type: 'link', url: l.url, platform: detectPlatform(l.url), in_banner: !!l.inBanner }));
  const fileMedia = state.mediaFiles
    .filter(m => m.url && !m.uploading && !m.url.startsWith('blob:'))
    .map(m => ({ media_type: m.type, url: m.url, in_banner: !!m.inBanner, uitsnede: bannerKader(m), wazig: wazigVoor(m.url) }));

  const { error: kErr } = await db.rpc('tt_save_musician_koppelingen', {
    p_musician_id: mid,
    p_instruments: state.instruments.map(instrument => ({ instrument, niveau: state.instrumentLevels[instrument] || null })),
    p_genres:      state.genres.map(genre => ({ genre })),
    p_songs:       state.songs.map(s => ({ song_title: s.title, song_artist: s.artist, mastery_level: s.level })),
    p_media:       linkMedia.concat(fileMedia),
  });
  if (kErr) throw new Error(kErr.message);
  opslagOpruimen('media', currentUser && currentUser.id, fileMedia.map(m => m.url));

  state.savedId = mid;
}

// ─── TT-336: het e-mailadres bevestigen (16 jaar en ouder) ──────────────────
// Besluiten Ronald, 26-09-2026: bevestigen gebeurt na "Profiel aanmaken". Tot
// de klik in de mail mag iemand rondkijken en zoeken, maar is hij niet te
// vinden, stuurt hij geen berichten en richt hij geen band op. Een verkeerd
// getypt e-mailadres is aan te passen (2a). De database bewaakt dit; de Edge
// Function `email-bevestigen` stuurt de mail en zet het profiel online.
// Woordkeus: altijd "e-mailadres", nooit "adres" (Ronald, 26-09-2026).

// Verwachte uitkomsten van de mailaanvraag: geen storing, dus geen regel in
// app_error_log. De gebruiker krijgt de melding gewoon te zien.
function bevestigVerwachteUitkomst(e) {
  return /al in gebruik|Nog even wachten/i.test((e && e.message) || '');
}

async function bevestigApi(actie, gegevens) {
  const { data, error } = await db.functions.invoke('email-bevestigen', {
    body: Object.assign({ actie }, gegevens || {})
  });
  if (error) throw new Error(await extractFnErrorDetail(error));
  if (data && data.error) throw new Error(data.error);
  return data || {};
}

// Leest of de database het profiel net heeft laten wachten. Bij een fout:
// niet wachten — dan toont de app "Profiel aangemaakt!", zoals vóór TT-336.
async function profielWachtOpBevestiging(mid) {
  const { data, error } = await db.from('musicians')
    .select('wacht_op_bevestiging').eq('id', mid).maybeSingle();
  if (error) { logCaught('profielWachtOpBevestiging', error); return false; }
  return !!data?.wacht_op_bevestiging;
}

// Na "Profiel aanmaken": de mail aanvragen en naar Mijn Profiel, waar het
// blok "Nog één stap" staat. Mislukt de mail, dan staat daar de knop
// "Mail opnieuw sturen".
async function bevestigingStarten() {
  // Kwam iemand via het berichticoon in de wizard (TT-32)? Een bericht kan
  // pas na de klik in de mail; niet later alsnog het berichtvenster openen.
  pendingMessageRecipient = null;
  try { await bevestigApi('start'); }
  catch (e) {
    logCaught('bevestigingStarten', e);
    showToast('De mail kon niet worden verstuurd. Tik op "Mail opnieuw sturen".');
  }
  hideSaving();
  showView('myprofile');
}

// Het blok bovenaan Mijn Profiel. Alleen zichtbaar zolang het profiel wacht.
async function renderEmailBevestigBanner() {
  const el = document.getElementById('emailBevestigBanner');
  if (!el || !currentUser) return;
  // TT-444: staat de melding "E-mailadres bevestigd" er nog, laat die dan
  // staan tot hij zelf verdwijnt.
  if (el.dataset.bevestigd === '1') return;
  const { data, error } = await db.from('musicians')
    .select('wacht_op_bevestiging').eq('user_id', currentUser.id).maybeSingle();
  if (error) logCaught('renderEmailBevestigBanner', error);
  if (error || !data?.wacht_op_bevestiging) { el.innerHTML = ''; bevestigPeilStoppen(); return; }
  // Dicht tot de app opnieuw opent: het profiel blijft offline tot de klik,
  // dus de melding komt de volgende keer terug (sessionStorage, geen opslag
  // = altijd tonen).
  let dicht = false;
  try { dicht = sessionStorage.getItem('tt-bevestig-melding-dicht') === '1'; } catch (e) { /* geen opslag: tonen */ }
  if (dicht) { el.innerHTML = ''; bevestigPeilStoppen(); return; }
  bevestigPeilStarten();
  el.innerHTML = `
    <div class="melding melding-met-sluit">
      <button type="button" class="modal-close" onclick="bevestigMeldingSluiten()" aria-label="Sluiten"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"></line><line x1="19" y1="5" x2="5" y2="19"></line></svg></button>
      <p class="melding-kop">Nog één stap: bevestig je e‑mailadres</p>
      <p class="melding-tekst">We hebben een mail gestuurd naar <strong id="bevestigEmailadres">${escHtml(currentUser.email || '')}</strong>. Tik op de knop in die mail. Daarna staat je profiel online en kun je berichten sturen.</p>
      <div id="bevestigKnoppen">
        <div class="knoppen-stapel">
          <button class="btn btn-ghost" id="bevestigOpnieuwBtn" onclick="bevestigMailOpnieuw()">Mail opnieuw sturen</button>
        </div>
        <p class="stille-link-regel"><button type="button" class="stille-link" onclick="bevestigEmailadresTonen(true)">E-mailadres klopt niet? Pas het aan</button></p>
      </div>
      <div id="bevestigEmailadresVak" style="display:none;">
        <div class="field">
          <label for="bevestigNieuwEmailadres">Je juiste e-mailadres</label>
          <input type="email" id="bevestigNieuwEmailadres" placeholder="jouw@email.nl" autocomplete="email" inputmode="email" enterkeyhint="send" onkeydown="submitOnEnter(event, bevestigEmailadresOpslaan)">
        </div>
        <div class="btn-row" style="margin-top:12px;">
          <button class="btn btn-ghost" onclick="bevestigEmailadresTonen(false)">Annuleren</button>
          <button class="btn btn-primary" id="bevestigEmailadresBtn" onclick="bevestigEmailadresOpslaan()">Mail sturen</button>
        </div>
      </div>
    </div>`;
}

// TT-444 (bevinding Ronald, 09-10-2026: "na bevestiging blijft deze melding
// staan"). De klik in de mail gebeurt vaak in een andere browser of op een
// ander toestel dan waar de app openstaat; dan weet deze pagina het niet. Zolang
// het blok zichtbaar is, kijkt de app elke 5 seconden of het profiel online is,
// en meteen als de app weer in beeld komt. Is het zover, dan staat er kort
// "Je e-mailadres is bevestigd" en verdwijnt het blok vanzelf; het profiel
// laadt opnieuw, zonder wachtbericht.
let bevestigPeilTimer = null;

function bevestigPeilStarten() {
  if (bevestigPeilTimer) return;
  bevestigPeilTimer = setInterval(bevestigPeilen, 5000);
}

function bevestigPeilStoppen() {
  if (bevestigPeilTimer) { clearInterval(bevestigPeilTimer); bevestigPeilTimer = null; }
}

async function bevestigPeilen() {
  const el = document.getElementById('emailBevestigBanner');
  if (!el || !currentUser || !el.querySelector('#bevestigKnoppen')) { bevestigPeilStoppen(); return; }
  if (document.visibilityState !== 'visible' || el.offsetParent === null) return;
  const { data, error } = await db.from('musicians')
    .select('wacht_op_bevestiging').eq('user_id', currentUser.id).maybeSingle();
  if (error) { logCaught('bevestigPeilen', error); return; }
  if (!data || data.wacht_op_bevestiging) return;
  bevestigPeilStoppen();
  el.dataset.bevestigd = '1';
  el.innerHTML = `
    <div class="melding" role="status">
      <p class="melding-kop">Je e‑mailadres is bevestigd</p>
      <p class="melding-tekst">Je profiel staat online. Muzikanten kunnen je nu vinden en je kunt berichten sturen.</p>
    </div>`;
  setTimeout(() => { delete el.dataset.bevestigd; el.innerHTML = ''; }, 6000);
  loadMyProfile({ behoud: true });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') bevestigPeilen();
});

function bevestigMeldingSluiten() {
  try { sessionStorage.setItem('tt-bevestig-melding-dicht', '1'); } catch (e) { /* geen opslag: sluit alleen nu */ }
  const el = document.getElementById('emailBevestigBanner');
  if (el) el.innerHTML = '';
}

function bevestigEmailadresTonen(aan) {
  const vak = document.getElementById('bevestigEmailadresVak');
  const knoppen = document.getElementById('bevestigKnoppen');
  if (!vak || !knoppen) return;
  vak.style.display = aan ? '' : 'none';
  knoppen.style.display = aan ? 'none' : '';
  const veld = document.getElementById('bevestigNieuwEmailadres');
  clearFieldErrors(vak);
  if (veld) veld.value = '';
}

// De uitkomst van `start` of `e-mailadres`: al bevestigd (op een ander
// toestel), of een nieuwe mail.
function bevestigUitkomstTonen(uit) {
  if (uit.bevestigd) {
    showToast('Je e-mailadres is al bevestigd. Je profiel staat online.');
    loadMyProfile();
    return;
  }
  if (uit.email && currentUser) currentUser.email = uit.email;
  showToast(`Mail gestuurd naar ${uit.email || 'je e-mailadres'}.`);
}

async function bevestigMailOpnieuw() {
  const knop = document.getElementById('bevestigOpnieuwBtn');
  if (knop) knop.disabled = true;
  try { bevestigUitkomstTonen(await bevestigApi('start')); }
  catch (e) { if (!bevestigVerwachteUitkomst(e)) logCaught('bevestigMailOpnieuw', e); showToast(e.message || friendlyErrorMessage(e, 'de bevestigingsmail versturen')); }
  finally { if (knop) knop.disabled = false; }
}

async function bevestigEmailadresOpslaan() {
  const vak = document.getElementById('bevestigEmailadresVak');
  const veld = document.getElementById('bevestigNieuwEmailadres');
  const knop = document.getElementById('bevestigEmailadresBtn');
  if (!vak || !veld) return;
  clearFieldErrors(vak);
  const email = veld.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError(veld, 'Vul een geldig e-mailadres in'); return; }
  if (knop) knop.disabled = true;
  try {
    const uit = await bevestigApi('e-mailadres', { email });
    // TT-405: de sessie in de browser kent het nieuwe e-mailadres pas na een
    // verversing. Zonder die stap zet de volgende SIGNED_IN het oude terug.
    const { data: ververst } = await db.auth.refreshSession();
    if (ververst?.session?.user) { currentUser = ververst.session.user; verversEmailWeergave(currentUser.email || ''); }
    bevestigUitkomstTonen(uit);
    if (!uit.bevestigd) await renderEmailBevestigBanner();
  } catch (e) {
    if (!bevestigVerwachteUitkomst(e)) logCaught('bevestigEmailadresOpslaan', e);
    // Een fout over het e-mailadres zelf hoort bij het veld; de rest is een toast.
    if (/al in gebruik/i.test(e.message || '')) setFieldError(veld, TEKST_EMAIL_BEZET);
    else if (/e-mailadres/i.test(e.message || '')) setFieldError(veld, e.message.replace(/\.$/, ''));
    else showToast(e.message || friendlyErrorMessage(e, 'je e-mailadres opslaan'));
  } finally { if (knop) knop.disabled = false; }
}

// De knop in de mail: #bevestig/<code>. Werkt op elk toestel en in elke
// browser, ook zonder inlog. Dezelfde pagina als die van de ouder
// (view-toestemming, toestemmingMeldingTonen() in ouder.js), zodat er geen
// zestiende view bij komt. Is hier hetzelfde account ingelogd, dan gaat het
// meteen door naar Mijn Profiel.
async function bevestigPaginaOpenen(code) {
  showView('toestemming');
  toestemmingMeldingTonen('E-mailadres bevestigen', ['Even geduld...']);
  let uit;
  try { uit = await bevestigApi('bevestig', { code }); }
  catch (e) {
    logCaught('bevestigPaginaOpenen', e);
    toestemmingMeldingTonen('E-mailadres bevestigen lukte niet', [
      'We konden je e-mailadres nu niet bevestigen. Tik over een paar minuten opnieuw op de knop in de mail.']);
    return;
  }
  const gelukt = uit.stand === 'bevestigd' || uit.stand === 'al';
  if (gelukt && currentUser && uit.musician_id && uit.musician_id === await getMyMusicianId()) {
    showView('myprofile', 'redirect');
    showToast(uit.stand === 'bevestigd'
      ? 'Je e-mailadres is bevestigd. Je profiel staat online.'
      : 'Je e-mailadres was al bevestigd.');
    return;
  }
  const knop = currentUser
    ? { tekst: 'Naar mijn profiel', actie: 'naarHoogsteScherm()' }
    : { tekst: 'Inloggen', actie: "showView('auth')" };
  if (uit.stand === 'bevestigd') {
    toestemmingMeldingTonen('Je e-mailadres is bevestigd',
      ['Je profiel staat online. Muzikanten kunnen je nu vinden.'], knop);
  } else if (uit.stand === 'al') {
    toestemmingMeldingTonen('Je e-mailadres is al bevestigd', ['Je profiel staat online.'], knop);
  } else if (uit.stand === 'oud') {
    toestemmingMeldingTonen('Deze link werkt niet meer',
      ['Je hebt je e-mailadres daarna nog aangepast. Gebruik de knop in de nieuwste mail.']);
  } else {
    toestemmingMeldingTonen('Deze link werkt niet',
      ['Heb je meer mails van ons gekregen? Gebruik dan de knop in de nieuwste.']);
  }
}

// TT-570 (06-11-2026, besluit Ronald): account en profiel zijn één handeling,
// bij deze knop, voor iedereen. Daarvoor bestaat er geen account, dus kan
// niemand halverwege vastzitten.
async function submitProfile() {
  // Defensieve check naast de disabled-knop: een nieuw account mag nooit
  // aangemaakt worden zonder aangevinkt akkoord.
  if (!document.getElementById('consentCheckbox')?.checked) {
    showToast('Vink eerst aan dat je akkoord gaat met de voorwaarden.');
    return;
  }

  // TT-42 (route A): is de gebruiker 13, 14 of 15, dan ontstaat het account
  // pas na de goedkeuring van zijn ouder én nadat hij zelf een wachtwoord
  // heeft gekozen. Zolang state.regPassword leeg is, is dat nog niet gebeurd:
  // deze knop brengt hem dan naar het wachtscherm of het wachtwoordscherm.
  // ouderProfielAanmaken() zet het wachtwoord en roept deze functie daarna
  // opnieuw aan — die tweede keer loopt hij gewoon door.
  if (state.ouderRoute && !state.regPassword) {
    const aanvraag = ouderAanvraagLezen();
    if (!aanvraag) { ouderStapTonen(); return; }
    if (aanvraag.stand === 'goedgekeurd') ouderWachtwoordTonen();
    else ouderWachtTonen();
    return;
  }

  // TT-570: het wachtwoord staat bewust niet in de browser. Na verversen is
  // het dus weg: terug naar stap 1, de fout bij het veld, de rest blijft staan.
  // De tekst zegt waarom je terug bent (besluit Ronald, 06-11-2026).
  if (!currentUser && !state.ouderRoute && !state.regPassword) {
    terugNaarVeld('regPassword', 'Vul je wachtwoord opnieuw in');
    return;
  }

  showSaving();
  myOwnCity = null; // eigen plaats kan net gewijzigd zijn — cache opnieuw laten opbouwen
  onboardingInFlight = true; // zie core.js: het inloggen hieronder stuurt niemand weg

  try {
    let userId = currentUser?.id || null;
    if (!userId) {
      userId = await accountAanmaken();
      if (!userId) return; // de fout staat al bij het veld
    }

    // TT-02: pas nu bestaat er een user_id/sessie om naar Storage te mogen
    // schrijven. Een mislukte upload houdt het profiel niet tegen.
    if (state.avatarFile) {
      try {
        const { url, path } = await uploadAvatarFile(state.avatarFile, userId);
        state.avatarUrl = url;
        state.avatarPath = path;
      } catch (e) {
        logCaught('submitProfile', e);
        showToast('Profiel opgeslagen, maar de profielfoto kon niet worden geüpload. Voeg de foto later toe via Profiel bewerken.');
        state.avatarUrl = null;
      }
      state.avatarFile = null;
    }

    // TT-42, TT-570: media die tijdens de wizard is uitgekozen, kon toen
    // nergens heen — er was nog geen account. Nu wel. Mislukt een upload, dan
    // blokkeert dat het profiel niet; dat bestand valt eruit en de gebruiker
    // kan het later alsnog toevoegen via Profiel bewerken.
    const wachtendeBestanden = state.mediaFiles.filter(m => m.bestand);
    for (const m of wachtendeBestanden) {
      try {
        const { url, path } = await uploadMediaFile(m.bestand, userId);
        m.url = url;
        m.path = path;
        m.bestand = null;
      } catch (e) {
        logCaught('submitProfile-media', e);
        m.url = '';
      }
    }

    // De rij. Bestaat hij al, dan liep een eerdere poging na dit punt stuk:
    // die rij gebruiken, één rij per account (musicians_user_id_idx).
    // Bugfix 23-08-2026: alleen 'id' terugvragen; birth_date mag authenticated
    // niet lezen, een kale .select() zou falen.
    const { data: bestaand, error: bestaatFout } = await db.from('musicians').select('id').eq('user_id', userId).single();
    if (bestaatFout && bestaatFout.code !== 'PGRST116') throw bestaatFout; // TT-561: storing is geen "geen profiel"
    let mid = bestaand?.id || null;
    if (!mid) {
      const { data: musician, error: mErr } = await db
        .from('musicians')
        .insert({
          fname:            state.fname,
          lname:            state.lname || null,
          username:         state.username,
          birth_date:       toISODate(state.birth_date),
          city:             state.city,
          zip:              state.zip || null,
          bio:              state.bio || null,
          profile_color:    DEFAULT_PROFILE_COLOR,
          avatar_url:       state.avatarUrl || null,
          ...wazigVeld(state.avatarUrl),
          city_source:      state.citySource || 'pdok',
          user_id:          userId,
          profile_complete: true,
        })
        .select('id')
        .single();
      if (mErr) throw new Error(mErr.message);
      mid = musician.id;
    }
    myMusicianId = mid;

    // Instrumenten, genres, nummers en media in één transactie (TT-281).
    await persistEditedProfile(mid);
    // Nu het profiel er staat, hoort er niets meer van in de browser.
    clearOnboardingProgress();
    state.onboarding = false;
    state.ouderRoute = false;
    // TT-336: bij 16+ houdt de database het profiel onzichtbaar tot de klik in de mail.
    if (await profielWachtOpBevestiging(mid)) { await bevestigingStarten(); return; }
    showSaveSuccess();

  } catch (err) {
    logCaught('submitProfile', err);
    showSaveError(err.message, 'je profiel aanmaken');
  } finally {
    onboardingInFlight = false;
  }
}

// TT-570: maakt het account aan en logt in. Geeft het id, of null als de fout
// bij een veld staat. Zo'n fout brengt de gebruiker terug naar dat veld; alles
// wat hij invulde, blijft staan (eis Ronald, 06-11-2026).
async function accountAanmaken() {
  const { data: authData, error: authErr } = await db.auth.signUp({
    email:    state.regEmail,
    password: state.regPassword,
    options:  { data: { fname: state.fname } }
  });
  // TT-481: een te makkelijk wachtwoord hoort bij het veld. Geen storing,
  // dus geen logregel.
  if (authErr && isZwakWachtwoordFout(authErr)) { terugNaarVeld('regPassword', TEKST_ZWAK_WACHTWOORD); return null; }
  // 22-08-2026 (P0, live gemeld door Ronald): een eerdere poging met dit
  // e-mailadres kan het account al hebben gemaakt, ook als de rest toen niet
  // lukte. Bij precies die melding inloggen met de ingevulde gegevens.
  const alAccount = !!authErr && /already registered|already exists/i.test(authErr.message || '');
  if (authErr && !alAccount) throw new Error(authErr.message);

  // Direct inloggen — e-mailbevestiging is uit, sessie is meteen actief. Dit
  // activeert ook onAuthStateChange (SIGNED_IN); onboardingInFlight voorkomt
  // dat die de gebruiker voortijdig naar Mijn Profiel stuurt.
  const { data: signInData, error: signInErr } = await db.auth.signInWithPassword({
    email: state.regEmail, password: state.regPassword
  });
  if (signInErr) {
    // Een ander wachtwoord bij een bestaand account (TT-444): bij het
    // e-mailadres zelf. Route A vroeg het e-mailadres al na bij de aanvraag.
    if (alAccount && !state.ouderRoute
        && /invalid login credentials|invalid_credentials|invalid grant/i.test(signInErr.message || '')) {
      terugNaarVeld('regEmail', TEKST_ACCOUNT_BESTAAT);
      return null;
    }
    throw new Error(signInErr.message);
  }
  const authUser = signInData.user || authData?.user || null;
  if (!authUser?.id) throw eigenFout('Je account is aangemaakt, maar inloggen lukte niet. Ga naar Inloggen en log in met je e-mailadres en wachtwoord.');
  currentUser = authUser;

  // 11-10-2026: het account bestaat, dus het wachtwoordveld hoeft niets meer
  // te bevatten. Bleef het gevuld, dan bood Chrome later midden in de app
  // aan het wachtwoord op te slaan.
  const regPwVeld = document.getElementById('regPassword');
  if (regPwVeld) regPwVeld.value = '';
  // De opname hoort nu bij dit account: liep de rest stuk, dan vindt hij na
  // inloggen zijn antwoorden terug (leesRegistratieVoortgang()).
  saveOnboardingProgress();
  return authUser.id;
}

// TT-570: terug naar het veld met de fout. Route A heeft het wachtwoord op
// het laatste scherm, niet in stap 1.
function terugNaarVeld(id, tekst) {
  document.getElementById('saveOverlay').classList.remove('visible');
  if (state.ouderRoute) { setFieldError(document.getElementById('ouderWachtwoordVeld'), tekst); return; }
  goTo(0);
  showFieldErrors([[id, tekst]]);
}

// ─── State ───────────────────────────────────────────────────────────────────

// TT-23: er is geen kleurkiezer (meer) in de app — de accentkleur van een nieuw
// profiel is dus altijd de merkkleur. Vroeger stond dit als state.profileColor
// in de wizard, wat de indruk wekte dat de gebruiker er iets over te zeggen had.
// Bestaande profielen met een afwijkende kleur in de database blijven ongemoeid:
// bij het bewerken van een profiel wordt profile_color niet meer overschreven.
const DEFAULT_PROFILE_COLOR = '#FFB81C';

// TT-352 (27-09-2026): één bron voor een lege wizard, bij het laden én bij
// uitloggen. Tot die dag stond een tweede kopie van dit object in
// onUserLoggedOut() (core.js); die liep al achter (ouderRoute ontbrak).
function legeWizardState() {
  return {
    currentStep: 0,
    fname: '', lname: '', birth_date: '', city: '', zip: '', bio: '',
    username: '',
    citySource: 'pdok',
    regEmail: '', regPassword: '',
    instruments: [],
    instrumentLevels: {}, // TT-51 (12-08-2026): instrument (string) -> niveau 1-5
    genres: [],
    songs: [],
    naamTonen: 'echt', // TT-543: Echte naam of Gebruikersnaam, zoals in de tegel Wie ben je (TT-420)
    avatarUrl: null,
    avatarFile: null,
    avatarPath: null,
    ouderRoute: false, // TT-42: true zolang 13-15 wacht op de klik van zijn ouder
    mediaFiles: [],
    mediaLinks: [],
    onboarding: false // true zolang het account al bestaat maar het profiel nog niet is afgerond (TT-09)
  };
}
let state = legeWizardState();

// TT-352 (27-09-2026): na uitloggen stonden het e-mailadres en het wachtwoord
// van de vorige registratie nog in de wizard. nextStep() leest de velden, niet
// state. Zo kwam de volgende persoon op een gedeeld toestel met "Verder" in
// het account van de vorige, zonder wachtwoord. Deze functie maakt state én
// elk veld leeg, en zet de wizard terug op stap 1.
function wizardLeegmaken() {
  state = legeWizardState();
  postcodeResolved = false;
  const view = document.getElementById('view-register');
  if (!view) return;
  view.querySelectorAll('input, textarea').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
    else if (!['button', 'submit', 'hidden'].includes(el.type)) el.value = '';
  });
  clearFieldErrors(view);
  populateWizardFieldsFromState();
  updateSubmitProfileState();
  goTo(0);
}

// ─── Init ────────────────────────────────────────────────────────────────────

function init() {
  // TT-116 (21-08-2026): instrument- en genrekeuze zijn nu een pulldown-veld
  // met badges, geen altijd-zichtbaar knoppenraster meer. Zie de
  // "Kies-en-badge component" verderop in dit blok.
  // TT-168-overgang (02-09-2026): instrumentpicker cfg-based, wizard is één
  // van de twee registraties (de andere: tegelscherm "Wat speel je").
  initInstrumentPicker({
    id: 'wizard',
    fieldId: 'instrumentPickerField', badgeRowId: 'instrumentBadgeRow',
    getInstruments: () => state.instruments, getLevels: () => state.instrumentLevels,
    onChange: saveOnboardingProgress
  });
  initPicker({
    id: 'genre',
    fieldId: 'genrePickerField', badgeRowId: 'genreBadgeRow',
    options: GENRES, getList: () => state.genres,
    placeholder: 'Kies een genre',
    sheetTitle: 'Kies een genre',
    onChange: saveOnboardingProgress
  });

  syncViewToggles(); // TT-U13: schakelaars gelijkzetten met de werkelijke stand

  // Update avatar initials placeholder reactively
  document.getElementById('fname').addEventListener('input', () => {
    state.fname = document.getElementById('fname').value.trim();
  });
  document.getElementById('bio').addEventListener('input', () => {
    state.bio = document.getElementById('bio').value.trim();
  });
  // TT-543: het voorbeeld "Zo zien anderen je" volgt de velden, zoals in de tegel.
  document.getElementById('step0').addEventListener('input', () => naamKeuzeBijwerken(WIZ_NAAM, state.naamTonen));
  naamKeuzeBijwerken(WIZ_NAAM, state.naamTonen);

  // TT-122 (22-08-2026): inlogveld alvast vullen met het laatst gebruikte
  // e-mailadres op dit toestel.
  try {
    const lastEmail = localStorage.getItem('tt_lastLoginEmail');
    const loginEmailField = document.getElementById('loginEmail');
    if (lastEmail && loginEmailField && !loginEmailField.value) loginEmailField.value = lastEmail;
  } catch (e) { /* privénavigatie o.i.d., geen probleem */ }
}

// ─── Goal ────────────────────────────────────────────────────────────────────

// TT-46/TT-168 vervallen (08-10-2026, besluit Ronald): de bio-voorzetknoppen en
// applyBioPromptTo/applyBioPrompt zijn weg; het voorbeeld staat als placeholder in het veld.

// TT-543 (besluit Ronald 06-11-2026, voorstel 2): de keuze Naam op je profiel
// staat ook in stap 1, met dezelfde functie als de tegel (naamKeuzeBijwerken()).
const WIZ_NAAM = { blok: 'naamKeuze', control: 'naamTonenControl', voorbeeld: 'naamVoorbeeld',
  fname: 'fname', lname: 'lname', username: 'username', geboorte: 'birth_date' };
function zetNaamTonen(waarde) {
  state.naamTonen = waarde === 'gebruikersnaam' ? 'gebruikersnaam' : 'echt';
  naamKeuzeBijwerken(WIZ_NAAM, state.naamTonen);
  saveOnboardingProgress();
}

// ─── Navigation ──────────────────────────────────────────────────────────────

async function nextStep(from) {
  if (from === 0) {
    state.fname      = document.getElementById('fname').value.trim();
    state.lname      = document.getElementById('lname').value.trim();
    state.birth_date = document.getElementById('birth_date').value.trim();
    state.bio        = document.getElementById('bio').value.trim();
    state.username   = document.getElementById('username').value.trim();

    if (!currentUser) {
      state.regEmail    = document.getElementById('regEmail').value.trim();
      state.regPassword = document.getElementById('regPassword').value;
    }

    // TT-247 (12-09-2026): alle fouten van deze stap tegelijk, elk bij zijn
    // eigen veld. Tot nu toe was het één toast per keer: negen velden, zeven
    // verplicht, 1422px hoog — je drukte Verder, las een regel die alweer weg
    // was, en raadde welk veld werd bedoeld. Zie huisstijl §13.1.
    clearFieldErrors('view-register');
    const fouten = [];

    // TT-U04 (12-08-2026): achternaam is niet langer verplicht; een verplicht
    // veld levert alleen drempel op. TT-420: vanaf 16 staat hij, als je hem
    // invult, standaard op je profiel (te wijzigen in Profiel bewerken). De
    // kolom lname wordt gevuld als iemand hem invult.
    if (!state.fname) {
      fouten.push(['fname', 'Vul je voornaam in']);
    } else if (!naamPastInProfielkop(naamZoalsAnderen(state.fname, state.lname, state.username, state.naamTonen,
        /^\d{2}-\d{2}-\d{4}$/.test(state.birth_date) ? calcAge(state.birth_date) : 16) || state.fname)) {
      // TT-249 (11-09-2026): de naam is de grote naam op je profiel. Die wordt
      // nooit afgekapt en nooit afgebroken, dus een naam die op de kleinste
      // letter niet past, komt er niet in. TT-420: vanaf 16 staat standaard de
      // voor- en achternaam op je profiel, dus die samen moeten passen.
      fouten.push(['fname', 'Deze naam is te lang om op je profiel te tonen. Maak hem korter']);
    }

    const bdMatch = state.birth_date.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    const bdDay   = bdMatch ? parseInt(bdMatch[1], 10) : 0;
    const bdMonth = bdMatch ? parseInt(bdMatch[2], 10) : 0;
    const leeftijd = calcAge(state.birth_date);
    if (!state.birth_date) {
      fouten.push(['birth_date', 'Vul je geboortedatum in']);
    } else if (!bdMatch) {
      fouten.push(['birth_date', 'Voer je geboortedatum in als DD-MM-JJJJ, bijvoorbeeld 01-02-2001']);
    } else if (bdDay < 1 || bdDay > 31 || bdMonth < 1 || bdMonth > 12) {
      fouten.push(['birth_date', 'Deze datum bestaat niet. Controleer dag en maand']);
    } else if (isNaN(leeftijd) || leeftijd < 13) {
      fouten.push(['birth_date', 'Je moet minimaal 13 jaar zijn om een profiel aan te maken']);
    } else if (leeftijd > 100) {
      fouten.push(['birth_date', 'Controleer je geboortedatum']);
    }

    if (!state.zip || !postcodeResolved || !state.city) {
      fouten.push(['zip', 'Vul een geldige postcode in. Je woonplaats wordt dan automatisch ingevuld']);
    }

    // TT-38: gebruikersnaam verplicht, geldig formaat, beschikbaar, en onder
    // de 16 verplicht afwijkend van de echte voornaam (privacy).
    if (!state.username) {
      fouten.push(['username', 'Kies een gebruikersnaam']);
    } else if (!usernameFormatValid(state.username)) {
      fouten.push(['username', 'Alleen letters, cijfers en underscore, 3-20 tekens']);
    } else if (leeftijd >= 13 && leeftijd < 16 && state.username.toLowerCase() === state.fname.toLowerCase()) {
      fouten.push(['username', 'Onder de 16 jaar moet de gebruikersnaam anders zijn dan je voornaam']);
    }

    if (!currentUser) {
      // TT-258 (12-09-2026): het formaat werd hier helemaal niet gecontroleerd
      // — alleen of het veld leeg was. "testeremail" ging naar Supabase, en
      // diens antwoord raakte geen enkele regel in friendlyErrorMessage(). De
      // gebruiker las "Er ging iets mis. Probeer het opnieuw." bovenin het
      // scherm en wist niet dat het om zijn e-mailadres ging.
      if (!state.regEmail) {
        fouten.push(['regEmail', 'Vul je e-mailadres in']);
      } else if (!emailFormaatGeldig(state.regEmail)) {
        fouten.push(['regEmail', 'Vul een geldig e-mailadres in, bijvoorbeeld jouw@email.nl']);
      }
      // TT-42: onder de 16 staat het wachtwoordveld hier niet. Er bestaat op
      // dit moment nog geen account om het bij te bewaren; het wachtwoord
      // wordt gevraagd op het laatste scherm, ná de goedkeuring van de ouder.
      if (!ouderToestemmingNodig(leeftijd)) {
        if (!state.regPassword) {
          fouten.push(['regPassword', 'Kies een wachtwoord']);
        } else if (state.regPassword.length < 8) {
          fouten.push(['regPassword', 'Kies een wachtwoord van minimaal 8 tekens']);
        }
      }
    }

    if (showFieldErrors(fouten)) return;

    // Altijd een verse check vlak vóór het opslaan — de eerder getoonde status
    // kan verouderd zijn (iemand anders kan de naam intussen hebben gepakt).
    // Staat apart omdat hij het netwerk op moet; alles hierboven kan zonder.
    const available = (usernameCheckedValue === state.username && usernameAvailable)
      ? true
      : await checkUsernameAvailability();
    if (!available) {
      // 22-08-2026: "niet beschikbaar" was hiervoor de tekst voor twee heel
      // verschillende situaties — een echt bezette naam, én een technische
      // fout bij de controle zelf. Nu apart, met een tekst die klopt met wat
      // er echt aan de hand is.
      if (usernameCheckFailed) {
        // Gaat niet over de naam die je koos, maar over de app — dus een toast.
        showToast('De gebruikersnaam kon niet gecontroleerd worden. Probeer het over een paar seconden opnieuw.');
      } else {
        showFieldErrors([['username', 'Deze gebruikersnaam is al bezet. Kies een andere']]);
      }
      return;
    }

    // TT-42 (route A, besluit Ronald 22-09-2026): is de gebruiker 13, 14 of
    // 15, dan ontstaat hier géén account en géén profielregel. Er gaat eerst
    // een mailtje naar zijn ouder; alles wat hij invult blijft zolang in zijn
    // eigen browser staan. Het account ontstaat pas op het laatste scherm,
    // na de goedkeuring (zie ouder.js en submitProfile()).
    if (ouderToestemmingNodig(leeftijd)) {
      state.ouderRoute = true;
      state.onboarding = false;
      saveOnboardingProgress();
      // Loopt er al een goedgekeurde aanvraag? Dan hoeft hij niets meer te
      // vragen en gaat hij gewoon verder met zijn profiel.
      const lopend = ouderAanvraagLezen();
      if (lopend && lopend.stand !== 'geweigerd' && lopend.stand !== 'verlopen') { goTo(1); return; }
      ouderStapTonen();
      return;
    }
    state.ouderRoute = false;
    // TT-570 (besluit Ronald, 06-11-2026): ook vanaf 16 ontstaat hier geen
    // account meer. Alles blijft in de browser tot "Profiel aanmaken".
    state.onboarding = true;
  }
  if (from === 1) {
    // TT-U09 (12-08-2026): niveau blokkeert stap 2 niet meer. "Welk niveau
    // ben ik?" is voor een beginnende dertienjarige een lastige vraag —
    // precies het type vraag dat mensen laat afhaken of laat liegen.
    // Het niveau blijft bestaan en telt mee in de volledigheidsmeter; het is
    // alleen geen slagboom meer. Wie het overslaat, ziet dat daar terug.
    // TT-444: een ontbrekend instrument of genre staat bij het veld zelf, en de
    // pagina schuift ernaartoe. Een toast bovenin zei niet welk veld, en bij een
    // lang scherm stond het veld buiten beeld. Zelfde vorm als bij Band aanmaken.
    const fouten = [];
    if (!state.instruments.length) fouten.push(['instrumentPickerField', 'Kies minimaal één instrument']);
    if (!state.genres.length) fouten.push(['genrePickerField', 'Kies minimaal één genre']);
    if (showFieldErrors(fouten)) return;
  }
  // TT-514 (besluit Ronald, 25-10-2026): drie nummers zijn verplicht. De fout
  // staat bij het zoekveld, zoals bij stap 2. De beheersing per nummer blijft
  // optioneel (V-23). TT-543 (06-11-2026): de setlist is stap 3 (index 2).
  if (from === 2 && showFieldErrors(nummersTekortFouten())) return;
  goTo(from + 1);
}

// TT-168-overgang (02-09-2026): "Terug" ging voorheen ook een "niet
// opgeslagen"-melding tonen tijdens het bewerken van een bestaand profiel
// via de wizard — dat pad bestaat niet meer (zie editMyProfile()). "Terug"
// gaat nu altijd gewoon naar de vorige stap, zonder melding.
async function prevStep(from) {
  goTo(from - 1);
}

// TT-144 (25-08-2026): "Terug" op stap 1 — er is geen vorige stap, dus dit
// verlaat de wizard zelf, naar de landingpagina. TT-168-overgang: ging
// voorheen ook terug naar Mijn Profiel als je een bestaand profiel via de
// wizard bewerkte — dat pad bestaat niet meer, dus dit is nu altijd een
// gloednieuwe registratie die hier terugkomt.
async function prevStepFromStart() {
  showView('landing', 'redirect');
}

function goTo(step) {
  document.querySelectorAll('.panel').forEach((p,i) => {
    p.classList.toggle('active', i === step);
  });

  const dots = document.querySelectorAll('.step-dot');
  dots.forEach((d,i) => {
    d.classList.remove('active','done');
    if (i === step) d.classList.add('active');
    else if (i < step) d.classList.add('done');
  });

  // TT-250 (24-09-2026): één teller, "Stap 2 van 5". Tot dan stonden er drie
  // tellers tegelijk: vijf bolletjes, "Fase 1 van 2" en "(1/4)". Na stap 1
  // leek je halverwege, terwijl er nog vier schermen kwamen. De titel van elk
  // scherm zegt al waar je bent. De aparte labels voor bewerkmodus zijn ook
  // weg: bewerken loopt sinds TT-168 via het tegeloverzicht, en de wizard
  // telt in beide gevallen dezelfde vijf stappen.
  document.getElementById('stepLabel').textContent = `Stap ${step + 1} van ${dots.length}`;

  state.currentStep = step;
  saveOnboardingProgress(); // no-op tenzij state.onboarding actief is
  window.scrollTo({top:0, behavior:'smooth'});
  // TT-142 (25-08-2026): geen automatische focus meer bij een stapwissel —
  // zie de toelichting bij showView() hierboven.

}

// ─── Personalisatie ──────────────────────────────────────────────────────────

// TT-02: bestand echt naar Supabase Storage uploaden i.p.v. alleen een
// tijdelijke blob-URL. Pad bevat het user_id (nodig voor de insert-policy:
// iedereen mag alleen naar zijn eigen map schrijven) plus een tijdstempel
// zodat twee uploads nooit elkaars bestand overschrijven.
// TT-87 (10-08-2026): één lijst met toegestane bestandstypen, gelijk aan de
// instelling "Allowed MIME types" op de buckets in Supabase Storage
// (geverifieerd door Ronald, 10-08-2026). Vroeger keek de app alleen of het
// type met "image/" of "video/" begon. Een .heic-foto van een iPhone of een
// .webm-video kwam daar dus doorheen. De upload startte, de server weigerde,
// en de gebruiker kreeg de nietszeggende melding "Er ging iets mis".
// Wijzigt de bucketinstelling in Supabase? Wijzig dan ook deze twee lijsten.
// TT-520 deel 2 (besluit Ronald 27-10-2026): geen GIF als profielfoto of
// bandfoto ("het leidt af van andere muzikanten"), en een foto krijgt een
// uitsnede (kiesUitsnede in utils.js); een GIF zou dan stilstaan. Bij de media
// van een profiel of band mag een GIF wel.
const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_TYPE_LABEL = 'JPG, PNG of WEBP';
const MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];
const MEDIA_TYPE_LABEL = 'JPG, PNG, GIF, WEBP, MP4 of MOV';

// Geeft null terug als het bestand mag. Geeft anders een leesbare melding.
function fileTypeProblem(file, allowedTypes, typeLabel) {
  const type = (file.type || '').toLowerCase();
  if (allowedTypes.includes(type)) return null;
  // Een iPhone levert soms HEIC/HEIF aan. Dat is de meest voorkomende
  // afwijzing, dus die krijgt een eigen aanwijzing i.p.v. de algemene tekst.
  if (type === 'image/heic' || type === 'image/heif') {
    return 'Dit fotoformaat (HEIC) werkt niet. Zet op je iPhone in Instellingen → Camera → Indelingen de optie "Meest compatibel" aan, of sla de foto op als JPG.';
  }
  return `Dit bestandsformaat werkt niet. Gebruik ${typeLabel}.`;
}

// TT-446 (09-10-2026, Ronald): een telefoonfoto is al snel 4 tot 12 MB en werd
// geweigerd met "te groot". De app verkleint een foto nu zelf voor het
// uploaden: lange zijde maximaal 1600 pixels, JPG. GIF blijft ongemoeid
// (anders staat de animatie stil). Mislukt het verkleinen, dan gaat het
// origineel door en geldt de gewone grens.
const FOTO_MAX_PX = 1600;
const FOTO_DREMPEL_BYTES = 1024 * 1024;
const FOTO_MAX_ORIGINEEL = 30 * 1024 * 1024;

async function fotoVerkleinen(file) {
  const type = (file.type || '').toLowerCase();
  if (!/^image\/(jpeg|png|webp)$/.test(type) || file.size <= FOTO_DREMPEL_BYTES) return file;
  let url = null;
  try {
    url = URL.createObjectURL(file);
    const img = await new Promise((ok, fout) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fout(new Error('foto niet te lezen'));
      i.src = url;
    });
    const schaal = Math.min(1, FOTO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const breed = Math.max(1, Math.round(img.naturalWidth * schaal));
    const hoog = Math.max(1, Math.round(img.naturalHeight * schaal));
    const canvas = document.createElement('canvas');
    canvas.width = breed; canvas.height = hoog;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, breed, hoog);
    ctx.drawImage(img, 0, 0, breed, hoog);
    const blob = await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    const naam = (file.name || 'foto').replace(/\.[^.]*$/, '') + '.jpg';
    return new File([blob], naam, { type: 'image/jpeg' });
  } catch (e) {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}

// Geeft null als het bestand mag, anders de melding voor de gebruiker. Een foto
// (behalve GIF) hoeft niet klein te zijn: die verkleint de app zelf.
function bestandTeGrootMelding(file, maxBytes) {
  const type = (file.type || '').toLowerCase();
  const naam = file.name ? `"${file.name}" ` : '';
  const mb = Math.round(file.size / 1024 / 1024);
  if (/^image\/(jpeg|png|webp)$/.test(type)) {
    return file.size > FOTO_MAX_ORIGINEEL
      ? `${naam}is ${mb} MB. Kies een foto van maximaal 30 MB.` : null;
  }
  if (file.size <= maxBytes) return null;
  const maxMb = Math.round(maxBytes / 1024 / 1024);
  if (type.startsWith('video/')) return `${naam}is een video van ${mb} MB. Maximaal ${maxMb} MB. Kort de video in of kies een kortere opname.`;
  return `${naam}is ${mb} MB. Maximaal ${maxMb} MB. Gebruik een JPG of PNG, die verkleint de app zelf.`;
}

// Het fotootje gaat mee met elke foto (JPG, PNG, WebP; geen GIF of video), in
// `avatars` en in `media` (TT-537). Mislukt het, dan staat de foto er toch: de
// app toont dan de grote foto (utils.js). fotoUploadsBezig telt de uploads die
// nog lopen; opslagOpruimen() wist dan niets.
// TT-517 fase 7: elke foto krijgt ook een wazige versie (wazigMaken()). Die
// gaat niet naar de opslag maar naar de database, bij het opslaan
// (wazigVeld(), wazigVoor()). Mislukt hij, dan ziet een bezoeker bij een
// afgeschermde foto het algemene wazige beeld (WAZIG_ALGEMEEN in utils.js).
let fotoUploadsBezig = 0;
const wazigBijUpload = new Map(); // adres van de foto → wazige versie
async function uploadToStorage(bucket, userId, file, maxBytes, maxLabel, allowedTypes, typeLabel) {
  fotoUploadsBezig++;
  try {
    const uit = await uploadToStorageZonderKlein(bucket, userId, file, maxBytes, maxLabel, allowedTypes, typeLabel);
    if (/^image\/(jpeg|png|webp)$/.test((uit.file.type || '').toLowerCase())) {
      try {
        const klein = await fotootjeMaken(uit.file);
        const { error } = await db.storage.from(bucket).upload(fotoKleinPad(uit.path), klein,
          { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' });
        if (error) throw error;
      } catch (e) {
        logCaught('fotootjeUploaden', e);
      }
      try {
        const w = await wazigMaken(uit.file);
        if (w) wazigBijUpload.set(uit.url, w);
      } catch (e) {
        logCaught('wazigMaken', e);
      }
    }
    return uit;
  } finally {
    fotoUploadsBezig--;
  }
}

async function uploadToStorageZonderKlein(bucket, userId, file, maxBytes, maxLabel, allowedTypes, typeLabel) {
  if (allowedTypes) {
    const problem = fileTypeProblem(file, allowedTypes, typeLabel);
    if (problem) throw eigenFout(problem);
  }
  file = await fotoVerkleinen(file);
  if (file.size > maxBytes) throw eigenFout(`Het bestand is te groot. Maximaal ${maxLabel}. Een JPG of PNG verkleint de app zelf.`);
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await db.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false });
  if (upErr) throw upErr;
  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, path, file };
}

// Fotootje (zie fotoKleinPad() in utils.js): het midden van de foto,
// vierkant, FOTO_KLEIN_PX pixels, JPG.
async function fotootjeMaken(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fout) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fout(new Error('foto niet te lezen'));
      i.src = url;
    });
    const zijde = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = FOTO_KLEIN_PX;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, FOTO_KLEIN_PX, FOTO_KLEIN_PX);
    ctx.drawImage(img, (img.naturalWidth - zijde) / 2, (img.naturalHeight - zijde) / 2, zijde, zijde,
      0, 0, FOTO_KLEIN_PX, FOTO_KLEIN_PX);
    const blob = await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', 0.8));
    if (!blob) throw new Error('fotootje niet gemaakt');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// TT-517 fase 7 (huisstijl §18.7, besluit Ronald 01-11-2026, B): de wazige
// versie van een foto. Het midden, 4:3 (de vorm van de hoes), 16 x 12 pixels,
// JPG, als tekst ("data:image/jpeg;base64,…"). Hierop is niemand te
// herkennen; de database stuurt hem een bezoeker zonder account in plaats van
// de foto van een 13- tot 15-jarige. null als het niet lukt.
async function wazigMaken(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fout) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fout(new Error('foto niet te lezen'));
      i.src = url;
    });
    const W = img.naturalWidth, H = img.naturalHeight;
    const b = Math.min(W, H * 4 / 3), h = b * 3 / 4;
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 12;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 16, 12);
    ctx.drawImage(img, (W - b) / 2, (H - h) / 2, b, h, 0, 0, 16, 12);
    return wazigBron(canvas.toDataURL('image/jpeg', 0.7));
  } finally {
    URL.revokeObjectURL(url);
  }
}
// De wazige versie van een foto die in deze sessie is geüpload, of null.
function wazigVoor(url) {
  return wazigBijUpload.get(url) || null;
}
// Het veld voor de profiel- of bandfoto bij het opslaan: alleen als de app
// een nieuwe wazige versie heeft. Anders niets, zodat een bewaarde versie
// blijft staan; een nieuwe foto zonder versie wist de oude in de database
// (trigger tt_wazig_bij_profielfoto).
function wazigVeld(url) {
  const w = url ? wazigVoor(url) : null;
  return w ? { avatar_wazig: w } : {};
}

function uploadAvatarFile(file, userId) {
  return uploadToStorage('avatars', userId, file, 5 * 1024 * 1024, '5 MB', AVATAR_MIME_TYPES, AVATAR_TYPE_LABEL);
}

// Na het opslaan: elk bestand in de map dat niet meer op het profiel of de
// bandpagina staat, gaat weg, met zijn fotootje (TT-537). Zo blijft een
// vervangen of verwijderde foto of video niet via zijn link te openen.
// `bucket` is 'avatars' of 'media'; `map` het account-id of `bands/<band-id>`;
// `urls` de links die blijven. Loopt er nog een upload, dan niets: dat bestand
// is nog niet opgeslagen. De volgende keer opslaan ruimt het op.
async function opslagOpruimen(bucket, map, urls) {
  if (!map || fotoUploadsBezig) return;
  try {
    const pad = `/storage/v1/object/public/${bucket}/`;
    const houden = [];
    (urls || []).forEach(u => {
      const delen = String(u || '').split(pad);
      if (delen.length !== 2) return;
      const p = decodeURIComponent(delen[1]);
      houden.push(p, fotoKleinPad(p));
    });
    const { data, error } = await db.storage.from(bucket).list(map, { limit: 1000 });
    if (error) throw error;
    const weg = (data || []).filter(f => f.id).map(f => `${map}/${f.name}`).filter(p => !houden.includes(p));
    if (!weg.length) return;
    const { error: wErr } = await db.storage.from(bucket).remove(weg);
    if (wErr) throw wErr;
  } catch (e) {
    logCaught('opslagOpruimen', e);
  }
}

function uploadMediaFile(file, userId) {
  return uploadToStorage('media', userId, file, 50 * 1024 * 1024, '50 MB', MEDIA_MIME_TYPES, MEDIA_TYPE_LABEL);
}

async function handleAvatarUpload(file) {
  if (!file) return;
  // TT-87: meteen controleren, vóór de preview. Zo ziet niemand een foto
  // verschijnen die de server daarna alsnog weigert.
  const typeProblem = fileTypeProblem(file, AVATAR_MIME_TYPES, AVATAR_TYPE_LABEL);
  if (typeProblem) { showToast(typeProblem); return; }
  { const groot = bestandTeGrootMelding(file, 5 * 1024 * 1024); if (groot) { showToast(groot); return; } }
  // TT-520 deel 2: eerst de uitsnede. Afbreken laat alles zoals het was.
  file = await kiesUitsnede(file, 'rond');
  if (!file) return;

  // Preview direct met de blob-URL, zodat het aanvoelt als een directe
  // reactie — de echte upload (hieronder) loopt daar los van.
  const blobUrl = URL.createObjectURL(file);
  const preview = document.getElementById('avatarPreview');
  preview.style.position = 'relative';
  preview.innerHTML = `<img src="${blobUrl}" alt="profielfoto">`;
  document.getElementById('avatarRemoveBtn').classList.add('visible');

  if (!currentUser) {
    // Tijdens de wizard bestaat er nog geen account (TT-570), dus nog geen
    // sessie om naar Storage te mogen schrijven. Bewaar het bestand zelf —
    // submitProfile() uploadt het echt zodra er een user_id is.
    state.avatarFile = file;
    state.avatarUrl = null;
    return;
  }

  // Account bestaat al — meteen echt uploaden.
  preview.insertAdjacentHTML('beforeend',
    `<div class="avatar-uploading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);border-radius:50%;">
       <div class="save-spinner" style="width:24px;height:24px;border-width:3px;margin:0;"></div>
     </div>`);
  uploadAvatarFile(file, currentUser.id).then(({ url, path }) => {
    state.avatarUrl = url;
    state.avatarPath = path;
    state.avatarFile = null;
    preview.querySelector('.avatar-uploading')?.remove();
  }).catch(e => {
    logCaught('uploadAvatar', e);
    preview.querySelector('.avatar-uploading')?.remove();
    showToast(friendlyErrorMessage(e, 'je foto uploaden'));
    removeAvatar();
  });
}

// TT-381 (30-09-2026, Ronald): het kruisje rechtsboven de foto vraagt eerst,
// op alle drie de plekken gelijk (registratie, Je mediahoek, bandfoto).
// removeAvatar() zelf blijft zonder vraag: een mislukte upload ruimt ermee op.
function askRemoveAvatar() {
  showConfirm('Profielfoto verwijderen?', removeAvatar, 'Ja, verwijderen');
}

function removeAvatar() {
  state.avatarUrl = null;
  state.avatarFile = null;
  state.avatarPath = null;
  const preview = document.getElementById('avatarPreview');
  preview.innerHTML = ''; // TT-517 fase 6: de schijnwerper met silhouet (styles.css)
  preview.style.borderColor = '';
  document.getElementById('avatarRemoveBtn').classList.remove('visible');
}

// ─── Media ───────────────────────────────────────────────────────────────────

// TT-543 blok 3: een keuze in het menu van "+ Toevoegen" (utils.js).
function mediaToevoegenKeuze(sel) {
  mediaToevoegenStart(sel, state.mediaFiles, state.mediaLinks, 'mediaInvoer', url => {
    state.mediaLinks.push({ url, inBanner: false });
    renderMediaGrid();
  });
}

// TT-02: de media-stap (step4) komt in de wizard altijd ná stap 1
// ("Aanmelden"), dus het account bestaat op dit punt altijd al — anders dan
// bij de avatar-upload in stap 1 hoeft hier niet uitgesteld te worden.
function handleFileSelect(files) {
  Array.from(files).forEach(file => {
    if (state.mediaFiles.length >= GRENZEN.beeld) { showToast(`Maximum van ${GRENZEN.beeld} bestanden bereikt.`); return; }
    const isVideo = (file.type || '').toLowerCase().startsWith('video/');
    // TT-87: controleren tegen dezelfde lijst als de bucket in Supabase,
    // vóór de preview en vóór de upload.
    const typeProblem = fileTypeProblem(file, MEDIA_MIME_TYPES, MEDIA_TYPE_LABEL);
    if (typeProblem) { showToast(`"${file.name}": ${typeProblem}`); return; }
    { const groot = bestandTeGrootMelding(file, 50 * 1024 * 1024); if (groot) { showToast(groot); return; } }

    const blobUrl = URL.createObjectURL(file);
    const type = isVideo ? 'video' : 'foto';
    const entry = { name: file.name, url: blobUrl, path: null, type, uploading: true, inBanner: false };
    state.mediaFiles.push(entry);
    renderMediaGrid();

    if (!currentUser) {
      // TT-42 (route A): bij 13-15 bestaat er tijdens de wizard nog geen
      // account, dus ook geen map om naar te schrijven. Het bestand blijft
      // hier in het geheugen hangen en gaat mee in submitProfile(), zodra het
      // account er is — zelfde uitstel als de profielfoto bij TT-02.
      // Bekende beperking, gelijk aan die van de profielfoto: sluit hij de
      // browser, dan is het bestand weg. Zijn antwoorden en zijn links niet.
      entry.uploading = false;
      entry.bestand = file;
      renderMediaGrid();
      return;
    }

    uploadMediaFile(file, currentUser.id).then(({ url, path }) => {
      entry.url = url;
      entry.path = path;
      entry.uploading = false;
      renderMediaGrid();
    }).catch(e => {
      logCaught('uploadMedia', e);
      showToast(`"${file.name}": ${friendlyErrorMessage(e, 'het bestand uploaden')}`);
      const idx = state.mediaFiles.indexOf(entry);
      if (idx !== -1) state.mediaFiles.splice(idx, 1);
      renderMediaGrid();
    });
  });
}

function renderMediaGrid() {
  const grid = document.getElementById('mediaGrid');
  grid.innerHTML = mediaRasterHTML(state.mediaFiles, state.mediaLinks, '');
  bannerTellerBijwerken('wizardBannerTeller', state.mediaFiles, state.mediaLinks);
}

// TT-263: welke media in de bannerbalk op het profiel komt, kiest de
// gebruiker hier. De grens geldt over foto's, video's en links samen.
function toggleMediaBanner(i) {
  return bannerTekenTik(state.mediaFiles[i], state.mediaFiles, state.mediaLinks, 'mediaGrid', 'wizardBannerTeller');
}

function speelMedia(i) {
  const m = state.mediaFiles[i];
  if (!m || !m.url) return;
  if (m.type === 'foto') { openMediaLightbox(m.url); return; }
  openMediaSpeler(m.url, 'video', m.name || '', '');
}

function removeMedia(i) {
  const entry = state.mediaFiles[i];
  state.mediaFiles.splice(i,1);
  renderMediaGrid();
  // Al geüpload bestand meteen weer opruimen uit Storage — voorkomt dat
  // verwijderde media als wees achterblijft (best effort, geen blokkerende fout).
  if (entry?.path) {
    db.storage.from('media').remove([entry.path, fotoKleinPad(entry.path)]).then(() => {}, e => logCaught('removeMedia', e));
  }
}


// detectPlatform() en extractYouTubeId() stonden hier tot 13-09-2026. Ze
// staan nu in utils.js (TT-263): drie bestanden gebruiken ze. Geen kopie
// laten staan — zie werkwijze §2.10, dode code gaat meteen weg.

function toggleLinkBanner(i) {
  linkBannerTik(state.mediaLinks[i], i, state.mediaFiles, state.mediaLinks, 'mediaGrid', 'wizardBannerTeller');
}

function speelLink(i) {
  const l = state.mediaLinks[i];
  if (!l || !l.url.trim()) return;
  openMediaSpeler(l.url, 'link', null, detectPlatform(l.url));
}

function removeLink(i) {
  state.mediaLinks.splice(i, 1);
  renderMediaGrid();
}

