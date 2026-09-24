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
function showConfirm(message, onConfirm, confirmLabel, danger) {
  document.getElementById('confirmMessage').textContent = message;
  const yesBtn = document.getElementById('confirmYesBtn');
  yesBtn.textContent = confirmLabel || 'Ja, verwijderen';
  yesBtn.style.background = danger ? 'var(--danger)' : '';
  yesBtn.style.borderColor = danger ? 'var(--danger)' : '';
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
function friendlyErrorMessage(err) {
  const msg = (err && err.message) ? err.message : String(err || '');
  console.error('Technische foutmelding:', msg);

  if (/already registered|already exists/i.test(msg)) {
    return 'Er bestaat al een account met dit e-mailadres.';
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
  if (/failed to fetch|network|networkerror/i.test(msg)) {
    return 'Geen verbinding kunnen maken. Controleer je internetverbinding en probeer het opnieuw.';
  }
  if (/JWT|token|session|auth/i.test(msg)) {
    return 'Je sessie is verlopen. Log opnieuw in en probeer het nog eens.';
  }
  if (/duplicate key|unique constraint/i.test(msg)) {
    return 'Dit bestaat al. Kies een andere naam en probeer het opnieuw.';
  }
  if (/permission denied|rls/i.test(msg)) {
    return 'Je hebt geen toestemming voor deze actie.';
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
    return 'Eén van de velden mist een verplichte waarde bij het opslaan. Probeer het opnieuw — meld dit aan Ronald als het blijft gebeuren.';
  }
  if (/violates check constraint/i.test(msg)) {
    return 'Eén van de ingevulde waarden wordt niet geaccepteerd. Probeer het opnieuw — meld dit aan Ronald als het blijft gebeuren.';
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
  return 'Er ging iets mis. Probeer het opnieuw.';
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
  return (el.closest && el.closest('.password-wrap')) || el;
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

function showSaveError(msg) {
  document.getElementById('saveSpinner').style.display = 'none';
  document.getElementById('saveTitle').textContent = 'Oeps...';
  document.getElementById('saveTitle').style.color = '#f5c518';

  const isAlreadyRegistered = /already registered|already exists/i.test(msg);

  if (isAlreadyRegistered) {
    document.getElementById('saveMsg').innerHTML =
      `Er bestaat al een account met dit e-mailadres.<br><br>
       <button class="btn btn-primary" style="width:100%;margin-bottom:8px;" onclick="goToLoginFromError()">Inloggen →</button>
       <button class="btn btn-ghost" style="width:100%;" onclick="document.getElementById('saveOverlay').classList.remove('visible')">Sluiten</button>`;
    return;
  }

  document.getElementById('saveMsg').innerHTML =
    `Er ging iets mis:<br><span style="color:#f5c518;font-size:12px;">${friendlyErrorMessage(msg)}</span><br><br>
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
function selectFirstAC(listId) {
  const list = document.getElementById(listId);
  const first = list && list.querySelector('.ac-item[onmousedown]');
  if (first && first.onmousedown) first.onmousedown();
}

const itunesArtistCache = new Map(); // query (lowercase) -> artists[]
const itunesTrackCache = new Map();  // artistId -> songs[] (of een lopende Promise), volledige lijst van die artiest

async function onArtistSearch(q) {
  const ac = document.getElementById('acArtistList');
  if (q.length < 2) { ac.classList.remove('open'); return; }

  // Direct visuele feedback tonen (i.p.v. pas na de 400ms-vertraging).
  ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted)">Zoeken...</span></div>';
  ac.classList.add('open');

  const cacheKey = q.toLowerCase();
  if (itunesArtistCache.has(cacheKey)) {
    renderArtistResults(ac, itunesArtistCache.get(cacheKey), q, 'selectArtist');
    return;
  }

  clearTimeout(itunesSearchTimeout);
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
      ac.innerHTML = '<div class="ac-item"><span style="color:var(--danger)">Zoekopdracht mislukt</span></div>';
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
    ac.innerHTML = '<div class="ac-item"><span style="color:var(--danger)">Zoekopdracht mislukt</span></div>';
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
      <strong style="font-size:14px;">${highlight(r.trackName, q)}</strong>
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
//   escHtml()  → tekst die tussen tags belandt
//   escAttr()  → tekst die binnen een onclick/onmousedown-string belandt
//                (was voorheen esc(); hernoemd zodat het verschil zichtbaar is)
//   jsAttr()   → combinatie van beide: string ín een JS-aanroep ín een attribuut
//   safeUrl()  → alleen http/https/blob toestaan in href en src
//   safeColor() → alleen een echte kleurwaarde toestaan in een style-attribuut

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}

function escAttr(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r?\n/g, ' ');
}

// Een waarde die eerst door JS gelezen wordt (backslash-escaping) en daarna
// door de HTML-parser (entity-escaping). Volgorde is bewust: escAttr eerst.
function jsAttr(s) { return escHtml(escAttr(s)); }

// javascript:-URL's zijn hier het echte risico: die voeren code uit zodra
// iemand op de link klikt. blob: is toegestaan omdat de lokale foto-preview
// die gebruikt (URL.createObjectURL).
function safeUrl(u) {
  const s = String(u ?? '').trim();
  return /^(https?:\/\/|blob:)/i.test(s) ? escHtml(s) : '';
}

// Kleuren komen uit de database en gaan rechtstreeks een style-attribuut in.
// Alleen hex/rgb/hsl en losse kleurnamen toelaten, geen puntkomma's.
function safeColor(c, fallback) {
  const s = String(c ?? '').trim();
  return /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|[a-z]+)$/i.test(s) ? s : fallback;
}

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
function tagSolid(text, hex) {
  return `<span class="tag-solid" style="color:${hex};">${escHtml(text)}</span>`;
}

// TT-153 (25-08-2026): badges op zoekresultaten (muzikant, rij én kaart)
// beperkt tot een vast aantal, met een "+N"-badge voor de rest — voorkomt dat
// iemand met veel instrumenten/genres de rij/kaart laat springen. Gedeeld
// door musicianRowHTML() en musicianCardHTML(), voor instrument- én
// genrebadges apart (elk hun eigen "+N").
function overflowBadgeHTML(items, hex, max) {
  const shown = items.slice(0, max);
  const extra = items.length - shown.length;
  let html = shown.map(i => tagSolid(i, hex)).join('');
  if (extra > 0) html += `<span class="tag-solid tag-solid-muted">+${extra}</span>`;
  return html;
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
}

function renderSongs() {
  const list = document.getElementById('songsList');
  const empty = document.getElementById('songsListEmpty');
  if (!state.songs.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  // Weergave alfabetisch op band/artiest, dan titel — de onderliggende index
  // (i) blijft verwijzen naar de echte plek in state.songs, want setLevel()/
  // removeSong() werken op die array-index, niet op de weergavevolgorde.
  const displayOrder = state.songs
    .map((s, i) => i)
    .sort((ia, ib) => compareArtistTitle(state.songs[ia].artist, state.songs[ia].title, state.songs[ib].artist, state.songs[ib].title));
  list.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-top:4px;">
      <div style="display:grid;grid-template-columns:1fr auto auto;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);">
        <span>Band / Artiest — Nummer</span><span style="margin-right:40px;">Beheersing</span><span></span>
      </div>
      ${displayOrder.map(i => { const s = state.songs[i]; return `
        <div style="display:grid;grid-template-columns:1fr auto auto;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);gap:12px;">
          <div>
            <div style="font-size:15px;font-weight:600;">${escHtml(s.artist)}</div>
            <div style="font-size:12px;color:var(--muted);">${escHtml(s.title)}</div>
          </div>
          <div style="display:flex;gap:4px;${!s.level ? 'animation:levelPulse 1.5s ease-in-out infinite;' : ''}">
            <button class="level-btn ${s.level==='basis'?'active-basis':''}" title="Kent de structuur" onclick="setLevel(${i},'basis')">Basis</button>
            <button class="level-btn ${s.level==='bijna'?'active-bijna':''}" title="Soepel, bijna klaar" onclick="setLevel(${i},'bijna')">Bijna</button>
            <button class="level-btn ${s.level==='podium'?'active-podium':''}" title="Je speelt het live zonder problemen" onclick="setLevel(${i},'podium')">Podium</button>
          </div>
          ${s._confirmDelete
            ? `<button class="song-remove" style="width:auto;padding:0 8px;font-size:11px;font-weight:700;color:var(--danger);" onclick="removeSong(${i})" title="Bevestig verwijderen">Zeker?</button>`
            : `<button class="song-remove" onclick="removeSong(${i})" title="Verwijderen">✕</button>`
          }
        </div>
        ${!s.level ? `<div style="font-size:12px;color:var(--muted);padding:4px 12px;">Beheersing nog niet gekozen — mag ook later</div>` : ''}
      `; }).join('')}
    </div>`;
}

function setLevel(i, level) {
  state.songs[i].level = level;
  renderSongs();
}

// TT-179-patroon (uit profiel-v2, TT-168-overgang): eerste klik op ✕ zet
// een korte bevestiging ("Zeker?"), pas een tweede klik verwijdert echt —
// zelfde tweeklaps-bevestiging als bij Annuleren (handleCancelClick),
// hier lokaal op het nummer zelf i.p.v. een aparte knop.
function removeSong(i) {
  if (!state.songs[i]) return;
  if (!state.songs[i]._confirmDelete) {
    state.songs[i]._confirmDelete = true;
    renderSongs();
    return;
  }
  state.songs.splice(i, 1);
  renderSongs();
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
  if (labelEl) labelEl.textContent = cfg.format(waarden);
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
            data-waarde="${escAttr(o.value)}">
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
const PROFIELNAAM_LADDER = [36, 32, 28, 24, 20, 18, 16];

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
// getoetst wordt, en Mijn Profiel is krapper dan de profielmodal (215px).
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

// TT-293 (18-09-2026): het woordmerk in een modal-koprij (.modal-kop .logo)
// liep buiten het canvas bij een bureaubladvenster tussen circa 561 en
// 780px breed — daar is #appRoot 50% van het venster (§11) en dus smaller
// dan een telefoon, zelfde oorzaak als de noodtreden bij fitProfileName
// (huisstijl §2.1). `.modal-box-kop { overflow: hidden }` knipte het
// ⋯-menu en het sluiten-kruisje daardoor onzichtbaar weg. Zelfde aanpak
// als fitProfileName: krimpen tot het past, geen vaste maat per scherm.
// TT-301 (20-09-2026): dit gold tot nu toe alleen voor een koprij in een
// venster. Sinds de terugknop erbij staat, is de gewone kop net zo krap: op
// 280px (het smalste canvas) is er na twee knoppen van 44px nog 144px over,
// en het woordmerk is op 28px 188px breed — gemeten 20-09-2026. Dezelfde
// krimptrap geldt daarom nu voor allebei. Eén regel, niet per scherm
// omzeild (§2, regel 11). De functie heette fitModalLogo(); die naam dekte
// de inhoud niet meer.
const KOPLOGO_LADDER = [28, 24, 22, 20, 18, 16];
// Noodtreden, zelfde gedachte als PROFIELNAAM_NOOD hierboven. Ze zijn nodig
// in één stand: een koprij in een venster met zowel de terugknop als het
// ⋯-menu en het kruis, op het smalste canvas van 280px. Daar is na de drie
// knoppen nog 91px over en het woordmerk is op 16px al 107px breed (gemeten
// 20-09-2026). Liever een klein woordmerk dan een woordmerk over de knoppen.
const KOPLOGO_NOOD = [14, 12];

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

function fitKopLogo(root) {
  const scope = root || document;
  scope.querySelectorAll('.modal-kop, header').forEach(rij => {
    const logo = rij.querySelector(':scope > .logo');
    if (!logo || !rij.clientWidth) return; // nog niet zichtbaar — niets te meten
    const st = getComputedStyle(rij);
    const gap = parseFloat(st.columnGap) || 0;
    // De ruimte tussen de twee buitenvakken. Die vakken zijn zo breed als hun
    // knoppen; de rest van de rij is voor het woordmerk. Zo gerekend in plaats
    // van gemeten, want de kolom zelf krimpt mee met de letter.
    const vakken = [...rij.querySelectorAll(':scope > .kop-vak')];
    const bezet = vakken.reduce((s, v) => s + v.offsetWidth, 0) + gap * vakken.length;
    const ruimte = rij.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight) - bezet;
    for (const px of KOPLOGO_LADDER.concat(KOPLOGO_NOOD)) {
      logo.style.fontSize = px + 'px';
      if (meetLogoBreedte(logo, px) <= ruimte) return;
    }
  });
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
    `<b>Kies wat in je banner komt.</b> Gekozen: ${aantal} van ${MEDIA_BANNER_MAX}`;
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
    beeld.innerHTML = `<video src="${escAttr(veilig)}" controls autoplay playsinline style="width:100%;height:100%;background:#000;"></video>`;
    voet.innerHTML = '';
  } else if (embed) {
    beeld.innerHTML = `<iframe src="${escAttr(embed)}" title="${escAttr(naam)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" style="width:100%;height:100%;border:0;"></iframe>`;
    voet.innerHTML = `<a class="media-speler-knop" href="${escAttr(veilig)}" target="_blank" rel="noopener noreferrer">Openen op ${escHtml(platform || 'de website')}</a>`;
  } else {
    beeld.innerHTML = `<div class="media-speler-uitleg">
      <div class="media-speler-platform">${escHtml(platform || 'Deze link')}</div>
      <p>Dit platform laat afspelen binnen een app niet toe.</p>
    </div>`;
    voet.innerHTML = `<a class="media-speler-knop primair" href="${escAttr(veilig)}" target="_blank" rel="noopener noreferrer">Openen op ${escHtml(platform || 'de website')}</a>`;
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
    return `<img src="https://img.youtube.com/vi/${escAttr(yt)}/hqdefault.jpg" alt="" loading="lazy">`;
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
        <div class="media-rij-titel" ${veilig ? `data-media-url="${escAttr(veilig)}"` : ''} title="${escAttr(naam)}"
          onclick="this.classList.toggle('open')">${escHtml(naam)}</div>
        <input type="url" class="media-rij-url" value="${escAttr(l.url || '')}" placeholder="https://youtube.com/watch?v=..."
          aria-label="Adres van de link"
          oninput="${fn('updateLinkUrl')}(${i}, this)" onchange="${fn('renderLinksList')}()">
      </div>
      <button type="button" class="media-rij-weg" onclick="${fn('removeLink')}(${i})" aria-label="Link verwijderen">✕</button>
    </div>`;
}

// Eén tegel in het tabblad Upload. Bannerteken linksboven, ✕ rechtsboven
// (besluit Ronald 13-09-2026).
function mediaTegelHTML(m, i, voorvoegsel) {
  const fn = n => mediaFnNaam(voorvoegsel, n);
  const beeld = m.type === 'foto'
    ? `<img src="${escAttr(safeUrl(m.url) || '')}" alt="${escAttr(m.name || '')}">`
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
// TT-265 (15-09-2026, Ronald): de bannerbalk op het muzikantenprofiel.
// De keuze wélke media erin komen bestond al (TT-263, het bannerteken in de
// wizard en in Je mediahoek). Dit is de plek waar die keuze te zien is.
//
// Vastgelegde besluiten van Ronald, 15-09-2026:
// - Maximaal zes items, over foto's, video's en links samen.
// - Geen gekozen items: de balk verschijnt helemaal niet.
// - Swipen, met stippen eronder. Actieve stip goud, de rest grijs.
// - Doorschuiven na vijf seconden, pauze zodra de gebruiker zelf iets doet.
// - **Geen autoplay.** Een video toont zijn eerste beeld en staat stil;
//   geluid en beweging komen pas na een tik, in het mediascherm van TT-263.
//   Reden (huisstijl §16): een spelend vlak moet bij elk scrollframe opnieuw
//   getekend worden, en dat laat het scrollen schokken op een goedkoop
//   toestel.

// Elk profiel dat getekend wordt, krijgt zijn eigen nummer. Mijn Profiel en
// de profielmodal kunnen tegelijk in de pagina staan — twee keer hetzelfde
// id zou de verkeerde balk laten bewegen.
let profielBannerVolgnr = 0;

function profielBannerItems(mediaLijst) {
  return (mediaLijst || [])
    .filter(x => x && x.in_banner)
    .map(x => ({ ...x, veilig: safeUrl(x.url) }))
    .filter(x => x.veilig)
    .slice(0, MEDIA_BANNER_MAX);
}

function profielBannerHTML(mediaLijst) {
  const items = profielBannerItems(mediaLijst);
  if (!items.length) return '';
  const nr = ++profielBannerVolgnr;
  const spoorId = `pbSpoor${nr}`;
  const stippenId = `pbStippen${nr}`;

  const vlakken = items.map((it, i) => {
    const url = it.veilig;
    const platform = it.platform || detectPlatform(url);
    let binnen, tik;

    if (it.media_type === 'foto') {
      binnen = `<img class="pb-beeld" src="${escAttr(url)}" alt="Foto ${i + 1} van ${items.length}" loading="lazy">`;
      tik = `openMediaLightbox('${jsAttr(url)}')`;
    } else if (it.media_type === 'video') {
      // #t=0.1 dwingt het eerste beeld af; zonder dat laat Safari op de
      // iPhone een zwart vlak zien tot er getikt wordt. muted + playsinline
      // staan erbij omdat de browser het element anders niet mag uitlezen.
      binnen = `<video class="pb-beeld" src="${escAttr(url)}#t=0.1" muted playsinline preload="metadata" tabindex="-1" aria-hidden="true"></video>` +
               `<span class="pb-label">Video</span>`;
      tik = `openMediaSpeler('${jsAttr(url)}', 'video')`;
    } else {
      const ytId = extractYouTubeId(url);
      binnen = ytId
        ? `<img class="pb-beeld" src="https://img.youtube.com/vi/${escAttr(ytId)}/hqdefault.jpg" alt="" loading="lazy">` +
          `<span class="pb-label" data-media-url="${escAttr(url)}">${escHtml(platform)}</span>`
        : `<span class="pb-kaart">` +
          `<span class="pb-kaart-platform">${escHtml(platform)}</span>` +
          `<span class="pb-kaart-titel" data-media-url="${escAttr(url)}">Tik om te openen</span>` +
          `</span>`;
      tik = `openMediaSpeler('${jsAttr(url)}', 'link', null, '${jsAttr(platform)}')`;
    }

    return `<button type="button" class="pb-item" role="group" aria-label="Uitgelicht ${i + 1} van ${items.length}" onclick="${tik}">${binnen}</button>`;
  }).join('');

  const stippen = items.length > 1
    ? `<div class="pb-stippen" id="${stippenId}" role="tablist" aria-label="Uitgelichte media">` +
      items.map((_, i) =>
        `<button type="button" class="pb-stip${i === 0 ? ' aan' : ''}" role="tab" aria-selected="${i === 0 ? 'true' : 'false'}" aria-label="Toon item ${i + 1} van ${items.length}" onclick="profielBannerNaar('${spoorId}', ${i})"></button>`
      ).join('') + `</div>`
    : '';

  return `<div class="profiel-banner">
    <div class="pb-spoor" id="${spoorId}" data-stippen="${stippenId}">${vlakken}</div>
    ${stippen}
  </div>`;
}

// Eén lopende balk per pagina-opbouw. Bij elke nieuwe opbouw stoppen we de
// oude tijd; het element eronder bestaat dan niet meer.
const profielBannerTijden = new Map();

function profielBannerRustig() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function profielBannerNaar(spoorId, i) {
  const spoor = document.getElementById(spoorId);
  if (!spoor) return;
  profielBannerStop(spoorId); // de gebruiker neemt het over
  spoor.scrollTo({ left: i * spoor.clientWidth, behavior: profielBannerRustig() ? 'auto' : 'smooth' });
}

function profielBannerStop(spoorId) {
  const t = profielBannerTijden.get(spoorId);
  if (t) { clearInterval(t); profielBannerTijden.delete(spoorId); }
}

function profielBannerStippenBijwerken(spoor) {
  const houder = document.getElementById(spoor.dataset.stippen || '');
  if (!houder || !spoor.clientWidth) return;
  const nu = Math.round(spoor.scrollLeft / spoor.clientWidth);
  houder.querySelectorAll('.pb-stip').forEach((s, i) => {
    s.classList.toggle('aan', i === nu);
    s.setAttribute('aria-selected', i === nu ? 'true' : 'false');
  });
}

// Wordt aangeroepen nadat een profiel in de pagina staat. Zonder element is
// er niets te starten — net als bij het wiel (huisstijl §7.1): een verborgen
// element heeft geen breedte, dus een gezette scrollpositie komt niet aan.
function profielBannerStarten(root) {
  const scope = root || document;
  scope.querySelectorAll('.pb-spoor').forEach(spoor => {
    const id = spoor.id;
    profielBannerStop(id);

    // Passief: een scroll-luisteraar die de browser niet mag ophouden.
    // Huisstijl §16 verbiedt een niet-passieve luisteraar op een bewegend
    // vlak; dit is dezelfde regel.
    spoor.addEventListener('scroll', () => profielBannerStippenBijwerken(spoor), { passive: true });
    // Zodra de gebruiker zelf swipet of tikt, stopt het doorschuiven. Het
    // blijft daarna stil: iets dat wegdraait terwijl je kijkt, is erger dan
    // iets dat stilstaat.
    spoor.addEventListener('pointerdown', () => profielBannerStop(id), { passive: true });

    if (spoor.children.length < 2 || profielBannerRustig()) return;

    // TT-267 (15-09-2026, gemeld door Ronald): de balk bleef halverwege twee
    // vlakken staan, en bleef daar staan. Gevolg: het eerste beeld was nog
    // maar een streepje breed en de titel liep door de rechterrand. Vandaar
    // deze nakijkstap: een halve seconde na elke sprong wordt gemeten of de
    // balk precies op een vlak staat, en zo niet, dan wordt het zonder
    // animatie rechtgezet. Dat werkt ongeacht de oorzaak — of de sprong nu
    // onderweg werd afgebroken of de breedte intussen wijzigde.
    const rechtzetten = () => {
      const breedte = spoor.clientWidth;
      if (!breedte || !spoor.isConnected) return;
      const doel = Math.round(spoor.scrollLeft / breedte) * breedte;
      if (Math.abs(spoor.scrollLeft - doel) > 2) spoor.scrollLeft = doel;
    };
    // Wijzigt de breedte — schermdraai, of de adresbalk van Android die
    // verdwijnt — dan klopt de oude scrollstand niet meer.
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => rechtzetten());
      ro.observe(spoor);
    }

    profielBannerTijden.set(id, setInterval(() => {
      if (!spoor.isConnected || !spoor.offsetParent) { profielBannerStop(id); return; }
      const breedte = spoor.clientWidth;
      if (!breedte) return;
      const nu = Math.round(spoor.scrollLeft / breedte);
      const volgend = (nu + 1) % spoor.children.length;
      spoor.scrollTo({ left: volgend * breedte, behavior: 'smooth' });
      setTimeout(rechtzetten, 600);
    }, 5000));
  });
}
