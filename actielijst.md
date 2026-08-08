# The Talent Tent — Actielijst

**Laatste update:** 08-08-2026
**Vervangt:** `TODO.md`, `talenttent_backlog.md`, `stappenplan.md`, `randvoorwaarden_lancering.md` als los te lezen bronnen. Dit is voortaan het ene bestand dat je bij sessiestart meestuurt, samen met `index.html`.

**Opbouw:**
- **Deel 1 — Openstaand**, geprioriteerd P0 (zonder dit is de app niet af/onveilig) t/m P3 (later)
- **Deel 2 — Toekomstvisie**, grotere richtingen die nog vorm moeten krijgen — geen ticketnummer totdat ze concreet worden
- **Deel 3 — Afgehandeld**, chronologisch, kort

Ticketnummers TT-01 t/m TT-41 zijn definitief toegekend en niet te wijzigen (ze staan als zodanig in code-comments). Alles daarna is voorstel — pas een vast nummer zodra we het echt oppakken.

---

# Deel 1 — Openstaand

## P0 — Zonder dit is de app niet af of onveilig

| ID | Ticket | Kern |
|---|---|---|
| **TT-06** | Rapporteren en blokkeren | Meldknop + blokkeren, verplicht voordat er actief geworven wordt |
| **TT-07** | Ouderlijke toestemming onder 16 | **Besluit al genomen** (zie hieronder) — nog te bouwen |
| **TT-42** | **Registratie en toestemming voor 13-15-jarigen** | **Apart aandachtsgebied, eigen focus** — zie toelichting onderaan deze tabel |
| **TT-41** | Bandlidmaatschap vereist bevestiging door het lid zelf | Nieuw, 08-08-2026 — zie toelichting onderaan deze tabel |
| TT-01 (restpunt) | E-mailnotificatie bij nieuw bericht | Geparkeerd op infrastructuur (Edge Function) |
| TT-03 / TT-04 (restpunt) | `tt_get_musicians_public` geeft server-side nog `fname`/`avatar_url`/`zip` terug aan `anon` | Front-end verbergt het al; SQL-fix ontbreekt nog |

**TT-07 — besluit van Ronald (08-08-2026):** ga uit van minimaal 16 jaar voor de zelfstandige registratie. Dat maakt TT-07 een op zichzelf staand, bouwbaar ticket: geboortedatum ≥16 controleren, toestemmingstekst, klaar.

**TT-42 — apart gehouden op verzoek van Ronald (08-08-2026): "ook al is dat de doelgroep, dit vereist extra aandacht en kost mogelijk meer tijd dan ik nu denk."** De groep 13-15 jaar is de kerndoelgroep van The Talent Tent, maar wordt bewust **niet** met TT-07 meegenomen. Dit wordt een eigen aandachtsgebied met eigen tijd, niet een subregel binnen een ander ticket.

Wat er speelt, ter voorbereiding op een aparte sessie hierover:
- **Route:** registratie via een ouder/verzorger — die vult in, geeft toestemming, en het kind gebruikt het profiel
- **De toestemming is het lastige deel, niet de techniek.** Vastleggen wie toestemming gaf, wanneer, en hoe — dat auditspoor is de kern, niet een bijzaak.
- **Overgangsmoment:** als het profiel op de 16e verjaardag automatisch overgaat op de jongere zelf, moet je diens gegevens dus al die jaren bewaren — wat weer onder dezelfde toestemming moet vallen.
- **Wat er nog niet ligt:** hoe de ouder de aanmelding precies doet, wat er met het profiel gebeurt als de ouder nooit reageert, of een kind zelf al iets kan zien/proberen vóór de ouder heeft bevestigd, en hoe dit zich verhoudt tot TT-06 (melden/blokkeren) — een kind dat gemeld wordt, raakt ook de ouder.
→ *Advies:* dit als eigen sessie behandelen, niet als bijvangst van TT-07. Mogelijk is ook hier het advies van een deskundige op zijn plek (zie eerdere opmerking hierover) — juist omdat de tijdsinschatting hier het onzekerst is.

