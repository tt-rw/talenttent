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
// Het musicians.id van wie er ingelogd is. Verplaatst uit search.js,
// samen met getMyMusicianId() uit bands.js (26-09-2026): alle bestanden
// gebruiken ze, dus ze horen bij het in- en uitloggen.
let myMusicianId = null;

async function getMyMusicianId() {
  if (myMusicianId) return myMusicianId;
  if (!currentUser) return null;
  const { data } = await db.from('musicians').select('id').eq('user_id', currentUser.id).single();
  myMusicianId = data?.id || null;
  return myMusicianId;
}

// Bugfix, opnieuw hersteld 23-08-2026 (was al eens gerepareerd op
// 13-08-2026, die reparatie was uit dit bestand verdwenen — zie
// onAuthStateChange hieronder voor de volledige toelichting).
let lastSignedInUserId = null;

/* TT-229 (11-09-2026) — de laatst geopende modal ligt altijd bovenop.

   GEVERIFIEERD op de live site: "Beheer overdragen" opende `confirmModal`
   wél, maar die lag onzichtbaar achter `addMemberModal`. Beide staan op
   `z-index: 200`; bij gelijke z-index wint het element dat later in
   `index.html` staat. Voor de gebruiker deed de knop dus niets.

   Dezelfde fout is op 12-08-2026 al eens per scherm gerepareerd
   (`#niveauInfoModal { z-index: 210 }`). Die uitzondering vervalt hiermee:
   de regel hoort in de standaard, niet per scherm (werkwijzeregel §2.11).

   Eén regel, overal geldig: wordt een `.modal-overlay` zichtbaar, dan krijgt
   hij een laag boven alles wat op dat moment al openstaat. Sluit de laatste
   modal, dan begint de teller opnieuw. De opmaak in `styles.css` blijft
   ongewijzigd; alleen de laag wordt gezet. */
let modalLaagTeller = 200;

function initModalStapeling() {
  const pasAan = (el) => {
    if (!el.classList.contains('modal-overlay')) return;
    if (el.classList.contains('visible')) {
      // Alleen bij het daadwerkelijk openen een nieuwe laag geven. Zonder
      // deze controle telt elke andere klassewijziging de teller op.
      if (!el.style.zIndex) el.style.zIndex = String(++modalLaagTeller);
    } else if (el.style.zIndex) {
      el.style.zIndex = '';
      if (!document.querySelector('.modal-overlay.visible')) modalLaagTeller = 200;
    }
  };
  const kijker = new MutationObserver(m => m.forEach(x => pasAan(x.target)));
  document.querySelectorAll('.modal-overlay').forEach(el => {
    kijker.observe(el, { attributes: true, attributeFilter: ['class'] });
    pasAan(el); // een modal die bij het opstarten al openstaat
  });
}

const HERSTELBARE_VIEWS = ['landing', 'search', 'about', 'register', 'myprofile', 'bands', 'auth', 'privacy', 'terms', 'gedragscode', 'profieltegels', 'messages', 'instellingen'];

// TT-279: het zoektabblad overleeft verversen. Alleen voor deze kijker, in
// dit tabblad van de browser; lukt opslaan niet, dan begint Zoeken bij
// Muzikant, zoals voorheen.
function bewaarZoekTabblad(mode) {
  try { sessionStorage.setItem('tt-zoektabblad', mode); } catch (e) { /* geen opslag: geen herstel */ }
}
function herstelZoekTabblad() {
  let mode = null;
  try { mode = sessionStorage.getItem('tt-zoektabblad'); } catch (e) { return; }
  if (mode && mode !== currentSearchMode && ZOEK_TABBLADEN.includes(mode)) setSearchMode(mode);
}

