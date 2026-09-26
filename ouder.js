// ouder.js — TT-42: registratie met toestemming van een ouder (route A)
//
// Twee kanten in één bestand, net als melden en blokkeren samen in
// veiligheid.js staan (TT-06):
//   1. de kant van het kind  — het tussenscherm, het wachtscherm en het
//      wachtwoordscherm binnen de registratiewizard;
//   2. de kant van de ouder  — de goedkeuringspagina (view-toestemming),
//      die zonder inlog werkt en alleen via de link uit de mail bereikbaar is.
//
// Route A (besluit Ronald, 22-09-2026): voor wie 13, 14 of 15 is ontstaan het
// account en de profielregel pas ná de goedkeuring. Tot die tijd staat alles
// in de browser van het kind. Voor 16-plussers verandert er niets.
//
// De code uit de link komt nooit in de browser van het kind terecht. Alle
// schrijfacties lopen via de Edge Function `ouder-toestemming`, die de
// service-role-sleutel heeft; de tabel zelf is voor anon en authenticated
// volledig dicht.

const OUDER_OPSLAG_KEY       = 'tt_ouder_v1';
const OUDER_LEEFTIJD_ONDER   = 13;  // onder de 13 mag niemand, zie wizard.js
const OUDER_LEEFTIJD_GRENS   = 16;  // vanaf 16 is geen toestemming nodig
const OUDER_HERSTUUR_MS      = 15 * 60 * 1000;
const OUDER_MAX_VERSTUURD    = 3;

let ouderStandTimer = null;

// ─── Wie heeft een ouder nodig ───────────────────────────────────────────────

function ouderToestemmingNodig(leeftijd) {
  return Number.isFinite(leeftijd)
      && leeftijd >= OUDER_LEEFTIJD_ONDER
      && leeftijd <  OUDER_LEEFTIJD_GRENS;
}

// Leeftijd van wat er nú in het geboortedatumveld staat. Geeft NaN bij een
// onvolledige of onzinnige datum — dan toont de regel zich niet.
function ouderLeeftijdUitVeld() {
  const veld = document.getElementById('birth_date');
  if (!veld) return NaN;
  const waarde = (veld.value || '').trim();
  if (!/^\d{2}-\d{2}-\d{4}$/.test(waarde)) return NaN;
  return calcAge(waarde);
}

// ─── Onderdeel 1: de regel bij de geboortedatum ──────────────────────────────
// Verschijnt zodra de datum op 13, 14 of 15 uitkomt, verdwijnt weer zodra dat
// niet meer zo is. Geen rood, geen blokkade: een mededeling, geen fout
// (huisstijl §13.1 — zeg wat er moet gebeuren, niet wat er fout is).
function ouderLeeftijdsregel() {
  const regel = document.getElementById('ouderLeeftijdHint');
  if (!regel) return;
  const nodig = ouderToestemmingNodig(ouderLeeftijdUitVeld());
  regel.style.display = nodig ? '' : 'none';

  // Het wachtwoord wordt bij deze leeftijd pas aan het eind gevraagd, ná de
  // goedkeuring — er bestaat tot dat moment geen account om het bij te
  // bewaren. Het veld verdwijnt dus uit stap 1.
  const wwVeld = document.getElementById('regPasswordField');
  const groep  = document.getElementById('regAuthFieldGroup');
  if (wwVeld && !editingMusicianId) {
    wwVeld.style.display = nodig ? 'none' : '';
    if (groep) groep.classList.toggle('single', nodig);
  }
}

// ─── Opslag van de aanvraag ──────────────────────────────────────────────────
// Alleen het nummer van de aanvraag, het adres van de ouder en de termijnen.
// Nooit de code uit de link — die kent alleen de ouder.
function ouderAanvraagLezen() {
  try { return JSON.parse(localStorage.getItem(OUDER_OPSLAG_KEY) || 'null'); }
  catch (e) { return null; }
}

function ouderAanvraagBewaren(gegevens) {
  try { localStorage.setItem(OUDER_OPSLAG_KEY, JSON.stringify(gegevens)); }
  catch (e) { console.error('Kon de aanvraag niet bewaren:', e); }
}

