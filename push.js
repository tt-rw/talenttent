// ═══════════════════════════════════════════════════════════════════════
// TT-452 (09-10-2026): het seintje op het toestel (web push).
// Besluit Ronald: alleen een pulserende stip in de browser; de stip gaat uit
// zodra de app opent; in de app zelf alleen het getal op Berichten (TT-451).
//
// Wat hier staat: de service worker aanmelden, toestemming vragen, een
// abonnement bewaren of verwijderen, en een seintje dat al klaarstaat weghalen
// zodra de app opent. Het versturen doet de Edge Function send-digest, met
// dezelfde ontvangers en frequentie als de mail (mail uit = geen seintje).
// Toestemming vragen we nooit bij het eerste bezoek, alleen nadat iemand zijn
// eerste bericht van Talent Tent heeft geopend (zie ttSeintjeVraagTonen).
// ═══════════════════════════════════════════════════════════════════════

// Publieke sleutel (VAPID). De geheime helft staat alleen in Supabase.
const TT_VAPID_PUBLIEK = 'BFApFRovtQOzmV3xHpAtBD4RHOfda01LNBBNIoPxAHuobdPVc7oK_3PqRdtLYh5yUMGtT_D-rBwKQDrI7MUId-A';
const TT_SEINTJE_TAG = 'tt-seintje';
const TT_SEINTJE_NIET_NU = 'tt_seintje_niet_nu';

// Dun laagje om de browser-API, zodat de tests het kunnen vervangen.
const ttPushApi = {
  beschikbaar() {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
  },
  toestemming() { return Notification.permission; },
  vraagToestemming() { return Notification.requestPermission(); },
  async registratie() { return navigator.serviceWorker.ready; },
  async abonnement() { return (await this.registratie()).pushManager.getSubscription(); },
  async abonneer() {
    const reg = await this.registratie();
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: ttBase64UrlNaarBytes(TT_VAPID_PUBLIEK),
    });
  },
  async meldingen() { return (await this.registratie()).getNotifications({ tag: TT_SEINTJE_TAG }); },
};

