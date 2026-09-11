// ─── Supabase ────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://fqtgilwfestzofunupnu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tnWUVGTBmwnn9fAILeNqqQ_UlCn5AFM';
// TT-82: alleen een client aanmaken als de bibliotheek er is. De vlag wordt in
// de <head> gezet. Zonder deze controle stopt het hele script hier met een
// ReferenceError en wordt geen enkele functie meer gedefinieerd.
const db = window.ttBackendMissing ? null : supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Foutregistratie (TT-64, stap 1) ────────────────────────────────────────
// Minimale versie: alleen de foutmelding zelf wegschrijven, geen dashboard,
// geen filtering — dat blijft P1. Doel: weten dát er iets stuk is, vóórdat
// een gebruiker het meldt, niet pas erna.
//
// Aandachtspunt (10-08-2026, al eerder vastgelegd): werkt niet in het TT-82-
// scenario (Supabase-bibliotheek niet geladen, db is dan null) — die ene fout
// wordt bewust niet gelogd, een clientloze route daarvoor bestaat niet.
//
// Twee vangnetten tegen misbruik van de tabel zelf: (1) een simpele teller
// stopt met loggen na 20 fouten binnen één paginabezoek, zodat een fout die
// in een lus terechtkomt de tabel niet volspamt; (2) de insert zelf staat in
// een try/catch die nooit iets teruggooit — een mislukte logpoging mag nooit
// zelf weer een fout veroorzaken.
let appErrorLogCount = 0;
function logAppError(message, source, stack) {
  if (!db) return; // TT-82: geen bibliotheek, dus ook geen manier om te loggen
  if (appErrorLogCount >= 20) return;
  appErrorLogCount++;
  try {
    db.from('app_error_log').insert({
      message: String(message || '').slice(0, 2000),
      source: source ? String(source).slice(0, 500) : null,
      stack: stack ? String(stack).slice(0, 4000) : null,
      user_id: currentUser?.id || null,
    }).then(() => {}, () => {}); // stil falen, ook bij een netwerkfout
  } catch (e) {
    // nooit teruggooien vanuit de foutlogger zelf
  }
}
// TT-230 (09-09-2026): een vaste regel voor elk catch-blok in de app. Voor dit
// ticket slikten tientallen catch-blokken de fout volledig op: geen melding,
// geen console-regel, geen spoor. Zo'n storing kan weken bestaan tot iemand
// hem toevallig ziet - precies wat er bij de bandomgeving gebeurde (TT-229).
// logCaught() schrijft altijd naar de console en naar app_error_log. De
// aanroeper bepaalt zelf of de gebruiker daarnaast nog iets te zien krijgt.
// Deze functie gooit nooit zelf een fout terug.
//
// Bewust geen logCaught in: opslag-vangnetten (localStorage/sessionStorage),
// JSON.parse, new URL, de History API en logAppError zelf. Die vangen een
// browserbeperking af, hebben een werkende terugval, en zouden de teller van
// 20 vullen met ruis.
function logCaught(source, e) {
  const message = (e && e.message) ? e.message : String(e);
  console.error(source + ':', e);
  logAppError(message, source, (e && e.stack) ? e.stack : null);
}

window.addEventListener('error', (e) => {
  logAppError(e.message, e.filename ? (e.filename + ':' + e.lineno) : null, e.error?.stack);
});
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const message = reason?.message || String(reason);
  logAppError(message, 'unhandledrejection', reason?.stack);
});

// ─── App initialisatie ───────────────────────────────────────────────────────

let currentUser = null;

// Bugfix, opnieuw hersteld 23-08-2026 (was al eens gerepareerd op
// 13-08-2026, die reparatie was uit dit bestand verdwenen — zie
// onAuthStateChange hieronder voor de volledige toelichting).
let lastSignedInUserId = null;

