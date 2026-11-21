















let bandInvitesVolgnr = 0;
async function loadBandInvites(musicianId) {
  const el = document.getElementById('bandInvitesBanner');
  if (!el) return;
  if (el.dataset.mid !== String(musicianId)) { el.innerHTML = ''; el.dataset.mid = String(musicianId); }
  const volgnr = ++bandInvitesVolgnr;
  try {




    const verval = (async () => {
      try {
        const { error } = await db.rpc('tt_expire_old_founder_offers');
        if (error) logCaught('loadBandInvites/expire', error);
      } catch (e) { logCaught('loadBandInvites/expire', e); }
    })();
    const [{ data, error }] = await Promise.all([db.from('band_members')
      .select('band_id, bands(name, city)')
      .eq('musician_id', musicianId).eq('status', 'aangevraagd'), verval]);



    if (error) { logCaught('loadBandInvites', error); return; }
    const verzoeken = await founderOffersVoorMij(musicianId);
    if (!verzoeken) return;
    if (volgnr !== bandInvitesVolgnr || el.dataset.mid !== String(musicianId)) return;
    if (!(data && data.length) && !verzoeken.length) { el.innerHTML = ''; return; }

    el.innerHTML = (data || []).map(inv => {
      const naam = inv.bands?.name || 'Een band';
      const plaats = inv.bands?.city || '';
      return `
      <div class="melding">
        <p class="melding-kop">${escHtml(naam)} wil je als lid</p>
        <p class="melding-tekst">${escHtml(plaats)}${plaats ? ' · ' : ''}Je staat pas op het bandprofiel als je dit bevestigt.</p>
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="respondToBandInvite('${jsAttr(inv.band_id)}', false)">Weigeren</button>
          <button class="btn btn-primary" onclick="respondToBandInvite('${jsAttr(inv.band_id)}', true)">Bevestigen</button>
        </div>
      </div>`;
    }).join('') + verzoeken.map(v => `
      <div class="melding">
        <p class="melding-kop">${escHtml(v.beheerder)} vraagt of jij ${escHtml(v.naam)} overneemt</p>
        <p class="melding-tekst">Je wordt dan beheerder. ${escHtml(v.beheerder)} blijft lid van de band.</p>
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="respondToFounderOffer('${jsAttr(v.id)}', false)">Nee, liever niet</button>
          <button class="btn btn-primary" onclick="respondToFounderOffer('${jsAttr(v.id)}', true)">Ik neem het over</button>
        </div>
      </div>`).join('');
  } catch (e) {
    logCaught('loadBandInvites', e);


  }
}

async function respondToBandInvite(bandId, accept) {
  const mid = await getMyMusicianId();
  if (!mid) return;
  if (accept && await bandsVol(mid)) return;
  try {
    const { error } = rijenGeraakt(await db.from('band_members')
      .update({ status: accept ? 'bevestigd' : 'geweigerd' })
      .eq('band_id', bandId).eq('musician_id', mid).select('band_id'));
    if (error) throw error;
    showToast(accept ? 'Je staat nu als lid op het bandprofiel.' : 'Uitnodiging geweigerd.');
    loadBandInvites(mid);
    if (accept) profielBandsVerversen();


    const band = await bandNaamEnBeheerder(bandId);
    if (band) stilBericht(band.beheerder, accept
      ? `Ja, ik doe mee met ${band.naam}!`
      : `Bedankt voor de uitnodiging, maar ik doe niet mee met ${band.naam}.`);
  } catch (e) {
    logCaught('respondToBandInvite', e);
    showToast(friendlyErrorMessage(e, 'je antwoord op de uitnodiging versturen'));
  }
}




async function founderOffersVoorMij(mid) {
  try {
    const { data: rijen, error } = await db.from('band_members').select('band_id')
      .eq('musician_id', mid).eq('status', 'bevestigd').eq('founder_offer', true);
    if (error) throw error;
    if (!rijen || !rijen.length) return [];
    const { data: bands, error: bandFout } = await db.from('bands')
      .select('id, name, founder_id, band_members(musician_id, musicians(weergavenaam, username))')
      .in('id', rijen.map(r => r.band_id));
    if (bandFout) throw bandFout;
    return (bands || []).map(b => {
      const beheerder = (b.band_members || []).find(m => m.musician_id === b.founder_id);
      return { id: b.id, naam: b.name || '', beheerder: (beheerder && beheerder.musicians ? displayNameOf(beheerder.musicians) : '') || 'De beheerder' };
    });
  } catch (e) {
    logCaught('founderOffersVoorMij', e);
    return null;
  }
}

async function respondToFounderOffer(bandId, accept) {
  const mid = await getMyMusicianId();
  if (!mid) return;


  const band = await bandNaamEnBeheerder(bandId);
  try {
    if (accept) {







      const { error } = await db.rpc('tt_accept_founder_offer', { p_band_id: bandId });
      if (error) throw error;
      showToast('Je bent nu beheerder van deze band.');
    } else {


      const { error } = rijenGeraakt(await db.from('band_members').update({ founder_offer: false, founder_offer_at: null }).eq('band_id', bandId).eq('musician_id', mid).select('band_id'));
      if (error) throw error;
      showToast('Aanbod geweigerd.');
    }
    if (band) stilBericht(band.beheerder, accept
      ? `Ik neem het beheer van ${band.naam} over.`
      : `Ik neem het beheer van ${band.naam} niet over. Bedankt voor de vraag!`);
    loadBandInvites(mid);
    mijnBandsVerversen();
    if (accept) profielBandsVerversen();
  } catch (e) {
    logCaught('respondToFounderOffer', e);
    showToast(friendlyErrorMessage(e, 'je antwoord op het oprichtersaanbod versturen'));
  }
}





async function bandNaamEnBeheerder(bandId) {
  try {
    const { data, error } = await db.from('bands').select('name, founder_id').eq('id', bandId).maybeSingle();
    if (error) throw error;
    return data ? { naam: data.name || '', beheerder: data.founder_id || null } : null;
  } catch (e) {
    logCaught('bandNaamEnBeheerder', e);
    return null;
  }
}





async function openOverdragen() {
  const bandId = bewerkBandId;
  if (!bandId) return;
  const lijst = document.getElementById('overdragenLijst');
  try {
    const mid = await getMyMusicianId();
    const { data: band, error } = await db.from('bands')
      .select('name, band_members(musician_id, status, rollen, musicians(id, weergavenaam, username, avatar_url))').eq('id', bandId).single();
    if (error || !band) throw error || new Error('Band niet gevonden.');
    const anderen = (band.band_members || []).filter(m => m.status === 'bevestigd' && m.musician_id !== mid && m.musicians)
      .map(m => ({ id: m.musician_id, naam: displayNameOf(m.musicians), avatar_url: m.musicians.avatar_url || null, rollen: m.rollen || [] }))
      .sort((x, y) => x.naam.localeCompare(y.naam, 'nl'));
    if (!anderen.length) { renderBandBeheer(); return; }
    document.getElementById('overdragenTekst').textContent =
      `Wie neemt ${band.name} over? Zolang niemand heeft geaccepteerd, blijf jij de beheerder.`;
    lijst.innerHTML = anderen.map(l =>
      `<button type="button" class="bb-rij bb-rij-knop" onclick="sendFounderOffer('${jsAttr(bandId)}','${jsAttr(l.id)}','${jsAttr(l.naam)}')">${bbFotoHTML(l.avatar_url)}<span class="bb-tekst"><span class="bb-naam">${escHtml(l.naam)}</span><span class="bb-sub">${escHtml(l.rollen.join(' · ') || 'Lid')}</span></span></button>`
    ).join('');
    document.getElementById('overdragenModal').classList.add('visible');
  } catch (e) {
    logCaught('openOverdragen', e);
    showToast(friendlyErrorMessage(e, 'de leden van de band laden'));
  }
}
function sluitOverdragen() {
  document.getElementById('overdragenModal').classList.remove('visible');
}

async function sendFounderOffer(bandId, memberId, naam) {
  try {


    const { error } = rijenGeraakt(await db.from('band_members').update({ founder_offer: true, founder_offer_at: new Date().toISOString() }).eq('band_id', bandId).eq('musician_id', memberId).select('band_id'));
    if (error) throw error;
    sluitOverdragen();
    showToast(naam ? `Gevraagd aan ${naam}.` : 'Gevraagd.');
    const band = await bandNaamEnBeheerder(bandId);
    if (band) stilBericht(memberId, `Wil jij het beheer van ${band.naam} overnemen?`);
    mijnBandsVerversen();
    if (bewerkBandId === bandId) renderBandBeheer();
  } catch (e) {
    logCaught('sendFounderOffer', e);
    showToast(friendlyErrorMessage(e, 'het oprichtersaanbod versturen'));
  }
}



function vraagOverdragenIntrekken(bandId, naam) {
  showConfirm(
    `Je vraag aan ${naam} over het beheer van ${bewerkBandNaam || 'de band'} vervalt dan.`,
    () => withdrawFounderOffer(bandId),
    'Vraag intrekken', false
  );
}

async function withdrawFounderOffer(bandId) {
  try {
    const { data: gevraagd } = await db.from('band_members').select('musician_id').eq('band_id', bandId).eq('founder_offer', true);
    const { error } = rijenGeraakt(await db.from('band_members').update({ founder_offer: false, founder_offer_at: null }).eq('band_id', bandId).select('band_id'));
    if (error) throw error;
    showToast('Vraag ingetrokken.');
    const band = await bandNaamEnBeheerder(bandId);
    if (band) (gevraagd || []).forEach(g => stilBericht(g.musician_id, `Ik trek mijn vraag over het beheer van ${band.naam} in.`));
    mijnBandsVerversen();
    if (bewerkBandId === bandId) renderBandBeheer();
  } catch (e) {
    logCaught('withdrawFounderOffer', e);
    showToast(friendlyErrorMessage(e, 'het oprichtersaanbod intrekken'));
  }
}









const tekstBandVerwijderd = naam => `Het profiel van ${naam} is verwijderd. De band bestaat niet meer in deze app.`;
const tekstBeheerOvergedragen = naam => `Je bent nu beheerder van ${naam}.`;

async function dissolveBand(bandId) {
  const band = await bandNaamEnBeheerder(bandId);
  let leden = [];
  try {
    const mid = await getMyMusicianId();
    const { data } = await db.from('band_members').select('musician_id').eq('band_id', bandId).eq('status', 'bevestigd');
    leden = (data || []).map(m => m.musician_id).filter(id => id && id !== mid);
  } catch (e) { logCaught('dissolveBand/leden', e); }
  try {
    const { error } = await db.rpc('tt_dissolve_band', { p_band_id: bandId });
    if (error) throw error;
    const naam = band ? band.naam : '';
    let verstuurd = 0;
    if (naam) {
      const uitslagen = await Promise.all(leden.map(id => stilBericht(id, tekstBandVerwijderd(naam))));
      verstuurd = uitslagen.filter(Boolean).length;
    }
    showToast((naam ? `Het profiel van ${naam} is verwijderd.` : 'Het bandprofiel is verwijderd.')
      + (leden.length && verstuurd === leden.length ? ' De leden hebben een bericht gekregen.' : ''));


    if (bewerkBandId === bandId) { showView('bands'); return; }
    mijnBandsVerversen();
  } catch (e) {
    logCaught('dissolveBand', e);
    showToast(friendlyErrorMessage(e, 'het bandprofiel verwijderen'));
  }
}





function leaveBand(bandId, bandName) {
  showConfirm(
    `Je staat dan niet meer in de bezetting van ${bandName}.`,
    () => executeLeaveBand(bandId),
    'Band verlaten'
  );
}





function profielBandsVerversen() {
  if (document.getElementById('view-myprofile')?.classList.contains('active')) loadMyProfile();
}

async function executeLeaveBand(bandId) {
  const mid = await getMyMusicianId();
  if (!mid) return;
  try {


    const { data, error } = await db.from('band_members').delete().eq('band_id', bandId).eq('musician_id', mid).select('musician_id');
    if (error) throw error;
    if (!data || !data.length) throw eigenFout('Je staat niet meer bij deze band, of je mag hem niet verlaten. Je bandenlijst is ververst.');
    showToast('Je hebt de band verlaten.');


    if (huidigeView === 'profiel' && huidigBandId === bandId) laadBandScherm(bandId);
    mijnBandsVerversen();
    profielBandsVerversen();
  } catch (e) {
    logCaught('executeLeaveBand', e);
    if (e && e.eigenTekst) mijnBandsVerversen();
    showToast(friendlyErrorMessage(e, 'de band verlaten'));
  }
}







function removeMember(bandId, musicianId, memberName, bandName) {
  showConfirm(
    `${memberName} staat dan niet meer in de bezetting van ${bandName}.`,
    () => executeRemoveMember(bandId, musicianId, memberName, bandName),
    'Uit de band'
  );
}

async function executeRemoveMember(bandId, musicianId, memberName, bandName) {
  try {
    const { error } = rijenGeraakt(await db.from('band_members').delete().eq('band_id', bandId).eq('musician_id', musicianId).select('band_id'));
    if (error) throw error;
    showToast(`${memberName} is uit de band.`);

    if (bandName) stilBericht(musicianId, `Je staat niet meer in de bezetting van ${bandName}. Bedankt voor het meespelen.`);
    mijnBandsVerversen();

    if (bewerkBandId === bandId) bbLaadLeden();
  } catch (e) {
    logCaught('executeRemoveMember', e);
    showToast(friendlyErrorMessage(e, 'het lid verwijderen'));
  }
}












