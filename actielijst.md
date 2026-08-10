# The Talent Tent — Actielijst

**Laatste update:** 10-08-2026 (TT-75 t/m TT-80: berichtenteller, repertoire-sortering, verplichte akkoord-checkbox, reserveerlijst gebruikersnamen, opschoning accounts zonder gebruikersnaam, twee zoekbugs (plaatsnaam + straal-vertrekpunt) gerepareerd)
**Vervangt:** `TODO.md`, `talenttent_backlog.md`, `stappenplan.md`, `randvoorwaarden_lancering.md` als los te lezen bronnen. Dit is het ene bestand dat je bij sessiestart meestuurt, samen met `index.html`.

**Opbouw — herzien 09-08-2026:** tot nu toe stond een deel van de openstaande ideeën in een aparte, ongenummerde "Toekomstvisie"-sectie naast de genummerde tickets. Dat zorgde voor overlap en verlies van overzicht: hetzelfde onderwerp kon op twee plekken staan, met losse prioriteit. Vanaf nu **één systeem**: elk onderwerp krijgt een TT-nummer zodra het concreet genoeg is om te bouwen, of blijft `—` als het geen bouwwerk is maar een actie van Ronald (bijv. een school benaderen). Elk onderwerp staat in precies één P-tabel (P0 t/m P3) en nergens dubbel.

- **Deel 1 — Openstaand**, geprioriteerd P0 (zonder dit is de app niet af/onveilig) t/m P3 (later)
- **Deel 1a — Te bevestigen door Ronald**, losse browsertests, geen bouwtickets
- **Deel 2 — Achtergrond bij richtingen**, de strategische context achter clusters van tickets (geen losse actiepunten meer, alleen duiding + verwijzing naar TT-nummers)
- **Deel 3 — Afgehandeld**, chronologisch, kort

Ticketnummers zijn definitief toegekend en niet te wijzigen (ze staan als zodanig in code-comments). Huidige hoogste nummer: **TT-80**.

**Vaste smoke-test na elke wijziging (toegevoegd 09-08-2026, externe technische review):** `index.html` is gegroeid naar ruim 7.000 regels in één bestand, zonder geautomatiseerde tests. Regressie is daarmee het grootste sluipende risico — en Voorwaarde 0 zegt zelf dat stabiliteit altijd wint. Na elke deploy, tien minuten: inloggen, zoeken (met en zonder profiel), een bericht sturen, een profiel bewerken, uitgelogd zoeken. Geen bouwticket, wel een vaste stap — hoort ook thuis in de projectinstructie zelf.

---

# Deel 1 — Openstaand

## P0 — Zonder dit is de app niet af of onveilig

**Direct te doen (externe technische review, 09-08-2026):** het back-uppunt hieronder kost een half uur en staat al langer te wachten dan het zelf duurt. **Gedaan op 10-08-2026** — zie Deel 3 voor de details (TT-79 opschoning ging eraan vooraf).

**Niet acuut, wel vóór brede lancering (bijgesteld 09-08-2026, Ronald):** de app is live maar nog onbekend — alleen mensen uit Ronalds eigen omgeving hebben een account. Twee dingen kunnen dus wachten tot het moment dat onbekenden zich gaan aanmelden, maar moeten dan wel geregeld zijn:
- **E-mailadres(sen) `talenttent.org` aanmaken** (zie hieronder) — inclusief `privacy@`, nodig voor TT-63
- **TT-63 publiceren** (conceptteksten staan al klaar, zie hieronder)

| ID | Ticket | Kern |
|---|---|---|
| **TT-06** | Rapporteren en blokkeren | Meldknop + blokkeren, verplicht voordat er actief geworven wordt. **Geparkeerd 08-08-2026** — ontwerp besproken, drie beslissingen staan nog open (zie onderaan deze tabel) |
| **TT-07** | Leeftijdsbeleid | **Herzien 08-08-2026: minimumleeftijd blijft 13.** Ticket zelf vraagt geen codewijziging meer; de gevolgen zijn losgetrokken naar TT-45 |
| **TT-45** | Aanvullende maatregelen bij een ondergrens van 13 | Nieuw, 08-08-2026 — losgetrokken uit TT-07, zie toelichting onderaan deze tabel |
| **TT-42** | Registratie en toestemming voor 13-15-jarigen | **Apart aandachtsgebied, eigen focus — mogelijk groter dan gedacht, zie toelichting onderaan deze tabel** |
| TT-01 (restpunt) | E-mailnotificatie bij nieuw bericht | Geparkeerd op infrastructuur (Edge Function) |
| TT-22 (restpunt) | Auth-account daadwerkelijk verwijderen | **Data-deel opgelost 09-08-2026** (profiel, kindtabellen, Storage-bestanden, bandoprichterschap — zie Deel 3). Het auth-account (login/wachtwoord) zelf kan niet vanaf de client, dat vraagt de Supabase Admin API met een service-role-sleutel — zelfde categorie beperking als TT-01/TT-54: geen Edge Function-infrastructuur. Tot die er is: her en der handmatig via het Supabase-dashboard (Authentication → Users) een account verwijderen zodra er geen bijbehorend profiel meer is |
| **TT-63** | Privacyverklaring, gebruiksvoorwaarden, gedragscode | **Gebouwd en gepubliceerd 09-08-2026** — drie nieuwe views (`view-privacy`/`view-terms`/`view-gedragscode`), bereikbaar via het nieuwe hamburgermenu (zie hieronder) en via `#privacy`/`#terms`/`#gedragscode`. Toestemmingsregel met links toegevoegd bij de laatste wizard-stap. Gebruikt `privacy@talenttent.org` in alle drie. **Herzieningsmomenten, vastgelegd zodat ze niet vergeten worden:** privacyverklaring → zodra TT-42/TT-45 zijn opgelost (het hoofdstuk Minderjarigen loopt nu al vooruit op een regel die de wizard nog niet afdwingt — dat gat moet dicht vóór brede publicatie); gebruiksvoorwaarden + gedragscode → zodra TT-06 (meldknop) live gaat (nu nog "volgt binnenkort"); gebruiksvoorwaarden → kleine tekstupdate zodra TT-58 (applaus) of TT-13 (volgen) klaar zijn |
| — | Verwerkersovereenkomst Supabase nagaan | Juridisch, voorwaarde voor lancering |
| — | E-mailadres(sen) `talenttent.org` aanmaken | **Besloten 08-08-2026**, nog niet uitgevoerd. Niet acuut zolang alleen bekenden de app gebruiken (Ronald, 09-08-2026) — wél nodig vóór onbekenden zich gaan aanmelden. Via Mijndomein: Mijn account → Mijn producten → talenttent.org → bundel wijzigen → E-mail. Onbeperkt aantal adressen. MX-records staan los van de GitHub Pages-records, de site blijft draaien. **Uitgebreid 09-08-2026:** de conceptteksten van TT-63 gebruiken specifiek `privacy@talenttent.org` — dat adres moet dus ook werken, niet alleen `contact@` |
| **TT-65** | Back-up en herstel uitzoeken | Status nu onbekend. Raakt Voorwaarde 0 (consistente betrouwbaarheid) rechtstreeks — geen back-upstrategie is een bestaansrisico voor de data van alle gebruikers. Interim-stap: zie "Direct te doen" hierboven |

