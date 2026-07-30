# The Talent Tent — TODO

Laatste update: 30 juli 2026 (matchcode-architectuur + zoekfunctie met matchscore afgerond)

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

## 🔜 Nu mee bezig / volgende
- [ ] Logisch, efficient en intuitief proces (en routing door webapp) bedenken voor: aanmaken profiel, matchingproces
- [ ] Nieuwe zoekcategorie: "Zoeken op setlist" — vraaggedreven (pull): iemand (bijv. een band die op korte termijn een vervanger nodig heeft) plaatst een zoekopdracht met gevraagd instrument + specifieke nummers/repertoire; muzikanten kunnen hierop reageren. Vereist waarschijnlijk een eigen (optioneel) repertoire/setlist per band, gekoppeld aan `band_wanted`. Aanbodgedreven (push, automatisch matchen + notificeren) is een mooi vervolgidee maar voorlopig te complex — zie backlog.
- [ ] Contactfunctie (muzikanten kunnen elkaar benaderen)
- [ ] Personalisatie (profiel/aanbevelingen)
- [ ] E-mailprovider koppelen (voor als e-mailbevestiging weer aan moet, notificaties, etc.)

## 💡 Ideeën / backlog
- Zoekfunctie met postcode-rozen (straal rondom postcode) — kan gebouwd worden nu elke gebruiker een correcte, opgezochte postcode heeft, en de cache-tabel al lat/lon-coördinaten per postcode bevat (4077 stuks). Let op: er wordt bij het profiel alleen de 4-cijferige postcode opgeslagen (geen huisletters), dus de nauwkeurigheid is op wijkniveau, niet op straatniveau.
- App moet altijd logisch en intuitief zijn. alle oplossingen moeten hieraan voldoen. 
- Maak pagina's automatisch beeldvullend in webversie (scrollen zoveel mogelijk vermijden)
- E-mail reminder voor niveau update
- Bandprofiel en band-zoekfunctie scheiden
- Zoekresultaten tonen na gebruik zoekfunctie (tonen naar relevantie: zoekend, meest actief)
- Optie zoekopdracht maken. E-mail sturen zodra een match is ontstaan.
- Push-variant van "Zoeken op setlist": i.p.v. dat muzikanten actief moeten reageren op een zoekopdracht, automatisch matchende muzikanten notificeren (bijv. via e-mail zodra iemand met het juiste instrument + repertoire binnen de straal een profiel heeft). Vereist e-mailprovider en een matchscore-mechanisme; voorlopig bewust vraaggedreven (pull) gehouden.
- profiel aanmaken / postcode: tekst bij postcode: alleen de 4 cijfers invullen
- profiel aanmaken / woonplaats: vul het veld 'woonplaats' met de Alternatieve Schrijfwijze (Den Haag ipv 's-Gravenhage)
- repertoire / invulvelden band en nummer: selecteer de bovenste optie met een druk op 'enter' knop
- jouw look / hele tab verwijderen. het uploaden van een profielfoto verplaatsen naar de eerste pagina (bij naam enz)
- muzikanten toevoegen tot een band. hoe? iemand bandleider maken? Alle leden kunnen wijzigen? verder uitwerken.
- profiel: door op de inlognaam te klikken kom je bij je profiel. Het aparte tabblad kan vervallen.
- UI ontwerp aantrekkelijk en intiuitief maken.
- Testscenario's bedenken. (bijv. wijzig muzikantprofiel van gitaar naar zang, hoe wordt een match zichtbaar na een profielupdate, enz)


## 🐛 Bekende bugs / aandachtspunten
- e-mailbevestiging aanzetten

## 📝 Notities
- Ronald heeft geen programmeerervaring, uploadt via GitHub web interface.
- Stack: HTML/JS single-page app + Supabase JS client (CDN), bestand `index.html`.
- Zie project-instructies voor huisstijl, verplichte features en technische regels.
- **Huisstijl-update nodig:** Project-instructies vermelden nog "Fonts: Bebas Neue (display), DM Sans (tekst)". Dit moet Ronald zelf aanpassen in de Project-instellingen naar: "Font: Roboto (Regular)". Claude kan dit niet zelf wijzigen.
