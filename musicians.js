






function buildMusicianDetailHTML(m, isOwn, inModal) {
  const age  = ageOf(m);



  const displayName = displayNameOf(m);
  const avatarSrc = safeUrl(m.avatar_url);



  const songRows = [...m.musician_songs].sort((a, b) =>
    compareArtistTitle(a.song_artist, a.song_title, b.song_artist, b.song_title)
  ).map(s => {





    const lvl = LEVEL_LABELS[s.mastery_level] ? s.mastery_level : '';

    const knop = isOwn ? '' : overneemKnopHTML(s.song_title, s.song_artist);
    return `
    <div class="profile-song-row">
      <span><strong>${escHtml(s.song_artist)}</strong> — <span class="profile-song-titel">${escHtml(s.song_title)}</span></span>
      ${lvl || knop ? `<span class="nummer-rechts">${lvl ? `<span class="level-pill">${escHtml(LEVEL_LABELS[lvl])}</span>` : ''}${knop}</span>` : ''}
    </div>`;
  });














  const veiligheidPlekHTML = (inModal && !isOwn && hasOwnProfile)
    ? '<span id="profielSchermActies" class="profiel-menu-plek"></span>' : '';





  const actieHTML = (isOwn && !inModal)
    ? '<div class="profiel-actie"><button class="btn btn-ghost" onclick="editMyProfile()">Profiel bewerken</button></div>'
    : (inModal && !isOwn) ? '<div class="profiel-actie" id="profielSchermActie"></div>' : '';





  const instrumentenRegel = m.musician_instruments.map(x => {
    const sterren = starDisplayHTML(x.niveau, true);
    return escHtml(x.instrument) + (sterren ? ' ' + sterren : '');
  }).join(' · ');
  const genresRegel = m.musician_genres.map(x => escHtml(x.genre)).join(' · ');

  const watHTML = `
    <div class="profiel-wat">
      ${instrumentenRegel ? `<div class="profiel-wat-regel">${instrumentenRegel}</div>` : ''}
      ${genresRegel ? `<div class="profiel-wat-regel">${genresRegel}</div>` : ''}
    </div>`;




  return `
    ${profielHoesHTML({
      foto: avatarSrc, wazig: wazigBron(m.avatar_url), naam: displayName, media: m.musician_media,

      fotoToevoegen: isOwn ? 'voegFotoToe()' : null,

      kaart: { id: m.id, naam: displayName, regel: `${age} jaar · ${m.city || ''}`,
               wat: m.musician_instruments.map(x => x.instrument), onder: m.musician_genres.map(x => x.genre) },

      regels: `<div class="profile-meta">${age} jaar · ${escHtml(m.city)}${m.distance_km != null ? ` · ${afstandTekst(m.distance_km)}` : ''}</div>`,
      knoppen: profielKnoppenHTML('profiel', m.id, displayName, veiligheidPlekHTML)
    })}
    ${watHTML}
    ${standMeldingHTML(m.stand)}
    ${m.bio ? `<p class="profile-bio">${tekstMetMeerHTML(m.bio)}</p>` : ''}
    ${actieHTML}
    ${profielBandsHTML(m.bands)}
    ${m.musician_songs.length ? `
      <div class="profile-songs">
        <div class="profile-songs-title">Repertoire</div>
        ${nummerLijstHTML(songRows)}
      </div>` : ''}
    ${profielMediaHTML(m.musician_media, m.avatar_url)}`;
}




async function voegFotoToe(bandId) {
  if (bandId) openBandTegels(bandId);
  else { if (!(await getMyMusicianId())) return; showView('profieltegels'); }
  openTegelScreen(bandId ? 'bandMedia' : 'mediahoek');
}
















function profielMediaHTML(mediaLijst, fotoWazig) {
  const lijst = (mediaLijst || [])
    .map(x => ({ ...x, safeHref: safeUrl(x.url) }))
    .filter(x => x.safeHref || x.afgeschermd);
  if (!lijst.length) return '';

  if (lijst.some(x => x.afgeschermd)) {
    return `
    <div class="profile-media">
      <div class="profile-media-title">Foto's, video's en links</div>
      ${mediaAfgeschermdHTML(lijst, fotoWazig)}
    </div>`;
  }
  const links = lijst.filter(x => x.media_type === 'link');
  const photos = lijst.filter(x => x.media_type === 'foto');
  const videos = lijst.filter(x => x.media_type === 'video');
  const fotoTegel = p => `<button type="button" class="profile-media-tegel" onclick="openMediaLightbox('${jsAttr(p.safeHref)}')"><img ${kleinFotoAttr(p.safeHref)} alt="Foto" class="media-tegel-beeld"></button>`;
  const videoTegel = v => `<button type="button" class="profile-media-tegel" onclick="openMediaSpeler('${jsAttr(v.safeHref)}', 'video')"><video ${fotoBronAttr(v.safeHref + '#t=0.1')} muted playsinline preload="metadata" tabindex="-1" aria-hidden="true" class="media-tegel-beeld media-tegel-video"></video>${SPEELTEKEN_HTML}</button>`;
  const linkTegel = l => {
    const ytId = extractYouTubeId(l.safeHref);
    const label = l.platform || 'Link';
    const inner = ytId
      ? `<img src="https://img.youtube.com/vi/${jsAttr(ytId)}/hqdefault.jpg" alt="${escHtml(label)}" class="media-tegel-beeld">` + SPEELTEKEN_HTML
      : `<span class="media-tegel-link"><span class="media-tegel-link-naam">${escHtml(label)}</span></span>`;



    return `<button type="button" onclick="openMediaSpeler('${jsAttr(l.safeHref)}', 'link', null, '${jsAttr(label)}')" class="profile-media-tegel">${inner}</button>`;
  };
  return `
      <div class="profile-media">
        <div class="profile-media-title">Foto's, video's en links</div>
        <div class="media-raster-drie">
          ${photos.map(fotoTegel).join('')}${videos.map(videoTegel).join('')}${links.map(linkTegel).join('')}
        </div>
      </div>`;
}













async function shareProfile(kind, id, name) {
  const path = kind === 'band' ? 'band' : 'profiel';
  const url = `${location.origin}${location.pathname}#${path}/${id}`;
  const label = kind === 'band' ? 'bandprofiel' : 'profiel';
  const shareData = {
    title: `${name} op TalentTent`,
    text: `Bekijk het ${label} van ${name} op TalentTent.`,
    url
  };




  const kanBeeld = !!(navigator.share && navigator.canShare &&
    navigator.canShare({ files: [new File([''], 'kaart.jpg', { type: 'image/jpeg' })] }));
  if (kanBeeld) {
    const kaart = await kaartVoorDelen(kind, id);
    if (kaart) {
      try { await navigator.share({ ...shareData, files: [kaart] }); return; } catch (e) {
        if (e && e.name === 'AbortError') return;
        logCaught('shareProfile kaart', e);
      }
    }
  }
  if (navigator.share && (kanBeeld || !navigator.clipboard)) {
    try { await navigator.share(shareData); } catch (e) { }
    return;
  }
  try {
    await navigator.clipboard.writeText(url);
  } catch (e) {
    logCaught('shareProfile', e);
    showToast('Kopiëren lukt niet op dit apparaat. Kopieer de link zelf: ' + url);
    return;
  }
  const kaart = await kaartVoorDelen(kind, id);
  if (kaart) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(kaart);
    a.download = kaart.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  showToast(kaart ? 'Link gekopieerd. Je kaart staat bij je downloads.' : 'Link gekopieerd naar klembord');
}