**TT-07 — herzien besluit van Ronald (08-08-2026, tweede sessie):** het eerdere voorstel van 16 jaar als ondergrens is teruggedraaid. **De minimumleeftijd blijft 13.** De validatie in de wizard blijft dus ongewijzigd. Wat daaruit volgt aan extra maatregelen is niet in dit ticket verwerkt maar losgetrokken naar TT-45, zodat het niet stilletjes een subregel wordt van een ticket dat verder niets meer om het lijf heeft.

**TT-45 — nieuw, losgetrokken uit TT-07 (08-08-2026).** Met 13 als ondergrens registreren 13-, 14- en 15-jarigen zich zelfstandig, zonder tussenkomst van een ouder. Dat vraagt om maatregelen die nu nergens belegd zijn. Ter voorbereiding op een aparte sessie:
- Hoe verhoudt dit zich tot TT-42 (registratie via een ouder)? Zijn het twee routes naast elkaar, of vervangt de één de ander? **Externe technische review (09-08-2026) wijst erop dat de UAVG de grens voor zelfstandige digitale toestemming op 16 legt — dat zou betekenen dat de ouderroute (TT-42) voor 13-15-jarigen niet naast zelfregistratie staat, maar die vervángt. Niet geverifieerd door een jurist, alleen een signaal om mee te nemen naar de TT-42-sessie.**
- ~~De regel in de wizard dat een gebruikersnaam onder de 16 moet afwijken van de echte voornaam is met TT-43 minder effectief geworden: ingelogde muzikanten zien de voornaam nu sowieso. Behouden, aanscherpen of laten vervallen?~~ **Besloten 09-08-2026 (Ronald, bij het opstellen van TT-63): behouden.** Nu ook vastgelegd in de privacyverklaring.
- Zichtbaarheid van profielfoto's van minderjarigen voor bezoekers zonder account — bewust zo gelaten (zie TT-43), maar het besluit hoort hier expliciet vastgelegd.
- Raakvlak met TT-06 (melden/blokkeren): een melding over een minderjarige vraagt mogelijk een andere afhandeling.

**TT-42 — apart gehouden op verzoek van Ronald (08-08-2026): "ook al is dat de doelgroep, dit vereist extra aandacht en kost mogelijk meer tijd dan ik nu denk."** De groep 13-15 jaar is de kerndoelgroep van The Talent Tent, maar wordt bewust **niet** met TT-07 meegenomen. Dit wordt een eigen aandachtsgebied met eigen tijd, niet een subregel binnen een ander ticket.

**Update 09-08-2026 (externe technische review):** het instinct om dit apart en met ruim tijd te behandelen lijkt bevestigd te worden. Als de UAVG-grens van 16 jaar hier inderdaad van toepassing is (zie signaal bij TT-45 hierboven), wordt TT-42 niet een aanvullende route naast zelfregistratie, maar dé route voor 13-15-jarigen — dat raakt de registratiewizard zelf, niet alleen een los scherm. Advies: deze sessie eerder plannen dan later en met een jurist/deskundige toetsen vóórdat de wizard ervoor wordt aangepast, om te voorkomen dat hij twee keer verbouwd wordt.

Wat er speelt, ter voorbereiding op een aparte sessie hierover:
- **Route:** registratie via een ouder/verzorger — die vult in, geeft toestemming, en het kind gebruikt het profiel
- **De toestemming is het lastige deel, niet de techniek.** Vastleggen wie toestemming gaf, wanneer, en hoe — dat auditspoor is de kern, niet een bijzaak.
- **Overgangsmoment:** als het profiel op de 16e verjaardag automatisch overgaat op de jongere zelf, moet je diens gegevens dus al die jaren bewaren — wat weer onder dezelfde toestemming moet vallen.
- **Wat er nog niet ligt:** hoe de ouder de aanmelding precies doet, wat er met het profiel gebeurt als de ouder nooit reageert, of een kind zelf al iets kan zien/proberen vóór de ouder heeft bevestigd, en hoe dit zich verhoudt tot TT-06 (melden/blokkeren) — een kind dat gemeld wordt, raakt ook de ouder.
→ *Advies:* dit als eigen sessie behandelen, niet als bijvangst van TT-07. Mogelijk is ook hier het advies van een deskundige op zijn plek — juist omdat de tijdsinschatting hier het onzekerst is.


---

## P1 — Bepaalt of mensen terugkomen

| ID | Ticket | Kern |
|---|---|---|
| **TT-11** | "Ik wil meedoen" bij bands | **Ontwerprichting bepaald 08-08-2026** — geen ja/nee-mechaniek, zie toelichting onder deze tabel. Eigen sessie, niet samen met TT-06 |
| **TT-13** | Terugkeerredenen | Profielweergaven, wekelijkse mail, volgen/bewaren (favorieten). **Samengevoegd 09-08-2026** met wat eerder los als "Volgen/ontvolgen" bij de Toekomstvisie stond — zelfde onderwerp, stond dubbel |
| **TT-49** | Optredenlijst (band, datum, plaats) | Belangrijkste onderdeel van het profiel-als-product: levert ervaringsmaat, materiaal voor succesverhalen én later het aanknopingspunt voor podia. De "verleden"-kolom van TT-48 (voortgangspaneel) leunt hierop en toont tot dan een placeholder |
| **TT-55** | Complementaire matching | Instrument moet complementair worden (wat zoekt de ander), genre blijft gelijkenis. Nu meet de score op instrument-gelijkenis, waardoor twee drummers elkaars beste match zijn — kernprobleem in de Prestatie-pijler. Inclusief: wederzijdse (stabiele) matchscore, met terugval op de huidige berekening als een profiel niets heeft ingevuld |
| **TT-62** | Nooit nul zoekresultaten tonen | Regionale tellers i.p.v. landelijke. Rechtstreeks verbonden aan de cold-start-strategie: dichtheid in één regio verslaat een dun landelijk bestand |
| **TT-64** | Foutregistratie/logging | Nog niets van bestaat. Raakt Voorwaarde 0 (betrouwbaarheid): zonder logging weet je pas dat iets stuk is als een gebruiker het meldt. **Externe technische review (09-08-2026):** kan in twee stappen — (1) een minimale `window.onerror`-handler die naar een simpele Supabase-tabel schrijft, ruwweg een uur werk, kan naar voren gehaald worden; (2) de volwaardige versie (filtering, dashboard, alerts) blijft op P1 |
| — | Regionale start (Den Haag e.o.) | Actie van Ronald, geen bouwwerk: één poppodium of enkele scholen benaderen — doelgroep heeft geen auto, actieradius is fietsafstand |