async function appInit() {
  try {
    initModalStapeling(); // TT-229, zie hierboven
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
    const gesprekMatch = hashView.match(/^messages\/(.+)$/);

    const { data: { session } } = await db.auth.getSession();
    // TT-279: vóór onUserLoggedIn() bepalen of de adresregel een pagina
    // aanwijst. Die functie wacht halverwege op de database; het herstel
    // hieronder is dan al gebeurd en mag niet worden overschreven.
    // Inloggen en de wizard vallen erbuiten: daar hoort een ingelogde
    // gebruiker na verversen niet te blijven hangen (gedrag van vóór TT-279).
    // TT-337 (26-09-2026): de goedkeuringspagina van een ouder hoort erbij.
    // Een ouder die zelf muzikant is en ingelogd blijft, belandde anders na
    // het laden op zijn eigen profiel en kon niet goedkeuren.
    opstartHerstelt = !!session?.user && (!!gesprekMatch ||
      /^(profiel|band|toestemming)\//.test(hashView) ||
      (HERSTELBARE_VIEWS.includes(hashView) && !['auth', 'register'].includes(hashView)));
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
      } else if (event === 'USER_UPDATED' && session?.user) {
        // TT-309 (23-09-2026, gemeld door Ronald): een e-mailwijziging met
        // bevestigingsmail voltrekt zich pas als de link is aangeklikt. Zonder
        // deze tak bleef currentUser.email op het oude adres staan, en
        // ververste het scherm "E-mailadres en wachtwoord" niet vanzelf.
        currentUser = session.user;
        verversEmailWeergave(currentUser.email || '');
      }
    });

    // TT-16: een gedeelde link (bijv. talenttent.org/#about) direct op de
    // juiste view openen. Alleen bekende views; Mijn Profiel/Mijn Bands lopen
    // via requireLogin() zodat een uitgelogde bezoeker de gebruikelijke
    // vriendelijke toast + doorverwijzing krijgt, geen lege pagina.
    // TT-279: elke view behalve 'reset' (die hoort bij een mail-link) is
    // herstelbaar, zodat verversen altijd op de huidige pagina blijft.
    const knownHashViews = HERSTELBARE_VIEWS;
    const gatedHashViews = ['myprofile', 'bands', 'profieltegels', 'messages', 'instellingen'];

    // V-12 (13-08-2026): een gedeelde profiellink (#profiel/<id> of
    // #band/<id>, zie shareProfile()) opent direct de detailmodal, boven op
    // het zoekscherm — net als een klik op een zoekresultaat. currentUser
    // staat hierboven al vast, maar hasOwnProfile/myMusicianId nog niet (die
    // worden pas gezet zodra het zoekscherm zelf initialiseert); zonder deze
    // aanroep zou de modal bij een ingelogde gebruiker met eigen profiel toch
    // het beperkte publieke profiel tonen in plaats van het volledige.
    const profielMatch = hashView.match(/^profiel\/(.+)$/);
    const bandMatch = hashView.match(/^band\/(.+)$/);
    // TT-42: de goedkeuringspagina van een ouder. Zelfde vorm als
    // #profiel/<id>, maar zonder inlog en zonder ingang elders in de app —
    // de code komt alleen uit de mail. Staat vóór de rest omdat een ouder
    // geen gebruiker is en nergens anders heen hoeft.
    const toestemmingMatch = hashView.match(/^toestemming\/(.+)$/);
    if (toestemmingMatch) {
      await toestemmingPaginaOpenen(decodeURIComponent(toestemmingMatch[1]));
    } else if (hashView === 'toestemming-gegeven') {
      // TT-331: de knop in de mail aan het kind, na de goedkeuring.
      toestemmingGegevenOpenen();
    } else if (profielMatch || bandMatch) {
      showView('search');
      if (currentUser) await configureSearchAccess();
      if (profielMatch) openMusicianModal(decodeURIComponent(profielMatch[1]));
      else openBandModal(decodeURIComponent(bandMatch[1]));
    } else if (gesprekMatch) {
      // TT-279: een open gesprek blijft open na verversen.
      // Eerst de inbox als huidige stap, dan het gesprek als stap erbovenop:
      // de terugknop sluit daarna eerst het gesprek, net als voorheen.
      if (!currentUser) showView('auth', 'redirect');
      else {
        showView('messages', 'redirect');
        heropenGesprek(decodeURIComponent(gesprekMatch[1]));
      }
    } else if (knownHashViews.includes(hashView)) {
      // 'redirect': verversen voegt geen extra stap toe aan de geschiedenis.
      if (gatedHashViews.includes(hashView) && !currentUser) showView('auth', 'redirect');
      else showView(hashView, 'redirect');
      if (hashView === 'search') herstelZoekTabblad();
    }
  } catch(e) {
    logCaught('appInit', e);
  }
  // TT-301 (20-09-2026): alles hierboven hoort bij het opstarten, niet bij een
  // stap die iemand zelf heeft gezet. De teller begint dus hier op nul; op het
  // scherm waarmee de app opent, is er niets om naar terug te gaan.
  terugDiepte = 0;
  werkTerugKnopBij();
  // Het woordmerk past zich aan de breedte aan (fitKopLogo). Meten kan pas als
  // het woordmerk-lettertype (TT Woordmerk, TT-318) geladen is — met een
  // terugvalletter heeft het woordmerk een andere breedte en klopt de eerste
  // meting niet.
  fitKopLogo(document);
  if (document.fonts?.ready) document.fonts.ready.then(() => fitKopLogo(document));
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

