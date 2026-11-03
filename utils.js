// ─── Hulpfuncties ────────────────────────────────────────────────────────────

// Niet-blokkerende melding i.p.v. alert() — Plezier: licht en leuk, geen
// onderbrekende technische pop-up. Verdwijnt vanzelf na een paar seconden.
let toastTimer = null;
// Generieke bevestigingsdialoog voor destructieve acties (i.p.v. native confirm()).
let confirmCallback = null;
// TT-188 (03-09-2026, Ronald): rood was hardcoded op deze knop, dus élke
// aanroep van showConfirm() kreeg 'm — ook niet-destructieve acties zoals
// "Vragen" (founder-overdracht). Rood hoort alleen bij het echt verwijderen
// van een account. Vierde parameter 'danger' (standaard false/leeg) regelt
// dat nu per aanroep i.p.v. altijd aan te staan.
// TT-555 (03-11-2026): vijfde parameter cancelLabel. Na een gelukte melding is
// "Annuleren" fout: er valt niets meer te annuleren. Standaard "Annuleren".
function showConfirm(message, onConfirm, confirmLabel, danger, cancelLabel) {
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmNoBtn').textContent = cancelLabel || 'Annuleren';
  const yesBtn = document.getElementById('confirmYesBtn');
  yesBtn.textContent = confirmLabel || 'Ja, verwijderen';
  // TT-316 (24-09-2026): destructief is omlijnd in rood (.btn-danger), nooit
  // een rood vlak — huisstijl §5.
  yesBtn.classList.toggle('btn-danger', !!danger);
  yesBtn.classList.toggle('btn-primary', !danger);
  confirmCallback = onConfirm;
  document.getElementById('confirmModal').classList.add('visible');
}
function confirmModalYes() {
  document.getElementById('confirmModal').classList.remove('visible');
  const cb = confirmCallback;
  confirmCallback = null;
  if (cb) cb();
}

// Bevinding Ronald (10-08-2026): teller ontbrak bij het schrijven van een
// bericht ("0/2000 hadden we afgesproken"). Generiek gehouden zodat hij ook
// bij toekomstige velden met een maxlength hergebruikt kan worden.
function updateCharCounter(textareaId, counterId, max) {
  const el = document.getElementById(textareaId);
  const counter = document.getElementById(counterId);
  if (!el || !counter) return;
  const len = el.value.length;
  counter.textContent = `${len}/${max}`;
  counter.style.color = len >= max ? 'var(--danger)' : 'var(--muted)';
}

function showToast(msg, duration) {
  const el = document.getElementById('appToast');
  if (!el) { console.warn('Toast:', msg); return; }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), duration || 3500);
}

// Vertaalt technische fouten (Supabase/netwerk) naar begrijpelijke NL-tekst.
// Plezier-principe: foutmeldingen moeten vriendelijk zijn, geen technisch jargon.
// De volledige technische fout blijft altijd gelogd voor debugging.
// TT-353 (27-09-2026, Ronald): een nieuw wachtwoord gelijk aan het huidige gaf
// "Er ging iets mis". Supabase antwoordt 422, code `same_password`, "New
// password should be different from the old password" (gemeten in de console
// op talenttent.org). Eén tekst voor "Nieuw wachtwoord" en voor Instellingen;
// beide zetten hem bij het veld "Nieuw wachtwoord" (huisstijl §13.1).
const TEKST_ZELFDE_WACHTWOORD = 'Kies een ander wachtwoord dan je huidige.';

function isZelfdeWachtwoordFout(err) {
  return !!err && (err.code === 'same_password'
    || /different from the old password/i.test(err.message || ''));
}

// TT-481 (03-11-2026, besluit Ronald): Supabase weigert in productie een
// wachtwoord dat in lijsten van gelekte wachtwoorden staat (code
// `weak_password`). Eén tekst, bij het wachtwoordveld, op elke plek waar een
// wachtwoord wordt gekozen. In test staat de weigering niet aan (alleen Pro).
const TEKST_ZWAK_WACHTWOORD = 'Dit wachtwoord is te makkelijk te raden. Kies een ander wachtwoord';

function isZwakWachtwoordFout(err) {
  const msg = (err && err.message) ? err.message : String(err || '');
  return !!err && (err.code === 'weak_password'
    || /weak_password|known to be weak|easy to guess|pwned/i.test(msg));
}

// TT-481 (03-11-2026, besluit Ronald): één tekst voor "dit e-mailadres heeft al
// een account", op elke plek. Bij aanmelden (wizard, ouderroute): de eerste.
// Bij wijzigen, als je al bent ingelogd: de tweede. Zonder slotpunt: het zijn
// meldingen bij een veld (huisstijl §13.1).
const TEKST_ACCOUNT_BESTAAT = 'Je hebt al een account met dit e-mailadres. Log in en ga verder waar je was';
const TEKST_EMAIL_BEZET = 'Dit e-mailadres hoort al bij een ander account. Kies een ander e-mailadres';

// TT-445 (09-10-2026, Ronald): een eigen zin in de code (bijv. "Delen aanpassen
// is niet gelukt.") werd door friendlyErrorMessage() overschreven door de
// algemene tekst onderaan. Een fout die met eigenFout() is gemaakt, wordt
// ongewijzigd getoond.
function eigenFout(tekst) {
  const e = new Error(tekst);
  e.eigenTekst = true;
  return e;
}

// TT-517, 8D (31-10-2026): een wijziging die de database met zijn regels per
// rij weigert, geeft geen fout maar 0 rijen (TT-230). Wie dan "opgeslagen"
// meldt, meldt iets wat niet gebeurde. Elke opslag die de gebruiker doet,
// vraagt de geraakte rijen terug (.select()) en gaat door deze functie: 0 rijen
// wordt dezelfde fout als een geweigerde wijziging, met dezelfde tekst
// (friendlyErrorMessage, "row-level security").
function rijenGeraakt(res) {
  if (res.error || (res.data && res.data.length)) return res;
  return { data: res.data, error: { code: '42501', message: 'row-level security: 0 rijen geraakt' } };
}

// Tweede parameter `actie`: wat de gebruiker probeerde, als werkwoordsgroep
// ("je profiel opslaan"). Zonder bekende oorzaak noemt de melding die actie, zodat
// de gebruiker weet wat niet gelukt is. Met een bekende oorzaak staat de
// oorzaak in de melding, en wat je dan doet.
function friendlyErrorMessage(err, actie) {
  const msg = (err && err.message) ? err.message : String(err || '');
  console.error('Technische foutmelding:', msg);

  if (err && err.eigenTekst) return msg;
  // Nederlandse tekst uit de database (trigger): ongewijzigd tonen.
  if (/^Bevestig eerst je e-mailadres/i.test(msg)) return msg;
  if (/^Wacht op antwoord/i.test(msg)) return msg; // TT-481, trigger tt_berichtgrens
  if (isZelfdeWachtwoordFout(err)) return TEKST_ZELFDE_WACHTWOORD;
  if (isZwakWachtwoordFout(err)) return TEKST_ZWAK_WACHTWOORD + '.';
  const status = err && (err.status || err.statusCode);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline) return 'Je hebt geen internetverbinding. Probeer het opnieuw zodra je weer online bent.';

  if (/already registered|already exists/i.test(msg)) {
    return TEKST_ACCOUNT_BESTAAT + '.';
  }
  // TT-255 (11-09-2026, Ronald): een verkeerd wachtwoord gaf tot nu toe de
  // algemene tekst onderaan deze functie — "Er ging iets mis. Probeer het
  // opnieuw." Die zegt niet wat er fout ging en niet wat je eraan doet.
  // Supabase geeft bij een onbekend e-mailadres én bij een verkeerd
  // wachtwoord dezelfde fout ("Invalid login credentials"), met opzet: zo kan
  // niemand uitproberen welke e-mailadressen een account hebben. De tekst
  // hieronder benoemt daarom het wachtwoord — verreweg het vaakste geval —
  // zonder te beweren dat het e-mailadres bestaat. Eén zin, geen aanwijzing
  // erbij (Ronald, 11-09-2026): de knop "Toon" staat in het wachtwoordveld
  // en "Wachtwoord vergeten?" direct onder dit vak. Wie de melding leest,
  // kijkt al naar allebei.
  // Tekst aangepast 12-09-2026 (Ronald): "dit e-mailadres" → "het
  // e-mailadres". De melding staat sinds TT-247 bij het wachtwoordveld, niet
  // meer in een banner boven het formulier.
  if (/invalid login credentials|invalid_credentials|invalid grant/i.test(msg)) {
    return 'Dit wachtwoord hoort niet bij het e-mailadres.';
  }
  // Supabase knijpt het inloggen af na een paar mislukte pogingen. Zonder
  // deze regel kreeg de gebruiker precies op dat moment weer "Er ging iets
  // mis" — terwijl hij juist moet weten dat wachten genoeg is.
  if (/rate limit|too many requests|only request this after/i.test(msg)) {
    return 'Te veel pogingen achter elkaar. Probeer het straks opnieuw.';
  }
  if (/failed to fetch|network|networkerror|load failed/i.test(msg)) {
    return 'Geen verbinding met The Talent Tent. Controleer je internetverbinding en probeer het opnieuw.';
  }
  if (status === 429) {
    return 'Te veel pogingen achter elkaar. Wacht een minuut en probeer het opnieuw.';
  }
  if (status >= 500 || /timeout|timed out|bad gateway|service unavailable|gateway/i.test(msg)) {
    return 'De server reageert nu niet. Wacht een minuut en probeer het opnieuw. Wat je invulde blijft staan.';
  }
  if (/jwt|refresh token|invalid token|not authenticated|session (expired|not found|missing)/i.test(msg)) {
    return 'Je sessie is verlopen. Log opnieuw in en probeer het nog eens.';
  }
  if (/duplicate key|unique constraint/i.test(msg)) {
    return 'Dit bestaat al. Kies een andere naam en probeer het opnieuw.';
  }
  if (/permission denied|row-level security|violates row/i.test(msg)) {
    return 'Dit mag niet met dit account, of je bent uitgelogd. Log opnieuw in en probeer het nog eens.';
  }
  // Bugfix 23-08-2026 (P0, gemeld door Ronald: generieke foutmelding bij het
  // afronden van een nieuw profiel, "killing bij een jongere"). Vermoedelijke
  // oorzaak (Aanname — database niet zelf gezien): V-23 (12-08-2026) maakte
  // een beheersingsniveau per nummer optioneel in de UI ("mag ook later"),
  // maar de kolom musician_songs.mastery_level is destijds mogelijk niet
  // meebewogen naar nullable. Een null-waarde die tegen een NOT NULL-kolom
  // aanloopt gaf tot nu toe altijd de onherkenbare standaardmelding
  // hieronder — precies zo'n moment is voor een jonge gebruiker, na het
  // volledig doorlopen van de wizard, bijzonder ontmoedigend. Deze regel
  // zorgt dat zo'n fout voortaan een begrijpelijke, specifieke tekst geeft
  // in plaats van "Er ging iets mis. Probeer het opnieuw." — ongeacht welke
  // kolom het exact betreft.
  if (/null value in column|violates not-null constraint/i.test(msg)) {
    return 'Eén van de velden is niet ingevuld. Controleer je invoer en probeer het opnieuw.';
  }
  if (/violates check constraint/i.test(msg)) {
    return 'Eén van de ingevulde waarden wordt niet geaccepteerd. Controleer je invoer en probeer het opnieuw.';
  }
  // TT-87: weigeringen door Supabase Storage. De client controleert type en
  // grootte nu zelf, dus dit hoort niet meer voor te komen. Wijkt de lijst in
  // de bucket ooit af van AVATAR_MIME_TYPES/MEDIA_MIME_TYPES, dan leest de
  // gebruiker hier alsnog wat er mis is in plaats van "Er ging iets mis".
  if (/mime type|not supported|invalid_mime/i.test(msg)) {
    return 'Dit bestandsformaat wordt niet geaccepteerd. Gebruik JPG, PNG, GIF, WEBP, MP4 of MOV.';
  }
  if (/payload too large|exceeded the maximum|entity too large|te groot/i.test(msg)) {
    return 'Het bestand is te groot. Een profielfoto mag maximaal 5 MB zijn, media maximaal 50 MB.';
  }
  if (actie) {
    const a = String(actie);
    return a.charAt(0).toUpperCase() + a.slice(1) + ' is niet gelukt. Probeer het opnieuw. Wat je invulde blijft staan.';
  }
  return 'Dit is niet gelukt. Probeer het opnieuw.';
}

// ─── Veldfouten (TT-247, vorm vastgesteld 12-09-2026) ────────────────────────
// Zie huisstijl-en-consistentie.md §13.1. Eén component voor de hele app:
// wizard, bandformulier, inloggen, wachtwoord opnieuw instellen.
//
// De vorm: de rand van het veld wordt rood (--danger), de regel eronder is
// wit (--text), 12px, met een lijn-SVG van 14px ervoor. **Nooit rode tekst**
// — huisstijl §1.2, besluit Ronald 12-09-2026. De rand wijst het veld aan;
// dat is het hele signaal. De regel legt rustig uit wat er moet gebeuren.
//
// De regel wordt hier in JavaScript aangemaakt en weer opgeruimd. Bewuste
// keuze: anders had elk van de tientallen velden in index.html een eigen lege
// <p> nodig, en zou een nieuw veld die stilzwijgend kunnen missen.
const VELDFOUT_ICOON =
  '<svg class="field-msg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
  ' stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="9"/><path d="M12 7v6"/><path d="M12 16.5v.01"/></svg>';

function veldElement(el) {
  return (typeof el === 'string') ? document.getElementById(el) : el;
}

// Het element waarnaast de foutregel komt te staan. Bij een wachtwoordveld
// zit de knop "Toon" in dezelfde .password-wrap; de regel hoort ónder die
// wrap, niet ertussen.
function veldFoutAnker(el) {
  // Postcode en plaats: de foutregel staat onder de rij, over de volle
  // breedte, niet in de smalle kolom van 104px (.postcode-plaats).
  // Zoekveld voor nummers (TT-514): de regel staat onder de .song-search-wrap,
  // in de .field, zodat de 8px van huisstijl §3 geldt (gemeten: binnen de wrap
  // was het 0px) en de suggestielijst direct onder het veld blijft.
  return (el.closest && (el.closest('.password-wrap') || el.closest('.postcode-plaats-rij') || el.closest('.song-search-wrap'))) || el;
}

// TT-494: korte uitslag rechts op de labelregel (zie .field-uitslag in
// styles.css). `statusId` is het id van de statusregel onder het veld; het id
// van de uitslag volgt daaruit (…Status wordt …Uitslag). Leeg = weg.
function zetUitslag(statusId, tekst, goed) {
  const el = document.getElementById(statusId.replace('Status', 'Uitslag'));
  if (!el) return;
  el.textContent = tekst || '';
  el.classList.toggle('uitslag-goed', !!goed && !!tekst);
}

function setFieldError(el, msg) {
  el = veldElement(el);
  if (!el) return;
  el.classList.add('field-error');
  el.setAttribute('aria-invalid', 'true');

  const anker = veldFoutAnker(el);
  let regel = anker.nextElementSibling;
  if (!regel || !regel.classList || !regel.classList.contains('field-msg')) {
    regel = document.createElement('p');
    regel.className = 'field-msg';
    anker.parentNode.insertBefore(regel, anker.nextSibling);
  }
  regel.innerHTML = VELDFOUT_ICOON + '<span></span>';
  regel.querySelector('span').textContent = msg;

  // Herstel: de markering verdwijnt zodra de gebruiker dit veld wijzigt,
  // niet pas bij de volgende poging (huisstijl §13.1). Eén keer koppelen per
  // veld, anders stapelen de luisteraars op bij elke mislukte poging.
  if (!el.dataset.veldfoutGekoppeld) {
    el.dataset.veldfoutGekoppeld = '1';
    const weg = () => clearFieldError(el);
    el.addEventListener('input', weg);
    el.addEventListener('change', weg);
  }
}

function clearFieldError(el) {
  el = veldElement(el);
  if (!el || !el.classList.contains('field-error')) return;
  el.classList.remove('field-error');
  el.removeAttribute('aria-invalid');
  const anker = veldFoutAnker(el);
  const regel = anker.nextElementSibling;
  if (regel && regel.classList && regel.classList.contains('field-msg')) regel.remove();
}

// Ruimt alle veldfouten binnen een scherm of modal op. Aanroepen vóór een
// nieuwe controleronde, zodat een opgeloste fout niet blijft staan.
function clearFieldErrors(scope) {
  const root = veldElement(scope) || document;
  root.querySelectorAll('.field-error').forEach(clearFieldError);
}

// Toont alle fouten tegelijk en schuift naar het eerste foute veld.
// `fouten` is een lijst van [veld, tekst]. Geeft true terug als er fouten
// waren — dan stopt de aanroepende functie.
function showFieldErrors(fouten) {
  fouten = (fouten || []).filter(f => f && veldElement(f[0]));
  if (!fouten.length) return false;
  fouten.forEach(f => setFieldError(f[0], f[1]));

  const eerste = veldElement(fouten[0][0]);
  const beweegtNiet = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    eerste.scrollIntoView({ behavior: beweegtNiet ? 'auto' : 'smooth', block: 'center' });
  } catch (e) {
    eerste.scrollIntoView();
  }
  // Pas focussen als het schuiven klaar is; anders springt de pagina terug.
  setTimeout(() => {
    try { eerste.focus({ preventScroll: true }); } catch (e) { /* oud toestel */ }
  }, beweegtNiet ? 0 : 300);
  return true;
}

// TT-258: het formaat van een e-mailadres. De browser accepteert bij
// type="email" ook "a@b" zonder punt; deze controle is strenger en overal in
// de app dezelfde.
function emailFormaatGeldig(v) {
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test((v || '').trim());
}

// ─── Zoeken op naam (TT-257, besluit Ronald 12-09-2026) ──────────────────────
// De algemene webstandaard: zonder aanhalingstekens matcht een deel van de
// naam, mét aanhalingstekens moet het exact zijn.
//
// Waarom dit een eigen functie is: tot 12-09-2026 plakte search.js voornaam en
// gebruikersnaam aan elkaar tot één tekst en zocht daar een deelreeks in. Een
// zoekterm met een spatie kon daardoor over de grens tussen de twee velden
// matchen. Hier wordt elk veld apart getoetst.
function naamZoekTerm(ruw) {
  const v = (ruw || '').trim();
  if (!v) return null;
  const m = v.match(/^"(.*)"$/) || v.match(/^'(.*)'$/);
  if (m) {
    const exact = m[1].trim();
    return exact ? { tekst: exact.toLowerCase(), exact: true } : null;
  }
  return { tekst: v.toLowerCase(), exact: false };
}

// Toetst een zoekterm tegen één of meer velden. Elk veld apart, nooit aan
// elkaar geplakt. Geen term = alles voldoet.
function naamMatcht(term, ...velden) {
  if (!term || !term.tekst) return true;
  return velden.some(w => {
    const s = (w || '').trim().toLowerCase();
    if (!s) return false;
    return term.exact ? s === term.tekst : s.includes(term.tekst);
  });
}

// TT-420 (09-10-2026): de gekozen naam van een lijst muzikanten ophalen. De
// publieke functies (tt_get_musicians_public e.a.) geven hem niet mee, dus
// komt hij er apart bij, in één vraag: tt_weergavenamen(ids). Dat geldt voor
// bezoeker en ingelogde gelijk. De functie geeft alleen id en weergavenaam
// terug, nooit fname of lname. Mislukt de vraag, dan blijft het object zonder
// weergavenaam en toont displayNameOf() de gebruikersnaam.
// TT-532: een lijst id's gaat in het webadres mee; vanaf ongeveer 650 id's
// weigert de database de vraag (gemeten 27-10-2026). Daarom in delen van 200,
// tegelijk. `vraag(deel)` geeft één databasevraag; het antwoord heeft de vorm
// { data, error } van één vraag.
// Een vraag van Supabase start pas bij `await` of `.then()` (Geverifieerd
// 28-10-2026, TT-537). Moet een vraag nu al lopen terwijl het antwoord pas
// later nodig is, zet hem dan in vraagNu(). Een netwerkfout komt dan terug als
// { data: null, error }, net als een fout van de database: zo geeft een vraag
// die door een eerdere fout nooit wordt afgewacht, geen losse fout.
function vraagNu(vraag) {
  return vraag.then(r => r, e => ({ data: null, error: e }));
}

async function inDelen(ids, vraag) {
  const delen = [];
  for (let i = 0; i < ids.length; i += 200) delen.push(ids.slice(i, i + 200));
  const uit = await Promise.all(delen.map(vraag));
  const fout = uit.find(r => r.error);
  if (fout) return { data: null, error: fout.error };
  return { data: uit.flatMap(r => r.data || []), error: null };
}

// TT-367: `vraag` is een al gestarte vraag naar dezelfde (of meer) id's.
async function weergavenamenToevoegen(rijen, vraag) {
  const ids = (rijen || []).map(r => r && r.id).filter(Boolean);
  if (!ids.length) return rijen;
  try {
    const { data, error } = await (vraag || db.rpc('tt_weergavenamen', { ids }));
    if (error) throw error;
    const perId = {};
    (data || []).forEach(x => { perId[x.id] = x.weergavenaam; });
    rijen.forEach(r => { if (r && r.id in perId) r.weergavenaam = perId[r.id]; });
  } catch (e) {
    logCaught('weergavenamenToevoegen', e);
  }
  return rijen;
}

// TT-420: de naam zoals anderen hem zien, voor het voorbeeld onder de keuze in
// Wie ben je en voor de lengtecontrole. Dit spiegelt de databasefunctie
// tt_weergavenaam(); de database is leidend, dit is alleen een voorbeeld.
// Onder de 16 staat altijd de gebruikersnaam.
function naamZoalsAnderen(fname, lname, username, keuze, leeftijd) {
  const voor = (fname || '').trim();
  if (keuze === 'echt' && leeftijd >= 16 && voor) {
    return [voor, (lname || '').trim()].filter(Boolean).join(' ');
  }
  return (username || '').trim();
}

