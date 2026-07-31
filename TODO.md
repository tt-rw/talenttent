# The Talent Tent — TODO

Laatste update: 31 juli 2026 (PPP-principe vastgelegd: Presentatie, Prestatie, Plezier)

## 🎯 Kernprincipe: het PPP-principe (leidend voor alle keuzes)
De app rust op drie pijlers:
- **Presentatie** — het persoonlijke (band)profiel om je voortgang te monitoren en te delen met anderen.
- **Prestatie** — de zoekfunctie, gebaseerd op dat profiel, met als doel samen te spelen.
- **Plezier** — het verbindende element: het plezier van het spelen/optreden zelf, en van het gebruik van de app, dat muzikanten steeds terug laat komen naar de Tent.

Elke architectuur- of featurebeslissing moet expliciet aan één of meer van deze drie pijlers bijdragen. Bij twijfel over een nieuwe feature: eerst toetsen welke pijler(s) het dient.

## Hoe te gebruiken
- Dit bestand staat naast `index.html` in de repo.
- Upload het samen met `index.html` aan het begin van een nieuwe chatsessie, zodat Claude weet waar we gebleven zijn.
- Vink taken af door `[ ]` te veranderen in `[x]`.
- Voeg nieuwe punten toe onderaan de juiste sectie.

---

