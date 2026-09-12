// ─── Muzikant detail modal ───────────────────────────────────────────────────


// Bouwt de profiel-detail HTML op basis van een musicians-record. Gedeeld door
// openMusicianModal() (modal voor andere profielen) én loadMyProfile() (Mijn
// Profiel) — zodat Mijn Profiel nooit de modal hoeft te openen/sluiten (dat
// veroorzaakte een korte flits van de modal-overlay bij elk bezoek).
function buildMusicianDetailHTML(m, isOwn, inModal) {
  const col  = safeColor(m.profile_color, '#f5c518');
  const age  = ageOf(m);
  const updatedLabel = relativeUpdatedLabel(m.updated_at);

  // TT-43 (08-08-2026): op je eigen profiel altijd je eigen voornaam; voor een
  // ander hangt het af van of die is ingelogd met een eigen profiel — dat
  // regelt displayNameOf() op basis van wat de database heeft meegegeven.
  const displayName = isOwn ? m.fname : displayNameOf(m);
  const avatarSrc = safeUrl(m.avatar_url);
  // TT-217 (06-09-2026): klik op de profielfoto vergroot 'm, zelfde bestaande
  // lightbox als bij de foto's onder "Foto's" (openMediaLightbox()) — geen
  // nieuwe component, hergebruik van het bestaande patroon.
  const avatarHTML = avatarSrc
    ? `<img class="profile-avatar-photo" src="${avatarSrc}" alt="${escHtml(displayName)}" style="border-color:${col};margin-bottom:0;flex-shrink:0;cursor:pointer;" onclick="openMediaLightbox('${jsAttr(avatarSrc)}')">`
    : `<div class="profile-avatar-initials" style="background:${col};border-color:${col};margin-bottom:0;flex-shrink:0;">${AVATAR_T_FALLBACK}</div>`;

  const songRows = [...m.musician_songs].sort((a, b) =>
    compareArtistTitle(a.song_artist, a.song_title, b.song_artist, b.song_title)
  ).map(s => {
    // mastery_level komt in een class-attribuut terecht — alleen bekende
    // waarden toelaten, anders kan iemand het attribuut openbreken.
    const lvl = LEVEL_LABELS[s.mastery_level] ? s.mastery_level : '';
    return `
    <div class="profile-song-row">
      <span><strong>${escHtml(s.song_artist)}</strong> — <span style="color:var(--muted)">${escHtml(s.song_title)}</span></span>
      <span class="level-pill ${lvl}">${escHtml(LEVEL_LABELS[lvl] || '')}</span>
    </div>`;
  }).join('');

  // Alleen links met een geldige http(s)-URL tonen. Een `javascript:`-URL in
  // een href voert code uit zodra iemand erop klikt — die laten we hier vallen
  // in plaats van hem als lege link te tonen.
  const links = m.musician_media
    .filter(x => x.media_type === 'link')
    .map(x => ({ ...x, safeHref: safeUrl(x.url) }))
    .filter(x => x.safeHref);

  // TT-02: geüploade foto's/video's tonen — voorheen liet dit scherm alleen
  // media_type 'link' zien, terwijl geüploade bestanden nu écht bestaan.
  const photos = m.musician_media
    .filter(x => x.media_type === 'foto')
    .map(x => ({ ...x, safeHref: safeUrl(x.url) }))
    .filter(x => x.safeHref);
  const videos = m.musician_media
    .filter(x => x.media_type === 'video')
    .map(x => ({ ...x, safeHref: safeUrl(x.url) }))
    .filter(x => x.safeHref);

  // De -32px bleed-marge laat de balk precies tot de rand van een modal
  // reiken (.modal-box heeft daar exact 32px opvulling). Mijn Profiel
  // (.my-profile-wrap) heeft een andere opvulling (24-40px, niet 32px) —
  // dezelfde vaste -32px trok de balk daar te ver omhoog, tot naast de
  // koprij (gemeld door Ronald, 22-08-2026: "gele lijn" die met scrollen
  // meebeweegt). Buiten de modal dus geen bleed, gewoon een balk die past
  // binnen de bestaande opvulling.
  const headerBandStyle = inModal
    ? `background:${col};margin:-32px -32px 24px;border-radius:8px 8px 0 0;height:8px;`
    : `background:${col};margin:0 0 24px;border-radius:8px;height:8px;`;

  // 22-08-2026 (Ronald): het onderste actieblok (Profiel bewerken + het
  // ⋯-menu, TT-119) is weg. Alle drie de acties — wijzigen, band-
  // uitnodigingen aan/uit, account verwijderen — staan nu in één klein
  // menu naast de naam. Alleen op de eigen profielpagina (isOwn, niet in
  // de modal) — bij het bekijken van een ander profiel, of het eigen
  // profiel via de modal, hoort dit menu niet thuis.
  const showOwnerMenu = isOwn && !inModal;
  const ownerMenuHTML = showOwnerMenu ? `
    <div class="profile-actions-menu-wrap" style="flex-shrink:0;">
      <button class="nav-menu-btn" id="profileMoreBtn" onclick="toggleProfileMoreMenu(event)" aria-label="Meer opties voor je profiel" title="Meer">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
      </button>
      <div class="inline-menu-dropdown" id="profileMoreDropdown">
        <button class="nav-menu-item" onclick="closeProfileMoreMenu();editMyProfile()">Profiel bewerken</button>
        <!-- TT-56 (12-08-2026): opt-out band-uitnodigingen. Alleen deze
             knop, geen zichtbaar label op het profiel zelf voor anderen. -->
        <button class="nav-menu-item" id="bandInviteToggleBtn" onclick="closeProfileMoreMenu();toggleBandInviteAvailability()">Open voor band-uitnodigingen</button>
      </div>
    </div>` : '';

  return `
    <div class="profile-header-band" style="${headerBandStyle}"></div>
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:16px;">
      ${avatarHTML}
      <div style="min-width:0;flex:1;">
        <div class="profile-name">${escHtml(displayName)}</div>
        <!-- TT-166 (28-08-2026, Ronald: "eenvoud"): een gebruikersnaam-subline
             hoort er alleen bij als de grote naam de échte voornaam is — laat
             displayName die keuze maken (isOwn, of een ingelogde kijker met
             eigen profiel). Ziet iemand toch al de gebruikersnaam als grote
             naam (uitgelogd/anoniem, geen eigen profiel), dan zou een subline
             die naam alleen maar herhalen. Geen uitlegzin meer, alleen het
             label. -->
        ${(displayName === m.fname && m.fname) ? `<p style="font-size:12px;color:var(--muted);margin-top:4px;">Gebruikersnaam: <strong style="color:${col};">${escHtml(m.username || '(nog geen gebruikersnaam)')}</strong></p>` : ''}
        <div class="profile-meta" style="margin-bottom:0;">${age} jaar · ${escHtml(m.city)}${m.distance_km != null ? ` · ${m.distance_km.toFixed(1)} km` : ''}</div>
      </div>
      ${ownerMenuHTML}
    </div>
    <div class="freshness-bar" style="margin-top:12px;margin-bottom:16px;">
      <div class="freshness-dot"></div>
      <span>${escHtml(updatedLabel)}</span>
    </div>
    <div class="profile-badges">
      ${m.musician_instruments.map(x => `<span class="badge" style="border-color:${col};color:${col};">${escHtml(x.instrument)}${starDisplayHTML(x.niveau) ? ' ' + starDisplayHTML(x.niveau) : ''}</span>`).join('')}
      ${m.musician_genres.map(x => `<span class="badge genre">${escHtml(x.genre)}</span>`).join('')}
    </div>
    ${m.bio ? `<p style="font-size:15px;color:var(--text);margin:12px 0;">${escHtml(m.bio)}</p>` : ''}
    ${m.musician_songs.length ? `
      <div class="profile-songs">
        <div class="profile-songs-title">Repertoire (${m.musician_songs.length} nummers)</div>
        ${songRows}
      </div>` : ''}
    ${photos.length ? `
      <div class="profile-media" style="margin-top:16px;">
        <div class="profile-media-title">Foto's</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px;">
          ${photos.map(p => `<button type="button" onclick="openMediaLightbox('${jsAttr(p.safeHref)}')" style="display:block;aspect-ratio:1;border-radius:8px;overflow:hidden;border:1px solid var(--border);padding:0;background:none;cursor:pointer;"><img src="${p.safeHref}" alt="Foto" style="width:100%;height:100%;object-fit:cover;"></button>`).join('')}
        </div>
      </div>` : ''}
    ${videos.length ? `
      <div class="profile-media" style="margin-top:16px;">
        <div class="profile-media-title">Video's</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;">
          ${videos.map(v => `<video src="${v.safeHref}" controls playsinline preload="metadata" style="width:100%;border-radius:8px;border:1px solid var(--border);background:#000;display:block;"></video>`).join('')}
        </div>
      </div>` : ''}
    ${links.length ? `
      <div class="profile-media" style="margin-top:16px;">
        <div class="profile-media-title">Links</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px;">
          ${links.map(l => {
            const ytId = extractYouTubeId(l.safeHref);
            const label = l.platform || 'Link';
            const inner = ytId
              ? `<img src="https://img.youtube.com/vi/${jsAttr(ytId)}/hqdefault.jpg" alt="${escAttr(label)}" style="width:100%;height:100%;object-fit:cover;display:block;">`
              : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--surface2);text-align:center;padding:4px;"><span style="font-size:12px;font-weight:700;color:var(--text);">${escHtml(label)}</span></div>`;
            const tileStyle = 'display:block;aspect-ratio:1;border-radius:8px;overflow:hidden;border:1px solid var(--border);padding:0;background:none;';
            // TT-158 (27-08-2026) trok hier een grens bij "ingelogd": alleen
            // dan klikbaar. TT-218 (06-09-2026), op verzoek van Ronald: die
            // grens losgelaten — een link opent nu onder alle omstandigheden,
            // ook uitgelogd.
            return `<a href="${l.safeHref}" target="_blank" rel="noopener noreferrer" style="${tileStyle}">${inner}</a>`;
          }).join('')}
        </div>
      </div>` : ''}`;
}

// V-09 (13-08-2026): losgetrokken uit buildMusicianDetailHTML() zodat de
// contactknop apart, buiten de scrollende inhoud, in een vaste voettekst kan
// staan — anders moest je bij een gevuld profiel er lang naartoe scrollen.
// loadMyProfile() (Mijn Profiel, isOwn altijd waar) roept dit bewust niet
// aan: daar hoort nooit een contactknop.
// V-12 (13-08-2026): een gedeelde link naar een specifiek profiel of
// bandprofiel. navigator.share() geeft op een telefoon het systeem-deelmenu
// (WhatsApp, sms, mail, ...); is dat er niet (meestal op desktop), dan
// kopiëren we de link zelf naar het klembord met een duidelijke toast — nooit
// een stille no-op. De link zelf is een hash-route (#profiel/<id> of
// #band/<id>) die appInit() bij het openen direct naar de juiste detailmodal
// stuurt, zie het hash-blok daar.
async function shareProfile(kind, id, name) {
  const path = kind === 'band' ? 'band' : 'profiel';
  const url = `${location.origin}${location.pathname}#${path}/${id}`;
  const label = kind === 'band' ? 'bandprofiel' : 'profiel';
  const shareData = {
    title: `${name} op The Talent Tent`,
    text: `Bekijk het ${label} van ${name} op The Talent Tent.`,
    url
  };
  if (navigator.share) {
    try { await navigator.share(shareData); } catch (e) { /* eigen annulering, geen foutmelding nodig */ }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
    showToast('Link gekopieerd naar klembord');
  } catch (e) {
    logCaught('shareProfile', e);
    showToast('Kopiëren niet gelukt. Probeer het later opnieuw.');
  }
}

