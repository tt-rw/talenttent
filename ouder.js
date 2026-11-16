

















const OUDER_OPSLAG_KEY       = 'tt_ouder_v1';
const OUDER_LEEFTIJD_ONDER   = 13;
const OUDER_LEEFTIJD_GRENS   = 16;
const OUDER_HERSTUUR_MS      = 15 * 60 * 1000;
const OUDER_MAX_VERSTUURD    = 3;

let ouderStandTimer = null;



let ouderWachtOrigineel = null;



function ouderToestemmingNodig(leeftijd) {
  return Number.isFinite(leeftijd)
      && leeftijd >= OUDER_LEEFTIJD_ONDER
      && leeftijd <  OUDER_LEEFTIJD_GRENS;
}



function ouderLeeftijdUitVeld() {
  const veld = document.getElementById('birth_date');
  if (!veld) return NaN;
  const leeftijd = leeftijdUitVeld(veld.value);
  return leeftijd === null ? NaN : leeftijd;
}





function ouderLeeftijdsregel() {
  const regel = document.getElementById('ouderLeeftijdHint');
  if (!regel) return;
  const nodig = ouderToestemmingNodig(ouderLeeftijdUitVeld());
  regel.style.display = nodig ? '' : 'none';




  const wwVeld = document.getElementById('regPasswordField');
  if (wwVeld && !currentUser) {
    wwVeld.style.display = nodig ? 'none' : '';
  }
}




function ouderAanvraagLezen() {
  try { return JSON.parse(localStorage.getItem(OUDER_OPSLAG_KEY) || 'null'); }
  catch (e) { return null; }
}

function ouderAanvraagBewaren(gegevens) {
  try { localStorage.setItem(OUDER_OPSLAG_KEY, JSON.stringify(gegevens)); }
  catch (e) { console.error('Kon de aanvraag niet bewaren:', e); }
}

function ouderAanvraagWissen() {
  try { localStorage.removeItem(OUDER_OPSLAG_KEY); } catch (e) { }
}