**TT-38 (restpunt), "Zoeken zonder profiel" en "Setlist-zoeken" zijn verplaatst naar Deel 1a** — dat zijn bevestigingstaken voor Ronald, geen bouwtickets, en stonden hier tussen de echte tickets in de weg.

---

## P2 — Verzorging en indruk

| ID | Ticket | Kern |
|---|---|---|
| **TT-18** | Album-art bij repertoire | Overweeg iTunes/Deezer i.p.v. MusicBrainz voor dit doel |
| **TT-27** | Wizard-tussenresultaten incrementeel opslaan | Tabblad sluiten tijdens onboarding verliest nu nog voortgang. **Externe technische review (09-08-2026):** twijfelgeval op P2 — voor dertienjarigen op een telefoon is voortgang kwijtraken een conversie-killer. Verdedigbaar zolang het verkeer laag is; **verhoog naar P1 zodra "Regionale start" (P1, hierboven) actief wordt**, vóór er echte nieuwe gebruikers de wizard in gaan |
| **TT-28** | Filtering/paginering echt naar de database verplaatsen | Nodig zodra het ledenaantal groeit |
| **TT-50** | Bandhistorie op het profiel | Welke bands iemand heeft (gehad), deels af te leiden uit `band_members` |
| **TT-51** | Niveau per instrument | Ontwerprichting al bepaald (09-08-2026): schaal 1-5 (sterren), niet het Basis/Bijna/Podium-systeem dat voorbehouden blijft aan losse nummers. Raakt schema van `musician_instruments` en de weergave op zoekresultaten/profiel |
| **TT-52** | Covers/eigen werk/allebei | Klein, per song of per profiel aan te geven |
| **TT-53** | Deelbare profiel-URL (deep link) | `#profiel/id` opent direct het juiste profiel — zonder backend te bouwen. Het *rijke* deelvoorbeeld (titel/foto bij delen) is een apart ticket, zie TT-54 |
| **TT-56** | Statusknop "sta je open voor iets nieuws?" | Open besluit — vorm nog niet vastgesteld |
| **TT-57** | Rangschikking uitleggen | Volledige profielen staan hoger in zoekresultaten — dat principe zichtbaar/uitgelegd maken |
| **TT-58** | Applaus-mechanisme | Open besluit: op personen of op prestaties, met of zonder zichtbare teller. Advies blijft: op prestaties, geen publieke teller (risico op populariteitsscore bij minderjarige gebruikers) |
| **TT-59** | Proefrepetitie-kaart in het gesprek | Verwachtingen bespreken vóór de eerste keer samen spelen. Sluit aan op TT-11 (lagere inzet: "ik wil een keer meespelen") |
| **TT-61** | Landingspagina herzien | "Ik ben.../Ik zoek..."-raster, nieuwste muzikanten, later succesverhalen |
| **TT-66** | Service worker toevoegen | Voorwaarde voor een volwaardige PWA en voor de Google Play-route (TT-70) |
| **TT-67** | Laadstaten, lege staten, foutstaten | Bewust pas na de P0-tickets — anders polijst je schermen die daarna toch weer veranderen |
| **TT-68** | Toegankelijkheid | Aria-labels, contrast, tikdoelen — nu nul `aria-label`'s in het hele bestand. Ook bewust pas na P0 |
| — | Tekst "Over ons" verbeteren | Eerste versie, toon/kwaliteit nog te verfijnen |
| — | Verzendende e-mailprovider koppelen (SMTP) | Voorwaarde voor TT-01-restpunt, TT-72 (bevestigingsmail bij registratie én accountverwijdering), en de TT-13-mail |
| **TT-72** | Bevestigingsmail met bedankbericht bij registratie én accountverwijdering | **Nieuw, 09-08-2026 (Ronald), aangevuld zelfde dag.** Zodra er een e-mailaccount is: (1) welkomst-/bevestigingsmail na registratie, met bedankbericht, en (2) een bevestigingsmail bij accountverwijdering (TT-22) — ter bevestiging dat de verwijdering is doorgevoerd, met een bedankbericht voor de tijd op het platform. Vraagt uitgaand mailverkeer — dat kan niet via de ImprovMX-route besproken bij het e-mailadres (die is alleen ontvangen/doorsturen); hoort bij hetzelfde SMTP-koppelpunt hierboven. Let op bij (2): de mail moet ná de daadwerkelijke verwijdering nog een geldig adres kunnen bereiken, terwijl het account op dat moment al weg is — waarschijnlijk het e-mailadres apart vasthouden vóór `executeAccountDeletion()` de musicians-rij verwijdert |
| — | E-mailbevestiging bij registratie weer aanzetten | Nu bewust uit; heractiveren zodra er echt verkeer is |
| — | Muziekscholen, jeugdorkesten, poppodia benaderen | Actie van Ronald, geen bouwwerk |

---

## P3 — Losse ideeën, geen directe prioriteit

