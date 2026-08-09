# The Talent Tent — Actielijst

**Laatste update:** 09-08-2026 (derde sessie)
**Vervangt:** `TODO.md`, `talenttent_backlog.md`, `stappenplan.md`, `randvoorwaarden_lancering.md` als los te lezen bronnen. Dit is voortaan het ene bestand dat je bij sessiestart meestuurt, samen met `index.html`.

**Opbouw:**
- **Deel 1 — Openstaand**, geprioriteerd P0 (zonder dit is de app niet af/onveilig) t/m P3 (later)
- **Deel 2 — Toekomstvisie**, grotere richtingen die nog vorm moeten krijgen — geen ticketnummer totdat ze concreet worden
- **Deel 3 — Afgehandeld**, chronologisch, kort

Ticketnummers TT-01 t/m TT-45 zijn definitief toegekend en niet te wijzigen (ze staan als zodanig in code-comments). Alles daarna is voorstel — pas een vast nummer zodra we het echt oppakken.

---

# Deel 1 — Openstaand

## P0 — Zonder dit is de app niet af of onveilig

| ID | Ticket | Kern |
|---|---|---|
| **TT-06** | Rapporteren en blokkeren | Meldknop + blokkeren, verplicht voordat er actief geworven wordt. **Geparkeerd 08-08-2026** — ontwerp besproken, drie beslissingen staan nog open (zie onderaan deze tabel) |
| **TT-07** | Leeftijdsbeleid | **Herzien 08-08-2026: minimumleeftijd blijft 13.** Ticket zelf vraagt geen codewijziging meer; de gevolgen zijn losgetrokken naar TT-45 |
| **TT-45** | Aanvullende maatregelen bij een ondergrens van 13 | Nieuw, 08-08-2026 — losgetrokken uit TT-07, zie toelichting onderaan deze tabel |
| **TT-42** | **Registratie en toestemming voor 13-15-jarigen** | **Apart aandachtsgebied, eigen focus** — zie toelichting onderaan deze tabel |
| TT-01 (restpunt) | E-mailnotificatie bij nieuw bericht | Geparkeerd op infrastructuur (Edge Function) |

**TT-07 — herzien besluit van Ronald (08-08-2026, tweede sessie):** het eerdere voorstel van 16 jaar als ondergrens is teruggedraaid. **De minimumleeftijd blijft 13.** De validatie in de wizard blijft dus ongewijzigd. Wat daaruit volgt aan extra maatregelen is niet in dit ticket verwerkt maar losgetrokken naar TT-45, zodat het niet stilletjes een subregel wordt van een ticket dat verder niets meer om het lijf heeft.

**TT-45 — nieuw, losgetrokken uit TT-07 (08-08-2026).** Met 13 als ondergrens registreren 13-, 14- en 15-jarigen zich zelfstandig, zonder tussenkomst van een ouder. Dat vraagt om maatregelen die nu nergens belegd zijn. Ter voorbereiding op een aparte sessie:
- Hoe verhoudt dit zich tot TT-42 (registratie via een ouder)? Zijn het twee routes naast elkaar, of vervangt de één de ander?
- De regel in de wizard dat een gebruikersnaam onder de 16 moet afwijken van de echte voornaam is met TT-43 minder effectief geworden: ingelogde muzikanten zien de voornaam nu sowieso. Behouden, aanscherpen of laten vervallen?
- Zichtbaarheid van profielfoto's van minderjarigen voor bezoekers zonder account — bewust zo gelaten (zie TT-43), maar het besluit hoort hier expliciet vastgelegd.
- Raakvlak met TT-06 (melden/blokkeren): een melding over een minderjarige vraagt mogelijk een andere afhandeling.

**TT-42 — apart gehouden op verzoek van Ronald (08-08-2026): "ook al is dat de doelgroep, dit vereist extra aandacht en kost mogelijk meer tijd dan ik nu denk."** De groep 13-15 jaar is de kerndoelgroep van The Talent Tent, maar wordt bewust **niet** met TT-07 meegenomen. Dit wordt een eigen aandachtsgebied met eigen tijd, niet een subregel binnen een ander ticket.

