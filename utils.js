



let toastTimer = null;

let confirmCallback = null;
let confirmCancelCallback = null;











function showConfirm(message, onConfirm, confirmLabel, danger, cancelLabel, kop, onCancel) {
  const kopEl = document.getElementById('confirmKop');
  if (kopEl) { kopEl.textContent = kop || ''; kopEl.hidden = !kop; }
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmNoBtn').textContent = cancelLabel || 'Annuleren';
  const yesBtn = document.getElementById('confirmYesBtn');
  yesBtn.textContent = confirmLabel || 'Ja, verwijderen';


  yesBtn.classList.toggle('btn-danger', !!danger);
  yesBtn.classList.toggle('btn-primary', !danger);

  const keuzes = document.getElementById('confirmKeuzes');
  if (keuzes) keuzes.innerHTML = '';




  const begrip = document.getElementById('confirmBegrip');
  if (begrip) { begrip.hidden = !danger; document.getElementById('confirmBegripVink').checked = false; }
  confirmExtraDicht = false;
  zetConfirmKnop();
  confirmCallback = onConfirm;
  confirmCancelCallback = onCancel || null;
  document.getElementById('confirmModal').classList.add('visible');
}


let confirmExtraDicht = false;
function zetConfirmKnop() {
  const begrip = document.getElementById('confirmBegrip');
  const vink = document.getElementById('confirmBegripVink');
  const nodig = !!begrip && !begrip.hidden && !(vink && vink.checked);
  document.getElementById('confirmYesBtn').disabled = confirmExtraDicht || nodig;
}
function confirmModalYes() {
  if (document.getElementById('confirmYesBtn').disabled) return;
  document.getElementById('confirmModal').classList.remove('visible');
  document.getElementById('confirmNoBtn').textContent = 'Annuleren';
  const cb = confirmCallback;
  confirmCallback = null;
  confirmCancelCallback = null;
  if (cb) cb();
}
function confirmModalNo() {
  document.getElementById('confirmModal').classList.remove('visible');
  document.getElementById('confirmNoBtn').textContent = 'Annuleren';
  const cb = confirmCancelCallback;
  confirmCallback = null;
  confirmCancelCallback = null;
  if (cb) cb();
}








const TELLER_ZICHTBAAR_REST = 200;
function updateCharCounter(textareaId, counterId, max) {
  const el = document.getElementById(textareaId);
  const counter = document.getElementById(counterId);
  if (!el || !counter) return;
  const len = el.value.length;
  counter.textContent = `${len}/${max}`;
  counter.hidden = len < max - TELLER_ZICHTBAAR_REST;
}






function veldGroeit(el) {
  if (!el) return 0;
  if (!el.offsetParent) { el.style.height = ''; el.style.overflowY = ''; return 0; }
  const voor = el.offsetHeight;
  el.style.height = '';
  const rand = el.offsetHeight - el.clientHeight;
  let nodig;
  if (!el.value && el.placeholder) {


    el.value = el.placeholder;
    nodig = el.scrollHeight;
    el.style.fontStyle = 'italic';
    nodig = Math.max(nodig, el.scrollHeight);
    el.value = '';
    el.style.fontStyle = '';
  } else nodig = el.scrollHeight;
  const max = parseFloat(getComputedStyle(el).maxHeight) || Infinity;
  el.style.height = Math.min(nodig + rand, max) + 'px';
  el.style.overflowY = nodig + rand > max ? 'auto' : '';
  return el.offsetHeight - voor;
}



function veldBovenBalk(el) {
  if (el.selectionEnd !== el.value.length) return;
  const balk = [...(el.closest('.app-view')?.querySelectorAll('.wizard-action-bar') || [])].find(b => b.getBoundingClientRect().height);
  if (!balk) return;
  const ruimte = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ruimte-onderaan')) || 16;
  const teVer = el.getBoundingClientRect().bottom - (balk.getBoundingClientRect().top - ruimte);
  if (teVer > 0) window.scrollBy(0, teVer);
}




const veldBreedteWacht = typeof ResizeObserver === 'function' ? new ResizeObserver(items => {
  for (const it of items) {
    const b = Math.round(it.contentRect.width);
    if (it.target.dataset.groeiBreedte === String(b)) continue;
    it.target.dataset.groeiBreedte = String(b);
    veldGroeit(it.target);
  }
}) : null;
function veldGroeiVolgen(el) { if (el && veldBreedteWacht) veldBreedteWacht.observe(el); veldGroeit(el); }
document.addEventListener('input', e => {
  const el = e.target;
  if (el.tagName !== 'TEXTAREA' || el.id === 'messagesReplyInput') return;
  veldGroeit(el);
  veldBovenBalk(el);
});
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('textarea:not(#messagesReplyInput)').forEach(veldGroeiVolgen);
});

function showToast(msg, duration) {
  const el = document.getElementById('appToast');
  if (!el) { console.warn('Toast:', msg); return; }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), duration || 3500);
}





async function kopieerEmailadres(knop) {
  const adres = knop.textContent.trim();
  try {
    await navigator.clipboard.writeText(adres);
  } catch (e) {
    logCaught('kopieerEmailadres', e);
    showToast('Kopiëren lukt niet op dit apparaat. Kopieer het e-mailadres zelf: ' + adres);
    return;
  }
  showToast('E-mailadres gekopieerd');
}









const TEKST_ZELFDE_WACHTWOORD = 'Kies een ander wachtwoord dan je huidige.';

function isZelfdeWachtwoordFout(err) {
  return !!err && (err.code === 'same_password'
    || /different from the old password/i.test(err.message || ''));
}





const TEKST_ZWAK_WACHTWOORD = 'Dit wachtwoord is te makkelijk te raden. Kies een ander wachtwoord';

function isZwakWachtwoordFout(err) {
  const msg = (err && err.message) ? err.message : String(err || '');
  return !!err && (err.code === 'weak_password'
    || /weak_password|known to be weak|easy to guess|pwned/i.test(msg));
}





const TEKST_ACCOUNT_BESTAAT = 'Je hebt al een account met dit e-mailadres. Log in en ga verder waar je was';
const TEKST_EMAIL_BEZET = 'Dit e-mailadres hoort al bij een ander account. Kies een ander e-mailadres';





function eigenFout(tekst) {
  const e = new Error(tekst);
  e.eigenTekst = true;
  return e;
}


















function knopBezig(knop, aan) {
  if (!knop) return;
  knop.classList.toggle('btn-bezig', aan);
  if (aan) knop.setAttribute('aria-busy', 'true');
  else knop.removeAttribute('aria-busy');
}
function slotOm(fn, knopId) {
  let bezig = false;
  const omhuld = async function (...args) {
    if (bezig) return;
    bezig = true;
    const ev = window.event;
    const getikt = !ev ? null : ev.type === 'submit' ? ev.submitter
      : (ev.type === 'click' && ev.target && ev.target.closest) ? ev.target.closest('button') : null;
    const knop = (knopId && document.getElementById(knopId)) || getikt;
    knopBezig(knop, true);
    try {
      return await fn.apply(this, args);
    } finally {
      bezig = false;
      knopBezig(knop, false);
    }
  };
  omhuld.zonderSlot = fn;
  return omhuld;
}




function idsZetten(lijst, rijen) {
  (rijen || []).forEach((r, i) => { if (lijst[i] && r && r.id != null) lijst[i].id = r.id; });
}

function rijenGeraakt(res) {
  if (res.error || (res.data && res.data.length)) return res;
  return { data: res.data, error: { code: '42501', message: 'row-level security: 0 rijen geraakt' } };
}




const GRENZEN = { bands: 10, nummers: 300, beeld: 8, links: 20, covers: 300, eigenNummers: 200, invallers: 20 };


function grensBereikt(aantal, grens, zin) {
  if (aantal < grens) return false;
  showToast(zin);
  return true;
}


async function bandsVol(mid) {
  const { count, error } = await db.from('band_members')
    .select('band_id', { count: 'exact', head: true }).eq('musician_id', mid).eq('status', 'bevestigd');
  if (error) return false;
  return grensBereikt(count || 0, GRENZEN.bands, `Je zit al in ${GRENZEN.bands} bands. Verlaat er eerst één.`);
}





function friendlyErrorMessage(err, actie) {
  const msg = (err && err.message) ? err.message : String(err || '');
  console.error('Technische foutmelding:', msg);

  if (err && err.eigenTekst) return msg;

  if (/^Bevestig eerst je e-mailadres/i.test(msg)) return msg;
  if (/^Wacht op antwoord/i.test(msg)) return msg;
  if (err && err.hint === 'TT-556') return msg;
  if (err && err.hint === 'TT-625') return msg;
  if (isZelfdeWachtwoordFout(err)) return TEKST_ZELFDE_WACHTWOORD;
  if (isZwakWachtwoordFout(err)) return TEKST_ZWAK_WACHTWOORD + '.';
  const status = err && (err.status || err.statusCode);
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline) return 'Je hebt geen internetverbinding. Probeer het opnieuw zodra je weer online bent.';

  if (/already registered|already exists/i.test(msg)) {
    return TEKST_ACCOUNT_BESTAAT + '.';
  }














  if (/invalid login credentials|invalid_credentials|invalid grant/i.test(msg)) {
    return 'Dit wachtwoord hoort niet bij het e-mailadres.';
  }



  if (/rate limit|too many requests|only request this after/i.test(msg)) {
    return 'Te veel pogingen achter elkaar. Probeer het straks opnieuw.';
  }
  if (/failed to fetch|network|networkerror|load failed/i.test(msg)) {
    return 'Geen verbinding met TalentTent. Controleer je internetverbinding en probeer het opnieuw.';
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












  if (/null value in column|violates not-null constraint/i.test(msg)) {
    return 'Eén van de velden is niet ingevuld. Controleer je invoer en probeer het opnieuw.';
  }
  if (/violates check constraint/i.test(msg)) {
    return 'Eén van de ingevulde waarden wordt niet geaccepteerd. Controleer je invoer en probeer het opnieuw.';
  }




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













const VELDFOUT_ICOON =
  '<svg class="field-msg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.57" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>';

function veldElement(el) {
  return (typeof el === 'string') ? document.getElementById(el) : el;
}




function veldFoutAnker(el) {









  return (el.closest && (el.closest('.password-wrap') || el.closest('.postcode-plaats-rij') || el.closest('.song-search-wrap') || el.closest('.picker-badge-row') || el.closest('.menu-anchor'))) || el;
}




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








  veldfoutWaardeOnthouden(el);
  if (!el.dataset.veldfoutGekoppeld) {
    el.dataset.veldfoutGekoppeld = '1';
    const weg = (e) => {
      const nu = veldWaarde(el);
      if (e.type === 'change' && nu !== undefined && nu === el.dataset.veldfoutWaarde) return;
      clearFieldError(el);
    };
    el.addEventListener('input', weg);
    el.addEventListener('change', weg);
  }
}