function musicianContactFooterHTML(m, isOwn, displayName) {
  const shareBtn = `<button class="btn btn-ghost" style="width:100%;" onclick="shareProfile('profiel','${jsAttr(m.id)}','${jsAttr(displayName)}')">Deel dit profiel</button>`;
  if (isOwn) return shareBtn;
  const contactBtn = hasOwnProfile
    ? `<button class="btn btn-primary" style="width:100%;" onclick="openMessageComposer('${jsAttr(m.id)}','${jsAttr(displayName)}')">Stuur een bericht →</button>`
    : `<button class="btn btn-primary" style="width:100%;" onclick="document.getElementById('musicianModal').classList.remove('visible'); showView('register')">Maak een profiel aan om contact te leggen</button>`;
  return `<div style="display:flex;flex-direction:column;gap:8px;">${contactBtn}${shareBtn}</div>`;
}

async function openMusicianModal(id) {
  const modal = document.getElementById('musicianModal');
  const content = document.getElementById('musicianModalContent');
  const footer = document.getElementById('musicianModalFooter');
  modal.classList.add('visible');

  // TT-158 (27-08-2026): voorheen blokkeerde deze functie hier volledig voor
  // een uitgelogde bezoeker (!currentUser) — alleen een tekstscherm met
  // "Account maken"/"Inloggen", geen profiel. Dat is nu weg. hasOwnProfile
  // staat voor een uitgelogde bezoeker altijd al op false (standaardwaarde
  // bij de declaratie, en getMyMusicianId() geeft zonder currentUser meteen
  // null terug) — de bestaande hasOwnProfile-aftakking hieronder bediende dit
  // pad al voor een ingelogde gebruiker zonder eigen profiel. Diezelfde
  // aftakking bedient nu ook de volledig uitgelogde bezoeker: de publieke RPC
  // (geen fname, dus displayNameOf() toont de gebruikersnaam) en
  // musicianContactFooterHTML() (geen berichtknop, wel "Maak een profiel aan
  // om contact te leggen").
  footer.innerHTML = '';
  content.innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--muted);">Laden...</div>';

  let m = null, error = null;

  if (hasOwnProfile) {
    // B-01 tweede stap (18-08-2026): geen birth_date meer in deze select —
    // deze modal opent ook wanneer je iemand anders' profiel bekijkt, dus
    // een ingelogde gebruiker mag hier nooit de ruwe geboortedatum van een
    // ander binnenkrijgen. Leeftijd komt apart via tt_musicians_ages().
    const res = await db.from('musicians').select(`
      id, fname, username, city, bio, goal,
      rehearsal_frequency, musical_ambition,
      profile_color, avatar_url, updated_at,
      musician_instruments(instrument, niveau),
      musician_genres(genre),
      musician_songs(song_title, song_artist, mastery_level),
      musician_media(media_type, url, platform)
    `).eq('id', id).single();
    m = res.data; error = res.error;
    if (m) {
      const { data: ages } = await db.rpc('tt_musicians_ages', { ids: [id] });
      m.age = (ages && ages[0]) ? ages[0].age : undefined;
    }
  } else {
    // Zonder eigen profiel: publieke RPC (tabel zelf blijft op slot voor anon).
    const res = await db.rpc('tt_get_musicians_public', { ids: [id] });
    error = res.error;
    const row = (res.data || [])[0];
    if (row) {
      m = {
        // B-02: leeftijd i.p.v. geboortedatum; birth_date blijft als terugval
        // zolang script C nog niet is gedraaid. TT-43: geen fname voor bezoekers.
        id: row.id, username: row.username, age: row.age, birth_date: row.birth_date, city: row.city,
        bio: row.bio, goal: row.goal, profile_color: row.profile_color, avatar_url: row.avatar_url,
        rehearsal_frequency: row.rehearsal_frequency, musical_ambition: row.musical_ambition,
        updated_at: row.updated_at,
        // TT-51 (12-08-2026, RPC-restpunt gesloten): instrument_levels bevat
        // instrument + niveau samen, zodat de sterren ook in deze detailmodal
        // verschijnen voor een bezoeker zonder eigen profiel.
        musician_instruments: (row.instrument_levels || []).map(x => ({ instrument: x.instrument, niveau: x.niveau })),
        musician_genres: (row.genres || []).map(g => ({ genre: g })),
        musician_songs: row.songs || [],
        // TT-210 (04-09-2026): voorheen gaf de RPC alleen media_type 'link'
        // terug (kolom 'links') — foto's en video's ontbraken voor een
        // bezoeker zonder eigen profiel. De RPC geeft nu alle mediatypes in
        // één kolom 'media', met exact dezelfde vorm als musician_media
        // (media_type/url/platform) — geen aparte remap meer nodig.
        musician_media: row.media || [],
      };
    }
  }

  if (error || !m) {
    footer.innerHTML = '';
    document.getElementById('musicianModalContent').innerHTML = '<p style="color:var(--danger)">Kon profiel niet laden.</p>';
    return;
  }

  // Afstand tonen (indien bekend uit een eerdere zoekopdracht) i.p.v. de postcode.
  m.distance_km = musicianDistanceCache[m.id] != null ? musicianDistanceCache[m.id] : null;

  const isOwn = !!(myMusicianId && myMusicianId === m.id);
  document.getElementById('musicianModalContent').innerHTML = buildMusicianDetailHTML(m, isOwn, true);
  // TT-249: de naam kan pas passend gemaakt worden als hij in de pagina staat
  // — een element dat er nog niet is, heeft geen breedte om tegen te meten.
  fitProfileName(document.getElementById('musicianModalContent'));
  // V-09: zelfde displayName-logica als binnen buildMusicianDetailHTML()
  // (TT-43: bezoekers zonder profiel zien alleen de gebruikersnaam).
  const displayName = isOwn ? m.fname : displayNameOf(m);
  footer.innerHTML = musicianContactFooterHTML(m, isOwn, displayName);
}

function closeMusicianModal(e) {
  if (e.target === document.getElementById('musicianModal')) {
    document.getElementById('musicianModal').classList.remove('visible');
  }
}

// V-08 (13-08-2026): een foto opent nu in een eigen weergave in de app zelf,
// niet meer in een nieuw browsertabblad (dat zou iemand in een app-schil
// buiten de app zetten).
function openMediaLightbox(url) {
  document.getElementById('mediaLightboxImg').src = url;
  document.getElementById('mediaLightbox').classList.add('visible');
}
function closeMediaLightbox() {
  document.getElementById('mediaLightbox').classList.remove('visible');
  document.getElementById('mediaLightboxImg').src = '';
}

// ─── Mijn profiel laden ──────────────────────────────────────────────────────

// TT-22 (09-08-2026): vervangt de oude deleteMyProfile(), die bewust alleen
// het profiel verwijderde en het auth-account liet bestaan. Nu: ook Storage-
// bestanden, en een keuze per band waarvan deze muzikant oprichter is (zie
// hieronder). Het auth-account zelf blijft een bekend restpunt — zie
// toelichting bij executeAccountDeletion().
async function openDeleteAccountModal() {
  const mid = await getMyMusicianId();
  if (!mid) { showToast('Je hebt geen profiel om te verwijderen.'); return; }

  const area = document.getElementById('deleteAccountBandsArea');
  area.innerHTML = '<div style="color:var(--muted);font-size:13px;">Bezig met controleren...</div>';
  document.getElementById('deleteAccountConfirmBtn').disabled = false;
  document.getElementById('deleteAccountConfirmBtn').textContent = 'Account verwijderen';
  document.getElementById('deleteAccountModal').classList.add('visible');

  try {
    const { data: founded, error } = await db.from('bands')
      .select('id, name, band_members(musician_id, status, musicians(id, fname, username))')
      .eq('founder_id', mid);
    if (error) throw error;

    // Bands met nog andere bevestigde leden: daar moet de oprichter zelf
    // kiezen (Ronald, 09-08-2026: "de vraag wordt aan de oprichter gesteld").
    // Solo-bands (niemand anders bevestigd) verdwijnen stilzwijgend mee —
    // daar is niemand anders om iets aan over te dragen.
    const decisions = (founded || [])
      .map(b => ({ id: b.id, name: b.name, others: (b.band_members || []).filter(m => m.status === 'bevestigd' && m.musician_id !== mid) }))
      .filter(b => b.others.length > 0);
    const soloBandIds = (founded || [])
      .filter(b => !(b.band_members || []).some(m => m.status === 'bevestigd' && m.musician_id !== mid))
      .map(b => b.id);

    pendingSoloBandIds = soloBandIds;

    area.innerHTML = !decisions.length ? '' : `
      <div style="font-size:13px;color:var(--muted);margin-bottom:8px;">Je bent beheerder van ${decisions.length === 1 ? 'een band' : `${decisions.length} bands`} met andere leden. Kies per band wat er gebeurt:</div>
      ${decisions.map(b => `
        <div class="delete-account-band-row" data-band-id="${jsAttr(b.id)}" style="margin:8px 0;padding:12px;border:1px solid var(--border);border-radius:8px;">
          <div style="font-weight:700;margin-bottom:8px;">${escHtml(b.name)}</div>
          <select class="delete-band-choice" style="width:100%;padding:8px;background-color:var(--surface2);color:var(--text);border:1px solid var(--border);border-radius:6px;">
            <option value="delete">Band ook verwijderen</option>
            ${b.others.map(o => `<option value="${jsAttr(o.musician_id)}">Overdragen aan ${escHtml(displayNameOf(o.musicians))}</option>`).join('')}
          </select>
        </div>`).join('')}`;
  } catch (e) {
    logCaught('openDeleteAccountModal', e);
    area.innerHTML = `<div style="color:var(--danger);font-size:13px;">${escHtml(friendlyErrorMessage(e))}</div>`;
  }
}

function closeDeleteAccountModal() {
  document.getElementById('deleteAccountModal').classList.remove('visible');
}

// Tussenopslag tussen openDeleteAccountModal() en executeAccountDeletion() —
// bewust geen onderdeel van de wizard-state, dit hoort daar niet bij.
let pendingSoloBandIds = [];

// TT-22 (aangescherpt 09-08-2026, Ronald): één waarschuwing bij het openen
// van de modal is niet genoeg voor de meest onomkeerbare actie in de hele
// app — zeker niet met 13-jarigen in de doelgroep. Daarom een verplichte
// tweede, expliciete bevestiging vlak vóór de daadwerkelijke verwijdering,
// los van de (mogelijke) bandkeuzes die de gebruiker al heeft gemaakt.
// De onderliggende <select>-elementen blijven in de DOM bestaan zolang de
// modal alleen verborgen wordt (classList, niet verwijderd) — executeAccount
// Deletion() kan ze dus gewoon uitlezen, ook nadat deze modal al dicht is.
function requestFinalDeleteConfirmation() {
  closeDeleteAccountModal();
  showConfirm(
    'Weet je zeker dat je dit account, inclusief alle gegevens, permanent wilt verwijderen? Dit kan niet ongedaan worden gemaakt.',
    executeAccountDeletion,
    'Ja, definitief verwijderen',
    true
  );
}

// Haalt de werkelijke foutboodschap uit een db.functions.invoke()-fout. De
// standaardfout van supabase-js ("Edge Function returned a non-2xx status
// code") zegt niets over de échte oorzaak — die staat in de JSON die de
// functie zelf teruggaf, bereikbaar via fnErr.context (het Response-object).
async function extractFnErrorDetail(fnErr) {
  if (!fnErr) return '';
  try {
    if (fnErr.context && typeof fnErr.context.json === 'function') {
      const body = await fnErr.context.clone().json();
      if (body && body.error) return body.error;
    }
  } catch (e) { /* niet te lezen, val terug op de generieke boodschap */ }
  return fnErr.message || String(fnErr);
}

