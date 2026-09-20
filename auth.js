// ─── Authenticatie ───────────────────────────────────────────────────────────

// showAuthError() en de banners #authError / #resetError zijn op 12-09-2026
// verwijderd (TT-247, §2.10 dode code meteen weg). Elke foutmelding op deze
// schermen staat nu bij het veld waar hij over gaat; wat niet over één veld
// gaat, is een toast. De succesbanner blijft — een geslaagde handeling hoort
// niet bij één veld.
function showAuthSuccess(msg) {
  const el = document.getElementById('authSuccess');
  el.textContent = msg;
  el.classList.add('visible');
}

async function signIn() {
  const emailEl    = document.getElementById('loginEmail');
  const passwordEl = document.getElementById('loginPassword');
  const email    = emailEl.value.trim();
  const password = passwordEl.value;

  // TT-247 (12-09-2026): de fout staat bij het veld waar hij over gaat.
  // Vervangt twee eerdere vormen op dit scherm: reportValidity() van de
  // browser bij een leeg veld (TT-133, 23-08-2026) en de rode banner
  // #authError bij een verkeerd wachtwoord. Die banner gaf geen enkele
  // aanwijzing welk van de twee velden het was.
  clearFieldErrors('view-auth');
  const fouten = [];
  if (!email) {
    fouten.push([emailEl, 'Vul je e-mailadres in']);
  } else if (!emailFormaatGeldig(email)) {
    fouten.push([emailEl, 'Vul een geldig e-mailadres in, bijvoorbeeld jouw@email.nl']);
  }
  if (!password) fouten.push([passwordEl, 'Vul je wachtwoord in']);
  if (showFieldErrors(fouten)) return;

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) {
    // Een serverantwoord dat over één veld gaat, is ook een veldfout
    // (huisstijl §13.1). Supabase geeft bij een onbekend e-mailadres dezelfde
    // fout als bij een verkeerd wachtwoord — met opzet, zodat niemand kan
    // uitproberen welke adressen een account hebben. De tekst benoemt daarom
    // het wachtwoord zonder te beweren dat het e-mailadres bestaat.
    const tekst = friendlyErrorMessage(error);
    const msg = (error && error.message) ? error.message : '';
    if (/invalid login credentials|invalid_credentials|invalid grant/i.test(msg)) {
      showFieldErrors([[passwordEl, tekst]]);
    } else {
      // Alles wat niet over één veld gaat — geen netwerk, snelheidsbegrenzing,
      // verlopen sessie — blijft een systeemmelding. Zie huisstijl §13.1.
      showToast(tekst);
    }
    return;
  }
  // TT-122 (22-08-2026): e-mailadres onthouden op dit toestel, zodat het
  // veld er bij een volgend bezoek al staat — dan hoeft de eigen
  // autofill-balk van de browser niet eens te verschijnen.
  try { localStorage.setItem('tt_lastLoginEmail', email); } catch (e) { /* privénavigatie o.i.d., geen probleem */ }
  // onAuthStateChange handelt de rest af
}

// Verbeterpunt gevonden door Ronald (05-08-2026): uitloggen voelde 2-3
// seconden traag, want de app wachtte op de volledige netwerkbevestiging van
// Supabase vóórdat er iets zichtbaar veranderde. Nu werken we de UI meteen
// bij (optimistisch) en laten we de eigenlijke Supabase-aanroep op de
// achtergrond doorlopen. Als die achteraf een keer zou mislukken, is de
// lokale sessie sowieso al opgeruimd — er blijft dan geen halve/verwarrende
// staat achter (hooguit staat de gebruiker serverside iets langer "ingelogd",
// zonder dat dat in de app zichtbaar is of iets kan doen).
async function signOut() {
  currentUser = null;
  onUserLoggedOut();
  try {
    await db.auth.signOut();
  } catch (e) {
    logCaught('signOut', e);
  }
}