let bandState = { genres: [] };

function bandWizardOpen() {
  const form = document.getElementById('createBandForm');
  return !!form && form.style.display === 'block';
}

function zetBandWizardZichtbaar(aan) {
  document.getElementById('createBandForm').style.display = aan ? 'block' : 'none';
  document.getElementById('mijnBandsKop').style.display = aan ? 'none' : 'grid';
  document.getElementById('myBandsList').style.display = aan ? 'none' : '';
}

async function showCreateBandForm() {
  if (bandWizardOpen()) return;



  const wacht = await emailWachtOpBevestiging();
  if (wacht) { showToast(emailBevestigMelding(wacht, 'een band oprichten')); return; }
  const mid = await getMyMusicianId();
  if (!mid) { geenProfielMelding('Maak eerst een muzikantprofiel aan.'); return; }
  if (await bandsVol(mid)) return;
  resetBandForm();
  zetBandWizardZichtbaar(true);
  window.scrollTo(0, 0);
  werkTerugKnopBij();
  initBandForm();
  setTimeout(() => document.getElementById('bandName')?.focus(), 50);
}



function sluitBandWizard(daarna) {
  resetBandForm();
  zetBandWizardZichtbaar(false);
  werkTerugKnopBij();
  if (daarna) daarna();
}


function hasUnsavedBandFormInput() {
  const nameEl = document.getElementById('bandName');
  const zipEl = document.getElementById('bandZip');
  return !!((nameEl && nameEl.value.trim()) || (zipEl && zipEl.value.trim()) || bandState.genres.length);
}

function resetBandForm() {
  bandState = { genres: [] };
  bandPostcodeResolved = false;
  bandPostcodeFailStreak = 0;
  bandPostcodeManualMode = false;
  bandCitySource = 'cache';
  const nameEl = document.getElementById('bandName');
  const zipEl = document.getElementById('bandZip');
  const cityEl = document.getElementById('bandCity');
  if (nameEl) nameEl.value = '';
  if (zipEl) zipEl.value = '';
  if (cityEl) { cityEl.value = ''; cityEl.readOnly = true; cityEl.style.cursor = 'not-allowed'; }
  const statusEl = document.getElementById('bandPostcodeStatus');
  if (statusEl) statusEl.textContent = '';
  clearFieldErrors('createBandForm');
  if (PICKERS.bandGenre) renderPickerBadges(PICKERS.bandGenre);

  bandPostcodeDoel = 'band';
}












async function addBandMember(band, musicianId, note, rollen) {
  try {








    const { data: target, error: checkErr } = await db.from('musicians')
      .select('stand').eq('id', musicianId).single();
    if (checkErr) throw checkErr;
    if (target && target.stand && target.stand !== 'actief') {
      showToast('Deze muzikant is niet beschikbaar.');
      return false;
    }

    const { error } = await db.from('band_members').insert({
      band_id: band.id, musician_id: musicianId, role: 'Lid', status: 'aangevraagd', rollen: rollen || []
    });
    if (error) throw error;



    const trimmedNote = (note || '').trim();
    const bandLabel = band.naam ? `"${band.naam}"` : 'onze band';
    const text = trimmedNote
      ? `Je bent uitgenodigd voor de band ${bandLabel}. ${trimmedNote}`
      : `Je bent uitgenodigd voor de band ${bandLabel}. Bekijk de uitnodiging op je profiel.`;
    const berichtVerstuurd = await insertMessage(musicianId, text);



    showToast(berichtVerstuurd
      ? 'Uitnodiging verstuurd.'
      : 'De uitnodiging staat in de lijst, maar het bericht erbij kwam niet aan. De muzikant ziet de uitnodiging wel op zijn profiel.');
    mijnBandsVerversen();

    if (bewerkBandId === band.id) bbLaadLeden();
    return true;
  } catch (e) {
    logCaught('addBandMember', e);
    showToast(friendlyErrorMessage(e, 'het lid uitnodigen'));
    return false;
  }
}

