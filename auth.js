









async function signIn() {
  const emailEl    = document.getElementById('loginEmail');
  const passwordEl = document.getElementById('loginPassword');
  const email    = emailEl.value.trim();
  const password = passwordEl.value;






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





    const tekst = friendlyErrorMessage(error, 'inloggen');
    const msg = (error && error.message) ? error.message : '';
    if (/invalid login credentials|invalid_credentials|invalid grant/i.test(msg)) {
      showFieldErrors([[passwordEl, tekst]]);
    } else {


      showToast(tekst);
    }
    return;
  }



  try { localStorage.setItem('tt_lastLoginEmail', email); } catch (e) { }

}












async function signOut() {
  currentUser = null;
  fotoLinksWissen();
  onUserLoggedOut();



  await ttSeintjeUitzetten();
  try {
    await db.auth.signOut();
  } catch (e) {
    logCaught('signOut', e);
  }
}








let usernameCheckTimeout = null;
let usernameAvailable = false;
let usernameCheckedValue = '';
let usernameCheckFailed = false;
let lastUsernameCheckError = '';













const RESERVED_USERNAME_WORDS = [
  'admin', 'administrator', 'beheer', 'beheerder',
  'moderator', 'moderatie',
  'support', 'helpdesk', 'klantenservice',
  'eigenaar',
  'official', 'officieel', 'medewerker',
  'webmaster', 'superuser', 'developer', 'ontwikkelaar',
];





const RESERVED_USERNAME_LOSSE_WOORDEN = ['mod', 'root', 'team', 'staff', 'owner'];








const STAFF_USERNAME_EXCEPTIONS = [

];

function isReservedUsername(value) {
  const v = value.toLowerCase();
  if (STAFF_USERNAME_EXCEPTIONS.some(x => x.toLowerCase() === v)) return false;
  if (v.includes('talent') && v.includes('tent')) return true;
  if (RESERVED_USERNAME_WORDS.some(w => v.includes(w))) return true;
  return v.split(/[_0-9]+/).some(deel => RESERVED_USERNAME_LOSSE_WOORDEN.includes(deel));
}

function scheduleUsernameCheck() {
  wisUsernameUitslag('usernameStatus', 'username');
  clearTimeout(usernameCheckTimeout);
  usernameCheckTimeout = setTimeout(() => checkUsernameAvailability(), 400);
}



function usernameFormatValid(u) {
  return /^[A-Za-z0-9_]{3,20}$/.test(u);
}










async function checkUsernameAvailability(statusElId, inputElId, excludeId) {
  const statusId = statusElId || 'usernameStatus';
  const inputId = inputElId || 'username';
  const input = document.getElementById(inputId);
  const value = (input?.value || '').trim();
  usernameCheckedValue = value;
  usernameAvailable = false;




  wisUsernameUitslag(statusId, inputId);
  if (!value) return false;
  if (!usernameFormatValid(value)) {
    zetUsernameLang(inputId, 'Alleen letters, cijfers en underscore, 3-20 tekens.');
    return false;
  }
  if (isReservedUsername(value)) {
    zetUsernameNee(statusId, inputId);
    return false;
  }






  if (!naamPastInProfielkop(value)) {
    zetUsernameLang(inputId, 'Deze naam is te lang om op je profiel te tonen. Maak hem korter.');
    return false;
  }
  zetUitslag(statusId, 'Controleren…');

  try {
    const { data, error } = await db.rpc('tt_check_username_available', {
      uname: value,
      exclude_id: excludeId || null
    });
    if (error) throw error;
    usernameAvailable = !!data;
    usernameCheckedValue = value;
    usernameCheckFailed = false;
    if (usernameAvailable) zetUitslag(statusId, 'Beschikbaar', true);
    else zetUsernameNee(statusId, inputId);
    return usernameAvailable;
  } catch (e) {
    logCaught('checkUsernameAvailability', e);





    usernameCheckFailed = true;
    lastUsernameCheckError = (e && e.message) ? e.message : String(e);
    console.error('Technische fout bij gebruikersnaam-controle:', e);
    zetUitslag(statusId, '');
    zetUsernameLang(inputId, friendlyErrorMessage(e, 'de gebruikersnaam controleren'));
    return false;
  }
}




function wisUsernameUitslag(statusId, inputId) {
  zetUitslag(statusId, '');
  const inp = document.getElementById(inputId);
  if (inp) clearFieldError(inp);
}

function zetUsernameNee(statusId, inputId) {
  zetUitslag(statusId, 'Niet beschikbaar');
  const inp = document.getElementById(inputId);

  if (inp) { inp.classList.add('field-error'); inp.setAttribute('aria-invalid', 'true'); veldfoutWaardeOnthouden(inp); }
}


function zetUsernameLang(inputId, tekst) {
  setFieldError(inputId, tekst);
}



let usernameGateAge = null;
let usernameGateFname = '';