async function appInit() {
  try {
    // V-12 (13-08-2026, bijvangst): de hash moet vastgelegd worden vóórdat
    // onUserLoggedIn() hieronder draait. Voor een ingelogde gebruiker roept
    // onUserLoggedIn() namelijk (synchroon, nog vóór de eerste await erin)
    // showView('myprofile') aan, en dat schrijft de hash zelf al om naar
    // '#myprofile' — dan is een gedeelde link (#profiel/.., #about, ...) al
    // overschreven vóórdat de app 'm ooit heeft kunnen lezen. Dit was ook al
    // een latent probleem voor de bestaande TT-16-links (#about e.d.) bij een
    // ingelogde gebruiker; nu pas gemerkt omdat V-12 zulke links via #profiel/
    // en #band/ toevoegt voor precies de doelgroep die vaak al ingelogd is
    // (een bandlid dat een link van een ander bandlid opent).
    const hashView = location.hash.replace('#', '');

    const { data: { session } } = await db.auth.getSession();
    if (session?.user) {
      currentUser = session.user;
      lastSignedInUserId = session.user.id;
      onUserLoggedIn(session.user);
    }
    // Bugfix, opnieuw hersteld 23-08-2026 (P0, gemeld door Ronald: "screenshot
    // maken staat nu ineens uit"). Deze reparatie is al eens eerder gebouwd,
    // op 13-08-2026 — ergens tussen toen en nu is dat blok teruggevallen naar
    // de oude versie zonder de gebruikersvergelijking hieronder, waardoor de
    // oorspronkelijke bug terug was.
    //
    // Oorspronkelijke toelichting (13-08-2026): Supabase-js stuurt een
    // herhaalde SIGNED_IN-gebeurtenis wanneer het tabblad weer zichtbaar
    // wordt, ook zonder dat iemand opnieuw inlogt — een bekend gedrag van de
    // bibliotheek bij hertoetsing van een bestaande sessie. Een
    // schermafbeelding maken doet op een aantal telefoons hetzelfde met de
    // paginazichtbaarheid als wisselen naar een andere app: even onzichtbaar,
    // dan weer zichtbaar. Zonder deze vergelijking riep elke zo'n herhaling
    // opnieuw onUserLoggedIn() aan, en die stuurt altijd door naar Mijn
    // Profiel — dus een schermafdruk maken (of van app wisselen en
    // terugkomen) gooide je uit elk ander scherm terug naar je profiel.
    //
    // Nu: alleen bij een écht nieuwe inlog (nog geen gebruiker, of een ander
    // account dan daarvoor) draait onUserLoggedIn() nog volledig, met alle
    // bestaande logica erin (onboarding hervatten, wachtend bericht,
    // doorsturen naar Mijn Profiel, gebruikersnaam-check). Bij een herhaalde
    // melding voor dezelfde gebruiker wordt alleen de sessiereferentie
    // (currentUser) bijgewerkt, zonder te navigeren.
    db.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        showView('reset');
      } else if (event === 'SIGNED_IN' && session?.user) {
        const isNewLogin = session.user.id !== lastSignedInUserId;
        currentUser = session.user;
        if (isNewLogin) {
          lastSignedInUserId = session.user.id;
          onUserLoggedIn(session.user);
        }
      } else if (event === 'SIGNED_OUT') {
        currentUser = null;
        lastSignedInUserId = null;
        onUserLoggedOut();
      }
    });

    // TT-16: een gedeelde link (bijv. talenttent.org/#about) direct op de
    // juiste view openen. Alleen bekende views; Mijn Profiel/Mijn Bands lopen
    // via requireLogin() zodat een uitgelogde bezoeker de gebruikelijke
    // vriendelijke toast + doorverwijzing krijgt, geen lege pagina.
    const knownHashViews = ['search', 'about', 'register', 'myprofile', 'bands', 'auth', 'privacy', 'terms', 'gedragscode', 'profieltegels'];
    const gatedHashViews = ['myprofile', 'bands', 'profieltegels'];

    // V-12 (13-08-2026): een gedeelde profiellink (#profiel/<id> of
    // #band/<id>, zie shareProfile()) opent direct de detailmodal, boven op
    // het zoekscherm — net als een klik op een zoekresultaat. currentUser
    // staat hierboven al vast, maar hasOwnProfile/myMusicianId nog niet (die
    // worden pas gezet zodra het zoekscherm zelf initialiseert); zonder deze
    // aanroep zou de modal bij een ingelogde gebruiker met eigen profiel toch
    // het beperkte publieke profiel tonen in plaats van het volledige.
    const profielMatch = hashView.match(/^profiel\/(.+)$/);
    const bandMatch = hashView.match(/^band\/(.+)$/);
    if (profielMatch || bandMatch) {
      showView('search');
      if (currentUser) await configureSearchAccess();
      if (profielMatch) openMusicianModal(decodeURIComponent(profielMatch[1]));
      else openBandModal(decodeURIComponent(bandMatch[1]));
    } else if (knownHashViews.includes(hashView)) {
      if (gatedHashViews.includes(hashView)) requireLogin(hashView);
      else showView(hashView);
    }
  } catch(e) {
    logCaught('appInit', e);
  }
}

// Bug gevonden door Ronald (05-08-2026): db.auth.signInWithPassword() binnen
// createAccountAndProfile() activeert zelf al de bestaande onAuthStateChange-
// listener (event SIGNED_IN) → die riep onUserLoggedIn() aan → die stuurde
// meteen door naar Mijn Profiel, nog vóórdat createAccountAndProfile() zelf de
// kans kreeg om verder te gaan naar stap 2. Gevolg: de wizard werd na stap 1
// alsnog onderbroken, met een profiel van 0% volledigheid als resultaat —
// precies wat TT-09 juist wilde voorkomen. Deze vlag zorgt dat onUserLoggedIn()
// zich stil houdt zolang createAccountAndProfile() nog loopt; die functie
// bepaalt zelf (via goTo()) wat de volgende stap is.
let onboardingInFlight = false;

async function onUserLoggedIn(user) {
  // TT-166 (28-08-2026): Uitloggen hoort bij Mijn Profiel, niet meer hier.
  // Ingelogd hoeft niemand nog "Inloggen" te zien — de knop verdwijnt, de
  // ruimte in de tab-regel is dan vrij.
  document.getElementById('navLogin').style.display = 'none';
  // TT-176 (01-09-2026): Uitloggen staat weer in het hamburgermenu ook,
  // naast Mijn Profiel — zie navMenuDropdown hierboven.
  document.getElementById('navLogout').style.display = '';
  // TT-186 (03-09-2026): Instellingen zelfde zichtbaarheidsregel als Uitloggen.
  document.getElementById('navSettings').style.display = '';
  refreshUnreadBadge();

  if (onboardingInFlight) return;

  // TT-108 (23-08-2026): hasOwnProfile werd tot nu toe pas gezet zodra
  // iemand de weergave Zoeken bezocht (configureSearchAccess()). Een
  // gebruiker die na het inloggen direct naar Mijn Bands ging zonder ooit
  // Zoeken te hebben bezocht, kreeg een bandprofiel dan via het beperkte/
  // anonieme pad — klikbare ledenchips en de berichtknop werkten daar dan
  // niet (gevonden bij het testen van de klikbare bandledenchips, 13-08-2026).
  // Nu alvast gezet bij elke echte login (niet tijdens createAccountAndProfile
  // zelf, vandaar ná de onboardingInFlight-check hierboven) — configureSearchAccess()
  // blijft 'm daarna gewoon opnieuw zetten, dat is onschadelijk.
  hasOwnProfile = !!(await getMyMusicianId());

  // TT-210 (06-09-2026): Route B (automatisch naar de wizard bij onafgeronde
  // onboarding) is vervangen door een bewuste knop op Mijn Profiel — zie
  // renderOnboardingResumeBanner()/resumeOnboarding(). Een refresh stuurt
  // niemand meer ongevraagd weg van de pagina die hij probeerde te bereiken.

  // TT-32 (07-08-2026): kwam dit inloggen vanuit een klik op het chat-icoon
  // (bestaand account, dus meteen een profiel beschikbaar)? Dan direct naar
  // de composer i.p.v. naar Mijn Profiel. Een gloednieuw account heeft hier
  // nog geen musicians-rij als er nog geen onboarding is doorlopen — dat
  // geval loopt via showSaveSuccess() na de wizard, niet hier.
  if (pendingMessageRecipient) {
    const mid = await getMyMusicianId();
    if (mid) {
      const recipient = pendingMessageRecipient;
      pendingMessageRecipient = null;
      showView('search');
      openMessageComposer(recipient.id, recipient.displayName);
      return;
    }
  }

  showView('myprofile');
  // TT-38 (07-08-2026): bestaand profiel zonder gebruikersnaam? Verplicht
  // scherm erbovenop tonen (modal blokkeert de rest tot opgeslagen).
  checkUsernameGate();

  const userFname2 = user.user_metadata?.fname;
  if (userFname2) {
    const fnameEl = document.getElementById('fname');
    if (fnameEl && !fnameEl.value) {
      fnameEl.value = userFname2;
      state.fname = userFname2;
    }
  }
}

