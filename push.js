













const TT_VAPID_PUBLIEK = 'BFApFRovtQOzmV3xHpAtBD4RHOfda01LNBBNIoPxAHuobdPVc7oK_3PqRdtLYh5yUMGtT_D-rBwKQDrI7MUId-A';
const TT_SEINTJE_TAG = 'tt-seintje';
const TT_SEINTJE_NIET_NU = 'tt_seintje_niet_nu';


const ttPushApi = {
  beschikbaar() {
    return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      && typeof window !== 'undefined' && 'PushManager' in window && 'Notification' in window;
  },
  toestemming() { return Notification.permission; },
  vraagToestemming() { return Notification.requestPermission(); },


  async registratie() {
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise(klaar => setTimeout(() => klaar(null), 2000)),
    ]);
  },
  async abonnement() {
    const reg = await this.registratie();
    return reg ? reg.pushManager.getSubscription() : null;
  },
  async abonneer() {
    const reg = await this.registratie();
    if (!reg) throw new Error('Geen service worker');
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: ttBase64UrlNaarBytes(TT_VAPID_PUBLIEK),
    });
  },
  async meldingen() {
    const reg = await this.registratie();
    return reg ? reg.getNotifications({ tag: TT_SEINTJE_TAG }) : [];
  },
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



async function ttServiceWorkerAanmelden() {
  if (!ttPushApi.beschikbaar()) return false;
  try {
    await navigator.serviceWorker.register('sw.js');
    return true;
  } catch (e) {





    if (!(e && (e.name === 'SecurityError' || e.name === 'InvalidStateError' || e.message === 'Rejected'))) logCaught('ttServiceWorkerAanmelden', e);
    return false;
  }
}




async function ttSeintjeStand() {
  if (!ttPushApi.beschikbaar()) return 'nietBeschikbaar';
  const t = ttPushApi.toestemming();
  if (t === 'denied') return 'geblokkeerd';
  if (t !== 'granted') return 'uit';
  try { return (await ttPushApi.abonnement()) ? 'aan' : 'uit'; }
  catch (e) { logCaught('ttSeintjeStand', e); return 'uit'; }
}


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


async function ttSeintjeUitzetten() {

  if (!ttPushApi.beschikbaar() || ttPushApi.toestemming() !== 'granted') return true;
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



async function ttSeintjeWeghalen() {

  try { if (navigator.clearAppBadge) await navigator.clearAppBadge(); } catch (e) { }
  if (!ttPushApi.beschikbaar() || ttPushApi.toestemming() !== 'granted') return;
  try {
    (await ttPushApi.meldingen()).forEach(m => m.close());
  } catch (e) { }
}



async function ttSeintjeVraagTonen() {
  if ((await ttSeintjeStand()) !== 'uit') return false;
  try { if (localStorage.getItem(TT_SEINTJE_NIET_NU)) return false; } catch (e) { }
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
  ttToestelMelden();
}
function ttSeintjeVraagNietNu() {
  try { localStorage.setItem(TT_SEINTJE_NIET_NU, '1'); } catch (e) { }
  const vraag = document.getElementById('ttSeintjeVraag');
  if (vraag) vraag.remove();
}





async function vulPushInInstellingen() {
  const blok = document.getElementById('pushBlok');
  const tekst = document.getElementById('pushTekst');
  if (!blok || !tekst) return;
  const stand = await ttSeintjeStand();
  blok.style.display = stand === 'nietBeschikbaar' ? 'none' : '';
  document.querySelectorAll('#pushControl .segmented-btn').forEach(k =>
    k.classList.toggle('selected', k.dataset.mode === (stand === 'aan' ? 'aan' : 'uit')));
  tekst.textContent = stand === 'geblokkeerd'
    ? 'Meldingen staan uit in je browser. Zet ze aan in de instellingen van je browser, bij Meldingen.'
    : 'Een stil seintje met een stip op het icoon, bij nieuwe matches. Daarvoor moeten meldingen ook in je browser aanstaan.';
}
async function pushSchakelen(aan) {
  const stand = await ttSeintjeStand();
  if (aan === (stand === 'aan')) return;
  if (!aan) {
    const ok = await ttSeintjeUitzetten();
    if (!ok) showToast(friendlyErrorMessage(null, 'het seintje uitzetten'));
  } else {
    const uitslag = await ttSeintjeAanzetten();
    if (uitslag === 'geblokkeerd') showToast('Meldingen staan uit in je browser. Zet ze daar aan en probeer het opnieuw.');
    else if (uitslag === 'fout') showToast(friendlyErrorMessage(null, 'het seintje aanzetten'));
  }
  vulPushInInstellingen();
  ttToestelMelden();
}









function ttToestelPlatform() {
  const ua = navigator.userAgent || '';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iphone';
  if (/Android/.test(ua)) return 'android';
  return 'computer';
}
function ttVanafBeginscherm() {
  try {
    return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  } catch (e) { return false; }
}




async function ttToestelMelden() {
  try {
    let toestemming = 'kan_niet';
    let endpoint = null;
    if (ttPushApi.beschikbaar()) {
      const t = ttPushApi.toestemming();
      toestemming = t === 'granted' ? 'gegeven' : t === 'denied' ? 'geweigerd' : 'nog_niet';
      if (t === 'granted') {
        const sub = await ttPushApi.abonnement();
        endpoint = sub ? sub.endpoint : null;
      }
    }
    const { error } = await db.rpc('tt_toestel_melden', {
      p_platform: ttToestelPlatform(),
      p_beginscherm: ttVanafBeginscherm(),
      p_toestemming: toestemming,
      p_endpoint: endpoint,
    });
    if (error) logCaught('ttToestelMelden', error);
  } catch (e) {
    logCaught('ttToestelMelden', e);
  }
}


ttServiceWorkerAanmelden();
ttSeintjeWeghalen();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') ttSeintjeWeghalen();
});




pushSchakelen = slotOm(pushSchakelen);
