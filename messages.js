// ─── Berichten (TT-01) ───────────────────────────────────────────────────────

let messageComposerRecipientId = null;
let activeConversationId = null; // musician-id van de open gespreksdraad

// TT-32 (07-08-2026): als iemand op het chat-icoon klikt zonder ingelogd te
// zijn (of nog geen eigen profiel heeft), onthouden we wie ze wilden
// berichten — zodat we ze na het inloggen/profiel-aanmaken direct naar de
// composer kunnen sturen i.p.v. naar Mijn Profiel (Ronald: "kan je de
// intelligentie toevoegen aan de chat-knop?"). Alleen gebruikt door
// onUserLoggedIn() (bestaand account, inloggen) en showSaveSuccess() (gloed-
// nieuw account, na de volledige wizard) — nooit voor een gewone profielklik.
let pendingMessageRecipient = null;

function openMessageComposer(recipientId, recipientName) {
  messageComposerRecipientId = recipientId;
  document.getElementById('messageComposerRecipientName').textContent = recipientName;
  document.getElementById('messageComposerBody').value = '';
  updateCharCounter('messageComposerBody', 'messageComposerCounter', 2000);
  document.getElementById('musicianModal').classList.remove('visible');
  // V-13 (13-08-2026): "Stuur een bericht aan deze band" opent dezelfde
  // composer vanuit het bandprofiel — dat modal moet dan ook dicht.
  const bandModalEl = document.getElementById('bandModal');
  if (bandModalEl) bandModalEl.classList.remove('visible');
  document.getElementById('messageModal').classList.add('visible');
  setTimeout(() => document.getElementById('messageComposerBody').focus(), 50);
}

// TT-31 (07-08-2026): het chat-icoon op de resultatenrij/-kaart moet direct
// naar de composer gaan — geen tussenstop bij het profiel waar je nogmaals
// op "Stuur een bericht" moet klikken (Ronald: "niet naar een tussenscherm
// waar ik nogmaals op een knop moet drukken"). event.stopPropagation()
// voorkomt dat de klik ook nog de rij/kaart zelf (openMusicianModal) triggert.
// Zonder eigen profiel is er niks om vanaf te versturen — dan alsnog naar
// het profiel-tussenscherm, dat vraagt om in te loggen/een profiel te maken;
// pendingMessageRecipient (TT-32) zorgt dat we na die stap alsnog hier
// terechtkomen zonder dat iemand opnieuw hoeft te klikken.
function openRowMessageIcon(event, id, displayName) {
  event.stopPropagation();
  if (hasOwnProfile && currentUser) {
    openMessageComposer(id, displayName);
  } else {
    pendingMessageRecipient = { id, displayName };
    openMusicianModal(id);
  }
}

function closeMessageComposer() {
  document.getElementById('messageModal').classList.remove('visible');
  messageComposerRecipientId = null;
}

// Gedeelde insert, gebruikt door zowel de composer (nieuw contact) als de
// gespreksdraad (reageren op een bestaand gesprek).
async function insertMessage(recipientId, body) {
  const mid = await getMyMusicianId();
  if (!mid) { showToast('Maak eerst een profiel aan om berichten te sturen.'); return false; }
  const text = (body || '').trim();
  if (!text) { showToast('Vul een bericht in.'); return false; }
  try {
    const { error } = await db.from('messages').insert({
      sender_id: mid, recipient_id: recipientId, body: text
    });
    if (error) throw error;
    return true;
  } catch (e) {
    logCaught('insertMessage', e);
    showToast(friendlyErrorMessage(e));
    return false;
  }
}

async function sendMessageFromComposer() {
  if (!messageComposerRecipientId) return;
  const body = document.getElementById('messageComposerBody').value;
  const ok = await insertMessage(messageComposerRecipientId, body);
  if (ok) {
    closeMessageComposer();
    showToast('Bericht verstuurd');
  }
}