// TT-22-restpunt (06-09-2026): probeert het auth-account van de ingelogde
// gebruiker te verwijderen via de Edge Function 'delete-own-account', met
// twee herkansingen (drie pogingen totaal, 1s/2s pauze ertussen) bij een
// mislukking. Geen enkele hoeveelheid pogingen kan een echte storing of het
// ontbreken van internet oplossen — dit vangt alleen het meest voorkomende
// geval op: een kortstondige hapering die bij een volgende poging al weg is.
// Geeft naast ok/niet-ok ook de laatste technische foutdetail terug, zodat
// een blijvende mislukking niet blind hoeft te worden opgelost (06-09-2026,
// na meerdere niet-reproduceerbare mislukkingen zonder zichtbare oorzaak).
async function deleteOwnAuthAccountWithRetry(maxAttempts = 3) {
  let lastDetail = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Let op: deze naam moet exact overeenkomen met de werkelijke naam/URL
      // van de functie bij Supabase (Settings-tab van de functie) — niet
      // slechts de weergavenaam in de functieoverzichtslijst. Bij een eerdere
      // versie van dit ticket bleek dat te verschillen ("hyper-handler" als
      // echte naam, "delete-own-account" als lijstweergave); Ronald heeft de
      // functie zelf hernoemd zodat beide nu gelijk zijn.
      const { error: fnErr } = await db.functions.invoke('delete-own-account');
      if (!fnErr) return { ok: true, detail: '' };
      lastDetail = await extractFnErrorDetail(fnErr);
    } catch (e) {
      lastDetail = (e && e.message) ? e.message : String(e);
    }
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 1000 * attempt));
  }
  return { ok: false, detail: lastDetail };
}

async function executeAccountDeletion() {
  const mid = await getMyMusicianId();
  if (!mid) return;

  try {
    // 1. Bands met overige leden: gekozen actie per band.
    const rows = document.querySelectorAll('#deleteAccountBandsArea .delete-account-band-row');
    for (const row of rows) {
      const bandId = row.getAttribute('data-band-id');
      const choice = row.querySelector('.delete-band-choice').value;
      if (choice === 'delete') {
        await db.from('band_wanted').delete().eq('band_id', bandId);
        await db.from('band_members').delete().eq('band_id', bandId);
        await db.from('bands').delete().eq('id', bandId);
      } else {
        await db.from('bands').update({ founder_id: choice }).eq('id', bandId);
        await db.from('band_members').update({ role: 'Oprichter' }).eq('band_id', bandId).eq('musician_id', choice);
      }
    }

    // 2. Solo-bands (geen andere bevestigde leden): stilzwijgend mee weg.
    for (const bandId of pendingSoloBandIds) {
      await db.from('band_wanted').delete().eq('band_id', bandId);
      await db.from('band_members').delete().eq('band_id', bandId);
      await db.from('bands').delete().eq('id', bandId);
    }

    // 3. Eigen profielgegevens (kindtabellen eerst, dan de musicians-rij zelf).
    await db.from('musician_instruments').delete().eq('musician_id', mid);
    await db.from('musician_genres').delete().eq('musician_id', mid);
    await db.from('musician_songs').delete().eq('musician_id', mid);
    await db.from('musician_media').delete().eq('musician_id', mid);
    await db.from('band_members').delete().eq('musician_id', mid);
    const { error: mErr } = await db.from('musicians').delete().eq('id', mid);
    if (mErr) throw mErr;

    // 4. Geüploade bestanden in Storage (avatar + media). Berichten blijven
    // bewust staan — zie displayNameOf-gebruik in loadInbox(): een
    // gesprekspartner ziet voortaan "Verwijderde gebruiker" i.p.v. een lege
    // naam (Ronald, 09-08-2026: niet ook de geschiedenis van de ander wissen).
    const userId = currentUser ? currentUser.id : null;
    if (userId) await deleteAllStorageForUser(userId);

    // 5. Auth-account (login/wachtwoord) zelf verwijderen — TT-22-restpunt,
    // gesloten 06-09-2026. Dit kan niet vanaf de client (vereist de service-
    // role-sleutel), dus roept de Edge Function 'delete-own-account' aan.
    // Die functie controleert zelf, via de meegestuurde sessie, wélke
    // gebruiker de aanroeper is — hier wordt geen id meegestuurd dat de
    // functie zou moeten vertrouwen. Moet vóór signOut() gebeuren: de
    // functie heeft de huidige, nog geldige sessie nodig.
    //
    // Ronald (06-09-2026): "zorg dat het in een keer lukt." Drie pogingen
    // i.p.v. één, met een korte pauze ertussen — vangt een kortstondige
    // netwerk-/serverhapering op, wat de meest voorkomende reden voor een
    // eenmalige mislukking is. Dit is geen garantie (een echte storing bij
    // Supabase of geen internetverbinding laat ook drie pogingen mislukken),
    // maar wel de maximale betrouwbaarheid die vanaf de client haalbaar is.
    const authResult = await deleteOwnAuthAccountWithRetry();

    pendingSoloBandIds = [];
    closeDeleteAccountModal();
    myMusicianId = null;
    myOwnCity = null;
    // Voorkomt dat een volgende login op ditzelfde (mogelijk nog bestaande,
    // zie stap 5 hierboven) auth-account een oude wizard-stand terugvindt —
    // readSavedOnboarding() matcht alleen op userId, niet op of er nog een
    // profiel bestaat. Zonder dit zou de "Verdergaan"-banner op Mijn Profiel
    // (of, vóór TT-210, de automatische sprong) verwijzen naar de laatst
    // bewaarde stap van het inmiddels verwijderde profiel (gevonden
    // 06-09-2026, Ronald: "kom ik meteen op de laatste stap: media
    // toevoegen").
    clearOnboardingProgress();
    try { await signOut(); } catch (e) { /* sessie kan al ongeldig zijn ná stap 5 hierboven */ }

    if (authResult.ok) {
      showToast('Je account is verwijderd.');
    } else {
      // Profiel is al onomkeerbaar weg (stap 1-4 zijn al uitgevoerd) — dit
      // niet verbergen achter de gewone succesmelding, maar ook niet de hele
      // afronding blokkeren voor iets dat al niet meer terug te draaien is.
      // Vriendelijke, jargon-vrije tekst (Plezier-principe) — de tijdelijke
      // alert()-versie met technische detail (06-09-2026) heeft zijn werk
      // gedaan: de echte oorzaak (functienaam-mismatch bij Supabase) is
      // gevonden en opgelost. Dit is weer de bedoelde eindtekst. De detail
      // blijft wel in de console staan, voor het geval dit ooit terugkomt.
      console.error('Auth-account niet verwijderd:', authResult.detail);
      showToast('Je profiel is verwijderd. Je inloggegevens konden niet automatisch verwijderd worden — mail privacy@talenttent.org als je dit ook wilt laten verwijderen.');
    }
    showView('landing');
  } catch (e) {
    logCaught('executeAccountDeletion', e);
    // De modal is op dit punt al dicht (zie requestFinalDeleteConfirmation);
    // een mislukking melden we dus via de toast, niet via een knopstatus.
    showToast(friendlyErrorMessage(e) + ' Je account is niet volledig verwijderd — probeer het opnieuw of neem contact op.');
  }
}

// TT-22: alle geüploade bestanden van een gebruiker verwijderen uit Storage
// (avatars + media). Pad is altijd {userId}/... (zie uploadToStorage), dus de
// hele map van deze gebruiker kan per bucket in één keer leeggehaald worden.
async function deleteAllStorageForUser(userId) {
  for (const bucket of ['avatars', 'media']) {
    try {
      const { data: files } = await db.storage.from(bucket).list(userId);
      if (files && files.length) {
        const paths = files.map(f => `${userId}/${f.name}`);
        await db.storage.from(bucket).remove(paths);
      }
    } catch (e) {
      // Bestand kan al weg zijn. Niet blokkerend voor de rest, wel loggen.
      logCaught('deleteAllStorageForUser', e);
    }
  }
}

// TT-143 (25-08-2026): cancelEditProfile()/de Annuleren-knop is vervallen.
// "Terug" en "Verder" dekken de navigatie nu zelf af (zie prevStep()/
// nextStep()).

// ═══════════════════════════════════════════════════════════════════════
// TT-168-overgang (02-09-2026): tegeloverzicht + vijf bewerkschermen
// ═══════════════════════════════════════════════════════════════════════

// 1-op-1 uit profiel-v2.html overgezet, met twee aanpassingen om dubbele
// code te voorkomen: de stads-suggestielijst hergebruikt de bestaande
// onCitySearchInput()/closeAC()/.autocomplete-list-patroon (i.p.v. een
// eigen .ac-items-systeem), en de instrument-/genrepicker + niveau-modals
// zijn dezelfde cfg-registry als de wizard (zie initInstrumentPicker()/
// initPicker() hierboven) — één modal, twee registraties.

const TILES = [
  { id: 'wieBenJe',   title: 'Wie ben je',      sub: 'naam - plaats - bio' },
  { id: 'watSpeelJe', title: 'Wat speel je',    sub: 'instrumenten - niveau - genres - eigen nummers/covers' },
  // TT-227 (09-09-2026, Ronald): "Je setlist" hoort direct onder "Wat speel
  // je" — dat zijn allebei vragen over wat je zelf speelt. "Wat zoek je"
  // schuift een plek naar beneden. Deze volgorde stuurt het tegeloverzicht
  // volledig aan (renderTegels() leest deze lijst), dus dit is de enige plek.
  { id: 'jeSetlist',  title: 'Je setlist',      sub: 'covers - eigen nummers' },
  { id: 'watZoekJe',  title: 'Wat zoek je',     sub: 'muzikant - band - optreden - ambitie' },
  { id: 'mediahoek',  title: 'Je mediahoek',    sub: "video's - foto's - profielfoto" },
];

function renderTegels() {
  const wrap = document.getElementById('tegelsWrap');
  wrap.innerHTML = TILES.map(t => `
    <div class="tile" onclick="openTegelScreen('${jsAttr(t.id)}')">
      <div style="flex:1;">
        <div class="tile-title">${escHtml(t.title)}</div>
        <div class="tile-sub">${escHtml(t.sub)}</div>
      </div>
    </div>
  `).join('');
}

// ─── Schermnavigatie binnen het tegeloverzicht ────────────────────────────
// Zelfde soort interne stap-switcher als de wizard (goTo()), maar dan met
// een terugknop-stap in de browsergeschiedenis per subscherm (V-03-patroon,
// zie de popstate-handler hieronder) — bewerken van een tegel is net zo'n
// "sluit dit eerst"-scherm als een open modal of een open gesprek.
const TEGEL_SCREENS = { wieBenJe: 'wieBenJeScreen', watSpeelJe: 'watSpeelJeScreen', watZoekJe: 'watZoekJeScreen', jeSetlist: 'jeSetlistScreen', mediahoek: 'mediahoekScreen' };
let activeTegelScreen = 'overview';
let tegelScreenHistoryPushed = false;

function openTegelOverview() {
  activeTegelScreen = 'overview';
  tegelScreenHistoryPushed = false;
  Object.values(TEGEL_SCREENS).forEach(elId => { document.getElementById(elId).style.display = 'none'; });
  document.getElementById('tegelOverviewScreen').style.display = '';
  clearInterval(mhTipTimer);
  renderTegels();
}

function openTegelScreen(id) {
  if (!TEGEL_SCREENS[id]) return;
  activeTegelScreen = id;
  document.getElementById('tegelOverviewScreen').style.display = 'none';
  Object.values(TEGEL_SCREENS).forEach(elId => { document.getElementById(elId).style.display = 'none'; });
  document.getElementById(TEGEL_SCREENS[id]).style.display = '';
  if (!tegelScreenHistoryPushed) {
    safeHistoryPush({ view: 'profieltegels', tegel: true }, '#profieltegels');
    tegelScreenHistoryPushed = true;
  }
  if (id === 'wieBenJe') openWieBenJe();
  else if (id === 'watSpeelJe') openWatSpeelJe();
  else if (id === 'watZoekJe') openWatZoekJe();
  else if (id === 'jeSetlist') openJeSetlist();
  else if (id === 'mediahoek') openJeMediahoek();
}