function onUserLoggedOut() {
  const navLoginBtn = document.getElementById('navLogin');
  navLoginBtn.textContent = 'Inloggen';
  navLoginBtn.style.display = '';
  // TT-176 (01-09-2026): hamburgermenu-Uitloggen weer verbergen bij uitloggen.
  const navLogoutBtn = document.getElementById('navLogout');
  if (navLogoutBtn) navLogoutBtn.style.display = 'none';
  // TT-186 (03-09-2026): Instellingen zelfde zichtbaarheidsregel als Uitloggen.
  const navSettingsBtn = document.getElementById('navSettings');
  if (navSettingsBtn) navSettingsBtn.style.display = 'none';
  myMusicianId = null;
  myOwnCity = null;
  // TT-108 (23-08-2026): hoort bij dezelfde fix als in onUserLoggedIn() —
  // zonder dit kan een verouderde 'true' van de vorige sessie blijven staan
  // voor een net uitgelogde bezoeker, bijv. bij het bekijken van een
  // gedeelde bandlink zonder eerst Zoeken te bezoeken.
  hasOwnProfile = false;
  const consentBox = document.getElementById('consentCheckbox');
  if (consentBox) { consentBox.checked = false; updateSubmitProfileState(); }
  // Beveiligingsfix: een editeer-sessie (via "Profiel bewerken") mag nooit
  // blijven bestaan na uitloggen — anders kan een uitgelogde bezoeker via de
  // "Verder bewerken"-balk alsnog bij de laatst bewerkte profielgegevens.
  editingMusicianId = null;
  clearOnboardingProgress();
  pendingMessageRecipient = null;
  usernameGateMid = null;
  postcodeFailStreak = 0;
  postcodeManualMode = false;
  const cityFieldReset = document.getElementById('city');
  if (cityFieldReset) { cityFieldReset.readOnly = true; cityFieldReset.style.cursor = 'not-allowed'; cityFieldReset.style.opacity = '0.85'; }
  state = {
    currentStep: 0,
    fname: '', lname: '', birth_date: '', city: '', zip: '', bio: '',
    username: '',
    citySource: 'pdok',
    regEmail: '', regPassword: '',
    instruments: [],
    instrumentLevels: {},
    genres: [],
    songs: [],
    repertoireType: '', // TT-52 (12-08-2026): covers/eigen/beide, optioneel, per profiel
    goal: '',
    rehearsalFrequency: '',
    musicalAmbition: '',
    avatarUrl: null,
    avatarFile: null,
    avatarPath: null,
    mediaFiles: [],
    mediaLinks: [],
    onboarding: false
  };
  const banner = document.getElementById('editModeBanner');
  if (banner) banner.style.display = 'none';
  ['unreadBadge', 'unreadBadgeBottom'].forEach(id => {
    const b = document.getElementById(id);
    if (b) b.style.display = 'none';
  });
  showView('landing');
}

// ─── Navigatie ───────────────────────────────────────────────────────────────

// TT-63/nav-herziening (09-08-2026): hamburgermenu voor Over ons + de
// juridische documenten. Sluit bij een klik buiten het menu, bij Escape, en
// (via de closeNavMenu()-aanroep in showView() hierboven) bij elke navigatie.
function toggleNavMenu(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('navMenuDropdown');
  const btn = document.getElementById('navMenuBtn');
  const opening = !dd.classList.contains('visible');
  dd.classList.toggle('visible', opening);
  btn.classList.toggle('active', opening);
}
function closeNavMenu() {
  document.getElementById('navMenuDropdown')?.classList.remove('visible');
  document.getElementById('navMenuBtn')?.classList.remove('active');
}
document.addEventListener('click', (e) => {
  const dd = document.getElementById('navMenuDropdown');
  if (dd && dd.classList.contains('visible') && !dd.contains(e.target) && e.target.id !== 'navMenuBtn') closeNavMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeNavMenu(); });

// TT-119 (22-08-2026): zelfde patroon als het hamburgermenu hierboven, voor
// het kleine menuknopje bij "Profiel bewerken" (band-uitnodigingen aan/uit,
// account verwijderen).
function toggleProfileMoreMenu(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('profileMoreDropdown');
  const btn = document.getElementById('profileMoreBtn');
  const opening = !dd.classList.contains('visible');
  dd.classList.toggle('visible', opening);
  btn.classList.toggle('active', opening);
}
function closeProfileMoreMenu() {
  document.getElementById('profileMoreDropdown')?.classList.remove('visible');
  document.getElementById('profileMoreBtn')?.classList.remove('active');
}
document.addEventListener('click', (e) => {
  const dd = document.getElementById('profileMoreDropdown');
  if (dd && dd.classList.contains('visible') && !dd.contains(e.target) && e.target.id !== 'profileMoreBtn' && !e.target.closest('#profileMoreBtn')) closeProfileMoreMenu();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeProfileMoreMenu(); });

