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
      .select('band_id, bands(name, city)')
      .eq('musician_id', musicianId).eq('status', 'aangevraagd');
    // TT-230: Supabase gooit hier niets — een mislukte vraag komt terug als
    // `error` naast lege data. Zonder deze regel viel dat samen met "geen
    // uitnodigingen" en verdween de fout spoorloos.
    if (error) { logCaught('loadBandInvites', error); return; }
    if (!data || !data.length) return;

    el.innerHTML = data.map(inv => {
      const naam = inv.bands?.name || 'Een band';
      const plaats = inv.bands?.city || '';
      return `
      <div style="border:1px solid var(--accent);border-left-width:4px;border-radius:10px;padding:16px;margin-bottom:16px;background:var(--surface2);">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px;">${escHtml(naam)} wil je als lid</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">${escHtml(plaats)}${plaats ? ' · ' : ''}Je staat pas op het bandprofiel als je dit bevestigt.</div>
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="respondToBandInvite('${jsAttr(inv.band_id)}', false)">Weigeren</button>
          <button class="btn btn-primary" onclick="respondToBandInvite('${jsAttr(inv.band_id)}', true)">Bevestigen</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    logCaught('loadBandInvites', e);
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
    logCaught('respondToBandInvite', e);
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
  // Niet blokkerend voor de banner, wel loggen (TT-230).
  try { await db.rpc('tt_expire_old_founder_offers'); }
  catch (e) { logCaught('loadFounderOffers/expire', e); }
  try {
    const { data, error } = await db.from('band_members')
      .select('band_id, bands(name, city)')
      .eq('musician_id', musicianId).eq('status', 'bevestigd').eq('founder_offer', true);
    // TT-230: zie loadBandInvites() hierboven. Ontbreekt de kolom
    // `founder_offer`, of blokkeert een RLS-regel de vraag, dan staat dat
    // vanaf nu in de console en in app_error_log.
    if (error) { logCaught('loadFounderOffers', error); return; }
    if (!data || !data.length) return;

    el.innerHTML = data.map(off => {
      const naam = off.bands?.name || 'Een band';
      return `
      <div style="border:1px solid var(--accent);border-left-width:4px;border-radius:10px;padding:16px;margin-bottom:16px;background:var(--surface2);">
        <div style="font-size:15px;font-weight:700;margin-bottom:4px;">De beheerder van ${escHtml(naam)} stopt</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:12px;">Wil jij het beheer overnemen? Zeg je nee, dan blijft de huidige beheerder voorlopig aan.</div>
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="respondToFounderOffer('${jsAttr(off.band_id)}', false)">Nee, liever niet</button>
          <button class="btn btn-primary" onclick="respondToFounderOffer('${jsAttr(off.band_id)}', true)">Ik neem het over</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    logCaught('loadFounderOffers', e);
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
      // TT-230: het resultaat werd hier niet gelezen. Mislukte de schrijfactie,
      // dan zag de gebruiker toch "Aanbod geweigerd" en bleef het aanbod staan.
      const { error } = await db.from('band_members').update({ founder_offer: false, founder_offer_at: null }).eq('band_id', bandId).eq('musician_id', mid);
      if (error) throw error;
      showToast('Aanbod geweigerd.');
    }
    loadFounderOffers(mid);
    loadMyBands();
  } catch (e) {
    logCaught('respondToFounderOffer', e);
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
    logCaught('askFounderTransfer', e);
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
    logCaught('sendFounderOffer', e);
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
    logCaught('withdrawFounderOffer', e);
    showToast(friendlyErrorMessage(e));
  }
}

// TT-312 (25-09-2026): "Gezocht", de leden en de band in één
// databasefunctie, in één transactie. Vroeger wiste de app "Gezocht" en de
// leden zonder foutcontrole, en pas daarna de band. Mislukte dat laatste,
// dan bleef een band over zonder leden en zonder beheerder. Zelfde oplossing
// als TT-281.
async function dissolveBand(bandId) {
  try {
    const { error } = await db.rpc('tt_dissolve_band', { p_band_id: bandId });
    if (error) throw error;
    showToast('Band opgeheven.');
    loadMyBands();
  } catch (e) {
    logCaught('dissolveBand', e);
    showToast('Opheffen is niet gelukt: ' + friendlyErrorMessage(e));
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
    logCaught('executeLeaveBand', e);
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
    logCaught('executeRemoveMember', e);
    showToast(friendlyErrorMessage(e));
  }
}

