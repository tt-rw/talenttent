// ─── Muzikant detail modal ───────────────────────────────────────────────────


// Bouwt de profiel-detail HTML op basis van een musicians-record. Gedeeld door
// laadProfielScherm() (scherm voor andere profielen) én loadMyProfile() (Mijn
// Profiel) — zodat Mijn Profiel nooit de modal hoeft te openen/sluiten (dat
// veroorzaakte een korte flits van de modal-overlay bij elk bezoek).
function buildMusicianDetailHTML(m, isOwn, inModal) {
  const age  = ageOf(m);

  // TT-43 (08-08-2026): op je eigen profiel altijd je eigen voornaam; voor een
  // ander hangt het af van of die is ingelogd met een eigen profiel — dat
  // regelt displayNameOf() op basis van wat de database heeft meegegeven.
  const displayName = isOwn ? m.fname : displayNameOf(m);
  const avatarSrc = safeUrl(m.avatar_url);
  // TT-217 (06-09-2026): klik op de profielfoto vergroot 'm, zelfde bestaande
  // lightbox als bij de foto's onder "Foto's" (openMediaLightbox()) — geen
  // nieuwe component, hergebruik van het bestaande patroon.
  const avatarHTML = avatarSrc
    ? `<img class="profile-avatar-photo" src="${avatarSrc}" alt="${escHtml(displayName)}" style="margin-bottom:0;flex-shrink:0;cursor:pointer;" onclick="openMediaLightbox('${jsAttr(avatarSrc)}')">`
    : `<div class="profile-avatar-initials" style="margin-bottom:0;flex-shrink:0;">${AVATAR_T_FALLBACK}</div>`;

  const songRows = [...m.musician_songs].sort((a, b) =>
    compareArtistTitle(a.song_artist, a.song_title, b.song_artist, b.song_title)
  ).map(s => {
    // mastery_level komt in een class-attribuut terecht — alleen bekende
    // waarden toelaten, anders kan iemand het attribuut openbreken.
    const lvl = LEVEL_LABELS[s.mastery_level] ? s.mastery_level : '';
    return `
    <div class="profile-song-row">
      <span><strong>${escHtml(s.song_artist)}</strong> — <span style="color:var(--muted)">${escHtml(s.song_title)}</span></span>
      <span class="level-pill">${escHtml(LEVEL_LABELS[lvl] || '')}</span>
    </div>`;
  }).join('');

  // 22-08-2026 (Ronald): het onderste actieblok (Profiel bewerken + het
  // ⋯-menu, TT-119) is weg. Alle drie de acties — wijzigen, band-
  // uitnodigingen aan/uit, account verwijderen — staan nu in één klein
  // menu bij de naam (sinds TT-384 rechts naast de profielfoto). Alleen op de eigen profielpagina (isOwn, niet in
  // de modal) — bij het bekijken van een ander profiel, of het eigen
  // profiel via de modal, hoort dit menu niet thuis.
  const showOwnerMenu = isOwn && !inModal;
  // TT-318 (24-09-2026, besluit Ronald): in het venster van iemand anders
  // staat het ⋯-menu voor melden en blokkeren op dezelfde plek als het
  // eigen menu op Mijn Profiel. Tot nu toe stond het in de koprij, links van
  // het kruisje (TT-06). Sinds TT-384 staat het rechts naast de profielfoto,
  // rechts van het deelicoon (profielKnoppenHTML()). Alleen de plek komt hier; de
  // inhoud zet laadProfielScherm() erin met zetVeiligheidMenu(), zodra het
  // profiel geladen is. Op je eigen profiel komt er geen plek: je meldt of
  // blokkeert jezelf niet.
  const veiligheidPlekHTML = (inModal && !isOwn)
    ? '<span id="profielSchermActies" class="profiel-menu-plek"></span>' : '';
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
        <!-- TT-410b (06-10-2026, besluit Ronald): delen staat standaard aan; de
             muzikant zet het hier zelf uit. Zelfde vorm als de knop erboven:
             de tekst toont de stand van nu. -->
        <button class="nav-menu-item" id="delenToggleBtn" onclick="closeProfileMoreMenu();toggleProfielDelen()">Delen via link: aan</button>
      </div>
    </div>` : '';

  // TT-384 (30-09-2026, besluiten Ronald): de kop staat onder elkaar. Eerst
  // een rij met links de profielfoto en rechts het deelicoon en het ⋯-menu;
  // daaronder de naam en de regels, over de volle breedte. Staat er een
  // banner, dan valt de foto voor de helft over de onderrand daarvan
  // (.profiel-kop.op-banner). Zonder banner blijft dezelfde opbouw staan,
  // alleen zonder overlap. Het bandvenster volgt in een eigen sessie.
  const bannerHTML = profielBannerHTML(m.musician_media);
  return `
    ${bannerHTML}
    <div class="profiel-kop${bannerHTML ? ' op-banner' : ''}">
      <div class="profiel-kop-rij">
        ${avatarHTML}
        ${profielKnoppenHTML('profiel', m.id, displayName, ownerMenuHTML + veiligheidPlekHTML, null, isOwn || m.delen_aan !== false)}
      </div>
      <div class="profile-name">${escHtml(displayName)}</div>
      <div class="profiel-regels">
        <!-- TT-166 (28-08-2026, Ronald: "eenvoud"): een gebruikersnaam-subline
             hoort er alleen bij als de grote naam de échte voornaam is — laat
             displayName die keuze maken (isOwn, of een ingelogde kijker met
             eigen profiel). Ziet iemand toch al de gebruikersnaam als grote
             naam (uitgelogd/anoniem, geen eigen profiel), dan zou een subline
             die naam alleen maar herhalen. Geen uitlegzin meer, alleen het
             label. -->
        ${(displayName === m.fname && m.fname) ? `<p style="font-size:12px;color:var(--muted);margin-top:4px;">Gebruikersnaam: <strong style="color:var(--text);">${escHtml(m.username || '(nog geen gebruikersnaam)')}</strong></p>` : ''}
        <div class="profile-meta" style="margin-bottom:0;">${age} jaar · ${escHtml(m.city)}${m.distance_km != null ? ` · ${m.distance_km.toFixed(1)} km` : ''}</div>
      </div>
    </div>
    <div class="profile-badges">
      ${m.musician_instruments.map(x => `<span class="tag-solid">${escHtml(x.instrument)}${starDisplayHTML(x.niveau) ? ' ' + starDisplayHTML(x.niveau) : ''}</span>`).join('')}
      ${m.musician_genres.map(x => `<span class="tag-solid">${escHtml(x.genre)}</span>`).join('')}
    </div>
    ${m.bio ? `<p style="font-size:15px;color:var(--text);margin:12px 0;">${escHtml(m.bio)}</p>` : ''}
    ${profielBandsHTML(m.bands)}
    ${m.musician_songs.length ? `
      <div class="profile-songs">
        <div class="profile-songs-title">Repertoire (${m.musician_songs.length} ${m.musician_songs.length === 1 ? 'nummer' : 'nummers'})</div>
        ${songRows}
      </div>` : ''}
    ${profielMediaHTML(m.musician_media)}`;
}

// TT-385 (02-10-2026): het mediaraster en de links onder een profiel, voor
// de muzikant én de band. Eén functie, zodat beide kanten gelijk blijven
// (huisstijl §10). Tot deze dag stond dit binnen buildMusicianDetailHTML().
// Alleen links met een geldige http(s)-URL tonen. Een `javascript:`-URL in
// een href voert code uit zodra iemand erop klikt — die laten we hier vallen
// in plaats van hem als lege link te tonen.
// TT-45 (25-09-2026): een afgeschermd item heeft geen adres, maar hoort er
// wél te staan — als de T, zie mediaAfgeschermdHTML() in utils.js.
// TT-02: ook geüploade foto's en video's, niet alleen links.
function profielMediaHTML(mediaLijst) {
  const lijst = (mediaLijst || [])
    .map(x => ({ ...x, safeHref: safeUrl(x.url) }))
    .filter(x => x.safeHref || x.afgeschermd);
  const links = lijst.filter(x => x.media_type === 'link');
  const photos = lijst.filter(x => x.media_type === 'foto');
  const videos = lijst.filter(x => x.media_type === 'video');
  return `
    <!-- TT-265 (15-09-2026, Ronald): "foto's en geüploade video's staan naast
         elkaar, de links staan eronder." Eén raster in plaats van twee
         secties. Een video is daarin een tegel met zijn eerste beeld en het
         woord "Video"; hij speelt niet ter plekke maar opent het mediascherm
         van TT-263 — dezelfde weg als een link, en dezelfde weg als de
         banner. Losse <video controls> in het raster was de enige plek in de
         app waar media nog buiten dat scherm om speelde. -->
    ${(photos.length || videos.length) ? `
      <div class="profile-media" style="margin-top:16px;">
        <div class="profile-media-title">Foto's en video's</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px;">
          ${photos.map(p => p.afgeschermd ? mediaAfgeschermdHTML() : `<button type="button" class="profile-media-tegel" onclick="openMediaLightbox('${jsAttr(p.safeHref)}')"><img src="${p.safeHref}" alt="Foto" style="width:100%;height:100%;object-fit:cover;"></button>`).join('')}
          ${videos.map(v => v.afgeschermd ? mediaAfgeschermdHTML() : `<button type="button" class="profile-media-tegel" onclick="openMediaSpeler('${jsAttr(v.safeHref)}', 'video')"><video src="${v.safeHref}#t=0.1" muted playsinline preload="metadata" tabindex="-1" aria-hidden="true" style="width:100%;height:100%;object-fit:cover;background:#000;"></video><span class="pb-label">Video</span></button>`).join('')}
        </div>
      </div>` : ''}
    ${links.length ? `
      <div class="profile-media" style="margin-top:16px;">
        <div class="profile-media-title">Links</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(72px,1fr));gap:8px;">
          ${links.map(l => {
            if (l.afgeschermd) return mediaAfgeschermdHTML();
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
            // TT-263 (13-09-2026, Ronald): de link stuurde de bezoeker naar de
            // browser en daarmee de app uit. Nu opent hij in het mediascherm;
            // kan een platform daar niet spelen, dan biedt dat scherm zelf de
            // knop naar het platform aan.
            return `<button type="button" onclick="openMediaSpeler('${jsAttr(l.safeHref)}', 'link', null, '${jsAttr(label)}')" style="${tileStyle}cursor:pointer;">${inner}</button>`;
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
  // TT-410b: staat delen uit op je eigen profiel, dan vraagt de app eerst of
  // het aan mag. Eén tik op "Aanzetten en delen" doet beide.
  if (kind === 'profiel' && id === myMusicianId && !myDeelAan) {
    showConfirm('Delen staat uit. Zet het aan om je link te delen.', async () => {
      if (await zetProfielDelen(true)) shareProfile(kind, id, name);
    }, 'Aanzetten en delen', false);
    return;
  }
  // TT-410b fase 2: dezelfde vraag bij je eigen band. Alleen de beheerder
  // heeft `bandDeelGegevens`, en alleen hij kan delen uitzetten.
  if (kind === 'band' && bandDeelGegevens && bandDeelGegevens.id === id && bandDeelGegevens.delen_aan === false) {
    showConfirm('Delen staat uit. Zet het aan om de link van de band te delen.', async () => {
      if (await zetBandDelen(id, true)) shareProfile(kind, id, name);
    }, 'Aanzetten en delen', false);
    return;
  }
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

// TT-380 (30-09-2026, besluiten Ronald): delen is een icoon bij de naam, op
// elk profiel — Mijn Profiel, het venster van een muzikant (ook je eigen) en
// het bandvenster (ook je eigen band). De brede knoppen "Deel dit profiel" en
// "Deel dit bandprofiel" onderaan zijn weg. Het icoon is de drie verbonden
// punten (keuze B); sinds TT-403 met gesloten stippen, de gangbare vorm
// (Android, Material). Eén functie voor alle drie de plekken, geen eigen variant
// per scherm. Rechts van het icoon staat het ⋯-menu, als dat er is; zonder
// menu schuift het icoon naar de plek van het menu.
// TT-385 (besluit Ronald, g): de beheerder van een band die nog niet af is,
// krijgt eerst één zin over wat er mist. Dat is de enige plek met een eigen
// actie; die komt binnen als `actie` (JavaScript voor onclick).
function deelKnopHTML(kind, id, name, actie) {
  const label = kind === 'band' ? 'Deel dit bandprofiel' : 'Deel dit profiel';
  const klik = actie || `shareProfile('${kind === 'band' ? 'band' : 'profiel'}','${jsAttr(id)}','${jsAttr(name)}')`;
  return `<button type="button" class="nav-menu-btn deel-knop" onclick="${klik}" aria-label="${label}" title="Delen">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="18" cy="5" r="3" stroke="none"></circle><circle cx="6" cy="12" r="3" stroke="none"></circle><circle cx="18" cy="19" r="3" stroke="none"></circle><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"></line><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"></line></svg>
  </button>`;
}

// TT-410b: `toonDeel` is onwaar bij het profiel van een ander die delen
// uitzette: dan staat er geen deelicoon, alleen het menu.
function profielKnoppenHTML(kind, id, name, menuHTML, deelActie, toonDeel) {
  const deel = toonDeel === false ? '' : deelKnopHTML(kind, id, name, deelActie);
  return `<div class="profiel-knoppen">${deel}${menuHTML || ''}</div>`;
}

function musicianContactFooterHTML(m, isOwn, displayName) {
  // TT-380: delen staat nu als icoon bij de naam; hier alleen nog contact.
  if (isOwn) return '';
  // TT-06 (18-09-2026): heb je deze muzikant zelf geblokkeerd, dan is een
  // berichtknop misleidend — het bericht zou nergens aankomen. In plaats
  // daarvan de enige zinnige volgende stap: de blokkade opheffen. De
  // omgekeerde richting (hij blokkeert jou) laat dit scherm bewust
  // ongewijzigd: die blokkade is stil, zie veiligheid.js.
  if (blokkeerIkZelf(m.id)) {
    return `<div style="display:flex;flex-direction:column;gap:8px;">
      <div class="blokkade-regel">Je hebt ${escHtml(displayName)} geblokkeerd.</div>
      <button class="btn btn-ghost" style="width:100%;" onclick="deblokkeerMuzikant('${jsAttr(m.id)}','${jsAttr(displayName)}')">Blokkade opheffen</button></div>`;
  }
  const contactBtn = hasOwnProfile
    ? `<button class="btn btn-primary" style="width:100%;" onclick="openMessageComposer('${jsAttr(m.id)}','${jsAttr(displayName)}')">Stuur een bericht →</button>`
    : `<button class="btn btn-primary" style="width:100%;" onclick="showView('register')">Maak een profiel aan om contact te leggen</button>`;
  return contactBtn;
}

// TT-410b (06-10-2026, besluit Ronald): het profiel van een muzikant is een
// eigen scherm (view-profiel) met een eigen adres, #profiel/<id>. Dat was het
// venster #musicianModal. Eén ingang voor elke plek in de app: een tik op een
// zoekresultaat, een gesprek, een gedeelde link.
//   - In de app geopend (`link` onwaar): altijd te zien, ook als de muzikant
//     delen uitzette. Delen gaat over de link, niet over vindbaarheid.
//   - Via een link (`link` waar): staat delen uit, dan toont het scherm "niet
//     beschikbaar", behalve op je eigen profiel.
// De stap in de geschiedenis onthoudt het id en of het in de app geopend is
// (`app`), zodat verversen op een profiel dat je in de app opende niet ineens
// "niet beschikbaar" geeft.
let profielLaadBelofte = null; // klaar zodra het profiel op het scherm staat

function openProfielScherm(id, opties) {
  const o = opties || {};
  showView('profiel', o.redirect ? 'redirect' : undefined, { id, app: !o.link });
  return profielLaadBelofte;
}

// Hoort bij het tweede deel van de link-regel hierboven. Lukt de vraag niet
// (bijvoorbeeld omdat het databasescript nog niet is gedraaid), dan geldt de
// standaard: delen staat aan.
async function profielDeelStand(id) {
  try {
    const { data, error } = await db.rpc('tt_profiel_delen', { mid: id });
    if (error) throw error;
    return data !== false;
  } catch (e) {
    logCaught('profielDeelStand', e);
    return true;
  }
}

let huidigProfielId = null; // de muzikant die het scherm nu toont (leeg bij een band)
let huidigBandId = null;    // de band die het scherm nu toont (leeg bij een muzikant)
let profielSchermVolgnr = 0; // een trage vraag mag een nieuwer profiel niet overschrijven

async function laadProfielScherm(id, linkToegang) {
  const volgnr = ++profielSchermVolgnr;
  huidigProfielId = id || null;
  huidigBandId = null;
  const content = document.getElementById('profielSchermContent');
  const footer = document.getElementById('profielSchermVoet');
  footer.innerHTML = '';
  content.innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--muted);">Laden...</div>';
  if (!id) { toonProfielNietBeschikbaar('muzikant'); return; }

  // TT-158 (27-08-2026): een uitgelogde bezoeker ziet het publieke profiel
  // (geen fname, dus displayNameOf() toont de gebruikersnaam) en krijgt geen
  // berichtknop, wel "Maak een profiel aan om contact te leggen"
  // (musicianContactFooterHTML()). hasOwnProfile staat voor een bezoeker op
  // false.
  let m = null, error = null;
  const delenVraag = profielDeelStand(id);

  if (hasOwnProfile) {
    // B-01 tweede stap (18-08-2026): geen birth_date meer in deze select —
    // dit scherm opent ook wanneer je iemand anders' profiel bekijkt, dus
    // een ingelogde gebruiker mag hier nooit de ruwe geboortedatum van een
    // ander binnenkrijgen. Leeftijd komt apart via tt_musicians_ages().
    const res = await db.from('musicians').select(`
      id, fname, username, city, bio, goal,
      rehearsal_frequency, musical_ambition,
      avatar_url,
      musician_instruments(instrument, niveau),
      musician_genres(genre),
      musician_songs(song_title, song_artist, mastery_level),
      musician_media(media_type, url, platform, in_banner)
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
        bio: row.bio, goal: row.goal, avatar_url: row.avatar_url,
        rehearsal_frequency: row.rehearsal_frequency, musical_ambition: row.musical_ambition,
        // TT-51 (12-08-2026, RPC-restpunt gesloten): instrument_levels bevat
        // instrument + niveau samen, zodat de sterren ook hier verschijnen voor
        // een bezoeker zonder eigen profiel.
        musician_instruments: (row.instrument_levels || []).map(x => ({ instrument: x.instrument, niveau: x.niveau })),
        musician_genres: (row.genres || []).map(g => ({ genre: g })),
        musician_songs: row.songs || [],
        // TT-210 (04-09-2026): de RPC geeft alle mediatypes in één kolom
        // 'media', met exact dezelfde vorm als musician_media.
        musician_media: row.media || [],
      };
    }
  }

  const delen = await delenVraag;
  if (volgnr !== profielSchermVolgnr) return; // intussen een ander profiel geopend

  if (error || !m) {
    footer.innerHTML = '';
    content.innerHTML = '<p style="color:var(--danger)">Kon profiel niet laden.</p>';
    return;
  }

  const isOwn = !!(myMusicianId && myMusicianId === m.id);
  // TT-410b: een link naar een profiel waarvan delen uit staat. Je eigen
  // profiel blijft altijd te openen.
  if (linkToegang && !delen && !isOwn) { toonProfielNietBeschikbaar('muzikant'); return; }
  m.delen_aan = delen;

  // TT-385 punt 17: de bands van deze muzikant, voor het blok Bands.
  m.bands = await profielBandsOphalen(m.id);
  if (volgnr !== profielSchermVolgnr) return;

  // Afstand tonen (indien bekend uit een eerdere zoekopdracht) i.p.v. de postcode.
  m.distance_km = musicianDistanceCache[m.id] != null ? musicianDistanceCache[m.id] : null;

  content.innerHTML = buildMusicianDetailHTML(m, isOwn, true);
  // TT-265: de bannerbalk kan pas gaan schuiven als hij in de pagina staat —
  // een verborgen element heeft geen breedte, dus een gezette scrollpositie
  // komt niet aan (zelfde valkuil als bij het wiel, huisstijl §7.1).
  profielBannerStarten(content);
  mediaTitelsBijwerken(content);
  // TT-249: de naam kan pas passend gemaakt worden als hij in de pagina staat
  // — een element dat er nog niet is, heeft geen breedte om tegen te meten.
  fitProfileName(content);
  // V-09: zelfde displayName-logica als binnen buildMusicianDetailHTML()
  // (TT-43: bezoekers zonder profiel zien alleen de gebruikersnaam).
  const displayName = isOwn ? m.fname : displayNameOf(m);
  footer.innerHTML = musicianContactFooterHTML(m, isOwn, displayName);
  // TT-385: uit een zoekopdracht voor een open rol nodig je meteen uit.
  rolUitnodigKnopPlaatsen(isOwn ? null : m.id);
  // TT-06: melden en blokkeren, onder de naam (TT-380). Op je eigen profiel
  // niet — daar maakt buildMusicianDetailHTML() ook geen plek.
  zetVeiligheidMenu('profielSchermActies', 'muzikant', isOwn ? null : m.id, displayName);
}

