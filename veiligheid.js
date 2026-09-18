// ─── Melden en blokkeren (TT-06) ─────────────────────────────────────────────
//
// Eén bestand voor beide. Reden: melden en blokkeren delen hetzelfde menu,
// dezelfde doelen (muzikant, band, gesprek) en dezelfde twee tabellen. Verdeeld
// over messages.js/musicians.js/search.js zou dezelfde regel op drie plekken
// staan — precies wat huisstijl §18.2 en §15 verbieden.
//
// Besluiten van Ronald, 18-09-2026 (de drie punten die sinds 08-08-2026
// openstonden, plus een vierde):
//   1. Blokkeren = geen berichten meer én wederzijds onzichtbaar in de
//      zoekresultaten. Het gesprek verdwijnt uit de inbox van wie blokkeert.
//   2. Een melding komt in een tabel in de database. Geen e-mail; die weg
//      leunt op TT-01 en die werkt nog niet aantoonbaar.
//   3. Melden kan over een muzikant, een band en een gesprek.
//   4. Stil: de ander krijgt geen melding. Zijn bericht lijkt te versturen.
//
// Hoe "stil" technisch werkt: het bericht wordt gewoon weggeschreven. De
// ontvanger filtert het eruit. Zo ziet de verzender zijn eigen gesprek
// ongewijzigd — precies wat een blokkade onzichtbaar houdt. Een weigering bij
// het versturen zou hem juist verraden.

const MELD_REDENEN = [
  'Ongepast gedrag',
  'Ongewenste berichten',
  'Nep of misleidend profiel',
  'Haat of discriminatie',
  'Iets anders',
];

const MELD_TOELICHTING_MAX = 1000;

// Twee richtingen, apart gehouden. blokkadeDoorMij bepaalt wat ik in mijn
// inbox en in "Geblokkeerde muzikanten" zie; blokkadeOpMij bepaalt alleen dat
// ik die persoon niet meer in zoekresultaten tegenkom. Samengevoegd tot één
// verzameling zou deblokkeren ook andermans blokkade kunnen "opheffen".
let blokkadeDoorMij = new Set();
let blokkadeOpMij = new Set();
let blokkadesGeladen = false;

// Doel van de melding die nu openstaat: { soort, id, naam }.
let meldDoel = null;
let meldReden = null;

// ─── Laden en opruimen ───────────────────────────────────────────────────────

async function laadBlokkades() {
  blokkadeDoorMij = new Set();
  blokkadeOpMij = new Set();
  blokkadesGeladen = true;
  const mid = await getMyMusicianId();
  if (!mid) return;
  try {
    // TT-71: twee geparametriseerde .eq()-vragen, geen zelfgebouwde
    // filterstring met .or() — zelfde aanpak als loadInbox().
    const [mijne, opMij] = await Promise.all([
      db.from('musician_blocks').select('blocked_id').eq('blocker_id', mid),
      db.from('musician_blocks').select('blocker_id').eq('blocked_id', mid),
    ]);
    if (mijne.error) throw mijne.error;
    if (opMij.error) throw opMij.error;
    (mijne.data || []).forEach(r => blokkadeDoorMij.add(r.blocked_id));
    (opMij.data || []).forEach(r => blokkadeOpMij.add(r.blocker_id));
  } catch (e) {
    logCaught('laadBlokkades', e);
    // Stil falen mag hier niet: zonder blokkadelijst ziet iemand precies de
    // persoon terug die hij heeft geblokkeerd. Daarom een melding.
    showToast('Je blokkades konden niet geladen worden. Ververs de pagina.');
  }
}

// Het zoekscherm is ook zonder inloggen bereikbaar, en kan geopend worden
// vóórdat onUserLoggedIn() de lijst heeft geladen. Deze variant haalt hem dan
// alsnog op, en doet daarna niets meer.
async function laadBlokkadesIndienNodig() {
  if (blokkadesGeladen) return;
  await laadBlokkades();
}

function wisBlokkades() {
  blokkadeDoorMij = new Set();
  blokkadeOpMij = new Set();
  blokkadesGeladen = false;
}

// ─── Toetsen ─────────────────────────────────────────────────────────────────

