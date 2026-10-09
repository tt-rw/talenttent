// ─── Berichten (TT-01) ───────────────────────────────────────────────────────

let activeConversationId = null; // musician-id van de open gespreksdraad

// TT-451 (09-10-2026, besluit Ronald: "de melding kan in de inbox, onder
// gebruiker Talent Tent"): berichten van Talent Tent staan als vast gesprek in
// de inbox. Geen nepgebruiker: ze komen uit een eigen tabel
// (`talent_tent_berichten`), die de digest vult. Zelfde ontvangers, frequentie
// en matches als de mail; wie de mail uitzet, krijgt ook geen bericht. Het
// gesprek is alleen te lezen: geen invoerveld, geen menu.
const TT_GESPREK_ID = 'talent-tent';
const TT_GESPREK_NAAM = 'Talent Tent';
let activeConversationSysteem = false; // waar zolang het gesprek met Talent Tent open staat
let ttBerichtenBeschikbaar = true;     // onwaar na de eerste mislukte vraag: één logregel per bezoek

// Dezelfde zinnen als de digestmail (send-digest, TEKSTEN_DIGEST).
const TT_TEKSTEN = {
  kernzinEenMatch: 'Er is 1 nieuwe match bij jou in de buurt',
  kernzinMatches: 'Er zijn {aantal} nieuwe matches bij jou in de buurt',
  meer: 'En nog {aantal} andere — bekijk ze in Zoeken',
  bandZoekt: 'zoekt: {instrument}',
};

// TT-32 (07-08-2026): als iemand op het chat-icoon klikt zonder ingelogd te
// zijn (of nog geen eigen profiel heeft), onthouden we wie ze wilden
// berichten — zodat we ze na het inloggen/profiel-aanmaken direct naar de
// composer kunnen sturen i.p.v. naar Mijn Profiel (Ronald: "kan je de
// intelligentie toevoegen aan de chat-knop?"). Alleen gebruikt door
// onUserLoggedIn() (bestaand account, inloggen) en showSaveSuccess() (gloed-
// nieuw account, na de volledige wizard) — nooit voor een gewone profielklik.
let pendingMessageRecipient = null;

// TT-410a (06-10-2026, besluit Ronald): geen apart bericht-venster meer. "Een
// bericht sturen" opent het gespreksscherm van Berichten, dat al een lege
// staat en een tekstveld heeft. Eén plek om te schrijven, niet twee.
// Vanuit Zoeken (of een ander scherm) gaat de pijl terug, en een verstuurd
// bericht ook, naar dat scherm: gesprekVanuit onthoudt het. Een gesprek dat
// je vanuit de inbox opent, werkt zoals altijd.
let gesprekVanuit = null; // view waar "Bericht sturen" vandaan kwam; null = inbox
let gesprekVia = '';      // TT-385 (h): bandnaam als het bericht bij een contactpersoon binnenkomt

function openMessageComposer(recipientId, recipientName, bandNaam) {
  // Het profiel is een scherm (TT-410b): het gesprek komt in de plaats en de
  // pijl van het gesprek brengt je er weer terug. Dat geldt ook voor een band
  // (fase 2). V-13 (13-08-2026): ook "Stuur een bericht aan deze band" komt hier uit.
  gesprekVia = bandNaam || '';
  if (huidigeView !== 'messages') {
    gesprekVanuit = huidigeView;
    showView('messages', 'behoud'); // TT-431: de stap hieronder blijft staan, terug gaat naar dit scherm
  } else {
    gesprekVanuit = null;
  }
  // Zonder foto-argument blijft de vorige foto staan; null geeft de T.
  openConversation(recipientId, recipientName, null, false, false);
  // De foto komt los binnen; de kop staat er meteen.
  (async () => {
    try {
      const { data } = await db.from('musicians').select('avatar_url').eq('id', recipientId);
      const url = data && data[0] && safeUrl(data[0].avatar_url);
      if (url && activeConversationId === recipientId) {
        document.getElementById('messagesThreadAvatar').innerHTML =
          `<img src="${url}" alt="${escHtml(recipientName)}">`;
      }
    } catch (e) { logCaught('openMessageComposer', e); }
  })();
  // TT-271 (16-09-2026, Ronald): geen automatische focus. Het toetsenbord
  // komt pas op als de gebruiker zelf op het veld tikt.
}