| ID | Ticket | Kern |
|---|---|---|
| **TT-54** | Rijk deelvoorbeeld bij delen | Eigen titel/foto in WhatsApp/social bij het plakken van een profiellink. Vraagt serverless-infrastructuur — linkvoorvertoningen worden opgehaald door bots zonder JavaScript, die alleen de statische `<meta>`-tags van het ene `index.html`-bestand zien. Geparkeerd, zelfde categorie als TT-01-restpunt |
| **TT-60** | Rode ring bij bands die leden zoeken | Klein visueel accent op zoekresultaten |
| **TT-69** | Consistente componenten, iconenset | Algemeen, ongespecificeerd punt; wordt concreet zodra de interfaceslag (TT-67/68) wordt opgepakt |
| **TT-70** | Google Play-route | Trusted Web Activity. Vereist de service worker (TT-66) + $25 registratie + 12 testers gedurende 14 dagen (bij een persoonlijk account — vervalt bij een organisatie-/KvK-account) |
| **TT-71** | Injectie-hygiëne berichtenquery | **Nieuw, externe technische review 09-08-2026, geverifieerd in de code.** In `loadConversations()` en `openConversation()` worden `mid`/`otherId` direct in de PostgREST-filterstring geïnterpoleerd (`.or(\`sender_id.eq.${mid},...\`)`) i.p.v. via `.eq()`/`.in()`. Gecontroleerd: beide waarden komen in alle huidige aanroeppaden uit `musicians.id` (database-UUID's via zoekresultaten/profielmodal), nooit uit vrije tekstinvoer — risico dus laag, maar het is het enige plekje waar de TT-26-hygiëne niet is doorgevoerd. Bij een volgende berichten-sessie meenemen |
| **TT-73** | 2FA overwegen bij accountverwijdering | **Nieuw, 09-08-2026 (Ronald), "te overwegen".** Extra verificatiestap (bijv. een code per e-mail) bovenop de twee bestaande bevestigingsstappen van TT-22. Vraagt uitgaand mailverkeer (zelfde SMTP-afhankelijkheid als TT-72) én een ontwerpkeuze over de vorm (code per e-mail is het meest voor de hand liggend, geen sms-infrastructuur beschikbaar). Nog geen ontwerpsessie geweest — P3 tot dat er is |
| — | Engelstalige versie van de app | Taal-toggle vs. automatisch, raakt ook databaseteksten? |
| — | Onderscheid echte vs. nepprofielen | Mogelijk relevant zodra e-mailbevestiging weer aan staat |
| — | Per-profiel instelbare zichtbaarheid voor niet-leden | Alternatief voor de huidige aanpak |
| — | E-mail-reminder voor niveau-update | |
| — | Bandprofiel en band-zoekfunctie scheiden | |
| — | Zoekopdracht plaatsen + e-mail bij match | Uitgebreide setlist-variant, vereist contactfunctie — die is er inmiddels, dus dit kan opnieuw bekeken worden |
| — | Push-variant van setlist-zoeken | Automatisch matchende muzikanten notificeren |
| — | App Store (native schil) | De huidige opzet (website in een schil) voldoet niet aan Apple's eisen. **Ronald wil dit op termijn wel** — voorlopig ligt de nadruk op PWA + Play (TT-70), code niet nodeloos monolithischer maken zodat een latere overstap goedkoper blijft. Sinds iOS 16.4 werken pushmeldingen ook in een PWA, wat de druk vermindert |
| — | Rechtsvorm (KvK) | Ronald: "overweeg ik later" — wél relevant zodra de Play Store (TT-70) een concreet doel wordt (lost de testerseis op) |
| — | Stickers/plectrums i.p.v. T-shirts | Eerste merchandise-idee |

---

## TT-11 — ontwerprichting (besloten 08-08-2026)

Ronalds bezwaar tegen de oorspronkelijke opzet: bij TT-41 ligt de keuze bij de persoon zelf, maar bij TT-11 vraagt één muzikant en oordeelt een groep. Een ja/nee-knop levert daar afwijzingen op, en dat werkt voor niemand positief — zeker niet met dertienjarigen in de doelgroep. Gekozen richting:

- **Geen aanvraag maar interesse.** De band krijgt geen ja/nee-dialoog, maar een lijst geïnteresseerde muzikanten met een berichtknop. Er is geen afwijsknop, dus er komt nooit een afwijzing binnen.
- **Alleen tonen waar het kan kloppen.** De knop verschijnt uitsluitend als het instrument van de muzikant in "Wij zoeken nog" van die band staat. Dat voorkomt de meeste kansloze interesses vóórdat ze bestaan.
- **Lagere inzet in de knoptekst.** "Ik wil een keer meespelen" in plaats van lid worden — een nee gaat dan over één avond, niet over jou als muzikant. Sluit aan op de proefrepetitie-kaart, TT-59.
- **Nooit de status "geweigerd" tonen** aan de muzikant, alleen "nog geen reactie"; een interesse vervalt automatisch na dertig dagen, zodat stilte een einde krijgt zonder dat de band iets hoeft af te wijzen.

---

# Deel 1a — Te bevestigen door Ronald

Geen bouwtickets — Ronald test dit zelf op de live site, vaak in privénavigatie voor het uitgelogde gedrag. Zodra bevestigd: hier afvinken/verwijderen.

- **TT-38 (restpunt):** gebruikersnaam-systeem — volledig gebouwd, browsertest nog niet bevestigd
- **Zoeken zonder profiel:** uitgelogd zoeken (met/zonder vertrekpunt), profiel-/bandmodal als bezoeker, band-instrumentfilter zonder profiel
- **Setlist-zoeken:** volledige browsertest, nog niet bevestigd

---

# Deel 2 — Achtergrond bij richtingen

Dit is geen actielijst meer (die staat volledig in Deel 1) maar de strategische context achter clusters van tickets — waarom ze zo zijn opgezet. Bedoeld om terug te lezen bij het oppakken van een ticket, niet om apart bij te houden.

## A. De profielpagina als kern van het product

Besluit uit eerdere sessie: het profiel is niet de invoer voor het matchen, het is zelf het product — de persoonlijke promotiepagina van de muzikant. Indeling volgt Ronalds eigen woorden: *trots op prestaties (verleden) · nu plezier maken (heden) · ambitie voor de toekomst (toekomst)* — dat is het PPP-principe als tijdlijn, uitgewerkt in het voortgangspaneel (TT-48, opgelost).

Bijbehorende tickets: TT-46 en TT-47 (opgelost), TT-48 (opgelost), TT-49 (optredenlijst), TT-50 (bandhistorie), TT-51 (niveau per instrument), TT-52 (covers/eigen werk), TT-53 en TT-54 (deelbare profiel-URL).

**Openstaand spanningsveld (Ronald, 09-08-2026):** het doelveld (samen oefenen/band starten/optreden/alles) en de ambitie-vraag uit TT-47 (mezelf verbeteren/nieuwe stijlen/eigen werk/plezier) liggen inhoudelijk nog te dicht bij elkaar. "Dit is nog niet goed genoeg" — komt terug in een latere sessie, geen los ticket totdat de richting scherper is.

## B. Het matchen laten kloppen

Bijbehorende tickets: TT-55 (complementaire matching + wederzijdse matchscore), TT-56 (statusknop "open voor iets nieuws"), TT-57 (rangschikking uitleggen), TT-80 (afgehandeld — vastgelegd gedrag Plaats-veld, zie hieronder).

**Vastgelegd gedrag Plaats-veld bij zoeken (10-08-2026):** bij een eigen profiel wordt Plaats automatisch gevuld met de eigen stad, voor gebruiksgemak — maar is altijd overschrijfbaar. Typ je iets anders, dan is dát het nieuwe vertrekpunt voor de zoekstraal (niet enkel een tekstfilter bovenop de eigen straal). Geldt voor Muzikanten- én Bandzoeken.

## C. Contact en sociale laag

Bijbehorende tickets: TT-13 (nu inclusief volgen/ontvolgen), TT-58 (applaus), TT-59 (proefrepetitie-kaart, sluit aan op TT-11), TT-60 (rode ring bij bands die leden zoeken).

## D. Werving en groei

Cold-start-principe: dichtheid in één regio beats een dun landelijk bestand. Bijbehorende tickets: TT-61 (landingspagina), TT-62 (nooit nul resultaten, regionale tellers), plus de niet-technische acties "Regionale start" (P1) en "Muziekscholen/poppodia benaderen" (P2) in Deel 1.

## E. Randvoorwaarden voor lancering

Drie sporen die samen "lanceerbaar" bepalen:
- **Juridisch:** TT-63 (privacyverklaring/voorwaarden/gedragscode), TT-22 (accountverwijdering, nu ook het juridische landingspunt), en de twee `—`-punten in P0 (verwerkersovereenkomst nagaan, contact-e-mailadres)
- **Techniek:** TT-64 (logging), TT-65 (back-up/herstel), TT-66 (service worker). De beveiligingscontrole op databaseregels die hier eerder stond is **geschrapt** — die was via het TT-03/TT-04-restpunt al opgelost (zie Deel 3, 08-08-2026) en stond hier nog verouderd vermeld.
- **Ontwerp/interfaceslag:** TT-67 (laad-/lege/foutstaten), TT-68 (toegankelijkheid), TT-69 (consistente componenten). Bewust pas na de P0-tickets.

## F. App stores

Bijbehorende tickets: TT-70 (Google Play), plus het `—`-punt "App Store (native schil)" in P3.

---

# Deel 3 — Afgehandeld

Kort en chronologisch. Voor het volledige technische verhaal per punt: zie de sessie-aantekeningen die aan dit bestand voorafgingen (niet langer los bijgehouden na deze opschoning).

## 10-08-2026 (vervolg 4) — TT-80: twee zoekbugs, robuust gerepareerd
Bevinding Ronald: (1) "Den Haag"/"Den Bosch" invullen bij Plaats gaf nog "'s-Gravenhage"/"'s-Hertogenbosch" terug; (2) inloggen + zoeken op "Delft, 25 km" gaf geen resultaten uit Den Haag, terwijl dat ruim binnen de straal valt. Beide zijn kernfunctionaliteit — expliciet niet gepatcht zonder eerst de daadwerkelijke oorzaak te zien (root-cause-onderzoek via `pg_get_functiondef()`, geen aannames over databasefuncties die niet in `index.html` staan).
- **Bug 1, root cause:** `postcode_cache.city` sloeg al die tijd de officiële PDOK-naam op ("'s-Gravenhage"/"'s-Hertogenbosch"), nooit de gangbare naam. De front-end berekende ergens wél de juiste weergavenaam (`pickDisplayCity()` + `CITY_NAME_EXCEPTIONS`), maar schreef die correctie nooit terug naar de cache — `lookupPostcodeCity()` upsertte steeds opnieuw de rauwe PDOK-naam. Omdat `tt_resolve_search_origin()` (bepaalt het vertrekpunt van de zoekstraal) rechtstreeks op die kolom zoekt, matchte "Den Haag" typen dus nooit met een rij die "'s-Gravenhage" heet — geen displayfoutje, een kapotte zoekfunctie.
- **Bug 1, fix:** eenmalige datareparatie (`tt-80-zoekbugs-fix.sql`, blok 1-4) — gangbare naam als hoofdnaam in `postcode_cache`, `musicians` én `bands`, officiële naam blijft terugvindbaar via `alternatieve_schrijfwijzen`. Structurele fix in `index.html`: `lookupPostcodeCity()` schrijft nu de berekende weergavenaam terug i.p.v. de rauwe PDOK-naam, zodat elke nieuwe postcode-opzoeking de reparatie niet steeds ongedaan maakt. `tt_resolve_search_origin()` zoekt daarnaast ook op `alternatieve_schrijfwijzen` als extra vangnet (blok 5a).
- **Bug 2, root cause:** `tt_search_musicians()` (en, bevestigd via dezelfde controle, `tt_search_bands_for_musician()`) hadden geen parameter om een ander vertrekpunt dan de eigen locatie mee te geven — voor een ingelogde gebruiker deed het Plaats-veld dus niets, ongeacht wat erin getypt werd; de straal bleef altijd om de eigen stad, met de getypte tekst alleen als (kansloze) extra filter erbovenop.
- **Bug 2, fix:** beide RPC's uitgebreid met optionele `origin_lat`/`origin_lng` (blok 5b, 5c) — standaard `NULL`, dan ongewijzigd bestaand gedrag (eigen locatie). `runSearch()` en `runBandSearch()` in `index.html` herzien: staat Plaats nog op je eigen stad (of leeg), dan blijft de straal om je eigen locatie; typ je iets anders, dan wordt dát het nieuwe vertrekpunt (via `resolveSearchOrigin()`, dezelfde functie die de anonieme zoekpaden al gebruikten). **Vastgelegd als expliciete eis in Deel 2 (zie hieronder)**, na een korte discussie of dit een ontwerpfout was — bleek een implementatiefout te zijn t.o.v. een bedoeling die al bestond maar nergens buiten codecommentaar was vastgelegd.
- **Getest:** Playwright, met een stub die de RPC-aanroepen onderschept — bevestigd dat `tt_search_musicians`/`tt_search_bands_for_musician` de juiste `origin_lat`/`origin_lng` krijgen zodra Plaats afwijkt van de eigen stad, en `null`/`null` (ongewijzigd gedrag) zodra Plaats leeg is of gelijk aan de eigen stad — voor zowel muzikanten- als bandzoeken. `pickDisplayCity()` en de aangepaste `lookupPostcodeCity()`-upsert los getest. **Niet getest: de daadwerkelijke SQL-functies zelf** (geen databasetoegang in deze omgeving) — dat loopt via Ronalds eigen smoke-test na het draaien van het script.
- **Kleine correctie tijdens het bouwen:** bij het toevoegen van de bandzoek-fix werd per ongeluk blok 5b (de muzikanten-functie) overschreven i.p.v. ernaast gezet — direct opgemerkt en hersteld vóór oplevering.

**Nieuwe vastgelegde eis (Deel 2-B, zoeken/matchen):** het Plaats-veld wordt bij een eigen profiel automatisch gevuld met de eigen stad (gebruiksgemak), maar is altijd overschrijfbaar. Wijzig je het, dan wordt dát het nieuwe vertrekpunt voor de zoekstraal — geen tekstfilter bovenop de eigen straal, maar een echt ander vertrekpunt. Geldt voor zowel Muzikanten- als Bandzoeken.

## 10-08-2026 (vervolg 3) — Handmatige back-up (interim TT-65) uitgevoerd
Op een opgeschoonde database (na TT-79). Alle 9 relevante tabellen als CSV geëxporteerd via Table Editor (musicians, musician_instruments, musician_genres, musician_songs, musician_media, bands, band_members, band_wanted, messages — postcode_cache bewust overgeslagen, geen gebruikersdata), plus de volledige inhoud van beide Storage-buckets (avatars, media) als zip gedownload. Alles samen in één map, buiten Ronalds laptop.
- **Bijgevonden onderweg:** het downloaden van een hele Storage-bucket in één keer (i.p.v. los bestand) laat de browser een zip samenstellen — dat kan lang duren bij grotere bestanden (video's in `media` met name), maar is geen storing. Gewoon laten doorlopen.
- **Nog open, bewuste vervolgbeslissing (niet vandaag genomen):** dit moet herhaald blijven worden zolang het Free-abonnement geen automatische back-ups heeft. Twee routes liggen klaar: zelf een terugkerende herinnering instellen, of upgraden naar Pro ($25/mnd) voor automatische dagelijkse back-ups + optionele point-in-time recovery — dat laatste staat toch al als aandachtspunt "vóór brede lancering" in de lijst.

## 10-08-2026 (vervolg 2) — TT-79: oude profielen zonder gebruikersnaam opgeschoond
Bevinding Ronald: eerst opschonen, dan pas de back-up van TT-65 — anders legt de back-up rommel vast.
- **TT-79 (nieuw en opgelost):** alle accounts zonder gebruikersnaam verwijderd — per definitie profielen van vóór TT-38 (07-08-2026, sindsdien is een gebruikersnaam verplicht vanaf stap 1 van de wizard) die nooit meer zijn ingelogd, anders had het verplichte gate-scherm het alsnog afgedwongen. SQL-script (`tt-79-oude-profielen-opschonen.sql`) volgt dezelfde volgorde als de bestaande `executeAccountDeletion()` (TT-22): eerst een voorvertoning, dan een waarschuwing voor bandoprichters mét andere bevestigde leden (0 gevallen dit keer, dus geen handmatige band-beslissing nodig), dan solo-bands opruimen, overig bandlidmaatschap, kindtabellen, en tot slot het auth-account zelf — dat laatste kon nooit vanaf de client (TT-22-restpunt), maar wel via de SQL Editor, die met volledige rechten draait. Berichten bewust ongemoeid gelaten, zelfde besluit als TT-22.
- **Bijgesteld tijdens het uitvoeren:** directe `DELETE` op `storage.objects` bleek door Supabase geblokkeerd ("Direct deletion from storage tables is not allowed. Use the Storage API instead.") — nieuwe platformbeveiliging, niet eerder tegengekomen in dit project. Opgelost met een handmatige stap via de Storage-UI in het dashboard i.p.v. SQL. Kleine correctie halverwege: de oorspronkelijke instructie ("bewaar de user_id-lijst uit blok 1") klopte niet meer zodra de musicians-rijen al verwijderd waren — de lijst is toen omgedraaid naar "vergelijk Storage-mappen met de user_id's die nú nog wél bestaan, de rest is een wees". Die aanpak is robuuster en herbruikbaar voor een volgende keer.
- **Resultaat:** 2 mappen in `avatars`, 1 map in `media`, allebei/alle bleken bij nog bestaande profielen te horen — geen wezen gevonden, dus niets te verwijderen in Storage dit keer.
- Vervolgstap: de handmatige back-up (interim voor TT-65) staat weer open, nu op een opgeschoonde database.

## 10-08-2026 (vervolg) — TT-78: reserveerlijst gebruikersnamen
Bevinding Ronald: gebruikersnamen die op een beheerrol lijken (of die zich voordoen als het platform zelf) moeten geblokkeerd worden, om misbruik te voorkomen.
- **TT-78 (nieuw en opgelost):** twee nieuwe constanten, `RESERVED_USERNAME_WORDS` (beheer-achtige termen zoals admin/beheerder/moderator/support/systeem/staff/officieel enz., substring-match dus ook "SuperAdmin92" wordt geraakt) en een losse regel die elke naam blokkeert die zowel "talent" als "tent" bevat (Ronalds expliciete regel, ongeacht wat daartussen staat). Nieuwe `isReservedUsername()`-helper, ingebouwd in `checkUsernameAvailability()` — dat is het ene centrale controlepunt waar zowel de registratiewizard als het verplichte gebruikersnaam-gate-scherm al doorheen liepen vóór het opslaan, dus geen dubbele implementatie nodig. Een geblokkeerde naam bereikt de database niet eens (geen RPC-aanroep), voorkomt dus ook onnodig dataverkeer.
- **Aparte staff-uitzonderingslijst**, zoals gevraagd: `STAFF_USERNAME_EXCEPTIONS`, leeg bij oplevering. Namen die hierop staan (exacte match, hoofdlettergevoeligheid maakt niet uit) omzeilen de blokkade. **Let op — geen echte toegangscontrole:** de app heeft geen concept van "ingelogd als medewerker", dus dit is een losse, aanvulbare lijst met specifieke namen die Ronald/medewerkers zelf mogen gebruiken, geen rolgebaseerde beveiliging. Iedereen die zo'n exacte naam intypt zou hem ook kunnen claimen — de bescherming zit in het feit dat alleen intern bekend is welke namen op de lijst staan, niet in een technische controle wie de aanvrager is. **Nog aan te vullen door Ronald** met de exacte gebruikersnamen die daadwerkelijk gebruikt gaan worden.
- **Getest:** reserveercheck getest op een reeks voorbeeldnamen (beheer-achtige termen, combinaties van talent+tent, gewone namen) en bevestigd dat een geblokkeerde naam nooit de databasecheck (`db.rpc`) bereikt, terwijl een gewone naam dat wel doet. Staff-uitzondering apart getest.

## 10-08-2026 — TT-75/76/77: bevindingen uit vorige sessie verwerkt
Vier bevindingen van Ronald bij sessiestart, alle vier besproken en drie gebouwd:
- **TT-75 (nieuw en opgelost):** berichtenteller ("0/2000") ontbrak bij zowel de composer (`messageComposerBody`) als het gespreksscherm (`messagesReplyInput`). Nieuwe generieke `updateCharCounter()`-functie, hergebruikbaar voor toekomstige velden met een `maxlength`. Teller kleurt `--danger` bij het bereiken van de grens. Teller wordt expliciet gereset bij het openen van de composer en bij het openen/verversen van een gesprek (anders bleef een oud aantal staan na het versturen van een reply).
- **TT-76 (nieuw en opgelost):** repertoire overal alfabetisch op band/artiest, dan op titel — op de profielweergave (`buildMusicianDetailHTML`) en in de wizard-editor (`renderSongs`). Nieuwe gedeelde `compareArtistTitle()`-helper. In de wizard bleef de onderliggende `state.songs`-array in invoervolgorde (nodig omdat `setLevel(i)`/`removeSong(i)` op de echte array-index werken); de weergave gebruikt een apart gesorteerde indexlijst die naar diezelfde echte index terugwijst. Setlist-zoeken (`setlistWantedSongs`) bewust **niet** gesorteerd — die lijst is genummerd (#1, #2...) en die volgnummers worden elders getoond bij matches; sorteren zou die referenties laten verspringen.
- **TT-77 (nieuw en opgelost):** verplichte akkoord-checkbox bij de laatste wizardstap, vóór "Profiel aanmaken". Voorheen was het alleen een tekstregel met links — instemming was impliciet bij het klikken op de knop, geen aparte handeling. Nu: checkbox niet vooraf aangevinkt, submit-knop disabled tot hij is aangevinkt (`updateSubmitProfileState()`), met een extra check in `submitProfile()` zelf als vangnet. **Alleen bij een nieuw account** — bij het bewerken van een bestaand profiel (`editingMusicianId` gezet) blijft de checkbox verborgen en de knop altijd actief, want die toestemming is al gegeven bij de oorspronkelijke registratie; opnieuw aanvinken bij elke bewerking zou alleen wrijving toevoegen. Links naar de documenten stonden al vóór de knop en openen al in een nieuw tabblad (TT-63) — dat was voldoende antwoord op Ronalds vraag of de documenten al aangeboden werden vóórdat iemand akkoord gaat; geen aparte "eerst doorlezen"-gate toegevoegd, dat zou een onnodige drempel zijn geweest.
- **Overlap Gebruiksvoorwaarden/Gedragscode (besproken, niet gewijzigd):** Ronald wil geen kruisverwijzingen ("zie de Gedragscode voor...") — dat zijn drempels voor de lezer. Besluit: informatie blijft op de plek waar hij nodig is, ook als dat betekent dat beide documenten gedeeltelijk hetzelfde onderwerp behandelen (sfeer, meldpunt, wat niet mag). Documenten blijven twee aparte stukken (juridisch contract vs. gedragsnormen or "hoe gaan we met elkaar om") — geen samenvoeging. Geen ticket; optimalisatie mag alsnog worden doorgevoerd zodra een concrete verbetering zich aandient, zonder verwijzingen te gebruiken.
- **Getest:** Playwright-smoke test (geen netwerktoegang in de ontwikkelomgeving, dus met een minimale supabase-stub): berichtenteller telt correct mee, sorteerhelper geeft de juiste volgorde, en — het meest kwetsbare stuk — `removeSong(i)` op een gesorteerde weergave verwijdert daadwerkelijk het juiste nummer uit de onderliggende array. Consent-checkbox getest in beide standen (nieuw account: verplicht en zichtbaar; bewerken: verborgen en nooit blokkerend). Brace/parenthesis/bracket-balans geverifieerd. **Live smoke-test (inloggen, zoeken, bericht sturen, profiel bewerken) nog niet gedaan** — kon niet in deze omgeving, wel nodig na upload.

## 09-08-2026 (vervolg 3) — TT-63 gepubliceerd + TT-74: hamburgermenu
De conceptteksten van TT-63 (vorige sessielog-entry) zijn nu daadwerkelijk in de app gebouwd, ná een gesprek over ván waar ze bereikbaar moesten zijn.

- **TT-74 (nieuw en opgelost):** Ronald gaf aan dat de navigatie al te vol zat — vijf tabbladen (Mijn Profiel, Mijn Bands, Zoeken, Over ons, Berichten, Inloggen — feitelijk zes) zorgden al voor horizontaal scrollen op mobiel, los van de drie nieuwe documenten die er nog bij moesten. Oplossing: een hamburgermenu (`#navMenuBtn`, ☰-icoon) rechts in de navigatiebalk. Mijn Profiel, Mijn Bands, Zoeken, Berichten en Inloggen/Uitloggen blijven direct zichtbaar; Over ons verhuist naar het menu, samen met de drie nieuwe documenten.
  - Technisch: de knop staat bewust **buiten** `<nav class="app-nav">` — die balk is op mobiel zelf horizontaal scrollbaar (`overflow-x:auto`), dus een knop daarbinnen zou net zo goed uit beeld kunnen scrollen. Nieuwe wrapper `.app-nav-row` bevat beide; de sticky-positionering op mobiel is verplaatst van `.app-nav` naar `.app-nav-row`.
  - Menu sluit bij een klik erbuiten, bij Escape, en (via een aanroep bovenaan `showView()`) bij elke navigatie.
  - **Projectinstructie bijgewerkt:** de oude eis "navigatie altijd volledig zichtbaar: navMyProfile, navMyBands, navSearch, navAbout, navLogin" is aangepast — navAbout staat niet meer in de directe balk, dat was een bewuste keuze, geen vergeten regel.
- **TT-63 (afgerond):** drie nieuwe views (`view-privacy`, `view-terms`, `view-gedragscode`), bereikbaar via het hamburgermenu en via `#privacy`/`#terms`/`#gedragscode` (toegevoegd aan de `knownHashViews`-allowlist in `appInit()`). Consent-regel met links naar alle drie toegevoegd bij de laatste wizard-stap, vlak boven de knop "Profiel aanmaken" — links openen bewust in een nieuw tabblad zodat de wizard-voortgang in het huidige tabblad niet verloren gaat.
- **Niet live getest:** zelfde beperking als bij TT-22 — netwerktoegang stond uit, dus geen Playwright-smoke-test. Extra reden voor een zorgvuldige handmatige test van het hamburgermenu op zowel desktop als mobiel (scrollgedrag van `.app-nav`, sticky-gedrag van `.app-nav-row`, sluiten bij klik-buiten).

## 09-08-2026 (vervolg 2) — TT-22: accountverwijdering
Er bleek al een `deleteMyProfile()` te bestaan die bewust alleen het profiel verwijderde ("het account/login blijft bestaan"), inclusief comment die uitlegde waarom. TT-22 bestond specifiek om dat gat te dichten. Opgelost:
- **Storage-opschoning:** alle bestanden onder `{userId}/` in zowel de `avatars`- als de `media`-bucket worden verwijderd (`deleteAllStorageForUser()`), niet alleen de databaserijen die ernaar verwezen.
- **Bandoprichterschap — besluit Ronald:** als de te verwijderen muzikant oprichter is van een band mét andere bevestigde leden, wordt dat in de nieuwe `deleteAccountModal` per band expliciet gevraagd: band ook verwijderen, of overdragen aan een van de overige leden (dropdown). Solo-bands (niemand anders bevestigd) verdwijnen stilzwijgend mee — daar is niemand om iets aan over te dragen. Reden voor deze aanpak: alleen de oprichter kan een band bewerken en aanmeldingen accepteren, dus een band zonder oprichter was een doodlopend weggetje voor de overige leden — en er bestaat nog geen aparte functie om eigenaarschap over te dragen buiten deze flow.
- **Berichten — besluit Ronald:** blijven staan, niet meeverwijderd (raakt anders ook de geschiedenis van de gesprekspartner). `loadInbox()` toont voortaan "Verwijderde gebruiker" i.p.v. de generieke "Muzikant"-fallback van `displayNameOf()` zodra de gekoppelde muzikant niet meer bestaat.
- **Auth-account zelf: bekend restpunt, niet opgelost.** Vraagt de Supabase Admin API (service-role-sleutel) — zelfde categorie beperking als TT-01/TT-54 (geen Edge Function-infrastructuur). Zie TT-22 (restpunt) in Deel 1/P0.
- Knop op Mijn Profiel hernoemd van "Profiel verwijderen" naar "Account verwijderen", roept nu `openDeleteAccountModal()` aan i.p.v. direct `deleteMyProfile()`.
- **Niet live getest:** netwerktoegang stond uit in de ontwikkelomgeving, dus geen Playwright-smoke-test mogelijk voor deze wijziging. Extra reden om de vaste smoke-test (zie bovenaan dit bestand) dit keer zorgvuldig te doorlopen, mét een aparte controle van het verwijderscenario zelf (test-account met een bandoprichterschap, met en zonder overige leden).
- **Aangescherpt, zelfde sessie (Ronald):** één waarschuwing bij het openen van de modal bleek niet genoeg voor de meest onomkeerbare actie in de app. Er is nu een verplichte tweede, expliciete bevestiging (`requestFinalDeleteConfirmation()`) vlak vóór de daadwerkelijke verwijdering, los van eventuele bandkeuzes. Bij het bouwen hiervan ontstond eerst een bug — het sluiten van de modal voor de tweede bevestiging wiste per ongeluk ook de al gemaakte bandkeuzes (`pendingSoloBandIds`) die de uitvoerende functie daarna nog nodig had — direct gevonden en gecorrigeerd vóór oplevering.

## 09-08-2026 (vervolg) — Externe technische review verwerkt
Ronald liet de code en de opgeschoonde actielijst extern tegenlezen. Bevindingen die de code bevestigde (steekproef): `escHtml` (88 aanroepen) en `safeUrl` dekken TT-05 zoals beschreven, media in TT-02 gaat écht naar Storage, `displayNameOf()` (TT-43) wordt consistent op 12 plekken gebruikt, en de zelfkritiek klopt (nul `aria-label`'s, geen service worker — precies TT-68/TT-66). Verwerkt:
- **P0-lijst kreeg een "Direct te doen"-blok** bovenaan: handmatige back-up-export vandaag (interim voor TT-65) en het e-mailadres aanmaken (staat al sinds 08-08 op "besloten, nog niet uitgevoerd") — samen minder dan een uur, stonden onnodig lang stil.
- **TT-45/TT-42:** signaal toegevoegd dat de UAVG de grens voor zelfstandige digitale toestemming mogelijk op 16 legt, wat zou betekenen dat de ouderroute (TT-42) voor 13-15-jarigen niet náást zelfregistratie staat maar die vervángt — niet geverifieerd door een jurist, wel meegegeven als reden om die sessie eerder te plannen en eerst te toetsen vóór de wizard wordt aangepast.
- **TT-64** opgesplitst: een minimale `window.onerror`-handler (ca. een uur) kan naar voren, de volwaardige versie blijft P1.
- **TT-27** geannoteerd: P2 verdedigbaar bij weinig verkeer, expliciet naar P1 zodra de regionale werving (P1) actief wordt.
- **Nieuw ticket TT-71 (P3):** directe interpolatie van `mid`/`otherId` in de PostgREST-filterstring van de berichtenquery — zelf geverifieerd in de code (`loadConversations()`, `openConversation()`); in alle huidige aanroeppaden komen die waarden uit `musicians.id`, dus laag risico, maar wel het enige plekje waar de TT-26-hygiëne niet is doorgevoerd.
- **Vaste smoke-test na elke wijziging** toegevoegd als werkwijze-afspraak (zie bovenaan dit bestand) — geen ticket, wel een terugkerende stap.
- TT-55 (complementaire matching als P1) en het TT-11-herontwerp werden door de review bevestigd — geen wijziging nodig.

## 09-08-2026 — Muzikantenprofiel als kern (Deel 2-A) + opschoning van de actielijst zelf
Sessie bewust beperkt tot het profiel als product, in lijn met (het toenmalige) Deel 2-A.
- **TT-46 (nieuw en opgelost, later dezelfde sessie herzien):** prompts i.p.v. het lege bio-veld. Eerste versie had drie generieke chips; op verzoek van Ronald herschreven naar vier chips die dichter bij muziek maken zelf liggen: "Wat doe je en hoe lang speel je al?", "Op dit moment ben ik vooral bezig met...", "De meeste energie krijg ik van ...", "Vertel eens wat je wil bereiken." Chips vullen `bio` aan via `applyBioPrompt()` i.p.v. overschrijven — meerdere prompts na elkaar blijven zo bruikbaar. Geen schema-wijziging.
- **TT-47 (nieuw en opgelost, later dezelfde sessie herzien):** doelveld uitgebreid met twee concrete, optionele vragen. **Eerste versie:** repetitiefrequentie (wekelijks/af en toe/alleen voor een project) en optreedwens (graag/liever niet/open). **Herzien op verzoek van Ronald:** de optreedwens-vraag overlapte inhoudelijk met de bestaande doelkaart "Optreden" ("dubbele dingen"), en "af en toe"/"alleen voor een project" waren niet concreet genoeg. Herbouwd naar: repetitiefrequentie met vier concrete opties (Wekelijks / Paar keer per maand / Losse jams, als het uitkomt / Alleen voor een project) en een nieuwe vraag "Wat wil je de komende tijd bereiken?" over muzikale groei (Mezelf verbeteren op mijn instrument / Nieuwe stijlen ontdekken / Samen nummers/eigen werk maken / Gewoon plezier, geen groot plan). Kolom `performance_wish` hernoemd naar `musical_ambition`. Ronald zelf: **"dit is nog niet goed genoeg"** — doel en ambitie voelen nog te dicht bij elkaar, zie Deel 2-A. Besluit blijft: alleen op het profiel zichtbaar, geen zoekfilter. **Bekend restpunt:** nog niet toegevoegd aan `tt_get_musicians_public`, dus onzichtbaar voor ingelogde gebruikers zónder eigen profiel. Script: `tt-47-doelveld-uitbreiden-v2.sql`.
- **TT-48 (nieuw en opgelost):** voortgangspaneel als PPP-tijdlijn (verleden/heden/toekomst), los van de bestaande volledigheidsmeter (`renderCompletenessMeter`). Alleen op Mijn Profiel. "Verleden" toont een placeholder tot TT-49 (optredenlijst) er is.
- **Niveau per instrument — ontwerprichting bepaald, niet gebouwd:** schaal 1-5 (sterren), niet Basis/Bijna/Podium. Nu TT-51.
- **Deelbare profiel-URL — besproken, niet gebouwd:** deep link (TT-53) kan zonder backend, rijk deelvoorbeeld (TT-54) niet — zie Deel 2-A voor de technische onderbouwing.
- **Opschoning van de actielijst zelf:** Ronald gaf aan het overzicht kwijt te zijn sinds de concurrentenanalyse. Oorzaak: de toenmalige Deel 2 ("Toekomstvisie") was een ongenummerde, ongeprioriteerde brainstormdump naast het genummerde ticketsysteem; items die eruit gehaald werden moesten op drie plekken tegelijk worden bijgehouden. Alle Deel 2-punten hebben nu een TT-nummer (TT-49 t/m TT-70) of een `—`-plek gekregen, elk in precies één P0-P3-tabel. Twee verouderde dubbele vermeldingen geschrapt: het "beveiligingscontrole databaseregels"-punt (al opgelost via TT-03/TT-04) en de losse "accountverwijdering"-vermelding (nu alleen TT-22). "Volgen/ontvolgen" samengevoegd met TT-13. De drie browsertest-punten (TT-38-restpunt, zoeken zonder profiel, setlist-zoeken) verplaatst naar een nieuw, apart Deel 1a — dat zijn bevestigingstaken voor Ronald, geen bouwtickets, en stonden tussen de P1-tickets in de weg.

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