## ✅ Afgerond
- [x] Prototype
- [x] Database (Supabase)
- [x] Authenticatie (signup/signin, e-mailbevestiging uit)
- [x] Zoekfunctie muzikanten
- [x] Bandprofielen
- [x] Landingspagina
- [x] Wachtwoord vergeten / resetten
- [x] Zoekscherm leegmaken na toevoegen nieuw nummer (repertoire) — was al aanwezig in `addSong()`
- [x] Na profiel aanmaken direct naar homepagina (i.p.v. tussenstap met "Zoek muzikanten"-preview)
- [x] Ander font-type — nu overal Roboto (Regular), i.p.v. Bebas Neue + DM Sans. **Let op:** huisstijl-instructie (project-instructies) moet nog hierop aangepast worden — zie notities.
- [x] Postcode altijd correct + woonplaats automatisch aanvullen — postcode (4 cijfers, geen letters nodig) is verplicht, woonplaats wordt via PDOK Locatieserver (gratis, officieel) automatisch en alleen-lezen ingevuld. Als de postcode niet klopt/bestaat, kan de gebruiker niet doorgaan.
- [x] Postcode-cache tegen storingen — succesvolle opzoekingen worden bewaard in een eigen Supabase-tabel (`postcode_cache`). Als PDOK tijdelijk niet bereikbaar is, valt de app terug op deze cache i.p.v. de gebruiker vast te laten lopen. **Actie voor Ronald:** draai eenmalig `postcode_cache_setup.sql` in de Supabase SQL Editor (Supabase dashboard → SQL Editor → plak inhoud → Run) om de tabel aan te maken. Zonder deze tabel werkt de postcode-opzoeking nog wel (via PDOK), alleen de storings-fallback dan niet.
- [x] Volledige backup van alle NL postcodes — de tabel is in één keer gevuld met een gratis, kant-en-klare lijst (bron: MIT-licentie, github.com/bobdenotter/4pp). Pure postbusnummers (622 stuks, geen woonadres) zijn er standaard uitgefilterd. Resultaat: **4077 postcodes geïmporteerd** — vrijwel exact gelijk aan het officiële aantal 4-cijferige postcodegebieden in Nederland (~4071-4072). Tabel bevat ook gemeente, provincie, netnummer en coördinaten (voorbereiding op postcode-rozen).
- [x] Cache onzichtbaar voor gebruiker — het label "(via cache)" is verwijderd. Live PDOK-resultaat en cache-fallback tonen nu allebei gewoon "Gevonden: {stad}", geen zichtbaar verschil meer. Geen gevolgen zodra PDOK weer online is: elke nieuwe postcode-invoer probeert altijd eerst live PDOK, de cache is puur een fallback per moment, niets wordt "onthouden".
- [x] **Matchcode-architectuur + zoekfunctie met matchscore (volledig afgerond, incl. database + app):**
  - **Progressief profiel:** verplicht = naam, e-mail, postcode, instrument, genre, repertoire. Optioneel/achteraf = doel, foto, media.
  - **Matchcode (bitmask):** elk instrument/genre heeft een vaste bitpositie in een koppeltabel (`instrument_bits`/`genre_bits`). Nieuwe instrumenten/genres krijgen automatisch de eerstvolgende vrije positie (via `tt_add_instrument`/`tt_add_genre`), bestaande posities worden nooit hernummerd. Matchcode wordt door database-triggers automatisch afgeleid uit `musician_instruments`/`musician_genres`/`bands.genres`/`band_wanted` en blijft volledig op de achtergrond.
  - **Postcode/ID bewust apart van de matchcode** — afstand (coördinaten) en exacte lookup (ID) zijn andere bewerkingen dan instrument/genre-overlap.
  - **Matchscore-formule:** harde afstandsfilter (postcode + instelbare straal, standaard 25 km, Haversine) → `matchscore = 0,65 × instrumentoverlap + 0,35 × genreoverlap` (Jaccard via bitmasks) → 6-maanden-activiteitsknip (verouderde profielen altijd onderaan, sortering daarbinnen blijft op matchscore) → sortering standaard op matchscore, gebruiker kan wisselen naar "dichtstbijzijnde eerst" → weergave incl. repertoire met mastery-niveau (informatief, telt niet mee) → nooit jezelf of verwijderde profielen tonen.
  - **Muzikant ↔ band:** instrumentcomponent is een dekkingsscore vanuit de band-vraag (`AND(musicus_mask, band_wanted_mask) / band_wanted_mask`), geen symmetrische Jaccard — extra instrumenten die de band niet zoekt tellen niet mee. Genre blijft gewone Jaccard.
  - **Bandvereisten:** postcode, minimaal 1 genre en minimaal 1 gezocht instrument nu verplicht bij bandaanmaken (was optioneel, voorkwam lege matchcode/delen-door-nul).
  - **Database:** vastgelegd in `matching_setup.sql`, eenmalig gedraaid door Ronald in Supabase SQL Editor. Bevat koppeltabellen, kolommen (`latitude`/`longitude`/`instrument_mask`/`genre_mask`/`wanted_mask`, `bands.zip` toegevoegd), triggers die alles automatisch bijhouden, en drie zoekfuncties (`tt_search_musicians`, `tt_search_bands_for_musician`, `tt_search_musicians_for_band`). Getest en werkend bevonden.
  - **App (`index.html`):** bandformulier met verplichte postcode/genre/instrument; muzikanten- en bandzoekscherm met instelbare straal + sorteertoggle (beste match/dichtstbijzijnde); matchpercentage + afstand zichtbaar op resultaatkaarten; valt terug op de oude lijst-weergave als iemand nog geen eigen profiel heeft (bijv. niet ingelogd).
  - **Bewust geparkeerd:** setlist-matching zelf en het mechaniek van "Zoeken op setlist" (zie apart punt hieronder) — mastery-niveau wordt al wel getoond, telt alleen niet mee in de score.
