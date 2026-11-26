






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
  try { document.getElementById('backendErrorOverlay').classList.add('visible'); } catch (e) { }
  try { console.error('TT-455: geen database voor dit webadres: ' + location.hostname); } catch (e) { }
}












(function zetTerugVal() {
  try {
    const st = history.state;
    if (st && st.view) return;

    history.scrollRestoration = 'manual';
    if (!(st && st.tt === 'basis')) history.replaceState({ tt: 'basis' }, '', location.href);
    history.pushState({ view: 'landing' }, '', location.href);
    history.scrollRestoration = 'manual';
  } catch (e) { }
})();

const herstelLinkBijStart = /(^#|&)type=recovery(&|$)/.test(location.hash);


const herstelLinkVerlopen = /(^#|&)error_code=otp_expired(&|$)/.test(location.hash);









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















let appErrorLogCount = 0;


function ttFoutStackMetToestel(stack) {
  let toestel = '[toestel] onbekend';
  try { toestel = '[toestel] ' + (navigator.userAgent || 'onbekend'); } catch (e) { }
  return (toestel + (stack ? '\n' + String(stack) : '')).slice(0, 4000);
}



function logAppError(message, source, stack, buitenTeller) {
  if (!db) return;
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
    }).then(() => {}, () => {});
  } catch (e) {

  }
}












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









const ttCspGemeld = new Set();
function ttCspMelden(e) {
  try {
    const bron = String(e.sourceFile || '');
    const geweigerd = String(e.blockedURI || '');
    if (/^[a-z-]*extension:/i.test(bron) || /^[a-z-]*extension:/i.test(geweigerd)) return;
    const soort = String(e.effectiveDirective || e.violatedDirective || 'onbekend');
    let wat = geweigerd || '(leeg)';
    if (/^(data|blob):/i.test(geweigerd)) wat = geweigerd.split(':')[0] + ':';
    else { try { wat = new URL(geweigerd).origin; } catch (x) { } }
    const sleutel = soort + ' ' + wat;
    if (ttCspGemeld.has(sleutel) || ttCspGemeld.size >= 10) return;
    ttCspGemeld.add(sleutel);
    console.error('Regel weigert ' + sleutel);
    let waar = '';
    try { waar = bron ? new URL(bron).pathname : ''; } catch (x) { }
    logAppError('Regel weigert ' + soort + ': ' + wat, 'csp:' + soort,
      'pagina ' + location.pathname + (waar ? '\nbron ' + waar + ':' + (e.lineNumber || 0) : ''), true);
  } catch (x) {

  }
}
(window.ttCspWeigeringen || []).forEach(ttCspMelden);

window.ttCspWeigeringen = { push: ttCspMelden };



let currentUser = null;



let myMusicianId = null;



let myMusicianIdFout = null;




let myMusicianIdVraag = null;

async function getMyMusicianId() {
  if (myMusicianId) return myMusicianId;
  if (!currentUser) { myMusicianIdFout = null; return null; }
  if (myMusicianIdVraag && myMusicianIdVraag.user === currentUser.id) return myMusicianIdVraag.p;
  myMusicianIdFout = null;
  const vraag = { user: currentUser.id };
  vraag.p = (async () => {
    try {

      const { data, error } = await db.from('musicians').select('id, city').eq('user_id', vraag.user).single();
      if (!currentUser || currentUser.id !== vraag.user) return null;

      if (error && error.code !== 'PGRST116') {
        myMusicianIdFout = error;
        logCaught('getMyMusicianId', error);
        return null;
      }
      myMusicianId = data?.id || null;
      if (myMusicianId && myOwnCity === null) myOwnCity = data.city || null;
      return myMusicianId;
    } finally {
      if (myMusicianIdVraag === vraag) myMusicianIdVraag = null;
    }
  })();
  myMusicianIdVraag = vraag;
  return vraag.p;
}


function geenProfielMelding(tekst) {
  showToast(myMusicianIdFout ? friendlyErrorMessage(myMusicianIdFout, 'je profiel laden') : tekst);
}










let emailBevestigdVoor = null;
async function emailWachtOpBevestiging() {
  if (!currentUser) return null;
  if (emailBevestigdVoor === currentUser.id) return null;
  const user = currentUser.id;
  const { data, error } = await db.from('musicians')
    .select('profile_complete, email_bevestigd_op, wacht_op_bevestiging')
    .eq('user_id', user).maybeSingle();
  if (error) { logCaught('emailWachtOpBevestiging', error); return null; }
  if (!data || data.profile_complete || data.email_bevestigd_op) {
    if (data && currentUser && currentUser.id === user) emailBevestigdVoor = user;
    return null;
  }
  return data.wacht_op_bevestiging ? 'wacht' : 'onaf';
}



function emailBevestigMelding(stand, wat) {
  return stand === 'wacht'
    ? `Bevestig eerst je e-mailadres. Tik op de knop in de mail die we je stuurden. Daarna kun je ${wat}.`
    : `Maak eerst je profiel af. Daarna kun je ${wat}.`;
}




let lastSignedInUserId = null;
















let modalLaagTeller = 200;

function initModalStapeling() {
  const pasAan = (el) => {
    if (!el.classList.contains('modal-overlay')) return;
    if (el.classList.contains('visible')) {


      if (!el.style.zIndex) el.style.zIndex = String(++modalLaagTeller);
    } else if (el.style.zIndex) {
      el.style.zIndex = '';
      if (!document.querySelector('.modal-overlay.visible')) modalLaagTeller = 200;
    }
  };
  const kijker = new MutationObserver(m => m.forEach(x => pasAan(x.target)));
  document.querySelectorAll('.modal-overlay').forEach(el => {
    kijker.observe(el, { attributes: true, attributeFilter: ['class'] });
    pasAan(el);
  });
}

const HERSTELBARE_VIEWS = ['landing', 'search', 'about', 'register', 'myprofile', 'bands', 'auth', 'privacy', 'terms', 'gedragscode', 'profieltegels', 'messages', 'instellingen'];

const AFGESCHERMDE_VIEWS = ['myprofile', 'bands', 'profieltegels', 'messages', 'instellingen'];