// TT-279 (16-09-2026, Ronald): verversen blijft op de huidige pagina. Staat
// deze vlag aan, dan herstelt appInit() de pagina uit de adresregel en stuurt
// onUserLoggedIn() niet meer door naar Mijn Profiel. onUserLoggedIn() wacht
// halverwege op de database; het herstel is dan al gebeurd.
let opstartHerstelt = false;

// Laatst actief (25-09-2026, besluit Ronald): elke opstart met een geldige
// sessie telt, niet alleen inloggen met een wachtwoord. Wie ingelogd blijft,
// logt nooit opnieuw in en zou anders onterecht wegzakken in de
// zoekresultaten. De database schrijft hooguit één keer per uur. Niet
// wachten: de app hangt hier niet van af, en een fout merkt de gebruiker
// niet — hij komt alleen in app_error_log.
function markeerActief() {
  db.rpc('tt_markeer_actief').then(
    ({ error }) => { if (error) logCaught('markeerActief', error); },
    (e) => logCaught('markeerActief', e));
}

async function onUserLoggedIn(user) {
  // TT-279: de vlag geldt voor precies deze ene aanroep bij het opstarten.
  // Direct uitlezen, vóór de eerste await hieronder.
  const paginaHersteld = opstartHerstelt;
  opstartHerstelt = false;
  // TT-166 (28-08-2026): Uitloggen hoort bij Mijn Profiel, niet meer hier.
  // Ingelogd hoeft niemand nog "Inloggen" te zien — de knop verdwijnt, de
  // ruimte in de tab-regel is dan vrij.
  document.getElementById('navLogin').style.display = 'none';
  // TT-176 (01-09-2026): Uitloggen staat weer in het hamburgermenu ook,
  // naast Mijn Profiel — zie navMenuDropdown hierboven.
  document.getElementById('navLogout').style.display = '';
  // TT-186 (03-09-2026): Instellingen zelfde zichtbaarheidsregel als Uitloggen.
  document.getElementById('navSettings').style.display = '';
  // TT-278: Inloggen in het hamburgermenu alleen uitgelogd.
  document.getElementById('navMenuLogin').style.display = 'none';
  refreshUnreadBadge();
  markeerActief();

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
  // TT-06 (18-09-2026): de blokkadelijst moet er zijn vóórdat er iets gezocht
  // of geladen wordt — anders staat een geblokkeerde muzikant één keer in het
  // eerste zoekresultaat.
  await laadBlokkades();

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

  if (!paginaHersteld) showView('myprofile');
  // TT-38 (07-08-2026): bestaand profiel zonder gebruikersnaam? Verplicht
  // scherm erbovenop tonen (modal blokkeert de rest tot opgeslagen).
  // TT-337: niet op de goedkeuringspagina. Daar is iemand ouder, geen
  // muzikant; het scherm zou de goedkeuring blokkeren.
  if (huidigeView !== 'toestemming') checkUsernameGate();

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
  const navMenuLoginBtn = document.getElementById('navMenuLogin');
  if (navMenuLoginBtn) navMenuLoginBtn.style.display = ''; // TT-278
  myMusicianId = null;
  myOwnCity = null;
  // TT-108 (23-08-2026): hoort bij dezelfde fix als in onUserLoggedIn() —
  // zonder dit kan een verouderde 'true' van de vorige sessie blijven staan
  // voor een net uitgelogde bezoeker, bijv. bij het bekijken van een
  // gedeelde bandlink zonder eerst Zoeken te bezoeken.
  hasOwnProfile = false;
  wisBlokkades(); // TT-06: de blokkades van de vorige gebruiker mogen niet blijven staan
  wisBewaardeZoek(); // TT-295: idem voor de bewaarde zoekopdracht
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

// ─── Uitklapmenu's: één tegelijk, met een donkere laag erachter ─────────────
// 24-09-2026 (Ronald): twee menu's konden tegelijk openstaan, en een open menu
// viel weg tegen de achtergrond. Oorzaak van het eerste: elk menu had een eigen
// sluitluisteraar op het document, en elke menuknop hield zijn tik tegen
// (stopPropagation). Het andere menu hoorde die tik dus nooit.
// Nu geldt één regel voor alle menusoorten: hamburger, ⋯ op het profiel, ⋯ bij
// een band, ⋯ melden/blokkeren en de keuzemenu's (Sorteren op, Weergave).
// - Elk menu roept sluitAlleMenus() aan vóór het opent.
// - Achter het open menu komt een donkere laag (.menu-laag). Een tik op die
//   laag sluit het menu en bereikt niets eronder.
// - Escape sluit elk menu.
// De laag staat direct vóór het menu, in dezelfde ouder. Zo ligt hij in
// dezelfde stapelcontext: ook een menu in een modal krijgt zijn laag binnen
// die modal.
function menuLaagOpen(dd) {
  menuLaagWeg();
  const laag = document.createElement('div');
  laag.className = 'menu-laag';
  laag.addEventListener('click', (e) => { e.stopPropagation(); sluitAlleMenus(); });
  dd.parentNode.insertBefore(laag, dd);
  // Elke ouder met een eigen z-index (de kop, de navigatierij) gaat mee
  // omhoog, anders blijft de onderbalk boven de laag liggen. Een modal niet:
  // die ligt al bovenaan (TT-229). Zie .menu-drager in styles.css.
  for (let x = dd.parentElement; x && x !== document.body; x = x.parentElement) {
    if (x.classList.contains('modal-overlay')) break;
    if (getComputedStyle(x).zIndex !== 'auto') x.classList.add('menu-drager');
  }
}
function menuLaagWeg() {
  document.querySelectorAll('.menu-laag').forEach(l => l.remove());
  document.querySelectorAll('.menu-drager').forEach(x => x.classList.remove('menu-drager'));
}
function sluitAlleMenus() {
  closeNavMenu();
  closeProfileMoreMenu();
  closeAllBandMoreMenus();
  if (typeof sluitVeiligheidMenus === 'function') sluitVeiligheidMenus();
  if (typeof closeChoiceMenu === 'function') closeChoiceMenu();
  menuLaagWeg();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sluitAlleMenus(); });