function ouderPaneelTonen(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.panel-ouder').forEach(p => p.classList.toggle('active', p.id === id));
  const balk = document.getElementById('stepsBar');
  if (balk) balk.style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function ouderPaneelSluiten() {
  clearInterval(ouderStandTimer);
  document.querySelectorAll('.panel-ouder').forEach(p => p.classList.remove('active'));
  const balk = document.getElementById('stepsBar');
  if (balk) balk.style.display = '';
}



function ouderStapTonen() {
  const veld = document.getElementById('ouderEmail');
  const bewaard = ouderAanvraagLezen();
  if (veld && bewaard?.ouderEmail) veld.value = bewaard.ouderEmail;
  ouderStopLinkZetten();
  ouderPaneelTonen('ouderStap');
}





function ouderStopLinkZetten() {
  const paneel = document.getElementById('ouderStap');
  if (!paneel || document.getElementById('ouderStapStopLink')) return;
  const anker = paneel.querySelector('.ouder-melding');
  if (!anker) return;
  anker.insertAdjacentHTML('afterend',
    '<p class="stille-link-regel" id="ouderStapStopLink"><button type="button" class="stille-link" onclick="ouderStoppenEnWissen()">Stoppen en mijn gegevens wissen</button></p>');
}



function ouderStapOverslaan() {
  ouderPaneelSluiten();
  goTo(1);
}

async function ouderVerzoekVersturen() {
  const veld = document.getElementById('ouderEmail');
  const adres = (veld?.value || '').trim();
  clearFieldErrors(document.getElementById('ouderStap'));
  if (!adres) { setFieldError(veld, 'Vul het e-mailadres van je ouder of verzorger in'); return; }
  if (!emailFormaatGeldig(adres)) { setFieldError(veld, 'Dit e-mailadres klopt niet. Controleer het nog een keer'); return; }
  if (adres.toLowerCase() === (state.regEmail || '').toLowerCase()) {
    setFieldError(veld, 'Dit is je eigen e-mailadres. Vul het e-mailadres van je ouder of verzorger in');
    return;
  }

  const leeftijd = ouderLeeftijdUitVeld();
  if (!ouderToestemmingNodig(leeftijd)) { showToast('Je geboortedatum ontbreekt of klopt niet. Ga terug naar stap 1 en vul hem opnieuw in.'); return; }

  showSaving('Aanvraag versturen...', 'Een ogenblik geduld.');
  try {
    const gegevens = await ouderApi('start', {
      kind_voornaam: state.fname,
      kind_leeftijd: leeftijd,
      kind_email:    state.regEmail,
      ouder_email:   adres
    });
    hideSaving();



    const mailGelukt = gegevens.mail_verstuurd !== false;
    ouderAanvraagBewaren({
      aanvraagId:      gegevens.aanvraag_id,
      ouderEmail:      adres,
      stand:           'open',
      vervaltOp:       gegevens.vervalt_op,
      verstuurd:       mailGelukt ? 1 : 0,
      laatstVerstuurd: mailGelukt ? Date.now() : 0
    });
    ouderPaneelSluiten();
    showToast(mailGelukt
      ? 'Je aanvraag is verstuurd. Je kunt gewoon verder.'
      : 'De mail kon nog niet worden verstuurd. Je kunt gewoon verder; aan het eind stuur je hem opnieuw.');
    goTo(1);
  } catch (e) {
    hideSaving();
    logCaught('ouderVerzoekVersturen', e);


    if (/in gebruik/i.test(e.message || '')) {
      ouderPaneelSluiten();
      goTo(0);
      setFieldError(document.getElementById('regEmail'), TEKST_ACCOUNT_BESTAAT);
      return;
    }
    showToast(friendlyErrorMessage(e, 'de aanvraag versturen'));
  }
}



function ouderWachtTonen() {
  const paneel = document.getElementById('ouderWacht');
  if (paneel) {
    if (ouderWachtOrigineel === null) ouderWachtOrigineel = paneel.innerHTML;
    else paneel.innerHTML = ouderWachtOrigineel;
  }
  const bewaard = ouderAanvraagLezen();
  const adresEl = document.getElementById('ouderWachtAdres');
  if (adresEl) adresEl.textContent = bewaard?.ouderEmail || '';


  if (bewaard && bewaard.verstuurd === 0) {
    const kop  = document.getElementById('ouderWachtKop');
    const body = document.getElementById('ouderWachtBody');
    if (kop)  kop.textContent = 'De mail is nog niet verstuurd';
    if (body) body.textContent = 'Het versturen naar ' + (bewaard.ouderEmail || 'je ouder') + ' lukte niet. Je profiel blijft bewaard. Tik op "Mail opnieuw sturen".';
    ['ouderWachtMelding', 'ouderWachtVraag'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });


    const knop = document.getElementById('ouderOpnieuwKnop');
    if (knop) { knop.classList.remove('btn-ghost'); knop.classList.add('btn-primary'); }
  }
  ouderPaneelTonen('ouderWacht');
  ouderHerstuurKnopBijwerken();
  ouderStandVerversen();
  clearInterval(ouderStandTimer);
  ouderStandTimer = setInterval(ouderStandVerversen, 20000);
}

function ouderHerstuurKnopBijwerken() {
  const knop = document.getElementById('ouderOpnieuwKnop');
  const regel = document.getElementById('ouderHerstuurRegel');
  if (!knop) return;
  const bewaard = ouderAanvraagLezen();
  if (!bewaard) return;

  if ((bewaard.verstuurd || 0) >= OUDER_MAX_VERSTUURD) {
    knop.disabled = true;
    if (regel) regel.textContent = 'Je hebt de mail drie keer gestuurd. Klopt het e-mailadres niet? Vul dan een ander in.';
    return;
  }

  const over = OUDER_HERSTUUR_MS - (Date.now() - (bewaard.laatstVerstuurd || 0));
  if (over > 0) {
    const minuten = Math.max(1, Math.ceil(over / 60000));
    knop.disabled = true;
    if (regel) regel.textContent = `Opnieuw sturen kan over ${minuten} ${minuten === 1 ? 'minuut' : 'minuten'}.`;
    setTimeout(ouderHerstuurKnopBijwerken, Math.min(over, 30000));
  } else {
    knop.disabled = false;
    if (regel) regel.textContent = '';
  }
}