// ─── Mijn bands ───────────────────────────────────────────────────────────────

async function showCreateBandForm() {
  const form = document.getElementById('createBandForm');
  const wasHidden = form.style.display === 'none' || !form.style.display;
  // TT-336 (besluit Ronald, 1a): een band oprichten kan pas na de klik in de
  // mail. Wie een band opricht, is via die band te vinden. Eerst vragen, dan
  // pas het formulier: anders vult iemand alles in voor niets.
  if (wasHidden) {
    const wacht = await emailWachtOpBevestiging();
    if (wacht) { showToast(emailBevestigMelding(wacht, 'een band oprichten')); return; }
  }
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
  bandState = { genres: [], status: 'zoekend', wanted: [], niveau: null, avatarUrl: null, avatarPath: null };
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
    logCaught('uploadBandAvatar', e);
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
    logCaught('renderFounderTransferSection', e);
    // TT-230: eerder verdween deze sectie volledig bij een fout. De
    // beheerder zag dan geen knop "Beheer overdragen" en geen reden waarom.
    // De ledenlijst hierboven (loadCurrentMembersForModal) blijft werken,
    // dus alleen dit blok toont de melding.
    el.innerHTML = `
      <div class="divider"></div>
      <div class="filter-title" style="margin:16px 0 6px;font-size:16px;">Beheer</div>
      <p style="font-size:13px;color:var(--danger);">Beheer overdragen is nu niet beschikbaar. Probeer het later opnieuw.</p>
    `;
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
      .select('musician_id, role, musicians(id, fname, username)')
      .eq('band_id', bandId).eq('status', 'bevestigd');
    if (error) throw error;
    el.innerHTML = (data || []).map(m => {
      const memberName = displayNameOf(m.musicians);
      // De oprichter zichzelf verwijderen gaat via de "Beheer"-sectie
      // hieronder (renderFounderTransferSection), niet via deze lijst —
      // vandaar geen knop bij de eigen rij.
      const isSelf = m.musician_id === mid;
      return `<div class="lijst-rij" style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border);">
        <div class="band-member-dot">${escHtml(memberName[0].toUpperCase())}</div>
        <div style="flex:1;font-size:14px;">${escHtml(memberName)} <span style="color:var(--muted);font-size:11px;">${escHtml(roleLabel(m.role))}</span></div>
        ${isSelf ? '' : `<button type="button" class="btn btn-danger" onclick="removeMember('${jsAttr(bandId)}','${jsAttr(m.musician_id)}','${jsAttr(memberName)}')">Verwijderen</button>`}
      </div>`;
    }).join('') || '<p style="color:var(--muted);font-size:13px;">Geen leden gevonden.</p>';
  } catch (e) {
    logCaught('loadCurrentMembersForModal', e);
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
          ? 'id, fname, username, city, accepts_band_invites, musician_instruments!inner(instrument)'
          : 'id, fname, username, city, accepts_band_invites, musician_instruments(instrument)'
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
        logCaught('searchMembersToAdd', distE);
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
          : `<button class="btn btn-ghost" onclick="openInviteNote(this, '${jsAttr(m.id)}', '${jsAttr(memberName)}')">Uitnodigen</button>`;
        return `
        <div class="member-search-row lijst-rij" style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border);">
          <div style="width:32px;height:32px;border-radius:50%;background:var(--merk);color:var(--merk-tekst);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${escHtml(memberName[0].toUpperCase())}</div>
          <div style="flex:1;">
            <div style="font-weight:600;font-size:14px;">${escHtml(memberName)}</div>
            <div style="font-size:12px;color:var(--muted);">${escHtml(m.city||'')}${m.distance_km != null ? ` · ${m.distance_km.toFixed(1)} km` : ''}${(m.musician_instruments||[]).length ? ' · ' + escHtml(m.musician_instruments.map(x=>x.instrument).slice(0,2).join(', ')) : ''}</div>
          </div>
          <span class="member-invite-action">${inviteAction}</span>
        </div>`; }).join('');
    } catch (e) {
      logCaught('searchMembersToAdd', e);
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
        <button class="btn btn-ghost" onclick="searchMembersToAdd(document.getElementById('memberSearchInput').value)">Terug</button>
        <button class="btn btn-primary" onclick="sendInviteWithNote(this, '${jsAttr(musicianId)}')">Uitnodiging versturen</button>
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
    logCaught('addBandMember', e);
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

// ─── Band aanmaken, Mijn bands en het bandvenster ──────────────────────────────
// Verplaatst uit musicians.js (26-09-2026). Inhoud ongewijzigd.

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

    // TT-281 (23-09-2026): "Gezocht" wissen en opnieuw vullen in één
    // transactie — zelfde fout en zelfde oplossing als op de profielkant.
    // V-14: bij een complete/inactieve band kan bandState.wanted leeg zijn;
    // dan blijft er na afloop gewoon niets gezocht staan.
    const { error: wErr } = await db.rpc('tt_save_band_wanted', {
      p_band_id: bandId,
      p_instruments: bandState.wanted,
    });
    if (wErr) throw wErr;

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
    .select(`*, band_members(musician_id, role, status, founder_offer, musicians(fname, username)), band_wanted(instrument)`)
    .in('id', bandIds).order('updated_at', { ascending: false });

  const statusLabels = { zoekend: 'Zoekend', compleet: 'Compleet', inactief: 'Inactief' };
  el.innerHTML = (bands || []).map(b => {
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
        ${b.avatar_url ? `<img src="${safeUrl(b.avatar_url)}" alt="${escHtml(b.name)}" class="band-avatar" style="object-fit:cover;">` : `<div class="band-avatar">${AVATAR_T_FALLBACK}</div>`}
        <div style="flex:1;">
          <div class="band-name">${escHtml(b.name)}</div>
          <div class="band-meta">${escHtml(b.city||'')}${b.city&&b.genres?.length?' · ':''}${escHtml((b.genres||[]).slice(0,2).join(', '))}</div>
        </div>
        ${isFounder ? founderMenuHTML : `<button class="btn btn-ghost" onclick="event.stopPropagation(); leaveBand('${jsAttr(b.id)}','${jsAttr(b.name)}');">Band verlaten</button>`}
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
            <div class="band-member-dot">${escHtml(memberName[0].toUpperCase())}</div>
            ${escHtml(memberName)} <span style="color:var(--muted);font-size:10px;">${escHtml(roleLabel(m.role))}</span>
          </div>`; }).join('')}
          ${isFounder ? pending.map(m => {
            const memberName = displayNameOf(m.musicians);
            return `<div class="band-member-chip" style="opacity:.55;border-style:dashed;">
            <div class="band-member-dot">${escHtml(memberName[0].toUpperCase())}</div>
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
      .select(`*, band_members(role, status, musicians(id, fname, username, musician_instruments(instrument))), band_wanted(instrument)`)
      .eq('id', id).single();
    b = data;
  } else {
    // Zonder eigen profiel: publieke RPC (tabel zelf blijft op slot voor anon).
    const { data } = await db.rpc('tt_get_bands_public', { ids: [id] });
    const row = (data || [])[0];
    if (row) {
      b = {
        id: row.id, name: row.name, city: row.city, description: row.description, // TT-04: geen postcode voor bezoekers
        status: row.status, updated_at: row.updated_at,
        avatar_url: row.avatar_url || null, // V-15-restpunt (13-08-2026)
        genres: row.genres || [],
        niveau: row.niveau, // TT-51 (12-08-2026, RPC-restpunt gesloten)
        // TT-43: de publieke RPC levert voor leden alleen nog de
        // gebruikersnaam — de echte voornaam blijft weg bij bezoekers.
        band_members: (row.members || []).map(mem => ({ role: 'Lid', status: 'bevestigd', musicians: { username: mem.username } })),
        band_wanted: (row.wanted || []).map(i => ({ instrument: i })),
      };
    }
  }

  if (!b) { document.getElementById('bandModalContent').innerHTML = '<p style="color:var(--danger)">Kon band niet laden.</p>'; return; }

  // TT-06: een band is te melden, niet te blokkeren — blokkeren gaat over een
  // persoon, en een band is er geen. Eigen band: geen meldknop (zie hieronder
  // isOwnBand, die pas na de ledenlijst bekend is; daarom staat de aanroep
  // verderop).

  const confirmed = (b.band_members||[]).filter(m => m.status === 'bevestigd');
  const statusLabels = { zoekend: 'Zoekend naar leden', compleet: 'Band is compleet', inactief: 'Inactief' };
  const status = statusLabels[b.status] ? b.status : '';

  // V-13 (13-08-2026): tot nu toe had een bandprofiel geen enkele manier om
  // contact te leggen. Het bericht gaat naar de oprichter — dat is de enige
  // die op dit moment reageert op aanmeldingen. De oprichter wordt gezocht
  // in de al opgehaalde ledenlijst, niet via een aparte databasevraag.
  const founderMember = hasOwnProfile ? confirmed.find(m => m.role === 'Oprichter') : null;
  const isOwnBand = !!(founderMember && myMusicianId && founderMember.musicians?.id === myMusicianId);

  // TT-318 (24-09-2026): hier stond eerst een gekleurde balk van 8px met een
  // negatieve marge van 32px — die hoorde bij de oude opvulling van 32px rond
  // dit venster. Sinds de koprij (TT-268) viel hij volledig buiten beeld: niet
  // te zien, en netto 0px hoog. Nu het venster geen eigen opvulling meer heeft
  // (zelfde maten als het muzikantvenster), zou hij 16px buiten de rand
  // steken. Weggehaald. Zelfde valkuil als de gouden balk van TT-126.
  // Het ⋯-menu staat rechts naast de naam, net als bij een muzikant; op je
  // eigen band niet.
  const veiligheidPlekHTML = isOwnBand ? ''
    : '<span id="bandModalActies" class="profiel-menu-plek"></span>';
  document.getElementById('bandModalContent').innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:12px;">
      ${b.avatar_url ? `<img src="${safeUrl(b.avatar_url)}" alt="${escHtml(b.name)}" style="width:64px;height:64px;border-radius:12px;object-fit:cover;border:1px solid var(--border);margin-bottom:0;flex-shrink:0;">` : `<div class="band-avatar" style="width:64px;height:64px;border-radius:12px;font-size:26px;margin-bottom:0;flex-shrink:0;">${AVATAR_T_FALLBACK}</div>`}
      <div style="min-width:0;flex:1;">
        <div class="profile-name">${escHtml(b.name)}${bandStarDisplayHTML(b)}</div>
        <div class="profile-meta" style="margin-bottom:0;">${escHtml(b.city||'')}${b.city&&b.genres?.length?' · ':''}${escHtml((b.genres||[]).join(', '))}</div>
      </div>
      ${veiligheidPlekHTML}
    </div>
    <div style="margin:8px 0;"><span class="band-status-badge band-status-${status}">${escHtml(statusLabels[status] || b.status)}</span></div>
    ${b.description ? `<p style="font-size:13px;color:var(--muted);margin:12px 0;font-style:italic;">"${escHtml(b.description)}"</p>` : ''}
    <div class="profile-songs-title" style="margin-top:16px;">Leden (${confirmed.length})</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
      ${confirmed.map(m => {
        const memberName = displayNameOf(m.musicians);
        return `<div class="band-member-chip">
        <div class="band-member-dot">${escHtml(memberName[0].toUpperCase())}</div>
        <span><strong>${escHtml(memberName)}</strong> · ${escHtml(roleLabel(m.role))}</span>
      </div>`; }).join('')}
    </div>
    ${(b.band_wanted||[]).length ? `
      <div class="profile-songs-title" style="margin-top:16px;">Wij zoeken nog</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;">
        ${(b.band_wanted||[]).map(w => `<span class="tag-solid">${escHtml(w.instrument)}</span>`).join('')}
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
  // TT-293: zelfde reden, voor het woordmerk in de koprij van deze modal.
  fitKopLogo(document.getElementById('bandModalBox'));
  // TT-06: je eigen band meld je niet. Het menu staat naast de bandnaam (TT-318).
  zetVeiligheidMenu('bandModalActies', 'band', isOwnBand ? null : b.id, b.name);
}