function initBandForm() {
  if (!PICKERS.bandGenre) {
    initPicker({
      id: 'bandGenre',
      fieldId: 'bandGenreField', badgeRowId: 'bandGenreBadgeRow',
      options: GENRES, getList: () => bandState.genres,
      placeholder: 'Kies een genre',
      toevoegen: 'Genre'
    });
  }



  renderPickerBadges(PICKERS.bandGenre);
}





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


  const rowsHTML = NIVEAU_INFO_BAND_ROWS.map(r => `<tr>${r.map((c, i) => `<td>${escHtml(i === 0 ? stripParenthetical(c) : c)}</td>`).join('')}</tr>`).join('');
  document.getElementById('niveauInfoModalContent').innerHTML = `
    <div class="filter-title" style="margin-bottom:4px;">Ervaringsindeling voor bands</div>
    <p style="font-size:12px;line-height:var(--regel-12);color:var(--muted);margin-bottom:16px;">Kies de ervaring waar je het dichtst bij in de buurt zit. Zie het als een richtlijn, geen examen.</p>
    <div class="niveau-info-wrap">
      <table class="niveau-info-table">
        <thead><tr>${NIVEAU_INFO_BAND_HEADERS.map(h => `<th>${escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${rowsHTML}</tbody>
      </table>
    </div>
    <div class="filter-title" style="font-size:15px;line-height:var(--regel-15);margin-bottom:8px;">Belangrijk: gebruik dit systeem als jouw kompas</div>
    <p style="font-size:12px;line-height:var(--regel-12);color:var(--muted);margin-bottom:12px;">Geen enkele muzikant of band past perfect in één enkel hokje, en dat is volstrekt normaal. Je kunt bijvoorbeeld technisch heel ver zijn (Ervaring 4), maar nog nooit op een podium hebben gestaan (Ervaring 1). Of je band speelt superstrak samen (Ervaring 3), maar jullie hebben je zakelijke randzaken nog niet op orde (Ervaring 2).</p>
    <p style="font-size:12px;line-height:var(--regel-12);color:var(--muted);margin-bottom:16px;">Zie deze ervaringsbeschrijvingen dan ook puur als een praktische richtlijn, niet als een set onwrikbare wetten.</p>
    <div class="filter-title" style="font-size:15px;line-height:var(--regel-15);margin-bottom:8px;">Hoe kies je jullie ervaring?</div>
    <p style="font-size:12px;line-height:var(--regel-12);color:var(--muted);">Loop de criteria per ervaringsniveau rustig langs. Kijk niet naar waar je één losse vaardigheid hebt zitten, maar kijk naar het grotere plaatje. Kies simpelweg de ervaring waar jij of je band het dichtst bij in de buurt zit en waar je jezelf het meest in herkent. Het is geen examen, maar een hulpmiddel om te ontdekken waar je nu staat en waar je naartoe kunt groeien!</p>
  `;
  document.getElementById('niveauInfoModal').classList.add('visible');
}










let bandSaveBusy = false;








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






  clearFieldErrors('view-bands');
  const fouten = [];
  if (!name) fouten.push(['bandName', 'Vul een bandnaam in']);
  if (!zip || !bandPostcodeResolved || !city) {
    fouten.push(['bandZip', 'Vul een geldige postcode in. De plaats wordt dan automatisch ingevuld']);
  }
  if (!bandState.genres.length) fouten.push(['bandGenreField', 'Kies minimaal één genre']);
  if (showFieldErrors(fouten)) return;

  const mid = await getMyMusicianId();

  if (!mid) { geenProfielMelding('Maak eerst een muzikantprofiel aan.'); return; }







  showSaving('Band aanmaken...', 'Heel even geduld, dit duurt maar een paar seconden.');

  try {









    const { data: band, error: bErr } = await db.from('bands').insert({
      name, city: normalizeCityName(city), zip,
      genres: bandState.genres,
      status: bandStatusAfgeleid(0), founder_id: mid, city_source: bandCitySource,
    }).select('id').single();
    if (bErr) throw bErr;
    const bandId = band.id;
    const { error: mErr } = await db.from('band_members').insert({ band_id: bandId, musician_id: mid, role: 'Oprichter', status: 'bevestigd' });
    if (mErr) {



      const { error: wegErr } = await db.rpc('tt_dissolve_band', { p_band_id: bandId });
      if (wegErr) logCaught('saveBand-opruimen', wegErr);
      throw mErr;
    }

    mijnBandsVerversen();
    hideSaving();




    sluitBandWizard(() => {
      openBandScherm(bandId);
      showToast(`${name} staat. Vul hem aan wanneer je wilt.`);
    });
  } catch(e) {
    hideSaving();
    logCaught('saveBand', e);
    showToast(friendlyErrorMessage(e, 'de band opslaan'));
  }
}






function mijnBandsVerversen() {
  if (huidigeView === 'bands') loadMyBands({ behoud: true });
}

async function loadMyBands(opties) {
  const el = document.getElementById('myBandsList');
  if (!el) return;

  if (!(opties && opties.behoud && currentUser && el.dataset.klaar === currentUser.id)) {
    delete el.dataset.klaar;
    el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:32px;">Laden...</div>';
  }






  const verval = (async () => {
    try {
      const { error } = await db.rpc('tt_expire_old_founder_offers');
      if (error) logCaught('loadMyBands/expire', error);
    } catch (e) { logCaught('loadMyBands/expire', e); }
  })();

  const mid = await getMyMusicianId();
  if (!mid && myMusicianIdFout) {
    el.innerHTML = foutStaatHTML(myMusicianIdFout, 'je bands laden', 'loadMyBands()');
    return;
  }
  if (!mid) {

    el.innerHTML = emptyStateHTML(
      'Nog geen profiel',
      'Maak je muzikantprofiel aan om een band te kunnen oprichten.',
      'Profiel aanmaken',
      "showView('register')"
    );
    return;
  }

  const [{ data: memberships, error: lidFout }] = await Promise.all([
    db.from('band_members').select('band_id').eq('musician_id', mid).eq('status', 'bevestigd'), verval]);
  if (lidFout) {
    logCaught('loadMyBands/leden', lidFout);
    el.innerHTML = foutStaatHTML(lidFout, 'je bands laden', 'loadMyBands()');
    return;
  }
  if (!memberships?.length) {


    el.innerHTML = emptyStateHTML(
      'Nog geen bands',
      'Richt je eigen band op, of wacht tot iemand je uitnodigt.',
      'Band aanmaken',
      'showCreateBandForm()'
    );
    return;
  }

  const bandIds = memberships.map(m => m.band_id);
  const { data: bands, error: bandFout } = await db.from('bands')
    .select(`*, band_members(musician_id, role, status, founder_offer, musicians(weergavenaam, username)), band_wanted(instrument)`)
    .in('id', bandIds).order('updated_at', { ascending: false });
  if (bandFout) {
    logCaught('loadMyBands/bands', bandFout);
    el.innerHTML = foutStaatHTML(bandFout, 'je bands laden', 'loadMyBands()');
    return;
  }







  el.innerHTML = (bands || []).map(b => {
    const confirmed = (b.band_members||[]).filter(m => m.status === 'bevestigd');
    const isFounder = b.founder_id === mid;


    const offerPending = isFounder && confirmed.some(m => m.founder_offer);
    const open = (b.band_wanted || []).map(w => w.instrument);


    const naamVan = m => (m && m.musicians ? displayNameOf(m.musicians) : '');
    const gevraagdAan = confirmed.filter(m => m.founder_offer).map(naamVan).filter(Boolean);
    const zoekt = open.length
      ? `<div class="profiel-knoppen"><span class="zoek-kaart-zoekt">Zoekt ${escHtml(instrumentInZin(open[0]))}</span></div>` : '';
    return `<div class="mijn-band">
      <div class="band-hoes">${profielHoesHTML({
        foto: safeUrl(b.avatar_url), wazig: null, naam: b.name, media: [], naamMax: 28,
        tik: `openBandScherm('${jsAttr(b.id)}')`,
        regels: `<div class="profile-meta">${escHtml(b.city || '')}</div>`, knoppen: zoekt
      })}</div>
      ${offerPending ? `<p class="mijn-band-wacht">${gevraagdAan.length ? `Gevraagd aan ${escHtml(opsommingNL(gevraagdAan))}` : 'Gevraagd'} · wacht op antwoord</p>` : ''}
    </div>`;
  }).join('');


  hoesStarten(el);
  el.querySelectorAll('.band-hoes .hoes').forEach(hoes => {
    const pil = hoes.querySelector('.zoek-kaart-zoekt');
    if (pil) hoes.style.setProperty('--hoes-tekst-rechts', (pil.offsetWidth + 24) + 'px');
  });
  fitProfileName(el);
  if (currentUser) el.dataset.klaar = currentUser.id;
}















const BAND_SOORT_LABELS = { eigen: 'Eigen nummers', covers: 'Coverband', beide: 'Eigen nummers en covers' };







const BAND_SOCIALS = [
  { veld: 'instagram', naam: 'Instagram', basis: 'https://www.instagram.com/',
    svg: '<svg viewBox="-3 -3 30 30" fill="currentColor" aria-hidden="true"><path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077"></path></svg>' },
  { veld: 'tiktok', naam: 'TikTok', basis: 'https://www.tiktok.com/@',
    svg: '<svg viewBox="-3 -3 30 30" fill="currentColor" aria-hidden="true"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"></path></svg>' },
  { veld: 'youtube', naam: 'YouTube', basis: 'https://www.youtube.com/@',
    svg: '<svg viewBox="-3 -3 30 30" fill="currentColor" aria-hidden="true"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"></path></svg>' }
];

function bandSocialLink(soc, waarde) {
  const w = String(waarde || '').trim();
  if (!w) return null;
  if (/^https?:\/\//i.test(w)) return safeUrl(w);
  const naam = w.replace(/^@/, '').replace(/\/+$/, '');
  if (!/^[A-Za-z0-9._-]{1,60}$/.test(naam)) return null;
  return soc.basis + naam;
}





async function bandUitTabellen(id) {
  const { data: b, error } = await db.from('bands')
    .select(`*, band_members(role, rollen, status, joined_at, founder_offer, musicians(id, weergavenaam, username, avatar_url)), band_wanted(instrument), band_media(media_type, url, platform, in_banner, created_at, uitsnede), band_nummers(titel, url, platform, created_at), band_covers(song_title, song_artist), band_invallers(instrument, created_at)`)
    .eq('id', id).maybeSingle();
  if (error) throw error;
  if (!b) return null;
  const naarLid = m => ({
    id: m.musicians.id, naam: displayNameOf(m.musicians), avatar_url: m.musicians.avatar_url || null,
    rollen: m.rollen || [], rol: m.role, founderOffer: !!m.founder_offer
  });
  const leden = (b.band_members || [])
    .filter(m => m.status === 'bevestigd' && m.musicians)
    .sort((x, y) => String(x.joined_at || '').localeCompare(String(y.joined_at || '')))
    .map(naarLid);


  const uitgenodigd = (b.band_members || []).filter(m => m.status === 'aangevraagd' && m.musicians).map(naarLid);
  const beheerder = leden.find(l => l.rol === 'Oprichter');
  const beheerderId = b.founder_id || (beheerder ? beheerder.id : null);
  return {
    id: b.id, name: b.name, city: b.city, description: b.description, niveau: b.niveau,
    avatar_url: b.avatar_url || null, genres: b.genres || [], soort: b.soort || null, stand: bandStandVan(b),
    instagram: b.instagram, tiktok: b.tiktok, youtube: b.youtube, afgeschermd: false,
    leden, uitgenodigd, beheerderId,
    contact: leden.find(l => l.id === b.contact_id) || leden.find(l => l.id === beheerderId) || null,
    wanted: (b.band_wanted || []).map(w => w.instrument),
    invallers: (b.band_invallers || []).slice()
      .sort((x, y) => String(x.created_at || '').localeCompare(String(y.created_at || ''))),
    media: opVolgordeVanToevoegen(b.band_media),
    nummers: opVolgordeVanToevoegen(b.band_nummers),
    covers: b.band_covers || []
  };
}



async function bandUitPubliek(id) {
  const { data, error } = await db.rpc('tt_get_bands_public', { ids: [id] });
  if (error) throw error;
  const row = (data || [])[0];
  if (!row) return null;
  const ledenRijen = (row.members || []).map(m => ({ id: m.id || null, username: m.username }));
  await weergavenamenToevoegen(ledenRijen.filter(l => l.id));

  const leden = (row.members || []).map((m, i) => ({
    id: m.id || null, naam: displayNameOf(ledenRijen[i]), avatar_url: m.avatar_url || null,
    rollen: m.instruments || [], rol: m.role || 'Lid'
  }));
  return {
    id: row.id, name: row.name, city: row.city, description: row.description, niveau: row.niveau,
    avatar_url: row.avatar_url || null, genres: row.genres || [], soort: row.soort || null, stand: bandStandVan(row),
    instagram: row.instagram, tiktok: row.tiktok, youtube: row.youtube, afgeschermd: !!row.afgeschermd,
    leden, uitgenodigd: [], beheerderId: null,
    contact: leden.find(l => l.id && l.id === row.contact_id) || null,
    wanted: row.wanted || [], invallers: row.invallers || [],
    media: row.media || [], nummers: row.nummers || [], covers: row.covers || []
  };
}








function bezettingRijen(leden) {
  return [...leden].sort((x, y) => x.naam.localeCompare(y.naam, 'nl'))
    .map(l => [l, rollenRegel([...l.rollen].sort((x, y) => x.localeCompare(y, 'nl')), l.rol === 'Oprichter')]);
}



function rollenRegel(rollen, beheerder) {
  const r = rollen.concat(beheerder ? [roleLabel('Oprichter')] : []);
  return r.length ? r.join(' · ') : roleLabel('Lid');
}






function bezettingLidHTML(l, rol, uitgenodigd) {
  const sub = uitgenodigd ? `${rol} · uitgenodigd` : rol;
  const inhoud = `${bbFotoHTML(l.avatar_url, uitgenodigd)}<span class="bb-tekst"><span class="bb-naam">${escHtml(l.naam)}</span><span class="bb-sub">${escHtml(sub)}</span></span>`;
  const klas = 'bb-rij bezetting-lid' + (uitgenodigd ? ' bezetting-uitgenodigd' : '');

  return l.id
    ? `<button type="button" class="${klas} bb-rij-knop" onclick="openProfielScherm('${jsAttr(l.id)}')" aria-label="Profiel van ${escHtml(l.naam)}">${inhoud}</button>`
    : `<div class="${klas}">${inhoud}</div>`;
}







function bezettingOpenHTML(kop, instrument) {
  return `<div class="bb-rij bezetting-open"><span class="bb-foto bezetting-open-rondje" aria-hidden="true">?</span><span class="bb-tekst"><span class="bb-naam">${kop}</span><span class="bb-sub">${escHtml(instrument)}</span></span></div>`;
}

function bandSectieHTML(titel, inhoud) {
  return `<div class="profile-media"><div class="profile-media-title">${titel}</div>${inhoud}</div>`;
}









async function profielBandsOphalen(musicianId) {
  if (!musicianId) return [];
  try {
    const { data: rijen, error } = await db.rpc('tt_musician_band_ids', { mid: musicianId });
    if (error) throw error;
    const ids = (rijen || []).map(r => r.band_id).filter(Boolean);
    if (!ids.length) return [];
    const { data, error: fout } = await db.rpc('tt_get_bands_public', { ids });
    if (fout) throw fout;
    return ids.map(id => (data || []).find(b => b.id === id)).filter(Boolean).map(b => {
      const ik = (b.members || []).find(x => x.id === musicianId) || {};
      return { id: b.id, naam: b.name, foto: b.avatar_url || null, rollen: ik.instruments || [], rol: ik.role || 'Lid' };
    });
  } catch (e) {
    logCaught('profielBandsOphalen', e);
    return [];
  }
}





function profielBandsHTML(bands) {
  if (!bands || !bands.length) return '';
  return bandSectieHTML('Bands', bands.map(b => {
    const beeld = bbFotoHTML(b.foto, false, true);
    const sub = b.rollen.concat(b.rol === 'Oprichter' ? [roleLabel(b.rol)] : []).join(' · ');
    return `<button type="button" class="bb-rij bb-rij-knop" onclick="openBandScherm('${jsAttr(b.id)}')">${beeld}<span class="bb-tekst"><span class="bb-naam">${escHtml(b.naam)}</span>${sub ? `<span class="bb-sub">${escHtml(sub)}</span>` : ''}</span></button>`;
  }).join(''));
}

function bandNummerHTML(n, fotoWazig) {


  if (n.afgeschermd) {
    return `<div class="band-nummer"><span class="media-mini media-mini-wazig" role="img" aria-label="Alleen zichtbaar met een account">${wazigHTML(wazigBron(fotoWazig) || WAZIG_ALGEMEEN)}</span>` +
      `<span class="band-nummer-tekst"><span class="band-nummer-titel">${escHtml(n.titel)}</span><span class="band-nummer-sub">Alleen met een account</span></span></div>`;
  }
  const url = safeUrl(n.url);
  if (!url) return '';
  const platform = n.platform || detectPlatform(url);
  const ytId = extractYouTubeId(url);
  const mini = ytId
    ? `<span class="media-mini"><img src="https://img.youtube.com/vi/${escHtml(ytId)}/hqdefault.jpg" alt=""></span>`
    : `<span class="media-mini"><span class="media-mini-platform">${platformNaamHTML(platform)}</span></span>`;
  return `<button type="button" class="band-nummer" onclick="openMediaSpeler('${jsAttr(url)}', 'link', '${jsAttr(n.titel)}', '${jsAttr(platform)}')">${mini}` +
    `<span class="band-nummer-tekst"><span class="band-nummer-titel">${escHtml(n.titel)}</span><span class="band-nummer-sub">${escHtml(platform)}</span></span></button>`;
}

function bandSocialsHTML(b) {
  const knoppen = BAND_SOCIALS.map(soc => {
    const waarde = b[soc.veld];


    if (b.afgeschermd && waarde === '') {
      return `<span class="social-knop social-dicht" role="img" aria-label="${soc.naam}, alleen zichtbaar met een account">${soc.svg}</span>`;
    }
    const link = bandSocialLink(soc, waarde);
    if (!link) return '';
    return `<a class="social-knop" href="${link}" target="_blank" rel="noopener noreferrer" aria-label="${soc.naam} van ${escHtml(b.name)}">${soc.svg}</a>`;
  }).join('');



  return knoppen ? `<div class="socials"><span class="socials-tekst">Volg ons ook hier:</span>${knoppen}</div>` : '';
}








function bandPaginaHTML(b, kijker) {
  const beheer = kijker === 'beheerder';
  const foto = safeUrl(b.avatar_url);


  const fotoToevoegen = beheer ? `voegFotoToe('${jsAttr(b.id)}')` : null;






  let menuHTML = '';
  if (kijker === 'lid') {
    menuHTML = `<span class="profiel-menu-plek"><div class="profile-actions-menu-wrap">
        <button class="nav-menu-btn" onclick="toggleBandMoreMenu(event)" aria-label="Meer opties voor ${escHtml(b.name)}" title="Meer">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
        </button>
        <div class="inline-menu-dropdown">
          <button class="nav-menu-item" onclick="sluitAlleMenus();leaveBand('${jsAttr(b.id)}','${jsAttr(b.name)}')">Band verlaten</button>
        </div>
      </div></span>`;
  } else if (kijker === 'bezoeker') {


    menuHTML = '<span id="profielSchermActies" class="profiel-menu-plek"></span>';
  }





  const sterren = b.wanted.length ? starDisplayHTML(b.niveau, true) : '';
  const regel2 = [BAND_SOORT_LABELS[b.soort] ? escHtml(BAND_SOORT_LABELS[b.soort]) : '',
    sterren ? 'Ervaring ' + sterren : ''].filter(Boolean).join(' · ');
  const regel1 = b.genres.map(g => escHtml(g)).join(' · ');
  const watHTML = `
    <div class="profiel-wat">
      ${regel1 ? `<div class="profiel-wat-regel">${regel1}</div>` : ''}
      ${regel2 ? `<div class="profiel-wat-regel">${regel2}</div>` : ''}
    </div>`;



  const voortgang = beheer ? bandVoortgang(b) : null;
  const deelActie = voortgang && voortgang.pct < 100 ? `openBandDeelBlad('${jsAttr(b.id)}')` : null;












  let actie = '';
  if (kijker === 'gast') {
    actie = `<button class="btn btn-primary" onclick="showView('register')">Maak een profiel en leg contact</button>`;
  } else if (kijker === 'bezoeker' && b.contact) {
    actie = `<button class="btn btn-primary" data-bericht-id="${escHtml(b.contact.id)}" onclick="openMessageComposer('${jsAttr(b.contact.id)}','${jsAttr(b.contact.naam)}','${jsAttr(b.name)}')">Stuur een bericht aan de band</button>`;
  } else if (beheer) {
    actie = `<button class="btn btn-ghost" onclick="openBandTegels('${jsAttr(b.id)}')">Bandprofiel bewerken</button>`;
  }


  let h = `
    ${profielHoesHTML({
      foto, wazig: wazigBron(b.avatar_url), naam: b.name, media: b.media, fotoToevoegen,

      kaart: { id: b.id, naam: b.name, regel: b.city || '', wat: b.genres, onder: [], zoekt: b.wanted },
      regels: `<div class="profile-meta" style="margin-bottom:0;">${escHtml(b.city || '')}</div>`,
      knoppen: profielKnoppenHTML('band', b.id, b.name, menuHTML, deelActie)
    })}
    ${watHTML}
    ${standMeldingHTML(b.stand)}`;


  if (b.description) h += `<p class="profile-bio">${tekstMetMeerHTML(b.description)}</p>`;


  h += bandSocialsHTML(b) || '';
  if (actie) h += `<div class="profiel-actie">${actie}</div>`;



  const uitgenodigd = (kijker === 'lid' || beheer) ? (b.uitgenodigd || []) : [];
  if (b.leden.length || uitgenodigd.length || b.wanted.length || b.invallers.length) {
    h += bandSectieHTML('Bezetting', `<div class="bezetting">${
      bezettingRijen(b.leden).map(([l, r]) => bezettingLidHTML(l, r, false)).join('') +
      bezettingRijen(uitgenodigd).map(([l, r]) => bezettingLidHTML(l, r, true)).join('') +
      b.wanted.map(w => bezettingOpenHTML('Gezocht', w)).join('') +
      b.invallers.map(v => bezettingOpenHTML('Invaller', v.instrument)).join('')
    }</div>`);
  }

  const nummers = b.nummers.map(n => bandNummerHTML(n, b.avatar_url)).join('');
  if (nummers) h += bandSectieHTML('Eigen nummers', nummers);




  if (b.covers.length) {
    const rijen = [...b.covers].sort((x, y) => compareArtistTitle(x.song_artist, x.song_title, y.song_artist, y.song_title))

      .map(c => `<div class="profile-song-row"><span><strong>${escHtml(c.song_artist)}</strong> — <span class="profile-song-titel">${escHtml(c.song_title)}</span></span><span class="nummer-rechts">${overneemKnopHTML(c.song_title, c.song_artist)}</span></div>`);

    h += bandSectieHTML('Covers', nummerLijstHTML(rijen));
  }


  const media = profielMediaHTML(b.media, b.avatar_url);
  if (media) h += media;


  if (voortgang) h += voortgangsBalkHTML(voortgang.pct);
  return h;
}





const BAND_ONDERDELEN = [
  { sleutel: 'bandfoto',  naam: 'een bandfoto',        af: b => !!b.avatar_url },
  { sleutel: 'wie',       naam: 'Wie zijn we',         af: b => !!(b.description || '').trim() },


  { sleutel: 'bezetting', naam: 'de bezetting',        af: b => b.leden.length > 1 || b.wanted.length > 0 },


  { sleutel: 'nummers',   naam: 'eigen nummers',       af: b => b.nummers.length > 0, telt: b => b.soort !== 'covers' },
  { sleutel: 'media',     naam: "foto's en video's",   af: b => b.media.length > 0 },
  { sleutel: 'socials',   naam: 'socials',             af: b => BAND_SOCIALS.some(soc => String(b[soc.veld] || '').trim()) },
  { sleutel: 'covers',    naam: 'covers',              af: b => b.covers.length > 0, telt: b => b.soort !== 'eigen' },
  { sleutel: 'ervaring',  naam: 'jullie ervaring',     af: b => !!b.niveau },
  { sleutel: 'soort',     naam: 'wat voor band jullie zijn', af: b => !!b.soort }
];
const BAND_START_PCT = 15;

function bandVoortgang(b) {
  const af = {};
  const telt = {};
  BAND_ONDERDELEN.forEach(o => { af[o.sleutel] = !!o.af(b); telt[o.sleutel] = !o.telt || !!o.telt(b); });
  const tellend = BAND_ONDERDELEN.filter(o => telt[o.sleutel]);
  const aantal = tellend.filter(o => af[o.sleutel]).length;
  return {
    pct: Math.round(BAND_START_PCT + (100 - BAND_START_PCT) * aantal / tellend.length),
    af,
    telt,
    mist: tellend.filter(o => !af[o.sleutel]).map(o => o.naam)
  };
}


function opsommingNL(lijst) {
  if (lijst.length < 2) return lijst.join('');
  return lijst.slice(0, -1).join(', ') + ' en ' + lijst[lijst.length - 1];
}





let bandDeelGegevens = null;

function openBandDeelBlad(bandId) {
  const b = bandDeelGegevens && bandDeelGegevens.id === bandId ? bandDeelGegevens : null;
  if (!b) return;
  const v = bandVoortgang(b);
  document.getElementById('bandDeelTekst').textContent = `Nog niet op je pagina: ${opsommingNL(v.mist)}.`;
  document.getElementById('bandDeelModal').classList.add('visible');
}
function sluitBandDeelBlad() {
  document.getElementById('bandDeelModal').classList.remove('visible');
}
function bandDeelBladDelen() {
  const b = bandDeelGegevens;
  sluitBandDeelBlad();
  if (b) shareProfile('band', b.id, b.name);
}
function bandDeelBladAanvullen() {
  const b = bandDeelGegevens;
  sluitBandDeelBlad();
  if (b) openBandTegels(b.id);
}







function openBandScherm(id, opties) {
  const o = opties || {};
  showView('profiel', o.redirect ? 'redirect' : undefined, { id, soort: 'band' });
  return profielLaadBelofte;
}

async function laadBandScherm(id) {
  const volgnr = ++profielSchermVolgnr;
  huidigProfielId = null;
  huidigBandId = id || null;
  bandDeelGegevens = null;
  const vak = document.getElementById('profielSchermContent');
  vak.classList.remove('uitnodig-open');
  vak.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">Laden...</div>';
  if (!id) { toonProfielNietBeschikbaar('band'); return; }

  let b = null;
  let mislukt = false;
  try {
    b = hasOwnProfile ? await bandUitTabellen(id) : await bandUitPubliek(id);
  } catch (e) {
    mislukt = true;

    const m = new Error(((e && e.message) ? e.message : String(e)) + ' (band ' + id + ')');
    m.stack = (e && e.stack) ? e.stack : null;
    logCaught('laadBandScherm', m);
  }
  if (volgnr !== profielSchermVolgnr) return;


  if (!b && !mislukt) { toonProfielNietBeschikbaar('band'); return; }
  if (!b) { vak.innerHTML = foutStaatHTML(mislukt, 'de band laden', `laadBandScherm('${jsAttr(id)}')`); return; }

  const ik = hasOwnProfile ? myMusicianId : null;
  const kijker = !hasOwnProfile ? 'gast'
    : (ik && ik === b.beheerderId) ? 'beheerder'
    : (ik && b.leden.some(l => l.id === ik)) ? 'lid' : 'bezoeker';


  bandDeelGegevens = kijker === 'beheerder' ? b : null;


  if (kijker === 'beheerder') bandTegelsZetten(b.id, {
    name: b.name, city: b.city, niveau: b.niveau, genres: b.genres, avatar_url: b.avatar_url, stand: b.stand,
    band_members: b.leden.map(l => ({ musician_id: l.id, status: 'bevestigd', founder_offer: l.founderOffer, musicians: { weergavenaam: l.naam } })),
    band_wanted: b.wanted.map(instrument => ({ instrument })), band_invallers: b.invallers,
    band_nummers: b.nummers, band_covers: b.covers, band_media: b.media
  });
  vak.innerHTML = bandPaginaHTML(b, kijker);
  overneemKnoppenBijwerken(vak);


  hoesStarten(vak);
  mediaTitelsBijwerken(vak);
  fitProfileName(vak);

  if (kijker === 'bezoeker') zetVeiligheidMenu('profielSchermActies', 'band', b.id, b.name);
}













let bewerkBandId = null;
let bewerkBandNaam = '';
let bewerkBandStad = '';

const BAND_TILES = [
  { id: 'bandWie',       title: 'Wie zijn we' },
  { id: 'bandBezetting', title: 'Onze bezetting' },
  { id: 'bandMuziek',    title: 'Onze muziek' },
  { id: 'bandMedia',     title: 'Onze media' }
];




function bandStatusAfgeleid(aantalOpenRollen) {
  return aantalOpenRollen ? 'zoekend' : 'compleet';
}



function openBandTegels(bandId) {
  sluitAlleMenus();
  sluitBandDeelBlad();
  if (bewerkBandId !== bandId) bewerkBandNaam = '';
  bewerkBandId = bandId;
  zetBandNaamRegel();
  showView('profieltegels');
}




function zetBandNaamRegel() {
  document.querySelectorAll('.band-naam-regel').forEach(el => { el.textContent = bewerkBandNaam || ''; });
}

function waardeVan(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}



async function bandBewerkGegevens(kolommen) {
  const id = bewerkBandId;
  if (!id) return null;
  const { data, error } = await db.from('bands').select(kolommen).eq('id', id).single();
  if (error || !data) {
    logCaught('bandBewerkGegevens', error || new Error('Band niet gevonden.'));
    showToast(error ? friendlyErrorMessage(error, 'de band laden') : 'Deze band bestaat niet meer.');
    return null;
  }
  if (id !== bewerkBandId) return null;
  if (data.name) bewerkBandNaam = data.name;
  if (data.city) bewerkBandStad = data.city;
  zetBandNaamRegel();
  return data;
}








let bandTegelRegels = { id: null, regels: {} };
let bandTegelRegelsVraag = 0;

let bandTegelData = { id: null, data: null };
const BAND_TEGEL_KOLOMMEN = 'name, city, niveau, genres, avatar_url, stand, band_members(musician_id, status, founder_offer, musicians(weergavenaam, username)), band_wanted(instrument), band_invallers(id), band_nummers(titel), band_covers(song_title), band_media(media_type)';

function bandTegelsZetten(id, data) {
  bandTegelRegels = { id, regels: {} };
  BAND_TILES.forEach(t => { bandTegelRegels.regels[t.id] = bandTegelRegelHTML(t.id, data); });
  bandTegelData = { id, data };
}

function bandTegelRegelHTML(id, b) {
  const lijst = (x) => Array.isArray(x) ? x : [];
  const leeg = (wat) => `<span class="tegel-leeg">Nog leeg</span> · ${escHtml(wat)}`;
  const deel = (n, een, meer) => n ? `${n} ${n === 1 ? een : meer}` : '';
  if (id === 'bandWie') {
    const sterren = starDisplayHTML(b.niveau, true);
    const delen = [b.city ? escHtml(b.city) : '', sterren ? 'ervaring ' + sterren : ''].filter(Boolean);
    return delen.join(' · ');
  }
  if (id === 'bandBezetting') {
    const delen = [deel(lijst(b.band_members).filter(m => m.status === 'bevestigd').length, 'lid', 'leden'),
      deel(lijst(b.band_wanted).length, 'open rol', 'open rollen'),
      deel(lijst(b.band_invallers).length, 'invaller', 'invallers')].filter(Boolean);
    return escHtml(delen.join(' · '));
  }
  if (id === 'bandMuziek') {
    const delen = [lijst(b.genres).join(', '), deel(lijst(b.band_nummers).length, 'eigen nummer', 'eigen nummers'),
      deel(lijst(b.band_covers).length, 'cover', 'covers')].filter(Boolean);
    return escHtml(delen.join(' · '));
  }
  if (id === 'bandMedia') {
    const media = lijst(b.band_media), tel = (t) => media.filter(x => x.media_type === t).length;
    const delen = [b.avatar_url ? 'Bandfoto' : '', deel(tel('foto'), 'foto', "foto's"),
      deel(tel('video'), 'video', "video's"), deel(tel('link'), 'link', 'links')].filter(Boolean);
    return delen.length ? escHtml(delen.join(' · ')) : leeg('voeg een foto toe');
  }
  return '';
}





function renderBandTegels() {
  const wrap = document.getElementById('bandTegelsWrap'), id = bewerkBandId;
  const beheer = document.getElementById('bandBeheerBlok');
  const tegels = () => {
    const regels = bandTegelRegels.id === id ? bandTegelRegels.regels : {};

    const sleutel = id + '|' + JSON.stringify(regels);
    if (wrap.firstChild && wrap.dataset.sleutel === sleutel) return;
    wrap.dataset.sleutel = sleutel;
    wrap.innerHTML = tegelsHTML(BAND_TILES);
    wrap.querySelectorAll('.tile-sub').forEach((el, i) => { el.innerHTML = regels[BAND_TILES[i].id] || '&nbsp;'; });
  };
  if (bandTegelData.id === id) { tegels(); bandBeheerTekenen(id, bandTegelData.data, myMusicianId); }
  else { wrap.innerHTML = ''; if (beheer) { beheer.innerHTML = ''; delete beheer.dataset.band; } }

  if (id) tegelsVoorladen(BAND_TILES.map(t => t.id));
  const vraag = ++bandTegelRegelsVraag;
  const fout = (e) => {


    logCaught('renderBandTegels', e);
    if (vraag === bandTegelRegelsVraag && id === bewerkBandId && !wrap.firstChild) { tegels(); bandBeheerFout(); }
  };
  db.from('bands').select(BAND_TEGEL_KOLOMMEN).eq('id', id).single()
    .then(({ data, error }) => {
      if (vraag !== bandTegelRegelsVraag || id !== bewerkBandId) return;
      if (error || !data) { fout(error || new Error('Band niet gevonden.')); return; }
      bandTegelsZetten(id, data);
      tegels();
      bandBeheerTekenen(id, data, myMusicianId);
    }, fout);
}












function bandStandVan(b) {
  return b && STANDEN.some(x => x.waarde === b.stand) ? b.stand : 'actief';
}

let bandBeheerStand = 'actief';

async function renderBandBeheer() {
  const el = document.getElementById('bandBeheerBlok');
  const id = bewerkBandId;
  if (!el || !id) return;



  if (el.dataset.band !== String(id)) { el.innerHTML = ''; delete el.dataset.band; }
  try {
    const { data: b, error } = await db.from('bands').select(BAND_TEGEL_KOLOMMEN).eq('id', id).single();
    if (error || !b) throw error || new Error('Band niet gevonden.');
    if (id !== bewerkBandId) return;
    const mid = await getMyMusicianId();
    if (id !== bewerkBandId) return;
    bandTegelsZetten(id, b);
    bandBeheerTekenen(id, b, mid);
  } catch (e) {
    logCaught('renderBandBeheer', e);
    bandBeheerFout();
  }
}



function bandBeheerTekenen(id, b, mid) {
  const el = document.getElementById('bandBeheerBlok');
  if (!el) return;
  bewerkBandNaam = b.name || '';
  bewerkBandStad = b.city || '';
  zetBandNaamRegel();
  bandBeheerStand = bandStandVan(b);
  const anderen = (b.band_members || []).filter(m => m.status === 'bevestigd' && m.musician_id !== mid);
  const gevraagd = anderen.filter(m => m.founder_offer).map(m => m.musicians ? displayNameOf(m.musicians) : '').filter(Boolean);
  const stand = STANDEN.find(x => x.waarde === bandBeheerStand);


  const sleutel = [id, b.name, bandBeheerStand, anderen.length, gevraagd.join(',')].join('|');
  if (el.dataset.band === String(id) && el.dataset.sleutel === sleutel) return;
  el.dataset.sleutel = sleutel;

  const overdragen = !anderen.length ? '' : gevraagd.length
    ? `<div class="tile" onclick="vraagOverdragenIntrekken('${jsAttr(id)}','${jsAttr(opsommingNL(gevraagd))}')">
        <div style="flex:1;"><div class="tile-title">Beheer overdragen</div>
        <div class="tile-sub">gevraagd aan ${escHtml(opsommingNL(gevraagd))} · wacht op antwoord</div></div></div>`
    : `<div class="tile" onclick="openOverdragen()">
        <div style="flex:1;"><div class="tile-title">Beheer overdragen</div>
        <div class="tile-sub">draag het beheer over aan een bandlid</div></div></div>`;
  el.innerHTML = `
    <h2 class="hoofdstuk-kop">Bandbeheer</h2>
    <div class="menu-anchor">
      <div class="tile" id="bandStandTegel" aria-label="Bandstatus">
        <div style="flex:1;"><div class="tile-title">Bandstatus</div>
        <div class="tile-sub"><span class="wheel-field-label">${escHtml(stand.label)}</span></div></div>
      </div>
      <div class="choice-menu menu-breed menu-tegel" id="bandStandMenu" role="listbox" aria-label="Bandstatus"></div>
    </div>
    ${overdragen}
    <div class="tile" onclick="vraagBandVerwijderen()">
      <div style="flex:1;"><div class="tile-title">Bandprofiel verwijderen</div>
      <div class="tile-sub">permanent verwijderen van ${escHtml(b.name || '')}</div></div>
    </div>`;
  initChoiceField({
    id: 'band-stand', fieldId: 'bandStandTegel', menuId: 'bandStandMenu',
    kop: STAND_KOP.band,
    rijen: () => STANDEN.map(x => ({ t: x.label, u: x.uitleg.band, gekozen: x.waarde === bandBeheerStand })),
    kies: i => zetBandStand(STANDEN[i].waarde)
  });
  el.dataset.band = String(id);
}


function bandBeheerFout() {
  const el = document.getElementById('bandBeheerBlok');
  if (!el) return;
  delete el.dataset.band; delete el.dataset.sleutel;
  el.innerHTML = `<h2 class="hoofdstuk-kop">Bandbeheer</h2>
    <p class="field-hint">Bandbeheer laden lukt nu niet. Controleer je verbinding en open dit scherm opnieuw.</p>`;
}


async function zetBandStand(stand) {
  const id = bewerkBandId;
  if (!id || stand === bandBeheerStand) return;

  const vorige = bandBeheerStand;
  const zetLabel = waarde => {
    bandBeheerStand = waarde;
    const label = document.querySelector('#bandStandTegel .wheel-field-label');
    const x = STANDEN.find(st => st.waarde === waarde);
    if (label && x) label.textContent = x.label;
  };
  zetLabel(stand);
  try {
    const { error } = rijenGeraakt(await db.from('bands')
      .update({ stand }).eq('id', id).select('id'));
    if (error) throw error;
    showToast('Wijzigingen opgeslagen.');
    renderBandBeheer();
    mijnBandsVerversen();
  } catch (e) {
    zetLabel(vorige);
    logCaught('zetBandStand', e);
    showToast(friendlyErrorMessage(e, 'de bandstatus opslaan'));
  }
}




async function vraagBandVerwijderen() {
  const id = bewerkBandId;
  if (!id) return;
  let namen = [];
  try {
    const mid = await getMyMusicianId();
    const { data, error } = await db.from('band_members')
      .select('musician_id, status, musicians(weergavenaam, username)').eq('band_id', id).eq('status', 'bevestigd');
    if (error) throw error;
    namen = (data || []).filter(m => m.musician_id !== mid && m.musicians).map(m => displayNameOf(m.musicians));
  } catch (e) { logCaught('vraagBandVerwijderen', e); }
  if (id !== bewerkBandId) return;
  const naam = bewerkBandNaam || 'de band';
  showConfirm(
    `Het profiel verdwijnt dan${namen.length ? ` voor ${opsommingNL(namen)}` : ''}, met de foto's, nummers en covers. Dat is niet terug te draaien.`,
    () => dissolveBand(id),
    'Bandprofiel verwijderen', true, null,
    `Bandprofiel van ${naam} verwijderen?`, null,
    'Ik begrijp dat het bandprofiel definitief wordt verwijderd.'
  );
}