// B-02 (12-08-2026): één plek die de leeftijd bepaalt. Een ingelogde
// gebruiker leest de geboortedatum rechtstreeks; een bezoeker zonder account
// krijgt alleen `age` uit tt_get_musicians_public. Deze functie dekt beide.
function ageOf(m) {
  if (m && m.age != null) return m.age;
  return calcAgeFromISO(m && m.birth_date);
}

function calcAgeFromISO(isoDate) {
  if (!isoDate) return 0;
  const birth = new Date(isoDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}



// ─── Save overlay helpers ─────────────────────────────────────────────────────

function showSaving(title, msg) {
  const overlay = document.getElementById('saveOverlay');
  document.getElementById('saveSpinner').style.display = 'block';
  document.getElementById('saveTitle').textContent = title || 'Opslaan...';
  document.getElementById('saveMsg').textContent = msg || 'Je profiel wordt opgeslagen';
  document.getElementById('saveTitle').style.color = '';
  overlay.classList.add('visible');
}

// TT-252 (11-09-2026): tegenhanger van showSaving() voor formulieren die na
// het opslaan op hetzelfde scherm blijven (het bandformulier). De wizard
// gebruikt showSaveSuccess()/showSaveError(), die sluiten de laag zelf.
function hideSaving() {
  const overlay = document.getElementById('saveOverlay');
  if (overlay) overlay.classList.remove('visible');
}

function showSaveSuccess(isEdit) {
  document.getElementById('saveSpinner').style.display = 'none';
  if (isEdit) {
    document.getElementById('saveTitle').textContent = 'Profiel bijgewerkt!';
    document.getElementById('saveMsg').textContent = 'Je wijzigingen zijn opgeslagen.';
  } else {
    document.getElementById('saveTitle').textContent = 'Profiel aangemaakt!';
    document.getElementById('saveMsg').textContent = 'Welkom bij The Talent Tent! Je gaat naar je profiel...';
  }
  setTimeout(() => {
    document.getElementById('saveOverlay').classList.remove('visible');
    // TT-32 (07-08-2026): net als bij onUserLoggedIn() — een gloednieuw
    // account dat via het chat-icoon in de registratiewizard belandde, gaat
    // na de laatste stap direct naar de composer i.p.v. naar Mijn Profiel.
    if (!isEdit && pendingMessageRecipient) {
      const recipient = pendingMessageRecipient;
      pendingMessageRecipient = null;
      showView('search');
      openMessageComposer(recipient.id, recipient.displayName);
      return;
    }
    showView('myprofile');
  }, isEdit ? 1200 : 2000);
}

function showSaveError(msg, actie) {
  document.getElementById('saveSpinner').style.display = 'none';
  document.getElementById('saveTitle').textContent = 'Oeps...';
  document.getElementById('saveTitle').style.color = 'var(--accent)';

  const isAlreadyRegistered = /already registered|already exists/i.test(msg);

  if (isAlreadyRegistered) {
    document.getElementById('saveMsg').innerHTML =
      `${TEKST_ACCOUNT_BESTAAT}.<br><br>
       <button class="btn btn-primary" style="width:100%;margin-bottom:8px;" onclick="goToLoginFromError()">Inloggen →</button>
       <button class="btn btn-ghost" style="width:100%;" onclick="document.getElementById('saveOverlay').classList.remove('visible')">Sluiten</button>`;
    return;
  }

  document.getElementById('saveMsg').innerHTML =
    `<span style="color:var(--accent);font-size:12px;">${escHtml(friendlyErrorMessage(msg, actie))}</span><br><br>
     <button class="btn btn-ghost" style="margin-top:8px;" onclick="document.getElementById('saveOverlay').classList.remove('visible')">Sluiten</button>`;
}

function goToLoginFromError() {
  document.getElementById('saveOverlay').classList.remove('visible');
  showView('auth');
  const emailField = document.getElementById('loginEmail');
  if (emailField) emailField.value = state.regEmail || '';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcAge(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split('-').map(Number);
  const birth = new Date(yyyy, mm - 1, dd);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// DD-MM-YYYY auto-format while typing
function formatBirthDate(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 8);
  if (v.length >= 5) v = v.slice(0,2) + '-' + v.slice(2,4) + '-' + v.slice(4);
  else if (v.length >= 3) v = v.slice(0,2) + '-' + v.slice(2);
  input.value = v;
}

// TT-80 (10-08-2026, bevinding Ronald: "Alphen aan den Rijn" werd fout
// "Alphen Aan Den Rijn"). Geverifieerd (Taaladvies.net): Nederlandse
// aardrijkskundige namen houden voorzetsels/lidwoorden ("aan", "den", "op",
// "van", ...) met een kleine letter, behalve als zo'n woord het eerste woord
// van de naam is. "'s"/"'t" (los, bijv. "'s Heerenberg", of met streepje,
// bijv. "'s-Gravenhage") blijven altíjd met een kleine letter, ook als eerste
// woord. "IJ" als digraph (IJssel, IJmuiden) krijgt beide letters een
// hoofdletter — een bekende, algemene Nederlandse schrijfregel; niet apart
// getest tegen elke afzonderlijke rij in postcode_cache.
function normalizeCityName(city) {
  const ALTIJD_KLEIN = new Set(["'s", "'t", "’s", "’t"]);
  const KLEIN_TENZIJ_EERSTE_WOORD = new Set(['aan','de','den','der','het','in','onder','op','over','te','ten','ter','van','bij']);
  return city
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      if (ALTIJD_KLEIN.has(word)) return word;
      if (i > 0 && KLEIN_TENZIJ_EERSTE_WOORD.has(word)) return word;
      let result;
      if (/^('s-|’s-|'t-|’t-)/.test(word)) {
        result = word.slice(0, 3) + word.slice(3).replace(/\b\w/g, c => c.toUpperCase());
      } else {
        result = word.replace(/\b\w/g, c => c.toUpperCase());
      }
      return result.replace(/\bIj/g, 'IJ');
    })
    .join(' ');
}

// ─── iTunes Search API — twee-velden zoekfunctie ─────────────────────────────
// TT-139 (24-08-2026): vervangt MusicBrainz. Zie zoekfunctienaslagwerk.md §15
// voor de volledige afweging. Artiest zoeken via /search?entity=musicArtist,
// daarna per artiest ÉÉN keer de volledige nummerlijst ophalen via
// /lookup?id=<artistId>&entity=song — wat er wordt getypt in het nummerveld
// filtert daarna lokaal, zonder nieuw netwerkverkeer per toetsaanslag. Dit
// past bij Apple's eigen aanbeveling om zoek-/lookupresultaten te bewaren
// (cachen) en houdt het verzoekvolume ruim onder de snelheidslimiet
// (~20 verzoeken/minuut).

let itunesSearchTimeout = null;
let selectedArtist  = null; // { id, name }

function closeAC(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

// Stap A: Artiest zoeken
// TT-526: alleen uit een lijst die openstaat. Een dichte lijst kan nog oude
// suggesties bevatten; Enter mag die nooit kiezen.
function selectFirstAC(listId) {
  const list = document.getElementById(listId);
  if (!list || !list.classList.contains('open')) return;
  const first = list.querySelector('.ac-item[onmousedown]');
  if (first && first.onmousedown) first.onmousedown();
}

const itunesArtistCache = new Map(); // query (lowercase) -> artists[]
const itunesTrackCache = new Map();  // artistId -> songs[] (of een lopende Promise), volledige lijst van die artiest

async function onArtistSearch(q) {
  const ac = document.getElementById('acArtistList');
  clearTimeout(itunesSearchTimeout); // TT-526: een oudere vraag tekent niet meer na
  if (q.length < 2) { ac.classList.remove('open'); return; }

  // Direct visuele feedback tonen (i.p.v. pas na de 400ms-vertraging).
  ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted)">Zoeken...</span></div>';
  ac.classList.add('open');

  const cacheKey = q.toLowerCase();
  if (itunesArtistCache.has(cacheKey)) {
    renderArtistResults(ac, itunesArtistCache.get(cacheKey), q, 'selectArtist');
    return;
  }

  itunesSearchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=7&country=NL`
      );
      const data = await res.json();
      const artists = (data.results || []).slice(0, 6);
      itunesArtistCache.set(cacheKey, artists);
      renderArtistResults(ac, artists, q, 'selectArtist');
    } catch(e) {
      logCaught('onArtistSearch', e);
      ac.innerHTML = '<div class="ac-item"><span style="color:var(--danger)">Zoeken lukt nu niet. Controleer je verbinding en typ opnieuw</span></div>';
    }
  }, 400);
}

function renderArtistResults(ac, artists, q, selectFnName) {
  if (!artists.length) {
    ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted)">Geen artiesten gevonden</span></div>';
    return;
  }
  ac.innerHTML = artists.map(a => {
    const genre = a.primaryGenreName ? ` <span style="color:var(--muted);font-size:11px;">(${escHtml(a.primaryGenreName)})</span>` : '';
    return `<div class="ac-item" onmousedown="${selectFnName}('${jsAttr(a.artistId)}','${jsAttr(a.artistName)}')">
      <strong>${highlight(a.artistName, q)}</strong>${genre}
    </div>`;
  }).join('');
}

// Artiest geselecteerd → nummerveld tonen
async function selectArtist(id, name) {
  selectedArtist = { id, name };
  document.getElementById('artistSearch').value = name;
  closeAC('acArtistList');

  // Toon het nummerveld
  const wrap = document.getElementById('trackSearchWrap');
  wrap.style.display = 'block';
  document.getElementById('trackSearchLabel').textContent = `Nummer van ${name}`;
  document.getElementById('trackSearch').value = '';
  document.getElementById('trackSearch').focus();
  closeAC('acTrackList');
}

// Haalt éénmalig per artiest de volledige nummerlijst op (iTunes lookup).
// De cache houdt ook een lopende Promise vast, zodat twee snelle toets-
// aanslagen niet allebei een eigen verzoek starten.
async function fetchArtistSongs(artistId) {
  if (itunesTrackCache.has(artistId)) return itunesTrackCache.get(artistId);
  const fetchPromise = (async () => {
    const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(artistId)}&entity=song&limit=200&country=NL`;
    const res = await fetch(url);
    const data = await res.json();
    // Eerste record is de artiest zelf (wrapperType 'artist'); de rest zijn nummers.
    return (data.results || []).filter(r => r.wrapperType === 'track');
  })();
  itunesTrackCache.set(artistId, fetchPromise);
  const songs = await fetchPromise;
  itunesTrackCache.set(artistId, songs); // Promise vervangen door het echte resultaat
  return songs;
}

// Stap B: Nummer zoeken binnen geselecteerde artiest — lokaal filteren,
// geen apart netwerkverzoek per toetsaanslag zodra de artiest-nummerlijst er is.
async function onTrackSearch(q) {
  const ac = document.getElementById('acTrackList');
  if (!selectedArtist) return;
  if (q.length < 1) { ac.classList.remove('open'); return; }

  ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted)">Zoeken...</span></div>';
  ac.classList.add('open');

  try {
    const songs = await fetchArtistSongs(selectedArtist.id);
    renderTrackResults(ac, songs, q, selectedArtist, 'addSong', state.songs);
  } catch(e) {
    logCaught('onTrackSearch', e);
    ac.innerHTML = '<div class="ac-item"><span style="color:var(--danger)">Zoeken lukt nu niet. Controleer je verbinding en typ opnieuw</span></div>';
  }
}

function renderTrackResults(ac, songs, q, artist, addFnName, existingList) {
  const qLower = q.toLowerCase();
  const seen = new Set();
  const results = (songs || [])
    .filter(r => {
      const title = r.trackName;
      if (!title) return false;
      if (!title.toLowerCase().includes(qLower)) return false;
      const key = title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      if (existingList.find(s =>
        s.title.toLowerCase() === title.toLowerCase() &&
        s.artist.toLowerCase() === artist.name.toLowerCase()
      )) return false;
      return true;
    })
    .slice(0, 8);

  if (!results.length) {
    ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted)">Geen nummers gevonden</span></div>';
    return;
  }

  ac.innerHTML = results.map(r =>
    `<div class="ac-item" onmousedown="${addFnName}('${jsAttr(r.trackName)}','${jsAttr(artist.name)}')">
      <strong style="font-size:12px;">${highlight(r.trackName, q)}</strong>
      <span style="font-size:12px;color:var(--muted);">${escHtml(artist.name)}</span>
    </div>`
  ).join('');
}

// ─── Data ───────────────────────────────────────────────────────────────────

// 21-08-2026: "Anders" weggehaald. Zonder vrij tekstveld kan iemand toch
// niet aangeven wélk instrument dat dan is — de optie voegde niets toe en
// kostte wel eenduidigheid in de matching. Bestaande profielen met "Anders"
// (indien aanwezig) blijven gewoon werken; zie de toelichting bij
// PICKER_LABEL_BREAKS hieronder voor hetzelfde principe.
// TT-124 (22-08-2026): alfabetisch, op Ronalds verzoek. Alleen de weergave-
// volgorde wijzigt — instrumenten/genres worden als tekst opgeslagen, niet
// als locatienummer in deze lijst, dus dit raakt geen bestaande profielen
// of de matching.
const INSTRUMENTS = [
  'Basgitaar', 'Cello', 'Conga / Bongo', 'DJ / Electronica', 'Drums',
  'Gitaar, akoestisch', 'Gitaar, elektrisch', 'Harmonica (mondharmonica)',
  'Keyboard', 'Piano', 'Saxofoon', 'Songwriting', 'Tamboerijn', 'Trompet',
  'Ukulele', 'Viool', 'Zang'
];

// "Anders" verwijderd (22-08-2026, Ronald) — zelfde reden als bij
// INSTRUMENTS op 21-08-2026: zonder vrij tekstveld kan iemand toch niet
// aangeven wélk genre dat dan is. Bestaande profielen met "Anders" blijven
// gewoon werken, ze kunnen het alleen niet opnieuw kiezen.
const GENRES = [
  'Blues', 'Country', 'Electronic', 'Folk / Akoestisch', 'Funk', 'Hip-hop',
  'Indie', 'Jazz', 'Klassiek', 'Metal', 'Pop', 'Punk', 'R&B / Soul',
  'Reggae', 'Rock'
];

// ─── Sortering repertoire ───────────────────────────────────────────────────
// Bevinding Ronald (10-08-2026): repertoire overal alfabetisch op band/artiest,
// dan op titel — anders is het lastig zoeken in een lange lijst.
function compareArtistTitle(artistA, titleA, artistB, titleB) {
  const byArtist = (artistA || '').localeCompare(artistB || '', 'nl', { sensitivity: 'base' });
  if (byArtist !== 0) return byArtist;
  return (titleA || '').localeCompare(titleB || '', 'nl', { sensitivity: 'base' });
}

// ─── Autocomplete helpers ─────────────────────────────────────────────────────

// ─── Veiligheidshelpers (TT-05) ───────────────────────────────────────────────
// Alles wat een gebruiker (of een externe bron zoals iTunes) invoert en dat
// via innerHTML op het scherm komt, moet hier eerst doorheen. Anders wordt
// ingetypte HTML als HTML uitgevoerd i.p.v. als tekst getoond.
//
//   escHtml()  → tekst tussen tags én elke waarde in een HTML-attribuut
//                (aria-label, title, alt, value, data-...)
//   jsAttr()   → een string ín een JS-aanroep ín een attribuut (onclick):
//                eerst ontsmet voor JS, daarna voor HTML
//   safeUrl()  → alleen http/https/blob toestaan in href en src; de uitkomst
//                is al HTML-veilig en gaat zonder extra ontsmetting in src/href
//   TT-483 (21-10-2026): escAttr bestaat niet meer. Het ontsmette alleen voor
//   JS en stond op ruim twintig plekken in HTML-attributen, waar een
//   aanhalingsteken in een naam het attribuut openbrak. Gebruik nooit een
//   JS-ontsmetting voor een HTML-attribuut.

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

function jsAttr(s) {
  return escHtml(String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' '));
}

// TT-553 (besluit Ronald 03-11-2026: a). Tekst voor de bio en "Wie zijn we":
// een woord van LANG_WOORD_TEKENS tekens of meer (bijna altijd een geplakte
// link) staat op één regel met "(meer)"; een tik toont het hele woord. De rest
// gaat door escHtml, zoals altijd.
const LANG_WOORD_TEKENS = 20;
function tekstMetMeerHTML(tekst) {
  return String(tekst ?? '').split(/(\s+)/).map(w => w.length >= LANG_WOORD_TEKENS && !/\s/.test(w)
    ? `<span class="lang-woord"><span class="lang-woord-tekst">${escHtml(w)}</span><button type="button" class="lang-woord-meer" onclick="langWoordOpen(this)" aria-label="Toon het hele woord">(meer)</button></span>`
    : escHtml(w)).join('');
}
function langWoordOpen(knop) { knop.parentElement.classList.add('open'); }
// Past een lang woord toch op de regel, dan verdwijnt "(meer)" (.past). Gemeten
// in het volgende beeld (les 8D 03-11-2026: nooit in de melding zelf de maat
// wijzigen), ook bij draaien van het toestel en voor tekst die later komt.
(function langWoordenVolgen() {
  if (!window.ResizeObserver || !window.MutationObserver || !document.body) return;
  const kijker = new ResizeObserver(lijst => requestAnimationFrame(() => lijst.forEach(e => {
    const t = e.target;
    if (t.parentElement) t.parentElement.classList.toggle('past', t.scrollWidth <= t.clientWidth + 1);
  })));
  const volg = el => {
    if (el.nodeType !== 1) return;
    (el.classList.contains('lang-woord-tekst') ? [el] : [...el.getElementsByClassName('lang-woord-tekst')]).forEach(t => kijker.observe(t));
  };
  volg(document.body);
  new MutationObserver(m => m.forEach(x => x.addedNodes.forEach(volg))).observe(document.body, { childList: true, subtree: true });
})();

// javascript:-URL's zijn hier het echte risico: die voeren code uit zodra
// iemand op de link klikt. blob: is toegestaan omdat de lokale foto-preview
// die gebruikt (URL.createObjectURL).
function safeUrl(u) {
  const s = String(u ?? '').trim();
  return /^(https?:\/\/|blob:)/i.test(s) ? escHtml(s) : '';
}

/* Fotootje (28-10-2026, TT-537, besluit Ronald: optie b). Naast elke foto in
   `avatars` (profiel- en bandfoto) en `media` (de mediahoek) staat een
   vierkante versie van FOTO_KLEIN_PX pixels, met dezelfde naam plus
   `_klein.jpg` (uploadToStorage() in wizard.js). Lijsten en de mediategels
   tonen het fotootje; de hoes van een profiel (TT-517 fase 4) en een tik op
   de foto tonen de grote. De grootste plek is 80 pixels; 240 dekt een
   scherm met drie beeldpunten per pixel. Een GIF heeft geen fotootje.
   Ontbreekt het fotootje (een foto van vóór deze wijziging, een half gelukte
   upload, een oude versie van de app), dan krijgt het de tijdelijke link van
   de grote foto (fotoLinksOphalen, TT-480); de luisteraar hieronder is het
   vangnet. */
const FOTO_KLEIN_PX = 240;
function fotoKleinPad(pad) {
  return String(pad).replace(/\.[^./]*$/, '') + '_klein.jpg';
}
// `src` komt uit safeUrl(). Geeft de bron-attributen voor een <img>.
function kleinFotoAttr(src) {
  if (!fotoLinkSleutel(src) || src.endsWith('_klein.jpg') || /\.gif$/i.test(src)) return fotoBronAttr(src);
  return `${fotoBronAttr(fotoKleinPad(src))} data-groot="${src}"`;
}
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement) || !img.dataset.groot) return;
  const groot = img.dataset.groot;
  delete img.dataset.groot;
  fotoBronZetten(img, groot);
}, true);

/* Afgeschermde foto's en video's (TT-480, akkoord Ronald 30-10-2026). De
   mappen `avatars` en `media` zijn dicht: een bestand laadt alleen via een
   tijdelijke link van 7 dagen. De database bewaart de openbare link; daaruit
   leest de app map en pad. Wie een link mag maken, staat in de opslagregels
   (systeem-naslag §10): ingelogd alles; een bezoeker zonder account niets van
   13 t/m 15 jaar of een onbekende leeftijd.
   - fotoBronAttr(src) geeft src="<tijdelijke link>" als de app de link al
     heeft, anders data-tt-foto="<openbare link>". Een DOM-wachter vraagt dan
     alle ontbrekende links van het scherm in één keer op (één vraag per map)
     en zet src. Ontbreekt een fotootje, dan krijgt het de link van de grote
     foto.
   - fotoBronZetten(el, src) doet hetzelfde voor één element (de vergroting).
   - De links staan 7 dagen in localStorage. Tot een dag voor het verlopen
     gebruikt de app dezelfde link, zodat de browser de foto uit zijn eigen
     opslag haalt: een tweede bezoek kost geen extra tijd.
   - Uitloggen wist de onthouden links (signOut in auth.js).
   Een andere bron (landing, YouTube, blob) blijft ongewijzigd. */
