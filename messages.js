

let activeConversationId = null;







const TT_GESPREK_ID = 'talent-tent';
const TT_GESPREK_NAAM = 'TalentTent';


const TT_AVATAR_HTML = '<span class="avatar-t avatar-logo">T</span>';
let activeConversationSysteem = false;
let ttBerichtenFoutGelogd = false;



const TT_TEKSTEN = {
  kernzinEenMatch: 'Er is 1 nieuwe match bij jou in de buurt.',
  kernzinMatches: 'Er zijn {aantal} nieuwe matches bij jou in de buurt.',
  meer: 'En nog {aantal} andere — bekijk ze in Zoeken',
  bandZoekt: 'zoekt: {instrument}',

  oproepUitnodiging: '{naam} nodigt je uit om kennis te maken.',
};








let pendingMessageRecipient = null;







let gesprekVanuit = null;
let inboxOverslaan = false;
let gesprekVia = '';

function openMessageComposer(recipientId, recipientName, bandNaam) {



  gesprekVia = bandNaam || '';
  if (huidigeView !== 'messages') {
    gesprekVanuit = huidigeView;
    inboxOverslaan = true;
    try { showView('messages', 'behoud'); } finally { inboxOverslaan = false; }
  } else {
    gesprekVanuit = null;
  }

  openConversation(recipientId, recipientName, null, false, false);

  (async () => {
    try {
      const { data } = await db.from('musicians').select('avatar_url').eq('id', recipientId);
      const url = data && data[0] && safeUrl(data[0].avatar_url);
      if (url && activeConversationId === recipientId) {
        document.getElementById('messagesThreadAvatar').innerHTML =
          `<img ${kleinFotoAttr(url)} alt="${escHtml(recipientName)}">`;
      }
    } catch (e) { logCaught('openMessageComposer', e); }
  })();


}










function openRowMessageIcon(event, id, displayName) {
  event.stopPropagation();
  if (hasOwnProfile && currentUser) {
    openMessageComposer(id, displayName);
  } else {
    pendingMessageRecipient = { id, displayName };
    openProfielScherm(id);
  }
}


async function insertMessage(recipientId, body) {
  const mid = await getMyMusicianId();
  if (!mid) { showToast('Maak eerst een profiel aan om berichten te sturen.'); return false; }


  const wacht = await emailWachtOpBevestiging();
  if (wacht) { showToast(emailBevestigMelding(wacht, 'berichten sturen')); return false; }
  const text = (body || '').trim();
  if (!text) { showToast('Vul een bericht in.'); return false; }
  try {
    const { error } = await db.from('messages').insert({
      sender_id: mid, recipient_id: recipientId, body: text
    });
    if (error) throw error;
    return true;
  } catch (e) {



    if (e && (e.code === '42501' || /row-level security/i.test(e.message || ''))) {
      showToast('Deze persoon kan geen berichten ontvangen.');
      return false;
    }


    if (/^Wacht op antwoord/i.test((e && e.message) || '')) {
      showToast('Wacht op antwoord.');
      return false;
    }
    logCaught('insertMessage', e);
    showToast(friendlyErrorMessage(e, 'je bericht versturen'));
    return false;
  }
}









async function stilBericht(ontvangerId, tekst) {
  const mid = await getMyMusicianId();
  const body = String(tekst || '').trim();
  if (!mid || !ontvangerId || ontvangerId === mid || !body) return false;
  try {
    const { error } = await db.from('messages').insert({ sender_id: mid, recipient_id: ontvangerId, body });
    if (error) throw error;
    return true;
  } catch (e) {
    const tekstFout = (e && e.message) || '';
    const verwacht = e && (e.code === '42501' || /row-level security|^Wacht op antwoord/i.test(tekstFout) || e.hint === 'TT-336');
    if (!verwacht) logCaught('stilBericht', e);
    return false;
  }
}






const BERICHTGRENS = 10;
const BERICHTGRENS_UUR = 24;

function wachtOpAntwoord(verstuurd, ontvangen, nu) {


  const laatsteAntwoord = Math.max(0, ...(ontvangen || []).map(m => new Date(m.created_at).getTime()));
  const vanaf = Math.max(laatsteAntwoord, (nu || Date.now()) - BERICHTGRENS_UUR * 3600 * 1000);
  return (verstuurd || []).filter(m => new Date(m.created_at).getTime() > vanaf).length >= BERICHTGRENS;
}

function zetWachtOpAntwoord(aan) {
  const input = document.getElementById('messagesReplyInput');
  const knop = document.querySelector('#messagesThreadPanel .messages-send-btn');
  if (!input) return;
  if (!input.dataset.standaard) input.dataset.standaard = input.getAttribute('placeholder') || '';
  input.disabled = !!aan;
  input.setAttribute('placeholder', aan ? 'Wacht op antwoord' : input.dataset.standaard);
  if (knop) knop.disabled = !!aan;

  if (aan) { input.value = ''; berichtInvoerBijwerken(); }
}