// 22-08-2026 (Ronald): zelfde ⋯-menupatroon voor elke bandkaart in "Mijn
// bands" (huisstijl-en-consistentie.md §8). Een vaste id per knop werkt hier
// niet — er staan meerdere bands tegelijk in de lijst — dus dit werkt met
// event.currentTarget/closest() in plaats van getElementById().
function toggleBandMoreMenu(e) {
  e.stopPropagation();
  const dd = e.currentTarget.nextElementSibling;
  const opening = !dd.classList.contains('visible');
  closeAllBandMoreMenus();
  dd.classList.toggle('visible', opening);
}
function closeAllBandMoreMenus() {
  document.querySelectorAll('#myBandsList .inline-menu-dropdown.visible').forEach(dd => dd.classList.remove('visible'));
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('#myBandsList .profile-actions-menu-wrap')) closeAllBandMoreMenus();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAllBandMoreMenus(); });

// TT-232 (09-09-2026): het ⋯-menu op de zoekpagina is verwijderd, samen met
// toggleSearchPrefsMenu() en closeSearchPrefsMenu(). Het scherm hieronder
// wordt nu geopend vanuit Instellingen → E-mailvoorkeuren.

// Haalt de huidige stand op (email_digest_frequency + email_theme) en toont
// het scherm. Vereist een eigen profiel: de voorkeuren staan op musicians.
async function openSearchPrefsModal() {
  const mid = await getMyMusicianId();
  if (!mid) { showToast('Maak eerst een profiel aan om e-mailvoorkeuren in te stellen.'); return; }
  try {
    // TT-232 (09-09-2026): musician_wanted wordt hier niet meer gelezen of
    // geschreven. De bestaande rijen blijven staan; alleen dit scherm raakt
    // ze niet meer aan.
    const musicianRes = await db.from('musicians')
      .select('email_digest_frequency, email_theme').eq('id', mid).single();
    if (musicianRes.error) throw musicianRes.error;
    selectDigestFrequency(musicianRes.data?.email_digest_frequency || 'daily');
    selectEmailTheme(musicianRes.data?.email_theme || 'light');
    document.getElementById('searchPrefsModal').classList.add('visible');
  } catch (e) {
    logCaught('openSearchPrefsModal', e);
    showToast(friendlyErrorMessage(e));
  }
}
function closeSearchPrefsModal() {
  document.getElementById('searchPrefsModal').classList.remove('visible');
}

// selectDigestFrequency (zonder klik, bij het openen) vs. setDigestFrequency
// (bij een klik) — zelfde onderscheid als elders tussen "stand tonen" en
// "stand wijzigen". Zelfde patroon voor emailTheme hieronder.
function selectDigestFrequency(value) {
  digestFrequencyValue = value;
  document.querySelectorAll('#digestFrequencyControl .segmented-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.mode === value);
  });
}
function setDigestFrequency(el, mode) {
  digestFrequencyValue = mode;
  document.querySelectorAll('#digestFrequencyControl .segmented-btn').forEach(btn => btn.classList.remove('selected'));
  el.classList.add('selected');
}

function selectEmailTheme(value) {
  emailThemeValue = value;
  document.querySelectorAll('#emailThemeControl .segmented-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.mode === value);
  });
}
function setEmailTheme(el, mode) {
  emailThemeValue = mode;
  document.querySelectorAll('#emailThemeControl .segmented-btn').forEach(btn => btn.classList.remove('selected'));
  el.classList.add('selected');
}

// TT-232 (09-09-2026): schrijft alleen nog de twee e-mailvelden.
async function saveSearchPrefs() {
  const mid = await getMyMusicianId();
  if (!mid) return;
  try {
    const { error } = await db.from('musicians').update({
      email_digest_frequency: digestFrequencyValue,
      email_theme: emailThemeValue
    }).eq('id', mid);
    if (error) throw error;
    closeSearchPrefsModal();
    showToast('E-mailvoorkeuren opgeslagen');
  } catch (e) {
    logCaught('saveSearchPrefs', e);
    showToast(friendlyErrorMessage(e));
  }
}

function navLoginClick() {
  if (currentUser) { signOut(); } else { showView('auth'); }
}

// Login vereist voor Mijn Profiel / Mijn Bands (pagina's zelf tonen nette
// lege-staat als er nog geen profiel is — hier hoeft alleen ingelogd te zijn).
function requireLogin(view) {
  if (!currentUser) {
    showView('auth');
    return;
  }
  showView(view);
}

// Zoeken is altijd toegankelijk (04-08-2026, was eerst login+profiel-verplicht).
// Met eigen profiel: volledige matching (straal/score/sortering op basis van je
// eigen postcode/instrument/genre). Zonder profiel: zelfde straal/sortering,
// maar op basis van een handmatig ingevuld vertrekpunt, en zonder matchscore
// (die vereist een instrument/genre-referentie die er zonder profiel niet is).
let hasOwnProfile = false;

let myOwnCity = null;
async function getMyCity() {
  if (myOwnCity) return myOwnCity;
  const mid = await getMyMusicianId();
  if (!mid) return null;
  const { data } = await db.from('musicians').select('city').eq('id', mid).maybeSingle();
  myOwnCity = data?.city || null;
  return myOwnCity;
}