// TT-63/nav-herziening (09-08-2026): hamburgermenu voor Over ons + de
// juridische documenten. showView() sluit het bij elke navigatie.
function toggleNavMenu(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('navMenuDropdown');
  const opening = !dd.classList.contains('visible');
  sluitAlleMenus();
  if (!opening) return;
  dd.classList.add('visible');
  document.getElementById('navMenuBtn').classList.add('active');
  menuLaagOpen(dd);
}
function closeNavMenu() {
  const dd = document.getElementById('navMenuDropdown');
  if (!dd?.classList.contains('visible')) return;
  dd.classList.remove('visible');
  document.getElementById('navMenuBtn')?.classList.remove('active');
  menuLaagWeg();
}

// TT-119 (22-08-2026): het kleine menuknopje bij "Profiel bewerken"
// (band-uitnodigingen aan/uit).
function toggleProfileMoreMenu(e) {
  if (e) e.stopPropagation();
  const dd = document.getElementById('profileMoreDropdown');
  const opening = !dd.classList.contains('visible');
  sluitAlleMenus();
  if (!opening) return;
  dd.classList.add('visible');
  document.getElementById('profileMoreBtn').classList.add('active');
  menuLaagOpen(dd);
}
function closeProfileMoreMenu() {
  const dd = document.getElementById('profileMoreDropdown');
  if (!dd?.classList.contains('visible')) return;
  dd.classList.remove('visible');
  document.getElementById('profileMoreBtn')?.classList.remove('active');
  menuLaagWeg();
}

// 22-08-2026 (Ronald): zelfde ⋯-menupatroon voor elke bandkaart in "Mijn
// bands" (huisstijl-en-consistentie.md §8). Er staan meerdere bands tegelijk
// in de lijst, dus dit werkt met event.currentTarget in plaats van een id.
function toggleBandMoreMenu(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const dd = btn.nextElementSibling;
  const opening = !dd.classList.contains('visible');
  sluitAlleMenus();
  if (!opening) return;
  dd.classList.add('visible');
  btn.classList.add('active');
  menuLaagOpen(dd);
}
function closeAllBandMoreMenus() {
  const open = document.querySelectorAll('#myBandsList .inline-menu-dropdown.visible');
  if (!open.length) return;
  open.forEach(dd => dd.classList.remove('visible'));
  document.querySelectorAll('#myBandsList .profile-actions-menu-wrap .nav-menu-btn.active')
    .forEach(b => b.classList.remove('active'));
  menuLaagWeg();
}

// TT-232 (09-09-2026): het ⋯-menu op de zoekpagina is verwijderd, samen met
// toggleSearchPrefsMenu() en closeSearchPrefsMenu(). Het scherm hieronder
// wordt nu geopend vanuit Instellingen → E-mailvoorkeuren.