function berichtInvoerBijwerken() {
  updateCharCounter('messagesReplyInput', 'messagesReplyCounter', 2000);
  const el = document.getElementById('messagesReplyInput');
  if (!el) return;


  const doc = document.documentElement;
  const onderaan = window.innerHeight + window.scrollY >= doc.scrollHeight - 2;

  const groei = veldGroeit(el);
  if (onderaan && groei > 0) window.scrollBy(0, groei);
}

async function sendReplyInThread() {
  if (!activeConversationId || activeConversationSysteem) return;




  if (activeConversationDeleted) { showToast('Dit account bestaat niet meer. Je kunt dit gesprek niet voortzetten.'); return; }
  const input = document.getElementById('messagesReplyInput');
  const tekst = input.value;
  if (!tekst.trim()) { showToast('Vul een bericht in.'); return; }





  const draad = document.getElementById('messagesThreadList');
  const vanaf = input.getBoundingClientRect();
  const tijd = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });



  if (!draad.querySelector('.message-bubble')) draad.innerHTML = '';
  const scheidingen = draad.querySelectorAll('.messages-day-divider');
  const laatsteScheiding = scheidingen[scheidingen.length - 1];
  const nieuw = [];
  if (!laatsteScheiding || laatsteScheiding.textContent !== 'Vandaag') {
    const sch = document.createElement('div');
    sch.className = 'messages-day-divider';
    sch.textContent = 'Vandaag';
    draad.appendChild(sch);
    nieuw.push(sch);
  }
  const voorlopig = document.createElement('div');
  voorlopig.className = 'message-bubble own';
  voorlopig.innerHTML = escHtml(tekst).replace(/\n/g, '<br>') + `<div class="message-bubble-time">${escHtml(tijd)}</div>`;
  draad.appendChild(voorlopig);
  nieuw.push(voorlopig);
  input.value = '';
  berichtInvoerBijwerken();
  scrollThreadToBottom();
  vliegBericht(voorlopig, vanaf);

  const ok = await insertMessage(activeConversationId, tekst);
  if (ok) {


    if (gesprekVanuit) { showToast('Bericht verstuurd'); appTerug(); return; }
    openConversation(activeConversationId, document.getElementById('messagesThreadName').textContent, undefined, true);
  } else {


    nieuw.forEach(el => el.remove());
    input.value = tekst;
    berichtInvoerBijwerken();
  }
}