- [x] Zoekfunctie met postcode-rozen (instelbare zoekstraal) — onderdeel van de matchcode-architectuur hierboven.
- [x] Zoekresultaten tonen naar relevantie (matchscore + 6-maanden-activiteitsknip) — onderdeel van de matchcode-architectuur hierboven. **Nog niet door Ronald getest/bevestigd in de praktijk.**
- [x] Postcode-tekst: hint "alleen de 4 cijfers, geen huisletters nodig" toegevoegd bij postcodeveld (muzikant én band).
- [x] Enter-toets bij repertoire (band/nummer): bovenste suggestie wordt geselecteerd, cursor springt daarna meteen naar het volgende invulveld zodat direct doorgetypt kan worden. Na toevoegen van een nummer springt de cursor terug naar het artiestveld voor het volgende nummer.
- [x] Klik op inlognaam/avatar in de navigatiebalk opent een pulldown-menu met "Mijn profiel" en "Uitloggen" erin (ruimte om later meer aan toe te voegen). Het `navMyProfile`-element (verplichte feature) bestaat nog steeds met dezelfde id/functionaliteit, nu als menu-item i.p.v. los knopje in de hoofdnavigatie — dus geen conflict meer met de projectinstructies-checklist.
- [x] Pagina's beeldvullend maken — **alleen op desktop/web** (vanaf 768px breedte), mobiel bewust ongewijzigd. **Akkoord bevestigd door Ronald.** Nog niet visueel geverifieerd door Claude (geen browsertoegang) — graag even controleren of dit er goed uitziet.
- [x] Woonplaats met Alternatieve Schrijfwijze (Den Haag i.p.v. 's-Gravenhage) — gebruikt nu de kolom `alternatieve_schrijfwijzen` uit `postcode_cache` (voorrang op de officiële PDOK-naam), zowel bij muzikant- als bandprofiel.

- [x] "Muzikanten"/"Bands"-zoektabbladen blijven nu ook zichtbaar na inloggen (voorheen werden ze verborgen en vervangen door "Mijn bands" + profielmenu — dat was onhandig, want zoeken blijft een kernfunctie ook als je bent ingelogd).

## 🔜 Nu mee bezig / volgende
- [ ] Logisch, efficient en intuitief proces (en routing door webapp) bedenken voor: aanmaken profiel, matchingproces
- [ ] Nieuwe zoekcategorie: "Zoeken op setlist" — vraaggedreven (pull): iemand (bijv. een band die op korte termijn een vervanger nodig heeft) plaatst een zoekopdracht met gevraagd instrument + specifieke nummers/repertoire; muzikanten kunnen hierop reageren. Vereist waarschijnlijk een eigen (optioneel) repertoire/setlist per band, gekoppeld aan `band_wanted`. Aanbodgedreven (push, automatisch matchen + notificeren) is een mooi vervolgidee maar voorlopig te complex — zie backlog.
- [ ] Contactfunctie (muzikanten kunnen elkaar benaderen)
- [ ] Personalisatie (profiel/aanbevelingen)
- [ ] E-mailprovider koppelen (voor als e-mailbevestiging weer aan moet, notificaties, etc.)

## 💡 Ideeën / backlog
- App moet altijd logisch en intuitief zijn. alle oplossingen moeten hieraan voldoen. 
- E-mail reminder voor niveau update
- Bandprofiel en band-zoekfunctie scheiden
- Optie zoekopdracht maken. E-mail sturen zodra een match is ontstaan.
- Push-variant van "Zoeken op setlist": i.p.v. dat muzikanten actief moeten reageren op een zoekopdracht, automatisch matchende muzikanten notificeren (bijv. via e-mail zodra iemand met het juiste instrument + repertoire binnen de straal een profiel heeft). Vereist e-mailprovider en een matchscore-mechanisme; voorlopig bewust vraaggedreven (pull) gehouden.
- jouw look / hele tab verwijderen. het uploaden van een profielfoto verplaatsen naar de eerste pagina (bij naam enz) — **bewust apart gehouden voor nu, blijft in de backlog staan.**
- muzikanten toevoegen tot een band. hoe? iemand bandleider maken? Alle leden kunnen wijzigen? verder uitwerken.
- UI ontwerp aantrekkelijk en intiuitief maken.
- Testscenario's bedenken — zie `TESTPLAN.md` voor het interne testplan dat Claude gebruikt bij elke wijziging.


## 🐛 Bekende bugs / aandachtspunten
- e-mailbevestiging aanzetten

## 📝 Notities
- Ronald heeft geen programmeerervaring, uploadt via GitHub web interface.
- Stack: HTML/JS single-page app + Supabase JS client (CDN), bestand `index.html`.
- Zie project-instructies voor huisstijl, verplichte features en technische regels.
- **Huisstijl-update nodig:** Project-instructies vermelden nog "Fonts: Bebas Neue (display), DM Sans (tekst)". Dit moet Ronald zelf aanpassen in de Project-instellingen naar: "Font: Roboto (Regular)". Claude kan dit niet zelf wijzigen.
- **TESTPLAN.md** staat naast dit bestand — het interne testplan dat Claude gebruikt om elke wijziging te controleren vóórdat deze wordt teruggegeven (checklist-gebaseerd, geen live browser beschikbaar). Ronald kan dit ook gebruiken als leidraad voor eigen handmatige tests in de browser/Supabase.
