// ─── Supabase ────────────────────────────────────────────────────────────────

// TT-455: elke site kiest zijn eigen database op grond van het webadres waarop
// de app draait. Zo staat dezelfde core.js in beide repo's en kan de testsite
// nooit in de database van productie schrijven (en andersom). Een onbekend
// webadres krijgt geen database: de app start dan niet en toont de melding.
// Beide sleutels zijn publishable keys (bedoeld voor de browser).
const TT_DB_PRODUCTIE = {
  url: 'https://fqtgilwfestzofunupnu.supabase.co',
  key: 'sb_publishable_tnWUVGTBmwnn9fAILeNqqQ_UlCn5AFM'
};
const TT_DB_TEST = {
  url: 'https://wlcrjhsniuiewvznwrun.supabase.co',
  key: 'sb_publishable_ubEIJa7rFEmr1rPa-D2B8Q_c8UJ2QDF'
};
const TT_DB_PER_ADRES = {
  'talenttent.org': TT_DB_PRODUCTIE,
  'www.talenttent.org': TT_DB_PRODUCTIE,
  'tt-rw.github.io': TT_DB_TEST,
  'localhost': TT_DB_TEST,
  '127.0.0.1': TT_DB_TEST
};
const TT_DB_GEKOZEN = TT_DB_PER_ADRES[location.hostname] || null;
const SUPABASE_URL = TT_DB_GEKOZEN ? TT_DB_GEKOZEN.url : '';
const SUPABASE_KEY = TT_DB_GEKOZEN ? TT_DB_GEKOZEN.key : '';
if (!TT_DB_GEKOZEN) {
  window.ttBackendMissing = true;
  try { document.getElementById('backendErrorOverlay').classList.add('visible'); } catch (e) { /* geen melding mogelijk */ }
  try { console.error('TT-455: geen database voor dit webadres: ' + location.hostname); } catch (e) { /* geen console */ }
}
// TT-344 (26-09-2026): de link uit de mail "Kies een nieuw wachtwoord" komt
// binnen als #access_token=…&type=recovery. supabase-js wist dat #-deel zodra
// het de sessie heeft opgehaald, en dat is vóórdat appInit() het leest. Daarom
// hier vastleggen, vóór de client bestaat.
// ─── De terugknop (TT-431, 07-10-2026, besluit Ronald: P0) ─────────────────
// De browsergeschiedenis is geen lijst van schermen meer. Er zijn precies twee
// stappen: het begin (state { tt: 'basis' }) en daarna één vaste stap waarop
// de app staat. Elke terug (pijl of toestelknop) komt op het begin uit, de app
// zet de vaste stap meteen terug en voert dán zelf één stap terug uit
// (appTerug(), onderaan dit bestand). Eén pad voor beide knoppen. Welke
// schermen er achter je liggen, houdt de app zelf bij in navStack.
// Bij verversen staat de vaste stap er al (state.view): dan blijft alles zoals het is.
(function zetTerugVal() {
  try {
    const st = history.state;
    if (st && st.view) return;
    // De scrollstand beheert de app zelf (TT-404); elke stap heeft zijn eigen instelling.
    history.scrollRestoration = 'manual';
    if (!(st && st.tt === 'basis')) history.replaceState({ tt: 'basis' }, '', location.href);
    history.pushState({ view: 'landing' }, '', location.href);
    history.scrollRestoration = 'manual';
  } catch (e) { /* geen geschiedenis (sandbox): de terugknop in de kop werkt dan nog via de app */ }
})();