let usernameGateMid = null;

function scheduleUsernameCheck2() {
  wisUsernameUitslag('usernameGateStatus', 'usernameGateInput');
  clearTimeout(usernameCheckTimeout);
  usernameCheckTimeout = setTimeout(() => checkUsernameAvailability('usernameGateStatus', 'usernameGateInput', usernameGateMid), 400);
}





async function checkUsernameGate() {
  const mid = await getMyMusicianId();
  if (!mid) return false;






  const { data, error } = await db.from('musicians').select('username').eq('id', mid).single();
  if (error || !data) return false;
  if (data.username) return false;



  usernameGateMid = mid;

  const { data: myBirthDate, error: gebFout } = await db.rpc('tt_get_my_birth_date');
  if (gebFout) logCaught('usernameGate/geboortedatum', gebFout);
  usernameGateAge = calcAgeFromISO(myBirthDate);
  const { data: naamData, error: naamFout } = await db.rpc('tt_mijn_naam');
  if (naamFout) logCaught('usernameGate/naam', naamFout);
  const eigenNaam = Array.isArray(naamData) ? naamData[0] : naamData;
  usernameGateFname = (eigenNaam && eigenNaam.fname) || '';
  const hintEl = document.getElementById('usernameGateAgeHint');
  if (hintEl) {
    hintEl.textContent = (usernameGateAge < 16)
      ? 'Je bent jonger dan 16 jaar. Daarom moet de gebruikersnaam anders zijn dan je voornaam.'
      : '';
  }
  document.getElementById('usernameGateInput').value = '';
  wisUsernameUitslag('usernameGateStatus', 'usernameGateInput');
  document.getElementById('usernameGateModal').classList.add('visible');
  setTimeout(() => document.getElementById('usernameGateInput')?.focus(), 50);
  return true;
}

async function saveUsernameGate() {
  const input = document.getElementById('usernameGateInput');
  const value = input.value.trim();

  if (!value) { zetUsernameLang('usernameGateInput', 'Vul een gebruikersnaam in.'); return; }
  if (!usernameFormatValid(value)) {
    zetUsernameLang('usernameGateInput', 'Alleen letters, cijfers en underscore, 3-20 tekens.'); return;
  }
  if (usernameGateAge < 16 && value.toLowerCase() === usernameGateFname.toLowerCase()) {
    zetUsernameLang('usernameGateInput', 'Onder de 16 jaar moet de gebruikersnaam anders zijn dan je voornaam.'); return;
  }

  const available = (usernameCheckedValue === value && usernameAvailable)
    ? true
    : await checkUsernameAvailability('usernameGateStatus', 'usernameGateInput', usernameGateMid);
  if (!available) {




    const uitslagEl = document.getElementById('usernameGateUitslag');
    if (!(uitslagEl && uitslagEl.textContent) && !input.classList.contains('field-error')) {
      zetUsernameLang('usernameGateInput', 'Gebruikersnaam controleren lukt nu niet. Controleer je verbinding en probeer het opnieuw.');
    }
    return;
  }

  const mid = usernameGateMid || await getMyMusicianId();
  const { error } = rijenGeraakt(await db.from('musicians').update({ username: value }).eq('id', mid).select('id'));
  if (error) { zetUsernameLang('usernameGateInput', friendlyErrorMessage(error, 'je gebruikersnaam opslaan')); return; }

  document.getElementById('usernameGateModal').classList.remove('visible');
  showToast('Gebruikersnaam opgeslagen!');
  usernameGateMid = null;


  if (document.getElementById('view-myprofile').classList.contains('active')) loadMyProfile();
}



async function forgotPassword() {
  const emailEl = document.getElementById('loginEmail');
  const email = emailEl.value.trim();
  clearFieldErrors('view-auth');

  if (!email) {
    showFieldErrors([[emailEl, 'Vul eerst je e-mailadres in']]); return;
  }
  if (!emailFormaatGeldig(email)) {
    showFieldErrors([[emailEl, 'Vul een geldig e-mailadres in, bijvoorbeeld jouw@email.nl']]); return;
  }




  const knop = document.getElementById('forgotPasswordBtn');
  if (knop && knop.disabled) return;
  if (knop) { knop.disabled = true; knop.textContent = 'Versturen...'; }
  document.getElementById('authHerstelVerstuurd').hidden = true;
  const verlopen = document.getElementById('authLinkVerlopen'); if (verlopen) verlopen.hidden = true;
  let gelukt = false;
  try {
    const { error } = await db.auth.resetPasswordForEmail(email, {



      redirectTo: new URL('./', location.href).href
    });


    if (error) { logCaught('forgotPassword', error); showToast(friendlyErrorMessage(error, 'de herstelmail versturen')); }
    else gelukt = true;
  } catch (e) {
    logCaught('forgotPassword', e);
    showToast(friendlyErrorMessage(e, 'de herstelmail versturen'));
  }
  if (!gelukt) {
    if (knop) { knop.disabled = false; knop.textContent = 'Wachtwoord vergeten?'; }
    return;
  }
  document.getElementById('authHerstelTekst').textContent =
    'Kijk in de inbox van ' + email + '. De link in de mail werkt één keer.';
  document.getElementById('authHerstelVerstuurd').hidden = false;
  if (knop) {
    knop.textContent = 'Herstelmail verstuurd';
    setTimeout(() => { knop.disabled = false; knop.textContent = 'Wachtwoord vergeten?'; }, 60000);
  }
}