async function configureSearchAccess() {
  const mid = await getMyMusicianId();
  hasOwnProfile = !!mid;

  // TT-30 / TT-U13: weergave-schakelaars gelijkzetten met de werkelijke
  // stand. De HTML start altijd op "Lijst"; op een telefoon is de standaard
  // sinds TT-U13 "Kaarten", en een eigen keuze uit localStorage gaat voor.
  syncViewToggles();

  // TT-236 (10-09-2026): hier werd het instrumentfilter op de bandtab
  // verborgen zonder eigen profiel. Dat is vervallen — het blok staat nu
  // altijd, net als bij Muzikanten. De klasse .band-instrument-filter bestaat
  // niet meer.
  // TT-232 (09-09-2026): "Beste match" blijft bij Muzikanten altijd staan.
  // De punten komen nu uit de ingevulde filters, niet uit je eigen profiel,
  // dus het zoekscherm werkt uitgelogd precies hetzelfde als ingelogd.
  // Bij Bands geldt dat (nog) niet: die score komt nog uit de database.
  document.querySelectorAll('.sort-score-option').forEach(el => {
    el.style.display = hasOwnProfile ? '' : 'none';
  });

  if (!hasOwnProfile) {
    if (bandSearchSortMode === 'score') selectSortModeByValue('filterBandSortMode', 'distance');
  }
  // TT-236: het zichtbare veld de gezette waarde laten tonen. Zonder deze
  // regel blijft er "Beste match" staan terwijl er op afstand gesorteerd is.
  refreshChoiceField('band-sorteren');

  // Eigen plaats alvast invullen bij alle drie de zoektabbladen (Muzikanten,
  // Bands, Setlist) als je een eigen profiel hebt — anders staat het Plaats-
  // veld leeg terwijl de app achter de schermen allang je eigen postcode als
  // vertrekpunt voor de straal gebruikt, wat verwarrend oogt. Alleen invullen
  // als het veld nog leeg is; heb je zelf al iets getypt, dan blijft dat staan.
  // Bevinding van Ronald (05-08-2026): dit gebeurde al voor Setlist, maar was
  // nooit doorgevoerd naar de andere twee tabbladen — nu gelijkgetrokken.
  if (hasOwnProfile) {
    const city = await getMyCity();
    if (city) {
      const musicianCityField = document.getElementById('filterCity');
      if (musicianCityField && !musicianCityField.value.trim()) {
        musicianCityField.value = city;
        updateSearchCityStatus('filterCity', 'filterCityStatus');
      }

      const bandCityField = document.getElementById('filterBandCity');
      if (bandCityField && !bandCityField.value.trim()) {
        bandCityField.value = city;
        updateSearchCityStatus('filterBandCity', 'filterBandCityStatus');
      }

      const setlistCityField = document.getElementById('filterSetlistCity');
      if (setlistCityField && !setlistCityField.value.trim()) {
        setlistCityField.value = city;
        updateSearchCityStatus('filterSetlistCity', 'filterSetlistCityStatus');
      }
    }
  }

  initBandSearchFilters();
  initSetlistSearchFilters();

  // V-24 (13-08-2026, in overleg vastgesteld/TT-U17): kan de Setlist-tab
  // wisselen (verschijnen/verdwijnen), doe dat vóór de tabbladdispatch
  // hieronder — anders roepen we runSetlistSearch() nog aan terwijl de tab
  // net onzichtbaar is geworden (of andersom).
  await updateSetlistTabVisibility();

  // TT-10 (05-08-2026): bij elk bezoek aan "Zoeken" meteen een resultaat tonen
  // voor het tabblad dat op dat moment actief is, i.p.v. te wachten tot
  // iemand zelf op een zoekknop klikt.
  if (currentSearchMode === 'musician') runSearch();
  else if (currentSearchMode === 'band') runBandSearch();
  else if (currentSearchMode === 'setlist' && setlistWantedSongs.length) runSetlistSearch();
}

// V-24 (13-08-2026, TT-U17): de Setlist-tab werd verborgen tot iemand drie
// eigen nummers had — de aanname was dat setlist-zoeken op eigen repertoire
// werkt. TT-158 (27-08-2026, Ronald): die drempel is losgelaten.
// **Geverifieerd:** runSetlistSearch() zoekt op setlistWantedSongs, een
// handmatig samengestelde lijst (Artiest → Nummer, zie de toelichting boven
// runSetlistSearch()) — niet op het eigen repertoire van de zoeker. De
// eigen-nummers-drempel had dus nooit een functionele grond. De tab is nu
// voor iedereen altijd zichtbaar, ongeacht login of eigen repertoire.
async function updateSetlistTabVisibility() {
  const btn = document.getElementById('searchModeSetlistBtn');
  if (!btn) return;
  btn.style.display = '';
}

// Zet een sorteertoggle-grid programmatisch op een waarde (zonder klik-event),
// nodig omdat "Beste match" verborgen wordt zodra er geen eigen profiel is.
function selectSortModeByValue(gridId, value) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  // TT-232 (09-09-2026): bij Muzikanten is dit een keuzelijst geworden.
  // TT-236 (10-09-2026): bij Bands nu ook. De schakelbalk-tak hieronder blijft
  // staan zolang een ander scherm die vorm nog gebruikt.
  if (grid.tagName === 'SELECT') {
    grid.value = value;
    if (gridId === 'filterSortMode') searchSortMode = value;
    if (gridId === 'filterBandSortMode') bandSearchSortMode = value;
    return;
  }
  const target = Array.from(grid.querySelectorAll('.segmented-btn')).find(t => t.getAttribute('data-mode') === value);
  if (!target) return;
  grid.querySelectorAll('.segmented-btn').forEach(t => t.classList.remove('selected'));
  target.classList.add('selected');
  if (gridId === 'filterSortMode') searchSortMode = value;
  if (gridId === 'filterBandSortMode') bandSearchSortMode = value;
}

// TT-170 (10-09-2026): de tweede parameter komt alleen van een veeg en stuurt
// de schuifbeweging van het binnenkomende paneel. Een tik op een tabblad roept
// setSearchMode() met één argument aan; dat pad is ongewijzigd.
function setSearchMode(mode, veegRichting) {
  currentSearchMode = mode;
  const isMusician = mode === 'musician';
  const isBand     = mode === 'band';
  const isSetlist  = mode === 'setlist';
  document.getElementById('searchModeMusician').style.display = isMusician ? 'block' : 'none';
  document.getElementById('searchModeBand').style.display = isBand ? 'block' : 'none';
  document.getElementById('searchModeSetlist').style.display = isSetlist ? 'block' : 'none';
  document.getElementById('searchModeMusicianBtn').classList.toggle('active', isMusician);
  document.getElementById('searchModeBandBtn').classList.toggle('active', isBand);
  document.getElementById('searchModeSetlistBtn').classList.toggle('active', isSetlist);
  if (veegRichting) animeerZoekPaneel(mode, veegRichting);
  if (isBand) initBandSearchFilters();
  if (isSetlist) initSetlistSearchFilters();

  // TT-10: bij het wisselen van tabblad meteen een resultaat tonen (met de
  // filters die op dat tabblad al stonden), i.p.v. een leeg scherm totdat er
  // zelf gezocht wordt. Setlist heeft geen zinvolle "iedereen"-status zonder
  // minstens 1 opgegeven nummer — daar laten we de bestaande lege staat staan.
  if (isMusician) runSearch();
  else if (isBand) runBandSearch();
  else if (isSetlist && setlistWantedSongs.length) runSetlistSearch();
}

