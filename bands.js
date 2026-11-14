// ─── TT-41: banduitnodigingen bevestigen ─────────────────────────────────────
// Bewust een banner op Mijn Profiel en niet een bericht in de inbox (besluit
// Ronald, 08-08-2026): één klik, geen tussenscherm, en het staat op de plek
// waar iemand na het inloggen sowieso terechtkomt. De banner verschijnt alleen
// als er daadwerkelijk iets open staat — geen lege plek in het scherm.
// TT-578 (8D, wens Ronald 08-11-2026: "de melding blijft staan totdat de
// muzikant een van beide knoppen heeft geklikt"): een uitnodiging verdwijnt
// alleen als de database zegt dat hij weg is (gekozen, of ingetrokken door de
// beheerder). Tot 08-11-2026 maakte deze functie de melding eerst leeg en
// toonde hij bij een mislukte vraag niets meer. Nu blijft wat er stond tot er
// een antwoord is; een oudere vraag overschrijft een nieuwere niet. Een ander
// account ziet de melding van het vorige nooit (dataset.mid).
let bandInvitesVolgnr = 0;
async function loadBandInvites(musicianId) {
  const el = document.getElementById('bandInvitesBanner');
  if (!el) return;
  if (el.dataset.mid !== String(musicianId)) { el.innerHTML = ''; el.dataset.mid = String(musicianId); }
  const volgnr = ++bandInvitesVolgnr;
  try {
    const { data, error } = await db.from('band_members')
      .select('band_id, bands(name, city)')
      .eq('musician_id', musicianId).eq('status', 'aangevraagd');
    // TT-230: Supabase gooit hier niets — een mislukte vraag komt terug als
    // `error` naast lege data. Zonder deze regel viel dat samen met "geen
    // uitnodigingen" en verdween de fout spoorloos.
    if (error) { logCaught('loadBandInvites', error); return; }
    if (volgnr !== bandInvitesVolgnr || el.dataset.mid !== String(musicianId)) return;
    if (!data || !data.length) { el.innerHTML = ''; return; }

    el.innerHTML = data.map(inv => {
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
  if (accept && await bandsVol(mid)) return; // TT-556
  try {
    const { error } = rijenGeraakt(await db.from('band_members')
      .update({ status: accept ? 'bevestigd' : 'geweigerd' })
      .eq('band_id', bandId).eq('musician_id', mid).select('band_id'));
    if (error) throw error;
    showToast(accept ? 'Je staat nu als lid op het bandprofiel.' : 'Uitnodiging geweigerd.');
    loadBandInvites(mid);
    if (accept) profielBandsVerversen();
    // TT-579 (TT-543 onderdeel 6, besluit Ronald 10-11-2026, 11): de beheerder
    // krijgt het antwoord als gewoon bericht, in het gesprek van de uitnodiging.
    const band = await bandNaamEnBeheerder(bandId);
    if (band) stilBericht(band.beheerder, accept
      ? `Ja, ik doe mee met ${band.naam}!`
      : `Bedankt voor de uitnodiging, maar ik doe niet mee met ${band.naam}.`);
  } catch (e) {
    logCaught('respondToBandInvite', e);
    showToast(friendlyErrorMessage(e, 'je antwoord op de uitnodiging versturen'));
  }
}

// TT-432 (07-10-2026, besluit Ronald): een verzoek om het beheer over te nemen
// staat op de bandkaart in Mijn Bands. Op de Bands-knop in de onderbalk staat
// een stip zonder cijfer zolang er zo'n verzoek voor jou wacht. Zonder de
// kolom `founder_offer` faalt de vraag; dat staat dan in app_error_log (TT-230).
async function refreshBandsDot(opties) {
  const dot = document.getElementById('bandsDotBottom');
  if (!dot) return;
  const mid = await getMyMusicianId();
  if (!mid) { dot.style.display = 'none'; return; }
  // 22-08-2026 (Ronald): een verzoek trekt zichzelf na 7 dagen in; geen
  // cron-taak, dus de controle draait hier mee. Niet blokkerend, wel loggen.
  if (!(opties && opties.zonderVerval)) {
    try {
      const { error } = await db.rpc('tt_expire_old_founder_offers'); // TT-561: fout zit in het antwoord
      if (error) logCaught('refreshBandsDot/expire', error);
    } catch (e) { logCaught('refreshBandsDot/expire', e); }
  }
  try {
    const { data, error } = await db.from('band_members').select('band_id')
      .eq('musician_id', mid).eq('status', 'bevestigd').eq('founder_offer', true);
    if (error) throw error;
    // Een oudere vraag (ander account, net uitgelogd) mag een nieuwere niet overschrijven.
    if (mid !== myMusicianId) return;
    dot.style.display = data && data.length ? 'block' : 'none';
  } catch (e) {
    logCaught('refreshBandsDot', e);
    dot.style.display = 'none';
  }
}

async function respondToFounderOffer(bandId, accept) {
  const mid = await getMyMusicianId();
  if (!mid) return;
  // TT-543 blok 3 (besluit Ronald 10-11-2026, 11): de beheerder krijgt het
  // antwoord als bericht. Eerst lezen wie dat is: na het overnemen ben jij het.
  const band = await bandNaamEnBeheerder(bandId);
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
      const { error } = rijenGeraakt(await db.from('band_members').update({ founder_offer: false, founder_offer_at: null }).eq('band_id', bandId).eq('musician_id', mid).select('band_id'));
      if (error) throw error;
      showToast('Aanbod geweigerd.');
    }
    if (band) stilBericht(band.beheerder, accept
      ? `Ik neem het beheer van ${band.naam} over.`
      : `Ik neem het beheer van ${band.naam} niet over. Bedankt voor de vraag!`);
    refreshBandsDot();
    loadMyBands();
    if (accept) profielBandsVerversen();
  } catch (e) {
    logCaught('respondToFounderOffer', e);
    showToast(friendlyErrorMessage(e, 'je antwoord op het oprichtersaanbod versturen'));
  }
}

// TT-543 onderdeel 6, blok 3 (besluiten Ronald 10-11-2026, 7d en 11, en
// 12-11-2026, B3-2 tot en met B3-5): bij een stap die een ander raakt, krijgt
// die een gewoon bericht van de beheerder of het lid, in hun gesprek. De
// naam van de band en wie de beheerder is, eerst uit de database.
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

// Beheer overdragen (TT-432; TT-543 blok 3, 7d): een venster met kop, één
// zin en de bevestigde leden als rij. Een tik op een lid stuurt het verzoek,
// met een bericht aan dat lid. Zolang niemand het accepteert, blijft de
// beheerder beheerder. De tegel staat er alleen als er een ander lid is (B3-2).
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
    // 22-08-2026 (Ronald): een verzoek trekt zichzelf na 7 dagen in
    // — founder_offer_at is het moment waarop die klok gaat lopen.
    const { error } = rijenGeraakt(await db.from('band_members').update({ founder_offer: true, founder_offer_at: new Date().toISOString() }).eq('band_id', bandId).eq('musician_id', memberId).select('band_id'));
    if (error) throw error;
    sluitOverdragen();
    showToast(naam ? `Gevraagd aan ${naam}.` : 'Gevraagd.');
    const band = await bandNaamEnBeheerder(bandId);
    if (band) stilBericht(memberId, `Wil jij het beheer van ${band.naam} overnemen?`);
    loadMyBands();
    if (bewerkBandId === bandId) renderBandBeheer();
  } catch (e) {
    logCaught('sendFounderOffer', e);
    showToast(friendlyErrorMessage(e, 'het oprichtersaanbod versturen'));
  }
}

// Een vraag die nog loopt: een tik op de tegel vraagt of je hem intrekt. Het
// lid krijgt daar een bericht over (B3-3).
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
    loadMyBands();
    if (bewerkBandId === bandId) renderBandBeheer();
  } catch (e) {
    logCaught('withdrawFounderOffer', e);
    showToast(friendlyErrorMessage(e, 'het oprichtersaanbod intrekken'));
  }
}

// TT-312 (25-09-2026): "Gezocht", de leden en de band in één
// databasefunctie, in één transactie. TT-543 blok 3 (besluit Ronald
// 10-11-2026, 7d): "Bandprofiel verwijderen" in plaats van "Band opheffen";
// elk lid krijgt daarna een bericht. De bestanden van de band wist de
// database zelf (TT-458, `opslag-opruimen`).
// De berichten bij het einde van een band of het overdragen van het beheer; één
// tekst voor Bandprofiel verwijderen en Account verwijderen (TT-543 onderdeel 7,
// punt 4: "de teksten van onderdeel 6 gelden").
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
    // TT-385: verwijderen gebeurt in Bandprofiel bewerken. Dat scherm hoort dan
    // bij een band die er niet meer is; terug naar Mijn Bands.
    if (bewerkBandId === bandId) { showView('bands'); return; }
    loadMyBands();
  } catch (e) {
    logCaught('dissolveBand', e);
    showToast(friendlyErrorMessage(e, 'het bandprofiel verwijderen'));
  }
}

// V-16: een gewoon lid verlaat de band zelf — geen overdracht nodig, de
// oprichter blijft gewoon oprichter.
// TT-385 (huisstijl §19): de vraag noemt het gevolg, de knop de handeling.
// Zelfde vorm als "Uit de band" hieronder.
function leaveBand(bandId, bandName) {
  showConfirm(
    `Je staat dan niet meer in de bezetting van ${bandName}.`,
    () => executeLeaveBand(bandId),
    'Band verlaten'
  );
}

// Het blok Bands op Mijn Profiel (TT-385 punt 17) wordt bij het openen van
// het scherm geladen. Verandert je lidmaatschap terwijl Mijn Profiel eronder
// openstaat (de bandpagina opent erbovenop), dan moet het blok mee. Bevinding
// Ronald, 06-10-2026: na "Band verlaten" bleef de band op het profiel staan.
function profielBandsVerversen() {
  if (document.getElementById('view-myprofile')?.classList.contains('active')) loadMyProfile();
}

async function executeLeaveBand(bandId) {
  const mid = await getMyMusicianId();
  if (!mid) return;
  try {
    // .select(): zonder dat meldt de database ook succes als de regels de
    // verwijdering weigeren (0 rijen geraakt, geen fout; zie TT-230).
    const { data, error } = await db.from('band_members').delete().eq('band_id', bandId).eq('musician_id', mid).select('musician_id');
    if (error) throw error;
    if (!data || !data.length) throw eigenFout('Je staat niet meer bij deze band, of je mag hem niet verlaten. Je bandenlijst is ververst.');
    showToast('Je hebt de band verlaten.');
    // TT-385: band verlaten kan ook vanaf de bandpagina. TT-410b fase 2: die is
    // nu een scherm en laadt opnieuw, zoals een bezoeker de band ziet.
    if (huidigeView === 'profiel' && huidigBandId === bandId) laadBandScherm(bandId);
    loadMyBands();
    profielBandsVerversen();
  } catch (e) {
    logCaught('executeLeaveBand', e);
    if (e && e.eigenTekst) loadMyBands();
    showToast(friendlyErrorMessage(e, 'de band verlaten'));
  }
}