let bwSnapshot = null;
let bwNiveau = null;



function bandTegelVraag(kolommen) {
  return vraagNu(db.from('bands').select(kolommen).eq('id', bewerkBandId).single());
}
function bbLedenVraag(bandId) {
  return vraagNu(db.from('band_members')
    .select('musician_id, role, rollen, status, musicians(id, weergavenaam, username, avatar_url)')
    .eq('band_id', bandId));
}
Object.assign(TEGEL_HAAL, {
  bandWie: () => bandTegelVraag('name, zip, city, city_source, description, niveau'),

  bandBezetting: () => {
    const leden = bbLedenVraag(bewerkBandId);
    return bandTegelVraag('name, city, founder_id, contact_id, band_wanted(instrument), band_invallers(id, instrument, created_at)')
      .then(r => ({ data: r.data ? { band: r.data, leden } : null, error: r.error }));
  },
  bandMuziek: () => bandTegelVraag('name, city, soort, genres, band_nummers(id, titel, url, created_at), band_covers(id, song_title, song_artist)'),
  bandMedia: () => bandTegelVraag('name, city, avatar_url, avatar_bron, avatar_kader, instagram, tiktok, youtube, band_media(id, media_type, url, platform, in_banner, created_at, uitsnede)')
});


function bandTegelBand(tegel, r, b) {
  if (r.error || !b) {
    tegelLadenFout(tegel, r.error || new Error('Deze band bestaat niet meer.'), 'de band laden');
    return null;
  }
  tegelLadenKlaar(tegel);
  if (b.name) bewerkBandNaam = b.name;
  if (b.city) bewerkBandStad = b.city;
  zetBandNaamRegel();
  return b;
}