// ─── Gebruikersnaam (TT-38, 07-08-2026) ──────────────────────────────────────
// Ronald: gebruikersnaam i.p.v. de echte voornaam tonen in zoekresultaten/
// berichten — geeft muzikanten weer een echte identiteit (zoals BandMix),
// maar houdt de echte naam privé. Onder de 16 moet de gebruikersnaam
// verplicht afwijken van de echte voornaam (privacy-check, geen garantie —
// een creatieve variant op je eigen naam glipt er nog wel door, dat is een
// bewuste, geaccepteerde beperking, geen 100%-oplossing bestaat hier).
let usernameCheckTimeout = null;
let usernameAvailable = false; // laatst bekende status van de live-check
let usernameCheckedValue = ''; // welke waarde die status bij hoort
let usernameCheckFailed = false; // 22-08-2026 (P0-diagnose): technische fout bij de controle zelf, los van "naam is bezet"
let lastUsernameCheckError = ''; // 22-08-2026 (P0-diagnose): de echte technische tekst van die fout

// TT-78 (10-08-2026, bevinding Ronald): gebruikersnamen die op een beheerrol
// lijken, of die zich voordoen als het platform zelf, mogen niet door gewone
// muzikanten gekozen worden — voorkomt verwarring en misbruik ("Beheerder",
// "TalentTent_Support" enz.). Bevat/substring-check, niet exact — dus ook
// varianten als "SuperAdmin92" worden geblokkeerd. Los daarvan: elke naam die
// zowel "talent" als "tent" bevat wordt sowieso geblokkeerd (Ronalds expliciete
// regel), ongeacht wat daartussen staat.
//
// Deze lijst is aan te vullen zonder verdere codewijzigingen elders.
const RESERVED_USERNAME_WORDS = [
  'admin', 'administrator', 'beheer', 'beheerder',
  'moderator', 'moderatie', 'mod',
  'support', 'helpdesk', 'klantenservice',
  'systeem', 'system', 'root', 'owner', 'eigenaar',
  'official', 'officieel', 'staff', 'medewerker', 'team',
  'webmaster', 'superuser', 'developer', 'ontwikkelaar',
];

// Bevinding Ronald: de geblokkeerde namen hierboven zijn wél bedoeld voor
// hemzelf of andere TTT-medewerkers om te gebruiken. Bewust een aparte lijst
// i.p.v. een uitzondering middenin RESERVED_USERNAME_WORDS — zo blijft
// duidelijk welke namen "verboden voor iedereen" zijn en welke "gereserveerd,
// maar wel intern bruikbaar". Vul aan met de exacte gebruikersnamen (hoofd-/
// kleine letters maken niet uit) die Ronald/medewerkers daadwerkelijk gaan
// gebruiken.
const STAFF_USERNAME_EXCEPTIONS = [
  // Bijv. 'TalentTentRonald', 'TTT_Support' — nog aan te vullen.
];

function isReservedUsername(value) {
  const v = value.toLowerCase();
  if (STAFF_USERNAME_EXCEPTIONS.some(x => x.toLowerCase() === v)) return false;
  if (v.includes('talent') && v.includes('tent')) return true;
  return RESERVED_USERNAME_WORDS.some(w => v.includes(w));
}

function scheduleUsernameCheck() {
  clearTimeout(usernameCheckTimeout);
  usernameCheckTimeout = setTimeout(() => checkUsernameAvailability(), 400);
}

// Simpel formaat: 3-20 tekens, letters/cijfers/underscore — voorkomt spaties,
// leestekens die de weergave in zoekresultaten/berichten zouden verstoren.
function usernameFormatValid(u) {
  return /^[A-Za-z0-9_]{3,20}$/.test(u);
}