// V-16: de oprichter kan zelf ook een lid uit de band halen (i.p.v. wachten
// tot iemand zelf vertrekt).
// TT-385 (keuze a van Ronald: "alsof een bandlid een ding is wat je
// weggooit"): "Uit de band" in plaats van "Verwijderen". De vraag noemt het
// gevolg (huisstijl §19), zonder rood. Sinds TT-385 achter de drie puntjes in
// de rij van het lid, in de tegel Onze bezetting.
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
    // TT-543 blok 3 (besluit Ronald 12-11-2026, B3-5; tekst van Ronald).
    if (bandName) stilBericht(musicianId, `Je staat niet meer in de bezetting van ${bandName}. Bedankt voor het meespelen.`);
    loadMyBands();
    // De lijst in Onze bezetting klopt meteen, niet pas na heropenen.
    if (bewerkBandId === bandId) bbLaadLeden();
  } catch (e) {
    logCaught('executeRemoveMember', e);
    showToast(friendlyErrorMessage(e, 'het lid verwijderen'));
  }
}

// ─── Mijn bands ───────────────────────────────────────────────────────────────

// ─── De korte wizard (TT-385 fase 4, 02-10-2026, besluiten Ronald) ──────────
// Eén scherm met drie vragen: naam, postcode en plaats, genres. Daarna staat
// de band en opent de privé bandpagina. De balk begint op 0% en loopt 5% op
// per ingevuld veld, tot de 15% waarop de bandpagina begint (besluit a).
// De wizard staat in view-bands, op de plek van de lijst: geen zestiende view.
// Hij is een laag van de app, zoals een tegelscherm. Dus de terugknop in de
// kop en die van het toestel sluiten eerst de wizard, met dezelfde vraag
// "Terug zonder opslaan?" als een tegel (TT-302). De afhandeling staat in
// appTerug() in core.js.
let bandState = { genres: [] }; // de genres die de wizard kiest

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
  // TT-336 (besluit Ronald, 1a): een band oprichten kan pas na de klik in de
  // mail. Eerst vragen, dan pas de wizard: anders vult iemand alles in voor
  // niets. Om dezelfde reden eerst het profiel.
  const wacht = await emailWachtOpBevestiging();
  if (wacht) { showToast(emailBevestigMelding(wacht, 'een band oprichten')); return; }
  const mid = await getMyMusicianId();
  if (!mid) { geenProfielMelding('Maak eerst een muzikantprofiel aan.'); return; }
  if (await bandsVol(mid)) return; // TT-556: vóór de wizard, niet pas bij opslaan
  resetBandForm();
  zetBandWizardZichtbaar(true);
  window.scrollTo(0, 0);
  werkTerugKnopBij(); // TT-301: een open wizard is een stap terug
  initBandForm();
  setTimeout(() => document.getElementById('bandName')?.focus(), 50);
}

// Sluit de wizard (TT-431: de wizard is geen stap in de browsergeschiedenis
// meer; hij is een laag van de app, net als een tegelscherm).
function sluitBandWizard(daarna) {
  ontwapenTerug();
  resetBandForm();
  zetBandWizardZichtbaar(false);
  werkTerugKnopBij();
  if (daarna) daarna();
}

// Staat er iets ingevuld? Dan vraagt Terug eerst "Terug zonder opslaan?".
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
  bandCitySource = 'pdok';
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
  // Bekijk hier de postcode van het formulier, niet die van de tegel.
  bandPostcodeDoel = 'band';
}

// TT-543 onderdeel 4 (besluit Ronald 09-11-2026, B4): uitnodigen gaat via
// Zoeken en het profiel van de muzikant (zie "Uitnodigen vanuit Zoeken"
// onderaan). Het venster Lid uitnodigen met zijn eigen zoeklijst is weg.

// TT-41 (08-08-2026): een oprichter kon iemand voorheen zonder diens medeweten
// als lid op het bandprofiel zetten. Vanaf nu ontstaat er een uitnodiging
// (status 'aangevraagd'); pas als de muzikant zelf bevestigt via de banner op
// Mijn Profiel wordt het 'bevestigd' en is het lidmaatschap zichtbaar.
// V-18 (13-08-2026): de oprichter kan een korte boodschap meegeven.
// Blok 2 (besluit Ronald 11-11-2026, B2-7): de uitnodiging draagt de rollen in
// deze band; zonder rollen vult de database de instrumenten van het profiel in.
async function addBandMember(band, musicianId, note, rollen) {
  try {
    // TT-56 (12-08-2026): defensieve check naast de verborgen knop hierboven
    // — zelfde patroon als de akkoord-checkbox bij registratie (TT-63): de
    // UI verbergt de knop, maar een verse controle vlak vóór het schrijven
    // voorkomt dat een verouderd scherm (bijv. een openstaand zoekresultaat
    // van vóór iemand net zijn instelling wijzigde) alsnog een uitnodiging
    // verstuurt.
    // TT-543 onderdeel 6, blok 4 (B4-1): alleen een muzikant op Actief krijgt
    // een banduitnodiging; Tijdelijk niet beschikbaar en Inactief niet.
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

    // V-18: de boodschap komt binnen als gewoon bericht, zodat de ontvanger
    // weet waarom hij gevraagd wordt — niet alleen een naam op een banner.
    const trimmedNote = (note || '').trim();
    const bandLabel = band.naam ? `"${band.naam}"` : 'onze band';
    const text = trimmedNote
      ? `Je bent uitgenodigd voor de band ${bandLabel}. ${trimmedNote}`
      : `Je bent uitgenodigd voor de band ${bandLabel}. Bekijk de uitnodiging op je profiel.`;
    const berichtVerstuurd = await insertMessage(musicianId, text);

    // TT-445: de uitnodiging staat er, maar het bericht erbij kwam niet aan.
    // insertMessage() toonde dan al een fout; hier niet ook nog "verstuurd".
    showToast(berichtVerstuurd
      ? 'Uitnodiging verstuurd.'
      : 'De uitnodiging staat in de lijst, maar het bericht erbij kwam niet aan. De muzikant ziet de uitnodiging wel op zijn profiel.');
    loadMyBands();
    // TT-385: terug in Onze bezetting staat de uitnodiging meteen in de lijst.
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
      toevoegen: 'Genre' // TT-543 draaiwielen deel 2, besluit Ronald 10-11-2026 (vraag 3: "A")
    });
  }
  // Bij hergebruik van een al bestaande picker (tweede keer dat het
  // formulier opent) staan de badges nog op de vorige band — opnieuw
  // tekenen op basis van de huidige bandState.
  renderPickerBadges(PICKERS.bandGenre);
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

