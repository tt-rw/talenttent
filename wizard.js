















const ONBOARDING_STORAGE_KEY = 'tt_onboarding_v1';

function saveOnboardingProgress() {


  if (!state.onboarding && !state.ouderRoute) return;
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({
      userId: currentUser?.id || null,
      ouderRoute: !!state.ouderRoute,
      regEmail: state.regEmail || '',
      akkoord: !!document.getElementById('consentCheckbox')?.checked,


      stap: state.currentStep,
      fname: state.fname, lname: state.lname, birth_date: state.birth_date,
      username: state.username,
      city: state.city, zip: state.zip, bio: state.bio, citySource: state.citySource,
      naamTonen: state.naamTonen,
      instruments: state.instruments, instrumentLevels: state.instrumentLevels, genres: state.genres, songs: state.songs,
      mediaLinks: state.mediaLinks,

      tijd: Date.now()


    }));
  } catch (e) {



    console.error('Kon onboarding-voortgang niet bewaren:', e);
  }
}

function clearOnboardingProgress() {
  try { localStorage.removeItem(ONBOARDING_STORAGE_KEY); } catch (e) { }
}



function populateWizardFieldsFromState() {
  document.getElementById('fname').value = state.fname;
  document.getElementById('lname').value = state.lname;
  document.getElementById('birth_date').value = state.birth_date;
  document.getElementById('zip').value = state.zip;
  document.getElementById('username').value = state.username || '';


  usernameCheckedValue = state.username || '';
  usernameAvailable = !!state.username;
  zetUitslag('usernameStatus', state.username ? 'Huidige naam' : '', true);
  const cityFieldPWF = document.getElementById('city');
  cityFieldPWF.value = state.city;
  if (state.citySource === 'manual') {
    cityFieldPWF.readOnly = false; cityFieldPWF.style.cursor = '';
  } else {
    cityFieldPWF.readOnly = true; cityFieldPWF.style.cursor = 'not-allowed';
  }
  document.getElementById('postcodeStatus').textContent = '';
  document.getElementById('bio').value = state.bio;
  veldGroeit(document.getElementById('bio'));
  updateCharCounter('bio', 'bioTeller', 1000);
  naamKeuzeBijwerken(WIZ_NAAM, state.naamTonen);

  renderInstrumentBadges('wizard');
  if (PICKERS.genre) renderPickerBadges(PICKERS.genre);

  renderSongs();
  renderMediaGrid();

  const avatarPreview = document.getElementById('avatarPreview');
  if (state.avatarUrl) {
    avatarPreview.innerHTML = `<img ${kleinFotoAttr(safeUrl(state.avatarUrl))} alt="profielfoto">`;
    document.getElementById('avatarRemoveBtn').classList.add('visible');
  } else {
    avatarPreview.innerHTML = '';
    document.getElementById('avatarRemoveBtn').classList.remove('visible');
  }
}






const AANMELDING_BEWAARDAGEN = 7;
function leesOpgeslagenVoortgang() {
  let saved;
  try { saved = JSON.parse(localStorage.getItem(ONBOARDING_STORAGE_KEY) || 'null'); }
  catch (e) { return null; }
  if (!saved || saved.ouderRoute) return saved;
  if (!saved.tijd) {
    saved.tijd = Date.now();
    try { localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(saved)); } catch (e) { }
    return saved;
  }
  if (Date.now() - saved.tijd > AANMELDING_BEWAARDAGEN * 24 * 3600 * 1000) {
    clearOnboardingProgress();
    return null;
  }
  return saved;
}





function leesRegistratieVoortgang() {
  const saved = leesOpgeslagenVoortgang();
  if (!saved || saved.mid) return null;
  if (saved.userId && (!currentUser || saved.userId !== currentUser.id)) return null;
  return saved;
}


function leesOuderVoortgang() {
  const saved = leesRegistratieVoortgang();
  return saved && saved.ouderRoute && !currentUser ? saved : null;
}









function hervatRegistratie() {
  if (state.onboarding || state.ouderRoute) return false;
  const saved = leesRegistratieVoortgang();
  if (!saved || (saved.ouderRoute && currentUser)) return false;

  state.ouderRoute = !!saved.ouderRoute;
  state.onboarding = !saved.ouderRoute;
  state.regEmail = saved.regEmail || '';
  vulStateUitVoortgang(saved);
  populateWizardFieldsFromState();
  const emailVeld = document.getElementById('regEmail');
  if (emailVeld && !currentUser) emailVeld.value = state.regEmail;
  const vinkje = document.getElementById('consentCheckbox');
  if (vinkje && saved.akkoord) { vinkje.checked = true; updateSubmitProfileState(); }
  if (!state.ouderRoute) { goTo(opgeslagenStap(saved)); return true; }

  const aanvraag = ouderAanvraagLezen();
  if (!aanvraag) { goTo(opgeslagenStap(saved)); ouderLeeftijdsregel(); return true; }




  goTo(opgeslagenStap(saved));
  ouderLeeftijdsregel();
  if (aanvraag.stand === 'goedgekeurd') ouderWachtwoordTonen();
  else ouderWachtTonen();
  return true;
}





function opgeslagenStap(saved) {
  if (Number.isInteger(saved.stap)) return saved.stap;
  const oud = saved.step || 0;
  return oud >= 3 ? oud - 1 : oud;
}



function vulStateUitVoortgang(saved) {
  state.fname = saved.fname || '';
  state.lname = saved.lname || '';
  state.username = saved.username || '';
  state.birth_date = saved.birth_date || '';
  state.city = saved.city || '';
  state.zip = saved.zip || '';
  state.bio = saved.bio || '';
  state.naamTonen = saved.naamTonen === 'gebruikersnaam' ? 'gebruikersnaam' : 'echt';
  state.citySource = saved.citySource || 'cache';
  state.instruments = saved.instruments || [];
  state.instrumentLevels = saved.instrumentLevels || {};
  state.genres = saved.genres || [];
  state.songs = saved.songs || [];

  state.mediaLinks = (saved.mediaLinks || []).filter(l => l && String(l.url || '').trim());
  postcodeResolved = !!state.zip;
}







async function editMyProfile() {
  const mid = await getMyMusicianId();
  if (!mid) { geenProfielMelding('Je hebt nog geen profiel om te bewerken.'); return; }
  showView('profieltegels');
}



function renderCompletenessMeter(m) {



  const checks = [
    !!m.avatar_url,
    (m.bio || '').length > 20,
    (m.musician_instruments||[]).length > 0,
    (m.musician_genres||[]).length > 0,
    (m.musician_songs||[]).length >= 3,
    (m.musician_media||[]).length > 0,
  ];
  const pct = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  return voortgangsBalkHTML(pct, 'completenessMeter');
}