Wat er speelt, ter voorbereiding op een aparte sessie hierover:
- **Route:** registratie via een ouder/verzorger — die vult in, geeft toestemming, en het kind gebruikt het profiel
- **De toestemming is het lastige deel, niet de techniek.** Vastleggen wie toestemming gaf, wanneer, en hoe — dat auditspoor is de kern, niet een bijzaak.
- **Overgangsmoment:** als het profiel op de 16e verjaardag automatisch overgaat op de jongere zelf, moet je diens gegevens dus al die jaren bewaren — wat weer onder dezelfde toestemming moet vallen.
- **Wat er nog niet ligt:** hoe de ouder de aanmelding precies doet, wat er met het profiel gebeurt als de ouder nooit reageert, of een kind zelf al iets kan zien/proberen vóór de ouder heeft bevestigd, en hoe dit zich verhoudt tot TT-06 (melden/blokkeren) — een kind dat gemeld wordt, raakt ook de ouder.
→ *Advies:* dit als eigen sessie behandelen, niet als bijvangst van TT-07. Mogelijk is ook hier het advies van een deskundige op zijn plek (zie eerdere opmerking hierover) — juist omdat de tijdsinschatting hier het onzekerst is.

---

## P1 — Bepaalt of mensen terugkomen

| ID | Ticket | Kern |
|---|---|---|
| **TT-11** | "Ik wil meedoen" bij bands | **Ontwerprichting bepaald 08-08-2026** — geen ja/nee-mechaniek, zie toelichting onder deze tabel. Eigen sessie, niet samen met TT-06 |
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
| — | E-mailadres `contact@talenttent.org` aanmaken | **Besloten 08-08-2026.** Via Mijndomein: Mijn account → Mijn producten → talenttent.org → bundel wijzigen → E-mail. Onbeperkt aantal adressen, dus `melden@` en `privacy@` kunnen er later gratis bij. MX-records staan los van de GitHub Pages-records, de site blijft draaien. Dit is meteen het vindbare contactpunt uit het juridische spoor |
| — | Verzendende e-mailprovider koppelen (SMTP) | Apart van het bovenstaande. Voorwaarde voor TT-01-restpunt, e-mailbevestiging bij registratie en de TT-13-mail |
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

## TT-11 — ontwerprichting (besloten 08-08-2026)

Ronalds bezwaar tegen de oorspronkelijke opzet: bij TT-41 ligt de keuze bij de persoon zelf, maar bij TT-11 vraagt één muzikant en oordeelt een groep. Een ja/nee-knop levert daar afwijzingen op, en dat werkt voor niemand positief — zeker niet met dertienjarigen in de doelgroep. Gekozen richting:

- **Geen aanvraag maar interesse.** De band krijgt geen ja/nee-dialoog, maar een lijst geïnteresseerde muzikanten met een berichtknop. Er is geen afwijsknop, dus er komt nooit een afwijzing binnen.
- **Alleen tonen waar het kan kloppen.** De knop verschijnt uitsluitend als het instrument van de muzikant in "Wij zoeken nog" van die band staat. Dat voorkomt de meeste kansloze interesses vóórdat ze bestaan.
- **Lagere inzet in de knoptekst.** "Ik wil een keer meespelen" in plaats van lid worden — een nee gaat dan over één avond, niet over jou als muzikant. Sluit aan op de proefrepetitie-kaart in spoor C.
- **Nooit de status "geweigerd" tonen** aan de muzikant, alleen "nog geen reactie"; een interesse vervalt automatisch na dertig dagen, zodat stilte een einde krijgt zonder dat de band iets hoeft af te wijzen.

---

# Deel 2 — Toekomstvisie

Grotere richtingen uit eerdere strategiesessies. Geen ticketnummer — worden pas TT-nummers zodra we ze daadwerkelijk oppakken en de vorm vastligt.

## A. De profielpagina als kern van het product

Besluit uit eerdere sessie: het profiel is niet de invoer voor het matchen, het is zelf het product — de persoonlijke promotiepagina van de muzikant. Indeling volgt Ronalds eigen woorden: *trots op prestaties (verleden) · nu plezier maken (heden) · ambitie voor de toekomst (toekomst)* — dat is het PPP-principe als tijdlijn.