function viewUitHash() {
  const v = location.hash.replace('#', '');
  if (/^(profiel|band)\/./.test(v)) return 'profiel';
  if (/^prikbord(\/.+)?$/.test(v)) return 'search';
  if (!HERSTELBARE_VIEWS.includes(v)) return hoogsteScherm();
  if (AFGESCHERMDE_VIEWS.includes(v) && !currentUser) return 'auth';
  if (currentUser && ['auth', 'register'].includes(v)) return hoogsteScherm();
  return v;
}








function kiesLichtDonker(stand) {
  window.ttLichtDonkerBezoek = stand;
  try { localStorage.setItem('tt_licht_donker', stand); } catch (e) { }
  pasLichtDonkerToe();
  toonLichtDonkerKeuze();
}



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

  initChoiceField({ id: 'thema', fieldId: 'themaTegel', menuId: 'themaMenu', selectId: 'themaKeuze' });



  initChoiceField({
    id: 'status', fieldId: 'statusTegel', menuId: 'statusMenu',
    kop: STAND_KOP.muzikant,
    rijen: () => STANDEN.map(x => ({ t: x.label, u: x.uitleg.muzikant, gekozen: x.waarde === myStand })),
    kies: i => zetStatus(STANDEN[i].waarde),
    ververs: toonStatus
  });
  toonLichtDonkerKeuze();
  try {
    initModalStapeling();










    const hashView = location.hash.replace('#', '');
    const gesprekMatch = hashView.match(/^messages\/(.+)$/);

    const { data: { session } } = await db.auth.getSession();












    opstartHerstelt = !!session?.user && (herstelLinkBijStart || !!gesprekMatch ||
      /^(profiel|band|toestemming|bevestig)\//.test(hashView) || /^prikbord(\/.+)?$/.test(hashView) ||
      (HERSTELBARE_VIEWS.includes(hashView) && !['auth', 'register'].includes(hashView)));






    if (session?.user) {
      const opgeslagen = session.user;
      db.auth.getUser().then(({ data: vers }) => {
        if (vers?.user && vers.user.id === opgeslagen.id && currentUser && currentUser.id === opgeslagen.id) {
          const anders = (vers.user.email || '') !== (currentUser.email || '');
          currentUser = vers.user;
          if (anders) verversEmailWeergave(currentUser.email || '');
        }
      }).catch(e => logCaught('appInit.getUser', e));
    }
    if (session?.user) {
      currentUser = session.user;
      lastSignedInUserId = session.user.id;
      onUserLoggedIn(session.user);
    }



    if (herstelLinkBijStart && session?.user) showView('reset', 'redirect');























    db.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {

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




        currentUser = session.user;
        verversEmailWeergave(currentUser.email || '');
      }
    });







    const knownHashViews = HERSTELBARE_VIEWS;
    const gatedHashViews = AFGESCHERMDE_VIEWS;








    const profielMatch = hashView.match(/^profiel\/(.+)$/);
    const bandMatch = hashView.match(/^band\/(.+)$/);




    const toestemmingMatch = hashView.match(/^toestemming\/(.+)$/);


    const bevestigMatch = hashView.match(/^bevestig\/(.+)$/);
    const prikbordMatch = hashView.match(/^prikbord(?:\/(.+))?$/);
    if (herstelLinkVerlopen) {

      try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) { }
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

      toestemmingGegevenOpenen();
    } else if (profielMatch || bandMatch) {







      const st = history.state;
      const doelSoort = bandMatch ? 'band' : 'muzikant';
      const doelId = decodeURIComponent((profielMatch || bandMatch)[1]);
      const zelfdeStap = !!(st && st.view === 'profiel' && st.id === doelId &&
        (st.soort === 'band') === (doelSoort === 'band'));
      if (!zelfdeStap) showView('search');
      if (currentUser) await configureSearchAccess();
      const open = doelSoort === 'band' ? openBandScherm : openProfielScherm;
      if (zelfdeStap) open(doelId, { redirect: true });
      else open(doelId);
    } else if (prikbordMatch) {
      showView('search', 'redirect');
      if (currentUser) await configureSearchAccess();
      await pbOpenVanLink(prikbordMatch[1] ? decodeURIComponent(prikbordMatch[1]) : null);
    } else if (gesprekMatch) {



      if (!currentUser) showView('auth', 'redirect');
      else {
        inboxOverslaan = true;
        try { showView('messages', 'redirect'); } finally { inboxOverslaan = false; }
        heropenGesprek(decodeURIComponent(gesprekMatch[1]));
      }
    } else if (knownHashViews.includes(hashView)) {

      if (gatedHashViews.includes(hashView) && !currentUser) showView('auth', 'redirect');
      else showView(hashView, 'redirect');
      if (hashView === 'search') herstelZoekStand();
    }
  } catch(e) {
    logCaught('appInit', e);
  }



  navStack.length = 0;
  werkTerugKnopBij();




  fitKopLogo(document);
  if (document.fonts?.ready) document.fonts.ready.then(() => { fitKopLogo(document); fitKopTitel(); });
}






let onboardingInFlight = false;





let opstartHerstelt = false;







function markeerActief() {
  db.rpc('tt_markeer_actief').then(
    ({ error }) => { if (error) logCaught('markeerActief', error); },
    (e) => logCaught('markeerActief', e));
}