// Waar of onwaar in beide richtingen: gebruikt door elk zoekresultaat.
function isGeblokkeerd(id) {
  return blokkadeDoorMij.has(id) || blokkadeOpMij.has(id);
}

// Alleen mijn eigen blokkade: bepaalt het menu-label en de inbox.
function blokkeerIkZelf(id) {
  return blokkadeDoorMij.has(id);
}

// ─── Blokkeren en deblokkeren ────────────────────────────────────────────────

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
    showToast(friendlyErrorMessage(e));
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
    showToast(friendlyErrorMessage(e));
    return;
  }
  blokkadeDoorMij.delete(id);
  naBlokkadeWijziging(id);
  showToast(`${naam || 'Deze muzikant'} is niet meer geblokkeerd.`);
  if (document.getElementById('geblokkeerdModal')?.classList.contains('visible')) {
    renderGeblokkeerdLijst();
  }
}

// Eén plek die opruimt na een blokkade of deblokkade: het open profiel sluit,
// het open gesprek sluit, en de lijsten die de geblokkeerde konden tonen
// worden opnieuw opgebouwd.
function naBlokkadeWijziging(id) {
  const profielModal = document.getElementById('musicianModal');
  if (profielModal && profielModal.classList.contains('visible')) {
    profielModal.classList.remove('visible');
  }
  if (typeof activeConversationId !== 'undefined' && activeConversationId === id) {
    closeConversation();
  } else if (document.getElementById('view-messages')?.classList.contains('active')) {
    loadInbox();
  }
  refreshUnreadBadge();
  veiligheidVerversZoeklijsten();
}