function goToTegelOverview() {
  tegelScreenHistoryPushed = false;
  openTegelOverview();
}

// ─── Annuleer-/bevestigingsknop die zelf van functie wisselt (TT-181-vervolg)
// Gedeeld door alle vijf tegels: btnId = de knop, hasChanges = functie die
// true/false teruggeeft, onConfirm = actie bij bevestigen (of meteen als er
// niets gewijzigd is), confirmText = optionele eigen bevestigingstekst.
function handleCancelClick(btnId, hasChanges, onConfirm, confirmText) {
  // Ronald (03-09-2026): moet als twee regels tonen ("Terug zonder" /
  // "opslaan?"), niet drie. Onbreekbare spatie tussen "Terug" en "zonder"
  // voorkomt dat de browser daar ook afbreekt.
  const text = confirmText || 'Terug\u00A0zonder opslaan?';
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (!hasChanges()) { onConfirm(); return; }
  if (btn.dataset.armed === '1') {
    btn.dataset.armed = '';
    btn.textContent = btn.dataset.originalText;
    btn.classList.remove('btn-cancel-armed');
    onConfirm();
    return;
  }
  btn.dataset.armed = '1';
  btn.dataset.originalText = btn.textContent;
  btn.textContent = text;
  btn.classList.add('btn-cancel-armed');
  // Pas ná deze klik een listener toevoegen — anders vangt hij de huidige,
  // nog bubbelende klik meteen weer af.
  setTimeout(() => {
    document.addEventListener('click', function onOutsideClick(e) {
      if (btn.dataset.armed !== '1') return;
      if (e.target === btn) return;
      btn.dataset.armed = '';
      btn.textContent = btn.dataset.originalText;
      btn.classList.remove('btn-cancel-armed');
    }, { once: true });
  }, 0);
}
// Bij het openen van een tegel eventuele "Zeker?"-status opruimen — dekt
// browser-terug of een directe hash-wijziging, die geen klik-event geven.
function resetCancelButton(btnId) {
  const btn = document.getElementById(btnId);
  if (!btn || btn.dataset.armed !== '1') return;
  btn.dataset.armed = '';
  btn.textContent = btn.dataset.originalText || btn.textContent;
  btn.classList.remove('btn-cancel-armed');
}

// ═══════════════════════════════════════════════════════════════════════
// Tegel: Wie ben je
// ═══════════════════════════════════════════════════════════════════════
// Opslaan raakt uitsluitend fname/lname/username/birth_date/zip/city/bio —
// een eigen, smalle opslaanfunctie, geen hergebruik van de wizard-brede
// persistEditedProfile() (die zou de andere vier tegels leegmaken, want hun
// data staat nooit in deze kleine, lokale snapshot).

let wbjSnapshot = null;
let wbjUsernameOk = true;
let wbjPostcodeTimeout, wbjCitySearchTimeout;
let wbjPostcodeFailStreak = 0;
let wbjPostcodeManualMode = false;

function wbjFieldSnapshot() {
  return JSON.stringify({
    fname: document.getElementById('wbjFname').value.trim(),
    lname: document.getElementById('wbjLname').value.trim(),
    username: document.getElementById('wbjUsername').value.trim(),
    birth_date: document.getElementById('wbjBirthDate').value.trim(),
    zip: document.getElementById('wbjZip').value.trim(),
    city: document.getElementById('wbjCity').value.trim(),
    bio: document.getElementById('wbjBio').value.trim(),
  });
}

async function openWieBenJe() {
  resetCancelButton('wbjCancelBtn');
  document.getElementById('wbjUsernameStatus').textContent = '';
  document.getElementById('wbjPostcodeStatus').textContent = '';
  document.getElementById('wbjEmail').value = currentUser?.email || '';
  wbjPostcodeManualMode = false;
  wbjPostcodeFailStreak = 0;
  const wbjCityFieldReset = document.getElementById('wbjCity');
  wbjCityFieldReset.readOnly = true;
  wbjCityFieldReset.style.cursor = 'not-allowed';
  // TT-180: birth_date hoort niet in deze select — authenticated heeft geen
  // SELECT-recht op musicians.birth_date (geverifieerd via
  // information_schema.column_privileges), een kale select met deze kolom
  // erin faalt in zijn geheel. Apart ophalen via tt_get_my_birth_date().
  // Parallel i.p.v. na elkaar — twee onafhankelijke aanvragen.
  const [{ data, error }, { data: myBirthDate }] = await Promise.all([
    db.from('musicians')
      .select('fname, lname, username, zip, city, city_source, bio')
      .eq('id', myMusicianId).single(),
    db.rpc('tt_get_my_birth_date'),
  ]);
  if (error) {
    showToast('Kon je gegevens niet laden: ' + friendlyErrorMessage(error));
    return;
  }
  document.getElementById('wbjFname').value = data.fname || '';
  document.getElementById('wbjLname').value = data.lname || '';
  document.getElementById('wbjUsername').value = data.username || '';
  document.getElementById('wbjBirthDate').value = fromISODate(myBirthDate);
  document.getElementById('wbjZip').value = data.zip || '';
  document.getElementById('wbjCity').value = data.city || '';
  document.getElementById('wbjBio').value = data.bio || '';
  wbjRenderBioPreview();
  wbjUsernameOk = true;
  wbjSnapshot = wbjFieldSnapshot();
}

// Bio bewerken in een eigen modal — meer ruimte dan het kleine tekstvakje
// tussen de andere velden. #wbjBio (verborgen) blijft de echte waarde.
function openWbjBioModal() {
  document.getElementById('wbjBioModalTextarea').value = document.getElementById('wbjBio').value;
  document.getElementById('wbjBioModal').classList.add('visible');
  document.getElementById('wbjBioModalTextarea').focus();
}
function closeWbjBioModal() {
  document.getElementById('wbjBioModal').classList.remove('visible');
}
function wbjSyncBioFromModal() {
  const value = document.getElementById('wbjBioModalTextarea').value;
  document.getElementById('wbjBio').value = value;
  wbjRenderBioPreview();
}
function wbjRenderBioPreview() {
  const value = document.getElementById('wbjBio').value.trim();
  const preview = document.getElementById('wbjBioPreview');
  if (value) {
    preview.textContent = value.length > 70 ? value.slice(0, 70) + '…' : value;
    preview.style.color = 'var(--text)';
  } else {
    preview.textContent = 'Bijv. Ik speel al 3 jaar gitaar...';
    preview.style.color = 'var(--muted)';
  }
}
function wbjBioPrompt(text) {
  applyBioPromptTo(document.getElementById('wbjBioModalTextarea'), text);
  wbjSyncBioFromModal();
}

// Gebruikersnaam: zelfde live-check als elders in de app.
function onWbjUsernameInput() {
  wbjUsernameOk = false;
  checkUsernameAvailability('wbjUsernameStatus', 'wbjUsername', myMusicianId).then(ok => { wbjUsernameOk = ok; });
}

// Postcode → plaats, zelfde volgorde als elders: PDOK, dan cache, dan bij
// herhaalde storing een handmatige zoeklijst i.p.v. een vrij tekstveld.
// Eigen, lokale variabelen (wbjPostcodeFailStreak/wbjPostcodeManualMode) —
// niet de gedeelde wizard-variabelen, dit is een aparte context.
function onWbjPostcodeInput(rawValue) {
  const statusEl = document.getElementById('wbjPostcodeStatus');
  document.getElementById('wbjCity').value = '';
  clearTimeout(wbjPostcodeTimeout);
  const digits = rawValue.trim().replace(/\D/g, '');
  document.getElementById('wbjZip').value = digits;
  if (!/^[1-9][0-9]{3}$/.test(digits)) { statusEl.textContent = ''; return; }
  statusEl.style.color = 'var(--muted)';
  statusEl.textContent = 'Bezig met opzoeken...';
  wbjPostcodeTimeout = setTimeout(async () => {
    const outcome = await lookupPostcodeCity(digits);
    if (outcome.found) {
      wbjPostcodeFailStreak = 0;
      if (wbjPostcodeManualMode) wbjRelockCity();
      document.getElementById('wbjCity').value = outcome.city;
      statusEl.style.color = 'var(--accent)';
      statusEl.textContent = `Gevonden: ${outcome.city}`;
      setTimeout(() => { statusEl.textContent = ''; }, 2000);
    } else if (outcome.reason === 'notfound') {
      wbjEnableManualCity();
    } else {
      wbjPostcodeFailStreak++;
      if (wbjPostcodeFailStreak >= 2) {
        wbjEnableManualCity();
      } else {
        statusEl.style.color = 'var(--danger)';
        statusEl.textContent = 'Kon postcode nu niet controleren. Probeer het nog eens.';
      }
    }
  }, 500);
}
function wbjEnableManualCity() {
  wbjPostcodeManualMode = true;
  const field = document.getElementById('wbjCity');
  field.readOnly = false;
  field.style.cursor = '';
  field.value = '';
  field.placeholder = 'Typ je plaatsnaam en kies uit de lijst';
  const statusEl = document.getElementById('wbjPostcodeStatus');
  statusEl.style.color = 'var(--accent2)';
  statusEl.textContent = 'We kunnen je plaats even niet automatisch ophalen — vul hem hieronder zelf in.';
  field.focus();
}
function wbjRelockCity() {
  wbjPostcodeManualMode = false;
  const field = document.getElementById('wbjCity');
  field.readOnly = true;
  field.style.cursor = 'not-allowed';
}

function cancelWieBenJe() {
  handleCancelClick('wbjCancelBtn', () => wbjFieldSnapshot() !== wbjSnapshot, goToTegelOverview);
}

async function saveWieBenJe() {
  const fname = document.getElementById('wbjFname').value.trim();
  const username = document.getElementById('wbjUsername').value.trim();
  const birthDateStr = document.getElementById('wbjBirthDate').value.trim();
  const zip = document.getElementById('wbjZip').value.trim();
  const city = document.getElementById('wbjCity').value.trim();

  if (!fname) { showToast('Voornaam is verplicht.'); return; }
  // TT-249: zelfde controle als in de wizard. De gebruikersnaam hiernaast
  // wordt al live getoetst via checkUsernameAvailability().
  if (!naamPastInProfielkop(fname)) {
    showToast('Je voornaam is te lang om op je profiel te tonen. Maak hem korter.'); return;
  }
  if (!username || !wbjUsernameOk) { showToast('Kies eerst een beschikbare gebruikersnaam.'); return; }
  if (birthDateStr.length !== 10) { showToast('Vul een volledige geboortedatum in.'); return; }
  if (!/^[1-9][0-9]{3}$/.test(zip) || !city) { showToast('Vul een geldige postcode en plaats in.'); return; }

  if (wbjFieldSnapshot() === wbjSnapshot) return;

  const payload = {
    fname,
    lname: document.getElementById('wbjLname').value.trim() || null,
    username,
    birth_date: toISODate(birthDateStr),
    zip,
    city,
    bio: document.getElementById('wbjBio').value.trim() || null,
  };
  const { error } = await db.from('musicians').update(payload).eq('id', myMusicianId);
  if (error) {
    showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(error));
    return;
  }
  wbjSnapshot = wbjFieldSnapshot();
  showToast('Wijzigingen opgeslagen.');
}

// ═══════════════════════════════════════════════════════════════════════
// Tegel: Wat speel je
// ═══════════════════════════════════════════════════════════════════════
// Raakt uitsluitend musician_instruments, musician_genres en
// musicians.repertoire_type.