// ─── Band aanmaken, Mijn bands en het bandvenster ──────────────────────────────
// Verplaatst uit musicians.js (26-09-2026). Inhoud ongewijzigd.

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
  // TT-247 (12-09-2026): alle fouten tegelijk, elk bij zijn eigen veld —
  // dezelfde vorm als de registratiewizard. Muzikantkant en bandkant volgen
  // dezelfde regels (huisstijl, besluit Ronald 11-09-2026). Tot nu toe waren
  // dit drie opeenvolgende toasts, één per keer.
  // Het bandformulier staat in view-bands. Gemeten 12-09-2026: met een ander
  // bereik werd er niets opgeruimd.
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
  if (!mid) { geenProfielMelding('Maak eerst een muzikantprofiel aan.'); return; }

  // TT-252: de laag blokkeert het scherm tijdens het opslaan, zodat een tweede
  // tik de knop ook fysiek niet meer bereikt. TT-251: zonder die laag was er
  // ook geen enkele aanduiding dat er iets gebeurde. Zelfde component als de
  // wizard (showSaving), zodat muzikantkant en bandkant hetzelfde aanvoelen.
  // TT-385 fase 3: dit formulier maakt alleen nog een band aan. Bewerken
  // gebeurt in de tegels van Bandprofiel bewerken.
  showSaving('Band aanmaken...', 'Heel even geduld, dit duurt maar een paar seconden.');

  try {
    // Zelfde voorzorg als bij createAccountAndProfile() (23-08-2026): alleen
    // 'id' terugvragen i.p.v. een kale .select(). Niet omdat hier een
    // bekende kolombeperking is gevonden — geen enkel veld hier is dat
    // vandaag — maar een kale select() vraagt onnodig alle kolommen op
    // terwijl alleen band.id verderop wordt gebruikt.
    // TT-385 fase 4: de wizard vraagt alleen naam, plaats en genres. De
    // status volgt uit de open rollen (punt 7); een nieuwe band heeft er nog
    // geen. Bandfoto, ervaring, Wie zijn we en de bezetting vult de beheerder
    // later aan in de tegels.
    const { data: band, error: bErr } = await db.from('bands').insert({
      name, city: normalizeCityName(city), zip,
      genres: bandState.genres,
      status: bandStatusAfgeleid(0), founder_id: mid, city_source: bandCitySource,
    }).select('id').single();
    if (bErr) throw bErr;
    const bandId = band.id;
    const { error: mErr } = await db.from('band_members').insert({ band_id: bandId, musician_id: mid, role: 'Oprichter', status: 'bevestigd' });
    if (mErr) throw mErr;

    loadMyBands();
    hideSaving();
    // TT-251 (11-09-2026): wie zijn eerste band aanmaakt, is precies op dat
    // moment het onzekerst. Een korte melding met de bandnaam erin.
    // TT-385 fase 4: daarna opent de privé bandpagina, met elke lege sectie
    // als uitnodiging (besluit 1 en 2).
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

async function loadMyBands(opties) {
  const el = document.getElementById('myBandsList');
  if (!el) return;
  // Tabwissel: laat een geladen lijst van deze gebruiker staan tot de nieuwe er is.
  if (!(opties && opties.behoud && currentUser && el.dataset.klaar === currentUser.id)) {
    delete el.dataset.klaar;
    el.innerHTML = '<div style="color:var(--muted);text-align:center;padding:32px;">Laden...</div>';
  }
  // 22-08-2026: zelfde lazy vervalcontrole als in refreshBandsDot() —
  // Mijn Bands kan ook los daarvan geopend worden.
  // Niet blokkerend voor de lijst, wel loggen (TT-230).
  // TT-367: de controle loopt tegelijk met de vraag naar je lidmaatschappen;
  // de bands zelf pas daarna, zodat een verlopen aanbod er al af is.
  // TT-561: Supabase gooit niets; een fout komt terug in het antwoord.
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
    // TT-248: via de vaste vorm uit huisstijl §15, net als elke andere lege staat.
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
    // TT-248: stond hier als grijze tekst zonder uitweg, tien regels onder de
    // lege staat hierboven die wél een knop had. Nu dezelfde vaste vorm.
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

  // TT-543 onderdeel 6 (besluit Ronald 10-11-2026, 4 C): per band een kleine
  // hoes, de bandfoto 200px hoog, de naam en de plaats (besluit sessie 112) op de
  // foto in de tekstkleur van de hoes (huisstijl §21), rechts "Zoekt
  // <instrument>" als gele pil. Geen tags en geen ondertitel. Een tik opent de
  // bandpagina; voor de beheerder is dat de privé bandpagina, met de balk.
  // TT-433: geen ⋯-menu en geen knop; die staan op de bandpagina.
  el.innerHTML = (bands || []).map(b => {
    const confirmed = (b.band_members||[]).filter(m => m.status === 'bevestigd');
    const isFounder = b.founder_id === mid;
    // V-16 (13-08-2026): staat er al een lopend overname-aanbod (founder_offer)?
    // Dan de wachtstand onder de hoes.
    const offerPending = isFounder && confirmed.some(m => m.founder_offer);
    const open = (b.band_wanted || []).map(w => w.instrument);
    // TT-432: een verzoek om het beheer over te nemen staat onder de hoes van
    // het lid dat gekozen is.
    const verzoekVoorMij = !isFounder && confirmed.some(m => m.musician_id === mid && m.founder_offer);
    // TT-543 blok 3 (beeld vervolg-overdragen, akkoord Ronald 10-11-2026; B3-4):
    // wie vraagt het, en de oude beheerder blijft lid.
    const naamVan = m => (m && m.musicians ? displayNameOf(m.musicians) : '');
    const beheerderNaam = naamVan(confirmed.find(m => m.musician_id === b.founder_id)) || 'De beheerder';
    const gevraagdAan = confirmed.filter(m => m.founder_offer).map(naamVan).filter(Boolean);
    const zoekt = open.length
      ? `<div class="profiel-knoppen"><span class="zoek-kaart-zoekt">Zoekt ${escHtml(instrumentInZin(open[0]))}</span></div>` : '';
    return `<div class="mijn-band">
      <div class="band-hoes">${profielHoesHTML({
        foto: safeUrl(b.avatar_url), wazig: null, naam: b.name, media: [], naamMax: 28,
        tik: `openBandScherm('${jsAttr(b.id)}')`,
        regels: `<div class="profile-meta">${escHtml(b.city || '')}</div>`, knoppen: zoekt
      })}</div>
      ${verzoekVoorMij ? `
      <div class="melding mijn-band-melding">
        <p class="melding-kop">${escHtml(beheerderNaam)} vraagt of jij ${escHtml(b.name)} overneemt</p>
        <p class="melding-tekst">Je wordt dan beheerder. ${escHtml(beheerderNaam)} blijft lid van de band.</p>
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="respondToFounderOffer('${jsAttr(b.id)}', false)">Nee, liever niet</button>
          <button class="btn btn-primary" onclick="respondToFounderOffer('${jsAttr(b.id)}', true)">Ik neem het over</button>
        </div>
      </div>` : ''}
      ${offerPending ? `<p class="mijn-band-wacht">${gevraagdAan.length ? `Gevraagd aan ${escHtml(opsommingNL(gevraagdAan))}` : 'Gevraagd'} · wacht op antwoord</p>` : ''}
    </div>`;
  }).join('');
  // Pas in de pagina meten: de tekstkleur per foto, de bundels zonder foto, en
  // de naam die past naast de pil (huisstijl §2.1, §21).
  hoesStarten(el);
  el.querySelectorAll('.band-hoes .hoes').forEach(hoes => {
    const pil = hoes.querySelector('.zoek-kaart-zoekt');
    if (pil) hoes.style.setProperty('--hoes-tekst-rechts', (pil.offsetWidth + 24) + 'px');
  });
  fitProfileName(el);
  if (currentUser) el.dataset.klaar = currentUser.id;
  refreshBandsDot({ zonderVerval: true }); // de controle liep hierboven al
}

// ─── De bandpagina (TT-385, fase 2, 02-10-2026) ──────────────────────────────
// Besluiten Ronald, TT-385 in actielijst.md, en TT-543 onderdeel 6
// (10-11-2026). De bandpagina heeft dezelfde opbouw als het muzikantprofiel
// (huisstijl §10.2, §21): de hoes met naam, delen en ⋯; twee gedempte regels;
// Wie zijn we en de logo's van Volg ons zonder kop; de knop; dan Bezetting,
// Eigen nummers, Covers, en Foto's, video's en links. Alleen wat is ingevuld
// staat erop. Geen bandchat: de knop stuurt een bericht aan de contactpersoon.
// Twee wegen naar dezelfde gegevens: met een eigen profiel leest de app de
// tabellen zelf; zonder eigen profiel komt alles uit tt_get_bands_public, die
// voor een bezoeker zonder account afschermt (TT-385 punt 9). Beide wegen
// leveren één vorm op (bandUitTabellen() en bandUitPubliek()), zodat de
// pagina zelf maar één functie heeft.

// Wat voor band (TT-385 punt 15). De waarden staan zo in bands.soort.
const BAND_SOORT_LABELS = { eigen: 'Eigen nummers', covers: 'Coverband', beide: 'Eigen nummers en covers' };

// De drie socials (TT-385 punt 10): alleen Instagram, TikTok en YouTube. Het
// echte logo, geen tekst (Ronald, 02-10-2026: "die herkent de doelgroep
// meteen"). Elk het officiële teken van het merk (Simple Icons 16.37.0, CC0),
// alle drie even groot en in dezelfde kleur (TT-543 onderdeel 10, besluit
// Ronald 13-11-2026, 2-12). Een veld bevat een volledige link of een
// gebruikersnaam; van een naam maakt bandSocialLink() de link.
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

// Met een eigen profiel: de tabellen zelf. Per lid de rollen in deze band
// (TT-543 onderdeel 6, besluit Ronald 10-11-2026, 12); een invaller heeft geen
// datum meer en blijft tot de beheerder hem weghaalt (besluit Ronald
// 10-11-2026: "ja, weghalen").
async function bandUitTabellen(id) {
  const { data: b, error } = await db.from('bands')
    .select(`*, band_members(role, rollen, status, joined_at, musicians(id, weergavenaam, username, avatar_url)), band_wanted(instrument), band_media(media_type, url, platform, in_banner, created_at, uitsnede), band_nummers(titel, url, platform, created_at), band_covers(song_title, song_artist), band_invallers(instrument, created_at)`)
    .eq('id', id).maybeSingle(); // TT-464: een band die niet (meer) bestaat is geen fout
  if (error) throw error;
  if (!b) return null;
  const naarLid = m => ({
    id: m.musicians.id, naam: displayNameOf(m.musicians), avatar_url: m.musicians.avatar_url || null,
    rollen: m.rollen || [], rol: m.role
  });
  const leden = (b.band_members || [])
    .filter(m => m.status === 'bevestigd' && m.musicians)
    .sort((x, y) => String(x.joined_at || '').localeCompare(String(y.joined_at || '')))
    .map(naarLid);
  // TT-580 (besluit Ronald 10-11-2026, 2): een uitnodiging staat in de
  // bezetting, alleen voor leden en beheerder (bandPaginaHTML()).
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
    media: opVolgordeVanToevoegen(b.band_media), // TT-563: één functie, muzikant en band gelijk
    nummers: opVolgordeVanToevoegen(b.band_nummers),
    covers: b.band_covers || []
  };
}

// Zonder eigen profiel: de publieke functie. TT-420: de naam van een lid is de
// naam die hij koos (weergavenaam), nooit fname of lname. TT-04: geen postcode.
async function bandUitPubliek(id) {
  const { data, error } = await db.rpc('tt_get_bands_public', { ids: [id] });
  if (error) throw error;
  const row = (data || [])[0];
  if (!row) return null;
  const ledenRijen = (row.members || []).map(m => ({ id: m.id || null, username: m.username }));
  await weergavenamenToevoegen(ledenRijen.filter(l => l.id));
  // `instruments` zijn sinds blok 2 de rollen in deze band (tt_get_bands_public).
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

// De bezetting (TT-543 onderdeel 6, besluiten Ronald 10-11-2026, 12: "naam vet
// en functie kleiner eronder", en 11-11-2026, B2-12, "2A"): één rij per
// persoon, op naam, met de rollen op alfabet achter elkaar ("Basgitaar · Drums"),
// zoals het blok Bands en Onze bezetting. Een lid zonder rol staat er als "Lid".
// (Was één rij per rol, B2-1.)
function bezettingRijen(leden) {
  return [...leden].sort((x, y) => x.naam.localeCompare(y.naam, 'nl'))
    .map(l => [l, l.rollen.length ? [...l.rollen].sort((x, y) => x.localeCompare(y, 'nl')).join(' · ') : roleLabel('Lid')]);
}

// Eén rij in de bezetting: dezelfde rij als in Onze bezetting en op het
// muzikantprofiel (`.bb-rij`, foto links, tekst rechts). Zonder foto (of
// afgeschermd) de schijnwerper, zoals elke lege profielfoto (huisstijl §21;
// afgeschermd wordt wazig in fase 7 van TT-517, §18.7). Een uitnodiging
// (TT-580) staat er half doorzichtig, met "uitgenodigd" achter de rol.
function bezettingLidHTML(l, rol, uitgenodigd) {
  const sub = uitgenodigd ? `${rol} · uitgenodigd` : rol;
  const inhoud = `${bbFotoHTML(l.avatar_url, uitgenodigd)}<span class="bb-tekst"><span class="bb-naam">${escHtml(l.naam)}</span><span class="bb-sub">${escHtml(sub)}</span></span>`;
  const klas = 'bb-rij bezetting-lid' + (uitgenodigd ? ' bezetting-uitgenodigd' : '');
  // Een tik opent het profiel van het lid, ook je eigen (TT-410b: elk profiel is een scherm).
  return l.id
    ? `<button type="button" class="${klas} bb-rij-knop" onclick="openProfielScherm('${jsAttr(l.id)}')" aria-label="Profiel van ${escHtml(l.naam)}">${inhoud}</button>`
    : `<div class="${klas}">${inhoud}</div>`;
}

// Een open plek in de bezetting: een open rol (band_wanted, "Gezocht") of een
// invaller ("Invaller"), vet, met het instrument eronder: dezelfde vorm als
// een lid (besluit Ronald 10-11-2026, 12). Op de bandpagina is het nooit een
// knop, voor niemand (TT-450, besluit Ronald: een plus geeft de indruk dat je
// kunt tikken); het teken is een vraagteken (V1). Zoeken opent vanuit
// Bandprofiel bewerken, op het plusje in de rij (bbRenderOpen(), bbRenderInvallers()).
function bezettingOpenHTML(kop, instrument) {
  return `<div class="bb-rij bezetting-open"><span class="bb-foto bezetting-open-rondje" aria-hidden="true">?</span><span class="bb-tekst"><span class="bb-naam">${kop}</span><span class="bb-sub">${escHtml(instrument)}</span></span></div>`;
}

function bandSectieHTML(titel, inhoud) {
  return `<div class="profile-media"><div class="profile-media-title">${titel}</div>${inhoud}</div>`;
}

// ─── Je bands op je muzikantprofiel (TT-385 punt 17, fase 5) ─────────────────
// Uit de tekening van Ronald: zodra je een uitnodiging accepteert, staat de
// band op je eigen profiel, in een blok Bands onder de bio. Op Mijn Profiel en
// in het muzikantvenster gelijk, voor elke kijker. Een tik opent de
// bandpagina. Twee stappen: tt_musician_band_ids geeft de bands waarvan de
// muzikant bevestigd lid is; tt_get_bands_public levert naam, foto en rol, met
// dezelfde afscherming als de bandpagina (TT-385 punt 9). Zo bestaat die
// afscherming maar op één plek. Mislukt het, dan staat er geen blok.
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

// Eén rij per band, in de vorm van een rij in Onze bezetting, met de
// vierkante bandfoto. Eronder de rollen in die band (besluit Ronald
// 11-11-2026, B2-3: niet alle instrumenten van het profiel), en "Beheerder"
// voor de beheerder.
function profielBandsHTML(bands) {
  if (!bands || !bands.length) return '';
  return bandSectieHTML('Bands', bands.map(b => {
    const beeld = bbFotoHTML(b.foto, false, true);
    const sub = b.rollen.concat(b.rol === 'Oprichter' ? [roleLabel(b.rol)] : []).join(' · ');
    return `<button type="button" class="bb-rij bb-rij-knop" onclick="openBandScherm('${jsAttr(b.id)}')">${beeld}<span class="bb-tekst"><span class="bb-naam">${escHtml(b.naam)}</span>${sub ? `<span class="bb-sub">${escHtml(sub)}</span>` : ''}</span></button>`;
  }).join(''));
}

function bandNummerHTML(n, fotoWazig) {
  // TT-517 fase 7: afgeschermd het wazige beeld van de bandfoto (een nummer
  // heeft zelf geen beeld), anders het algemene (huisstijl §18.7).
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
    // Afgeschermd (besluit Ronald, (f)): het logo staat er gedempt, zonder
    // link. De database geeft dan een lege tekst in plaats van de link.
    if (b.afgeschermd && waarde === '') {
      return `<span class="social-knop social-dicht" role="img" aria-label="${soc.naam}, alleen zichtbaar met een account">${soc.svg}</span>`;
    }
    const link = bandSocialLink(soc, waarde);
    if (!link) return '';
    return `<a class="social-knop" href="${link}" target="_blank" rel="noopener noreferrer" aria-label="${soc.naam} van ${escHtml(b.name)}">${soc.svg}</a>`;
  }).join('');
  return knoppen ? `<div class="socials">${knoppen}</div>` : '';
}