// De lijsten die al op het scherm staan, opnieuw opbouwen zonder de
// geblokkeerde. Blijft er niets over, dan opnieuw zoeken — TT-62 zegt dat een
// zoekopdracht nooit op nul eindigt zolang verruimen kan, en dat geldt ook als
// de nul door een blokkade ontstaat.
function veiligheidVerversZoeklijsten() {
  try {
    if (typeof lastMusicianResults !== 'undefined' && lastMusicianResults.length) {
      const over = lastMusicianResults.filter(m => !isGeblokkeerd(m.id));
      if (over.length !== lastMusicianResults.length) {
        lastMusicianResults = over;
        if (over.length) renderCappedMusicianResults(); else runSearch();
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

// ─── Het ⋯-menu (huisstijl §8) ───────────────────────────────────────────────
//
// Melden en blokkeren zijn gevoelige, weinig gebruikte acties. Ze horen dus
// achter een ⋯-knop, nooit als knop naast "Stuur een bericht". Het menu staat
// in de koprij van de modal (§9) en in de kop van een gesprek: een vaste plek
// die niet verschuift met de lengte van een naam (§2.1).
//
// Elk menu draagt zijn eigen doel in de onclick mee. Eén vast doel in een
// variabele zou misgaan zodra het profielvenster over een open gesprek staat.

const VEILIGHEID_MENU_ICOON =
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
  '<circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>';

function veiligheidMenuHTML(soort, id, naam) {
  // Zonder eigen profiel is er niemand om de melding aan te hangen en niets om
  // vanaf te blokkeren. Dan hoort het menu er ook niet te staan.
  if (!hasOwnProfile) return '';
  if (!id) return '';
  if (soort !== 'band' && typeof myMusicianId !== 'undefined' && myMusicianId === id) return '';

  const veiligNaam = jsAttr(naam || '');
  const veiligId = jsAttr(id);
  const meldLabel = soort === 'band' ? 'Band melden' : 'Muzikant melden';
  const items = [
    `<button class="nav-menu-item" onclick="sluitVeiligheidMenus();openMeldModal('${jsAttr(soort)}','${veiligId}','${veiligNaam}')">${escHtml(meldLabel)}</button>`,
  ];
  if (soort !== 'band') {
    items.push(blokkeerIkZelf(id)
      ? `<button class="nav-menu-item" onclick="sluitVeiligheidMenus();deblokkeerMuzikant('${veiligId}','${veiligNaam}')">Blokkade opheffen</button>`
      : `<button class="nav-menu-item" onclick="sluitVeiligheidMenus();blokkeerMuzikant('${veiligId}','${veiligNaam}')">Blokkeren</button>`);
  }
  return `
    <div class="profile-actions-menu-wrap veiligheid-menu-wrap">
      <button class="nav-menu-btn" onclick="toggleVeiligheidMenu(event)" aria-label="Meer opties" title="Meer">${VEILIGHEID_MENU_ICOON}</button>
      <div class="inline-menu-dropdown">${items.join('')}</div>
    </div>`;
}

// Zelfde patroon als toggleBandMoreMenu(): geen vaste id, want er kunnen
// meerdere van deze menu's tegelijk in de pagina staan.
function toggleVeiligheidMenu(e) {
  e.stopPropagation();
  const dd = e.currentTarget.nextElementSibling;
  const opening = !dd.classList.contains('visible');
  sluitVeiligheidMenus();
  dd.classList.toggle('visible', opening);
  e.currentTarget.classList.toggle('active', opening);
}

function sluitVeiligheidMenus() {
  document.querySelectorAll('.veiligheid-menu-wrap .inline-menu-dropdown.visible')
    .forEach(dd => dd.classList.remove('visible'));
  document.querySelectorAll('.veiligheid-menu-wrap .nav-menu-btn.active')
    .forEach(b => b.classList.remove('active'));
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.veiligheid-menu-wrap')) sluitVeiligheidMenus();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') sluitVeiligheidMenus(); });

// Het menu in een vaste koprij zetten. Leeg als er niets te melden valt.
function zetVeiligheidMenu(plekId, soort, id, naam) {
  const plek = document.getElementById(plekId);
  if (!plek) return;
  plek.innerHTML = veiligheidMenuHTML(soort, id, naam);
}

// ─── Melden ──────────────────────────────────────────────────────────────────

function openMeldModal(soort, id, naam) {
  meldDoel = { soort, id, naam: naam || '' };
  meldReden = null;
  const wat = soort === 'band' ? 'Band melden' : soort === 'gesprek' ? 'Gesprek melden' : 'Muzikant melden';
  document.getElementById('meldTitel').textContent = wat;
  document.getElementById('meldDoelNaam').textContent = meldDoel.naam || 'deze pagina';
  document.getElementById('meldToelichting').value = '';
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
  document.querySelectorAll('#meldRedenen .tag').forEach(t => t.classList.remove('selected'));
  el.classList.add('selected');
}

async function verstuurMelding() {
  if (!meldDoel) return;
  if (!meldReden) { showToast('Kies waar je melding over gaat.'); return; }
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
    logCaught('verstuurMelding', e);
    showToast(friendlyErrorMessage(e));
    return;
  }
  closeMeldModal();
  showToast('Bedankt. We kijken ernaar.');
}

// ─── Geblokkeerde muzikanten (Instellingen) ──────────────────────────────────

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
    // Huisstijl §15: een lege staat is een scherm met één knop. Hier is die
    // knop "Muzikanten zoeken" — de volgende stap voor wie niemand blokkeert.
    el.innerHTML = emptyStateHTML(
      'Je blokkeert niemand',
      'Blokkeren kan via het ⋯-menu op een profiel of in een gesprek.',
      'Muzikanten zoeken →',
      "closeGeblokkeerdModal();showView('search')"
    );
    return;
  }
  try {
    const { data, error } = await db.from('musicians')
      .select('id, fname, username, city').in('id', ids);
    if (error) throw error;
    const rijen = ids.map(id => {
      const m = (data || []).find(x => x.id === id);
      const naam = m ? displayNameOf(m) : 'Verwijderde gebruiker';
      const plaats = m && m.city ? m.city : '';
      return `
        <div class="geblokkeerd-rij">
          <div style="min-width:0;flex:1;">
            <div class="geblokkeerd-naam">${escHtml(naam)}</div>
            ${plaats ? `<div class="geblokkeerd-meta">${escHtml(plaats)}</div>` : ''}
          </div>
          <button class="btn btn-ghost geblokkeerd-knop" onclick="deblokkeerMuzikant('${jsAttr(id)}','${jsAttr(naam)}')">Opheffen</button>
        </div>`;
    }).join('');
    el.innerHTML = rijen;
  } catch (e) {
    logCaught('renderGeblokkeerdLijst', e);
    el.innerHTML = `<div style="text-align:center;padding:40px;color:var(--danger);">Lijst laden is niet gelukt: ${friendlyErrorMessage(e)}</div>`;
  }
}