function veldWaarde(el) {
  if (el.type === 'checkbox' || el.type === 'radio') return String(el.checked);
  return typeof el.value === 'string' ? el.value : undefined;
}
function veldfoutWaardeOnthouden(el) {
  const w = veldWaarde(el);
  if (w === undefined) delete el.dataset.veldfoutWaarde;
  else el.dataset.veldfoutWaarde = w;
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



function clearFieldErrors(scope) {
  const root = veldElement(scope) || document;
  root.querySelectorAll('.field-error').forEach(clearFieldError);
}




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

  setTimeout(() => {
    try { eerste.focus({ preventScroll: true }); } catch (e) { }
  }, beweegtNiet ? 0 : 300);
  return true;
}




function emailFormaatGeldig(v) {
  return /^[^\s@]+@[^\s@]+\.[A-Za-z]{2,}$/.test((v || '').trim());
}









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



function naamMatcht(term, ...velden) {
  if (!term || !term.tekst) return true;
  return velden.some(w => {
    const s = (w || '').trim().toLowerCase();
    if (!s) return false;
    return term.exact ? s === term.tekst : s.includes(term.tekst);
  });
}
















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





function naamZoalsAnderen(fname, lname, username, keuze, leeftijd) {
  const voor = (fname || '').trim();
  if (keuze === 'echt' && leeftijd >= 16 && voor) {
    return [voor, (lname || '').trim()].filter(Boolean).join(' ');
  }
  return (username || '').trim();
}





function naamKeuzeBijwerken(v, keuze) {
  const blok = document.getElementById(v.blok);
  if (!blok) return;
  const datum = document.getElementById(v.geboorte).value.trim();
  const leeftijd = leeftijdUitVeld(datum);
  blok.style.display = (leeftijd !== null && leeftijd < 16) ? 'none' : '';
  blok.querySelectorAll(`#${v.control} .segmented-btn`).forEach(btn => {
    btn.classList.toggle('selected', btn.getAttribute('data-mode') === keuze);
  });
  const naam = naamZoalsAnderen(document.getElementById(v.fname).value, document.getElementById(v.lname).value,
    document.getElementById(v.username).value, keuze, leeftijd === null ? 16 : leeftijd);
  document.getElementById(v.voorbeeld).textContent = naam ? `Zo zien anderen je: ${naam}` : '';
}




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





function showSaving(title, msg) {
  const overlay = document.getElementById('saveOverlay');
  document.getElementById('saveSpinner').style.display = 'block';
  document.getElementById('saveTitle').textContent = title || 'Opslaan...';
  document.getElementById('saveMsg').textContent = msg || 'Je profiel wordt opgeslagen';
  document.getElementById('saveTitle').style.color = '';
  overlay.classList.add('visible');
}




function hideSaving() {
  const overlay = document.getElementById('saveOverlay');
  if (overlay) overlay.classList.remove('visible');
}



function showSaveSuccess() {
  document.getElementById('saveSpinner').style.display = 'none';
  document.getElementById('saveTitle').textContent = 'Profiel aangemaakt!';
  document.getElementById('saveMsg').textContent = 'Welkom bij TalentTent! Je gaat naar je profiel...';
  setTimeout(() => {
    document.getElementById('saveOverlay').classList.remove('visible');



    if (pendingMessageRecipient) {
      const recipient = pendingMessageRecipient;
      pendingMessageRecipient = null;
      showView('search');
      openMessageComposer(recipient.id, recipient.displayName);
      return;
    }
    showView('myprofile');
  }, 2000);
}



function showSaveError(fout, actie) {
  const msg = (fout && fout.message) ? fout.message : String(fout || '');
  document.getElementById('saveSpinner').style.display = 'none';
  document.getElementById('saveTitle').textContent = 'Oeps...';
  document.getElementById('saveTitle').style.color = 'var(--accent)';

  const isAlreadyRegistered = /already registered|already exists/i.test(msg);

  if (isAlreadyRegistered) {
    document.getElementById('saveMsg').innerHTML =
      `${TEKST_ACCOUNT_BESTAAT}.<br><br>
       <button class="btn btn-primary" style="width:100%;margin-bottom:8px;" onclick="goToLoginFromError()">Inloggen</button>
       <button class="btn btn-ghost" style="width:100%;" onclick="document.getElementById('saveOverlay').classList.remove('visible')">Sluiten</button>`;
    return;
  }

  document.getElementById('saveMsg').innerHTML =
    `<span style="color:var(--accent);font-size:12px;">${escHtml(friendlyErrorMessage(fout, actie))}</span><br><br>
     <button class="btn btn-ghost" style="margin-top:8px;" onclick="document.getElementById('saveOverlay').classList.remove('visible')">Sluiten</button>`;
}

function goToLoginFromError() {
  document.getElementById('saveOverlay').classList.remove('visible');
  showView('auth');
  const emailField = document.getElementById('loginEmail');
  if (emailField) emailField.value = state.regEmail || '';
}



function calcAge(ddmmyyyy) {
  const [dd, mm, yyyy] = ddmmyyyy.split('-').map(Number);
  const birth = new Date(yyyy, mm - 1, dd);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}




function geboortedatumFout(waarde) {
  if (!waarde) return 'Vul je geboortedatum in';
  const m = waarde.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return 'Voer je geboortedatum in als DD-MM-JJJJ, bijvoorbeeld 01-02-2001';
  const dag = Number(m[1]), maand = Number(m[2]), jaar = Number(m[3]);
  const datum = new Date(2000, 0, 1);
  datum.setFullYear(jaar, maand - 1, dag);
  if (datum.getFullYear() !== jaar || datum.getMonth() !== maand - 1 || datum.getDate() !== dag) {
    return 'Deze datum bestaat niet. Controleer dag en maand';
  }
  const leeftijd = calcAge(waarde);
  if (isNaN(leeftijd) || leeftijd < 13) return 'Je moet minimaal 13 jaar zijn om een profiel aan te maken';
  if (leeftijd > 100) return 'Controleer je geboortedatum';
  return '';
}





function leeftijdUitVeld(waarde) {
  const s = (waarde || '').trim();
  return s && !geboortedatumFout(s) ? calcAge(s) : null;
}





function leeftijdsgroep(leeftijd) {
  return leeftijd < 16 ? 'onder16' : leeftijd < 18 ? '16tot18' : '18plus';
}
const TEKST_ANDERE_LEEFTIJDSGROEP = 'Met deze datum kom je in een andere leeftijdsgroep. Is dit echt je geboortedatum?';


function formatBirthDate(input) {
  let v = input.value.replace(/\D/g, '').slice(0, 8);
  if (v.length >= 5) v = v.slice(0,2) + '-' + v.slice(2,4) + '-' + v.slice(4);
  else if (v.length >= 3) v = v.slice(0,2) + '-' + v.slice(2);
  input.value = v;
}










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











let itunesSearchTimeout = null;
let selectedArtist  = null;

function closeAC(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}




function selectFirstAC(listId) {
  const list = document.getElementById(listId);
  if (!list || !list.classList.contains('open')) return;
  const first = list.querySelector('.ac-item[onmousedown]');
  if (first && first.onmousedown) first.onmousedown();
}

const itunesArtistCache = new Map();
const itunesTrackCache = new Map();




async function itunesArtiestenOphalen(q) {
  const res = await fetch(
    `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=7&country=NL`
  );
  if (!res.ok) throw new Error('iTunes ' + res.status);
  const data = await res.json();
  return (data.results || []).slice(0, 6);
}



const artiestVraagNr = {};
function artiestVraagStart(ac) { return (artiestVraagNr[ac.id] = (artiestVraagNr[ac.id] || 0) + 1); }
function artiestVraagNogActueel(ac, nr) { return artiestVraagNr[ac.id] === nr; }