async function onUserLoggedIn(user) {


  const paginaHersteld = opstartHerstelt;
  opstartHerstelt = false;


  document.getElementById('navLogout').style.display = '';

  document.getElementById('navSettings').style.display = '';

  document.getElementById('navMenuLogin').style.display = 'none';
  refreshUnreadBadge();
  markeerActief();

  if (onboardingInFlight) return;










  hasOwnProfile = !!(await getMyMusicianId());
  if (hasOwnProfile) ouderKoppelingHerhalen(user);
  if (hasOwnProfile) ttToestelMelden();


  if (hasOwnProfile && typeof pbTegelGetal === 'function') pbTegelGetal();






  const blokkadesKlaar = laadBlokkades();






  if (pendingMessageRecipient) {
    await blokkadesKlaar;
    const mid = await getMyMusicianId();
    if (mid) {
      const recipient = pendingMessageRecipient;
      pendingMessageRecipient = null;
      showView('search');
      openMessageComposer(recipient.id, recipient.displayName);
      return;
    }
  }


  const waar = naInloggen;
  naInloggen = null;
  if (waar && hasOwnProfile) naInloggenOpenen(waar);
  else if (!paginaHersteld) showView('myprofile');





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

  const navLogoutBtn = document.getElementById('navLogout');
  if (navLogoutBtn) navLogoutBtn.style.display = 'none';

  const navSettingsBtn = document.getElementById('navSettings');
  if (navSettingsBtn) navSettingsBtn.style.display = 'none';
  const navMenuLoginBtn = document.getElementById('navMenuLogin');
  if (navMenuLoginBtn) navMenuLoginBtn.style.display = '';
  myMusicianId = null;
  myMusicianIdVraag = null;
  emailBevestigdVoor = null;
  myOwnCity = null;
  instellingenDigest = { mid: null, waarde: null };
  instellingenNaam = { mid: null, naam: '' };
  tegelVoorraadWissen();




  hasOwnProfile = false;
  wisBlokkades();
  wisBewaardeZoek();

  if (typeof pbAllesWissen === 'function') pbAllesWissen();
  clearOnboardingProgress();
  pendingMessageRecipient = null;
  naInloggen = null;
  usernameGateMid = null;
  postcodeFailStreak = 0;
  postcodeManualMode = false;


  wizardLeegmaken();
  const ongelezen = document.getElementById('unreadBadgeBottom');
  if (ongelezen) ongelezen.style.display = 'none';
  showView('landing');
}

















function menuLaagOpen(dd) {
  menuLaagWeg();
  const laag = document.createElement('div');
  laag.className = 'menu-laag';
  laag.addEventListener('click', (e) => { e.stopPropagation(); sluitAlleMenus(); });
  dd.parentNode.insertBefore(laag, dd);













  for (let x = dd.parentElement; x && x !== document.body; x = x.parentElement) {
    if (x.classList.contains('modal-overlay')) break;
    const st = getComputedStyle(x);
    if (/auto|scroll/.test(st.overflowY) && x.scrollHeight > x.clientHeight) x.classList.add('menu-scroll-vast');
    if (st.zIndex !== 'auto') x.classList.add(x.tagName === 'MAIN' ? 'menu-drager-plat' : 'menu-drager');
  }
  syncModalScrollLock();
}
function menuLaagWeg() {
  document.querySelectorAll('.menu-laag').forEach(l => l.remove());
  document.querySelectorAll('.menu-drager, .menu-drager-plat').forEach(x => x.classList.remove('menu-drager', 'menu-drager-plat'));
  document.querySelectorAll('.menu-scroll-vast').forEach(x => x.classList.remove('menu-scroll-vast'));
  syncModalScrollLock();
}
function sluitAlleMenus() {
  closeNavMenu();
  closeAllBandMoreMenus();
  if (typeof sluitVeiligheidMenus === 'function') sluitVeiligheidMenus();
  if (typeof closeChoiceMenu === 'function') closeChoiceMenu();
  menuLaagWeg();
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sluitAlleMenus(); });



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
  zetNavMap(false);
  menuLaagWeg();
}


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




const BAND_MENU_PLEKKEN = ['#myBandsList', '#profielSchermContent', '#view-profieltegels'];
function closeAllBandMoreMenus() {
  const open = document.querySelectorAll(BAND_MENU_PLEKKEN.map(p => `${p} .inline-menu-dropdown.visible`).join(', '));
  if (!open.length) return;
  open.forEach(dd => dd.classList.remove('visible'));
  document.querySelectorAll(BAND_MENU_PLEKKEN.map(p => `${p} .profile-actions-menu-wrap .nav-menu-btn.active`).join(', '))
    .forEach(b => b.classList.remove('active'));
  menuLaagWeg();
}













let meldingenVolg = 0;
let meldingenGetikt = false;
async function openSearchPrefsModal() {
  const volg = ++meldingenVolg;
  meldingenGetikt = false;
  const bekend = instellingenDigest.mid && instellingenDigest.mid === myMusicianId ? instellingenDigest.waarde : null;
  selectDigestFrequency(bekend);
  document.getElementById('searchPrefsModal').classList.add('visible');
  vulBewaardeZoekInInstellingen();
  vulPushInInstellingen();
  const mid = await getMyMusicianId();




  if (!mid) {
    closeSearchPrefsModal();
    if (myMusicianIdFout) showToast(friendlyErrorMessage(myMusicianIdFout, 'je profiel laden'));
    return;
  }
  try {



    const musicianRes = await db.from('musicians')
      .select('email_digest_frequency, oproepen_melden').eq('id', mid).single();
    if (musicianRes.error) throw musicianRes.error;
    if (volg === meldingenVolg) pbOproepenTonen(musicianRes.data?.oproepen_melden !== false);
    const waarde = musicianRes.data?.email_digest_frequency || 'daily';
    instellingenDigest = { mid, waarde };
    if (volg === meldingenVolg && !meldingenGetikt) selectDigestFrequency(waarde);
  } catch (e) {
    logCaught('openSearchPrefsModal', e);
    if (volg === meldingenVolg && !meldingenGetikt) showToast(friendlyErrorMessage(e, 'je meldingen laden'));
  }
}
function closeSearchPrefsModal() {
  document.getElementById('searchPrefsModal').classList.remove('visible');
}






function selectDigestFrequency(value) {
  digestFrequencyValue = value;
  document.querySelectorAll('#digestFrequencyControl .segmented-btn').forEach(btn => {
    btn.classList.toggle('selected', btn.dataset.mode === value);
  });
}
async function setDigestFrequency(el, mode) {
  const oud = digestFrequencyValue;
  if (mode === oud) return;
  meldingenGetikt = true;
  selectDigestFrequency(mode);
  try {
    const mid = await getMyMusicianId();
    if (!mid) throw new Error('geen profiel');
    const { error } = rijenGeraakt(await db.from('musicians').update({ email_digest_frequency: mode }).eq('id', mid).select('id'));
    if (error) throw error;
    instellingenDigest = { mid, waarde: mode };
  } catch (e) {
    logCaught('setDigestFrequency', e);
    selectDigestFrequency(oud);
    showToast(friendlyErrorMessage(e, 'je e-mailvoorkeur opslaan'));
  }
}