- **Optredenlijst** (band, datum, plaats) — het belangrijkste onderdeel: levert ervaringsmaat, voortgang, materiaal voor succesverhalen én het latere aanknopingspunt voor podia in het verdienmodel, in één functie. Nog open — de "verleden"-kolom van TT-48 (zie Deel 3) leunt hierop en toont tot dan een placeholder.
- Bandhistorie op het profiel — nog open
- ~~Prompts in plaats van het lege bio-veld~~ — **opgelost, zie TT-46**
- **Niveau per instrument** — ontwerprichting bepaald 09-08-2026: **schaal 1-5 (sterren)**, niet het bestaande Basis/Bijna/Podium-systeem (dat blijft voorbehouden aan losse nummers). Nog niet gebouwd — apart oppakken, raakt schema van `musician_instruments` en de weergave op zoekresultaten/profiel.
- ~~Voortgangspaneel, alleen zichtbaar voor de eigenaar zelf~~ — **opgelost, zie TT-48**
- ~~Doelveld uitbreiden met concrete ambitie-vragen (repetitiefrequentie, optreedwens) i.p.v. abstracte zelfbeoordeling~~ — **opgelost, zie TT-47** (herzien 09-08-2026, zie onderstaande sessielog). Besluit Ronald: alleen op het profiel zichtbaar, geen zoekfilter. **Let op:** Ronald geeft aan dat doel en ambitie inhoudelijk nog te dicht bij elkaar liggen — "dit is nog niet goed genoeg", komt terug in een latere sessie.
- Covers/eigen werk/allebei — klein, hoge opbrengst, nog open
- **Deelbare profiel-URL + deelvoorbeeld** — nog open. Belangrijke beperking besproken 09-08-2026: een deep link (`#profiel/id`) is zonder backend te bouwen, maar een *rijk* deelvoorbeeld (eigen titel/foto in WhatsApp/social bij het plakken van de link) niet — linkvoorvertoningen worden opgehaald door bots die geen JavaScript uitvoeren en zien dus alleen de statische `<meta>`-tags van het ene `index.html`-bestand. Vraagt serverless-infrastructuur, zelfde categorie als de openstaande Edge Function-behoefte (e-mailnotificaties). Nog niet opgepakt, ook de deep link zelf niet.

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

## 09-08-2026 — Muzikantenprofiel als kern (Deel 2-A)
Sessie bewust beperkt tot het profiel als product, in lijn met Deel 2-A.
- **TT-46 (nieuw en opgelost, later dezelfde sessie herzien):** prompts i.p.v. het lege bio-veld. Eerste versie had drie generieke chips; op verzoek van Ronald herschreven naar vier chips die dichter bij muziek maken zelf liggen: "Wat doe je en hoe lang speel je al?", "Op dit moment ben ik vooral bezig met...", "De meeste energie krijg ik van ...", "Vertel eens wat je wil bereiken." Chips vullen `bio` aan via `applyBioPrompt()` i.p.v. overschrijven — meerdere prompts na elkaar blijven zo bruikbaar. Geen schema-wijziging.
- **TT-47 (nieuw en opgelost, later dezelfde sessie herzien):** doelveld uitgebreid met twee concrete, optionele vragen. **Eerste versie:** repetitiefrequentie (wekelijks/af en toe/alleen voor een project) en optreedwens (graag/liever niet/open). **Herzien op verzoek van Ronald:** de optreedwens-vraag overlapte inhoudelijk met de bestaande doelkaart "Optreden" ("dubbele dingen"), en "af en toe"/"alleen voor een project" waren niet concreet genoeg. Herbouwd naar: repetitiefrequentie met vier concrete opties (Wekelijks / Paar keer per maand / Losse jams, als het uitkomt / Alleen voor een project) en een nieuwe vraag "Wat wil je de komende tijd bereiken?" over muzikale groei (Mezelf verbeteren op mijn instrument / Nieuwe stijlen ontdekken / Samen nummers/eigen werk maken / Gewoon plezier, geen groot plan) — bewust een andere as dan de doelkaart, om overlap te voorkomen. Kolom `performance_wish` hernoemd naar `musical_ambition`. Ronald zelf: **"dit is nog niet goed genoeg"** — doel en ambitie voelen nog te dicht bij elkaar, komt terug in een latere sessie. Besluit blijft: **alleen op het profiel zichtbaar, geen zoekfilter** — dus niet meegenomen in `runSearch()`/`initSearchFilters()`. Opgeslagen via dezelfde route als `goal` (alleen in `submitProfile()`, niet al bij `createAccountAndProfile()`). Zichtbaar als badges naast het doel voor eigenaar én ingelogde bezoekers met eigen profiel. **Bekend restpunt:** nog niet toegevoegd aan `tt_get_musicians_public`, dus onzichtbaar voor ingelogde gebruikers zónder eigen profiel — de JS neemt de velden al defensief over zodra de RPC ze ooit teruggeeft, maar de SQL-kant moet nog. Script: `tt-47-doelveld-uitbreiden-v2.sql` (vervangt het eerdere `tt-47-doelveld-uitbreiden.sql` — veilig te draaien ongeacht of dat al is uitgevoerd).
- **TT-48 (nieuw en opgelost):** voortgangspaneel als PPP-tijdlijn (verleden/heden/toekomst), los van de bestaande volledigheidsmeter (`renderCompletenessMeter`, die al langer bestond). Alleen op Mijn Profiel. "Verleden" toont bewust een placeholder-tekst ("Optredenlijst volgt binnenkort") i.p.v. verzonnen inhoud, tot de optredenlijst er is. "Heden" toont repertoire-aantal + doel, "Toekomst" toont de nieuwe TT-47-velden.
- **Niveau per instrument — ontwerprichting bepaald, niet gebouwd** (zoals de actielijst zelf al voorschreef: eerst een apart ontwerpgesprek). Besluit: **schaal 1-5 (sterren)**, nadrukkelijk niet het bestaande Basis/Bijna/Podium-systeem — dat blijft voorbehouden aan losse nummers in het repertoire. Bouwen is een eigen sessie; raakt `musician_instruments`-schema en de weergave op zoekresultaten/profiel/matching.
- **Deelbare profiel-URL + deelvoorbeeld — besproken, niet gebouwd.** Belangrijke technische beperking vastgesteld: een deep link (`#profiel/id`) is zonder backend te bouwen, maar een rijk deelvoorbeeld (eigen titel/foto bij het plakken van de link in WhatsApp/social) niet — linkvoorvertoningen worden opgehaald door bots zonder JavaScript, die alleen de statische `<meta>`-tags van het ene `index.html`-bestand zien. Vraagt serverless-infrastructuur, zelfde categorie als de al openstaande Edge Function-behoefte (e-mailnotificaties, TT-01-restpunt).