// TT-31 (07-08-2026): het chat-icoon op de resultatenrij/-kaart moet direct
// naar de composer gaan — geen tussenstop bij het profiel waar je nogmaals
// op "Stuur een bericht" moet klikken (Ronald: "niet naar een tussenscherm
// waar ik nogmaals op een knop moet drukken"). event.stopPropagation()
// voorkomt dat de klik ook nog de rij/kaart zelf (openProfielScherm) triggert.
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
    openProfielScherm(id);
  }
}

// Gedeelde insert voor de gespreksdraad (nieuw contact en bestaand gesprek).
async function insertMessage(recipientId, body) {
  const mid = await getMyMusicianId();
  if (!mid) { showToast('Maak eerst een profiel aan om berichten te sturen.'); return false; }
  // TT-336: zonder bevestigd e-mailadres geen berichten. Het bericht blijft
  // in het invoerveld staan.
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
    logCaught('insertMessage', e);
    showToast(friendlyErrorMessage(e, 'je bericht versturen'));
    return false;
  }
}

async function sendReplyInThread() {
  if (!activeConversationId || activeConversationSysteem) return; // TT-451: Talent Tent leest je alleen
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
    // TT-410a: kwam het gesprek uit Zoeken, dan gaat een verstuurd bericht
    // terug naar Zoeken, via hetzelfde pad als de pijl (popstate).
    if (gesprekVanuit) { showToast('Bericht verstuurd'); appTerug(); return; }
    openConversation(activeConversationId, document.getElementById('messagesThreadName').textContent, undefined, true);
  } else {
    // Mislukt: het voorlopige bericht weer weghalen en de tekst teruggeven,
    // zodat niemand denkt dat het verstuurd is.
    nieuw.forEach(el => el.remove());
    input.value = tekst;
    updateCharCounter('messagesReplyInput', 'messagesReplyCounter', 2000);
  }
}

// TT-34/TT-451: de dag-scheiding in een gesprek, voor gewone gesprekken en
// voor Talent Tent: "Vandaag", "Gisteren" of de datum.
function dagLabel(d) {
  const dag = d.toDateString();
  const gisteren = new Date(); gisteren.setDate(gisteren.getDate() - 1);
  if (dag === new Date().toDateString()) return 'Vandaag';
  if (dag === gisteren.toDateString()) return 'Gisteren';
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
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
    const [{ data, error }, ttOngelezen] = await Promise.all([
      db.from('messages')
        .select('sender_id')
        .eq('recipient_id', mid)
        .is('read_at', null),
      ttOngelezenTellen(),
    ]);
    if (error) throw error;
    // TT-451: een ongelezen bericht van Talent Tent telt als één in hetzelfde getal.
    const count = (data || []).filter(r => !blokkeerIkZelf(r.sender_id)).length + ttOngelezen;
    if (count > 0) { toon(count > 99 ? '99+' : String(count)); }
    else { toon(null); }
  } catch (e) {
    logCaught('refreshUnreadBadge', e);
    // Stil falen: een kapotte badge mag de rest van de app niet blokkeren.
    console.error('refreshUnreadBadge', e);
  }
}