function navLoginClick() {
  if (currentUser) { signOut(); } else { showView('auth'); }
}



function requireLogin(view) {
  if (!currentUser) {
    showView('auth');
    return;
  }
  showView(view);
}






let hasOwnProfile = false;

let myOwnCity = null;
async function getMyCity() {
  if (myOwnCity) return myOwnCity;
  const mid = await getMyMusicianId();
  if (!mid) return null;
  const { data, error } = await db.from('musicians').select('city').eq('id', mid).maybeSingle();
  if (error) { logCaught('getMyCity', error); return null; }
  myOwnCity = data?.city || null;
  return myOwnCity;
}

async function configureSearchAccess() {


  const rolMelding = document.getElementById('zoekRolMelding');
  if (rolMelding) rolMelding.hidden = true;
  zoekRolBand = null;


  const zoekNr = musicianSearchSeq;
  const mid = await getMyMusicianId();
  hasOwnProfile = !!mid;
  await laadBlokkadesIndienNodig();




  syncViewToggles();











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



  if (zoekScherm === 'muzikanten') { if (musicianSearchSeq === zoekNr) runSearch(); }
  else if (zoekScherm === 'mixmatch') setlistZoekVerversen();
}





function selectSortModeByValue(gridId, value) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  grid.value = value;
  if (gridId === 'filterSortMode') searchSortMode = value;
}











function safeHistoryPush(stateObj, hash) {
  try { history.pushState(stateObj, '', hash); history.scrollRestoration = 'manual'; return true; } catch (e) { return false; }
}
function safeHistoryReplace(stateObj, hash) {
  try { history.replaceState(stateObj, '', hash); } catch (e) { }
}















const navStack = [];



let huidigeView = 'landing';

let stapNu = { view: 'landing' };
let hashNu = location.hash || '#landing';



try { history.scrollRestoration = 'manual'; } catch (e) { }
const viewScrollStand = {};







function hoogsteScherm() {
  return currentUser ? 'myprofile' : 'landing';
}
function naarHoogsteScherm() {
  showView(hoogsteScherm());
}







const TAB_VIEWS = ['search', 'messages', 'bands', 'myprofile'];
function opTabbladBovenkant() {
  return TAB_VIEWS.includes(huidigeView) || huidigeView === hoogsteScherm();
}




function heeftTerugLaag() {
  if (document.querySelector('.modal-overlay.visible')) return true;
  const draad = document.getElementById('messagesThreadPanel');
  if (draad && draad.style.display !== 'none' && activeConversationId) return true;
  if (activeTegelScreen !== 'overview') return true;
  if (bandWizardOpen()) return true;
  if (huidigeView === 'search' && zoekScherm !== 'start') return true;
  return false;
}


function magAppVerlaten() {
  return !heeftTerugLaag() && (huidigeView === 'toestemming' || (huidigeView === 'landing' && !currentUser));
}
function magTerug() {
  if (heeftTerugLaag()) return true;



  if (huidigeView === hoogsteScherm() && !navStack.length) return false;
  return huidigeView !== 'toestemming';
}





function werkTerugKnopBij() {
  const btn = document.getElementById('navTerugBtn');





  if (btn) btn.style.visibility = (huidigeView !== 'toestemming' && huidigeView !== 'landing' && huidigeView !== hoogsteScherm()) ? '' : 'hidden';
}

function terugKnop() {
  if (!magTerug()) return;
  appTerug();
}







function vraagOpslaanBijTerug(kop, opslaanLabel, nietLabel, opslaan, nietOpslaan) {
  showConfirm('Je wijzigingen zijn nog niet opgeslagen.', opslaan, opslaanLabel, false, nietLabel, kop, nietOpslaan);
}






