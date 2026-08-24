# De zoekfunctie van The Talent Tent — hoe het werkt (na TT-55)

**Status:** functioneel naslagwerk, versie 12-08-2026. Het genre-deel beschrijft de bestaande situatie.

**Belangrijk — lees dit eerst:** hoofdstuk 5 beschrijft een formule (`2m + j`) die uitgebreid is uitgewerkt maar **uiteindelijk niet is gebouwd.** Ronald koos op 12-08-2026 voor de eenvoudiger richting uit sectie 5.12: een harde filter (max 1 instrument + optioneel Zang) i.p.v. een formule. Hoofdstuk 5.1 t/m 5.11 staat er nog, als naslag over waarom die formule leek te werken en wat hij zou hebben gekost — maar is **niet** wat er nu in `index.html` zit. Ga voor de gebouwde situatie direct naar **5.12**.

**Leeswijzer bij de labels:** elke bewering is één van deze drie:
- **Geverifieerd** — gelezen in `index.html`, `actielijst.md`, of narekenbaar wiskundig bewijs.
- **Aanname** — aangenomen, met reden erbij.
- **Onbekend** — niet vastgesteld, informatie ontbreekt.

---

## 1. Waarom dit document bestaat

De zoekfunctie is het hart van de Prestatie-pijler: de plek waar een muzikant een ander vindt om mee te spelen. Dit document legt uit hoe die zoekfunctie werkt, in gewone taal, met de vaktermen erbij zodat je ze kunt opzoeken.

---

## 2. De drie manieren om te zoeken

**Muzikanten zoeken.** Je zoekt naar andere muzikanten. Elke muzikant krijgt een matchscore.

**Bands zoeken.** Je zoekt naar bands die leden zoeken. Elke band krijgt een matchscore.

**Setlist-zoeken.** Je geeft een lijst nummers op. De app zoekt muzikanten die die nummers al spelen. Werkt anders — zie hoofdstuk 8.

---

## 3. Waar een zoekopdracht mee begint: plaats en straal

- **Met eigen profiel:** je eigen stad is automatisch het vertrekpunt. Typ je een andere plaats, dan wordt dát het nieuwe vertrekpunt. Geen extra filter bovenop je eigen straal, maar een echt ander startpunt.
- **Zonder eigen profiel:** je typt zelf een plaats. Zonder plaats: geen straal, alle profielen tellen mee.
- **De straal** stel je apart in (bijvoorbeeld 10, 25 of 50 km).

**Geverifieerd** (`runSearch`, `runBandSearch`). Vastgelegd in `actielijst.md` als "Vastgelegd gedrag Plaats-veld bij zoeken" (TT-80), nadat bleek dat een getypte plaats soms genegeerd werd — een bug, geen bedoeld gedrag.

---

## 4. Genre: de Jaccard-index

### 4.1 Wat het is

Bij genre werkt gelijkenis goed. Twee muzikanten die allebei metal en punk spelen, horen hoog op elkaar te scoren.

De techniek heet de **Jaccard-index** (ook: Jaccard-gelijkeniscoëfficiënt). De rekenregel: het aantal genres dat beide profielen delen, gedeeld door het totale aantal verschillende genres van beide samen. In verzamelingentaal: de **doorsnede** gedeeld door de **vereniging**.

Voorbeeld: A speelt rock en blues. B speelt rock, blues en jazz. Gedeeld: 2 (rock, blues). Totaal verschillend: 3 (rock, blues, jazz). Score: 2 ÷ 3 = 67%.

Twee identieke profielen geven 100%. Geen enkele overlap geeft 0%.

### 4.2 Waarom dit de juiste naam is

**Geverifieerd via redenering, niet via de databasecode.** De onderbouwing bestaat uit drie stappen:

1. **De techniekcategorie ligt vast.** `actielijst.md` (TT-55) zegt: "genre blijft gelijkenis". De app vergelijkt twee ongeordende verzamelingen tags en levert één genormaliseerd getal. Voor precies dat probleem is de Jaccard-index de standaardtechniek.

2. **Het enige serieuze alternatief is de Dice-coëfficiënt** (ook: Sørensen-Dice). Die rekent: tweemaal de doorsnede, gedeeld door de som van beide verzamelingsgroottes. Op hetzelfde voorbeeld: 4 ÷ 5 = 80% waar Jaccard 67% geeft.

3. **Voor de huidige app maakt dat verschil niets uit.** De matchscore wordt nergens aan de gebruiker getoond — geen percentage op een zoekresultaat, geen matchbalk. Het getal wordt uitsluitend gebruikt om te sorteren (**geverifieerd:** alle vier voorkomens van `matchScore` in `index.html` zijn sorteervergelijkingen of toewijzingen). En Jaccard en Dice staan in een vaste verhouding tot elkaar:

   > D = 2J / (1 + J)

   Dat is een monotoon stijgende functie: een hogere Jaccard geeft altijd een hogere Dice. **Beide geven dus exact dezelfde sorteervolgorde.** De app kan het verschil niet tonen.

Conclusie: de techniek is de Jaccard-index. De precieze regel in de databasefunctie `tt_search_musicians` is nooit ingezien, maar het onderscheid is voor het huidige gedrag zonder betekenis.

### 4.3 Wanneer dit wél gaat uitmaken

Zodra de genre-score wordt opgeteld bij een instrument-score met een weging (hoofdstuk 6), verdwijnt die gelijkwaardigheid. Bij een gewogen som telt de absolute hoogte mee, niet alleen de volgorde. Dice geeft systematisch hogere getallen dan Jaccard bij dezelfde overlap. Genre zou dan zwaarder wegen dan bedoeld, zonder dat er iets aan de weging is veranderd.

**Aandachtspunt bij het ontwerp van TT-55, geen blokkade ervoor.**