// De pagina zelf. kijker: 'beheerder', 'lid', 'bezoeker' (eigen profiel) of
// 'gast' (geen eigen profiel).
// TT-543 onderdeel 6 (besluiten Ronald 10-11-2026, 1a tot en met 1f en 13): de
// opbouw van het muzikantprofiel (onderdeel 3). De hoes; twee gedempte regels
// in plaats van tags; Wie zijn we zonder kop, zoals de bio; de logo's van Volg
// ons als één rij eronder, zonder kop; de knop, die meescrolt; dan de blokken
// Bezetting, Eigen nummers, Covers, en Foto's, video's en links (één raster).
function bandPaginaHTML(b, kijker) {
  const beheer = kijker === 'beheerder';
  const foto = safeUrl(b.avatar_url);
  // TT-517 fase 6 (huisstijl §21): zonder foto ziet alleen de beheerder in
  // de hoes de knop "Voeg een foto toe"; die opent Onze media.
  const fotoToevoegen = beheer ? `voegFotoToe('${jsAttr(b.id)}')` : null;

  // Het ⋯-menu: een lid kan de band verlaten (TT-385 punt 13); een bezoeker
  // meldt de band (TT-06, de inhoud zet zetVeiligheidMenu() erin). De
  // beheerder heeft geen menu meer: "Bandprofiel bewerken" is een knop onder
  // Wie zijn we (1d, zoals Mijn Profiel); het deelicoon staat op de plek van
  // het menu.
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
  } else if (!beheer) {
    menuHTML = '<span id="profielSchermActies" class="profiel-menu-plek"></span>';
  }

  // 1a: twee gedempte regels, zoals instrumenten en genres op het
  // muzikantprofiel. De genres; dan wat voor band en, zolang de band iemand
  // zoekt, de ervaring met de gevulde sterren. De tag Zoekend of Compleet is
  // weg: de bezetting toont "gezocht" al (wijzigt besluit 02-10-2026).
  const sterren = b.wanted.length ? starDisplayHTML(b.niveau, true) : '';
  const regel2 = [BAND_SOORT_LABELS[b.soort] ? escHtml(BAND_SOORT_LABELS[b.soort]) : '',
    sterren ? 'Ervaring ' + sterren : ''].filter(Boolean).join(' · ');
  const regel1 = b.genres.map(g => escHtml(g)).join(' · ');
  const watHTML = `
    <div class="profiel-wat">
      ${regel1 ? `<div class="profiel-wat-regel">${regel1}</div>` : ''}
      ${regel2 ? `<div class="profiel-wat-regel">${regel2}</div>` : ''}
    </div>`;

  // De beheerder van een pagina die nog niet af is, krijgt bij delen eerst
  // één zin over wat er mist (besluit Ronald, g).
  const voortgang = beheer ? bandVoortgang(b) : null;
  const deelActie = voortgang && voortgang.pct < 100 ? `openBandDeelBlad('${jsAttr(b.id)}')` : null;
  // Een lege plek is voor de beheerder een uitnodiging (TT-385 punt 2); voor
  // iedereen anders staat er niets.
  // Wat leeg is, vervalt, ook voor de beheerder, net als op het muzikantprofiel
  // (besluit Ronald 11-11-2026, B2-10; was een uitnodiging per lege plek,
  // TT-385 punt 2). De balk onderaan en het deelblad noemen wat nog mist.

  // 1c en 1d: één knop onder Wie zijn we, die meescrolt (zoals F3 B en 1E van
  // onderdeel 3). Een bezoeker stuurt de band een bericht (aan de
  // contactpersoon); zonder profiel "Maak een profiel en leg contact"; de
  // beheerder "Bandprofiel bewerken" (omlijnd). Een lid heeft geen knop. Mag
  // je de contactpersoon geen bericht sturen (TT-421), dan verbergt
  // messages.js de knop en neemt de plek geen ruimte in.
  let actie = '';
  if (kijker === 'gast') {
    actie = `<button class="btn btn-primary" onclick="showView('register')">Maak een profiel en leg contact</button>`;
  } else if (kijker === 'bezoeker' && b.contact) {
    actie = `<button class="btn btn-primary" data-bericht-id="${escHtml(b.contact.id)}" onclick="openMessageComposer('${jsAttr(b.contact.id)}','${jsAttr(b.contact.naam)}','${jsAttr(b.name)}')">Stuur een bericht aan de band</button>`;
  } else if (beheer) {
    actie = `<button class="btn btn-ghost" onclick="openBandTegels('${jsAttr(b.id)}')">Bandprofiel bewerken</button>`;
  }

  // TT-517 fase 4 (01-11-2026): de kop is de hoes, zoals bij de muzikant (huisstijl §21).
  let h = `
    ${profielHoesHTML({
      foto, wazig: wazigBron(b.avatar_url), naam: b.name, media: b.media, fotoToevoegen,
      // TT-517 fase 8: het visitekaartje; een band die iemand zoekt, toont dat in een pil.
      kaart: { id: b.id, naam: b.name, regel: b.city || '', wat: b.genres, onder: [], zoekt: b.wanted },
      regels: `<div class="profile-meta" style="margin-bottom:0;">${escHtml(b.city || '')}</div>`,
      knoppen: profielKnoppenHTML('band', b.id, b.name, menuHTML, deelActie)
    })}
    ${watHTML}
    ${standMeldingHTML(b.stand)}`;
  // 1b: Wie zijn we direct onder de regels, zonder kop, zoals de bio
  // (wijzigt besluit (c) van TT-385: "direct onder de bezetting").
  if (b.description) h += `<p class="profile-bio">${tekstMetMeerHTML(b.description)}</p>`;
  // 13 (besluit Ronald 10-11-2026, A): de logo's van Volg ons als één rij
  // direct onder Wie zijn we, zonder kop, boven de knop.
  h += bandSocialsHTML(b) || '';
  if (actie) h += `<div class="profiel-actie">${actie}</div>`;

  // De bezetting, een rij per rol. Een uitnodiging zien alleen leden en de
  // beheerder (TT-580), na de leden; een bezoeker ziet hem niet.
  const uitgenodigd = (kijker === 'lid' || beheer) ? (b.uitgenodigd || []) : [];
  if (b.leden.length || uitgenodigd.length || b.wanted.length || b.invallers.length) {
    h += bandSectieHTML('Bezetting', `<div class="bezetting">${
      bezettingRijen(b.leden).map(([l, r]) => bezettingLidHTML(l, r, false)).join('') +
      bezettingRijen(uitgenodigd).map(([l, r]) => bezettingLidHTML(l, r, true)).join('') +
      b.wanted.map(w => bezettingOpenHTML('Gezocht', w)).join('') +
      b.invallers.map(v => bezettingOpenHTML('Invaller', v.instrument)).join('')
    }</div>`);
  }
  // Eigen nummers.
  const nummers = b.nummers.map(n => bandNummerHTML(n, b.avatar_url)).join('');
  if (nummers) h += bandSectieHTML('Eigen nummers', nummers); // TT-601 (besluit Ronald 14-11-2026, "ja"): was "Onze nummers"
  // Covers, op dezelfde volgorde als het repertoire van een muzikant, en op
  // dezelfde plek: na de nummers, voor de foto's (besluit Ronald 11-11-2026,
  // B2-11: wie → nummers → foto's, video's en links). 1f: de kop zonder
  // aantal; het aantal staat in "Alle 9 nummers".
  if (b.covers.length) {
    const rijen = [...b.covers].sort((x, y) => compareArtistTitle(x.song_artist, x.song_title, y.song_artist, y.song_title))
      // TT-528: elke cover in één tik in je eigen repertoire, zoals bij een muzikant.
      .map(c => `<div class="profile-song-row"><span><strong>${escHtml(c.song_artist)}</strong> — <span class="profile-song-titel">${escHtml(c.song_title)}</span></span><span class="nummer-rechts">${overneemKnopHTML(c.song_title, c.song_artist)}</span></div>`);
    // Meer dan zeven covers: ingeklapt, zoals het repertoire (nummerLijstHTML() in utils.js).
    h += bandSectieHTML('Covers', nummerLijstHTML(rijen));
  }
  // 1e: foto's, video's en links in één raster van drie, zoals bij de muzikant.
  // profielMediaHTML() geeft niets terug als er niets te tonen is.
  const media = profielMediaHTML(b.media, b.avatar_url);
  if (media) h += media;
  // De balk staat onderaan, zoals op Mijn Profiel; alleen de beheerder ziet
  // hem (besluit Ronald, j).
  if (voortgang) h += voortgangsBalkHTML(voortgang.pct);
  return h;
}