let naInloggen = null;
function showView(view, mode, extra) {
  if (naInloggen && !currentUser && view !== 'auth') naInloggen = null;
  stopSchuif();

  if (huidigeView && huidigeView !== view) viewScrollStand[huidigeView] = window.scrollY;
  const vorigeView = huidigeView;
  huidigeView = view;




  let profielId = null, profielSoort = 'muzikant';
  if (view === 'profiel') {
    const hashMatch = location.hash.match(/^#(profiel|band)\/(.+)$/) || [];
    profielSoort = extra ? (extra.soort === 'band' ? 'band' : 'muzikant')
      : (mode === 'pop' && history.state && history.state.soort === 'band') ? 'band'
      : hashMatch[1] === 'band' ? 'band' : 'muzikant';
    profielId = (extra && extra.id) || (mode === 'pop' && history.state && history.state.id)
      || (hashMatch[2] ? decodeURIComponent(hashMatch[2]) : null);
  }





  const vorigeTegel = activeTegelScreen;
  if (view !== 'profieltegels') { bewerkBandId = null; activeTegelScreen = 'overview'; }

  if (view !== 'profieltegels' || huidigeView !== 'profieltegels') tegelVoorraadWissen();
  else if (mode === 'pop' || mode === 'redirect') bewerkBandId = (history.state && history.state.band) || null;



  if (bandWizardOpen()) { resetBandForm(); zetBandWizardZichtbaar(false); }





  if (activeConversationId && !['pop', 'redirect', 'behoud'].includes(mode)
      && (TAB_VIEWS.includes(view) || view === 'landing' || view === hoogsteScherm())) {
    gesprekVanuit = null;
    closeConversation(true);
  }
  sluitAlleMenus();
  sluitOpruimModals();

  const oudEl = document.querySelector('.app-view.active');
  const oudVak = oudEl ? oudEl.getBoundingClientRect() : null;
  const oudKind = oudEl && oudEl.firstElementChild ? oudEl.firstElementChild.getBoundingClientRect().top : 0;
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.bottom-nav-btn').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });

  const el = document.getElementById(`view-${view}`);
  if (el) el.classList.add('active');
  zetKopTitel();


  const bottomNavMap = {
    search: 'bottomNavSearch', messages: 'bottomNavMessages',
    bands: 'bottomNavBands', myprofile: 'bottomNavProfile'
  };
  if (bottomNavMap[view]) {
    const bEl = document.getElementById(bottomNavMap[view]);
    if (bEl) { bEl.classList.add('active'); bEl.setAttribute('aria-current', 'page'); }
  }


















  const bottomNavEl = document.getElementById('appBottomNav');
  if (bottomNavEl) bottomNavEl.style.display = ['landing', 'register', 'profieltegels', 'toestemming', 'auth', 'reset'].includes(view) ? 'none' : '';
  onderbalkHoogteZetten();


  if (view === 'reset') {
    const gebruikersnaam = document.getElementById('resetGebruikersnaam');
    if (gebruikersnaam) gebruikersnaam.value = currentUser?.email || '';
  }
  const menuKnop = document.getElementById('navMenuBtn');
  if (menuKnop) menuKnop.style.display = (view === 'toestemming') ? 'none' : '';

  if (view === 'register') {
    if (currentUser && myMusicianId) { showView('myprofile', 'redirect'); return; }




    const ingelogd = !!currentUser;
    const regEmailField = document.getElementById('regEmail');
    const regPasswordField = document.getElementById('regPasswordField');
    const regEmailReq = document.getElementById('regEmailReq');
    if (regPasswordField) regPasswordField.style.display = ingelogd ? 'none' : '';
    if (regEmailField) {
      regEmailField.readOnly = ingelogd;
      regEmailField.style.cursor = ingelogd ? 'not-allowed' : '';
      regEmailField.style.opacity = ingelogd ? '0.85' : '';
      if (ingelogd) regEmailField.value = currentUser.email || '';
    }
    if (regEmailReq) regEmailReq.style.display = ingelogd ? 'none' : '';







    updateSubmitProfileState();






    if (typeof hervatRegistratie === 'function') hervatRegistratie();
    wizHoesBijwerken();
  }



  const tabWissel = TAB_VIEWS.includes(vorigeView);
  if (view === 'myprofile') loadMyProfile({ behoud: tabWissel });
  if (view === 'bands') loadMyBands({ behoud: tabWissel });
  if (view === 'instellingen') laadInstellingen();








  if (view === 'search' && mode !== 'pop' && mode !== 'redirect') zetZoekScherm('start');
  if (view === 'search' && !(mode === 'pop' && vorigeView === 'profiel')) configureSearchAccess();


  if (view === 'messages') {
    const draadOpen = document.getElementById('messagesThreadPanel')?.style.display !== 'none' && activeConversationId;


    if (!(mode === 'pop' && draadOpen) && !inboxOverslaan) loadInbox({ behoud: TAB_VIEWS.includes(vorigeView) });
  }
  if (view === 'profiel') {


    const geladen = document.getElementById('profielSchermContent')?.dataset.klaar;
    const alDaar = mode === 'pop' && vorigeView === 'messages' && profielSoort !== 'band'
      && geladen === 'muzikant:' + profielId;
    if (!alDaar) profielLaadBelofte = profielSoort === 'band'
      ? laadBandScherm(profielId)
      : laadProfielScherm(profielId);
  }
  if (view === 'profieltegels') {
    if (!myMusicianId) { showToast('Je hebt nog geen profiel om te bewerken.'); showView('myprofile', 'redirect'); return; }
    openTegelOverview();

    const tegel = mode === 'pop' && history.state && history.state.tegel;
    if (tegel && TEGEL_SCREENS[tegel]) openTegelScreen(tegel);
  }










  if (mode !== 'pop') {



    const hash = (view === 'toestemming' && /^#(toestemming(\/|-gegeven$)|bevestig\/)/.test(location.hash))
      ? location.hash
      : '#' + view;


    const stap = (view === 'profieltegels' && bewerkBandId) ? { view, band: bewerkBandId }
      : (view === 'profiel') ? (profielSoort === 'band'
          ? { view, id: profielId, soort: 'band' }
          : { view, id: profielId })
      : { view };
    const hashDeel = (view === 'profiel' && profielId)
      ? '#' + (profielSoort === 'band' ? 'band' : 'profiel') + '/' + profielId : null;
    const naarHash = hashDeel || hash;


    if (mode !== 'redirect') {
      const doelIsTop = TAB_VIEWS.includes(view) || view === 'landing' || view === hoogsteScherm();
      if (doelIsTop && mode !== 'behoud') navStack.length = 0;
      else if (!(vorigeView === view && location.hash === naarHash)) {
        let terugStap = history.state && history.state.view ? history.state : { view: vorigeView };



        if (vorigeView === 'profieltegels') {
          terugStap = Object.assign({}, terugStap);
          delete terugStap.tegel;
          if (vorigeTegel !== 'overview') terugStap.tegel = vorigeTegel;
        }
        navStack.push({ state: terugStap, hash: location.hash || ('#' + vorigeView) });
      }
    }

    safeHistoryReplace(stap, naarHash);
    stapNu = stap; hashNu = naarHash;
  } else {
    stapNu = history.state && history.state.view ? history.state : { view }; hashNu = location.hash || ('#' + view);
  }
  werkTerugKnopBij();
  landingBijwerken();


  if (mode === 'pop') window.scrollTo({ top: viewScrollStand[view] || 0, behavior: 'instant' });


  else window.scrollTo({ top: 0, behavior: 'instant' });
  schuifProfiel(vorigeView, view, mode, oudEl, oudVak, oudKind);





}












const SCHUIF_MS = 320, SCHUIF_KROMME = 'cubic-bezier(.2, .8, .2, 1)';
var schuifKlaar = null;
function stopSchuif() { if (schuifKlaar) schuifKlaar(); }
function schuifProfiel(vorigeView, view, mode, oudEl, oudVak, oudKind) {
  const heen = view === 'profiel' && vorigeView !== 'profiel';
  const terug = vorigeView === 'profiel' && view !== 'profiel';
  if ((!heen && !terug) || mode === 'redirect' || !magBewegen() || !oudEl || !oudVak) return;
  const nieuwEl = document.getElementById(`view-${view}`);
  if (!nieuwEl || nieuwEl === oudEl || !nieuwEl.animate) return;
  const profiel = heen ? nieuwEl : oudEl, lijst = heen ? oudEl : nieuwEl;




  oudEl.classList.add('view-weg');
  Object.assign(oudEl.style, { top: oudVak.top + 'px', left: oudVak.left + 'px', width: oudVak.width + 'px' });
  const kind = oudEl.firstElementChild;
  if (kind) oudEl.style.top = (oudVak.top - (kind.getBoundingClientRect().top - oudKind)) + 'px';
  nieuwEl.classList.add('view-erin');
  profiel.classList.add('view-profiel-schuift');
  const opties = { duration: SCHUIF_MS, easing: SCHUIF_KROMME };
  const lijstUit = [{ transform: 'none', filter: 'none' }, { transform: 'translateX(-30%)', filter: 'brightness(.8)' }];
  const profielIn = [{ transform: 'translateX(100%)' }, { transform: 'none' }];




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




  vangnet = setTimeout(klaar, SCHUIF_MS + 80);
}










const LANDING_WOORDEN = [
  { woord: 'gitarist',   waarvoor: 'Voor een jam op zondag.' },
  { woord: 'zangeres',   waarvoor: 'Voor je eerste optreden.' },
  { woord: 'drummer',    waarvoor: 'Voor een stabiele basis van je band.' },
  { woord: 'bassist',    waarvoor: 'Om samen te oefenen.' },
  { woord: 'zanger',     waarvoor: 'Voor eigen nummers.' },
  { woord: 'band',       waarvoor: 'Voor wie nog geen band heeft.' },
  { woord: 'toetsenist', waarvoor: 'Voor jazz, soul of iets heel anders.' },
  { woord: 'violist',    waarvoor: 'Voor folk, pop of een strijker erbij.' },
  { woord: 'saxofonist', waarvoor: 'Voor een funkband met blazers.' },
  { woord: 'DJ',         waarvoor: 'Voor een set met live muzikanten.' }
];
const LANDING_TEMPO = 4000;












const LANDING_FOTO_MAP = SUPABASE_URL + '/storage/v1/object/public/landing/v2/';
let landingStand = 0;
let landingKlok = null;





let landingBeginTijd = typeof window.ttLandingBegin === 'number' ? window.ttLandingBegin : null;




let landingWacht = (() => {
  try { return !!localStorage.getItem('sb-' + new URL(SUPABASE_URL).hostname.split('.')[0] + '-auth-token'); }
  catch (e) { return false; }
})();

function landingFotoAdres(woord) {
  return LANDING_FOTO_MAP + encodeURIComponent(woord.toLowerCase()) + '.jpg';
}






function landingOpbouwen() {
  const dias = document.getElementById('landingDias');
  if (!dias || dias.children.length >= LANDING_WOORDEN.length) return;
  const al = dias.children.length;
  dias.insertAdjacentHTML('beforeend', LANDING_WOORDEN.slice(al).map(() =>
    '<div class="landing-dia"><img alt="" decoding="async"></div>').join(''));
  dias.querySelectorAll('img').forEach(img => {
    img.addEventListener('error', () => img.remove(), { once: true });
  });
  if (!al) dias.children[0].classList.add('aan');
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
  landingFotoLaden(landingStand);
  landingFotoLaden((landingStand + 1) % LANDING_WOORDEN.length);
  const nu = LANDING_WOORDEN[landingStand];
  regelEl.textContent = nu.waarvoor;

  woordEl.classList.remove('in');
  woordEl.classList.add('uit');
  setTimeout(() => {
    woordEl.textContent = nu.woord;
    woordEl.classList.remove('uit');
    woordEl.classList.add('in');
  }, 280);
}








function magBewegen() {
  return !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function landingBijwerken() {
  const view = document.getElementById('view-landing');
  const actief = !!view && view.classList.contains('active');
  document.getElementById('appRoot')?.classList.toggle('landing-op-foto', actief);
  document.body.classList.toggle('landing-op-foto', actief);
  if (actief) {




    const onderbalk = document.getElementById('appBottomNav');
    if (onderbalk) onderbalk.style.display = 'none';
    onderbalkHoogteZetten();
    if (!landingWacht) landingOpbouwen();
  }
  const lopen = actief && !landingWacht && !document.hidden && magBewegen();
  if (lopen && !landingKlok) {
    landingKlokStarten();
  } else if (!lopen && landingKlok) {
    clearTimeout(landingKlok.id);
    clearInterval(landingKlok.id);
    landingKlok = null;
  }
}



function landingKlokStarten() {
  const begin = landingBeginTijd;
  landingBeginTijd = null;
  const klok = { id: 0 };
  landingKlok = klok;
  const verder = () => {
    if (landingKlok !== klok) return;
    landingNaar(landingStand + 1);
    klok.id = setInterval(() => landingNaar(landingStand + 1), LANDING_TEMPO);
  };
  const wacht = begin === null ? LANDING_TEMPO : Math.max(0, LANDING_TEMPO - (performance.now() - begin));
  klok.id = setTimeout(() => {
    if (landingKlok !== klok) return;
    const img = document.getElementById('landingDias')?.children[(landingStand + 1) % LANDING_WOORDEN.length]?.querySelector('img');
    if (begin !== null && img && img.getAttribute('src') && !img.complete) {
      img.addEventListener('load', verder, { once: true });
      img.addEventListener('error', verder, { once: true });
    } else verder();
  }, wacht);
}
document.addEventListener('visibilitychange', landingBijwerken);






function landingNaOpstart() {
  landingWacht = false;
  if (!currentUser) landingBijwerken();
}












const VERSIE_REGEL = /^[\w.-]+\?v=[\w.-]+$/;
let versieLaatsteKeer = 0;
function geladenVersies() {
  return [...document.querySelectorAll('script[src*="?v="], link[rel="stylesheet"][href*="?v="]')]
    .map(e => e.getAttribute('src') || e.getAttribute('href'));
}
function bezigMetBewerken() {
  try {
    if (huidigeView === 'register') return true;
    if (typeof tegelHeeftWijzigingen === 'function' && tegelHeeftWijzigingen()) return true;
    if (typeof bandWizardOpen === 'function' && bandWizardOpen() && hasUnsavedBandFormInput()) return true;
    if (bovensteModal(false) || document.querySelector('.menu-laag')) return true;
    return [...document.querySelectorAll('textarea')].some(v => v.offsetParent && v.value.trim());
  } catch (e) { return true; }
}
async function controleerNieuweVersie() {
  if (document.hidden || Date.now() - versieLaatsteKeer < 60000) return;
  versieLaatsteKeer = Date.now();
  try {
    const r = await fetch('versie.txt?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const regels = (await r.text()).split('\n').map(x => x.trim()).filter(Boolean);
    if (regels.length < 5 || !regels.every(x => VERSIE_REGEL.test(x))) return;


    const oud = geladenVersies().filter(a => !regels.includes(a));
    if (!oud.length) return;


    const sleutel = oud.join(' ');
    try { if (sessionStorage.getItem('tt_versie_herladen') === sleutel) return; } catch (e) { }
    if (bezigMetBewerken()) { versieLaatsteKeer = 0; return; }
    try { sessionStorage.setItem('tt_versie_herladen', sleutel); } catch (e) { }
    window.location.reload();
  } catch (e) { }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) controleerNieuweVersie(); });










function onderbalkHoogteZetten() {
  const balk = document.getElementById('appBottomNav');
  if (!balk) return;
  document.documentElement.style.setProperty('--onderbalk-hoogte', balk.offsetHeight + 'px');
}
(function onderbalkHoogteVolgen() {
  const balk = document.getElementById('appBottomNav');
  if (!balk) return;
  onderbalkHoogteZetten();
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(onderbalkHoogteZetten).observe(balk);
})();






function syncModalScrollLock() {
  const vast = !!document.querySelector('.modal-overlay.visible, .menu-laag');
  const html = document.documentElement;


  if (!vast) html.style.scrollbarGutter = '';
  else if (document.body.style.overflow !== 'hidden') html.style.scrollbarGutter = innerWidth > html.clientWidth ? 'stable' : '';
  document.body.style.overflow = vast ? 'hidden' : '';
}
(function bewaakModals() {



  const waarnemer = new MutationObserver(() => { syncModalScrollLock(); werkTerugKnopBij(); });
  document.querySelectorAll('.modal-overlay').forEach(m => {
    waarnemer.observe(m, { attributes: true, attributeFilter: ['class'] });
  });
})();














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


  document.addEventListener('DOMContentLoaded', () => {
    new MutationObserver(plan).observe(root, { subtree: true, childList: true,
      attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    plan();
  });
})();










let naamHermeetTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(naamHermeetTimer);
  naamHermeetTimer = setTimeout(() => { fitProfileName(document); fitKopLogo(document); fitKopTitel(); }, 150);
});