---

## 5. Instrument: matchtype uit twee zoeklijsten — historisch, niet gebouwd

**Let op:** deze formule (5.1 t/m 5.11) is grondig uitgewerkt en met een script doorgerekend, maar **is niet gebouwd.** Ronald koos op 12-08-2026 voor de eenvoudiger richting in 5.12. Deze paragrafen blijven staan als naslag over de afweging, niet als beschrijving van hoe de app nu werkt.

### 5.1 Het probleem met de huidige aanpak

**Geverifieerd (letterlijk in `actielijst.md`, TT-55):** "Nu meet de score op instrument-gelijkenis, waardoor twee drummers elkaars beste match zijn — kernprobleem in de Prestatie-pijler."

Bij instrument werkt gelijkenis averechts. Twee drummers spelen niet samen. Een drummer heeft een gitarist, bassist of zanger nodig.

### 5.2 Waarom Jaccard hier principieel niet kan

De Jaccard-index is **symmetrisch**: de uitkomst voor A tegenover B is altijd gelijk aan die voor B tegenover A. Er zit geen richting in.

Maar "wat ik speel" en "wat ik zoek" zijn twee verschillende verzamelingen, met een richting ertussen. Je wilt weten of A's instrumenten voorkomen in B's zoeklijst — dat is een andere vraag dan andersom. Een symmetrische maat kan dat verschil niet uitdrukken. Dit is geen kwestie van afstelling, maar van het verkeerde soort wiskunde.

### 5.3 De vakterm voor dit soort systemen

De categorie waar The Talent Tent in valt heet een **reciprocal recommender system** (RRS), in het Nederlands: wederkerig aanbevelingssysteem. Het is de klasse aanbevelingssystemen waarbij mensen zowel het onderwerp als het object van de aanbeveling zijn. Bekende toepassingen: online dating, vacaturebemiddeling, mentor-mentee-koppeling. Een muzikant is tegelijk zoeker en gezochte, dus de app hoort hier onmiskenbaar bij.

Het fundamentele artikel is **RECON** (Pizzato e.a., RecSys 2010). Daarin is gemeten wat wederkerigheid oplevert: het slagingspercentage van de top tien aanbevelingen ging van 23% naar 42%, met tegelijk een betere recall. Bijna een verdubbeling.

**Let op het onderscheid.** Wederkerigheid is het *principe* — beide kanten moeten iets aan de match hebben. De literatuur gebruikt daarvoor meestal dekkingspercentages met een harmonisch gemiddelde. The Talent Tent past hetzelfde principe toe met een eenvoudiger rekenvorm, om redenen die in hoofdstuk 6 staan. Het principe blijft, de techniek is bewust simpeler.

### 5.4 De formule: score = 2m + j

**m — het matchtype.** Een geheel getal 0, 1 of 2. Tel twee ja/nee-vragen op:

- Zoekt A een instrument dat B speelt? → 1 of 0
- Zoekt B een instrument dat A speelt? → 1 of 0

**j — de genre-Jaccard.** Een getal van 0 tot en met 1, berekend zoals in hoofdstuk 4.

**De score is 2m + j.** Sorteer aflopend. Dat is de hele berekening.

**Waarom het matchtype verdubbeld wordt en niet het genre gehalveerd.** De tussenruimte tussen twee m-waarden moet groter zijn dan de maximale bijdrage van genre. Anders kan genre een matchtype overklassen.

- Bij `m + j` is de tussenruimte 1 en het genre-maximum 1. Een eenzijdige match met perfect genre geeft 2,0 — **exact gelijk** aan een wederzijdse match zonder genre-overlap. Gelijkspel, geen scheiding. Onbruikbaar.
- Bij `m + j/2` is de scheiding wél strikt, maar de decimalen zijn dan de halve Jaccard. Je moet elke afgelezen waarde verdubbelen om hem te begrijpen.
- Bij `2m + j` is de tussenruimte 2 en het genre-maximum 1. Strikte scheiding, én de decimalen zijn de Jaccard-waarde zelf.

**Afleesbaarheid.** Het hele getal gedeeld door 2 is het matchtype, de decimalen zijn de genre-overlap. Score 4,67 lees je als: wederzijdse match, 67% genre-overlap. Bij het opsporen van fouten zie je in één oogopslag wat er is gebeurd. Bij een gewogen som van 0,734 is dat onmogelijk.

**Dit is een lexicografische ordening, verpakt in één getal.** Instrument bepaalt de rangorde, genre schikt daarbinnen. Je krijgt gelaagd gedrag zonder lagen te bouwen.

### 5.5 Volledige variantentabel

Doorgerekend en geverifieerd met een script op 10-08-2026.

| Situatie | m | j | score |
|---|---|---|---|
| Wederzijds, identieke genres | 2 | 1,00 | **5,00** |
| Multi-instrument, wederzijds | 2 | 1,00 | 5,00 |
| Wederzijds, gedeeltelijk genre | 2 | 0,67 | 4,67 |
| Wederzijds, geen genre-overlap | 2 | 0,00 | 4,00 |
| Eenzijdig, perfect genre | 1 | 1,00 | 3,00 |
| Eenzijdig, andere richting | 1 | 1,00 | 3,00 |
| Zoekt alles (10 instrumenten) | 1 | 1,00 | 3,00 |
| **Band zoekt 2e gitarist, gitarist zoekt niets** | **1** | **0,67** | **2,67** |
| Geen match, identiek genre (twee drummers) | 0 | 1,00 | 1,00 |
| Geen match, geen genre | 0 | 0,00 | 0,00 |

**Groepsbereiken, geverifieerd:** m=0 loopt 0,00 t/m 1,00 · m=1 loopt 2,00 t/m 3,00 · m=2 loopt 4,00 t/m 5,00. Geen overlap tussen de groepen.

