// ─── Supabase ────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://fqtgilwfestzofunupnu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_tnWUVGTBmwnn9fAILeNqqQ_UlCn5AFM';
// TT-344 (26-09-2026): de link uit de mail "Kies een nieuw wachtwoord" komt
// binnen als #access_token=…&type=recovery. supabase-js wist dat #-deel zodra
// het de sessie heeft opgehaald, en dat is vóórdat appInit() het leest. Daarom
// hier vastleggen, vóór de client bestaat.
const herstelLinkBijStart = /(^#|&)type=recovery(&|$)/.test(location.hash);

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

// TT-336 (26-09-2026, besluiten Ronald): wie 16 of ouder is, stuurt pas
// berichten en richt pas een band op na de klik in de mail "Bevestig je
// e-mailadres". De database weigert het ook zelf; deze vraag zorgt dat de
// gebruiker eerst een gewone zin ziet in plaats van een foutmelding.
// Geeft 'wacht' (op "Profiel aanmaken" gedrukt, mail nog niet aangeklikt),
// 'onaf' (de wizard nog niet afgemaakt) of null (niets aan de hand).
// Bij een fout: null. Dan houdt de app niets tegen en beslist de database.
async function emailWachtOpBevestiging() {
  if (!currentUser) return null;
  const { data, error } = await db.from('musicians')
    .select('profile_complete, email_bevestigd_op, wacht_op_bevestiging')
    .eq('user_id', currentUser.id).maybeSingle();
  if (error) { logCaught('emailWachtOpBevestiging', error); return null; }
  if (!data || data.profile_complete || data.email_bevestigd_op) return null;
  return data.wacht_op_bevestiging ? 'wacht' : 'onaf';
}

// De zin bij emailWachtOpBevestiging(). `wat`: "berichten sturen" of "een band
// oprichten".
function emailBevestigMelding(stand, wat) {
  return stand === 'wacht'
    ? `Bevestig eerst je e-mailadres. Tik op de knop in de mail die we je stuurden. Daarna kun je ${wat}.`
    : `Maak eerst je profiel af. Daarna kun je ${wat}.`;
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

// TT-341 stap 3 (26-09-2026, besluit Ronald): licht of donker. De keuze zelf
// en het toepassen staan bovenin index.html (lichtDonkerKeuze(),
// pasLichtDonkerToe()), omdat ze vóór de eerste tekening moeten draaien.
// Hier: de keuze in Instellingen, en meewisselen als het toestel wisselt.
function kiesLichtDonker(stand) {
  window.ttLichtDonkerBezoek = stand; // privénavigatie: geldt dan alleen dit bezoek
  try { localStorage.setItem('tt_licht_donker', stand); } catch (e) { /* zie boven */ }
  pasLichtDonkerToe();
  toonLichtDonkerKeuze();
}

// Zet het verborgen <select> van de tegel Thema op de keuze van nu, en de
// tekst in de tegel mee (refreshChoiceField() in utils.js).
function toonLichtDonkerKeuze() {
  const sel = document.getElementById('themaKeuze');
  if (!sel) return;
  sel.value = lichtDonkerKeuze();
  refreshChoiceField('thema');
}

if (window.matchMedia) {
  const toestelStand = window.matchMedia('(prefers-color-scheme: light)');
  if (toestelStand.addEventListener) toestelStand.addEventListener('change', pasLichtDonkerToe);
}

async function appInit() {
  // De tegel Thema in Instellingen: het keuzemenu van de app (huisstijl §7.1).
  initChoiceField({ id: 'thema', fieldId: 'themaTegel', menuId: 'themaMenu', selectId: 'themaKeuze' });
  toonLichtDonkerKeuze();
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
    // TT-344 (26-09-2026): de herstellink uit "Kies een nieuw wachtwoord" hoort
    // erbij. Die link logt ook in; zonder deze regel stuurde onUserLoggedIn()
    // na het laden door naar Mijn Profiel, en kon niemand een nieuw wachtwoord
    // kiezen.
    opstartHerstelt = !!session?.user && (herstelLinkBijStart || !!gesprekMatch ||
      /^(profiel|band|toestemming|bevestig)\//.test(hashView) ||
      (HERSTELBARE_VIEWS.includes(hashView) && !['auth', 'register'].includes(hashView)));
    if (session?.user) {
      currentUser = session.user;
      lastSignedInUserId = session.user.id;
      onUserLoggedIn(session.user);
    }
    // TT-344: meteen het scherm "Nieuw wachtwoord" tonen. De melding
    // PASSWORD_RECOVERY van supabase-js komt pas later, en de terugknop hoort
    // hier geen extra stap te krijgen.
    if (herstelLinkBijStart && session?.user) showView('reset', 'redirect');
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
        // TT-344: appInit() toont het scherm al; niet nog een keer openen.
        if (huidigeView !== 'reset') showView('reset');
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
    // TT-336: de knop in de mail "Bevestig je e-mailadres". Werkt op elk
    // toestel, ook zonder inlog; zie bevestigPaginaOpenen() in wizard.js.
    const bevestigMatch = hashView.match(/^bevestig\/(.+)$/);
    if (bevestigMatch) {
      await bevestigPaginaOpenen(decodeURIComponent(bevestigMatch[1]));
    } else if (toestemmingMatch) {
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
  // TT-344: ook niet op "Nieuw wachtwoord"; eerst het wachtwoord.
  if (huidigeView !== 'toestemming' && huidigeView !== 'reset') checkUsernameGate();

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
  // Beveiligingsfix: een editeer-sessie (via "Profiel bewerken") mag nooit
  // blijven bestaan na uitloggen — anders kan een uitgelogde bezoeker via de
  // "Verder bewerken"-balk alsnog bij de laatst bewerkte profielgegevens.
  editingMusicianId = null;
  clearOnboardingProgress();
  pendingMessageRecipient = null;
  usernameGateMid = null;
  postcodeFailStreak = 0;
  postcodeManualMode = false;
  // TT-352: state én elk veld van de wizard leeg, ook het vinkje, de
  // plaats en het wachtwoord.
  wizardLeegmaken();
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

      // TT-289: "Maak setlist" heeft een eigen Plaats-veld, zelfde regel.
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

// TT-368 (29-09-2026): de tweede parameter (de richting van een veeg) is weg.
// Een veeg schuift de panelen nu zelf mee met de vinger en roept deze functie
// pas aan als het nieuwe paneel al op zijn plek staat. Zie initZoekVeeg().
function setSearchMode(mode) {
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
  if (isBand) initBandSearchFilters();
  if (isSetlist) initSetlistSearchFilters();
  if (isSetlist && setlistSoort === 'nummers') initGedeeldSearchFilters(); // TT-289

  // TT-10: bij het wisselen van tabblad meteen een resultaat tonen (met de
  // filters die op dat tabblad al stonden), i.p.v. een leeg scherm totdat er
  // zelf gezocht wordt. Setlist heeft geen zinvolle "iedereen"-status zonder
  // minstens 1 opgegeven nummer, en "Maak setlist" niet zonder 2 gekozen
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
// TT-368 (29-09-2026, Ronald: "doe wat gebruikelijk is"): tot vandaag volgde
// de inhoud de vinger níét. Er bewoog niets tot de vinger losliet, en dan
// schoof het nieuwe paneel 24px in. Nu werkt het zoals de tabbladen in een
// Android-app:
//  - Het paneel schuift mee met de vinger. Het buurtabblad schuift er direct
//    naast mee, zodat je ziet wat er komt.
//  - Loslaten na meer dan een derde van de breedte, of met een snelle veeg,
//    laat het doorglijden naar het buurtabblad. Anders veert het terug.
//  - Aan de uiteinden beweegt er niets — geen doorlopende cyclus (TT-170).
//  - Neemt het toestel de veeg over (de terugveeg van Android vanaf de rand
//    geeft `touchcancel`), dan veert het paneel terug.
//
// Het buurpaneel staat tijdens het slepen los boven de pagina
// (`position: absolute`), op de hoogte waar je nu kijkt, en is nooit hoger
// dan het scherm. De pagina zelf deelt niets opnieuw in; dat was in TT-170 de
// reden om dit niet te bouwen (panelen van verschillende hoogte).
//
// Alles loopt via `transform`, dus via de grafische kaart, en de luisteraars
// blijven passief (TT-256). Het tegenhouden van horizontaal pannen doet CSS
// met `touch-action: pan-y pinch-zoom` op #view-search.
//
// Les uit TT-U21 (het niveau-gebaar): nooit touch-action:none op een groot
// vlak. Deze code laat het toestel gewoon scrollen en kiest pas een richting
// zodra de vinger duidelijk horizontaal beweegt.
const ZOEK_TABBLADEN = ['musician', 'band', 'setlist'];
const ZOEK_PANEEL_IDS = { musician: 'searchModeMusician', band: 'searchModeBand', setlist: 'searchModeSetlist' };
const VEEG_VERHOUDING  = 1.5;  // horizontaal moet 1,5x groter zijn dan verticaal
const VEEG_AANDEEL     = 0.35; // loslaten voorbij dit deel van de breedte = doorglijden
const VEEG_SNELHEID    = 0.4;  // px per ms; een snelle veeg glijdt ook door
const VEEG_SNEL_MIN_PX = 30;   // ... mits de vinger minstens zo ver ging, vanaf het neerzetten
const VEEG_GLIJ_MS     = 260;  // hele breedte; een kortere rest glijdt sneller

let veeg = null; // de lopende veeg, of null

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

function veegMagBewegen() {
  return !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Zet het buurpaneel klaar naast het huidige: zichtbaar, los van de pagina,
// op de hoogte waar de gebruiker nu kijkt.
function veegBuurKlaarzetten(v, richting) {
  if (v.buur && v.buurRichting === richting) return;
  veegBuurOpruimen(v);
  const nu = ZOEK_TABBLADEN.indexOf(currentSearchMode);
  const doelIndex = richting < 0 ? nu + 1 : nu - 1; // vinger naar links → tabblad rechts
  if (nu === -1 || doelIndex < 0 || doelIndex >= ZOEK_TABBLADEN.length) {
    v.buur = null; v.buurRichting = richting; v.doel = null;
    return;
  }
  const buur = document.getElementById(ZOEK_PANEEL_IDS[ZOEK_TABBLADEN[doelIndex]]);
  if (!buur) { v.buur = null; v.buurRichting = richting; v.doel = null; return; }
  const viewRect = v.view.getBoundingClientRect();
  const paneelRect = v.paneel.getBoundingClientRect();
  const kopOnder = document.querySelector('.app-topbar')?.getBoundingClientRect().bottom || 0;
  const zichtTop = Math.max(paneelRect.top, kopOnder);
  v.view.style.position = 'relative'; // alleen tijdens het slepen, zie veegBuurOpruimen()
  const s = buur.style;
  s.display = 'block';
  s.position = 'absolute';
  s.left = '0';
  s.right = '0';
  s.top = (zichtTop - viewRect.top) + 'px';
  s.height = Math.max(0, window.innerHeight - zichtTop) + 'px';
  s.overflow = 'hidden';
  s.willChange = 'transform';
  s.pointerEvents = 'none';
  v.buur = buur;
  v.buurRichting = richting;
  v.doel = ZOEK_TABBLADEN[doelIndex];
  v.verschuiving = Math.max(0, kopOnder - paneelRect.top); // hoe ver de gebruiker het paneel in is
}

function veegBuurOpruimen(v) {
  if (!v.buur) return;
  const s = v.buur.style;
  s.display = 'none';
  ['position', 'left', 'right', 'top', 'height', 'overflow', 'willChange',
   'pointerEvents', 'transform', 'transition'].forEach(k => { s[k] = ''; });
  v.view.style.position = '';
  v.buur = null;
}

function veegTekenen(v) {
  v.frame = 0;
  if (!v.buur) { v.paneel.style.transform = ''; return; } // uiteinde: niets beweegt
  const w = v.breedte;
  v.paneel.style.transform = `translate3d(${v.dx}px,0,0)`;
  v.buur.style.transform = `translate3d(${v.dx + (v.buurRichting < 0 ? w : -w)}px,0,0)`;
}

// Laat beide panelen naar hun eindplek glijden en roept daarna klaar() aan.
function veegGlijden(v, doorglijden, klaar) {
  const w = v.breedte;
  const eindPaneel = doorglijden ? (v.buurRichting < 0 ? -w : w) : 0;
  const eindBuur   = doorglijden ? 0 : (v.buurRichting < 0 ? w : -w);
  const rest = Math.abs(eindPaneel - v.dx);
  const ms = veegMagBewegen() ? Math.round(Math.max(120, Math.min(VEEG_GLIJ_MS, (rest / w) * VEEG_GLIJ_MS))) : 0;
  if (ms === 0) { klaar(); return; }
  const overgang = `transform ${ms}ms cubic-bezier(0.2, 0, 0, 1)`;
  v.paneel.style.transition = overgang;
  v.paneel.style.transform = `translate3d(${eindPaneel}px,0,0)`;
  if (v.buur) {
    v.buur.style.transition = overgang;
    v.buur.style.transform = `translate3d(${eindBuur}px,0,0)`;
  }
  let gedaan = false;
  const afronden = () => { if (gedaan) return; gedaan = true; klaar(); };
  v.paneel.addEventListener('transitionend', afronden, { once: true });
  setTimeout(afronden, ms + 40); // vangnet: transitionend blijft soms uit
}

function veegPaneelHerstellen(paneel) {
  paneel.style.transform = '';
  paneel.style.transition = '';
  paneel.style.willChange = '';
}

function initZoekVeeg() {
  const view = document.getElementById('view-search');
  if (!view) return;

  view.addEventListener('touchstart', (e) => {
    if (veeg && veeg.glijdt) return;               // de vorige veeg glijdt nog uit
    veeg = null;
    if (e.touches.length !== 1) return;          // knijpen is geen veeg
    if (veegGeblokkeerd(e.target)) return;
    const paneel = document.getElementById(ZOEK_PANEEL_IDS[currentSearchMode]);
    if (!paneel) return;
    const t = e.touches[0];
    veeg = {
      view, paneel, x0: t.clientX, startX: t.clientX, startY: t.clientY, dx: 0,
      horizontaal: null, breedte: view.clientWidth || window.innerWidth,
      buur: null, buurRichting: 0, doel: null, frame: 0, glijdt: false,
      sporen: [{ x: t.clientX, t: performance.now() }]
    };
  }, { passive: true });

  view.addEventListener('touchmove', (e) => {
    const v = veeg;
    if (!v || v.glijdt) return;
    if (e.touches.length !== 1) { veegAfbreken(); return; }
    const t = e.touches[0];
    const dx = t.clientX - v.startX;
    const dy = t.clientY - v.startY;
    if (v.horizontaal === null) {
      // Richting vastzetten zodra de vinger ver genoeg is voor een uitspraak.
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
      v.horizontaal = Math.abs(dx) > Math.abs(dy) * VEEG_VERHOUDING;
      if (!v.horizontaal) { veeg = null; return; }  // verticaal: laat scrollen
      v.startX = t.clientX;                        // geen sprong van 10px bij de start
      v.paneel.style.willChange = 'transform';
    }
    v.dx = t.clientX - v.startX;
    const nu = performance.now();
    v.sporen.push({ x: t.clientX, t: nu });
    while (v.sporen.length > 2 && nu - v.sporen[0].t > 100) v.sporen.shift();
    if (v.dx !== 0) veegBuurKlaarzetten(v, v.dx < 0 ? -1 : 1);
    if (!v.frame) v.frame = requestAnimationFrame(() => veegTekenen(v));
    // TT-256 (11-09-2026): geen `e.preventDefault()` hier. Een niet-passieve
    // touchmove dwingt de browser bij elke vingerbeweging te wachten op
    // JavaScript, ook bij gewoon verticaal scrollen. Het tegenhouden gebeurt
    // vooraf in CSS met `touch-action: pan-y pinch-zoom` op #view-search.
  }, { passive: true });

  view.addEventListener('touchend', (e) => {
    const v = veeg;
    if (!v || v.glijdt) return;
    if (!v.horizontaal) { veeg = null; return; }
    if (v.frame) { cancelAnimationFrame(v.frame); veegTekenen(v); }
    // Het loslaatpunt telt mee: wie stilhield en dan losliet, veegde niet snel.
    const los = e.changedTouches && e.changedTouches[0];
    const nuT = performance.now();
    v.sporen.push({ x: los ? los.clientX : v.startX + v.dx, t: nuT });
    while (v.sporen.length > 2 && nuT - v.sporen[0].t > 100) v.sporen.shift();
    const eerste = v.sporen[0], laatste = v.sporen[v.sporen.length - 1];
    const tijd = laatste.t - eerste.t;
    const snelheid = tijd > 0 ? (laatste.x - eerste.x) / tijd : 0;
    const zelfdeKant = Math.sign(snelheid) === Math.sign(v.dx);
    const doorglijden = !!v.buur && v.doel && (
      Math.abs(v.dx) > v.breedte * VEEG_AANDEEL ||
      (zelfdeKant && Math.abs(snelheid) > VEEG_SNELHEID && Math.abs(laatste.x - v.x0) > VEEG_SNEL_MIN_PX));
    v.glijdt = true;
    veegGlijden(v, doorglijden, () => {
      const doel = v.doel, buur = v.buur, verschuiving = v.verschuiving || 0;
      veegPaneelHerstellen(v.paneel);
      veegBuurOpruimen(v);
      veeg = null;
      if (!doorglijden) return;
      setSearchMode(doel);
      // Het nieuwe paneel staat nu op de plek van het oude. Kijkt de gebruiker
      // al een stuk het paneel in, dan scrollen we zo ver dat zijn bovenkant
      // precies onder de kop staat — daar stond hij tijdens het slepen ook.
      // Zo springt er niets. Stond de bovenkant nog in beeld, dan blijft alles
      // staan.
      if (verschuiving > 0 && buur) {
        const kopOnder = document.querySelector('.app-topbar')?.getBoundingClientRect().bottom || 0;
        const y = window.scrollY + buur.getBoundingClientRect().top - kopOnder;
        window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
      }
    });
  }, { passive: true });

  view.addEventListener('touchcancel', veegAfbreken, { passive: true });
}

// Het toestel nam de veeg over, of er kwam een tweede vinger bij: terugveren.
function veegAfbreken() {
  const v = veeg;
  if (!v || v.glijdt) return;
  if (v.frame) cancelAnimationFrame(v.frame);
  if (!v.horizontaal || v.dx === 0) { veegPaneelHerstellen(v.paneel); veegBuurOpruimen(v); veeg = null; return; }
  v.glijdt = true;
  veegGlijden(v, false, () => { veegPaneelHerstellen(v.paneel); veegBuurOpruimen(v); veeg = null; });
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
    // TT-336: de pagina van #bevestig/<code> ook.
    const hash = (view === 'toestemming' && /^#(toestemming(\/|-gegeven$)|bevestig\/)/.test(location.hash))
      ? location.hash
      : '#' + view;
    if (mode === 'redirect') safeHistoryReplace({ view }, hash);
    else { safeHistoryPush({ view }, hash); terugDiepte++; } // TT-301
  }
  werkTerugKnopBij(); // TT-301
  landingBijwerken(); // TT-61: de foto's wisselen alleen op de landingspagina

  window.scrollTo({ top: 0, behavior: 'smooth' });
  // TT-142 (25-08-2026): geen automatische focus meer bij het openen van een
  // view. Was bedoeld als gemak (TT-37), maar opende ongevraagd het
  // toetsenbord en verstoorde daarmee de "bovenaan beginnen"-scroll — de
  // gebruiker moet zelf op een veld tikken voordat het toetsenbord komt.
  // autofocusFirstField() is op 16-09-2026 verwijderd als dode code.
}

// ─── De landingspagina (TT-61, 30-09-2026, besluiten Ronald) ────────────────
// Richting F uit de landingsproef: "Zoek een <woord>.", de regel waarvoor en de
// foto wisselen vanzelf, elke 4 seconden, in deze vaste volgorde (besluit
// Ronald 30-09-2026: zang en bas zijn schaars, die staan vooraan). Vanzelf
// wisselen is hier een bewuste uitzondering op "geen autoplay" van de
// bannerbalk (huisstijl §18.5): dit scherm toont alleen foto's, geen video of
// geluid. Geen naam of wijk in de regel eronder (Ronald, 29-09-2026).
// De knop "Zoek muzikanten" opent altijd Zoeken, welk woord ook in beeld staat.
const LANDING_WOORDEN = [
  { woord: 'zangeres',   waarvoor: 'Voor je eerste optreden.' },
  { woord: 'drummer',    waarvoor: 'Voor een band die wél repeteert.' },
  { woord: 'bassist',    waarvoor: 'Om samen te oefenen.' },
  { woord: 'gitarist',   waarvoor: 'Voor een jam op zondag.' },
  { woord: 'zanger',     waarvoor: 'Voor eigen nummers.' },
  { woord: 'band',       waarvoor: 'Voor wie nog geen band heeft.' },
  { woord: 'pianist',    waarvoor: 'Voor jazz, soul of iets heel anders.' },
  { woord: 'violist',    waarvoor: 'Voor folk, pop of een strijker erbij.' },
  { woord: 'saxofonist', waarvoor: 'Voor een funkband met blazers.' },
  { woord: 'DJ',         waarvoor: 'Voor een set met echte muzikanten.' }
];
const LANDING_TEMPO = 4000;
// De foto's staan in Supabase, in de openbare map "landing", onder het woord
// in kleine letters: landing/zangeres.jpg, landing/dj.jpg. Staat er geen foto
// onder dat woord, dan blijft het warme vlak staan (besluit Ronald
// 30-09-2026: een woord zonder foto blijft). Een foto erbij of een andere foto
// vraagt dus geen nieuwe code, alleen een bestand met de juiste naam.
const LANDING_FOTO_MAP = SUPABASE_URL + '/storage/v1/object/public/landing/';
let landingStand = 0;
let landingKlok = null;

function landingFotoAdres(woord) {
  return LANDING_FOTO_MAP + encodeURIComponent(woord.toLowerCase()) + '.jpg';
}

// Eén laag per woord. Een foto wordt pas gevraagd als hij bijna aan de beurt
// is (landingFotoLaden), niet alle tien bij het openen: dat scheelt data op
// een telefoon. Laadt hij niet, dan gaat het beeld weg en blijft het vlak.
function landingOpbouwen() {
  const dias = document.getElementById('landingDias');
  if (!dias || dias.children.length) return;
  dias.innerHTML = LANDING_WOORDEN.map(() =>
    '<div class="landing-dia"><img alt="" decoding="async"></div>').join('');
  dias.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => img.remove(), { once: true });
  });
  dias.children[0].classList.add('aan');
  landingFotoLaden(0);
  landingFotoLaden(1);
}

function landingFotoLaden(n) {
  const dia = document.getElementById('landingDias')?.children[n];
  const img = dia?.querySelector('img');
  if (img && !img.getAttribute('src')) img.src = landingFotoAdres(LANDING_WOORDEN[n].woord);
}

function landingNaar(n) {
  const dias = document.getElementById('landingDias');
  const woordEl = document.getElementById('landingWoord');
  const regelEl = document.getElementById('landingWaarvoor');
  if (!dias || !woordEl || !regelEl) return;
  dias.children[landingStand]?.classList.remove('aan');
  landingStand = (n + LANDING_WOORDEN.length) % LANDING_WOORDEN.length;
  dias.children[landingStand]?.classList.add('aan');
  landingFotoLaden((landingStand + 1) % LANDING_WOORDEN.length);
  const nu = LANDING_WOORDEN[landingStand];
  regelEl.textContent = nu.waarvoor;
  // Het woord schuift eruit en het nieuwe schuift erin (280 ms, zoals de proef).
  woordEl.classList.remove('in');
  woordEl.classList.add('uit');
  setTimeout(() => {
    woordEl.textContent = nu.woord;
    woordEl.classList.remove('uit');
    woordEl.classList.add('in');
  }, 280);
}

// Loopt alleen zolang de landingspagina in beeld is en de app voorgrond heeft.
// Bij "minder beweging" wisselt er niets vanzelf, net als de bannerbalk.
// Zet ook de kop op de foto en meet de onderbalk, zodat het scherm precies
// tussen de bovenrand en de onderbalk past.
function landingBijwerken() {
  const view = document.getElementById('view-landing');
  const actief = !!view && view.classList.contains('active');
  document.getElementById('appRoot')?.classList.toggle('landing-op-foto', actief);
  if (actief) {
    const balk = document.getElementById('appBottomNav');
    if (balk && balk.offsetHeight) {
      document.documentElement.style.setProperty('--onderbalk-hoogte', balk.offsetHeight + 'px');
    }
    landingOpbouwen();
  }
  const lopen = actief && !document.hidden && veegMagBewegen();
  if (lopen && !landingKlok) {
    landingKlok = setInterval(() => landingNaar(landingStand + 1), LANDING_TEMPO);
  } else if (!lopen && landingKlok) {
    clearInterval(landingKlok);
    landingKlok = null;
  }
}
document.addEventListener('visibilitychange', landingBijwerken);

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