async function sendReplyInThread() {
  if (!activeConversationId) return;
  // V-04 (13-08-2026): defensieve check naast het verborgen invoerveld — het
  // veld verdwijnt bij een verwijderd account, maar een verouderd scherm
  // (bijv. al open vóórdat het account werd verwijderd) mag toch nooit
  // alsnog een bericht kunnen versturen. Zelfde patroon als TT-56.
  if (activeConversationDeleted) { showToast('Dit account bestaat niet meer. Je kunt dit gesprek niet voortzetten.'); return; }
  const input = document.getElementById('messagesReplyInput');
  const tekst = input.value;
  if (!tekst.trim()) { showToast('Vul een bericht in.'); return; }

  // V-02 (12-08-2026): het eigen bericht verscheen pas nadat het hele gesprek
  // opnieuw was opgehaald — twee databasevragen, een "Laden..."-melding en
  // een toetsenbord dat wegviel. Nu staat het bericht er meteen; de
  // verversing gebeurt daarna, zonder melding.
  const draad = document.getElementById('messagesThreadList');
  const tijd = new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const voorlopig = document.createElement('div');
  voorlopig.className = 'message-bubble own';
  voorlopig.innerHTML = escHtml(tekst).replace(/\n/g, '<br>') + `<div class="message-bubble-time">${escHtml(tijd)}</div>`;
  draad.appendChild(voorlopig);
  input.value = '';
  updateCharCounter('messagesReplyInput', 'messagesReplyCounter', 2000);
  scrollThreadToBottom();

  const ok = await insertMessage(activeConversationId, tekst);
  if (ok) {
    openConversation(activeConversationId, document.getElementById('messagesThreadName').textContent, undefined, undefined, true);
  } else {
    // Mislukt: het voorlopige bericht weer weghalen en de tekst teruggeven,
    // zodat niemand denkt dat het verstuurd is.
    voorlopig.remove();
    input.value = tekst;
    updateCharCounter('messagesReplyInput', 'messagesReplyCounter', 2000);
  }
}

// V-01 (12-08-2026): een gesprek opende bovenaan. Bij twintig berichten zag je
// het bericht van drie weken geleden. Elke chat-app springt naar het laatste
// bericht.
function scrollThreadToBottom() {
  const draad = document.getElementById('messagesThreadList');
  if (!draad) return;
  const laatste = draad.lastElementChild;
  if (laatste && laatste.scrollIntoView) laatste.scrollIntoView({ block: 'end' });
}

// Ongelezen-badge op de "Berichten"-navigatieknop, bijgewerkt na inloggen,
// bij het openen van een gesprek (leest dat gesprek), en na versturen.
async function refreshUnreadBadge() {
  // TT-U24: de badge staat op twee plekken — de bovenste balk (brede
  // schermen) en de onderbalk (telefoon). Beide worden hier bijgewerkt.
  const badges = ['unreadBadge', 'unreadBadgeBottom']
    .map(id => document.getElementById(id)).filter(Boolean);
  if (!badges.length) return;
  const toon = (tekst) => badges.forEach(b => {
    if (tekst == null) { b.style.display = 'none'; }
    else { b.textContent = tekst; b.style.display = 'inline-block'; }
  });
  const mid = await getMyMusicianId();
  if (!mid) { toon(null); return; }
  try {
    const { count, error } = await db.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_id', mid)
      .is('read_at', null);
    if (error) throw error;
    if (count > 0) { toon(count > 99 ? '99+' : String(count)); }
    else { toon(null); }
  } catch (e) {
    logCaught('refreshUnreadBadge', e);
    // Stil falen: een kapotte badge mag de rest van de app niet blokkeren.
    console.error('refreshUnreadBadge', e);
  }
}