**Twee eigenschappen die hieruit blijken:**

1. **"Zoekt alles" levert geen voordeel op.** Iemand die tien instrumenten opgeeft, komt op m=1 en blijft onder élke wederzijdse match. Elke richting is afgetopt op 1. Het probleem is wiskundig begrensd, er is geen correctiefactor nodig.
2. **De tweede gitarist staat er gewoon bij**, op 2,67 — ruim boven elk niet-matchend profiel. Zie 5.7.

### 5.6 Verplichte regel: j is 0 als beide genrelijsten leeg zijn

**Hebben beide profielen géén genres ingevuld, dan is de Jaccard 0 gedeeld door 0 — wiskundig ongedefinieerd.** In PostgreSQL geeft dat afhankelijk van de schrijfwijze een fout of een `NULL`. En een `NULL` in de optelling maakt de héle score `NULL`, waardoor dat profiel uit de sortering verdwijnt.

**Vastgelegde regel: bij twee lege genrelijsten geldt j = 0.** Dit is geen randgeval maar een verplichte controle in de databasefunctie.

Eén lege genrelijst is geen probleem: de vereniging is dan niet leeg, de doorsnede wel, en j komt correct op 0 uit. Alleen twee lege lijsten geven de deling door nul.

### 5.7 De belangrijkste bouwregel: de zoeklijst beslist, nooit het instrumentverschil

**Toetsvraag van Ronald (10-08-2026): een band zoekt een tweede gitarist. Valt de eerste gitarist dan uit de zoekresultaten?**

**Nee.** Staat "gitarist" in wat de band zoekt, dan levert dat een 1 op in m. Dat de band er al een heeft, is niet aan het systeem om te beoordelen. De band heeft zelf opgegeven wat hij zoekt. Score 2,67 in de tabel hierboven.

**De valkuil.** De probleembeschrijving in TT-55 ("twee drummers zijn elkaars beste match") nodigt uit tot de verkeerde oplossing: gelijke instrumenten afstraffen. Wie dat bouwt, laat de tweede gitarist verdwijnen, de tweede zanger, de tweede violist in een strijkkwartet.

Het echte probleem bij die twee drummers is niet dat ze allebei drummen. Het is dat **geen van beiden een drummer zoekt.** De formule lost dat vanzelf op: zoekt niemand een drummer, dan is m nul en zakt het paar naar de onderste groep. Er is geen strafregel nodig, en er mag er geen zijn.

Omgekeerd: zoeken twee gitaristen allebei een gitarist — voor een duo, of voor lead en ritme — dan is m gelijk aan 2. Correct gedrag, geen uitzondering.

**Vuistregel voor de bouw:** instrumentoverlap mag nooit een negatieve term zijn. Alleen de zoeklijsten tellen.

### 5.8 Wat deze formule overbodig maakt

Ten opzichte van een eerder ontwerp met dekkingspercentages en een harmonisch gemiddelde vervalt het volgende:

- **Het harmonisch gemiddelde.** Niet nodig. De twee richtingen zijn twee ja/nee-waarden die je optelt. De wederkerigheid uit TT-55 zit in m zelf.
- **De nul-val.** Bij een harmonisch gemiddelde maakt één nul de hele uitkomst nul, waardoor een muzikant zonder zoeklijst bij élke band op nul uitkwam. Bij optellen kost een lege zoeklijst één punt, niet alles.
- **De aparte terugvalregel.** De vorm van de formule regelt het. Geen extra code.
- **De weegvraag.** Structureel beantwoord: instrument bepaalt de rangorde, genre schikt daarbinnen.
- **Een correctie voor breed zoeken.** Zie 5.5, eigenschap 1.

**Let op — het normalisatieprobleem staat hier bewust niet meer bij.** Een eerdere versie noemde het als opgelost, omdat er geen breuken in de formule zitten. Dat was onjuist. De formule stelt de vraag niet, en dat is iets anders dan hem beantwoorden. Zie zwakke plek 2 in 5.11.

### 5.9 Waarom dit ook sneller en veiliger is

**Snelheid.** De twee ja/nee-vragen zijn in PostgreSQL de overlap-operator op arrays (`&&`). Eén bewerking per richting, geen tellen, geen delen, en te ondersteunen met een index.

**Regressierisico.** `sortMusicianList` en `sortBandList` doen allebei `b.matchScore - a.matchScore` — aflopend op één getal (**geverifieerd** in `index.html`). Dat is precies wat deze formule oplevert. De client hoeft niet te veranderen. TT-55 wordt daarmee een wijziging in de databasefunctie plus een nieuw profielveld, niet een verbouwing van het bestand van 7.843 regels.

### 5.10 De samenvatting van TT-55 in één zin

Van een **symmetrische gelijkenismaat op instrumenten** naar **twee ja/nee-vragen over de zoeklijsten**, opgeteld tot een matchtype, met de genre-Jaccard als schikking daarbinnen — waarbij overlap nooit wordt afgestraft.

---

### 5.11 Drie zwakke plekken van deze formule

**Toegevoegd 10-08-2026, op verzoek van Ronald.** In eerdere versies van dit document stond `2m + j` beschreven met alleen de voordelen. Dat was onvolledig: het presenteerde tekortkomingen als opgeloste problemen. Wat de formule kost, staat hieronder.

**Zwakke plek 1 — binnen een groep telt alleen genre.**

Twee wederzijdse matches, allebei m=2. Bij de één sluiten jullie op drie instrumenten aan, bij de ander op één. Is het genre gelijk, dan krijgen ze exact dezelfde score.

De diepte van de instrumentmatch verdwijnt volledig uit de berekening. De formule kent alleen "wel" en "niet", geen "hoeveel".