function voortgangsBalkHTML(pct, id) {
  return `
    <div${id ? ` id="${id}"` : ''} class="completeness-wrap">
      <div class="completeness-label">Profielvolledigheid</div>
      <div class="completeness-rij" role="progressbar" aria-label="Profielvolledigheid" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        ${pct > 0 ? `<div class="completeness-fill" style="flex:${pct};"></div>` : ''}
        <span class="completeness-pct">${pct}%</span>
        ${pct < 100 ? `<div class="completeness-rest" style="flex:${100 - pct};"></div>` : ''}
      </div>
    </div>`;
}


async function loadMyProfile(opties) {
  if (!currentUser) return;
  renderEmailBevestigBanner();


  const uitnodigingen = document.getElementById('bandInvitesBanner');
  if (uitnodigingen && uitnodigingen.dataset.mid !== String(myMusicianId)) { uitnodigingen.innerHTML = ''; delete uitnodigingen.dataset.mid; }
  const el = document.getElementById('myProfileContent');

  if (!(opties && opties.behoud && el.dataset.klaar === currentUser.id)) {
    delete el.dataset.klaar;
    el.innerHTML = '<div style="color:var(--muted);padding:40px;text-align:center;">Laden...</div>';
  }












  const bijvragen = (id) => Promise.all([
    db.rpc('tt_musicians_ages', { ids: [id] }), profielBandsOphalen(id)]);
  const voorafId = myMusicianId;
  const vooraf = voorafId ? bijvragen(voorafId) : null;
  const { data: m, error } = await db.from('musicians')
    .select(`id, weergavenaam, username, city, bio,
             avatar_url, stand,
             musician_instruments(instrument, niveau), musician_genres(genre),
             musician_songs(song_title, song_artist, mastery_level),
             musician_media(media_type, url, platform, in_banner, created_at, uitsnede)`)
    .eq('user_id', currentUser.id)
    .single();


  if (error && error.code !== 'PGRST116') {
    logCaught('loadMyProfile', error);
    el.innerHTML = foutStaatHTML(error, 'je profiel laden', 'loadMyProfile()');
    return;
  }
  if (error || !m) {



    el.innerHTML = emptyStateHTML(
      'Nog geen profiel',
      'Maak je muzikantprofiel aan om gevonden te worden.',
      'Profiel aanmaken',
      "showView('register')"
    );
    return;
  }

  const [{ data: myAges }, mijnBands] = await (voorafId === m.id ? vooraf : bijvragen(m.id));
  m.age = (myAges && myAges[0]) ? myAges[0].age : undefined;
  m.bands = mijnBands;




  el.innerHTML = buildMusicianDetailHTML(m, true) + renderCompletenessMeter(m);
  el.dataset.klaar = currentUser.id;


  hoesStarten(el);
  mediaTitelsBijwerken(el);


  fitProfileName(el);
  loadBandInvites(m.id);


  myStand = m.stand || 'actief';
  toonStatus();
}







let myStand = 'actief';


function toonStatus() {
  const st = STANDEN.find(x => x.waarde === myStand) || STANDEN[0];
  const label = document.querySelector('#statusTegel .wheel-field-label');
  if (label) label.textContent = st.label;
}


async function zetStatus(stand) {
  if (!myMusicianId || stand === myStand) return;
  try {
    const { error } = rijenGeraakt(await db.from('musicians')
      .update({ stand })
      .eq('id', myMusicianId).select('id'));
    if (error) throw error;
    myStand = stand;
    toonStatus();
    showToast('Wijzigingen opgeslagen.');
  } catch (e) {
    logCaught('zetStatus', e);
    showToast(friendlyErrorMessage(e, 'je status opslaan'));
    toonStatus();
  }
}




async function laadInstellingen() {
  const blok = document.getElementById('instellingenProfielBlok');
  if (!blok) return;
  const mid = await getMyMusicianId();
  blok.style.display = mid ? '' : 'none';

  const regel = document.getElementById('accountVerwijderRegel');
  if (regel) regel.innerHTML = '&nbsp;';
  if (!mid) return;
  try {
    const { data, error } = await db.from('musicians').select('stand, weergavenaam, username').eq('id', mid).single();
    if (error) throw error;
    if (STANDEN.some(x => x.waarde === data.stand)) myStand = data.stand;


    if (regel) regel.textContent = `permanent verwijderen van ${displayNameOf(data)}`;
  } catch (e) {
    logCaught('laadInstellingen', e);
  }
  toonStatus();
}







function updateSubmitProfileState() {
  const box = document.getElementById('consentCheckbox');
  const btn = document.getElementById('submitProfileBtn');
  if (!box || !btn) return;
  btn.disabled = !box.checked;



  saveOnboardingProgress();
}





async function persistEditedProfile(mid) {
  if (!mid) return;
  const { error: uErr } = rijenGeraakt(await db.from('musicians').update({
    fname:            state.fname,
    lname:            state.lname || null,
    username:         state.username,
    birth_date:       toISODate(state.birth_date),
    city:             state.city,
    zip:              state.zip || null,
    bio:              state.bio || null,
    naam_tonen:       state.naamTonen,
    avatar_url:       state.avatarUrl || null,
    ...wazigVeld(state.avatarUrl),
    ...fotoBronVelden(),
    city_source:      state.citySource || 'cache',
    profile_complete: true,
  }).eq('id', mid).select('id'));
  if (uErr) throw uErr;
  opslagOpruimen('avatars', currentUser && currentUser.id, [state.avatarUrl, fotoBronVelden().avatar_bron]);








  const linkMedia = state.mediaLinks
    .filter(l => l.url.trim())
    .map(l => ({ media_type: 'link', url: l.url, platform: detectPlatform(l.url), in_banner: !!l.inBanner }));
  const fileMedia = state.mediaFiles
    .filter(m => m.url && !m.uploading && !m.url.startsWith('blob:'))
    .map(m => ({ media_type: m.type, url: m.url, in_banner: !!m.inBanner, uitsnede: bannerKader(m), wazig: wazigVoor(m.url) }));

  const { error: kErr } = await db.rpc('tt_save_musician_koppelingen', {
    p_musician_id: mid,
    p_instruments: state.instruments.map(instrument => ({ instrument, niveau: state.instrumentLevels[instrument] || null })),
    p_genres:      state.genres.map(genre => ({ genre })),
    p_songs:       state.songs.map(s => ({ song_title: s.title, song_artist: s.artist, mastery_level: s.level })),
    p_media:       linkMedia.concat(fileMedia),
  });
  if (kErr) throw kErr;
  opslagOpruimen('media', currentUser && currentUser.id, fileMedia.map(m => m.url));

  state.savedId = mid;
}