// Bugfix (07-08-2026, gemeld door Ronald: "opslaan lukt niet" op het
// gebruikersnaam-gate-scherm). Oorzaak: deze functie las altijd het vaste
// veld #username (het wizard-veld uit de registratiewizard), ook wanneer ze
// werd aangeroepen vanuit het gate-scherm — dat heeft een ander veld,
// #usernameGateInput. Het gate-scherm controleerde dus stilzwijgend een leeg
// veld i.p.v. wat Ronald daadwerkelijk had getypt, en faalde geruisloos.
// Nu configureerbaar: welk invoerveld, en welke id uitgesloten moet worden
// van de uniekheidscheck (editingMusicianId voor de wizard, usernameGateMid
// voor het gate-scherm — bewust twee aparte variabelen, zie toelichting bij
// usernameGateMid hieronder).
async function checkUsernameAvailability(statusElId, inputElId, excludeId) {
  const input = document.getElementById(inputElId || 'username');
  const statusEl = document.getElementById(statusElId || 'usernameStatus');
  const value = (input?.value || '').trim();
  usernameCheckedValue = value;
  usernameAvailable = false;

  if (!value) { if (statusEl) statusEl.textContent = ''; return false; }
  if (!usernameFormatValid(value)) {
    if (statusEl) { statusEl.textContent = 'Alleen letters, cijfers en underscore, 3-20 tekens.'; statusEl.style.color = 'var(--danger)'; }
    return false;
  }
  if (isReservedUsername(value)) {
    if (statusEl) { statusEl.textContent = 'Deze gebruikersnaam is niet beschikbaar. Kies een andere.'; statusEl.style.color = 'var(--danger)'; }
    return false;
  }
  // TT-249 (11-09-2026): een naam wordt op het profiel nooit afgekapt en
  // nooit afgebroken. Past hij op de ondergrens van 16px niet in de
  // profielkop van een telefoon, dan is hij te lang om te tonen. Dat wordt
  // hier tegengehouden, zodat het op het profiel zelf nooit hoeft op te
  // vallen. 20 tekens mag nog steeds — het hangt van de letters af: "MMMM..."
  // is ruim twee keer zo breed als "iiii...".
  if (!naamPastInProfielkop(value)) {
    if (statusEl) { statusEl.textContent = 'Deze naam is te lang om op je profiel te tonen. Maak hem korter.'; statusEl.style.color = 'var(--danger)'; }
    return false;
  }
  if (statusEl) { statusEl.textContent = 'Controleren...'; statusEl.style.color = 'var(--muted)'; }

  try {
    const { data, error } = await db.rpc('tt_check_username_available', {
      uname: value,
      exclude_id: (excludeId !== undefined ? excludeId : editingMusicianId) || null
    });
    if (error) throw error;
    usernameAvailable = !!data;
    usernameCheckedValue = value;
    usernameCheckFailed = false;
    if (statusEl) {
      statusEl.textContent = usernameAvailable ? 'Beschikbaar' : 'Al in gebruik, kies een andere.';
      statusEl.style.color = usernameAvailable ? 'var(--success)' : 'var(--danger)';
    }
    return usernameAvailable;
  } catch (e) {
    logCaught('checkUsernameAvailability', e);
    // 22-08-2026 (P0-diagnose): dit ving eerder élke fout op dezelfde manier
    // op als "naam is bezet" — een technische fout bij de controle zelf
    // (bijv. een rechtenfout op de RPC) zag er voor de gebruiker dan
    // identiek uit als een simpelweg al bezette naam. usernameCheckFailed
    // maakt dat onderscheid nu zichtbaar voor de aanroepende code.
    usernameCheckFailed = true;
    lastUsernameCheckError = (e && e.message) ? e.message : String(e);
    console.error('Technische fout bij gebruikersnaam-controle:', e);
    if (statusEl) { statusEl.textContent = friendlyErrorMessage(e); statusEl.style.color = 'var(--danger)'; }
    return false;
  }
}

// TT-38: aparte debounce voor het gate-scherm (los van scheduleUsernameCheck()
// in de wizard, andere input-id/status-id).
let usernameGateAge = null; // leeftijd van het profiel, opgehaald bij het checken
let usernameGateFname = ''; // echte voornaam, voor de <16-vergelijking
// Eigen variabele i.p.v. editingMusicianId hergebruiken — die laatste stuurt
// ook de "Profiel bewerken"-modus/veld-vergrendeling in de wizard aan, en zou
// als ongewenst neveneffect de wizard in bewerkmodus zetten als iemand na het
// inloggen per ongeluk naar "Profiel aanmaken" navigeert.
let usernameGateMid = null;

function scheduleUsernameCheck2() {
  clearTimeout(usernameCheckTimeout);
  usernameCheckTimeout = setTimeout(() => checkUsernameAvailability('usernameGateStatus', 'usernameGateInput', usernameGateMid), 400);
}