**Zwakke plek 2 — de omvang van de vraag telt niet mee.**

Een band die vijf mensen zoekt en waar jij er één van invult, scoort gelijk aan een band die uitsluitend jouw instrument zoekt. Voor de eerste band ben je één van vijf gaten; voor de tweede ben je precies de gezochte persoon.

**Dit is weggelaten informatie, geen opgelost probleem.** Een eerdere versie van dit document noemde het onder de kop "wat deze formule overbodig maakt", bij het normalisatieprobleem. Dat was onjuist: de formule stelt de vraag niet, en een vraag niet stellen is geen antwoord.

**Zwakke plek 3 — veel gelijke scores, en dan is de volgorde willekeurig.**

**Geverifieerd in `index.html`:** `sortMusicianList` geeft bij een gelijkstand `return 0` terug. De volgorde komt dan uit de database en is niet gedefinieerd. Twee gebruikers kunnen bij dezelfde zoekopdracht een andere volgorde zien, en dezelfde gebruiker kan bij herhaling een andere volgorde krijgen.

Onder `2m + j` ontstaan veel gelijke scores, juist door zwakke plek 1 en 2. Dit is geen ontwerpruil maar een gebrek dat opgelost moet worden. **Een tweede sorteersleutel is noodzakelijk** — afstand ligt het meest voor de hand, en is al beschikbaar.

**Hoe deze drie zich tot elkaar verhouden:** zwakke plek 1 en 2 zijn een bewuste ruil, eenvoud tegen fijnmazigheid. Zwakke plek 3 is dat niet — die moet hoe dan ook worden opgelost, in welke formule dan ook.

---

### 5.12 De uiteindelijke, gebouwde oplossing (12-08-2026): harde filter, geen formule

**Besluit van Ronald**, na de vraag "zou het matchen beter gaan als het zoeken tot maximaal 1 instrument (+ eventueel zang) beperken?" opnieuw op te pakken: geen `2m + j`, geen nieuw veld, geen wijziging aan een databasefunctie. In plaats daarvan:

1. **Het instrumentfilter op de muzikanten-zoekpagina wordt een harde filter, niet een formule.** Voorheen kon je meerdere instrumenten tegelijk aanvinken (OF-filter). Nu: maximaal 1 instrument, met Zang als losse, onafhankelijke aan/uit-schakelaar ernaast (die dus altijd samen met een instrument mag, zonder de 1-instrument-limiet te breken).
2. **Binnen dat filterresultaat sorteert de bestaande genre-Jaccard-score** (hoofdstuk 4), ongewijzigd. Geen `m`, geen matchtype.
3. **Tie-break, nu wél gebouwd (lost zwakke plek 3 uit 5.11 op):** bij een gelijke (of ontbrekende) matchscore besliste `sortMusicianList()`/`sortBandList()` voorheen `return 0` — een onvoorspelbare volgorde uit de database. Vastgelegd gedrag, nu geïmplementeerd: bij gelijke stand eerst afstand (dichtstbij eerst), dan naam (alfabetisch). Geldt voor alle zoekresultaten (muzikanten én bands).
4. **De andere richting van wederkerigheid** (is de gevonden persoon ook open om met jóu te spelen?) is hiermee **niet** opgelost — dat blijft TT-56 ("sta je open voor iets nieuws?"), een apart, nog open ticket. Tot die er is: elk volledig/zichtbaar profiel telt impliciet als "open".

**Waarom dit de formule uit 5.1-5.11 overbodig maakt:** het "twee drummers zijn elkaars beste match"-probleem ontstond doordat de matchscore op instrument-gelijkenis rekende, zonder dat er een harde filter op stond. Met een harde filter (je zoekt letterlijk "bassist") speelt dat probleem niet meer — iedereen in het resultaat speelt per definitie het gezochte instrument. Er is geen formule nodig om dat via een score af te dwingen.

**Wat hiermee niet verandert:** de databasefunctie `tt_search_musicians` (en de anon-/band-varianten) — de genre-score die zij leveren blijft ongewijzigd, ze zijn niet gelezen en niet aangepast voor deze richting. Alleen de client-side filter-UI (`initSearchFilters()`) en de tie-break in `sortMusicianList()`/`sortBandList()` zijn gewijzigd.

**Scope:** aanvankelijk (12-08-2026) alleen doorgevoerd op het instrumentfilter van de **muzikanten**-zoekpagina (`filterInstruments`). **Zelfde dag, op verzoek van Ronald, ook doorgevoerd** op het "instrument gezocht"-filter van de **bands**-zoekpagina (`filterBandWanted`) — identiek patroon: maximaal 1 instrument, Zang als losse schakelaar ernaast.

**Getest met Playwright (12-08-2026):** 1 instrument kiezen selecteert het en niets anders; een tweede instrument kiezen vervangt de eerste keuze; Zang toggelt onafhankelijk naast een instrument; bij een gelijke matchscore sorteert het resultaat eerst op afstand, dan op naam.

---

## 6. Verworpen alternatief: dekkingsmaat met harmonisch gemiddelde

Een eerder ontwerp in dit document gebruikte per richting een dekkingspercentage (welk deel van wat A zoekt vult B in), samengevoegd met het harmonisch gemiddelde. Die techniek komt uit de literatuur over wederkerige aanbeveling (zie hoofdstuk 14) en is op zichzelf correct.

**Waarom hij hier toch is verworpen (besluit Ronald, 10-08-2026):** te complex voor deze app. Complexiteit leidt tot fouten en tragere respons, en Voorwaarde 0 zegt dat stabiliteit altijd wint van functionaliteit.