function bevestigVerwachteUitkomst(e) {
  return /al in gebruik|Nog even wachten/i.test((e && e.message) || '');
}

async function bevestigApi(actie, gegevens) {
  const { data, error } = await db.functions.invoke('email-bevestigen', {
    body: Object.assign({ actie }, gegevens || {})
  });
  if (error) throw new Error(await extractFnErrorDetail(error));
  if (data && data.error) throw new Error(data.error);
  return data || {};
}



async function profielWachtOpBevestiging(mid) {
  const { data, error } = await db.from('musicians')
    .select('wacht_op_bevestiging').eq('id', mid).maybeSingle();
  if (error) { logCaught('profielWachtOpBevestiging', error); return false; }
  return !!data?.wacht_op_bevestiging;
}




async function bevestigingStarten() {


  pendingMessageRecipient = null;
  try { await bevestigApi('start'); }
  catch (e) {
    logCaught('bevestigingStarten', e);
    showToast('De mail kon niet worden verstuurd. Tik op "Mail opnieuw sturen".');
  }
  hideSaving();
  showView('myprofile');
}


async function renderEmailBevestigBanner() {
  const el = document.getElementById('emailBevestigBanner');
  if (!el || !currentUser) return;


  if (el.dataset.bevestigd === '1') return;
  const { data, error } = await db.from('musicians')
    .select('wacht_op_bevestiging').eq('user_id', currentUser.id).maybeSingle();



  if (error) {
    logCaught('renderEmailBevestigBanner', error);
    if (el.dataset.uid !== currentUser.id) { el.innerHTML = ''; bevestigPeilStoppen(); }
    return;
  }
  el.dataset.uid = currentUser.id;
  if (!data?.wacht_op_bevestiging) { el.innerHTML = ''; bevestigPeilStoppen(); return; }



  let dicht = false;
  try { dicht = sessionStorage.getItem('tt-bevestig-melding-dicht') === '1'; } catch (e) { }
  if (dicht) { el.innerHTML = ''; bevestigPeilStoppen(); return; }
  bevestigPeilStarten();
  el.innerHTML = `
    <div class="melding melding-met-sluit">
      <button type="button" class="modal-close" onclick="bevestigMeldingSluiten()" aria-label="Sluiten"><svg viewBox="-0.75 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
      <p class="melding-kop">Nog één stap: bevestig je e‑mailadres</p>
      <p class="melding-tekst">We hebben een mail gestuurd naar <strong id="bevestigEmailadres">${escHtml(currentUser.email || '')}</strong>. Tik op de knop in die mail. Daarna staat je profiel online en kun je berichten sturen.</p>
      <div id="bevestigKnoppen">
        <div class="knoppen-stapel">
          <button class="btn btn-ghost" id="bevestigOpnieuwBtn" onclick="bevestigMailOpnieuw()">Mail opnieuw sturen</button>
        </div>
        <p class="stille-link-regel"><button type="button" class="stille-link" onclick="bevestigEmailadresTonen(true)">E-mailadres klopt niet? Pas het aan</button></p>
      </div>
      <div id="bevestigEmailadresVak" style="display:none;">
        <div class="field">
          <label for="bevestigNieuwEmailadres">Je juiste e-mailadres</label>
          <input type="email" id="bevestigNieuwEmailadres" placeholder="jouw@email.nl" autocomplete="email" inputmode="email" enterkeyhint="send" onkeydown="submitOnEnter(event, bevestigEmailadresOpslaan)">
        </div>
        <div class="btn-row" style="margin-top:12px;">
          <button class="btn btn-ghost" onclick="bevestigEmailadresTonen(false)">Annuleren</button>
          <button class="btn btn-primary" id="bevestigEmailadresBtn" onclick="bevestigEmailadresOpslaan()">Mail sturen</button>
        </div>
      </div>
    </div>`;
}








let bevestigPeilTimer = null;

function bevestigPeilStarten() {
  if (bevestigPeilTimer) return;
  bevestigPeilTimer = setInterval(bevestigPeilen, 5000);
}

function bevestigPeilStoppen() {
  if (bevestigPeilTimer) { clearInterval(bevestigPeilTimer); bevestigPeilTimer = null; }
}

async function bevestigPeilen() {
  const el = document.getElementById('emailBevestigBanner');
  if (!el || !currentUser || !el.querySelector('#bevestigKnoppen')) { bevestigPeilStoppen(); return; }
  if (document.visibilityState !== 'visible' || el.offsetParent === null) return;
  const { data, error } = await db.from('musicians')
    .select('wacht_op_bevestiging').eq('user_id', currentUser.id).maybeSingle();
  if (error) { logCaught('bevestigPeilen', error); return; }
  if (!data || data.wacht_op_bevestiging) return;
  bevestigPeilStoppen();
  el.dataset.bevestigd = '1';
  el.innerHTML = `
    <div class="melding" role="status">
      <p class="melding-kop">Je e‑mailadres is bevestigd</p>
      <p class="melding-tekst">Je profiel staat online. Muzikanten kunnen je nu vinden en je kunt berichten sturen.</p>
    </div>`;
  setTimeout(() => { delete el.dataset.bevestigd; el.innerHTML = ''; }, 6000);
  loadMyProfile({ behoud: true });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') bevestigPeilen();
});

function bevestigMeldingSluiten() {
  try { sessionStorage.setItem('tt-bevestig-melding-dicht', '1'); } catch (e) { }
  const el = document.getElementById('emailBevestigBanner');
  if (el) el.innerHTML = '';
}

function bevestigEmailadresTonen(aan) {
  const vak = document.getElementById('bevestigEmailadresVak');
  const knoppen = document.getElementById('bevestigKnoppen');
  if (!vak || !knoppen) return;
  vak.style.display = aan ? '' : 'none';
  knoppen.style.display = aan ? 'none' : '';
  const veld = document.getElementById('bevestigNieuwEmailadres');
  clearFieldErrors(vak);
  if (veld) veld.value = '';
}



function bevestigUitkomstTonen(uit) {
  if (uit.bevestigd) {
    showToast('Je e-mailadres is al bevestigd. Je profiel staat online.');
    loadMyProfile();
    return;
  }
  if (uit.email && currentUser) currentUser.email = uit.email;
  showToast(`Mail gestuurd naar ${uit.email || 'je e-mailadres'}.`);
}