// ─── De voortgang van een bandpagina (TT-385, besluiten Ronald a en b) ────────
// Na de korte wizard staat de band op 15%. Daarna tellen negen onderdelen
// even zwaar mee tot 100%. Geen geheugen: weghalen laat de balk teruglopen,
// verder loopt hij nooit terug. De namen staan in de zin van het deelblad.
const BAND_ONDERDELEN = [
  { sleutel: 'bandfoto',  naam: 'een bandfoto',        af: b => !!b.avatar_url },
  { sleutel: 'wie',       naam: 'Wie zijn we',         af: b => !!(b.description || '').trim() },
  // Aanname (Claude): de bezetting telt als er naast de beheerder nog een
  // lid of een open rol is. Een uitgenodigd lid telt nog niet.
  { sleutel: 'bezetting', naam: 'de bezetting',        af: b => b.leden.length > 1 || b.wanted.length > 0 },
  // Besluit Ronald (02-10-2026, na fase 3): bij een coverband telt "eigen
  // nummers" niet mee, bij een band met alleen eigen nummers "covers" niet.
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

// "a, b en c"
function opsommingNL(lijst) {
  if (lijst.length < 2) return lijst.join('');
  return lijst.slice(0, -1).join(', ') + ' en ' + lijst[lijst.length - 1];
}

// ─── Het deelblad (TT-385, besluit Ronald g) ─────────────────────────────────
// Alleen voor de beheerder, alleen zolang de pagina niet af is: één zin over
// wat er nog mist, dan het deelmenu van de telefoon. "Eerst aanvullen" opent
// Bandprofiel bewerken. Een bladwijzer van onderen (huisstijl §7.1).
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

// TT-410b fase 2 (06-10-2026, besluiten Ronald): de bandpagina is, net als het
// muzikantprofiel, een eigen scherm met een eigen link: view-profiel, route
// #band/<id>. Het oude bandvenster bestaat niet meer en er komt geen view bij.
// De stap in de geschiedenis is { view: 'profiel', id, soort: 'band' }.
// Een band opent altijd, in de app en via een link: Delen via link is weg
// (TT-543 onderdeel 6, besluit Ronald 10-11-2026, 7c).
function openBandScherm(id, opties) {
  const o = opties || {};
  showView('profiel', o.redirect ? 'redirect' : undefined, { id, soort: 'band' });
  return profielLaadBelofte;
}

async function laadBandScherm(id) {
  const volgnr = ++profielSchermVolgnr; // dezelfde teller als bij een muzikant
  huidigProfielId = null;
  huidigBandId = id || null;
  bandDeelGegevens = null;
  const vak = document.getElementById('profielSchermContent');
  vak.classList.remove('uitnodig-open'); // TT-543 onderdeel 4: het blok hoort bij een muzikantprofiel
  vak.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">Laden...</div>';
  if (!id) { toonProfielNietBeschikbaar('band'); return; }

  let b = null;
  let mislukt = false;
  try {
    b = hasOwnProfile ? await bandUitTabellen(id) : await bandUitPubliek(id);
  } catch (e) {
    mislukt = true;
    // TT-464: het band-id staat in de melding, zodat te zien is welke band het was.
    const m = new Error(((e && e.message) ? e.message : String(e)) + ' (band ' + id + ')');
    m.stack = (e && e.stack) ? e.stack : null;
    logCaught('laadBandScherm', m);
  }
  if (volgnr !== profielSchermVolgnr) return; // intussen een ander scherm geopend
  // TT-464: geen fout en geen band: de band bestaat niet meer. Dat is een verwachte
  // uitkomst (zoals TT-423) en komt niet in het foutlog.
  if (!b && !mislukt) { toonProfielNietBeschikbaar('band'); return; }
  if (!b) { vak.innerHTML = foutStaatHTML(mislukt, 'de band laden', `laadBandScherm('${jsAttr(id)}')`); return; }

  const ik = hasOwnProfile ? myMusicianId : null;
  const kijker = !hasOwnProfile ? 'gast'
    : (ik && ik === b.beheerderId) ? 'beheerder'
    : (ik && b.leden.some(l => l.id === ik)) ? 'lid' : 'bezoeker';


  bandDeelGegevens = kijker === 'beheerder' ? b : null;
  vak.innerHTML = bandPaginaHTML(b, kijker);
  overneemKnoppenBijwerken(vak); // TT-528: vinkje bij covers die al in je repertoire staan
  // Zelfde volgorde als bij het muzikantprofiel: pas na het plaatsen starten
  // en meten (TT-517 fase 4, TT-249, TT-293).
  hoesStarten(vak);
  mediaTitelsBijwerken(vak);
  fitProfileName(vak);
  // TT-06: melden. Een band is te melden, niet te blokkeren.
  if (kijker === 'bezoeker' || kijker === 'gast') zetVeiligheidMenu('profielSchermActies', 'band', b.id, b.name);
}

// ═══════════════════════════════════════════════════════════════════════════
// Bandprofiel bewerken (TT-385, fase 3, 02-10-2026)
// ═══════════════════════════════════════════════════════════════════════════
// Besluiten Ronald, TT-385 punt 4 en 13: vier tegels zoals bij de muzikant,
// daaronder het blok Bandbeheer. Alleen de beheerder bewerkt (de database
// weigert het anderen). Het scherm is hetzelfde tegelscherm als Profiel
// bewerken (musicians.js): dezelfde terugknop, dezelfde vraag "Terug zonder
// opslaan?" en dezelfde stap in de geschiedenis. Elke tegel slaat met Opslaan
// alleen zijn eigen gegevens op. Uitnodigen, een uitnodiging intrekken en een
// lid uit de band halen gaan meteen: daar is een ander bij betrokken, en elk
// heeft zijn eigen vraag of melding.

let bewerkBandId = null;   // de band in Bandprofiel bewerken; leeg = je eigen profiel
let bewerkBandNaam = '';
let bewerkBandStad = '';

const BAND_TILES = [
  { id: 'bandWie',       title: 'Wie zijn we' },
  { id: 'bandBezetting', title: 'Onze bezetting' },
  { id: 'bandMuziek',    title: 'Onze muziek' },
  { id: 'bandMedia',     title: 'Onze media' }
];

// "Zoekend" of "compleet" volgt uit de open rollen. Een invaller telt niet mee
// (besluit Ronald). De waarde staat in bands.status, zodat Zoeken hem leest
// zoals voorheen. De Bandstatus (bands.stand) verandert hem niet (TT-457).
function bandStatusAfgeleid(aantalOpenRollen) {
  return aantalOpenRollen ? 'zoekend' : 'compleet';
}

// Openen vanaf de bandpagina (⋯ → Bandprofiel bewerken, een uitnodiging of de
// lege bandfoto) of vanaf Mijn Bands. Altijd het tegeloverzicht (TT-449).
function openBandTegels(bandId) {
  sluitAlleMenus();
  sluitBandDeelBlad();
  if (bewerkBandId !== bandId) bewerkBandNaam = '';
  bewerkBandId = bandId;
  zetBandNaamRegel();
  showView('profieltegels');
}

// De bandnaam als gedempte regel onder de titel van het overzicht en van de
// tegels Onze bezetting, Onze muziek en Onze media: zo is altijd te zien over
// welke band het gaat. In Wie zijn we staat de naam al in het veld.
function zetBandNaamRegel() {
  document.querySelectorAll('.band-naam-regel').forEach(el => { el.textContent = bewerkBandNaam || ''; });
}

function waardeVan(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || '').trim() : '';
}

// Haalt de band op die nu bewerkt wordt. Geeft null bij een fout, of als er
// intussen een andere band open staat.
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

// ─── Het overzicht: vier tegels en Bandbeheer ────────────────────────────────

// TT-543 onderdeel 6 (besluit Ronald 10-11-2026, 6: "omwille van de
// consistentie"): elke tegel toont wat er staat, zoals Profiel bewerken
// (onderdeel 1, voorstel 17), en "Nog leeg" waar niets staat. Eerst de regels
// van de vorige keer, alleen van dezelfde band; bij een fout blijven ze staan.
// Alleen Onze media kan leeg zijn: plaats, genres en de beheerder zijn er altijd.
let bandTegelRegels = { id: null, regels: {} };
let bandTegelRegelsVraag = 0;

function bandTegelRegelHTML(id, b) {
  const lijst = (x) => Array.isArray(x) ? x : [];
  const leeg = (wat) => `<span class="tegel-leeg">Nog leeg</span> · ${escHtml(wat)}`;
  const deel = (n, een, meer) => n ? `${n} ${n === 1 ? een : meer}` : '';
  if (id === 'bandWie') {
    const sterren = starDisplayHTML(b.niveau, true);
    const delen = [b.city ? escHtml(b.city) : '', sterren ? 'ervaring ' + sterren : ''].filter(Boolean);
    return delen.join(' · '); // plaats is verplicht: nooit leeg
  }
  if (id === 'bandBezetting') {
    const delen = [deel(lijst(b.band_members).filter(m => m.status === 'bevestigd').length, 'lid', 'leden'),
      deel(lijst(b.band_wanted).length, 'open rol', 'open rollen'),
      deel(lijst(b.band_invallers).length, 'invaller', 'invallers')].filter(Boolean);
    return escHtml(delen.join(' · ')); // de beheerder is altijd lid: nooit leeg
  }
  if (id === 'bandMuziek') {
    const delen = [lijst(b.genres).join(', '), deel(lijst(b.band_nummers).length, 'eigen nummer', 'eigen nummers'),
      deel(lijst(b.band_covers).length, 'cover', 'covers')].filter(Boolean);
    return escHtml(delen.join(' · ')); // genres zijn verplicht: nooit leeg
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
  const tegels = () => {
    const regels = bandTegelRegels.id === id ? bandTegelRegels.regels : {};
    wrap.innerHTML = tegelsHTML(BAND_TILES);
    wrap.querySelectorAll('.tile-sub').forEach((el, i) => { el.innerHTML = regels[BAND_TILES[i].id] || '&nbsp;'; });
  };
  tegels();
  renderBandBeheer();
  const vraag = ++bandTegelRegelsVraag;
  db.from('bands')
    .select('city, niveau, genres, avatar_url, band_members(status), band_wanted(instrument), band_invallers(id), band_nummers(titel), band_covers(song_title), band_media(media_type)')
    .eq('id', id).single()
    .then(({ data, error }) => {
      // Een oudere vraag, een andere band of een fout laat de regels staan.
      if (vraag !== bandTegelRegelsVraag || id !== bewerkBandId || error || !data) return;
      bandTegelRegels = { id, regels: {} };
      BAND_TILES.forEach(t => { bandTegelRegels.regels[t.id] = bandTegelRegelHTML(t.id, data); });
      tegels();
    }, () => {});
}


// TT-543 onderdeel 6, blok 3 (besluiten Ronald 10-11-2026, 7 tot en met 7d,
// en 12-11-2026, B3-2): Bandbeheer is een hoofdstuk met drie tegels, zoals
// Instellingen. Bandstatus kiest één van drie standen in het keuzemenu onder
// de tegel (tekst links, huisstijl §7.1; de standen in STANDEN, utils.js,
// gelijk aan de tegel Status van de muzikant); Beheer overdragen alleen als er
// een ander lid is; Bandprofiel verwijderen in plaats van Band opheffen. Delen
// via link is weg (7c). De regel onder Beheer overdragen is korter, zodat hij
// op één regel past (besluit Ronald 12-11-2026, B3-9).

// De stand uit de database (bands.stand). Een onbekende waarde telt als Actief.
function bandStandVan(b) {
  return b && STANDEN.some(x => x.waarde === b.stand) ? b.stand : 'actief';
}

let bandBeheerStand = 'actief';

async function renderBandBeheer() {
  const el = document.getElementById('bandBeheerBlok');
  const id = bewerkBandId;
  if (!el || !id) return;
  el.innerHTML = '';
  try {
    const { data: b, error } = await db.from('bands')
      .select('*, band_members(musician_id, status, founder_offer, musicians(weergavenaam, username))')
      .eq('id', id).single();
    if (error || !b) throw error || new Error('Band niet gevonden.');
    if (id !== bewerkBandId) return;
    bewerkBandNaam = b.name || '';
    bewerkBandStad = b.city || '';
    zetBandNaamRegel();
    bandBeheerStand = bandStandVan(b);
    const mid = await getMyMusicianId();
    const anderen = (b.band_members || []).filter(m => m.status === 'bevestigd' && m.musician_id !== mid);
    const gevraagd = anderen.filter(m => m.founder_offer).map(m => m.musicians ? displayNameOf(m.musicians) : '').filter(Boolean);
    const stand = STANDEN.find(x => x.waarde === bandBeheerStand);
    // Een vraag die loopt: de tegel noemt hem, een tik vraagt of je hem intrekt.
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
      rijen: () => STANDEN.map(x => ({ t: x.label, u: x.uitleg, gekozen: x.waarde === bandBeheerStand })),
      kies: i => zetBandStand(STANDEN[i].waarde)
    });
  } catch (e) {
    logCaught('renderBandBeheer', e);
    // TT-230: nooit stil verdwijnen; zeg wat er niet lukt.
    el.innerHTML = `<h2 class="hoofdstuk-kop">Bandbeheer</h2>
      <p class="field-hint">Bandbeheer laden lukt nu niet. Controleer je verbinding en open dit scherm opnieuw.</p>`;
  }
}