// Inbox: alle berichten van/aan mij ophalen en groeperen per gesprekspartner.
async function loadInbox() {
  const listEl = document.getElementById('messagesInboxList');
  document.getElementById('messagesInboxPanel').style.display = 'block';
  document.getElementById('messagesThreadPanel').style.display = 'none';
  listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">Laden...</div>';

  const mid = await getMyMusicianId();
  if (!mid) {
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">Maak eerst een profiel aan om berichten te kunnen sturen en ontvangen.</div>';
    return;
  }

  try {
    // TT-71 (12-08-2026): was één .or() met mid rechtstreeks in de filter-
    // string geplakt. Nu twee losse, geparametriseerde .eq()-vragen i.p.v.
    // zelf een filterstring bouwen — geen plaktekst meer, ook al kwam mid
    // hier altijd al uit de database (musicians.id), nooit uit vrije tekst.
    // Client-side samengevoegd en opnieuw op datum gesorteerd, want elke
    // vraag levert zijn eigen, los gesorteerde resultaat.
    const [sentRes, receivedRes] = await Promise.all([
      db.from('messages').select('id, sender_id, recipient_id, body, created_at, read_at').eq('sender_id', mid),
      db.from('messages').select('id, sender_id, recipient_id, body, created_at, read_at').eq('recipient_id', mid),
    ]);
    if (sentRes.error) throw sentRes.error;
    if (receivedRes.error) throw receivedRes.error;
    const data = [...(sentRes.data || []), ...(receivedRes.data || [])]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (!data || !data.length) {
      // TT-248 (11-09-2026): was grijze tekst zonder uitweg. Nu de vaste vorm
      // uit huisstijl §15 — de knop doet de volgende stap, hij legt hem niet uit.
      listEl.innerHTML = emptyStateHTML(
        'Nog geen berichten',
        'Zoek een muzikant en stuur het eerste bericht.',
        'Muzikanten zoeken →',
        "showView('search')"
      );
      return;
    }

    // Groeperen per gesprekspartner (nieuwste bericht per gesprek bovenaan).
    const conversations = new Map();
    data.forEach(msg => {
      const otherId = msg.sender_id === mid ? msg.recipient_id : msg.sender_id;
      if (!conversations.has(otherId)) {
        conversations.set(otherId, { otherId, lastMessage: msg, unreadCount: 0 });
      }
      if (msg.recipient_id === mid && !msg.read_at) {
        conversations.get(otherId).unreadCount++;
      }
    });

    const otherIds = Array.from(conversations.keys());
    const { data: musiciansData } = await db.from('musicians').select('id, fname, username, avatar_url, profile_color').in('id', otherIds);
    const infoById = {};
    (musiciansData || []).forEach(m => { infoById[m.id] = m; });

    const rows = Array.from(conversations.values()).map(c => {
      const info = infoById[c.otherId];
      // TT-22: de gesprekspartner kan zijn account inmiddels verwijderd
      // hebben — berichten blijven staan, maar tonen dan een duidelijke
      // naam i.p.v. de generieke "Muzikant"-fallback van displayNameOf().
      const name = info ? displayNameOf(info) : 'Verwijderde gebruiker';
      const col = safeColor(info && info.profile_color, '#f5c518');
      const avatarSrc = info ? safeUrl(info.avatar_url) : null;
      const avatarHTML = avatarSrc ? `<img src="${avatarSrc}" alt="${escHtml(name)}">` : AVATAR_T_FALLBACK;
      const isOwn = c.lastMessage.sender_id === mid;
      const previewPrefix = isOwn ? 'Jij: ' : '';
      const preview = c.lastMessage.body.length > 50 ? c.lastMessage.body.slice(0, 50) + '…' : c.lastMessage.body;
      const time = relativeMessageTime(c.lastMessage.created_at);
      return `
        <div class="messages-conv-row ${c.unreadCount ? 'unread' : ''}" onclick="openConversation('${jsAttr(c.otherId)}','${jsAttr(name)}','${jsAttr(col)}','${jsAttr(avatarSrc)}', false, ${!info})">
          <div class="messages-conv-avatar" style="background:${col};">${avatarHTML}</div>
          <div class="messages-conv-main">
            <div class="messages-conv-name">${escHtml(name)}${c.unreadCount ? ` <span class="unread-badge" style="position:static;">${c.unreadCount}</span>` : ''}</div>
            <div class="messages-conv-preview">${escHtml(previewPrefix + preview)}</div>
          </div>
          <div class="messages-conv-time">${escHtml(time)}</div>
        </div>`;
    }).join('');
    listEl.innerHTML = rows;
  } catch (e) {
    logCaught('loadInbox', e);
    listEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--danger);">Berichten laden is niet gelukt: ${friendlyErrorMessage(e)}</div>`;
  }
}