// Aangeroepen vanuit onUserLoggedIn() bij elke login/sessie-herstel. Haalt
// username + birth_date + fname van het eigen profiel op; ontbreekt de
// gebruikersnaam, dan verschijnt het verplichte gate-scherm (geen manier om
// te sluiten zonder op te slaan — bewuste keuze, Ronald 07-08-2026).
async function checkUsernameGate() {
  const mid = await getMyMusicianId();
  if (!mid) return false;
  // B-01 tweede stap (18-08-2026): birth_date staat niet meer in deze
  // select — die kolom is voor authenticated afgesloten. Dit is weliswaar
  // altijd de eigen rij (mid = eigen id), maar tt_get_my_birth_date() is de
  // enige weg die de kolom nog mag lezen, dus ook hier via die functie.
  const { data, error } = await db.from('musicians').select('username, fname').eq('id', mid).single();
  if (error || !data) return false;
  if (data.username) return false;

  // Bugfix (07-08-2026, gemeld door Ronald: "opslaan lukt niet"): deze functie
  // gaf de eigen id nooit door aan de beschikbaarheidscheck. Eigen variabele
  // (usernameGateMid) i.p.v. editingMusicianId — zie toelichting hierboven bij
  // die declaratie.
  usernameGateMid = mid;

  const { data: myBirthDate } = await db.rpc('tt_get_my_birth_date');
  usernameGateAge = calcAgeFromISO(myBirthDate);
  usernameGateFname = data.fname || '';
  const hintEl = document.getElementById('usernameGateAgeHint');
  if (hintEl) {
    hintEl.textContent = (usernameGateAge < 16)
      ? 'Omdat je jonger bent dan 16, moet dit afwijken van je echte voornaam.'
      : '';
  }
  document.getElementById('usernameGateInput').value = '';
  document.getElementById('usernameGateStatus').textContent = '';
  document.getElementById('usernameGateModal').classList.add('visible');
  setTimeout(() => document.getElementById('usernameGateInput')?.focus(), 50);
  return true;
}

async function saveUsernameGate() {
  const input = document.getElementById('usernameGateInput');
  const statusEl = document.getElementById('usernameGateStatus');
  const value = input.value.trim();

  if (!value) { statusEl.textContent = 'Vul een gebruikersnaam in.'; statusEl.style.color = 'var(--danger)'; return; }
  if (!usernameFormatValid(value)) {
    statusEl.textContent = 'Alleen letters, cijfers en underscore, 3-20 tekens.'; statusEl.style.color = 'var(--danger)'; return;
  }
  if (usernameGateAge < 16 && value.toLowerCase() === usernameGateFname.toLowerCase()) {
    statusEl.textContent = 'Onder de 16 moet dit afwijken van je echte voornaam.'; statusEl.style.color = 'var(--danger)'; return;
  }

  const available = (usernameCheckedValue === value && usernameAvailable)
    ? true
    : await checkUsernameAvailability('usernameGateStatus', 'usernameGateInput', usernameGateMid);
  if (!available) {
    // checkUsernameAvailability() zet zelf al een statusmelding (bezet /
    // ongeldig formaat / technische fout) — dit is puur een extra vangnet
    // zodat er nooit een lege statustekst overblijft als er iets onverwachts
    // misging (bijv. lege waarde door een edge case hierboven).
    if (!statusEl.textContent) { statusEl.textContent = 'Kon niet controleren. Probeer het opnieuw.'; statusEl.style.color = 'var(--danger)'; }
    return;
  }

  const mid = usernameGateMid || await getMyMusicianId();
  const { error } = await db.from('musicians').update({ username: value }).eq('id', mid);
  if (error) { statusEl.textContent = friendlyErrorMessage(error); statusEl.style.color = 'var(--danger)'; return; }

  document.getElementById('usernameGateModal').classList.remove('visible');
  showToast('Gebruikersnaam opgeslagen!');
  usernameGateMid = null;
  // Zichtbare schermen die de gebruikersnaam tonen, verversen zodat de
  // wijziging meteen zichtbaar is zonder handmatige refresh.
  if (document.getElementById('view-myprofile').classList.contains('active')) loadMyProfile();
}

// ─── Auth extras ─────────────────────────────────────────────────────────────

async function forgotPassword() {
  const emailEl = document.getElementById('loginEmail');
  const email = emailEl.value.trim();
  clearFieldErrors('view-auth');
  // TT-247: gaat over het e-mailveld, dus staat de melding daar.
  if (!email) {
    showFieldErrors([[emailEl, 'Vul eerst je e-mailadres in']]); return;
  }
  if (!emailFormaatGeldig(email)) {
    showFieldErrors([[emailEl, 'Vul een geldig e-mailadres in, bijvoorbeeld jouw@email.nl']]); return;
  }
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://talenttent.org/'
  });
  if (error) { showToast(friendlyErrorMessage(error)); return; }
  showAuthSuccess('✓ Herstelmail verstuurd! Controleer je inbox.');
}