async function ouderOpnieuwSturen() {
  const bewaard = ouderAanvraagLezen();
  if (!bewaard?.aanvraagId) return;
  showSaving('Aanvraag versturen...', 'Een ogenblik geduld.');
  try {
    await ouderApi('opnieuw', { aanvraag_id: bewaard.aanvraagId });
    hideSaving();
    const wasNietVerstuurd = bewaard.verstuurd === 0;
    bewaard.verstuurd = (bewaard.verstuurd || 0) + 1;
    bewaard.laatstVerstuurd = Date.now();
    ouderAanvraagBewaren(bewaard);


    if (wasNietVerstuurd) ouderWachtTonen();
    else ouderHerstuurKnopBijwerken();
    showToast('De mail is opnieuw verstuurd.');
  } catch (e) {
    hideSaving();
    logCaught('ouderOpnieuwSturen', e);
    showToast(friendlyErrorMessage(e, 'de mail opnieuw versturen'));
  }
}



function ouderAdresWijzigen() {
  clearInterval(ouderStandTimer);
  ouderStapTonen();
}




function ouderWachtInBeeld() {
  const paneel = document.getElementById('ouderWacht');
  return document.visibilityState === 'visible'
    && !!paneel && paneel.classList.contains('active') && paneel.offsetParent !== null;
}


document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ouderWachtInBeeld()) ouderStandVerversen();
});

async function ouderStandVerversen() {
  if (!ouderWachtInBeeld()) return;
  const bewaard = ouderAanvraagLezen();
  if (!bewaard?.aanvraagId) return;
  try {
    const gegevens = await ouderApi('stand', { aanvraag_id: bewaard.aanvraagId });
    bewaard.stand = gegevens.stand;
    ouderAanvraagBewaren(bewaard);
    if (gegevens.stand === 'goedgekeurd') {
      clearInterval(ouderStandTimer);
      ouderWachtwoordTonen();
    } else if (gegevens.stand === 'verlopen' || gegevens.stand === 'geweigerd') {
      clearInterval(ouderStandTimer);
      ouderVerlopenTonen();
    }
  } catch (e) {


    console.error('Stand van de aanvraag niet op te halen:', e);
  }
}



function ouderVerlopenTonen() {
  const kop  = document.getElementById('ouderWachtKop');
  const body = document.getElementById('ouderWachtBody');
  const acties = document.getElementById('ouderWachtActies');
  if (kop)  kop.textContent = 'Je aanvraag is verlopen';
  if (body) body.textContent = 'Na veertien dagen vervalt een aanvraag vanzelf. Je profiel staat nog klaar op dit toestel. Stuur de aanvraag opnieuw.';


  ['ouderWachtMelding', 'ouderWachtVraag'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });

  if (acties) {
    acties.innerHTML = '<button class="btn btn-primary" onclick="ouderAdresWijzigen()">Aanvraag opnieuw versturen</button>';
  }
}




function ouderStoppenEnWissen() {
  const bewaard = ouderAanvraagLezen();
  const tekst = bewaard?.ouderEmail
    ? 'Alles wat je invulde en de aanvraag aan ' + bewaard.ouderEmail + ' verdwijnen van dit toestel. Dat is niet terug te draaien.'
    : 'Alles wat je invulde verdwijnt van dit toestel. Dat is niet terug te draaien.';
  showConfirm(
    tekst,
    () => {
      clearInterval(ouderStandTimer);
      ouderAanvraagWissen();
      clearOnboardingProgress();
      ouderPaneelSluiten();
      showView('landing');




      window.location.reload();
    },
    'Gegevens wissen',
    true,
    'Annuleren',
    'Je gegevens wissen?'
  );
}



function ouderWachtwoordTonen() {
  const adres = document.getElementById('ouderWwAdres');
  if (adres) adres.textContent = state.regEmail || '';
  ouderPaneelTonen('ouderWachtwoord');
}

async function ouderProfielAanmaken() {
  const veld = document.getElementById('ouderWachtwoordVeld');
  const waarde = (veld?.value || '').trim();
  clearFieldErrors(document.getElementById('ouderWachtwoord'));
  if (!waarde) { setFieldError(veld, 'Kies een wachtwoord'); return; }
  if (waarde.length < 8) { setFieldError(veld, 'Kies een wachtwoord van minimaal 8 tekens'); return; }

  state.regPassword = waarde;
  const bewaard = ouderAanvraagLezen();



  await submitProfile();







  if (state.savedId && bewaard?.aanvraagId) {
    if (!(await ouderKoppelen(bewaard.aanvraagId))) {
      ouderKoppelingBewaren({ aanvraagId: bewaard.aanvraagId, userId: currentUser?.id || null });
    }
    ouderAanvraagWissen();
  }
}

