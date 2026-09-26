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
  // TT-271 (16-09-2026, Ronald): geen automatische focus meer. Het
  // toetsenbord komt pas op als de gebruiker zelf op het veld tikt.
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
  // TT-277: het voorlopige bericht krijgt dezelfde opbouw als na de
  // verversing — lege staat weg, "Vandaag" erboven als die nog ontbreekt.
  // Anders verspringt de lijst zodra het gesprek opnieuw is opgehaald.
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
  updateCharCounter('messagesReplyInput', 'messagesReplyCounter', 2000);
  scrollThreadToBottom();

  const ok = await insertMessage(activeConversationId, tekst);
  if (ok) {
    openConversation(activeConversationId, document.getElementById('messagesThreadName').textContent, undefined, true);
  } else {
    // Mislukt: het voorlopige bericht weer weghalen en de tekst teruggeven,
    // zodat niemand denkt dat het verstuurd is.
    nieuw.forEach(el => el.remove());
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
  // TT-272 (16-09-2026): scrollIntoView zette het laatste bericht tegen de
  // onderrand, dus achter het invoerveld en de onderbalk. Het invoerveld
  // staat onderaan in de paginastroom; helemaal naar beneden scrollen zet
  // het laatste bericht er dus altijd net boven.
  if (!draad.lastElementChild) return;
  window.scrollTo(0, document.documentElement.scrollHeight);
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
    // TT-06 (18-09-2026): was een kale telling met head:true. Die kan de
    // afzender niet zien, en een blokkade moet ook de teller stil houden —
    // anders verraadt een ongelezen-badge dat er toch iets binnenkwam.
    // Daarom nu de afzenders ophalen en zelf tellen.
    const { data, error } = await db.from('messages')
      .select('sender_id')
      .eq('recipient_id', mid)
      .is('read_at', null);
    if (error) throw error;
    const count = (data || []).filter(r => !blokkeerIkZelf(r.sender_id)).length;
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
    // TT-06 (18-09-2026): wie ik blokkeer, verdwijnt uit mijn inbox — heen én
    // terug, dus ook het gesprek dat ik zelf begon. De blokkade van een ander
    // op mij laat dit onaangeroerd: die is stil, ik merk er niets van.
    const data = [...(sentRes.data || []), ...(receivedRes.data || [])]
      .filter(msg => !blokkeerIkZelf(msg.sender_id === mid ? msg.recipient_id : msg.sender_id))
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
    const { data: musiciansData } = await db.from('musicians').select('id, fname, username, avatar_url').in('id', otherIds);
    const infoById = {};
    (musiciansData || []).forEach(m => { infoById[m.id] = m; });

    const rows = Array.from(conversations.values()).map(c => {
      const info = infoById[c.otherId];
      // TT-22: de gesprekspartner kan zijn account inmiddels verwijderd
      // hebben — berichten blijven staan, maar tonen dan een duidelijke
      // naam i.p.v. de generieke "Muzikant"-fallback van displayNameOf().
      const name = info ? displayNameOf(info) : 'Verwijderde gebruiker';
      const avatarSrc = info ? safeUrl(info.avatar_url) : null;
      const avatarHTML = avatarSrc ? `<img src="${avatarSrc}" alt="${escHtml(name)}">` : AVATAR_T_FALLBACK;
      const isOwn = c.lastMessage.sender_id === mid;
      const previewPrefix = isOwn ? 'Jij: ' : '';
      const preview = c.lastMessage.body.length > 50 ? c.lastMessage.body.slice(0, 50) + '…' : c.lastMessage.body;
      const time = relativeMessageTime(c.lastMessage.created_at);
      return `
        <div class="messages-conv-row ${c.unreadCount ? 'unread' : ''}" onclick="openConversation('${jsAttr(c.otherId)}','${jsAttr(name)}','${jsAttr(avatarSrc)}', false, ${!info})">
          <div class="messages-conv-avatar">${avatarHTML}</div>
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

// TT-305 (22-09-2026): zonder gesprekspartner valt er niets te openen.
// supabase-js maakt van .eq('recipient_id', null) de tekst "null", en de
// database leest die niet als uuid. De gebruiker zag dan "Gesprek laden is
// niet gelukt". Eén controle hier, niet per aanroep — zelfde regel als §2.11
// van de projectinstructies.
async function openConversation(otherId, otherName, otherAvatarSrc, stil, deleted) {
  if (!otherId) return;
  activeConversationId = otherId;
  werkTerugKnopBij(); // TT-301: een open gesprek is een stap terug
  if (deleted !== undefined) activeConversationDeleted = deleted;
  const composerEl = document.querySelector('#messagesThreadPanel .messages-composer-row');
  const noticeEl = document.getElementById('messagesDeletedNotice');
  if (composerEl) composerEl.style.display = activeConversationDeleted ? 'none' : 'flex';
  document.getElementById('messagesThreadPanel').classList.toggle('thread-verwijderd', activeConversationDeleted);
  document.getElementById('messagesThreadPanel').classList.add('gesprek-open');
  if (noticeEl) noticeEl.style.display = activeConversationDeleted ? 'block' : 'none';
  document.getElementById('messagesThreadName').textContent = otherName;
  // TT-06 (18-09-2026): melden en blokkeren vanuit het gesprek. Bij een
  // verwijderd account is er niemand meer om te melden of te blokkeren.
  zetVeiligheidMenu('messagesThreadActies', 'gesprek',
    activeConversationDeleted ? null : otherId, otherName);
  // Zonder foto-argument is dit de stille verversing na het versturen: de
  // kop staat er dan al.
  if (otherAvatarSrc !== undefined) {
    const avatarEl = document.getElementById('messagesThreadAvatar');
    avatarEl.innerHTML = otherAvatarSrc ? `<img src="${safeUrl(otherAvatarSrc)}" alt="${escHtml(otherName)}">` : AVATAR_T_FALLBACK;
  }
  document.getElementById('messagesInboxPanel').style.display = 'none';
  document.getElementById('messagesThreadPanel').style.display = 'block';
  // V-03 (12-08-2026): eigen stap in de geschiedenis, zodat de terugknop van
  // de telefoon eerst het gesprek sluit en niet meteen het hele
  // berichtenscherm verlaat. Alleen bij het openen vanuit de inbox, niet bij
  // het verversen na het versturen van een bericht (dan staat de stap er al).
  // TT-279: het adres noemt het gesprek, zodat verversen het weer opent.
  if (!threadHistoryPushed) {
    safeHistoryPush({ view: 'messages', thread: true }, '#messages/' + encodeURIComponent(otherId));
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
    const nieuweInhoud = (data && data.length ? data.map(msg => {
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
    // TT-277: een stille verversing vervangt de lijst alleen als er iets
    // veranderde. Zo blijft het net verstuurde bericht gewoon staan.
    if (!stil || threadEl.innerHTML !== nieuweInhoud) threadEl.innerHTML = nieuweInhoud;

    // Ongelezen berichten van deze afzender markeren als gelezen.
    const unreadIds = (data || []).filter(m => m.recipient_id === mid && !m.read_at).map(m => m.id);
    if (unreadIds.length) {
      await db.from('messages').update({ read_at: new Date().toISOString() }).in('id', unreadIds);
      refreshUnreadBadge();
    }
    scrollThreadToBottom(); // V-01
    // TT-271: geen automatische focus — zie openMessageComposer().
  } catch (e) {
    logCaught('openConversation', e);
    threadEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--danger);">Gesprek laden is niet gelukt: ${friendlyErrorMessage(e)}</div>`;
  }
}

function closeConversation() {
  zetVeiligheidMenu('messagesThreadActies', 'gesprek', null, ''); // TT-06
  activeConversationId = null;
  activeConversationDeleted = false; // V-04
  threadHistoryPushed = false;
  document.getElementById('messagesInboxPanel').style.display = 'block';
  document.getElementById('messagesThreadPanel').style.display = 'none';
  document.getElementById('messagesThreadPanel').classList.remove('gesprek-open');
  werkTerugKnopBij(); // TT-301
  loadInbox();
}

// TT-279 (16-09-2026): na verversen het gesprek uit de adresregel weer
// openen. Naam en foto komen uit dezelfde vraag als in loadInbox().
async function heropenGesprek(otherId) {
  try {
    const { data, error } = await db.from('musicians')
      .select('id, fname, username, avatar_url').eq('id', otherId);
    if (error) throw error;
    const info = (data || [])[0];
    const name = info ? displayNameOf(info) : 'Verwijderde gebruiker';
    const avatarSrc = info ? safeUrl(info.avatar_url) : null;
    openConversation(otherId, name, avatarSrc, false, !info);
  } catch (e) {
    logCaught('heropenGesprek', e);
  }
}

// TT-271 (16-09-2026, Ronald): foto en naam bovenin een gesprek openen het
// profiel van de ander. Een verwijderd account heeft geen profiel meer.
function openThreadProfile() {
  if (!activeConversationId || activeConversationDeleted) return;
  openMusicianModal(activeConversationId);
}