// TT-410b: de pagina voor een link die uit staat, of voor een profiel dat er
// niet is. Eén zin en één knop, in de vaste vorm van een lege staat (§15).
// TT-410b fase 2: één functie voor muzikant en band; alleen de tekst verschilt.
function toonProfielNietBeschikbaar(soort) {
  const band = soort === 'band';
  document.getElementById('profielSchermVoet').innerHTML = '';
  document.getElementById('profielSchermContent').innerHTML = emptyStateHTML(
    band ? 'Deze bandpagina is niet beschikbaar' : 'Dit profiel is niet beschikbaar',
    band ? 'De band deelt deze pagina niet via een link.' : 'De muzikant deelt dit profiel niet via een link.',
    'Naar Zoeken →',
    "showView('search')"
  );
}

// TT-410b (06-10-2026, besluit Ronald): delen staat standaard aan. De stand
// staat in musicians.delen_aan; de app onthoudt hem in myDeelAan.
let myDeelAan = true;

function updateDelenToggleBtn() {
  const btn = document.getElementById('delenToggleBtn');
  if (btn) btn.textContent = myDeelAan ? 'Delen via link: aan' : 'Delen via link: uit';
}

async function zetProfielDelen(aan) {
  if (!myMusicianId) return false;
  try {
    const { error } = await db.from('musicians')
      .update({ delen_aan: aan })
      .eq('id', myMusicianId);
    if (error) throw error;
    myDeelAan = aan;
    updateDelenToggleBtn();
    showToast(aan ? 'Delen staat aan. Je link werkt.' : 'Delen staat uit. Je link werkt niet meer.');
    return true;
  } catch (e) {
    logCaught('zetProfielDelen', e);
    showToast(friendlyErrorMessage(e));
    return false;
  }
}