const FOTO_LINK_SEC = 7 * 24 * 3600;
const FOTO_LINK_MARGE_MS = 24 * 3600 * 1000;
const FOTO_LINK_OPSLAG = 'tt_fotolinks';
const FOTO_LINK_MAX = 600;
const FOTO_AFGESCHERMD = /\/storage\/v1\/object\/public\/(avatars|media)\/([^?#]+)/;
let fotoLinks = null;              // 'map/pad' -> [link, verloopt in ms]
const fotoLinksOnderweg = new Map(); // 'map/pad' -> Promise

function fotoLinksGeheugen() {
  if (fotoLinks) return fotoLinks;
  fotoLinks = new Map();
  try {
    const nu = Date.now();
    Object.entries(JSON.parse(localStorage.getItem(FOTO_LINK_OPSLAG) || '{}')).forEach(([k, v]) => {
      if (Array.isArray(v) && v[1] - FOTO_LINK_MARGE_MS > nu) fotoLinks.set(k, v);
    });
  } catch (e) { /* geen opslag: alleen in het geheugen */ }
  return fotoLinks;
}
function fotoLinksBewaren() {
  const g = fotoLinksGeheugen();
  while (g.size > FOTO_LINK_MAX) g.delete(g.keys().next().value);
  try { localStorage.setItem(FOTO_LINK_OPSLAG, JSON.stringify(Object.fromEntries(g))); } catch (e) { /* zie boven */ }
}
function fotoLinksWissen() {
  fotoLinks = new Map();
  try { localStorage.removeItem(FOTO_LINK_OPSLAG); } catch (e) { /* zie boven */ }
}
// 'avatars/<pad>' bij een afgeschermde map, anders null.
function fotoLinkSleutel(src) {
  const m = FOTO_AFGESCHERMD.exec(String(src || ''));
  return m ? m[1] + '/' + decodeURIComponent(m[2]) : null;
}
// De tijdelijke link; de bron zelf als hij niet afgeschermd is; null als de
// app de link nog niet heeft.
function fotoLinkUitGeheugen(src) {
  const k = fotoLinkSleutel(src);
  if (!k) return src;
  const v = fotoLinksGeheugen().get(k);
  return v && v[1] - FOTO_LINK_MARGE_MS > Date.now() ? v[0] : null;
}
// Haalt de links voor deze sleutels op: één vraag per map, tegelijk.
async function fotoLinksOphalen(sleutels) {
  const wacht = [], perMap = {};
  sleutels.forEach(k => {
    if (fotoLinksOnderweg.has(k)) { wacht.push(fotoLinksOnderweg.get(k)); return; }
    const i = k.indexOf('/');
    (perMap[k.slice(0, i)] = perMap[k.slice(0, i)] || []).push(k.slice(i + 1));
  });
  Object.entries(perMap).forEach(([map, paden]) => {
    const vraag = (async () => {
      try {
        const { data, error } = await db.storage.from(map).createSignedUrls(paden, FOTO_LINK_SEC);
        if (error) throw error;
        const tot = Date.now() + FOTO_LINK_SEC * 1000, g = fotoLinksGeheugen(), mis = [];
        (data || []).forEach(r => {
          if (r && r.signedUrl && !r.error) g.set(map + '/' + r.path, [r.signedUrl, tot]);
          else if (r && r.path) mis.push(r.path);
        });
        // Een fotootje dat ontbreekt, krijgt de link van de grote foto.
        mis.forEach(p => {
          const groot = paden.find(x => x !== p && fotoKleinPad(x) === p);
          const v = groot && g.get(map + '/' + groot);
          if (v) g.set(map + '/' + p, v);
        });
        const echtMis = mis.filter(p => !g.has(map + '/' + p) && !p.endsWith('_klein.jpg'));
        if (echtMis.length) logCaught('fotoLinks', new Error(`geen link voor ${echtMis.length} bestand(en) in ${map}`));
        fotoLinksBewaren();
      } catch (e) {
        logCaught('fotoLinks', e);
      } finally {
        paden.forEach(p => fotoLinksOnderweg.delete(map + '/' + p));
      }
    })();
    paden.forEach(p => fotoLinksOnderweg.set(map + '/' + p, vraag));
    wacht.push(vraag);
  });
  await Promise.all(wacht);
}
// `src` komt uit safeUrl() en mag een #-deel hebben (#t=0.1 bij een video).
function fotoBronAttr(src) {
  const [basis, achter] = String(src).split(/(?=#)/);
  const link = fotoLinkUitGeheugen(basis);
  if (link === basis) return `src="${src}"`;
  if (link) return `src="${escHtml(link)}${achter || ''}"`;
  return `data-tt-foto="${src}"`;
}
async function fotoBronZetten(el, src) {
  const [basis, achter] = String(src).split(/(?=#)/);
  let link = fotoLinkUitGeheugen(basis);
  if (link === null) {
    el.removeAttribute('src');
    await fotoLinksOphalen([fotoLinkSleutel(basis)]);
    link = fotoLinkUitGeheugen(basis);
  }
  if (link) el.src = link + (achter || '');
}
// De DOM-wachter: zet elke data-tt-foto om in een src.
let fotoAanvullenGepland = false;
async function fotoLinksAanvullen() {
  fotoAanvullenGepland = false;
  const els = [...document.querySelectorAll('[data-tt-foto]')];
  if (!els.length) return;
  const nodig = new Set();
  els.forEach(el => [el.dataset.ttFoto, el.dataset.groot].forEach(s => {
    const basis = s && s.split('#')[0];
    if (basis && fotoLinkUitGeheugen(basis) === null) nodig.add(fotoLinkSleutel(basis));
  }));
  if (nodig.size) await fotoLinksOphalen([...nodig]);
  els.forEach(el => {
    const s = el.dataset.ttFoto;
    if (!s) return;
    const [basis, achter] = s.split(/(?=#)/);
    const link = fotoLinkUitGeheugen(basis);
    if (!link) return;
    el.removeAttribute('data-tt-foto');
    el.src = link + (achter || '');
  });
}
new MutationObserver(() => {
  if (fotoAanvullenGepland) return;
  fotoAanvullenGepland = true;
  queueMicrotask(fotoLinksAanvullen);
}).observe(document.documentElement, { childList: true, subtree: true });

// TT-U04 (12-08-2026): maakt een wachtwoord zichtbaar. Vervangt het
// herhaalveld — je kunt zelf controleren wat je hebt getypt.
function togglePassword(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const toon = el.type === 'password';
  el.type = toon ? 'text' : 'password';
  btn.textContent = toon ? 'Verberg' : 'Toon';
  btn.setAttribute('aria-label', toon ? 'Verberg wachtwoord' : 'Toon wachtwoord');
}

// TT-35 (07-08-2026): Enter-toets laten werken als "verder"/"zoeken" op
// tekstvelden waar dat intuïtief is (inloggen, registreren, wachtwoord
// vergeten/opnieuw instellen, zoekvelden) — Ronald: "maak de enter-knop
// actief voor het verdergaan". Shift+Enter blijft gewoon een nieuwe regel
// toestaan op velden waar dat relevant is (niet hier, alleen textareas
// zoals de berichten-composer gebruiken die uitzondering al niet nodig).
function submitOnEnter(event, fn) {
  if (event.key === 'Enter') {
    event.preventDefault();
    fn();
  }
}

// TT-30 (07-08-2026): effen tags i.p.v. ovale outline-badges op de
// zoekresultaten. TT-315 (24-09-2026, besluit Ronald: "minder rommelig, het
// meest clean"): het vlak is voor elke tag hetzelfde, wit op 5%
// (huisstijl §1.1). De kleur zit alleen in de tekst. Tot die dag was het vlak
// de tekstkleur op 16% dekking; bij goud gaf dat olijfbruin.
function tagSolid(text) {
  return `<span class="tag-solid">${escHtml(text)}</span>`;
}

// ─── Zoektekst veilig maken voor een Supabase-query (TT-26) ─────────────────
// Twee verschillende risico's, twee helpers:
//  1. likeSafe(): %, _, * en \ zijn jokertekens in een ilike-patroon. Iemand
//     die "a%b" typt zou anders onbedoeld veel te breed matchen. Gebruikers
//     bedoelen deze tekens hier nooit letterlijk, dus we halen ze eruit.
//  2. orValue(): binnen .or(...) scheidt PostgREST de voorwaarden met komma's.
//     Een komma in de zoekterm breekt die syntax open. Door de waarde tussen
//     dubbele quotes te zetten telt de komma als gewone tekst.
function likeSafe(s) {
  return String(s ?? '').replace(/[%_*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function orValue(s) {
  return '"' + String(s ?? '').replace(/["\\]/g, '') + '"';
}

function highlight(text, q) {
  const t = String(text ?? '');
  const query = String(q ?? '');
  const idx = query ? t.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (idx === -1) return escHtml(t);
  return escHtml(t.slice(0, idx))
    // 24-09-2026: de treffer stond op een vlak van goud op 30% — olijfbruin,
    // huisstijl §1.1. Nu zit het goud in de letters zelf.
    + `<mark style="background:none;color:var(--accent);">${escHtml(t.slice(idx, idx + query.length))}</mark>`
    + escHtml(t.slice(idx + query.length));
}

function addSong(title, artist) {
  if (state.songs.find(s => s.title===title && s.artist===artist)) return;
  state.songs.push({ title, artist, level: null });
  document.getElementById('artistSearch').value = '';
  document.getElementById('trackSearch').value = '';
  document.getElementById('trackSearchWrap').style.display = 'none';
  closeAC('acTrackList');
  closeAC('acArtistList');
  selectedArtist = null;
  renderSongs();
  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('artistSearch').focus()));
  voorproefOphalen(() => state.songs, title, artist, renderSongs);
}

// ─── De setlist: wizardstap Nummers én de tegel Je setlist (TT-514) ──────────
// Besluiten Ronald, 25-10-2026. Drie nummers zijn verplicht in de wizard. Per
// nummer één kader: links artiest en nummer (elk hoogstens twee regels), rechts
// de voorproef ("4 anderen spelen dit ook") en daaronder Beheersing als keuze
// zonder rand. Eén vorm voor de wizard en de tegel; een eigen variant is een fout.
const NUMMERS_MIN = 3;
const BEHEERSING_NAMEN = { basis: 'Basis', bijna: 'Bijna', podium: 'Podium' };
const PIJL_OMLAAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>';
// Het sluitteken van de app (zie .modal-close), met een viewBox precies om
// de inkt: zo ligt de inkt exact waar de opmaak hem zet (TT-514, uitlijning).
// Besluit Ronald 03-11-2026 (1A, "maak dit overal gelijk"): elk kruisje
// achter een rij (setlist, links, covers, Mix & Match) is dit kruisje.
const RIJ_KRUIS = '<svg viewBox="4 4 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line x1="5" y1="5" x2="19" y2="19"></line><line x1="19" y1="5" x2="5" y2="19"></line></svg>';
// ─── Lange nummerlijst op een profiel: ingeklapt tot zeven ───────────────────
// Besluit Ronald, 26-10-2026 (optie 1): meer dan zeven nummers maakt een
// profiel onleesbaar. Het profiel opent met zeven nummers; de laatste rijen
// vervagen en eronder staat "Alle N nummers". Een tik ergens op de lijst klapt
// hem open, nog een tik klapt hem weer in ("de lijst is verder niet
// klikbaar"). Geldt voor het repertoire van een muzikant en de covers van een
// band, ingelogd en uitgelogd. De regel onderaan is een knop, zodat de lijst
// ook met het toetsenbord werkt; zijn klik loopt door naar de lijst.
const NUMMERS_INGEKLAPT = 7;
function nummerLijstHTML(rijen) {
  if (rijen.length <= NUMMERS_INGEKLAPT) return rijen.join('');
  return `<div class="nummers-inklap" onclick="nummersInklapWissel(this)">` +
    `<div class="nummers-inklap-rijen">${rijen.join('')}</div>` +
    `<button type="button" class="nummers-inklap-regel" aria-expanded="false">` +
    `<span class="nummers-inklap-dicht">Alle ${rijen.length} nummers</span>` +
    `<span class="nummers-inklap-open">Minder</span>${PIJL_OMLAAG}</button></div>`;
}
function nummersInklapWissel(lijst) {
  const open = !lijst.classList.contains('open');
  lijst.classList.toggle('open', open);
  const regel = lijst.querySelector('.nummers-inklap-regel');
  if (regel) regel.setAttribute('aria-expanded', open ? 'true' : 'false');
  // Ingeklapt na scrollen: de bovenkant van de lijst lag dan boven het
  // scherm. Breng de korte lijst terug in beeld, anders kijkt de gebruiker
  // naar wat eronder staat.
  if (!open && lijst.getBoundingClientRect().top < 0) {
    const beweegtNiet = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { lijst.scrollIntoView({ behavior: beweegtNiet ? 'auto' : 'smooth', block: 'center' }); }
    catch (e) { lijst.scrollIntoView(); }
  }
}
// ─── Een nummer van een ander in één tik overnemen (TT-528) ─────────────────
// Besluiten Ronald, 27-10-2026: een vierkantje met een klein plusteken rechts
// naast het niveaulabel, op het profiel van een ander en bij de covers van een
// band; staat het nummer in je repertoire, dan een vinkje in --steun (de rand
// niet). Nog een tik haalt het weg. Overnemen zonder niveau. Zonder profiel
// staat de knop er ook; een tik nodigt uit een profiel te maken. Vergelijken
// zoals Mix & Match: titel en artiest exact, hoofdletters maken niet uit.
// TT-531 (besluiten Ronald, 29-10-2026, op beeld): een tik op het plusteken
// opent eerst het keuzemenu (Basis, Bijna, Podium) onder de
// knop, als drie labels in de vorm van het niveaulabel (optie 1 op beeld);
// een tik ernaast annuleert. Vervangt "overnemen zonder niveau". Het vinkje
// haalt het nummer meteen weg, zonder menu.
const OVERNEEM_PLUS = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1v8M1 5h8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
const OVERNEEM_VINK = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M1.5 5.2l2.3 2.3L8.5 2.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let eigenNummerSleutels = null; // Set van "titel|||artiest", of null als (nog) onbekend
const nummerSleutel = (titel, artiest) => `${String(titel || '').toLowerCase()}|||${String(artiest || '').toLowerCase()}`;

let overneemTeller = 0; // elke knop een eigen nummer, voor het keuzemenu eronder
function overneemKnopHTML(titel, artiest) {
  const n = ++overneemTeller;
  const opties = ['basis', 'bijna', 'podium'].map(k => `<option value="${k}">${BEHEERSING_NAMEN[k]}</option>`).join('');
  return `<span class="menu-anchor nummer-overneem-plek">` +
    `<button type="button" class="nummer-overneem" id="ovnVeld${n}" data-nr="${n}" data-titel="${escHtml(titel)}" data-artiest="${escHtml(artiest)}"` +
    ` aria-pressed="false" aria-haspopup="listbox" aria-expanded="false" aria-label="Zet ${escHtml(titel)} in je repertoire" onclick="nummerOvernemen(event, this)">${OVERNEEM_PLUS}</button>` +
    `<select id="ovnSel${n}" hidden onchange="nummerOvernemenMet(${n}, this)"><option value="" selected style="display:none">Beheersing</option>${opties}</select>` +
    `<div class="choice-menu overneem-menu beheersing-menu" id="ovnMenu${n}" role="listbox"></div></span>`;
}
function overneemKnopZetten(knop) {
  const aan = !!(eigenNummerSleutels && eigenNummerSleutels.has(nummerSleutel(knop.dataset.titel, knop.dataset.artiest)));
  if (knop.classList.contains('aan') === aan && knop.firstElementChild) return;
  knop.classList.toggle('aan', aan);
  knop.setAttribute('aria-pressed', aan ? 'true' : 'false');
  if (aan) knop.removeAttribute('aria-haspopup'); else knop.setAttribute('aria-haspopup', 'listbox');
  knop.setAttribute('aria-label', `${aan ? 'Haal' : 'Zet'} ${knop.dataset.titel} ${aan ? 'uit' : 'in'} je repertoire`);
  knop.innerHTML = aan ? OVERNEEM_VINK : OVERNEEM_PLUS;
}
async function eigenNummersOphalen() {
  const { data, error } = await db.from('musician_songs')
    .select('song_title, song_artist, mastery_level').eq('musician_id', myMusicianId);
  if (error) throw error;
  eigenNummerSleutels = new Set((data || []).map(s => nummerSleutel(s.song_title, s.song_artist)));
  return data || [];
}
// Na het tonen van een profiel of bandpagina: de knoppen in de juiste stand.
async function overneemKnoppenBijwerken(vak) {
  const knoppen = vak ? [...vak.querySelectorAll('.nummer-overneem')] : [];
  if (!knoppen.length || !hasOwnProfile || !myMusicianId) return;
  try { await eigenNummersOphalen(); }
  catch (e) { logCaught('overneemKnoppenBijwerken', e); return; } // de knoppen blijven een plusteken
  knoppen.forEach(overneemKnopZetten);
}
async function nummerOvernemen(ev, knop) {
  if (ev) ev.stopPropagation(); // de lijst eromheen klapt anders open of dicht
  if (!hasOwnProfile || !myMusicianId) { showToast('Maak een gratis profiel aan, dan bewaren we dit nummer.'); return; }
  if (knop.dataset.bezig) return;
  if (knop.classList.contains('aan')) { repertoireBijwerken(knop, null); return; }
  // Eerst de beheersing kiezen: het gewone keuzemenu (huisstijl §7.1).
  const n = knop.dataset.nr, id = `ovn${n}`;
  CHOICE_FIELDS[id] = { id, fieldId: knop.id, selectId: `ovnSel${n}`, menuId: `ovnMenu${n}` };
  toggleChoiceMenu(id);
}
function nummerOvernemenMet(n, sel) {
  const level = sel.value;
  sel.value = ''; // een volgende keer weer zonder vinkje in het menu
  const knop = document.getElementById(`ovnVeld${n}`);
  if (knop && BEHEERSING_NAMEN[level]) repertoireBijwerken(knop, level);
}
// level: een beheersing om het nummer mee over te nemen, of null om het weg te halen.
async function repertoireBijwerken(knop, level) {
  if (knop.dataset.bezig) return;
  knop.dataset.bezig = '1';
  try {
    // Altijd de lijst zoals hij nu in de database staat: Je setlist kan intussen gewijzigd zijn.
    const lijst = await eigenNummersOphalen();
    const titel = knop.dataset.titel, artiest = knop.dataset.artiest, sleutel = nummerSleutel(titel, artiest);
    const erin = eigenNummerSleutels.has(sleutel);
    const ditNummer = s => nummerSleutel(s.song_title, s.song_artist) === sleutel;
    let nieuw;
    if (level) {
      // Stond het er intussen al in, dan krijgt het deze beheersing.
      nieuw = erin ? lijst.map(s => ditNummer(s) ? { ...s, mastery_level: level } : s)
                   : lijst.concat([{ song_title: titel, song_artist: artiest, mastery_level: level }]);
    } else {
      // Weghalen mag ook onder de drie nummers (besluit Ronald, 27-10-2026: het minimum is voor nieuwe gebruikers).
      if (!erin) { document.querySelectorAll('.nummer-overneem').forEach(overneemKnopZetten); return; }
      nieuw = lijst.filter(s => !ditNummer(s));
    }
    const { error } = await db.rpc('tt_save_musician_koppelingen', {
      p_musician_id: myMusicianId,
      p_songs: nieuw.map(s => ({ song_title: s.song_title, song_artist: s.song_artist, mastery_level: s.mastery_level })),
    });
    if (error) { showToast(friendlyErrorMessage(error, 'je repertoire opslaan')); return; }
    eigenNummerSleutels = new Set(nieuw.map(s => nummerSleutel(s.song_title, s.song_artist)));
    // Staat hetzelfde nummer vaker op het scherm (repertoire en covers), dan alle knoppen mee.
    document.querySelectorAll('.nummer-overneem').forEach(overneemKnopZetten);
    showToast(level ? 'Nummer opgeslagen.' : 'Nummer weggehaald.');
  } catch (e) {
    logCaught('repertoireBijwerken', e);
    showToast(friendlyErrorMessage(e, 'je repertoire opslaan'));
  } finally {
    delete knop.dataset.bezig;
  }
}

// ─── Een nummer: artiest groot en bovenaan, het nummer eronder ───────────────
// Besluit Ronald, 27-10-2026 (sessie 21, TT-520): "vanuit consistentie", zoals
// Je setlist. Geldt voor elke rij waar artiest en nummer onder elkaar staan (nu
// de nummers in Mix & Match); een lijst op één regel, zoals het repertoire op
// een profiel, blijft zoals hij is. Een eigen opmaak per plek is een fout.
// Zonder titel staat er alleen de artiest; de plek kan een eigen tekst
// meegeven ("Alle nummers").
function nummerTekstHTML(artiest, titel) {
  return `<span class="song-tekst"><span class="song-artiest">${escHtml(artiest || '')}</span>` +
    (titel ? `<span class="song-titel">${escHtml(titel)}</span>` : '') + `</span>`;
}
const PERSONEN_TEKEN ='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';

// Geeft de veldfout terug als er te weinig nummers zijn, anders een lege
// lijst. Gebruikt door nextStep(3) (wizard) en saveJeSetlist() (tegel):
// ook in de tegel minimaal drie (besluit Ronald, 25-10-2026).
// De tekst is die van de teller boven de lijst (besluit Ronald, 25-10-2026).
function nummersTekortFouten(lijst = state.songs, veld = 'artistSearch') {
  if (lijst.length >= NUMMERS_MIN) return [];
  return [[veld, setlistTellerTekst(lijst.length)]];
}

// Onder de drie: "Voeg nog 2 nummers toe" (Ronald, 25-10-2026: "2 van 3"
// begrijpt niemand); vanaf drie "3 nummers", "4 nummers" enzovoort.
function setlistTellerTekst(n) {
  const nog = NUMMERS_MIN - n;
  if (nog > 0) return nog === 1 ? 'Voeg nog 1 nummer toe' : `Voeg nog ${nog} nummers toe`;
  return `${n} nummers`;
}

// Hoeveel ándere muzikanten met een afgerond profiel dit nummer spelen.
// Gebruikt de bestaande functie van Zoeken (besluit Ronald, 25-10-2026: geen
// nieuwe databasefunctie); die geeft alleen id's. Het eigen profiel telt niet
// mee. Per nummer één vraag per bezoek: de belofte staat in de cache, ook als
// hij nog loopt. Lukt het niet, dan geeft hij 0 en mag een volgende keer
// opnieuw vragen.
const nummerSpelersCache = new Map();
function nummerSpelersOphalen(title, artist) {
  const sleutel = `${title}\u0000${artist}`.toLowerCase();
  if (!nummerSpelersCache.has(sleutel)) {
    nummerSpelersCache.set(sleutel,
      db.rpc('tt_search_musicians_by_songlist_anon', { titles: [title], artists: [artist] })
        .then(({ data, error }) => {
          if (error) throw error;
          return (Array.isArray(data) ? data : []).map(r => r && r.musician_id);
        })
        .catch(() => { nummerSpelersCache.delete(sleutel); return []; }));
  }
  return nummerSpelersCache.get(sleutel).then(ids =>
    ids.filter(id => id && id !== (typeof myMusicianId !== 'undefined' ? myMusicianId : null)).length);
}

// Vraagt de voorproef voor één nummer en tekent de lijst opnieuw als er een
// antwoord is. Niets wacht hierop. Weggehaald, nul of geen antwoord: niets.
function voorproefOphalen(lijst, title, artist, teken) {
  nummerSpelersOphalen(title, artist).then(aantal => {
    const s = lijst().find(x => x.title === title && x.artist === artist);
    if (!s || !aantal) return;
    s.spelers = aantal;
    teken();
  });
}

// De voorproef. Alleen een geheel getal boven nul telt; de waarde kan uit de
// bewaarde voortgang komen, dus nooit ongezien in de HTML.
function voorproefHTML(spelers) {
  const n = Number(spelers);
  if (!Number.isInteger(n) || n < 1) return '';
  return `${PERSONEN_TEKEN}<b>${n} ${n === 1 ? 'ander' : 'anderen'}</b> ${n === 1 ? 'speelt' : 'spelen'} dit ook`;
}

// De rijen van de setlist. p is het voorvoegsel van de id's ('' voor de
// wizard, 'jst' voor de tegel); weg is de naam van de verwijderfunctie.
// Volgorde: alfabetisch op artiest, dan titel; i blijft de echte plek in de lijst.
function setlistLijstHTML(lijst, p, weg) {
  const volgorde = lijst.map((s, i) => i)
    .sort((a, b) => compareArtistTitle(lijst[a].artist, lijst[a].title, lijst[b].artist, lijst[b].title));
  return volgorde.map(i => {
    const s = lijst[i];
    const naam = BEHEERSING_NAMEN[s.level];
    const opties = ['basis', 'bijna', 'podium']
      .map(k => `<option value="${k}"${s.level === k ? ' selected' : ''}>${BEHEERSING_NAMEN[k]}</option>`).join('');
    // Rij als raster (bevinding Ronald, 25-10-2026, "rode lijn"): tekst
    // links over twee rijen; rechts de voorproef (loopt door tot boven het
    // kruisje) met de keuze eronder; het kruisje smal, in het midden van de
    // tegel ("het sluitkruisje blijft in het midden van de tegel").
    return `
    <div class="setlist-rij${s._confirmDelete ? ' zeker' : ''}">
      <div class="setlist-tekst">
        <div class="setlist-artiest">${escHtml(s.artist)}</div>
        <div class="setlist-titel">${escHtml(s.title)}</div>
      </div>
      <div class="setlist-spelers">${voorproefHTML(s.spelers)}</div>
      <div class="menu-anchor setlist-keuze-plek">
        <button type="button" class="setlist-keuze${naam ? ' gekozen' : ''}" id="${p}behVeld${i}" aria-label="Beheersing van ${escHtml(s.title)}"><span class="wheel-field-label">${naam || 'Beheersing'}</span>${PIJL_OMLAAG}</button>
        <select id="${p}behSel${i}" hidden><option value=""${naam ? '' : ' selected'} style="display:none">Beheersing</option>${opties}</select>
        <div class="choice-menu setlist-keuze-menu beheersing-menu" id="${p}behMenu${i}" role="listbox"></div>
      </div>
      ${s._confirmDelete
        ? `<button type="button" class="song-remove setlist-zeker" onclick="${weg}(${i})" title="Bevestig verwijderen">Zeker?</button>`
        : `<button type="button" class="song-remove" onclick="${weg}(${i})" title="Verwijderen" aria-label="Verwijder ${escHtml(s.title)}">${RIJ_KRUIS}</button>`}
    </div>`;
  }).join('');
}

// Koppelt het keuzemenu van elke rij (huisstijl §7.1) aan de lijst.
function setlistKeuzesKoppelen(lijst, p, zet) {
  lijst.forEach((s, i) => {
    initChoiceField({ id: `${p}beh${i}`, fieldId: `${p}behVeld${i}`, selectId: `${p}behSel${i}`, menuId: `${p}behMenu${i}` });
    const sel = document.getElementById(`${p}behSel${i}`);
    if (sel) sel.addEventListener('change', () => zet(i, sel.value || null));
  });
}

// De toelichting achter de i bij "Beheersing" (besluit Ronald, 25-10-2026).
// Zelfde venster als de niveau-uitleg; de teksten zijn die van de oude regel.
function openBeheersingInfo() {
  document.getElementById('niveauInfoModalContent').innerHTML = `
    <div class="filter-title" style="margin-bottom:12px;">Beheersing per nummer</div>
    <p class="beheersing-uitleg"><b>Basis</b> — je kent de structuur.</p>
    <p class="beheersing-uitleg"><b>Bijna</b> — soepel, bijna klaar.</p>
    <p class="beheersing-uitleg"><b>Podium</b> — je speelt het live zonder problemen.</p>
    <p class="beheersing-uitleg" style="color:var(--muted);">Mag ook later.</p>`;
  document.getElementById('niveauInfoModal').classList.add('visible');
}

function renderSongs() {
  const list = document.getElementById('songsList');
  if (!list) return;
  const kop = document.getElementById('songsKop');
  if (kop) kop.hidden = !state.songs.length;
  const teller = document.getElementById('songsTeller');
  if (teller) teller.textContent = setlistTellerTekst(state.songs.length);
  list.innerHTML = setlistLijstHTML(state.songs, '', 'removeSong');
  setlistKeuzesKoppelen(state.songs, '', setLevel);
}

function setLevel(i, level) {
  if (!state.songs[i]) return;
  state.songs[i].level = BEHEERSING_NAMEN[level] ? level : null;
  renderSongs();
}

// TT-179-patroon: eerste klik op ✕ zet "Zeker?", pas een tweede klik
// verwijdert. TT-226-regel, nu ook in de wizard (TT-514, D7): hoogstens één
// "Zeker?" tegelijk, en een klik ergens anders zet hem terug.
function removeSong(i) {
  if (!state.songs[i]) return;
  if (!state.songs[i]._confirmDelete) {
    state.songs.forEach(s => delete s._confirmDelete);
    state.songs[i]._confirmDelete = true;
    renderSongs();
    zekerTerugBijKlikErnaast(() => state.songs, renderSongs);
    return;
  }
  state.songs.splice(i, 1);
  renderSongs();
}

// Zet "Zeker?" terug op ✕ bij een klik ergens anders (huisstijl §8, TT-226).
// Pas ná de huidige klik registreren, en hij verdwijnt vanzelf.
function zekerTerugBijKlikErnaast(lijst, teken) {
  setTimeout(() => {
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('.song-remove')) return;
      let gewijzigd = false;
      lijst().forEach(s => { if (s._confirmDelete) { delete s._confirmDelete; gewijzigd = true; } });
      if (gewijzigd) teken();
    }, { once: true });
  }, 0);
}


// ─── Draaiwiel (huisstijlcomponent voor getalvelden) ─────────────────────────
// TT-232 (09-09-2026, Ronalds schets): getalvelden op het zoekscherm worden
// een verticaal draaiwiel met vaste stappen. Reden: een vrij getalveld laat
// waarden toe die niets opleveren (leeftijd 37 t/m 38, straal 1 km) en vraagt
// op een telefoon om het toetsenbord. Een wiel met vaste stappen kan alleen
// zinnige waarden aannemen.
//
// Het wiel schrijft zijn waarde altijd naar een verborgen invoerveld
// (cfg.inputId). Alle bestaande code die die waarde uitleest, blijft daardoor
// ongewijzigd werken.
const WHEEL_ITEM_H = 44;   // moet gelijk zijn aan .wheel-item in styles.css

// De lege stand (filter uit) in een gesloten keuzeveld: een streepje, grijs
// (besluit Ronald 26-10-2026; was "Alle"). In het wiel zelf heet die stand
// nog "Alle" (labelOf in initWheel()), want daar kies je hem.
const LEEG_VELD = '–';
function zetVeldTekst(el, tekst) {
  if (!el) return;
  el.textContent = tekst;
  el.classList.toggle('leeg', tekst === LEEG_VELD);
}
const WHEELS = {};

// cfg: { id, inputId, values[], value, onChange, onPick, ariaLabel, labels? }
// values mag '' bevatten; dat is de stand "Geen" (filter uit).
// onPick wordt alleen aangeroepen bij een tik op een waarde, niet bij scrollen.
function initWheel(cfg) {
  const el = document.getElementById(cfg.id);
  if (!el) return;
  // TT-308 (23-09-2026): was 'Geen'. Bij Ervaring las dat als "zoekt bandleden
  // zonder ervaring" — precies het omgekeerde van de bedoeling (filter uit).
  // Status gebruikt al "Alle bands" voor dezelfde lege stand; "Alle" trekt dat
  // gelijk, in het wiel zelf en in elk gesloten veld dat op dit wiel bouwt.
  const labelOf = (v) => (cfg.labels && cfg.labels[v] != null) ? cfg.labels[v]
                       : (v === '' ? 'Alle' : String(v));
  el.classList.add('wheel');
  el.setAttribute('tabindex', '0');
  el.setAttribute('role', 'listbox');
  if (cfg.ariaLabel) el.setAttribute('aria-label', cfg.ariaLabel);
  // Geen eigen rand en geen eigen markeringsbalk: die horen bij de groep
  // (.picker-group) eromheen, zodat de kolommen samen één picker vormen —
  // het patroon dat iedereen van zijn telefoon kent.
  el.innerHTML = `
    <div class="wheel-scroll">
      <div class="wheel-pad"></div>
      ${cfg.values.map((v, i) => `<div class="wheel-item" role="option" data-i="${i}">${escHtml(labelOf(v))}</div>`).join('')}
      <div class="wheel-pad"></div>
    </div>`;

  const scroll = el.querySelector('.wheel-scroll');
  const state = { el, scroll, cfg, values: cfg.values.slice(), index: 0, timer: null };
  WHEELS[cfg.id] = state;

  // Klikken op een waarde kiest die waarde — sneller dan scrollen bij een
  // korte lijst (niveau 1 t/m 5).
  el.querySelectorAll('.wheel-item').forEach(item => {
    item.addEventListener('click', () => {
      setWheelIndex(cfg.id, parseInt(item.dataset.i), true);
      if (typeof cfg.onPick === 'function') cfg.onPick(getWheelValue(cfg.id));
    });
  });

  // Tijdens het scrollen leest de app niet elke pixel uit: pas 140 ms na de
  // laatste beweging staat het wiel stil en telt de waarde. Anders zou elke
  // tussenliggende waarde een zoekopdracht starten.
  scroll.addEventListener('scroll', () => {
    clearTimeout(state.timer);
    state.timer = setTimeout(() => commitWheelScroll(cfg.id), 140);
  });

  el.addEventListener('keydown', (e) => {
    const step = (e.key === 'ArrowUp' || e.key === 'PageUp') ? -1
               : (e.key === 'ArrowDown' || e.key === 'PageDown') ? 1 : 0;
    if (step) {
      e.preventDefault();
      const jump = (e.key === 'PageUp' || e.key === 'PageDown') ? 3 : 1;
      setWheelIndex(cfg.id, state.index + step * jump, true);
    } else if (e.key === 'Home') { e.preventDefault(); setWheelIndex(cfg.id, 0, true); }
    else if (e.key === 'End')    { e.preventDefault(); setWheelIndex(cfg.id, state.values.length - 1, true); }
  });

  const start = cfg.values.indexOf(cfg.value);
  setWheelIndex(cfg.id, start >= 0 ? start : 0, false);
}

// Leest de stand af nadat het wiel is stilgevallen.
function commitWheelScroll(id) {
  const s = WHEELS[id];
  if (!s) return;
  let i = Math.round(s.scroll.scrollTop / WHEEL_ITEM_H);
  i = Math.max(0, Math.min(s.values.length - 1, i));
  // TT-256: niet vloeiend terugdraaien. Het wiel staat op dit moment al stil op
  // zijn regel; een tweede, geanimeerde sprong levert alleen nieuwe
  // scroll-gebeurtenissen op en dat voelt als naschokken.
  if (i !== s.index) setWheelIndex(id, i, true, false);
}

// notify=false zet de stand zonder de zoekopdracht opnieuw te starten —
// gebruikt bij het opbouwen en bij "Filters wissen" (die zoekt zelf één keer).
function setWheelIndex(id, i, notify, animeer) {
  const s = WHEELS[id];
  if (!s) return;
  i = Math.max(0, Math.min(s.values.length - 1, i));
  const changed = i !== s.index;
  s.index = i;
  // Vloeiend draaien bij een klik of een pijltoets, direct bij het opbouwen en
  // direct na het scrollen (animeer === false, zie commitWheelScroll).
  const top = i * WHEEL_ITEM_H;
  if (notify && animeer !== false && typeof s.scroll.scrollTo === 'function') {
    s.scroll.scrollTo({ top, behavior: 'smooth' });
  } else {
    s.scroll.scrollTop = top;
  }
  s.el.querySelectorAll('.wheel-item').forEach((item, n) => {
    const on = n === i;
    item.classList.toggle('selected', on);
    item.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  const input = s.cfg.inputId && document.getElementById(s.cfg.inputId);
  if (input) input.value = s.values[i];
  if (notify && changed && typeof s.cfg.onChange === 'function') s.cfg.onChange(s.values[i]);
}

function getWheelValue(id) {
  const s = WHEELS[id];
  return s ? s.values[s.index] : null;
}

function setWheelValue(id, value, notify) {
  const s = WHEELS[id];
  if (!s) return;
  const i = s.values.indexOf(value);
  setWheelIndex(id, i >= 0 ? i : 0, !!notify);
}


// ─── Wielveld + bladwijzer (TT-233, 10-09-2026) ──────────────────────────────
// Huisstijl §7.1: een wiel staat nooit vast open in een formulier. Het
// formulier toont een tikveld met de stand in woorden; het wiel komt op in een
// bladwijzer en verdwijnt zodra de keuze rond is.
//
// De verborgen invoervelden blijven de enige bron van waarheid. Het wiel wordt
// bij elk openen opnieuw opgebouwd. Dat is bewust: een wiel dat wordt
// opgebouwd terwijl het onzichtbaar is, kan zijn scrollpositie niet zetten —
// dat was de oorzaak van de straal-fout (wiel startte op de laatste waarde).

const WHEEL_FIELDS = {};
let actiefWielVeld = null;

// cfg: {
//   id, fieldId, title,
//   columns: [{ inputId, values, labels?, ariaLabel }],
//   sep?: 't/m', unit?: 'km',
//   value: [beginwaarde per kolom],
//   clearTo?: [waarde per kolom bij "Wissen"],
//   koppelBereik?: true        -> kolom 2 mag niet onder kolom 1 zakken
//   ondergrensVerplicht?: true -> kolom 1 mag niet op "Geen" staan als kolom 2 gevuld is
//   format(waarden) -> tekst in het gesloten veld
//   hint(waarden)   -> terugleesregel onder het wiel
//   onChange()      -> na elke wijziging
// }
function initWheelField(cfg) {
  WHEEL_FIELDS[cfg.id] = cfg;
  const el = document.getElementById(cfg.fieldId);
  if (!el) return;
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.addEventListener('click', () => openWheelSheet(cfg.id));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openWheelSheet(cfg.id); }
  });
  setWheelFieldValues(cfg.id, cfg.value, false);
}

function wheelFieldValues(id) {
  const cfg = WHEEL_FIELDS[id];
  if (!cfg) return [];
  return cfg.columns.map(c => {
    const inp = document.getElementById(c.inputId);
    return inp ? inp.value : '';
  });
}

// Zet de waarden in de verborgen velden, werkt het tikveld bij en draait — als
// de bladwijzer openstaat — de wielen mee.
function setWheelFieldValues(id, waarden, notify) {
  const cfg = WHEEL_FIELDS[id];
  if (!cfg) return;
  cfg.columns.forEach((c, i) => {
    const inp = document.getElementById(c.inputId);
    if (inp) inp.value = (waarden && waarden[i] != null) ? waarden[i] : '';
    const wielId = wheelColumnId(id, i);
    if (WHEELS[wielId]) setWheelValue(wielId, waarden && waarden[i] != null ? waarden[i] : '', false);
  });
  refreshWheelField(id);
  if (notify && typeof cfg.onChange === 'function') cfg.onChange();
}

function wheelColumnId(id, i) { return 'wheelCol_' + id + '_' + i; }

// Werkt de tekst in het tikveld bij, plus de gouden rand als het filter aanstaat.
function refreshWheelField(id) {
  const cfg = WHEEL_FIELDS[id];
  if (!cfg) return;
  const el = document.getElementById(cfg.fieldId);
  if (!el) return;
  const waarden = wheelFieldValues(id);
  const labelEl = el.querySelector('.wheel-field-label');
  zetVeldTekst(labelEl, cfg.format(waarden));
  const aan = typeof cfg.isActief === 'function' ? cfg.isActief(waarden)
            : waarden.some(v => v !== '' && v != null);
  el.classList.toggle('is-set', !!aan);
  const hintEl = document.getElementById('wheelSheetHint');
  if (hintEl && actiefWielVeld === id && typeof cfg.hint === 'function') {
    hintEl.textContent = cfg.hint(waarden);
  }
}

function openWheelSheet(id) {
  const cfg = WHEEL_FIELDS[id];
  if (!cfg) return;
  actiefWielVeld = id;
  document.getElementById('wheelSheetTitle').textContent = cfg.title;

  const infoBtn = document.getElementById('wheelSheetInfo');
  if (infoBtn) {
    infoBtn.style.display = cfg.infoActie ? '' : 'none';
    infoBtn.onclick = cfg.infoActie || null;
  }

  // Eén paneel, kolommen ernaast, één markeringsbalk erover. Het koppelwoord
  // ("t/m") en de eenheid ("km") zijn vaste kolommen in het paneel, geen losse
  // woorden ernaast — huisstijl §7.1.
  const groep = document.getElementById('wheelSheetGroup');
  let html = '';
  // TT-256: een lege kolom links, even breed als de eenheid rechts. Zonder die
  // tegenhanger wordt "5 km" als geheel gecentreerd en staat het getal zelf
  // links van het midden.
  if (cfg.unit) html += '<span class="wheel-unit-spacer" aria-hidden="true"></span>';
  cfg.columns.forEach((c, i) => {
    if (i > 0 && cfg.sep) html += `<span class="wheel-sep" aria-hidden="true">${escHtml(cfg.sep)}</span>`;
    html += `<div id="${wheelColumnId(id, i)}"></div>`;
  });
  if (cfg.unit) html += `<span class="wheel-unit" aria-hidden="true">${escHtml(cfg.unit)}</span>`;
  html += '<div class="picker-band" aria-hidden="true"></div>';
  // TT-256: de vervaging als vaste laag over het paneel, niet als masker op de
  // scrollende inhoud.
  html += '<div class="picker-fade picker-fade-top" aria-hidden="true"></div>';
  html += '<div class="picker-fade picker-fade-bottom" aria-hidden="true"></div>';
  groep.innerHTML = html;

  // Eén kolom sluit op de tik die de waarde kiest. Een bereik van twee kolommen
  // niet: daar is de keuze pas af als beide kolommen staan.
  const sluitBijTik = cfg.columns.length === 1;
  const waarden = wheelFieldValues(id);

  document.getElementById('wheelSheetModal').classList.add('visible');

  // Pas opbouwen als de bladwijzer echt zichtbaar is — een verborgen element
  // heeft geen hoogte en negeert een gezette scrollpositie.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    cfg.columns.forEach((c, i) => {
      initWheel({
        id: wheelColumnId(id, i),
        inputId: c.inputId,
        values: c.values,
        labels: c.labels,
        value: waardeInKolom(c, waarden[i]),
        ariaLabel: c.ariaLabel,
        onChange: () => {
          if (cfg.koppelBereik) koppelWielBereik(id);
          refreshWheelField(id);
          if (typeof cfg.onChange === 'function') cfg.onChange();
        },
        onPick: () => { if (sluitBijTik) closeWheelSheet(); }
      });
    });
    wielTreffervlak();
    refreshWheelField(id);
  }));
}

// TT-275 (16-09-2026): het hele paneel draait mee, niet alleen de smalle
// kolom met de getallen. Anders bedekt de duim het getal dat je kiest.
// Elke kolom krijgt het vlak tot halverwege zijn buren; de eerste loopt door
// tot de linkerrand, de laatste tot de rechterrand — dus ook over "km". Het
// getal zelf blijft op zijn plek: de kolom rekt uit met een negatieve marge,
// en dezelfde maat komt terug als opvulling in elke regel.
function wielTreffervlak() {
  const groep = document.getElementById('wheelSheetGroup');
  if (!groep) return;
  const wielen = [...groep.querySelectorAll('.wheel')];
  if (!wielen.length) return;
  const g = groep.getBoundingClientRect();
  const r = wielen.map(w => w.getBoundingClientRect());
  wielen.forEach((w, i) => {
    const links  = i === 0 ? g.left : (r[i - 1].right + r[i].left) / 2;
    const rechts = i === wielen.length - 1 ? g.right : (r[i].right + r[i + 1].left) / 2;
    const scroll = w.querySelector('.wheel-scroll');
    scroll.style.setProperty('--wiel-l', Math.max(0, Math.floor(r[i].left - links)) + 'px');
    scroll.style.setProperty('--wiel-r', Math.max(0, Math.floor(rechts - r[i].right)) + 'px');
  });
}
window.addEventListener('resize', () => { if (actiefWielVeld) wielTreffervlak(); });

// Een verborgen veld levert altijd tekst; het wiel werkt met de oorspronkelijke
// waarden (getallen). Zoek de bijpassende waarde op, val terug op "Geen".
function waardeInKolom(kolom, ruw) {
  if (ruw === '' || ruw == null) return kolom.values.includes('') ? '' : kolom.values[0];
  const gevonden = kolom.values.find(v => String(v) === String(ruw));
  return gevonden !== undefined ? gevonden : (kolom.values.includes('') ? '' : kolom.values[0]);
}

// Een minimum boven het maximum geeft altijd nul resultaten. Het andere wiel
// schuift mee naar de dichtstbijzijnde waarde die het bereik heel houdt.
function koppelWielBereik(id) {
  const cfg = WHEEL_FIELDS[id];
  if (!cfg || cfg.columns.length < 2) return;
  const minId = wheelColumnId(id, 0);
  const maxId = wheelColumnId(id, 1);
  if (!WHEELS[minId] || !WHEELS[maxId]) return;
  let min = getWheelValue(minId);
  const max = getWheelValue(maxId);

  // Een bovengrens zonder ondergrens leest als een halve zin. Bij een schaal
  // die bij een vaste waarde begint (niveau 1) vult de ondergrens zichzelf.
  if (cfg.ondergrensVerplicht && max !== '' && min === '') {
    const eerste = WHEELS[minId].values.find(v => v !== '');
    if (eerste !== undefined) {
      setWheelValue(minId, eerste, false);
      min = eerste;
    }
  }

  if (min === '' || max === '' || Number(min) <= Number(max)) return;
  const nieuw = WHEELS[maxId].values.find(v => v !== '' && Number(v) >= Number(min));
  setWheelValue(maxId, nieuw === undefined ? '' : nieuw, false);
}

// ─── Keuzeveld (TT-233, 10-09-2026) ──────────────────────────────────────────
// Een korte, ongeordende lijst (Sorteren op, Weergave) hoort niet op een wiel —
// huisstijl §7.1. En een browser-keuzelijst is niet af te ronden en niet te
// animeren: die lijst tekent het besturingssysteem, niet de pagina.
//
// Het menu klapt uit onder de knop waar het bij hoort. Dat is waar de gebruiker
// net getikt heeft en waar zijn ogen al staan; een laag onder aan het scherm
// haalt hem daar weg. Zelfde vorm als de bestaande menu's in de app
// (.inline-menu-dropdown), met een opengaande beweging erbij.
//
// Het oorspronkelijke <select> blijft in de HTML staan, verborgen. Het is de
// bron van waarheid, zodat alle bestaande code die .value leest of zet
// ongewijzigd blijft werken.

const CHOICE_FIELDS = {};
let actiefKeuzeMenu = null;

// cfg: { id, fieldId, menuId, selectId }
function initChoiceField(cfg) {
  CHOICE_FIELDS[cfg.id] = cfg;
  const el = document.getElementById(cfg.fieldId);
  if (!el) return;
  el.setAttribute('role', 'combobox');
  el.setAttribute('aria-haspopup', 'listbox');
  el.setAttribute('aria-expanded', 'false');
  el.setAttribute('tabindex', '0');
  el.addEventListener('click', (e) => { e.stopPropagation(); toggleChoiceMenu(cfg.id); });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation(); toggleChoiceMenu(cfg.id);
    }
  });
  refreshChoiceField(cfg.id);
}