const OUDER_KOPPELEN_KEY = 'tt_ouder_koppelen_v1';

async function ouderKoppelen(aanvraagId) {
  try {
    const { error } = await db.rpc('tt_ouder_koppelen', { p_aanvraag_id: aanvraagId });
    if (error) throw error;
    return true;
  } catch (e) {
    logCaught('ouderKoppelen', e);
    return false;
  }
}

function ouderKoppelingBewaren(gegevens) {
  try { localStorage.setItem(OUDER_KOPPELEN_KEY, JSON.stringify(gegevens)); }
  catch (e) { console.error('Kon de koppeling niet bewaren:', e); }
}



async function ouderKoppelingHerhalen(user) {
  let open = null;
  try { open = JSON.parse(localStorage.getItem(OUDER_KOPPELEN_KEY) || 'null'); } catch (e) { open = null; }
  if (!open?.aanvraagId || !user || open.userId !== user.id) return;
  if (await ouderKoppelen(open.aanvraagId)) {
    try { localStorage.removeItem(OUDER_KOPPELEN_KEY); } catch (e) { }
  }
}



let toestemmingCode = null;

async function toestemmingPaginaOpenen(code) {
  toestemmingCode = code;
  showView('toestemming');
  const vak = document.getElementById('toestemmingInhoud');
  if (!vak) return;
  vak.innerHTML = '<p class="toestemming-melding">Even geduld...</p>';
  try {
    const gegevens = await ouderApi('lezen', { code });
    if (gegevens.stand !== 'open') { toestemmingAfgehandeldTonen(gegevens.stand, gegevens.besloten_op); return; }
    toestemmingVraagTonen(gegevens);
  } catch (e) {
    logCaught('toestemmingPaginaOpenen', e);




    if ((e && e.message) === 'Onbekende link.') {





      toestemmingMeldingTonen('Deze link werkt niet',
        ['Heb je meer mails van ons gekregen? Gebruik dan de knop in de nieuwste.']);
    } else {
      toestemmingMeldingTonen('De pagina laden lukte niet',
        ['Tik over een paar minuten opnieuw op de knop in de mail.']);
    }
  }
}





function toestemmingMeldingTonen(kop, regels, knop) {
  const vak = document.getElementById('toestemmingInhoud');
  if (!vak) return;
  vak.innerHTML = `
    <h1 class="panel-title">${escHtml(kop)}</h1>
    ${regels.map(r => `<p class="toestemming-melding">${escHtml(r)}</p>`).join('\n    ')}` +
    (knop ? `\n    <div class="knoppen-stapel toestemming-knoppen"><button class="btn btn-primary" onclick="${knop.actie}">${escHtml(knop.tekst)}</button></div>` : '');
}



const TOESTEMMING_AFSLUITER = 'Je kunt dit venster nu sluiten.';






function toestemmingGegevenOpenen() {
  if (currentUser) { showView('myprofile', 'redirect'); return; }
  if (leesOuderVoortgang()) { showView('register', 'redirect'); return; }
  showView('toestemming', 'redirect');
  toestemmingMeldingTonen('Je ouder heeft toestemming gegeven', [
    'Je profiel staat klaar op het toestel waar je begon, in de browser die je toen gebruikte.',
    'Open daar talenttent.org en tik op Profiel aanmaken. Je gaat verder waar je was.'
  ]);
}

