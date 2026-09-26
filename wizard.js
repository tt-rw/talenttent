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
const ONBOARDING_STORAGE_KEY = 'tt_onboarding_v1';

function saveOnboardingProgress() {
  // TT-42: bij route A bestaat er nog geen account, dus state.onboarding staat
  // nog uit. Dan is state.ouderRoute de reden om wél te bewaren.
  if (!state.onboarding && !state.ouderRoute) return;
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({
      userId: currentUser?.id || null,
      mid: editingMusicianId,
      ouderRoute: !!state.ouderRoute,
      regEmail: state.regEmail || '',
      akkoord: !!document.getElementById('consentCheckbox')?.checked,
      step: state.currentStep,
      fname: state.fname, lname: state.lname, birth_date: state.birth_date,
      username: state.username,
      city: state.city, zip: state.zip, bio: state.bio, citySource: state.citySource,
      instruments: state.instruments, instrumentLevels: state.instrumentLevels, genres: state.genres, songs: state.songs,
      repertoireType: state.repertoireType,
      goal: state.goal,
      rehearsalFrequency: state.rehearsalFrequency, musicalAmbition: state.musicalAmbition,
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

// Vult de wizard-velden op basis van de huidige `state` — gedeeld door
// editMyProfile() (state komt uit de database) en resumeOnboarding()
// (state komt terug uit sessionStorage), zodat beide altijd hetzelfde doen.
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
  const usernameStatusEl = document.getElementById('usernameStatus');
  if (usernameStatusEl) {
    usernameStatusEl.textContent = state.username ? 'Dit is je huidige gebruikersnaam.' : '';
    usernameStatusEl.style.color = 'var(--muted)';
  }
  const cityFieldPWF = document.getElementById('city');
  cityFieldPWF.value = state.city;
  if (state.citySource === 'manual') {
    cityFieldPWF.readOnly = false; cityFieldPWF.style.cursor = ''; cityFieldPWF.style.opacity = '';
  } else {
    cityFieldPWF.readOnly = true; cityFieldPWF.style.cursor = 'not-allowed'; cityFieldPWF.style.opacity = '0.85';
  }
  document.getElementById('postcodeStatus').textContent = state.city ? `Gevonden: ${state.city}` : '';
  document.getElementById('bio').value = state.bio;

  renderInstrumentBadges('wizard');
  if (PICKERS.genre) renderPickerBadges(PICKERS.genre);

  renderSongs();
  renderLinksList();
  renderMediaGrid();

  const goalOrder = ['oefenen', 'band', 'optreden', 'alles'];
  const goalIdx = goalOrder.indexOf(state.goal);
  document.querySelectorAll('.goal-card').forEach((c, i) => c.classList.toggle('selected', i === goalIdx));

  // TT-47
  document.querySelectorAll('#rehearsalFreqGrid .tag').forEach(t => {
    t.classList.toggle('selected', REHEARSAL_LABELS[state.rehearsalFrequency] === t.textContent);
  });
  document.querySelectorAll('#ambitionGrid .tag').forEach(t => {
    t.classList.toggle('selected', AMBITION_LABELS[state.musicalAmbition] === t.textContent);
  });
  // TT-52
  document.querySelectorAll('#repertoireTypeGrid .tag').forEach(t => {
    t.classList.toggle('selected', REPERTOIRE_TYPE_LABELS[state.repertoireType] === t.textContent);
  });

  const avatarPreview = document.getElementById('avatarPreview');
  if (state.avatarUrl) {
    avatarPreview.innerHTML = `<img src="${safeUrl(state.avatarUrl)}" alt="profielfoto">`;
    document.getElementById('avatarRemoveBtn').classList.add('visible');
  } else {
    avatarPreview.innerHTML = `<span id="avatarInitials">T</span>`;
    document.getElementById('avatarRemoveBtn').classList.remove('visible');
  }
}

// TT-210 (06-09-2026): vervangt Route B (TT-09). Was: bij elke login/refresh
// automatisch de wizard openen op de bewaarde stap, ongeacht welke pagina de
// gebruiker probeerde te bereiken — Ronald (die de app goed kent) begreep zelf
// niet waarom dat gebeurde. Nu: sessionStorage blijft als vangnet tegen
// dataverlies, maar het openen van de wizard is een bewuste klik op Mijn
// Profiel, geen automatische omleiding. Een refresh laat je voortaan gewoon
// op de pagina staan waar je was.

// Pure check, geen neveneffecten — leest alleen, verandert niets. Gebruikt
// door zowel de banner-render (loadMyProfile) als resumeOnboarding() zelf.
function readSavedOnboarding() {
  const saved = leesOpgeslagenVoortgang();
  if (!saved || !saved.mid || !currentUser || saved.userId !== currentUser.id) return null;
  return saved;
}

// Kale lezer, gedeeld door beide routes.
function leesOpgeslagenVoortgang() {
  try { return JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) || 'null'); }
  catch (e) { return null; }
}

// TT-42: hetzelfde, maar voor route A — er is dan nog geen account en dus
// geen mid en geen ingelogde gebruiker.
function leesOuderVoortgang() {
  const saved = leesOpgeslagenVoortgang();
  if (!saved || !saved.ouderRoute || saved.mid || currentUser) return null;
  return saved;
}