async function bevestigMailOpnieuw() {
  const knop = document.getElementById('bevestigOpnieuwBtn');
  if (knop) knop.disabled = true;
  try { bevestigUitkomstTonen(await bevestigApi('start')); }
  catch (e) { if (!bevestigVerwachteUitkomst(e)) logCaught('bevestigMailOpnieuw', e); showToast(e.message || friendlyErrorMessage(e, 'de bevestigingsmail versturen')); }
  finally { if (knop) knop.disabled = false; }
}

async function bevestigEmailadresOpslaan() {
  const vak = document.getElementById('bevestigEmailadresVak');
  const veld = document.getElementById('bevestigNieuwEmailadres');
  const knop = document.getElementById('bevestigEmailadresBtn');
  if (!vak || !veld) return;
  clearFieldErrors(vak);
  const email = veld.value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setFieldError(veld, 'Vul een geldig e-mailadres in'); return; }
  if (knop) knop.disabled = true;
  try {
    const uit = await bevestigApi('e-mailadres', { email });


    const { data: ververst } = await db.auth.refreshSession();
    if (ververst?.session?.user) { currentUser = ververst.session.user; verversEmailWeergave(currentUser.email || ''); }
    bevestigUitkomstTonen(uit);
    if (!uit.bevestigd) await renderEmailBevestigBanner();
  } catch (e) {
    if (!bevestigVerwachteUitkomst(e)) logCaught('bevestigEmailadresOpslaan', e);

    if (/al in gebruik/i.test(e.message || '')) setFieldError(veld, TEKST_EMAIL_BEZET);
    else if (/e-mailadres/i.test(e.message || '')) setFieldError(veld, e.message.replace(/\.$/, ''));
    else showToast(e.message || friendlyErrorMessage(e, 'je e-mailadres opslaan'));
  } finally { if (knop) knop.disabled = false; }
}






async function bevestigPaginaOpenen(code) {
  showView('toestemming');
  toestemmingMeldingTonen('E-mailadres bevestigen', ['Even geduld...']);
  let uit;
  try { uit = await bevestigApi('bevestig', { code }); }
  catch (e) {
    logCaught('bevestigPaginaOpenen', e);
    toestemmingMeldingTonen('E-mailadres bevestigen lukte niet', [
      'We konden je e-mailadres nu niet bevestigen. Tik over een paar minuten opnieuw op de knop in de mail.']);
    return;
  }
  const gelukt = uit.stand === 'bevestigd' || uit.stand === 'al';
  if (gelukt && currentUser && uit.musician_id && uit.musician_id === await getMyMusicianId()) {
    showView('myprofile', 'redirect');
    showToast(uit.stand === 'bevestigd'
      ? 'Je e-mailadres is bevestigd. Je profiel staat online.'
      : 'Je e-mailadres was al bevestigd.');
    return;
  }
  const knop = currentUser
    ? { tekst: 'Naar mijn profiel', actie: 'naarHoogsteScherm()' }
    : { tekst: 'Inloggen', actie: "showView('auth')" };
  if (uit.stand === 'bevestigd') {
    toestemmingMeldingTonen('Je e-mailadres is bevestigd',
      ['Je profiel staat online. Muzikanten kunnen je nu vinden.'], knop);
  } else if (uit.stand === 'al') {
    toestemmingMeldingTonen('Je e-mailadres is al bevestigd', ['Je profiel staat online.'], knop);
  } else if (uit.stand === 'oud') {
    toestemmingMeldingTonen('Deze link werkt niet meer',
      ['Je hebt je e-mailadres daarna nog aangepast. Gebruik de knop in de nieuwste mail.']);
  } else {
    toestemmingMeldingTonen('Deze link werkt niet',
      ['Heb je meer mails van ons gekregen? Gebruik dan de knop in de nieuwste.']);
  }
}




async function submitProfile() {


  if (!document.getElementById('consentCheckbox')?.checked) {
    showToast('Vink eerst aan dat je akkoord gaat met de voorwaarden.');
    return;
  }


  if (document.querySelector('#avatarPreview .avatar-uploading')) { showToast('Je foto wordt nog geüpload. Even geduld.'); return; }
  if (state.mediaFiles.some(m => m.uploading)) { showToast('Er wordt nog een bestand geüpload. Even geduld.'); return; }







  if (state.ouderRoute && !state.regPassword) {
    const aanvraag = ouderAanvraagLezen();
    if (!aanvraag) { ouderStapTonen(); return; }
    if (aanvraag.stand === 'goedgekeurd') ouderWachtwoordTonen();
    else ouderWachtTonen();
    return;
  }




  if (!currentUser && !state.ouderRoute && !state.regPassword) {
    terugNaarVeld('regPassword', 'Vul je wachtwoord opnieuw in');
    return;
  }

  showSaving();
  myOwnCity = null;
  onboardingInFlight = true;

  try {
    let userId = currentUser?.id || null;
    if (!userId) {
      userId = await accountAanmaken();
      if (!userId) return;
    }






    const uploadFotoVraag = (async () => {
      if (!state.avatarFile) return true;
      try {
        const f = await fotoMetBronUploaden({ file: state.avatarFile, bron: state.avatarBron, kader: state.avatarKader }, userId);
        state.avatarUrl = f.url;
        state.avatarBron = f.bron;
        state.avatarKader = f.kader;
        return true;
      } catch (e) {
        logCaught('submitProfile', e);
        state.avatarUrl = null;
        return false;
      } finally {
        state.avatarFile = null;
      }
    })();





    const uploadMediaVraag = Promise.all(state.mediaFiles.filter(m => m.bestand).map(async m => {
      try {
        const { url, path } = await uploadMediaFile(m.bestand, userId);
        m.url = url;
        m.path = path;
        m.bestand = null;
        return true;
      } catch (e) {
        logCaught('submitProfile-media', e);
        m.url = '';
        return false;
      }
    }));
    const [fotoGelukt, mediaGelukt] = await Promise.all([uploadFotoVraag, uploadMediaVraag]);

    const uploadMelding = mediaGelukt.includes(false)
      ? 'Profiel opgeslagen, maar niet elke foto of video kon worden geüpload. Voeg wat ontbreekt later toe via profiel bewerken.'
      : !fotoGelukt ? 'Profiel opgeslagen, maar de profielfoto kon niet worden geüpload. Voeg de foto later toe via profiel bewerken.' : '';





    const { data: bestaand, error: bestaatFout } = await db.from('musicians').select('id').eq('user_id', userId).single();
    if (bestaatFout && bestaatFout.code !== 'PGRST116') throw bestaatFout;
    let mid = bestaand?.id || null;
    if (!mid) {
      const { data: musician, error: mErr } = await db
        .from('musicians')
        .insert({
          fname:            state.fname,
          lname:            state.lname || null,
          username:         state.username,
          birth_date:       toISODate(state.birth_date),
          city:             state.city,
          zip:              state.zip || null,
          bio:              state.bio || null,
          profile_color:    DEFAULT_PROFILE_COLOR,
          avatar_url:       state.avatarUrl || null,
          ...wazigVeld(state.avatarUrl),
          ...fotoBronVelden(),
          city_source:      state.citySource || 'cache',
          user_id:          userId,
          profile_complete: true,
        })
        .select('id')
        .single();
      if (mErr) throw mErr;
      mid = musician.id;
    }
    myMusicianId = mid;


    await persistEditedProfile(mid);

    clearOnboardingProgress();
    state.onboarding = false;
    state.ouderRoute = false;
    if (uploadMelding) showToast(uploadMelding);

    if (await profielWachtOpBevestiging(mid)) { await bevestigingStarten(); return; }
    showSaveSuccess();

  } catch (err) {
    logCaught('submitProfile', err);
    showSaveError(err, 'je profiel aanmaken');
  } finally {
    onboardingInFlight = false;
  }
}