function ttBase64UrlNaarBytes(s) {
  const b64 = (s + '='.repeat((4 - s.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
function ttBytesNaarBase64Url(buf) {
  let s = '';
  new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Meld de service worker aan. Vraagt nergens om toestemming. Een fout hier
// mag de app niet raken: zonder service worker is er alleen geen seintje.
async function ttServiceWorkerAanmelden() {
  if (!ttPushApi.beschikbaar()) return false;
  try {
    await navigator.serviceWorker.register('sw.js');
    return true;
  } catch (e) {
    logCaught('ttServiceWorkerAanmelden', e);
    return false;
  }
}

// Staat het seintje voor dit toestel aan? Aan = toestemming gegeven én een
// abonnement. Een geweigerde toestemming geeft 'geblokkeerd', zodat het scherm
// kan zeggen dat dit in de browser moet worden aangepast.
async function ttSeintjeStand() {
  if (!ttPushApi.beschikbaar()) return 'nietBeschikbaar';
  const t = ttPushApi.toestemming();
  if (t === 'denied') return 'geblokkeerd';
  if (t !== 'granted') return 'uit';
  try { return (await ttPushApi.abonnement()) ? 'aan' : 'uit'; }
  catch (e) { logCaught('ttSeintjeStand', e); return 'uit'; }
}

// Zet het seintje aan voor dit toestel. Geeft 'aan', 'geblokkeerd' of 'fout'.
async function ttSeintjeAanzetten() {
  if (!ttPushApi.beschikbaar()) return 'fout';
  try {
    if (ttPushApi.toestemming() !== 'granted') {
      const uitslag = await ttPushApi.vraagToestemming();
      if (uitslag !== 'granted') return uitslag === 'denied' ? 'geblokkeerd' : 'uit';
    }
    await ttServiceWorkerAanmelden();
    const sub = (await ttPushApi.abonnement()) || await ttPushApi.abonneer();
    const j = sub.toJSON ? sub.toJSON() : {};
    const p256dh = (j.keys && j.keys.p256dh) || ttBytesNaarBase64Url(sub.getKey('p256dh'));
    const auth = (j.keys && j.keys.auth) || ttBytesNaarBase64Url(sub.getKey('auth'));
    const { error } = await db.rpc('tt_push_abonneren', {
      p_endpoint: sub.endpoint, p_p256dh: p256dh, p_auth: auth,
    });
    if (error) throw error;
    return 'aan';
  } catch (e) {
    logCaught('ttSeintjeAanzetten', e);
    return 'fout';
  }
}

// Zet het seintje uit voor dit toestel: abonnement bij ons weg en in de browser.
async function ttSeintjeUitzetten() {
  if (!ttPushApi.beschikbaar()) return true;
  try {
    const sub = await ttPushApi.abonnement();
    if (sub) {
      const { error } = await db.rpc('tt_push_uitzetten', { p_endpoint: sub.endpoint });
      if (error) throw error;
      await sub.unsubscribe();
    }
    return true;
  } catch (e) {
    logCaught('ttSeintjeUitzetten', e);
    return false;
  }
}

// Haal een seintje weg dat al klaarstaat. De stip gaat dan uit (besluit
// Ronald). Aangeroepen bij het opstarten en zodra de app weer zichtbaar wordt.
async function ttSeintjeWeghalen() {
  // De stip op het icoon, waar de browser dat kent, gaat altijd uit.
  try { if (navigator.clearAppBadge) await navigator.clearAppBadge(); } catch (e) { /* geen stip om weg te halen */ }
  if (!ttPushApi.beschikbaar() || ttPushApi.toestemming() !== 'granted') return;
  try {
    (await ttPushApi.meldingen()).forEach(m => m.close());
  } catch (e) { /* zonder service worker is er niets weg te halen */ }
}

// De vraag in het gesprek van Talent Tent: alleen als het kan, nog niet is
// beantwoord en niet is weggeklikt. Nooit bij het eerste bezoek.
async function ttSeintjeVraagTonen() {
  if ((await ttSeintjeStand()) !== 'uit') return false;
  try { if (localStorage.getItem(TT_SEINTJE_NIET_NU)) return false; } catch (e) { /* geen opslag: dan wel vragen */ }
  return true;
}

function ttSeintjeVraagHTML() {
  return '<div class="message-bubble other tt-bericht tt-seintje-vraag" id="ttSeintjeVraag">' +
    '<div class="tt-bericht-kop">Wil je een seintje op dit toestel bij nieuwe matches?</div>' +
    '<p class="tt-seintje-tekst">Een stil seintje met een stip op het icoon. Zet je het later uit, dan kan dat in Instellingen.</p>' +
    '<div class="tt-seintje-knoppen">' +
      '<button type="button" class="btn btn-primary" onclick="ttSeintjeVraagAan()">Zet aan</button>' +
      '<button type="button" class="btn btn-ghost" onclick="ttSeintjeVraagNietNu()">Niet nu</button>' +
    '</div></div>';
}

async function ttSeintjeVraagAan() {
  const uitslag = await ttSeintjeAanzetten();
  const vraag = document.getElementById('ttSeintjeVraag');
  if (vraag) vraag.remove();
  if (uitslag === 'aan') showToast('Je krijgt een seintje bij nieuwe matches');
  else if (uitslag === 'geblokkeerd') showToast('Meldingen staan in je browser uit. Zet ze daar aan en probeer het opnieuw.');
  else if (uitslag === 'fout') showToast(friendlyErrorMessage(null, 'het seintje aanzetten'));
}
function ttSeintjeVraagNietNu() {
  try { localStorage.setItem(TT_SEINTJE_NIET_NU, '1'); } catch (e) { /* geen opslag: dan vraagt hij later weer */ }
  const vraag = document.getElementById('ttSeintjeVraag');
  if (vraag) vraag.remove();
}

// Instellingen → het blok "Seintje op dit toestel".
async function vulPushInInstellingen() {
  const blok = document.getElementById('pushBlok');
  const tekst = document.getElementById('pushTekst');
  const knop = document.getElementById('pushKnop');
  if (!blok || !tekst || !knop) return;
  const stand = await ttSeintjeStand();
  blok.style.display = stand === 'nietBeschikbaar' ? 'none' : '';
  if (stand === 'aan') {
    tekst.textContent = 'Aan. Je krijgt een stil seintje met een stip op het icoon bij nieuwe matches.';
    knop.textContent = 'Zet uit'; knop.style.display = ''; knop.onclick = pushSchakelen;
  } else if (stand === 'geblokkeerd') {
    tekst.textContent = 'Meldingen staan in je browser uit. Zet ze daar aan om een seintje te krijgen.';
    knop.style.display = 'none';
  } else if (stand === 'uit') {
    tekst.textContent = 'Uit. Zet aan voor een stil seintje met een stip op het icoon bij nieuwe matches.';
    knop.textContent = 'Zet aan'; knop.style.display = ''; knop.onclick = pushSchakelen;
  }
}
async function pushSchakelen() {
  const stand = await ttSeintjeStand();
  if (stand === 'aan') {
    const ok = await ttSeintjeUitzetten();
    showToast(ok ? 'Het seintje staat uit' : friendlyErrorMessage(null, 'het seintje uitzetten'));
  } else {
    const uitslag = await ttSeintjeAanzetten();
    if (uitslag === 'aan') showToast('Je krijgt een seintje bij nieuwe matches');
    else if (uitslag === 'geblokkeerd') showToast('Meldingen staan in je browser uit. Zet ze daar aan en probeer het opnieuw.');
    else if (uitslag === 'fout') showToast(friendlyErrorMessage(null, 'het seintje aanzetten'));
  }
  vulPushInInstellingen();
}

// Opstarten: service worker aanmelden en een klaarstaand seintje weghalen.
ttServiceWorkerAanmelden();
ttSeintjeWeghalen();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') ttSeintjeWeghalen();
});
