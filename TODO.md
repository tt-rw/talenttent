# The Talent Tent — TODO

Laatste update: 02 augustus 2026 (diepgaande PPP-scan, restpunten en bredere emoji-opschoning afgerond)

## 🎯 PPP-principe (intern ontwerpprincipe)

**Voorwaarde 0 (weegt zwaarder dan de rest):** app moet consistent betrouwbaar en performant zijn. Bij conflict: stabiliteit/performance wint altijd van functionaliteit.

**Presentatie** — profiel (persoonlijk/band)
- Functioneel: GUI toegankelijk voor brede doelgroep, niet alleen tech-savvy. Profielstatus (volledig/actueel) direct zichtbaar. Bewerken zonder wrijving.
- Technisch: opslag/ophalen betrouwbaar en snel, wijzigingen direct zichtbaar, media performant. Privacy by design: minimale dataverzameling, gebruiker bepaalt zichtbaarheid, e-mail/wachtwoord nooit publiek. Labels: max. 2 woorden, zelfstandig naamwoord + werkwoord, tenzij onvermijdelijk.

**Prestatie** — zoekfunctie
- Functioneel: intuïtief, minimaal aantal klikken/toetsaanslagen tot resultaat. Relevante matches zonder ruis, matchscore/afstand zichtbaar, directe vervolgstap (contact).
- Technisch: matchscore-berekening correct en snel, robuust bij edge cases, schaalbaar.

**Plezier** — gebruikservaring
- Functioneel: duidelijke succesmomenten, geen frustrerende fouten, geen overbodige stappen.
- Technisch: stabiel, snel, foutmeldingen begrijpelijk.

**Toetsingsregel:** nieuwe feature vereist minstens 1 functioneel + het bijbehorende technisch criterium. Stabiliteit/performance heeft voorrang boven functionele waarde.

## Hoe te gebruiken
- Dit bestand staat naast `index.html` in de repo.
- Upload het samen met `index.html` aan het begin van een nieuwe chatsessie, zodat Claude weet waar we gebleven zijn.
- Vink taken af door `[ ]` te veranderen in `[x]`.
- Voeg nieuwe punten toe onderaan de juiste sectie.

---

## 🔜 Lopende onderwerpen
- [ ] Volgende grote upgrade: maak onderscheid tussen data invoer (mijn profiel+mijn bands) , data uitvoer (profiel-pagina muzikant en bands) en de zoekfunctie (zoeken en zoekresultaten). 
- [ ] de app-indeling wordt als volgt: 1. Homepage; 2. tab: Mijn Profiel; 3. tab: Mijn Bands; 4. tab: Zoeken; 5. tab: Over ons; 6. tab: Inloggen.
- [ ] om gebruik van de zoekfunctie te maken en om profielpagina's te zien moet eerst worden ingelogd (en dus een profiel worden aangemaakt.
- [ ] na inloggen direct naar "Mijn profiel" navigeren i.p.v. naar de landingspagina, incl. logisch/efficiënt/intuïtief proces (routing door de webapp) voor aanmaken profiel + matchingproces. Raakt navigatiestructuur/onboarding-flow, vereist eigen ontwerpafweging — bewust apart gehouden van de PPP-scan-fixes hierboven.
- [ ] Nieuwe zoekcategorie: "Zoeken op setlist" — vraaggedreven (pull): iemand (bijv. een band die op korte termijn een vervanger nodig heeft) plaatst een zoekopdracht met gevraagd instrument + specifieke nummers/repertoire; muzikanten kunnen hierop reageren. Vereist waarschijnlijk een eigen (optioneel) repertoire/setlist per band, gekoppeld aan `band_wanted`. Aanbodgedreven (push, automatisch matchen + notificeren) is een mooi vervolgidee maar voorlopig te complex — zie backlog.
- [ ] Hoe onderscheiden we echte van fake profielen? 
- [ ] Contactfunctie (muzikanten kunnen elkaar benaderen)
- [ ] Personalisatie (profiel/aanbevelingen)
- [ ] E-mailprovider koppelen (voor als e-mailbevestiging weer aan moet, notificaties, etc.)

## 💡 Backlog / ideeën
- Tekst "Over ons" verbeteren — huidige tekst is een eerste versie, kwaliteit/toon nog verfijnen.
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