async function saveNewPassword() {
  const pw1El = document.getElementById('resetPassword1');
  const pw1 = pw1El.value;
  const suc = document.getElementById('resetOpgeslagen');
  suc.hidden = true;




  clearFieldErrors('view-reset');
  const fouten = [];
  if (!pw1) fouten.push([pw1El, 'Vul een nieuw wachtwoord in']);
  else if (pw1.length < 8) fouten.push([pw1El, 'Kies een wachtwoord van minimaal 8 tekens']);
  if (showFieldErrors(fouten)) return;

  const { error } = await db.auth.updateUser({ password: pw1 });
  if (error) {

    if (isZelfdeWachtwoordFout(error)) showFieldErrors([[pw1El, friendlyErrorMessage(error, 'je nieuwe wachtwoord opslaan')]]);
    else if (isZwakWachtwoordFout(error)) showFieldErrors([[pw1El, TEKST_ZWAK_WACHTWOORD]]);
    else showToast(friendlyErrorMessage(error, 'je nieuwe wachtwoord opslaan'));
    return;
  }
  suc.hidden = false;
  setTimeout(() => showView('myprofile'), 2000);
}

















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





function verversEmailWeergave(email) {
  const igEl = document.getElementById('igHuidigEmail');
  if (igEl) igEl.textContent = email;
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






  showConfirm(
    `We sturen ter bevestiging een e-mail naar ${nieuw}. Na jouw bevestiging log je in met dit e-mailadres. Kun je bij die mailbox?`,
    () => wijzigEmailUitvoeren(nieuw),
    'Ja, dat klopt'
  );
}

async function wijzigEmailUitvoeren(nieuw) {
  const el = document.getElementById('igNieuwEmail');
  const { data, error } = await db.auth.updateUser({ email: nieuw });
  if (error) {


    if (/already|in use|in gebruik|registered|exists|taken/i.test(error.message || '')) {
      showFieldErrors([[el, TEKST_EMAIL_BEZET]]);
    } else {
      logCaught('wijzigEmailUitvoeren', error);
      showToast(friendlyErrorMessage(error, 'je e-mailadres wijzigen'));
    }
    return;
  }

  const gebruiker = data?.user || null;
  const wacht = gebruiker?.new_email || null;
  if (wacht) {
    igMelding(`✓ We hebben een e-mail gestuurd naar ${wacht}. Tik op de link in de e-mail om je nieuwe e-mailadres te bevestigen. Tot die tijd log je in met ${gebruiker.email}.`);
  } else {
    const nu = gebruiker?.email || nieuw;
    if (gebruiker) currentUser = gebruiker;
    verversEmailWeergave(nu);
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


  else if (huidig && pw1 === huidig) fouten.push([pw1El, TEKST_ZELFDE_WACHTWOORD]);
  if (!pw2) fouten.push([pw2El, 'Herhaal je nieuwe wachtwoord']);
  else if (pw1 && pw1 !== pw2) fouten.push([pw2El, 'Deze komt niet overeen met het wachtwoord hierboven']);
  if (showFieldErrors(fouten)) return;








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
    if (isZelfdeWachtwoordFout(error)) {
      showFieldErrors([[pw1El, friendlyErrorMessage(error, 'je wachtwoord wijzigen')]]);
      return;
    }
    if (isZwakWachtwoordFout(error)) {
      showFieldErrors([[pw1El, TEKST_ZWAK_WACHTWOORD]]);
      return;
    }
    logCaught('wijzigWachtwoord', error);
    showToast(friendlyErrorMessage(error, 'je wachtwoord wijzigen'));
    return;
  }
  huidigEl.value = '';
  pw1El.value = '';
  pw2El.value = '';
  igMelding('✓ Je wachtwoord is gewijzigd. Je blijft gewoon ingelogd.');
}




signIn = slotOm(signIn, 'inlogKnop');
saveNewPassword = slotOm(saveNewPassword, 'resetOpslaanKnop');
saveUsernameGate = slotOm(saveUsernameGate, 'usernameGateKnop');
wijzigEmailUitvoeren = slotOm(wijzigEmailUitvoeren, 'wijzigEmailKnop');
wijzigWachtwoord = slotOm(wijzigWachtwoord, 'wijzigWachtwoordKnop');