let wspState = { instruments: [], instrumentLevels: {}, genres: [] };
let wspRepertoireType = '';
let wspSnapshot = null;

function wspFieldSnapshot() {
  return JSON.stringify({
    instruments: wspState.instruments,
    instrumentLevels: wspState.instrumentLevels,
    genres: wspState.genres,
    repertoireType: wspRepertoireType,
  });
}

async function openWatSpeelJe() {
  resetCancelButton('wspCancelBtn');
  const { data, error } = await db.from('musicians')
    .select('repertoire_type, musician_instruments(instrument, niveau), musician_genres(genre)')
    .eq('id', myMusicianId).single();
  if (error) {
    showToast('Kon je gegevens niet laden: ' + friendlyErrorMessage(error));
    return;
  }
  wspState.instruments = (data.musician_instruments || []).map(x => x.instrument);
  wspState.instrumentLevels = {};
  (data.musician_instruments || []).forEach(x => { if (x.niveau) wspState.instrumentLevels[x.instrument] = x.niveau; });
  wspState.genres = (data.musician_genres || []).map(x => x.genre);
  wspRepertoireType = data.repertoire_type || '';

  initInstrumentPicker({
    id: 'wsp', fieldId: 'wspInstrumentField', badgeRowId: 'wspInstrumentBadgeRow',
    getInstruments: () => wspState.instruments, getLevels: () => wspState.instrumentLevels,
  });
  initPicker({
    id: 'wspGenre', fieldId: 'wspGenreField', badgeRowId: 'wspGenreBadgeRow',
    options: GENRES, getList: () => wspState.genres,
    placeholder: 'Kies een genre', sheetTitle: 'Kies een genre',
  });
  wspRenderRepertoireType();
  wspSnapshot = wspFieldSnapshot();
}

function wspSelectRepertoireType(el, val) {
  const already = el.classList.contains('selected');
  document.querySelectorAll('#wspRepertoireTypeGrid .tag').forEach(t => t.classList.remove('selected'));
  if (already) { wspRepertoireType = ''; return; }
  el.classList.add('selected');
  wspRepertoireType = val;
}
function wspRenderRepertoireType() {
  document.querySelectorAll('#wspRepertoireTypeGrid .tag').forEach(t => {
    t.classList.toggle('selected', t.dataset.val === wspRepertoireType);
  });
}

function cancelWatSpeelJe() {
  handleCancelClick('wspCancelBtn', () => wspFieldSnapshot() !== wspSnapshot, goToTegelOverview);
}

async function saveWatSpeelJe() {
  if (!wspState.instruments.length) { showToast('Selecteer minimaal één instrument.'); return; }
  if (!wspState.genres.length) { showToast('Selecteer minimaal één genre.'); return; }

  if (wspFieldSnapshot() === wspSnapshot) return;

  const { error: uErr } = await db.from('musicians')
    .update({ repertoire_type: wspRepertoireType || null }).eq('id', myMusicianId);
  if (uErr) { showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(uErr)); return; }

  await db.from('musician_instruments').delete().eq('musician_id', myMusicianId);
  await db.from('musician_genres').delete().eq('musician_id', myMusicianId);

  const { error: iErr } = await db.from('musician_instruments').insert(
    wspState.instruments.map(instrument => ({ musician_id: myMusicianId, instrument, niveau: wspState.instrumentLevels[instrument] || null }))
  );
  if (iErr) { showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(iErr)); return; }

  const { error: gErr } = await db.from('musician_genres').insert(
    wspState.genres.map(genre => ({ musician_id: myMusicianId, genre }))
  );
  if (gErr) { showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(gErr)); return; }

  wspSnapshot = wspFieldSnapshot();
  showToast('Wijzigingen opgeslagen.');
}

// ═══════════════════════════════════════════════════════════════════════
// Tegel: Wat zoek je
// ═══════════════════════════════════════════════════════════════════════
// Alle drie velden optioneel. Raakt uitsluitend musicians.goal,
// musicians.rehearsal_frequency, musicians.musical_ambition.

let wzjGoal = '';
let wzjRehearsalFrequency = '';
let wzjMusicalAmbition = '';
let wzjSnapshot = null;

function wzjFieldSnapshot() {
  return JSON.stringify({ goal: wzjGoal, rehearsalFrequency: wzjRehearsalFrequency, musicalAmbition: wzjMusicalAmbition });
}

async function openWatZoekJe() {
  resetCancelButton('wzjCancelBtn');
  const { data, error } = await db.from('musicians')
    .select('goal, rehearsal_frequency, musical_ambition')
    .eq('id', myMusicianId).single();
  if (error) {
    showToast('Kon je gegevens niet laden: ' + friendlyErrorMessage(error));
    return;
  }
  wzjGoal = data.goal || '';
  wzjRehearsalFrequency = data.rehearsal_frequency || '';
  wzjMusicalAmbition = data.musical_ambition || '';
  wzjRenderAll();
  wzjSnapshot = wzjFieldSnapshot();
}

function wzjRenderAll() {
  document.querySelectorAll('#wzjGoalOptions .goal-card').forEach(c => {
    c.classList.toggle('selected', c.dataset.val === wzjGoal);
  });
  document.querySelectorAll('#wzjRehearsalFreqGrid .tag').forEach(t => {
    t.classList.toggle('selected', t.dataset.val === wzjRehearsalFrequency);
  });
  document.querySelectorAll('#wzjAmbitionGrid .tag').forEach(t => {
    t.classList.toggle('selected', t.dataset.val === wzjMusicalAmbition);
  });
}

function wzjSelectGoal(el, val) {
  document.querySelectorAll('#wzjGoalOptions .goal-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  wzjGoal = val;
}
function wzjSelectRehearsalFrequency(el, val) {
  const already = el.classList.contains('selected');
  document.querySelectorAll('#wzjRehearsalFreqGrid .tag').forEach(t => t.classList.remove('selected'));
  if (already) { wzjRehearsalFrequency = ''; return; }
  el.classList.add('selected');
  wzjRehearsalFrequency = val;
}
function wzjSelectMusicalAmbition(el, val) {
  const already = el.classList.contains('selected');
  document.querySelectorAll('#wzjAmbitionGrid .tag').forEach(t => t.classList.remove('selected'));
  if (already) { wzjMusicalAmbition = ''; return; }
  el.classList.add('selected');
  wzjMusicalAmbition = val;
}

function cancelWatZoekJe() {
  handleCancelClick('wzjCancelBtn', () => wzjFieldSnapshot() !== wzjSnapshot, goToTegelOverview);
}

async function saveWatZoekJe() {
  if (wzjFieldSnapshot() === wzjSnapshot) return;

  const { error } = await db.from('musicians').update({
    goal: wzjGoal || null,
    rehearsal_frequency: wzjRehearsalFrequency || null,
    musical_ambition: wzjMusicalAmbition || null,
  }).eq('id', myMusicianId);
  if (error) { showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(error)); return; }

  wzjSnapshot = wzjFieldSnapshot();
  showToast('Wijzigingen opgeslagen.');
}

// ═══════════════════════════════════════════════════════════════════════
// Tegel: Je setlist
// ═══════════════════════════════════════════════════════════════════════
// Zelfde iTunes-zoekstroom als de wizard: eerst artiest zoeken, dan één
// keer per artiest de volledige nummerlijst ophalen en lokaal filteren.
// Raakt uitsluitend musician_songs. repertoire_type hoort hier niet meer
// bij — dat veld verhuisde naar "Wat speel je".

let jstSongs = [];
let jstSnapshot = null;
let jstSelectedArtist = null; // { id, name }
let jstSearchTimeout = null;
const jstArtistCache = new Map();
const jstTrackCache = new Map();

// _confirmDelete is bewust NIET meegenomen — tijdelijke UI-status voor de
// verwijder-bevestiging (jstRemoveSong()), geen opgeslagen gegeven.
function jstFieldSnapshot() {
  return JSON.stringify(jstSongs.map(s => ({ title: s.title, artist: s.artist, level: s.level })));
}

async function openJeSetlist() {
  resetCancelButton('jstCancelBtn');
  const { data, error } = await db.from('musicians')
    .select('musician_songs(song_title, song_artist, mastery_level)')
    .eq('id', myMusicianId).single();
  if (error) {
    showToast('Kon je gegevens niet laden: ' + friendlyErrorMessage(error));
    return;
  }
  jstSongs = (data.musician_songs || []).map(s => ({ title: s.song_title, artist: s.song_artist, level: s.mastery_level }));
  jstSelectedArtist = null;
  document.getElementById('jstArtistSearch').value = '';
  document.getElementById('jstTrackSearch').value = '';
  document.getElementById('jstTrackWrap').style.display = 'none';
  jstRenderSongs();
  jstSnapshot = jstFieldSnapshot();
}

function jstSelectFirstAc(id) {
  const list = document.getElementById(id);
  const first = list && list.querySelector('.ac-item[onmousedown]');
  if (first && first.onmousedown) first.onmousedown();
}