// TT-34 (07-08-2026): "Nu", "5 min", "Gisteren" i.p.v. altijd een kale datum
// — voelt directer/vertrouwder aan (Ronald: "een beetje cool, zoals een
// 21-jarige muzikant zou willen zien"), zoals WhatsApp/Instagram DM's dat
// ook doen.
// V-11 (13-08-2026, TT-U30): "Bijgewerkt op 3 juni 2026" leest als een dood
// profiel. Grove, relatieve tekst i.p.v. een exacte datum — bewust géén
// dagen/uren-precisie zoals relativeMessageTime(): bij een profiel gaat het
// om een indruk van activiteit, niet om een exact tijdstip.
function relativeUpdatedLabel(iso) {
  const d = new Date(iso);
  const diffDays = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (diffDays < 7)  return 'Deze week bijgewerkt';
  if (diffDays < 14) return 'Vorige week bijgewerkt';
  if (diffDays < 31) return 'Deze maand bijgewerkt';
  if (diffDays < 61) return 'Vorige maand bijgewerkt';
  return 'Langer dan 2 maanden geleden bijgewerkt';
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
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

let threadHistoryPushed = false; // V-03: staat er al een geschiedenisstap voor dit gesprek?

// V-04 (13-08-2026): blijft staan tot closeConversation()/een nieuwe
// openConversation()-aanroep met een expliciete waarde — zo hoeft de
// stille verversing na het versturen (die dit argument niet meegeeft) het
// niet opnieuw te bepalen.
let activeConversationDeleted = false;

async function openConversation(otherId, otherName, otherColor, otherAvatarSrc, stil, deleted) {
  activeConversationId = otherId;
  if (deleted !== undefined) activeConversationDeleted = deleted;
  const composerEl = document.querySelector('#messagesThreadPanel .messages-composer-row');
  const noticeEl = document.getElementById('messagesDeletedNotice');
  if (composerEl) composerEl.style.display = activeConversationDeleted ? 'none' : 'flex';
  if (noticeEl) noticeEl.style.display = activeConversationDeleted ? 'block' : 'none';
  document.getElementById('messagesThreadName').textContent = otherName;
  if (otherColor !== undefined) {
    const col = safeColor(otherColor, '#f5c518');
    const avatarEl = document.getElementById('messagesThreadAvatar');
    avatarEl.style.background = col;
    avatarEl.innerHTML = otherAvatarSrc ? `<img src="${safeUrl(otherAvatarSrc)}" alt="${escHtml(otherName)}">` : AVATAR_T_FALLBACK;
  }
  document.getElementById('messagesInboxPanel').style.display = 'none';
  document.getElementById('messagesThreadPanel').style.display = 'block';
  // V-03 (12-08-2026): eigen stap in de geschiedenis, zodat de terugknop van
  // de telefoon eerst het gesprek sluit en niet meteen het hele
  // berichtenscherm verlaat. Alleen bij het openen vanuit de inbox, niet bij
  // het verversen na het versturen van een bericht (dan staat de stap er al).
  if (!threadHistoryPushed) {
    safeHistoryPush({ view: 'messages', thread: true }, '#messages');
    threadHistoryPushed = true;
  }
  if (!stil) {
    document.getElementById('messagesReplyInput').value = '';
    updateCharCounter('messagesReplyInput', 'messagesReplyCounter', 2000);
  }
  const threadEl = document.getElementById('messagesThreadList');
  // V-02: bij een stille verversing (na het versturen van een bericht) geen
  // "Laden..." tonen — het gesprek staat al op het scherm.
  if (!stil) threadEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">Laden...</div>';

  const mid = await getMyMusicianId();
  if (!mid) return;

  try {
    // TT-71 (12-08-2026): zelfde aanpak als loadInbox() hierboven — twee
    // geparametriseerde .eq()-vragen (heen en terug) i.p.v. mid/otherId in
    // een and(...)/or(...)-filterstring plakken. Client-side samengevoegd en
    // op datum gesorteerd (oplopend, dit is het gespreksverloop).
    const [sentRes, receivedRes] = await Promise.all([
      db.from('messages').select('id, sender_id, recipient_id, body, created_at, read_at').eq('sender_id', mid).eq('recipient_id', otherId),
      db.from('messages').select('id, sender_id, recipient_id, body, created_at, read_at').eq('sender_id', otherId).eq('recipient_id', mid),
    ]);
    if (sentRes.error) throw sentRes.error;
    if (receivedRes.error) throw receivedRes.error;
    const data = [...(sentRes.data || []), ...(receivedRes.data || [])]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // TT-34: dag-scheidingen ("Vandaag"/"Gisteren"/datum) tussen berichten
    // van verschillende dagen — herkenbaar chat-patroon, maakt een lang
    // gesprek beter leesbaar dan alleen een tijdstip per bubbel.
    let lastDay = null;
    const today = new Date().toDateString();
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toDateString();
    threadEl.innerHTML = (data && data.length ? data.map(msg => {
      const own = msg.sender_id === mid;
      const msgDate = new Date(msg.created_at);
      const dayStr = msgDate.toDateString();
      let divider = '';
      if (dayStr !== lastDay) {
        lastDay = dayStr;
        const label = dayStr === today ? 'Vandaag' : dayStr === yesterdayStr ? 'Gisteren' : msgDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
        divider = `<div class="messages-day-divider">${escHtml(label)}</div>`;
      }
      const time = msgDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
      // V-07 (13-08-2026, in overleg vastgesteld): alleen een vinkje dat een
      // eigen verzonden bericht is gelezen — bewust geen tijdstip erbij
      // ("gelezen om 23:14" kan bij minderjarigen sociale druk geven als er
      // dan niet snel wordt geantwoord). Alleen zichtbaar bij eigen berichten
      // die al gelezen zijn; geen apart teken voor "verzonden, nog niet
      // gelezen" — dat voorkomt hetzelfde druk-risico in een andere vorm.
      const readCheck = (own && msg.read_at) ? `<span class="message-bubble-read" title="Gelezen">✓</span>` : '';
      return `${divider}<div class="message-bubble ${own ? 'own' : 'other'}">${escHtml(msg.body).replace(/\n/g, '<br>')}<div class="message-bubble-time">${escHtml(time)}${readCheck}</div></div>`;
    }).join('') : emptyStateHTML(
      'Nog geen berichten in dit gesprek',
      '',
      'Schrijf het eerste bericht →',
      "document.getElementById('messagesReplyInput').focus()"
    ));

    // Ongelezen berichten van deze afzender markeren als gelezen.
    const unreadIds = (data || []).filter(m => m.recipient_id === mid && !m.read_at).map(m => m.id);
    if (unreadIds.length) {
      await db.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
      refreshUnreadBadge();
    }
    scrollThreadToBottom(); // V-01
    if (!stil) document.getElementById('messagesReplyInput').focus();
  } catch (e) {
    logCaught('openConversation', e);
    threadEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--danger);">Gesprek laden is niet gelukt: ${friendlyErrorMessage(e)}</div>`;
  }
}