// Zet de tekst van het zichtbare veld gelijk aan de gekozen optie. Aanroepen na
// elke keer dat andere code de waarde van het <select> zelf wijzigt.
function refreshChoiceField(id) {
  const cfg = CHOICE_FIELDS[id];
  if (!cfg) return;
  const sel = document.getElementById(cfg.selectId);
  const el = document.getElementById(cfg.fieldId);
  if (!sel || !el) return;
  const optie = sel.options[sel.selectedIndex];
  const labelEl = el.querySelector('.wheel-field-label');
  if (labelEl) labelEl.textContent = optie ? optie.textContent : '';
}

function toggleChoiceMenu(id) {
  if (actiefKeuzeMenu === id) closeChoiceMenu();
  else openChoiceMenu(id);
}

function openChoiceMenu(id) {
  const cfg = CHOICE_FIELDS[id];
  if (!cfg) return;
  sluitAlleMenus(); // één menu tegelijk, zie core.js

  const sel = document.getElementById(cfg.selectId);
  const menu = document.getElementById(cfg.menuId);
  const veld = document.getElementById(cfg.fieldId);
  if (!sel || !menu || !veld) return;

  // Loopt de sluitbeweging van de vorige keer nog? Breek die dan eerst af.
  // Anders ruimt zíj dit net geopende menu een tel later alsnog op (TT-234).
  if (menu.ttOpruimen) menu.ttOpruimen();

  // TT-236 (10-09-2026): opties die verborgen zijn gezet horen niet in het
  // menu. configureSearchAccess() in core.js verbergt "Beste match" bij Bands
  // zodra er geen eigen profiel is; zonder deze regel tekent het menu die
  // optie alsnog.
  const zichtbaar = [...sel.options].filter(o => o.style.display !== 'none');
  menu.innerHTML = zichtbaar.map(o => `
    <button type="button" class="choice-option${o.value === sel.value ? ' selected' : ''}"
            role="option" aria-selected="${o.value === sel.value ? 'true' : 'false'}"
            data-waarde="${escHtml(o.value)}">
      <span>${escHtml(o.textContent)}</span>
      <span class="choice-option-check" aria-hidden="true">${o.value === sel.value ? '✓' : ''}</span>
    </button>`).join('');

  menu.querySelectorAll('.choice-option').forEach(rij => {
    rij.addEventListener('click', (e) => {
      e.stopPropagation();
      const waarde = rij.dataset.waarde;
      closeChoiceMenu();
      if (sel.value !== waarde) {
        sel.value = waarde;
        sel.dispatchEvent(new Event('change'));
      }
      refreshChoiceField(id);
    });
  });

  menu.classList.remove('naar-boven');
  menu.classList.add('open');
  veld.setAttribute('aria-expanded', 'true');
  actiefKeuzeMenu = id;

  // Past het menu niet onder de knop, dan klapt het omhoog uit. De beweging
  // begint dan aan de onderkant, zodat hij nog steeds uit de knop lijkt te
  // komen.
  const ruimteOnder = window.innerHeight - veld.getBoundingClientRect().bottom;
  if (menu.offsetHeight + 12 > ruimteOnder) menu.classList.add('naar-boven');

  // Sluiten bij een tik ernaast: dat doet de donkere laag (core.js). Escape
  // sluit via de gedeelde luisteraar daar.
  menuLaagOpen(menu);
}