async function jstOnArtistSearch(q) {
  const ac = document.getElementById('jstArtistAc');
  if (q.trim().length < 2) { ac.classList.remove('open'); return; }
  ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted);">Zoeken...</span></div>';
  ac.classList.add('open');
  const cacheKey = q.trim().toLowerCase();
  if (jstArtistCache.has(cacheKey)) {
    jstRenderArtistResults(ac, jstArtistCache.get(cacheKey));
    return;
  }
  clearTimeout(jstSearchTimeout);
  jstSearchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=7&country=NL`);
      const data = await res.json();
      const artists = (data.results || []).slice(0, 6);
      jstArtistCache.set(cacheKey, artists);
      jstRenderArtistResults(ac, artists);
    } catch (e) {
      logCaught('jstOnArtistSearch', e);
      ac.innerHTML = '<div class="ac-item"><span style="color:var(--danger);">Zoekopdracht mislukt</span></div>';
    }
  }, 400);
}
function jstRenderArtistResults(ac, artists) {
  if (!artists.length) {
    ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted);">Geen artiesten gevonden</span></div>';
    return;
  }
  ac.innerHTML = artists.map(a => `
    <div class="ac-item" onmousedown="jstSelectArtist('${jsAttr(a.artistId)}','${jsAttr(a.artistName)}')">
      ${escHtml(a.artistName)}${a.primaryGenreName ? ` <span style="color:var(--muted);font-size:11px;">(${escHtml(a.primaryGenreName)})</span>` : ''}
    </div>`).join('');
}
function jstSelectArtist(id, name) {
  jstSelectedArtist = { id, name };
  document.getElementById('jstArtistSearch').value = name;
  closeAC('jstArtistAc');
  const wrap = document.getElementById('jstTrackWrap');
  wrap.style.display = '';
  document.getElementById('jstTrackLabel').textContent = 'Nummer van ' + name;
  document.getElementById('jstTrackSearch').value = '';
  document.getElementById('jstTrackSearch').focus();
  closeAC('jstTrackAc');
}
async function jstFetchArtistSongs(artistId) {
  if (jstTrackCache.has(artistId)) return jstTrackCache.get(artistId);
  const fetchPromise = (async () => {
    const url = `https://itunes.apple.com/lookup?id=${encodeURIComponent(artistId)}&entity=song&limit=200&country=NL`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.results || []).filter(r => r.wrapperType === 'track');
  })();
  jstTrackCache.set(artistId, fetchPromise);
  const songs = await fetchPromise;
  jstTrackCache.set(artistId, songs);
  return songs;
}
async function jstOnTrackSearch(q) {
  const ac = document.getElementById('jstTrackAc');
  if (!jstSelectedArtist) return;
  if (!q.length) { ac.classList.remove('open'); return; }
  ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted);">Zoeken...</span></div>';
  ac.classList.add('open');
  try {
    const songs = await jstFetchArtistSongs(jstSelectedArtist.id);
    jstRenderTrackResults(ac, songs, q);
  } catch (e) {
    logCaught('jstOnTrackSearch', e);
    ac.innerHTML = '<div class="ac-item"><span style="color:var(--danger);">Zoekopdracht mislukt</span></div>';
  }
}
function jstRenderTrackResults(ac, songs, q) {
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
      if (jstSongs.find(s => s.title.toLowerCase() === title.toLowerCase() && s.artist.toLowerCase() === jstSelectedArtist.name.toLowerCase())) return false;
      return true;
    })
    .slice(0, 8);
  if (!results.length) {
    ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted);">Geen nummers gevonden</span></div>';
    return;
  }
  ac.innerHTML = results.map(r => `
    <div class="ac-item" onmousedown="jstAddSong('${jsAttr(r.trackName)}','${jsAttr(jstSelectedArtist.name)}')">${escHtml(r.trackName)}</div>`).join('');
}
function jstAddSong(title, artist) {
  if (jstSongs.find(s => s.title === title && s.artist === artist)) return;
  jstSongs.push({ title, artist, level: null });
  document.getElementById('jstArtistSearch').value = '';
  document.getElementById('jstTrackSearch').value = '';
  document.getElementById('jstTrackWrap').style.display = 'none';
  closeAC('jstTrackAc');
  closeAC('jstArtistAc');
  jstSelectedArtist = null;
  jstRenderSongs();
}
function jstRenderSongs() {
  const list = document.getElementById('jstSongsList');
  const empty = document.getElementById('jstSongsListEmpty');
  if (!jstSongs.length) {
    list.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  const displayOrder = jstSongs.map((s, i) => i)
    .sort((ia, ib) => compareArtistTitle(jstSongs[ia].artist, jstSongs[ia].title, jstSongs[ib].artist, jstSongs[ib].title));
  list.innerHTML = `
    <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-top:4px;">
      <div style="display:grid;grid-template-columns:1fr auto auto;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);">
        <span>Band / Artiest — Nummer</span><span style="margin-right:40px;">Beheersing</span><span></span>
      </div>
      ${displayOrder.map(i => { const s = jstSongs[i]; return `
        <div style="display:grid;grid-template-columns:1fr auto auto;align-items:center;padding:8px 12px;border-bottom:1px solid var(--border);gap:12px;">
          <div>
            <div style="font-size:15px;font-weight:600;">${escHtml(s.artist)}</div>
            <div style="font-size:12px;color:var(--muted);">${escHtml(s.title)}</div>
          </div>
          <div style="display:flex;gap:4px;${!s.level ? 'animation:levelPulse 1.5s ease-in-out infinite;' : ''}">
            <button type="button" class="level-btn ${s.level==='basis'?'active-basis':''}" title="Kent de structuur" onclick="jstSetLevel(${i},'basis')">Basis</button>
            <button type="button" class="level-btn ${s.level==='bijna'?'active-bijna':''}" title="Soepel, bijna klaar" onclick="jstSetLevel(${i},'bijna')">Bijna</button>
            <button type="button" class="level-btn ${s.level==='podium'?'active-podium':''}" title="Speelt het live zonder problemen" onclick="jstSetLevel(${i},'podium')">Podium</button>
          </div>
          ${s._confirmDelete
            ? `<button type="button" class="song-remove" style="width:auto;padding:0 8px;font-size:11px;font-weight:700;color:var(--danger);" onclick="jstRemoveSong(${i})" title="Bevestig verwijderen">Zeker?</button>`
            : `<button type="button" class="song-remove" onclick="jstRemoveSong(${i})" title="Verwijderen" aria-label="Verwijder ${escAttr(s.title)}">✕</button>`
          }
        </div>
        ${!s.level ? `<div style="font-size:12px;color:var(--muted);padding:4px 12px;">Beheersing nog niet gekozen — mag ook later</div>` : ''}
      `; }).join('')}
    </div>`;
}
function jstSetLevel(i, level) {
  jstSongs[i].level = level;
  jstRenderSongs();
}
// TT-226 (09-09-2026, Ronald): een aangezette "Zeker?" was niet meer te
// annuleren. Wie zich bedacht, moest het hele tegelscherm verlaten en
// opnieuw openen. Een klik ergens anders in de app zet de knop nu terug op
// ✕. Zelfde patroon als handleCancelClick() hierboven: de listener wordt
// pas ná de huidige klik geregistreerd, en verdwijnt vanzelf ({ once: true }).
function jstCancelConfirmDelete() {
  let gewijzigd = false;
  jstSongs.forEach(s => { if (s._confirmDelete) { delete s._confirmDelete; gewijzigd = true; } });
  if (gewijzigd) jstRenderSongs();
}

function jstArmOutsideCancel() {
  // Pas ná deze klik toevoegen — anders vangt de listener de huidige, nog
  // bubbelende klik meteen weer af en staat "Zeker?" er nooit.
  setTimeout(() => {
    document.addEventListener('click', function onOutsideClick(e) {
      // Een klik op een verwijderknop loopt via jstRemoveSong() zelf: die
      // bevestigt deze regel, of zet een andere regel aan. Hier niets doen,
      // anders draait deze listener die actie meteen weer terug.
      if (e.target.closest && e.target.closest('.song-remove')) return;
      jstCancelConfirmDelete();
    }, { once: true });
  }, 0);
}

function jstRemoveSong(i) {
  if (!jstSongs[i]) return;
  if (!jstSongs[i]._confirmDelete) {
    // TT-226: maximaal één regel tegelijk op "Zeker?" — een eerder
    // aangezette regel mag niet onopgemerkt open blijven staan.
    jstSongs.forEach(s => delete s._confirmDelete);
    jstSongs[i]._confirmDelete = true;
    jstRenderSongs();
    jstArmOutsideCancel();
    return;
  }
  jstSongs.splice(i, 1);
  jstRenderSongs();
}

function cancelJeSetlist() {
  handleCancelClick('jstCancelBtn', () => jstFieldSnapshot() !== jstSnapshot, goToTegelOverview);
}

async function saveJeSetlist() {
  if (jstFieldSnapshot() === jstSnapshot) return;

  await db.from('musician_songs').delete().eq('musician_id', myMusicianId);
  if (jstSongs.length) {
    const { error } = await db.from('musician_songs').insert(
      jstSongs.map(s => ({ musician_id: myMusicianId, song_title: s.title, song_artist: s.artist, mastery_level: s.level }))
    );
    if (error) { showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(error)); return; }
  }
  jstSnapshot = jstFieldSnapshot();
  showToast('Wijzigingen opgeslagen.');
}

// ═══════════════════════════════════════════════════════════════════════
// Tegel: Je mediahoek
// ═══════════════════════════════════════════════════════════════════════
// Foto's/video's/profielfoto gaan meteen naar Storage zodra ze gekozen
// worden. Opslaan raakt uitsluitend musicians.avatar_url en musician_media
// (verwijderen + opnieuw invullen).

let mhAvatarUrl = null;
let mhMediaFiles = [];
let mhMediaLinks = [];
let mhSnapshot = null;

const MH_TIPS = [
  'toon de energie die jij als muzikant wil laten zien.',
  'een compleet profiel krijgt veel meer aandacht.',
];
let mhTipIndex = 0;
let mhTipTimer = null;
function mhStartTipCycle() {
  clearInterval(mhTipTimer);
  mhTipIndex = 0;
  mhRenderTip();
  mhTipTimer = setInterval(() => {
    mhTipIndex = (mhTipIndex + 1) % MH_TIPS.length;
    mhRenderTip();
  }, 2500);
}
function mhRenderTip() {
  const el = document.getElementById('mhTipText');
  if (!el) return;
  el.innerHTML = `<strong>Tip:</strong> ${escHtml(MH_TIPS[mhTipIndex])}`;
}

function mhFieldSnapshot() {
  return JSON.stringify({
    avatarUrl: mhAvatarUrl,
    mediaFiles: mhMediaFiles.map(m => ({ url: m.url, type: m.type, uploading: m.uploading })),
    mediaLinks: mhMediaLinks,
  });
}