function toggleProfielDelen() { return zetProfielDelen(!myDeelAan); }

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
    // 1-3. Bands (overdragen of opheffen), solo-bands en de eigen
    // profielgegevens — TT-281 (23-09-2026): in één databasefunctie, in één
    // transactie. Lukt één stap niet (bijvoorbeeld het overdragen van een
    // band), dan blijft alles staan. Vroeger ging de app door na een
    // mislukte overdracht, en bleef er een band zonder oprichter achter.
    const bandKeuzes = Array.from(document.querySelectorAll('#deleteAccountBandsArea .delete-account-band-row'))
      .map(row => ({
        band_id: row.getAttribute('data-band-id'),
        keuze:   row.querySelector('.delete-band-choice').value,
      }));
    const { error: mErr } = await db.rpc('tt_delete_own_profile', {
      p_musician_id: mid,
      p_band_keuzes: bandKeuzes,
      p_solo_bands:  pendingSoloBandIds,
    });
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

// TT-385 fase 3: de tegels van een band hebben dezelfde vorm (BAND_TILES in
// bands.js). Eén functie voor beide lijsten.
function tegelsHTML(lijst) {
  return lijst.map(t => `
    <div class="tile" onclick="openTegelScreen('${jsAttr(t.id)}')">
      <div style="flex:1;">
        <div class="tile-title">${escHtml(t.title)}</div>
        <div class="tile-sub">${escHtml(t.sub)}</div>
      </div>
    </div>
  `).join('');
}