function closeChoiceMenu() {
  if (!actiefKeuzeMenu) return;
  menuLaagWeg();
  const cfg = CHOICE_FIELDS[actiefKeuzeMenu];
  const menu = cfg && document.getElementById(cfg.menuId);
  const veld = cfg && document.getElementById(cfg.fieldId);
  actiefKeuzeMenu = null;
  if (veld) veld.setAttribute('aria-expanded', 'false');
  if (!menu) return;

  // Dichtklappen met dezelfde beweging, andersom. Pas daarna weghalen.
  //
  // TT-234 (10-09-2026): hier zat een fout waardoor het menu na één keer
  // gebruiken niet meer openging. De vangnet-timer stond op 160 ms, korter dan
  // de sluitbeweging zelf duurt. De timer ruimde dus als eerste op, brak de
  // beweging af, en 'animationend' kwam daardoor nooit. De luisteraar bleef
  // liggen en ving de eerstvolgende beweging op dit element: de ópeningsbeweging
  // van de volgende keer. Het menu klapte open en meteen weer dicht.
  //
  // Drie dingen houden dat nu tegen:
  // 1. De luisteraar gaat er in elk pad weer af, ook als de timer opruimt.
  // 2. De luisteraar reageert alleen op de sluitbeweging, op naam.
  // 3. De timer staat ruim boven de duur van de beweging (140 ms).
  menu.classList.add('sluit');
  let t = null;
  const opruimen = () => {
    clearTimeout(t);
    menu.removeEventListener('animationend', bijEindeBeweging);
    menu.ttOpruimen = null;
    menu.classList.remove('open', 'sluit', 'naar-boven');
    menu.innerHTML = '';
  };
  const bijEindeBeweging = (e) => {
    if (e.animationName === 'choiceMenuDicht') opruimen();
  };
  menu.addEventListener('animationend', bijEindeBeweging);
  // Staat "minder beweging" aan, dan is er geen sluitbeweging (styles.css) en
  // komt er dus ook geen 'animationend'. Meteen opruimen, niet 260 ms wachten.
  const beweegtNiet = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  t = setTimeout(opruimen, beweegtNiet ? 0 : 260);
  // openChoiceMenu() gebruikt dit om een nog lopende sluiting af te breken.
  menu.ttOpruimen = opruimen;
}

function closeWheelSheet() {
  document.getElementById('wheelSheetModal').classList.remove('visible');
  if (actiefWielVeld) refreshWheelField(actiefWielVeld);
  actiefWielVeld = null;
}

// "Wissen" zet dit ene filter terug naar zijn beginstand en zoekt opnieuw.
function wheelSheetClear() {
  const id = actiefWielVeld;
  if (!id) return;
  const cfg = WHEEL_FIELDS[id];
  setWheelFieldValues(id, cfg.clearTo || cfg.columns.map(() => ''), true);
  closeWheelSheet();
}


// ─── Lege staat (huisstijl §15, TT-248, 11-09-2026) ──────────────────────────
//
// Eén component voor elke lege staat in de app: een kop, hoogstens één regel
// uitleg, en altijd precies één knop die de volgende stap dóét. Tot 11-09-2026
// had elk scherm zijn eigen vorm; "Nog geen profiel" had een knop en "Nog geen
// bands" tien regels verderop niet. Nooit een tweede knop toevoegen — kiezen
// is precies wat in een lege staat niet lukt.
function emptyStateHTML(kop, uitleg, knopLabel, knopActie) {
  const uitlegHTML = uitleg ? `<p class="empty-state-text">${escHtml(uitleg)}</p>` : '';
  return `<div class="empty-state">
    <p class="empty-state-title">${escHtml(kop)}</p>
    ${uitlegHTML}
    <button class="btn btn-primary" onclick="${knopActie}">${escHtml(knopLabel)}</button>
  </div>`;
}


// ─── Naam in een profielkop (TT-249, herzien 11-09-2026) ─────────────────────
//
// Een naam wordt nooit afgekapt en nooit afgebroken. Past hij niet, dan wordt
// de letter kleiner, tot de ondergrens van 16px. Past hij daar nog steeds
// niet, dan is de naam te lang om te tonen — dat wordt tegengehouden bij het
// invullen, niet hier (zie naamPastInProfielkop()).
//
// Waarom meten en niet tekens tellen: "MMMMMMMMMM" is ruim twee keer zo breed
// als "iiiiiiiiii". Tellen weet dat niet, meten wel.
// TT-517 fase 1 (besluit Ronald 30-10-2026): de bovenste trede is de maat
// Groot, 32px (was 36px met Roboto). De lagere treden krimpen tot de naam past.
const PROFIELNAAM_LADDER = [32, 28, 24, 20, 18, 16];

// Noodtreden onder de ondergrens. Alleen voor namen die al in de database
// staan van vóór de invulcontrole, en voor het smalle bureaubladvenster
// tussen 561px en circa 700px, waar de app-schil smaller is dan een telefoon
// (zie §11 van de huisstijl: #appRoot is daar 50% van het venster).
const PROFIELNAAM_NOOD = [14, 12, 10];

// Ondergrens waarop de invulcontrole toetst.
const PROFIELNAAM_MIN = 16;

// Referentiebreedte voor de invulcontrole: de ruimte voor de naam op Mijn
// Profiel bij een venster van 375px — avatar 80 + 16 + naam + 16 + ⋯-menu 44.
// Gemeten 11-09-2026. Dit is het smalste telefoonscherm waar de app op
// getoetst wordt, en Mijn Profiel is krapper dan de profielmodal.
// Gecorrigeerd 24-09-2026 (TT-318): hier stond "(215px)" voor de modal.
// Opnieuw gemeten op talenttent.org bij 375px: 247px.
const PROFIELNAAM_REFERENTIE = 187;

let naamMeterEl = null;

// Meet hoe breed een naam wordt bij een bepaalde lettergrootte, met dezelfde
// klasse en dus hetzelfde lettertype en dezelfde letterafstand als de echte
// kop. Het meetelement staat buiten beeld en wordt hergebruikt.
function meetNaamBreedte(naam, px) {
  if (!naamMeterEl) {
    naamMeterEl = document.createElement('div');
    naamMeterEl.className = 'profile-name naam-meter';
    document.body.appendChild(naamMeterEl);
  }
  naamMeterEl.style.fontSize = px + 'px';
  naamMeterEl.textContent = naam || '';
  return naamMeterEl.scrollWidth;
}

// Past deze naam op de smalste telefoon, op de ondergrens van 16px?
// Gebruikt door de invulcontrole van voornaam en gebruikersnaam.
function naamPastInProfielkop(naam) {
  return meetNaamBreedte(naam, PROFIELNAAM_MIN) <= PROFIELNAAM_REFERENTIE;
}

// Zet de lettergrootte van elke .profile-name binnen `root` op de grootste
// trede die past. Aanroepen ná het plaatsen in de pagina: een element dat er
// nog niet staat heeft geen breedte, en dan meet deze functie niets.
function fitProfileName(root) {
  const scope = root || document;
  scope.querySelectorAll('.profile-name').forEach(el => {
    const ruimte = el.clientWidth;
    if (!ruimte) return; // nog niet zichtbaar — niets te meten
    el.style.fontSize = '';
    for (const px of PROFIELNAAM_LADDER.concat(PROFIELNAAM_NOOD)) {
      el.style.fontSize = px + 'px';
      if (el.scrollWidth <= ruimte) return;
    }
  });
}

// TT-293 (18-09-2026): het woordmerk liep buiten het canvas bij een
// bureaubladvenster tussen circa 561 en 780px breed — daar is #appRoot 50% van
// het venster (§11) en dus smaller dan een telefoon, zelfde oorzaak als de
// noodtreden bij fitProfileName (huisstijl §2.1). Zelfde aanpak als
// fitProfileName: krimpen tot het past, geen vaste maat per scherm.
// TT-301 (20-09-2026): de gewone kop is net zo krap: op 280px (het smalste
// canvas) is er na twee knoppen van 44px nog 144px over, en het woordmerk is
// op 28px 188px breed — gemeten 20-09-2026. Eén regel, niet per scherm
// omzeild (§2, regel 11). TT-410b (06-10-2026): muzikant en band zijn een
// scherm met de kop van de app; er is geen venster met een eigen koprij meer.
const KOPLOGO_LADDER = [28, 24, 22, 20, 18, 16];
// Noodtreden, zelfde gedachte als PROFIELNAAM_NOOD hierboven. Ze zijn nodig
// in één stand: een koprij in een venster met zowel de terugknop als het
// ⋯-menu en het kruis, op het smalste canvas van 280px. Daar is na de drie
// knoppen nog 91px over en het woordmerk is op 16px al 107px breed (gemeten
// 20-09-2026). Liever een klein woordmerk dan een woordmerk over de knoppen.
// TT-318 (24-09-2026): trede 10 erbij. Het eigen woordmerk met 3px
// letterafstand is breder dan Alfa Slab One met 1px: op 12px 88px, en in die
// krapste stand liep het 1px over het ⋯-menu (gemeten, testset blok 25).
const KOPLOGO_NOOD = [14, 12, 10];

// Het woordmerk wordt buiten beeld gemeten, niet op zijn eigen plek in de
// kop. Reden (TT-301, gemeten 20-09-2026): het woordmerk staat gecentreerd
// in zijn kolom, dus loopt het bij overschrijding aan beide kanten uit zijn
// vak. scrollWidth telt alleen wat er rechts uitsteekt en meldde daardoor
// "past" terwijl het woordmerk 18px over de knoppen heen lag. Buiten beeld
// is er geen kolom die het indrukt, dus daar is de meting de echte breedte.
// Zelfde aanpak als meetNaamBreedte() hierboven.
let kopLogoMeterEl = null;

function meetLogoBreedte(logo, px) {
  if (!kopLogoMeterEl) {
    kopLogoMeterEl = document.createElement('div');
    kopLogoMeterEl.className = 'logo naam-meter';
    document.body.appendChild(kopLogoMeterEl);
  }
  if (kopLogoMeterEl.innerHTML !== logo.innerHTML) kopLogoMeterEl.innerHTML = logo.innerHTML;
  kopLogoMeterEl.style.fontSize = px + 'px';
  return kopLogoMeterEl.scrollWidth;
}

// De ruimte in het middenvak van de kop, voor het woordmerk of de titel. Gemeten
// vanaf waar het element werkelijk staat (het midden van de rij plus een
// eventuele optische verschuiving) tot de binnenkant van elk buitenvak; het
// element groeit naar twee kanten even ver, dus de krapste kant telt, twee keer.
function kopRuimte(rij, el) {
  const vakken = [...rij.querySelectorAll(':scope > .kop-vak')];
  if (vakken.length < 2) return null;
  const st = getComputedStyle(rij);
  const rb = rij.getBoundingClientRect();
  const pl = parseFloat(st.paddingLeft), pr = parseFloat(st.paddingRight);
  const tf = getComputedStyle(el).transform;
  const verschuiving = tf && tf !== 'none' ? new DOMMatrix(tf).m41 : 0;
  const midden = rb.left + pl + (rij.clientWidth - pl - pr) / 2 + verschuiving;
  const links = vakken[0].getBoundingClientRect().right;
  const rechts = vakken[vakken.length - 1].getBoundingClientRect().left;
  return 2 * Math.min(midden - links, rechts - midden);
}

function fitKopLogo(root) {
  const scope = root || document;
  scope.querySelectorAll('header').forEach(rij => {
    const logo = rij.querySelector(':scope > .logo');
    if (!logo || !rij.clientWidth) return; // nog niet zichtbaar — niets te meten
    // De ruimte voor het woordmerk. TT-318 (24-09-2026): gerekend vanaf de
    // plek waar het woordmerk werkelijk staat — het midden van de rij plus
    // zijn optische verschuiving — tot de binnenkant van elk buitenvak. Het
    // woordmerk groeit naar twee kanten even ver, dus de krapste kant telt,
    // twee keer. Was: de rijbreedte min de twee vakken samen. Dat klopte
    // alleen als beide vakken even breed waren; met het ⋯-menu en het kruis
    // rechts (drie knoppen) liep het woordmerk daardoor over het ⋯-menu.
    // De vakken zelf veranderen niet met de lettergrootte: ze staan tegen de
    // buitenrand van hun kolom (justify-self start en end).
    const ruimte = kopRuimte(rij, logo);
    if (ruimte === null) return;
    for (const px of KOPLOGO_LADDER.concat(KOPLOGO_NOOD)) {
      logo.style.fontSize = px + 'px';
      if (meetLogoBreedte(logo, px) <= ruimte) return;
    }
  });
}

// TT-517 fase 3 (01-11-2026, besluit Ronald N2: "een naam is heilig en moet
// zichtbaar zijn"): de titel in de kop wordt nooit afgekapt. Past hij niet op
// 17px (de rol Tegelkop, huisstijl §2), dan op 15px; past hij dan nog niet,
// dan op twee regels van 15px (36px hoog, past in de rij van 44px). Alleen
// maten uit de schaal van zes (TT-517 fase 1). Meestal gaat het om een lange
// naam op een profiel (een bandnaam mag 40 tekens). Zelfde meting als het
// woordmerk: buiten beeld, want een gecentreerd element loopt aan twee kanten
// uit zijn vak.
const KOPTITEL_LADDER = [17, 15];
let kopTitelMeterEl = null;
function fitKopTitel() {
  const titel = document.getElementById('kopTitel');
  const rij = titel?.parentElement;
  if (!titel || !rij || !rij.clientWidth) return; // nog niet zichtbaar
  const ruimte = kopRuimte(rij, titel);
  if (ruimte === null) return;
  if (!kopTitelMeterEl) {
    kopTitelMeterEl = document.createElement('div');
    kopTitelMeterEl.className = 'kop-titel naam-meter';
    document.body.appendChild(kopTitelMeterEl);
  }
  kopTitelMeterEl.textContent = titel.textContent;
  titel.style.maxWidth = Math.floor(ruimte) + 'px';
  titel.classList.remove('twee-regels');
  for (const px of KOPTITEL_LADDER) {
    kopTitelMeterEl.style.fontSize = px + 'px';
    titel.style.fontSize = px + 'px';
    if (kopTitelMeterEl.scrollWidth <= ruimte) return;
  }
  titel.classList.add('twee-regels');
}

// ═══════════════════════════════════════════════════════════════════════
// Media — gedeeld door de wizard (stap 4), Je mediahoek en het profiel
// ═══════════════════════════════════════════════════════════════════════
// TT-263 (13-09-2026, Ronald): "gebruiker kan niet zien welke link welke
// video is." Een rij met alleen een adres zegt niets. Daarom: miniatuur,
// naam van de video, een bannerteken om te kiezen wat straks in de
// bannerbalk op het profiel komt, en afspelen binnen de app in plaats van
// een sprong naar de browser.
//
// detectPlatform() en extractYouTubeId() stonden tot 13-09-2026 in
// wizard.js. Ze worden nu door drie bestanden gebruikt; gedeelde
// hulpfuncties horen hier. In wizard.js zijn ze verwijderd, niet gekopieerd.

// Ronalds verwachting (13-09-2026): vijf à zes items in de banner.
const MEDIA_BANNER_MAX = 6;

function detectPlatform(url) {
  if (url.includes('youtube') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('instagram')) return 'Instagram';
  if (url.includes('soundcloud')) return 'SoundCloud';
  if (url.includes('tiktok')) return 'TikTok';
  if (url.includes('spotify')) return 'Spotify';
  return 'Link';
}

