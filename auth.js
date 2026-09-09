// ─── Authenticatie ───────────────────────────────────────────────────────────

function showAuthError(msg) {
  const el = document.getElementById('authError');
  el.textContent = msg;
  el.classList.add('visible');
  document.getElementById('authSuccess').classList.remove('visible');
}

function showAuthSuccess(msg) {
  const el = document.getElementById('authSuccess');
  el.textContent = msg;
  el.classList.add('visible');
  document.getElementById('authError').classList.remove('visible');
}

async function signIn() {
  const emailEl    = document.getElementById('loginEmail');
  const passwordEl = document.getElementById('loginPassword');
  const email    = emailEl.value.trim();
  const password = passwordEl.value;
  // TT-133 (23-08-2026, Ronald: "to much, kan weg"): geen rode banner meer
  // bij lege velden — reportValidity() toont de standaard, lichte hint van
  // de browser zelf bij het lege veld (via het nieuwe required-attribuut
  // op beide velden). Dat is genoeg, de gebruiker snapt dit toch al.
  if (!email) { emailEl.reportValidity(); return; }
  if (!password) { passwordEl.reportValidity(); return; }

  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) { showAuthError(friendlyErrorMessage(error)); return; }
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
  const email = document.getElementById('loginEmail').value.trim();
  if (!email) { showAuthError('Vul eerst je e-mailadres in.'); return; }
  const { error } = await db.auth.resetPasswordForEmail(email, {
    redirectTo: 'https://talenttent.org/'
  });
  if (error) { showAuthError(friendlyErrorMessage(error)); return; }
  showAuthSuccess('✓ Herstelmail verstuurd! Controleer je inbox.');
}

async function saveNewPassword() {
  const pw1 = document.getElementById('resetPassword1').value;
  const pw2 = document.getElementById('resetPassword2').value;
  const err = document.getElementById('resetError');
  const suc = document.getElementById('resetSuccess');
  err.classList.remove('visible'); suc.classList.remove('visible');
  if (!pw1 || !pw2) { err.textContent = 'Vul beide velden in.'; err.classList.add('visible'); return; }
  if (pw1.length < 8) { err.textContent = 'Minimaal 8 tekens.'; err.classList.add('visible'); return; }
  if (pw1 !== pw2) { err.textContent = 'Wachtwoorden komen niet overeen.'; err.classList.add('visible'); return; }
  const { error } = await db.auth.updateUser({ password: pw1 });
  if (error) { err.textContent = friendlyErrorMessage(error); err.classList.add('visible'); return; }
  suc.textContent = '✓ Wachtwoord opgeslagen!';
  suc.classList.add('visible');
  setTimeout(() => showView('myprofile'), 2000);
}