const herstelLinkBijStart = /(^#|&)type=recovery(&|$)/.test(location.hash);
// De link uit de mail is al gebruikt of vervangen door een nieuwere mail: Supabase
// geeft #error=access_denied&error_code=otp_expired. Ook vastleggen vóór de client bestaat.
const herstelLinkVerlopen = /(^#|&)error_code=otp_expired(&|$)/.test(location.hash);

// TT-82: alleen een client aanmaken als de bibliotheek er is. De vlag wordt in
// de <head> gezet. Zonder deze controle stopt het hele script hier met een
// ReferenceError en wordt geen enkele functie meer gedefinieerd.
// TT-306: Supabase weigert soms heel even een vers inlogbewijs, met de melding
// "JWT issued at future". De oorzaak zit aan de kant van Supabase, niet bij het
// toestel of de app. Elke vraag aan Supabase die daarop strandt, gaat na 2
// seconden nog één keer. De weigering komt vóór de vraag wordt uitgevoerd, dus
// opnieuw sturen doet niets dubbel. Elke andere fout gaat ongewijzigd door.
const TT_HERHAAL_NA_MS = 2000;
async function ttFetchMetHerhaling(input, init) {
  const antwoord = await fetch(input, init);
  if (antwoord.ok) return antwoord;
  let tekst = '';
  try { tekst = await antwoord.clone().text(); } catch (e) { return antwoord; }
  if (!/issued at future/i.test(tekst)) return antwoord;
  await new Promise(klaar => setTimeout(klaar, TT_HERHAAL_NA_MS));
  return fetch(input, init);
}

const db = window.ttBackendMissing ? null : supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: ttFetchMetHerhaling } });

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
// TT-471: de eerste regel van elke logregel is het browsertype. Zo is bij een
// foutrapport te zien welke browser de fout gaf. Geen nieuwe kolom nodig.
function ttFoutStackMetToestel(stack) {
  let toestel = '[toestel] onbekend';
  try { toestel = '[toestel] ' + (navigator.userAgent || 'onbekend'); } catch (e) { /* geen browser-info */ }
  return (toestel + (stack ? '\n' + String(stack) : '')).slice(0, 4000);
}
// buitenTeller: alleen voor een weigering van de regel (TT-483 deel b). Die
// heeft een eigen grens (ttCspMelden), zodat twintig andere fouten hem nooit
// kunnen verdringen.
function logAppError(message, source, stack, buitenTeller) {
  if (!db) return; // TT-82: geen bibliotheek, dus ook geen manier om te loggen
  if (!buitenTeller) {
    if (appErrorLogCount >= 20) return;
    appErrorLogCount++;
  }
  try {
    db.from('app_error_log').insert({
      message: String(message || '').slice(0, 2000),
      source: source ? String(source).slice(0, 500) : null,
      stack: ttFoutStackMetToestel(stack),
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

// TT-483 deel b (03-11-2026, besluit Ronald): een weigering van de regel in
// index.html (Content-Security-Policy). Dan laadt iets niet wat een gebruiker
// nodig heeft, of probeert iemand iets vreemds. Ronald: "anders zijn we blind".
// Elke soort één keer per bezoek, hoogstens tien, naar het foutenlog met bron
// csp:<soort>. De bewaking telt die rijen en de database mailt Ronald direct.
// Alleen het webadres van de dienst, nooit de rest van de link: een fotolink
// draagt een sleutel. Een browserextensie valt erbuiten; die is niet van ons
// en gaf anders vals alarm.
const ttCspGemeld = new Set();
function ttCspMelden(e) {
  try {
    const bron = String(e.sourceFile || '');
    const geweigerd = String(e.blockedURI || '');
    if (/^[a-z-]*extension:/i.test(bron) || /^[a-z-]*extension:/i.test(geweigerd)) return;
    const soort = String(e.effectiveDirective || e.violatedDirective || 'onbekend');
    let wat = geweigerd || '(leeg)';
    if (/^(data|blob):/i.test(geweigerd)) wat = geweigerd.split(':')[0] + ':';
    else { try { wat = new URL(geweigerd).origin; } catch (x) { /* 'inline' of 'eval' */ } }
    const sleutel = soort + ' ' + wat;
    if (ttCspGemeld.has(sleutel) || ttCspGemeld.size >= 10) return;
    ttCspGemeld.add(sleutel);
    console.error('Regel weigert ' + sleutel);
    let waar = '';
    try { waar = bron ? new URL(bron).pathname : ''; } catch (x) { /* geen bron */ }
    logAppError('Regel weigert ' + soort + ': ' + wat, 'csp:' + soort,
      'pagina ' + location.pathname + (waar ? '\nbron ' + waar + ':' + (e.lineNumber || 0) : ''), true);
  } catch (x) {
    // nooit teruggooien vanuit de melder zelf
  }
}
(window.ttCspWeigeringen || []).forEach(ttCspMelden);
// Wat de regel hierna weigert, gaat via het blokje in index.html direct hierheen.
window.ttCspWeigeringen = { push: ttCspMelden };

// ─── App initialisatie ───────────────────────────────────────────────────────

let currentUser = null;
// Het musicians.id van wie er ingelogd is. Verplaatst uit search.js,
// samen met getMyMusicianId() uit bands.js (26-09-2026): alle bestanden
// gebruiken ze, dus ze horen bij het in- en uitloggen.
let myMusicianId = null;
// TT-561: de fout van de laatste vraag naar het eigen id. Geeft getMyMusicianId()
// null terug terwijl dit gezet is, dan was er een storing en is er niet "geen
// profiel". Een scherm toont dan de foutstaat, nooit "Nog geen profiel".
let myMusicianIdFout = null;

async function getMyMusicianId() {
  if (myMusicianId) return myMusicianId;
  myMusicianIdFout = null;
  if (!currentUser) return null;
  const { data, error } = await db.from('musicians').select('id').eq('user_id', currentUser.id).single();
  // PGRST116: geen rij. Dat is "geen profiel", geen storing.
  if (error && error.code !== 'PGRST116') {
    myMusicianIdFout = error;
    logCaught('getMyMusicianId', error);
    return null;
  }
  myMusicianId = data?.id || null;
  return myMusicianId;
}
// TT-561: de melding als getMyMusicianId() niets gaf. Bij een storing de oorzaak,
// anders de tekst over het ontbrekende profiel.
function geenProfielMelding(tekst) {
  showToast(myMusicianIdFout ? friendlyErrorMessage(myMusicianIdFout, 'je profiel laden') : tekst);
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
// Views die alleen ingelogd open gaan; uitgelogd gaat de link naar Inloggen.
const AFGESCHERMDE_VIEWS = ['myprofile', 'bands', 'profieltegels', 'messages', 'instellingen'];

// TT-389 (01-10-2026): welke view hoort bij het #-deel van de link? Zelfde
// regels als bij het opstarten (appInit). Een onbekend #-deel gaat naar het
// hoogste scherm, nooit vast naar de landingspagina.
function viewUitHash() {
  const v = location.hash.replace('#', '');
  if (/^(profiel|band)\/./.test(v)) return 'profiel'; // TT-410b: de link naar een profiel of een band
  if (!HERSTELBARE_VIEWS.includes(v)) return hoogsteScherm();
  if (AFGESCHERMDE_VIEWS.includes(v) && !currentUser) return 'auth';
  if (currentUser && ['auth', 'register'].includes(v)) return hoogsteScherm();
  return v;
}

// TT-279: het zoekscherm overleeft verversen. TT-520: bewaarZoekStand() en
// herstelZoekStand() staan nu in search.js, bij de drie schermen van Zoeken.

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
  // TT-437: Delen via link en Beschikbaarheid (TT-457), zelfde vorm als Thema.
  initChoiceField({ id: 'deel', fieldId: 'deelTegel', menuId: 'deelMenu', selectId: 'deelKeuze' });
  initChoiceField({ id: 'beschikbaar', fieldId: 'beschikbaarTegel', menuId: 'beschikbaarMenu', selectId: 'beschikbaarKeuze' });
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
    // TT-405: de opgeslagen sessie houdt het e-mailadres van het moment van
    // inloggen. Is het daarna gewijzigd (bevestigen met een ander e-mailadres,
    // of op een ander toestel), dan toonde de app het oude. Eén vraag aan de
    // server bij het opstarten; lukt die niet, dan geldt de opgeslagen sessie.
    if (session?.user) {
      try {
        const { data: vers } = await db.auth.getUser();
        if (vers?.user && vers.user.id === session.user.id) session.user = vers.user;
      } catch (e) { logCaught('appInit.getUser', e); }
    }
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
    const gatedHashViews = AFGESCHERMDE_VIEWS;

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
    if (herstelLinkVerlopen) {
      // Eigen melding in gewone taal; de foutcode in de adresregel wissen.
      try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { /* geen geschiedenis */ }
      if (currentUser) showToast('Deze link werkt niet meer. Vraag een nieuwe aan via Wachtwoord vergeten.');
      else {
        showView('auth', 'redirect');
        const vak = document.getElementById('authLinkVerlopen');
        if (vak) vak.hidden = false;
      }
    } else if (bevestigMatch) {
      await bevestigPaginaOpenen(decodeURIComponent(bevestigMatch[1]));
    } else if (toestemmingMatch) {
      await toestemmingPaginaOpenen(decodeURIComponent(toestemmingMatch[1]));
    } else if (hashView === 'toestemming-gegeven') {
      // TT-331: de knop in de mail aan het kind, na de goedkeuring.
      toestemmingGegevenOpenen();
    } else if (profielMatch || bandMatch) {
      // TT-410b: een link naar een profiel is een eigen scherm. Na verversen
      // staat de stap er al (met het id); dan komt het scherm terug op zijn
      // plek, zonder nog een Zoeken eronder. Een gedeelde link of een link uit
      // een ander tabblad heeft geen stap: die opent Zoeken, met het profiel
      // erboven, en gaat langs de deelregel (laadProfielScherm()).
      // TT-410b fase 2: een band is hetzelfde scherm met een eigen stap
      // (`soort: 'band'`), zodat er geen zeventiende view bijkomt.
      const st = history.state;
      const doelSoort = bandMatch ? 'band' : 'muzikant';
      const doelId = decodeURIComponent((profielMatch || bandMatch)[1]);
      const zelfdeStap = !!(st && st.view === 'profiel' && st.id === doelId &&
        (st.soort === 'band') === (doelSoort === 'band'));
      if (!zelfdeStap) showView('search');
      if (currentUser) await configureSearchAccess();
      const open = doelSoort === 'band' ? openBandScherm : openProfielScherm;
      if (zelfdeStap) open(doelId, { redirect: true, link: !st.app });
      else open(doelId, { link: true });
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
      if (hashView === 'search') herstelZoekStand();
    }
  } catch(e) {
    logCaught('appInit', e);
  }
  // TT-301 (20-09-2026): alles hierboven hoort bij het opstarten, niet bij een
  // stap die iemand zelf heeft gezet. De teller begint dus hier op nul; op het
  // scherm waarmee de app opent, is er niets om naar terug te gaan.
  navStack.length = 0;
  werkTerugKnopBij();
  // Het woordmerk past zich aan de breedte aan (fitKopLogo). Meten kan pas als
  // het woordmerk-lettertype (TT Woordmerk, TT-318) geladen is — met een
  // terugvalletter heeft het woordmerk een andere breedte en klopt de eerste
  // meting niet.
  fitKopLogo(document);
  if (document.fonts?.ready) document.fonts.ready.then(() => { fitKopLogo(document); fitKopTitel(); });
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
  refreshBandsDot();
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
  ['unreadBadge', 'unreadBadgeBottom', 'bandsDotBottom'].forEach(id => {
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
  zetNavMap(false); // TT-427: het menu opent altijd met de map dicht
  menuLaagWeg();
}
// TT-427 (10-10-2026): de map Voorwaarden in het hamburgermenu klapt open en
// dicht onder zichzelf. Eén tik opent, nog een tik sluit. Het menu blijft open.
function zetNavMap(open) {
  const knop = document.getElementById('navVoorwaarden');
  const lijst = document.getElementById('navVoorwaardenLijst');
  if (!knop || !lijst) return;
  knop.setAttribute('aria-expanded', open ? 'true' : 'false');
  knop.classList.toggle('open', !!open);
  lijst.hidden = !open;
}
function toggleNavMap(e) {
  if (e) e.stopPropagation();
  const knop = document.getElementById('navVoorwaarden');
  zetNavMap(knop?.getAttribute('aria-expanded') !== 'true');
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
// TT-385: het ⋯-menu van een band staat ook op de bandpagina (lid,
// beheerder) en in de rijen van Onze bezetting. Tot 02-10-2026 keek deze
// functie alleen in Mijn Bands; daardoor bleef het menu op de bandpagina open
// staan na een tik op de donkere laag.
const BAND_MENU_PLEKKEN = ['#myBandsList', '#profielSchermContent', '#view-profieltegels'];
function closeAllBandMoreMenus() {
  const open = document.querySelectorAll(BAND_MENU_PLEKKEN.map(p => `${p} .inline-menu-dropdown.visible`).join(', '));
  if (!open.length) return;
  open.forEach(dd => dd.classList.remove('visible'));
  document.querySelectorAll(BAND_MENU_PLEKKEN.map(p => `${p} .profile-actions-menu-wrap .nav-menu-btn.active`).join(', '))
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
  if (!mid) { geenProfielMelding('Maak eerst een profiel aan om e-mailvoorkeuren in te stellen.'); return; }
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
    vulPushInInstellingen(); // TT-452
  } catch (e) {
    logCaught('openSearchPrefsModal', e);
    showToast(friendlyErrorMessage(e, 'je zoekvoorkeuren laden'));
  }
}
function closeSearchPrefsModal() {
  document.getElementById('searchPrefsModal').classList.remove('visible');
}

// selectDigestFrequency (zonder klik, bij het openen) vs. setDigestFrequency
// (bij een klik) — zelfde onderscheid als elders tussen "stand tonen" en
// "stand wijzigen". Sinds 27-10-2026 (TT-520 deel 2, opdracht Ronald) slaat
// een klik meteen op, zoals elke andere keuze in dit venster; de knop
// Opslaan is weg. Mislukt het, dan springt de keuze terug.
function selectDigestFrequency(value) {
  digestFrequencyValue = value;
  document.querySelectorAll('#digestFrequencyControl .segmented-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.mode === value);
  });
}
async function setDigestFrequency(el, mode) {
  const oud = digestFrequencyValue;
  if (mode === oud) return;
  selectDigestFrequency(mode);
  try {
    const mid = await getMyMusicianId();
    if (!mid) throw new Error('geen profiel');
    const { error } = rijenGeraakt(await db.from('musicians').update({ email_digest_frequency: mode }).eq('id', mid).select('id'));
    if (error) throw error;
  } catch (e) {
    logCaught('setDigestFrequency', e);
    selectDigestFrequency(oud);
    showToast(friendlyErrorMessage(e, 'je e-mailvoorkeur opslaan'));
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
  const { data, error } = await db.from('musicians').select('city').eq('id', mid).maybeSingle();
  if (error) { logCaught('getMyCity', error); return null; } // TT-561: niet onthouden, volgende keer opnieuw
  myOwnCity = data?.city || null;
  return myOwnCity;
}

async function configureSearchAccess() {
  // TT-385 fase 3: de regel van een open rol hoort bij die ene zoekopdracht.
  // Vóór de eerste await: zoekMuzikantVoorRol() zet hem direct na showView().
  const rolMelding = document.getElementById('zoekRolMelding');
  if (rolMelding) rolMelding.hidden = true;
  zoekRolBand = null;
  const mid = await getMyMusicianId();
  hasOwnProfile = !!mid;
  await laadBlokkadesIndienNodig(); // TT-06

  // TT-30 / TT-U13: weergave-schakelaars gelijkzetten met de werkelijke
  // stand. De HTML start altijd op "Lijst"; op een telefoon is de standaard
  // sinds TT-U13 "Kaarten", en een eigen keuze uit localStorage gaat voor.
  syncViewToggles();

  // TT-520 (26-10-2026): "Beste match" staat er altijd, ook voor bands en
  // zonder eigen profiel. De punten komen uit de ingevulde filters, niet uit
  // je eigen profiel (TT-232); bands volgen sinds TT-520 dezelfde regel. Het
  // verbergen van Beste match bij Bands zonder profiel is daarmee vervallen.

  // Eigen plaats alvast invullen bij Muzikanten en Mix & Match als je een
  // eigen profiel hebt — anders staat het Plaats-veld leeg terwijl de app
  // achter de schermen allang je eigen postcode als vertrekpunt gebruikt.
  // Alleen als het veld nog leeg is; heb je zelf al iets getypt, dan blijft
  // dat staan (bevinding Ronald, 05-08-2026).
  if (hasOwnProfile) {
    const city = await getMyCity();
    if (city) {
      const musicianCityField = document.getElementById('filterCity');
      if (musicianCityField && !musicianCityField.value.trim()) {
        musicianCityField.value = city;
        updateSearchCityStatus('filterCity', 'filterCityStatus');
      }

      const setlistCityField = document.getElementById('filterSetlistCity');
      if (setlistCityField && !setlistCityField.value.trim()) {
        setlistCityField.value = city;
        updateSearchCityStatus('filterSetlistCity', 'filterSetlistCityStatus');
      }
    }
  }

  initSetlistSearchFilters();

  // TT-10 (05-08-2026): bij elk bezoek aan Muzikanten of Mix & Match meteen
  // een resultaat tonen. Het startscherm (TT-520) zoekt niets.
  if (zoekScherm === 'muzikanten') runSearch();
  else if (zoekScherm === 'mixmatch') setlistZoekVerversen(); // TT-289
}

// Zet een sorteerkeuze programmatisch op een waarde (zonder klik-event).
// TT-232/TT-236: een keuzelijst met een verborgen <select> als bron van
// waarheid. TT-520: alleen nog Volgorde bij Muzikanten; de schakelbalk-tak
// en de keuze bij Bands zijn vervallen.
function selectSortModeByValue(gridId, value) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.value = value;
  if (gridId === 'filterSortMode') searchSortMode = value;
}

// TT-520 (26-10-2026, akkoord Ronald, sessie 18): vegen tussen de
// zoektabbladen (TT-170, TT-368) is vervallen, met de tabbladen zelf. Muzikant,
// Band en Setlist zijn nu het startscherm Zoeken met twee tegels; zie
// zoekScherm in search.js.

// De History API (pushState/replaceState) kan een SecurityError gooien in
// sandbox-achtige omgevingen zonder een "normale" document-URL — bijv. een
// srcdoc-iframe-preview. De app moet daar nooit op crashen: browsergeschiedenis
// (TT-16) is dan gewoon niet beschikbaar, maar de rest van de app blijft werken.
// Geeft terug of de stap er staat (TT-385 fase 4: de bandwizard moet dat weten).
function safeHistoryPush(stateObj, hash) {
  try { history.pushState(stateObj, '', hash); history.scrollRestoration = 'manual'; return true; } catch (e) { return false; /* stil negeren, zie boven */ }
}
function safeHistoryReplace(stateObj, hash) {
  try { history.replaceState(stateObj, '', hash); } catch (e) { /* stil negeren, zie boven */ }
}

// ─── Terugknop linksboven (TT-301, 20-09-2026, Ronald) ───────────────────
// De knop doet precies hetzelfde als de terugknop van het toestel: beide
// komen uit bij appTerug() (onderaan dit bestand). Eén pad, geen tweede logica
// ernaast. Sinds TT-431 houdt de app de schermen zelf bij (navStack); de
// browsergeschiedenis is alleen de vangnetstap, zie zetTerugVal().
//
// Waarom de knop er moet zijn: iOS heeft geen systeem-terugknop, en een app
// die op het beginscherm staat heeft ook geen browserbalk (projectinstructies
// §9, TT-294). Daar is dit de enige weg terug.

// De schermen achter je (TT-431): per stap { state, hash }. Een tik op een
// tab (Zoeken, Berichten, Bands, Mijn Profiel) begint opnieuw: dat is de
// bovenkant van het tabblad en er ligt niets achter. Elk ander scherm legt het
// scherm waar je vandaan komt erop. Terug haalt de bovenste weer af.
const navStack = [];

// De view die nu actief is. showView() houdt hem bij; de terugknop heeft hem
// nodig om te weten of hij omhoog moet of terug.
let huidigeView = 'landing';
// De stap en het adres waarmee de vaste stap van de app nu staat (TT-431).
let stapNu = { view: 'landing' };
let hashNu = location.hash || '#landing';
// TT-404 (03-10-2026, Ronald): terug op dezelfde plek. De browser zet bij een
// stap terug zelf de scrollstand van de vorige stap terug (bovenaan), ook als
// er alleen een venster sluit. De app beheert de scrollstand daarom zelf.
try { history.scrollRestoration = 'manual'; } catch (e) { /* stil negeren */ }
const viewScrollStand = {};

// ─── Het hoogste scherm (TT-303, 20-09-2026, Ronald) ─────────────────────
// Ingelogd is dat Mijn Profiel: daar komt iedereen na het inloggen toch al
// uit, en op de landingspagina heeft een ingelogde gebruiker niets meer te
// zoeken. Uitgelogd blijft het de landingspagina. De knop "Naar mijn profiel"
// na het bevestigen gaat hierheen. Het woordmerk niet meer: een tik op titel
// of woordmerk doet niets (TT-517 fase 3, besluit Ronald C1, 01-11-2026).
function hoogsteScherm() {
  return currentUser ? 'myprofile' : 'landing';
}
function naarHoogsteScherm() {
  showView(hoogsteScherm());
}

// De bovenkant van een tabblad: Zoeken, Berichten, Bands en Mijn Profiel, en
// het hoogste scherm (de landingspagina als je uitgelogd bent). Terug gaat
// vanaf Zoeken, Berichten en Bands naar het hoogste scherm; op het hoogste
// scherm staat geen pijl en doet de toestelknop niets.
// *(TT-548, besluit Ronald 05-11-2026; vervangt voor de bovenkant TT-428, waar
// terug op een tabblad niets deed, en TT-310, waar de pijl er altijd stond.)*
const TAB_VIEWS = ['search', 'messages', 'bands', 'myprofile'];
function opTabbladBovenkant() {
  return TAB_VIEWS.includes(huidigeView) || huidigeView === hoogsteScherm();
}

// Een open venster, gesprek, tegelscherm of wizard is een stap terug van de
// app, ook zonder scherm erachter (bijv. na verversen). Dezelfde lagen, in
// dezelfde volgorde, als appTerug().
function heeftTerugLaag() {
  if (document.querySelector('.modal-overlay.visible')) return true;
  const draad = document.getElementById('messagesThreadPanel');
  if (draad && draad.style.display !== 'none' && activeConversationId) return true;
  if (activeTegelScreen !== 'overview') return true;
  if (bandWizardOpen()) return true; // TT-385 fase 4
  if (huidigeView === 'search' && zoekScherm !== 'start') return true; // TT-520
  return false;
}
// Scherm los van de onderbalk, waar de toestelknop de app mag verlaten: de
// landingspagina en de goedkeuringspagina van een ouder (de mail zit erachter).
function magAppVerlaten() {
  return !heeftTerugLaag() && (huidigeView === 'toestemming' || (huidigeView === 'landing' && !currentUser));
}
function magTerug() {
  if (heeftTerugLaag()) return true;
  // TT-548 (besluit Ronald 05-11-2026): het hoogste scherm (Mijn Profiel, of
  // uitgelogd de landingspagina) heeft niets boven zich. Vanaf de bovenkant van
  // Zoeken, Berichten en Bands gaat terug daarheen.
  if (huidigeView === hoogsteScherm() && !navStack.length) return false;
  return huidigeView !== 'toestemming';
}

// De knop staat overal, behalve op het hoogste scherm (Mijn Profiel, of
// uitgelogd de landingspagina) en de goedkeuringspagina (TT-42). Daar is er
// niets om naar terug te gaan; de plek blijft leeg, zodat de kop niet
// verschuift (TT-548, besluit Ronald 05-11-2026; was TT-310: altijd zichtbaar).
function werkTerugKnopBij() {
  const btn = document.getElementById('navTerugBtn');
  // Weg op de goedkeuringspagina (TT-310) en op de landingspagina (besluit
  // Ronald, 06-10-2026: "er is niets om naar terug te gaan"). De plek blijft
  // leeg, zodat het woordmerk niet verschuift.
  // TT-548 (besluit Ronald 05-11-2026): ook weg op Mijn Profiel, het hoogste
  // scherm. Een pijl die niets doet, voelt als "nog een keer tikken".
  if (btn) btn.style.visibility = (huidigeView !== 'toestemming' && huidigeView !== 'landing' && huidigeView !== hoogsteScherm()) ? '' : 'hidden';
}

function terugKnop() {
  if (!magTerug()) return; // nooit de app uit via deze knop
  appTerug();
}

// ─── Terug zonder opslaan (TT-302, 20-09-2026, Ronald) ───────────────────
// Staan er wijzigingen open, dan gebeurt er bij de eerste druk niets, en
// verschijnt de regel "Terug zonder opslaan?" onder de kop. De tweede druk
// gaat wél terug. Bevestigen doe je dus op de knop waar je net op drukte —
// niet op de regel zelf.
let terugGewapend = false;

function wapenTerug() {
  terugGewapend = true;
  const label = document.getElementById('terugLabel');
  if (label) label.style.display = '';
  document.getElementById('navTerugBtn')?.classList.add('gewapend');
  // Pas ná de huidige klik luisteren, anders vangt hij die meteen zelf af.
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

// `extra` is alleen voor het profielscherm (TT-410b): { id, app, soort }. `app`
// is waar als het profiel in de app is geopend en onwaar bij een link; `soort`
// is 'band' voor een bandpagina, anders een muzikant.
function showView(view, mode, extra) {
  stopSchuif(); // TT-517 fase 9: een nieuwe stap maakt een lopende overgang meteen af
  // TT-404: onthoud waar je in de view stond die je verlaat.
  if (huidigeView && huidigeView !== view) viewScrollStand[huidigeView] = window.scrollY;
  const vorigeView = huidigeView;
  huidigeView = view; // TT-303: de terugknop leest dit
  // TT-564: de wisselende tip in de mediahoek loopt alleen zolang zijn scherm in beeld is.
  if (vorigeView !== view && typeof mhTipTimer !== 'undefined') {
    clearInterval(mhTipTimer); clearInterval(wizardMhTipTimer);
    if (view === 'profieltegels' && activeTegelScreen === 'mediahoek') mhStartTipCycle();
    if (view === 'register' && state.currentStep === 4) wizardMhStartTipCycle();
  }
  // TT-410b: welk profiel, en hoe is het geopend? Bij een stap terug staat het
  // in de stap zelf; bij een link in het #-deel van het adres.
  // TT-410b fase 2: hetzelfde scherm toont een muzikant of een band
  // (`profielSoort`); de stap onthoudt beide.
  let profielId = null, profielVanApp = false, profielSoort = 'muzikant';
  if (view === 'profiel') {
    const hashMatch = location.hash.match(/^#(profiel|band)\/(.+)$/) || [];
    profielSoort = extra ? (extra.soort === 'band' ? 'band' : 'muzikant')
      : (mode === 'pop' && history.state && history.state.soort === 'band') ? 'band'
      : hashMatch[1] === 'band' ? 'band' : 'muzikant';
    profielId = (extra && extra.id) || (mode === 'pop' && history.state && history.state.id)
      || (hashMatch[2] ? decodeURIComponent(hashMatch[2]) : null);
    profielVanApp = extra ? !!extra.app : !!(history.state && history.state.app);
  }
  // TT-385 fase 3: het tegelscherm is van je eigen profiel of van een band
  // (bewerkBandId). Wie het verlaat, laat geen open tegel of band achter;
  // anders sluit de terugknop elders nog een tegel die er niet meer is.
  // Terug in de geschiedenis of na verversen komt de band uit de stap zelf.
  if (view !== 'profieltegels') { bewerkBandId = null; activeTegelScreen = 'overview'; }
  else if (mode === 'pop' || mode === 'redirect') bewerkBandId = (history.state && history.state.band) || null;
  // TT-385 fase 4: een andere view, of de onderbalk naar Bands, sluit de
  // bandwizard zonder opslaan, net als een open tegel. Zijn stap blijft in de
  // geschiedenis staan en opent later gewoon Mijn Bands.
  if (bandWizardOpen()) { resetBandForm(); zetBandWizardZichtbaar(false); }
  // TT-548 (P0, besluit Ronald 01-11-2026): een tik op een tabblad laat ook geen
  // open gesprek achter, net als een tegel en de bandwizard hierboven. Anders
  // sluit de eerste terugdruk elders eerst dat gesprek, dat niet in beeld is,
  // en lijkt de tik niets te doen. Terug, een omleiding en "Bericht sturen"
  // ('behoud') houden het gesprek open.
  if (activeConversationId && !['pop', 'redirect', 'behoud'].includes(mode)
      && (TAB_VIEWS.includes(view) || view === 'landing' || view === hoogsteScherm())) {
    gesprekVanuit = null;
    closeConversation(true);
  }
  sluitAlleMenus();
  sluitOpruimModals(); // TT-264: een view-wissel laat nooit een spelende video achter
  // TT-517 fase 9: waar de vorige view stond, voor de overgang naar of van een profiel.
  const oudEl = document.querySelector('.app-view.active');
  const oudVak = oudEl ? oudEl.getBoundingClientRect() : null;
  const oudKind = oudEl && oudEl.firstElementChild ? oudEl.firstElementChild.getBoundingClientRect().top : 0;
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-btn').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });

  const el = document.getElementById(`view-${view}`);
  if (el) el.classList.add('active');
  zetKopTitel(); // TT-517 fase 3: meteen de goede kop, niet pas een beeld later

  const navMap = {
    landing: null, search: 'navSearch',
    about: null, register: null, myprofile: 'navMyProfile', bands: 'navMyBands',
    messages: 'navMessages', auth: 'navLogin', reset: null,
    privacy: null, terms: null, gedragscode: null, profieltegels: null, instellingen: null,
    profiel: null
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
  if (bottomNavEl) bottomNavEl.style.display = (view === 'landing' || view === 'register' || view === 'profieltegels' || view === 'toestemming') ? 'none' : '';
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

  // Bij een wissel tussen twee tabbladen blijft de vorige inhoud staan tot de nieuwe er is (geen "Laden..." in beeld).
  // Komt het scherm uit een bewerkscherm of profiel, dan laadt het opnieuw: er kan iets gewijzigd zijn.
  const tabWissel = TAB_VIEWS.includes(vorigeView);
  if (view === 'myprofile') loadMyProfile({ behoud: tabWissel });
  if (view === 'bands') loadMyBands({ behoud: tabWissel });
  if (view === 'instellingen') laadInstellingen(); // TT-437
  // TT-410b: terug van een profiel naar Zoeken laat de resultaten staan. Zoeken
  // laadt bij het openen opnieuw (TT-10); met het profiel als scherm zou elke
  // stap terug de lijst verversen en de plek kwijtraken.
  // TT-520: een tik op Zoeken (of een ander bezoek dat geen stap terug is)
  // begint op het startscherm, de bovenkant van het tabblad. Een stap terug
  // laat het scherm staan waar je was (Muzikanten met zijn resultaat).
  // Verversen ('redirect' vanuit appInit) zet het scherm daarna terug met
  // herstelZoekStand(); het startscherm mag die stand niet eerst overschrijven.
  if (view === 'search' && mode !== 'pop' && mode !== 'redirect') zetZoekScherm('start');
  if (view === 'search' && !(mode === 'pop' && vorigeView === 'profiel')) configureSearchAccess();
  // TT-410b: terug van een profiel naar een open gesprek laat het gesprek
  // staan; de inbox laadt alleen als er geen gesprek open was.
  if (view === 'messages') {
    const draadOpen = document.getElementById('messagesThreadPanel')?.style.display !== 'none' && activeConversationId;
    if (!(mode === 'pop' && draadOpen)) loadInbox({ behoud: TAB_VIEWS.includes(vorigeView) });
  }
  if (view === 'profiel') {
    profielLaadBelofte = profielSoort === 'band'
      ? laadBandScherm(profielId, !profielVanApp)
      : laadProfielScherm(profielId, !profielVanApp);
  }
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
    // TT-385 fase 3: de stap van Bandprofiel bewerken onthoudt welke band.
    // TT-410b: de stap van een profiel onthoudt het id en of het in de app is geopend.
    const stap = (view === 'profieltegels' && bewerkBandId) ? { view, band: bewerkBandId }
      : (view === 'profiel') ? (profielSoort === 'band'
          ? { view, id: profielId, app: profielVanApp, soort: 'band' }
          : { view, id: profielId, app: profielVanApp })
      : { view };
    const hashDeel = (view === 'profiel' && profielId)
      ? '#' + (profielSoort === 'band' ? 'band' : 'profiel') + '/' + profielId : null;
    const naarHash = hashDeel || hash;
    // TT-431: het scherm waar je vandaan komt, gaat op de stapel (behalve bij
    // een omleiding, of als je op de bovenkant van een tabblad uitkomt).
    if (mode !== 'redirect') {
      const doelIsTop = TAB_VIEWS.includes(view) || view === 'landing' || view === hoogsteScherm();
      if (doelIsTop && mode !== 'behoud') navStack.length = 0;
      else if (!(vorigeView === view && location.hash === naarHash)) {
        navStack.push({ state: history.state && history.state.view ? history.state : { view: vorigeView }, hash: location.hash || ('#' + vorigeView) });
      }
    }
    // De vaste stap van de app krijgt het nieuwe scherm; er komt geen stap bij.
    safeHistoryReplace(stap, naarHash);
    stapNu = stap; hashNu = naarHash;
  } else {
    stapNu = history.state && history.state.view ? history.state : { view }; hashNu = location.hash || ('#' + view);
  }
  werkTerugKnopBij(); // TT-301
  landingBijwerken(); // TT-61: de foto's wisselen alleen op de landingspagina

  // TT-404: een stap terug komt uit waar je was; elke andere navigatie begint bovenaan.
  if (mode === 'pop') window.scrollTo({ top: viewScrollStand[view] || 0, behavior: 'instant' });
  // TT-393: meteen bovenaan, niet vloeiend. Een vloeiende scroll bleef op de telefoon
  // halverwege hangen als de inhoud van het scherm net wisselde (Berichten).
  else window.scrollTo({ top: 0, behavior: 'instant' });
  schuifProfiel(vorigeView, view, mode, oudEl, oudVak, oudKind); // TT-517 fase 9
  // TT-142 (25-08-2026): geen automatische focus meer bij het openen van een
  // view. Was bedoeld als gemak (TT-37), maar opende ongevraagd het
  // toetsenbord en verstoorde daarmee de "bovenaan beginnen"-scroll — de
  // gebruiker moet zelf op een veld tikken voordat het toetsenbord komt.
  // autofocusFirstField() is op 16-09-2026 verwijderd als dode code.
}

// ─── Leven bij een tik: naar een profiel (TT-517 fase 9, huisstijl §23, besluit Ronald 2A) ───
// Het profiel schuift in 0,32 s van rechts over de lijst; de lijst schuift 30%
// mee naar links en wordt iets donkerder. Terug: andersom. Kop en onderbalk
// staan stil (ze liggen boven de views). Er wordt nergens op gewacht: de
// nieuwe view staat al klaar en vult zich zoals altijd; alleen het beeld
// beweegt. De vorige view blijft daarvoor 0,32 s staan, vast op de plek waar
// hij stond (.view-weg), en vangt geen tik meer. Geen overgang bij een
// omleiding ('redirect', bijv. het openen van een link), van profiel naar
// profiel, of met "minder beweging" op het toestel: dan wisselt het scherm in
// één keer, zoals voorheen. Werkt met Web Animations; een toestel zonder
// wisselt ook in één keer.
const SCHUIF_MS = 320, SCHUIF_KROMME = 'cubic-bezier(.2, .8, .2, 1)';
var schuifKlaar = null; // var: showView kan al lopen voordat deze regel is gelezen
function stopSchuif() { if (schuifKlaar) schuifKlaar(); }
function schuifProfiel(vorigeView, view, mode, oudEl, oudVak, oudKind) {
  const heen = view === 'profiel' && vorigeView !== 'profiel';
  const terug = vorigeView === 'profiel' && view !== 'profiel';
  if ((!heen && !terug) || mode === 'redirect' || !magBewegen() || !oudEl || !oudVak) return;
  const nieuwEl = document.getElementById(`view-${view}`);
  if (!nieuwEl || nieuwEl === oudEl || !nieuwEl.animate) return;
  const profiel = heen ? nieuwEl : oudEl, lijst = heen ? oudEl : nieuwEl;
  // Vast op zijn plek. Een view met een bovenmarge in zijn eerste regel (de hoes
  // staat 8px onder de kop) houdt die marge vast gezet binnen zich, waar hij hem
  // eerst naar buiten doorgaf: meet de inhoud en zet die terug waar hij stond
  // (oudKind: de bovenkant van de eerste regel, gemeten vóór de wissel).
  oudEl.classList.add('view-weg');
  Object.assign(oudEl.style, { top: oudVak.top + 'px', left: oudVak.left + 'px', width: oudVak.width + 'px' });
  const kind = oudEl.firstElementChild;
  if (kind) oudEl.style.top = (oudVak.top - (kind.getBoundingClientRect().top - oudKind)) + 'px';
  nieuwEl.classList.add('view-erin');
  profiel.classList.add('view-profiel-schuift');
  const opties = { duration: SCHUIF_MS, easing: SCHUIF_KROMME };
  const lijstUit = [{ transform: 'none', filter: 'none' }, { transform: 'translateX(-30%)', filter: 'brightness(.8)' }];
  const profielIn = [{ transform: 'translateX(100%)' }, { transform: 'none' }];
  // De vaste view valt buiten de knip van #appRoot. Op een computer (de app als
  // kolom in het midden) zou hij naast die kolom zichtbaar worden; het knipvlak
  // schuift daarom precies tegen de beweging in, zodat alleen het deel binnen
  // zijn eigen kolom te zien is. De schaduw links van het profiel blijft zichtbaar.
  if (heen) { lijstUit[0].clipPath = 'inset(0 0 0 0)'; lijstUit[1].clipPath = 'inset(0 0 0 30%)'; }
  else { profielIn[0].clipPath = 'inset(0 100% 0 -24px)'; profielIn[1].clipPath = 'inset(0 0 0 -24px)'; }
  const animaties = [
    profiel.animate(heen ? profielIn : [...profielIn].reverse(), opties),
    lijst.animate(heen ? lijstUit : [...lijstUit].reverse(), opties)
  ];
  let vangnet = 0;
  const klaar = () => {
    if (schuifKlaar !== klaar) return;
    schuifKlaar = null;
    clearTimeout(vangnet);
    animaties.forEach(a => a.cancel());
    oudEl.classList.remove('view-weg');
    oudEl.style.top = oudEl.style.left = oudEl.style.width = '';
    nieuwEl.classList.remove('view-erin');
    profiel.classList.remove('view-profiel-schuift');
  };
  schuifKlaar = klaar;
  animaties[0].finished.then(klaar, klaar);
  // 8D (01-11-2026): tekent de browser niet (een venster dat niet in beeld is),
  // dan loopt de beweging niet en komt "klaar" nooit; de vorige view bleef dan
  // staan. Zelfde soort fout als decode() bij de kaart (fase 8). Een timer ruimt
  // daarom altijd op, ruim na het einde van de beweging (zoals het keuzemenu).
  vangnet = setTimeout(klaar, SCHUIF_MS + 80);
}

// ─── De landingspagina (TT-61, 30-09-2026, besluiten Ronald) ────────────────
// Richting F uit de landingsproef: "Zoek een <woord>" (zonder punt, Ronald
// 30-09-2026), de regel waarvoor en de
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
  { woord: 'toetsenist', waarvoor: 'Voor jazz, soul of iets heel anders.' },
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
  landingFotoLaden(landingStand); // al geladen als hij de vorige keer "de volgende" was
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
// Zet ook de kop op de foto. De onderbalk staat niet op de landingspagina,
// dus het scherm past precies in de hoogte van het venster.
// Beweging mag, tenzij de gebruiker op zijn toestel minder beweging vraagt
// (prefers-reduced-motion). Was veegMagBewegen() bij het vegen tussen de
// zoektabbladen (TT-368); dat vegen is in TT-520 vervallen.
function magBewegen() {
  return !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function landingBijwerken() {
  const view = document.getElementById('view-landing');
  const actief = !!view && view.classList.contains('active');
  document.getElementById('appRoot')?.classList.toggle('landing-op-foto', actief);
  document.body.classList.toggle('landing-op-foto', actief); // geen ruimte voor de onderbalk onder body
  if (actief) {
    // 06-10-2026 (bevinding Ronald): de onderbalk staat niet op de landing-
    // pagina (showView() verbergt hem), dus het scherm is de hele hoogte.
    document.documentElement.style.setProperty('--onderbalk-hoogte', '0px');
    // Ook bij het opstarten: de landingspagina staat dan al actief in
    // index.html, zonder dat showView() eerst draait.
    const onderbalk = document.getElementById('appBottomNav');
    if (onderbalk) onderbalk.style.display = 'none';
    landingOpbouwen();
  }
  const lopen = actief && !document.hidden && magBewegen();
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

// ─── De titel in de kop (TT-517 fase 3, 01-11-2026, besluiten Ronald) ─────
// De kop toont de naam van het scherm. Twee uitzonderingen: het profiel van een
// andere muzikant of een band toont diens naam (die blijft ook groot op het
// profiel), en het woordmerk staat op de landingspagina en op de
// goedkeuringspagina (view-toestemming: een ouder komt uit de mail en kent de
// app niet, besluit Ronald O1; dezelfde view toont de uitkomst van een
// bevestigingslink).
// De tekst staat op één plek: de .scherm-titel in het scherm zelf (voor het oog
// verborgen, styles.css), of data-kop op de view als het scherm geen eigen titel
// toont (Mijn profiel, een open gesprek: "Berichten"). Welke titel zichtbaar is,
// wisselt op veel plekken (wizardstap, tegelscherm, zoekscherm, gesprek); één
// waarnemer is betrouwbaarder dan een aanroep op elk van die plekken, zelfde
// afweging als bewaakModals() hierboven.
const KOP_WOORDMERK_VIEWS = ['view-landing', 'view-toestemming'];
function kopTitelTekst() {
  const view = document.querySelector('.app-view.active');
  if (!view || KOP_WOORDMERK_VIEWS.includes(view.id)) return '';
  if (view.id === 'view-profiel') {
    return view.querySelector('#profielSchermContent .profile-name')?.textContent.trim() || '';
  }
  const bron = [...view.querySelectorAll('.scherm-titel')]
    .find(el => el.offsetParent !== null && el.textContent.trim());
  return bron ? bron.textContent.trim() : (view.dataset.kop || '');
}
function zetKopTitel() {
  const kop = document.getElementById('kopTitel');
  if (!kop) return;
  const view = document.querySelector('.app-view.active');
  const woordmerk = !!view && KOP_WOORDMERK_VIEWS.includes(view.id);
  const root = document.getElementById('appRoot');
  if (root && root.classList.contains('kop-woordmerk') !== woordmerk) {
    root.classList.toggle('kop-woordmerk', woordmerk);
    if (woordmerk) fitKopLogo(document);
  }
  const tekst = kopTitelTekst();
  if (kop.textContent === tekst) return;
  kop.textContent = tekst;
  fitKopTitel();
}
(function bewaakKopTitel() {
  const root = document.getElementById('appRoot');
  if (!root) return;
  let gepland = false;
  const plan = () => {
    if (gepland) return;
    gepland = true;
    requestAnimationFrame(() => { gepland = false; zetKopTitel(); });
  };
  // Pas beginnen als alle scripts geladen zijn: zetKopTitel() gebruikt
  // fitKopTitel() en fitKopLogo() uit utils.js.
  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(plan).observe(root, { subtree: true, childList: true,
      attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    plan();
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
  naamHermeetTimer = setTimeout(() => { fitProfileName(document); fitKopLogo(document); fitKopTitel(); }, 150);
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
  // De laatst geopende ligt bovenop (TT-229) — die sluit als eerste.
  const boven = bovensteModal(true);
  if (boven) sluitModal(boven);
});

// TT-408 (B): de laatst geopende laag ligt bovenop (TT-229) en sluit als
// eerste, voor de pijl, de terugknop van het toestel en Escape. Hier stond
// het eerste open venster in de volgorde van index.html: met twee vensters
// open sloot de terugknop het onderste.
function bovensteModal(alleenMetClose) {
  const lagen = [...document.querySelectorAll(alleenMetClose ? '.modal-overlay.visible[data-close]' : '.modal-overlay.visible')];
  if (!lagen.length) return null;
  return lagen.reduce((boven, el) =>
    (parseInt(el.style.zIndex || 0, 10) >= parseInt(boven.style.zIndex || 0, 10)) ? el : boven);
}

// Eén stap terug, voor de pijl en de toestelknop (TT-431). Eerst de lagen die
// de app zelf opent, in vaste volgorde: een venster, een gesprek, een tegelscherm,
// de bandwizard. Daarna het scherm achter je op de stapel. Vanaf de bovenkant
// van Zoeken, Berichten en Bands naar het hoogste scherm; daar gebeurt niets.
function appTerug() {
  const openModal = bovensteModal(false);
  if (openModal) {
    // TT-408 (C): een verplicht scherm (data-verplicht) sluit nooit met terug.
    if (openModal.hasAttribute('data-verplicht')) return;
    sluitModal(openModal);
    syncModalScrollLock();
    werkTerugKnopBij(); // TT-301
    return;
  }
  // V-03: een open gesprek is geen view en geen modal; terug sluit het gesprek.
  const draad = document.getElementById('messagesThreadPanel');
  if (draad && draad.style.display !== 'none' && activeConversationId) {
    // TT-410a: kwam het gesprek uit Zoeken (of een ander scherm), dan gaat terug
    // een stap verder, naar dat scherm.
    if (gesprekVanuit) {
      gesprekVanuit = null;
      closeConversation(true);
      popNavStap();
      return;
    }
    closeConversation();
    werkTerugKnopBij(); // TT-301
    return;
  }
  // TT-168-overgang: een open tegelscherm sluit eerst, terug naar het overzicht.
  if (activeTegelScreen !== 'overview') {
    // TT-302: staan er wijzigingen open, dan gebeurt er bij de eerste druk niets
    // en verschijnt de regel onder de kop. Pijl en toestelknop lopen hierlangs.
    if (tegelHeeftWijzigingen() && !terugGewapend) { wapenTerug(); return; }
    ontwapenTerug();
    openTegelOverview();
    werkTerugKnopBij(); // TT-301
    return;
  }
  // TT-385 fase 4: de korte bandwizard is een laag, zoals een tegelscherm.
  if (bandWizardOpen()) {
    if (hasUnsavedBandFormInput() && !terugGewapend) { wapenTerug(); return; }
    ontwapenTerug();
    resetBandForm();
    zetBandWizardZichtbaar(false);
    werkTerugKnopBij();
    return;
  }
  // TT-520: Muzikanten en Mix & Match liggen één stap onder het startscherm
  // van Zoeken. Terug gaat naar dat startscherm; kwam je van buiten Zoeken
  // (een open rol, TT-450), dan terug naar waar je vandaan kwam.
  if (huidigeView === 'search' && zoekScherm !== 'start') {
    zoekSchermTerug();
    werkTerugKnopBij();
    return;
  }
  // TT-450: Zoeken geopend vanaf een open rol ligt boven een ander scherm
  // (navStack is dan gevuld); daar gaat terug eerst een stap. Een tik op een
  // tabblad leegt de stapel.
  // TT-548 (besluit Ronald 05-11-2026, vervangt TT-428 voor de bovenkant):
  // het hoogste scherm is het eind; vanaf de bovenkant van Zoeken, Berichten
  // en Bands gaat terug naar het hoogste scherm, als een tik op de onderbalk.
  if (!navStack.length) {
    if (huidigeView === hoogsteScherm()) return;
    if (opTabbladBovenkant()) { showView(hoogsteScherm()); return; }
  }
  popNavStap();
}

// Haal het bovenste scherm van de stapel af en toon het. Ligt er niets
// achter (verversen, gedeelde link), dan naar het hoogste scherm.
function popNavStap(terugvalView) {
  const vorige = navStack.pop();
  if (!vorige) {
    if (huidigeView !== 'landing' && huidigeView !== 'toestemming') showView(terugvalView || hoogsteScherm(), 'redirect');
    return;
  }
  safeHistoryReplace(vorige.state, vorige.hash);
  showView(vorige.state.view, 'pop');
}

window.addEventListener('popstate', (e) => {
  // De terugval: de stap van de browser is terug op het begin. Dat is een
  // terugdruk (pijl of toestelknop). Verlaat de gebruiker hier de app (landing,
  // goedkeuringspagina)? Dan nog één stap terug in de browser. Anders zet de app
  // de vaste stap terug en gaat zelf één stap terug.
  // Een stap met state.view is een eerdere vaste stap (na een gewijzigd #-deel);
  // ook die telt als terugdruk.
  if (e.state && (e.state.tt === 'basis' || e.state.view)) {
    if (magAppVerlaten()) { history.back(); return; }
    safeHistoryPush(stapNu, hashNu);
    appTerug();
    return;
  }
  // TT-389 (01-10-2026): een stap zonder state heeft de app niet zelf gemaakt
  // — iemand wijzigde het #-deel van de link. Toon de view uit dat #-deel.
  showView(e.state && e.state.view ? e.state.view : viewUitHash(), 'redirect');
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

// ─── Leven bij een tik: indrukken (TT-517 fase 9, huisstijl §23, besluit Ronald 1A) ───
// Wat je aanraakt (een rij, kaart, tegel of knop) wordt 2% kleiner en veert
// terug. "Aanraakbaar" is de dichtstbijzijnde knop of link, anders het
// buitenste element van een rij met een handje als muisaanwijzer (cursor:
// pointer; dat erft door naar alles erin, dus de tegel zelf en niet de regel
// tekst die je raakt). Zo valt elk nieuw onderdeel er vanzelf onder, en drukt
// in een rij met een eigen knop alleen het aangeraakte deel in. Pas na 50 ms
// vinger op het scherm; begint de vinger binnen die tijd te scrollen (meer dan
// 10px, of de browser neemt het over), dan drukt er niets in. Een snelle tik
// krijgt toch een teken: even in, dan terug.
// Het werkt met de eigenschap `scale`, niet met `transform`: zo blijft een
// verschuiving die een knop al heeft (bijv. translateY(-50%)) gewoon staan.
// De animatie loopt los van de CSS (Web Animations), dus een bestaande
// `transition` op het element blijft onaangeroerd. Niet in een vlak dat je
// veegt (de hoes, het wiel, de uitsnede), niet op een uitgeschakelde knop,
// niet op een typveld, niet op iets hoger dan het halve scherm (geen rij of
// knop meer). Met "minder beweging" op het toestel: niets.
const TIK_IN_MS = 90, TIK_TERUG_MS = 220, TIK_WACHT_MS = 50, TIK_SCHAAL = '0.98';
const TIK_VEER = 'cubic-bezier(.34, 1.56, .64, 1)';
function tikDoel(doel) {
  if (!doel || !doel.closest || isTypveld(doel) || doel.tagName === 'SELECT') return null;
  if (doel.closest('.hoes-spoor, .wheel-scroll, .uitsnede-vlak')) return null;
  let el = null;
  for (let e = doel; e && e !== document.body; e = e.parentElement) {
    if (e.matches('button, a[href], [role="button"]')) { el = e; break; }
    if (getComputedStyle(e).cursor === 'pointer') el = e;
    else if (el) break;
  }
  if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return null;
  const r = el.getBoundingClientRect();
  return r.width && r.height <= window.innerHeight / 2 ? el : null;
}
(function initTikIndrukken() {
  if (!document.documentElement.animate) return; // een toestel zonder Web Animations: geen teken, verder alles gelijk
  let actief = null, ingedrukt = null, klok = 0, start = null;
  const drukIn = el => {
    ingedrukt = el.animate([{ scale: '1' }, { scale: TIK_SCHAAL }],
      { duration: TIK_IN_MS, easing: 'ease-out', fill: 'forwards' });
  };
  const laatLos = (el, veer) => {
    if (ingedrukt) { ingedrukt.cancel(); ingedrukt = null; }
    if (veer) el.animate([{ scale: TIK_SCHAAL }, { scale: '1' }], { duration: TIK_TERUG_MS, easing: TIK_VEER });
  };
  const stop = () => { // scrollen of de browser neemt het over: gewoon terug, geen veer
    clearTimeout(klok);
    if (actief) laatLos(actief, false);
    actief = null;
  };
  document.addEventListener('pointerdown', e => {
    stop();
    if (!e.isPrimary || e.button > 0 || !magBewegen()) return;
    const el = tikDoel(e.target);
    if (!el) return;
    actief = el; start = { x: e.clientX, y: e.clientY };
    klok = setTimeout(() => { if (actief === el) drukIn(el); }, TIK_WACHT_MS);
  }, { passive: true, capture: true });
  document.addEventListener('pointermove', e => {
    if (actief && (Math.abs(e.clientX - start.x) > 10 || Math.abs(e.clientY - start.y) > 10)) stop();
  }, { passive: true, capture: true });
  document.addEventListener('pointerup', () => {
    clearTimeout(klok);
    const el = actief; actief = null;
    if (!el) return;
    if (ingedrukt) { laatLos(el, true); return; }
    // Een snelle tik: even in, dan terug met dezelfde veer.
    el.animate([
      { scale: '1', easing: 'ease-out' },
      { scale: TIK_SCHAAL, easing: TIK_VEER, offset: TIK_IN_MS / (TIK_IN_MS + TIK_TERUG_MS) },
      { scale: '1' }
    ], { duration: TIK_IN_MS + TIK_TERUG_MS });
  }, { passive: true, capture: true });
  document.addEventListener('pointercancel', stop, { passive: true, capture: true });
  window.addEventListener('scroll', () => { if (actief) stop(); }, { passive: true, capture: true });
})();

// TT-517 fase 11 (besluit Ronald 01-11-2026, "2"): knoppen in een rij staan
// naast elkaar en zijn even breed (TT-228). Past de tekst van een knop dan
// niet op één regel, dan staan ze onder elkaar: de handeling boven, de knop
// met rand (Annuleren) eronder (.btn-rij-stapel in styles.css). Gemeten met
// de breedte van de tekst, niet met de hoogte van de knop: zo verandert de
// klasse de meting niet. Ook voor een rij die later in de pagina komt.
(function initKnoppenRij() {
  if (!window.ResizeObserver || !window.MutationObserver) return;
  const doek = document.createElement('canvas').getContext('2d');
  const rijen = new Set();
  const meet = rij => {
    const kn = [...rij.children].filter(k => k.classList.contains('btn') && k.offsetParent);
    let past = true;
    if (kn.length > 1) {
      const gat = parseFloat(getComputedStyle(rij).columnGap) || 0;
      const deel = (rij.clientWidth - gat * (kn.length - 1)) / kn.length;
      past = kn.every(k => {
        const cs = getComputedStyle(k);
        doek.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const rand = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
        return doek.measureText(k.textContent.trim()).width + rand <= deel;
      });
    }
    rij.classList.toggle('btn-rij-stapel', !past);
  };
  // 8D 03-11-2026: meten pas in het volgende beeld. De klasse maakt de rij
  // hoger; binnen de waarnemer gaf dat "ResizeObserver loop completed with
  // undelivered notifications" in het foutenlog (15 regels in productie sinds
  // 02-11-2026). De meting gaat over de breedte, dus de tweede melding verandert
  // niets meer.
  const kijker = new ResizeObserver(lijst => requestAnimationFrame(() => lijst.forEach(e => meet(e.target))));
  const volg = el => {
    if (el.nodeType !== 1) return;
    const nieuw = el.classList.contains('btn-row') ? [el] : [...el.getElementsByClassName('btn-row')];
    nieuw.forEach(r => { if (!rijen.has(r)) { rijen.add(r); kijker.observe(r); } });
  };
  volg(document.body);
  new MutationObserver(m => m.forEach(x => x.addedNodes.forEach(volg))).observe(document.body, { childList: true, subtree: true });
  // Inter laadt na de eerste meting; daarna opnieuw meten met de echte letter.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => rijen.forEach(meet));
})();