// ═══════════════════════════════════════════════════════════════════════════
// TT-170 — vegen tussen de drie zoektabbladen
// ═══════════════════════════════════════════════════════════════════════════
// Besluit Ronald, 10-09-2026: een veeg naar links toont het tabblad rechts,
// een veeg naar rechts het tabblad links. De inhoud volgt de vinger. De
// eerdere afspraak "veeg naar links = terug" (TT-168-wireframe) vervalt.
//
// Volgorde is die van de knoppenrij: Muzikant · Band · Setlist. Aan de
// uiteinden gebeurt niets — geen doorlopende cyclus.
//
// Les uit TT-U21 (het niveau-gebaar): nooit touch-action:none op een groot
// vlak. Dat blokkeerde toen het scrollen over de instrumentknoppen. Deze code
// laat het toestel gewoon scrollen en kiest pas een richting zodra de vinger
// duidelijk horizontaal beweegt.
const ZOEK_TABBLADEN = ['musician', 'band', 'setlist'];
const VEEG_DREMPEL   = 60;   // px die de vinger minimaal horizontaal aflegt
const VEEG_VERHOUDING = 1.5; // horizontaal moet 1,5x groter zijn dan verticaal
const VEEG_MAX_MS    = 800;  // een traag sleepje is geen veeg

let veegStartX = 0, veegStartY = 0, veegStartT = 0;
let veegBezig = false, veegHorizontaal = null;

// Een veeg telt niet als er iets anders overheen ligt, als de vinger in een
// tekstveld begint, of als het element eronder zelf horizontaal scrolt.
function veegGeblokkeerd(doel) {
  if (!doel || !doel.closest) return true;
  // Een open modal of wiel-bladwijzer ligt boven op het zoekscherm.
  if (document.querySelector('.modal-overlay.visible')) return true;
  // In een tekstveld sleept de vinger de cursor, niet het tabblad.
  if (doel.closest('input, textarea, select, [contenteditable="true"]')) return true;
  // Een eigen horizontale scroller (bijv. een brede tabel) houdt de veeg.
  let el = doel;
  while (el && el !== document.body) {
    if (el.scrollWidth > el.clientWidth + 1) {
      const overloop = getComputedStyle(el).overflowX;
      if (overloop === 'auto' || overloop === 'scroll') return true;
    }
    el = el.parentElement;
  }
  return false;
}

function animeerZoekPaneel(mode, richting) {
  const paneelIds = { musician: 'searchModeMusician', band: 'searchModeBand', setlist: 'searchModeSetlist' };
  const paneel = document.getElementById(paneelIds[mode]);
  if (!paneel) return;
  const klasse = richting === 'links' ? 'search-pane-in-left' : 'search-pane-in-right';
  paneel.classList.remove('search-pane-in-left', 'search-pane-in-right');
  // Een geforceerde herberekening, anders start dezelfde animatie niet opnieuw
  // wanneer twee keer achter elkaar dezelfde kant op wordt geveegd.
  void paneel.offsetWidth;
  paneel.classList.add(klasse);
  paneel.addEventListener('animationend', () => paneel.classList.remove(klasse), { once: true });
}