function bwFieldSnapshot() {
  return JSON.stringify({
    naam: waardeVan('bwNaam'), zip: waardeVan('bwZip'), city: waardeVan('bwCity'),
    bio: waardeVan('bwBio'), niveau: bwNiveau || null
  });
}

async function openBandWie() {
  clearFieldErrors('bandWieScreen');
  const r = await tegelGegevens('bandWie');
  if (!r) return;
  const b = bandTegelBand('bandWie', r, r.data);
  if (!b) return;

  bandPostcodeDoel = 'bw';
  bandPostcodeResolved = !!(b.zip && b.city);
  bandPostcodeFailStreak = 0;
  bandPostcodeManualMode = false;
  bandCitySource = b.city_source || 'cache';
  const stad = document.getElementById('bwCity');
  stad.readOnly = true;
  stad.style.cursor = 'not-allowed';
  document.getElementById('bwPostcodeStatus').textContent = '';
  document.getElementById('bwNaam').value = b.name || '';
  document.getElementById('bwZip').value = b.zip || '';
  stad.value = b.city || '';
  document.getElementById('bwBio').value = b.description || '';
  veldGroeit(document.getElementById('bwBio'));
  updateCharCounter('bwBio', 'bwBioTeller', 1000);
  bwNiveau = b.niveau || null;
  bwRenderErvaring();
  bwSnapshot = bwFieldSnapshot();
}

function bwRenderErvaring() {
  const el = document.getElementById('bwErvaring');
  if (!el) return;
  renderStarPicker(el, bwNiveau || 0, (n) => { bwNiveau = n; bwRenderErvaring(); });
}

async function saveBandWie() {
  clearFieldErrors('bandWieScreen');


  const naam = waardeVan('bwNaam');
  const zip = waardeVan('bwZip');
  const city = waardeVan('bwCity');
  const fouten = [];
  if (!naam) fouten.push(['bwNaam', 'Vul een bandnaam in']);
  if (!zip || !bandPostcodeResolved || !city) {
    fouten.push(['bwZip', 'Vul een geldige postcode in. De plaats wordt dan automatisch ingevuld']);
  }
  if (showFieldErrors(fouten)) return;
  if (bwFieldSnapshot() === bwSnapshot) return;

  const { error } = rijenGeraakt(await db.from('bands').update({
    name: naam, zip, city: normalizeCityName(city), city_source: bandCitySource,
    description: waardeVan('bwBio') || null,
    niveau: bwNiveau || null
  }).eq('id', bewerkBandId).select('id'));
  if (error) {
    logCaught('saveBandWie', error);
    showToast(friendlyErrorMessage(error, 'de bandgegevens opslaan'));
    return;
  }
  bewerkBandNaam = naam;
  bewerkBandStad = normalizeCityName(city);
  zetBandNaamRegel();
  bwSnapshot = bwFieldSnapshot();
  showToast('Wijzigingen opgeslagen.');
  mijnBandsVerversen();
  terugNaOpslaan('bandWie');
}






let bbLeden = [];
let bbUitgenodigd = [];
let bbRollenBewerkt = {};
let bbRollenLid = null;
let bbWanted = [];
let bbWantedVervuld = {};
let bbInvallers = [];
let bbInvalLijst = [];
let bbContact = '';
let bbBeheerderId = null;
let bbSnapshot = null;

function bbFieldSnapshot() {
  return JSON.stringify({
    wanted: [...bbWanted].sort(),
    invallers: bbInvallers.map(v => [v.id || null, v.instrument]),
    rollen: Object.keys(bbRollenBewerkt).sort().map(id => [id, bbRollenBewerkt[id]]),
    contact: bbContact || null
  });
}

async function openBandBezetting() {
  const r = await tegelGegevens('bandBezetting');
  if (!r) return;
  const b = bandTegelBand('bandBezetting', r, r.data && r.data.band);
  if (!b) return;
  bbBeheerderId = b.founder_id;
  bbRollenBewerkt = {};
  bbWantedVervuld = {};
  bbWanted = (b.band_wanted || []).map(w => w.instrument);
  bbInvallers = bbInvallersUit(b.band_invallers);





  initPicker({
    id: 'bbWanted', fieldId: 'bbRolKnop', menuId: 'bbRolMenu', badgeRowId: 'bbRolBadges',
    options: INSTRUMENTS, getList: () => bbWanted,
    placeholder: 'Open rol toevoegen',
    onChange: bbRenderOpen
  });



  initPicker({
    id: 'bbInval', fieldId: 'bbInvalKnop', menuId: 'bbInvalMenu', badgeRowId: 'bbInvalBadges',
    options: INSTRUMENTS, getList: () => bbInvalLijst,
    placeholder: 'Invaller toevoegen',
    onChange: bbInvalGewijzigd
  });

  if (!CHOICE_FIELDS['band-contact']) {
    initChoiceField({ id: 'band-contact', fieldId: 'bbContactVeld', menuId: 'bbContactMenu', selectId: 'bbContactKeuze' });
  }


  if (!CHOICE_FIELDS['bb-rollen']) {
    initChoiceField({
      id: 'bb-rollen', fieldId: 'bbRollenVeld', menuId: 'bbRollenMenu', meer: true,
      rijen: () => INSTRUMENTS.map(t => ({ t, gekozen: bbRollenVan(bbRollenLid).includes(t) })),
      kies: i => bbRolWissel(INSTRUMENTS[i])
    });
  }
  await bbLaadLeden(b.contact_id, r.data.leden);
  bbRenderOpen();
  bbRenderInvallers();
  bbSnapshot = bbFieldSnapshot();
}



function bbInvallersUit(rijen) {
  const lijst = (rijen || []).slice()
    .sort((x, y) => String(x.created_at || '').localeCompare(String(y.created_at || '')))
    .map(v => ({ id: v.id || null, instrument: v.instrument }));
  bbInvalLijst = lijst.map(v => v.instrument);
  return lijst;
}




function bbInvalGewijzigd() {
  if (bbInvalLijst.length > GRENZEN.invallers) {
    bbInvalLijst.pop();
    grensBereikt(GRENZEN.invallers, GRENZEN.invallers, `Maximum van ${GRENZEN.invallers} invallers bereikt.`);
    if (PICKERS.bbInval) renderPickerBadges(PICKERS.bbInval);
  }
  const over = bbInvallers.slice();
  bbInvallers = bbInvalLijst.map(t => {
    const i = over.findIndex(v => v.instrument === t);
    return i === -1 ? { id: null, instrument: t } : over.splice(i, 1)[0];
  });
  bbRenderInvallers();
}