// De stand werkt meteen, zonder Opslaan, zoals een keuze in Instellingen.
async function zetBandStand(stand) {
  const id = bewerkBandId;
  if (!id || stand === bandBeheerStand) return;
  try {
    const { error } = rijenGeraakt(await db.from('bands')
      .update({ stand }).eq('id', id).select('id'));
    if (error) throw error;
    showToast('Wijzigingen opgeslagen.');
    renderBandBeheer();
    loadMyBands();
  } catch (e) {
    logCaught('zetBandStand', e);
    showToast(friendlyErrorMessage(e, 'de bandstatus opslaan'));
  }
}

// De vraag vóór het verwijderen (huisstijl §19; beeld stappen-voorstel, akkoord
// Ronald 10-11-2026): een kop met de vraag, de namen van de leden, Terug en
// Bandprofiel verwijderen naast elkaar, rood omlijnd.
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
    `Bandprofiel van ${naam} verwijderen?`
  );
}

// ─── Tegel: Wie zijn we ──────────────────────────────────────────────────────
// Naam, postcode en plaats, ervaring (TT-385 punt 14) en de tekst "Wie zijn
// we". De bandfoto staat in Onze media (besluit Ronald, 07-10-2026).

let bwSnapshot = null;
let bwNiveau = null;

function bwFieldSnapshot() {
  return JSON.stringify({
    naam: waardeVan('bwNaam'), zip: waardeVan('bwZip'), city: waardeVan('bwCity'),
    bio: waardeVan('bwBio'), niveau: bwNiveau || null
  });
}

async function openBandWie() {
  clearFieldErrors('bandWieScreen');
  const b = await bandBewerkGegevens('name, zip, city, city_source, description, niveau');
  if (!b) return;
  // De postcode loopt via de opzoekroute van de band (postcode.js).
  bandPostcodeDoel = 'bw';
  bandPostcodeResolved = !!(b.zip && b.city);
  bandPostcodeFailStreak = 0;
  bandPostcodeManualMode = false;
  bandCitySource = b.city_source || 'pdok';
  const stad = document.getElementById('bwCity');
  stad.readOnly = true;
  stad.style.cursor = 'not-allowed';
  document.getElementById('bwPostcodeStatus').textContent = '';
  document.getElementById('bwNaam').value = b.name || '';
  document.getElementById('bwZip').value = b.zip || '';
  stad.value = b.city || '';
  document.getElementById('bwBio').value = b.description || '';
  veldGroeit(document.getElementById('bwBio')); // TT-543 laag 3, 3-10
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
  // TT-247: alle fouten tegelijk, elk bij zijn eigen veld — dezelfde teksten
  // als het formulier Band aanmaken.
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
  loadMyBands();
  terugNaOpslaan('bandWie'); // TT-543 onderdeel 6 (besluit Ronald 10-11-2026, 9)
}

// ─── Tegel: Onze bezetting ───────────────────────────────────────────────────
// Leden, uitnodigingen, open rollen (TT-385 punt 7), invallers (punt 16) en
// de contactpersoon (punt 6). Wat je met iemand kunt, zit achter de drie
// puntjes in zijn rij (Ronald: "het moet veel subtieler, meer functioneel").

let bbLeden = [];          // bevestigde leden: { id, naam, avatar_url, rollen, rol }
let bbUitgenodigd = [];    // uitgenodigd, nog geen antwoord
let bbRollenBewerkt = {};  // id -> rollen die nog niet zijn opgeslagen (gaat mee met Opslaan)
let bbRollenLid = null;    // het lid waarvan het menu Rollen wijzigen openstaat
let bbWanted = [];         // open rollen (gaat mee met Opslaan)
let bbWantedVervuld = {};  // id -> rollen waarvan de open rol wegging doordat dit lid ze kreeg (B2-9)
let bbInvallers = [];      // { id, instrument } (gaat mee met Opslaan)
let bbInvalLijst = [];     // de instrumenten van bbInvallers, voor het keuzemenu
let bbContact = '';
let bbBeheerderId = null;
let bbSnapshot = null;

function bbFieldSnapshot() {
  return JSON.stringify({
    wanted: [...bbWanted].sort(), // B2-9: een open rol die terugkomt, staat achteraan
    invallers: bbInvallers.map(v => [v.id || null, v.instrument]),
    rollen: Object.keys(bbRollenBewerkt).sort().map(id => [id, bbRollenBewerkt[id]]),
    contact: bbContact || null
  });
}

async function openBandBezetting() {
  const b = await bandBewerkGegevens('name, city, founder_id, contact_id, band_wanted(instrument), band_invallers(id, instrument, created_at)');
  if (!b) return;
  bbBeheerderId = b.founder_id;
  bbRollenBewerkt = {};
  bbWantedVervuld = {};
  bbWanted = (b.band_wanted || []).map(w => w.instrument);
  bbInvallers = bbInvallersUit(b.band_invallers);

  // Het knopje "+ Open rol toevoegen" klapt het keuzemenu uit, 3/4 in het
  // midden; het blijft open (TT-543 draaiwielen deel 2, besluiten Ronald
  // 10-11-2026: 1B en R2). Wat gekozen is, staat als rij in de lijst erboven,
  // niet als badge.
  initPicker({
    id: 'bbWanted', fieldId: 'bbRolKnop', menuId: 'bbRolMenu', badgeRowId: 'bbRolBadges',
    options: INSTRUMENTS, getList: () => bbWanted,
    placeholder: 'Open rol toevoegen', // het plusteken staat in de knop (F6)
    onChange: bbRenderOpen
  });
  // De invaller zonder datum (besluit Ronald 11-11-2026, B2-8): "+ Invaller
  // toevoegen" werkt als "+ Open rol toevoegen": het keuzemenu blijft open en
  // een tik op een gekozen instrument haalt de invaller weer weg.
  initPicker({
    id: 'bbInval', fieldId: 'bbInvalKnop', menuId: 'bbInvalMenu', badgeRowId: 'bbInvalBadges',
    options: INSTRUMENTS, getList: () => bbInvalLijst,
    placeholder: 'Invaller toevoegen', // het plusteken staat in de knop (F6)
    onChange: bbInvalGewijzigd
  });
  // Eén keer aanmelden: initChoiceField() hangt luisteraars aan het veld.
  if (!CHOICE_FIELDS['band-contact']) {
    initChoiceField({ id: 'band-contact', fieldId: 'bbContactVeld', menuId: 'bbContactMenu', selectId: 'bbContactKeuze' });
  }
  // Rollen wijzigen (besluit Ronald 11-11-2026, B2-6: "A, per lid"): het
  // keuzemenu van Open rol, onder de rij van het lid (bbRollenWijzigen()).
  if (!CHOICE_FIELDS['bb-rollen']) {
    initChoiceField({
      id: 'bb-rollen', fieldId: 'bbRollenVeld', menuId: 'bbRollenMenu', meer: true,
      rijen: () => INSTRUMENTS.map(t => ({ t, gekozen: bbRollenVan(bbRollenLid).includes(t) })),
      kies: i => bbRolWissel(INSTRUMENTS[i])
    });
  }
  await bbLaadLeden(b.contact_id);
  bbRenderOpen();
  bbRenderInvallers();
  bbSnapshot = bbFieldSnapshot();
}

// De invallers op volgorde van toevoegen. bbInvalLijst houdt dezelfde
// instrumenten bij voor het keuzemenu.
function bbInvallersUit(rijen) {
  const lijst = (rijen || []).slice()
    .sort((x, y) => String(x.created_at || '').localeCompare(String(y.created_at || '')))
    .map(v => ({ id: v.id || null, instrument: v.instrument }));
  bbInvalLijst = lijst.map(v => v.instrument);
  return lijst;
}

// Het keuzemenu wijzigde bbInvalLijst: een nieuw instrument wordt een nieuwe
// invaller, een weggehaald instrument haalt die invaller weg. De grens van 20
// zegt de app vóór de handeling (app-gedrag, Grenzen).
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

// Leden en uitnodigingen. Los van de rest, want uitnodigen, intrekken en
// uit de band halen gaan meteen; wat nog niet is opgeslagen, blijft staan.
async function bbLaadLeden(contactStart) {
  const id = bewerkBandId;
  if (!id) return;
  const { data, error } = await db.from('band_members')
    .select('musician_id, role, rollen, status, musicians(id, weergavenaam, username, avatar_url)')
    .eq('band_id', id);
  if (error) {
    logCaught('bbLaadLeden', error);
    showToast(friendlyErrorMessage(error, 'de leden laden'));
    return;
  }
  if (id !== bewerkBandId) return;
  // Op naam, zoals de bezetting op de bandpagina (besluit Ronald 11-11-2026, B2-1).
  const opNaam = (x, y) => x.naam.localeCompare(y.naam, 'nl');
  const naarLid = m => ({
    id: m.musician_id, naam: displayNameOf(m.musicians), avatar_url: (m.musicians && m.musicians.avatar_url) || null,
    rollen: m.rollen || [], rol: m.role
  });
  bbLeden = (data || []).filter(m => m.status === 'bevestigd').map(naarLid).sort(opNaam);
  bbUitgenodigd = (data || []).filter(m => m.status === 'aangevraagd').map(naarLid).sort(opNaam);
  // Een lid dat er niet meer is, heeft ook geen rollen meer om op te slaan.
  Object.keys(bbRollenBewerkt).forEach(x => { if (!bbLeden.some(l => l.id === x)) delete bbRollenBewerkt[x]; });
  // Wie weg is, speelt die rol niet meer: de open rol komt terug.
  Object.keys(bbWantedVervuld).forEach(x => {
    if (bbLeden.some(l => l.id === x)) return;
    bbWanted.push(...bbWantedVervuld[x]);
    delete bbWantedVervuld[x];
    bbRenderOpen();
  });
  // De contactpersoon is een bevestigd lid; anders de beheerder.
  const gewenst = contactStart !== undefined ? contactStart : bbContact;
  bbContact = bbLeden.some(l => l.id === gewenst) ? gewenst : bbBeheerderId;
  bbRenderLeden();
}

// De foto in een rij (.bb-rij): het fotootje, afgeschermd het wazige beeld
// (TT-517 fase 7), anders de schijnwerper. `vierkant`: een bandfoto.
function bbFotoHTML(url, wacht, vierkant) {
  const extra = (wacht ? ' bb-wacht' : '') + (vierkant ? ' bb-foto-vierkant' : '');
  const w = wazigBron(url);
  if (w) return `<span class="bb-foto bb-foto-leeg${extra}" aria-hidden="true">${wazigHTML(w)}</span>`;
  const veilig = safeUrl(url);
  return veilig
    ? `<img class="bb-foto${extra}" ${kleinFotoAttr(veilig)} alt="">`
    : `<span class="bb-foto bb-foto-leeg${extra}" aria-hidden="true">${ZONDER_FOTO_HTML}</span>`;
}

