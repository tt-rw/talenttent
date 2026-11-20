




















const MELD_REDENEN = [
  'Ongepast gedrag',
  'Ongewenste berichten',
  'Nep of misleidend profiel',
  'Haat of discriminatie',
  'Iets anders',
];

const MELD_TOELICHTING_MAX = 1000;





let blokkadeDoorMij = new Set();
let blokkadeOpMij = new Set();
let blokkadesGeladen = false;


let blokkadesVraag = null;


let meldDoel = null;
let meldReden = null;



async function laadBlokkades() {
  blokkadeDoorMij = new Set();
  blokkadeOpMij = new Set();
  blokkadesGeladen = true;
  const vraag = (async () => {
    const mid = await getMyMusicianId();
    if (!mid) return;
    try {


      const [mijne, opMij] = await Promise.all([
        db.from('musician_blocks').select('blocked_id').eq('blocker_id', mid),
        db.from('musician_blocks').select('blocker_id').eq('blocked_id', mid),
      ]);
      if (mijne.error) throw mijne.error;
      if (opMij.error) throw opMij.error;
      if (blokkadesVraag !== vraag) return;
      (mijne.data || []).forEach(r => blokkadeDoorMij.add(r.blocked_id));
      (opMij.data || []).forEach(r => blokkadeOpMij.add(r.blocker_id));
    } catch (e) {
      logCaught('laadBlokkades', e);


      showToast('Je blokkades konden niet geladen worden. Ververs de pagina.');
    }
  })();
  blokkadesVraag = vraag;
  try { await vraag; } finally { if (blokkadesVraag === vraag) blokkadesVraag = null; }
}




async function laadBlokkadesIndienNodig() {
  if (blokkadesVraag) { await blokkadesVraag; return; }
  if (blokkadesGeladen) return;
  await laadBlokkades();
}

function wisBlokkades() {
  blokkadeDoorMij = new Set();
  blokkadeOpMij = new Set();
  blokkadesGeladen = false;
  blokkadesVraag = null;
}




function isGeblokkeerd(id) {
  return blokkadeDoorMij.has(id) || blokkadeOpMij.has(id);
}


function blokkeerIkZelf(id) {
  return blokkadeDoorMij.has(id);
}



function blokkeerMuzikant(id, naam) {
  const wie = naam || 'deze muzikant';
  showConfirm(
    `Je ziet ${wie} niet meer in de zoekresultaten, en berichten van ${wie} komen niet meer bij je aan. ${wie} krijgt hier geen melding van. Je kunt dit later terugdraaien in Instellingen.`,
    () => blokkeerMuzikantUitvoeren(id, wie),
    'Blokkeren'
  );
}

async function blokkeerMuzikantUitvoeren(id, wie) {
  const mid = await getMyMusicianId();
  if (!mid) { showToast('Maak eerst een profiel aan.'); return; }
  if (id === mid) { showToast('Je kunt jezelf niet blokkeren.'); return; }
  try {
    const { error } = await db.from('musician_blocks')
      .insert({ blocker_id: mid, blocked_id: id });
    if (error) throw error;
  } catch (e) {
    logCaught('blokkeerMuzikant', e);
    showToast(friendlyErrorMessage(e, 'deze muzikant blokkeren'));
    return;
  }
  blokkadeDoorMij.add(id);
  naBlokkadeWijziging(id);
  showToast(`${wie} is geblokkeerd.`);
}

async function deblokkeerMuzikant(id, naam) {
  const mid = await getMyMusicianId();
  if (!mid) return;
  try {
    const { error } = await db.from('musician_blocks')
      .delete().eq('blocker_id', mid).eq('blocked_id', id);
    if (error) throw error;
  } catch (e) {
    logCaught('deblokkeerMuzikant', e);
    showToast(friendlyErrorMessage(e, 'de blokkade opheffen'));
    return;
  }
  blokkadeDoorMij.delete(id);
  naBlokkadeWijziging(id);
  showToast(`${naam || 'Deze muzikant'} is niet meer geblokkeerd.`);
  if (document.getElementById('geblokkeerdModal')?.classList.contains('visible')) {
    renderGeblokkeerdLijst();
  }
}




function naBlokkadeWijziging(id) {

  if (huidigeView === 'profiel' && huidigProfielId === id) {
    popNavStap('search');
  }
  if (typeof activeConversationId !== 'undefined' && activeConversationId === id) {
    closeConversation();
  } else if (document.getElementById('view-messages')?.classList.contains('active')) {
    loadInbox();
  }
  refreshUnreadBadge();
  veiligheidVerversZoeklijsten();
}