async function bbLaadLeden(contactStart, vooraf) {
  const id = bewerkBandId;
  if (!id) return;
  const { data, error } = await (vooraf || bbLedenVraag(id));
  if (error) {
    logCaught('bbLaadLeden', error);
    showToast(friendlyErrorMessage(error, 'de leden laden'));
    return;
  }
  if (id !== bewerkBandId) return;

  const opNaam = (x, y) => x.naam.localeCompare(y.naam, 'nl');
  const naarLid = m => ({
    id: m.musician_id, naam: displayNameOf(m.musicians), avatar_url: (m.musicians && m.musicians.avatar_url) || null,
    rollen: m.rollen || [], rol: m.role
  });
  bbLeden = (data || []).filter(m => m.status === 'bevestigd').map(naarLid).sort(opNaam);
  bbUitgenodigd = (data || []).filter(m => m.status === 'aangevraagd').map(naarLid).sort(opNaam);

  Object.keys(bbRollenBewerkt).forEach(x => { if (!bbLeden.some(l => l.id === x)) delete bbRollenBewerkt[x]; });

  Object.keys(bbWantedVervuld).forEach(x => {
    if (bbLeden.some(l => l.id === x)) return;
    bbWanted.push(...bbWantedVervuld[x]);
    delete bbWantedVervuld[x];
    bbRenderOpen();
  });

  const gewenst = contactStart !== undefined ? contactStart : bbContact;
  bbContact = bbLeden.some(l => l.id === gewenst) ? gewenst : bbBeheerderId;
  bbRenderLeden();
}



function bbFotoHTML(url, wacht, vierkant) {
  const extra = (wacht ? ' bb-wacht' : '') + (vierkant ? ' bb-foto-vierkant' : '');
  const w = wazigBron(url);
  if (w) return `<span class="bb-foto bb-foto-leeg${extra}" aria-hidden="true">${wazigHTML(w)}</span>`;
  const veilig = safeUrl(url);
  return veilig
    ? `<img class="bb-foto${extra}" ${kleinFotoAttr(veilig)} alt="">`
    : `<span class="bb-foto bb-foto-leeg${extra}" aria-hidden="true">${ZONDER_FOTO_HTML}</span>`;
}



function bbRijHTML(beeldHTML, naam, subHTML, menuItemsHTML, lidId) {
  const menu = menuItemsHTML ? `<div class="profile-actions-menu-wrap">
      <button class="nav-menu-btn" onclick="toggleBandMoreMenu(event)" aria-label="Meer opties voor ${escHtml(naam)}" title="Meer">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
      </button>
      <div class="inline-menu-dropdown">${menuItemsHTML}</div>
    </div>` : '';
  const lid = lidId ? ` data-lid="${escHtml(lidId)}"` : '';
  return `<div class="bb-rij"${lid}>${beeldHTML}<div class="bb-tekst"><div class="bb-naam">${escHtml(naam)}</div><div class="bb-sub">${subHTML}</div></div>${menu}</div>`;
}



function bbRollenVan(id) {
  if (bbRollenBewerkt[id]) return bbRollenBewerkt[id];
  const l = bbLeden.find(x => x.id === id);
  return l ? l.rollen : [];
}



function bbLidRegel(l) {
  return rollenRegel(bbRollenVan(l.id), l.id === bbBeheerderId);
}

function bbRenderLeden() {
  const ik = myMusicianId;

  const anker = document.getElementById('bbRollenAnker');
  if (anker && anker.parentElement && anker.parentElement.id === 'bbLeden') document.getElementById('bbLeden').after(anker);




  document.getElementById('bbLeden').innerHTML = bbLeden.map(l => {
    const menu = `<button class="nav-menu-item" onclick="sluitAlleMenus();bbRollenWijzigen('${jsAttr(l.id)}')">Rollen wijzigen</button>` +
      (l.id === bbBeheerderId ? '' :
      `<button class="nav-menu-item" onclick="sluitAlleMenus();removeMember('${jsAttr(bewerkBandId)}','${jsAttr(l.id)}','${jsAttr(l.naam)}','${jsAttr(bewerkBandNaam)}')">Uit de band</button>`);
    return bbRijHTML(bbFotoHTML(l.avatar_url), l.naam + (l.id === ik ? ' (jij)' : ''), escHtml(bbLidRegel(l)), menu, l.id);
  }).join('');

  document.getElementById('bbUitgenodigdBlok').hidden = !bbUitgenodigd.length;
  document.getElementById('bbUitgenodigd').innerHTML = bbUitgenodigd.map(l =>
    bbRijHTML(bbFotoHTML(l.avatar_url, true), l.naam, escHtml(`${l.rollen.length ? l.rollen.join(' · ') : roleLabel('Lid')} · uitgenodigd`),
      `<button class="nav-menu-item" onclick="sluitAlleMenus();bbIntrekken('${jsAttr(l.id)}','${jsAttr(l.naam)}')">Uitnodiging intrekken</button>`)
  ).join('');


  const sel = document.getElementById('bbContactKeuze');
  sel.innerHTML = bbLeden.map(l => `<option value="${escHtml(l.id)}">${escHtml(l.naam + (l.id === ik ? ' (jij)' : ''))}</option>`).join('');
  sel.value = bbContact || '';
  refreshChoiceField('band-contact');
}




function bbPlusHTML(zoekAanroep, label) {
  return `<button type="button" class="bb-foto bezetting-open-rondje bb-plus" onclick="${zoekAanroep}" aria-label="${escHtml(label)}">+</button>`;
}




function bbRollenWijzigen(id) {
  const rij = document.querySelector(`#bbLeden .bb-rij[data-lid="${CSS.escape(id)}"]`);
  const anker = document.getElementById('bbRollenAnker');
  if (!rij || !anker) return;
  rij.after(anker);
  bbRollenLid = id;
  openChoiceMenu('bb-rollen');
}

function bbRolWissel(rol) {
  const l = bbLeden.find(x => x.id === bbRollenLid);
  if (!l) return;
  let nieuw = bbRollenVan(l.id).slice();
  const vervuld = bbWantedVervuld[l.id] || [];
  if (nieuw.includes(rol)) {
    if (nieuw.length === 1) { showToast('Kies minstens één rol.'); return; }
    nieuw = nieuw.filter(r => r !== rol);

    if (vervuld.includes(rol)) {
      vervuld.splice(vervuld.indexOf(rol), 1);
      bbWanted.push(rol);
      bbRenderOpen();
    }
  } else {
    nieuw.push(rol);



    const plek = bbWanted.indexOf(rol);
    if (plek >= 0 && !l.rollen.includes(rol)) {
      bbWanted.splice(plek, 1);
      vervuld.push(rol);
      bbRenderOpen();
      showToast(`Open rol ${rol} weg: ${l.naam} speelt dit nu.`);
    }
  }
  if (vervuld.length) bbWantedVervuld[l.id] = vervuld;
  else delete bbWantedVervuld[l.id];
  nieuw.sort((x, y) => x.localeCompare(y, 'nl'));
  if (nieuw.join('\n') === l.rollen.join('\n')) delete bbRollenBewerkt[l.id];
  else bbRollenBewerkt[l.id] = nieuw;
  const sub = document.querySelector(`#bbLeden .bb-rij[data-lid="${CSS.escape(l.id)}"] .bb-sub`);
  if (sub) sub.textContent = bbLidRegel(l);
}



function bbRenderOpen() {
  document.getElementById('bbOpen').innerHTML = bbWanted.map((w, i) => bbRijHTML(
    bbPlusHTML(`bbZoekNaar(bbWanted[${i}])`, `Zoek een muzikant: ${w}`), 'Gezocht', escHtml(w),
    `<button class="nav-menu-item" onclick="sluitAlleMenus();bbRolWeg(${i})">Open rol weghalen</button>`)).join('');
}

function bbRolWeg(i) {
  bbWanted.splice(i, 1);
  bbRenderOpen();
}

function bbRenderInvallers() {
  document.getElementById('bbInvallers').innerHTML = bbInvallers.map((v, i) => bbRijHTML(
    bbPlusHTML(`bbZoekNaar(bbInvallers[${i}].instrument, true)`, `Zoek een invaller: ${v.instrument}`),
    'Invaller', escHtml(v.instrument),
    `<button class="nav-menu-item" onclick="sluitAlleMenus();bbInvallerWeg(${i})">Invaller weghalen</button>`)).join('');
}

function bbInvallerWeg(i) {
  bbInvallers.splice(i, 1);
  bbInvalLijst = bbInvallers.map(v => v.instrument);
  if (PICKERS.bbInval) renderPickerBadges(PICKERS.bbInval);
  bbRenderInvallers();
}



function bbZoekNaar(instrument, invaller) {
  if (!instrument) return;
  if (tegelHeeftWijzigingen()) { showToast('Sla eerst je wijzigingen op.'); return; }
  zoekMuzikantVoorRol(instrument, bewerkBandStad, bewerkBandNaam, !!invaller, bewerkBandId);
}




function bbLidUitnodigen() {
  if (!bewerkBandId) return;
  if (tegelHeeftWijzigingen()) { showToast('Sla eerst je wijzigingen op.'); return; }
  zoekMuzikantVoorRol('', bewerkBandStad, bewerkBandNaam, false, bewerkBandId);
}



async function bbIntrekken(musicianId, naam) {
  const id = bewerkBandId;
  if (!id) return;
  try {
    const { error } = rijenGeraakt(await db.from('band_members').delete()
      .eq('band_id', id).eq('musician_id', musicianId).eq('status', 'aangevraagd').select('band_id'));
    if (error) throw error;
    showToast(`Uitnodiging aan ${naam} ingetrokken.`);
    bbLaadLeden();
    mijnBandsVerversen();
  } catch (e) {
    logCaught('bbIntrekken', e);
    showToast(friendlyErrorMessage(e, 'de uitnodiging intrekken'));
  }
}

async function saveBandBezetting() {
  if (bbFieldSnapshot() === bbSnapshot) return;
  const id = bewerkBandId;
  if (!id) return;
  try {





    const rolUit = await Promise.all(Object.entries(bbRollenBewerkt).map(async ([lid, rollen]) =>
      rijenGeraakt(await db.from('band_members').update({ rollen })
        .eq('band_id', id).eq('musician_id', lid).select('musician_id'))));
    const rolFout = rolUit.find(r => r.error);
    if (rolFout) throw rolFout.error;

    const { error: wErr } = await db.rpc('tt_save_band_wanted', { p_band_id: id, p_instruments: bbWanted });
    if (wErr) throw wErr;


    const eerder = JSON.parse(bbSnapshot).invallers.map(v => v[0]).filter(Boolean);
    const nogDaar = bbInvallers.map(v => v.id).filter(Boolean);
    const weg = eerder.filter(x => !nogDaar.includes(x));
    if (weg.length) {
      const { error } = await db.from('band_invallers').delete().in('id', weg);
      if (error) throw error;
    }
    const nieuw = bbInvallers.filter(v => !v.id);
    if (nieuw.length) {


      const { data: erbij, error } = await db.from('band_invallers')
        .insert(nieuw.map(v => ({ band_id: id, instrument: v.instrument }))).select('id');
      if (error) throw error;
      idsZetten(nieuw, erbij);
    }


    const { error: bErr } = rijenGeraakt(await db.from('bands').update({
      contact_id: bbContact && bbContact !== bbBeheerderId ? bbContact : null,
      status: bandStatusAfgeleid(bbWanted.length)
    }).eq('id', id).select('id'));
    if (bErr) throw bErr;

    const { data: rijen, error: rErr } = await db.from('band_invallers').select('id, instrument, created_at').eq('band_id', id);
    if (rErr) throw rErr;
    bbInvallers = bbInvallersUit(rijen);
    bbRenderInvallers();

    if (Object.keys(bbRollenBewerkt).length) {
      bbRollenBewerkt = {};
      bbWantedVervuld = {};
      await bbLaadLeden();
    }
    bbSnapshot = bbFieldSnapshot();
    showToast('Wijzigingen opgeslagen.');
    mijnBandsVerversen();
    terugNaOpslaan('bandBezetting');
  } catch (e) {
    logCaught('saveBandBezetting', e);
    showToast(friendlyErrorMessage(e, 'de bezetting opslaan'));
  }
}





const BAND_SOORT_KEUZES = [['eigen', 'Eigen nummers'], ['covers', 'Coverband'], ['beide', 'Beide']];

let bmzSoort = null;
let bmzGenres = [];
let bmzNummers = [];
let bcCovers = [];
let bmzSnapshot = null;

function bmzFieldSnapshot() {
  return JSON.stringify({
    soort: bmzSoort, genres: bmzGenres,
    nummers: bmzNummers.map(n => [n.id || null, n.titel.trim(), n.url.trim()]).filter(n => n[0] || n[1] || n[2]),
    covers: bcCovers.map(c => [c.id || null, c.title, c.artist])
  });
}

async function openBandMuziek() {
  clearFieldErrors('bandMuziekScreen');
  songZoekLeeg('bc');
  const r = await tegelGegevens('bandMuziek');
  if (!r) return;
  const b = bandTegelBand('bandMuziek', r, r.data);
  if (!b) return;
  bmzZet(b);
  initPicker({
    id: 'bmzGenre', fieldId: 'bmzGenreField', badgeRowId: 'bmzGenreBadgeRow',
    options: GENRES, getList: () => bmzGenres,
    placeholder: 'Kies een genre',
    toevoegen: 'Genre'
  });
  bmzRenderSoort();
  bmzRenderNummers();
  bcRenderCovers();
  bmzSnapshot = bmzFieldSnapshot();
}