function initZoekVeeg() {
  const view = document.getElementById('view-search');
  if (!view) return;

  view.addEventListener('touchstart', (e) => {
    veegBezig = false;
    veegHorizontaal = null;
    if (e.touches.length !== 1) return;          // knijpen is geen veeg
    if (veegGeblokkeerd(e.target)) return;
    veegStartX = e.touches[0].clientX;
    veegStartY = e.touches[0].clientY;
    veegStartT = Date.now();
    veegBezig = true;
  }, { passive: true });

  view.addEventListener('touchmove', (e) => {
    if (!veegBezig) return;
    if (e.touches.length !== 1) { veegBezig = false; return; }
    const dx = e.touches[0].clientX - veegStartX;
    const dy = e.touches[0].clientY - veegStartY;
    if (veegHorizontaal === null) {
      // Richting vastzetten zodra de vinger ver genoeg is voor een uitspraak.
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      veegHorizontaal = Math.abs(dx) > Math.abs(dy) * VEEG_VERHOUDING;
      if (!veegHorizontaal) { veegBezig = false; return; }  // verticaal: laat scrollen
    }
    // Alleen een vastgezette horizontale veeg houdt de browser tegen. Verticaal
    // scrollen is op dat moment al afgehandeld door de tak hierboven.
    if (veegHorizontaal && e.cancelable) e.preventDefault();
  }, { passive: false });

  const veegEinde = (e) => {
    if (!veegBezig || !veegHorizontaal) { veegBezig = false; return; }
    veegBezig = false;
    const aanraking = e.changedTouches && e.changedTouches[0];
    if (!aanraking) return;
    const dx = aanraking.clientX - veegStartX;
    if (Math.abs(dx) < VEEG_DREMPEL) return;
    if (Date.now() - veegStartT > VEEG_MAX_MS) return;

    const nu = ZOEK_TABBLADEN.indexOf(currentSearchMode);
    if (nu === -1) return;
    // Vinger naar links (dx < 0) → het tabblad rechts komt in beeld.
    const doel = dx < 0 ? nu + 1 : nu - 1;
    if (doel < 0 || doel >= ZOEK_TABBLADEN.length) return;   // geen cyclus

    setSearchMode(ZOEK_TABBLADEN[doel], dx < 0 ? 'rechts' : 'links');
    // Het nieuwe tabblad begint bovenaan, net als na showView(). Zonder dit
    // valt de gebruiker midden in een lijst die hij nog nooit heeft gezien.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  view.addEventListener('touchend', veegEinde, { passive: true });
  view.addEventListener('touchcancel', () => { veegBezig = false; veegHorizontaal = null; }, { passive: true });
}

// De History API (pushState/replaceState) kan een SecurityError gooien in
// sandbox-achtige omgevingen zonder een "normale" document-URL — bijv. een
// srcdoc-iframe-preview. De app moet daar nooit op crashen: browsergeschiedenis
// (TT-16) is dan gewoon niet beschikbaar, maar de rest van de app blijft werken.
function safeHistoryPush(stateObj, hash) {
  try { history.pushState(stateObj, '', hash); } catch (e) { /* stil negeren, zie boven */ }
}
function safeHistoryReplace(stateObj, hash) {
  try { history.replaceState(stateObj, '', hash); } catch (e) { /* stil negeren, zie boven */ }
}

function showView(view, mode) {
  closeNavMenu();
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-btn').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });

  const el = document.getElementById(`view-${view}`);
  if (el) el.classList.add('active');

  const navMap = {
    landing: null, search: 'navSearch',
    about: null, register: null, myprofile: 'navMyProfile', bands: 'navMyBands',
    messages: 'navMessages', auth: 'navLogin', reset: null,
    privacy: null, terms: null, gedragscode: null, profieltegels: null, instellingen: null
  };
  if (navMap[view]) document.getElementById(navMap[view])?.classList.add('active');

  // TT-U24: dezelfde markering in de onderbalk.
  const bottomNavMap = {
    search: 'bottomNavSearch', messages: 'bottomNavMessages',
    bands: 'bottomNavBands', myprofile: 'bottomNavProfile'
  };
  if (bottomNavMap[view]) {
    const bEl = document.getElementById(bottomNavMap[view]);
    if (bEl) { bEl.classList.add('active'); bEl.setAttribute('aria-current', 'page'); }
  }

  // TT-142 (25-08-2026): de vaste onderbalk (Zoeken/Berichten/Bands/Profiel)
  // stond altijd, ook tijdens de wizard — samen met de nieuwe actiebalk
  // (TT-142) gaf dat twee vaste balken tegelijk, met het toetsenbord erbij
  // veel te veel scherm. De wizard heeft zijn eigen navigatie (Terug/
  // Verder/Annuleren/Opslaan), dus de onderbalk mag daar weg. Inline style
  // i.p.v. een CSS-klasse: moet ook op brede schermen werken (waar de CSS-
  // regel voor de onderbalk zelf alleen ≤560px geldt) en moet bij het
  // verlaten van de wizard weer expliciet terug naar de normale (door CSS
  // bepaalde) weergave.
  const bottomNavEl = document.getElementById('appBottomNav');
  if (bottomNavEl) bottomNavEl.style.display = (view === 'register' || view === 'profieltegels') ? 'none' : '';

  if (view === 'register') {
    if (editingMusicianId && !currentUser) {
      // Beveiligingsfix: een leftover editingMusicianId (bijv. na uitloggen
      // zonder dat deze view actief herlaadt) mag nooit alsnog toegang geven
      // tot de wizard met bestaande profielgegevens. Een verse registratie
      // (editingMusicianId leeg) blijft wél altijd toegankelijk zonder login —
      // dat is immers hoe je een account aanmaakt.
      editingMusicianId = null;
      showToast('Log in om je profiel te bewerken.');
      showView('auth', 'redirect');
      return;
    }
    if (currentUser && myMusicianId && !editingMusicianId) { showView('myprofile', 'redirect'); return; }
    // TT-168-overgang (02-09-2026): "locked" betekent sinds de overgang naar
    // het tegeloverzicht nog maar één ding — een onboarding die al voorbij
    // stap 1 is (account bestaat al, resumeOnboarding()). Bewerken van
    // een al afgerond profiel loopt niet meer via de wizard, dus die
    // vertakking (en de save-step-btn-knoppen die daarbij hoorden) is
    // vervallen.
    const locked = !!editingMusicianId;
    ['fname', 'lname', 'birth_date'].forEach(id => {
      const fld = document.getElementById(id);
      if (fld) {
        fld.readOnly = locked;
        fld.style.cursor = locked ? 'not-allowed' : '';
        fld.style.opacity = locked ? '0.85' : '';
      }
    });
    // Zodra het account al bestaat (stap 1 was al gezet), hoeft e-mail/
    // wachtwoord niet nogmaals ingevuld te worden — alleen-lezen e-mailveld
    // ter bevestiging, wachtwoordveld helemaal weg.
    const authSection = document.getElementById('regAuthSection');
    const regEmailField = document.getElementById('regEmail');
    const regPasswordField = document.getElementById('regPasswordField');
    const regAuthFieldGroup = document.getElementById('regAuthFieldGroup');
    const regAuthIntro = document.getElementById('regAuthIntro');
    const regEmailReq = document.getElementById('regEmailReq');
    if (authSection) authSection.style.display = '';
    if (regPasswordField) regPasswordField.style.display = locked ? 'none' : '';
    if (regAuthFieldGroup) regAuthFieldGroup.classList.toggle('single', locked);
    if (regEmailField) {
      regEmailField.readOnly = locked;
      regEmailField.style.cursor = locked ? 'not-allowed' : '';
      regEmailField.style.opacity = locked ? '0.85' : '';
      if (locked) regEmailField.value = currentUser?.email || '';
    }
    if (regEmailReq) regEmailReq.style.display = locked ? 'none' : '';
    if (regAuthIntro) {
      regAuthIntro.textContent = locked
        ? 'Dit is het e-mailadres waarmee je inlogt. Wijzigen kan hier niet.'
        : 'Vul hier je inloggegevens in. Je hebt deze nodig om later terug te komen en je profiel te beheren.';
    }

    // Akkoord-checkbox: alleen verplicht bij het allereerste bezoek aan
    // stap 1. Is het account al aangemaakt (bijv. na een refresh mid-
    // onboarding), dan is die toestemming al gegeven bij de eerste keer —
    // opnieuw aanvinken levert dan alleen wrijving op zonder meerwaarde.
    // Bugfix 06-09-2026 (gevonden tijdens het uitzoeken van de vinkje-
    // uitlijning, niet door Ronald gemeld): style.display = '' wist de
    // display-eigenschap uit de inline stijl in plaats van 'm terug te zetten
    // naar wat er al stond. Voor deze rij betekende dat: bij elke gewone,
    // niet-hervatte registratie (verreweg het vaakste pad) verloor de rij
    // zijn "display:flex" voorgoed zodra showView('register') één keer
    // draaide — de rij viel terug op het label-standaard "inline", zonder
    // gap en zonder align-items. Expliciet 'flex' teruggeven i.p.v. leeg.
    const consentRow = document.getElementById('consentCheckbox')?.closest('label');
    if (consentRow) consentRow.style.display = locked ? 'none' : 'flex';
    if (locked) {
      document.getElementById('submitProfileBtn').disabled = false;
      document.getElementById('submitProfileBtn').style.opacity = '';
      document.getElementById('submitProfileBtn').style.cursor = '';
    } else {
      updateSubmitProfileState();
    }
  }

  if (view === 'myprofile') loadMyProfile();
  if (view === 'bands') loadMyBands();
  if (view === 'search') configureSearchAccess();
  if (view === 'messages') loadInbox();
  if (view === 'profieltegels') {
    if (!myMusicianId) { showToast('Je hebt nog geen profiel om te bewerken.'); showView('myprofile', 'redirect'); return; }
    openTegelOverview();
  }

  const banner = document.getElementById('editModeBanner');
  if (banner) banner.style.display = (currentUser && editingMusicianId && view !== 'register') ? 'flex' : 'none';

  // TT-16: browsergeschiedenis bijwerken, zodat de terugknop (Android/browser)
  // eerst de vorige pagina toont i.p.v. meteen de hele app te sluiten.
  //  - 'pop'      → deze aanroep komt zelf al van de terugknop, geschiedenis
  //                 hoeft niet aangepast (anders ontstaat een lus).
  //  - 'redirect' → interne omleiding binnen dezelfde gebruikersactie (bijv.
  //                 "nog geen profiel → terug naar registratie"); vervangt de
  //                 huidige stap i.p.v. er een nieuwe aan toe te voegen, want
  //                 de gebruiker heeft deze tussenstap nooit bewust bezocht.
  //  - anders     → een gewone, bewuste navigatie: nieuwe stap toevoegen.
  if (mode !== 'pop') {
    if (mode === 'redirect') safeHistoryReplace({ view }, '#' + view);
    else safeHistoryPush({ view }, '#' + view);
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
  // TT-142 (25-08-2026): geen automatische focus meer bij het openen van een
  // view. Was bedoeld als gemak (TT-37), maar opende ongevraagd het
  // toetsenbord en verstoorde daarmee de "bovenaan beginnen"-scroll — de
  // gebruiker moet zelf op een veld tikken voordat het toetsenbord komt.
  // autofocusFirstField() blijft staan (elders eventueel te gebruiken),
  // alleen deze automatische aanroep is weg.
}

// TT-U25 (12-08-2026): zolang een modal open is, mag de pagina eronder niet
// meescrollen. Eén waarnemer op alle modals is betrouwbaarder dan bij elke
// open- en sluitplek apart een regel toevoegen — de app opent modals op
// veertien plekken.
function syncModalScrollLock() {
  const open = !!document.querySelector('.modal-overlay.visible');
  document.body.style.overflow = open ? 'hidden' : '';
}
(function bewaakModals() {
  const waarnemer = new MutationObserver(syncModalScrollLock);
  document.querySelectorAll('.modal-overlay').forEach(m => {
    waarnemer.observe(m, { attributes: true, attributeFilter: ['class'] });
  });
})();

// Sluit, indien open, eerst een modal (telt als één "terug"-stap), daarna een
// open gesprek, en pas daarna een view — voorkomt dat een open profiel-,
// band- of gespreksscherm zomaar verdwijnt samen met de hele pagina eronder.
// TT-249 (11-09-2026): de naam in een profielkop krijgt zijn lettergrootte
// door meten, en meten kan alleen op de breedte van dát moment. Draait iemand
// zijn telefoon, of versleept hij een bureaubladvenster, dan klopt die maat
// niet meer — en omdat de naam nooit afbreekt, zou hij dan over zijn kader
// lopen. Opnieuw passend maken, met een korte wachttijd zodat dit niet bij
// elke tussenstap van het slepen gebeurt.
let naamHermeetTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(naamHermeetTimer);
  naamHermeetTimer = setTimeout(() => fitProfileName(document), 150);
});

window.addEventListener('popstate', (e) => {
  const openModal = document.querySelector('.modal-overlay.visible');
  if (openModal) {
    openModal.classList.remove('visible');
    syncModalScrollLock();
    safeHistoryPush(history.state, location.hash || '#landing');
    return;
  }
  // V-03 (12-08-2026): een open gesprek was geen view en geen modal, dus de
  // terugknop van de telefoon verliet het hele berichtenscherm in plaats van
  // het gesprek te sluiten.
  const draad = document.getElementById('messagesThreadPanel');
  if (draad && draad.style.display !== 'none' && activeConversationId) {
    closeConversation();
    safeHistoryPush(history.state, location.hash || '#messages');
    return;
  }
  // TT-168-overgang (02-09-2026): zelfde patroon voor een open tegelscherm
  // (bijv. "Wie ben je") — eerst dit subscherm sluiten, terug naar het
  // tegeloverzicht, pas bij een tweede terugdruk verder naar Mijn Profiel.
  if (activeTegelScreen !== 'overview') {
    openTegelOverview();
    safeHistoryPush(history.state, location.hash || '#profieltegels');
    return;
  }
  showView(e.state?.view || 'landing', 'pop');
});

