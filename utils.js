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

// TT-30 (07-08-2026): effen (gevulde) tags i.p.v. de eerdere ovale outline-
// badges op de zoekresultaten — alleen bruikbaar op een 3/6-cijferige hex-
// kleur (wat safeColor() altijd oplevert voor profile_color), vandaar de
// eenvoudige hex-only implementatie i.p.v. een generieke kleurparser.
// TT-35 (07-08-2026): Enter-toets laten werken als "verder"/"zoeken" op
// tekstvelden waar dat intuïtief is (inloggen, registreren, wachtwoord
// vergeten/opnieuw instellen, zoekvelden) — Ronald: "maak de enter-knop
// actief voor het verdergaan". Shift+Enter blijft gewoon een nieuwe regel
// toestaan op velden waar dat relevant is (niet hier, alleen textareas
// zoals de berichten-composer gebruiken die uitzondering al niet nodig).
// TT-37 (07-08-2026): cursor automatisch in het eerste invoerveld zetten
// zodra een scherm met tekstvelden opent — Ronald: "maak het gebruiks-
// vriendelijk". offsetParent!==null is een simpele, betrouwbare check op
// "daadwerkelijk zichtbaar" (geen display:none-voorouder), zodat dit ook
// binnen de registratiewizard vanzelf alleen de actieve stap raakt.
function autofocusFirstField(root) {
  const el = typeof root === 'string' ? document.getElementById(root) : root;
  if (!el) return;
  const candidates = el.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], input[type="number"], input:not([type]), textarea');
  for (const c of candidates) {
    if (c.offsetParent !== null && !c.readOnly && !c.disabled) {
      c.focus();
      return;
    }
  }
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

function submitOnEnter(event, fn) {
  if (event.key === 'Enter') {
    event.preventDefault();
    fn();
  }
}

function hexToRgba(hex, alpha) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const num = parseInt(h, 16);
  if (isNaN(num)) return `rgba(245,197,24,${alpha})`;
  const r = (num >> 16) & 255, g = (num >> 8) & 255, b = num & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}
function tagSolid(text, hex) {
  return `<span class="tag-solid" style="background:${hexToRgba(hex, 0.16)};color:${hex};">${escHtml(text)}</span>`;
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
    + `<mark style="background:rgba(245,197,24,0.3);color:inherit;border-radius:2px;">${escHtml(t.slice(idx, idx + query.length))}</mark>`
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
  updateOptionalStepHints();
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
const WHEEL_ZICHTBAAR = 5; // aantal zichtbare regels; .wheel-pad = 2 regels
const WHEELS = {};

// cfg: { id, inputId, values[], value, onChange, onPick, ariaLabel, labels? }
// values mag '' bevatten; dat is de stand "Geen" (filter uit).
// onPick wordt alleen aangeroepen bij een tik op een waarde, niet bij scrollen.
function initWheel(cfg) {
  const el = document.getElementById(cfg.id);
  if (!el) return;
  const labelOf = (v) => (cfg.labels && cfg.labels[v] != null) ? cfg.labels[v]
                       : (v === '' ? 'Geen' : String(v));
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
  if (i !== s.index) setWheelIndex(id, i, true);
}

// notify=false zet de stand zonder de zoekopdracht opnieuw te starten —
// gebruikt bij het opbouwen en bij "Filters wissen" (die zoekt zelf één keer).
function setWheelIndex(id, i, notify) {
  const s = WHEELS[id];
  if (!s) return;
  i = Math.max(0, Math.min(s.values.length - 1, i));
  const changed = i !== s.index;
  s.index = i;
  // Vloeiend draaien bij een klik of een pijltoets, direct bij het opbouwen.
  const top = i * WHEEL_ITEM_H;
  if (notify && typeof s.scroll.scrollTo === 'function') s.scroll.scrollTo({ top, behavior: 'smooth' });
  else s.scroll.scrollTop = top;
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
  cfg.columns.forEach((c, i) => {
    if (i > 0 && cfg.sep) html += `<span class="wheel-sep" aria-hidden="true">${escHtml(cfg.sep)}</span>`;
    html += `<div id="${wheelColumnId(id, i)}"></div>`;
  });
  if (cfg.unit) html += `<span class="wheel-unit" aria-hidden="true">${escHtml(cfg.unit)}</span>`;
  html += '<div class="picker-band" aria-hidden="true"></div>';
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
    refreshWheelField(id);
  }));
}

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
  closeChoiceMenu();

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

  // Sluiten bij een klik ergens anders. De luisteraar gaat er pas ná de huidige
  // klik op, anders vangt hij zijn eigen openingsklik — zelfde patroon als
  // handleCancelClick() (huisstijl §8).
  setTimeout(() => {
    document.addEventListener('click', sluitKeuzeMenuBijKlik, { once: true });
  }, 0);
  document.addEventListener('keydown', sluitKeuzeMenuBijEscape);
}

function sluitKeuzeMenuBijKlik() { closeChoiceMenu(); }
function sluitKeuzeMenuBijEscape(e) { if (e.key === 'Escape') closeChoiceMenu(); }

function closeChoiceMenu() {
  document.removeEventListener('keydown', sluitKeuzeMenuBijEscape);
  document.removeEventListener('click', sluitKeuzeMenuBijKlik);
  if (!actiefKeuzeMenu) return;
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


// ─── Naamgrootte in een profielkop (TT-249, 11-09-2026) ──────────────────────
//
// .profile-name staat op 36px. Een naam wordt nooit afgekapt met puntjes — een
// naam hoort heel gelezen te worden — dus schaalt de regelgrootte mee met de
// lengte. Drie vaste stappen in styles.css, geen inline maat. Geldt voor
// muzikant én band: de bandmodal gebruikt dezelfde klasse.
//
// Gemeten op 375px breed, in de echte profielmodal: de naam heeft daar 155px.
// De grootste regelgrootte die op één regel past, per lengte: 7 tekens 35px,
// 9 tekens 27px, 12 tekens 20px, 19 tekens 12px. Twintig tekens (de maximale
// gebruikersnaam) past op geen enkele leesbare grootte op één regel. De
// ondergrens is daarom 20px — gelijk aan .band-name — en een naam vanaf
// dertien tekens loopt door op een tweede regel. Twee regels van 20px dekken
// circa 24 tekens, dus elke toegestane naam past volledig.
function profileNameClass(naam) {
  const n = (naam || '').length;
  if (n <= 7) return '';
  if (n <= 9) return ' name-len-2';
  return ' name-len-3';
}