function bmzZet(b) {
  bmzSoort = b.soort || null;
  bmzGenres.length = 0;
  (b.genres || []).forEach(g => bmzGenres.push(g));
  bmzNummers = opVolgordeVanToevoegen(b.band_nummers)
    .map(n => ({ id: n.id, titel: n.titel || '', url: n.url || '' }));
  bcCovers = (b.band_covers || []).map(c => ({ id: c.id, title: c.song_title, artist: c.song_artist }));
}

function bmzRenderSoort() {
  document.getElementById('bmzSoort').innerHTML = BAND_SOORT_KEUZES.map(([waarde, label]) =>
    `<button type="button" class="segmented-btn${bmzSoort === waarde ? ' selected' : ''}" onclick="bmzKiesSoort('${waarde}')">${escHtml(label)}</button>`).join('');
}


function bmzKiesSoort(waarde) {
  bmzSoort = bmzSoort === waarde ? null : waarde;
  bmzRenderSoort();
}

function bmzNummerRijHTML(n, i) {
  const veilig = safeUrl(n.url);
  return `
    <div class="media-rij">
      <button type="button" class="media-mini" onclick="bmzSpeel(${i})" aria-label="Afspelen"${veilig ? '' : ' disabled'}>${mediaLinkMiniatuurHTML(n.url)}</button>
      <div class="media-rij-tekst">
        <input type="text" class="nummer-titel" id="bmzTitel${i}" value="${escHtml(n.titel)}" placeholder="Titel van het nummer" aria-label="Titel van het nummer" maxlength="80" autocomplete="off" oninput="bmzNummers[${i}].titel = this.value">
        <input type="url" class="media-rij-url" id="bmzUrl${i}" value="${escHtml(n.url)}" placeholder="https://youtube.com/watch?v=..." aria-label="Link naar het nummer" maxlength="500" oninput="bmzNummers[${i}].url = this.value" onchange="bmzRenderNummers()">
      </div>
      <button type="button" class="song-remove" onclick="bmzNummerWeg(${i})" aria-label="Nummer weghalen">${RIJ_KRUIS}</button>
    </div>`;
}



function bmzRenderNummers() {
  document.getElementById('bmzNummers').innerHTML = bmzNummers.map(bmzNummerRijHTML).join('');
}

function bmzNummerErbij() {
  if (grensBereikt(bmzNummers.length, GRENZEN.eigenNummers, `Maximum van ${GRENZEN.eigenNummers} eigen nummers bereikt.`)) return;
  bmzNummers.push({ id: null, titel: '', url: '' });
  bmzRenderNummers();
  document.getElementById(`bmzTitel${bmzNummers.length - 1}`)?.focus();
}

function bmzNummerWeg(i) {
  bmzNummers.splice(i, 1);
  bmzRenderNummers();
}

function bmzSpeel(i) {
  const n = bmzNummers[i];
  if (!n || !safeUrl(n.url)) return;
  openMediaSpeler(n.url, 'link', n.titel.trim() || null, detectPlatform(n.url));
}


function bcAddCover(title, artist) {
  if (bcCovers.find(c => c.title === title && c.artist === artist)) return;
  if (grensBereikt(bcCovers.length, GRENZEN.covers, `Maximum van ${GRENZEN.covers} covers bereikt.`)) return;
  bcCovers.push({ id: null, title, artist });
  songZoekLeeg('bc');
  bcRenderCovers();
}



function bcRenderCovers() {
  const volgorde = bcCovers.map((c, i) => i)
    .sort((a, b) => compareArtistTitle(bcCovers[a].artist, bcCovers[a].title, bcCovers[b].artist, bcCovers[b].title));
  document.getElementById('bcCoversLijst').innerHTML = volgorde.map(i => {
    const c = bcCovers[i];
    return `<div class="profile-song-row"><span><strong>${escHtml(c.artist)}</strong> — <span style="color:var(--muted)">${escHtml(c.title)}</span></span>${
      c._zeker
        ? `<button type="button" class="song-remove setlist-zeker" onclick="bcCoverWeg(${i})" title="Bevestig weghalen">Zeker?</button>`
        : `<button type="button" class="song-remove" onclick="bcCoverWeg(${i})" title="Weghalen" aria-label="Haal ${escHtml(c.title)} weg">${RIJ_KRUIS}</button>`
    }</div>`;
  }).join('');
  document.getElementById('bcCoversLeeg').hidden = bcCovers.length > 0;
}

function bcCoverWeg(i) {
  if (!bcCovers[i]) return;
  if (!bcCovers[i]._zeker) {
    bcCovers.forEach(c => delete c._zeker);
    bcCovers[i]._zeker = true;
    bcRenderCovers();

    setTimeout(() => {
      document.addEventListener('click', function bcBuiten(e) {
        if (e.target.closest && e.target.closest('.song-remove')) return;
        if (bcCovers.some(c => c._zeker)) { bcCovers.forEach(c => delete c._zeker); bcRenderCovers(); }
      }, { once: true });
    }, 0);
    return;
  }
  bcCovers.splice(i, 1);
  bcRenderCovers();
}

async function saveBandMuziek() {
  clearFieldErrors('bandMuziekScreen');
  const fouten = [];
  if (!bmzGenres.length) fouten.push(['bmzGenreField', 'Kies minimaal één genre']);
  bmzNummers.forEach((n, i) => {
    const titel = n.titel.trim();
    if (!titel && !n.url.trim()) return;


    n.url = metHttps(n.url);
    if (!titel) fouten.push([`bmzTitel${i}`, 'Vul de titel in']);

    if (!n.url) fouten.push([`bmzUrl${i}`, 'Vul een link in die begint met https://']);
    else if (!linkTeOpenen(n.url)) fouten.push([`bmzUrl${i}`, 'Deze link kan niet geopend worden.']);
  });
  if (showFieldErrors(fouten)) return;
  if (bmzFieldSnapshot() === bmzSnapshot) return;
  const id = bewerkBandId;
  if (!id) return;
  try {
    const { error: bErr } = rijenGeraakt(await db.from('bands').update({ soort: bmzSoort, genres: bmzGenres.slice() }).eq('id', id).select('id'));
    if (bErr) throw bErr;




    const eerder = JSON.parse(bmzSnapshot);
    const nummers = bmzNummers.filter(n => n.titel.trim() || n.url.trim());
    const nummerWeg = eerder.nummers.map(n => n[0]).filter(x => x && !nummers.some(n => n.id === x));
    if (nummerWeg.length) {
      const { error } = await db.from('band_nummers').delete().in('id', nummerWeg);
      if (error) throw error;
    }
    for (const n of nummers.filter(n => n.id)) {
      const oud = eerder.nummers.find(x => x[0] === n.id);
      if (oud && oud[1] === n.titel.trim() && oud[2] === n.url.trim()) continue;
      const { error } = await db.from('band_nummers')
        .update({ titel: n.titel.trim(), url: n.url.trim(), platform: detectPlatform(n.url.trim()) }).eq('id', n.id);
      if (error) throw error;
    }
    const nieuweNummers = nummers.filter(n => !n.id);
    if (nieuweNummers.length) {
      const { data: erbij, error } = await db.from('band_nummers').insert(nieuweNummers.map(n =>
        ({ band_id: id, titel: n.titel.trim(), url: n.url.trim(), platform: detectPlatform(n.url.trim()) }))).select('id');
      if (error) throw error;
      idsZetten(nieuweNummers, erbij);
    }
    const coverWeg = eerder.covers.map(c => c[0]).filter(x => x && !bcCovers.some(c => c.id === x));
    if (coverWeg.length) {
      const { error } = await db.from('band_covers').delete().in('id', coverWeg);
      if (error) throw error;
    }
    const nieuweCovers = bcCovers.filter(c => !c.id);
    if (nieuweCovers.length) {
      const { data: erbij, error } = await db.from('band_covers').insert(nieuweCovers.map(c =>
        ({ band_id: id, song_title: c.title, song_artist: c.artist }))).select('id');
      if (error) throw error;
      idsZetten(nieuweCovers, erbij);
    }


    const b = await bandBewerkGegevens('soort, genres, band_nummers(id, titel, url, created_at), band_covers(id, song_title, song_artist)');
    if (!b) return;
    bmzZet(b);
    renderPickerBadges(PICKERS.bmzGenre);
    bmzRenderSoort();
    bmzRenderNummers();
    bcRenderCovers();
    bmzSnapshot = bmzFieldSnapshot();
    showToast('Wijzigingen opgeslagen.');
    mijnBandsVerversen();
    terugNaOpslaan('bandMuziek');
  } catch (e) {
    logCaught('saveBandMuziek', e);
    showToast(friendlyErrorMessage(e, 'de muziek opslaan'));
  }
}






let bmMediaFiles = [];
let bmMediaLinks = [];
let bmSnapshot = null;
let bmFotoUrl = null;
let bmFotoBron = null, bmFotoKader = null;
let bmFotoBezig = false;
let bmOrigineel = [];

function bmFieldSnapshot() {
  return JSON.stringify({
    files: bmMediaFiles.map(m => [m.id || null, m.url, m.type, !!m.uploading, !!m.inBanner, m.uitsnede || null]),
    links: bmMediaLinks.map(l => [l.id || null, l.url, !!l.inBanner]),
    instagram: waardeVan('bmInstagram'), tiktok: waardeVan('bmTiktok'), youtube: waardeVan('bmYoutube'),
    foto: bmFotoUrl || null
  });
}

async function openBandMedia() {
  clearFieldErrors('bandMediaScreen');
  const r = await tegelGegevens('bandMedia');
  if (!r) return;
  const b = bandTegelBand('bandMedia', r, r.data);
  if (!b) return;
  bmZet(b);
  bmSnapshot = bmFieldSnapshot();
}

function bmZet(b) {
  const rijen = opVolgordeVanToevoegen(b.band_media);
  bmOrigineel = rijen.map(r => [r.id, r.url, !!r.in_banner, JSON.stringify(uitsnedeGeldig(r.uitsnede))]);
  bmMediaFiles = rijen.filter(r => r.media_type === 'foto' || r.media_type === 'video')
    .map(r => ({ id: r.id, name: '', url: r.url, path: null, type: r.media_type, uploading: false, inBanner: !!r.in_banner, uitsnede: r.uitsnede || null }));
  bmMediaLinks = rijen.filter(r => r.media_type === 'link').map(r => ({ id: r.id, url: r.url, inBanner: !!r.in_banner }));
  document.getElementById('bmInstagram').value = b.instagram || '';
  document.getElementById('bmTiktok').value = b.tiktok || '';
  document.getElementById('bmYoutube').value = b.youtube || '';
  bmFotoUrl = b.avatar_url || null;
  bmFotoBron = b.avatar_bron || null;
  bmFotoKader = b.avatar_kader || null;
  bmFotoBezig = false;
  bmRenderFoto();
  bmRenderMediaGrid();
}

function bmRenderFoto() {
  const vak = document.getElementById('bmFotoPreview');
  const url = safeUrl(bmFotoUrl);
  vak.innerHTML = url ? `<img ${kleinFotoAttr(url)} alt="bandfoto">` : '';
  document.getElementById('bmFotoRemoveBtn').classList.toggle('visible', !!url);
}

async function bmFotoKiezen(file) {
  if (!file) return;
  const typeProblem = fileTypeProblem(file, AVATAR_MIME_TYPES, AVATAR_TYPE_LABEL);
  if (typeProblem) { showToast(typeProblem); return; }
  { const groot = bestandTeGrootMelding(file, 5 * 1024 * 1024); if (groot) { showToast(groot); return; } }
  const id = bewerkBandId;
  const uit = await kiesUitsnede(file, 'vierkant');
  if (uit && id === bewerkBandId) bmFotoZetten({ file: uit, kader: uit.kader, bron: file });
}


async function bmFotoTik() {
  if (!bmFotoUrl) { document.getElementById('bmFotoInput').click(); return; }
  const id = bewerkBandId;
  const uit = await fotoVerschuiven({ url: bmFotoUrl, bron: bmFotoBron, kader: bmFotoKader }, 'vierkant');
  if (uit && id === bewerkBandId) bmFotoZetten(uit);
}


function bmFotoZetten(uit) {
  const id = bewerkBandId, file = uit.file;
  const vak = document.getElementById('bmFotoPreview');
  vak.style.position = 'relative';
  vak.innerHTML = `<img src="${URL.createObjectURL(file)}" alt="bandfoto">
    <div class="avatar-uploading" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.4);border-radius:12px;">
      <div class="save-spinner" style="width:24px;height:24px;border-width:3px;margin:0;"></div>
    </div>`;
  bmFotoBezig = true;
  fotoMetBronUploaden(uit, 'bands/' + id).then(({ url, bron, kader }) => {
    bmFotoBezig = false;
    if (id !== bewerkBandId) return;
    bmFotoUrl = url;
    bmFotoBron = bron;
    bmFotoKader = kader;
    bmRenderFoto();
  }).catch(e => {
    bmFotoBezig = false;
    logCaught('bmFotoKiezen', e);
    showToast(friendlyErrorMessage(e, 'de foto uploaden'));
    bmRenderFoto();
  });
}