// Inbox: alle berichten van/aan mij ophalen en groeperen per gesprekspartner.
async function loadInbox(opties) {
  const listEl = document.getElementById('messagesInboxList');
  document.getElementById('messagesInboxPanel').style.display = 'block';
  document.getElementById('messagesThreadPanel').style.display = 'none';
  // Tabwissel: laat een geladen lijst van deze gebruiker staan tot de nieuwe er is.
  if (!(opties && opties.behoud && currentUser && listEl.dataset.klaar === currentUser.id)) {
    delete listEl.dataset.klaar;
    listEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">Laden...</div>';
  }

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
    const [sentRes, receivedRes, verborgen, ttBerichten] = await Promise.all([
      db.from('messages').select('id, sender_id, recipient_id, body, created_at, read_at').eq('sender_id', mid),
      db.from('messages').select('id, sender_id, recipient_id, body, created_at, read_at').eq('recipient_id', mid),
      laadVerborgenGesprekken(),
      laadTalentTentBerichten(), // TT-451
    ]);
    if (sentRes.error) throw sentRes.error;
    if (receivedRes.error) throw receivedRes.error;
    // TT-06 (18-09-2026): wie ik blokkeer, verdwijnt uit mijn inbox — heen én
    // terug, dus ook het gesprek dat ik zelf begon. De blokkade van een ander
    // op mij laat dit onaangeroerd: die is stil, ik merk er niets van.
    const data = [...(sentRes.data || []), ...(receivedRes.data || [])]
      .filter(msg => !blokkeerIkZelf(msg.sender_id === mid ? msg.recipient_id : msg.sender_id))
      .filter(msg => !gesprekVerborgenTot(verborgen, msg.sender_id === mid ? msg.recipient_id : msg.sender_id, msg.created_at))
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if ((!data || !data.length) && !ttBerichten.length) {
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
    const { data: musiciansData } = otherIds.length
      ? await db.from('musicians').select('id, fname, username, avatar_url').in('id', otherIds)
      : { data: [] };
    const infoById = {};
    (musiciansData || []).forEach(m => { infoById[m.id] = m; });

    const rijen = Array.from(conversations.values()).map(c => {
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
      return { t: new Date(c.lastMessage.created_at).getTime(), html: `
        <div class="messages-conv-row ${c.unreadCount ? 'unread' : ''}" onclick="openConversation('${jsAttr(c.otherId)}','${jsAttr(name)}','${jsAttr(avatarSrc)}', false, ${!info})">
          <div class="messages-conv-avatar">${avatarHTML}</div>
          <div class="messages-conv-main">
            <div class="messages-conv-name">${escHtml(name)}${c.unreadCount ? ` <span class="unread-badge" style="position:static;">${c.unreadCount}</span>` : ''}</div>
            <div class="messages-conv-preview">${escHtml(previewPrefix + preview)}</div>
          </div>
          <div class="messages-conv-time">${escHtml(time)}</div>
        </div>` };
    });
    // TT-451: Talent Tent staat tussen de gesprekken, op het moment van zijn laatste bericht.
    if (ttBerichten.length) rijen.push({ t: new Date(ttBerichten[0].created_at).getTime(), html: talentTentRijHTML(ttBerichten) });
    listEl.innerHTML = rijen.sort((a, b) => b.t - a.t).map(r => r.html).join('');
    if (currentUser) listEl.dataset.klaar = currentUser.id;
  } catch (e) {
    delete listEl.dataset.klaar;
    logCaught('loadInbox', e);
    listEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--danger);">${friendlyErrorMessage(e, 'je berichten laden')}</div>`;
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
  zetSysteemGesprek(false); // TT-451: een gewoon gesprek heeft weer invoerveld en menu
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
    activeConversationDeleted ? null : otherId, otherName, otherId);
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
  // TT-431: geen eigen stap meer in de browsergeschiedenis; alleen het adres
  // noemt het gesprek.
  safeHistoryReplace(history.state, '#messages/' + encodeURIComponent(otherId));
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
    const [sentRes, receivedRes, verborgen] = await Promise.all([
      db.from('messages').select('id, sender_id, recipient_id, body, created_at, read_at').eq('sender_id', mid).eq('recipient_id', otherId),
      db.from('messages').select('id, sender_id, recipient_id, body, created_at, read_at').eq('sender_id', otherId).eq('recipient_id', mid),
      laadVerborgenGesprekken(),
    ]);
    if (sentRes.error) throw sentRes.error;
    if (receivedRes.error) throw receivedRes.error;
    const data = [...(sentRes.data || []), ...(receivedRes.data || [])]
      .filter(msg => !gesprekVerborgenTot(verborgen, otherId, msg.created_at))
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // TT-34: dag-scheidingen ("Vandaag"/"Gisteren"/datum) tussen berichten
    // van verschillende dagen — herkenbaar chat-patroon, maakt een lang
    // gesprek beter leesbaar dan alleen een tijdstip per bubbel.
    let lastDay = null;
    const nieuweInhoud = (data && data.length ? data.map(msg => {
      const own = msg.sender_id === mid;
      const msgDate = new Date(msg.created_at);
      const dayStr = msgDate.toDateString();
      let divider = '';
      if (dayStr !== lastDay) {
        lastDay = dayStr;
        divider = `<div class="messages-day-divider">${escHtml(dagLabel(msgDate))}</div>`;
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
      gesprekVia ? `${otherName} is de contactpersoon van ${gesprekVia}.` : '',
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
    threadEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--danger);">${friendlyErrorMessage(e, 'het gesprek laden')}</div>`;
  }
}

// TT-435 (07-10-2026, besluit Ronald): een gesprek verwijderen gaat alleen bij
// jezelf. De ander houdt het. De database bewaart per gesprek het moment van
// verwijderen (`gesprek_verborgen`); alles daarvoor is voor jou weg. Schrijft
// de ander later weer, dan komt het gesprek terug met alleen de nieuwe
// berichten. Mislukt de vraag (bijvoorbeeld omdat het script nog niet is
// gedraaid), dan blijft alles zichtbaar.
async function laadVerborgenGesprekken() {
  try {
    const { data, error } = await db.from('gesprek_verborgen').select('ander_id, verborgen_op');
    if (error) throw error;
    const kaart = {};
    (data || []).forEach(r => { kaart[r.ander_id] = r.verborgen_op; });
    return kaart;
  } catch (e) {
    logCaught('laadVerborgenGesprekken', e);
    return {};
  }
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
    true
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
  if (activeConversationId === otherId) closeConversation(); else loadInbox();
  refreshUnreadBadge();
  showToast('Gesprek verwijderd.');
}

// ─── Berichten van Talent Tent (TT-451, 09-10-2026) ──────────────────────────
//
// Elke digestrun schrijft per muzikant één bericht met de matches van die run
// (Edge Function send-digest). Hier komt het terug als gesprek "Talent Tent":
// één bericht per run, de matches als tikbare rijen. Namen en foto's staan niet
// in het bericht; ze worden vers opgehaald, dus een nieuwe gebruikersnaam of
// een verwijderd account klopt altijd, en een geblokkeerde muzikant staat er
// niet in. Faalt de vraag (bijvoorbeeld omdat het SQL-script nog niet is
// gedraaid), dan blijft de inbox gewoon werken, zonder Talent Tent.
async function laadTalentTentBerichten() {
  if (!ttBerichtenBeschikbaar) return [];
  try {
    const { data, error } = await db.from('talent_tent_berichten')
      .select('id, inhoud, created_at, read_at')
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) throw error;
    return (data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  } catch (e) {
    ttBerichtenBeschikbaar = false;
    logCaught('laadTalentTentBerichten', e);
    return [];
  }
}

async function ttOngelezenTellen() {
  if (!ttBerichtenBeschikbaar) return 0;
  try {
    const { data, error } = await db.from('talent_tent_berichten').select('id').is('read_at', null);
    if (error) throw error;
    return (data || []).length;
  } catch (e) {
    ttBerichtenBeschikbaar = false;
    logCaught('ttOngelezenTellen', e);
    return 0;
  }
}

// Het gesprek met Talent Tent heeft geen invoerveld, geen menu en een naam die
// niet tikbaar is (klasse `thread-systeem` op het paneel).
function zetSysteemGesprek(aan) {
  activeConversationSysteem = !!aan;
  const paneel = document.getElementById('messagesThreadPanel');
  if (paneel) paneel.classList.toggle('thread-systeem', !!aan);
}

function talentTentKernzin(inhoud) {
  const aantal = ((inhoud && inhoud.muzikanten) || []).length + ((inhoud && inhoud.bands) || []).length + (Number(inhoud && inhoud.meer) || 0);
  return aantal === 1 ? TT_TEKSTEN.kernzinEenMatch : TT_TEKSTEN.kernzinMatches.replace('{aantal}', aantal);
}

function talentTentRijHTML(berichten) {
  const laatste = berichten[0];
  const ongelezen = berichten.filter(b => !b.read_at).length;
  return `
    <div class="messages-conv-row ${ongelezen ? 'unread' : ''}" onclick="openTalentTentGesprek()">
      <div class="messages-conv-avatar">${AVATAR_T_FALLBACK}</div>
      <div class="messages-conv-main">
        <div class="messages-conv-name">${escHtml(TT_GESPREK_NAAM)}${ongelezen ? ` <span class="unread-badge" style="position:static;">${ongelezen}</span>` : ''}</div>
        <div class="messages-conv-preview">${escHtml(talentTentKernzin(laatste.inhoud))}</div>
      </div>
      <div class="messages-conv-time">${escHtml(relativeMessageTime(laatste.created_at))}</div>
    </div>`;
}

// Naam, plaats en foto van alle matches in één keer: één vraag naar muzikanten
// en één naar bands, hoeveel berichten er ook zijn.
async function talentTentInfoOphalen(berichten) {
  const mIds = new Set(), bIds = new Set();
  berichten.forEach(b => {
    ((b.inhoud && b.inhoud.muzikanten) || []).forEach(m => mIds.add(m.id));
    ((b.inhoud && b.inhoud.bands) || []).forEach(x => bIds.add(x.id));
  });
  const info = { muzikanten: {}, bands: {} };
  try {
    if (mIds.size) {
      const { data, error } = await db.from('musicians').select('id, fname, username, city, avatar_url').in('id', Array.from(mIds));
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

// Eén bericht: de kernzin van de mail, daaronder de matches als rijen. Een
// match die niet meer bestaat of die je blokkeerde, staat er niet in. Blijft er
// niets over, dan is er geen bericht om te tonen.
function talentTentBerichtHTML(bericht, info) {
  const inh = bericht.inhoud || {};
  const muz = (inh.muzikanten || []).filter(m => info.muzikanten[m.id] && !isGeblokkeerd(m.id));
  const bnd = (inh.bands || []).filter(b => info.bands[b.id]);
  if (!muz.length && !bnd.length) return '';
  const meer = Number(inh.meer) || 0;
  const kernzin = talentTentKernzin({ muzikanten: muz, bands: bnd, meer });
  const rijen = muz.map(m => {
    const mi = info.muzikanten[m.id];
    const naam = displayNameOf(mi);
    const regel1 = [mi.city, m.km != null ? `${m.km} km` : ''].filter(Boolean).join(' · ');
    const regel2 = (m.instrumenten || []).join(' · ');
    return `<button type="button" class="bb-rij bb-rij-knop" onclick="openProfielScherm('${jsAttr(m.id)}')" aria-label="Profiel van ${escAttr(naam)}">${bbFotoHTML(mi.avatar_url)}<span class="bb-tekst"><span class="bb-naam">${escHtml(naam)}</span>${regel1 ? `<span class="bb-sub">${escHtml(regel1)}</span>` : ''}${regel2 ? `<span class="bb-sub">${escHtml(regel2)}</span>` : ''}</span></button>`;
  }).concat(bnd.map(b => {
    const bi = info.bands[b.id];
    const foto = safeUrl(bi.avatar_url);
    const beeld = foto
      ? `<img class="bb-foto bb-foto-vierkant" src="${foto}" alt="">`
      : `<span class="bb-foto bb-foto-t bb-foto-vierkant" aria-hidden="true">${AVATAR_T_FALLBACK}</span>`;
    const regel1 = [bi.city, b.km != null ? `${b.km} km` : ''].filter(Boolean).join(' · ');
    const regel2 = (b.zoekt || []).map(i => TT_TEKSTEN.bandZoekt.replace('{instrument}', i)).join(' · ');
    return `<button type="button" class="bb-rij bb-rij-knop" onclick="openBandScherm('${jsAttr(b.id)}')" aria-label="Band ${escAttr(bi.name)}">${beeld}<span class="bb-tekst"><span class="bb-naam">${escHtml(bi.name)}</span>${regel1 ? `<span class="bb-sub">${escHtml(regel1)}</span>` : ''}${regel2 ? `<span class="bb-sub">${escHtml(regel2)}</span>` : ''}</span></button>`;
  }));
  const tijd = new Date(bericht.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  const meerHTML = meer
    ? `<button type="button" class="tt-meer" onclick="showView('search')">${escHtml(TT_TEKSTEN.meer.replace('{aantal}', meer))}</button>`
    : '';
  return `<div class="message-bubble other tt-bericht"><div class="tt-bericht-kop">${escHtml(kernzin)}</div>${rijen.join('')}${meerHTML}<div class="message-bubble-time">${escHtml(tijd)}</div></div>`;
}

async function openTalentTentGesprek(stil) {
  activeConversationId = TT_GESPREK_ID;
  zetSysteemGesprek(true);
  activeConversationDeleted = false;
  gesprekVia = '';
  werkTerugKnopBij(); // TT-301: een open gesprek is een stap terug
  const paneel = document.getElementById('messagesThreadPanel');
  paneel.classList.remove('thread-verwijderd');
  paneel.classList.add('gesprek-open');
  document.getElementById('messagesThreadName').textContent = TT_GESPREK_NAAM;
  document.getElementById('messagesThreadAvatar').innerHTML = AVATAR_T_FALLBACK;
  zetVeiligheidMenu('messagesThreadActies', 'gesprek', null, ''); // geen melden, blokkeren of verwijderen
  document.getElementById('messagesInboxPanel').style.display = 'none';
  paneel.style.display = 'block';
  safeHistoryReplace(history.state, '#messages/' + TT_GESPREK_ID);
  const threadEl = document.getElementById('messagesThreadList');
  if (!stil) threadEl.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">Laden...</div>';
  try {
    const berichten = (await laadTalentTentBerichten()).slice().reverse(); // oud naar nieuw, zoals elk gesprek
    const info = await talentTentInfoOphalen(berichten);
    if (activeConversationId !== TT_GESPREK_ID) return; // intussen gesloten of een ander gesprek
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
      'Nog geen berichten van Talent Tent',
      'Nieuwe matches bij jou in de buurt staan hier.',
      'Muzikanten zoeken →',
      "showView('search')"
    );
    // TT-452: pas nu, nadat je een bericht van Talent Tent zag, vragen we of je
    // er een seintje op dit toestel bij wilt. Nooit bij het eerste bezoek.
    if (html && await ttSeintjeVraagTonen()) threadEl.insertAdjacentHTML('beforeend', ttSeintjeVraagHTML());
    // Alles wat je nu ziet, geldt als gelezen: de stip en het getal gaan weg.
    const ongelezen = berichten.filter(b => !b.read_at).map(b => b.id);
    if (ongelezen.length) {
      const { error } = await db.from('talent_tent_berichten').update({ read_at: new Date().toISOString() }).in('id', ongelezen);
      if (error) logCaught('openTalentTentGesprek/gelezen', error);
      refreshUnreadBadge();
    }
    scrollThreadToBottom();
  } catch (e) {
    logCaught('openTalentTentGesprek', e);
    threadEl.innerHTML = `<div style="text-align:center;padding:40px;color:var(--danger);">${friendlyErrorMessage(e, 'de berichten van Talent Tent laden')}</div>`;
  }
}

function closeConversation(stil) {
  zetVeiligheidMenu('messagesThreadActies', 'gesprek', null, ''); // TT-06
  activeConversationId = null;
  zetSysteemGesprek(false); // TT-451
  gesprekVia = '';
  activeConversationDeleted = false; // V-04
  if (huidigeView === 'messages') safeHistoryReplace(history.state, '#messages'); // TT-431
  document.getElementById('messagesInboxPanel').style.display = 'block';
  document.getElementById('messagesThreadPanel').style.display = 'none';
  document.getElementById('messagesThreadPanel').classList.remove('gesprek-open');
  werkTerugKnopBij(); // TT-301
  if (!stil) loadInbox(); // TT-410a: terug naar Zoeken laadt de inbox niet
}

// TT-279 (16-09-2026): na verversen het gesprek uit de adresregel weer
// openen. Naam en foto komen uit dezelfde vraag als in loadInbox().
async function heropenGesprek(otherId) {
  if (otherId === TT_GESPREK_ID) { openTalentTentGesprek(); return; } // TT-451
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
  if (!activeConversationId || activeConversationDeleted || activeConversationSysteem) return;
  openProfielScherm(activeConversationId);
}