async function kaartVoorDelen(kind, id) {
  const hoes = [...document.querySelectorAll('.hoes[data-kaart]')]
    .find(h => { try { return JSON.parse(h.dataset.kaart).id === id; } catch (e) { return false; } });
  if (!hoes) return null;
  const maken = (async () => {
    const g = JSON.parse(hoes.dataset.kaart);
    const src = await kaartBeeldOphalen(kind, id);
    const beeld = await kaartBeeldLaden(src);
    const c = await kaartMaken(g, beeld);
    const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', 0.9));
    if (!blob) return null;
    const naam = String(g.naam).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'kaart';
    return new File([blob], `talenttent-${naam}.jpg`, { type: 'image/jpeg' });
  })().catch(e => { logCaught('kaartVoorDelen', e); return null; });
  return Promise.race([maken, new Promise(ok => setTimeout(() => ok(null), 3000))]);
}




async function kaartBeeldOphalen(kind, id) {
  const fn = kind === 'band' ? 'tt_get_bands_public' : 'tt_get_musicians_public';
  const r = await ttFetchMetHerhaling(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [id] })
  });
  if (!r.ok) throw new Error(`${fn}: ${r.status}`);
  const rij = (await r.json())[0];
  if (!rij) throw new Error(`${fn}: geen rij`);
  return rij.avatar_url || null;
}





async function kaartBeeldLaden(src) {
  if (!src) return null;
  const img = new Image();
  const geladen = new Promise((ok, nee) => { img.onload = ok; img.onerror = () => nee(new Error('beeld laadt niet')); });
  const w = wazigBron(src);
  if (w) img.src = w;
  else {

    if (!/^https:\/\//i.test(String(src))) return null;
    img.crossOrigin = 'anonymous';
    await fotoBronZetten(img, String(src));
  }
  await geladen;
  return { img, wazig: !!w };
}












function deelKnopHTML(kind, id, name, actie) {
  const label = kind === 'band' ? 'Deel dit bandprofiel' : 'Deel dit profiel';
  const klik = actie || `shareProfile('${kind === 'band' ? 'band' : 'profiel'}','${jsAttr(id)}','${jsAttr(name)}')`;
  return `<button type="button" class="nav-menu-btn deel-knop" onclick="${klik}" aria-label="${label}" title="Delen">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><circle cx="18" cy="5" r="3" stroke="none"></circle><circle cx="6" cy="12" r="3" stroke="none"></circle><circle cx="18" cy="19" r="3" stroke="none"></circle><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"></line><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"></line></svg>
  </button>`;
}



function profielKnoppenHTML(kind, id, name, menuHTML, deelActie) {
  return `<div class="profiel-knoppen">${deelKnopHTML(kind, id, name, deelActie)}${menuHTML || ''}</div>`;
}

function musicianContactFooterHTML(m, isOwn, displayName) {

  if (isOwn) return '';







  if (blokkeerIkZelf(m.id)) {
    return `<div class="blokkade-regel">Je hebt ${escHtml(displayName)} geblokkeerd.</div>
      <button class="btn btn-ghost" onclick="deblokkeerMuzikant('${jsAttr(m.id)}','${jsAttr(displayName)}')">Blokkade opheffen</button>`;
  }
  const contactBtn = hasOwnProfile
    ? `<button class="btn btn-primary" data-bericht-id="${escHtml(m.id)}" onclick="openMessageComposer('${jsAttr(m.id)}','${jsAttr(displayName)}')">Stuur een bericht</button>`
    : `<button class="btn btn-primary" onclick="showView('register')">Maak een profiel en leg contact</button>`;
  return contactBtn;
}







let profielLaadBelofte = null;

function openProfielScherm(id, opties) {
  const o = opties || {};
  showView('profiel', o.redirect ? 'redirect' : undefined, { id });
  return profielLaadBelofte;
}





async function profielStand(id) {
  try {
    const { data, error } = await db.rpc('tt_profiel_stand', { mid: id });
    if (error) throw error;
    return STANDEN.some(x => x.waarde === data) ? data : 'actief';
  } catch (e) {
    logCaught('profielStand', e);
    return 'actief';
  }
}

let huidigProfielId = null;
let huidigBandId = null;
let profielSchermVolgnr = 0;

async function laadProfielScherm(id) {
  const volgnr = ++profielSchermVolgnr;
  huidigProfielId = id || null;
  huidigBandId = null;
  const content = document.getElementById('profielSchermContent');
  delete content.dataset.klaar;
  content.classList.remove('uitnodig-open');
  content.innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--muted);">Laden...</div>';
  if (!id) { toonProfielNietBeschikbaar('muzikant'); return; }






  let m = null, error = null;
  const standVraag = profielStand(id);

  const bandsVraag = profielBandsOphalen(id);
  const leeftijdVraag = hasOwnProfile ? vraagNu(db.rpc('tt_musicians_ages', { ids: [id] })) : null;

  if (hasOwnProfile) {




    const res = await db.from('musicians').select(`
      id, weergavenaam, username, city, bio,
      avatar_url,
      musician_instruments(instrument, niveau),
      musician_genres(genre),
      musician_songs(song_title, song_artist, mastery_level),
      musician_media(media_type, url, platform, in_banner, created_at, uitsnede)
    `).eq('id', id).single();
    m = res.data; error = res.error;
    if (m) {
      const { data: ages } = await leeftijdVraag;
      m.age = (ages && ages[0]) ? ages[0].age : undefined;
    }
  } else {

    const res = await db.rpc('tt_get_musicians_public', { ids: [id] });
    error = res.error;
    const row = (res.data || [])[0];
    if (row) {
      m = {


        id: row.id, username: row.username, age: row.age, birth_date: row.birth_date, city: row.city,
        bio: row.bio, avatar_url: row.avatar_url,



        musician_instruments: (row.instrument_levels || []).map(x => ({ instrument: x.instrument, niveau: x.niveau })),
        musician_genres: (row.genres || []).map(g => ({ genre: g })),
        musician_songs: row.songs || [],


        musician_media: row.media || [],
      };
      await weergavenamenToevoegen([m]);
    }
  }

  const stand = await standVraag;
  if (volgnr !== profielSchermVolgnr) return;



  if (!m && (!error || error.code === 'PGRST116')) { toonProfielNietBeschikbaar('muzikant'); return; }
  if (error || !m) {
    logCaught('laadProfielScherm', error);
    content.innerHTML = foutStaatHTML(error, 'het profiel laden', `laadProfielScherm('${jsAttr(id)}')`);
    return;
  }

  const isOwn = !!(myMusicianId && myMusicianId === m.id);
  m.stand = stand;


  m.bands = await bandsVraag;
  if (volgnr !== profielSchermVolgnr) return;


  m.distance_km = musicianDistanceCache[m.id] != null ? musicianDistanceCache[m.id] : null;

  content.innerHTML = buildMusicianDetailHTML(m, isOwn, true);
  overneemKnoppenBijwerken(content);



  hoesStarten(content);
  mediaTitelsBijwerken(content);


  fitProfileName(content);



  const displayName = displayNameOf(m);
  const actie = document.getElementById('profielSchermActie');
  if (actie) actie.innerHTML = musicianContactFooterHTML(m, isOwn, displayName);


  rolUitnodigKnopPlaatsen(isOwn ? null : m.id, displayName);


  zetVeiligheidMenu('profielSchermActies', 'muzikant', isOwn ? null : m.id, displayName);


  content.dataset.klaar = 'muzikant:' + id;
}