function veiligheidVerversZoeklijsten() {
  try {


    if (typeof lastZoekResultaten !== 'undefined' && lastZoekResultaten.length) {
      const over = lastZoekResultaten.filter(x => x.soort === 'band' || !isGeblokkeerd(x.id));
      if (over.length !== lastZoekResultaten.length) {
        lastZoekResultaten = over;
        if (over.length) renderCappedZoekResultaten(); else runSearch();
      }
    }
    if (typeof lastSetlistResults !== 'undefined' && lastSetlistResults.length) {
      const over = lastSetlistResults.filter(m => !isGeblokkeerd(m.id));
      if (over.length !== lastSetlistResults.length) {
        lastSetlistResults = over;
        if (over.length) renderCappedSetlistResults(); else runSetlistSearch();
      }
    }
  } catch (e) {
    logCaught('veiligheidVerversZoeklijsten', e);
  }
}











const VEILIGHEID_MENU_ICOON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' +
  '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>';

function veiligheidMenuHTML(soort, id, naam, verwijderId) {


  if (!hasOwnProfile) return '';
  if (!id && !verwijderId) return '';
  if (id && soort !== 'band' && typeof myMusicianId !== 'undefined' && myMusicianId === id) return '';

  const veiligNaam = jsAttr(naam || '');
  const items = [];
  if (id) {
    const veiligId = jsAttr(id);
    const meldLabel = soort === 'band' ? 'Band melden' : 'Muzikant melden';
    items.push(`<button class="nav-menu-item" onclick="sluitVeiligheidMenus();openMeldModal('${jsAttr(soort)}','${veiligId}','${veiligNaam}')">${escHtml(meldLabel)}</button>`);
    if (soort !== 'band') {
      items.push(blokkeerIkZelf(id)
        ? `<button class="nav-menu-item" onclick="sluitVeiligheidMenus();deblokkeerMuzikant('${veiligId}','${veiligNaam}')">Blokkade opheffen</button>`
        : `<button class="nav-menu-item" onclick="sluitVeiligheidMenus();blokkeerMuzikant('${veiligId}','${veiligNaam}')">Blokkeren</button>`);
    }
  }


  if (verwijderId) {
    items.push(`<button class="nav-menu-item" onclick="sluitVeiligheidMenus();gesprekVerwijderen('${jsAttr(verwijderId)}','${veiligNaam}')">Gesprek verwijderen</button>`);
  }
  return `
    <div class="profile-actions-menu-wrap veiligheid-menu-wrap">
      <button class="nav-menu-btn" onclick="toggleVeiligheidMenu(event)" aria-label="Meer opties" title="Meer">${VEILIGHEID_MENU_ICOON}</button>
      <div class="inline-menu-dropdown">${items.join('')}</div>
    </div>`;
}




function toggleVeiligheidMenu(e) {
  e.stopPropagation();
  const btn = e.currentTarget;
  const dd = btn.nextElementSibling;
  const opening = !dd.classList.contains('visible');
  sluitAlleMenus();
  if (!opening) return;
  dd.classList.add('visible');
  btn.classList.add('active');
  menuLaagOpen(dd);
}

function sluitVeiligheidMenus() {
  const open = document.querySelectorAll('.veiligheid-menu-wrap .inline-menu-dropdown.visible');
  if (!open.length) return;
  open.forEach(dd => dd.classList.remove('visible'));
  document.querySelectorAll('.veiligheid-menu-wrap .nav-menu-btn.active')
    .forEach(b => b.classList.remove('active'));
  menuLaagWeg();
}


function zetVeiligheidMenu(plekId, soort, id, naam, verwijderId) {
  const plek = document.getElementById(plekId);
  if (!plek) return;
  plek.innerHTML = veiligheidMenuHTML(soort, id, naam, verwijderId);
}







async function openMeldModal(soort, id, naam) {
  if (id && await alGemeld(id)) { naMelding(soort, id, naam, true); return; }
  meldDoel = { soort, id, naam: naam || '' };
  meldReden = null;
  clearFieldErrors('meldModal');
  const wat = soort === 'band' ? 'Band melden' : soort === 'gesprek' ? 'Gesprek melden' : 'Muzikant melden';
  document.getElementById('meldTitel').textContent = wat;
  document.getElementById('meldDoelNaam').textContent = meldDoel.naam || 'deze pagina';
  document.getElementById('meldToelichting').value = '';
  veldGroeit(document.getElementById('meldToelichting'));
  updateCharCounter('meldToelichting', 'meldToelichtingCounter', MELD_TOELICHTING_MAX);
  document.getElementById('meldRedenen').innerHTML = MELD_REDENEN.map(r =>
    `<div class="tag" onclick="kiesMeldReden(this,'${jsAttr(r)}')">${escHtml(r)}</div>`).join('');
  document.getElementById('meldModal').classList.add('visible');
}