function renderTegels() {
  document.getElementById('tegelsWrap').innerHTML = tegelsHTML(TILES);
}

// ─── Schermnavigatie binnen het tegeloverzicht ────────────────────────────
// Zelfde soort interne stap-switcher als de wizard (goTo()), maar dan met
// een terugknop-stap in de browsergeschiedenis per subscherm (V-03-patroon,
// zie de popstate-handler hieronder) — bewerken van een tegel is net zo'n
// "sluit dit eerst"-scherm als een open modal of een open gesprek.
// TT-385 fase 3 (02-10-2026): Bandprofiel bewerken gebruikt hetzelfde
// tegelscherm, met de vier tegels van de band. Welke band: bewerkBandId
// (bands.js); leeg betekent je eigen profiel. Zo gelden de terugknop, "Terug
// zonder opslaan?" en de stap in de geschiedenis voor beide gelijk.
const TEGEL_SCREENS = { wieBenJe: 'wieBenJeScreen', watSpeelJe: 'watSpeelJeScreen', watZoekJe: 'watZoekJeScreen', jeSetlist: 'jeSetlistScreen', mediahoek: 'mediahoekScreen',
  bandWie: 'bandWieScreen', bandBezetting: 'bandBezettingScreen', bandMuziek: 'bandMuziekScreen', bandMedia: 'bandMediaScreen' };
let activeTegelScreen = 'overview';
let tegelScreenHistoryPushed = false;