// TT-184 (03-09-2026): een YouTube-miniatuur is zonder sleutel te bouwen —
// elke YouTube-URL bevat een video-ID, en img.youtube.com/vi/<ID>/hqdefault.jpg
// bestaat altijd voor een geldige video.
function extractYouTubeId(url) {
  const id = extractYouTubeIdRuw(url);
  // TT-483: alleen een echt video-id (letters, cijfers, - en _). Een waarde uit
  // de link zelf (?v=...) kan na het decoderen aanhalingstekens bevatten.
  return id && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

function extractYouTubeIdRuw(url) {
  let u;
  try { u = new URL(url); } catch (e) { return null; }
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    return u.pathname.slice(1).split('/')[0] || null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    if (u.pathname === '/watch') return u.searchParams.get('v');
    const shorts = u.pathname.match(/^\/shorts\/([^/]+)/);
    if (shorts) return shorts[1];
    const embed = u.pathname.match(/^\/embed\/([^/]+)/);
    if (embed) return embed[1];
  }
  return null;
}

// ─── De naam van een video ───────────────────────────────────────────────
// Gemeten op 13-09-2026 vanaf talenttent.org, alle vier met status 200 en
// zonder sleutel: YouTube, Spotify, SoundCloud en TikTok geven via oEmbed de
// titel terug. Instagram niet — die weigert de aanvraag (geen token), dus
// daar blijft de platformnaam staan.
const MEDIA_OEMBED = {
  YouTube:    u => 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(u),
  Spotify:    u => 'https://open.spotify.com/oembed?url=' + encodeURIComponent(u),
  SoundCloud: u => 'https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(u),
  TikTok:     u => 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(u),
};

// Onthouden per adres, ook een mislukking: anders vraagt elke hertekening
// van de lijst opnieuw, en een lijst hertekent bij elke toetsaanslag.
const mediaTitelCache = new Map();

async function mediaTitelOphalen(url) {
  const veilig = safeUrl(url);
  if (!veilig) return null;
  if (mediaTitelCache.has(veilig)) return mediaTitelCache.get(veilig);
  const bouw = MEDIA_OEMBED[detectPlatform(veilig)];
  if (!bouw) { mediaTitelCache.set(veilig, null); return null; }
  let titel = null;
  try {
    const r = await fetch(bouw(veilig));
    if (r.ok) {
      const j = await r.json();
      titel = (j && j.title) ? String(j.title) : null;
    }
  } catch (e) {
    // Geen netwerk, of het platform weigert. Geen melding: de platformnaam
    // staat er al, en een toast per link zou het scherm overspoelen.
    titel = null;
  }
  mediaTitelCache.set(veilig, titel);
  return titel;
}

// Vult de namen ná het tekenen van een lijst. Elk element dat een naam kan
// krijgen draagt data-media-url; staat er al een naam, dan blijft die staan.
function mediaTitelsBijwerken(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-media-url]').forEach(async el => {
    const url = el.getAttribute('data-media-url');
    if (!url || el.dataset.titelGezet === '1') return;
    const titel = await mediaTitelOphalen(url);
    if (!titel) return;
    if (!el.isConnected) return; // lijst is intussen opnieuw getekend
    el.textContent = titel;
    el.dataset.titelGezet = '1';
    if (el.classList.contains('media-rij-titel')) el.title = titel;
  });
}

// ─── Het bannerteken ─────────────────────────────────────────────────────
// Besluit Ronald 13-09-2026: geen vinkje maar de vorm van de banner — een
// cirkel met een liggende afgeronde rechthoek erin. Gekozen is goud gevuld
// met de vorm in bijna-zwart; niet gekozen is een omtrek zonder vulling.
// Goud staat hier als vlak onder een donkere vorm, nooit doorschijnend
// (huisstijl §1.1). Alle kleuren staan in styles.css, niet hier.
function bannerKnopHTML(aan, onclickJs, opBeeld) {
  return `<button type="button" class="banner-btn${opBeeld ? ' op-beeld' : ''}" aria-pressed="${aan ? 'true' : 'false'}"
    aria-label="${aan ? 'Uit je banner halen' : 'In je banner tonen'}" title="${aan ? 'Uit je banner halen' : 'In je banner tonen'}"
    onclick="${onclickJs}">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle class="bb-schijf" cx="12" cy="12" r="11"></circle><rect class="bb-vorm" x="5.5" y="8.5" width="13" height="7" rx="2"></rect></svg>
  </button>`;
}

// Eén tekst, twee schermen (wizard en Je mediahoek) — zie §2.11: een maat of
// een regel wordt in de standaard doorgevoerd, niet per scherm.
// Het teken staat vóór de tekst, in de gekozen (gouden) stand en op
// teksthoogte — zo weet de gebruiker meteen welk teken hij zoekt
// (besluit Ronald, 13-09-2026).
function bannerTellerHTML(aantal) {
  return `<span class="banner-teken" aria-hidden="true"><svg viewBox="0 0 24 24"><circle class="bb-schijf" cx="12" cy="12" r="11"></circle><rect class="bb-vorm" x="5.5" y="8.5" width="13" height="7" rx="2"></rect></svg></span>` +
    `<b>Kies je bannerinhoud:</b> ${aantal} van ${MEDIA_BANNER_MAX} gekozen.`;
}

// Aan/uit zonder de lijst opnieuw te tekenen (Ronald, 13-09-2026: "alleen de
// knop moet aan/uit gaan, verder niets"). Hertekenen liet alle rijen kort
// verdwijnen — de rijen kregen hun openingsanimatie opnieuw en elke miniatuur
// werd opnieuw opgehaald. Alleen deze ene knop wijzigt nu van stand.
function bannerKnopStandZetten(houderId, i, aan) {
  const knop = document.querySelectorAll(`#${houderId} .banner-btn`)[i];
  if (!knop) return;
  const label = aan ? 'Uit je banner halen' : 'In je banner tonen';
  knop.setAttribute('aria-pressed', aan ? 'true' : 'false');
  knop.setAttribute('aria-label', label);
  knop.setAttribute('title', label);
}

// Waar of onwaar teruggeven zodat de aanroeper de vlag alleen omzet als het
// mag. De bovengrens geldt over foto's, video's en links samen: de banner
// toont één reeks, geen reeks per tabblad.
function bannerKeuzeMag(huidigAantal, wordtAan) {
  if (!wordtAan) return true;
  if (huidigAantal < MEDIA_BANNER_MAX) return true;
  showToast(`Je banner toont maximaal ${MEDIA_BANNER_MAX} items.`);
  return false;
}

// ─── Afspelen binnen de app ──────────────────────────────────────────────
// TT-263: een link opende tot 13-09-2026 de browser van de gebruiker, en
// daarmee verliet iemand de app. Gemeten op 13-09-2026 vanaf talenttent.org:
// het kader van YouTube (youtube-nocookie), Spotify en SoundCloud laadt.
// Instagram en TikTok laten afspelen binnen een andere pagina niet toe; die
// krijgen een scherm dat dat zegt, met één knop naar het platform zelf.
// De cookieloze variant van YouTube is met opzet gekozen, en het kader wordt
// pas gebouwd ná de tik — vóór die tik staat er niets van een ander bedrijf
// in de pagina.
function mediaEmbedSrc(url) {
  const veilig = safeUrl(url);
  if (!veilig) return null;
  const yt = extractYouTubeId(veilig);
  if (yt) return `https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt)}?autoplay=1&rel=0`;
  const platform = detectPlatform(veilig);
  if (platform === 'Spotify') {
    try {
      const u = new URL(veilig);
      const m = u.pathname.match(/^\/(track|album|playlist|episode|show)\/([^/]+)/);
      if (m) return `https://open.spotify.com/embed/${m[1]}/${encodeURIComponent(m[2])}`;
    } catch (e) { return null; }
    return null;
  }
  if (platform === 'SoundCloud') {
    return 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(veilig);
  }
  return null;
}

function openMediaSpeler(url, soort, titel, platform) {
  const veilig = safeUrl(url);
  if (!veilig) { showToast('Deze link kan niet geopend worden.'); return; }
  const naam = titel || platform || (soort === 'video' ? "Video" : 'Link');
  document.getElementById('mediaSpelerTitel').textContent = naam;

  const beeld = document.getElementById('mediaSpelerBeeld');
  const voet = document.getElementById('mediaSpelerVoet');
  const embed = soort === 'link' ? mediaEmbedSrc(veilig) : null;

  if (soort === 'video') {
    beeld.innerHTML = `<video ${fotoBronAttr(veilig)} controls autoplay playsinline style="width:100%;height:100%;background:#000;"></video>`;
    voet.innerHTML = '';
  } else if (embed) {
    beeld.innerHTML = `<iframe src="${escHtml(embed)}" title="${escHtml(naam)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" style="width:100%;height:100%;border:0;"></iframe>`;
    voet.innerHTML = `<a class="btn btn-ghost" href="${veilig}" target="_blank" rel="noopener noreferrer">Openen op ${escHtml(platform || 'de website')}</a>`;
  } else {
    beeld.innerHTML = `<div class="media-speler-uitleg">
      <div class="media-speler-platform">${escHtml(platform || 'Deze link')}</div>
      <p>Dit platform laat afspelen binnen een app niet toe.</p>
    </div>`;
    voet.innerHTML = `<a class="btn btn-primary" href="${veilig}" target="_blank" rel="noopener noreferrer">Openen op ${escHtml(platform || 'de website')}</a>`;
  }

  document.getElementById('mediaSpelerModal').classList.add('visible');
  if (soort === 'link' && !titel) {
    // De naam komt na het openen binnen; het scherm staat er dan al.
    mediaTitelOphalen(veilig).then(t => {
      if (t && document.getElementById('mediaSpelerModal').classList.contains('visible')) {
        document.getElementById('mediaSpelerTitel').textContent = t;
      }
    });
  }
}

function closeMediaSpeler() {
  document.getElementById('mediaSpelerModal').classList.remove('visible');
  // Leegmaken stopt het afspelen. Zonder dit speelt het geluid door achter
  // een gesloten scherm.
  document.getElementById('mediaSpelerBeeld').innerHTML = '';
  document.getElementById('mediaSpelerVoet').innerHTML = '';
}

// ─── Eén vorm voor beide schermen ────────────────────────────────────────
// De wizard (stap 4) en Je mediahoek tonen dezelfde lijst. Tot 13-09-2026
// stond die HTML twee keer, bijna gelijk maar niet helemaal. Nu staat de vorm
// hier één keer; de twee schermen verschillen alleen in de namen van hun
// functies (zonder voorvoegsel = wizard, 'mh' = Je mediahoek).
function mediaFnNaam(voorvoegsel, naam) {
  return voorvoegsel ? voorvoegsel + naam.charAt(0).toUpperCase() + naam.slice(1) : naam;
}

// Miniatuur van een link: bij YouTube het echte beeld, anders een vlak met de
// platformnaam. Bewust zonder extra netwerkaanvraag per link (TT-184).
function mediaLinkMiniatuurHTML(url) {
  const veilig = safeUrl(url);
  const platform = veilig ? detectPlatform(veilig) : 'Link';
  const yt = veilig ? extractYouTubeId(veilig) : null;
  if (yt) {
    return `<img src="https://img.youtube.com/vi/${escHtml(yt)}/hqdefault.jpg" alt="" loading="lazy">`;
  }
  return `<span class="media-mini-platform">${escHtml(veilig ? platform : '—')}</span>`;
}

// Eén rij in het tabblad Links: bannerteken · miniatuur · naam · adres · ✕.
// De naam staat op één regel en wordt afgekapt met één beletselteken; een tik
// vouwt 'm uit (besluit Ronald 13-09-2026, M1), op een bureaublad verschijnt
// hij bovendien als label bij aanwijzen (title).
function mediaLinkRijHTML(l, i, voorvoegsel) {
  const fn = n => mediaFnNaam(voorvoegsel, n);
  const veilig = safeUrl(l.url);
  const platform = veilig ? detectPlatform(veilig) : '';
  const naam = platform || 'Nieuwe link';
  return `
    <div class="media-rij">
      ${bannerKnopHTML(!!l.inBanner, `${fn('toggleLinkBanner')}(${i})`)}
      <button type="button" class="media-mini" onclick="${fn('speelLink')}(${i})" aria-label="Afspelen"${veilig ? '' : ' disabled'}>
        ${mediaLinkMiniatuurHTML(l.url)}
      </button>
      <div class="media-rij-tekst">
        <div class="media-rij-titel" ${veilig ? `data-media-url="${veilig}"` : ''} title="${escHtml(naam)}"
          onclick="this.classList.toggle('open')">${escHtml(naam)}</div>
        <input type="url" class="media-rij-url" value="${escHtml(l.url || '')}" placeholder="https://youtube.com/watch?v=..."
          aria-label="Adres van de link"
          oninput="${fn('updateLinkUrl')}(${i}, this)" onchange="${fn('renderLinksList')}()">
      </div>
      <button type="button" class="song-remove" onclick="${fn('removeLink')}(${i})" aria-label="Link verwijderen">${RIJ_KRUIS}</button>
    </div>`;
}

// Eén tegel in het tabblad Upload. Bannerteken linksboven, ✕ rechtsboven
// (besluit Ronald 13-09-2026).
function mediaTegelHTML(m, i, voorvoegsel) {
  const fn = n => mediaFnNaam(voorvoegsel, n);
  const beeld = m.type === 'foto'
    ? `<img ${kleinFotoAttr(safeUrl(m.url))} alt="${escHtml(m.name || '')}">`
    : `<span class="media-thumb-video">Video</span>`;
  return `
    <div class="media-thumb">
      <button type="button" class="media-thumb-open" onclick="${fn('speelMedia')}(${i})" aria-label="${m.type === 'foto' ? 'Foto bekijken' : 'Video afspelen'}">${beeld}</button>
      ${bannerKnopHTML(!!m.inBanner, `${fn('toggleMediaBanner')}(${i})`, true)}
      ${m.uploading ? `<div class="media-thumb-laden"><div class="save-spinner"></div></div>` : ''}
      <div class="thumb-type">${escHtml(m.type)}</div>
      <button type="button" class="thumb-remove" onclick="${fn('removeMedia')}(${i})" aria-label="Verwijderen">✕</button>
    </div>`;
}

// Een tik op het bannerteken van een foto of video (wizard, Je mediahoek,
// Onze media; één functie, huisstijl §18.2). TT-517 fase 5 (huisstijl §21):
// kiest de gebruiker een foto voor de banner, dan opent eerst het kader van
// 4:3 (kiesUitsnede, 'banner'). Annuleren laat alles zoals het was. Uit de
// banner halen vergeet het kader. Een video krijgt geen kader.
async function bannerTekenTik(m, bestanden, links, gridId, tellerId) {
  if (!m) return;
  if (!bannerKeuzeMag(bannerAantal(bestanden, links), !m.inBanner)) return;
  if (!m.inBanner && m.type === 'foto') {
    const kader = await kiesUitsnede(m.url, 'banner');
    if (!kader) return;
    m.uitsnede = kader;
  } else {
    m.uitsnede = null;
  }
  m.inBanner = !m.inBanner;
  const i = bestanden.indexOf(m);
  if (i >= 0) bannerKnopStandZetten(gridId, i, m.inBanner);
  bannerTellerBijwerken(tellerId, bestanden, links);
}

// Wat de app van het kader bewaart: alleen bij een foto in de banner.
function bannerKader(m) {
  return m && m.type === 'foto' && m.inBanner ? uitsnedeGeldig(m.uitsnede) : null;
}

// De bovengrens geldt over foto's, video's en links samen: de banner toont
// één reeks, geen reeks per tabblad.
function bannerAantal(bestanden, links) {
  return (bestanden || []).filter(m => m.inBanner).length + (links || []).filter(l => l.inBanner).length;
}

function bannerTellerBijwerken(elId, bestanden, links) {
  const el = document.getElementById(elId);
  if (el) el.innerHTML = bannerTellerHTML(bannerAantal(bestanden, links));
}

// ═══════════════════════════════════════════════════════════════════════
// TT-517 fase 4 (01-11-2026): het profiel als hoes (huisstijl §21, besluiten
// Ronald 30 en 31-10-2026, (d) 01-11-2026). Vervangt de bannerbalk van TT-265
// en de kop met de ronde profielfoto van TT-384. Muzikant en band gelijk.
// - De foto groot bovenaan, 4:3, binnen de marge, hoeken 16px, 8px onder de
//   kop. De naam groot op de foto, de regel eronder in dezelfde kleur.
// - De banner zit in de hoes: eerst de profielfoto (of bandfoto), daarna de
//   media die de muzikant of band voor de banner koos (maximaal zes). Zonder
//   profielfoto begint de hoes met die media (besluit Ronald 01-11-2026, A).
// - Vegen om te bladeren. De stippen zijn alleen een aanwijzing, geen knop
//   (TT-541). Met een muis twee pijltjes, niet op het eerste en het laatste
//   beeld, nooit op een telefoon.
// - De hoes staat stil: geen doorschuiven, geen video die vanzelf speelt.
// - Delen en ⋯ rechtsonder op de foto, in de tekstkleur van de hoes.
// - Tekstkleur en matglas komen uit het beeld zelf (hoesBeeldOordeel()): wit
//   of antraciet, en matglas alleen als de foto erom vraagt.
// Zonder foto en zonder gekozen media staat er een leeg, donker podium (de
// schijnwerper komt in fase 6).

// Op volgorde van toevoegen, de oudste eerst, voor muzikant en band gelijk
// (besluit Ronald 01-11-2026, A). Zonder tijd (de publieke functie zet de
// media zelf al op volgorde) blijft de volgorde staan: sort() is stabiel.
function opVolgordeVanToevoegen(lijst) {
  return (lijst || []).slice().sort((x, y) => String((x && x.created_at) || '').localeCompare(String((y && y.created_at) || '')));
}

function profielBannerItems(mediaLijst) {
  return opVolgordeVanToevoegen(mediaLijst)
    .filter(x => x && x.in_banner)
    .map(x => ({ ...x, veilig: safeUrl(x.url) }))
    .filter(x => x.veilig || x.afgeschermd)
    .slice(0, MEDIA_BANNER_MAX);
}

// ─── TT-45 (25-09-2026, besluit Ronald 23-09-2026): afgeschermde media ──────
// Een bezoeker zonder account ziet van een 13- tot 15-jarige geen enkel
// beeld. De database beslist dat, niet de app (tt_get_musicians_public en
// tt_get_bands_public): een afgeschermd medium komt zonder adres, met
// `afgeschermd: true`.
// TT-517 fase 7 (besluit Ronald 01-11-2026, B): op de plek van elk beeld staat
// een wazig beeld, per foto een eigen, piepkleine versie (16 x 12 pixels) die
// de app bij het uploaden maakt (wazigMaken() in wizard.js). Afgeschermd geeft
// de database in avatar_url die versie ("data:image/jpeg;base64,…"), of het
// woord 'afgeschermd' als er (nog) geen versie is; dan staat er één algemeen
// wazig beeld. Leeg blijft leeg: de schijnwerper (geen foto). Een medium
// krijgt `wazig`. Geen teken, geen knop (huisstijl §18.7).
const WAZIG_ALGEMEEN = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAMABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDmNO0qT7JM0Z2nsBWxBorJpgWRSWPtWNpurXUNoShXJbuKtXPiTUk+VZEwAP4a8WbqNtI9FcmjP//Z';
const WAZIG_VORM = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;
// De bron van het wazige beeld, of null als src geen afgeschermde foto is.
function wazigBron(src) {
  const s = String(src || '');
  if (s === 'afgeschermd') return WAZIG_ALGEMEEN;
  return s.length <= 2000 && WAZIG_VORM.test(s) ? s : null;
}
function wazigHTML(bron, klasse) {
  return `<img class="foto-wazig${klasse ? ' ' + klasse : ''}" src="${bron}" alt="" aria-hidden="true">`;
}
// Het beeld van een profiel- of bandfoto in een lijst, een rij of een kaart:
// het fotootje, het wazige beeld (afgeschermd), of '' (geen foto: de plek
// zet dan zelf de schijnwerper). `alt` is gewone tekst.
function fotoHTML(src, alt, klasse) {
  const w = wazigBron(src);
  if (w) return wazigHTML(w, klasse);
  const u = safeUrl(src);
  return u ? `<img${klasse ? ` class="${klasse}"` : ''} ${kleinFotoAttr(u)} alt="${escHtml(alt || '')}">` : '';
}
// De afgeschermde media van een profiel: één vlak in plaats van tegels, met
// het aantal en één opmerking (huisstijl §18.7). Het beeld: de eerste foto
// met een wazige versie, anders die van de profielfoto, anders het algemene.
function mediaAfgeschermdHTML(lijst, fotoWazig) {
  const beeld = lijst.filter(x => x.media_type !== 'link').length;
  const links = lijst.length - beeld;
  const tekst = [beeld ? `${beeld} ${beeld === 1 ? 'foto of video' : "foto's en video's"}` : '',
    links ? `${links} ${links === 1 ? 'link' : 'links'}` : ''].filter(Boolean).join(' · ');
  const eerste = lijst.map(x => wazigBron(x.wazig)).find(Boolean);
  const bron = eerste || wazigBron(fotoWazig) || WAZIG_ALGEMEEN;
  return `<div class="media-afgeschermd"><img class="foto-wazig" src="${bron}" alt="" aria-hidden="true" onload="wazigWaasZetten(this)">` +
    `<span class="media-afgeschermd-tekst"><b>${escHtml(tekst)}</b>` +
    `<span>Maak een profiel aan om de inhoud te bekijken.</span></span></div>`;
}