function toonProfielNietBeschikbaar(soort) {
  const band = soort === 'band';
  document.getElementById('profielSchermContent').innerHTML = emptyStateHTML(
    band ? 'Deze bandpagina bestaat niet meer' : 'Dit profiel bestaat niet meer',
    band ? 'Het bandprofiel is verwijderd, of de link klopt niet.' : 'Het account is verwijderd, of de link klopt niet.',
    'Naar Zoeken',
    "showView('search')"
  );
}





function openMediaLightbox(url) {
  fotoBronZetten(document.getElementById('mediaLightboxImg'), url);
  document.getElementById('mediaLightbox').classList.add('visible');
}
function closeMediaLightbox() {
  document.getElementById('mediaLightbox').classList.remove('visible');
  document.getElementById('mediaLightboxImg').src = '';
}














let accountBands = [];
let pendingSoloBandIds = [];

async function vraagAccountVerwijderen() {
  const mid = await getMyMusicianId();
  if (!mid) { geenProfielMelding('Je hebt geen profiel om te verwijderen.'); return; }
  accountBands = []; pendingSoloBandIds = [];
  let naam = '', fout = null;
  try {
    const [ik, bands] = await Promise.all([
      db.from('musicians').select('weergavenaam, username').eq('id', mid).single(),
      db.from('bands').select('id, name, band_members(musician_id, status, musicians(id, weergavenaam, username))').eq('founder_id', mid)
    ]);
    if (ik.error) throw ik.error;
    if (bands.error) throw bands.error;
    naam = displayNameOf(ik.data);
    (bands.data || []).forEach(b => {
      const leden = (b.band_members || []).filter(m => m.status === 'bevestigd' && m.musician_id !== mid)
        .map(m => ({ id: m.musician_id, naam: displayNameOf(m.musicians) }))
        .sort((x, y) => x.naam.localeCompare(y.naam, 'nl'));
      if (leden.length) accountBands.push({ id: b.id, naam: b.name || '', leden, keuze: null });
      else pendingSoloBandIds.push(b.id);
    });
    accountBands.sort((x, y) => x.naam.localeCompare(y.naam, 'nl'));
  } catch (e) {
    logCaught('vraagAccountVerwijderen', e);
    fout = e;
  }
  showConfirm(
    `Je profiel, je setlist en je foto's en video's verdwijnen dan, en je logt niet meer in met ${currentUser?.email || ''}. Dat is niet terug te draaien.`,
    executeAccountDeletion,
    'Account verwijderen', true, null,
    naam ? `Account van ${naam} verwijderen?` : null, null,
    'Ik begrijp dat mijn gegevens definitief worden verwijderd.'
  );

  if (fout) {
    document.getElementById('confirmKeuzes').innerHTML = foutStaatHTML(fout, 'je bands laden', 'vraagAccountVerwijderen()');
    confirmExtraDicht = true; zetConfirmKnop();
    return;
  }
  tekenAccountBands();
}


function tekenAccountBands() {
  const vak = document.getElementById('confirmKeuzes');
  vak.innerHTML = accountBands.map((b, i) => `
    <div class="menu-anchor">
      <div class="tile" id="accountBandTegel${i}" aria-label="${escHtml(b.naam)}">
        <div style="flex:1;"><div class="tile-title">${escHtml(b.naam)}</div>
        <div class="tile-sub"><span class="wheel-field-label"></span></div></div>
      </div>
      <div class="choice-menu menu-breed menu-tegel" id="accountBandMenu${i}" role="listbox" aria-label="${escHtml(b.naam)}"></div>
    </div>`).join('');
  accountBands.forEach((b, i) => initChoiceField({
    id: 'account-band-' + i, fieldId: 'accountBandTegel' + i, menuId: 'accountBandMenu' + i,
    rijen: () => b.leden.map(l => ({ t: l.naam, u: 'wordt beheerder', gekozen: b.keuze === l.id }))
      .concat([{ t: 'Bandprofiel verwijderen', u: 'de band verdwijnt voor alle leden', gekozen: b.keuze === 'delete' }]),
    kies: j => { b.keuze = j < b.leden.length ? b.leden[j].id : 'delete'; werkAccountKeuzesBij(); },
    ververs: werkAccountKeuzesBij
  }));
  werkAccountKeuzesBij();
}

function werkAccountKeuzesBij() {
  accountBands.forEach((b, i) => {
    const regel = document.querySelector(`#accountBandTegel${i} .wheel-field-label`);
    const lid = b.leden.find(l => l.id === b.keuze);
    if (regel) regel.textContent = lid ? `${lid.naam} wordt beheerder`
      : b.keuze === 'delete' ? 'Bandprofiel verwijderen' : 'kies wat er met de band gebeurt';
  });
  confirmExtraDicht = accountBands.some(b => !b.keuze);
  zetConfirmKnop();
}





async function extractFnErrorDetail(fnErr) {
  if (!fnErr) return '';
  try {
    if (fnErr.context && typeof fnErr.context.json === 'function') {
      const body = await fnErr.context.clone().json();
      if (body && body.error) return body.error;
    }
  } catch (e) { }
  return fnErr.message || String(fnErr);
}