// Eén rij: foto, naam, een regel eronder (al als HTML), en rechts de drie
// puntjes met wat je met deze rij kunt. Zelfde menu als op Mijn Bands.
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

// De rollen van een lid zoals ze nu op het scherm staan: nog niet opgeslagen
// wijzigingen gaan voor.
function bbRollenVan(id) {
  if (bbRollenBewerkt[id]) return bbRollenBewerkt[id];
  const l = bbLeden.find(x => x.id === id);
  return l ? l.rollen : [];
}

// De regel onder een lid: zijn rollen (een lid zonder rol: "Lid"), en
// "beheerder" bij de beheerder.
function bbLidRegel(l) {
  const rollen = bbRollenVan(l.id);
  return [rollen.length ? rollen.join(' · ') : roleLabel('Lid'), l.id === bbBeheerderId ? 'beheerder' : ''].filter(Boolean).join(' · ');
}

function bbRenderLeden() {
  const ik = myMusicianId;
  // Het menu Rollen wijzigen hangt onder een rij; eerst terug naar zijn eigen plek.
  const anker = document.getElementById('bbRollenAnker');
  if (anker && anker.parentElement && anker.parentElement.id === 'bbLeden') document.getElementById('bbLeden').after(anker);
  // Eén rij per lid, met de rollen eronder (besluit Ronald 11-11-2026, B2-6:
  // "A, per lid"). Rollen wijzigen kan bij elk lid, ook bij de beheerder zelf.
  // De beheerder haalt zichzelf niet uit de band: dat is beheer overdragen of
  // het bandprofiel verwijderen (Bandbeheer).
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

  // De contactpersoon kies je uit de bevestigde leden.
  const sel = document.getElementById('bbContactKeuze');
  sel.innerHTML = bbLeden.map(l => `<option value="${escHtml(l.id)}">${escHtml(l.naam + (l.id === ik ? ' (jij)' : ''))}</option>`).join('');
  sel.value = bbContact || '';
  refreshChoiceField('band-contact');
}

// Het plusje in een open rol of invaller zoekt een muzikant (Zoeken met dat
// instrument). Daarom een knop, geen teken; "Zoek een muzikant" staat dus niet
// ook nog in het ⋯-menu (§0, geen dubbele functie).
function bbPlusHTML(zoekAanroep, label) {
  return `<button type="button" class="bb-foto bezetting-open-rondje bb-plus" onclick="${zoekAanroep}" aria-label="${escHtml(label)}">+</button>`;
}