function toestemmingVraagTonen(gegevens) {
  const naam = escHtml(gegevens.kind_voornaam);
  document.getElementById('toestemmingInhoud').innerHTML = `
    <h1 class="panel-title">${naam} vraagt je toestemming</h1>
    <p class="toestemming-melding">${naam} heeft een profiel gemaakt op TalentTent
       en kan pas verder als jij toestemming geeft.</p>

    <div class="toestemming-blok">
      <h2>Wat TalentTent is</h2>
      <p>Een Nederlands platform waar muzikanten elkaar vinden om samen te spelen:
         jammen, repeteren, optreden.</p>
    </div>

    <div class="toestemming-blok">
      <h2>Welke gegevens we bewaren</h2>
      <p>Naam, leeftijd, woonplaats en wat ${naam} speelt. Andere muzikanten zien de
         gebruikersnaam en het profiel. De geboortedatum is voor niemand zichtbaar.</p>
    </div>

    <div class="toestemming-blok">
      <h2>Je toestemming intrekken</h2>
      <p>Dat kan op elk moment via
         <a href="mailto:privacy@talenttent.org">privacy@talenttent.org</a>. De
         toestemming geldt maximaal drie jaar en vervalt zodra ${naam} 16 wordt.</p>
    </div>

    <label class="toestemming-akkoord">
      <input type="checkbox" id="toestemmingVinkje" onchange="toestemmingKnopBijwerken()">
      <span>Ik ben de ouder of verzorger van ${naam} en geef namens ${naam} toestemming.
        Ik ga akkoord met de
        <a href="#terms" target="_blank" rel="noopener">Gebruiksvoorwaarden</a>, de
        <a href="#privacy" target="_blank" rel="noopener">Privacyverklaring</a> en de
        <a href="#gedragscode" target="_blank" rel="noopener">Gedragscode</a>.</span>
    </label>

    <div class="knoppen-stapel toestemming-knoppen">
      <button class="btn btn-primary" id="toestemmingJaKnop" onclick="ouderBesluit(true)" disabled>Toestemming geven</button>
      <button class="btn btn-ghost" onclick="ouderBesluit(false)">Weigeren</button>
    </div>`;
  toestemmingKnopBijwerken();
}

function toestemmingKnopBijwerken() {
  const vinkje = document.getElementById('toestemmingVinkje');
  const knop = document.getElementById('toestemmingJaKnop');
  if (!vinkje || !knop) return;
  knop.disabled = !vinkje.checked;
}



function toestemmingAfgehandeldTonen(stand, beslotenOp) {
  const datum = beslotenOp ? nlDatum(beslotenOp) : '';
  const schermen = {
    goedgekeurd: ['Toestemming is al gegeven', `${datum ? 'Op ' + datum + '. ' : ''}Je hoeft niets meer te doen.`],
    geweigerd:   ['Deze aanvraag is afgewezen', 'Er gebeurt verder niets.'],
    verlopen:    ['Deze link werkt niet meer', 'Een aanvraag vervalt na veertien dagen. Je hoeft niets te doen.']
  };
  const [kop, regel] = schermen[stand] || schermen.verlopen;
  toestemmingMeldingTonen(kop, [regel]);
}

async function ouderBesluit(akkoord) {
  if (akkoord && !document.getElementById('toestemmingVinkje')?.checked) return;
  showSaving('Een ogenblik...', 'We leggen je antwoord vast.');
  try {
    await ouderApi('besluit', { code: toestemmingCode, akkoord });
    hideSaving();
    const vak = document.getElementById('toestemmingInhoud');
    if (akkoord) {
      vak.innerHTML = `
        <h1 class="panel-title">Bedankt!</h1>
        <p class="toestemming-melding">Je toestemming is vastgelegd op
           ${escHtml(nlDatum(new Date().toISOString()))}. Je kind krijgt hier bericht over
           en kan het profiel afmaken.</p>
        <p class="toestemming-melding">Wil je de toestemming later intrekken, mail dan naar
           <a href="mailto:privacy@talenttent.org">privacy@talenttent.org</a>.</p>
        <p class="toestemming-melding">${TOESTEMMING_AFSLUITER}</p>`;
    } else {
      vak.innerHTML = `
        <h1 class="panel-title">Genoteerd</h1>
        <p class="toestemming-melding">De aanvraag is vervallen. Er wordt geen profiel aangemaakt
           en er worden geen gegevens bewaard.</p>
        <p class="toestemming-melding">Je kind krijgt hier geen bericht over.</p>
        <p class="toestemming-melding">${TOESTEMMING_AFSLUITER}</p>`;
    }



    window.scrollTo(0, 0);
  } catch (e) {
    hideSaving();
    logCaught('ouderBesluit', e);
    showToast(friendlyErrorMessage(e, 'je antwoord versturen'));
  }
}



function nlDatum(iso) {
  try {
    return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return ''; }
}




async function ouderApi(actie, gegevens) {
  const { data, error } = await db.functions.invoke('ouder-toestemming', {
    body: Object.assign({ actie }, gegevens)
  });
  if (error) throw new Error(await extractFnErrorDetail(error));
  if (data && data.error) throw new Error(data.error);
  return data || {};
}