function ouderAanvraagWissen() {
  try { localStorage.removeItem(OUDER_OPSLAG_KEY); } catch (e) { /* zie boven */ }
}

// ─── Schermen binnen de wizard ───────────────────────────────────────────────
// De drie nieuwe schermen dragen `panel-ouder`, niet `panel`. goTo() in
// wizard.js koppelt `.panel` op volgorde aan het stapnummer; een zesde
// `.panel` zou die koppeling stilzwijgend verschuiven.
function ouderPaneelTonen(id) {
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.panel-ouder').forEach(p => p.classList.toggle('active', p.id === id));
  const balk = document.getElementById('stepsBar');
  if (balk) balk.style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function ouderPaneelSluiten() {
  document.querySelectorAll('.panel-ouder').forEach(p => p.classList.remove('active'));
  const balk = document.getElementById('stepsBar');
  if (balk) balk.style.display = '';
}

// ─── Onderdeel 2: het tussenscherm ───────────────────────────────────────────

function ouderStapTonen() {
  const naam = document.getElementById('ouderKindNaam');
  if (naam) naam.textContent = state.fname || 'je';
  const veld = document.getElementById('ouderEmail');
  const bewaard = ouderAanvraagLezen();
  if (veld && bewaard?.ouderEmail) veld.value = bewaard.ouderEmail;
  ouderPaneelTonen('ouderStap');
}

// "Later invullen": gewoon door naar stap 2. Het tussenscherm komt terug na de
// laatste stap, want zonder adres ontstaat er geen account.
function ouderStapOverslaan() {
  ouderPaneelSluiten();
  goTo(1);
}

async function ouderVerzoekVersturen() {
  const veld = document.getElementById('ouderEmail');
  const adres = (veld?.value || '').trim();
  clearFieldErrors(document.getElementById('ouderStap'));
  if (!adres) { setFieldError(veld, 'Vul het e-mailadres van je ouder of verzorger in'); return; }
  if (!emailFormaatGeldig(adres)) { setFieldError(veld, 'Dit adres klopt niet. Controleer het nog een keer'); return; }
  if (adres.toLowerCase() === (state.regEmail || '').toLowerCase()) {
    setFieldError(veld, 'Dit is je eigen e-mailadres. Vul het adres van je ouder of verzorger in');
    return;
  }

  const leeftijd = ouderLeeftijdUitVeld();
  if (!ouderToestemmingNodig(leeftijd)) { showToast('Er ging iets mis met je geboortedatum. Ga terug naar stap 1.'); return; }

  showSaving('Aanvraag versturen...', 'Een ogenblik geduld.');
  try {
    const gegevens = await ouderApi('start', {
      kind_voornaam: state.fname,
      kind_leeftijd: leeftijd,
      kind_email:    state.regEmail,
      ouder_email:   adres
    });
    hideSaving();
    ouderAanvraagBewaren({
      aanvraagId:      gegevens.aanvraag_id,
      ouderEmail:      adres,
      stand:           'open',
      vervaltOp:       gegevens.vervalt_op,
      verstuurd:       1,
      laatstVerstuurd: Date.now()
    });
    ouderPaneelSluiten();
    showToast('Je aanvraag is verstuurd. Je kunt gewoon verder.');
    goTo(1);
  } catch (e) {
    hideSaving();
    logCaught('ouderVerzoekVersturen', e);
    // Het e-mailadres van het kind wordt aan deze kant al getoetst, zodat hij
    // niet pas veertien dagen later hoort dat het al in gebruik is.
    if (/in gebruik/i.test(e.message || '')) {
      ouderPaneelSluiten();
      goTo(0);
      setFieldError(document.getElementById('regEmail'), 'Er bestaat al een account met dit e-mailadres. Probeer in te loggen, of gebruik een ander adres');
      return;
    }
    showToast(friendlyErrorMessage(e));
  }
}

// ─── Onderdeel 3: het wachtscherm ────────────────────────────────────────────

function ouderWachtTonen() {
  const bewaard = ouderAanvraagLezen();
  const adresEl = document.getElementById('ouderWachtAdres');
  if (adresEl) adresEl.textContent = bewaard?.ouderEmail || '';
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
    knop.style.opacity = '0.5';
    knop.style.cursor = 'not-allowed';
    if (regel) regel.textContent = 'Je hebt de aanvraag drie keer verstuurd. Klopt het adres niet? Wijzig het dan.';
    return;
  }

  const over = OUDER_HERSTUUR_MS - (Date.now() - (bewaard.laatstVerstuurd || 0));
  if (over > 0) {
    const minuten = Math.max(1, Math.ceil(over / 60000));
    knop.disabled = true;
    knop.style.opacity = '0.5';
    knop.style.cursor = 'not-allowed';
    if (regel) regel.textContent = `Je kunt over ${minuten} ${minuten === 1 ? 'minuut' : 'minuten'} opnieuw sturen.`;
    setTimeout(ouderHerstuurKnopBijwerken, Math.min(over, 30000));
  } else {
    knop.disabled = false;
    knop.style.opacity = '';
    knop.style.cursor = '';
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
    bewaard.verstuurd = (bewaard.verstuurd || 1) + 1;
    bewaard.laatstVerstuurd = Date.now();
    ouderAanvraagBewaren(bewaard);
    ouderHerstuurKnopBijwerken();
    showToast('Je aanvraag is opnieuw verstuurd.');
  } catch (e) {
    hideSaving();
    logCaught('ouderOpnieuwSturen', e);
    showToast(friendlyErrorMessage(e));
  }
}