// Rollen wijzigen: het keuzemenu klapt uit onder de rij van het lid. Het menu
// blijft open; een tik op een gekozen rol haalt hem weg. De laatste rol blijft
// staan (besluit Ronald 11-11-2026, B2-4: minstens één rol).
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
    // Weer uitgezet: de open rol die daardoor wegging, komt terug.
    if (vervuld.includes(rol)) {
      vervuld.splice(vervuld.indexOf(rol), 1);
      bbWanted.push(rol);
      bbRenderOpen();
    }
  } else {
    nieuw.push(rol);
    // Een open rol gaat weg zodra een lid die rol krijgt (besluit Ronald
    // 11-11-2026, B2-9: "A"). De database doet hetzelfde (tt_open_rol_vervuld);
    // alleen voor een rol die nieuw is, want alleen daar haalt die hem weg.
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

// Een open rol en een invaller: "Gezocht" of "Invaller" vet, het instrument
// eronder, zoals op de bandpagina (besluit Ronald 10-11-2026, 12: één vorm).
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

// Zoeken verlaat dit scherm. Staat er nog iets open, dan eerst opslaan:
// anders is het weg.
function bbZoekNaar(instrument, invaller) {
  if (!instrument) return;
  if (tegelHeeftWijzigingen()) { showToast('Sla eerst je wijzigingen op.'); return; }
  zoekMuzikantVoorRol(instrument, bewerkBandStad, bewerkBandNaam, !!invaller, bewerkBandId);
}

// TT-543 onderdeel 4 (besluiten Ronald 09-11-2026, B4, en sessie 102: "zoals
// open rol"): "+ Lid uitnodigen" opent Zoeken → Muzikanten met de band erboven,
// net als het plusje van een open rol, maar zonder instrument.
function bbLidUitnodigen() {
  if (!bewerkBandId) return;
  if (tegelHeeftWijzigingen()) { showToast('Sla eerst je wijzigingen op.'); return; }
  zoekMuzikantVoorRol('', bewerkBandStad, bewerkBandNaam, false, bewerkBandId);
}

// Een uitnodiging intrekken gaat meteen: wie nog niet antwoordde, staat ook
// nog nergens op de bandpagina.
async function bbIntrekken(musicianId, naam) {
  const id = bewerkBandId;
  if (!id) return;
  try {
    const { error } = rijenGeraakt(await db.from('band_members').delete()
      .eq('band_id', id).eq('musician_id', musicianId).eq('status', 'aangevraagd').select('band_id'));
    if (error) throw error;
    showToast(`Uitnodiging aan ${naam} ingetrokken.`);
    bbLaadLeden();
    loadMyBands();
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
    // De rollen per lid (besluit Ronald 10-11-2026, 12). Alleen de beheerder
    // mag ze wijzigen; de database bewaakt dat ook (tt_rollen_bewaken). Eerst
    // de rollen: de database haalt dan de open rol van een nieuwe rol weg
    // (B2-9), en de open rollen hieronder zetten daarna precies wat je ziet.
    for (const [lid, rollen] of Object.entries(bbRollenBewerkt)) {
      const { error } = rijenGeraakt(await db.from('band_members').update({ rollen })
        .eq('band_id', id).eq('musician_id', lid).select('musician_id'));
      if (error) throw error;
    }
    // TT-281: de open rollen in één transactie, zoals voorheen.
    const { error: wErr } = await db.rpc('tt_save_band_wanted', { p_band_id: id, p_instruments: bbWanted });
    if (wErr) throw wErr;
    // Invallers: alleen wat wegging weghalen en wat nieuw is toevoegen. Zo
    // gaat er bij een fout halverwege nooit een bestaande invaller verloren.
    const eerder = JSON.parse(bbSnapshot).invallers.map(v => v[0]).filter(Boolean);
    const nogDaar = bbInvallers.map(v => v.id).filter(Boolean);
    const weg = eerder.filter(x => !nogDaar.includes(x));
    if (weg.length) {
      const { error } = await db.from('band_invallers').delete().in('id', weg);
      if (error) throw error;
    }
    const nieuw = bbInvallers.filter(v => !v.id);
    if (nieuw.length) {
      const { error } = await db.from('band_invallers')
        .insert(nieuw.map(v => ({ band_id: id, instrument: v.instrument })));
      if (error) throw error;
    }
    // Leeg is de beheerder (projectinstructies §10): zo volgt de
    // contactpersoon vanzelf als het beheer wordt overgedragen.
    const { error: bErr } = rijenGeraakt(await db.from('bands').update({
      contact_id: bbContact && bbContact !== bbBeheerderId ? bbContact : null,
      status: bandStatusAfgeleid(bbWanted.length)
    }).eq('id', id).select('id'));
    if (bErr) throw bErr;
    // De nieuwe invallers hebben nu een id.
    const { data: rijen, error: rErr } = await db.from('band_invallers').select('id, instrument, created_at').eq('band_id', id);
    if (rErr) throw rErr;
    bbInvallers = bbInvallersUit(rijen);
    bbRenderInvallers();
    // De rollen staan nu in de database; de leden opnieuw, met hun rollen.
    if (Object.keys(bbRollenBewerkt).length) {
      bbRollenBewerkt = {};
      bbWantedVervuld = {};
      await bbLaadLeden();
    }
    bbSnapshot = bbFieldSnapshot();
    showToast('Wijzigingen opgeslagen.');
    loadMyBands();
    terugNaOpslaan('bandBezetting'); // TT-543 onderdeel 6 (besluit Ronald 10-11-2026, 9)
  } catch (e) {
    logCaught('saveBandBezetting', e);
    showToast(friendlyErrorMessage(e, 'de bezetting opslaan'));
  }
}

// ─── Tegel: Onze muziek ──────────────────────────────────────────────────────
// Wat voor band (TT-385 punt 15), genres, eigen nummers als titel en link
// (punt 8) en covers met dezelfde zoekvelden als bij de muzikant.

const BAND_SOORT_KEUZES = [['eigen', 'Eigen nummers'], ['covers', 'Coverband'], ['beide', 'Beide']];

let bmzSoort = null;
let bmzGenres = [];
let bmzNummers = [];   // { id, titel, url }
let bcCovers = [];     // { id, title, artist }
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
  const b = await bandBewerkGegevens('name, city, soort, genres, band_nummers(id, titel, url, created_at), band_covers(id, song_title, song_artist)');
  if (!b) return;
  bmzZet(b);
  initPicker({
    id: 'bmzGenre', fieldId: 'bmzGenreField', badgeRowId: 'bmzGenreBadgeRow',
    options: GENRES, getList: () => bmzGenres,
    placeholder: 'Kies een genre',
    toevoegen: 'Genre' // TT-543 draaiwielen deel 2, besluit Ronald 10-11-2026 (vraag 3: "A")
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

// Nog een tik op de gekozen knop zet hem uit, zoals "Wat speel je vooral?".
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
        <input type="url" class="media-rij-url" id="bmzUrl${i}" value="${escHtml(n.url)}" placeholder="https://youtube.com/watch?v=..." aria-label="Link naar het nummer" oninput="bmzNummers[${i}].url = this.value" onchange="bmzRenderNummers()">
      </div>
      <button type="button" class="song-remove" onclick="bmzNummerWeg(${i})" aria-label="Nummer weghalen">${RIJ_KRUIS}</button>
    </div>`;
}

// Tijdens het typen alleen de waarde bijhouden; hertekenen gebeurt als het
// veld verlaten wordt (huisstijl §18.2).
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

// Covers: kiezen uit de zoekvelden (jstOnArtistSearch met voorvoegsel bc).
function bcAddCover(title, artist) {
  if (bcCovers.find(c => c.title === title && c.artist === artist)) return;
  if (grensBereikt(bcCovers.length, GRENZEN.covers, `Maximum van ${GRENZEN.covers} covers bereikt.`)) return;
  bcCovers.push({ id: null, title, artist });
  songZoekLeeg('bc');
  bcRenderCovers();
}

// Zelfde lijst en zelfde volgorde als het repertoire van een muzikant, zonder
// beheersing. Weghalen vraagt eerst "Zeker?", zoals in Je setlist (TT-226).
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
    // Een tik ergens anders zet de knop terug (TT-226). Pas ná deze tik.
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
    const url = n.url.trim();
    if (!titel && !url) return; // een lege rij valt gewoon weg
    if (!titel) fouten.push([`bmzTitel${i}`, 'Vul de titel in']);
    if (!/^https?:\/\//i.test(url)) fouten.push([`bmzUrl${i}`, 'Vul een link in die begint met https://']);
  });
  if (showFieldErrors(fouten)) return;
  if (bmzFieldSnapshot() === bmzSnapshot) return;
  const id = bewerkBandId;
  if (!id) return;
  try {
    const { error: bErr } = rijenGeraakt(await db.from('bands').update({ soort: bmzSoort, genres: bmzGenres.slice() }).eq('id', id).select('id'));
    if (bErr) throw bErr;

    // Eigen nummers en covers: alleen wat wegging weghalen, wat wijzigde
    // bijwerken en wat nieuw is toevoegen. Bij een fout halverwege gaat er
    // zo nooit iets verloren dat er al stond.
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
      const { error } = await db.from('band_nummers').insert(nieuweNummers.map(n =>
        ({ band_id: id, titel: n.titel.trim(), url: n.url.trim(), platform: detectPlatform(n.url.trim()) })));
      if (error) throw error;
    }
    const coverWeg = eerder.covers.map(c => c[0]).filter(x => x && !bcCovers.some(c => c.id === x));
    if (coverWeg.length) {
      const { error } = await db.from('band_covers').delete().in('id', coverWeg);
      if (error) throw error;
    }
    const nieuweCovers = bcCovers.filter(c => !c.id);
    if (nieuweCovers.length) {
      const { error } = await db.from('band_covers').insert(nieuweCovers.map(c =>
        ({ band_id: id, song_title: c.title, song_artist: c.artist })));
      if (error) throw error;
    }

    // De nieuwe rijen hebben nu een id; de zoekvelden blijven staan.
    const b = await bandBewerkGegevens('soort, genres, band_nummers(id, titel, url, created_at), band_covers(id, song_title, song_artist)');
    if (!b) return;
    bmzZet(b);
    renderPickerBadges(PICKERS.bmzGenre);
    bmzRenderSoort();
    bmzRenderNummers();
    bcRenderCovers();
    bmzSnapshot = bmzFieldSnapshot();
    showToast('Wijzigingen opgeslagen.');
    loadMyBands();
    terugNaOpslaan('bandMuziek'); // TT-543 onderdeel 6 (besluit Ronald 10-11-2026, 9)
  } catch (e) {
    logCaught('saveBandMuziek', e);
    showToast(friendlyErrorMessage(e, 'de muziek opslaan'));
  }
}

// ─── Tegel: Onze media ───────────────────────────────────────────────────────
// Dezelfde vorm en dezelfde gedeelde functies als Je mediahoek (huisstijl
// §18.2); deze functies heten bm... (mediaFnNaam). Foto's en video's gaan
// naar de eigen map van de band. Daaronder de drie socials (punt 10).

let bmMediaFiles = [];   // { id, url, path, type, uploading, inBanner, name }
let bmMediaLinks = [];   // { id, url, inBanner }
let bmSnapshot = null;
let bmFotoUrl = null;    // de bandfoto (bands.avatar_url)
let bmFotoBron = null, bmFotoKader = null; // TT-543 blok 4b: de hele foto en de plek
let bmFotoBezig = false;
let bmOrigineel = [];    // [id, url, in_banner, uitsnede] zoals in de database

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
  const b = await bandBewerkGegevens('name, city, avatar_url, avatar_bron, avatar_kader, instagram, tiktok, youtube, band_media(id, media_type, url, platform, in_banner, created_at, uitsnede)');
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
  vak.innerHTML = url ? `<img ${kleinFotoAttr(url)} alt="bandfoto">` : ''; // TT-517 fase 6: zonder foto de schijnwerper met silhouet (styles.css)
  document.getElementById('bmFotoRemoveBtn').classList.toggle('visible', !!url);
}

async function bmFotoKiezen(file) {
  if (!file) return;
  const typeProblem = fileTypeProblem(file, AVATAR_MIME_TYPES, AVATAR_TYPE_LABEL);
  if (typeProblem) { showToast(typeProblem); return; }
  { const groot = bestandTeGrootMelding(file, 5 * 1024 * 1024); if (groot) { showToast(groot); return; } }
  const id = bewerkBandId;
  const uit = await kiesUitsnede(file, 'vierkant'); // TT-520 deel 2: eerst de uitsnede
  if (uit && id === bewerkBandId) bmFotoZetten({ file: uit, kader: uit.kader, bron: file });
}

// TT-543 blok 4b: een tik op de bandfoto verschuift hem; zonder foto kies je er een.
async function bmFotoTik() {
  if (!bmFotoUrl) { document.getElementById('bmFotoInput').click(); return; }
  const id = bewerkBandId;
  const uit = await fotoVerschuiven({ url: bmFotoUrl, bron: bmFotoBron, kader: bmFotoKader }, 'vierkant');
  if (uit && id === bewerkBandId) bmFotoZetten(uit);
}

// Toont de nieuwe uitsnede meteen en uploadt hem, met de hele foto erbij.
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

// TT-381: het kruisje vraagt eerst, zoals bij de profielfoto. De foto is pas
// weg na Opslaan. De bandfoto gaat naar de eigen map van de band
// (bands/<band-id>/, zie projectinstructies §10), niet naar die van de
// beheerder: anders verdwijnt hij als de beheerder vertrekt.
function bmVraagFotoWeg() {
  showConfirm('Bandfoto verwijderen?', () => { bmFotoUrl = bmFotoBron = bmFotoKader = null; bmRenderFoto(); }, 'Ja, verwijderen');
}

// TT-543 onderdeel 6 (besluit Ronald 10-11-2026, 10): een keuze in het menu van
// "+ Toevoegen", zoals Je mediahoek (utils.js).
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
    { const groot = bestandTeGrootMelding(file, 50 * 1024 * 1024); if (groot) { showToast(groot); return; } }
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

// Eén raster: foto's en video's, dan links, dan "+ Toevoegen" (mediaRasterHTML()).
function bmRenderMediaGrid() {
  document.getElementById('bmMediaGrid').innerHTML = mediaRasterHTML(bmMediaFiles, bmMediaLinks, 'bm');
  bannerTellerBijwerken('bmBannerTeller', bmMediaFiles, bmMediaLinks);
}

function bmToggleMediaBanner(i) {
  return bannerTekenTik(bmMediaFiles[i], bmMediaFiles, bmMediaLinks, 'bmMediaGrid', 'bmBannerTeller');
}

function bmSpeelMedia(i) {
  mediaTegelTik(bmMediaFiles[i]); // TT-543 blok 4b: een bannerfoto opent het kader
}

// Een net geüpload bestand dat weer weg gaat, gaat ook uit de opslag. Een
// bestand dat al op de pagina stond, blijft daar tot Opslaan.
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
  // Een social is een gebruikersnaam of een link; van een naam maakt de
  // bandpagina zelf de link (bandSocialLink()).
  const fouten = [];
  BAND_SOCIALS.forEach(soc => {
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

    // Alleen wat wegging weghalen, wat wijzigde bijwerken en wat nieuw is
    // toevoegen (zie Onze muziek). De volgorde blijft die van binnenkomst.
    const nu = bmMediaFiles.filter(m => m.url && !m.url.startsWith('blob:'))
      .map(m => ({ id: m.id, media_type: m.type, url: m.url, platform: null, in_banner: !!m.inBanner, uitsnede: bannerKader(m) }))
      .concat(bmMediaLinks.filter(l => l.url.trim())
        .map(l => ({ id: l.id, media_type: 'link', url: l.url.trim(), platform: detectPlatform(l.url.trim()), in_banner: !!l.inBanner, uitsnede: null })));
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
      const { error } = await db.from('band_media').insert(nieuw.map(m =>
        ({ band_id: id, media_type: m.media_type, url: m.url, platform: m.platform, in_banner: m.in_banner, uitsnede: m.uitsnede, wazig: wazigVoor(m.url) })));
      if (error) throw error;
    }
    opslagOpruimen('media', 'bands/' + id, nu.map(m => m.url));

    const b = await bandBewerkGegevens('avatar_url, avatar_bron, avatar_kader, instagram, tiktok, youtube, band_media(id, media_type, url, platform, in_banner, created_at, uitsnede)');
    if (!b) return;
    bmZet(b);
    bmSnapshot = bmFieldSnapshot();
    showToast('Wijzigingen opgeslagen.');
    loadMyBands();
    terugNaOpslaan('bandMedia'); // TT-543 onderdeel 6 (besluit Ronald 10-11-2026, 9)
  } catch (e) {
    logCaught('saveBandMedia', e);
    showToast(friendlyErrorMessage(e, 'de media opslaan'));
  }
}

// ─── Uitnodigen vanuit Zoeken (besluit Ronald, 02-10-2026, na fase 3) ─────────
// Een tik op een open rol of op "+ Lid uitnodigen" opent Zoeken
// (zoekMuzikantVoorRol()). Het profiel van een muzikant uit die zoekopdracht
// krijgt dan de knop "Uitnodigen voor <band>", boven de berichtknop. Alleen
// voor een vaste rol of een lid: een invaller vraag je in een bericht. De band
// staat in zoekRolBand tot Zoeken opnieuw opent (configureSearchAccess()). Wie
// al lid of uitgenodigd is, of geen banduitnodigingen wil (TT-56), krijgt geen
// knop.
let zoekRolBand = null; // { id, naam }

async function rolUitnodigKnopPlaatsen(musicianId, naam) {
  const band = zoekRolBand;
  // TT-543 onderdeel 3 (F3 B): op het muzikantprofiel staan de knoppen onder
  // de bio (#profielSchermActie), niet meer in de vaste balk onderaan.
  const voet = document.getElementById('profielSchermActie');
  if (!band || !hasOwnProfile || !voet || !musicianId || musicianId === myMusicianId) return;
  if (typeof blokkeerIkZelf === 'function' && blokkeerIkZelf(musicianId)) return;
  // TT-56: wie geen banduitnodigingen krijgt, kreeg in het venster Lid
  // uitnodigen geen knop; hier ook niet. Sinds blok 4 (B4-1): alleen een
  // muzikant op Actief. De vraag loopt tegelijk met die naar de leden.
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

// TT-543 onderdeel 4 (besluiten Ronald 09-11-2026, B4, en sessie 102): een tik
// op "Uitnodigen voor <band>" nodigt niet meteen uit, maar opent onder de hoes
// één blok: de kop "<naam> uitnodigen voor <band>" (de naam die de app toont,
// over meer regels als hij lang is), het berichtvak met "Boodschap aan <naam>
// (niet verplicht)" erboven, en "Uitnodiging versturen" en "Annuleren". De
// rest van het profiel staat er dan niet (.uitnodig-open in styles.css);
// Annuleren zet het terug. Vervangt de korte boodschap uit het venster Lid
// uitnodigen (V-18).
// Blok 2 (besluit Ronald 11-11-2026, B2-7): boven de boodschap het veld
// "Rol in <band>": wat de muzikant in deze band doet, minstens één rol. Kwam
// je via een open rol, dan staat die rol er al in.
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
  veldGroeiVolgen(document.getElementById('uitnodigBoodschap')); // TT-543 laag 3, 3-10
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
  if (knop) knop.disabled = true; // een tweede tik maakt geen tweede uitnodiging
  const boodschap = document.getElementById('uitnodigBoodschap')?.value || '';
  if (showFieldErrors(uitnodigRollen.length ? [] : [['uitnodigRolVeld', 'Kies minstens één rol']])) {
    if (knop) knop.disabled = false;
    return;
  }
  const gelukt = await addBandMember(band, musicianId, boodschap, uitnodigRollen.slice());
  if (knop) knop.disabled = false;
  if (!gelukt) return; // het blok en de tekst blijven staan; de melding zegt wat er misging
  rolUitnodigBlokSluiten();
  document.querySelector('#profielSchermActie .rol-uitnodig-knop')?.remove();
}