// TT-302 (20-09-2026, Ronald) en TT-408: de vraag 'terug zonder opslaan?'
// hoort bij de pijl in de kop en de terugknop van het toestel. De grote
// Terug-knop onderin een tegelscherm bestaat niet meer. De vergelijking per
// scherm staat één keer hier, zodat beide wegen terug dezelfde vraag stellen.
const TEGEL_WIJZIGINGEN = {
  wieBenJe:   () => wbjFieldSnapshot() !== wbjSnapshot,
  watSpeelJe: () => wspFieldSnapshot() !== wspSnapshot,
  watZoekJe:  () => wzjFieldSnapshot() !== wzjSnapshot,
  jeSetlist:  () => jstFieldSnapshot() !== jstSnapshot,
  mediahoek:  () => mhFieldSnapshot() !== mhSnapshot,
  bandWie:       () => bwFieldSnapshot() !== bwSnapshot,
  bandBezetting: () => bbFieldSnapshot() !== bbSnapshot,
  bandMuziek:    () => bmzFieldSnapshot() !== bmzSnapshot,
  bandMedia:     () => bmFieldSnapshot() !== bmSnapshot
};

// Staat er een tegelscherm open met wijzigingen die nog niet zijn opgeslagen?
// Een scherm dat nog niet is geopend heeft geen momentopname; dat telt als
// "geen wijzigingen", nooit als een fout die de terugknop blokkeert.
function tegelHeeftWijzigingen() {
  const meet = TEGEL_WIJZIGINGEN[activeTegelScreen];
  if (!meet) return false;
  try { return !!meet(); } catch (e) { return false; }
}

function openTegelOverview() {
  activeTegelScreen = 'overview';
  ontwapenTerug();    // TT-302: de vraag hoort bij het scherm dat je verlaat
  werkTerugKnopBij(); // TT-301
  tegelScreenHistoryPushed = false;
  Object.values(TEGEL_SCREENS).forEach(elId => { document.getElementById(elId).style.display = 'none'; });
  document.getElementById('tegelOverviewScreen').style.display = bewerkBandId ? 'none' : '';
  document.getElementById('bandTegelOverviewScreen').style.display = bewerkBandId ? '' : 'none';
  clearInterval(mhTipTimer);
  if (bewerkBandId) renderBandTegels();
  else renderTegels();
}