async function onArtistSearch(q) {
  const ac = document.getElementById('acArtistList');
  clearTimeout(itunesSearchTimeout);
  const nr = artiestVraagStart(ac);
  if (q.length < 2) { ac.classList.remove('open'); return; }


  ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted)">Zoeken...</span></div>';
  ac.classList.add('open');

  const cacheKey = q.toLowerCase();
  if (itunesArtistCache.has(cacheKey)) {
    renderArtistResults(ac, itunesArtistCache.get(cacheKey), q, 'selectArtist');
    return;
  }

  itunesSearchTimeout = setTimeout(async () => {
    try {
      const artists = await itunesArtiestenOphalen(q);
      itunesArtistCache.set(cacheKey, artists);
      if (!artiestVraagNogActueel(ac, nr)) return;
      renderArtistResults(ac, artists, q, 'selectArtist');
    } catch(e) {
      logCaught('onArtistSearch', e);
      if (artiestVraagNogActueel(ac, nr)) ac.innerHTML = AC_FOUT_HTML;
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


async function selectArtist(id, name) {
  selectedArtist = { id, name };
  document.getElementById('artistSearch').value = name;
  closeAC('acArtistList');


  const wrap = document.getElementById('trackSearchWrap');
  wrap.style.display = 'block';
  document.getElementById('trackSearchLabel').textContent = `Nummer van ${name}`;
  document.getElementById('trackSearch').value = '';
  document.getElementById('trackSearch').focus();
  closeAC('acTrackList');
}







async function itunesNummersOphalen(cache, artistId) {
  if (cache.has(artistId)) return cache.get(artistId);
  const fetchPromise = (async () => {
    const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(artistId)}&entity=song&limit=200&country=NL`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('iTunes ' + res.status);
    const data = await res.json();

    return (data.results || []).filter(r => r.wrapperType === 'track');
  })();
  cache.set(artistId, fetchPromise);
  try {
    const songs = await fetchPromise;
    cache.set(artistId, songs);
    return songs;
  } catch (e) {
    if (cache.get(artistId) === fetchPromise) cache.delete(artistId);
    throw e;
  }
}
function fetchArtistSongs(artistId) { return itunesNummersOphalen(itunesTrackCache, artistId); }



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
    ac.innerHTML = AC_FOUT_HTML;
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













const INSTRUMENTS = [
  'Achtergrondzang', 'Akoestische gitaar', 'Basgitaar', 'Cello',
  'Conga / Bongo', 'DJ / Electronica', 'Drums', 'Elektrische gitaar',
  'Keyboard', 'Mondharmonica', 'Percussie overig', 'Piano', 'Saxofoon',
  'Songwriting', 'Tamboerijn', 'Trompet', 'Ukulele', 'Viool', 'Zang'
];





const GENRES = [
  'Blues', 'Country', 'Electronic', 'Folk / Akoestisch', 'Funk', 'Hip-hop',
  'Indie', 'Jazz', 'Klassiek', 'Metal', 'Pop', 'Punk', 'R&B / Soul',
  'Reggae', 'Rock'
];




function compareArtistTitle(artistA, titleA, artistB, titleB) {
  const byArtist = (artistA || '').localeCompare(artistB || '', 'nl', { sensitivity: 'base' });
  if (byArtist !== 0) return byArtist;
  return (titleA || '').localeCompare(titleB || '', 'nl', { sensitivity: 'base' });
}



















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





const LANG_WOORD_TEKENS = 20;
function tekstMetMeerHTML(tekst) {
  return String(tekst ?? '').split(/(\s+)/).map(w => w.length >= LANG_WOORD_TEKENS && !/\s/.test(w)
    ? `<span class="lang-woord"><span class="lang-woord-tekst">${escHtml(w)}</span><button type="button" class="lang-woord-meer" onclick="langWoordOpen(this)" aria-label="Toon het hele woord">(meer)</button></span>`
    : escHtml(w)).join('');
}
function langWoordOpen(knop) { knop.parentElement.classList.add('open'); }



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




function safeUrl(u) {
  const s = String(u ?? '').trim();
  return /^(https?:\/\/|blob:)/i.test(s) ? escHtml(s) : '';
}












const FOTO_KLEIN_PX = 240;
function fotoKleinPad(pad) {
  return String(pad).replace(/\.[^./]*$/, '') + '_klein.jpg';
}

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


















const FOTO_LINK_SEC = 7 * 24 * 3600;
const FOTO_LINK_MARGE_MS = 24 * 3600 * 1000;
const FOTO_LINK_OPSLAG = 'tt_fotolinks';
const FOTO_LINK_MAX = 600;
const FOTO_AFGESCHERMD = /\/storage\/v1\/object\/public\/(avatars|media)\/([^?#]+)/;
let fotoLinks = null;
const fotoLinksOnderweg = new Map();

function fotoLinksGeheugen() {
  if (fotoLinks) return fotoLinks;
  fotoLinks = new Map();
  try {
    const nu = Date.now();
    Object.entries(JSON.parse(localStorage.getItem(FOTO_LINK_OPSLAG) || '{}')).forEach(([k, v]) => {
      if (Array.isArray(v) && v[1] - FOTO_LINK_MARGE_MS > nu) fotoLinks.set(k, v);
    });
  } catch (e) { }
  return fotoLinks;
}
function fotoLinksBewaren() {
  const g = fotoLinksGeheugen();
  while (g.size > FOTO_LINK_MAX) g.delete(g.keys().next().value);
  try { localStorage.setItem(FOTO_LINK_OPSLAG, JSON.stringify(Object.fromEntries(g))); } catch (e) { }
}
function fotoLinksWissen() {
  fotoLinks = new Map();
  try { localStorage.removeItem(FOTO_LINK_OPSLAG); } catch (e) { }
}

function fotoLinkSleutel(src) {
  const m = FOTO_AFGESCHERMD.exec(String(src || ''));
  return m ? m[1] + '/' + decodeURIComponent(m[2]) : null;
}


function fotoLinkUitGeheugen(src) {
  const k = fotoLinkSleutel(src);
  if (!k) return src;
  const v = fotoLinksGeheugen().get(k);
  return v && v[1] - FOTO_LINK_MARGE_MS > Date.now() ? v[0] : null;
}

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


    + `<mark style="background:none;color:var(--accent);">${escHtml(t.slice(idx, idx + query.length))}</mark>`
    + escHtml(t.slice(idx + query.length));
}

function addSong(title, artist) {
  if (state.songs.find(s => s.title===title && s.artist===artist)) return;
  if (grensBereikt(state.songs.length, GRENZEN.nummers, `Maximum van ${GRENZEN.nummers} nummers bereikt.`)) return;
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






const NUMMERS_MIN = 3;
const BEHEERSING_NAMEN = { basis: 'Basis', bijna: 'Bijna', podium: 'Podium' };
const PIJL_OMLAAG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';




const RIJ_KRUIS = '<svg viewBox="4.75 4.75 14.5 14.5" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';








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



  if (!open && lijst.getBoundingClientRect().top < 0) {
    const beweegtNiet = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { lijst.scrollIntoView({ behavior: beweegtNiet ? 'auto' : 'smooth', block: 'center' }); }
    catch (e) { lijst.scrollIntoView(); }
  }
}

















const OVERNEEM_PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';
const OVERNEEM_VINK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
let eigenNummerSleutels = null;
const nummerSleutel = (titel, artiest) => `${String(titel || '').toLowerCase()}|||${String(artiest || '').toLowerCase()}`;

let overneemTeller = 0;
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

async function overneemKnoppenBijwerken(vak) {
  const knoppen = vak ? [...vak.querySelectorAll('.nummer-overneem')] : [];
  if (!knoppen.length || !hasOwnProfile || !myMusicianId) return;
  try { await eigenNummersOphalen(); }
  catch (e) { logCaught('overneemKnoppenBijwerken', e); return; }
  knoppen.forEach(overneemKnopZetten);
}
async function nummerOvernemen(ev, knop) {
  if (ev) ev.stopPropagation();
  if (!hasOwnProfile || !myMusicianId) { showToast('Maak een profiel aan, dan bewaren we dit nummer.'); return; }
  if (knop.dataset.bezig) return;
  if (knop.classList.contains('aan')) { repertoireBijwerken(knop, null); return; }

  const n = knop.dataset.nr, id = `ovn${n}`;

  CHOICE_FIELDS[id] = { id, fieldId: knop.id, selectId: `ovnSel${n}`, menuId: `ovnMenu${n}`, kop: 'Zet in je setlist' };
  toggleChoiceMenu(id);
}
function nummerOvernemenMet(n, sel) {
  const level = sel.value;
  sel.value = '';
  const knop = document.getElementById(`ovnVeld${n}`);
  if (knop && BEHEERSING_NAMEN[level]) repertoireBijwerken(knop, level);
}




let repertoireRij = Promise.resolve();
function repertoireBijwerken(knop, level) {
  if (knop.dataset.bezig) return repertoireRij;
  knop.dataset.bezig = '1';
  repertoireRij = repertoireRij.then(() => repertoireBijwerkenNu(knop, level));
  return repertoireRij;
}
async function repertoireBijwerkenNu(knop, level) {
  try {

    const lijst = await eigenNummersOphalen();
    const titel = knop.dataset.titel, artiest = knop.dataset.artiest, sleutel = nummerSleutel(titel, artiest);
    const erin = eigenNummerSleutels.has(sleutel);
    const ditNummer = s => nummerSleutel(s.song_title, s.song_artist) === sleutel;
    let nieuw;
    if (level) {

      if (!erin && grensBereikt(lijst.length, GRENZEN.nummers, `Maximum van ${GRENZEN.nummers} nummers bereikt.`)) return;
      nieuw = erin ? lijst.map(s => ditNummer(s) ? { ...s, mastery_level: level } : s)
                   : lijst.concat([{ song_title: titel, song_artist: artiest, mastery_level: level }]);
    } else {

      if (!erin) { document.querySelectorAll('.nummer-overneem').forEach(overneemKnopZetten); return; }
      nieuw = lijst.filter(s => !ditNummer(s));
    }
    const { error } = await db.rpc('tt_save_musician_koppelingen', {
      p_musician_id: myMusicianId,
      p_songs: nieuw.map(s => ({ song_title: s.song_title, song_artist: s.song_artist, mastery_level: s.mastery_level })),
    });
    if (error) { showToast(friendlyErrorMessage(error, 'je repertoire opslaan')); return; }
    eigenNummerSleutels = new Set(nieuw.map(s => nummerSleutel(s.song_title, s.song_artist)));

    document.querySelectorAll('.nummer-overneem').forEach(overneemKnopZetten);
    showToast(level ? 'Nummer opgeslagen.' : 'Nummer weggehaald.');
  } catch (e) {
    logCaught('repertoireBijwerken', e);
    showToast(friendlyErrorMessage(e, 'je repertoire opslaan'));
  } finally {
    delete knop.dataset.bezig;
  }
}








function nummerTekstHTML(artiest, titel) {
  return `<span class="song-tekst"><span class="song-artiest">${escHtml(artiest || '')}</span>` +
    (titel ? `<span class="song-titel">${escHtml(titel)}</span>` : '') + `</span>`;
}
const PERSONEN_TEKEN ='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.57" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/></svg>';





function nummersTekortFouten(lijst = state.songs, veld = 'artistSearch') {
  if (lijst.length >= NUMMERS_MIN) return [];
  return [[veld, setlistTellerTekst(lijst.length)]];
}



function setlistTellerTekst(n) {
  const nog = NUMMERS_MIN - n;
  if (nog > 0) return nog === 1 ? 'Voeg nog 1 nummer toe' : `Voeg nog ${nog} nummers toe`;
  return `${n} nummers`;
}







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



function voorproefOphalen(lijst, title, artist, teken) {
  nummerSpelersOphalen(title, artist).then(aantal => {
    const s = lijst().find(x => x.title === title && x.artist === artist);
    if (!s || !aantal) return;
    s.spelers = aantal;
    teken();
  });
}



function voorproefHTML(spelers) {
  const n = Number(spelers);
  if (!Number.isInteger(n) || n < 1) return '';
  return `${PERSONEN_TEKEN}<b>${n} ${n === 1 ? 'ander' : 'anderen'}</b> ${n === 1 ? 'speelt' : 'spelen'} dit ook`;
}




function setlistLijstHTML(lijst, p, weg) {
  const volgorde = lijst.map((s, i) => i)
    .sort((a, b) => compareArtistTitle(lijst[a].artist, lijst[a].title, lijst[b].artist, lijst[b].title));
  return volgorde.map(i => {
    const s = lijst[i];
    const naam = BEHEERSING_NAMEN[s.level];
    const opties = ['basis', 'bijna', 'podium']
      .map(k => `<option value="${k}"${s.level === k ? ' selected' : ''}>${BEHEERSING_NAMEN[k]}</option>`).join('');




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


function setlistKeuzesKoppelen(lijst, p, zet) {
  lijst.forEach((s, i) => {
    initChoiceField({ id: `${p}beh${i}`, fieldId: `${p}behVeld${i}`, selectId: `${p}behSel${i}`, menuId: `${p}behMenu${i}` });
    const sel = document.getElementById(`${p}behSel${i}`);
    if (sel) sel.addEventListener('change', () => zet(i, sel.value || null));
  });
}



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






















const LEEG_VELD = '–';
function zetVeldTekst(el, tekst) {
  if (!el) return;
  el.textContent = tekst;
  el.classList.toggle('leeg', tekst === LEEG_VELD);
}













const WHEEL_FIELDS = {};

function initWheelField(cfg) {
  WHEEL_FIELDS[cfg.id] = cfg;
  initChoiceField({
    id: cfg.id, fieldId: cfg.fieldId, menuId: cfg.menuId, meer: !!cfg.bereik,
    rijen: () => menuVeldRijen(cfg),
    kies: (i) => menuVeldKies(cfg, i),
    ververs: () => refreshWheelField(cfg.id),
  });
  setWheelFieldValues(cfg.id, cfg.value, false);
}

function wheelFieldValues(id) {
  const cfg = WHEEL_FIELDS[id];
  if (!cfg) return [];
  return cfg.inputs.map(inputId => {
    const inp = document.getElementById(inputId);
    return inp ? inp.value : '';
  });
}


function setWheelFieldValues(id, waarden, notify) {
  const cfg = WHEEL_FIELDS[id];
  if (!cfg) return;
  cfg.inputs.forEach((inputId, i) => {
    const inp = document.getElementById(inputId);
    if (inp) inp.value = (waarden && waarden[i] != null) ? waarden[i] : '';
  });
  refreshWheelField(id);
  if (notify && typeof cfg.onChange === 'function') cfg.onChange();
}


function refreshWheelField(id) {
  const cfg = WHEEL_FIELDS[id];
  if (!cfg) return;
  const el = document.getElementById(cfg.fieldId);
  if (!el) return;
  const waarden = wheelFieldValues(id);
  zetVeldTekst(el.querySelector('.wheel-field-label'), cfg.format(waarden));
  const aan = typeof cfg.isActief === 'function' ? cfg.isActief(waarden)
            : waarden.some(v => v !== '' && v != null);
  el.classList.toggle('is-set', !!aan);
}


function menuVeldRijen(cfg) {
  const w = wheelFieldValues(cfg.id);
  const getal = (v, leeg) => (v === '' || v == null) ? leeg : Number(v);
  return cfg.rijen.map(r => {
    let gekozen;
    if (!cfg.bereik) {
      gekozen = String(r.waarden[0]) === String(w[0]);
    } else if (w[0] === '' && w[1] === '') {
      gekozen = false;
    } else {
      gekozen = getal(r.waarden[0], -Infinity) >= getal(w[0], -Infinity)
             && getal(r.waarden[1], Infinity) <= getal(w[1], Infinity);
    }
    return { t: r.t, gekozen };
  });
}

function menuVeldKies(cfg, i) {
  if (!cfg.bereik) { setWheelFieldValues(cfg.id, cfg.rijen[i].waarden, true); return; }
  const aan = menuVeldRijen(cfg).map(r => r.gekozen);
  aan[i] = !aan[i];
  const nrs = aan.map((a, n) => a ? n : -1).filter(n => n >= 0);
  const waarden = nrs.length
    ? [cfg.rijen[nrs[0]].waarden[0], cfg.rijen[nrs[nrs.length - 1]].waarden[1]]
    : (cfg.clearTo || cfg.inputs.map(() => ''));
  setWheelFieldValues(cfg.id, waarden, true);
}






const CHOICE_FIELDS = {};
let actiefKeuzeMenu = null;







function initChoiceField(cfg) {
  CHOICE_FIELDS[cfg.id] = cfg;
  const el = document.getElementById(cfg.fieldId);
  if (!el) return;
  if (el.ttKeuzeVeld === cfg.id) { refreshChoiceField(cfg.id); return; }
  el.ttKeuzeVeld = cfg.id;
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



function refreshChoiceField(id) {
  const cfg = CHOICE_FIELDS[id];
  if (!cfg) return;
  if (!cfg.selectId) { if (cfg.ververs) cfg.ververs(); return; }
  const sel = document.getElementById(cfg.selectId);
  const el = document.getElementById(cfg.fieldId);
  if (!sel || !el) return;
  const optie = sel.options[sel.selectedIndex];
  const labelEl = el.querySelector('.wheel-field-label');
  if (labelEl) labelEl.textContent = optie ? optie.textContent : '';
}


function keuzeMenuRijen(cfg) {
  if (cfg.rijen) return cfg.rijen();
  const sel = document.getElementById(cfg.selectId);


  return [...sel.options].filter(o => o.style.display !== 'none')
    .map(o => ({ t: o.textContent, gekozen: o.value === sel.value, waarde: o.value }));
}

function tekenKeuzeMenu(id) {
  const cfg = CHOICE_FIELDS[id];
  const menu = cfg && document.getElementById(cfg.menuId);
  if (!menu) return;
  const rijen = keuzeMenuRijen(cfg);
  const scroll = menu.scrollTop;


  if (cfg.kop) menu.setAttribute('aria-label', cfg.kop);
  menu.innerHTML = (cfg.kop ? `<div class="keuze-kop" aria-hidden="true">${escHtml(cfg.kop)}</div>` : '') + rijen.map((r, i) => `
    <button type="button" class="choice-option${r.gekozen ? ' selected' : ''}${r.u ? ' met-uitleg' : ''}"
            role="option" aria-selected="${r.gekozen ? 'true' : 'false'}" data-i="${i}"${r.waarde != null ? ` data-waarde="${escHtml(r.waarde)}"` : ''}>${cfg.tekens && cfg.tekens[r.waarde] ? `<svg class="keuze-teken" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cfg.tekens[r.waarde]}</svg>` : ''}<span>${escHtml(r.t)}</span>${r.u ? `<span class="keuze-uitleg">${escHtml(r.u)}</span>` : ''}</button>`).join('');
  keuzeMeerTeken(menu);
  menu.scrollTop = scroll;
  if (cfg.meer) menu.setAttribute('aria-multiselectable', 'true');
  menu.querySelectorAll('.choice-option').forEach(rij => {
    rij.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = parseInt(rij.dataset.i);
      if (cfg.kies) {
        cfg.kies(i);




        if (cfg.meer && actiefKeuzeMenu === id) {
          tekenKeuzeMenu(id);
          const veld = document.getElementById(cfg.fieldId);
          if (veld) menuInBeeld(menu, veld);
        }
        else closeChoiceMenu();
        return;
      }
      const sel = document.getElementById(cfg.selectId);
      const waarde = rijen[i].waarde;
      closeChoiceMenu();
      if (sel.value !== waarde) {
        sel.value = waarde;
        sel.dispatchEvent(new Event('change'));
      }
      refreshChoiceField(id);
    });
  });
}




const KEUZE_MEER_PIJL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
function keuzeMeerTeken(menu) {
  if (menu.classList.contains('beheersing-menu')) return;
  if (menu.scrollHeight <= menu.clientHeight + 1) return;
  const teken = document.createElement('div');
  teken.className = 'keuze-meer';
  teken.setAttribute('aria-hidden', 'true');
  teken.innerHTML = KEUZE_MEER_PIJL;
  menu.appendChild(teken);
  const bijScroll = () => menu.classList.toggle('onderaan', menu.scrollTop + menu.clientHeight >= menu.scrollHeight - 2);
  if (!menu.ttMeerLuisteraar) { menu.addEventListener('scroll', bijScroll, { passive: true }); menu.ttMeerLuisteraar = true; }
  bijScroll();
}

function toggleChoiceMenu(id) {
  if (actiefKeuzeMenu === id) closeChoiceMenu();
  else openChoiceMenu(id);
}

function openChoiceMenu(id) {
  const cfg = CHOICE_FIELDS[id];
  if (!cfg) return;
  sluitAlleMenus();

  const menu = document.getElementById(cfg.menuId);
  const veld = document.getElementById(cfg.fieldId);
  if (!menu || !veld) return;



  if (menu.ttOpruimen) menu.ttOpruimen();

  menu.classList.remove('naar-boven');
  menu.classList.add('open');
  tekenKeuzeMenu(id);
  veld.setAttribute('aria-expanded', 'true');
  actiefKeuzeMenu = id;
  menuInBeeld(menu, veld);



  const gekozen = menu.querySelector('.choice-option.selected');
  if (gekozen && menu.scrollHeight > menu.clientHeight) {
    menu.scrollTop = Math.max(0, gekozen.offsetTop - (menu.clientHeight - gekozen.offsetHeight) / 2);
  }



  menuLaagOpen(menu);
}














const BALKEN_ONDER = '#appBottomNav, .wizard-action-bar';
function menuInBeeld(menu, veld) {
  const balken = [...document.querySelectorAll(BALKEN_ONDER)]
    .filter(b => b.getClientRects().length && getComputedStyle(b).position === 'fixed')
    .map(b => b.getBoundingClientRect().top);
  const onder = Math.min(window.innerHeight, ...balken);
  const veldRect = veld.getBoundingClientRect();
  const tekort = veldRect.bottom + 6 + menu.offsetHeight + 12 - onder;
  if (tekort <= 0) return;
  if (menu.closest('.modal-overlay')) {
    if (veldRect.top - 6 - menu.offsetHeight >= 0) menu.classList.add('naar-boven');
    return;
  }
  const kanNog = document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
  if (kanNog < tekort) {
    if (menu.ttMinHoogte === undefined) menu.ttMinHoogte = document.body.style.minHeight;



    document.body.style.minHeight = Math.ceil(Math.max(document.body.offsetHeight, document.documentElement.scrollHeight) + tekort - kanNog) + 'px';
  }
  const beweegtNiet = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollBy({ top: Math.ceil(tekort), behavior: beweegtNiet ? 'auto' : 'smooth' });
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














  menu.classList.add('sluit');
  let t = null;
  const opruimen = () => {
    clearTimeout(t);
    menu.removeEventListener('animationend', bijEindeBeweging);
    menu.ttOpruimen = null;
    menu.classList.remove('open', 'sluit', 'naar-boven', 'onderaan');
    menu.innerHTML = '';
    if (menu.ttMinHoogte !== undefined) { document.body.style.minHeight = menu.ttMinHoogte; delete menu.ttMinHoogte; }
  };
  const bijEindeBeweging = (e) => {
    if (e.animationName === 'choiceMenuDicht') opruimen();
  };
  menu.addEventListener('animationend', bijEindeBeweging);


  const beweegtNiet = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  t = setTimeout(opruimen, beweegtNiet ? 0 : 260);

  menu.ttOpruimen = opruimen;
  if (cfg && cfg.naSluiten) cfg.naSluiten();
}












function emptyStateHTML(kop, uitleg, knopLabel, knopActie) {
  const uitlegHTML = uitleg ? `<p class="empty-state-text">${escHtml(uitleg)}</p>` : '';
  const knopHTML = knopLabel ? `<button class="btn btn-primary" onclick="${knopActie}">${escHtml(knopLabel)}</button>` : '';
  return `<div class="empty-state">
    <p class="empty-state-title">${escHtml(kop)}</p>
    ${uitlegHTML}
    ${knopHTML}
  </div>`;
}






function foutStaatHTML(err, actie, knopActie) {
  const tekst = friendlyErrorMessage(err, actie).replace(/\s*Wat je invulde blijft staan\.$/, '');
  const zonderOorzaak = / is niet gelukt\. Probeer het opnieuw\.$/.test(tekst);
  return emptyStateHTML('Laden lukt nu niet', zonderOorzaak ? '' : tekst,
    'Probeer het opnieuw', knopActie);
}

const AC_FOUT_HTML = '<div class="ac-item ac-fout">Zoeken lukt nu niet. Controleer je verbinding en typ opnieuw.</div>';













const PROFIELNAAM_LADDER = [32, 28, 24, 20, 18, 16];





const PROFIELNAAM_NOOD = [14, 12, 10];


const PROFIELNAAM_MIN = 16;





const PROFIELNAAM_REFERENTIE = 234;

let naamMeterEl = null;





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



function naamPastInProfielkop(naam) {
  return meetNaamBreedte(naam, PROFIELNAAM_MIN) <= PROFIELNAAM_REFERENTIE;
}




function fitProfileName(root) {
  const scope = root || document;
  scope.querySelectorAll('.profile-name').forEach(el => {
    const ruimte = el.clientWidth;
    if (!ruimte) return;
    el.style.fontSize = '';


    const max = Number(el.dataset.max) || Infinity;
    for (const px of PROFIELNAAM_LADDER.concat(PROFIELNAAM_NOOD).filter(x => x <= max)) {
      el.style.fontSize = px + 'px';
      if (el.scrollWidth <= ruimte) return;
    }
  });
}











const KOPLOGO_LADDER = [28, 24, 22, 20, 18, 16];








const KOPLOGO_NOOD = [14, 12, 10];








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
    if (!logo || !rij.clientWidth) return;









    const ruimte = kopRuimte(rij, logo);
    if (ruimte === null) return;
    for (const px of KOPLOGO_LADDER.concat(KOPLOGO_NOOD)) {
      logo.style.fontSize = px + 'px';
      if (meetLogoBreedte(logo, px) <= ruimte) return;
    }
  });
}









const KOPTITEL_LADDER = [17, 15];
let kopTitelMeterEl = null;
function fitKopTitel() {
  const titel = document.getElementById('kopTitel');
  const rij = titel?.parentElement;
  if (!titel || !rij || !rij.clientWidth) return;
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















const MEDIA_BANNER_MAX = 6;

function detectPlatform(url) {
  if (url.includes('youtube') || url.includes('youtu.be')) return 'YouTube';
  if (url.includes('instagram')) return 'Instagram';
  if (url.includes('soundcloud')) return 'SoundCloud';
  if (url.includes('tiktok')) return 'TikTok';
  if (url.includes('spotify')) return 'Spotify';
  return 'Link';
}




function extractYouTubeId(url) {
  const id = extractYouTubeIdRuw(url);


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






const MEDIA_OEMBED = {
  YouTube:    u => 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(u),
  Spotify:    u => 'https://open.spotify.com/oembed?url=' + encodeURIComponent(u),
  SoundCloud: u => 'https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(u),
  TikTok:     u => 'https://www.tiktok.com/oembed?url=' + encodeURIComponent(u),
};



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


    titel = null;
  }
  mediaTitelCache.set(veilig, titel);
  return titel;
}



function mediaTitelsBijwerken(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-media-url]').forEach(async el => {
    const url = el.getAttribute('data-media-url');
    if (!url || el.dataset.titelGezet === '1') return;
    const titel = await mediaTitelOphalen(url);
    if (!titel) return;
    if (!el.isConnected) return;
    el.textContent = titel;
    el.dataset.titelGezet = '1';
    if (el.classList.contains('media-rij-titel')) el.title = titel;
  });
}







function bannerKnopHTML(aan, onclickJs, opBeeld) {
  return `<button type="button" class="banner-btn${opBeeld ? ' op-beeld' : ''}" aria-pressed="${aan ? 'true' : 'false'}"
    aria-label="${aan ? 'Uit je banner halen' : 'In je banner tonen'}" title="${aan ? 'Uit je banner halen' : 'In je banner tonen'}"
    onclick="${onclickJs}">
    <svg viewBox="0 0 24 24" aria-hidden="true"><circle class="bb-schijf" cx="12" cy="12" r="11"></circle><rect class="bb-vorm" x="5.5" y="8.5" width="13" height="7" rx="2"></rect></svg>
  </button>`;
}






function bannerTellerHTML(aantal) {
  return `<span class="banner-teken" aria-hidden="true"><svg viewBox="0 0 24 24"><circle class="bb-schijf" cx="12" cy="12" r="11"></circle><rect class="bb-vorm" x="5.5" y="8.5" width="13" height="7" rx="2"></rect></svg></span>` +
    `<b>Kies je bannerinhoud:</b> ${aantal} van ${MEDIA_BANNER_MAX} gekozen.`;
}





function bannerKnopStandZetten(houderId, i, aan) {
  const knop = document.querySelectorAll(`#${houderId} .banner-btn`)[i];
  if (!knop) return;
  const label = aan ? 'Uit je banner halen' : 'In je banner tonen';
  knop.setAttribute('aria-pressed', aan ? 'true' : 'false');
  knop.setAttribute('aria-label', label);
  knop.setAttribute('title', label);
}




function bannerKeuzeMag(huidigAantal, wordtAan) {
  if (!wordtAan) return true;
  if (huidigAantal < MEDIA_BANNER_MAX) return true;
  showToast(`Maximum van ${MEDIA_BANNER_MAX} items bereikt.`);
  return false;
}










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
    beeld.innerHTML = `<video ${fotoBronAttr(veilig)} controls autoplay playsinline style="width:100%;height:100%;background:var(--beeld-zwart);"></video>`;
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

    mediaTitelOphalen(veilig).then(t => {
      if (t && document.getElementById('mediaSpelerModal').classList.contains('visible')) {
        document.getElementById('mediaSpelerTitel').textContent = t;
      }
    });
  }
}

function closeMediaSpeler() {
  document.getElementById('mediaSpelerModal').classList.remove('visible');


  document.getElementById('mediaSpelerBeeld').innerHTML = '';
  document.getElementById('mediaSpelerVoet').innerHTML = '';
}






function mediaFnNaam(voorvoegsel, naam) {
  return voorvoegsel ? voorvoegsel + naam.charAt(0).toUpperCase() + naam.slice(1) : naam;
}






function platformNaamHTML(naam) {
  return escHtml(naam).replace(/([a-z])([A-Z])/g, '$1<wbr>$2');
}

function mediaLinkMiniatuurHTML(url) {
  const veilig = safeUrl(url);
  const platform = veilig ? detectPlatform(veilig) : 'Link';
  const yt = veilig ? extractYouTubeId(veilig) : null;
  if (yt) {
    return `<img src="https://img.youtube.com/vi/${escHtml(yt)}/hqdefault.jpg" alt="" loading="lazy">`;
  }
  return `<span class="media-mini-platform">${veilig ? platformNaamHTML(platform) : '—'}</span>`;
}
















const PLUS_TEKEN = '<svg class="media-toevoegen-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="M12 5v14"/></svg>';

function mediaRasterHTML(bestanden, links, voorvoegsel) {
  const fn = n => mediaFnNaam(voorvoegsel, n);
  const id = voorvoegsel || 'wiz';
  const tegels = bestanden.map((m, i) => mediaKaartHTML(m, i, fn))
    .concat(links.map((l, i) => mediaLinkKaartHTML(l, i, fn)));
  tegels.push(`<div class="menu-anchor media-toevoegen-plek">` +
    `<button type="button" class="media-toevoegen" id="${id}MediaToevoegen" aria-haspopup="listbox" aria-expanded="false"` +
    ` onclick="mediaToevoegenMenu(event, '${id}')">${PLUS_TEKEN}Toevoegen</button>` +
    `<select id="${id}MediaToevoegenSel" hidden onchange="${fn('mediaToevoegenKeuze')}(this)">` +
    `<option value="foto">Foto</option><option value="video">Video</option><option value="link">Link</option></select>` +
    `<div class="choice-menu menu-tegel media-toevoegen-menu" id="${id}MediaToevoegenMenu" role="listbox"></div></div>`);
  return tegels.join('');
}

function mediaKaartHTML(m, i, fn) {
  const beeld = m.type === 'foto'
    ? `<img ${kleinFotoAttr(safeUrl(m.url))} alt="${escHtml(m.name || '')}">`
    : SPEELTEKEN_HTML;
  return `
    <div class="media-thumb">
      <button type="button" class="media-thumb-open" onclick="${fn('speelMedia')}(${i})" aria-label="${m.type === 'foto' ? 'Foto bekijken' : 'Video afspelen'}">${beeld}</button>
      ${bannerKnopHTML(!!m.inBanner, `${fn('toggleMediaBanner')}(${i})`, true)}
      ${m.uploading ? `<div class="media-thumb-laden"><div class="save-spinner"></div></div>` : ''}
      <button type="button" class="thumb-remove" onclick="${fn('removeMedia')}(${i})" aria-label="Verwijderen">✕</button>
    </div>`;
}

function mediaLinkKaartHTML(l, i, fn) {
  const veilig = safeUrl(l.url);
  const platform = veilig ? detectPlatform(veilig) : 'Link';
  const yt = veilig ? extractYouTubeId(veilig) : null;
  const beeld = yt
    ? `<img src="https://img.youtube.com/vi/${escHtml(yt)}/hqdefault.jpg" alt="" loading="lazy">${SPEELTEKEN_HTML}`
    : `<span class="media-kaart-platform">${escHtml(platform)}</span>`;
  return `
    <div class="media-thumb media-thumb-link">
      <button type="button" class="media-thumb-open" onclick="${fn('speelLink')}(${i})" aria-label="${escHtml(platform)} openen">${beeld}</button>
      ${bannerKnopHTML(!!l.inBanner, `${fn('toggleLinkBanner')}(${i})`, true)}
      <button type="button" class="thumb-remove" onclick="${fn('removeLink')}(${i})" aria-label="Link verwijderen">✕</button>
    </div>`;
}





const MEDIA_TEKENS = {
  foto: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>'
};
function mediaToevoegenMenu(ev, id) {
  if (ev) ev.stopPropagation();
  const knop = document.getElementById(`${id}MediaToevoegen`);
  const menu = document.getElementById(`${id}MediaToevoegenMenu`);
  if (!knop || !menu) return;

  const sel = document.getElementById(`${id}MediaToevoegenSel`);
  if (sel) sel.value = '';
  const sleutel = `${id}MediaToevoegen`;
  CHOICE_FIELDS[sleutel] = { id: sleutel, fieldId: knop.id, selectId: `${id}MediaToevoegenSel`, menuId: menu.id, tekens: MEDIA_TEKENS };
  toggleChoiceMenu(sleutel);
}



function mediaToevoegenStart(sel, bestanden, links, invoerId, linkErbij) {
  const keuze = sel.value;
  sel.value = '';
  if (keuze === 'foto' || keuze === 'video') {
    if (grensBereikt(bestanden.length, GRENZEN.beeld, `Maximum van ${GRENZEN.beeld} bestanden bereikt.`)) return;
    const invoer = document.getElementById(invoerId);
    if (!invoer) return;


    invoer.accept = (keuze === 'foto' ? 'image' : 'video') + '/' + '*';
    invoer.click();
  } else if (keuze === 'link') {
    if (grensBereikt(links.length, GRENZEN.links, `Maximum van ${GRENZEN.links} links bereikt.`)) return;
    openLinkToevoegen(linkErbij);
  }
}


function linkBannerTik(l, i, bestanden, links, rasterId, tellerId) {
  if (!l) return;
  if (!bannerKeuzeMag(bannerAantal(bestanden, links), !l.inBanner)) return;
  l.inBanner = !l.inBanner;
  bannerKnopStandZetten(rasterId, bestanden.length + i, l.inBanner);
  bannerTellerBijwerken(tellerId, bestanden, links);
}







let linkToevoegenKlaar = null;
function openLinkToevoegen(klaar) {
  linkToevoegenKlaar = klaar;
  const veld = document.getElementById('linkToevoegenVeld');
  veld.value = '';
  linkToevoegenInvoer();
  document.getElementById('linkToevoegenModal').classList.add('visible');
  setTimeout(() => veld.focus(), 50);
}
function sluitLinkToevoegen() {
  linkToevoegenKlaar = null;
  document.getElementById('linkToevoegenModal').classList.remove('visible');
}



function metHttps(waarde) {
  const s = String(waarde || '').trim();
  return !s || /^https?:\/\//i.test(s) ? s : 'https://' + s;
}
function linkTeOpenen(url) {
  return !!safeUrl(url) && !/\s/.test(url) && /^https?:\/\/[^/]+\.[^/]+/i.test(url);
}
function linkToevoegenWaarde() {
  return metHttps(document.getElementById('linkToevoegenVeld').value);
}
function linkToevoegenInvoer() {
  const url = linkToevoegenWaarde();
  document.getElementById('linkToevoegenPlatform').textContent = url ? detectPlatform(url) : 'Link';
  document.getElementById('linkToevoegenKnop').disabled = !url;
}
function linkToevoegenOk() {
  const url = linkToevoegenWaarde();
  if (!url) return;
  if (!linkTeOpenen(url)) {
    showToast('Deze link kan niet geopend worden.');
    return;
  }
  const klaar = linkToevoegenKlaar;
  sluitLinkToevoegen();
  if (klaar) klaar(url);
}






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




async function mediaTegelTik(m) {
  if (!m || !m.url) return;
  if (m.type === 'foto' && m.inBanner) {
    const kader = await kiesUitsnede(m.url, 'banner', m.uitsnede);
    if (kader) m.uitsnede = kader;
    return;
  }
  if (m.type === 'foto') { openMediaLightbox(m.url); return; }
  openMediaSpeler(m.url, 'video', m.name || '', '');
}


function bannerKader(m) {
  return m && m.type === 'foto' && m.inBanner ? uitsnedeGeldig(m.uitsnede) : null;
}



function bannerAantal(bestanden, links) {
  return (bestanden || []).filter(m => m.inBanner).length + (links || []).filter(l => l.inBanner).length;
}

function bannerTellerBijwerken(elId, bestanden, links) {
  const el = document.getElementById(elId);
  if (el) el.innerHTML = bannerTellerHTML(bannerAantal(bestanden, links));
}























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













const WAZIG_ALGEMEEN = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAoHBwgHBgoICAgLCgoLDhgQDg0NDh0VFhEYIx8lJCIfIiEmKzcvJik0KSEiMEExNDk7Pj4+JS5ESUM8SDc9Pjv/2wBDAQoLCw4NDhwQEBw7KCIoOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozv/wAARCAAMABADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDmNO0qT7JM0Z2nsBWxBorJpgWRSWPtWNpurXUNoShXJbuKtXPiTUk+VZEwAP4a8WbqNtI9FcmjP//Z';
const WAZIG_VORM = /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/;

function wazigBron(src) {
  const s = String(src || '');
  if (s === 'afgeschermd') return WAZIG_ALGEMEEN;
  return s.length <= 2000 && WAZIG_VORM.test(s) ? s : null;
}
function wazigHTML(bron, klasse) {
  return `<img class="foto-wazig${klasse ? ' ' + klasse : ''}" src="${bron}" alt="" aria-hidden="true">`;
}



function fotoHTML(src, alt, klasse) {
  const w = wazigBron(src);
  if (w) return wazigHTML(w, klasse);
  const u = safeUrl(src);
  return u ? `<img${klasse ? ` class="${klasse}"` : ''} ${kleinFotoAttr(u)} alt="${escHtml(alt || '')}">` : '';
}



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




function wazigWaasZetten(img) {
  try {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 12;
    const x = c.getContext('2d');
    x.drawImage(img, 0, 0, 16, 12);
    const d = x.getImageData(0, 0, 16, 12).data;


    const k = (px, py, n) => d[(Math.min(11, Math.max(0, py)) * 16 + Math.min(15, Math.max(0, px))) * 4 + n];
    let licht = 0;
    for (let py = 0; py < 12; py++) for (let px = 0; px < 16; px++) for (let n = 0; n < 3; n++) {
      let som = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) som += k(px + dx, py + dy, n) * (2 - Math.abs(dx)) * (2 - Math.abs(dy));
      licht = Math.max(licht, som / 16);
    }
    const lum = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    let waas = 0.45;

    while (waas < 0.9 && 1.05 / (lum(licht * (1 - waas) + 13 * waas) + 0.05) < 6.1) waas += 0.01;
    img.parentNode.style.setProperty('--waas-vlak', waas.toFixed(2));
  } catch (e) { img.parentNode.style.setProperty('--waas-vlak', '0.65'); }
}





const SPEELTEKEN_HTML = '<span class="pb-speel" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/></svg></span>';





function hoesBronAttr(src) {
  return (fotoLinkSleutel(src) ? 'crossorigin="anonymous" ' : '') + fotoBronAttr(src);
}

const HOES_PIJL = r => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${r ? '<path d="m9 18 6-6-6-6"/>' : '<path d="m15 18-6-6 6-6"/>'}</svg>`;










function profielHoesHTML(o) {
  const items = profielBannerItems(o.media);



  const banner = items.some(it => it.afgeschermd) ? [] : items;



  const podium = !o.foto && !o.wazig && !banner.length;
  const voor = o.foto || o.wazig || podium ? 1 : 0;
  const n = banner.length + voor;
  const naam = escHtml(o.naam);

  const eerste = !voor ? '' : o.tik
    ? `<button type="button" class="hoes-vlak${o.foto ? '' : ' hoes-leeg'}" onclick="${o.tik}" aria-label="${naam} openen">` +
      (o.foto ? `<img class="hoes-img" ${hoesBronAttr(o.foto)} alt="${naam}">` : '<span class="hoes-bundel"></span>') + '</button>'
    : o.foto
    ? `<button type="button" class="hoes-vlak" onclick="openMediaLightbox('${jsAttr(o.foto)}')" aria-label="Foto van ${naam} groot bekijken">` +
      `<img class="hoes-img" ${hoesBronAttr(o.foto)} alt="${naam}"></button>`

    : o.wazig ? `<div class="hoes-vlak hoes-wazig" role="img" aria-label="Alleen zichtbaar met een account">${wazigHTML(o.wazig, 'hoes-img')}</div>`


    : `<div class="hoes-vlak hoes-leeg" role="img" aria-label="Nog geen foto"><span class="hoes-bundel"></span></div>`;



  const knop = podium && o.fotoToevoegen
    ? `<button type="button" class="btn btn-primary hoes-foto-knop" onclick="${o.fotoToevoegen}">Voeg een foto toe</button>` : '';

  const vlakken = banner.map((it, i) => {
    const url = it.veilig;
    const platform = it.platform || detectPlatform(url);
    const wat = `Beeld ${i + 1 + voor} van ${n}`;
    let binnen, tik;
    if (it.media_type === 'foto') {


      const k = uitsnedeGeldig(it.uitsnede);
      binnen = k
        ? `<img class="hoes-img hoes-kader" ${hoesBronAttr(url)} style="${uitsnedeStijl(k)}" data-kader="${k.x},${k.y},${k.b},${k.h}" alt="${wat}" loading="lazy">`
        : `<img class="hoes-img" ${hoesBronAttr(url)} alt="${wat}" loading="lazy">`;
      tik = `openMediaLightbox('${jsAttr(url)}')`;
    } else if (it.media_type === 'video') {



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


  const kaart = o.kaart ? ` data-kaart="${escHtml(JSON.stringify(o.kaart))}"` : '';
  return `<div class="hoes"${kaart}>
    <div class="hoes-beeld"><div class="hoes-spoor">${eerste}${vlakken}</div>${meer}${knop}</div>
    <div class="hoes-tekst"><div class="profile-name"${o.naamMax ? ` data-max="${Number(o.naamMax)}"` : ''}>${naam}</div><div class="profiel-regels">${o.regels}</div>${o.knoppen}</div>
  </div>`;
}

function hoesRustig() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}




const HOES_ANTRACIET = [82, 87, 95];
function hoesLum(r, g, b) {
  const a = [r, g, b].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}






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
  const d = x.getImageData(0, 43, 96, 28).data;
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

    donker: waas ? som / (d.length / 4) > 0.42 : w.p5 < z.p5,
    waas,

    sterk: 0.4 + 0.45 * Math.min(1, (mx - mn) / 0.8),
    canvas: c, beeld: m, sx, sy, sw, sh
  };
}






function hoesWaasMaken(vlak, o) {
  const c = document.createElement('canvas');
  c.width = 240; c.height = 180;
  c.getContext('2d').drawImage(o.beeld, o.sx, o.sy, o.sw, o.sh, 0, 0, 240, 180);


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


function hoesVlakMeten(vlak, klaar) {
  const m = vlak.querySelector('.hoes-img');

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


  m.addEventListener('error', () => {
    if (!m.hasAttribute('crossorigin')) return;
    m.removeAttribute('crossorigin');
    const src = m.getAttribute('src');
    if (src) { m.removeAttribute('src'); m.setAttribute('src', src); if (isVideo) m.load(); }
  });
  if (isVideo ? m.readyState >= 2 : (m.complete && m.naturalWidth)) meet();
}




function hoesStarten(root) {
  (root || document).querySelectorAll('.hoes').forEach(hoes => {
    const spoor = hoes.querySelector('.hoes-spoor');
    const vlakken = [...spoor.children];
    const stippen = [...hoes.querySelectorAll('.hoes-stip')];
    const vorige = hoes.querySelector('.hoes-pijl.vorige');
    const volgende = hoes.querySelector('.hoes-pijl.volgende');




    const knoppen = hoes.querySelector('.profiel-knoppen');
    const n = knoppen ? knoppen.children.length : 0;
    hoes.style.setProperty('--hoes-tekst-rechts', (n ? 36 * n + 6 : 16) + 'px');
    const zet = () => {
      const i = spoor.clientWidth ? Math.round(spoor.scrollLeft / spoor.clientWidth) : 0;
      stippen.forEach((s, j) => s.classList.toggle('aan', j === i));
      if (vorige) { vorige.hidden = i <= 0; volgende.hidden = i >= vlakken.length - 1; }

      hoes.classList.toggle('tekst-donker', !!vlakken[i] && vlakken[i].dataset.tekst === 'donker');
    };

    spoor.addEventListener('scroll', zet, { passive: true });
    const naar = r => spoor.scrollBy({ left: r * spoor.clientWidth, behavior: hoesRustig() ? 'auto' : 'smooth' });
    if (vorige) { vorige.onclick = () => naar(-1); volgende.onclick = () => naar(1); }
    vlakken.forEach(v => hoesVlakMeten(v, zet));
    zet();




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
  const y = Math.round((n.top + n.bottom) / 2 - b.top);
  const bron = Math.round(W * 0.07);
  const bundel = lx => `<polygon points="${lx - bron},-8 ${lx + bron},-8 ${x1},${y} ${x0},${y}"/>`;
  const geel = 'style="stop-color:var(--merk)"';
  const id = vak.dataset.id || (vak.dataset.id = 'hb' + (++hoesBundelTeller));
  vak.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><defs>` +
    `<filter id="${id}z" x="-.5" y="-.5" width="2" height="2"><feGaussianBlur stdDeviation="${Math.max(4, W / 60).toFixed(1)}"/></filter>` +
    `<linearGradient id="${id}l" x2="0" y2="1"><stop offset="0" ${geel} stop-opacity=".792"/><stop offset="1" ${geel} stop-opacity=".264"/></linearGradient></defs>` +
    `<g filter="url(#${id}z)" fill="url(#${id}l)">${bundel(Math.round(W * 0.06))}${bundel(Math.round(W * 0.94))}</g></svg>`;
}