// De donkere waas over het vlak: minstens 45%, en zo veel meer als nodig is
// voor wit 6,1:1 op het lichtste punt van het beeld (huisstijl §18.7). Een
// eigen foto kan licht zijn; het algemene beeld is donker genoeg met 45%.
function wazigWaasZetten(img) {
  try {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 12;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, 16, 12);
    const d = x.getImageData(0, 0, 16, 12).data;
    // Het vlak toont het beeld vervaagd: ongeveer één pixel van de kleine
    // versie. Meet daarom het gemiddelde van elke pixel met zijn buren (1-2-1).
    const k = (px, py, n) => d[(Math.min(11, Math.max(0, py)) * 16 + Math.min(15, Math.max(0, px))) * 4 + n];
    let licht = 0;
    for (let py = 0; py < 12; py++) for (let px = 0; px < 16; px++) for (let n = 0; n < 3; n++) {
      let som = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) som += k(px + dx, py + dy, n) * (2 - Math.abs(dx)) * (2 - Math.abs(dy));
      licht = Math.max(licht, som / 16);
    }
    const lum = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    let waas = 0.45;
    // De waas mengt in sRGB, zoals de browser: elk kanaal × (1 − waas), plus 13 × waas.
    while (waas < 0.9 && 1.05 / (lum(licht * (1 - waas) + 13 * waas) + 0.05) < 6.1) waas += 0.01;
    img.parentNode.style.setProperty('--waas-vlak', waas.toFixed(2));
  } catch (e) { img.parentNode.style.setProperty('--waas-vlak', '0.65'); }
}

// Het speelteken: een driehoek in een ronde schijf, midden op elk beeld dat een
// video is (de hoes en de videotegel op het profiel). Alleen een teken, geen
// knop: de tik gaat naar het vlak eronder. Besluit Ronald, 08-10-2026: "niet
// zichtbaar in de banner dat het een video is. voeg een play teken toe."
const SPEELTEKEN_HTML = '<span class="pb-speel" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg></span>';

// De bron-attributen voor een beeld in de hoes. Een foto of video uit de
// eigen opslag laadt met crossorigin, zodat de app het beeld kan meten. Een
// beeld van elders (YouTube) niet: dat zou zonder toestemming van die site
// niet laden. Dan meet de app niets en kiest de veilige vorm.
function hoesBronAttr(src) {
  return (fotoLinkSleutel(src) ? 'crossorigin="anonymous" ' : '') + fotoBronAttr(src);
}

const HOES_PIJL = r => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="${r ? '9 5 16 12 9 19' : '15 5 8 12 15 19'}"/></svg>`;

// o.foto: de profiel- of bandfoto (uit safeUrl) of null; o.wazig: het wazige
// beeld van een afgeschermde foto (wazigBron(), TT-517 fase 7) of null; o.naam: de naam als
// tekst; o.regels: HTML van de regel onder de naam; o.knoppen: HTML van
// profielKnoppenHTML(); o.media: de media voor de banner; o.fotoToevoegen:
// JavaScript voor de knop "Voeg een foto toe" op een leeg podium, alleen voor de
// eigenaar (TT-517 fase 6, huisstijl §21); anders null.
function profielHoesHTML(o) {
  const items = profielBannerItems(o.media);
  // TT-385 (02-10-2026, besluit Ronald): een afgeschermde banner staat er
  // niet. De database schermt een profiel in zijn geheel af, dus één
  // afgeschermd item is genoeg. Dan blijft alleen het eerste beeld.
  const banner = items.some(it => it.afgeschermd) ? [] : items;
  // Besluit Ronald (01-11-2026, A): zonder profielfoto begint de hoes met de
  // media die voor de banner gekozen zijn. Het lege podium staat er alleen
  // als er geen enkel beeld is.
  const podium = !o.foto && !o.wazig && !banner.length;
  const voor = o.foto || o.wazig || podium ? 1 : 0;
  const n = banner.length + voor;
  const naam = escHtml(o.naam);

  const eerste = !voor ? '' : o.foto
    ? `<button type="button" class="hoes-vlak" onclick="openMediaLightbox('${jsAttr(o.foto)}')" aria-label="Foto van ${naam} groot bekijken">` +
      `<img class="hoes-img" ${hoesBronAttr(o.foto)} alt="${naam}"></button>`
    // TT-517 fase 7: afgeschermd het wazige beeld, geen knop (huisstijl §18.7).
    : o.wazig ? `<div class="hoes-vlak hoes-wazig" role="img" aria-label="Alleen zichtbaar met een account">${wazigHTML(o.wazig, 'hoes-img')}</div>`
    // TT-517 fase 6: zonder foto de schijnwerper, twee bundels die samen op
    // de naam vallen (hoesBundelZetten()). Het podium zelf is geen knop.
    : `<div class="hoes-vlak hoes-leeg" role="img" aria-label="Nog geen foto"><span class="hoes-bundel"></span></div>`;
  // Alleen de eigenaar ziet de knop "Voeg een foto toe" (besluit Ronald
  // 31-10-2026, optie A), in het midden van de hoes (besluit 01-11-2026); een
  // bezoeker ziet alleen de schijnwerper.
  const knop = podium && o.fotoToevoegen
    ? `<button type="button" class="btn btn-primary hoes-foto-knop" onclick="${o.fotoToevoegen}">Voeg een foto toe</button>` : '';

  const vlakken = banner.map((it, i) => {
    const url = it.veilig;
    const platform = it.platform || detectPlatform(url);
    const wat = `Beeld ${i + 1 + voor} van ${n}`;
    let binnen, tik;
    if (it.media_type === 'foto') {
      // TT-517 fase 5: een bannerfoto met een gekozen kader toont precies dat
      // kader; zonder kader het midden (object-fit: cover).
      const k = uitsnedeGeldig(it.uitsnede);
      binnen = k
        ? `<img class="hoes-img hoes-kader" ${hoesBronAttr(url)} style="${uitsnedeStijl(k)}" data-kader="${k.x},${k.y},${k.b},${k.h}" alt="${wat}" loading="lazy">`
        : `<img class="hoes-img" ${hoesBronAttr(url)} alt="${wat}" loading="lazy">`;
      tik = `openMediaLightbox('${jsAttr(url)}')`;
    } else if (it.media_type === 'video') {
      // #t=0.1 dwingt het eerste beeld af; zonder dat laat Safari op de
      // iPhone een zwart vlak zien tot er getikt wordt. muted + playsinline
      // staan erbij omdat de browser het element anders niet mag uitlezen.
      binnen = `<video class="hoes-img" ${hoesBronAttr(url + '#t=0.1')} muted playsinline preload="metadata" tabindex="-1" aria-hidden="true"></video>` + SPEELTEKEN_HTML;
      tik = `openMediaSpeler('${jsAttr(url)}', 'video')`;
    } else {
      const ytId = extractYouTubeId(url);
      binnen = ytId
        ? `<img class="hoes-img" src="https://img.youtube.com/vi/${escHtml(ytId)}/hqdefault.jpg" alt="${wat}" loading="lazy">` + SPEELTEKEN_HTML
        : `<span class="pb-kaart"><span class="pb-kaart-platform">${escHtml(platform)}</span>` +
          `<span class="pb-kaart-titel" data-media-url="${url}">Tik om te openen</span></span>`;
      tik = `openMediaSpeler('${jsAttr(url)}', 'link', null, '${jsAttr(platform)}')`;
    }
    return `<button type="button" class="hoes-vlak" onclick="${tik}" aria-label="${wat}">${binnen}</button>`;
  }).join('');

  const meer = n > 1
    ? `<button type="button" class="hoes-pijl vorige" aria-label="Vorig beeld" hidden>${HOES_PIJL(false)}</button>` +
      `<button type="button" class="hoes-pijl volgende" aria-label="Volgend beeld">${HOES_PIJL(true)}</button>` +
      `<div class="hoes-stippen" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<span class="hoes-stip${i ? '' : ' aan'}"></span>`).join('')}</div>`
    : '';

  // TT-517 fase 8: de tekst voor het visitekaartje (kaartVoorDelen() in musicians.js).
  const kaart = o.kaart ? ` data-kaart="${escHtml(JSON.stringify(o.kaart))}"` : '';
  return `<div class="hoes"${kaart}>
    <div class="hoes-beeld"><div class="hoes-spoor">${eerste}${vlakken}</div>${meer}${knop}</div>
    <div class="hoes-tekst"><div class="profile-name">${naam}</div><div class="profiel-regels">${o.regels}</div></div>
    ${o.knoppen}
  </div>`;
}