async function accountAanmaken() {
  const { data: authData, error: authErr } = await db.auth.signUp({
    email:    state.regEmail,
    password: state.regPassword,
    options:  { data: { fname: state.fname } }
  });


  if (authErr && isZwakWachtwoordFout(authErr)) { terugNaarVeld('regPassword', TEKST_ZWAK_WACHTWOORD); return null; }



  const alAccount = !!authErr && /already registered|already exists/i.test(authErr.message || '');
  if (authErr && !alAccount) throw authErr;




  const { data: signInData, error: signInErr } = await db.auth.signInWithPassword({
    email: state.regEmail, password: state.regPassword
  });
  if (signInErr) {


    if (alAccount && !state.ouderRoute
        && /invalid login credentials|invalid_credentials|invalid grant/i.test(signInErr.message || '')) {
      terugNaarVeld('regEmail', TEKST_ACCOUNT_BESTAAT);
      return null;
    }
    throw signInErr;
  }
  const authUser = signInData.user || authData?.user || null;
  if (!authUser?.id) throw eigenFout('Je account is aangemaakt, maar inloggen lukte niet. Ga naar Inloggen en log in met je e-mailadres en wachtwoord.');
  currentUser = authUser;




  const regPwVeld = document.getElementById('regPassword');
  if (regPwVeld) regPwVeld.value = '';


  saveOnboardingProgress();
  return authUser.id;
}



function terugNaarVeld(id, tekst) {
  document.getElementById('saveOverlay').classList.remove('visible');
  if (state.ouderRoute) { setFieldError(document.getElementById('ouderWachtwoordVeld'), tekst); return; }
  goTo(0);
  showFieldErrors([[id, tekst]]);
}








const DEFAULT_PROFILE_COLOR = '#FFB81C';




function legeWizardState() {
  return {
    currentStep: 0,
    fname: '', lname: '', birth_date: '', city: '', zip: '', bio: '',
    username: '',
    citySource: 'cache',
    regEmail: '', regPassword: '',
    instruments: [],
    instrumentLevels: {},
    genres: [],
    songs: [],
    naamTonen: 'echt',
    avatarUrl: null,
    avatarFile: null,
    avatarBron: null,
    avatarKader: null,
    ouderRoute: false,
    mediaFiles: [],
    mediaLinks: [],
    onboarding: false
  };
}
let state = legeWizardState();






function wizardLeegmaken() {
  state = legeWizardState();
  postcodeResolved = false;
  const view = document.getElementById('view-register');
  if (!view) return;
  view.querySelectorAll('input, textarea').forEach(el => {
    if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
    else if (!['button', 'submit', 'hidden'].includes(el.type)) el.value = '';
  });
  clearFieldErrors(view);
  populateWizardFieldsFromState();
  updateSubmitProfileState();
  goTo(0);
}



function init() {





  initInstrumentPicker({
    id: 'wizard',
    fieldId: 'instrumentPickerField', badgeRowId: 'instrumentBadgeRow',
    getInstruments: () => state.instruments, getLevels: () => state.instrumentLevels,
    onChange: saveOnboardingProgress,
    toevoegen: 'Instrument',
  });
  initPicker({
    id: 'genre',
    fieldId: 'genrePickerField', badgeRowId: 'genreBadgeRow',
    options: GENRES, getList: () => state.genres,
    placeholder: 'Kies een genre',
    onChange: saveOnboardingProgress,
    toevoegen: 'Genre',
  });

  syncViewToggles();



  renderMediaGrid();


  document.getElementById('fname').addEventListener('input', () => {
    state.fname = document.getElementById('fname').value.trim();
  });
  document.getElementById('bio').addEventListener('input', () => {
    state.bio = document.getElementById('bio').value.trim();
  });

  document.getElementById('step0').addEventListener('input', () => { naamKeuzeBijwerken(WIZ_NAAM, state.naamTonen); wizHoesBijwerken(); });
  naamKeuzeBijwerken(WIZ_NAAM, state.naamTonen);



  try {
    const lastEmail = localStorage.getItem('tt_lastLoginEmail');
    const loginEmailField = document.getElementById('loginEmail');
    if (lastEmail && loginEmailField && !loginEmailField.value) loginEmailField.value = lastEmail;
  } catch (e) { }
}








const WIZ_NAAM = { blok: 'naamKeuze', control: 'naamTonenControl', voorbeeld: 'naamVoorbeeld',
  fname: 'fname', lname: 'lname', username: 'username', geboorte: 'birth_date' };
function zetNaamTonen(waarde) {
  state.naamTonen = waarde === 'gebruikersnaam' ? 'gebruikersnaam' : 'echt';
  naamKeuzeBijwerken(WIZ_NAAM, state.naamTonen);
  wizHoesBijwerken();
  saveOnboardingProgress();
}