**TT-41 — nieuw, door Ronald aangedragen (08-08-2026).** Een oprichter kan nu een muzikant direct aan een band toevoegen zonder diens instemming; die persoon staat dan zichtbaar als lid op het bandprofiel. Wijziging: nieuwe status op `band_members` (`aangevraagd`/`bevestigd`/`geweigerd`), pas zichtbaar op het bandprofiel na bevestiging door het lid zelf. **Samen oppakken met TT-11** ("Ik wil meedoen bij bands") — dat voegt de omgekeerde stroom toe (muzikant vraagt zelf aan) en landt in dezelfde tabel en hetzelfde bevestigingsscherm.
→ *Openstaand besluit:* bevestiging via het bestaande berichtensysteem, of een lichter los mechanisme (banner op Mijn Profiel)?

---

## P1 — Bepaalt of mensen terugkomen

| ID | Ticket | Kern |
|---|---|---|
| **TT-11** | "Ik wil meedoen" bij bands | Samen met TT-41 |
| **TT-13** | Terugkeerredenen | Profielweergaven, wekelijkse mail, bewaren/favorieten |
| TT-38 (restpunt) | Gebruikersnaam-systeem | Volledig gebouwd, **browsertest door Ronald nog niet bevestigd** |
| — | Zoeken zonder profiel — volledige browsertest | Uitgelogd zoeken (met/zonder vertrekpunt), profiel-/bandmodal als bezoeker, band-instrumentfilter zonder profiel — nog niet bevestigd |
| — | Setlist-zoeken — volledige browsertest | Nog niet bevestigd door Ronald |

---

## P2 — Verzorging en indruk

| ID | Ticket | Kern |
|---|---|---|
| **TT-18** | Album-art bij repertoire | Overweeg iTunes/Deezer i.p.v. MusicBrainz voor dit doel |
| **TT-22** | Accountverwijdering | Ook het auth-account zelf, ook Storage-bestanden |
| **TT-27** | Wizard-tussenresultaten incrementeel opslaan | Tabblad sluiten tijdens onboarding verliest nu nog voortgang |
| **TT-28** | Filtering/paginering echt naar de database verplaatsen | Nodig zodra het ledenaantal groeit |
| — | Tekst "Over ons" verbeteren | Eerste versie, toon/kwaliteit nog te verfijnen |
| — | E-mailprovider koppelen | Voorwaarde voor TT-01-restpunt, e-mailbevestiging, TT-13-mail |
| — | E-mailbevestiging bij registratie weer aanzetten | Nu bewust uit; heractiveren zodra er echt verkeer is |

---

## P3 — Losse ideeën, geen directe prioriteit

- Engelstalige versie van de app (taal-toggle vs. automatisch, raakt ook databaseteksten?)
- Onderscheid echte vs. nepprofielen — mogelijk relevant zodra e-mailbevestiging weer aan staat
- Per-profiel instelbare zichtbaarheid voor niet-leden (alternatief voor de huidige aanpak)
- E-mail-reminder voor niveau-update
- Bandprofiel en band-zoekfunctie scheiden
- Zoekopdracht plaatsen + e-mail bij match (uitgebreide setlist-variant, vereist contactfunctie — die is er inmiddels, dus dit kan opnieuw bekeken worden)
- Push-variant van setlist-zoeken (automatisch matchende muzikanten notificeren)

---

# Deel 2 — Toekomstvisie

Grotere richtingen uit eerdere strategiesessies. Geen ticketnummer — worden pas TT-nummers zodra we ze daadwerkelijk oppakken en de vorm vastligt.

## A. De profielpagina als kern van het product

Besluit uit eerdere sessie: het profiel is niet de invoer voor het matchen, het is zelf het product — de persoonlijke promotiepagina van de muzikant. Indeling volgt Ronalds eigen woorden: *trots op prestaties (verleden) · nu plezier maken (heden) · ambitie voor de toekomst (toekomst)* — dat is het PPP-principe als tijdlijn.

- **Optredenlijst** (band, datum, plaats) — het belangrijkste onderdeel: levert ervaringsmaat, voortgang, materiaal voor succesverhalen én het latere aanknopingspunt voor podia in het verdienmodel, in één functie
- Bandhistorie op het profiel
- Prompts in plaats van het lege bio-veld
- Niveau per instrument — **vraagt eerst een aparte ontwerpsessie**, huidige knoppen werken niet meer zodra een instrument meerdere niveaus kan hebben
- Voortgangspaneel, alleen zichtbaar voor de eigenaar zelf
- Doelveld uitbreiden met concrete ambitie-vragen (repetitiefrequentie, optreedwens) i.p.v. abstracte zelfbeoordeling
- Covers/eigen werk/allebei — klein, hoge opbrengst
- **Deelbare profiel-URL + deelvoorbeeld** — er is nu geen eigen adres per profiel en geen titel/afbeelding bij het delen; voor een promotiepagina die gedeeld moet worden is dat een gemis