async function deleteOwnAuthAccountWithRetry(maxAttempts = 3) {
  let lastDetail = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {






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
  if (!mid || accountBands.some(b => !b.keuze)) return;

  try {









    const bandKeuzes = accountBands.map(b => ({
      band_id: b.id,
      keuze: b.keuze,
      berichten: b.keuze === 'delete'
        ? b.leden.map(l => ({ aan: l.id, tekst: tekstBandVerwijderd(b.naam) }))
        : [{ aan: b.keuze, tekst: tekstBeheerOvergedragen(b.naam) }],
    }));
    const { error: mErr } = await db.rpc('tt_delete_own_profile', {
      p_musician_id: mid,
      p_band_keuzes: bandKeuzes,
      p_solo_bands:  pendingSoloBandIds,
    });
    if (mErr) throw mErr;





    const userId = currentUser ? currentUser.id : null;
    if (userId) await deleteAllStorageForUser(userId);















    const authResult = await deleteOwnAuthAccountWithRetry();

    accountBands = [];
    pendingSoloBandIds = [];
    myMusicianId = null;
    myOwnCity = null;




    clearOnboardingProgress();
    try { await signOut(); } catch (e) { }

    if (authResult.ok) {
      showToast('Je account is verwijderd.');
    } else {








      console.error('Auth-account niet verwijderd:', authResult.detail);
      showToast('Je profiel is verwijderd. Je inloggegevens konden niet automatisch verwijderd worden — mail privacy@talenttent.org als je dit ook wilt laten verwijderen.');
    }
    showView('landing');
  } catch (e) {
    logCaught('executeAccountDeletion', e);


    showToast(friendlyErrorMessage(e, 'je account verwijderen') + ' Je account is nog niet volledig verwijderd. Kies in Instellingen opnieuw Account verwijderen.');
  }
}




async function deleteAllStorageForUser(userId) {
  for (const bucket of ['avatars', 'media']) {
    try {
      const { data: files, error: lijstFout } = await db.storage.from(bucket).list(userId);
      if (lijstFout) throw lijstFout;
      if (files && files.length) {
        const paths = files.map(f => `${userId}/${f.name}`);
        await db.storage.from(bucket).remove(paths);
      }
    } catch (e) {

      logCaught('deleteAllStorageForUser', e);
    }
  }
}


















const TILES = [
  { id: 'wieBenJe',   title: 'Wie ben je' },
  { id: 'watSpeelJe', title: 'Wat speel je' },





  { id: 'jeSetlist',  title: 'Je setlist' },
  { id: 'mediahoek',  title: 'Je mediahoek' },
];



function tegelsHTML(lijst) {
  return lijst.map(t => `
    <div class="tile" onclick="openTegelScreen('${jsAttr(t.id)}')">
      <div style="flex:1;">
        <div class="tile-title">${escHtml(t.title)}</div>
        <div class="tile-sub">&nbsp;</div>
      </div>
    </div>
  `).join('');
}





let tegelRegels = { mid: null, regels: {} };
let tegelRegelsVraag = 0;

function tegelRegelHTML(id, m) {
  const lijst = (x) => Array.isArray(x) ? x : [];
  const leeg = (wat) => `<span class="tegel-leeg">Nog leeg</span> · ${escHtml(wat)}`;
  const deel = (n, een, meer) => n ? `${n} ${n === 1 ? een : meer}` : '';
  if (id === 'wieBenJe') {
    const delen = [m.weergavenaam || m.username, m.city].filter(Boolean);
    return delen.length ? escHtml(delen.join(' · ')) : leeg('vul je naam in');
  }
  if (id === 'watSpeelJe') {
    const delen = [lijst(m.musician_instruments).map(x => x.instrument).join(', '),
      lijst(m.musician_genres).map(x => x.genre).join(', ')].filter(Boolean);
    return delen.length ? escHtml(delen.join(' · ')) : leeg('kies een instrument');
  }
  if (id === 'jeSetlist') {
    const n = lijst(m.musician_songs).length;
    return n ? escHtml(deel(n, 'nummer', 'nummers')) : leeg('kies drie nummers');
  }
  if (id === 'mediahoek') {
    const media = lijst(m.musician_media), tel = (t) => media.filter(x => x.media_type === t).length;
    const delen = [m.avatar_url ? 'Profielfoto' : '', deel(tel('foto'), 'foto', "foto's"),
      deel(tel('video'), 'video', "video's"), deel(tel('link'), 'link', 'links')].filter(Boolean);
    return delen.length ? escHtml(delen.join(' · ')) : leeg('voeg een foto toe');
  }
  return '';
}






function tegelRegelsZetten(mid, data) {
  tegelRegels = { mid, regels: {} };
  TILES.forEach(t => { tegelRegels.regels[t.id] = tegelRegelHTML(t.id, data); });
}

function renderTegels() {
  const wrap = document.getElementById('tegelsWrap'), mid = myMusicianId;
  const tegels = () => {
    const regels = tegelRegels.mid === mid ? tegelRegels.regels : {};

    const sleutel = mid + '|' + JSON.stringify(regels);
    if (wrap.firstChild && wrap.dataset.sleutel === sleutel) return;
    wrap.dataset.sleutel = sleutel;
    wrap.innerHTML = tegelsHTML(TILES);
    wrap.querySelectorAll('.tile-sub').forEach((el, i) => { el.innerHTML = regels[TILES[i].id] || '&nbsp;'; });
  };


  const klaar = tegelRegels.mid === mid;
  if (klaar) tegels(); else wrap.innerHTML = '';
  const vraag = ++tegelRegelsVraag;
  db.from('musicians')
    .select('weergavenaam, username, city, avatar_url, musician_instruments(instrument), musician_genres(genre), musician_songs(song_title), musician_media(media_type)')
    .eq('id', mid).single()
    .then(({ data, error }) => {



      if (vraag !== tegelRegelsVraag) return;
      if (error || !data) { if (!wrap.firstChild) tegels(); return; }
      tegelRegelsZetten(mid, data);
      tegels();
    }, () => { if (vraag === tegelRegelsVraag && !wrap.firstChild) tegels(); });
}










const TEGEL_SCREENS = { wieBenJe: 'wieBenJeScreen', watSpeelJe: 'watSpeelJeScreen', jeSetlist: 'jeSetlistScreen', mediahoek: 'mediahoekScreen',
  bandWie: 'bandWieScreen', bandBezetting: 'bandBezettingScreen', bandMuziek: 'bandMuziekScreen', bandMedia: 'bandMediaScreen' };
let activeTegelScreen = 'overview';





const TEGEL_WIJZIGINGEN = {
  wieBenJe:   () => wbjFieldSnapshot() !== wbjSnapshot,
  watSpeelJe: () => wspFieldSnapshot() !== wspSnapshot,
  jeSetlist:  () => jstFieldSnapshot() !== jstSnapshot,
  mediahoek:  () => mhFieldSnapshot() !== mhSnapshot,
  bandWie:       () => bwFieldSnapshot() !== bwSnapshot,
  bandBezetting: () => bbFieldSnapshot() !== bbSnapshot,
  bandMuziek:    () => bmzFieldSnapshot() !== bmzSnapshot,
  bandMedia:     () => bmFieldSnapshot() !== bmSnapshot
};




function tegelHeeftWijzigingen() {
  const meet = TEGEL_WIJZIGINGEN[activeTegelScreen];
  if (!meet) return false;
  try { return !!meet(); } catch (e) { return false; }
}




const TEGELS_MET_BALK = ['wieBenJe', 'watSpeelJe', 'jeSetlist', 'mediahoek',
  'bandWie', 'bandBezetting', 'bandMuziek', 'bandMedia'];
function zetVasteBalkRuimte(id) {
  document.querySelector('#view-profieltegels > main').classList.toggle('met-vaste-balk', TEGELS_MET_BALK.includes(id));
}







function zetOpslaanAan(aan) {
  if (!TEGELS_MET_BALK.includes(activeTegelScreen)) return;
  const knop = document.querySelector('#' + TEGEL_SCREENS[activeTegelScreen] + ' .wizard-action-bar .btn-primary');
  if (knop) knop.disabled = !aan;
}
function werkOpslaanBij() { zetOpslaanAan(tegelHeeftWijzigingen()); }
(function opslaanVolgen() {
  let gepland = false;
  const plan = () => {
    if (gepland || !TEGELS_MET_BALK.includes(activeTegelScreen)) return;
    gepland = true;


    setTimeout(() => { gepland = false; werkOpslaanBij(); }, 0);
  };
  ['input', 'change', 'click'].forEach(t => document.addEventListener(t, plan, true));
  const view = document.getElementById('view-profieltegels');
  if (view) new MutationObserver(plan).observe(view, { childList: true, subtree: true });
})();




function terugNaOpslaan(id) {
  if (activeTegelScreen === id) appTerug();
}

function openTegelOverview() {
  activeTegelScreen = 'overview';
  zetVasteBalkRuimte('overview');
  werkTerugKnopBij();
  Object.values(TEGEL_SCREENS).forEach(elId => { document.getElementById(elId).style.display = 'none'; });
  document.getElementById('tegelOverviewScreen').style.display = bewerkBandId ? 'none' : '';
  document.getElementById('bandTegelOverviewScreen').style.display = bewerkBandId ? '' : 'none';
  if (bewerkBandId) renderBandTegels();
  else renderTegels();
}

function openTegelScreen(id) {
  if (!TEGEL_SCREENS[id]) return;
  activeTegelScreen = id;
  zetVasteBalkRuimte(id);
  werkTerugKnopBij();
  document.getElementById('tegelOverviewScreen').style.display = 'none';
  document.getElementById('bandTegelOverviewScreen').style.display = 'none';
  Object.values(TEGEL_SCREENS).forEach(elId => { document.getElementById(elId).style.display = 'none'; });
  document.getElementById(TEGEL_SCREENS[id]).style.display = '';


  zetOpslaanAan(false);
  if (id === 'wieBenJe') openWieBenJe().then(werkOpslaanBij, werkOpslaanBij);
  else if (id === 'watSpeelJe') openWatSpeelJe().then(werkOpslaanBij, werkOpslaanBij);
  else if (id === 'jeSetlist') openJeSetlist().then(werkOpslaanBij, werkOpslaanBij);
  else if (id === 'mediahoek') openJeMediahoek().then(werkOpslaanBij, werkOpslaanBij);
  else if (id === 'bandWie') openBandWie().then(werkOpslaanBij, werkOpslaanBij);
  else if (id === 'bandBezetting') openBandBezetting().then(werkOpslaanBij, werkOpslaanBij);
  else if (id === 'bandMuziek') openBandMuziek().then(werkOpslaanBij, werkOpslaanBij);
  else if (id === 'bandMedia') openBandMedia().then(werkOpslaanBij, werkOpslaanBij);
}









let wbjSnapshot = null;
let wbjNaamTonen = 'echt';
let wbjNaamLuistert = false;
let wbjUsernameOk = true;
let wbjPostcodeTimeout;
let wbjPostcodeFailStreak = 0;
let wbjPostcodeManualMode = false;
let wbjGeboorteBijOpenen = '';

function wbjFieldSnapshot() {
  return JSON.stringify({
    fname: document.getElementById('wbjFname').value.trim(),
    lname: document.getElementById('wbjLname').value.trim(),
    username: document.getElementById('wbjUsername').value.trim(),
    birth_date: document.getElementById('wbjBirthDate').value.trim(),
    zip: document.getElementById('wbjZip').value.trim(),
    city: document.getElementById('wbjCity').value.trim(),
    bio: document.getElementById('wbjBio').value.trim(),
    naam_tonen: wbjNaamTonen,
  });
}






function wbjLeeftijd() {
  return leeftijdUitVeld(document.getElementById('wbjBirthDate').value);
}

const WBJ_NAAM = { blok: 'wbjNaamKeuze', control: 'wbjNaamTonenControl', voorbeeld: 'wbjNaamVoorbeeld',
  fname: 'wbjFname', lname: 'wbjLname', username: 'wbjUsername', geboorte: 'wbjBirthDate' };
function wbjNaamKeuzeBijwerken() { naamKeuzeBijwerken(WBJ_NAAM, wbjNaamTonen); }

function zetWbjNaamTonen(waarde) {
  wbjNaamTonen = waarde === 'gebruikersnaam' ? 'gebruikersnaam' : 'echt';
  wbjNaamKeuzeBijwerken();
}

async function openWieBenJe() {
  wisUsernameUitslag('wbjUsernameStatus', 'wbjUsername');
  document.getElementById('wbjPostcodeStatus').textContent = '';
  wbjPostcodeManualMode = false;
  wbjPostcodeFailStreak = 0;
  const wbjCityFieldReset = document.getElementById('wbjCity');
  wbjCityFieldReset.readOnly = true;
  wbjCityFieldReset.style.cursor = 'not-allowed';







  const [{ data, error }, { data: myBirthDate }, { data: naamData }] = await Promise.all([
    db.from('musicians')
      .select('username, zip, city, city_source, bio, naam_tonen')
      .eq('id', myMusicianId).single(),
    db.rpc('tt_get_my_birth_date'),
    db.rpc('tt_mijn_naam'),
  ]);
  if (error) {
    showToast(friendlyErrorMessage(error, 'je gegevens laden'));
    return;
  }
  const eigenNaam = (Array.isArray(naamData) ? naamData[0] : naamData) || {};
  document.getElementById('wbjFname').value = eigenNaam.fname || '';
  document.getElementById('wbjLname').value = eigenNaam.lname || '';
  document.getElementById('wbjUsername').value = data.username || '';
  document.getElementById('wbjBirthDate').value = fromISODate(myBirthDate);
  wbjGeboorteBijOpenen = fromISODate(myBirthDate);
  document.getElementById('wbjZip').value = data.zip || '';
  document.getElementById('wbjCity').value = data.city || '';
  document.getElementById('wbjBio').value = data.bio || '';
  veldGroeit(document.getElementById('wbjBio'));
  updateCharCounter('wbjBio', 'wbjBioTeller', 1000);
  wbjNaamTonen = data.naam_tonen === 'gebruikersnaam' ? 'gebruikersnaam' : 'echt';
  if (!wbjNaamLuistert) {
    wbjNaamLuistert = true;
    document.getElementById('wieBenJeScreen').addEventListener('input', wbjNaamKeuzeBijwerken);
  }
  wbjNaamKeuzeBijwerken();
  wbjUsernameOk = true;
  wbjSnapshot = wbjFieldSnapshot();
}


function onWbjUsernameInput() {
  wbjUsernameOk = false;
  checkUsernameAvailability('wbjUsernameStatus', 'wbjUsername', myMusicianId).then(ok => { wbjUsernameOk = ok; });
}






function onWbjPostcodeInput(rawValue) {
  const statusEl = document.getElementById('wbjPostcodeStatus');
  document.getElementById('wbjCity').value = '';
  clearTimeout(wbjPostcodeTimeout);
  const digits = rawValue.trim().replace(/\D/g, '');
  document.getElementById('wbjZip').value = digits;
  statusEl.textContent = '';
  if (!/^[1-9][0-9]{3}$/.test(digits)) { zetUitslag('wbjPostcodeStatus', ''); return; }
  zetUitslag('wbjPostcodeStatus', 'Zoeken…');
  wbjPostcodeTimeout = setTimeout(async () => {
    const outcome = await lookupPostcodeCity(digits);
    if (outcome.found) {
      wbjPostcodeFailStreak = 0;
      if (wbjPostcodeManualMode) wbjRelockCity();
      document.getElementById('wbjCity').value = outcome.city;
      zetUitslag('wbjPostcodeStatus', '');
    } else if (outcome.reason === 'notfound') {
      wbjEnableManualCity();
    } else {
      wbjPostcodeFailStreak++;
      if (wbjPostcodeFailStreak >= 2) {
        wbjEnableManualCity();
      } else {
        zetUitslag('wbjPostcodeStatus', '');
        statusEl.style.color = 'var(--text)';
        statusEl.textContent = 'Postcode controleren lukt nu niet. Controleer je verbinding en vul de postcode nog eens in.';
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
  zetUitslag('wbjPostcodeStatus', '');
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




  clearFieldErrors('wieBenJeScreen');
  const fouten = [];



  const leeftijd = wbjLeeftijd();
  const opProfiel = naamZoalsAnderen(fname, document.getElementById('wbjLname').value, username,
    wbjNaamTonen, leeftijd === null ? 16 : leeftijd);
  if (!fname) {
    fouten.push(['wbjFname', 'Vul je voornaam in']);
  } else if (!naamPastInProfielkop(opProfiel || fname)) {
    fouten.push(['wbjFname', 'Deze naam is te lang om op je profiel te tonen. Maak hem korter']);
  }

  const datumFout = geboortedatumFout(birthDateStr);
  if (datumFout) {
    fouten.push(['wbjBirthDate', datumFout]);
  } else if (wbjGeboorteBijOpenen && !geboortedatumFout(wbjGeboorteBijOpenen) &&
      leeftijdsgroep(calcAge(birthDateStr)) !== leeftijdsgroep(calcAge(wbjGeboorteBijOpenen))) {
    fouten.push(['wbjBirthDate', TEKST_ANDERE_LEEFTIJDSGROEP]);
  }
  if (!username) fouten.push(['wbjUsername', 'Kies een gebruikersnaam']);
  else if (!wbjUsernameOk) fouten.push(['wbjUsername', 'Kies een beschikbare gebruikersnaam']);
  if (!/^[1-9][0-9]{3}$/.test(zip) || !city) {
    fouten.push(['wbjZip', 'Vul een geldige postcode in. Je woonplaats wordt dan automatisch ingevuld']);
  }
  if (showFieldErrors(fouten)) return;

  if (wbjFieldSnapshot() === wbjSnapshot) return;

  const payload = {
    fname,
    lname: document.getElementById('wbjLname').value.trim() || null,
    username,
    birth_date: toISODate(birthDateStr),
    zip,
    city,
    bio: document.getElementById('wbjBio').value.trim() || null,
    naam_tonen: wbjNaamTonen,
  };
  const { error } = rijenGeraakt(await db.from('musicians').update(payload).eq('id', myMusicianId).select('id'));
  if (error) {

    if (error.hint === 'TT-625') { showFieldErrors([['wbjBirthDate', error.message]]); return; }
    showToast(friendlyErrorMessage(error, 'je gegevens opslaan'));
    return;
  }
  wbjGeboorteBijOpenen = birthDateStr;
  wbjSnapshot = wbjFieldSnapshot();
  showToast('Wijzigingen opgeslagen.');
  terugNaOpslaan('wieBenJe');
}








let wspState = { instruments: [], instrumentLevels: {}, genres: [] };
let wspSnapshot = null;

function wspFieldSnapshot() {
  return JSON.stringify({
    instruments: wspState.instruments,
    instrumentLevels: wspState.instrumentLevels,
    genres: wspState.genres,
  });
}

async function openWatSpeelJe() {
  const { data, error } = await db.from('musicians')
    .select('musician_instruments(instrument, niveau), musician_genres(genre)')
    .eq('id', myMusicianId).single();
  if (error) {
    showToast(friendlyErrorMessage(error, 'je gegevens laden'));
    return;
  }
  wspState.instruments = (data.musician_instruments || []).map(x => x.instrument);
  wspState.instrumentLevels = {};
  (data.musician_instruments || []).forEach(x => { if (x.niveau) wspState.instrumentLevels[x.instrument] = x.niveau; });
  wspState.genres = (data.musician_genres || []).map(x => x.genre);

  initInstrumentPicker({
    id: 'wsp', fieldId: 'wspInstrumentField', badgeRowId: 'wspInstrumentBadgeRow',
    getInstruments: () => wspState.instruments, getLevels: () => wspState.instrumentLevels,
    toevoegen: 'Instrument',
  });
  initPicker({
    id: 'wspGenre', fieldId: 'wspGenreField', badgeRowId: 'wspGenreBadgeRow',
    options: GENRES, getList: () => wspState.genres,
    placeholder: 'Kies een genre',
    toevoegen: 'Genre',
  });
  wspSnapshot = wspFieldSnapshot();
}

async function saveWatSpeelJe() {

  const fouten = [];
  if (!wspState.instruments.length) fouten.push(['wspInstrumentField', 'Kies minimaal één instrument']);
  if (!wspState.genres.length) fouten.push(['wspGenreField', 'Kies minimaal één genre']);
  if (showFieldErrors(fouten)) return;

  if (wspFieldSnapshot() === wspSnapshot) return;


  const { error: kErr } = await db.rpc('tt_save_musician_koppelingen', {
    p_musician_id: myMusicianId,
    p_instruments: wspState.instruments.map(instrument => ({ instrument, niveau: wspState.instrumentLevels[instrument] || null })),
    p_genres:      wspState.genres.map(genre => ({ genre })),
  });
  if (kErr) { showToast(friendlyErrorMessage(kErr, 'je gegevens opslaan')); return; }

  wspSnapshot = wspFieldSnapshot();
  showToast('Wijzigingen opgeslagen.');
  terugNaOpslaan('watSpeelJe');
}









let jstSongs = [];
let jstSnapshot = null;
let jstSearchTimeout = null;







const songArtiest = { jst: null, bc: null };
const SONG_DOEL = {
  jst: { lijst: () => jstSongs, kies: 'jstAddSong' },
  bc:  { lijst: () => bcCovers, kies: 'bcAddCover' }
};
const jstArtistCache = new Map();
const jstTrackCache = new Map();



function jstFieldSnapshot() {
  return JSON.stringify(jstSongs.map(s => ({ title: s.title, artist: s.artist, level: s.level })));
}

async function openJeSetlist() {
  const { data, error } = await db.from('musicians')
    .select('musician_songs(song_title, song_artist, mastery_level)')
    .eq('id', myMusicianId).single();
  if (error) {
    showToast(friendlyErrorMessage(error, 'je gegevens laden'));
    return;
  }
  jstSongs = (data.musician_songs || []).map(s => ({ title: s.song_title, artist: s.song_artist, level: s.mastery_level }));
  songZoekLeeg('jst');
  clearFieldErrors(document.getElementById('jeSetlistScreen'));
  jstRenderSongs();
  jstSnapshot = jstFieldSnapshot();

  jstSongs.forEach(s => voorproefOphalen(() => jstSongs, s.title, s.artist, jstRenderSongs));
}

function jstSelectFirstAc(id) {
  const list = document.getElementById(id);
  if (!list || !list.classList.contains('open')) return;
  const first = list.querySelector('.ac-item[onmousedown]');
  if (first && first.onmousedown) first.onmousedown();
}

async function jstOnArtistSearch(q, p = 'jst') {
  const ac = document.getElementById(p + 'ArtistAc');
  clearTimeout(jstSearchTimeout);
  const nr = artiestVraagStart(ac);
  if (q.trim().length < 2) { ac.classList.remove('open'); return; }
  ac.innerHTML = '<div class="ac-item"><span style="color:var(--muted);">Zoeken...</span></div>';
  ac.classList.add('open');
  const cacheKey = q.trim().toLowerCase();
  if (jstArtistCache.has(cacheKey)) {
    jstRenderArtistResults(ac, jstArtistCache.get(cacheKey), p);
    return;
  }
  jstSearchTimeout = setTimeout(async () => {
    try {
      const artists = await itunesArtiestenOphalen(q);
      jstArtistCache.set(cacheKey, artists);
      if (!artiestVraagNogActueel(ac, nr)) return;
      jstRenderArtistResults(ac, artists, p);
    } catch (e) {
      logCaught('jstOnArtistSearch', e);
      if (artiestVraagNogActueel(ac, nr)) ac.innerHTML = AC_FOUT_HTML;
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
function jstFetchArtistSongs(artistId) { return itunesNummersOphalen(jstTrackCache, artistId); }
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
    ac.innerHTML = AC_FOUT_HTML;
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
  voorproefOphalen(() => jstSongs, title, artist, jstRenderSongs);
}


function jstRenderSongs() {
  const list = document.getElementById('jstSongsList');
  if (!list) return;
  const kop = document.getElementById('jstSongsKop');
  if (kop) kop.hidden = !jstSongs.length;
  const teller = document.getElementById('jstSongsTeller');
  if (teller) teller.textContent = setlistTellerTekst(jstSongs.length);
  list.innerHTML = setlistLijstHTML(jstSongs, 'jst', 'jstRemoveSong');
  setlistKeuzesKoppelen(jstSongs, 'jst', jstSetLevel);
}
function jstSetLevel(i, level) {
  if (!jstSongs[i]) return;
  jstSongs[i].level = BEHEERSING_NAMEN[level] ? level : null;
  jstRenderSongs();
}



function jstRemoveSong(i) {
  if (!jstSongs[i]) return;
  if (!jstSongs[i]._confirmDelete) {


    jstSongs.forEach(s => delete s._confirmDelete);
    jstSongs[i]._confirmDelete = true;
    jstRenderSongs();
    zekerTerugBijKlikErnaast(() => jstSongs, jstRenderSongs);
    return;
  }
  jstSongs.splice(i, 1);
  jstRenderSongs();
}

async function saveJeSetlist() {


  if (showFieldErrors(nummersTekortFouten(jstSongs, 'jstArtistSearch'))) return;
  if (jstFieldSnapshot() === jstSnapshot) return;


  const { error } = await db.rpc('tt_save_musician_koppelingen', {
    p_musician_id: myMusicianId,
    p_songs: jstSongs.map(s => ({ song_title: s.title, song_artist: s.artist, mastery_level: s.level })),
  });
  if (error) { showToast(friendlyErrorMessage(error, 'je gegevens opslaan')); return; }
  jstSnapshot = jstFieldSnapshot();
  showToast('Wijzigingen opgeslagen.');
  terugNaOpslaan('jeSetlist');
}








let mhAvatarUrl = null;
let mhFotoBezig = false;
let mhAvatarBron = null, mhAvatarKader = null;
let mhMediaFiles = [];
let mhMediaLinks = [];
let mhSnapshot = null;

function mhFieldSnapshot() {
  return JSON.stringify({
    avatarUrl: mhAvatarUrl,
    mediaFiles: mhMediaFiles.map(m => ({ url: m.url, type: m.type, uploading: m.uploading, inBanner: !!m.inBanner, uitsnede: m.uitsnede || null })),
    mediaLinks: mhMediaLinks,
  });
}

async function openJeMediahoek() {
  const { data, error } = await db.from('musicians')
    .select('avatar_url, avatar_bron, avatar_kader, musician_media(media_type, url, platform, in_banner, created_at, uitsnede)')
    .eq('id', myMusicianId).single();
  if (error) {
    showToast(friendlyErrorMessage(error, 'je gegevens laden'));
    return;
  }
  mhAvatarUrl = data.avatar_url || null;
  mhFotoBezig = false;
  mhAvatarBron = data.avatar_bron || null;
  mhAvatarKader = data.avatar_kader || null;

  data.musician_media = opVolgordeVanToevoegen(data.musician_media);
  mhMediaFiles = (data.musician_media || [])
    .filter(x => x.media_type === 'foto' || x.media_type === 'video')
    .map(x => ({ name: '', url: x.url, path: null, type: x.media_type, uploading: false, inBanner: !!x.in_banner, uitsnede: x.uitsnede || null }));
  mhMediaLinks = (data.musician_media || []).filter(x => x.media_type === 'link')
    .map(x => ({ url: x.url, inBanner: !!x.in_banner }));

  mhRenderAvatar();
  mhRenderMediaGrid();
  mhSnapshot = mhFieldSnapshot();
}

function mhRenderAvatar() {
  const preview = document.getElementById('mhAvatarPreview');
  if (mhAvatarUrl) {
    preview.innerHTML = `<img ${kleinFotoAttr(safeUrl(mhAvatarUrl))} alt="profielfoto">`;
    document.getElementById('mhAvatarRemoveBtn').classList.add('visible');
  } else {
    preview.innerHTML = '';
    document.getElementById('mhAvatarRemoveBtn').classList.remove('visible');
  }
}

async function mhHandleAvatarUpload(file) {
  if (!file) return;
  const typeProblem = fileTypeProblem(file, AVATAR_MIME_TYPES, AVATAR_TYPE_LABEL);
  if (typeProblem) { showToast(typeProblem); return; }
  { const groot = bestandTeGrootMelding(file, 5 * 1024 * 1024); if (groot) { showToast(groot); return; } }
  const uit = await kiesUitsnede(file, 'rond');
  if (uit) mhAvatarZetten({ file: uit, kader: uit.kader, bron: file });
}


async function mhAvatarTik() {
  if (!mhAvatarUrl) { document.getElementById('mhAvatarInput').click(); return; }
  const uit = await fotoVerschuiven({ url: mhAvatarUrl, bron: mhAvatarBron, kader: mhAvatarKader }, 'rond');
  if (uit) mhAvatarZetten(uit);
}


function mhAvatarZetten(uit) {
  const file = uit.file;
  const blobUrl = URL.createObjectURL(file);
  const preview = document.getElementById('mhAvatarPreview');
  preview.innerHTML = `<img src="${blobUrl}" alt="profielfoto">
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);border-radius:50%;">
      <div style="width:24px;height:24px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin 0.7s linear infinite;"></div>
    </div>`;
  preview.style.position = 'relative';

  mhFotoBezig = true;
  fotoMetBronUploaden(uit, currentUser.id).then(({ url, bron, kader }) => {
    mhFotoBezig = false;
    mhAvatarUrl = url;
    mhAvatarBron = bron;
    mhAvatarKader = kader;
    mhRenderAvatar();
  }).catch(e => {
    mhFotoBezig = false;
    logCaught('mhUploadAvatar', e);
    showToast(friendlyErrorMessage(e, 'je foto uploaden'));
    mhRenderAvatar();
  });
}



function mhAskRemoveAvatar() {
  showConfirm('Profielfoto verwijderen?', mhRemoveAvatar, 'Ja, verwijderen');
}
function mhRemoveAvatar() {
  mhAvatarUrl = null;
  mhAvatarBron = null;
  mhAvatarKader = null;
  mhRenderAvatar();
}


function mhMediaToevoegenKeuze(sel) {
  mediaToevoegenStart(sel, mhMediaFiles, mhMediaLinks, 'mhMediaInvoer', url => {
    mhMediaLinks.push({ url, inBanner: false });
    mhRenderMediaGrid();
  });
}

function mhHandleFileSelect(files) {
  Array.from(files).forEach(file => {
    if (mhMediaFiles.length >= GRENZEN.beeld) { showToast(`Maximum van ${GRENZEN.beeld} bestanden bereikt.`); return; }
    const isVideo = (file.type || '').toLowerCase().startsWith('video/');
    const typeProblem = fileTypeProblem(file, MEDIA_MIME_TYPES, MEDIA_TYPE_LABEL);
    if (typeProblem) { showToast(`"${file.name}": ${typeProblem}`); return; }
    { const groot = bestandTeGrootMelding(file, 50 * 1024 * 1024); if (groot) { showToast(groot, isVideo ? VIDEO_TE_GROOT_MS : undefined); return; } }

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
      showToast(`"${file.name}": ${friendlyErrorMessage(e, 'het bestand uploaden')}`);
      const idx = mhMediaFiles.indexOf(entry);
      if (idx !== -1) mhMediaFiles.splice(idx, 1);
      mhRenderMediaGrid();
    });
  });
}

function mhRenderMediaGrid() {
  const grid = document.getElementById('mhMediaGrid');
  grid.innerHTML = mediaRasterHTML(mhMediaFiles, mhMediaLinks, 'mh');
  bannerTellerBijwerken('mhBannerTeller', mhMediaFiles, mhMediaLinks);
}



function mhToggleMediaBanner(i) {
  return bannerTekenTik(mhMediaFiles[i], mhMediaFiles, mhMediaLinks, 'mhMediaGrid', 'mhBannerTeller');
}

function mhSpeelMedia(i) {
  mediaTegelTik(mhMediaFiles[i]);
}

function mhRemoveMedia(i) {
  const entry = mhMediaFiles[i];
  mhMediaFiles.splice(i, 1);
  mhRenderMediaGrid();
  if (entry?.path) {
    db.storage.from('media').remove([entry.path, fotoKleinPad(entry.path)]).then(() => {}, e => logCaught('mhRemoveMedia', e));
  }
}

function mhToggleLinkBanner(i) {
  linkBannerTik(mhMediaLinks[i], i, mhMediaFiles, mhMediaLinks, 'mhMediaGrid', 'mhBannerTeller');
}

function mhSpeelLink(i) {
  const l = mhMediaLinks[i];
  if (!l || !l.url.trim()) return;
  openMediaSpeler(l.url, 'link', null, detectPlatform(l.url));
}

function mhRemoveLink(i) {
  mhMediaLinks.splice(i, 1);
  mhRenderMediaGrid();
}

async function saveJeMediahoek() {



  if (mhFotoBezig) { showToast('Je foto wordt nog geüpload. Even geduld.'); return; }
  if (mhMediaFiles.some(m => m.uploading)) { showToast('Er wordt nog een bestand geüpload. Even geduld.'); return; }
  if (mhFieldSnapshot() === mhSnapshot) return;

  const { error: uErr } = rijenGeraakt(await db.from('musicians')
    .update({ avatar_url: mhAvatarUrl || null, ...wazigVeld(mhAvatarUrl),
      avatar_bron: mhAvatarUrl ? mhAvatarBron : null, avatar_kader: mhAvatarUrl ? mhAvatarKader : null })
    .eq('id', myMusicianId).select('id'));
  if (uErr) { showToast(friendlyErrorMessage(uErr, 'je gegevens opslaan')); return; }
  opslagOpruimen('avatars', currentUser && currentUser.id, [mhAvatarUrl, mhAvatarBron]);


  const linkMedia = mhMediaLinks
    .filter(l => l.url.trim())
    .map(l => ({ media_type: 'link', url: l.url, platform: detectPlatform(l.url), in_banner: !!l.inBanner }));
  const fileMedia = mhMediaFiles
    .filter(m => m.url && !m.uploading && !m.url.startsWith('blob:'))
    .map(m => ({ media_type: m.type, url: m.url, in_banner: !!m.inBanner, uitsnede: bannerKader(m), wazig: wazigVoor(m.url) }));
  const { error: kErr } = await db.rpc('tt_save_musician_koppelingen', {
    p_musician_id: myMusicianId,
    p_media: linkMedia.concat(fileMedia),
  });
  if (kErr) { showToast(friendlyErrorMessage(kErr, 'je gegevens opslaan')); return; }
  opslagOpruimen('media', currentUser && currentUser.id, fileMedia.map(m => m.url));

  mhSnapshot = mhFieldSnapshot();
  showToast('Wijzigingen opgeslagen.');
  terugNaOpslaan('mediahoek');
}












const NIVEAU_INFO_MUSICIAN_HEADERS = ['Niveau', 'Technische beheersing', 'Gehoor en muziektheorie', 'Voorbereiden en repeteren', 'Live spelen en flexibiliteit'];
const NIVEAU_INFO_MUSICIAN_ROWS = [
  ['1. Beginner (Bedroom)',
    'Je kunt nummers nog niet echt op gehoor naspelen. Je hebt YouTube-tutorials of eenvoudige bladmuziek nodig.',
    'Je hebt echt een leraar of hulp nodig om een nieuw nummer te leren. Je oefent nog een beetje onregelmatig.',
    'Je speelt eigenlijk altijd op hetzelfde volume. Als de band stopt of iets anders doet dan de opname, ben je de draad kwijt.'],
  ['2. Gevorderde Beginner (Jammer)',
    'Je herkent eenvoudige basisschema\'s. Je kunt nummers thuis uitzoeken en naspelen door goed naar de originele track te luisteren.',
    'Je studeert thuis zelfstandig de nummers in die zijn afgesproken. Je kent je partijen uit je hoofd als je naar de repetitie komt.',
    'Je luistert naar de rest en past je volume aan. Je kunt een simpele eigen variatie verzinnen die past bij de structuur van het nummer.'],
  ['3. Half-Gevorderd (Gig-Ready)',
    'Kan makkelijk improviseren binnen een bekend nummer; sterke functionele basiskennis van muziektheorie.',
    'Bedenkt en schrijft eigen partijen uit. Heeft minimale repetitietijd nodig om een volledige live-set van anderhalf uur te beheersen.',
    'Herstelt live-fouten onmiddellijk zonder dat het opvalt; speelt moeiteloos met een clicktrack of In-Ear monitor.'],
  ['4. Gevorderd (Set-Leider)',
    'Past een nummer live on-the-fly aan; pikt complexe nummers en arrangementen direct op gehoor op.',
    'Kan fungeren als muzikaal leider (MD); arrangeert efficiënt partijen voor andere bandleden en levert kant-en-klare prestaties aan.',
    'Volledige controle over dynamiek; levert studio-waardige prestaties onder live-fysieke spanning (zoals intense podiumactie of dans).'],
  ['5. Professioneel',
    'Absoluut gehoor of uitzonderlijk ontwikkeld relatief gehoor; leest direct complexe partituren vanaf papier (sight-reading).',
    'Volledig autonoom en multi-inzetbaar; beheerst een complete setlist binnen 24 uur; de vaste eerste keuze voor high-end studio- en sessiewerk.',
    'Volledige controle over emotie en klank; anticipeert en adapteert onmiddellijk aan elke onverwachte live-situatie of tempowisseling.'],
];

function openMusicianNiveauInfoModal() {


  const rowsHTML = NIVEAU_INFO_MUSICIAN_ROWS.map((r, j) => [stripParenthetical(r[0]), NIVEAU_ZINNEN[j], ...r.slice(1)])
    .map(r => `<tr>${r.map(c => `<td>${escHtml(c)}</td>`).join('')}</tr>`).join('');
  document.getElementById('niveauInfoModalContent').innerHTML = `
    <div class="filter-title" style="margin-bottom:4px;">Niveau-indeling per instrument</div>
    <p style="font-size:12px;line-height:var(--regel-12);color:var(--muted);margin-bottom:16px;">Kies per instrument het niveau waar je het dichtst bij in de buurt zit. Zie het als een richtlijn, geen examen.</p>
    <div class="niveau-info-wrap">
      <table class="niveau-info-table">
        <thead><tr>${NIVEAU_INFO_MUSICIAN_HEADERS.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
    <div class="filter-title" style="font-size:15px;line-height:var(--regel-15);margin-bottom:8px;">Belangrijk: gebruik dit systeem als jouw kompas</div>
    <p style="font-size:12px;line-height:var(--regel-12);color:var(--muted);margin-bottom:12px;">Geen enkele muzikant past perfect in één enkel hokje, en dat is volstrekt normaal. Je kunt bijvoorbeeld technisch heel ver zijn (Niveau 4), maar nog nooit op een podium hebben gestaan (Niveau 1).</p>
    <p style="font-size:12px;line-height:var(--regel-12);color:var(--muted);margin-bottom:16px;">Zie deze niveaubeschrijvingen dan ook puur als een praktische richtlijn, niet als een set onwrikbare wetten.</p>
    <div class="filter-title" style="font-size:15px;line-height:var(--regel-15);margin-bottom:8px;">Hoe kies je jouw niveau?</div>
    <p style="font-size:12px;line-height:var(--regel-12);color:var(--muted);">Loop de criteria per niveau rustig langs. Kijk niet naar waar je één losse vaardigheid hebt zitten, maar kijk naar het grotere plaatje. Kies simpelweg het niveau waar jij het dichtst bij in de buurt zit en waar je jezelf het meest in herkent. Het is geen examen, maar een hulpmiddel om te ontdekken waar je nu staat en waar je naartoe kunt groeien!</p>
  `;
  document.getElementById('niveauInfoModal').classList.add('visible');
}




saveWieBenJe = slotOm(saveWieBenJe);
saveWatSpeelJe = slotOm(saveWatSpeelJe);
saveJeSetlist = slotOm(saveJeSetlist);
saveJeMediahoek = slotOm(saveJeMediahoek);