function hoesRustig() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// De tekstkleur van de hoes: wit (--op-foto) of antraciet (--op-foto-donker).
// Leesbaar is: op de 5% slechtste plekken 4,5:1 en op de slechtste plek 3:1
// (huisstijl §21, drempel voorstel Claude).
const HOES_ANTRACIET = [82, 87, 95];
function hoesLum(r, g, b) {
  const a = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

// Tekent het beeld zoals het in de hoes staat (4:3, midden uitgesneden, of
// het gekozen kader van een bannerfoto) en beoordeelt het stuk waar de naam,
// de regel en de tekens staan: de onderste 40%, over de volle breedte. Geeft
// null als het beeld niet te lezen is (een beeld van een andere site zonder
// toestemming): dan geldt de veilige vorm.
function hoesBeeldOordeel(m) {
  const iw = m.naturalWidth || m.videoWidth, ih = m.naturalHeight || m.videoHeight;
  if (!iw || !ih) return null;
  let sw = iw, sh = iw * 3 / 4;
  if (sh > ih) { sh = ih; sw = ih * 4 / 3; }
  let sx = (iw - sw) / 2, sy = (ih - sh) / 2;
  const kader = m.dataset && m.dataset.kader ? m.dataset.kader.split(',').map(Number) : null;
  if (kader) { sx = kader[0] * iw; sy = kader[1] * ih; sw = kader[2] * iw; sh = kader[3] * ih; }
  const c = document.createElement('canvas');
  c.width = 96; c.height = 72;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(m, sx, sy, sw, sh, 0, 0, 96, 72);
  const d = x.getImageData(0, 43, 96, 28).data; // gooit een fout als het beeld niet te lezen is
  const La = hoesLum(...HOES_ANTRACIET), wit = [], ant = [];
  let som = 0, mn = 1, mx = 0;
  for (let i = 0; i < d.length; i += 4) {
    const l = hoesLum(d[i], d[i + 1], d[i + 2]);
    wit.push(1.05 / (l + 0.05));
    ant.push((Math.max(l, La) + 0.05) / (Math.min(l, La) + 0.05));
    som += l; mn = Math.min(mn, l); mx = Math.max(mx, l);
  }
  const maat = a => { const s = a.slice().sort((p, q) => p - q); return { p5: s[Math.floor(s.length * 0.05)], min: s[0] }; };
  const w = maat(wit), z = maat(ant);
  const best = w.p5 >= z.p5 ? w : z;
  const waas = best.p5 < 4.5 || best.min < 3;
  return {
    // Met matglas: antraciet op een lichte plek, wit op een donkere.
    donker: waas ? som / (d.length / 4) > 0.42 : w.p5 < z.p5,
    waas,
    // Hoe groter het verschil tussen licht en donker achter de naam, hoe dichter het matglas.
    sterk: 0.4 + 0.45 * Math.min(1, (mx - mn) / 0.8),
    canvas: c, beeld: m, sx, sy, sw, sh
  };
}

// Het matglas: dezelfde foto, steeds waziger, vanaf 54% van de hoogte en
// volledig op 80%, in vijf lagen (vervaging 1,5 · 4 · 8 · 14 · 24px), met een
// waas die even geleidelijk oploopt (huisstijl §21). De lagen gebruiken een
// kleine kopie van het beeld zoals het in de hoes staat: vervaagd zie je het
// verschil niet, en een video krijgt zo ook matglas.
function hoesWaasMaken(vlak, o) {
  const c = document.createElement('canvas');
  c.width = 240; c.height = 180;
  c.getContext('2d').drawImage(o.beeld, o.sx, o.sy, o.sw, o.sh, 0, 0, 240, 180);
  // Een kopie op het toestel zelf (canvas), geen link naar de opslag: het
  // beeld is al geladen via fotoBronAttr().
  const waasBeeld = c.toDataURL('image/jpeg', 0.8);
  const lagen = [[1.5, 54, 64], [4, 58, 68], [8, 62, 72], [14, 66, 76], [24, 70, 80]].map(([px, van, tot]) =>
    `<img alt="" src="${waasBeeld}" style="filter:blur(${px}px);-webkit-mask-image:linear-gradient(transparent ${van}%,#000 ${tot}%);mask-image:linear-gradient(transparent ${van}%,#000 ${tot}%)">`).join('');
  const waas = document.createElement('span');
  waas.className = 'hoes-waas';
  waas.setAttribute('aria-hidden', 'true');
  waas.innerHTML = lagen + '<span class="hoes-waas-tint"></span>';
  vlak.style.setProperty('--waas', o.sterk.toFixed(2));
  vlak.appendChild(waas);
}

// Meet één beeld zodra het geladen is en zet de uitkomst op het vlak.
function hoesVlakMeten(vlak, klaar) {
  const m = vlak.querySelector('.hoes-img');
  // Een leeg podium of een linkkaart is donker: witte tekst.
  if (!m) { vlak.dataset.tekst = 'licht'; return; }
  const meet = () => {
    let o = null;
    try { o = hoesBeeldOordeel(m); } catch (e) { o = null; }
    vlak.querySelector('.hoes-waas')?.remove();
    vlak.classList.toggle('hoes-veilig', !o);
    vlak.dataset.tekst = o && o.donker ? 'donker' : 'licht';
    if (o && o.waas) { try { hoesWaasMaken(vlak, o); } catch (e) { vlak.classList.add('hoes-veilig'); } }
    klaar();
  };
  const isVideo = m.tagName === 'VIDEO';
  m.addEventListener(isVideo ? 'loadeddata' : 'load', meet);
  // Weigert de opslag het meten (geen toestemming), dan laadt het beeld niet.
  // Dan opnieuw zonder crossorigin: het beeld staat er, de veilige vorm geldt.
  m.addEventListener('error', () => {
    if (!m.hasAttribute('crossorigin')) return;
    m.removeAttribute('crossorigin');
    const src = m.getAttribute('src');
    if (src) { m.removeAttribute('src'); m.setAttribute('src', src); if (isVideo) m.load(); }
  });
  if (isVideo ? m.readyState >= 2 : (m.complete && m.naturalWidth)) meet();
}

// Na het plaatsen in de pagina: vegen volgen, de stippen en de pijltjes
// bijwerken, elk beeld meten. Een verborgen element heeft geen breedte, dus
// pas aanroepen als de hoes in de pagina staat (zoals bij het wiel, §7.1).
function hoesStarten(root) {
  (root || document).querySelectorAll('.hoes').forEach(hoes => {
    const spoor = hoes.querySelector('.hoes-spoor');
    const vlakken = [...spoor.children];
    const stippen = [...hoes.querySelectorAll('.hoes-stip')];
    const vorige = hoes.querySelector('.hoes-pijl.vorige');
    const volgende = hoes.querySelector('.hoes-pijl.volgende');
    // De naam en de regel houden rechts ruimte vrij voor delen en ⋯, tot 7px
    // van het eerste teken: met twee knoppen 78px, de naam is dan op 390px
    // 264px breed (huisstijl §21). Geteld, niet gemeten: het meldmenu wordt
    // pas na het starten gevuld.
    const knoppen = hoes.querySelector('.profiel-knoppen');
    const n = knoppen ? knoppen.children.length : 0;
    hoes.style.setProperty('--hoes-tekst-rechts', (n ? 36 * n + 6 : 16) + 'px');
    const zet = () => {
      const i = spoor.clientWidth ? Math.round(spoor.scrollLeft / spoor.clientWidth) : 0;
      stippen.forEach((s, j) => s.classList.toggle('aan', j === i));
      if (vorige) { vorige.hidden = i <= 0; volgende.hidden = i >= vlakken.length - 1; }
      // Alles op de foto volgt het beeld dat in beeld is (huisstijl §21).
      hoes.classList.toggle('tekst-donker', !!vlakken[i] && vlakken[i].dataset.tekst === 'donker');
    };
    // Passief: een scroll-luisteraar die de browser niet mag ophouden (§16).
    spoor.addEventListener('scroll', zet, { passive: true });
    const naar = r => spoor.scrollBy({ left: r * spoor.clientWidth, behavior: hoesRustig() ? 'auto' : 'smooth' });
    if (vorige) { vorige.onclick = () => naar(-1); volgende.onclick = () => naar(1); }
    vlakken.forEach(v => hoesVlakMeten(v, zet));
    zet();
    // TT-517 fase 6: zonder foto vallen de bundels op de naam. Opnieuw bij elke
    // andere maat van de naam (fitProfileName(), een gedraaide telefoon) en
    // als het lettertype binnen is. Een hoes die uit de pagina gaat, meldt
    // nog één keer een maat; dan stopt de waarnemer.
    if (hoes.querySelector('.hoes-bundel')) {
      hoesBundelZetten(hoes);
      if (document.fonts) document.fonts.ready.then(() => hoesBundelZetten(hoes));
      if (window.ResizeObserver) {
        const ro = new ResizeObserver(() => { if (!hoes.isConnected) ro.disconnect(); else hoesBundelZetten(hoes); });
        ro.observe(hoes.querySelector('.profile-name'));
      }
    }
  });
}

// TT-517 fase 6 (huisstijl §21): de schijnwerper. Twee bundels, van linksboven
// en rechtsboven, vallen samen op de naam (Ronald 01-11-2026: "lichtstralen
// van linksboven en rechtsboven"). De app meet waar de naam werkelijk staat (de
// letters, niet zijn vak) en tekent de bundels op de maat van de hoes: elke
// bundel eindigt zo breed als de naam, de lichtvlek ligt op de naam.
// Elke hoes eigen namen voor zijn filter en verlopen: een verborgen scherm met
// dezelfde namen zou ze anders wegnemen.
let hoesBundelTeller = 0;
function hoesBundelZetten(hoes) {
  const naam = hoes.querySelector('.profile-name');
  const beeld = hoes.querySelector('.hoes-beeld');
  const vak = hoes.querySelector('.hoes-bundel');
  if (!naam || !vak || !beeld.clientWidth) return;
  const r = document.createRange();
  r.selectNodeContents(naam);
  const n = r.getBoundingClientRect(), b = beeld.getBoundingClientRect();
  const W = Math.round(b.width), H = Math.round(b.height);
  const x0 = Math.round(n.left - b.left) - 8, x1 = Math.round(n.right - b.left) + 8;
  const x = (n.left + n.right) / 2 - b.left, y = Math.round((n.top + n.bottom) / 2 - b.top);
  const bron = Math.round(W * 0.07); // de halve breedte van een bundel bij de lamp
  const bundel = lx => `<polygon points="${lx - bron},-8 ${lx + bron},-8 ${x1},${y} ${x0},${y}"/>`;
  const geel = 'style="stop-color:var(--merk)"';
  const id = vak.dataset.id || (vak.dataset.id = 'hb' + (++hoesBundelTeller));
  vak.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs>` +
    `<filter id="${id}z" x="-.5" y="-.5" width="2" height="2"><feGaussianBlur stdDeviation="${Math.max(4, W / 60).toFixed(1)}"/></filter>` +
    `<linearGradient id="${id}l" x2="0" y2="1"><stop offset="0" ${geel} stop-opacity=".36"/><stop offset="1" ${geel} stop-opacity=".12"/></linearGradient>` +
    `<radialGradient id="${id}e"><stop offset="0" ${geel} stop-opacity=".5"/><stop offset="1" ${geel} stop-opacity="0"/></radialGradient></defs>` +
    `<g filter="url(#${id}z)" fill="url(#${id}l)">${bundel(Math.round(W * 0.06))}${bundel(Math.round(W * 0.94))}</g>` +
    `<ellipse cx="${Math.round(x)}" cy="${y}" rx="${Math.round((x1 - x0) * 0.62)}" ry="${Math.round(H * 0.11)}" fill="url(#${id}e)"/></svg>`;
}

// ─── TT-517 fase 8: het visitekaartje (huisstijl §22, besluit Ronald 31-10-2026) ─
// Wie deelt, stuurt een vierkant beeld mee: 1080 x 1080, gemaakt op het toestel
// zelf, zonder server en zonder iets in de database. Bovenaan de hoes zoals op
// het profiel (4:3, 1080 x 810): het eerste beeld met de naam en de regel, in
// dezelfde tekstkleur en met hetzelfde matglas; zonder delen, ⋯ en stippen.
// Daaronder, op het podium, links wat iemand speelt en rechts het woordmerk.
// Het beeld is wat een bezoeker zonder account ziet (kaartBeeldOphalen()):
// onder de 16 nooit de foto maar het wazige beeld (§18.7), zonder foto de
// schijnwerper (§21). Een kaart kan overal terechtkomen.
const KAART_PX = 1080, KAART_HOES = 810, KAART_MARGE = 48;
// De schaal van de hoes op het profiel (358px breed op 390px) naar de kaart.
const KAART_S = KAART_PX / 358;
// Lettermaten in pixels van de kaart. In een chat staat de kaart circa 250px
// breed: daar is elke maat 0,23 keer zo groot. Besluit Ronald (01-11-2026,
// (h) "B"): de kleinste tekst in een chat 11px, de kleinste letter van de app.
// In een chat: naam 22, regel 11, instrumenten 15, genres 11, woordmerk 15px.
const KAART_MATEN = { naam: 95, regel: 48, wat: 65, onder: 48, merk: 65 };

function kaartDoek(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  return [c, x];
}

// Vervagen zonder het filter van het canvas (dat kent niet elke browser):
// telkens halveren, dan in stappen terug naar de volle maat.
function kaartVaag(bron, px) {
  const w = bron.width, h = bron.height;
  const n = Math.max(1, Math.round(Math.log2(px * 1.6)));
  let c = bron;
  for (let i = 0; i < n; i++) { const [d, y] = kaartDoek(c.width / 2, c.height / 2); y.drawImage(c, 0, 0, d.width, d.height); c = d; }
  for (let i = n - 1; i >= 0; i--) { const [d, y] = kaartDoek(w / 2 ** i, h / 2 ** i); y.drawImage(c, 0, 0, d.width, d.height); c = d; }
  return c;
}

// Een lijst op één regel met " · ", zoveel als er past. Past het eerste niet,
// dan wordt de letter kleiner.
function kaartRegel(x, lijst, gewicht, maat, breed) {
  let tekst = '', f = maat;
  x.font = `${gewicht} ${f}px Inter`;
  for (const it of lijst) {
    const nieuw = tekst ? tekst + ' · ' + it : it;
    if (x.measureText(nieuw).width > breed) break;
    tekst = nieuw;
  }
  if (!tekst && lijst.length) {
    tekst = lijst[0];
    f = Math.floor(f * breed / x.measureText(tekst).width);
    x.font = `${gewicht} ${f}px Inter`;
  }
  return { tekst, f };
}

// De basislijn van een regel tekst van maat f in een regel van f x lh hoog
// (Inter: boven 0,97 em, onder 0,24 em), zoals de browser hem zet.
const kaartBasis = (boven, f, lh) => boven + (lh * f - 1.21 * f) / 2 + 0.97 * f;

// g: { naam, regel, wat: [], onder: [], zoekt: [] }; beeld: { img, wazig } of null.
async function kaartMaken(g, beeld) {
  if (document.fonts) {
    await Promise.all(['900 40px Inter', '700 40px Inter', '400 40px Inter', '40px "TT Woordmerk"'].map(f => document.fonts.load(f)));
  }
  const M = KAART_MATEN, W = KAART_PX, H = KAART_HOES, S = KAART_S;
  const [c, x] = kaartDoek(W, W);
  x.fillStyle = '#101114';
  x.fillRect(0, 0, W, W);

  // De naam op één regel; een lange naam wordt kleiner (zoals fitProfileName()).
  let n = M.naam;
  x.font = `900 ${n}px Inter`;
  const ruimte = W - 2 * KAART_MARGE;
  if (x.measureText(g.naam).width > ruimte) { n = Math.floor(n * ruimte / x.measureText(g.naam).width); x.font = `900 ${n}px Inter`; }
  const naamBreed = x.measureText(g.naam).width;
  // Van onder naar boven, zoals .hoes-tekst: 24px van de onderkant, de regel
  // (lijnhoogte 1,5) met 4px erboven, de naam (lijnhoogte 1,1).
  const r = M.regel;
  const regelBoven = H - 24 * S - 1.5 * r;
  const naamBoven = regelBoven - 4 * S * r / 36 - 1.1 * n;
  const naamBasis = kaartBasis(naamBoven, n, 1.1);

  let kleur = '#FFFFFF';
  if (beeld) {
    const img = beeld.img;
    let o = null;
    try { o = hoesBeeldOordeel(img); } catch (e) { o = null; }
    const [h, hx] = kaartDoek(W, H);
    if (beeld.wazig) {
      // Zoals .hoes-wazig: het hele beeld, 1,2 keer zo groot, 24px vervaagd.
      const sc = Math.max(W / img.naturalWidth, H / img.naturalHeight) * 1.2;
      const iw = img.naturalWidth * sc, ih = img.naturalHeight * sc;
      hx.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih);
      hx.drawImage(kaartVaag(h, 24 * S), 0, 0);
    } else if (o) {
      hx.drawImage(img, o.sx, o.sy, o.sw, o.sh, 0, 0, W, H);
    } else {
      const iw = img.naturalWidth, ih = img.naturalHeight;
      let sw = iw, sh = iw * 3 / 4;
      if (sh > ih) { sh = ih; sw = ih * 4 / 3; }
      hx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, W, H);
    }
    x.drawImage(h, 0, 0);
    if (o && o.waas) {
      // Het matglas van hoesWaasMaken(): vijf lagen, steeds waziger.
      for (const [px, van, tot] of [[1.5, 54, 64], [4, 58, 68], [8, 62, 72], [14, 66, 76], [24, 70, 80]]) {
        const laag = kaartVaag(h, px * S), lx = laag.getContext('2d');
        const m = lx.createLinearGradient(0, H * van / 100, 0, H * tot / 100);
        m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, '#000');
        lx.globalCompositeOperation = 'destination-in';
        lx.fillStyle = m; lx.fillRect(0, 0, W, H);
        x.drawImage(laag, 0, 0);
      }
    }
    // De waas van .hoes-waas-tint, of de veilige vorm als het beeld niet te meten is.
    const sterk = !o ? null : o.waas ? (o.donker ? o.sterk + 0.2 : o.sterk) : 0;
    const tint = !o ? [0, 0, 0] : o.donker ? [255, 255, 255] : [0, 0, 0];
    const stops = !o ? [[54, 0], [61, 0.1], [67, 0.3], [73, 0.6], [80, 0.85]]
      : [[54, 0], [61, 0.12 * sterk], [67, 0.35 * sterk], [73, 0.7 * sterk], [80, sterk]];
    if (!o || sterk) {
      const t = x.createLinearGradient(0, 0, 0, H);
      stops.forEach(([p, a]) => t.addColorStop(p / 100, `rgba(${tint.join(',')},${a})`));
      x.fillStyle = t; x.fillRect(0, 0, W, H);
    }
    if (o && o.donker) kleur = '#52575F';
  } else {
    // De schijnwerper van hoesBundelZetten(): twee bundels uit de bovenhoeken
    // die samen op de naam vallen, en een lichtvlek op de naam.
    const x0 = KAART_MARGE - 8 * S, x1 = KAART_MARGE + naamBreed + 8 * S;
    const ym = naamBasis - 0.365 * n, xm = (x0 + x1) / 2;
    const bron = W * 0.07;
    const [b, bx] = kaartDoek(W, H);
    for (const lx of [W * 0.06, W * 0.94]) {
      const v = bx.createLinearGradient(0, -8, 0, ym);
      v.addColorStop(0, 'rgba(255,184,28,.36)'); v.addColorStop(1, 'rgba(255,184,28,.12)');
      bx.fillStyle = v;
      bx.beginPath(); bx.moveTo(lx - bron, -8); bx.lineTo(lx + bron, -8); bx.lineTo(x1, ym); bx.lineTo(x0, ym); bx.closePath(); bx.fill();
    }
    x.drawImage(kaartVaag(b, Math.max(4, W / 60)), 0, 0);
    const rx = (x1 - x0) * 0.62, ry = H * 0.11;
    x.save(); x.translate(xm, ym); x.scale(1, ry / rx);
    const e = x.createRadialGradient(0, 0, 0, 0, 0, rx);
    e.addColorStop(0, 'rgba(255,184,28,.5)'); e.addColorStop(1, 'rgba(255,184,28,0)');
    x.fillStyle = e; x.beginPath(); x.arc(0, 0, rx, 0, 2 * Math.PI); x.fill(); x.restore();
  }

  x.fillStyle = kleur;
  x.font = `900 ${n}px Inter`;
  x.fillText(g.naam, KAART_MARGE, naamBasis);
  x.font = `400 ${r}px Inter`;
  x.fillText(g.regel, KAART_MARGE, kaartBasis(regelBoven, r, 1.5));

  // Onder de hoes: het woordmerk rechts, in het midden van het vlak.
  const vlakMidden = (H + W) / 2;
  x.font = `${M.merk}px "TT Woordmerk"`;
  const tussen = M.merk * 2 / 28;
  const wT = x.measureText('TALENT').width, wN = x.measureText('TENT').width;
  const mm = x.measureText('TALENTTENT');
  const merkBasis = vlakMidden + (mm.actualBoundingBoxAscent - mm.actualBoundingBoxDescent) / 2;
  const merkX = W - KAART_MARGE - wT - tussen - wN;
  x.fillStyle = '#FFFFFF'; x.fillText('TALENT', merkX, merkBasis);
  x.fillStyle = '#FFB81C'; x.fillText('TENT', merkX + wT + tussen, merkBasis);

  // Links wat iemand speelt (vet), daaronder de genres (grijs) of wat een
  // band zoekt (een pil in warmgeel).
  const breed = merkX - 40 - KAART_MARGE;
  const wat = kaartRegel(x, g.wat || [], 700, M.wat, breed);
  const zoekt = (g.zoekt || []).length;
  const padX = M.onder * 0.6, padY = M.onder * 0.3;
  const onder = zoekt
    ? kaartRegel(x, g.zoekt.map((z, i) => (i ? '' : 'Zoekt ') + String(z).toLocaleLowerCase('nl')), 700, M.onder, breed - 2 * padX)
    : kaartRegel(x, g.onder || [], 400, M.onder, breed);
  const hWat = wat.tekst ? wat.f * 1.25 : 0;
  const hOnder = !onder.tekst ? 0 : zoekt ? onder.f * 1.25 + 2 * padY : onder.f * 1.3;
  const tussenRegels = hWat && hOnder ? M.onder * (zoekt ? 0.35 : 0.15) : 0;
  let boven = vlakMidden - (hWat + tussenRegels + hOnder) / 2;
  if (wat.tekst) {
    x.font = `700 ${wat.f}px Inter`; x.fillStyle = '#FFFFFF';
    x.fillText(wat.tekst, KAART_MARGE, kaartBasis(boven, wat.f, 1.25));
    boven += hWat + tussenRegels;
  }
  if (onder.tekst && zoekt) {
    x.font = `700 ${onder.f}px Inter`;
    const pw = x.measureText(onder.tekst).width + 2 * padX;
    x.fillStyle = '#FFB81C';
    const rr = hOnder / 2;
    x.beginPath(); x.arc(KAART_MARGE + rr, boven + rr, rr, Math.PI / 2, Math.PI * 1.5); x.arc(KAART_MARGE + pw - rr, boven + rr, rr, -Math.PI / 2, Math.PI / 2); x.closePath(); x.fill();
    x.fillStyle = '#000000';
    x.fillText(onder.tekst, KAART_MARGE + padX, kaartBasis(boven + padY, onder.f, 1.25));
  } else if (onder.tekst) {
    x.font = `400 ${onder.f}px Inter`; x.fillStyle = '#B9B9B9';
    x.fillText(onder.tekst, KAART_MARGE, kaartBasis(boven, onder.f, 1.3));
  }
  return c;
}

// TT-457 (10-10-2026, besluit Ronald): de zin "niet beschikbaar" op een
// muzikantprofiel en op een bandpagina. Eén functie voor beide kanten. De vorm
// is de gewone .melding (huisstijl §13): één zin, geen kop, geen knop, geen
// kruisje. Dezelfde zin voor muzikant en band, zodat hij op één regel past.
// Is de muzikant of de band beschikbaar, dan staat er niets.
function nietBeschikbaarMeldingHTML() {
  return '<div class="melding melding-beschikbaar"><p class="melding-tekst">Momenteel <strong>niet beschikbaar</strong>.</p></div>';
}

// ─── Uitsnede kiezen bij een foto (TT-520 deel 2, 27-10-2026, Laag 3.4) ─────
// Besluiten Ronald: na het kiezen van een profielfoto of bandfoto opent meteen
// dit venster. Schuiven met één vinger, zoomen met twee vingers of het
// muiswiel, dan "Gebruik deze foto". De foto vult altijd het hele kader ("als
// er maar geen zwarte randen ontstaan"): verder uitzoomen dan de rand van de
// foto kan niet. Het kruisje, Escape of de terugknop van het toestel breken
// af: dan verandert er niets.
// TT-517 fase 5 (01-11-2026, huisstijl §21, besluit Ronald 31-10-2026 optie 1:
// één regel voor elk beeld): het kader is 4:3, precies de hoes. Gestippeld
// staat erin wat klein in lijsten en berichten komt: het rondje (muzikant) of
// het vierkant (band), in het midden, zoals het fotootje en object-fit: cover
// het tonen. Een staande foto begint bovenaan (daar staat meestal het gezicht).
//   'rond' en 'vierkant' (profielfoto, bandfoto): de app bewaart de uitgesneden
//     foto als JPG van 4:3, hoogstens UITSNEDE_MAX_PX pixels hoog.
//   'banner' (een foto die de gebruiker voor de banner kiest): zonder
//     gestippelde vorm. De foto zelf blijft heel (groot openen toont alles);
//     de app bewaart alleen de plek van het kader, als delen van de foto:
//     { x, y, b, h } (links, boven, breedte, hoogte; elk 0 tot 1).
// kiesUitsnede(bron, 'rond' | 'vierkant' | 'banner') → Promise<File | object | null>.
// `bron` is een bestand, of bij 'banner' ook het adres van een geüploade foto.
const UITSNEDE_MAX_PX = 1080;
const UITSNEDE_MAX_ZOOM = 4;
let uitsnede = null; // { img, url, eigenUrl, vlak, vorm, schaal0, zoom, x, y, klaar, wijzers }

function kiesUitsnede(bron, vorm) {
  return new Promise((klaar) => {
    if (uitsnede) uitsnedeAfsluiten(null);
    const modal = document.getElementById('uitsnedeModal');
    const vlak = document.getElementById('uitsnedeVlak');
    const img = document.getElementById('uitsnedeImg');
    const isBestand = typeof bron !== 'string';
    const url = isBestand ? URL.createObjectURL(bron) : bron;
    uitsnede = { img, url, eigenUrl: isBestand, vlak, vorm, file: isBestand ? bron : null,
      schaal0: 1, zoom: 1, x: 0, y: 0, klaar, wijzers: new Map() };
    document.getElementById('uitsnedeTitel').textContent =
      vorm === 'rond' ? 'Profielfoto' : vorm === 'banner' ? 'Bannerfoto' : 'Bandfoto';
    const klein = document.getElementById('uitsnedeKlein');
    klein.hidden = vorm === 'banner';
    klein.classList.toggle('rond', vorm === 'rond');
    document.getElementById('uitsnedeKnop').disabled = true;
    img.onload = () => {
      if (!uitsnede || uitsnede.img !== img) return;
      uitsnedeBegin();
      document.getElementById('uitsnedeKnop').disabled = false;
    };
    img.onerror = () => {
      uitsnedeAfsluiten(null);
      showToast('Deze foto is niet te lezen. Kies een JPG of PNG.');
    };
    if (isBestand) img.src = url; else fotoBronZetten(img, url);
    modal.classList.add('visible');
  });
}

// De maat van het kader op het scherm. De hoogte volgt uit de breedte (4:3),
// niet uit clientHeight: die rondt af op hele pixels (358 breed geeft 269 in
// plaats van 268,5), en dan is de uitkomst geen 4:3 meer.
function uitsnedeMaten() {
  const W = uitsnede.vlak.clientWidth;
  return { W, H: W * 3 / 4 };
}

// Begin: de foto vult het kader precies. Een staande foto (hoger dan het
// kader) begint bovenaan, een andere in het midden.
function uitsnedeBegin() {
  const u = uitsnede, m = uitsnedeMaten();
  const nw = u.img.naturalWidth, nh = u.img.naturalHeight;
  u.schaal0 = Math.max(m.W / nw, m.H / nh);
  u.zoom = 1;
  u.x = (m.W - nw * u.schaal0) / 2;
  u.y = nh / nw > m.H / m.W ? 0 : (m.H - nh * u.schaal0) / 2;
  uitsnedeTekenen();
}

// Houdt de foto altijd over het hele kader: geen lege rand.
function uitsnedeBegrens() {
  const u = uitsnede, m = uitsnedeMaten();
  u.zoom = Math.min(UITSNEDE_MAX_ZOOM, Math.max(1, u.zoom));
  const s = u.schaal0 * u.zoom;
  u.x = Math.min(0, Math.max(m.W - u.img.naturalWidth * s, u.x));
  u.y = Math.min(0, Math.max(m.H - u.img.naturalHeight * s, u.y));
}

function uitsnedeTekenen() {
  const u = uitsnede;
  if (!u) return;
  uitsnedeBegrens();
  const s = u.schaal0 * u.zoom;
  u.img.style.width = (u.img.naturalWidth * s) + 'px';
  u.img.style.height = (u.img.naturalHeight * s) + 'px';
  u.img.style.transform = `translate(${u.x}px, ${u.y}px)`;
}

// Zoomen rond een punt in het vlak: dat punt blijft onder je vingers staan.
function uitsnedeZoom(nieuweZoom, px, py) {
  const u = uitsnede;
  const oud = u.schaal0 * u.zoom;
  u.zoom = Math.min(UITSNEDE_MAX_ZOOM, Math.max(1, nieuweZoom));
  const nieuw = u.schaal0 * u.zoom;
  u.x = px - (px - u.x) * (nieuw / oud);
  u.y = py - (py - u.y) * (nieuw / oud);
  uitsnedeTekenen();
}

function uitsnedePunt(e) {
  const r = uitsnede.vlak.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function uitsnedeWijzerNeer(e) {
  if (!uitsnede) return;
  e.preventDefault();
  uitsnede.vlak.setPointerCapture(e.pointerId);
  uitsnede.wijzers.set(e.pointerId, uitsnedePunt(e));
}

function uitsnedeWijzerBeweeg(e) {
  const u = uitsnede;
  if (!u || !u.wijzers.has(e.pointerId)) return;
  e.preventDefault();
  const voor = [...u.wijzers.values()];
  const p = uitsnedePunt(e);
  u.wijzers.set(e.pointerId, p);
  const na = [...u.wijzers.values()];
  if (na.length === 1) {
    // Eén vinger of de muis: schuiven.
    const oud = voor[0];
    u.x += p.x - oud.x;
    u.y += p.y - oud.y;
    uitsnedeTekenen();
  } else if (na.length >= 2) {
    // Twee vingers: zoomen rond het midden ertussen, en meeschuiven.
    const afstand = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const midden = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const m0 = midden(voor[0], voor[1]), m1 = midden(na[0], na[1]);
    u.x += m1.x - m0.x;
    u.y += m1.y - m0.y;
    uitsnedeZoom(u.zoom * afstand(na[0], na[1]) / afstand(voor[0], voor[1]), m1.x, m1.y);
  }
}

function uitsnedeWijzerOp(e) {
  if (!uitsnede) return;
  uitsnede.wijzers.delete(e.pointerId);
}

function uitsnedeWiel(e) {
  if (!uitsnede) return;
  e.preventDefault();
  const p = uitsnedePunt(e);
  uitsnedeZoom(uitsnede.zoom * Math.exp(-e.deltaY / 500), p.x, p.y);
}

// "Gebruik deze foto". Bij een bannerfoto: de plek van het kader, als delen
// van de foto. Anders: het kader op ware grootte uitsnijden, als JPG van 4:3.
function uitsnedeGebruiken() {
  const u = uitsnede;
  if (!u || !u.img.naturalWidth) return;
  const m = uitsnedeMaten();
  const s = u.schaal0 * u.zoom;
  const bw = m.W / s, bh = m.H / s;               // het kader in pixels van de foto
  if (u.vorm === 'banner') {
    const nw = u.img.naturalWidth, nh = u.img.naturalHeight;
    const r = v => Math.max(0, Math.round(v * 10000) / 10000);
    uitsnedeAfsluiten({ x: r(-u.x / s / nw), y: r(-u.y / s / nh), b: r(bw / nw), h: r(bh / nh) });
    return;
  }
  const uh = Math.max(1, Math.round(Math.min(UITSNEDE_MAX_PX, bh)));
  const uw = Math.round(uh * 4 / 3);
  const canvas = document.createElement('canvas');
  canvas.width = uw; canvas.height = uh;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, uw, uh);
  ctx.drawImage(u.img, -u.x / s, -u.y / s, bw, bh, 0, 0, uw, uh);
  const naam = (u.file.name || 'foto').replace(/\.[^.]*$/, '') + '.jpg';
  document.getElementById('uitsnedeKnop').disabled = true;
  canvas.toBlob((blob) => {
    uitsnedeAfsluiten(blob ? new File([blob], naam, { type: 'image/jpeg' }) : null);
    if (!blob) showToast('De foto uitsnijden is niet gelukt. Probeer het opnieuw.');
  }, 'image/jpeg', 0.9);
}

// Sluit het venster en geeft de foto (of null bij afbreken) terug.
function uitsnedeAfsluiten(uitkomst) {
  const u = uitsnede;
  uitsnede = null;
  document.getElementById('uitsnedeModal').classList.remove('visible');
  if (!u) return;
  u.img.onload = null; u.img.onerror = null;
  u.img.removeAttribute('src');
  if (u.eigenUrl) URL.revokeObjectURL(u.url);
  u.klaar(uitkomst || null);
}
function sluitUitsnede() { uitsnedeAfsluiten(null); }

// Draait de telefoon of verandert het venster, dan blijft de uitsnede staan.
window.addEventListener('resize', () => {
  if (!uitsnede || !uitsnede.img.naturalWidth) return;
  const u = uitsnede, m = uitsnedeMaten();
  const oud = u.schaal0;
  u.schaal0 = Math.max(m.W / u.img.naturalWidth, m.H / u.img.naturalHeight);
  u.x *= u.schaal0 / oud; u.y *= u.schaal0 / oud;
  uitsnedeTekenen();
});

// De bewaarde plek van het kader van een bannerfoto, gecontroleerd: vier
// getallen tussen 0 en 1 die binnen de foto vallen. Anders null: dan toont de
// hoes het midden, zoals bij een foto zonder kader.
function uitsnedeGeldig(k) {
  if (!k || typeof k !== 'object') return null;
  const x = Number(k.x), y = Number(k.y), b = Number(k.b), h = Number(k.h);
  if (![x, y, b, h].every(Number.isFinite)) return null;
  if (x < 0 || y < 0 || b <= 0 || h <= 0 || x + b > 1.001 || y + h > 1.001) return null;
  return { x, y, b, h };
}

// Een bannerfoto met een kader in de hoes: de foto zo groot en zo verschoven
// dat precies het kader de hoes vult. In procenten van de hoes, zodat de
// maat van het scherm niet uitmaakt.
function uitsnedeStijl(k) {
  const p = v => (Math.round(v * 1000) / 1000) + '%';
  return `width:${p(100 / k.b)};height:${p(100 / k.h)};left:${p(-k.x / k.b * 100)};top:${p(-k.y / k.h * 100)}`;
}