## ✅ Afgerond
- [x] Bredere emoji-opschoning (02-08-2026, vervolg op quick-fix 01-08-2026): alle resterende decoratieve emoji verwijderd uit `index.html` — Doel-kaarten (🎸🎵🎤🌟), Vibe-tags (🤘🎭🎧🎸🧠🌊✍️🔥), media-platformherkenning (`detectPlatform()`: YouTube/Instagram/SoundCloud/TikTok/Spotify tonen nu alleen platformnaam) en succes-/leegresultaat-illustraties (media-tip, upload-dropzone, video-thumbnail, "geen resultaten"-schermen, lege-profielstatus, save-succesmelding, artiestresultaat, completeness-hint). **Afgesproken aanpak met Ronald:** overal weglaten, ook bij Vibe-tags (alleen label + omschrijving, consistent met Doel-kaarten) i.p.v. vervangen door een alternatief icoon. Bijbehorende ongebruikte CSS-regels (`.icon`, `.vibe-emoji`, `.tip-icon`, `.drop-icon`, `.no-results-icon`) meteen opgeruimd. **Bugfix onderweg gevonden:** vibe-badge werd getoond op basis van `vibe_emoji` i.p.v. `vibe_label` — zonder fix zouden nieuwe profielen (die geen `vibe_emoji` meer krijgen) hun vibe-badge nooit meer tonen. Conditie nu op `vibe_label` gebaseerd; `vibe_emoji`-kolom blijft ongebruikt in de database staan (geen schema-wijziging nodig, altijd `null` vanaf nu).
- [x] Diepgaande PPP-scan van `index.html` (02-08-2026): elk scherm/elke feature getoetst aan de aangescherpte PPP-principes. Aanleiding: PPP-principe is 01-08-2026 aangescherpt.
  - **(1) Presentatie — "Profielstatus volledig/actueel zichtbaar":** dode code gevonden — STEP 7 "Profiel preview" (`step6`) + `renderProfile()` (incl. completeness-meter) werd nooit aangeroepen sinds "direct naar homepagina na aanmaken" is doorgevoerd. Freshness-bar ("Bijgewerkt op...") zat al wél in "Mijn profiel" (via hergebruik `openMusicianModal()`). Actie: dode code (step6, dot6, `renderProfile()`) verwijderd; completeness-meter (herbouwd op echte Supabase-data i.p.v. registratie-state) toegevoegd aan `loadMyProfile()`, alleen zichtbaar voor de eigenaar.
  - **(2) Plezier — "foutmeldingen begrijpelijk":** ruwe technische `e.message` werd rechtstreeks getoond in `runSearch()`, `runBandSearch()`, `saveBand()` en `showSaveError()`. Actie: gedeelde `friendlyErrorMessage()`-helper toegevoegd die bekende foutpatronen vertaalt naar begrijpelijke NL-tekst, met nette generieke fallback; volledige technische fout blijft gelogd via `console.error`.
  - **(3) Prestatie — matchscore-belofte klopt met tekst:** media-tip beweerde "regelmatig updaten geeft voorrang in zoekresultaten", maar technisch bestaat alleen de 6-maanden-inactiviteitsknip. Tekst aangepast zodat die de daadwerkelijke werking beschrijft.
  - **Restpunten (02-08-2026) ook opgelost:** dode `updateCompleteness()`-functie + alle 9 aanroepen verwijderd; alle 16 `alert()`-aanroepen (validatie + foutafhandeling) vervangen door een nieuwe niet-blokkerende `showToast()`-melding (`#appToast`, CSS `.app-toast`) — donker thema, verdwijnt vanzelf na 3,5 sec.
  - **Bewust niet meegenomen (staat apart in Lopende onderwerpen/backlog):** contactfunctie op zoekresultaten, bredere emoji-opschoning, label-lengte "Band of artiest"/"Wij zoeken nog" (vermoedelijk onvermijdelijk, laag risico).
