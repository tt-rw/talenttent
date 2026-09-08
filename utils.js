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