function wizHoesBijwerken() {
  const vak = document.getElementById('wizHoes');
  if (!vak) return;
  const waarde = id => (document.getElementById(id)?.value || '').trim();
  const datum = waarde('birth_date');
  const leeftijd = leeftijdUitVeld(datum);
  const naam = naamZoalsAnderen(waarde('fname'), waarde('lname'), waarde('username'),
    state.naamTonen, leeftijd === null ? 16 : leeftijd) || 'Jouw naam';
  const regel = `${leeftijd === null ? 'Je leeftijd' : leeftijd + ' jaar'} · ${waarde('city') || 'je plaats'}`;
  if (!vak.querySelector('.hoes')) {
    if (!vak.clientWidth) return;
    vak.innerHTML = profielHoesHTML({ naam, media: [], regels: `<div class="profile-meta">${escHtml(regel)}</div>`, knoppen: '' });
    hoesStarten(vak);
  } else {
    vak.querySelector('.profile-name').textContent = naam;
    vak.querySelector('.profile-meta').textContent = regel;
  }
  fitProfileName(vak);
}



async function nextStep(from) {
  if (from === 0) {
    state.fname      = document.getElementById('fname').value.trim();
    state.lname      = document.getElementById('lname').value.trim();
    state.birth_date = document.getElementById('birth_date').value.trim();
    state.bio        = document.getElementById('bio').value.trim();
    state.username   = document.getElementById('username').value.trim();

    if (!currentUser) {
      state.regEmail    = document.getElementById('regEmail').value.trim();
      state.regPassword = document.getElementById('regPassword').value;
    }





    clearFieldErrors('view-register');
    const fouten = [];





    if (!state.fname) {
      fouten.push(['fname', 'Vul je voornaam in']);
    } else if (!naamPastInProfielkop(naamZoalsAnderen(state.fname, state.lname, state.username, state.naamTonen,
        leeftijdUitVeld(state.birth_date) ?? 16) || state.fname)) {




      fouten.push(['fname', 'Deze naam is te lang om op je profiel te tonen. Maak hem korter']);
    }


    const leeftijd = calcAge(state.birth_date);
    const datumFout = geboortedatumFout(state.birth_date);
    if (datumFout) fouten.push(['birth_date', datumFout]);

    if (!state.zip || !postcodeResolved || !state.city) {
      fouten.push(['zip', 'Vul een geldige postcode in. Je woonplaats wordt dan automatisch ingevuld']);
    }



    if (!state.username) {
      fouten.push(['username', 'Kies een gebruikersnaam']);
    } else if (!usernameFormatValid(state.username)) {
      fouten.push(['username', 'Alleen letters, cijfers en underscore, 3-20 tekens']);
    } else if (leeftijd >= 13 && leeftijd < 16 && state.username.toLowerCase() === state.fname.toLowerCase()) {
      fouten.push(['username', 'Onder de 16 jaar moet de gebruikersnaam anders zijn dan je voornaam']);
    }

    if (!currentUser) {





      if (!state.regEmail) {
        fouten.push(['regEmail', 'Vul je e-mailadres in']);
      } else if (!emailFormaatGeldig(state.regEmail)) {
        fouten.push(['regEmail', 'Vul een geldig e-mailadres in, bijvoorbeeld jouw@email.nl']);
      }



      if (!ouderToestemmingNodig(leeftijd)) {
        if (!state.regPassword) {
          fouten.push(['regPassword', 'Kies een wachtwoord']);
        } else if (state.regPassword.length < 8) {
          fouten.push(['regPassword', 'Kies een wachtwoord van minimaal 8 tekens']);
        }
      }
    }

    if (showFieldErrors(fouten)) return;




    const available = (usernameCheckedValue === state.username && usernameAvailable)
      ? true
      : await checkUsernameAvailability();
    if (!available) {




      if (usernameCheckFailed) {

        showToast('De gebruikersnaam kon niet gecontroleerd worden. Probeer het over een paar seconden opnieuw.');
      } else {
        showFieldErrors([['username', 'Deze gebruikersnaam is al bezet. Kies een andere']]);
      }
      return;
    }






    if (ouderToestemmingNodig(leeftijd)) {
      state.ouderRoute = true;
      state.onboarding = false;
      saveOnboardingProgress();


      const lopend = ouderAanvraagLezen();
      if (lopend && lopend.stand !== 'geweigerd' && lopend.stand !== 'verlopen') { goTo(1); return; }
      ouderStapTonen();
      return;
    }
    state.ouderRoute = false;


    state.onboarding = true;
  }
  if (from === 1) {








    const fouten = [];
    if (!state.instruments.length) fouten.push(['instrumentPickerField', 'Kies minimaal één instrument']);
    if (!state.genres.length) fouten.push(['genrePickerField', 'Kies minimaal één genre']);
    if (showFieldErrors(fouten)) return;
  }



  if (from === 2 && showFieldErrors(nummersTekortFouten())) return;
  goTo(from + 1);
}





async function prevStep(from) {
  goTo(from - 1);
}










function aanmeldingIngevuld() {
  const velden = ['fname', 'lname', 'birth_date', 'username', 'zip', 'bio', 'regEmail']
    .some(id => (document.getElementById(id)?.value || '').trim());
  return velden || !!leesOpgeslagenVoortgang()
    || [state.instruments, state.genres, state.songs, state.mediaLinks, state.mediaFiles].some(l => l && l.length);
}




async function prevStepFromStart() {
  if (!aanmeldingIngevuld()) { popNavStap('landing'); return; }
  showConfirm('Wat je invulde, wordt van dit toestel gewist.', () => {
    clearOnboardingProgress();
    if (typeof ouderAanvraagWissen === 'function') ouderAanvraagWissen();
    showView('landing', 'redirect');


    window.location.reload();
  }, 'Stoppen', false, 'Annuleren', 'Stoppen met aanmelden?');
}

function goTo(step) {
  document.querySelectorAll('.panel').forEach((p,i) => {
    p.classList.toggle('active', i === step);
  });

  const dots = document.querySelectorAll('.step-dot');
  dots.forEach((d,i) => {
    d.classList.remove('active','done');
    if (i === step) d.classList.add('active');
    else if (i < step) d.classList.add('done');
  });







  document.getElementById('stepLabel').textContent = `Stap ${step + 1} van ${dots.length}`;

  state.currentStep = step;
  if (step === 0) wizHoesBijwerken();
  saveOnboardingProgress();
  window.scrollTo({top:0, behavior:'smooth'});



}


















const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const AVATAR_TYPE_LABEL = 'JPG, PNG of WEBP';
const MEDIA_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/quicktime'];
const MEDIA_TYPE_LABEL = 'JPG, PNG, GIF, WEBP, MP4 of MOV';


function fileTypeProblem(file, allowedTypes, typeLabel) {
  const type = (file.type || '').toLowerCase();
  if (allowedTypes.includes(type)) return null;


  if (type === 'image/heic' || type === 'image/heif') {
    return 'Dit fotoformaat (HEIC) werkt niet. Zet op je iPhone in Instellingen → Camera → Indelingen de optie "Meest compatibel" aan, of sla de foto op als JPG.';
  }
  return `Dit bestandsformaat werkt niet. Gebruik ${typeLabel}.`;
}






