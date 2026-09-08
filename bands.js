// ─── TT-41: banduitnodigingen bevestigen ─────────────────────────────────────
// Bewust een banner op Mijn Profiel en niet een bericht in de inbox (besluit
// Ronald, 08-08-2026): één klik, geen tussenscherm, en het staat op de plek
// waar iemand na het inloggen sowieso terechtkomt. De banner verschijnt alleen
// als er daadwerkelijk iets open staat — geen lege plek in het scherm.
async function loadBandInvites(musicianId) {
  const el = document.getElementById('bandInvitesBanner');
  if (!el) return;
  el.innerHTML = '';
  try {
    const { data, error } = await db.from('band_members')
      .select('band_id, bands(name, city, profile_color)')
      .eq('musician_id', musicianId).eq('status', 'aangevraagd');
    if (error || !data || !data.length) return;

    el.innerHTML = data.map(inv => {
      const col = safeColor(inv.bands?.profile_color, '#f5c518');
      const naam = inv.bands?.name || 'Een band';
      const plaats = inv.bands?.city || '';
      return `
      <div style="border:1px solid ${col};border-left-width:4px;border-radius:10px;padding:16px;margin-bottom:16px;background:var(--surface2);">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px;">${escHtml(naam)} wil je als lid</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">${escHtml(plaats)}${plaats ? ' · ' : ''}Je staat pas op het bandprofiel als je dit bevestigt.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" style="font-size:13px;padding:8px 16px;" onclick="respondToBandInvite('${jsAttr(inv.band_id)}', true)">Bevestigen</button>
          <button class="btn btn-ghost" style="font-size:13px;padding:8px 16px;" onclick="respondToBandInvite('${jsAttr(inv.band_id)}', false)">Weigeren</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    // Een mislukte uitnodigingencheck mag Mijn Profiel nooit blokkeren —
    // stilzwijgend niets tonen is hier beter dan een foutmelding bovenaan.
  }
}

async function respondToBandInvite(bandId, accept) {
  const mid = await getMyMusicianId();
  if (!mid) return;
  try {
    const { error } = await db.from('band_members')
      .update({ status: accept ? 'bevestigd' : 'geweigerd' })
      .eq('band_id', bandId).eq('musician_id', mid);
    if (error) throw error;
    showToast(accept ? 'Je staat nu als lid op het bandprofiel.' : 'Uitnodiging geweigerd.');
    loadBandInvites(mid);
  } catch (e) {
    showToast(friendlyErrorMessage(e));
  }
}

// V-16 (13-08-2026): banner op Mijn Profiel voor een bevestigd lid dat is
// gevraagd het oprichterschap over te nemen (band_members.founder_offer).
// Vereist het losse script F-V16-oprichterschap-aanbod.sql — zonder die
// kolom faalt de vraag stil en blijft de banner leeg, net als bij een
// mislukte loadBandInvites()-aanroep hierboven.
async function loadFounderOffers(musicianId) {
  const el = document.getElementById('founderOfferBanner');
  if (!el) return;
  el.innerHTML = '';
  // 22-08-2026 (Ronald): een overnameverzoek trekt zichzelf na 7 dagen in —
  // geen cron-taak beschikbaar, dus deze controle draait "lazy" mee bij elke
  // keer dat de banner wordt opgebouwd. Fouten hier zijn nooit blokkerend.
  try { await db.rpc('tt_expire_old_founder_offers'); } catch (e) { /* geen probleem, volgende keer opnieuw */ }
  try {
    const { data, error } = await db.from('band_members')
      .select('band_id, bands(name, city, profile_color)')
      .eq('musician_id', musicianId).eq('status', 'bevestigd').eq('founder_offer', true);
    if (error || !data || !data.length) return;

    el.innerHTML = data.map(off => {
      const col = safeColor(off.bands?.profile_color, '#f5c518');
      const naam = off.bands?.name || 'Een band';
      return `
      <div style="border:1px solid ${col};border-left-width:4px;border-radius:10px;padding:16px;margin-bottom:16px;background:var(--surface2);">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px;">De beheerder van ${escHtml(naam)} stopt</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">Wil jij het beheer overnemen? Zeg je nee, dan blijft de huidige beheerder voorlopig aan.</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" style="font-size:13px;padding:8px 16px;" onclick="respondToFounderOffer('${jsAttr(off.band_id)}', true)">Ik neem het over</button>
          <button class="btn btn-ghost" style="font-size:13px;padding:8px 16px;" onclick="respondToFounderOffer('${jsAttr(off.band_id)}', false)">Nee, liever niet</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    // Zelfde keuze als loadBandInvites(): stilzwijgend niets tonen i.p.v.
    // Mijn Profiel blokkeren met een foutmelding.
  }
}

async function respondToFounderOffer(bandId, accept) {
  const mid = await getMyMusicianId();
  if (!mid) return;
  try {
    if (accept) {
      // 22-08-2026: dit liep eerder via drie losse schrijfacties vanuit de
      // sessie van de ACCEPTERENDE gebruiker — die had op dat moment nog
      // geen founder-rechten, dus twee van de drie faalden stil (geen
      // foutmelding, gewoon 0 rijen geraakt). Gevolg, live aangetroffen: de
      // oude beheerder bleef naast de nieuwe als "Oprichter" staan. Nu één
      // databasefunctie die dit met verhoogde rechten in één keer doet, na
      // een eigen controle dat er echt een openstaand aanbod is.
      const { error } = await db.rpc('tt_accept_founder_offer', { p_band_id: bandId });
      if (error) throw error;
      showToast('Je bent nu beheerder van deze band.');
    } else {
      await db.from('band_members').update({ founder_offer: false, founder_offer_at: null }).eq('band_id', bandId).eq('musician_id', mid);
      showToast('Aanbod geweigerd.');
    }
    loadFounderOffers(mid);
    loadMyBands();
  } catch (e) {
    showToast(friendlyErrorMessage(e));
  }
}

// V-16: de oprichter geeft aan te willen stoppen. Is er niemand anders
// bevestigd, dan is overdragen zinloos — direct de keuze voor opheffen.
// Zijn er wel anderen, dan gaat eerst het aanbod uit; de oprichter blijft
// oprichter totdat iemand "Ik neem het over" heeft geklikt (of totdat hij
// het aanbod intrekt en zelf voor opheffen kiest).
async function askFounderTransfer(bandId) {
  try {
    const { data: band, error } = await db.from('bands')
      .select('name, band_members(musician_id, status)').eq('id', bandId).single();
    if (error || !band) throw error || new Error('Kon band niet laden.');
    const mid = await getMyMusicianId();
    const others = (band.band_members || []).filter(m => m.status === 'bevestigd' && m.musician_id !== mid);

    if (!others.length) {
      showConfirm(
        `Je bent het enige bevestigde lid van "${band.name}". Er is niemand om het beheer aan over te dragen. Stoppen betekent dat de band wordt opgeheven.`,
        () => dissolveBand(bandId),
        'Band opheffen',
        true
      );
      return;
    }

    showConfirm(
      `Je vraagt ${others.length === 1 ? 'het andere bevestigde lid' : `de ${others.length} andere bevestigde leden`} van "${band.name}" of iemand het beheer wil overnemen. Neemt niemand het over, dan blijf jij voorlopig beheerder.`,
      () => sendFounderOffer(bandId, others.map(m => m.musician_id)),
      'Vragen'
    );
  } catch (e) {
    showToast(friendlyErrorMessage(e));
  }
}

async function sendFounderOffer(bandId, memberIds) {
  try {
    // 22-08-2026 (Ronald): een overnameverzoek trekt zichzelf na 7 dagen in
    // — founder_offer_at is het moment waarop die klok gaat lopen.
    const { error } = await db.from('band_members').update({ founder_offer: true, founder_offer_at: new Date().toISOString() }).eq('band_id', bandId).in('musician_id', memberIds);
    if (error) throw error;
    showToast('Gevraagd of iemand het overneemt. Je ziet het hier zodra iemand reageert.');
    loadMyBands();
    // TT-127-restpunt (27-08-2026): staat "Bandleden beheren" nog open voor
    // deze band, dan moet de knop meteen "Aanbod intrekken" tonen — niet pas
    // na sluiten en heropenen. Zelfde patroon als executeRemoveMember().
    if (document.getElementById('addMemberModal')?.classList.contains('visible')) {
      renderFounderTransferSection(bandId);
    }
  } catch (e) {
    showToast(friendlyErrorMessage(e));
  }
}

async function withdrawFounderOffer(bandId) {
  try {
    const { error } = await db.from('band_members').update({ founder_offer: false, founder_offer_at: null }).eq('band_id', bandId);
    if (error) throw error;
    showToast('Aanbod ingetrokken.');
    loadMyBands();
    if (document.getElementById('addMemberModal')?.classList.contains('visible')) {
      renderFounderTransferSection(bandId);
    }
  } catch (e) {
    showToast(friendlyErrorMessage(e));
  }
}

async function dissolveBand(bandId) {
  try {
    await db.from('band_wanted').delete().eq('band_id', bandId);
    await db.from('band_members').delete().eq('band_id', bandId);
    const { error } = await db.from('bands').delete().eq('id', bandId);
    if (error) throw error;
    showToast('Band opgeheven.');
    loadMyBands();
  } catch (e) {
    showToast(friendlyErrorMessage(e));
  }
}

// V-16: een gewoon lid verlaat de band zelf — geen overdracht nodig, de
// oprichter blijft gewoon oprichter.
function leaveBand(bandId, bandName) {
  showConfirm(
    `Weet je zeker dat je "${bandName}" wilt verlaten?`,
    () => executeLeaveBand(bandId),
    'Ja, verlaten'
  );
}

async function executeLeaveBand(bandId) {
  const mid = await getMyMusicianId();
  if (!mid) return;
  try {
    const { error } = await db.from('band_members').delete().eq('band_id', bandId).eq('musician_id', mid);
    if (error) throw error;
    showToast('Je hebt de band verlaten.');
    loadMyBands();
  } catch (e) {
    showToast(friendlyErrorMessage(e));
  }
}

// V-16: de oprichter kan zelf ook een lid verwijderen (i.p.v. wachten tot
// iemand zelf vertrekt).
function removeMember(bandId, musicianId, memberName) {
  showConfirm(
    `Weet je zeker dat je ${memberName} uit de band wilt verwijderen?`,
    () => executeRemoveMember(bandId, musicianId),
    'Ja, verwijderen'
  );
}

async function executeRemoveMember(bandId, musicianId) {
  try {
    const { error } = await db.from('band_members').delete().eq('band_id', bandId).eq('musician_id', musicianId);
    if (error) throw error;
    showToast('Lid verwijderd.');
    loadMyBands();
    // 22-08-2026: verwijderen kan nu ook vanuit "Bandleden wijzigen" zelf —
    // die lijst moet meteen kloppen, niet pas na het sluiten en heropenen.
    if (document.getElementById('addMemberModal')?.classList.contains('visible')) {
      loadCurrentMembersForModal(bandId);
    }
  } catch (e) {
    showToast(friendlyErrorMessage(e));
  }
}

// Profielvolledigheid — alleen zichtbaar voor de eigenaar op "Mijn profiel"
// (Presentatie: profielstatus direct zichtbaar). Gebaseerd op echte opgeslagen
// data, niet op tijdelijke registratie-state.
function renderCompletenessMeter(m) {
  const col = safeColor(m.profile_color, '#f5c518');
  const checks = [
    { done: !!m.avatar_url,                    label: 'Profielfoto' },
    { done: (m.bio || '').length > 20,         label: 'Bio' },
    { done: (m.musician_instruments||[]).length > 0, label: 'Instrument' },
    { done: (m.musician_genres||[]).length > 0,      label: 'Genre' },
    { done: (m.musician_songs||[]).length >= 3,      label: '3+ nummers' },
    { done: (m.musician_media||[]).length > 0,       label: 'Media' },
  ];
  const doneCnt = checks.filter(c => c.done).length;
  const pct = Math.round((doneCnt / checks.length) * 100);

  return `
    <div id="completenessMeter" class="completeness-wrap" style="margin-top:24px;">
      <div class="completeness-header">
        <span class="completeness-label">Profiel volledigheid</span>
        <span class="completeness-pct" style="color:${col};">${pct}%</span>
      </div>
      <div class="completeness-track">
        <div class="completeness-fill" style="width:${pct}%; background:${col};"></div>
      </div>
      <div class="completeness-items">
        ${checks.map(c => `
          <span class="comp-item ${c.done ? 'done' : 'pending'}" style="${c.done ? `border-color:${col};color:${col};` : ''}">
            ${c.done ? '✓' : '○'} ${c.label}
          </span>
        `).join('')}
      </div>
      ${pct < 100 ? `<p style="font-size:11px;color:var(--muted);margin-top:8px;">Vul je profiel verder aan om meer matches te krijgen.</p>` : `<p style="font-size:11px;color:${col};margin-top:8px;font-weight:700;">Compleet profiel! Jij valt op.</p>`}
    </div>`;
}

// TT-48: voortgangspaneel als PPP-tijdlijn — Ronalds eigen indeling van
// "trots op prestaties (verleden) · nu plezier maken (heden) · ambitie voor
// de toekomst (toekomst)". Alleen zichtbaar voor de eigenaar (loadMyProfile
// is sowieso alleen de eigen-profiel-view). "Verleden" is bewust een
// placeholder tot de optredenlijst er is — geen loze content verzinnen.
function renderProgressPanel(m) {
  const songCount = (m.musician_songs || []).length;
  const heden = songCount > 0
    ? `${songCount} nummer${songCount === 1 ? '' : 's'} in je repertoire`
    : '';
  // TT-52: feit over huidig repertoire, dus bij "heden" i.p.v. "toekomst".
  const hedenRepertoire = m.repertoire_type && REPERTOIRE_TYPE_LABELS[m.repertoire_type]
    ? REPERTOIRE_TYPE_LABELS[m.repertoire_type] : '';
  const hedenExtra = m.goal && GOAL_LABELS[m.goal] ? GOAL_LABELS[m.goal] : '';
  const hedenText = [heden, hedenRepertoire, hedenExtra].filter(Boolean).join(' · ');

  const toekomstParts = [];
  if (m.rehearsal_frequency && REHEARSAL_LABELS[m.rehearsal_frequency]) toekomstParts.push(REHEARSAL_LABELS[m.rehearsal_frequency]);
  if (m.musical_ambition && AMBITION_LABELS[m.musical_ambition]) toekomstParts.push(AMBITION_LABELS[m.musical_ambition]);
  const toekomstText = toekomstParts.join(' · ');

  return `
    <div class="progress-timeline">
      <div class="progress-timeline-label">Jouw pad op The Talent Tent</div>
      <div class="progress-timeline-grid">
        <div>
          <div class="progress-stage-title">Verleden</div>
          <div class="progress-stage-body empty">Optredenlijst volgt binnenkort — dan zie je hier je opgebouwde ervaring terug.</div>
        </div>
        <div>
          <div class="progress-stage-title">Heden</div>
          <div class="progress-stage-body ${hedenText ? '' : 'empty'}">${hedenText ? escHtml(hedenText) : 'Vul je repertoire en doel aan om hier iets te zien.'}</div>
        </div>
        <div>
          <div class="progress-stage-title">Toekomst</div>
          <div class="progress-stage-body ${toekomstText ? '' : 'empty'}">${toekomstText ? escHtml(toekomstText) : 'Geef bij "Profiel bewerken" aan hoe vaak je wilt repeteren en of je wilt optreden.'}</div>
        </div>
      </div>
    </div>`;
}

// ─── Mijn bands ───────────────────────────────────────────────────────────────

async function getMyMusicianId() {
  if (myMusicianId) return myMusicianId;
  if (!currentUser) return null;
  const { data } = await db.from('musicians').select('id').eq('user_id', currentUser.id).single();
  myMusicianId = data?.id || null;
  return myMusicianId;
}

function showCreateBandForm() {
  const form = document.getElementById('createBandForm');
  const wasHidden = form.style.display === 'none' || !form.style.display;
  if (wasHidden) {
    resetBandForm();
    form.style.display = 'block';
    setTimeout(() => document.getElementById('bandName')?.focus(), 50);
  } else {
    form.style.display = 'none';
  }
  initBandForm();
}

// Zet het bandformulier terug naar lege 'nieuwe band'-staat.
// V-19 (13-08-2026, in overleg vastgesteld): "Annuleren" gooide tot nu toe
// alles weg zonder waarschuwing. Bewust smal gehouden zoals afgesproken:
// alleen deze waarschuwing, geen wizard (dat is een apart, groter ticket).
// Staat het formulier nog helemaal leeg, dan is er niets te verliezen — dan
// sluit Annuleren meteen, zonder onnodige extra klik. Zodra er iets is
// ingevuld (ook bij het bewerken van een bestaande band, waar de velden al
// gevuld zijn), volgt eerst een bevestigingsvraag.
function hasUnsavedBandFormInput() {
  const nameEl = document.getElementById('bandName');
  const zipEl = document.getElementById('bandZip');
  const descEl = document.getElementById('bandDescription');
  if ((nameEl && nameEl.value.trim()) || (zipEl && zipEl.value.trim()) || (descEl && descEl.value.trim())) return true;
  if (bandState.genres.length || bandState.wanted.length || bandState.avatarUrl || bandState.niveau) return true;
  if (document.querySelector('#bandStatusGrid .tag.selected')) return true;
  return false;
}

function cancelBandForm() {
  const finish = () => { resetBandForm(); document.getElementById('createBandForm').style.display = 'none'; };
  if (hasUnsavedBandFormInput()) {
    showConfirm('Weet je het zeker? Wat je hebt ingevuld gaat verloren.', finish, 'Ja, terug');
  } else {
    finish();
  }
}

function resetBandForm() {
  editingBandId = null;
  bandState = { genres: [], status: 'zoekend', wanted: [], color: '#3ecfff', niveau: null, avatarUrl: null, avatarPath: null };
  bandPostcodeResolved = false;
  bandPostcodeFailStreak = 0;
  bandPostcodeManualMode = false;
  bandCitySource = 'pdok';
  const nameEl = document.getElementById('bandName');
  const zipEl = document.getElementById('bandZip');
  const cityEl = document.getElementById('bandCity');
  const descEl = document.getElementById('bandDescription');
  if (nameEl) nameEl.value = '';
  if (zipEl) zipEl.value = '';
  if (cityEl) { cityEl.value = ''; cityEl.readOnly = true; cityEl.style.cursor = 'not-allowed'; cityEl.style.opacity = '0.85'; }
  if (descEl) descEl.value = '';
  const statusEl = document.getElementById('bandPostcodeStatus');
  if (statusEl) statusEl.textContent = '';
  document.querySelectorAll('#bandStatusGrid .tag').forEach(t => t.classList.remove('selected'));
  if (PICKERS.bandGenre) renderPickerBadges(PICKERS.bandGenre);
  if (PICKERS.bandWanted) renderPickerBadges(PICKERS.bandWanted);
  renderBandLevelPicker(); // TT-51: sterren terug naar leeg
  populateBandAvatarPreview(); // V-15: voorbeeld terug naar lege "??"
  const titleEl = document.getElementById('bandFormTitle');
  const btnEl = document.getElementById('saveBandBtn');
  if (titleEl) titleEl.textContent = 'Nieuwe band aanmaken';
  if (btnEl) btnEl.textContent = 'Band aanmaken';
}

// V-15 (13-08-2026): toont de bandfoto als die er is, anders de gouden T —
// zelfde vaste letter als overal elders in de app (25-08-2026, punt 3).
function populateBandAvatarPreview() {
  const preview = document.getElementById('bandAvatarPreview');
  if (!preview) return;
  if (bandState.avatarUrl) {
    preview.innerHTML = `<img src="${safeUrl(bandState.avatarUrl)}" alt="bandfoto">`;
    document.getElementById('bandAvatarRemoveBtn').classList.add('visible');
  } else {
    preview.innerHTML = `<span id="bandAvatarInitials">T</span>`;
    document.getElementById('bandAvatarRemoveBtn').classList.remove('visible');
  }
}


// Een band bestaat pas na "Band aanmaken" als bevestigd account/profiel —
// anders dan bij de muzikantwizard is er hier nooit een moment zonder
// currentUser (saveBand() vraagt zelf al een muzikantprofiel af), dus de
// foto kan altijd meteen echt geüpload worden. Bucket 'avatars' wordt
// hergebruikt (uploadAvatarFile bestaat al) — elke upload krijgt sowieso een
// unieke bestandsnaam, dus dat botst niet met profielfoto's.
function handleBandAvatarUpload(file) {
  if (!file) return;
  const typeProblem = fileTypeProblem(file, AVATAR_MIME_TYPES, AVATAR_TYPE_LABEL);
  if (typeProblem) { showToast(typeProblem); return; }
  if (file.size > 5 * 1024 * 1024) { showToast('Afbeelding is te groot. Maximum 5 MB.'); return; }
  if (!currentUser) { showToast('Log in om een bandfoto te uploaden.'); return; }

  const blobUrl = URL.createObjectURL(file);
  const preview = document.getElementById('bandAvatarPreview');
  preview.style.position = 'relative';
  preview.innerHTML = `<img src="${blobUrl}" alt="bandfoto">`;
  preview.insertAdjacentHTML('beforeend',
    `<div class="avatar-uploading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);border-radius:12px;">
       <div class="save-spinner" style="width:24px;height:24px;border-width:3px;margin:0;"></div>
     </div>`);
  document.getElementById('bandAvatarRemoveBtn').classList.add('visible');

  uploadAvatarFile(file, currentUser.id).then(({ url, path }) => {
    bandState.avatarUrl = url;
    bandState.avatarPath = path;
    preview.querySelector('.avatar-uploading')?.remove();
  }).catch(e => {
    console.error('Bandfoto-upload mislukt:', e);
    preview.querySelector('.avatar-uploading')?.remove();
    showToast(friendlyErrorMessage(e));
    removeBandAvatar();
  });
}

function removeBandAvatar() {
  bandState.avatarUrl = null;
  bandState.avatarPath = null;
  populateBandAvatarPreview();
}

// Bestaande band laden in het formulier om te bewerken (alleen voor de oprichter).
let addMemberBandId = null;
let memberSearchTimer = null;

let addMemberBandName = ''; // V-18: nodig voor de tekst in het uitnodigingsbericht

function openAddMemberModal(bandId, bandName) {
  addMemberBandId = bandId;
  addMemberBandName = bandName || '';
  document.getElementById('memberSearchInput').value = '';
  // V-17: instrumentlijst opnieuw vullen bij elke opening — zelfde bron
  // (INSTRUMENTS) als de wizard, één keer opgebouwd, dan hergebruikt.
  const instrEl = document.getElementById('memberSearchInstrument');
  if (instrEl && instrEl.options.length <= 1) {
    INSTRUMENTS.forEach(i => {
      const opt = document.createElement('option');
      opt.value = i; opt.textContent = i;
      instrEl.appendChild(opt);
    });
  }
  if (instrEl) instrEl.value = '';
  // V-17-restpunt (13-08-2026): straal terugzetten bij elke opening, net als
  // instrument en naam hierboven — anders blijft een eerder ingevulde straal
  // onopgemerkt actief bij de volgende band.
  const radiusEl = document.getElementById('memberSearchRadius');
  if (radiusEl) radiusEl.value = '';
  // TT-127-restpunt-vervolg (27-08-2026): zelfde terugzet-reden voor het
  // nieuwe Plaats-veld en zijn bevestigingsregel.
  const cityEl = document.getElementById('memberSearchCity');
  if (cityEl) cityEl.value = '';
  const cityStatusEl = document.getElementById('memberSearchCityStatus');
  if (cityStatusEl) cityStatusEl.textContent = '';
  document.getElementById('memberSearchResults').innerHTML = '<p style="color:var(--muted);font-size:13px;">Typ minimaal 2 tekens, kies een instrument, of vul een plaats in, om te zoeken.</p>';
  loadCurrentMembersForModal(bandId);
  renderFounderTransferSection(bandId);
  document.getElementById('addMemberModal').classList.add('visible');
  setTimeout(() => document.getElementById('memberSearchInput')?.focus(), 50);
}

// TT-127-restpunt (27-08-2026): samengevoegd met het vroegere losse
// ⋯-menu-item "Bandbeheer". Toont één knop, tekst hangt af van of er al een
// overnameverzoek loopt (offerPending) — zelfde onderscheid dat het oude
// ⋯-menu-item ook al maakte. askFounderTransfer()/withdrawFounderOffer()
// zelf zijn ongewijzigd; alleen waar de knop staat is anders.
async function renderFounderTransferSection(bandId) {
  const el = document.getElementById('founderTransferSection');
  if (!el) return;
  el.innerHTML = '';
  try {
    const { data, error } = await db.from('band_members')
      .select('founder_offer').eq('band_id', bandId).eq('status', 'bevestigd');
    if (error) throw error;
    const offerPending = (data || []).some(m => m.founder_offer);
    el.innerHTML = `
      <div class="divider"></div>
      <div class="filter-title" style="margin:16px 0 6px;font-size:16px;">Beheer</div>
      <button type="button" class="btn btn-ghost" style="width:100%;" onclick="${offerPending ? `withdrawFounderOffer('${jsAttr(bandId)}')` : `askFounderTransfer('${jsAttr(bandId)}')`}">${offerPending ? 'Aanbod intrekken' : 'Beheer overdragen'}</button>
      ${offerPending ? '<p style="font-size:12px;color:var(--muted);margin-top:8px;">Gevraagd of iemand het overneemt — wachten op reactie.</p>' : ''}
    `;
  } catch (e) {
    // Stil falen: dit is een secundaire sectie, de ledenlijst hierboven
    // (loadCurrentMembersForModal) blijft ook zonder dit stuk werken.
  }
}

// 22-08-2026 (Ronald): verwijderen van een bestaand lid hoort nu bij dit
// scherm, met een duidelijke knop, i.p.v. het kruisje op de bandkaart zelf
// ("banaal, alsof je ieder moment kan worden gecancelled"). Haalt de
// bevestigde leden apart op — de bandkaart geeft ze niet door, en dit
// scherm moet altijd de actuele stand tonen, ook na eerdere wijzigingen
// zonder dat de hele pagina opnieuw laadt.
async function loadCurrentMembersForModal(bandId) {
  const el = document.getElementById('currentMembersList');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--muted);font-size:13px;">Laden...</p>';
  try {
    const mid = await getMyMusicianId();
    const { data, error } = await db.from('band_members')
      .select('musician_id, role, musicians(id, fname, username, profile_color)')
      .eq('band_id', bandId).eq('status', 'bevestigd');
    if (error) throw error;
    el.innerHTML = (data || []).map(m => {
      const memberName = displayNameOf(m.musicians);
      // De oprichter zichzelf verwijderen gaat via de "Beheer"-sectie
      // hieronder (renderFounderTransferSection), niet via deze lijst —
      // vandaar geen knop bij de eigen rij.
      const isSelf = m.musician_id === mid;
      return `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div class="band-member-dot" style="background:${safeColor(m.musicians?.profile_color, '#888')};">${escHtml(memberName[0].toUpperCase())}</div>
        <div style="flex:1;font-size:14px;">${escHtml(memberName)} <span style="color:var(--muted);font-size:11px;">${escHtml(roleLabel(m.role))}</span></div>
        ${isSelf ? '' : `<button type="button" class="btn btn-ghost btn-sm" style="color:var(--danger);border-color:var(--danger);" onclick="removeMember('${jsAttr(bandId)}','${jsAttr(m.musician_id)}','${jsAttr(memberName)}')">Verwijderen</button>`}
      </div>`;
    }).join('') || '<p style="color:var(--muted);font-size:13px;">Geen leden gevonden.</p>';
  } catch (e) {
    el.innerHTML = `<p style="color:var(--danger);font-size:13px;">${escHtml(friendlyErrorMessage(e))}</p>`;
  }
}

function searchMembersToAdd(query) {
  clearTimeout(memberSearchTimer);
  const q = query.trim();
  const instrument = document.getElementById('memberSearchInstrument')?.value || '';
  // TT-163-bugfix (27-08-2026, live gemeld door Ronald): het nieuwe
  // Plaats-veld (memberSearchCity) triggerde nog geen zoekopdracht — de
  // guard hieronder kende alleen naam en instrument als startvoorwaarde,
  // dus bij alleen een getypte plaats bleef de melding "Typ minimaal 2
  // tekens..." staan en werd er nooit gezocht. Plaats telt nu ook mee.
  const cityTyped = (document.getElementById('memberSearchCity')?.value || '').trim();
  const resEl = document.getElementById('memberSearchResults');
  // TT-26: jokertekens (%, _, *) uit de zoekterm halen, anders kan een getypt
  // %-teken het ilike-patroon veel breder maken dan de gebruiker bedoelt.
  const qSafe = likeSafe(q);
  // V-17 (13-08-2026): zoeken kan nu ook zónder getypte naam, zolang er een
  // instrument gekozen is — dat was precies de klacht ("je moet al weten
  // wie je zoekt"). TT-163: of zolang er een plaats getypt is.
  if (!instrument && !cityTyped && (q.length < 2 || qSafe.length < 2)) {
    resEl.innerHTML = '<p style="color:var(--muted);font-size:13px;">Typ minimaal 2 tekens, kies een instrument, of vul een plaats in, om te zoeken.</p>';
    return;
  }
  resEl.innerHTML = '<p style="color:var(--muted);font-size:13px;">Zoeken...</p>';
  memberSearchTimer = setTimeout(async () => {
    try {
      const { data: existing } = await db.from('band_members').select('musician_id').eq('band_id', addMemberBandId);
      const existingIds = (existing||[]).map(x => x.musician_id);

      // TT-43: zoeken op voornaam óf gebruikersnaam — een oprichter kent zijn
      // toekomstige bandlid soms alleen van diens profielnaam.
      // TT-56 (12-08-2026): accepts_band_invites erbij, om de "Uitnodigen"-
      // knop hieronder te kunnen verbergen voor wie dat heeft uitgezet.
      // V-17: bij een gekozen instrument gebruiken we !inner zodat de filter
      // op musician_instruments.instrument ook echt de resultatenlijst raakt
      // (zonder !inner filtert een geneste relatie alleen de sub-rijen, niet
      // welke muzikanten worden teruggegeven).
      // TT-163-bugfix, vervolg: bij naam of instrument filtert de database
      // zelf al voor (ilike/eq), dus 15 is ruim genoeg. Zoek je alleen op
      // Plaats, dan filtert de database hier nog niets — de rijen komen in
      // willekeurige/onbepaalde volgorde binnen, en pas hierna wordt op
      // afstand gefilterd. Bij 15 zou een muzikant binnen de straal gemist
      // kunnen worden als hij toevallig niet bij de eerste 15 zit. Ruimer bij
      // een plaats-only zoekopdracht; een échte serverside geo-filter is
      // groter werk en hoort bij TT-28 (filtering/paginering naar de
      // database), niet bij deze bugfix.
      const fetchLimit = (instrument || (q.length >= 2 && qSafe.length >= 2)) ? 15 : 200;
      let qb = db.from('musicians').select(
        instrument
          ? 'id, fname, username, city, profile_color, accepts_band_invites, musician_instruments!inner(instrument)'
          : 'id, fname, username, city, profile_color, accepts_band_invites, musician_instruments(instrument)'
      ).limit(fetchLimit);
      if (instrument) qb = qb.eq('musician_instruments.instrument', instrument);
      if (q.length >= 2 && qSafe.length >= 2) qb = qb.or(`fname.ilike.%${qSafe}%,username.ilike.%${qSafe}%`);

      const { data: musicians, error } = await qb;
      if (error) throw error;

      let filtered = (musicians||[]).filter(m => !existingIds.includes(m.id));
      if (!filtered.length) {
        resEl.innerHTML = '<p style="color:var(--muted);font-size:13px;">Geen (nieuwe) muzikanten gevonden.</p>';
        return;
      }

      // V-17-restpunt (13-08-2026) + TT-163 (27-08-2026): afstand ophalen via
      // tt_musician_distances — een eigen, kleine databasefunctie die alleen
      // een getal (km) teruggeeft, nooit ruwe coördinaten van een ander
      // (B-01). Sinds TT-163 accepteert de functie ook een eigen
      // origin_lat/origin_lng: getypt in het Plaats-veld hierboven
      // (memberSearchCity), via de bestaande resolveSearchOrigin() — dat
      // zijn coördinaten van een postcode/plaatsnaam uit postcode_cache,
      // geen persoonsgegevens (dezelfde functie die runSearch() al gebruikt).
      // Leeg Plaats-veld: origin_lat/origin_lng blijven null, de functie
      // valt dan vanzelf terug op de eigen locatie van searcher_id — precies
      // het gedrag van vóór TT-163.
      const radiusVal = document.getElementById('memberSearchRadius')?.value.trim();
      const radius = radiusVal ? parseInt(radiusVal, 10) : null;
      const cityQuery = document.getElementById('memberSearchCity')?.value.trim();
      const origin = cityQuery ? await resolveSearchOrigin(cityQuery) : { lat: null, lng: null };
      try {
        const { data: distances, error: distErr } = await db.rpc('tt_musician_distances', {
          searcher_id: await getMyMusicianId(),
          musician_ids: filtered.map(m => m.id),
          origin_lat: origin.lat,
          origin_lng: origin.lng
        });
        if (!distErr && distances) {
          const distMap = {};
          distances.forEach(d => { distMap[d.musician_id] = d.distance_km; });
          filtered.forEach(m => { m.distance_km = distMap[m.id] != null ? distMap[m.id] : null; });
          if (radius) {
            filtered = filtered.filter(m => m.distance_km == null || m.distance_km <= radius);
          }
          filtered.sort((a, b) => {
            if (a.distance_km == null && b.distance_km == null) return 0;
            if (a.distance_km == null) return 1;
            if (b.distance_km == null) return -1;
            return a.distance_km - b.distance_km;
          });
        }
      } catch (distE) {
        console.error('tt_musician_distances', distE);
        // Stil falen: afstand is een verrijking, geen vereiste voor deze zoekopdracht.
      }

      if (!filtered.length) {
        resEl.innerHTML = '<p style="color:var(--muted);font-size:13px;">Geen (nieuwe) muzikanten binnen deze straal gevonden.</p>';
        return;
      }
      resEl.innerHTML = filtered.map(m => {
        const memberName = displayNameOf(m);
        // TT-56 (12-08-2026): wie accepts_band_invites heeft uitgezet, krijgt
        // hier geen "Uitnodigen"-knop. Deze tekst is alleen zichtbaar voor de
        // zoekende oprichter zelf, in dit besloten beheerscherm — geen
        // zichtbaar label op het publieke profiel van de muzikant zelf.
        // V-18 (13-08-2026): een uitnodiging kwam tot nu toe zonder woorden
        // aan — alleen een banner op Mijn Profiel, geen uitleg waarom. De
        // knop opent nu eerst een kort tekstveld i.p.v. meteen uit te nodigen.
        const inviteAction = m.accepts_band_invites === false
          ? `<span style="font-size:12px;color:var(--muted);">Niet open voor uitnodigingen</span>`
          : `<button class="btn btn-ghost btn-sm" onclick="openInviteNote(this, '${jsAttr(m.id)}', '${jsAttr(memberName)}')">Uitnodigen</button>`;
        return `
        <div class="member-search-row" style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);">
          <div style="width:32px;height:32px;border-radius:50%;background:${safeColor(m.profile_color, '#888')};display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${escHtml(memberName[0].toUpperCase())}</div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:14px;">${escHtml(memberName)}</div>
            <div style="font-size:12px;color:var(--muted);">${escHtml(m.city||'')}${m.distance_km != null ? ` · ${m.distance_km.toFixed(1)} km` : ''}${(m.musician_instruments||[]).length ? ' · ' + escHtml(m.musician_instruments.map(x=>x.instrument).slice(0,2).join(', ')) : ''}</div>
          </div>
          <span class="member-invite-action">${inviteAction}</span>
        </div>`; }).join('');
    } catch (e) {
      resEl.innerHTML = `<p style="color:var(--danger);font-size:13px;">${friendlyErrorMessage(e)}</p>`;
    }
  }, 300);
}

// TT-41 (08-08-2026): een oprichter kon iemand voorheen zonder diens medeweten
// als lid op het bandprofiel zetten. Vanaf nu ontstaat er een uitnodiging
// (status 'aangevraagd'); pas als de muzikant zelf bevestigt via de banner op
// Mijn Profiel wordt het 'bevestigd' en is het lidmaatschap zichtbaar.
// V-18 (13-08-2026): opent een kort tekstveld in de resultatenrij i.p.v.
// meteen uit te nodigen — zo kan de oprichter een reden meegeven.
function openInviteNote(btnEl, musicianId, memberName) {
  const row = btnEl.closest('.member-search-row');
  if (!row) return;
  row.innerHTML = `
    <div style="width:100%;">
      <div style="font-size:13px;margin-bottom:8px;">Uitnodiging aan <strong>${escHtml(memberName)}</strong> — voeg eventueel een korte boodschap toe:</div>
      <textarea class="invite-note-input" maxlength="300" placeholder="Bijv. we zoeken een bassist voor onze covers, jouw profiel past goed bij ons!" style="width:100%;min-height:60px;padding:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'Roboto',sans-serif;font-size:14px;"></textarea>
      <div class="btn-row" style="margin-top:8px;">
        <button class="btn btn-primary btn-sm" onclick="sendInviteWithNote(this, '${jsAttr(musicianId)}')">Uitnodiging versturen</button>
        <button class="btn btn-ghost btn-sm" onclick="searchMembersToAdd(document.getElementById('memberSearchInput').value)">Terug</button>
      </div>
    </div>`;
  row.querySelector('.invite-note-input')?.focus();
}

function sendInviteWithNote(btnEl, musicianId) {
  const row = btnEl.closest('.member-search-row');
  const note = row?.querySelector('.invite-note-input')?.value.trim() || '';
  addBandMember(musicianId, note);
}

async function addBandMember(musicianId, note) {
  try {
    // TT-56 (12-08-2026): defensieve check naast de verborgen knop hierboven
    // — zelfde patroon als de akkoord-checkbox bij registratie (TT-63): de
    // UI verbergt de knop, maar een verse controle vlak vóór het schrijven
    // voorkomt dat een verouderd scherm (bijv. een openstaand zoekresultaat
    // van vóór iemand net zijn instelling wijzigde) alsnog een uitnodiging
    // verstuurt.
    const { data: target, error: checkErr } = await db.from('musicians')
      .select('accepts_band_invites').eq('id', musicianId).single();
    if (checkErr) throw checkErr;
    if (target && target.accepts_band_invites === false) {
      showToast('Deze muzikant staat niet open voor band-uitnodigingen.');
      return;
    }

    const { error } = await db.from('band_members').insert({
      band_id: addMemberBandId, musician_id: musicianId, role: 'Lid', status: 'aangevraagd'
    });
    if (error) throw error;

    // V-18: de boodschap komt binnen als gewoon bericht, zodat de ontvanger
    // weet waarom hij gevraagd wordt — niet alleen een naam op een banner.
    const trimmedNote = (note || '').trim();
    const bandLabel = addMemberBandName ? `"${addMemberBandName}"` : 'onze band';
    const text = trimmedNote
      ? `Je bent uitgenodigd voor de band ${bandLabel}. ${trimmedNote}`
      : `Je bent uitgenodigd voor de band ${bandLabel}. Bekijk de uitnodiging op je profiel.`;
    await insertMessage(musicianId, text);

    showToast('Uitnodiging verstuurd.');
    document.getElementById('addMemberModal').classList.remove('visible');
    loadMyBands();
  } catch (e) {
    showToast(friendlyErrorMessage(e));
  }
}

async function editBand(id) {
  const { data: b, error } = await db.from('bands').select(`*, band_wanted(instrument)`).eq('id', id).single();
  if (error || !b) { showToast('Kon band niet laden.'); return; }

  editingBandId = id;
  bandState = {
    genres: [...(b.genres || [])],
    status: b.status || 'zoekend',
    wanted: (b.band_wanted || []).map(w => w.instrument),
    color: b.profile_color || '#3ecfff',
    niveau: b.niveau || null, // TT-51
    avatarUrl: b.avatar_url || null, // V-15
    avatarPath: null
  };
  bandPostcodeResolved = !!b.zip;
  bandPostcodeFailStreak = 0;
  bandPostcodeManualMode = false;
  bandCitySource = b.city_source || 'pdok';

  document.getElementById('createBandForm').style.display = 'block';
  initBandForm();

  document.getElementById('bandName').value = b.name || '';
  document.getElementById('bandZip').value = b.zip || '';
  document.getElementById('bandCity').value = b.city || '';
  document.getElementById('bandPostcodeStatus').textContent = b.city ? `Gevonden: ${b.city}` : '';
  document.getElementById('bandDescription').value = b.description || '';
  populateBandAvatarPreview(); // V-15
  // Badges voor genre/instrument staan al goed: initBandForm() (hierboven)
  // tekent ze opnieuw op basis van de zojuist ingestelde bandState.

  const statusLabelMap = { zoekend: 'Zoekend naar leden', compleet: 'Band is compleet', inactief: 'Inactief' };
  document.querySelectorAll('#bandStatusGrid .tag').forEach(t => {
    t.classList.toggle('selected', t.textContent.trim() === statusLabelMap[bandState.status]);
  });

  document.getElementById('bandFormTitle').textContent = 'Band bewerken';
  document.getElementById('saveBandBtn').textContent = 'Wijzigingen opslaan';
  document.getElementById('createBandForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function initBandForm() {
  if (!PICKERS.bandGenre) {
    initPicker({
      id: 'bandGenre',
      fieldId: 'bandGenreField', badgeRowId: 'bandGenreBadgeRow',
      options: GENRES, getList: () => bandState.genres,
      placeholder: 'Kies een genre',
      sheetTitle: 'Kies een genre'
    });
  }
  if (!PICKERS.bandWanted) {
    initPicker({
      id: 'bandWanted',
      fieldId: 'bandWantedField', badgeRowId: 'bandWantedBadgeRow',
      options: INSTRUMENTS, getList: () => bandState.wanted,
      placeholder: 'Kies een instrument',
      sheetTitle: 'Kies een instrument'
    });
  }
  // Bij hergebruik van een al bestaande picker (tweede keer dat het
  // formulier opent) staan de badges nog op de vorige band — opnieuw
  // tekenen op basis van de huidige bandState.
  renderPickerBadges(PICKERS.bandGenre);
  renderPickerBadges(PICKERS.bandWanted);
  renderBandLevelPicker();
}

// TT-51: sterrenkiezer voor het eigen niveau van de band. Los aangeroepen
// (niet alleen bij het eerste opbouwen van het formulier, zoals gg/wg
// hierboven) omdat de waarde bij elke open/reset kan veranderen.
function renderBandLevelPicker() {
  const el = document.getElementById('bandLevelPicker');
  if (!el) return;
  renderStarPicker(el, bandState.niveau || 0, (n) => {
    bandState.niveau = n;
    renderBandLevelPicker();
  });
}

// TT-51-uitbreiding (12-08-2026): Tabel 1 uit niveaubepaling-naslagwerk.md,
// 1-op-1 overgenomen. Hardcoded (geen build-stap om een .md-bestand in te
// lezen in deze losse-bestand-app) — bij een tekstwijziging in het naslagwerk
// moet deze lijst hier ook worden bijgewerkt.
const NIVEAU_INFO_BAND_HEADERS = ['Ervaring', 'Samenspel en timing', 'Podiumpresentatie', 'Techniek en geluid', 'Optredens en boekingen'];
const NIVEAU_INFO_BAND_ROWS = [
  ['1. Beginner (Startend)',
    'Iedereen speelt een beetje zijn eigen tempo. Samen stoppen of starten is echt lastig. Als er iemand fladdert, stopt het hele nummer.',
    'Iedereen staat als een standbeeld op zijn eigen vierkante meter. Ongemakkelijke stiltes tussen de nummers door het stemmen.',
    'Je oefent op kleine versterkers die snel gaan piepen. Je hebt nog geen idee hoe je jezelf goed hoort over een monitor.',
    'Geen demo of Insta-pagina. Je speelt alleen in de garage of oefenruimte voor jezelf en je ouders.'],
  ['2. Gevorderde Beginner (Garageband)',
    'Jullie spelen complete nummers van begin tot eind uit. Het ritme is oké, maar het klinkt nog als één grote muur van geluid zonder dynamiek.',
    'Er is af en toe oogcontact met het publiek. De setlist heeft een logische volgorde, maar muzikanten kijken nog veel naar hun instrument.',
    'Je bezit eigen spullen die krachtig genoeg zijn voor een klein optreden en kunt de geluidsman vertellen wat je nodig hebt.',
    'Je hebt een paar vette live-filmpjes op socials. Je regelt zelf, of via een bandcommunity je optredens in de buurt, zoals in een jongerencentrum of kroeg.'],
  ['3. Half-Gevorderd (Live-Amateur)',
    'De band klinkt strak. Jullie beheersen de onderlinge dynamiek (zachter spelen tijdens de zang). Kleine live-fouten worden direct opgevangen.',
    'Comfortabele podiumpresentatie; praatjes tussendoor lopen natuurlijk. De band heeft een duidelijke, herkenbare visuele stijl die past bij het genre.',
    'Kan zelfstandig een degelijke monitorsound afstellen; begrijpt het belang van een gecontroleerd en helder podiumvolume.',
    'Beschikt over een nette digitale perskit (EPK) en demo. De band speelt 10 tot 20 keer per jaar tegen een leuke onkostenvergoeding.'],
  ['4. Gevorderd (Semi-Pro)',
    'Extreem strakke timing; de ritmesectie (drums/bas) fungeert als een machine. De band communiceert blindelings via non-verbale cues.',
    'Professionele uitstraling; sterke frontman/vrouw met publieksregie. De show is een non-stop concept zonder dode momenten.',
    'Reist met een vaste eigen geluidstechnicus; maakt standaard gebruik van een gecentraliseerd In-Ear systeem en clicktracks.',
    'Professionele website en actieve marketing. De band boekt 20 tot 40 grote shows per jaar via vaste contracten en marktconforme uitkoopgagen.'],
  ['5. Professioneel (Top-act / Industry)',
    'Studio-kwaliteit op het podium. Perfecte muzikale synergie met absolute vrijheid voor feilloze live-improvisatie en unieke arrangementen.',
    'Volledig geregisseerde en geproduceerde show inclusief custom lichtshow en visuals; consistente top-performance onafhankelijk van zaalgrootte.',
    'Eigen high-end technische crew (FOH, monitor, systeemtechnici); reproduceerbare, merk-identieke signature sound op elk festival.',
    'Exclusieve vertegenwoordiging door professionele boekingskantoren en management; live-optredens vormen de hoofdinkomst voor alle leden.'],
];

function openBandNiveauInfoModal() {
  // V-21 + 21-08-2026: geen tekst tussen haakjes meer bij niveaunamen —
  // alleen de eerste kolom (de naam), de overige kolommen blijven ongewijzigd.
  const rowsHTML = NIVEAU_INFO_BAND_ROWS.map(r => `<tr>${r.map((c, i) => `<td>${escHtml(i === 0 ? stripParenthetical(c) : c)}</td>`).join('')}</tr>`).join('');
  document.getElementById('niveauInfoModalContent').innerHTML = `
    <div class="filter-title" style="margin-bottom:4px;">Ervaringsindeling voor bands</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">Kies de ervaring waar je het dichtst bij in de buurt zit. Zie het als een richtlijn, geen examen.</p>
    <div class="niveau-info-wrap">
      <table class="niveau-info-table">
        <thead><tr>${NIVEAU_INFO_BAND_HEADERS.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
    <div class="filter-title" style="font-size:15px;margin-bottom:8px;">Belangrijk: gebruik dit systeem als jouw kompas</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px;">Geen enkele muzikant of band past perfect in één enkel hokje, en dat is volstrekt normaal. Je kunt bijvoorbeeld technisch heel ver zijn (Ervaring 4), maar nog nooit op een podium hebben gestaan (Ervaring 1). Of je band speelt superstrak samen (Ervaring 3), maar jullie hebben je zakelijke randzaken nog niet op orde (Ervaring 2).</p>
    <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">Zie deze ervaringsbeschrijvingen dan ook puur als een praktische richtlijn, niet als een set onwrikbare wetten.</p>
    <div class="filter-title" style="font-size:15px;margin-bottom:8px;">Hoe kies je jullie ervaring?</div>
    <p style="font-size:13px;color:var(--muted);">Loop de criteria per ervaringsniveau rustig langs. Kijk niet naar waar je één losse vaardigheid hebt zitten, maar kijk naar het grotere plaatje. Kies simpelweg de ervaring waar jij of je band het dichtst bij in de buurt zit en waar je jezelf het meest in herkent. Het is geen examen, maar een hulpmiddel om te ontdekken waar je nu staat en waar je naartoe kunt groeien!</p>
  `;
  document.getElementById('niveauInfoModal').classList.add('visible');
}

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