Concreet bracht die aanpak vier problemen mee die `2m + j` niet heeft: de nul-val, het normalisatieprobleem, een correctie voor breed zoeken, en de weegvraag tussen genre en instrument. Zie 5.8.

**Bewaard als naslag,** omdat het de standaardaanpak in de vakliteratuur is. Mocht de app ooit veel groter worden en fijnmaziger moeten sorteren bínnen de groep m=2, dan is het harmonisch gemiddelde daarvoor het juiste gereedschap — als aanvulling op deze formule, niet als vervanging.

---

## 7. Afstand en sortering

Afstand in kilometers wordt apart getoond zodra er een vertrekpunt bekend is. Afstand telt **niet** mee in de matchscore.

De volgorde van resultaten, altijd in deze vaste volgorde:

1. **Actuele profielen eerst.** Een profiel dat langer dan zes maanden niet is bijgewerkt, staat altijd onderaan — ongeacht de matchscore.
2. **Daarbinnen: de gekozen sorteermodus.** Standaard de matchscore (hoogste eerst). De gebruiker kan kiezen voor "dichtstbijzijnde" of "nieuwste".

**Geverifieerd** (`sortMusicianList`, `sortBandList`).

---

## 8. Setlist-zoeken: een apart model, geen matchscore

Je geeft een lijst nummers op (titel + artiest). De app telt per muzikant hoeveel van die nummers exact voorkomen in het repertoire. Geen gelijkenis, geen wederkerigheid — een letterlijke match per titel-en-artiestcombinatie.

Sortering: meer treffers is hoger. Bij gelijke stand dichtstbijzijnde eerst, anders alfabetisch. Verouderde profielen ook hier onderaan.

**Geverifieerd** (`runSetlistSearch`).

---

## 9. Wat een profiel vindbaar maakt

Een profiel verschijnt pas in zoekresultaten zodra het als volledig is gemarkeerd (`profile_complete`). Een half ingevulde wizard levert geen zichtbaar profiel op.

**Geverifieerd.**

---

## 10. Waar TT-55 in de bredere planning staat

In `actielijst.md` staat TT-55 in het cluster **"B. Het matchen laten kloppen"**, samen met:

- **TT-56** — statusknop "sta je open voor iets nieuws?". Open besluit, vorm nog niet bepaald.
- **TT-57** — de rangschikking uitleggen aan de gebruiker. Dit document legt uit hóe het werkt; TT-57 gaat over wat de muzikant daar zélf van te zien krijgt. Let op de samenhang: op dit moment ziet de gebruiker de matchscore helemaal niet (zie 4.2), dus TT-57 zou die score voor het eerst zichtbaar maken.
- **TT-80** — afgehandeld, zie hoofdstuk 3.

**TT-51** (niveau per instrument, schaal 1-5) kan later meewegen in de matchscore, maar staat daar nu los van.

---

## 11. Geschiedenis: eerdere matching-architectuur

Vóór het huidige model gebruikte de app een **"matchcode-architectuur met bitmask-matching"** — genoemd in `actielijst.md` onder "Vóór 05-08-2026". Bij bitmask-matching wordt elk instrument of genre een bit in een getal, waarna vergelijken met snelle bit-bewerkingen gebeurt.

**Geverifieerd:** de term "bitmask" komt nergens meer voor in de huidige `index.html`. Vervangen architectuur, puur geschiedenis.

---

## 12. Wat dit document niet dekt

- **TT-62** (nooit nul zoekresultaten) — cluster "D. Werving en groei", verandert straks het gedrag bij een lege straal.
- **TT-28** (filtering/paginering naar de database) — verplaatst waar het filterwerk gebeurt, verandert het model niet.
- **TT-51, TT-56, TT-57** — zie hoofdstuk 10.

---

## 13. Open beslissingen voor TT-55 — status na het besluit van 12-08-2026

**Overbodig geworden door de keuze voor de harde filter (5.12, 12-08-2026):**

Punt 1 hieronder ("hoe wordt 'welk instrument zoek je' op een profiel vastgelegd?") was dé openstaande vraag zolang `2m + j` de richting was. **Die vraag is niet beantwoord — hij is vervallen.** Er komt geen nieuw profielveld voor "wat zoek je in een ander". Het bestaande, live instrumentfilter op de zoekpagina (nu beperkt tot 1 instrument + optioneel Zang) vervult die rol al, zonder opslag. Punten 2 t/m 5 hieronder (allemaal onderdeel van de `2m + j`-formule zelf) zijn met de formule mee vervallen — ze zijn niet "opgelost", ze zijn niet meer van toepassing.

<details>
<summary>Oorspronkelijke tekst (10-08-2026), bewaard als naslag over de <code>2m + j</code>-afweging</summary>

**Nog open — één punt:**

1. **Hoe wordt "welk instrument zoek je" op een profiel vastgelegd?** Eén instrument of meerdere? Met voorkeur of volgorde? Voor de formule is een simpele lijst voldoende — volgorde en voorkeur worden niet gebruikt. De vraag is dus vooral hoe het invoerscherm eruitziet, niet wat de berekening nodig heeft. Nergens beschreven in `actielijst.md`.

**Opgelost door de keuze voor `2m + j` (10-08-2026):**

2. ~~Weging tussen genre en instrument~~ — structureel beantwoord. Instrument bepaalt de rangorde, genre schikt daarbinnen. Geen weegfactor nodig.
3. ~~Correctie voor "zoekt alles"~~ — wiskundig begrensd. Elke richting is afgetopt op 1, dus tien instrumenten opgeven levert niets extra's op. Zie 5.5.
4. ~~Eenzijdige of wederkerige score bij bandzoeken~~ — dezelfde formule werkt voor beide. Een muzikant zonder zoeklijst komt bij een passende band op m=1 in plaats van m=2. Dat is een lagere plaats, geen uitsluiting. Geen apart geval nodig.