// Haalt de huidige stand op (email_digest_frequency) en toont het scherm.
// TT-327 (25-09-2026): de keuze Licht/Donker is weg; elke mail is licht
// (besluit Ronald bij TT-325). De kolom email_theme blijft in de database.
// Vereist een eigen profiel: de voorkeuren staan op musicians.
async function openSearchPrefsModal() {
  const mid = await getMyMusicianId();
  if (!mid) { showToast('Maak eerst een profiel aan om e-mailvoorkeuren in te stellen.'); return; }
  try {
    // TT-232 (09-09-2026): musician_wanted wordt hier niet meer gelezen of
    // geschreven. De bestaande rijen blijven staan; alleen dit scherm raakt
    // ze niet meer aan.
    const musicianRes = await db.from('musicians')
      .select('email_digest_frequency').eq('id', mid).single();
    if (musicianRes.error) throw musicianRes.error;
    selectDigestFrequency(musicianRes.data?.email_digest_frequency || 'daily');
    document.getElementById('searchPrefsModal').classList.add('visible');
    vulBewaardeZoekInInstellingen(); // TT-295
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
// "stand wijzigen".
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

// TT-232 (09-09-2026): schrijft alleen de e-mailvoorkeur. Sinds TT-327 is dat
// nog één veld.
async function saveSearchPrefs() {
  const mid = await getMyMusicianId();
  if (!mid) return;
  try {
    const { error } = await db.from('musicians').update({
      email_digest_frequency: digestFrequencyValue
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
  await laadBlokkadesIndienNodig(); // TT-06

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

      // TT-289: "Zoek setlist" heeft een eigen Plaats-veld, zelfde regel.
      const gedeeldCityField = document.getElementById('filterGedeeldCity');
      if (gedeeldCityField && !gedeeldCityField.value.trim()) {
        gedeeldCityField.value = city;
        updateSearchCityStatus('filterGedeeldCity', 'filterGedeeldCityStatus');
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
  else if (currentSearchMode === 'setlist') setlistZoekVerversen(); // TT-289
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
  bewaarZoekTabblad(mode); // TT-279
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
  if (isSetlist && setlistSoort === 'nummers') initGedeeldSearchFilters(); // TT-289

  // TT-10: bij het wisselen van tabblad meteen een resultaat tonen (met de
  // filters die op dat tabblad al stonden), i.p.v. een leeg scherm totdat er
  // zelf gezocht wordt. Setlist heeft geen zinvolle "iedereen"-status zonder
  // minstens 1 opgegeven nummer, en "Zoek setlist" niet zonder 2 gekozen
  // muzikanten — daar laten we de bestaande lege staat staan.
  if (isMusician) runSearch();
  else if (isBand) runBandSearch();
  else if (isSetlist) setlistZoekVerversen(); // TT-289: per stand
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
// aangetikt tekstveld begint, of als het element eronder zelf horizontaal scrolt.
function veegGeblokkeerd(doel) {
  if (!doel || !doel.closest) return true;
  // Een open modal of wiel-bladwijzer ligt boven op het zoekscherm.
  if (document.querySelector('.modal-overlay.visible')) return true;
  // TT-280 (16-09-2026, Ronald): alleen in een veld dat al is aangetikt,
  // sleept de vinger de cursor. Over elk ander veld heen wisselt een veeg
  // gewoon van tabblad; de tik op het veld is het signaal om te gaan typen.
  const veld = doel.closest('input, textarea, select, [contenteditable="true"]');
  if (veld && veld === document.activeElement) return true;
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
    // TT-256 (11-09-2026): hier stond `e.preventDefault()` en daarmee moest
    // deze luisteraar niet-passief zijn. Een niet-passieve touchmove dwingt de
    // browser bij elke vingerbeweging te wachten op JavaScript, ook bij gewoon
    // verticaal scrollen — de oorzaak van het schokkerige scrollen op het
    // zoekscherm. Het tegenhouden gebeurt nu vooraf in CSS met
    // `touch-action: pan-y pinch-zoom` op #view-search. Deze luisteraar meet
    // alleen nog de richting en mag daarom passief zijn.
  }, { passive: true });

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

// ─── Terugknop linksboven (TT-301, 20-09-2026, Ronald) ───────────────────
// De knop doet precies hetzelfde als de terugknop van Android: history.back().
// Daarmee loopt hij door dezelfde popstate-afhandeling onderaan dit bestand —
// eerst een open venster, dan een open gesprek, dan een open tegelscherm, pas
// daarna de vorige view. Eén pad, geen tweede logica ernaast.
//
// Waarom de knop er moet zijn: iOS heeft geen systeem-terugknop, en een app
// die op het beginscherm staat heeft ook geen browserbalk (projectinstructies
// §9, TT-294). Daar is dit de enige weg terug.

// Hoeveel stappen de app zelf aan de geschiedenis heeft toegevoegd. Nul
// betekent: dit is het scherm waarmee deze sessie begon, en history.back()
// zou de app verlaten. appInit() zet de teller aan het eind op nul — die
// eerste showView() hoort bij het opstarten en is geen stap die iemand zelf
// heeft gezet.
let terugDiepte = 0;

// De view die nu actief is. showView() houdt hem bij; de terugknop heeft hem
// nodig om te weten of hij omhoog moet of terug.
let huidigeView = 'landing';

// ─── Het hoogste scherm (TT-303, 20-09-2026, Ronald) ─────────────────────
// Ingelogd is dat Mijn Profiel: daar komt iedereen na het inloggen toch al
// uit, en op de landingspagina heeft een ingelogde gebruiker niets meer te
// zoeken. Uitgelogd blijft het de landingspagina. Het woordmerk gaat hierheen,
// en de terugknop op een hoofdtabblad ook.
function hoogsteScherm() {
  return currentUser ? 'myprofile' : 'landing';
}
function naarHoogsteScherm() {
  showView(hoogsteScherm());
}

// De drie hoofdtabbladen onder het hoogste scherm. Daar betekent de terugknop
// "een niveau omhoog", niet "de vorige pagina": boven een tabblad ligt niets,
// dus teruglopen door je eigen klikpad voelt willekeurig (UX-beoordeling
// 20-09-2026).
const TAB_VIEWS = ['search', 'messages', 'bands'];

// Een open venster, gesprek of tegelscherm is óók een stap terug, ook als de
// teller nul is (bijv. na verversen op een gedeelde profiellink). Dezelfde
// drie lagen, in dezelfde volgorde, als de popstate-afhandeling hieronder.
function magTerug() {
  if (document.querySelector('.modal-overlay.visible')) return true;
  const draad = document.getElementById('messagesThreadPanel');
  if (draad && draad.style.display !== 'none' && activeConversationId) return true;
  if (activeTegelScreen !== 'overview') return true;
  // Op het hoogste scherm is er niets boven je en niets om naar terug te gaan.
  if (huidigeView === hoogsteScherm()) return false;
  // Op een hoofdtabblad wijst de knop naar het hoogste scherm.
  if (TAB_VIEWS.includes(huidigeView)) return true;
  return terugDiepte > 0;
}

// Staat er niets open en sta je op een hoofdtabblad? Dan gaat de knop omhoog
// in plaats van terug.
function terugGaatOmhoog() {
  if (document.querySelector('.modal-overlay.visible')) return false;
  const draad = document.getElementById('messagesThreadPanel');
  if (draad && draad.style.display !== 'none' && activeConversationId) return false;
  if (activeTegelScreen !== 'overview') return false;
  return TAB_VIEWS.includes(huidigeView);
}

// TT-310 (23-09-2026, Ronald): de knop staat er altijd, ook als er niets is
// om naar terug te gaan — overal dezelfde kop: terug, woordmerk, hamburger.
// Een druk doet dan niets (zie terugKnop()). Was sinds TT-301: onzichtbaar
// zolang magTerug() onwaar was.
// Enige uitzondering: de goedkeuringspagina (TT-42). Die is het hele bezoek
// van een ouder, en ook de hamburger en de onderbalk staan daar niet.
function werkTerugKnopBij() {
  const btn = document.getElementById('navTerugBtn');
  if (btn) btn.style.visibility = (huidigeView !== 'toestemming') ? '' : 'hidden';
}

function terugKnop() {
  if (!magTerug()) return; // nooit de app uit via deze knop
  if (terugGaatOmhoog()) { naarHoogsteScherm(); return; } // TT-303
  history.back();
}

// ─── Terug zonder opslaan (TT-302, 20-09-2026, Ronald) ───────────────────
// Staan er wijzigingen open, dan gebeurt er bij de eerste druk niets, en
// verschijnt de regel "Terug zonder opslaan?" onder de kop. De tweede druk
// gaat wél terug. Bevestigen doe je dus op de knop waar je net op drukte —
// niet op de regel zelf. Zelfde gedachte als de Terug-knop onder in het
// scherm (TT-226), maar op een plek die altijd in beeld staat.
let terugGewapend = false;

function wapenTerug() {
  terugGewapend = true;
  const label = document.getElementById('terugLabel');
  if (label) label.style.display = '';
  document.getElementById('navTerugBtn')?.classList.add('gewapend');
  // Nooit twee keer dezelfde vraag op één scherm: de Terug-knop onderin
  // valt terug zodra deze regel verschijnt.
  resetCancelButtonVanTegel();
  // Pas ná de huidige klik luisteren, anders vangt hij die meteen zelf af.
  // Zelfde patroon als handleCancelClick() in musicians.js (huisstijl §8).
  setTimeout(() => {
    document.addEventListener('click', function buitenKlik(e) {
      if (!terugGewapend) return;
      if (e.target.closest && e.target.closest('#navTerugBtn')) return;
      ontwapenTerug();
    }, { once: true });
  }, 0);
}

function ontwapenTerug() {
  terugGewapend = false;
  const label = document.getElementById('terugLabel');
  if (label) label.style.display = 'none';
  document.getElementById('navTerugBtn')?.classList.remove('gewapend');
}

function showView(view, mode) {
  huidigeView = view; // TT-303: de terugknop leest dit
  sluitAlleMenus();
  sluitOpruimModals(); // TT-264: een view-wissel laat nooit een spelende video achter
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
  // TT-42: op de goedkeuringspagina staat de onderbalk ook niet. Dat is de
  // eerste uitzondering op TT-224 (onderbalk op elk scherm, elke breedte) en
  // is als zodanig besloten door Ronald, 22-09-2026: wie via de mail binnen-
  // komt is geen gebruiker — Zoeken, Berichten, Bands en Profiel doen voor
  // hem niets. Om dezelfde reden verdwijnen de hamburger en de terugknop.
  const bottomNavEl = document.getElementById('appBottomNav');
  if (bottomNavEl) bottomNavEl.style.display = (view === 'register' || view === 'profieltegels' || view === 'toestemming') ? 'none' : '';
  const menuKnop = document.getElementById('navMenuBtn');
  if (menuKnop) menuKnop.style.display = (view === 'toestemming') ? 'none' : '';

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

    // TT-42 (route A): staat er een halve registratie van een 13-15-jarige in
    // deze browser, dan pakt de wizard die op waar hij gebleven was — ook na
    // dagen. Het kind komt hier terug via de link in de mail van ons aan hem.
    // Alleen zonder ingelogde gebruiker: wie al een account heeft, hoort hier
    // nooit meer in route A te belanden.
    // Staat bewust ónderaan dit blok: de regels hierboven zetten het
    // wachtwoordveld weer zichtbaar, en ouderLeeftijdsregel() hoort daar
    // overheen te gaan, niet andersom.
    if (!currentUser && !editingMusicianId && typeof hervatOuderRoute === 'function') hervatOuderRoute();
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
    // TT-42: de goedkeuringspagina houdt de code in de adresregel. Zou
    // showView() er '#toestemming' van maken, dan werkt verversen niet meer.
    const hash = (view === 'toestemming' && /^#toestemming(\/|-gegeven$)/.test(location.hash))
      ? location.hash
      : '#' + view;
    if (mode === 'redirect') safeHistoryReplace({ view }, hash);
    else { safeHistoryPush({ view }, hash); terugDiepte++; } // TT-301
  }
  werkTerugKnopBij(); // TT-301

  window.scrollTo({ top: 0, behavior: 'smooth' });
  // TT-142 (25-08-2026): geen automatische focus meer bij het openen van een
  // view. Was bedoeld als gemak (TT-37), maar opende ongevraagd het
  // toetsenbord en verstoorde daarmee de "bovenaan beginnen"-scroll — de
  // gebruiker moet zelf op een veld tikken voordat het toetsenbord komt.
  // autofocusFirstField() is op 16-09-2026 verwijderd als dode code.
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
  // TT-301: dezelfde waarnemer werkt ook de terugknop bij. Een modal openen
  // of sluiten gebeurt op veertien plekken; één waarnemer is betrouwbaarder
  // dan veertien losse aanroepen — zelfde afweging als bij de scrollvergrendeling.
  const waarnemer = new MutationObserver(() => { syncModalScrollLock(); werkTerugKnopBij(); });
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
  naamHermeetTimer = setTimeout(() => { fitProfileName(document); fitKopLogo(document); }, 150);
});

// TT-264 (13-09-2026, Ronald): "als ik een video inline afspeel en ik druk op
// de terugknop van de browser, dan ga ik terug naar het profiel. Het nummer
// blijft doorspelen, maar ik zie geen scherm meer."
// Oorzaak, geverifieerd: elke generieke sluitweg haalde alleen de klasse
// 'visible' weg. Het kader of de <video> bleef daardoor in de pagina staan —
// onzichtbaar, maar spelend. Een modal die bij het sluiten iets moet opruimen,
// zegt dat nu één keer, in een data-close-attribuut op de overlay zelf. Wie
// geen data-close heeft, sluit precies zoals voorheen.
function sluitModal(el) {
  if (!el) return;
  const naam = el.dataset.close;
  const fn = naam ? window[naam] : null;
  if (typeof fn === 'function') { fn(); return; }
  el.classList.remove('visible');
}

// Escape en een wissel van view sluiten alleen modals die hun sluitfunctie
// hebben opgegeven. Zo verandert er niets aan de bestaande modals, en groeit
// het gedrag mee zodra een modal zijn opruimwerk declareert.
function sluitOpruimModals() {
  document.querySelectorAll('.modal-overlay.visible[data-close]').forEach(sluitModal);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const lagen = [...document.querySelectorAll('.modal-overlay.visible[data-close]')];
  if (!lagen.length) return;
  // De laatst geopende ligt bovenop (TT-229) — die sluit als eerste.
  lagen.sort((a, b) => (parseInt(a.style.zIndex || 0, 10)) - (parseInt(b.style.zIndex || 0, 10)));
  sluitModal(lagen[lagen.length - 1]);
});

window.addEventListener('popstate', (e) => {
  const openModal = document.querySelector('.modal-overlay.visible');
  if (openModal) {
    sluitModal(openModal);
    syncModalScrollLock();
    safeHistoryPush(history.state, location.hash || '#landing');
    werkTerugKnopBij(); // TT-301
    return;
  }
  // V-03 (12-08-2026): een open gesprek was geen view en geen modal, dus de
  // terugknop van de telefoon verliet het hele berichtenscherm in plaats van
  // het gesprek te sluiten.
  const draad = document.getElementById('messagesThreadPanel');
  if (draad && draad.style.display !== 'none' && activeConversationId) {
    closeConversation();
    safeHistoryPush(history.state, location.hash || '#messages');
    werkTerugKnopBij(); // TT-301
    return;
  }
  // TT-168-overgang (02-09-2026): zelfde patroon voor een open tegelscherm
  // (bijv. "Wie ben je") — eerst dit subscherm sluiten, terug naar het
  // tegeloverzicht, pas bij een tweede terugdruk verder naar Mijn Profiel.
  if (activeTegelScreen !== 'overview') {
    // TT-302 (20-09-2026, Ronald): staan er wijzigingen open, dan gebeurt er
    // bij de eerste druk niets en verschijnt de regel onder de kop. De stap
    // gaat terug in de geschiedenis, zodat de gebruiker precies blijft staan
    // waar hij stond. Geldt voor beide wegen terug — de pijl in de kop en de
    // terugknop van het toestel lopen allebei hierlangs.
    safeHistoryPush(history.state, location.hash || '#profieltegels');
    if (tegelHeeftWijzigingen() && !terugGewapend) {
      wapenTerug();
      return;
    }
    ontwapenTerug();
    openTegelOverview();
    werkTerugKnopBij(); // TT-301
    return;
  }
  // TT-301: pas hier gaat er echt een stap van de app af.
  terugDiepte = Math.max(0, terugDiepte - 1);
  showView(e.state?.view || 'landing', 'pop');
});


// TT-271 (16-09-2026, Ronald): de onderbalk verdwijnt zolang iemand typt.
// Alleen op een aanraakscherm — met een muis komt er geen toetsenbord op.
// Geldt app-breed, voor elk veld dat een toetsenbord opent (§2.11).
function isTypveld(el) {
  if (!el) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return ['text', 'search', 'email', 'password', 'tel', 'url', 'number', ''].includes(el.type);
}
(function initToetsenbordStand() {
  if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;
  document.addEventListener('focusin', e => {
    if (isTypveld(e.target)) document.body.classList.add('toetsenbord-open');
  });
  document.addEventListener('focusout', () => {
    // Wacht één tik: springt de focus naar een volgend veld, dan blijft de balk weg.
    setTimeout(() => {
      if (!isTypveld(document.activeElement)) document.body.classList.remove('toetsenbord-open');
    }, 0);
  });
})();