function sluitModal(el) {
  if (!el) return;
  const naam = el.dataset.close;
  const fn = naam ? window[naam] : null;
  if (typeof fn === 'function') { fn(); return; }
  el.classList.remove('visible');
}




function sluitOpruimModals() {
  document.querySelectorAll('.modal-overlay.visible[data-close]').forEach(sluitModal);
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;

  const boven = bovensteModal(true);
  if (boven) sluitModal(boven);
});





function bovensteModal(alleenMetClose) {
  const lagen = [...document.querySelectorAll(alleenMetClose ? '.modal-overlay.visible[data-close]' : '.modal-overlay.visible')];
  if (!lagen.length) return null;
  return lagen.reduce((boven, el) =>
    (parseInt(el.style.zIndex || 0, 10) >= parseInt(boven.style.zIndex || 0, 10)) ? el : boven);
}





function appTerug() {





  if (document.querySelector('.menu-laag')) {
    sluitAlleMenus();
    return;
  }
  const openModal = bovensteModal(false);
  if (openModal) {

    if (openModal.hasAttribute('data-verplicht')) return;
    sluitModal(openModal);
    syncModalScrollLock();
    werkTerugKnopBij();
    return;
  }

  const draad = document.getElementById('messagesThreadPanel');
  if (draad && draad.style.display !== 'none' && activeConversationId) {


    if (gesprekVanuit) {
      gesprekVanuit = null;
      closeConversation(true);
      popNavStap();
      return;
    }
    closeConversation();
    werkTerugKnopBij();
    return;
  }

  if (activeTegelScreen !== 'overview') {


    if (tegelHeeftWijzigingen()) {
      vraagOpslaanBijTerug('Wijzigingen opslaan?', 'Opslaan', 'Niet opslaan',
        () => document.querySelector('#' + TEGEL_SCREENS[activeTegelScreen] + ' .wizard-action-bar .btn-primary')?.click(),
        () => { openTegelOverview(); werkTerugKnopBij(); });
      return;
    }
    openTegelOverview();
    werkTerugKnopBij();
    return;
  }

  if (bandWizardOpen()) {
    if (hasUnsavedBandFormInput()) {
      vraagOpslaanBijTerug('Band aanmaken?', 'Band aanmaken', 'Niet aanmaken', () => saveBand(),
        () => { resetBandForm(); zetBandWizardZichtbaar(false); werkTerugKnopBij(); });
      return;
    }
    resetBandForm();
    zetBandWizardZichtbaar(false);
    werkTerugKnopBij();
    return;
  }





  if (huidigeView === 'register') {
    const stap = [...document.querySelectorAll('.panel')].findIndex(p => p.classList.contains('active'));
    if (stap > 0) { prevStep(stap); werkTerugKnopBij(); return; }
    if (stap === 0) { prevStepFromStart(); return; }
  }



  if (huidigeView === 'search' && zoekScherm !== 'start') {
    zoekSchermTerug();
    werkTerugKnopBij();
    return;
  }






  if (!navStack.length) {
    if (huidigeView === hoogsteScherm()) return;
    if (opTabbladBovenkant()) { showView(hoogsteScherm()); return; }
  }
  popNavStap();
}



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






  if (e.state && (e.state.tt === 'basis' || e.state.view)) {
    if (magAppVerlaten()) { history.back(); return; }
    safeHistoryPush(stapNu, hashNu);
    appTerug();
    return;
  }


  showView(e.state && e.state.view ? e.state.view : viewUitHash(), 'redirect');
});





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

    setTimeout(() => {
      if (!isTypveld(document.activeElement)) document.body.classList.remove('toetsenbord-open');
    }, 0);
  });










  const vv = window.visualViewport;
  if (!vv) return;
  let volle = vv.height, laagste = vv.height;
  vv.addEventListener('resize', () => {
    const h = vv.height;
    if (!document.body.classList.contains('toetsenbord-open')) { volle = laagste = h; return; }
    if (h < laagste) { laagste = h; return; }
    if (volle - laagste > 150 && h - laagste > 120) {
      volle = laagste = h;
      if (isTypveld(document.activeElement)) document.activeElement.blur();
    }
  });
})();