**Bewuste beperking, vastgelegd:**

5. **Aantallen bij `band_wanted`.** De tabel bevat alleen instrumenten, geen aantallen. Een band die twee gitaristen zoekt, staat in de data gelijk aan een band die er één zoekt. Voor de matching maakt dat niets uit — aanwezigheid in de lijst is genoeg (zie 5.7). Vastgelegd als bekende beperking, geen actiepunt.

**Verplichte controle bij de bouw:** j = 0 bij twee lege genrelijsten. Zie 5.6. Dit is geen beslissing maar een regel die anders een deling door nul geeft.

Het lezen van de databasefunctie `tt_search_musicians` blokkeert niets. Het genre-deel blijft ongewijzigd.

</details>

**Nog wél open, ook ná 12-08-2026:**

- **TT-56** (statusknop "sta je open voor iets nieuws?") — zie 5.12, punt 4. Losstaand ticket, vorm nog niet bepaald.
- ~~Band-zoekpagina: het "instrument gezocht"-filter (`filterBandWanted`) nog niet beperkt tot 1 instrument~~ — **afgerond, zelfde dag.** Zie 5.12.

---

## 14. Bronnen

**Projectbestanden**, gelezen 10-08-2026:
- `index.html` — `runSearch`, `runBandSearch`, `runSetlistSearch`, `sortMusicianList`, `sortBandList`, alle voorkomens van `matchScore` en `score`.
- `actielijst.md` — TT-55, cluster "B. Het matchen laten kloppen", TT-80, TT-51, historische vermelding bitmask-matching.

**Vakliteratuur** (voor de techniek uit hoofdstuk 5):
- Pizzato, L., Rej, T., Chung, T., Koprinska, I., Kay, J. (2010). *RECON: a reciprocal recommender for online dating.* RecSys '10, ACM. — Het fundamentele artikel over wederkerige aanbeveling; introduceert het harmonisch gemiddelde voor het samenvoegen van twee eenrichtingsvoorkeuren.
- Pizzato, L. e.a. (2013). *Recommending people to people: the nature of reciprocal recommenders with a case study in online dating.* User Modeling and User-Adapted Interaction, 23(5), 447–488. — Uitgebreide vervolgstudie.

**Niet ingezien:** de definitie van de databasefunctie `tt_search_musicians`. Op te halen met `select pg_get_functiondef('tt_search_musicians'::regproc);` in de Supabase SQL Editor, mocht de exacte genre-formule ooit vastgelegd moeten worden. **Voor de op 12-08-2026 gebouwde richting (5.12) was dit niet nodig** — die verandert alleen client-side filter-UI en sortering, niet de databasefunctie.

**Vervolg 12-08-2026:** Ronald koos, ná deze eerdere analyse opnieuw te hebben doorgenomen, voor de eenvoudiger richting uit 5.12 (harde filter, geen formule) i.p.v. `2m + j`. Gebouwd en getest met Playwright dezelfde dag. Zie `actielijst.md`, Deel 3, voor het volledige logboek van deze beslissing.

---

## 15. Repertoire-zoekbron: van MusicBrainz naar iTunes (TT-139)

**Apart onderwerp, zelfde document.** Hoofdstuk 1 t/m 14 gaan over de matchscore (welke muzikant/band bovenaan staat). Dit hoofdstuk gaat over iets anders: welke externe bron een muzikant gebruikt om een nummer aan zijn repertoire toe te voegen (`addSong()`, stap 2 van de repertoire-invoer). Het staat hier omdat het ook een vorm van zoeken is, niet omdat het de matchscore raakt. **Sinds 24-08-2026 gebouwd — zie 15.7 voor de technische uitwerking.**

### 15.1 Status

**Geverifieerd** (`index.html`, bijgewerkt 24-08-2026): de app gebruikt nu **iTunes**, sinds TT-139 is gebouwd. Tot 24-08-2026 gebruikte de app MusicBrainz — bekend probleem, gemeten op 18-08-2026 (zie `actielijst.md`, Deel 3): 9 van 30 zoekopdrachten faalden (`503`), en 5 van 10 realistische zoektermen misten het bekende, gezochte nummer. iTunes faalde op dezelfde test nul keer en trof het gezochte nummer bij 8 van 10 termen. De rest van dit hoofdstuk (15.2 t/m 15.6) beschrijft het onderzoek dat aan die keuze voorafging; 15.7 beschrijft de daadwerkelijke bouw.

### 15.2 Spotify — Ronalds voorkeur, grondig onderzocht op 18-08-2026 en 24-08-2026

**Obstakel 1 — de geheime sleutel (`client_secret`).** **Geverifieerd**, rechtstreeks uit Spotify's eigen documentatie: het ophalen van een toegangstoken (Client Credentials, de enige methode zonder bezoekersinlog) vereist een `Authorization: Basic <base64 client_id:client_secret>`-header. Spotify's eigen richtlijn voor AI-assistenten: *"Never expose the Client Secret in client-side code."* `index.html` is client-side, zonder server — de sleutel kan daar niet in staan.

**Obstakel 2 — verplicht Premium-account, geldt voor Ronalds eigen account.** **Geverifieerd, drie onafhankelijke bronnen, opnieuw gecontroleerd op 24-08-2026 nadat Ronald aangaf dit niet nodig te achten:**
- Spotify's Quota modes-pagina, zonder uitzondering voor Client Credentials: *"The app owner must have a Spotify Premium account for apps in development mode to function."*
- Een melding op Spotify's eigen forum (juni 2026): een ontwikkelaar met een app zónder OAuth, zónder Web Playback SDK, **alleen** Client Credentials op `/search`, kreeg alsnog "Active premium subscription required".
- Een onafhankelijke technische blog (juni 2026) bevestigt hetzelfde: het account waarmee de app is geregistreerd moet Premium hebben — niet de bezoekers van de app.

