# The Talent Tent — TODO

Laatste update: 29 juli 2026 (postcode-automatisering + cache-backup afgerond)

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

## 🔜 Nu mee bezig / volgende
- [ ] Zoekfunctie verfijnen (muzikanten + bands)
- [ ] Contactfunctie (muzikanten kunnen elkaar benaderen)
- [ ] Personalisatie (profiel/aanbevelingen)
- [ ] E-mailprovider koppelen (voor als e-mailbevestiging weer aan moet, notificaties, etc.)

## 💡 Ideeën / backlog
- Zoekfunctie met postcode-rozen (straal rondom postcode) — kan gebouwd worden nu elke gebruiker een correcte, opgezochte postcode heeft, en de cache-tabel al lat/lon-coördinaten per postcode bevat (4077 stuks). Let op: er wordt bij het profiel alleen de 4-cijferige postcode opgeslagen (geen huisletters), dus de nauwkeurigheid is op wijkniveau, niet op straatniveau.
- Maak pagina's automatisch beeldvullend in webversie (scrollen zoveel mogelijk vermijden)
- E-mail reminder voor niveau update
- Bandprofiel en band-zoekfunctie scheiden
- Zoekresultaten tonen na gebruik zoekfunctie (tonen naar relevantie: zoekend, meest actief)
- Optie zoekopdracht maken. E-mail sturen zodra een match is ontstaan.
- profiel aanmaken / postcode: tekst bij postcode: alleen de 4 cijfers invullen
- profiel aanmaken / woonplaats: vul het veld 'woonplaats' met de Alternatieve Schrijfwijze (Den Haag ipv 's-Gravenhage)
- repertoire / invulvelden band en nummer: selecteer de bovenste optie met een druk op 'enter' knop
- jouw look / hele tab verwijderen. het uploaden van een profielfoto verplaatsen naar de eerste pagina (bij naam enz)
- muzikanten toevoegen tot een band. hoe? iemand bandleider maken? Alle leden kunnen wijzigen? verder uitwerken. 


## 🐛 Bekende bugs / aandachtspunten
- e-mailbevestiging aanzetten

## 📝 Notities
- Ronald heeft geen programmeerervaring, uploadt via GitHub web interface.
- Stack: HTML/JS single-page app + Supabase JS client (CDN), bestand `index.html`.
- Zie project-instructies voor huisstijl, verplichte features en technische regels.
- **Huisstijl-update nodig:** Project-instructies vermelden nog "Fonts: Bebas Neue (display), DM Sans (tekst)". Dit moet Ronald zelf aanpassen in de Project-instellingen naar: "Font: Roboto (Regular)". Claude kan dit niet zelf wijzigen.