function openTegelScreen(id) {
  if (!TEGEL_SCREENS[id]) return;
  activeTegelScreen = id;
  ontwapenTerug();    // TT-302
  werkTerugKnopBij(); // TT-301: een open tegelscherm is een stap terug
  document.getElementById('tegelOverviewScreen').style.display = 'none';
  document.getElementById('bandTegelOverviewScreen').style.display = 'none';
  Object.values(TEGEL_SCREENS).forEach(elId => { document.getElementById(elId).style.display = 'none'; });
  document.getElementById(TEGEL_SCREENS[id]).style.display = '';
  if (!tegelScreenHistoryPushed) {
    safeHistoryPush(bewerkBandId ? { view: 'profieltegels', tegel: true, band: bewerkBandId } : { view: 'profieltegels', tegel: true }, '#profieltegels');
    tegelScreenHistoryPushed = true;
  }
  if (id === 'wieBenJe') openWieBenJe();
  else if (id === 'watSpeelJe') openWatSpeelJe();
  else if (id === 'watZoekJe') openWatZoekJe();
  else if (id === 'jeSetlist') openJeSetlist();
  else if (id === 'mediahoek') openJeMediahoek();
  else if (id === 'bandWie') openBandWie();
  else if (id === 'bandBezetting') openBandBezetting();
  else if (id === 'bandMuziek') openBandMuziek();
  else if (id === 'bandMedia') openBandMedia();
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
// tussen de andere velden. Het verborgen veld van het scherm (#wbjBio,
// #bwBio) blijft de echte waarde.
// TT-385 fase 3: één modal voor de bio van een muzikant en de tekst "Wie zijn
// we" van een band. Ze verschillen alleen in titel, uitleg en voorzetten
// (muzikantkant en bandkant volgen dezelfde regels, huisstijl).
const BIO_DOELEN = {
  wbj: {
    titel: 'Korte bio', uitleg: 'Dit is vaak het eerste wat andere muzikanten van je lezen.',
    bron: 'wbjBio', voorbeeld: 'Bijv. Ik speel al 3 jaar gitaar...', na: () => wbjRenderBioPreview(),
    voorzetten: [['Hoe lang speel je al?', 'Ik speel al ... jaar '],
                 ['Waar ben je nu mee bezig?', 'Op dit moment ben ik vooral bezig met '],
                 ['Wat wil je bereiken?', 'Wat ik wil bereiken is ']]
  },
  bw: {
    titel: 'Wie zijn we', uitleg: 'Dit lezen bezoekers direct onder jullie bezetting.',
    bron: 'bwBio', voorbeeld: 'Bijv. Vier vrienden uit Den Haag. We maken gitaarliedjes...', na: () => bwRenderBioPreview(),
    voorzetten: [['Hoe zijn jullie begonnen?', 'We zijn begonnen toen '],
                 ['Wat voor muziek maken jullie?', 'We maken '],
                 ['Waar willen jullie naartoe?', 'Wat we willen bereiken is ']]
  }
};
let bioDoel = 'wbj';

function openBioModal(doel) {
  bioDoel = BIO_DOELEN[doel] ? doel : 'wbj';
  const cfg = BIO_DOELEN[bioDoel];
  document.getElementById('bioModalTitel').textContent = cfg.titel;
  document.getElementById('bioModalUitleg').textContent = cfg.uitleg;
  document.getElementById('bioModalVoorzetten').innerHTML = cfg.voorzetten.map((v, i) =>
    `<button type="button" class="bio-prompt-chip" onclick="bioVoorzet(${i})">${escHtml(v[0])}</button>`).join('');
  const vak = document.getElementById('bioModalTextarea');
  vak.placeholder = cfg.voorbeeld;
  vak.value = document.getElementById(cfg.bron).value;
  document.getElementById('bioModal').classList.add('visible');
  vak.focus();
}
function closeBioModal() {
  document.getElementById('bioModal').classList.remove('visible');
}
function bioSyncVanModal() {
  const cfg = BIO_DOELEN[bioDoel];
  document.getElementById(cfg.bron).value = document.getElementById('bioModalTextarea').value;
  cfg.na();
}
function bioVoorzet(i) {
  const v = BIO_DOELEN[bioDoel].voorzetten[i];
  if (!v) return;
  applyBioPromptTo(document.getElementById('bioModalTextarea'), v[1]);
  bioSyncVanModal();
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
  statusEl.style.color = 'var(--text)';
  statusEl.textContent = 'We kunnen je plaats even niet automatisch ophalen — vul Plaats zelf in.';
  field.focus();
}
function wbjRelockCity() {
  wbjPostcodeManualMode = false;
  const field = document.getElementById('wbjCity');
  field.readOnly = true;
  field.style.cursor = 'not-allowed';
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

async function saveWatSpeelJe() {
  if (!wspState.instruments.length) { showToast('Selecteer minimaal één instrument.'); return; }
  if (!wspState.genres.length) { showToast('Selecteer minimaal één genre.'); return; }

  if (wspFieldSnapshot() === wspSnapshot) return;

  const { error: uErr } = await db.from('musicians')
    .update({ repertoire_type: wspRepertoireType || null }).eq('id', myMusicianId);
  if (uErr) { showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(uErr)); return; }

  // TT-281: wissen en opnieuw vullen in één transactie — zie persistEditedProfile().
  const { error: kErr } = await db.rpc('tt_save_musician_koppelingen', {
    p_musician_id: myMusicianId,
    p_instruments: wspState.instruments.map(instrument => ({ instrument, niveau: wspState.instrumentLevels[instrument] || null })),
    p_genres:      wspState.genres.map(genre => ({ genre })),
  });
  if (kErr) { showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(kErr)); return; }

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
let jstSearchTimeout = null;

// TT-385 fase 3 (02-10-2026): de covers van een band zoek je met dezelfde
// velden als de setlist van een muzikant (besluit Ronald, punt 8). De
// zoekfuncties hieronder heten jst..., maar dienen beide schermen. Het
// voorvoegsel p kiest het scherm: 'jst' (Je setlist, de standaard) of 'bc'
// (de covers in Onze muziek). De velden heten <p>ArtistSearch, <p>ArtistAc,
// <p>TrackWrap, <p>TrackLabel, <p>TrackSearch en <p>TrackAc.
const songArtiest = { jst: null, bc: null }; // { id, name } per scherm
const SONG_DOEL = {
  jst: { lijst: () => jstSongs, kies: 'jstAddSong' },
  bc:  { lijst: () => bcCovers, kies: 'bcAddCover' }
};
const jstArtistCache = new Map();
const jstTrackCache = new Map();

// _confirmDelete is bewust NIET meegenomen — tijdelijke UI-status voor de
// verwijder-bevestiging (jstRemoveSong()), geen opgeslagen gegeven.
function jstFieldSnapshot() {
  return JSON.stringify(jstSongs.map(s => ({ title: s.title, artist: s.artist, level: s.level })));
}

async function openJeSetlist() {
  const { data, error } = await db.from('musicians')
    .select('musician_songs(song_title, song_artist, mastery_level)')
    .eq('id', myMusicianId).single();
  if (error) {
    showToast('Kon je gegevens niet laden: ' + friendlyErrorMessage(error));
    return;
  }
  jstSongs = (data.musician_songs || []).map(s => ({ title: s.song_title, artist: s.song_artist, level: s.mastery_level }));
  songZoekLeeg('jst');
  jstRenderSongs();
  jstSnapshot = jstFieldSnapshot();
}

function jstSelectFirstAc(id) {
  const list = document.getElementById(id);
  const first = list && list.querySelector('.ac-item[onmousedown]');
  if (first && first.onmousedown) first.onmousedown();
}

async function jstOnArtistSearch(q, p = 'jst') {
  const ac = document.getElementById(p + 'ArtistAc');
  if (q.trim().length < 2) { ac.classList.remove('open'); return; }
  ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted);">Zoeken...</span></div>';
  ac.classList.add('open');
  const cacheKey = q.trim().toLowerCase();
  if (jstArtistCache.has(cacheKey)) {
    jstRenderArtistResults(ac, jstArtistCache.get(cacheKey), p);
    return;
  }
  clearTimeout(jstSearchTimeout);
  jstSearchTimeout = setTimeout(async () => {
    try {
      const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=musicArtist&limit=7&country=NL`);
      const data = await res.json();
      const artists = (data.results || []).slice(0, 6);
      jstArtistCache.set(cacheKey, artists);
      jstRenderArtistResults(ac, artists, p);
    } catch (e) {
      logCaught('jstOnArtistSearch', e);
      ac.innerHTML = '<div class="ac-item"><span style="color:var(--danger);">Zoekopdracht mislukt</span></div>';
    }
  }, 400);
}
function jstRenderArtistResults(ac, artists, p = 'jst') {
  if (!artists.length) {
    ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted);">Geen artiesten gevonden</span></div>';
    return;
  }
  ac.innerHTML = artists.map(a => `
    <div class="ac-item" onmousedown="jstSelectArtist('${jsAttr(a.artistId)}','${jsAttr(a.artistName)}'${p === 'jst' ? '' : `,'${p}'`})">
      ${escHtml(a.artistName)}${a.primaryGenreName ? ` <span style="color:var(--muted);font-size:11px;">(${escHtml(a.primaryGenreName)})</span>` : ''}
    </div>`).join('');
}
function jstSelectArtist(id, name, p = 'jst') {
  songArtiest[p] = { id, name };
  document.getElementById(p + 'ArtistSearch').value = name;
  closeAC(p + 'ArtistAc');
  const wrap = document.getElementById(p + 'TrackWrap');
  wrap.style.display = '';
  document.getElementById(p + 'TrackLabel').textContent = 'Nummer van ' + name;
  document.getElementById(p + 'TrackSearch').value = '';
  document.getElementById(p + 'TrackSearch').focus();
  closeAC(p + 'TrackAc');
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
async function jstOnTrackSearch(q, p = 'jst') {
  const ac = document.getElementById(p + 'TrackAc');
  if (!songArtiest[p]) return;
  if (!q.length) { ac.classList.remove('open'); return; }
  ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted);">Zoeken...</span></div>';
  ac.classList.add('open');
  try {
    const songs = await jstFetchArtistSongs(songArtiest[p].id);
    jstRenderTrackResults(ac, songs, q, p);
  } catch (e) {
    logCaught('jstOnTrackSearch', e);
    ac.innerHTML = '<div class="ac-item"><span style="color:var(--danger);">Zoekopdracht mislukt</span></div>';
  }
}
function jstRenderTrackResults(ac, songs, q, p = 'jst') {
  const qLower = q.toLowerCase();
  const artiest = songArtiest[p];
  const al = SONG_DOEL[p].lijst();
  const seen = new Set();
  const results = (songs || [])
    .filter(r => {
      const title = r.trackName;
      if (!title) return false;
      if (!title.toLowerCase().includes(qLower)) return false;
      const key = title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      if (al.find(s => s.title.toLowerCase() === title.toLowerCase() && s.artist.toLowerCase() === artiest.name.toLowerCase())) return false;
      return true;
    })
    .slice(0, 8);
  if (!results.length) {
    ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted);">Geen nummers gevonden</span></div>';
    return;
  }
  ac.innerHTML = results.map(r => `
    <div class="ac-item" onmousedown="${SONG_DOEL[p].kies}('${jsAttr(r.trackName)}','${jsAttr(artiest.name)}')">${escHtml(r.trackName)}</div>`).join('');
}
// Na een keuze: beide zoekvelden leeg, het nummerveld weer weg.
function songZoekLeeg(p) {
  document.getElementById(p + 'ArtistSearch').value = '';
  document.getElementById(p + 'TrackSearch').value = '';
  document.getElementById(p + 'TrackWrap').style.display = 'none';
  closeAC(p + 'TrackAc');
  closeAC(p + 'ArtistAc');
  songArtiest[p] = null;
}

function jstAddSong(title, artist) {
  if (jstSongs.find(s => s.title === title && s.artist === artist)) return;
  jstSongs.push({ title, artist, level: null });
  songZoekLeeg('jst');
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
// ✕. De listener wordt pas ná de huidige klik geregistreerd, en verdwijnt
// vanzelf ({ once: true }).
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

async function saveJeSetlist() {
  if (jstFieldSnapshot() === jstSnapshot) return;

  // TT-281: wissen en opnieuw vullen in één transactie — zie persistEditedProfile().
  const { error } = await db.rpc('tt_save_musician_koppelingen', {
    p_musician_id: myMusicianId,
    p_songs: jstSongs.map(s => ({ song_title: s.title, song_artist: s.artist, mastery_level: s.level })),
  });
  if (error) { showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(error)); return; }
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
    mediaFiles: mhMediaFiles.map(m => ({ url: m.url, type: m.type, uploading: m.uploading, inBanner: !!m.inBanner })),
    mediaLinks: mhMediaLinks,
  });
}

async function openJeMediahoek() {
  mhStartTipCycle();
  const { data, error } = await db.from('musicians')
    .select('avatar_url, musician_media(media_type, url, platform, in_banner)')
    .eq('id', myMusicianId).single();
  if (error) {
    showToast('Kon je gegevens niet laden: ' + friendlyErrorMessage(error));
    return;
  }
  mhAvatarUrl = data.avatar_url || null;
  mhMediaFiles = (data.musician_media || [])
    .filter(x => x.media_type === 'foto' || x.media_type === 'video')
    .map(x => ({ name: '', url: x.url, path: null, type: x.media_type, uploading: false, inBanner: !!x.in_banner }));
  mhMediaLinks = (data.musician_media || []).filter(x => x.media_type === 'link')
    .map(x => ({ url: x.url, inBanner: !!x.in_banner }));

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
    preview.innerHTML = `<span id="mhAvatarInitials" class="avatar-t">T</span>`;
    document.getElementById('mhAvatarRemoveBtn').classList.remove('visible');
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

// TT-381: het kruisje vraagt in een venster, niet meer met een knop die van
// tekst wisselt — een kruisje heeft geen ruimte voor "Zeker weten?".
function mhAskRemoveAvatar() {
  showConfirm('Profielfoto verwijderen?', mhRemoveAvatar, 'Ja, verwijderen');
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
    const entry = { name: file.name, url: blobUrl, path: null, type, uploading: true, inBanner: false };
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
  grid.innerHTML = mhMediaFiles.map((m, i) => mediaTegelHTML(m, i, 'mh')).join('');
  bannerTellerBijwerken('mhBannerTeller', mhMediaFiles, mhMediaLinks);
}

// TT-263: dezelfde keuze als in de wizard, met dezelfde grens over foto's,
// video's en links samen.
function mhToggleMediaBanner(i) {
  const m = mhMediaFiles[i];
  if (!m) return;
  if (!bannerKeuzeMag(bannerAantal(mhMediaFiles, mhMediaLinks), !m.inBanner)) return;
  m.inBanner = !m.inBanner;
  bannerKnopStandZetten('mhMediaGrid', i, m.inBanner);
  bannerTellerBijwerken('mhBannerTeller', mhMediaFiles, mhMediaLinks);
}

function mhSpeelMedia(i) {
  const m = mhMediaFiles[i];
  if (!m || !m.url) return;
  if (m.type === 'foto') { openMediaLightbox(m.url); return; }
  openMediaSpeler(m.url, 'video', m.name || '', '');
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
  mhMediaLinks.push({ url: '', inBanner: false });
  mhRenderLinksList();
}

function mhRenderLinksList() {
  const list = document.getElementById('mhLinksList');
  list.innerHTML = mhMediaLinks.map((l, i) => mediaLinkRijHTML(l, i, 'mh')).join('');
  mediaTitelsBijwerken(list);
  bannerTellerBijwerken('mhBannerTeller', mhMediaFiles, mhMediaLinks);
}

// Tijdens het typen alleen de waarde bijhouden; hertekenen gebeurt als het
// veld verlaten wordt, anders springt de aandacht uit het veld.
function mhUpdateLinkUrl(i, el) {
  if (!mhMediaLinks[i]) return;
  mhMediaLinks[i].url = el.value;
}

function mhToggleLinkBanner(i) {
  const l = mhMediaLinks[i];
  if (!l) return;
  if (!l.url.trim()) { showToast('Vul eerst het adres van de link in.'); return; }
  if (!bannerKeuzeMag(bannerAantal(mhMediaFiles, mhMediaLinks), !l.inBanner)) return;
  l.inBanner = !l.inBanner;
  bannerKnopStandZetten('mhLinksList', i, l.inBanner);
  bannerTellerBijwerken('mhBannerTeller', mhMediaFiles, mhMediaLinks);
}

function mhSpeelLink(i) {
  const l = mhMediaLinks[i];
  if (!l || !l.url.trim()) return;
  openMediaSpeler(l.url, 'link', null, detectPlatform(l.url));
}

function mhRemoveLink(i) {
  mhMediaLinks.splice(i, 1);
  mhRenderLinksList();
}

async function saveJeMediahoek() {
  if (mhFieldSnapshot() === mhSnapshot) return;

  const { error: uErr } = await db.from('musicians')
    .update({ avatar_url: mhAvatarUrl || null }).eq('id', myMusicianId);
  if (uErr) { showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(uErr)); return; }

  // TT-281: wissen en opnieuw vullen in één transactie — zie persistEditedProfile().
  const linkMedia = mhMediaLinks
    .filter(l => l.url.trim())
    .map(l => ({ media_type: 'link', url: l.url, platform: detectPlatform(l.url), in_banner: !!l.inBanner }));
  const fileMedia = mhMediaFiles
    .filter(m => m.url && !m.uploading && !m.url.startsWith('blob:'))
    .map(m => ({ media_type: m.type, url: m.url, in_banner: !!m.inBanner }));
  const { error: kErr } = await db.rpc('tt_save_musician_koppelingen', {
    p_musician_id: myMusicianId,
    p_media: linkMedia.concat(fileMedia),
  });
  if (kErr) { showToast('Opslaan is niet gelukt: ' + friendlyErrorMessage(kErr)); return; }

  mhSnapshot = mhFieldSnapshot();
  showToast('Wijzigingen opgeslagen.');
}

// ─── Niveautabel voor muzikanten (de i-knop) ─────────────────────────────────
// Verplaatst uit bands.js (26-09-2026). Inhoud ongewijzigd.

// TT-51-uitbreiding (12-08-2026): Tabel 2 uit niveaubepaling-naslagwerk.md,
// 1-op-1 overgenomen. Hardcoded (geen build-stap om een .md-bestand in te
// lezen in deze losse-bestand-app) — bij een tekstwijziging in het naslagwerk
// moet deze lijst hier ook worden bijgewerkt.
const NIVEAU_INFO_MUSICIAN_HEADERS = ['Niveau', 'Technische beheersing', 'Gehoor en muziektheorie', 'Voorbereiden en repeteren', 'Live spelen en flexibiliteit'];
const NIVEAU_INFO_MUSICIAN_ROWS = [
  ['1. Beginner (Bedroom)',
    'Je kent de basisakkoorden of een paar toffe drumbeats. Je speelt vooral losse intro\'s of riffjes van TikTok en YouTube. Je timing schommelt.',
    'Je kunt akkoorden nog niet echt op gehoor naspelen. Je hebt internettabs, YouTube-tutorials of eenvoudige bladmuziek nodig.',
    'Je hebt echt een leraar of hulp nodig om een nieuw nummer te leren. Je oefent nog een beetje onregelmatig.',
    'Je speelt eigenlijk altijd op hetzelfde volume. Als de band stopt of iets anders doet dan de opname, ben je de draad kwijt.'],
  ['2. Gevorderde Beginner (Jammer)',
    'Je speelt complete nummers vloeiend uit. Je basistechniek (barré-akkoorden, ademsteun, fills) is stabiel en kost steeds minder moeite.',
    'Je herkent eenvoudige basisschema\'s. Je kunt nummers thuis uitzoeken en naspelen door goed naar de originele track te luisteren.',
    'Je studeert thuis zelfstandig de nummers in die zijn afgesproken. Je kent je partijen uit je hoofd als je naar de repetitie komt.',
    'Je luistert naar de rest en past je volume aan. Je kunt een simpele eigen fill of solo verzinnen die past bij de structuur van het nummer.'],
  ['3. Half-Gevorderd (Gig-Ready)',
    'Fysieke techniek is een automatisme; constante strakke timing. Je hebt een goede, bewuste controle over je eigen klankkleur en sound.',
    'Kan makkelijk improviseren en solo\'s construeren over bekende toonsoorten; sterke functionele basiskennis van muziektheorie.',
    'Bedenkt en schrijft eigen partijen uit. Heeft minimale repetitietijd nodig om een volledige live-set van anderhalf uur te beheersen.',
    'Herstelt live-fouten onmiddellijk zonder dat het opvalt; speelt moeiteloos met een clicktrack of In-Ear monitor.'],
  ['4. Gevorderd (Set-Leider)',
    'Zeer brede technische bagage; lost instrument-technische problemen direct live op; schakelt moeiteloos tussen uiteenlopende genres.',
    'Kan live on-the-fly transponeren naar een andere toonsoort; pikt complexe harmonieën en akkoordenschema\'s direct op gehoor op.',
    'Kan fungeren als muzikaal leider (MD); arrangeert efficiënt partijen voor andere bandleden en levert kant-en-klare prestaties aan.',
    'Volledige controle over dynamiek; levert studio-waardige prestaties onder live-fysieke spanning (zoals intense podiumactie of dans).'],
  ['5. Professioneel',
    'Grenzeloze techniek; beschikt over een internationaal onderscheidende, direct herkenbare \'signature sound\' en artistieke identiteit.',
    'Absoluut gehoor of uitzonderlijk ontwikkeld relatief gehoor; leest direct complexe chord charts of partituren vanaf papier (sight-reading).',
    'Volledig autonoom en multi-inzetbaar; beheerst een complete setlist binnen 24 uur; de vaste eerste keuze voor high-end studio- en sessiewerk.',
    'Volledige controle over emotie en klank; anticipeert en adapteert onmiddellijk aan elke onverwachte live-situatie of tempowisseling.'],
];

function openMusicianNiveauInfoModal() {
  // V-21 + 21-08-2026: zelfde haakjes-regel als bij de bandtabel hierboven.
  const rowsHTML = NIVEAU_INFO_MUSICIAN_ROWS.map(r => `<tr>${r.map((c, i) => `<td>${escHtml(i === 0 ? stripParenthetical(c) : c)}</td>`).join('')}</tr>`).join('');
  document.getElementById('niveauInfoModalContent').innerHTML = `
    <div class="filter-title" style="margin-bottom:4px;">Niveau-indeling per instrument</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">Kies per instrument het niveau waar je het dichtst bij in de buurt zit. Zie het als een richtlijn, geen examen.</p>
    <div class="niveau-info-wrap">
      <table class="niveau-info-table">
        <thead><tr>${NIVEAU_INFO_MUSICIAN_HEADERS.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
    <div class="filter-title" style="font-size:15px;margin-bottom:8px;">Belangrijk: gebruik dit systeem als jouw kompas</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px;">Geen enkele muzikant past perfect in één enkel hokje, en dat is volstrekt normaal. Je kunt bijvoorbeeld technisch heel ver zijn (Niveau 4), maar nog nooit op een podium hebben gestaan (Niveau 1).</p>
    <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">Zie deze niveaubeschrijvingen dan ook puur als een praktische richtlijn, niet als een set onwrikbare wetten.</p>
    <div class="filter-title" style="font-size:15px;margin-bottom:8px;">Hoe kies je jouw niveau?</div>
    <p style="font-size:13px;color:var(--muted);">Loop de criteria per niveau rustig langs. Kijk niet naar waar je één losse vaardigheid hebt zitten, maar kijk naar het grotere plaatje. Kies simpelweg het niveau waar jij het dichtst bij in de buurt zit en waar je jezelf het meest in herkent. Het is geen examen, maar een hulpmiddel om te ontdekken waar je nu staat en waar je naartoe kunt groeien!</p>
  `;
  document.getElementById('niveauInfoModal').classList.add('visible');
}