**Concreet voor The Talent Tent:** dit raakt Ronalds eigen Spotify-account, niet de dertienjarige bezoekers van de app. Zolang dat account Premium blijft, werkt zoeken voor iedereen. Stopt Ronald met Premium, dan stopt zoeken voor alle gebruikers tegelijk — een productieafhankelijkheid van een persoonlijk abonnement die met MusicBrainz of iTunes niet bestaat.

**Obstakel 3 — permanente opslag van Spotify-gegevens.** **Geverifieerd**, Spotify Developer Terms, sectie over opslag: *"you may not store, aggregate or create compilations or databases of Spotify Content, other than as strictly necessary to operate your SDA"* en *"Do not store Spotify Content indefinitely."* Dit raakt `musician_songs` rechtstreeks — geen cache, maar permanente opslag van titel en artiest als onderdeel van het repertoire-profiel. **Besluit Ronald (24-08-2026): geen issue, risico geaccepteerd.**

**Geen obstakel, eerder gecorrigeerd (18-08-2026):** het 5-gebruikerslimiet van Development Mode geldt alleen voor de inlogroute (een bezoeker die zelf bij Spotify inlogt). Puur catalogus-zoeken via Client Credentials heeft geen bezoekersinlog en valt hier dus buiten. **Bevestigd, geen issue** (Ronald, 24-08-2026).

**Onderzocht en afgewezen (24-08-2026): een eigen download van de Spotify-catalogus, als manier om obstakel 1 en 3 te omzeilen.** Niet mogelijk, om twee redenen:
1. Spotify biedt dit zelf niet aan. Een Spotify-medewerker op het eigen forum: *"The Web API does not provide full datasets in bulk, for licensing reasons."* Alleen los, nummer voor nummer, via de normale API.
2. De Developer Terms verbieden het zelf opbouwen van zo'n database, zie obstakel 3 hierboven — een eigen kopie van de catalogus ís precies zo'n database.

De enige bestaande bulk-kopieën van Spotify's catalogus zijn illegale scrapes door derden (een torrent-archief, eind 2025) — geen bruikbare of legale optie voor The Talent Tent.

### 15.3 De enige technische weg naar Spotify: een Edge Function

Obstakel 1 (de sleutel) is alleen op te lossen met een server die de sleutel vasthoudt en als tussenstation optreedt tussen `index.html` en Spotify. Voorstel: een Supabase Edge Function, bijvoorbeeld `spotify-search`.

Werking, op hoofdlijnen:
1. De sleutel staat als geheim in Supabase (Edge Function Secrets), niet in code.
2. De functie haalt zelf een toegangstoken op bij Spotify en zoekt door naar `/search`.
3. De functie geeft alleen het zoekresultaat terug aan `index.html` — de sleutel verlaat Supabase nooit.

**Sinds een update van Supabase is dit te bouwen via de Dashboard-editor zelf** — geen CLI, geen Docker, geen lokale ontwikkelomgeving. Past bij Ronalds bestaande werkwijze (SQL Editor, GitHub-webinterface).

**Dit doorbreekt een vastgelegde architectuurregel:** *"Supabase backend client-side only, no server, no Edge Functions."* Wordt Spotify de keuze, dan wordt die regel een uitzondering: één Edge Function, uitsluitend voor de Spotify-sleutel, verder blijft alles client-side zoals nu.

### 15.4 Ronalds bezwaar tegen de Premium-kosten (24-08-2026, vervolg)

Ronald: een maandelijks bedrag betalen voor iets dat de app nauwelijks gebruikt, voelt in deze fase overdreven. Begrijpelijk en terecht — dit is geen technisch obstakel dat op te lossen is, maar een vaste maandelijkse kostenpost die rechtstreeks uit Spotify's eigen regels volgt (zie 15.2, obstakel 2). Er is geen constructie die dit omzeilt: het gaat om Ronalds eigen account, niet om de architectuur van de app.

### 15.5 Kan iTunes wél gedownload worden? (Ronalds vraag, 24-08-2026)

Twee aparte vragen, want "downloaden" kan twee dingen betekenen bij iTunes:

**Vraag A — mag een zoekresultaat (titel, artiest) bewaard worden nadat het is opgehaald?** **Geverifieerd, en het antwoord is hier het tegenovergestelde van Spotify.** Apple's eigen documentatie bij de Search API: *"Large websites should set up caching logic for the search and lookup requests sent to the Search API."* Apple **beveelt bewaren aan**, in plaats van het te verbieden. Er staat geen equivalent van Spotify's *"do not store indefinitely"*. De beperking die Apple wél heeft (geen downloaden/opslaan van audiofragmenten en albumhoezen bij promotioneel gebruik) raakt titel en artiest niet — dat is gewone tekst, geen "Promo Content".

**Concreet voor The Talent Tent:** wat er nu al gebeurt met MusicBrainz-resultaten in `musician_songs` (titel/artiest permanent bewaren) mag bij iTunes ook, zonder enig voorbehoud. Geen geaccepteerd risico nodig zoals bij Spotify — het is gewoon toegestaan.

**Vraag B — kan de hele iTunes-catalogus in één keer gedownload worden (een eigen kopie, i.p.v. per zoekopdracht live ophalen)?** Zo'n bulk-feed bestaat, heette **Enterprise Partner Feed (EPF)**, maar **Geverifieerd, rechtstreeks van Apple's eigen partnerpagina: muziekgegevens zijn hier sinds enige tijd uit verwijderd** — *"Apple Music and iTunes Music data is not available from the Enterprise Partner Feed (EPF)."* De opvolger voor muziek, **Apple Music Feed**, vereist een betaald Apple Developer Program-account (\$99/jaar) én de licentie ervan staat gebruik alleen toe *"for the sole purpose of generating links to Apple Services"* — bedoeld om mensen naar een aankoop in de iTunes Store te leiden, niet voor een repertoire-zoekfunctie die niets verkoopt. **Geen goede match, los van de kosten.**