const KAART_PX = 1080, KAART_HOES = 810, KAART_MARGE = 48;

const KAART_S = KAART_PX / 358;




const KAART_MATEN = { naam: 95, regel: 48, wat: 65, onder: 48, merk: 65 };

function kaartDoek(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  return [c, x];
}



function kaartVaag(bron, px) {
  const w = bron.width, h = bron.height;
  const n = Math.max(1, Math.round(Math.log2(px * 1.6)));
  let c = bron;
  for (let i = 0; i < n; i++) { const [d, y] = kaartDoek(c.width / 2, c.height / 2); y.drawImage(c, 0, 0, d.width, d.height); c = d; }
  for (let i = n - 1; i >= 0; i--) { const [d, y] = kaartDoek(w / 2 ** i, h / 2 ** i); y.drawImage(c, 0, 0, d.width, d.height); c = d; }
  return c;
}



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



const kaartBasis = (boven, f, lh) => boven + (lh * f - 1.21 * f) / 2 + 0.97 * f;


async function kaartMaken(g, beeld) {
  if (document.fonts) {
    await Promise.all(['900 40px Inter', '700 40px Inter', '400 40px Inter', '40px "TT Woordmerk"'].map(f => document.fonts.load(f)));
  }
  const M = KAART_MATEN, W = KAART_PX, H = KAART_HOES, S = KAART_S;


  const rol = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const K = { podium: rol('--podium'), wit: rol('--op-foto'), antraciet: rol('--op-foto-donker'),
              geel: rol('--merk'), opGeel: rol('--kaart-op-geel'), grijs: rol('--kaart-grijs') };
  const [c, x] = kaartDoek(W, W);
  x.fillStyle = K.podium;
  x.fillRect(0, 0, W, W);


  let n = M.naam;
  x.font = `900 ${n}px Inter`;
  const ruimte = W - 2 * KAART_MARGE;
  if (x.measureText(g.naam).width > ruimte) { n = Math.floor(n * ruimte / x.measureText(g.naam).width); x.font = `900 ${n}px Inter`; }
  const naamBreed = x.measureText(g.naam).width;


  const r = M.regel;
  const regelBoven = H - 24 * S - 1.5 * r;
  const naamBoven = regelBoven - 4 * S * r / 36 - 1.1 * n;
  const naamBasis = kaartBasis(naamBoven, n, 1.1);

  let kleur = K.wit;
  if (beeld) {
    const img = beeld.img;
    let o = null;
    try { o = hoesBeeldOordeel(img); } catch (e) { o = null; }
    const [h, hx] = kaartDoek(W, H);
    if (beeld.wazig) {

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

      for (const [px, van, tot] of [[1.5, 54, 64], [4, 58, 68], [8, 62, 72], [14, 66, 76], [24, 70, 80]]) {
        const laag = kaartVaag(h, px * S), lx = laag.getContext('2d');
        const m = lx.createLinearGradient(0, H * van / 100, 0, H * tot / 100);
        m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, '#000');
        lx.globalCompositeOperation = 'destination-in';
        lx.fillStyle = m; lx.fillRect(0, 0, W, H);
        x.drawImage(laag, 0, 0);
      }
    }

    const sterk = !o ? null : o.waas ? (o.donker ? o.sterk + 0.2 : o.sterk) : 0;
    const tint = !o ? [0, 0, 0] : o.donker ? [255, 255, 255] : [0, 0, 0];
    const stops = !o ? [[54, 0], [61, 0.1], [67, 0.3], [73, 0.6], [80, 0.85]]
      : [[54, 0], [61, 0.12 * sterk], [67, 0.35 * sterk], [73, 0.7 * sterk], [80, sterk]];
    if (!o || sterk) {
      const t = x.createLinearGradient(0, 0, 0, H);
      stops.forEach(([p, a]) => t.addColorStop(p / 100, `rgba(${tint.join(',')},${a})`));
      x.fillStyle = t; x.fillRect(0, 0, W, H);
    }
    if (o && o.donker) kleur = K.antraciet;
  } else {


    const x0 = KAART_MARGE - 8 * S, x1 = KAART_MARGE + naamBreed + 8 * S;
    const ym = naamBasis - 0.365 * n;
    const bron = W * 0.07;
    const [b, bx] = kaartDoek(W, H);
    for (const lx of [W * 0.06, W * 0.94]) {
      const v = bx.createLinearGradient(0, -8, 0, ym);
      v.addColorStop(0, 'rgba(255,184,28,.792)'); v.addColorStop(1, 'rgba(255,184,28,.264)');
      bx.fillStyle = v;
      bx.beginPath(); bx.moveTo(lx - bron, -8); bx.lineTo(lx + bron, -8); bx.lineTo(x1, ym); bx.lineTo(x0, ym); bx.closePath(); bx.fill();
    }
    x.drawImage(kaartVaag(b, Math.max(4, W / 60)), 0, 0);
  }

  x.fillStyle = kleur;
  x.font = `900 ${n}px Inter`;
  x.fillText(g.naam, KAART_MARGE, naamBasis);
  x.font = `400 ${r}px Inter`;
  x.fillText(g.regel, KAART_MARGE, kaartBasis(regelBoven, r, 1.5));


  const vlakMidden = (H + W) / 2;
  x.font = `${M.merk}px "TT Woordmerk"`;
  const tussen = M.merk * 2 / 28;
  const wT = x.measureText('TALENT').width, wN = x.measureText('TENT').width;
  const mm = x.measureText('TALENTTENT');
  const merkBasis = vlakMidden + (mm.actualBoundingBoxAscent - mm.actualBoundingBoxDescent) / 2;
  const merkX = W - KAART_MARGE - wT - tussen - wN;
  x.fillStyle = K.wit; x.fillText('TALENT', merkX, merkBasis);
  x.fillStyle = K.geel; x.fillText('TENT', merkX + wT + tussen, merkBasis);



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
    x.font = `700 ${wat.f}px Inter`; x.fillStyle = K.wit;
    x.fillText(wat.tekst, KAART_MARGE, kaartBasis(boven, wat.f, 1.25));
    boven += hWat + tussenRegels;
  }
  if (onder.tekst && zoekt) {
    x.font = `700 ${onder.f}px Inter`;
    const pw = x.measureText(onder.tekst).width + 2 * padX;
    x.fillStyle = K.geel;
    const rr = hOnder / 2;
    x.beginPath(); x.arc(KAART_MARGE + rr, boven + rr, rr, Math.PI / 2, Math.PI * 1.5); x.arc(KAART_MARGE + pw - rr, boven + rr, rr, -Math.PI / 2, Math.PI / 2); x.closePath(); x.fill();
    x.fillStyle = K.opGeel;
    x.fillText(onder.tekst, KAART_MARGE + padX, kaartBasis(boven + padY, onder.f, 1.25));
  } else if (onder.tekst) {
    x.font = `400 ${onder.f}px Inter`; x.fillStyle = K.grijs;
    x.fillText(onder.tekst, KAART_MARGE, kaartBasis(boven, onder.f, 1.3));
  }
  return c;
}