// Het adres corrigeren zonder opnieuw te beginnen: terug naar het
// tussenscherm. De oude aanvraag vervalt zodra de nieuwe er is.
function ouderAdresWijzigen() {
  clearInterval(ouderStandTimer);
  ouderStapTonen();
}

async function ouderStandVerversen() {
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
    // Geen netwerk of de functie ligt eruit: stil laten staan. Het wachtscherm
    // klopt dan nog steeds, alleen ververst het even niet.
    console.error('Stand van de aanvraag niet op te halen:', e);
  }
}

// Bij "geweigerd" ziet het kind hetzelfde als bij "verlopen". Dat is bewust:
// hij hoort het van zijn ouder, niet van een scherm (besluit Ronald).
function ouderVerlopenTonen() {
  const kop  = document.getElementById('ouderWachtKop');
  const body = document.getElementById('ouderWachtBody');
  const acties = document.getElementById('ouderWachtActies');
  if (kop)  kop.textContent = 'Je aanvraag is verlopen';
  if (body) body.innerHTML = 'Na veertien dagen vervalt een aanvraag vanzelf. Je profiel staat nog klaar op dit toestel; je kunt het opnieuw versturen.';
  if (acties) {
    acties.innerHTML = '<button class="btn" onclick="ouderAdresWijzigen()">Opnieuw versturen</button>';
  }
  const rem = document.getElementById('ouderHerstuurRegel');
  if (rem) rem.textContent = '';
}

function ouderStoppenEnWissen() {
  showConfirm(
    'Weet je het zeker? Alles wat je hebt ingevuld wordt gewist. Je begint dan later opnieuw.',
    () => {
      clearInterval(ouderStandTimer);
      ouderAanvraagWissen();
      clearOnboardingProgress();
      ouderPaneelSluiten();
      showView('landing');
    },
    'Ja, stoppen',
    true
  );
}

// ─── Onderdeel 7: het wachtwoordscherm ───────────────────────────────────────

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

  // submitProfile() maakt het account aan zodra currentUser leeg is, en zet
  // daarna het hele profiel in één keer weg. Precies wat route A nodig heeft.
  await submitProfile();

  // Gelukt? Dan het nummer van de aanvraag aan het nieuwe profiel koppelen —
  // dat is het bewijs dat bij dit account een goedkeuring hoort.
  if (state.savedId && bewaard?.aanvraagId) {
    try { await ouderApi('koppelen', { aanvraag_id: bewaard.aanvraagId, musician_id: state.savedId }); }
    catch (e) { logCaught('ouderKoppelen', e); }
    ouderAanvraagWissen();
  }
}