const FOTO_MAX_PX = 1600;
const FOTO_DREMPEL_BYTES = 1024 * 1024;
const FOTO_MAX_ORIGINEEL = 30 * 1024 * 1024;

async function fotoVerkleinen(file) {
  const type = (file.type || '').toLowerCase();
  if (!/^image\/(jpeg|png|webp)$/.test(type) || file.size <= FOTO_DREMPEL_BYTES) return file;
  let url = null;
  try {
    url = URL.createObjectURL(file);
    const img = await new Promise((ok, fout) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fout(new Error('foto niet te lezen'));
      i.src = url;
    });
    const schaal = Math.min(1, FOTO_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight));
    const breed = Math.max(1, Math.round(img.naturalWidth * schaal));
    const hoog = Math.max(1, Math.round(img.naturalHeight * schaal));
    const canvas = document.createElement('canvas');
    canvas.width = breed; canvas.height = hoog;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, breed, hoog);
    ctx.drawImage(img, 0, 0, breed, hoog);
    const blob = await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    const naam = (file.name || 'foto').replace(/\.[^.]*$/, '') + '.jpg';
    return new File([blob], naam, { type: 'image/jpeg' });
  } catch (e) {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}


const VIDEO_TE_GROOT_MS = 8000;



function bestandTeGrootMelding(file, maxBytes) {
  const type = (file.type || '').toLowerCase();
  const naam = file.name ? `"${file.name}" ` : '';
  const mb = Math.round(file.size / 1024 / 1024);
  if (/^image\/(jpeg|png|webp)$/.test(type)) {
    return file.size > FOTO_MAX_ORIGINEEL
      ? `${naam}is ${mb} MB. Kies een foto van maximaal 30 MB.` : null;
  }
  if (file.size <= maxBytes) return null;
  const maxMb = Math.round(maxBytes / 1024 / 1024);


  if (type.startsWith('video/')) return `Deze video is helaas te groot. Kies er een tot ${maxMb}\u00a0MB, of voeg hem toe als link.`;
  return `${naam}is ${mb} MB. Maximaal ${maxMb} MB. Gebruik een JPG of PNG, die verkleint de app zelf.`;
}









let fotoUploadsBezig = 0;
const wazigBijUpload = new Map();
async function uploadToStorage(bucket, userId, file, maxBytes, maxLabel, allowedTypes, typeLabel) {
  fotoUploadsBezig++;
  try {
    const uit = await uploadToStorageZonderKlein(bucket, userId, file, maxBytes, maxLabel, allowedTypes, typeLabel);
    if (/^image\/(jpeg|png|webp)$/.test((uit.file.type || '').toLowerCase())) {
      try {
        const klein = await fotootjeMaken(uit.file);
        const { error } = await db.storage.from(bucket).upload(fotoKleinPad(uit.path), klein,
          { cacheControl: '3600', upsert: false, contentType: 'image/jpeg' });
        if (error) throw error;
      } catch (e) {
        logCaught('fotootjeUploaden', e);
      }
      try {
        const w = await wazigMaken(uit.file);
        if (w) wazigBijUpload.set(uit.url, w);
      } catch (e) {
        logCaught('wazigMaken', e);
      }
    }
    return uit;
  } finally {
    fotoUploadsBezig--;
  }
}

async function uploadToStorageZonderKlein(bucket, userId, file, maxBytes, maxLabel, allowedTypes, typeLabel) {
  if (allowedTypes) {
    const problem = fileTypeProblem(file, allowedTypes, typeLabel);
    if (problem) throw eigenFout(problem);
  }
  file = await fotoVerkleinen(file);
  if (file.size > maxBytes) throw eigenFout(`Het bestand is te groot. Maximaal ${maxLabel}. Een JPG of PNG verkleint de app zelf.`);
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const path = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error: upErr } = await db.storage.from(bucket).upload(path, file, { cacheControl: '3600', upsert: false });
  if (upErr) throw upErr;
  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return { url: data.publicUrl, path, file };
}



async function fotootjeMaken(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fout) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fout(new Error('foto niet te lezen'));
      i.src = url;
    });
    const zijde = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = FOTO_KLEIN_PX;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, FOTO_KLEIN_PX, FOTO_KLEIN_PX);
    ctx.drawImage(img, (img.naturalWidth - zijde) / 2, (img.naturalHeight - zijde) / 2, zijde, zijde,
      0, 0, FOTO_KLEIN_PX, FOTO_KLEIN_PX);
    const blob = await new Promise(ok => canvas.toBlob(ok, 'image/jpeg', 0.8));
    if (!blob) throw new Error('fotootje niet gemaakt');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}






async function wazigMaken(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, fout) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fout(new Error('foto niet te lezen'));
      i.src = url;
    });
    const W = img.naturalWidth, H = img.naturalHeight;
    const b = Math.min(W, H * 4 / 3), h = b * 3 / 4;
    const canvas = document.createElement('canvas');
    canvas.width = 16; canvas.height = 12;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, 16, 12);
    ctx.drawImage(img, (W - b) / 2, (H - h) / 2, b, h, 0, 0, 16, 12);
    return wazigBron(canvas.toDataURL('image/jpeg', 0.7));
  } finally {
    URL.revokeObjectURL(url);
  }
}

function wazigVoor(url) {
  return wazigBijUpload.get(url) || null;
}




function wazigVeld(url) {
  const w = url ? wazigVoor(url) : null;
  return w ? { avatar_wazig: w } : {};
}

function uploadAvatarFile(file, userId) {
  return uploadToStorage('avatars', userId, file, 5 * 1024 * 1024, '5 MB', AVATAR_MIME_TYPES, AVATAR_TYPE_LABEL);
}







async function opslagOpruimen(bucket, map, urls) {
  if (!map || fotoUploadsBezig) return;
  try {
    const pad = `/storage/v1/object/public/${bucket}/`;
    const houden = [];
    (urls || []).forEach(u => {
      const delen = String(u || '').split(pad);
      if (delen.length !== 2) return;
      const p = decodeURIComponent(delen[1]);
      houden.push(p, fotoKleinPad(p));
    });
    const { data, error } = await db.storage.from(bucket).list(map, { limit: 1000 });
    if (error) throw error;
    const weg = (data || []).filter(f => f.id).map(f => `${map}/${f.name}`).filter(p => !houden.includes(p));
    if (!weg.length) return;
    const { error: wErr } = await db.storage.from(bucket).remove(weg);
    if (wErr) throw wErr;
  } catch (e) {
    logCaught('opslagOpruimen', e);
  }
}