## 08-08-2026 (tweede sessie) — Naamweergave en bandlidmaatschap
- **TT-43 (nieuw en opgelost):** de echte voornaam lekte nog via bandprofielen. De ledenchips op het bandprofiel en in Mijn Bands, en de "Lid toevoegen"-zoeker, toonden `fname` — ook aan bezoekers zonder account, via `tt_get_bands_public`. Tegelijk is de weergaveregel herzien naar Ronalds besluit: **uitgelogde bezoekers zien de gebruikersnaam, ingelogde muzikanten zien de voornaam** (het verbergen was bedoeld voor niet-ingelogd zoeken, niet daarbuiten). Alles loopt nu via één functie, `displayNameOf()`. De bezoekers-paden nemen `fname` bewust niet meer over uit de RPC-uitvoer, zodat dit niet afhangt van de nog openstaande SQL-fix.
- **TT-41 (opgelost):** uitnodigen in plaats van toevoegen. `addBandMember()` schrijft `status: 'aangevraagd'`; de uitgenodigde muzikant ziet een banner op Mijn Profiel met Bevestigen/Weigeren (besluit Ronald: banner, geen bericht — één klik, geen tussenscherm). De oprichter ziet openstaande uitnodigingen als gestippelde chip "wacht op bevestiging" in Mijn Bands. Bijbehorend script: `tt-41-bandlidmaatschap.sql`.
- **TT-03 / TT-04 (restpunt opgelost):** de twee publieke functies zijn herschreven. `tt_get_musicians_public` geeft geen `fname` en geen `zip` meer terug; `tt_get_bands_public` geeft geen `zip` meer en levert leden aan met `username` in plaats van `fname`. De postcode bleek nergens in de app gebruikt te worden — afstand wordt server-side berekend in `tt_search_musicians_anon` — dus die kon volledig weg in plaats van ingekort. `avatar_url` blijft bewust publiek. Script: `tt-03-04-publieke-rpc.sql`. Let op: een `drop function` wist ook de uitvoerrechten, die worden in hetzelfde script opnieuw toegekend aan `anon` en `authenticated`.
- **TT-06 geparkeerd, TT-11 herontworpen, e-mailadres besloten** — zie Deel 1 voor de details.
- **TT-07 herzien:** minimumleeftijd blijft 13; gevolgen losgetrokken naar het nieuwe TT-45.
- Profielfoto's blijven zichtbaar voor bezoekers zonder account (besluit Ronald: te belangrijk voor de presentatie van de muzikant om achter een login te zetten).

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