function suggestieVeld(el) {
  if (!isTypveld(el)) return null;
  const veld = el.closest('.field');
  return veld && veld.querySelector('.autocomplete-list') ? veld : null;
}
function scrollOuder(el) {
  for (let x = el.parentElement; x && x !== document.body && x !== document.documentElement; x = x.parentElement) {
    const o = getComputedStyle(x).overflowY;
    if ((o === 'auto' || o === 'scroll') && x.scrollHeight > x.clientHeight) return x;
  }
  return null;
}
function veldOnderKop(el) {
  const veld = suggestieVeld(el);
  if (!veld || document.activeElement !== el) return;
  const ouder = scrollOuder(veld);
  const ruimte = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kop-ruimte')) || 20;
  let boven;
  if (ouder) boven = ouder.getBoundingClientRect().top;
  else {
    const kop = [...document.querySelectorAll('.app-topbar')].find(k => k.getClientRects().length);
    boven = kop ? Math.max(0, kop.getBoundingClientRect().bottom) : 0;
  }
  const stap = Math.round(veld.getBoundingClientRect().top - (boven + ruimte));
  if (Math.abs(stap) < 2) return;
  const beweegtNiet = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gedrag = beweegtNiet ? 'auto' : 'smooth';
  if (ouder) { ouder.scrollBy({ top: stap, behavior: gedrag }); return; }
  if (stap > 0) {
    const kanNog = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
    if (kanNog < stap) {
      document.body.style.minHeight = Math.ceil(document.documentElement.scrollHeight + stap - kanNog) + 'px';
      document.body.dataset.ttVeldRuimte = '1';
    }
  }
  window.scrollBy({ top: stap, behavior: gedrag });
}
(function initVeldOnderKop() {
  if (!window.matchMedia || !window.matchMedia('(pointer: coarse)').matches) return;
  document.addEventListener('focusin', e => {
    if (!suggestieVeld(e.target)) return;
    const el = e.target;


    setTimeout(() => veldOnderKop(el), 0);
    setTimeout(() => veldOnderKop(el), 350);
  });
  document.addEventListener('focusout', e => {
    if (!suggestieVeld(e.target) || !document.body.dataset.ttVeldRuimte) return;
    setTimeout(() => {
      if (suggestieVeld(document.activeElement)) return;
      document.body.style.minHeight = '';
      delete document.body.dataset.ttVeldRuimte;
    }, 0);
  });
})();


