function uploadMediaFile(file, userId) {
  return uploadToStorage('media', userId, file, 50 * 1024 * 1024, '50 MB', MEDIA_MIME_TYPES, MEDIA_TYPE_LABEL);
}



function fotoBronVelden() {
  const bron = state.avatarUrl && typeof state.avatarBron === 'string' ? state.avatarBron : null;
  return { avatar_bron: bron, avatar_kader: bron ? uitsnedeGeldig(state.avatarKader) : null };
}

async function handleAvatarUpload(file) {
  if (!file) return;


  const typeProblem = fileTypeProblem(file, AVATAR_MIME_TYPES, AVATAR_TYPE_LABEL);
  if (typeProblem) { showToast(typeProblem); return; }
  { const groot = bestandTeGrootMelding(file, 5 * 1024 * 1024); if (groot) { showToast(groot); return; } }

  const uit = await kiesUitsnede(file, 'rond');
  if (uit) avatarZetten({ file: uit, kader: uit.kader, bron: file });
}


async function avatarTik() {
  if (!state.avatarUrl && !state.avatarFile) { document.getElementById('avatarInput').click(); return; }
  const uit = await fotoVerschuiven({ url: state.avatarUrl, bron: state.avatarBron, kader: state.avatarKader }, 'rond');
  if (uit) avatarZetten(uit);
}

function avatarZetten(uit) {
  const file = uit.file;


  const blobUrl = URL.createObjectURL(file);
  const preview = document.getElementById('avatarPreview');
  preview.style.position = 'relative';
  preview.innerHTML = `<img src="${blobUrl}" alt="profielfoto">`;
  document.getElementById('avatarRemoveBtn').classList.add('visible');

  if (!currentUser) {



    state.avatarFile = file;
    state.avatarBron = uit.bron;
    state.avatarKader = uit.kader;
    state.avatarUrl = null;
    return;
  }


  preview.insertAdjacentHTML('beforeend',
    `<div class="avatar-uploading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);border-radius:50%;">
       <div class="save-spinner" style="width:24px;height:24px;border-width:3px;margin:0;"></div>
     </div>`);
  fotoMetBronUploaden(uit, currentUser.id).then(({ url, bron, kader }) => {
    state.avatarUrl = url;
    state.avatarBron = bron;
    state.avatarKader = kader;
    state.avatarFile = null;
    preview.querySelector('.avatar-uploading')?.remove();
  }).catch(e => {
    logCaught('uploadAvatar', e);
    preview.querySelector('.avatar-uploading')?.remove();
    showToast(friendlyErrorMessage(e, 'je foto uploaden'));
    removeAvatar();
  });
}




function askRemoveAvatar() {
  showConfirm('Profielfoto verwijderen?', removeAvatar, 'Ja, verwijderen');
}

function removeAvatar() {
  state.avatarUrl = null;
  state.avatarFile = null;
  state.avatarBron = null;
  state.avatarKader = null;
  const preview = document.getElementById('avatarPreview');
  preview.innerHTML = '';
  preview.style.borderColor = '';
  document.getElementById('avatarRemoveBtn').classList.remove('visible');
}




function mediaToevoegenKeuze(sel) {
  mediaToevoegenStart(sel, state.mediaFiles, state.mediaLinks, 'mediaInvoer', url => {
    state.mediaLinks.push({ url, inBanner: false });
    renderMediaGrid();
  });
}




function handleFileSelect(files) {
  Array.from(files).forEach(file => {
    if (state.mediaFiles.length >= GRENZEN.beeld) { showToast(`Maximum van ${GRENZEN.beeld} bestanden bereikt.`); return; }
    const isVideo = (file.type || '').toLowerCase().startsWith('video/');


    const typeProblem = fileTypeProblem(file, MEDIA_MIME_TYPES, MEDIA_TYPE_LABEL);
    if (typeProblem) { showToast(`"${file.name}": ${typeProblem}`); return; }
    { const groot = bestandTeGrootMelding(file, 50 * 1024 * 1024); if (groot) { showToast(groot, isVideo ? VIDEO_TE_GROOT_MS : undefined); return; } }

    const blobUrl = URL.createObjectURL(file);
    const type = isVideo ? 'video' : 'foto';
    const entry = { name: file.name, url: blobUrl, path: null, type, uploading: true, inBanner: false };
    state.mediaFiles.push(entry);
    renderMediaGrid();

    if (!currentUser) {






      entry.uploading = false;
      entry.bestand = file;
      renderMediaGrid();
      return;
    }

    uploadMediaFile(file, currentUser.id).then(({ url, path }) => {
      entry.url = url;
      entry.path = path;
      entry.uploading = false;
      renderMediaGrid();
    }).catch(e => {
      logCaught('uploadMedia', e);
      showToast(`"${file.name}": ${friendlyErrorMessage(e, 'het bestand uploaden')}`);
      const idx = state.mediaFiles.indexOf(entry);
      if (idx !== -1) state.mediaFiles.splice(idx, 1);
      renderMediaGrid();
    });
  });
}

function renderMediaGrid() {
  const grid = document.getElementById('mediaGrid');
  grid.innerHTML = mediaRasterHTML(state.mediaFiles, state.mediaLinks, '');
  bannerTellerBijwerken('wizardBannerTeller', state.mediaFiles, state.mediaLinks);
}



function toggleMediaBanner(i) {
  return bannerTekenTik(state.mediaFiles[i], state.mediaFiles, state.mediaLinks, 'mediaGrid', 'wizardBannerTeller');
}

function speelMedia(i) {
  mediaTegelTik(state.mediaFiles[i]);
}

function removeMedia(i) {
  const entry = state.mediaFiles[i];
  state.mediaFiles.splice(i,1);
  renderMediaGrid();


  if (entry?.path) {
    db.storage.from('media').remove([entry.path, fotoKleinPad(entry.path)]).then(() => {}, e => logCaught('removeMedia', e));
  }
}






function toggleLinkBanner(i) {
  linkBannerTik(state.mediaLinks[i], i, state.mediaFiles, state.mediaLinks, 'mediaGrid', 'wizardBannerTeller');
}

function speelLink(i) {
  const l = state.mediaLinks[i];
  if (!l || !l.url.trim()) return;
  openMediaSpeler(l.url, 'link', null, detectPlatform(l.url));
}

function removeLink(i) {
  state.mediaLinks.splice(i, 1);
  renderMediaGrid();
}




submitProfile = slotOm(submitProfile, 'submitProfileBtn');