function closeMeldModal() {
  document.getElementById('meldModal').classList.remove('visible');
  meldDoel = null;
  meldReden = null;
}

function kiesMeldReden(el, reden) {
  meldReden = reden;
  clearFieldError('meldRedenen');
  document.querySelectorAll('#meldRedenen .tag').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');
}

async function verstuurMelding() {
  if (!meldDoel) return;


  if (!meldReden) { showFieldErrors([['meldRedenen', 'Kies waar je melding over gaat']]); return; }
  const mid = await getMyMusicianId();
  if (!mid) { showToast('Maak eerst een profiel aan om te kunnen melden.'); return; }
  const doel = meldDoel;
  try {
    const { error } = await db.from('musician_reports').insert({
      reporter_id: mid,
      target_type: doel.soort,
      target_id: doel.id,
      reason: meldReden,
      note: (document.getElementById('meldToelichting').value || '').trim() || null,
    });
    if (error) throw error;
  } catch (e) {


    if (/^Je hebt dit al gemeld/i.test((e && e.message) || '')) {
      closeMeldModal();
      naMelding(doel.soort, doel.id, doel.naam, true);
      return;
    }
    logCaught('verstuurMelding', e);
    showToast(friendlyErrorMessage(e, 'je melding versturen'));
    return;
  }
  closeMeldModal();
  naMelding(doel.soort, doel.id, doel.naam, false);
}



async function alGemeld(id) {
  try {
    const { data, error } = await db.rpc('tt_al_gemeld', { p_doel: id });
    if (error) throw error;
    return data === true;
  } catch (e) {
    logCaught('alGemeld', e);
    return false;
  }
}




function naMelding(soort, id, naam, alEerder) {
  const wie = naam || (soort === 'band' ? 'deze band' : 'deze muzikant');
  const kop = alEerder ? `Je hebt ${wie} al gemeld. We kijken ernaar.` : 'Bedankt. We kijken ernaar.';
  if (soort === 'band' || !id || blokkeerIkZelf(id)) { showToast(kop); return; }
  showConfirm(
    `${kop} Wil je ${wie} ook blokkeren? Berichten komen dan niet meer bij je aan. De ander merkt daar niets van.`,
    () => blokkeerMuzikantUitvoeren(id, wie),
    'Blokkeren', false, 'Niet nu'
  );
}



async function openGeblokkeerdModal() {
  document.getElementById('geblokkeerdModal').classList.add('visible');
  document.getElementById('geblokkeerdLijst').innerHTML =
    '<div style="text-align:center;padding:40px;color:var(--muted);">Laden...</div>';
  await laadBlokkades();
  renderGeblokkeerdLijst();
}

function closeGeblokkeerdModal() {
  document.getElementById('geblokkeerdModal').classList.remove('visible');
}

async function renderGeblokkeerdLijst() {
  const el = document.getElementById('geblokkeerdLijst');
  if (!el) return;
  const ids = Array.from(blokkadeDoorMij);
  if (!ids.length) {



    el.innerHTML = emptyStateHTML(
      'Je blokkeert niemand',
      'Blokkeren kan via de knop ⋯ op een profiel of in een gesprek.'
    );
    return;
  }
  try {
    const { data, error } = await db.from('musicians')
      .select('id, weergavenaam, username, city, avatar_url').in('id', ids);
    if (error) throw error;


    const rijen = ids.map(id => {
      const m = (data || []).find(x => x.id === id);
      const naam = m ? displayNameOf(m) : 'Verwijderde gebruiker';
      const plaats = m && m.city ? m.city : '';
      return `
        <div class="bb-rij">${bbFotoHTML(m ? m.avatar_url : null)}<span class="bb-tekst"><span class="bb-naam">${escHtml(naam)}</span>${plaats ? `<span class="bb-sub">${escHtml(plaats)}</span>` : ''}</span>
          <button class="btn btn-ghost geblokkeerd-knop" onclick="deblokkeerMuzikant('${jsAttr(id)}','${jsAttr(naam)}')">Opheffen</button>
        </div>`;
    }).join('');
    el.innerHTML = rijen;
  } catch (e) {
    logCaught('renderGeblokkeerdLijst', e);
    el.innerHTML = foutStaatHTML(e, 'je lijst laden', 'renderGeblokkeerdLijst()');
  }
}




verstuurMelding = slotOm(verstuurMelding);