async function openJeMediahoek() {
  resetCancelButton('mhCancelBtn');
  resetCancelButton('mhAvatarRemoveBtn');
  mhStartTipCycle();
  const { data, error } = await db.from('musicians')
    .select('avatar_url, musician_media(media_type, url, platform)')
    .eq('id', myMusicianId).single();
  if (error) {
    showToast('Kon je gegevens niet laden: ' + friendlyErrorMessage(error));
    return;
  }
  mhAvatarUrl = data.avatar_url || null;
  mhMediaFiles = (data.musician_media || [])
    .filter(x => x.media_type === 'foto' || x.media_type === 'video')
    .map(x => ({ name: '', url: x.url, path: null, type: x.media_type, uploading: false }));
  mhMediaLinks = (data.musician_media || []).filter(x => x.media_type === 'link').map(x => ({ url: x.url }));

  mhRenderAvatar();
  mhRenderMediaGrid();
  mhRenderLinksList();
  const mhScreen = document.getElementById('mediahoekScreen');
  mhScreen.querySelectorAll('.media-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  mhScreen.querySelectorAll('.media-pane').forEach((p, i) => p.classList.toggle('active', i === 0));
  mhSnapshot = mhFieldSnapshot();
}

function switchMhMediaTab(tab, el) {
  const mhScreen = document.getElementById('mediahoekScreen');
  mhScreen.querySelectorAll('.media-tab').forEach(t => t.classList.remove('active'));
  mhScreen.querySelectorAll('.media-pane').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(tab === 'upload' ? 'mhPaneUpload' : 'mhPaneLinks').classList.add('active');
}

function mhRenderAvatar() {
  const preview = document.getElementById('mhAvatarPreview');
  if (mhAvatarUrl) {
    preview.innerHTML = `<img src="${safeUrl(mhAvatarUrl)}" alt="profielfoto">`;
    document.getElementById('mhAvatarRemoveBtn').classList.add('visible');
  } else {
    preview.innerHTML = `<span id="mhAvatarInitials">T</span>`;
    document.getElementById('mhAvatarRemoveBtn').classList.remove('visible');
    resetCancelButton('mhAvatarRemoveBtn');
  }
}

function mhHandleAvatarUpload(file) {
  if (!file) return;
  const typeProblem = fileTypeProblem(file, AVATAR_MIME_TYPES, AVATAR_TYPE_LABEL);
  if (typeProblem) { showToast(typeProblem); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('Afbeelding is te groot. Maximum 5 MB.'); return; }

  const blobUrl = URL.createObjectURL(file);
  const preview = document.getElementById('mhAvatarPreview');
  preview.innerHTML = `<img src="${blobUrl}" alt="profielfoto">
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);border-radius:50%;">
      <div style="width:24px;height:24px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.7s linear infinite;"></div>
    </div>`;
  preview.style.position = 'relative';

  uploadAvatarFile(file, currentUser.id).then(({ url }) => {
    mhAvatarUrl = url;
    mhRenderAvatar();
  }).catch(e => {
    logCaught('mhUploadAvatar', e);
    showToast(friendlyErrorMessage(e));
    mhRenderAvatar();
  });
}

function mhAskRemoveAvatar() {
  handleCancelClick('mhAvatarRemoveBtn', () => true, mhRemoveAvatar, 'Foto verwijderen. Zeker weten?');
}
function mhRemoveAvatar() {
  mhAvatarUrl = null;
  mhRenderAvatar();
}

function mhHandleDrop(e) {
  e.preventDefault();
  document.getElementById('mhDropZone').classList.remove('drag-over');
  mhHandleFileSelect(e.dataTransfer.files);
}

function mhHandleFileSelect(files) {
  Array.from(files).forEach(file => {
    if (mhMediaFiles.length >= 8) { showToast('Maximum 8 bestanden.'); return; }
    const isVideo = (file.type || '').toLowerCase().startsWith('video/');
    const typeProblem = fileTypeProblem(file, MEDIA_MIME_TYPES, MEDIA_TYPE_LABEL);
    if (typeProblem) { showToast(`"${file.name}": ${typeProblem}`); return; }
    if (file.size > 50 * 1024 * 1024) { showToast(`"${file.name}" is te groot. Maximum 50 MB.`); return; }

    const blobUrl = URL.createObjectURL(file);
    const type = isVideo ? 'video' : 'foto';
    const entry = { name: file.name, url: blobUrl, path: null, type, uploading: true };
    mhMediaFiles.push(entry);
    mhRenderMediaGrid();

    uploadMediaFile(file, currentUser.id).then(({ url, path }) => {
      entry.url = url;
      entry.path = path;
      entry.uploading = false;
      mhRenderMediaGrid();
    }).catch(e => {
      logCaught('mhUploadMedia', e);
      showToast(`"${file.name}": ${friendlyErrorMessage(e)}`);
      const idx = mhMediaFiles.indexOf(entry);
      if (idx !== -1) mhMediaFiles.splice(idx, 1);
      mhRenderMediaGrid();
    });
  });
}

function mhRenderMediaGrid() {
  const grid = document.getElementById('mhMediaGrid');
  grid.innerHTML = mhMediaFiles.map((m, i) => `
    <div class="media-thumb">
      ${m.type === 'foto'
        ? `<img src="${safeUrl(m.url)}" alt="${escHtml(m.name)}">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;">Video</div>`
      }
      ${m.uploading ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);"><div style="width:20px;height:20px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.7s linear infinite;"></div></div>` : ''}
      <div class="thumb-type">${escHtml(m.type)}</div>
      <button class="thumb-remove" onclick="mhRemoveMedia(${i})" aria-label="Verwijderen">✕</button>
    </div>`).join('');
}

function mhRemoveMedia(i) {
  const entry = mhMediaFiles[i];
  mhMediaFiles.splice(i, 1);
  mhRenderMediaGrid();
  if (entry?.path) {
    db.storage.from('media').remove([entry.path]).then(() => {}, e => logCaught('mhRemoveMedia', e));
  }
}

function mhAddLinkRow() {
  mhMediaLinks.push({ url: '' });
  mhRenderLinksList();
}

function mhRenderLinksList() {
  const list = document.getElementById('mhLinksList');
  list.innerHTML = mhMediaLinks.map((l, i) => `
    <div class="link-row">
      <span class="link-type-badge">${escHtml(l.url ? detectPlatform(l.url) : 'Link')}</span>
      <input type="url" value="${escHtml(l.url || '')}" placeholder="https://youtube.com/watch?v=..."
        oninput="mhUpdateLinkUrl(${i}, this)">
      <button class="song-remove" onclick="mhRemoveLink(${i})" aria-label="Verwijderen">✕</button>
    </div>`).join('');
}

function mhUpdateLinkUrl(i, el) {
  if (!mhMediaLinks[i]) return;
  mhMediaLinks[i].url = el.value;
  const badge = el.previousElementSibling;
  if (badge) badge.textContent = el.value ? detectPlatform(el.value) : 'Link';
}

function mhRemoveLink(i) {
  mhMediaLinks.splice(i, 1);
  mhRenderLinksList();
}

function cancelJeMediahoek() {
  handleCancelClick('mhCancelBtn', () => mhFieldSnapshot() !== mhSnapshot, goToTegelOverview);
}

async function saveJeMediahoek() {
  if (mhFieldSnapshot() === mhSnapshot) return;

  const { error: uErr } = await db.from('musicians')
    .update({ avatar_url: mhAvatarUrl || null }).eq('id', myMusicianId);
  if (uErr) { showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(uErr)); return; }

  await db.from('musician_media').delete().eq('musician_id', myMusicianId);

  const linkMedia = mhMediaLinks
    .filter(l => l.url.trim())
    .map(l => ({ musician_id: myMusicianId, media_type: 'link', url: l.url, platform: detectPlatform(l.url) }));
  if (linkMedia.length) {
    const { error: lErr } = await db.from('musician_media').insert(linkMedia);
    if (lErr) { showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(lErr)); return; }
  }

  const fileMedia = mhMediaFiles
    .filter(m => m.url && !m.uploading && !m.url.startsWith('blob:'))
    .map(m => ({ musician_id: myMusicianId, media_type: m.type, url: m.url }));
  if (fileMedia.length) {
    const { error: fErr } = await db.from('musician_media').insert(fileMedia);
    if (fErr) { showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(fErr)); return; }
  }

  mhSnapshot = mhFieldSnapshot();
  showToast('Wijzigingen opgeslagen.');
}

function selectBandStatus(el, val) {
  document.querySelectorAll('#bandStatusGrid .tag').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');
  bandState.status = val;
}

// TT-252 (11-09-2026): de knop "Band aanmaken" liet zich twee keer indrukken.
// De tweede tik maakte een echte tweede band met dezelfde oprichter, en
// opruimen kon alleen via "Band opheffen" — een pad dat een nieuwe gebruiker
// niet kent. Deze vlag sluit de tweede aanroep buiten zolang de eerste loopt.
// De opslaanlaag hieronder dekt de tik ook af, maar een vlag werkt ook als die
// laag ooit ontbreekt.
let bandSaveBusy = false;

// TT-252: de vlag gaat meteen aan, vóór de eerste `await`. Zat hij pas na
// getMyMusicianId(), dan glipte de tweede tik er alsnog langs: die aanroep
// begint tijdens het wachten, ziet de vlag nog op false staan en maakt een
// tweede band. Gemeten met twee aanroepen direct achter elkaar: twee inserts
// in `bands`. Het `finally` zet de vlag altijd terug, ook bij een afgekeurd
// veld. Het echte werk staat in saveBandRun() hieronder — zo blijft de vlag
// één laag apart en hoeft geen enkele bestaande regel te verschuiven.
async function saveBand() {
  if (bandSaveBusy) return;
  bandSaveBusy = true;
  try { await saveBandRun(); }
  finally { bandSaveBusy = false; }
}

async function saveBandRun() {
  const name = document.getElementById('bandName').value.trim();
  const zip  = document.getElementById('bandZip').value.trim();
  const city = document.getElementById('bandCity').value.trim();
  const desc = document.getElementById('bandDescription').value.trim();
  // TT-247 (12-09-2026): alle fouten tegelijk, elk bij zijn eigen veld —
  // dezelfde vorm als de registratiewizard. Muzikantkant en bandkant volgen
  // dezelfde regels (huisstijl, besluit Ronald 11-09-2026). Tot nu toe waren
  // dit drie opeenvolgende toasts, één per keer.
  // Het bandformulier staat in view-bands, niet in #bandModal — die modal is
  // de bandweergave. Gemeten 12-09-2026; met 'bandModal' als bereik werd er
  // niets opgeruimd.
  clearFieldErrors('view-bands');
  const fouten = [];
  if (!name) fouten.push(['bandName', 'Vul een bandnaam in']);
  if (!zip || !bandPostcodeResolved || !city) {
    fouten.push(['bandZip', 'Vul een geldige postcode in. De plaats wordt dan automatisch ingevuld']);
  }
  if (!bandState.genres.length) fouten.push(['bandGenreField', 'Kies minimaal één genre']);
  if (showFieldErrors(fouten)) return;

  const mid = await getMyMusicianId();
  // Gaat niet over een veld in dit formulier, maar over je account — toast.
  if (!mid) { showToast('Maak eerst een muzikantprofiel aan.'); return; }

  // TT-252: de laag blokkeert het scherm tijdens het opslaan, zodat een tweede
  // tik de knop ook fysiek niet meer bereikt. TT-251: zonder die laag was er
  // ook geen enkele aanduiding dat er iets gebeurde. Zelfde component als de
  // wizard (showSaving), zodat muzikantkant en bandkant hetzelfde aanvoelen.
  const isNieuw = !editingBandId;
  showSaving(
    isNieuw ? 'Band aanmaken...' : 'Wijzigingen opslaan...',
    'Heel even geduld, dit duurt maar een paar seconden.'
  );

  try {
    let bandId;
    if (editingBandId) {
      bandId = editingBandId;
      const { error: uErr } = await db.from('bands').update({
        name, city: normalizeCityName(city), zip,
        description: desc || null, genres: bandState.genres,
        status: bandState.status, city_source: bandCitySource,
        niveau: bandState.niveau || null, // TT-51, optioneel
        avatar_url: bandState.avatarUrl || null, // V-15
      }).eq('id', bandId);
      if (uErr) throw uErr;
      await db.from('band_wanted').delete().eq('band_id', bandId);
    } else {
      // Zelfde voorzorg als bij createAccountAndProfile() (23-08-2026): alleen
      // 'id' terugvragen i.p.v. een kale .select(). Niet omdat hier een
      // bekende kolombeperking is gevonden — geen enkel veld hier is dat
      // vandaag — maar een kale select() vraagt onnodig alle kolommen op
      // terwijl alleen band.id verderop wordt gebruikt.
      const { data: band, error: bErr } = await db.from('bands').insert({
        name, city: normalizeCityName(city), zip,
        description: desc || null, genres: bandState.genres,
        status: bandState.status, founder_id: mid, city_source: bandCitySource,
        niveau: bandState.niveau || null, // TT-51, optioneel
        avatar_url: bandState.avatarUrl || null, // V-15
      }).select('id').single();
      if (bErr) throw bErr;
      bandId = band.id;
      await db.from('band_members').insert({ band_id: bandId, musician_id: mid, role: 'Oprichter', status: 'bevestigd' });
    }

    // V-14: bij een complete/inactieve band kan bandState.wanted leeg zijn —
    // een insert met een lege lijst is dan gewoon een no-op.
    if (bandState.wanted.length) {
      await db.from('band_wanted').insert(bandState.wanted.map(instrument => ({ band_id: bandId, instrument })));
    }

    resetBandForm();
    document.getElementById('createBandForm').style.display = 'none';
    loadMyBands();
    hideSaving();
    // TT-251 (11-09-2026): er was geen verschil tussen gelukt en mislukt — het
    // formulier verdween in beide gevallen. Wie zijn eerste band aanmaakt is
    // precies op dat moment het onzekerst. Dezelfde bevestiging als elders in
    // de app: een korte melding, met de bandnaam erin zodat hij ziet wát er is
    // aangemaakt.
    showToast(isNieuw ? `${name} is aangemaakt.` : 'Wijzigingen opgeslagen.');
  } catch(e) {
    hideSaving();
    logCaught('saveBand', e);
    showToast(friendlyErrorMessage(e));
  }
}

async function loadMyBands() {
  const el = document.getElementById('myBandsList');
  if (!el) return;
  el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:32px;">Laden...</div>';
  // 22-08-2026: zelfde lazy vervalcontrole als in loadFounderOffers() —
  // Mijn Bands kan ook los daarvan geopend worden.
  // Niet blokkerend voor de lijst, wel loggen (TT-230).
  try { await db.rpc('tt_expire_old_founder_offers'); }
  catch (e) { logCaught('loadMyBands/expire', e); }

  const mid = await getMyMusicianId();
  if (!mid) {
    // TT-248: via de vaste vorm uit huisstijl §15, net als elke andere lege staat.
    el.innerHTML = emptyStateHTML(
      'Nog geen profiel',
      'Maak je muzikantprofiel aan om een band te kunnen oprichten.',
      'Profiel aanmaken →',
      "showView('register')"
    );
    return;
  }

  const { data: memberships } = await db.from('band_members').select('band_id').eq('musician_id', mid).eq('status', 'bevestigd');
  if (!memberships?.length) {
    // TT-248: stond hier als grijze tekst zonder uitweg, tien regels onder de
    // lege staat hierboven die wél een knop had. Nu dezelfde vaste vorm.
    el.innerHTML = emptyStateHTML(
      'Nog geen bands',
      'Richt je eigen band op, of wacht tot iemand je uitnodigt.',
      'Band aanmaken →',
      'showCreateBandForm()'
    );
    return;
  }

  const bandIds = memberships.map(m => m.band_id);
  const { data: bands } = await db.from('bands')
    .select(`*, band_members(musician_id, role, status, founder_offer, musicians(fname, username, profile_color)), band_wanted(instrument)`)
    .in('id', bandIds).order('updated_at', { ascending: false });

  const statusLabels = { zoekend: 'Zoekend', compleet: 'Compleet', inactief: 'Inactief' };
  el.innerHTML = (bands || []).map(b => {
    const col = safeColor(b.profile_color, '#3ecfff');
    const confirmed = (b.band_members||[]).filter(m => m.status === 'bevestigd');
    // TT-41 (08-08-2026): uitgenodigde muzikanten staan er wél al, maar tellen
    // nog niet als lid tot ze zelf bevestigen. Alleen de oprichter ziet dit —
    // voor de rest van de wereld bestaat een uitnodiging niet.
    const pending = (b.band_members||[]).filter(m => m.status === 'aangevraagd');
    const isFounder = b.founder_id === mid;
    // V-16 (13-08-2026): staat er al een lopend overname-aanbod (founder_offer)?
    // Dan geen nieuwe "Ik stop als bandleider"-knop, maar de wachtstand.
    const offerPending = isFounder && confirmed.some(m => m.founder_offer);
    const status = statusLabels[b.status] ? b.status : '';
    // 22-08-2026 (Ronald): de drie losse knoppen (Band bewerken/+ Lid
    // toevoegen/Ik stop als beheerder) worden één klein ⋯-menu, zelfde
    // patroon als het profielmenu (zie huisstijl-en-consistentie.md §8).
    // Elke band in de lijst heeft zijn eigen knop/menu, dus geen vaste id's
    // — toggleBandMoreMenu() werkt met event.currentTarget in plaats daarvan.
    const founderMenuHTML = isFounder ? `
      <div class="profile-actions-menu-wrap" style="flex-shrink:0;" onclick="event.stopPropagation();">
        <button class="nav-menu-btn" onclick="toggleBandMoreMenu(event)" aria-label="Meer opties voor ${escAttr(b.name)}" title="Meer">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
        </button>
        <div class="inline-menu-dropdown">
          <button class="nav-menu-item" onclick="closeAllBandMoreMenus();editBand('${jsAttr(b.id)}');">Bandprofiel bewerken</button>
          <button class="nav-menu-item" onclick="closeAllBandMoreMenus();openAddMemberModal('${jsAttr(b.id)}','${jsAttr(b.name)}');">Bandleden beheren</button>
        </div>
      </div>` : '';
    return `<div class="band-card">
      <div class="band-card-header" onclick="openBandModal('${jsAttr(b.id)}')">
        ${b.avatar_url ? `<img src="${safeUrl(b.avatar_url)}" alt="${escHtml(b.name)}" class="band-avatar" style="object-fit:cover;">` : `<div class="band-avatar" style="background:${col};">${AVATAR_T_FALLBACK}</div>`}
        <div style="flex:1;">
          <div class="band-name">${escHtml(b.name)}${bandStarDisplayHTML(b)}</div>
          <div class="band-meta">${escHtml(b.city||'')}${b.city&&b.genres?.length?' · ':''}${escHtml((b.genres||[]).slice(0,2).join(', '))}</div>
        </div>
        ${isFounder ? founderMenuHTML : `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); leaveBand('${jsAttr(b.id)}','${jsAttr(b.name)}');">Band verlaten</button>`}
      </div>
      ${offerPending ? `
      <div style="padding:0 20px;">
        <div style="font-size:12px;color:var(--muted);padding:8px 0;border-top:1px solid var(--border);">Gevraagd of iemand het beheer overneemt — wachten op reactie.</div>
      </div>` : ''}
      <div class="band-card-body">
        <!-- 22-08-2026 (Ronald): status minder prominent — de beheerder weet
             deze zelf al, hoort niet meer bovenaan in het overzicht. -->
        <div style="margin-bottom:8px;"><span class="band-status-badge band-status-${status}">${escHtml(statusLabels[status] || b.status)}</span></div>
        ${b.description ? `<p style="font-size:13px;color:var(--muted);margin-bottom:12px;font-style:italic;">"${escHtml(b.description)}"</p>` : ''}
        <div class="band-members-row">
          ${confirmed.map(m => {
            const memberName = displayNameOf(m.musicians);
            // 22-08-2026 (Ronald): het kruisje hier voelde "banaal, alsof je
            // ieder moment kan worden gecancelled". Verwijderen zit nu in
            // "Bandleden wijzigen" (zie openAddMemberModal), met een
            // duidelijke knop. Deze chip is nu puur informatief + klikbaar
            // naar het profiel — geen verwijderactie meer op de kaart zelf.
            // m.musicians.id komt hier altijd mee (dit is de eigen "Mijn
            // Bands"-lijst, geen publieke/anonieme bron).
            return `<div class="band-member-chip" style="cursor:pointer;" onclick="event.stopPropagation(); openMusicianModal('${jsAttr(m.musician_id)}');">
            <div class="band-member-dot" style="background:${safeColor(m.musicians?.profile_color, '#888')};">${escHtml(memberName[0].toUpperCase())}</div>
            ${escHtml(memberName)} <span style="color:var(--muted);font-size:10px;">${escHtml(roleLabel(m.role))}</span>
          </div>`; }).join('')}
          ${isFounder ? pending.map(m => {
            const memberName = displayNameOf(m.musicians);
            return `<div class="band-member-chip" style="opacity:.55;border-style:dashed;">
            <div class="band-member-dot" style="background:${safeColor(m.musicians?.profile_color, '#888')};">${escHtml(memberName[0].toUpperCase())}</div>
            ${escHtml(memberName)} <span style="color:var(--muted);font-size:10px;">wacht op bevestiging</span>
          </div>`; }).join('') : ''}
        </div>
      </div>
    </div>`;
  }).join('');
}

async function openBandModal(id) {
  const modal = document.getElementById('bandModal');
  document.getElementById('bandModalContent').innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">Laden...</div>';
  modal.classList.add('visible');

  let b = null;

  if (hasOwnProfile) {
    const { data } = await db.from('bands')
      .select(`*, band_members(role, status, musicians(id, fname, username, profile_color, musician_instruments(instrument))), band_wanted(instrument)`)
      .eq('id', id).single();
    b = data;
  } else {
    // Zonder eigen profiel: publieke RPC (tabel zelf blijft op slot voor anon).
    const { data } = await db.rpc('tt_get_bands_public', { ids: [id] });
    const row = (data || [])[0];
    if (row) {
      b = {
        id: row.id, name: row.name, city: row.city, description: row.description, // TT-04: geen postcode voor bezoekers
        status: row.status, profile_color: row.profile_color, updated_at: row.updated_at,
        avatar_url: row.avatar_url || null, // V-15-restpunt (13-08-2026)
        genres: row.genres || [],
        niveau: row.niveau, // TT-51 (12-08-2026, RPC-restpunt gesloten)
        // TT-43: de publieke RPC levert voor leden alleen nog de
        // gebruikersnaam — de echte voornaam blijft weg bij bezoekers.
        band_members: (row.members || []).map(mem => ({ role: 'Lid', status: 'bevestigd', musicians: { username: mem.username, profile_color: mem.profile_color } })),
        band_wanted: (row.wanted || []).map(i => ({ instrument: i })),
      };
    }
  }

  if (!b) { document.getElementById('bandModalContent').innerHTML = '<p style="color:var(--danger)">Kon band niet laden.</p>'; return; }

  const col = safeColor(b.profile_color, '#3ecfff');
  const confirmed = (b.band_members||[]).filter(m => m.status === 'bevestigd');
  const statusLabels = { zoekend: 'Zoekend naar leden', compleet: 'Band is compleet', inactief: 'Inactief' };
  const status = statusLabels[b.status] ? b.status : '';

  // V-13 (13-08-2026): tot nu toe had een bandprofiel geen enkele manier om
  // contact te leggen. Het bericht gaat naar de oprichter — dat is de enige
  // die op dit moment reageert op aanmeldingen. De oprichter wordt gezocht
  // in de al opgehaalde ledenlijst, niet via een aparte databasevraag.
  const founderMember = hasOwnProfile ? confirmed.find(m => m.role === 'Oprichter') : null;
  const isOwnBand = !!(founderMember && myMusicianId && founderMember.musicians?.id === myMusicianId);

  document.getElementById('bandModalContent').innerHTML = `
    <div style="height:8px;background:${col};margin:-32px -32px 24px;border-radius:8px 8px 0 0;"></div>
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
      ${b.avatar_url ? `<img src="${safeUrl(b.avatar_url)}" alt="${escHtml(b.name)}" style="width:64px;height:64px;border-radius:12px;object-fit:cover;border:1px solid var(--border);margin-bottom:0;flex-shrink:0;">` : `<div class="band-avatar" style="background:${col};width:64px;height:64px;border-radius:12px;font-size:26px;margin-bottom:0;flex-shrink:0;">${AVATAR_T_FALLBACK}</div>`}
      <div style="min-width:0;flex:1;">
        <div class="profile-name">${escHtml(b.name)}${bandStarDisplayHTML(b)}</div>
        <div class="profile-meta" style="margin-bottom:0;">${escHtml(b.city||'')}${b.city&&b.genres?.length?' · ':''}${escHtml((b.genres||[]).join(', '))}</div>
      </div>
    </div>
    <div style="margin:8px 0;"><span class="band-status-badge band-status-${status}">${escHtml(statusLabels[status] || b.status)}</span></div>
    ${b.description ? `<p style="font-size:13px;color:var(--muted);margin:12px 0;font-style:italic;">"${escHtml(b.description)}"</p>` : ''}
    <div class="profile-songs-title" style="margin-top:16px;">Leden (${confirmed.length})</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
      ${confirmed.map(m => {
        const memberName = displayNameOf(m.musicians);
        return `<div class="band-member-chip">
        <div class="band-member-dot" style="background:${safeColor(m.musicians?.profile_color, '#888')};">${escHtml(memberName[0].toUpperCase())}</div>
        <span><strong>${escHtml(memberName)}</strong> · ${escHtml(roleLabel(m.role))}</span>
      </div>`; }).join('')}
    </div>
    ${(b.band_wanted||[]).length ? `
      <div class="profile-songs-title" style="margin-top:16px;">Wij zoeken nog</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
        ${(b.band_wanted||[]).map(w => `<span class="wanted-chip">${escHtml(w.instrument)}</span>`).join('')}
      </div>` : ''}
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:20px;">
      ${!isOwnBand ? (hasOwnProfile
        ? (founderMember
          ? `<button class="btn btn-primary" style="width:100%;" onclick="openMessageComposer('${jsAttr(founderMember.musicians.id)}','${jsAttr(displayNameOf(founderMember.musicians))}')">Stuur een bericht aan deze band →</button>`
          : '')
        : `<button class="btn btn-primary" style="width:100%;" onclick="document.getElementById('bandModal').classList.remove('visible'); showView('register')">Maak een profiel aan om contact te leggen</button>`
      ) : ''}
      <button class="btn btn-ghost" style="width:100%;" onclick="shareProfile('band','${jsAttr(b.id)}','${jsAttr(b.name)}')">Deel dit bandprofiel</button>
    </div>`;

  // TT-249: pas ná het plaatsen passend maken — zelfde reden als bij de
  // muzikantmodal. De bandnaam gebruikt dezelfde klasse, dus dezelfde regel.
  fitProfileName(document.getElementById('bandModalContent'));
}