const STANDEN = [
  { waarde: 'actief', label: 'Actief', uitleg: { muzikant: 'zichtbaar en uit te nodigen', band: 'zichtbaar' } },
  { waarde: 'tijdelijk', label: 'Tijdelijk niet beschikbaar', uitleg: { muzikant: 'zichtbaar, even geen uitnodigingen', band: 'zichtbaar, maar even niet actief' } },
  { waarde: 'inactief', label: 'Inactief', uitleg: { muzikant: 'onzichtbaar', band: 'onzichtbaar' } }
];
const STAND_KOP = { muzikant: 'Ben je vindbaar voor anderen?', band: 'Is jullie band vindbaar?' };






function standMeldingHTML(stand) {
  const st = STANDEN.find(x => x.waarde === stand && x.waarde !== 'actief');
  return st ? `<div class="melding melding-beschikbaar melding-stand"><p class="melding-tekst"><strong>${escHtml(st.label)}.</strong></p></div>` : '';
}
























const UITSNEDE_MAX_PX = 1080;
const UITSNEDE_MAX_ZOOM = 4;
let uitsnede = null;

const UITSNEDE_ZIN = {
  rond: 'Jij met je instrument valt het meest op.',
  vierkant: 'Jullie samen op een foto vallen het meest op.',
  banner: 'Schuif en zoom tot de foto goed staat.',
};
function kiesUitsnede(bron, vorm, kader) {
  return new Promise((klaar) => {
    if (uitsnede) uitsnedeAfsluiten(null);
    const modal = document.getElementById('uitsnedeModal');
    const vlak = document.getElementById('uitsnedeVlak');
    const img = document.getElementById('uitsnedeImg');
    const isBestand = typeof bron !== 'string';
    const url = isBestand ? URL.createObjectURL(bron) : bron;
    uitsnede = { img, url, eigenUrl: isBestand, vlak, vorm, file: isBestand ? bron : null,
      schaal0: 1, zoom: 1, x: 0, y: 0, klaar, wijzers: new Map(), start: uitsnedeGeldig(kader) };
    document.getElementById('uitsnedeTitel').textContent =
      vorm === 'rond' ? 'Profielfoto' : vorm === 'banner' ? 'Bannerfoto' : 'Bandfoto';


    modal.querySelector('.uitsnede-hint').textContent = UITSNEDE_ZIN[vorm];
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




function uitsnedeMaten() {
  const W = uitsnede.vlak.clientWidth;
  return { W, H: W * 3 / 4 };
}




function uitsnedeBegin() {
  const u = uitsnede, m = uitsnedeMaten();
  const nw = u.img.naturalWidth, nh = u.img.naturalHeight;
  u.schaal0 = Math.max(m.W / nw, m.H / nh);
  u.zoom = 1;
  u.x = (m.W - nw * u.schaal0) / 2;
  u.y = nh / nw > m.H / m.W ? 0 : (m.H - nh * u.schaal0) / 2;
  if (u.start) {
    const s = m.W / (u.start.b * nw);
    u.zoom = s / u.schaal0;
    u.x = -u.start.x * nw * s;
    u.y = -u.start.y * nh * s;
  }
  uitsnedeTekenen();
}


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

    const oud = voor[0];
    u.x += p.x - oud.x;
    u.y += p.y - oud.y;
    uitsnedeTekenen();
  } else if (na.length >= 2) {

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



function uitsnedeGebruiken() {
  const u = uitsnede;
  if (!u || !u.img.naturalWidth) return;
  const m = uitsnedeMaten();
  const s = u.schaal0 * u.zoom;
  const bw = m.W / s, bh = m.H / s;
  const nw = u.img.naturalWidth, nh = u.img.naturalHeight;
  const r = v => Math.max(0, Math.round(v * 10000) / 10000);
  const kader = { x: r(-u.x / s / nw), y: r(-u.y / s / nh), b: r(bw / nw), h: r(bh / nh) };
  if (u.vorm === 'banner') {
    uitsnedeAfsluiten(kader);
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
    const bestand = blob ? new File([blob], naam, { type: 'image/jpeg' }) : null;
    if (bestand) bestand.kader = kader;
    uitsnedeAfsluiten(bestand);
    if (!blob) showToast('De foto uitsnijden is niet gelukt. Probeer het opnieuw.');
  }, 'image/jpeg', 0.9);
}


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


window.addEventListener('resize', () => {
  if (!uitsnede || !uitsnede.img.naturalWidth) return;
  const u = uitsnede, m = uitsnedeMaten();
  const oud = u.schaal0;
  u.schaal0 = Math.max(m.W / u.img.naturalWidth, m.H / u.img.naturalHeight);
  u.x *= u.schaal0 / oud; u.y *= u.schaal0 / oud;
  uitsnedeTekenen();
});




function uitsnedeGeldig(k) {
  if (!k || typeof k !== 'object') return null;
  const x = Number(k.x), y = Number(k.y), b = Number(k.b), h = Number(k.h);
  if (![x, y, b, h].every(Number.isFinite)) return null;
  if (x < 0 || y < 0 || b <= 0 || h <= 0 || x + b > 1.001 || y + h > 1.001) return null;
  return { x, y, b, h };
}







async function fotoVerschuiven(foto, vorm) {
  const bron = foto.bron || foto.url;
  const bestand = typeof bron === 'string' ? await fotoBestandOphalen(bron) : bron;
  if (!bestand) { showToast('De foto openen is niet gelukt. Probeer het opnieuw.'); return null; }
  const file = await kiesUitsnede(bestand, vorm, foto.bron ? foto.kader : null);
  return file ? { file, kader: file.kader, bron } : null;
}

async function fotoBestandOphalen(link) {
  try {
    const m = FOTO_AFGESCHERMD.exec(String(link || ''));
    if (!m) throw new Error('geen link naar de opslag');
    const pad = decodeURIComponent(m[2]);
    const { data, error } = await db.storage.from(m[1]).download(pad);
    if (error) throw error;
    return new File([data], pad.split('/').pop(), { type: data.type || 'image/jpeg' });
  } catch (e) {
    logCaught('fotoBestandOphalen', e);
    return null;
  }
}


async function fotoMetBronUploaden(uit, map) {
  const [a, b] = await Promise.all([uploadAvatarFile(uit.file, map),
    typeof uit.bron === 'string' ? { url: uit.bron } : uploadAvatarFile(uit.bron, map)]);
  return { url: a.url, bron: b.url, kader: uitsnedeGeldig(uit.kader) };
}




function uitsnedeStijl(k) {
  const p = v => (Math.round(v * 1000) / 1000) + '%';
  return `width:${p(100 / k.b)};height:${p(100 / k.h)};left:${p(-k.x / k.b * 100)};top:${p(-k.y / k.h * 100)}`;
}