- [x] Instrumentenlijst uitgebreid en herordend (01-08-2026): Gitaar gesplitst in "Gitaar, elektrisch"/"Gitaar, akoestisch", Keys/Piano gesplitst in "Keyboard"/"Piano", toegevoegd: Conga/Bongo, Harmonica (mondharmonica), Tamboerijn. Volgorde nu op podium-populariteit (Zang/Gitaar-elektrisch/Bas/Drums eerst), "Anders" blijft laatste. PPP-toetsing: Presentatie (bredere doelgroep herkent zich in profiel), Prestatie (minder scrollen in tag-grid). Alleen front-end array aangepast — matchcode-database kent nieuwe instrumenten automatisch toe via `tt_add_instrument`-trigger, bestaande profielen met oude waarden ("Gitaar", "Keys / Piano") blijven intact.
- [x] Quick-fix o.b.v. aangescherpt PPP-principe (01-08-2026): (1) leeftijdsfilter in muzikanten-zoekfunctie geopend — harde 13-25 grens verwijderd uit HTML (`filterAgeMin`/`filterAgeMax`) en JS (`runSearch()`), toegankelijk voor de brede doelgroep; (2) emoji's verwijderd uit navigatie-/actieknoppen en zoektitels (avatar-bewerk-knop, media-tabs Upload/Links, "Profiel aanmaken", zoekknop + -titel muzikanten, "Profiel bewerken", "Mijn bands", "Band aanmaken"); (3) labels ingekort conform de nieuwe 2-woorden-regel (bijv. "+ Link toevoegen (YouTube, Instagram, SoundCloud…)" → "+ Link toevoegen", "Zoek muzikanten in de buurt" → "Muzikanten zoeken"). Bredere emoji-opschoning (Doel/Vibe/media-platformiconen) bewust apart gehouden — zie lopende onderwerpen.
- [x] Zoekvelden **Naam** en **Plaats** toegevoegd aan zowel de Muzikanten- als Bands-zoekfunctie (bandnaam bij Bands). Terminologie gestandaardiseerd naar **"Plaats"** overal in de app (was "Woonplaats"/"Stad"). In het kader van **Presentatie** — muzikanten en bands moeten altijd vindbaar zijn. **Bugfix:** Plaats-filter werkte voorheen niet als je ingelogd was (werd genegeerd door de matchcode-zoekfunctie) — nu werkt Naam/Plaats/Genre altijd, zowel ingelogd (bovenop de bestaande matching op straal/instrument/doel) als niet-ingelogd (als directe zoekopdracht). Zelfde velden hergebruikt in beide gevallen, geen aparte schermen.
- [x] Nieuwe tab "Over ons" toegevoegd aan de navigatiebalk (zichtbaar zowel ingelogd als niet-ingelogd), met de tekst uit `Talent Tent teksten.docx` (Wat zijn we / Wat doen we / Hoe werkt het). **Let op:** tekst is nog niet definitief — tekstkwaliteit verbeteren staat als apart punt in de backlog.
- [x] Header + navigatiebalk zijn nu "sticky" (`.app-topbar`, `position: sticky; top: 0;`) — blijven altijd bovenaan zichtbaar tijdens scrollen, incl. alle tabbladen (Muzikanten, Bands, Over ons, Inloggen/gebruikersmenu). Werkt op mobiel en desktop; desktop full-height-instelling hierop aangepast.
- [x] Foutmelding "User already registered" bij profiel aanmaken toont nu een vriendelijke Nederlandse melding ("Er bestaat al een account met dit e-mailadres") met een "Inloggen →"-knop. Deze knop stuurt naar het inlogscherm en vult automatisch het al ingevoerde e-mailadres in. Gebruiker kan vandaar zelf inloggen of "Wachtwoord vergeten?" gebruiken (bestond al) — geen aparte reset-knop nodig. Nieuwe helper: `goToLoginFromError()`.
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
- [x] Woonplaats met Alternatieve Schrijfwijze (Den Haag i.p.v. 's-Gravenhage) — gebruikt nu de kolom `alternatieve_schrijfwijzen` uit `postcode_cache` (voorrang op de officiële PDOK-naam), zowel bij muzikant- als bandprofiel. **Bugfix 31-07-2026:** `pickDisplayCity()` splitste ten onrechte op `,` i.p.v. `;` (het echte scheidingsteken in de data) en normaliseerde de hoofdlettering niet, waardoor rauwe tekst als "S GRAVENHAGE;'s-Gravenhage" werd getoond. Bovendien bevat de brondata alleen spellingsvarianten, geen bijnamen — daarom is een kleine, uitbreidbare uitzonderingslijst (`CITY_NAME_EXCEPTIONS`) toegevoegd die 's-Gravenhage → Den Haag afdwingt. **Bevestigd werkend door Ronald** (postcode 2497 → "Den Haag"). Toekomstige vergelijkbare gevallen (bijv. 's-Hertogenbosch/Den Bosch) kunnen aan dezelfde lijst worden toegevoegd indien gewenst.
- [x] "Muzikanten"/"Bands"-zoektabbladen blijven nu ook zichtbaar na inloggen (voorheen werden ze verborgen en vervangen door "Mijn bands" + profielmenu — dat was onhandig, want zoeken blijft een kernfunctie ook als je bent ingelogd).

## 📝 Notities
- Ronald heeft geen programmeerervaring, uploadt via GitHub web interface.
- Stack: HTML/JS single-page app + Supabase JS client (CDN), bestand `index.html`.
- Zie project-instructies voor huisstijl, verplichte features en technische regels.
- **Huisstijl-update nodig:** Project-instructies vermelden nog "Fonts: Bebas Neue (display), DM Sans (tekst)". Dit moet Ronald zelf aanpassen in de Project-instellingen naar: "Font: Roboto (Regular)". Claude kan dit niet zelf wijzigen.
- **TESTPLAN.md** staat naast dit bestand — het interne testplan dat Claude gebruikt om elke wijziging te controleren vóórdat deze wordt teruggegeven (checklist-gebaseerd, geen live browser beschikbaar). Ronald kan dit ook gebruiken als leidraad voor eigen handmatige tests in de browser/Supabase.