function bmVraagFotoWeg() {
  showConfirm('Bandfoto verwijderen?', () => { bmFotoUrl = bmFotoBron = bmFotoKader = null; bmRenderFoto(); }, 'Ja, verwijderen');
}



function bmMediaToevoegenKeuze(sel) {
  mediaToevoegenStart(sel, bmMediaFiles, bmMediaLinks, 'bmMediaInvoer', url => {
    bmMediaLinks.push({ id: null, url, inBanner: false });
    bmRenderMediaGrid();
  });
}

function bmHandleFileSelect(files) {
  const id = bewerkBandId;
  Array.from(files).forEach(file => {
    if (bmMediaFiles.length >= GRENZEN.beeld) { showToast(`Maximum van ${GRENZEN.beeld} bestanden bereikt.`); return; }
    const isVideo = (file.type || '').toLowerCase().startsWith('video/');
    const typeProblem = fileTypeProblem(file, MEDIA_MIME_TYPES, MEDIA_TYPE_LABEL);
    if (typeProblem) { showToast(`"${file.name}": ${typeProblem}`); return; }
    { const groot = bestandTeGrootMelding(file, 50 * 1024 * 1024); if (groot) { showToast(groot, isVideo ? VIDEO_TE_GROOT_MS : undefined); return; } }
    const entry = { id: null, name: file.name, url: URL.createObjectURL(file), path: null, type: isVideo ? 'video' : 'foto', uploading: true, inBanner: false };
    bmMediaFiles.push(entry);
    bmRenderMediaGrid();
    uploadMediaFile(file, 'bands/' + id).then(({ url, path }) => {
      entry.url = url;
      entry.path = path;
      entry.uploading = false;
      bmRenderMediaGrid();
    }).catch(e => {
      logCaught('bmUploadMedia', e);
      showToast(`"${file.name}": ${friendlyErrorMessage(e, 'het bestand uploaden')}`);
      const idx = bmMediaFiles.indexOf(entry);
      if (idx !== -1) bmMediaFiles.splice(idx, 1);
      bmRenderMediaGrid();
    });
  });
}


function bmRenderMediaGrid() {
  document.getElementById('bmMediaGrid').innerHTML = mediaRasterHTML(bmMediaFiles, bmMediaLinks, 'bm');
  bannerTellerBijwerken('bmBannerTeller', bmMediaFiles, bmMediaLinks);
}

function bmToggleMediaBanner(i) {
  return bannerTekenTik(bmMediaFiles[i], bmMediaFiles, bmMediaLinks, 'bmMediaGrid', 'bmBannerTeller');
}

function bmSpeelMedia(i) {
  mediaTegelTik(bmMediaFiles[i]);
}



function bmRemoveMedia(i) {
  const entry = bmMediaFiles[i];
  bmMediaFiles.splice(i, 1);
  bmRenderMediaGrid();
  if (entry && entry.path) {
    db.storage.from('media').remove([entry.path, fotoKleinPad(entry.path)]).then(() => {}, e => logCaught('bmRemoveMedia', e));
  }
}

function bmToggleLinkBanner(i) {
  linkBannerTik(bmMediaLinks[i], i, bmMediaFiles, bmMediaLinks, 'bmMediaGrid', 'bmBannerTeller');
}

function bmSpeelLink(i) {
  const l = bmMediaLinks[i];
  if (!l || !l.url.trim()) return;
  openMediaSpeler(l.url, 'link', null, detectPlatform(l.url));
}

function bmRemoveLink(i) {
  bmMediaLinks.splice(i, 1);
  bmRenderMediaGrid();
}

const BAND_SOCIAL_VELDEN = { instagram: 'bmInstagram', tiktok: 'bmTiktok', youtube: 'bmYoutube' };

async function saveBandMedia() {
  clearFieldErrors('bandMediaScreen');


  const fouten = [];
  BAND_SOCIALS.forEach(soc => {


    const veld = document.getElementById(BAND_SOCIAL_VELDEN[soc.veld]);
    if (veld && /^(www\.|[^/\s]+\.[^/\s]+\/)/i.test(veld.value.trim())) veld.value = metHttps(veld.value);
    const waarde = waardeVan(BAND_SOCIAL_VELDEN[soc.veld]);
    if (waarde && !bandSocialLink(soc, waarde)) {
      fouten.push([BAND_SOCIAL_VELDEN[soc.veld], 'Vul een gebruikersnaam in, of een link die begint met https://']);
    }
  });
  if (showFieldErrors(fouten)) return;
  if (bmFotoBezig) { showToast('De bandfoto wordt nog geüpload. Even geduld.'); return; }
  if (bmMediaFiles.some(m => m.uploading)) { showToast('Er wordt nog een bestand geüpload. Even geduld.'); return; }
  if (bmFieldSnapshot() === bmSnapshot) return;
  const id = bewerkBandId;
  if (!id) return;
  try {
    const { error: sErr } = rijenGeraakt(await db.from('bands').update({
      instagram: waardeVan('bmInstagram') || null,
      tiktok: waardeVan('bmTiktok') || null,
      youtube: waardeVan('bmYoutube') || null,
      avatar_url: bmFotoUrl || null,
      ...wazigVeld(bmFotoUrl),
      avatar_bron: bmFotoUrl ? bmFotoBron : null,
      avatar_kader: bmFotoUrl ? bmFotoKader : null
    }).eq('id', id).select('id'));
    if (sErr) throw sErr;
    opslagOpruimen('avatars', 'bands/' + id, [bmFotoUrl, bmFotoBron]);




    const nu = bmMediaFiles.filter(m => m.url && !m.url.startsWith('blob:'))
      .map(m => ({ bron: m, id: m.id, media_type: m.type, url: m.url, platform: null, in_banner: !!m.inBanner, uitsnede: bannerKader(m) }))
      .concat(bmMediaLinks.filter(l => l.url.trim())
        .map(l => ({ bron: l, id: l.id, media_type: 'link', url: l.url.trim(), platform: detectPlatform(l.url.trim()), in_banner: !!l.inBanner, uitsnede: null })));
    const weg = bmOrigineel.map(r => r[0]).filter(x => !nu.some(m => m.id === x));
    if (weg.length) {
      const { error } = await db.from('band_media').delete().in('id', weg);
      if (error) throw error;
    }
    for (const m of nu.filter(m => m.id)) {
      const oud = bmOrigineel.find(r => r[0] === m.id);
      if (oud && oud[1] === m.url && oud[2] === m.in_banner && oud[3] === JSON.stringify(m.uitsnede)) continue;
      const { error } = await db.from('band_media').update({ url: m.url, platform: m.platform, in_banner: m.in_banner, uitsnede: m.uitsnede }).eq('id', m.id);
      if (error) throw error;
    }
    const nieuw = nu.filter(m => !m.id);
    if (nieuw.length) {
      const { data: erbij, error } = await db.from('band_media').insert(nieuw.map(m =>
        ({ band_id: id, media_type: m.media_type, url: m.url, platform: m.platform, in_banner: m.in_banner, uitsnede: m.uitsnede, wazig: wazigVoor(m.url) }))).select('id');
      if (error) throw error;
      idsZetten(nieuw.map(m => m.bron), erbij);
    }
    opslagOpruimen('media', 'bands/' + id, nu.map(m => m.url));

    const b = await bandBewerkGegevens('avatar_url, avatar_bron, avatar_kader, instagram, tiktok, youtube, band_media(id, media_type, url, platform, in_banner, created_at, uitsnede)');
    if (!b) return;
    bmZet(b);
    bmSnapshot = bmFieldSnapshot();
    showToast('Wijzigingen opgeslagen.');
    mijnBandsVerversen();
    terugNaOpslaan('bandMedia');
  } catch (e) {
    logCaught('saveBandMedia', e);
    showToast(friendlyErrorMessage(e, 'de media opslaan'));
  }
}









let zoekRolBand = null;

async function rolUitnodigKnopPlaatsen(musicianId, naam) {
  const band = zoekRolBand;


  const voet = document.getElementById('profielSchermActie');
  if (!band || !hasOwnProfile || !voet || !musicianId || musicianId === myMusicianId) return;
  if (typeof blokkeerIkZelf === 'function' && blokkeerIkZelf(musicianId)) return;



  const [leden, wil] = await Promise.all([
    db.from('band_members').select('status').eq('band_id', band.id).eq('musician_id', musicianId),
    db.from('musicians').select('stand').eq('id', musicianId).maybeSingle()
  ]);
  if (leden.error) { logCaught('rolUitnodigKnopPlaatsen', leden.error); return; }
  if (wil.error) { logCaught('rolUitnodigKnopPlaatsen', wil.error); return; }
  if (zoekRolBand !== band || (leden.data || []).length || (wil.data && wil.data.stand && wil.data.stand !== 'actief')) return;
  if (voet.querySelector('.rol-uitnodig-knop')) return;
  voet.insertAdjacentHTML('afterbegin',
    `<button class="btn btn-ghost rol-uitnodig-knop" onclick="rolUitnodigBlokOpenen('${jsAttr(musicianId)}', '${jsAttr(naam || '')}')">Uitnodigen voor ${escHtml(band.naam)}</button>`);
}












let uitnodigRollen = [];
function rolUitnodigBlokOpenen(musicianId, naam) {
  const band = zoekRolBand;
  const content = document.getElementById('profielSchermContent');
  const hoes = content?.querySelector('.hoes');
  if (!band || !hoes) return;
  content.querySelector('.uitnodig-blok')?.remove();
  hoes.insertAdjacentHTML('afterend', `
    <section class="uitnodig-blok">
      <h2 class="hoofdstuk-kop">${escHtml(naam)} uitnodigen voor ${escHtml(band.naam)}</h2>
      <div class="field">
        <label>Rol in ${escHtml(band.naam)}</label>
        <div class="menu-anchor">
          <div class="wheel-field" id="uitnodigRolVeld" aria-label="Rol in ${escHtml(band.naam)}">
            <span class="wheel-field-label" id="uitnodigRolVeldLabel"></span>
          </div>
          <div class="choice-menu menu-breed" id="uitnodigRolMenu" role="listbox" aria-label="Rol"></div>
        </div>
      </div>
      <div class="field">
        <label for="uitnodigBoodschap">Boodschap aan ${escHtml(naam)} (niet verplicht)</label>
        <textarea id="uitnodigBoodschap" maxlength="300" placeholder="Bijv. we zoeken een bassist voor onze covers, jouw profiel past goed bij ons!"></textarea>
      </div>
      <div class="uitnodig-knoppen">
        <button type="button" class="btn btn-primary" onclick="rolUitnodigen('${jsAttr(musicianId)}', this)">Uitnodiging versturen</button>
        <button type="button" class="btn btn-ghost" onclick="rolUitnodigBlokSluiten()">Annuleren</button>
      </div>
    </section>`);
  uitnodigRollen = band.rol && INSTRUMENTS.includes(band.rol) ? [band.rol] : [];
  initPicker({
    id: 'uitnodigRol', fieldId: 'uitnodigRolVeld', menuId: 'uitnodigRolMenu',
    options: INSTRUMENTS, getList: () => uitnodigRollen,
    inVeld: lijst => lijst.join(', '), leegTekst: 'Kies een rol'
  });
  content.classList.add('uitnodig-open');
  veldGroeiVolgen(document.getElementById('uitnodigBoodschap'));
  window.scrollTo({ top: 0, behavior: 'instant' });
}

function rolUitnodigBlokSluiten() {
  const content = document.getElementById('profielSchermContent');
  if (!content) return;
  content.querySelector('.uitnodig-blok')?.remove();
  content.classList.remove('uitnodig-open');
}

async function rolUitnodigen(musicianId, knop) {
  const band = zoekRolBand;
  if (!band) return;
  if (knop) knop.disabled = true;
  const boodschap = document.getElementById('uitnodigBoodschap')?.value || '';
  if (showFieldErrors(uitnodigRollen.length ? [] : [['uitnodigRolVeld', 'Kies minstens één rol']])) {
    if (knop) knop.disabled = false;
    return;
  }
  const gelukt = await addBandMember(band, musicianId, boodschap, uitnodigRollen.slice());
  if (knop) knop.disabled = false;
  if (!gelukt) return;
  rolUitnodigBlokSluiten();
  document.querySelector('#profielSchermActie .rol-uitnodig-knop')?.remove();
}




saveBandWie = slotOm(saveBandWie);
saveBandBezetting = slotOm(saveBandBezetting);
saveBandMuziek = slotOm(saveBandMuziek);
saveBandMedia = slotOm(saveBandMedia);
respondToBandInvite = slotOm(respondToBandInvite);
respondToFounderOffer = slotOm(respondToFounderOffer);
sendFounderOffer = slotOm(sendFounderOffer);
withdrawFounderOffer = slotOm(withdrawFounderOffer);
executeLeaveBand = slotOm(executeLeaveBand);
executeRemoveMember = slotOm(executeRemoveMember);
bbIntrekken = slotOm(bbIntrekken);
zetBandStand = slotOm(zetBandStand);
showCreateBandForm = slotOm(showCreateBandForm);
openOverdragen = slotOm(openOverdragen);
vraagBandVerwijderen = slotOm(vraagBandVerwijderen);
dissolveBand = slotOm(dissolveBand);