## B. Het matchen laten kloppen

- **Complementaire matching:** instrument moet complementair worden (wat zoekt de ander), genre blijft gelijkenis. Nu meet de score op instrument gelijkenis, waardoor twee drummers elkaars beste match zijn.
- Wederzijdse (stabiele) matchscore, met terugval op de huidige berekening als een profiel niets heeft ingevuld
- Statusknop "sta je open voor iets nieuws?" — **openstaand besluit**, vorm nog niet vastgesteld
- Rangschikking uitleggen: volledige profielen staan hoger

## C. Contact en sociale laag

- Applaus-mechanisme — **openstaand besluit:** op personen of op prestaties, met of zonder zichtbare teller. Advies blijft: op prestaties, geen publieke teller (risico op populariteitsscore bij minderjarige gebruikers)
- Volgen/ontvolgen
- Proefrepetitie-kaart in het gesprek — verwachtingen bespreken vóór de eerste keer samen spelen
- Rode ring bij bands die leden zoeken

## D. Werving en groei

- Regionale start (Den Haag, of specifieker: één poppodium of enkele scholen — doelgroep heeft geen auto, actieradius is fietsafstand)
- Landingspagina herzien — "Ik ben.../Ik zoek..."-raster, nieuwste muzikanten, later succesverhalen
- Nooit nul zoekresultaten tonen; regionale tellers i.p.v. landelijke
- Muziekscholen, jeugdorkesten, poppodia met jongerenprogrammering benaderen
- Stickers/plectrums i.p.v. T-shirts als eerste merchandise

## E. Randvoorwaarden voor lancering (drie sporen)

**Juridisch**
- Privacyverklaring, gebruiksvoorwaarden, gedragscode (los van elkaar, alle drie ontbreken)
- Account verwijderen in de app (valt samen met TT-22)
- Contactpunt voor meldingen — vindbaar e-mailadres
- Verwerkersovereenkomst Supabase nagaan

**Techniek**
- Beveiligingscontrole databaseregels — valt samen met het TT-03/TT-04-restpunt hierboven
- Foutregistratie/logging
- Back-up en herstel — status onbekend, nog uit te zoeken
- Service worker toevoegen — voorwaarde voor een volwaardige PWA en voor de Google Play-route

**Ontwerp/interfaceslag**
- Laadstaten, lege staten, foutstaten
- Toegankelijkheid (aria-labels, contrast, tikdoelen) — nu nul `aria-label`'s in het hele bestand
- Consistente componenten, iconenset
→ **Advies:** deze slag bewust pas doen ná de veiligheidstickets (P0) — anders polijst je schermen die daarna toch weer veranderen

## F. App stores

- **Google Play:** haalbaar via een Trusted Web Activity. Vereist de service worker (spoor E) + $25 registratie + 12 testers gedurende 14 dagen (bij een persoonlijk account — vervalt bij een organisatie-/KvK-account)
- **App Store:** de huidige opzet (website in een schil) voldoet niet aan Apple's eisen. Vereist een native schil of herbouw. **Ronald wil dit op termijn wel** — voorlopig ligt de nadruk op PWA + Play, met de code niet nodeloos monolithischer maken zodat een latere overstap goedkoper blijft
- Sinds iOS 16.4 werken pushmeldingen ook in een PWA (mits op het beginscherm gezet) — vermindert de druk om per se naar de App Store te moeten

## G. Overig, nog te beslissen

- Rechtsvorm (KvK) — Ronald: "overweeg ik later", maar wél relevant zodra de Play Store een concreet doel wordt (lost de testerseis op)
- UI algeheel aantrekkelijker en intuïtiever maken — terugkerend, ongespecificeerd punt; wordt concreet zodra spoor E (interfaceslag) wordt opgepakt

---

# Deel 3 — Afgehandeld

Kort en chronologisch. Voor het volledige technische verhaal per punt: zie de sessie-aantekeningen die aan dit bestand voorafgingen (niet langer los bijgehouden na deze opschoning).