**Conclusie: geen bulk-download nodig én geen bruikbare beschikbaar.** Vraag A is het enige dat voor The Talent Tent telt, en die mag gewoon. De bestaande manier van werken (live opvragen per zoekopdracht, resultaat bewaren) is precies wat Apple aanraadt — geen aparte downloadstap, geen aparte kostenpost, geen architectuurwijziging.

### 15.6 Vergelijking van de drie bronnen, bijgewerkt

| | MusicBrainz (huidig) | iTunes | Spotify |
|---|---|---|---|
| Sleutel/server nodig | Nee | Nee | **Ja — enige met een verplichte serverkant** |
| Maandelijkse kostenpost | Nee | Nee | **Ja — Ronalds eigen Premium-abonnement** |
| Opslag van titel/artiest toegestaan | Ja (praktijk, geen expliciete regel) | **Ja — expliciet aanbevolen door Apple** | Ja, maar **niet oneindig** — geaccepteerd risico |
| Bulk-download van de catalogus | Onbekend, niet onderzocht | **Bestaat niet meer voor muziek (EPF), vervanger niet geschikt** | **Bestaat niet, expliciet verboden** |
| Storingspercentage (meting 18-08-2026) | 30% (`503`) | 0% | Niet gemeten — vereist eerst de Edge Function |
| Trefzekerheid (meting 18-08-2026) | 5 van 10 termen gemist | 8 van 10 termen getroffen | Niet gemeten |

### 15.7 Besluit en bouw (24-08-2026)

**Besluit Ronald:** iTunes. Spotify vereist een server (Edge Function) én een blijvende maandelijkse kostenpost (Ronalds Premium-abonnement) voor een functie die beperkt wordt gebruikt — in deze fase niet passend. iTunes heeft geen van beide nodig. **Spotify is hiermee niet definitief van tafel** — mocht de afweging later anders uitvallen (bijv. bij groei), dan staat 15.2 t/m 15.6 klaar als naslag.

**Wat er precies is gebouwd**, op twee plekken in `index.html` — het profiel-repertoire (`addSong()`) en Setlist-zoeken (`addSetlistSong()`), beide delen dezelfde functies:

- **Stap A, artiest zoeken:** `GET https://itunes.apple.com/search?term=<q>&entity=musicArtist&limit=7`. Vervangt MusicBrainz' `/ws/2/artist/?query=artist:<q>`.
- **Stap B, nummer zoeken binnen die artiest — herzien, niet één-op-één overgenomen.** MusicBrainz deed per toetsaanslag een nieuw verzoek met een titelfilter (`arid:<id> AND recording:<q>`). iTunes' `/lookup`-eindpunt ondersteunt zo'n combinatie van artiest-ID + titelfilter niet. In plaats daarvan: **één keer per artiest** de volledige nummerlijst ophalen (`GET https://itunes.apple.com/lookup?id=<artistId>&entity=song&limit=200`), in een cache bewaren (`itunesTrackCache`, sleutel = artiestId), en daarna bij elke toetsaanslag lokaal filteren op titel. Dit is de artiest-ID-isolatie-architectuur uit het oorspronkelijke TT-109-onderzoek, maar dan met de tweede stap ook nog eens gecachet in plaats van herhaald opgevraagd.
- **Waarom dit beter is dan een letterlijke vertaling van de oude aanpak:** minder netwerkverkeer (één verzoek per artiest in plaats van één per toetsaanslag), sluit aan bij Apple's eigen cachingaanbeveling (zie 15.5), en houdt het verzoekvolume ruim onder de snelheidslimiet van ~20/minuut.
- **Racebeveiliging:** de cache bewaart ook een lopende `Promise`, zodat twee snelle toetsaanslagen vlak na het kiezen van een artiest niet allebei een eigen verzoek starten.

**Bewust niet gebouwd in deze stap:** de "één zichtbaar zoekveld"-UX uit het oorspronkelijke TT-109-voorstel. De twee losse velden (artiest, dan nummer) blijven zoals ze waren — alleen de bron erachter is vervangen. Zie TT-109 in `actielijst.md` voor de status van die aparte wijziging.

**Getest:** JS-syntaxcontrole (`node --check`) en haakjesbalans, geen fouten. **Niet getest tegen de echte iTunes API** — geen netwerktoegang tot `itunes.apple.com` in de ontwikkelomgeving. Zie `actielijst.md`, Deel 3 (24-08-2026), voor de smoke-testpunten die Ronald zelf op de live site moet nalopen.

**Bestand:** `index.html`, 10544 regels. **SHA-256:** `2fa3ab171a41885019cb26192935034a2637aa8c87c2b6d43a9fff0b61f503e5`.

### 15.8 Bronnen (gelezen 24-08-2026)

- developer.spotify.com — Building with AI, Client Credentials Flow, Quota modes, February 2026 Migration Guide, Developer Terms
- community.spotify.com — meldingen over Premium-eis bij pure Client Credentials-apps, en over het ontbreken van bulk-datasets
- performance-partners.apple.com — Search API-documentatie (cachingregel), Enterprise Partner Feed (muziekgegevens verwijderd, licentiebeperking)
- developer.apple.com — Apple Music Feed (vervanger van EPF voor muziek), Apple Developer Program-kosten
- Twee onafhankelijke technische blogs (juni/juli 2026) over de Development Mode-wijzigingen van 2026