const TIK_IN_MS = 90, TIK_TERUG_MS = 220, TIK_WACHT_MS = 50, TIK_SCHAAL = '0.98';
const TIK_VEER = 'cubic-bezier(.34, 1.56, .64, 1)';
function tikDoel(doel) {
  if (!doel || !doel.closest || isTypveld(doel) || doel.tagName === 'SELECT') return null;
  if (doel.closest('.hoes-spoor, .uitsnede-vlak')) return null;
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
  if (!document.documentElement.animate) return;
  let actief = null, ingedrukt = null, klok = 0, start = null;
  const drukIn = el => {
    ingedrukt = el.animate([{ scale: '1' }, { scale: TIK_SCHAAL }],
      { duration: TIK_IN_MS, easing: 'ease-out', fill: 'forwards' });
  };
  const laatLos = (el, veer) => {
    if (ingedrukt) { ingedrukt.cancel(); ingedrukt = null; }
    if (veer) el.animate([{ scale: TIK_SCHAAL }, { scale: '1' }], { duration: TIK_TERUG_MS, easing: TIK_VEER });
  };
  const stop = () => {
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

    el.animate([
      { scale: '1', easing: 'ease-out' },
      { scale: TIK_SCHAAL, easing: TIK_VEER, offset: TIK_IN_MS / (TIK_IN_MS + TIK_TERUG_MS) },
      { scale: '1' }
    ], { duration: TIK_IN_MS + TIK_TERUG_MS });
  }, { passive: true, capture: true });
  document.addEventListener('pointercancel', stop, { passive: true, capture: true });
  window.addEventListener('scroll', () => { if (actief) stop(); }, { passive: true, capture: true });
})();









(function initKnoppenRij() {
  if (!window.ResizeObserver || !window.MutationObserver) return;
  const doek = document.createElement('canvas').getContext('2d');
  const rijen = new Set();
  const meet = rij => {
    const kn = [...rij.children].filter(k => (k.classList.contains('btn') || k.classList.contains('segmented-btn')) && k.offsetParent);
    let past = true;
    if (kn.length > 1) {
      const gat = parseFloat(getComputedStyle(rij).columnGap) || 0;
      const deel = (rij.clientWidth - gat * (kn.length - 1)) / kn.length;
      past = kn.every(k => {
        const cs = getComputedStyle(k);
        doek.font = `${k.classList.contains('segmented-btn') ? 700 : cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const rand = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
        return doek.measureText(k.textContent.trim()).width + rand <= deel;
      });
    }
    rij.classList.toggle('btn-rij-stapel', !past);
  };





  const kijker = new ResizeObserver(lijst => requestAnimationFrame(() => lijst.forEach(e => meet(e.target))));
  const volg = el => {
    if (el.nodeType !== 1) return;
    const nieuw = el.matches('.btn-row, .segmented-vol') ? [el] : [...el.querySelectorAll('.btn-row, .segmented-vol')];
    nieuw.forEach(r => { if (!rijen.has(r)) { rijen.add(r); kijker.observe(r); } });
  };
  volg(document.body);
  new MutationObserver(m => m.forEach(x => x.addedNodes.forEach(volg))).observe(document.body, { childList: true, subtree: true });

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => rijen.forEach(meet));
})();