async function saveNewPassword() {
  const pw1El = document.getElementById('resetPassword1');
  const pw2El = document.getElementById('resetPassword2');
  const pw1 = pw1El.value;
  const pw2 = pw2El.value;
  const suc = document.getElementById('resetSuccess');
  suc.classList.remove('visible');

  // TT-247 (12-09-2026): ook hier de fout bij het veld. De banner #resetError
  // toonde één fout tegelijk boven twee identiek ogende wachtwoordvelden;
  // welk veld het was, stond er niet bij.
  clearFieldErrors('view-reset');
  const fouten = [];
  if (!pw1) fouten.push([pw1El, 'Vul een nieuw wachtwoord in']);
  else if (pw1.length < 8) fouten.push([pw1El, 'Kies een wachtwoord van minimaal 8 tekens']);
  if (!pw2) fouten.push([pw2El, 'Herhaal je nieuwe wachtwoord']);
  else if (pw1 && pw1 !== pw2) fouten.push([pw2El, 'Deze komt niet overeen met het wachtwoord hierboven']);
  if (showFieldErrors(fouten)) return;

  const { error } = await db.auth.updateUser({ password: pw1 });
  if (error) { showToast(friendlyErrorMessage(error)); return; }
  suc.textContent = '✓ Wachtwoord opgeslagen!';
  suc.classList.add('visible');
  setTimeout(() => showView('myprofile'), 2000);
}

// ═══════════════════════════════════════════════════════════════════════
// Inloggegevens wijzigen (TT-299, 20-09-2026)
// ═══════════════════════════════════════════════════════════════════════
// Eén venster vanuit Instellingen, met twee blokken: e-mailadres en
// wachtwoord. Beide raken het inlogaccount bij Supabase, niet de tabel
// `musicians` — daarom staan ze hier en niet in "Wie ben je", dat alleen
// profielgegevens opslaat.
//
// Twee uitkomsten bij een adreswijziging, allebei afgevangen. Supabase
// stuurt óf een bevestigingsmail naar het nieuwe adres (dan staat dat adres
// in `new_email` en is `email` nog het oude), óf hij wijzigt het meteen (dan
// staat het nieuwe adres direct in `email`). Welke van de twee hangt af van
// een instelling in het Supabase-dashboard, niet van deze code. De app leest
// daarom het antwoord en meldt wat er werkelijk is gebeurd, in plaats van
// een van de twee aan te nemen.

const IG_VELDEN = ['igNieuwEmail', 'igHuidigWachtwoord', 'igNieuwWachtwoord1', 'igNieuwWachtwoord2'];