// Toont, alleen als er echt iets klaarstaat, een banner op Mijn Profiel met
// een expliciete "Verdergaan"-knop. Geen banner? Dan blijft het element leeg
// en onzichtbaar — precies zoals bandInvitesBanner/founderOfferBanner ernaast.
function renderOnboardingResumeBanner() {
  const el = document.getElementById('onboardingResumeBanner');
  if (!el) return;
  const saved = readSavedOnboarding();
  if (!saved) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="border:1px solid var(--accent);border-left-width:4px;border-radius:10px;padding:16px;margin-bottom:16px;background:var(--surface2);">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px;">Je bent nog bezig met je profiel</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">Je kunt verdergaan waar je was gebleven.</div>
      <button class="btn btn-primary" onclick="resumeOnboarding()">Verdergaan</button>
    </div>`;
}

// Voorheen tryResumeOnboarding() — liep automatisch bij elke login/refresh.
// Nu alleen op een bewuste klik op de "Verdergaan"-knop hierboven.
function resumeOnboarding() {
  const saved = readSavedOnboarding();
  if (!saved) return;

  editingMusicianId = saved.mid;
  myMusicianId = saved.mid;
  state.onboarding = true;
  vulStateUitVoortgang(saved);

  showView('register');
  goTo(saved.step || 1);
  populateWizardFieldsFromState();
  document.getElementById('submitProfileBtn').textContent = 'Profiel aanmaken';
}

// TT-42 — route A hervatten. Draait bij het openen van de wizard zonder
// ingelogde gebruiker. Het kind komt hier terug na de mail van zijn ouder, of
// gewoon omdat hij de app weer opent terwijl hij nog wacht.
// Geeft true als er iets is hervat.
function hervatOuderRoute() {
  const saved = leesOuderVoortgang();
  if (!saved) return false;

  state.ouderRoute = true;
  state.regEmail = saved.regEmail || '';
  vulStateUitVoortgang(saved);
  populateWizardFieldsFromState();
  const emailVeld = document.getElementById('regEmail');
  if (emailVeld) emailVeld.value = state.regEmail;
  const vinkje = document.getElementById('consentCheckbox');
  if (vinkje && saved.akkoord) { vinkje.checked = true; updateSubmitProfileState(); }

  const aanvraag = ouderAanvraagLezen();
  if (!aanvraag) { goTo(saved.step || 0); ouderLeeftijdsregel(); return true; }

  // Wacht hij nog, dan het wachtscherm; is de ouder akkoord, dan het
  // wachtwoordscherm. ouderStandVerversen() binnen ouderWachtTonen() haalt de
  // actuele stand op en schuift zo nodig zelf door.
  goTo(saved.step || 0);
  ouderLeeftijdsregel();
  if (aanvraag.stand === 'goedgekeurd') ouderWachtwoordTonen();
  else ouderWachtTonen();
  return true;
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
  state.citySource = saved.citySource || 'pdok';
  state.instruments = saved.instruments || [];
  state.instrumentLevels = saved.instrumentLevels || {};
  state.genres = saved.genres || [];
  state.songs = saved.songs || [];
  state.repertoireType = saved.repertoireType || '';
  state.goal = saved.goal || '';
  state.rehearsalFrequency = saved.rehearsalFrequency || '';
  state.musicalAmbition = saved.musicalAmbition || '';
  state.mediaLinks = saved.mediaLinks || [];
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
  if (!mid) { showToast('Je hebt nog geen profiel om te bewerken.'); return; }
  showView('profieltegels');
}
// Profielvolledigheid — alleen zichtbaar voor de eigenaar op "Mijn profiel"
// (Presentatie: profielstatus direct zichtbaar). Gebaseerd op echte opgeslagen
// data, niet op tijdelijke registratie-state.
function renderCompletenessMeter(m) {
  const checks = [
    { done: !!m.avatar_url,                    label: 'Profielfoto' },
    { done: (m.bio || '').length > 20,         label: 'Bio' },
    { done: (m.musician_instruments||[]).length > 0, label: 'Instrument' },
    { done: (m.musician_genres||[]).length > 0,      label: 'Genre' },
    { done: (m.musician_songs||[]).length >= 3,      label: '3+ nummers' },
    { done: (m.musician_media||[]).length > 0,       label: 'Media' },
  ];
  const doneCnt = checks.filter(c => c.done).length;
  const pct = Math.round((doneCnt / checks.length) * 100);

  return `
    <div id="completenessMeter" class="completeness-wrap" style="margin-top:24px;">
      <div class="completeness-header">
        <span class="completeness-label">Profiel volledigheid</span>
        <span class="completeness-pct">${pct}%</span>
      </div>
      <div class="completeness-track">
        <div class="completeness-fill" style="width:${pct}%;"></div>
      </div>
      <div class="completeness-items">
        ${checks.map(c => `
          <span class="comp-item ${c.done ? 'done' : 'pending'}">
            ${c.done ? '✓' : '○'} ${c.label}
          </span>
        `).join('')}
      </div>
      ${pct < 100 ? `<p style="font-size:11px;color:var(--muted);margin-top:8px;">Vul je profiel verder aan om meer matches te krijgen.</p>` : `<p style="font-size:11px;color:var(--accent);margin-top:8px;font-weight:700;">Compleet profiel! Jij valt op.</p>`}
    </div>`;
}


async function loadMyProfile() {
  if (!currentUser) return;
  renderOnboardingResumeBanner();
  renderEmailBevestigBanner(); // TT-336
  const el = document.getElementById('myProfileContent');
  el.innerHTML = '<div style="color:var(--muted);padding:40px;text-align:center;">Laden...</div>';

  // Bugfix 19-08-2026 (Ronald, live gemeld): dit was tot vandaag een
  // sterretje-select. Sinds B-01 tweede stap (18-08-2026) mag authenticated
  // birth_date niet meer lezen, ook niet van zichzelf. Postgres staat een
  // sterretje-select alleen toe als je écht alle kolommen mag lezen — kan dat
  // niet, dan faalt de hele vraag (geen gedeeltelijk resultaat). Precies dat
  // gebeurde hier: elk ingelogd profiel zag zijn eigen profiel niet meer, met
  // "Nog geen profiel" als gevolg. Zelfde oplossing als eerder al toegepast
  // bij de zoekresultaten en de profielmodal: vaste kolomlijst, geen
  // birth_date, leeftijd apart via tt_musicians_ages().
  const { data: m, error } = await db.from('musicians')
    .select(`id, fname, username, city, bio, goal,
             rehearsal_frequency, musical_ambition, repertoire_type,
             avatar_url, accepts_band_invites,
             musician_instruments(instrument, niveau), musician_genres(genre),
             musician_songs(song_title, song_artist, mastery_level),
             musician_media(media_type, url, platform, in_banner)`)
    .eq('user_id', currentUser.id)
    .single();

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

  const { data: myAges } = await db.rpc('tt_musicians_ages', { ids: [m.id] });
  m.age = (myAges && myAges[0]) ? myAges[0].age : undefined;

  // TT-120 (22-08-2026): "Jouw pad op The Talent Tent" (TT-48) staat niet
  // meer op Mijn Profiel. De functie renderProgressPanel() is op 16-09-2026
  // verwijderd als dode code; terug te vinden in commit 05f8ddd.
  el.innerHTML = buildMusicianDetailHTML(m, true) + renderCompletenessMeter(m);
  // TT-265: zie de toelichting in openMusicianModal() — pas starten als de
  // balk in de pagina staat.
  profielBannerStarten(el);
  mediaTitelsBijwerken(el);
  // TT-249: naam passend maken zodra hij in de pagina staat. Mijn Profiel is
  // het krapste scherm — hier staat het ⋯-menu naast de naam.
  fitProfileName(el);
  loadBandInvites(m.id);
  loadFounderOffers(m.id); // V-16

  // TT-56 (12-08-2026): opt-out band-uitnodigingen — knoptekst weerspiegelt
  // de huidige stand. m.accepts_band_invites komt gewoon mee via de
  // '*'-select hierboven, geen aparte kolom nodig in de query.
  myAcceptsBandInvites = m.accepts_band_invites !== false;
  updateBandInviteToggleBtn();
}

function updateBandInviteToggleBtn() {
  const btn = document.getElementById('bandInviteToggleBtn');
  if (!btn) return;
  btn.textContent = myAcceptsBandInvites ? 'Open voor band-uitnodigingen' : 'Niet open voor band-uitnodigingen';
}

// TT-56 (12-08-2026, op verzoek van Ronald): een muzikant kan hiermee zelf
// aangeven niet open te staan voor band-uitnodigingen (TT-41). Bewust smal
// gehouden — blokkeert uitsluitend die uitnodigingen. Los 1-op-1 bericht
// sturen blijft altijd mogelijk, ongewijzigd, en het profiel blijft gewoon
// in alle zoekresultaten staan (geen zichtbaar label voor bezoekers).
async function toggleBandInviteAvailability() {
  if (!myMusicianId) return;
  const newVal = !myAcceptsBandInvites;
  try {
    const { error } = await db.from('musicians')
      .update({ accepts_band_invites: newVal })
      .eq('id', myMusicianId);
    if (error) throw error;
    myAcceptsBandInvites = newVal;
    updateBandInviteToggleBtn();
    showToast(newVal ? 'Je staat weer open voor band-uitnodigingen.' : 'Je ontvangt geen band-uitnodigingen meer.');
  } catch (e) {
    logCaught('toggleBandInviteAvailability', e);
    showToast(friendlyErrorMessage(e));
  }
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
  btn.style.opacity = box.checked ? '' : '0.5';
  btn.style.cursor = box.checked ? '' : 'not-allowed';
  // TT-42: bij route A kan er een lange onderbreking tussen dit vinkje en het
  // aanmaken van het account zitten. Het vinkje gaat daarom mee in de
  // momentopname, anders staat het na terugkomst weer uit.
  saveOnboardingProgress();
}

// TT-121 (22-08-2026): opslaan per stap. Schrijft het VOLLEDIGE profiel,
// net zoals het einde van de wizard al deed — bij het bewerken staat
// state altijd vol met alle velden, ook van stappen die deze keer niet
// zijn bezocht (geladen door editMyProfile() bij het openen). Een save
// vanaf om het even welke stap is daarom veilig.
// TT-137 (23-08-2026): opgesplitst in een pure schrijffunctie
// (persistEditedProfile, geen UI) en twee dunne lagen eromheen —
// saveEditedProfile() (met spinner/succesmelding, navigeert daarna naar
// Mijn Profiel — de expliciete "Opslaan"-knop) en silentlySaveEditIfNeeded()
// (stil, blijft op de huidige stap — aangeroepen vanuit nextStep()/
// prevStep()). Reden: vóór deze wijziging sloeg "Verder →" tijdens het
// bewerken van een bestaand profiel helemaal niets op — alleen "Opslaan"
// deed dat. Een wijziging + "Verder →" + tabblad sluiten was dan stil
// verlies, zonder enige waarschuwing.
async function persistEditedProfile() {
  const mid = editingMusicianId;
  if (!mid) return;
  const { error: uErr } = await db.from('musicians').update({
    fname:            state.fname,
    lname:            state.lname || null,
    username:         state.username,
    birth_date:       toISODate(state.birth_date),
    city:             state.city,
    zip:              state.zip || null,
    bio:              state.bio || null,
    goal:             state.goal || null,
    rehearsal_frequency: state.rehearsalFrequency || null,
    musical_ambition:    state.musicalAmbition || null,
    repertoire_type:  state.repertoireType || null,
    avatar_url:       state.avatarUrl || null,
    city_source:      state.citySource || 'pdok',
    profile_complete: true, // TT-09: dit is de definitieve klik op "Profiel aanmaken"/"Wijzigingen opslaan"/"Opslaan"
  }).eq('id', mid);
  if (uErr) throw new Error(uErr.message);

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
    .map(m => ({ media_type: m.type, url: m.url, in_banner: !!m.inBanner }));

  const { error: kErr } = await db.rpc('tt_save_musician_koppelingen', {
    p_musician_id: mid,
    p_instruments: state.instruments.map(instrument => ({ instrument, niveau: state.instrumentLevels[instrument] || null })),
    p_genres:      state.genres.map(genre => ({ genre })),
    p_songs:       state.songs.map(s => ({ song_title: s.title, song_artist: s.artist, mastery_level: s.level })),
    p_media:       linkMedia.concat(fileMedia),
  });
  if (kErr) throw new Error(kErr.message);

  state.savedId = mid;
}

async function saveEditedProfile() {
  if (!editingMusicianId) return; // defensief, hoort niet voor te komen
  // TT-336 (26-09-2026): bij 16+ eindigt "Profiel aanmaken" hier, niet in de
  // rest van submitProfile() — het account en de rij bestaan al sinds stap 1.
  // state.onboarding zegt dat dit de afronding van een nieuwe registratie is.
  // Tot TT-336 toonde de app dan "Profiel bijgewerkt!" en bleef de bewaarde
  // voortgang staan, met "Je bent nog bezig met je profiel" op Mijn Profiel.
  const nieuw = !!state.onboarding;
  showSaving();
  myOwnCity = null; // eigen plaats kan net gewijzigd zijn — cache opnieuw laten opbouwen
  try {
    await persistEditedProfile();
    const mid = editingMusicianId;
    editingMusicianId = null;
    if (nieuw) {
      clearOnboardingProgress();
      state.onboarding = false;
      // De database houdt het profiel onzichtbaar tot de klik in de mail.
      if (await profielWachtOpBevestiging(mid)) { await bevestigingStarten(); return; }
      showSaveSuccess(false);
      return;
    }
    // isEdit=true: toont "Profiel bijgewerkt!" en gaat na 1,2s naar Mijn
    // Profiel — ongeacht vanaf welke stap er is opgeslagen.
    showSaveSuccess(true);
  } catch (err) {
    logCaught('saveEditedProfile', err);
    showSaveError(err.message);
  }
}

// ─── TT-336: het e-mailadres bevestigen (16 jaar en ouder) ──────────────────
// Besluiten Ronald, 26-09-2026: bevestigen gebeurt na "Profiel aanmaken". Tot
// de klik in de mail mag iemand rondkijken en zoeken, maar is hij niet te
// vinden, stuurt hij geen berichten en richt hij geen band op. Een verkeerd
// getypt e-mailadres is aan te passen (2a). De database bewaakt dit; de Edge
// Function `email-bevestigen` stuurt de mail en zet het profiel online.
// Woordkeus: altijd "e-mailadres", nooit "adres" (Ronald, 26-09-2026).

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
  const { data, error } = await db.from('musicians')
    .select('wacht_op_bevestiging').eq('user_id', currentUser.id).maybeSingle();
  if (error) logCaught('renderEmailBevestigBanner', error);
  if (error || !data?.wacht_op_bevestiging) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div style="border:1px solid var(--accent);border-left-width:4px;border-radius:10px;padding:16px;margin-bottom:16px;background:var(--surface2);">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px;">Nog één stap: bevestig je e-mailadres</div>
      <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">We hebben een mail gestuurd naar <strong id="bevestigEmailadres" style="color:var(--text);overflow-wrap:anywhere;">${escHtml(currentUser.email || '')}</strong>. Tik op de knop in die mail. Daarna staat je profiel online en kun je berichten sturen.</div>
      <div id="bevestigKnoppen">
        <button class="btn btn-ghost" id="bevestigOpnieuwBtn" style="width:100%;" onclick="bevestigMailOpnieuw()">Mail opnieuw sturen</button>
        <div style="text-align:center;margin-top:12px;">
          <button onclick="bevestigEmailadresTonen(true)" style="background:none;border:none;color:var(--muted);font-size:12px;cursor:pointer;font-family:'Roboto',sans-serif;text-decoration:underline;">E-mailadres klopt niet? Pas het aan</button>
        </div>
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
  catch (e) { logCaught('bevestigMailOpnieuw', e); showToast(e.message || friendlyErrorMessage(e)); }
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
    bevestigUitkomstTonen(uit);
    if (!uit.bevestigd) await renderEmailBevestigBanner();
  } catch (e) {
    logCaught('bevestigEmailadresOpslaan', e);
    // Een fout over het e-mailadres zelf hoort bij het veld; de rest is een toast.
    if (/e-mailadres/i.test(e.message || '')) setFieldError(veld, e.message.replace(/\.$/, ''));
    else showToast(e.message || friendlyErrorMessage(e));
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
    toestemmingMeldingTonen('Er ging iets mis', [
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

// TT-168-overgang (02-09-2026): saveEditedProfileHere() en
// silentlySaveEditIfNeeded() zijn vervallen — die hoorden bij het
// tussentijds opslaan tijdens het bewerken van een bestaand profiel via de
// wizard (TT-121/TT-137). Bewerken loopt nu via het tegeloverzicht, elke
// tegel met een eigen smalle opslaanfunctie (zie de tegelschermen
// verderop). saveEditedProfile() hieronder blijft wél bestaan — dat is de
// afrondende opslag van de wizard zelf (submitProfile()), ook bij een
// gloednieuwe registratie, zodra editingMusicianId (na stap 1) gezet is.

async function submitProfile() {
  // TT-121 (22-08-2026): bewerken van een bestaand profiel loopt voortaan
  // altijd via saveEditedProfile() — vanaf deze laatste stap ("Wijzigingen
  // opslaan") net zo goed als vanaf een tussenstap ("Opslaan").
  if (editingMusicianId) { await saveEditedProfile(); return; }

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

  showSaving();
  myOwnCity = null; // eigen plaats kan net gewijzigd zijn — cache opnieuw laten opbouwen

  try {
    let userId = currentUser?.id || null;
    let mid;

    // Defensieve terugvaloptie: normaal gesproken bestaat het account/profiel
    // hier al (aangemaakt in createAccountAndProfile() na stap 1, TT-09).
    // Deze tak wordt in de gewone flow niet meer bereikt, maar blijft staan
    // voor het geval editingMusicianId onverhoopt ontbreekt.
    // 1. Account aanmaken
    if (!userId) {
      const { data: authData, error: authErr } = await db.auth.signUp({
        email:    state.regEmail,
        password: state.regPassword,
        options:  { data: { fname: state.fname } }
      });
      if (authErr) throw new Error(authErr.message);

      // Direct inloggen — e-mailbevestiging is uit, sessie is meteen actief
      const { data: signInData, error: signInErr } = await db.auth.signInWithPassword({
        email:    state.regEmail,
        password: state.regPassword
      });
      if (signInErr) throw new Error(signInErr.message);

      userId = signInData.user?.id || authData.user?.id || null;
      currentUser = signInData.user || authData.user;
      if (!userId) throw new Error('Kon geen account aanmaken. Probeer het opnieuw.');
    }

    // TT-02: zelfde late avatar-upload als in createAccountAndProfile() —
    // pas nu bestaat er zeker een user_id/sessie om naar Storage te mogen
    // schrijven. Alleen relevant als er nog een niet-geüploade state.avatarFile
    // hangt (in de normale flow is dat hier allang gebeurd).
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

    // TT-42 (route A): media die tijdens het wachten is uitgekozen, kon toen
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

    // 2. Hoofdprofiel opslaan
    // Bugfix 23-08-2026: zelfde reden als in createAccountAndProfile()
    // hierboven — birth_date zit in deze insert, een kale .select() zou
    // daardoor falen sinds B-01 tweede stap. Alleen 'id' is nodig (mid
    // hieronder).
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
        goal:             state.goal || null,
        rehearsal_frequency: state.rehearsalFrequency || null,
        musical_ambition:    state.musicalAmbition || null,
        repertoire_type:  state.repertoireType || null,
        profile_color:    DEFAULT_PROFILE_COLOR,
        avatar_url:       state.avatarUrl || null,
        city_source:      state.citySource || 'pdok',
        user_id:          userId,
        profile_complete: true,
      })
      .select('id')
      .single();

    if (mErr) throw new Error(mErr.message);
    mid = musician.id;

    // 3. Instrumenten (TT-51: niveau 1-5 gaat mee, gevalideerd bij stap 1 —
    // hier defensief || null voor het geval deze functie ooit buiten de
    // normale wizard-flow wordt aangeroepen zonder die validatie)
    if (state.instruments.length) {
      const { error: iErr } = await db.from('musician_instruments').insert(
        state.instruments.map(instrument => ({ musician_id: mid, instrument, niveau: state.instrumentLevels[instrument] || null }))
      );
      if (iErr) throw new Error(iErr.message);
    }

    // 4. Genres
    if (state.genres.length) {
      const { error: gErr } = await db.from('musician_genres').insert(
        state.genres.map(genre => ({ musician_id: mid, genre }))
      );
      if (gErr) throw new Error(gErr.message);
    }

    // 5. Repertoire
    if (state.songs.length) {
      const { error: sErr } = await db.from('musician_songs').insert(
        state.songs.map(s => ({
          musician_id:   mid,
          song_title:    s.title,
          song_artist:   s.artist,
          mastery_level: s.level,
        }))
      );
      if (sErr) throw new Error(sErr.message);
    }

    // 6. Media links
    const linkMedia = state.mediaLinks
      .filter(l => l.url.trim())
      .map(l => ({
        musician_id: mid,
        media_type:  'link',
        url:         l.url,
        platform:    detectPlatform(l.url),
        in_banner:   !!l.inBanner,
      }));

    if (linkMedia.length) {
      const { error: lErr } = await db.from('musician_media').insert(linkMedia);
      if (lErr) throw new Error(lErr.message);
    }

    // 7. Media-bestanden (foto's/video's, TT-02) — alleen bestanden die
    // daadwerkelijk klaar zijn met uploaden; een blob-URL zou na deze sessie
    // toch niets meer voorstellen, dus die worden overgeslagen.
    const fileMedia = state.mediaFiles
      .filter(m => m.url && !m.uploading && !m.url.startsWith('blob:'))
      .map(m => ({
        musician_id: mid,
        media_type:  m.type,
        url:         m.url,
        in_banner:   !!m.inBanner,
      }));
    if (fileMedia.length) {
      const { error: fErr } = await db.from('musician_media').insert(fileMedia);
      if (fErr) throw new Error(fErr.message);
    }

    state.savedId = mid;

    // TT-09: "Welkom!" hoort bij het écht afronden van de allereerste keer
    // (state.onboarding), niet bij het technische onderscheid insert/update.
    if (state.onboarding) { clearOnboardingProgress(); state.onboarding = false; }
    // TT-42: bij route A stond de hele wizard lokaal. Nu het profiel er staat,
    // hoort daar niets meer van in de browser achter te blijven.
    if (state.ouderRoute) { clearOnboardingProgress(); state.ouderRoute = false; }
    editingMusicianId = null;
    showSaveSuccess(false);

  } catch (err) {
    logCaught('submitProfile', err);
    showSaveError(err.message);
  }
}

// ─── State ───────────────────────────────────────────────────────────────────

// TT-23: er is geen kleurkiezer (meer) in de app — de accentkleur van een nieuw
// profiel is dus altijd de merkkleur. Vroeger stond dit als state.profileColor
// in de wizard, wat de indruk wekte dat de gebruiker er iets over te zeggen had.
// Bestaande profielen met een afwijkende kleur in de database blijven ongemoeid:
// bij het bewerken van een profiel wordt profile_color niet meer overschreven.
const DEFAULT_PROFILE_COLOR = '#f5c518';

let state = {
  currentStep: 0,
  fname: '', lname: '', birth_date: '', city: '', zip: '', bio: '',
  username: '',
  citySource: 'pdok',
  regEmail: '', regPassword: '',
  instruments: [],
  instrumentLevels: {}, // TT-51 (12-08-2026): instrument (string) -> niveau 1-5
  genres: [],
  songs: [],
  repertoireType: '', // TT-52 (12-08-2026): covers/eigen/beide, optioneel, per profiel
  goal: '',
  rehearsalFrequency: '',
  musicalAmbition: '',
  avatarUrl: null,
  avatarFile: null,
  avatarPath: null,
  ouderRoute: false, // TT-42: true zolang 13-15 wacht op de klik van zijn ouder
  mediaFiles: [],
  mediaLinks: [],
  onboarding: false // true zolang het account al bestaat maar het profiel nog niet is afgerond (TT-09)
};

// ─── Init ────────────────────────────────────────────────────────────────────

// TT-168-overgang (02-09-2026): tip-tekst bij "Je mediahoek" (wizardstap 4),
// zelfde wisselende tekst en interval als het tegelscherm — eigen, losse
// timer/element-id (#wizardMhTipText) omdat de wizard een ander scherm is
// dan het tegeloverzicht, ook al delen ze dezelfde teksten.
const WIZARD_MH_TIPS = [
  'toon de energie die jij als muzikant wil laten zien.',
  'een compleet profiel krijgt veel meer aandacht.',
];
let wizardMhTipIndex = 0;
let wizardMhTipTimer = null;
function wizardMhStartTipCycle() {
  clearInterval(wizardMhTipTimer);
  wizardMhTipIndex = 0;
  wizardMhRenderTip();
  wizardMhTipTimer = setInterval(() => {
    wizardMhTipIndex = (wizardMhTipIndex + 1) % WIZARD_MH_TIPS.length;
    wizardMhRenderTip();
  }, 2500);
}
function wizardMhRenderTip() {
  const el = document.getElementById('wizardMhTipText');
  if (!el) return;
  el.innerHTML = `<strong>Tip:</strong> ${escHtml(WIZARD_MH_TIPS[wizardMhTipIndex])}`;
}

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

  // TT-122 (22-08-2026): inlogveld alvast vullen met het laatst gebruikte
  // e-mailadres op dit toestel.
  try {
    const lastEmail = localStorage.getItem('tt_lastLoginEmail');
    const loginEmailField = document.getElementById('loginEmail');
    if (lastEmail && loginEmailField && !loginEmailField.value) loginEmailField.value = lastEmail;
  } catch (e) { /* privénavigatie o.i.d., geen probleem */ }
}

// ─── Goal ────────────────────────────────────────────────────────────────────

// TT-46: prompt-chip vult het bio-veld aan i.p.v. te overschrijven, zodat
// iemand meerdere prompts na elkaar kan gebruiken zonder tekst te verliezen.
// TT-168-overgang (02-09-2026): kern verplaatst naar de generieke
// applyBioPromptTo(el, text) — nodig omdat de tegel "Wie ben je" hetzelfde
// gedrag toepast op een ander element (#wbjBioModalTextarea, geen #bio).
function applyBioPromptTo(el, text) {
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
function applyBioPrompt(text) {
  const el = document.getElementById('bio');
  applyBioPromptTo(el, text);
  state.bio = el.value;
}

function selectGoal(el, val) {
  document.querySelectorAll('.goal-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  state.goal = val;
}

// TT-47: zelfde nogmaals-klikken-om-te-wissen als bij een enkelvoudige
// keuze — optioneel veld, dus een tweede klik op de al gekozen optie
// maakt de keuze weer ongedaan i.p.v. gedwongen een keuze te houden.
function selectRehearsalFrequency(el, val) {
  const already = el.classList.contains('selected');
  document.querySelectorAll('#rehearsalFreqGrid .tag').forEach(t => t.classList.remove('selected'));
  if (already) { state.rehearsalFrequency = ''; return; }
  el.classList.add('selected');
  state.rehearsalFrequency = val;
}
function selectMusicalAmbition(el, val) {
  const already = el.classList.contains('selected');
  document.querySelectorAll('#ambitionGrid .tag').forEach(t => t.classList.remove('selected'));
  if (already) { state.musicalAmbition = ''; return; }
  el.classList.add('selected');
  state.musicalAmbition = val;
}
// TT-52: zelfde patroon — optioneel, per profiel, nogmaals klikken wist de keuze.
function selectRepertoireType(el, val) {
  const already = el.classList.contains('selected');
  document.querySelectorAll('#repertoireTypeGrid .tag').forEach(t => t.classList.remove('selected'));
  if (already) { state.repertoireType = ''; return; }
  el.classList.add('selected');
  state.repertoireType = val;
}

// ─── Navigation ──────────────────────────────────────────────────────────────

// Voorkomt dat een dubbele klik tijdens het aanmaken van het account (korte
// wachttijd voor signUp+signIn+insert) per ongeluk twee accounts aanmaakt.
let creatingAccount = false;

async function nextStep(from) {
  if (from === 0) {
    state.fname      = document.getElementById('fname').value.trim();
    state.lname      = document.getElementById('lname').value.trim();
    state.birth_date = document.getElementById('birth_date').value.trim();
    state.bio        = document.getElementById('bio').value.trim();
    state.username   = document.getElementById('username').value.trim();

    if (!editingMusicianId) {
      state.regEmail    = document.getElementById('regEmail').value.trim();
      state.regPassword = document.getElementById('regPassword').value;
    }

    // TT-247 (12-09-2026): alle fouten van deze stap tegelijk, elk bij zijn
    // eigen veld. Tot nu toe was het één toast per keer: negen velden, zeven
    // verplicht, 1422px hoog — je drukte Verder, las een regel die alweer weg
    // was, en raadde welk veld werd bedoeld. Zie huisstijl §13.1.
    clearFieldErrors('view-register');
    const fouten = [];

    // TT-U04 (12-08-2026): achternaam is niet langer verplicht. De eigen
    // privacyverklaring zegt dat de achternaam nooit aan andere gebruikers
    // wordt getoond — dan levert een verplicht veld alleen drempel op.
    // De kolom lname blijft bestaan en wordt gevuld als iemand hem invult.
    if (!state.fname) {
      fouten.push(['fname', 'Vul je voornaam in']);
    } else if (!naamPastInProfielkop(state.fname)) {
      // TT-249 (11-09-2026): de voornaam is voor een ingelogde bezoeker de
      // grote naam op je profiel. Die wordt nooit afgekapt en nooit
      // afgebroken, dus een naam die op de kleinste letter niet past, komt
      // er niet in.
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
      fouten.push(['username', 'Onder de 16 moet dit afwijken van je echte voornaam, voor je eigen privacy']);
    }

    if (!editingMusicianId) {
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

    if (!editingMusicianId) {
      // TT-42 (route A, besluit Ronald 22-09-2026): is de gebruiker 13, 14 of
      // 15, dan ontstaat hier géén account en géén profielregel. Er gaat eerst
      // een mailtje naar zijn ouder; alles wat hij invult blijft zolang in zijn
      // eigen browser staan. Het account ontstaat pas op het laatste scherm,
      // na de goedkeuring (zie ouder.js en submitProfile()).
      if (ouderToestemmingNodig(leeftijd)) {
        state.ouderRoute = true;
        saveOnboardingProgress();
        // Loopt er al een goedgekeurde aanvraag? Dan hoeft hij niets meer te
        // vragen en gaat hij gewoon verder met zijn profiel.
        const lopend = ouderAanvraagLezen();
        if (lopend && lopend.stand !== 'geweigerd' && lopend.stand !== 'verlopen') { goTo(1); return; }
        ouderStapTonen();
        return;
      }
      state.ouderRoute = false;
      // TT-09: account + minimaal profiel ontstaan al hier, i.p.v. pas bij de
      // laatste stap. De rest van de wizard wordt daardoor een aanvulling op
      // een al bestaand (nog niet "af") profiel — zie createAccountAndProfile().
      if (creatingAccount) return;
      creatingAccount = true;
      const ok = await createAccountAndProfile();
      creatingAccount = false;
      if (!ok) return;
    }
  }
  if (from === 1) {
    if (!state.instruments.length) { showToast('Selecteer minimaal één instrument.'); return; }
    // TT-U09 (12-08-2026): niveau blokkeert stap 2 niet meer. "Welk niveau
    // ben ik?" is voor een beginnende dertienjarige een lastige vraag —
    // precies het type vraag dat mensen laat afhaken of laat liegen.
    // Het niveau blijft bestaan en telt mee in de volledigheidsmeter; het is
    // alleen geen slagboom meer. Wie het overslaat, ziet dat daar terug.
    if (!state.genres.length) { showToast('Selecteer minimaal één genre.'); return; }
  }
  // V-23 (12-08-2026): repertoire is optioneel, maar het beheersingsniveau
  // per nummer was dat niet. Wie nul nummers invulde mocht door; wie er één
  // invulde werd geblokkeerd. Dat strafte juist wie iets invulde.
  // Niveau per nummer is nu ook optioneel.
  // step 3 (doel) is bewust optioneel — mag later nog worden ingevuld
  goTo(from + 1);
}

// TT-09: maakt het account (auth) + een minimaal profiel aan zodra iemand
// stap 1 (Aanmelden) afrondt. Het profiel telt vanaf hier al mee als
// "bestaand" voor de rest van de wizard (update i.p.v. insert), maar wordt
// pas zichtbaar voor anderen zodra profile_complete op true wordt gezet —
// dat gebeurt alleen bij een geslaagde klik op de allerlaatste knop
// "Profiel aanmaken" (zie submitProfile()). Stopt iemand hiertussen, dan
// blijft het profiel permanent onzichtbaar voor anderen (geen "lege profielen").
async function createAccountAndProfile() {
  showSaving('Account aanmaken...', 'Heel even geduld, dit duurt maar een paar seconden.');
  onboardingInFlight = true;
  try {
    const { data: authData, error: authErr } = await db.auth.signUp({
      email:    state.regEmail,
      password: state.regPassword,
      options:  { data: { fname: state.fname } }
    });
    // 22-08-2026 (P0, live gemeld door Ronald): een eerdere poging met
    // hetzelfde e-mailadres kan het inlogaccount al hebben aangemaakt, ook
    // als de rest toen niet afrondde (zie hieronder, "bestaat er al een
    // profiel?"). Zonder dit liep de gebruiker dan vast op "al
    // geregistreerd", met geen enkele weg vooruit — ook niet bij een nieuwe,
    // verse poging. Nu: bij precies díe foutmelding gewoon inloggen met de
    // zojuist ingevulde gegevens, en normaal verdergaan.
    let authUser = authData?.user || null;
    if (authErr) {
      if (/already registered|already exists/i.test(authErr.message)) {
        const { data: signInData, error: signInErr } = await db.auth.signInWithPassword({
          email: state.regEmail, password: state.regPassword
        });
        if (signInErr) {
          // Écht een ander account, of een ander wachtwoord — dat is dan geen
          // herstelbare situatie meer, de gebruiker moet zelf kiezen.
          throw new Error('Er bestaat al een account met dit e-mailadres. Probeer in te loggen, of gebruik een ander e-mailadres.');
        }
        authUser = signInData.user;
      } else {
        throw new Error(authErr.message);
      }
    } else {
      // Direct inloggen — e-mailbevestiging is uit, sessie is meteen actief.
      // Let op: dit activeert zelf ook de onAuthStateChange-listener
      // (SIGNED_IN) — de onboardingInFlight-vlag hierboven voorkomt dat die
      // daardoor de gebruiker voortijdig naar Mijn Profiel stuurt.
      const { data: signInData, error: signInErr } = await db.auth.signInWithPassword({
        email: state.regEmail, password: state.regPassword
      });
      if (signInErr) throw new Error(signInErr.message);
      authUser = signInData.user || authUser;
    }

    const userId = authUser?.id || null;
    if (!userId) throw new Error('Kon geen account aanmaken. Probeer het opnieuw.');
    currentUser = authUser;

    // Bestaat er al een profiel bij dit account? Dat kan als een eerdere
    // poging wél het account maakte én het profiel, maar de gebruiker
    // (bijv. door een trage/onduidelijke reactie op het scherm) daarna
    // toch nog eens op "Verder" drukte. Dan dat bestaande profiel gewoon
    // overnemen, in plaats van een tweede rij te proberen aan te maken —
    // dat zou stuklopen op de unieke regel per account (musicians_user_id_idx).
    const { data: existingProfile } = await db.from('musicians').select('id').eq('user_id', userId).single();
    if (existingProfile?.id) {
      editingMusicianId = existingProfile.id;
      myMusicianId = existingProfile.id;
      state.onboarding = true;
      document.getElementById('saveOverlay').classList.remove('visible');
      showToast('Je had hier al een profiel — we gaan gewoon verder.');
      return true;
    }

    // TT-02: pas nu bestaat er een user_id/sessie om naar Storage te mogen
    // schrijven, dus een bij stap 1 gekozen profielfoto wordt pas hier echt
    // geüpload — niet bij het selecteren van het bestand zelf. Een mislukte
    // upload blokkeert het aanmaken van het account niet; de gebruiker kan
    // de foto later alsnog toevoegen via "Profiel bewerken".
    if (state.avatarFile) {
      try {
        const { url, path } = await uploadAvatarFile(state.avatarFile, userId);
        state.avatarUrl = url;
        state.avatarPath = path;
      } catch (e) {
        logCaught('createAccountAndProfile', e);
        showToast('Account aangemaakt, maar de profielfoto kon niet worden geüpload. Voeg de foto later toe via Profiel bewerken.');
        state.avatarUrl = null;
      }
      state.avatarFile = null;
    }

    const musicianRow = {
      fname:            state.fname,
      lname:            state.lname || null,
      username:         state.username,
      birth_date:       toISODate(state.birth_date),
      city:             state.city,
      zip:              state.zip || null,
      bio:              state.bio || null,
      profile_color:    DEFAULT_PROFILE_COLOR,
      avatar_url:       state.avatarUrl || null,
      user_id:          userId,
      profile_complete: false,
      city_source:      state.citySource || 'pdok',
    };

    // 22-08-2026 (P0, live gemeld door Ronald): meermaals leidde precies deze
    // schrijfactie tot een rechtenfout, direct na signInWithPassword() — maar
    // niet elke keer (één van de geteste accounts kreeg wél een profiel). Dat
    // wijst niet op een structureel verkeerde regel (die zou altijd falen),
    // maar op een moment vlak na het inloggen waarop de nieuwe sessie soms
    // nog niet overal is doorgekomen. Daarom nu één automatische herkansing
    // ná een korte pauze, in plaats van de gebruiker terug te sturen naar
    // stap 1 — die had op dat moment allang een geldig, ingelogd account.
    let musician, mErr;
    // Bugfix 23-08-2026 (P0, gemeld door Ronald: "inloggen/profiel aanmaken
    // is stuk"): een kale .select() na insert() vraagt impliciet ALLE
    // kolommen van de nieuwe rij terug. musicianRow bevat birth_date. Sinds
    // B-01 tweede stap (18-08-2026) mag authenticated die kolom niet meer
    // lezen — ook niet van zichzelf. Een sterretje-select faalt dan in zijn
    // geheel (zelfde Postgres-gedrag als al gerepareerd in editMyProfile()
    // en loadMyProfile()). Elke nieuwe accountaanmaak liep hierdoor vast, met
    // twee mislukte pogingen en een foutmelding tot gevolg. Hierna alleen
    // 'id' terugvragen — verder wordt er niets van musician.* gebruikt.
    ({ data: musician, error: mErr } = await db.from('musicians').insert(musicianRow).select('id').single());
    if (mErr) {
      console.error('Eerste poging profiel aanmaken mislukt, probeer nog eens:', mErr);
      await new Promise(resolve => setTimeout(resolve, 800));
      ({ data: musician, error: mErr } = await db.from('musicians').insert(musicianRow).select('id').single());
    }
    if (mErr) throw new Error(mErr.message);

    editingMusicianId = musician.id;
    myMusicianId = musician.id;
    state.onboarding = true;

    document.getElementById('saveOverlay').classList.remove('visible');
    showToast('Account aangemaakt! Vul nu je profiel verder aan.');
    return true;
  } catch (err) {
    logCaught('createAccountAndProfile', err);
    document.getElementById('saveOverlay').classList.remove('visible');
    showToast(friendlyErrorMessage(err));
    return false;
  } finally {
    onboardingInFlight = false;
  }
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

  // TT-168-overgang (02-09-2026): tip-tekst bij "Je mediahoek" wisselt om de
  // 2,5 seconde (zelfde patroon als de mhTipTimer in het tegelscherm) —
  // alleen actief zolang die stap ook echt getoond wordt.
  if (step === 4) wizardMhStartTipCycle();
  else clearInterval(wizardMhTipTimer);
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
const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const AVATAR_TYPE_LABEL = 'JPG, PNG, GIF of WEBP';
const MEDIA_MIME_TYPES = AVATAR_MIME_TYPES.concat(['video/mp4', 'video/quicktime']);
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

function handleAvatarUpload(file) {
  if (!file) return;
  // TT-87: meteen controleren, vóór de preview. Zo ziet niemand een foto
  // verschijnen die de server daarna alsnog weigert.
  const typeProblem = fileTypeProblem(file, AVATAR_MIME_TYPES, AVATAR_TYPE_LABEL);
  if (typeProblem) { showToast(typeProblem); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('Afbeelding is te groot. Maximum 5 MB.'); return; }

  // Preview direct met de blob-URL, zodat het aanvoelt als een directe
  // reactie — de echte upload (hieronder) loopt daar los van.
  const blobUrl = URL.createObjectURL(file);
  const preview = document.getElementById('avatarPreview');
  preview.style.position = 'relative';
  preview.innerHTML = `<img src="${blobUrl}" alt="profielfoto">`;
  document.getElementById('avatarRemoveBtn').classList.add('visible');

  if (!currentUser) {
    // Stap 1 ("Aanmelden"): het account/user_id bestaat op dit moment nog
    // niet, dus er is nog geen sessie om naar Storage te mogen schrijven.
    // Bewaar het bestand zelf — createAccountAndProfile() uploadt het echt
    // zodra er een user_id is.
    state.avatarFile = file;
    state.avatarUrl = null;
    return;
  }

  // Account bestaat al (profiel bewerken, of een hervatte onboarding na
  // stap 1) — meteen echt uploaden.
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
    showToast(friendlyErrorMessage(e));
    removeAvatar();
  });
}

function removeAvatar() {
  state.avatarUrl = null;
  state.avatarFile = null;
  state.avatarPath = null;
  const preview = document.getElementById('avatarPreview');
  preview.innerHTML = `<span id="avatarInitials">T</span>`;
  preview.style.borderColor = '';
  document.getElementById('avatarRemoveBtn').classList.remove('visible');
}

// ─── Media ───────────────────────────────────────────────────────────────────

function switchMediaTab(tab, el) {
  document.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.media-pane').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('pane-' + tab).classList.add('active');
}

function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('drag-over');
  handleFileSelect(e.dataTransfer.files);
}

// TT-02: de media-stap (step4) komt in de wizard altijd ná stap 1
// ("Aanmelden"), dus het account bestaat op dit punt altijd al — anders dan
// bij de avatar-upload in stap 1 hoeft hier niet uitgesteld te worden.
function handleFileSelect(files) {
  Array.from(files).forEach(file => {
    if (state.mediaFiles.length >= 8) { showToast('Maximum 8 bestanden.'); return; }
    const isVideo = (file.type || '').toLowerCase().startsWith('video/');
    // TT-87: controleren tegen dezelfde lijst als de bucket in Supabase,
    // vóór de preview en vóór de upload.
    const typeProblem = fileTypeProblem(file, MEDIA_MIME_TYPES, MEDIA_TYPE_LABEL);
    if (typeProblem) { showToast(`"${file.name}": ${typeProblem}`); return; }
    if (file.size > 50 * 1024 * 1024) { showToast(`"${file.name}" is te groot. Maximum 50 MB.`); return; }

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
      showToast(`"${file.name}": ${friendlyErrorMessage(e)}`);
      const idx = state.mediaFiles.indexOf(entry);
      if (idx !== -1) state.mediaFiles.splice(idx, 1);
      renderMediaGrid();
    });
  });
}

function renderMediaGrid() {
  const grid = document.getElementById('mediaGrid');
  grid.innerHTML = state.mediaFiles.map((m, i) => mediaTegelHTML(m, i, '')).join('');
  bannerTellerBijwerken('wizardBannerTeller', state.mediaFiles, state.mediaLinks);
}

// TT-263: welke media in de bannerbalk op het profiel komt, kiest de
// gebruiker hier. De grens geldt over foto's, video's en links samen.
function toggleMediaBanner(i) {
  const m = state.mediaFiles[i];
  if (!m) return;
  if (!bannerKeuzeMag(bannerAantal(state.mediaFiles, state.mediaLinks), !m.inBanner)) return;
  m.inBanner = !m.inBanner;
  bannerKnopStandZetten('mediaGrid', i, m.inBanner);
  bannerTellerBijwerken('wizardBannerTeller', state.mediaFiles, state.mediaLinks);
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
    db.storage.from('media').remove([entry.path]).then(() => {}, e => logCaught('removeMedia', e));
  }
}


// detectPlatform() en extractYouTubeId() stonden hier tot 13-09-2026. Ze
// staan nu in utils.js (TT-263): drie bestanden gebruiken ze. Geen kopie
// laten staan — zie werkwijze §2.10, dode code gaat meteen weg.

function addLinkRow() {
  state.mediaLinks.push({ url: '', inBanner: false });
  renderLinksList();
}

function renderLinksList() {
  const list = document.getElementById('linksList');
  list.innerHTML = state.mediaLinks.map((l, i) => mediaLinkRijHTML(l, i, '')).join('');
  mediaTitelsBijwerken(list);
  bannerTellerBijwerken('wizardBannerTeller', state.mediaFiles, state.mediaLinks);
}

// Tijdens het typen alleen de waarde bijhouden. De lijst wordt pas opnieuw
// getekend als het veld verlaten wordt (onchange in mediaLinkRijHTML) —
// hertekenen tijdens het typen haalt de aandacht uit het veld.
function updateLinkUrl(i, el) {
  if (!state.mediaLinks[i]) return;
  state.mediaLinks[i].url = el.value;
}

function toggleLinkBanner(i) {
  const l = state.mediaLinks[i];
  if (!l) return;
  if (!l.url.trim()) { showToast('Vul eerst het adres van de link in.'); return; }
  if (!bannerKeuzeMag(bannerAantal(state.mediaFiles, state.mediaLinks), !l.inBanner)) return;
  l.inBanner = !l.inBanner;
  bannerKnopStandZetten('linksList', i, l.inBanner);
  bannerTellerBijwerken('wizardBannerTeller', state.mediaFiles, state.mediaLinks);
}

function speelLink(i) {
  const l = state.mediaLinks[i];
  if (!l || !l.url.trim()) return;
  openMediaSpeler(l.url, 'link', null, detectPlatform(l.url));
}

function removeLink(i) {
  state.mediaLinks.splice(i, 1);
  renderLinksList();
}