function vliegBericht(el, vanaf) {
  if (!el.animate || !magBewegen() || !vanaf || !vanaf.width) return;
  const doel = el.getBoundingClientRect();
  const dx = vanaf.left + 12 - doel.left;
  const dy = vanaf.top + (vanaf.height - doel.height) / 2 - doel.top;
  el.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(.92)`, transformOrigin: '100% 100%', opacity: .6 },
    { transform: 'none', transformOrigin: '100% 100%', opacity: 1 }
  ], { duration: 300, easing: 'cubic-bezier(.2, .8, .2, 1)' });
}



function dagLabel(d) {
  const dag = d.toDateString();
  const gisteren = new Date(); gisteren.setDate(gisteren.getDate() - 1);
  if (dag === new Date().toDateString()) return 'Vandaag';
  if (dag === gisteren.toDateString()) return 'Gisteren';


  return d.toLocaleDateString('nl-NL', anderJaar(d) ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'long' });
}

function anderJaar(d) {
  return d.getFullYear() !== new Date().getFullYear();
}




function scrollThreadToBottom() {
  const draad = document.getElementById('messagesThreadList');
  if (!draad) return;




  if (!draad.lastElementChild) return;
  onderbalkHoogteZetten();
  window.scrollTo(0, document.documentElement.scrollHeight);





  const kop = document.querySelector('#messagesThreadPanel .messages-thread-header');
  const voet = document.querySelector('#messagesThreadPanel .messages-thread-footer');
  if (!kop || !voet) return;
  const kopOnder = (parseFloat(getComputedStyle(kop).top) || 0) + kop.offsetHeight + 16;

  const onderbalk = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--onderbalk-hoogte')) || 0;
  if (draad.offsetHeight + voet.offsetHeight + onderbalk > window.innerHeight - kopOnder) return;
  const teVeel = draad.getBoundingClientRect().top - kopOnder;
  if (teVeel < 0) window.scrollBy(0, teVeel);
}



async function refreshUnreadBadge() {

  const badges = ['unreadBadgeBottom']
    .map(id => document.getElementById(id)).filter(Boolean);
  if (!badges.length) return;
  const toon = (tekst) => badges.forEach(b => {
    if (tekst == null) { b.style.display = 'none'; }
    else { b.textContent = tekst; b.style.display = 'inline-block'; }
  });
  const mid = await getMyMusicianId();
  if (!mid) { toon(null); return; }
  try {





    const [{ data, error }, ttOngelezen] = await Promise.all([
      db.rpc('tt_inbox'),
      ttOngelezenTellen(),
    ]);
    if (error) throw error;

    const count = (data || []).filter(r => !blokkeerIkZelf(r.ander_id))
      .reduce((som, r) => som + (r.ongelezen || 0), 0) + ttOngelezen;
    if (count > 0) { toon(count > 99 ? '99+' : String(count)); }
    else { toon(null); }
  } catch (e) {
    logCaught('refreshUnreadBadge', e);

  }
}


async function loadInbox(opties) {
  const listEl = document.getElementById('messagesInboxList');
  document.getElementById('messagesInboxPanel').style.display = 'block';
  document.getElementById('messagesThreadPanel').style.display = 'none';

  if (!(opties && opties.behoud && currentUser && listEl.dataset.klaar === currentUser.id)) {
    delete listEl.dataset.klaar;
    ladenTonen(listEl);
  }

  const mid = await getMyMusicianId();

  if (!mid && myMusicianIdFout) {
    listEl.innerHTML = foutStaatHTML(myMusicianIdFout, 'je berichten laden', 'loadInbox()');
    return;
  }
  if (!mid) {


    listEl.innerHTML = emptyStateHTML(
      'Nog geen profiel',
      'Maak je muzikantprofiel aan om berichten te sturen en te ontvangen.',
      'Profiel aanmaken',
      "showView('register')"
    );
    return;
  }

  try {






    const [inboxRes, , ttBerichten] = await Promise.all([
      db.rpc('tt_inbox'),
      laadVerborgenGesprekken(true),
      laadTalentTentBerichten(),
    ]);
    if (inboxRes.error) throw inboxRes.error;



    const data = (inboxRes.data || []).filter(r => !blokkeerIkZelf(r.ander_id));

    if (!data.length && !ttBerichten.length) {


      listEl.innerHTML = emptyStateHTML(
        'Nog geen berichten',
        'Zoek een muzikant en stuur het eerste bericht.',
        'Muzikanten zoeken',
        "openZoekMuzikanten()"
      );
      return;
    }


    const conversations = new Map();
    data.forEach(r => {
      conversations.set(r.ander_id, { otherId: r.ander_id, unreadCount: r.ongelezen || 0,
        lastMessage: { sender_id: r.laatste_van_mij ? mid : r.ander_id, body: r.laatste_tekst || '', created_at: r.laatste_op } });
    });

    const otherIds = Array.from(conversations.keys());


    const { data: musiciansData, error: namenFout } = otherIds.length
      ? await inDelen(otherIds, deel => db.from('musicians').select('id, weergavenaam, username, avatar_url').in('id', deel))
      : { data: [], error: null };
    if (namenFout) throw namenFout;
    const infoById = {};
    (musiciansData || []).forEach(m => { infoById[m.id] = m; });

    const rijen = Array.from(conversations.values()).map(c => {
      const info = infoById[c.otherId];



      const name = info ? displayNameOf(info) : 'Verwijderde gebruiker';
      const avatarSrc = info ? safeUrl(info.avatar_url) : null;
      const avatarHTML = avatarSrc ? `<img ${kleinFotoAttr(avatarSrc)} alt="${escHtml(name)}">` : ZONDER_FOTO_HTML;
      const isOwn = c.lastMessage.sender_id === mid;
      const previewPrefix = isOwn ? 'Jij: ' : '';
      const preview = c.lastMessage.body.length > 50 ? c.lastMessage.body.slice(0, 50) + '…' : c.lastMessage.body;
      const time = relativeMessageTime(c.lastMessage.created_at);
      return { t: new Date(c.lastMessage.created_at).getTime(), html: `
        <div class="messages-conv-row ${c.unreadCount ? 'unread' : ''}" onclick="openConversation('${jsAttr(c.otherId)}','${jsAttr(name)}','${jsAttr(avatarSrc)}', false, ${!info})">
          <div class="messages-conv-avatar">${avatarHTML}</div>
          <div class="messages-conv-main">
            <div class="messages-conv-name">${escHtml(name)}${c.unreadCount ? ` <span class="unread-badge">${c.unreadCount}</span>` : ''}</div>
            <div class="messages-conv-preview">${escHtml(previewPrefix + preview)}</div>
          </div>
          <div class="messages-conv-time">${escHtml(time)}</div>
        </div>` };
    });

    if (ttBerichten.length) {

      const ttLaatste = ttBerichten[0];
      const ttInfo = ttLaatste.inhoud && ttLaatste.inhoud.soort ? await talentTentInfoOphalen([ttLaatste]) : null;
      rijen.push({ t: new Date(ttLaatste.created_at).getTime(), html: talentTentRijHTML(ttBerichten, ttInfo) });
    }
    listEl.innerHTML = rijen.sort((a, b) => b.t - a.t).map(r => r.html).join('');
    if (currentUser) listEl.dataset.klaar = currentUser.id;
  } catch (e) {
    delete listEl.dataset.klaar;
    logCaught('loadInbox', e);
    listEl.innerHTML = foutStaatHTML(e, 'je berichten laden', 'loadInbox()');
  }
}





function relativeMessageTime(iso) {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Nu';
  if (diffMin < 60) return `${diffMin} min`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24 && d.getDate() === new Date().getDate()) return `${diffHr} u`;
  const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Gisteren';
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) return d.toLocaleDateString('nl-NL', { weekday: 'short' });

  return d.toLocaleDateString('nl-NL', anderJaar(d) ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
}






let activeConversationDeleted = false;






async function openConversation(otherId, otherName, otherAvatarSrc, stil, deleted) {
  if (!otherId) return;
  activeConversationId = otherId;
  if (!stil) zetWachtOpAntwoord(false);
  zetSysteemGesprek(false);
  werkTerugKnopBij();
  if (deleted !== undefined) activeConversationDeleted = deleted;
  const composerEl = document.querySelector('#messagesThreadPanel .messages-composer-row');
  const noticeEl = document.getElementById('messagesDeletedNotice');
  if (composerEl) composerEl.style.display = activeConversationDeleted ? 'none' : 'flex';
  document.getElementById('messagesThreadPanel').classList.toggle('thread-verwijderd', activeConversationDeleted);
  document.getElementById('messagesThreadPanel').classList.add('gesprek-open');
  if (noticeEl) noticeEl.style.display = activeConversationDeleted ? 'block' : 'none';
  document.getElementById('messagesThreadName').textContent = otherName;


  zetVeiligheidMenu('messagesThreadActies', 'gesprek',
    activeConversationDeleted ? null : otherId, otherName, otherId);


  if (otherAvatarSrc !== undefined) {
    const avatarEl = document.getElementById('messagesThreadAvatar');
    avatarEl.innerHTML = otherAvatarSrc ? `<img ${kleinFotoAttr(safeUrl(otherAvatarSrc))} alt="${escHtml(otherName)}">` : ZONDER_FOTO_HTML;
  }
  document.getElementById('messagesInboxPanel').style.display = 'none';
  document.getElementById('messagesThreadPanel').style.display = 'flex';







  safeHistoryReplace(history.state, '#messages/' + encodeURIComponent(otherId));
  if (!stil) {
    document.getElementById('messagesReplyInput').value = '';
    berichtInvoerBijwerken();
  }
  const threadEl = document.getElementById('messagesThreadList');


  if (!stil) ladenTonen(threadEl);

  const mid = await getMyMusicianId();
  if (!mid) {

    if (myMusicianIdFout) threadEl.innerHTML = foutStaatHTML(myMusicianIdFout, 'het gesprek laden',
      `openConversation('${jsAttr(otherId)}', '${jsAttr(otherName)}', '${jsAttr(otherAvatarSrc || '')}' || null, false, ${!!deleted})`);
    else closeConversation();
    return;
  }

  try {




    const aantal = stil && gesprek.id === otherId ? Math.max(GESPREK_PAGINA, gesprek.berichten.length) : GESPREK_PAGINA;
    const [deel, verborgen] = await Promise.all([gesprekDeelOphalen(mid, otherId, null, aantal), laadVerborgenGesprekken()]);


    if (activeConversationId === otherId) zetWachtOpAntwoord(wachtOpAntwoord(deel.verstuurd, deel.ontvangen));
    const stuk = gesprekStuk(deel, verborgen, otherId, aantal);
    if (activeConversationId !== otherId) return;
    gesprek = { id: otherId, mid, berichten: stuk.berichten, meer: stuk.meer, bezig: false };
    const data = gesprek.berichten;
    const nieuweInhoud = gesprekHTML(data, mid, otherName);




    if (!stil || threadEl.innerHTML !== nieuweInhoud) threadEl.innerHTML = nieuweInhoud;
    scrollThreadToBottom();
    gesprekEerderControleren();





    if (data.some(m => m.recipient_id === mid && !m.read_at)) {
      db.from('messages').update({ read_at: new Date().toISOString() })
        .eq('sender_id', otherId).eq('recipient_id', mid).is('read_at', null)
        .then(({ error }) => { if (error) logCaught('openConversation-gelezen', error); refreshUnreadBadge(); },
              e => logCaught('openConversation-gelezen', e));
    }

  } catch (e) {
    logCaught('openConversation', e);
    threadEl.innerHTML = foutStaatHTML(e, 'het gesprek laden',
      `openConversation('${jsAttr(otherId)}', '${jsAttr(otherName)}', '${jsAttr(otherAvatarSrc || '')}' || null, true, ${!!deleted})`);
  }
}



const GESPREK_PAGINA = 50;
let gesprek = { id: null, mid: null, berichten: [], meer: false, bezig: false };




async function gesprekDeelOphalen(mid, otherId, tot, aantal) {
  const kant = (van, aan) => {
    let q = db.from('messages').select('id, sender_id, recipient_id, body, created_at, read_at, oproep_id')
      .eq('sender_id', van).eq('recipient_id', aan);
    if (tot) q = q.lte('created_at', tot);
    return q.order('created_at', { ascending: false }).limit(aantal);
  };
  const [verstuurd, ontvangen] = await Promise.all([kant(mid, otherId), kant(otherId, mid)]);
  if (verstuurd.error) throw verstuurd.error;
  if (ontvangen.error) throw ontvangen.error;
  return { verstuurd: verstuurd.data || [], ontvangen: ontvangen.data || [] };
}




function gesprekStuk(deel, verborgen, otherId, aantal, alWeg) {
  const weg = alWeg || new Set();
  const alles = [...deel.verstuurd, ...deel.ontvangen].filter(m => !weg.has(m.id))
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const zichtbaar = alles.filter(m => !gesprekVerborgenTot(verborgen, otherId, m.created_at));
  const meer = zichtbaar.length === alles.length
    && (alles.length > aantal || deel.verstuurd.length === aantal || deel.ontvangen.length === aantal);
  return { berichten: zichtbaar.slice(0, aantal).reverse(), meer };
}




function gesprekHTML(data, mid, otherName) {
  let lastDay = null;
  const boven = gesprek.meer ? '<div class="berichten-eerder" role="status" aria-label="Eerdere berichten laden"><div class="save-spinner"></div></div>' : '';
  const oproep = (data || []).map(m => m.oproep_id).filter(Boolean).pop();
  const kaart = oproep ? `<div class="gesprek-oproep" data-oproep="${escHtml(oproep)}"></div>` : '';
  if (oproep) setTimeout(() => pbKaartjeVullen(oproep), 0);
  return boven + kaart + (data && data.length ? data.map(msg => {
    const own = msg.sender_id === mid;
    const msgDate = new Date(msg.created_at);
    const dayStr = msgDate.toDateString();
    let divider = '';
    if (dayStr !== lastDay) {
      lastDay = dayStr;
      divider = `<div class="messages-day-divider">${escHtml(dagLabel(msgDate))}</div>`;
    }
    const time = msgDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });






    const readCheck = (own && msg.read_at) ? `<span class="message-bubble-read" title="Gelezen">✓</span>` : '';
    return `${divider}<div class="message-bubble ${own ? 'own' : 'other'}">${escHtml(msg.body).replace(/\n/g, '<br>')}<div class="message-bubble-time">${escHtml(time)}${readCheck}</div></div>`;
  }).join('') : emptyStateHTML(



    `Stuur ${otherName} een eerste bericht`,
    gesprekVia ? `${otherName} is de contactpersoon van ${gesprekVia}.` : ''
  ));
}




function gesprekEerderControleren() {
  if (!gesprek.meer || gesprek.bezig || !activeConversationId || activeConversationId !== gesprek.id || activeConversationSysteem) return;
  if (!gesprekInBeeld()) return;
  if (Date.now() < (gesprek.pauzeTot || 0)) return;
  const bubbels = document.querySelectorAll('#messagesThreadList .message-bubble');
  if (!bubbels.length) return;
  const twintigste = bubbels[Math.min(19, bubbels.length - 1)];
  if (twintigste.getBoundingClientRect().bottom > 0) gesprekEerderLaden();
}



async function gesprekEerderLaden() {
  const g = gesprek;
  if (!g.meer || g.bezig || !g.berichten.length) return;
  g.bezig = true;
  const otherId = g.id;
  try {
    const oudste = g.berichten[0].created_at;
    const [deel, verborgen] = await Promise.all([
      gesprekDeelOphalen(g.mid, otherId, oudste, GESPREK_PAGINA), laadVerborgenGesprekken()]);
    if (gesprek !== g || activeConversationId !== otherId || !gesprekInBeeld()) return;
    const stuk = gesprekStuk(deel, verborgen, otherId, GESPREK_PAGINA, new Set(g.berichten.map(m => m.id)));
    g.berichten = stuk.berichten.concat(g.berichten);
    g.meer = stuk.meer;
    const doc = document.documentElement;
    const vanOnder = doc.scrollHeight - window.scrollY;
    document.getElementById('messagesThreadList').innerHTML = gesprekHTML(g.berichten, g.mid,
      document.getElementById('messagesThreadName').textContent);
    window.scrollTo(0, doc.scrollHeight - vanOnder);
  } catch (e) {


    g.pauzeTot = Date.now() + 5000;
    if (!g.foutGemeld) {
      g.foutGemeld = true;
      logCaught('gesprekEerderLaden', e);
      showToast(friendlyErrorMessage(e, 'eerdere berichten laden').replace(/\s*Wat je invulde blijft staan\.$/, ''));
    }
  } finally {
    g.bezig = false;
  }
}
function gesprekInBeeld() {
  const paneel = document.getElementById('messagesThreadPanel');
  return huidigeView === 'messages' && !!paneel && paneel.style.display === 'flex';
}
window.addEventListener('scroll', gesprekEerderControleren, { passive: true });









let verborgenVraag = null;
function laadVerborgenGesprekken(vers) {
  if (vers || !verborgenVraag || (currentUser && verborgenVraag.user !== currentUser.id)) {
    const vraag = { user: currentUser && currentUser.id };
    vraag.p = (async () => {
      try {
        const { data, error } = await db.from('gesprek_verborgen').select('ander_id, verborgen_op');
        if (error) throw error;
        const kaart = {};
        (data || []).forEach(r => { kaart[r.ander_id] = r.verborgen_op; });
        return kaart;
      } catch (e) {
        logCaught('laadVerborgenGesprekken', e);
        if (verborgenVraag === vraag) verborgenVraag = null;
        return {};
      }
    })();
    verborgenVraag = vraag;
  }
  return verborgenVraag.p;
}

function gesprekVerborgenTot(verborgen, otherId, createdAt) {
  const tot = verborgen && verborgen[otherId];
  return !!tot && new Date(createdAt) <= new Date(tot);
}

function gesprekVerwijderen(otherId, naam) {
  const wie = naam || 'de ander';
  const houdt = activeConversationDeleted ? '' : ` ${wie} houdt het.`;
  showConfirm(
    `Gesprek met ${wie} verwijderen? Het verdwijnt alleen bij jou.${houdt}`,
    () => gesprekVerwijderenUitvoeren(otherId),
    'Verwijderen',
    true, null, null, null,
    'Ik begrijp dat het gesprek bij mij definitief verdwijnt.'
  );
}

async function gesprekVerwijderenUitvoeren(otherId) {
  try {
    const { error } = await db.rpc('tt_gesprek_verbergen', { ander: otherId });
    if (error) throw error;
  } catch (e) {
    logCaught('gesprekVerwijderen', e);
    showToast(friendlyErrorMessage(e, 'het gesprek verwijderen'));
    return;
  }
  verborgenVraag = null;
  if (activeConversationId === otherId) closeConversation(); else loadInbox();
  refreshUnreadBadge();
  showToast('Gesprek verwijderd.');
}










async function laadTalentTentBerichten() {
  try {
    const { data, error } = await db.from('talent_tent_berichten')
      .select('id, inhoud, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return (data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (e) {

    if (!ttBerichtenFoutGelogd) { ttBerichtenFoutGelogd = true; logCaught('laadTalentTentBerichten', e); }
    return [];
  }
}

async function ttOngelezenTellen() {
  try {
    const { data, error } = await db.from('talent_tent_berichten').select('id').is('read_at', null);
    if (error) throw error;
    return (data || []).length;
  } catch (e) {
    if (!ttBerichtenFoutGelogd) { ttBerichtenFoutGelogd = true; logCaught('ttOngelezenTellen', e); }
    return 0;
  }
}



function zetSysteemGesprek(aan) {
  activeConversationSysteem = !!aan;
  const paneel = document.getElementById('messagesThreadPanel');
  if (paneel) paneel.classList.toggle('thread-systeem', !!aan);
}

function talentTentKernzin(inhoud, info) {
  if (inhoud && inhoud.soort) return pbTtKernzin(inhoud, info || null);
  const aantal = ((inhoud && inhoud.muzikanten) || []).length + ((inhoud && inhoud.bands) || []).length + (Number(inhoud && inhoud.meer) || 0);
  return aantal === 1 ? TT_TEKSTEN.kernzinEenMatch : TT_TEKSTEN.kernzinMatches.replace('{aantal}', aantal);
}

function talentTentRijHTML(berichten, info) {
  const laatste = berichten[0];
  const ongelezen = berichten.filter(b => !b.read_at).length;
  return `
    <div class="messages-conv-row ${ongelezen ? 'unread' : ''}" onclick="openTalentTentGesprek()">
      <div class="messages-conv-avatar">${TT_AVATAR_HTML}</div>
      <div class="messages-conv-main">
        <div class="messages-conv-name">${escHtml(TT_GESPREK_NAAM)}${ongelezen ? ` <span class="unread-badge">${ongelezen}</span>` : ''}</div>
        <div class="messages-conv-preview">${escHtml(talentTentKernzin(laatste.inhoud, info))}</div>
      </div>
      <div class="messages-conv-time">${escHtml(relativeMessageTime(laatste.created_at))}</div>
    </div>`;
}



async function talentTentInfoOphalen(berichten) {
  const mIds = new Set(), bIds = new Set();
  berichten.forEach(b => {
    ((b.inhoud && b.inhoud.muzikanten) || []).forEach(m => mIds.add(m.id));
    ((b.inhoud && b.inhoud.bands) || []).forEach(x => bIds.add(x.id));
    const o = b.inhoud || {};
    [o.plaatser, o.wie].filter(Boolean).forEach(id => mIds.add(id));
    if (o.band) bIds.add(o.band);
    (o.oproepen || []).forEach(x => { if (x.plaatser) mIds.add(x.plaatser); if (x.band) bIds.add(x.band); });
  });
  const info = { muzikanten: {}, bands: {} };
  try {
    if (mIds.size) {
      const { data, error } = await db.from('musicians').select('id, weergavenaam, username, city, avatar_url').in('id', Array.from(mIds));
      if (error) throw error;
      (data || []).forEach(m => { info.muzikanten[m.id] = m; });
    }
    if (bIds.size) {
      const { data, error } = await db.rpc('tt_get_bands_public', { ids: Array.from(bIds) });
      if (error) throw error;
      (data || []).forEach(b => { info.bands[b.id] = b; });
    }
  } catch (e) {
    logCaught('talentTentInfoOphalen', e);
  }
  return info;
}




function talentTentBerichtHTML(bericht, info) {
  const inh = bericht.inhoud || {};
  if (inh.soort) return pbTtBerichtHTML(bericht, info);
  const muz = (inh.muzikanten || []).filter(m => info.muzikanten[m.id] && !isGeblokkeerd(m.id));
  const bnd = (inh.bands || []).filter(b => info.bands[b.id]);
  if (!muz.length && !bnd.length) return '';
  const meer = Number(inh.meer) || 0;
  const kernzin = talentTentKernzin({ muzikanten: muz, bands: bnd, meer });
  const rijen = muz.map(m => {
    const mi = info.muzikanten[m.id];
    const naam = displayNameOf(mi);
    const regel1 = [mi.city, afstandTekst(m.km)].filter(Boolean).join(' · ');
    const regel2 = (m.instrumenten || []).join(' · ');
    return `<button type="button" class="bb-rij bb-rij-knop" onclick="openProfielScherm('${jsAttr(m.id)}')" aria-label="Profiel van ${escHtml(naam)}">${bbFotoHTML(mi.avatar_url)}<span class="bb-tekst"><span class="bb-naam">${escHtml(naam)}</span>${regel1 ? `<span class="bb-sub">${escHtml(regel1)}</span>` : ''}${regel2 ? `<span class="bb-sub">${escHtml(regel2)}</span>` : ''}</span></button>`;
  }).concat(bnd.map(b => {
    const bi = info.bands[b.id];
    const foto = safeUrl(bi.avatar_url);
    const beeld = foto
      ? `<img class="bb-foto bb-foto-vierkant" ${kleinFotoAttr(foto)} alt="">`
      : `<span class="bb-foto bb-foto-leeg bb-foto-vierkant" aria-hidden="true">${ZONDER_FOTO_HTML}</span>`;
    const regel1 = [bi.city, afstandTekst(b.km)].filter(Boolean).join(' · ');
    const regel2 = (b.zoekt || []).map(i => TT_TEKSTEN.bandZoekt.replace('{instrument}', i)).join(' · ');
    return `<button type="button" class="bb-rij bb-rij-knop" onclick="openBandScherm('${jsAttr(b.id)}')" aria-label="Band ${escHtml(bi.name)}">${beeld}<span class="bb-tekst"><span class="bb-naam">${escHtml(bi.name)}</span>${regel1 ? `<span class="bb-sub">${escHtml(regel1)}</span>` : ''}${regel2 ? `<span class="bb-sub">${escHtml(regel2)}</span>` : ''}</span></button>`;
  }));
  const tijd = new Date(bericht.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const meerHTML = meer
    ? `<button type="button" class="tt-meer" onclick="openZoekMuzikanten()">${escHtml(TT_TEKSTEN.meer.replace('{aantal}', meer))}</button>`
    : '';
  return `<div class="message-bubble other tt-bericht"><div class="tt-bericht-kop">${escHtml(kernzin)}</div>${rijen.join('')}${meerHTML}<div class="message-bubble-time">${escHtml(tijd)}</div></div>`;
}

async function openTalentTentGesprek(stil) {
  activeConversationId = TT_GESPREK_ID;
  zetSysteemGesprek(true);
  activeConversationDeleted = false;
  gesprekVia = '';
  werkTerugKnopBij();
  const paneel = document.getElementById('messagesThreadPanel');
  paneel.classList.remove('thread-verwijderd');
  paneel.classList.add('gesprek-open');
  document.getElementById('messagesThreadName').textContent = TT_GESPREK_NAAM;
  document.getElementById('messagesThreadAvatar').innerHTML = TT_AVATAR_HTML;
  zetVeiligheidMenu('messagesThreadActies', 'gesprek', null, '');
  document.getElementById('messagesInboxPanel').style.display = 'none';
  paneel.style.display = 'flex';
  safeHistoryReplace(history.state, '#messages/' + TT_GESPREK_ID);
  const threadEl = document.getElementById('messagesThreadList');
  if (!stil) ladenTonen(threadEl);
  try {
    const berichten = (await laadTalentTentBerichten()).slice().reverse();
    const info = await talentTentInfoOphalen(berichten);
    if (activeConversationId !== TT_GESPREK_ID) return;
    let laatsteDag = null;
    const html = berichten.map(b => {
      const inhoud = talentTentBerichtHTML(b, info);
      if (!inhoud) return '';
      const d = new Date(b.created_at);
      const dag = d.toDateString();
      const scheiding = dag !== laatsteDag ? `<div class="messages-day-divider">${escHtml(dagLabel(d))}</div>` : '';
      laatsteDag = dag;
      return scheiding + inhoud;
    }).join('');
    threadEl.innerHTML = html || emptyStateHTML(
      'Nog geen berichten van TalentTent',
      'Nieuwe matches bij jou in de buurt staan hier.',
      'Muzikanten zoeken',
      "openZoekMuzikanten()"
    );


    if (html && await ttSeintjeVraagTonen()) threadEl.insertAdjacentHTML('beforeend', ttSeintjeVraagHTML());

    const ongelezen = berichten.filter(b => !b.read_at).map(b => b.id);
    if (ongelezen.length) {
      const { error } = await db.from('talent_tent_berichten').update({ read_at: new Date().toISOString() }).in('id', ongelezen);
      if (error) logCaught('openTalentTentGesprek/gelezen', error);
      refreshUnreadBadge();
    }
    scrollThreadToBottom();
  } catch (e) {
    logCaught('openTalentTentGesprek', e);
    threadEl.innerHTML = foutStaatHTML(e, 'de berichten van TalentTent laden', 'openTalentTentGesprek(true)');
  }
}

function closeConversation(stil) {
  zetVeiligheidMenu('messagesThreadActies', 'gesprek', null, '');
  activeConversationId = null;
  zetSysteemGesprek(false);
  gesprekVia = '';
  activeConversationDeleted = false;
  if (huidigeView === 'messages') safeHistoryReplace(history.state, '#messages');
  document.getElementById('messagesInboxPanel').style.display = 'block';
  document.getElementById('messagesThreadPanel').style.display = 'none';
  document.getElementById('messagesThreadPanel').classList.remove('gesprek-open');
  werkTerugKnopBij();
  window.scrollTo({ top: 0, behavior: 'instant' });
  if (!stil) loadInbox();
}



async function heropenGesprek(otherId) {
  if (otherId === TT_GESPREK_ID) { openTalentTentGesprek(); return; }
  try {
    const { data, error } = await db.from('musicians')
      .select('id, weergavenaam, username, avatar_url').eq('id', otherId);
    if (error) throw error;
    const info = (data || [])[0];
    const name = info ? displayNameOf(info) : 'Verwijderde gebruiker';
    const avatarSrc = info ? safeUrl(info.avatar_url) : null;
    openConversation(otherId, name, avatarSrc, false, !info);
  } catch (e) {
    logCaught('heropenGesprek', e);
  }
}



function openThreadProfile() {
  if (!activeConversationId || activeConversationDeleted || activeConversationSysteem) return;
  openProfielScherm(activeConversationId);
}
















const berichtRecht = { gebruiker: null, mijnLeeftijd: undefined, leeftijden: {}, timer: null, bezig: false };


function berichtRechtVanNu() {
  if (berichtRecht.gebruiker === currentUser.id) return;
  berichtRecht.gebruiker = currentUser.id;
  berichtRecht.mijnLeeftijd = undefined;
  berichtRecht.leeftijden = {};
}



function berichtRechtLeeftijden(ids, rijen) {
  if (!currentUser) return;
  berichtRechtVanNu();
  ids.forEach(id => { if (!(id in berichtRecht.leeftijden)) berichtRecht.leeftijden[id] = null; });
  (rijen || []).forEach(r => { berichtRecht.leeftijden[r.id] = r.age; });
}

async function berichtRechtMijnLeeftijd() {
  if (!currentUser) return null;
  berichtRechtVanNu();
  if (berichtRecht.mijnLeeftijd !== undefined) return berichtRecht.mijnLeeftijd;
  const { data, error } = await db.rpc('tt_get_my_birth_date');
  if (error) throw error;
  berichtRecht.mijnLeeftijd = data ? calcAgeFromISO(data) : null;
  return berichtRecht.mijnLeeftijd;
}

async function berichtRechtVerwerk() {
  if (berichtRecht.bezig) { berichtRechtPlan(); return; }
  const knoppen = Array.from(document.querySelectorAll('[data-bericht-id]:not([data-bericht-ok])'));
  if (!knoppen.length) return;
  berichtRecht.bezig = true;
  const vrij = () => knoppen.forEach(el => el.setAttribute('data-bericht-ok', '1'));
  try {
    const mijn = await berichtRechtMijnLeeftijd();
    if (mijn === null || mijn < 19) { vrij(); return; }
    const ids = Array.from(new Set(knoppen.map(el => el.getAttribute('data-bericht-id'))));
    const onbekend = ids.filter(id => !(id in berichtRecht.leeftijden));
    if (onbekend.length) {
      const { data, error } = await db.rpc('tt_musicians_ages', { ids: onbekend });
      if (error) throw error;
      onbekend.forEach(id => { berichtRecht.leeftijden[id] = null; });
      (data || []).forEach(r => { berichtRecht.leeftijden[r.id] = r.age; });
    }

    const onder16 = ids.filter(id => berichtRecht.leeftijden[id] === null || berichtRecht.leeftijden[id] < 16);
    let schreef = new Set();
    if (onder16.length) {
      const mid = await getMyMusicianId();
      const { data, error } = await db.from('messages').select('sender_id')
        .eq('recipient_id', mid).in('sender_id', onder16);
      if (error) throw error;
      schreef = new Set((data || []).map(r => r.sender_id));
    }
    knoppen.forEach(el => {
      const id = el.getAttribute('data-bericht-id');
      if (onder16.includes(id) && !schreef.has(id)) el.style.display = 'none';
      el.setAttribute('data-bericht-ok', '1');
    });
  } catch (e) {
    vrij();
  } finally {
    berichtRecht.bezig = false;
  }
}

function berichtRechtPlan() {
  clearTimeout(berichtRecht.timer);
  berichtRecht.timer = setTimeout(berichtRechtVerwerk, 30);
}

(function berichtRechtStarten() {
  if (typeof MutationObserver === 'undefined' || !document.body) return;
  new MutationObserver(berichtRechtPlan).observe(document.body, { childList: true, subtree: true });
  berichtRechtPlan();
})();