function igVeldenLeeg() {
  IG_VELDEN.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

function igMelding(tekst) {
  const el = document.getElementById('igMelding');
  if (!el) return;
  el.textContent = tekst;
  el.classList.add('visible');
}

function igMeldingWeg() {
  const el = document.getElementById('igMelding');
  if (!el) return;
  el.textContent = '';
  el.classList.remove('visible');
}

function openInloggegevens() {
  const modal = document.getElementById('inloggegevensModal');
  igMeldingWeg();
  clearFieldErrors(modal);
  igVeldenLeeg();
  document.getElementById('igHuidigEmail').textContent = currentUser?.email || '';
  modal.classList.add('visible');
}

function closeInloggegevens() {
  document.getElementById('inloggegevensModal').classList.remove('visible');
  igMeldingWeg();
  clearFieldErrors(document.getElementById('inloggegevensModal'));
  igVeldenLeeg();
}

async function wijzigEmail() {
  const modal = document.getElementById('inloggegevensModal');
  const el = document.getElementById('igNieuwEmail');
  const nieuw = el.value.trim();
  const huidig = currentUser?.email || '';

  igMeldingWeg();
  clearFieldErrors(modal);
  const fouten = [];
  if (!nieuw) fouten.push([el, 'Vul je e-mailadres in']);
  else if (!emailFormaatGeldig(nieuw)) fouten.push([el, 'Vul een geldig e-mailadres in, bijvoorbeeld jouw@email.nl']);
  else if (nieuw.toLowerCase() === huidig.toLowerCase()) fouten.push([el, 'Dit is het adres dat je nu al gebruikt']);
  if (showFieldErrors(fouten)) return;

  // De controlevraag noemt het gevolg, niet de handeling (besluit Ronald,
  // 20-09-2026): "weet je het zeker?" wordt weggeklikt, een vraag over de
  // mailbox waar je straks in moet kunnen, wordt gelezen.
  showConfirm(
    `Je logt vanaf nu in met ${nieuw}, en je oude adres werkt dan niet meer. Kun je bij die mailbox?`,
    () => wijzigEmailUitvoeren(nieuw),
    'Ja, dat klopt'
  );
}

async function wijzigEmailUitvoeren(nieuw) {
  const el = document.getElementById('igNieuwEmail');
  const { data, error } = await db.auth.updateUser({ email: nieuw });
  if (error) {
    // Huisstijl §13.1: een serverantwoord dat over één veld gaat, hoort bij
    // dat veld te staan, niet in een toast.
    if (/already|in use|in gebruik|registered|exists|taken/i.test(error.message || '')) {
      showFieldErrors([[el, 'Dit e-mailadres is al in gebruik']]);
    } else {
      logCaught('wijzigEmailUitvoeren', error);
      showToast('Wijzigen is niet gelukt: ' + friendlyErrorMessage(error));
    }
    return;
  }

  const gebruiker = data?.user || null;
  const wacht = gebruiker?.new_email || null;
  if (wacht) {
    igMelding(`✓ We hebben een mail gestuurd naar ${wacht}. Klik op de link erin, dan is je adres gewijzigd. Tot die tijd log je in met ${gebruiker.email}.`);
  } else {
    const nu = gebruiker?.email || nieuw;
    if (gebruiker) currentUser = gebruiker;
    document.getElementById('igHuidigEmail').textContent = nu;
    // Hetzelfde adres staat leesbaar in "Wie ben je". Staat dat scherm open,
    // dan hoort het meteen te kloppen.
    const wbj = document.getElementById('wbjEmail');
    if (wbj) wbj.value = nu;
    igMelding(`✓ Je e-mailadres is gewijzigd. Je logt vanaf nu in met ${nu}.`);
  }
  el.value = '';
}

async function wijzigWachtwoord() {
  const modal = document.getElementById('inloggegevensModal');
  const huidigEl = document.getElementById('igHuidigWachtwoord');
  const pw1El = document.getElementById('igNieuwWachtwoord1');
  const pw2El = document.getElementById('igNieuwWachtwoord2');
  const huidig = huidigEl.value;
  const pw1 = pw1El.value;
  const pw2 = pw2El.value;

  igMeldingWeg();
  clearFieldErrors(modal);
  const fouten = [];
  if (!huidig) fouten.push([huidigEl, 'Vul je huidige wachtwoord in']);
  if (!pw1) fouten.push([pw1El, 'Vul een nieuw wachtwoord in']);
  else if (pw1.length < 8) fouten.push([pw1El, 'Kies een wachtwoord van minimaal 8 tekens']);
  if (!pw2) fouten.push([pw2El, 'Herhaal je nieuwe wachtwoord']);
  else if (pw1 && pw1 !== pw2) fouten.push([pw2El, 'Deze komt niet overeen met het wachtwoord hierboven']);
  if (showFieldErrors(fouten)) return;

  // Controle op het huidige wachtwoord (besluit Ronald, 20-09-2026: wel bij
  // het wachtwoord, niet bij het e-mailadres). Supabase laat een wachtwoord
  // met een geldige sessie zonder meer wijzigen; een geleende, ingelogde
  // telefoon is dan genoeg om iemand buiten te sluiten. Opnieuw inloggen met
  // dezelfde gebruiker is de enige controle die de app zelf kan doen, en hij
  // verstoort de sessie niet: `onAuthStateChange` in core.js slaat een
  // SIGNED_IN van dezelfde gebruiker over (`lastSignedInUserId`).
  const { error: inlogFout } = await db.auth.signInWithPassword({
    email: currentUser?.email || '',
    password: huidig
  });
  if (inlogFout) {
    showFieldErrors([[huidigEl, 'Dit wachtwoord hoort niet bij het e-mailadres.']]);
    return;
  }

  const { error } = await db.auth.updateUser({ password: pw1 });
  if (error) {
    logCaught('wijzigWachtwoord', error);
    showToast('Wijzigen is niet gelukt: ' + friendlyErrorMessage(error));
    return;
  }
  huidigEl.value = '';
  pw1El.value = '';
  pw2El.value = '';
  igMelding('✓ Je wachtwoord is gewijzigd. Je blijft gewoon ingelogd.');
}