// ─── De kant van de ouder: de goedkeuringspagina ─────────────────────────────

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
    // TT-330 (26-09-2026): een onbekende code leidt niet meer stil naar de
    // homepage. De ouder kwam daar zonder uitleg uit en wist niet wat hij
    // moest doen. Sinds TT-330 blijft elke link uit een eerdere mail werken;
    // deze melding blijft over voor een link die kapot of vervangen is.
    toestemmingMeldingTonen('The Talent Tent',
      ['Deze link werkt niet. Heb je meer mails van ons gekregen? Gebruik dan de knop in de nieuwste.']);
  }
}

// Eén opbouw voor elk eindscherm op deze pagina: kop plus meldingen.
function toestemmingMeldingTonen(kop, regels) {
  const vak = document.getElementById('toestemmingInhoud');
  if (!vak) return;
  vak.innerHTML = `
    <h1 class="panel-title">${escHtml(kop)}</h1>
    ${regels.map(r => `<p class="toestemming-melding">${escHtml(r)}</p>`).join('\n    ')}`;
}

// TT-332 (26-09-2026): de ouder weet na zijn antwoord niet dat hij klaar is.
// Beide eindschermen (toestemming en weigering) sluiten met dezelfde regel.
const TOESTEMMING_AFSLUITER = 'Je kunt dit venster nu sluiten.';

// TT-331 (26-09-2026): de knop in de mail "Je hebt toestemming" gaat naar
// #toestemming-gegeven. Het wachtende profiel staat alleen in de browser waar
// het kind begon (route A). Staat het hier, dan gaat het kind gewoon verder.
// Zo niet, dan zegt deze pagina waar het wel staat — in plaats van een lege
// wizard waarin hij opnieuw begint en zijn ouder een tweede aanvraag krijgt.
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
    <p class="toestemming-melding">${naam} heeft een profiel gemaakt op The Talent Tent
       en kan pas verder als jij toestemming geeft.</p>

    <div class="toestemming-blok">
      <h2>Wat The Talent Tent is</h2>
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
      <button class="btn" id="toestemmingJaKnop" onclick="ouderBesluit(true)" disabled>Toestemming geven</button>
      <button class="btn btn-ghost" onclick="ouderBesluit(false)">Weigeren</button>
    </div>`;
  toestemmingKnopBijwerken();
}

function toestemmingKnopBijwerken() {
  const vinkje = document.getElementById('toestemmingVinkje');
  const knop = document.getElementById('toestemmingJaKnop');
  if (!vinkje || !knop) return;
  knop.disabled = !vinkje.checked;
  knop.style.opacity = vinkje.checked ? '' : '0.5';
  knop.style.cursor = vinkje.checked ? '' : 'not-allowed';
}

function toestemmingAfgehandeldTonen(stand, beslotenOp) {
  const datum = beslotenOp ? nlDatum(beslotenOp) : '';
  const teksten = {
    goedgekeurd: `Dit is al geregeld${datum ? ' op ' + datum : ''}. Je hoeft niets meer te doen.`,
    geweigerd:   'Deze aanvraag is afgewezen. Er gebeurt verder niets.',
    verlopen:    'Deze link is verlopen. Een aanvraag vervalt na veertien dagen; je hoeft niets te doen.'
  };
  toestemmingMeldingTonen('The Talent Tent', [teksten[stand] || teksten.verlopen]);
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
        <h1 class="panel-title">Bedankt</h1>
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
  } catch (e) {
    hideSaving();
    logCaught('ouderBesluit', e);
    showToast(friendlyErrorMessage(e));
  }
}

// ─── Gedeeld ─────────────────────────────────────────────────────────────────

function nlDatum(iso) {
  try {
    return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch (e) { return ''; }
}

// Alle verkeer met de Edge Function loopt hier langs, zodat er één plek is die
// de werkelijke foutboodschap eruit haalt (zelfde aanpak als bij
// delete-own-account in musicians.js).
async function ouderApi(actie, gegevens) {
  const { data, error } = await db.functions.invoke('ouder-toestemming', {
    body: Object.assign({ actie }, gegevens)
  });
  if (error) throw new Error(await extractFnErrorDetail(error));
  if (data && data.error) throw new Error(data.error);
  return data || {};
}