function closeConversation() {
  activeConversationId = null;
  activeConversationDeleted = false; // V-04
  threadHistoryPushed = false;
  document.getElementById('messagesInboxPanel').style.display = 'block';
  document.getElementById('messagesThreadPanel').style.display = 'none';
  loadInbox();
}

// TT-130-vervolg (23-08-2026, live gemeld door Ronald): het invoerveld
// bleef bereikbaar zodra het toetsenbord opkwam, maar de naam van de ander
// (de sticky kop) verdween toch. Bekende eigenaardigheid: sommige mobiele
// browsers passen het zichtbare kijkvenster (visualViewport) aan zonder dat
// position:sticky dat op tijd volgt. Zolang het invoerveld focus heeft,
// wordt de kop expliciet vastgezet op de bovenkant van het daadwerkelijk
// zichtbare gebied, bijgewerkt bij elke wijziging daarvan. Alleen op mobiel
// (≤560px, dezelfde grens als de rest van dit scherm) — op een breder
// scherm is er geen toetsenbord dat de viewport verkleint.
// Aanname, niet op een telefoon geverifieerd: dit lost het gemelde gedrag
// op. Opnieuw testen op dezelfde manier als hierboven (toetsenbord openen
// in een gesprek, blijft de naam nu wél zichtbaar?).
function pinMessagesThreadHeader() {
  if (window.innerWidth > 560 || !window.visualViewport) return;
  const header = document.querySelector('#messagesThreadPanel .messages-thread-header');
  if (!header) return;
  const vv = window.visualViewport;
  header.style.position = 'fixed';
  header.style.top = vv.offsetTop + 'px';
  header.style.left = '16px';
  header.style.right = '16px';
  header.style.width = 'auto';
  header.style.zIndex = '35';
}
function unpinMessagesThreadHeader() {
  const header = document.querySelector('#messagesThreadPanel .messages-thread-header');
  if (!header) return;
  header.style.position = '';
  header.style.top = '';
  header.style.left = '';
  header.style.right = '';
  header.style.width = '';
  header.style.zIndex = '';
}
(function initMessagesKeyboardPin() {
  const input = document.getElementById('messagesReplyInput');
  if (!input) return;
  input.addEventListener('focus', () => {
    pinMessagesThreadHeader();
    window.visualViewport?.addEventListener('resize', pinMessagesThreadHeader);
    window.visualViewport?.addEventListener('scroll', pinMessagesThreadHeader);
  });
  input.addEventListener('blur', () => {
    unpinMessagesThreadHeader();
    window.visualViewport?.removeEventListener('resize', pinMessagesThreadHeader);
    window.visualViewport?.removeEventListener('scroll', pinMessagesThreadHeader);
  });
})();