## 08-08-2026 — Domeinkoppeling + kleine fixes
- talenttent.org gekoppeld aan GitHub Pages, DNS ingesteld, HTTPS actief
- Supabase Site URL en Redirect URLs bijgewerkt naar talenttent.org
- **TT-39:** hardgecodeerde `redirectTo` in `forgotPassword()` verwees nog naar het oude github.io-adres — gecorrigeerd
- **TT-40:** eerste bezoek toonde automatisch `#landing` in de adresbalk — verwijderd, alleen navigeren binnen de app toont nog een hash

## 07-08-2026 — GitHub-storing + UX-polish + gebruikersnaam-systeem
- Bevestigd GitHub Actions/Pages-incident opgelost (vastzittende workflow-run geannuleerd, geen codewijziging)
- **TT-29 t/m TT-33:** berichten-icoon op zoekresultaten, weergave-toggle Lijst/Kaarten, verticaal kaartformaat met "T"-fallback, chat-icoon direct naar composer, berichtenscherm-redesign
- **TT-34, TT-36:** bugfixes (contactknop op eigen profiel, flits van knoppenblok)
- **TT-35, TT-37:** Enter-toets als "verdergaan", automatische focus op invoervelden
- **TT-38:** gebruikersnaam-systeem i.p.v. echte naam — grootste wijziging van de sessie, naar aanleiding van BandMix-vergelijking

## 06-08-2026 — Berichten, media-opslag, mobiele kop, terugknop
- **TT-01:** berichtensysteem grotendeels afgerond (database, composer, inbox, gespreksdraad) — e-mailnotificatie nog open
- **TT-02:** profielfoto's en media echt opslaan in Supabase Storage
- **TT-12:** tekst Over ons gecorrigeerd naar wat de app werkelijk doet
- **TT-15:** mobiele kop verkleind, alleen navigatiebalk sticky; Alfa Slab One als tijdelijk display-font voor het logo
- **TT-16:** browsergeschiedenis/terugknop werkend gemaakt, incl. correctie voor een SecurityError in sandbox-preview (Playwright-test sindsdien standaard bij dit soort wijzigingen)
- **TT-21:** PDOK-terugval met keuzelijst uit bestaande plaatsnamen i.p.v. vrij tekstveld
- **TT-23:** dode code opgeruimd (VIBES, profielkleur-kiezer, dubbele CSS)
- **TT-26:** zoektekst-injectie in Supabase-query's gedicht

## 05-08-2026 — UX-audit, grootste sessie
- **TT-03, TT-04, TT-05, TT-08, TT-09, TT-10, TT-14, TT-17, TT-19, TT-20, TT-24** allemaal opgelost — profielen achter login, postcode niet publiek, XSS gedicht, linkbug, onboarding herordend, zoeken opent met resultaten, accentkleuren gesplitst, mobiele layoutfixes, sorteeropties ingeperkt, geboortedatumvalidatie, beheersingsniveaus zichtbaar bij het keuzemoment
- **TT-28** (nieuw ontstaan tijdens deze sessie): filtering/paginering naar de database — nog open
- **TT-27** (nieuw ontstaan tijdens deze sessie): wizard-tussenresultaten incrementeel opslaan — nog open
- Beveiligingsbug gevonden en gedicht: uitgelogde bezoeker kon via "Verder bewerken" alsnog in de bewerkwizard komen

## Vóór 05-08-2026 — Eerdere opbouw (verkort)
- Prototype, database, authenticatie, matchcode-architectuur met bitmask-matching, zoekfunctie met postcode-rozen, setlist-zoeken, PDOK-postcode-cache (4077 postcodes), PWA-manifest (TT-25), navigatie-herstructurering, profiel/band bewerken werkend gemaakt, performance-verbeteringen (server-side plaats-resolutie, database-indexen), brede emoji-opschoning, diepgaande PPP-scan met diverse fixes

---

## PPP-principe (blijft ongewijzigd van kracht)

**Voorwaarde 0:** de app moet consistent betrouwbaar en performant zijn. Bij conflict wint stabiliteit/performance altijd van functionaliteit.

- **Presentatie** — profiel: GUI toegankelijk voor de brede doelgroep, status direct zichtbaar, bewerken zonder wrijving. Privacy by design.
- **Prestatie** — zoekfunctie: intuïtief, relevante matches zonder ruis, directe vervolgstap.
- **Plezier** — gebruikservaring: duidelijke succesmomenten, geen frustrerende fouten.

**Toetsingsregel:** een nieuwe feature vereist minstens één functioneel + het bijbehorende technisch criterium.
