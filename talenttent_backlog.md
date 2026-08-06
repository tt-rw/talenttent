# The Talent Tent — UX-audit backlog

**Versie:** 1.0 · 5 augustus 2026
**Basis:** audit van `index.html` (4891 regels, single-page HTML/JS + Supabase)
**Doel van dit document:** per bevinding één ticket met probleem, exacte locatie in de code, de concrete wijziging en een acceptatiecriterium. Bedoeld om ticket voor ticket af te werken in een Claude Project-sessie.

## Hoe dit document te gebruiken

Werk **één ticket per sessie** af. Plak bij de start van een sessie:

1. Het huidige `index.html`
2. Dit document
3. De regel: *"Voer ticket TT-xx uit. Wijzig alleen wat het ticket beschrijft. Geef het volledige gewijzigde blok terug, niet het hele bestand."*

Regelnummers verwijzen naar de auditversie. Ze schuiven bij elke wijziging op — gebruik ze als zoekhulp, niet als absolute referentie. Zoek altijd op functienaam.

Werk de statuskolom hieronder bij zodra een ticket klaar is; dan blijft dit document de enige bron van waarheid tussen sessies door.

---

## Bevindingen buiten de oorspronkelijke 25 tickets (gevonden tijdens het afwerken, 05-08-2026)

Niet in de audit hierboven, maar tijdens deze sessie gevonden door Ronald en direct opgelost. Zie `TODO.md` ("UX-audit-sessie, deel 2") voor het volledige technische verhaal.

- **🔒 Beveiligingsbug:** een uitgelogde bezoeker kon via de "Verder bewerken →"-balk alsnog in de profiel-bewerkwizard komen mét de laatst bewerkte profielgegevens vooringevuld. Opgelost — status: **Opgelost (05-08-2026)**.
- **Bug:** de "stoppen met bewerken"-bevestiging toonde de knoptekst "Ja, verwijderen" (hergebruikt van de verwijder-modal, verkeerd in deze context). Opgelost — status: **Opgelost (05-08-2026)**.

## Overzicht

| ID | Ticket | Prioriteit | Omvang | Status |
|---|---|---|---|---|
| TT-01 | Berichten tussen muzikanten | P0 | Groot | Open |
| TT-02 | Profielfoto's en media echt opslaan | P0 | Middel | Open |
| TT-03 | Profielen achter login | P0 | Klein | Opgelost (05-08-2026) |
| TT-04 | Postcode niet publiek tonen | P0 | Klein | Opgelost (05-08-2026) |
| TT-05 | XSS dichten | P0 | Middel | Opgelost (05-08-2026) |
| TT-06 | Rapporteren en blokkeren | P0 | Middel | Open |
| TT-07 | Ouderlijke toestemming onder 16 | P0 | Middel | Open |
| TT-08 | Link-invoerveld focusbug | P1 | Klein | Opgelost (05-08-2026) |
| TT-09 | Onboarding herordenen | P1 | Groot | Opgelost (05-08-2026) |
| TT-10 | Zoeken opent met resultaten | P1 | Klein | Opgelost (05-08-2026) |
| TT-11 | "Ik wil meedoen" bij bands | P1 | Middel | Open |
| TT-12 | Belofte "volgen" uit Over ons | P1 | Triviaal | Opgelost (06-08-2026) |
| TT-13 | Terugkeerredenen (notificatie + bekeken) | P1 | Middel | Open |
| TT-14 | Accentkleuren splitsen | P2 | Klein | Opgelost (05-08-2026) |
| TT-15 | Typografie en logo op mobiel | P2 | Klein | Opgelost (06-08-2026) |
| TT-16 | Browsergeschiedenis / terugknop | P2 | Klein | Opgelost (06-08-2026) |
| TT-17 | Mobiele layoutfixes | P2 | Klein | Opgelost (05-08-2026) |
| TT-18 | Album-art bij repertoire | P2 | Middel | Open |
| TT-19 | Sorteeropties inperken | P2 | Triviaal | Opgelost (05-08-2026) |
| TT-20 | Geboortedatum: invoer en validatie | P2 | Klein | Opgelost (05-08-2026) |
| TT-21 | PDOK-terugval | P2 | Klein | Opgelost (06-08-2026) |
| TT-22 | Accountverwijdering | P2 | Klein | Open |
| TT-23 | Dode code opruimen | P2 | Triviaal | Opgelost (06-08-2026) |
| TT-24 | Beheersingsniveaus bij de knoppen | P2 | Triviaal | Opgelost (05-08-2026) |
| TT-25 | PWA-manifest | P3 | Klein | Opgelost (06-08-2026) |
| TT-26 | Zoektekst ongefilterd in Supabase-query | P2 | Klein | Opgelost (06-08-2026) |
| TT-27 | Wizard-tussenresultaten incrementeel opslaan | P2 | Middel | Open |
| TT-28 | Filtering/paginering echt naar de database verplaatsen | P2 | Groot | Open |

---

# P0 — Zonder deze tickets is de app niet af

## TT-01 · Berichten tussen muzikanten

**Probleem.** Er bestaat in de hele app geen manier om contact te leggen. `buildMusicianDetailHTML()` (r. 2755) eindigt bij het repertoire en de links; er is geen knop, geen formulier, geen e-mail. De kernfunctie van een matchingplatform ontbreekt.

**Database.** Nieuwe tabel:

```sql
create table public.messages (
  id            uuid primary key default gen_random_uuid(),
  sender_id     uuid not null references public.musicians(id) on delete cascade,
  recipient_id  uuid not null references public.musicians(id) on delete cascade,
  body          text not null check (char_length(body) between 1 and 2000),
  created_at    timestamptz not null default now(),
  read_at       timestamptz
);

create index on public.messages (recipient_id, created_at desc);
create index on public.messages (sender_id, created_at desc);

alter table public.messages enable row level security;

-- Lezen: alleen berichten waar je zelf zender of ontvanger van bent
create policy "eigen berichten lezen" on public.messages for select
  using (
    sender_id    in (select id from musicians where user_id = auth.uid())
    or recipient_id in (select id from musicians where user_id = auth.uid())
  );

-- Schrijven: alleen namens je eigen profiel
create policy "eigen berichten sturen" on public.messages for insert
  with check (sender_id in (select id from musicians where user_id = auth.uid()));

-- Markeren als gelezen
create policy "eigen berichten bijwerken" on public.messages for update
  using (recipient_id in (select id from musicians where user_id = auth.uid()));
```

**Frontend.**

1. In `buildMusicianDetailHTML(m)` een tweede parameter `isOwn` toevoegen. Als `!isOwn && hasOwnProfile`, onderaan een knop renderen:
   ```html
   <button class="btn btn-primary" style="width:100%;margin-top:20px;"
     onclick="openMessageComposer('${m.id}','${escAttr(m.fname)}')">Stuur een bericht →</button>
   ```
   Als `!hasOwnProfile`: knop met tekst *"Maak een profiel aan om contact te leggen"* die naar `showView('register')` gaat. Dat is meteen je sterkste registratieprikkel.

2. Nieuwe modal `#messageModal` naast de bestaande modals (bij r. 2208), met een `textarea` van max 2000 tekens en een verzendknop.

3. Nieuwe functies bij het blok "Muzikant detail modal":
   - `openMessageComposer(recipientId, recipientName)` — opent de modal
   - `sendMessage()` — insert in `messages`, sluit modal, `showToast('Bericht verstuurd')`
   - `loadInbox()` — haalt berichten op, gegroepeerd per gesprekspartner
   - `openConversation(otherId)` — toont de draad, markeert ongelezen als gelezen

4. Nieuwe view `#view-messages` en navigatieknop **Berichten** in `<nav class="app-nav">` (r. 1486), met een badge voor het aantal ongelezen. Toevoegen aan de `navMap` in `showView()` (r. 2379).

5. E-mailnotificatie via een Supabase Edge Function op een database-trigger bij insert in `messages`. Inhoud: *"Je hebt een bericht van [voornaam] op The Talent Tent"* plus een link naar de app — **nooit** de berichttekst of het e-mailadres van de zender in de mail.

**Acceptatie.** Ingelogde gebruiker met profiel kan vanuit een zoekresultaat een bericht sturen; de ontvanger ziet het onder Berichten met een ongelezen-badge en krijgt een e-mail. Zonder eigen profiel is de knop een registratieprikkel. E-mailadressen zijn nergens zichtbaar.

---

## TT-02 · Profielfoto's en media echt opslaan

**Probleem.** Twee losse fouten met hetzelfde gevolg: alles wat een gebruiker uploadt is stilzwijgend weg.

- `handleAvatarUpload()` (r. 3914) maakt een blob-URL met `URL.createObjectURL(file)` en zet die in `state.avatarUrl`. Die waarde wordt in `submitProfile()` (r. 3162 en 3208) als `avatar_url` in de database geschreven. Een blob-URL bestaat alleen in dat ene browsertabblad. Na een refresh is de foto weg; voor anderen was hij nooit zichtbaar.
- `handleFileSelect()` (r. 3948) vult `state.mediaFiles`, maar `submitProfile()` slaat uitsluitend `linkMedia` op (r. 3248). De bestanden worden nergens weggeschreven.

Extra pijnlijk: `renderCompletenessMeter()` (r. 2989) zet een vinkje bij "Profielfoto" op basis van die kapotte waarde, en de tekst bij het uploadveld belooft "3× meer reacties".

**Wijziging.**

1. Supabase Storage bucket `avatars` (publiek leesbaar) en `media` (publiek leesbaar), met een insert-policy die alleen het eigen `auth.uid()`-pad toestaat.

2. `handleAvatarUpload()` wordt async: bestand valideren (type, ≤5 MB), uploaden naar `avatars/{user_id}/{timestamp}.{ext}`, `getPublicUrl()` opvragen, die URL in `state.avatarUrl` zetten. Preview mag de blob-URL blijven gebruiken zolang de upload loopt, met een spinner. Bij een fout: `showToast()` en `state.avatarUrl` op `null` laten.

3. Complicatie: bij registratie bestaat het account nog niet, dus is er nog geen `auth.uid()` voor het pad en geen sessie voor de RLS-policy. Twee opties:
   - **Voorkeur:** uitvoeren ná TT-09, want dan bestaat het account al vanaf stap 1 en verdwijnt het probleem.
   - **Los daarvan:** de foto pas uploaden in `submitProfile()`, direct na `signInWithPassword()` (r. 3183) en vóór de insert in `musicians`.

4. Idem voor `handleFileSelect()`, en in `submitProfile()` een tweede insert in `musician_media` met `media_type: 'foto' | 'video'`.

5. `buildMusicianDetailHTML()` toont nu alleen `media_type === 'link'` (r. 2770). Uitbreiden met een fotoraster.

**Als dit niet meteen lukt:** verwijder de upload-tab (r. 1799–1815) en de avatar-upload uit stap 1, en houd alleen links over. Niets aanbieden is beter dan iets aanbieden dat stilzwijgend weggooit.

**Acceptatie.** Foto uploaden, uitloggen, in een andere browser het profiel openen: de foto is zichtbaar.

---

## TT-03 · Profielen achter login

**Probleem.** `configureSearchAccess()` (r. 2308) zet `hasOwnProfile = false` voor anonieme bezoekers en schakelt dan over op `tt_search_musicians_anon` en `tt_get_musicians_public`. Iedereen zonder account kan dus voornaam, leeftijd, foto, bio, woonplaats en postcode van minderjarigen doorbladeren. Zoeken zonder profiel toestaan was een goede keuze; het volledig anoniem zichtbaar maken van kinderprofielen is dat niet.

**Wijziging — voorkeursvariant (behoudt de conversieprikkel).** Splits "zoeken" van "profiel bekijken":

- Anonieme bezoeker mag zoeken en resultaten zien, maar `musicianRowHTML()` (r. 2724) toont dan alleen instrument, genre, plaats en afstand — **geen voornaam, geen foto**. Vervang beide door een silhouet en de tekst "Muzikant".
- `openMusicianModal()` (r. 2801) controleert `currentUser`. Zo niet: geen profielinhoud, maar een blok *"Log in om dit profiel te zien"* met een knop naar registratie.
- `tt_get_musicians_public` teruggeven aan alleen wat de rij nodig heeft, of intrekken.

**Alternatief (strenger, minder werk).** `requireLogin('search')` in plaats van `showView('search')` op de navigatieknop (r. 1489). Kost je wel de "kijken voordat je je aanmeldt"-drempelverlaging.

**Acceptatie.** Een uitgelogde bezoeker in een privévenster kan geen enkele voornaam of foto van een muzikant zien.

**✅ Opgelost 05-08-2026** (voorkeursvariant gebouwd, in overleg met Ronald). `musicianRowHTML()` en `musicianSetlistRowHTML()` tonen zonder login "Muzikant" + lege placeholder i.p.v. naam/foto. `openMusicianModal()` toont zonder login geen profielinhoud, alleen "Wil je zien wie dit is?" met knoppen naar registreren én inloggen. **Nog open:** `tt_get_musicians_public` geeft `fname`/`avatar_url` server-side nog steeds terug aan `anon` — SQL-aanpassing vereist, niet uitgevoerd vanuit deze sessie.

---

## TT-04 · Postcode niet publiek tonen

**Probleem.** `buildMusicianDetailHTML()` (r. 2776) toont `${age} jaar · ${m.city} · ${m.zip}`. De viercijferige postcode van een minderjarige publiek tonen voegt niets toe boven plaats plus afstand, en versmalt de locatie tot een paar straten.

**Wijziging.** Verwijder het `zip`-deel uit die regel. Toon in plaats daarvan de afstand als die bekend is:

```js
<div class="profile-meta">${age} jaar · ${m.city}${m.distance_km != null ? ` · ${m.distance_km.toFixed(1)} km` : ''}</div>
```

De postcode blijft in de database staan voor de afstandsberekening; hij hoort alleen niet in de UI. Controleer ook `tt_get_musicians_public` en `tt_get_bands_public`: die geven `zip` mee. Verwijder dat veld uit de RPC-output.

**Acceptatie.** Nergens in de app is de postcode van een andere gebruiker zichtbaar; de eigen postcode blijft alleen zichtbaar in het bewerkformulier.

**✅ Opgelost 05-08-2026.** Toont nu afstand i.p.v. postcode (nieuwe `musicianDistanceCache`). Postcode niet meer opgevraagd bij het bekijken van andermans profiel. **Nog open:** `tt_get_musicians_public`/`tt_get_bands_public` geven `zip` server-side nog steeds terug aan `anon` — SQL-aanpassing vereist, niet uitgevoerd vanuit deze sessie.

---

## TT-05 · XSS dichten

**Probleem.** Gebruikersinvoer gaat onbewerkt in `innerHTML`. Concreet kwetsbaar:

| Veld | Locatie |
|---|---|
| `m.bio` | `buildMusicianDetailHTML()` r. 2786 |
| `s.song_title`, `s.song_artist` | r. 2766 en `renderSongs()` r. 3819–3820 |
| `m.fname` | r. 2775, `musicianRowHTML()` r. 2738 |
| `b.name`, `b.description` | `openBandModal()` r. 4839, 4842 |
| `l.url` | r. 2796 en `renderLinksList()` r. 3996 |

`esc()` (r. 3781) escapet alleen apostroffen en is bedoeld voor `onclick`-attributen — geen HTML-escaping.

**Wijziging.**

1. Voeg toe naast `esc()`:
   ```js
   function escHtml(s) {
     return String(s ?? '').replace(/[&<>"']/g, c => (
       { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
     ));
   }
   ```
2. Wikkel **elke** interpolatie van gebruikersdata in `escHtml()`. Doorloop alle template literals die naar `innerHTML` gaan.
3. Hernoem `esc()` naar `escAttr()` zodat het verschil in gebruik zichtbaar is.
4. Voor `l.url`: valideer dat de URL met `https://` of `http://` begint vóór hij in een `href` belandt — `javascript:`-URL's zijn hier het risico.

**Acceptatie.** Een bio met de inhoud `<img src=x onerror=alert(1)>` verschijnt als letterlijke tekst op het profiel, en er draait geen script.

**✅ Opgelost 05-08-2026.** Vijf helpers toegevoegd: `escHtml()` (tekst tussen tags), `escAttr()` (hernoemd van `esc()`, nu ook backslashes/regeleindes), `jsAttr()` (tekst in een JS-aanroep ín een attribuut), `safeUrl()` (alleen http/https/blob toegestaan in href/src) en `safeColor()` (kleurwaarde uit de database gevalideerd vóór gebruik in een style-attribuut). Toegepast op 17 plekken — de 5 uit dit ticket plus 12 extra die hetzelfde lek hadden: `musicianRowHTML`, `buildMusicianDetailHTML`, `musicianSetlistRowHTML`, `bandRowHTML`, `openBandModal`, `loadMyBands`, `renderSongs`, `renderSetlistSongsList`, `renderArtistResults`, `renderTrackResults`, `renderCitySuggestions`, `renderLinksList`, `renderMediaGrid`, `searchMembersToAdd`, `renderCompletenessMeter`, en de twee avatar-previews. Media-links met een `javascript:`-URL worden nu weggelaten i.p.v. als lege link getoond; externe links krijgen `rel="noopener noreferrer"`. `mastery_level`/`band.status` (belanden in een class-attribuut) zijn nu ook tegen bekende waarden gevalideerd.

---

## TT-06 · Rapporteren en blokkeren

**Probleem.** Er is geen enkele manier om ongewenst gedrag te melden of iemand te blokkeren. Zodra TT-01 live gaat is dat geen tekortkoming meer maar een risico.

**Wijziging.**

```sql
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.musicians(id) on delete cascade,
  reported_id  uuid not null references public.musicians(id) on delete cascade,
  reason       text not null,
  details      text,
  created_at   timestamptz not null default now(),
  handled_at   timestamptz
);

create table public.blocks (
  blocker_id  uuid not null references public.musicians(id) on delete cascade,
  blocked_id  uuid not null references public.musicians(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);
```

- Knopje "Melden" in de muzikant-modal, met een korte redenkeuze (ongepast gedrag, nepprofiel, spam, anders).
- "Blokkeren" in dezelfde modal: geblokkeerde gebruikers filteren uit `runSearch()`, `runBandSearch()`, `runSetlistSearch()` en uit berichten (beide richtingen).
- Een melding stuurt een e-mail naar de beheerder.

**Acceptatie.** Vanaf elk profiel is melden en blokkeren mogelijk; een geblokkeerde gebruiker verschijnt niet meer in zoekresultaten en kan geen berichten meer sturen.

---

## TT-07 · Ouderlijke toestemming onder 16

**Probleem.** De app richt zich op 13–25 jaar. In Nederland ligt de leeftijdsgrens voor digitale toestemming op 16 jaar; onder die leeftijd is toestemming van een ouder nodig, en de aanbieder moet controleren én vastleggen dat die toestemming daadwerkelijk gegeven is. Nu wordt de geboortedatum wel gevraagd maar niet gebruikt.

**Wijziging.**

1. In `nextStep(0)` (r. 3854), na de datumvalidatie: leeftijd berekenen met `calcAge()`. Bij < 16 een extra veld tonen: **E-mailadres van je ouder of verzorger** (verplicht).
2. Kolom toevoegen aan `musicians`: `guardian_email text`, `guardian_consent_at timestamptz`, `visible boolean default true`.
3. Bij registratie onder de 16: `visible = false`, en een bevestigingsmail naar het ouderadres met een unieke link. Pas na het klikken van die link `guardian_consent_at` vullen en `visible = true` zetten.
4. Alle zoek-RPC's filteren op `visible = true`.
5. De gebruiker ziet ondertussen op Mijn Profiel: *"Je profiel is nog niet zichtbaar. We hebben een mail gestuurd naar [adres] — vraag je ouder om die te bevestigen."* Met een knop "Mail opnieuw sturen".
6. Voeg een privacyverklaring en gebruiksvoorwaarden toe, in taal die een 13-jarige begrijpt, bereikbaar vanaf de registratiepagina en de footer.

**Acceptatie.** Een profiel van een 14-jarige is pas vindbaar nadat via de mail op het ouderadres is bevestigd; dat moment is vastgelegd in de database.

---

# P1 — Bepalen of mensen terugkomen

## TT-08 · Link-invoerveld focusbug

**Probleem.** In `renderLinksList()` (r. 3996) staat:

```html
oninput="state.mediaLinks[${i}].url=this.value; renderLinksList()"
```

`renderLinksList()` herbouwt de volledige `innerHTML`, dus het `<input>` waarin je typt wordt vervangen. Focus en cursor zijn na elke toetsaanslag weg. In de praktijk kun je hier geen URL typen. Dit is vrijwel zeker de reden dat er nauwelijks media-links in de database staan.

**Wijziging.** Alleen de state bijwerken, niet opnieuw renderen. De badge kan direct worden bijgewerkt zonder DOM-vervanging:

```html
oninput="state.mediaLinks[${i}].url=this.value;
         this.previousElementSibling.textContent=detectPlatform(this.value)"
```

De `onblur="renderLinksList()"` kan weg, of blijft staan voor opschoning bij verlaten. Controleer daarna of `removeLink()` nog correct rendert.

**Acceptatie.** Een volledige YouTube-URL is in één keer intypbaar; de platformbadge werkt tijdens het typen bij.

**✅ Opgelost 05-08-2026.** Nieuwe functie `updateLinkUrl()` toegevoegd; `oninput` roept die aan i.p.v. `renderLinksList()`. `onblur="renderLinksList()"` verwijderd.

---

## TT-09 · Onboarding herordenen

**Probleem.** Vijf verplichte stappen voordat er iets bestaat. Het account wordt pas aangemaakt in `submitProfile()` (r. 3175), dus een refresh op stap 4 wist alles. Verplicht zijn onder meer achternaam (wordt nergens getoond), een postcode die volledig van PDOK afhangt, én minimaal één nummer mét beheersingsniveau (`nextStep`, r. 3883–3886). Voor een beginnende 13-jarige is dat laatste de zwaarste drempel die je kunt bedenken.

**Wijziging.**

1. **Account eerder.** Splits `submitProfile()`. Nieuwe functie `createAccountAndProfile()` die aan het eind van stap 1 draait: `signUp` + `signInWithPassword` + een minimale insert in `musicians` (voornaam, geboortedatum, postcode, plaats). Stappen 2 t/m 5 worden `update`-acties op dat bestaande record. Dit lost meteen het RLS-probleem in TT-02 op.

2. **Repertoire optioneel.** In `nextStep(2)` (r. 3883) de blokkade weghalen. Het repertoire verhuist naar "profiel aanvullen". Alleen wie een nummer toevoegt, moet er een niveau bij kiezen.

3. **Achternaam optioneel** of schrappen: `nextStep(0)` r. 3861, het label op r. 1588, en `lname` in de inserts.

4. **Stappenbalk herschrijven.** Van "Stap 1 van 5" naar twee fasen:
   - *Aanmelden* (verplicht): naam, geboortedatum, postcode, e-mail, wachtwoord → account bestaat
   - *Profiel aanvullen* (vrij): instrument, genre, repertoire, doel, media

   Na het aanmaken direct naar Mijn Profiel met de volledigheidsmeter zichtbaar en de tekst *"Je bent binnen. Vul je profiel aan om gevonden te worden."*

5. **Instrument als eerste aanvulling.** Zonder instrument werkt de matching niet, dus zet die stap direct na het account, met een enkele klik af te ronden.

6. **Concept bewaren.** Zolang stap 1 nog loopt: `state` wegschrijven naar `sessionStorage` bij elke `goTo()`, en herstellen bij `init()`. Nooit het wachtwoord opslaan.

**Acceptatie.** Van landingspagina tot bestaand, doorzoekbaar account in onder de 60 seconden en één scherm. Een refresh halverwege kost geen ingevulde gegevens.

**✅ Opgelost 05-08-2026**, met een aantal bewuste aanpassingen op het oorspronkelijke ticket na overleg met Ronald:

- **Account eerder aanmaken:** nieuwe functie `createAccountAndProfile()`, draait aan het eind van stap 1 (Aanmelden). Maakt account + minimaal profiel aan (naam, geboortedatum, postcode, plaats). Vanaf dat moment wordt de rest van de wizard een `UPDATE` op dit bestaande profiel i.p.v. een nieuwe `INSERT` (bestaande edit-logica in `submitProfile()` hergebruikt, geen nieuw mechanisme nodig).
- **"Lege profielen" bewust uitgesloten (nieuw t.o.v. het ticket, op verzoek van Ronald):** nieuwe kolom `profile_complete` (zie `profile_complete_setup.sql`). Staat op `false` zodra het account/minimaal profiel ontstaat, en wordt **alleen** op `true` gezet bij een geslaagde klik op de allerlaatste knop "Profiel aanmaken". Vijf zoekfuncties tonen alleen nog profielen met `profile_complete = true` — wie de wizard niet afmaakt (tabblad sluit, stopt via "Annuleren"), blijft voor altijd onzichtbaar voor anderen, ongeacht wat er al is ingevuld. Geen backfill uitgevoerd voor bestaande profielen (in overleg met Ronald — dit waren testprofielen).
- **Geen tussenstop (afwijking t.o.v. het ticket):** het ticket stelde voor om na stap 1 direct naar Mijn Profiel te gaan met de tekst "Je bent binnen, vul je profiel aan". Op advies van Claude en in overleg met Ronald is hiervan afgeweken: de wizard loopt nu **door tot en met de laatste stap**, zonder tussenstop — het risico dat iemand na een korte onderbreking niet meer terugkomt (en dus met een leeg profiel achterblijft) woog zwaarder dan het aanbieden van een vroeg succesmoment. In plaats daarvan verschijnt alleen een korte toast ("Account aangemaakt! Vul nu je profiel verder aan.") en gaat de gebruiker automatisch door naar stap 2.
- **Refresh halverwege (Route B, ipv het voorgestelde "concept bewaren in stap 1"):** een refresh tijdens stap 2 t/m 5 herstelt automatisch dezelfde stap met alle al ingevulde keuzes (instrument, genre, nummers, doel, links) — bewaard in `sessionStorage` (nooit het wachtwoord), hersteld bij een nieuwe login via `tryResumeOnboarding()`. Geldt alleen binnen hetzelfde tabblad/dezelfde sessie; sluit iemand het tabblad zelf, dan is dat een bewuste onderbreking (blijft `profile_complete = false`, geen dataverlies-risico want er stond toch nog niets definitiefs vast). **Bewust niet gebouwd (nu TT-27 in de backlog):** de tussentijdse keuzes zelf (instrument/genre/nummers) incrementeel naar de database wegschrijven per stap — dat zou ook een tabblad-sluiting overleven, maar is aanzienlijk meer werk en apart gehouden.
- **Achternaam blijft verplicht** (in overleg met Ronald, geen wijziging t.o.v. bestaand gedrag) — nog steeds nergens getoond aan andere gebruikers, dus lost het "5 keer Ruud uit Delft"-onderscheidingsprobleem niet op. Dat blijft een open vraag voor een latere sessie als het probleem zich in de praktijk voordoet.
- **Instrument als eerste aanvulling:** ongewijzigd, stond al direct na de accountstap.
- **Stappenbalk:** "Stap X van 5" vervangen door twee fasen — "Fase 1 van 2 · Aanmelden" (stap 1) en "Fase 2 van 2 · Profiel aanvullen (1/4 t/m 4/4)" (stappen 2-5).
- **Repertoire optioneel:** blokkade in stap 3 weggehaald (was: minimaal 1 nummer verplicht). Wie wél een nummer toevoegt, moet er nog steeds een niveau bij kiezen.
- **Nieuwe gedeelde functie `populateWizardFieldsFromState()`:** haalt de veld-invullogica uit `editMyProfile()` los, zodat zowel het bewerken van een bestaand profiel als het hervatten van een onderbroken onboarding dezelfde, geteste code gebruiken.
- **`profile_complete_setup.sql`** (nieuw bestand, door Ronald te draaien in de Supabase SQL Editor): voegt de kolom toe en past 5 zoekfuncties aan (`tt_get_musicians_public`, `tt_search_musicians`, `tt_search_musicians_anon`, `tt_search_musicians_for_band`, `tt_search_musicians_by_songlist_anon`). Bands ongewijzigd — die vereisen al postcode/genre/instrument bij aanmaken.

---

## TT-10 · Zoeken opent met resultaten

**Probleem.** `showView('search')` roept `configureSearchAccess()` aan (r. 2403), maar nooit `runSearch()`. De gebruiker ziet acht filtervelden, de kop "Resultaat", en niets. Terwijl de database vol staat met precies wat hij wil zien.

**Wijziging.**

1. Aan het eind van `configureSearchAccess()`: als er nog geen zoekopdracht is gedraaid in deze sessie, `runSearch()` uitvoeren met standaardwaarden (eigen postcode als vertrekpunt, 25 km, geen filters).
2. Filters standaard ingeklapt in een `<details>`-element met de samenvatting *"Filters ▾"*, dat opent zodra de gebruiker iets aanpast. Alleen het resultaat is meteen zichtbaar.
3. Bij nul resultaten binnen 25 km automatisch verbreden naar 50 km met de melding *"Niets binnen 25 km — dit is wat er binnen 50 km speelt."* Dat is beter dan de huidige lege staat.

**Acceptatie.** Eén klik op "Zoeken" levert een gevulde resultatenlijst op zonder verdere handelingen.

**✅ Opgelost 05-08-2026**, uitgebreider dan het oorspronkelijke ticket na overleg met Ronald — het idee werd doorontwikkeld naar volledig interactief zoeken in plaats van alleen een eerste vulling:

- **Elke wijziging ververst automatisch** — instrument/genre/doel (muzikant), genre/instrument-gezocht/status (band), en nummers toevoegen/verwijderen (setlist) verversen het resultaat direct bij een klik. Naam/plaats/leeftijd ververst met een korte vertraging (400 ms) na de laatste toetsaanslag, zodat niet bij elke letter een nieuwe zoekopdracht start. De aparte zoekknop blijft gewoon staan als expliciet alternatief.
- **Geen "Filters ▾" inklap-element gebouwd (afwijking t.o.v. het ticket)** — met automatisch verversen bij elke wijziging bleek een apart open/dicht-mechanisme voor de filters geen toegevoegde waarde te hebben; dat onderdeel van het ticket is komen te vervallen.
- **Geen automatische verbreding van 25 naar 50 km (afwijking t.o.v. het ticket)** — in plaats daarvan is bewust gekozen (zie hieronder, ontstaan uit een tussenvraag van Ronald over 100.000 profielen) voor een aantal-gebaseerde afkap (max. 50 resultaten tegelijk) i.p.v. een straal-gebaseerde. De reden: het probleem was niet "te weinig resultaten binnen een straal", maar "te veel resultaten zonder straal" — precies het omgekeerde risico.
- **⚠️ Belangrijke uitbreiding, ontstaan tijdens deze sessie: schaalbaarheid bij grote aantallen.** Ronald vroeg terecht wat er gebeurt bij 100.000 profielen. Antwoord: zonder ingrijpen zou de browser vastlopen en het dataverkeer enorm worden, vooral bij uitgelogd zoeken zonder plaats ingevuld (dan gold tot nu toe geen enkele begrenzing). Opgelost met een harde grens van **maximaal 50 getoonde resultaten tegelijk** (`SEARCH_RESULT_LIMIT`), op alle drie de zoektabbladen, met een duidelijke melding erboven zodra er meer zijn ("Toont de eerste 50 van 340 resultaten — voeg een filter toe..."). Dit lost het acute risico op (de browser krijgt nooit meer dan 50 rijen te renderen), maar **niet** het onderliggende dataverkeer — de eerste (ongefilterde) trefferlijst wordt nog steeds in zijn geheel bij Supabase opgehaald vóórdat er wordt afgekapt. Dat écht oplossen (de database zelf laten stoppen bij 50, i.p.v. alles ophalen en dan pas knippen) is een aparte, grotere ingreep — vastgelegd als nieuw ticket **TT-28**.
- **Plaats bewust niet verplicht gesteld bij uitgelogd zoeken (expliciete afweging met Ronald).** Zonder plaats blijven de eerste 50 resultaten in de praktijk willekeurig (de database filtert dan niet op afstand) — een aparte hint boven het resultaat maakt dat nu expliciet: *"Dit zijn 50 willekeurige muzikanten uit heel Nederland — vul een plaats in voor resultaten bij jou in de buurt."* Bewust géén harde blokkade, om de drempelvrije toegang (TT-03) niet terug te draaien.
- **Bij het openen van een zoektabblad (Muzikant/Band/Setlist) verschijnt meteen een resultaat** — met de filters die op dat moment al golden (leeg bij het allereerste bezoek). Setlist vormt bewust een uitzondering: zonder minstens 1 opgegeven nummer is er niets zinvols om te tonen, dus dat tabblad laat in dat geval de bestaande "voeg een nummer toe"-tekst staan i.p.v. een geforceerde "iedereen"-lijst.
- **Geen knipperende resultatenlijst meer bij automatisch verversen** — de laad-spinner verschijnt alleen nog bij een compleet lege resultatenlijst (de allereerste keer); bij een automatische verversing blijft de oude lijst gewoon staan tot de nieuwe binnen is, dan wisselt het in één keer.
- **"Filters wissen"** ververst nu ook automatisch (i.p.v. het resultaat leeg achter te laten na het wissen) — bij Setlist blijft dit wél leeg, want songs wissen betekent letterlijk "niets meer om op te matchen".

---

## TT-28 · Filtering/paginering echt naar de database verplaatsen

**Probleem.** Ontstaan uit een vraag van Ronald tijdens TT-10 ("wat gebeurt er bij 100.000 profielen?"). De huidige zoekfuncties (`runSearch()`/`runBandSearch()`/`runSetlistSearch()`) halen eerst *alle* treffers binnen de straal (of, zonder straal, alle profielen in Nederland) op bij Supabase, en filteren/knippen dan pas in de browser zelf op naam/instrument/genre/leeftijd en het aantal (zie TT-10, `SEARCH_RESULT_LIMIT`). Bij een kleine testgroep werkt dat prima; bij duizenden tot tienduizenden profielen betekent dit onnodig veel dataverkeer bij elke zoekopdracht, ook al worden er maar 50 daadwerkelijk getoond.

**Wijziging.** De filters (naam, plaats/straal, instrument, genre, doel, status) + een limiet (bijv. 50) rechtstreeks meegeven aan de Supabase-zoekfuncties, zodat de database zelf al filtert en afkapt vóórdat er iets over het netwerk gaat — in plaats van "haal alles op, filter dan pas" zoals nu. Raakt de RPC's/SQL-functies (`tt_search_musicians`, `tt_search_musicians_anon`, `tt_search_bands_for_musician`, `tt_search_bands_anon`, `tt_search_musicians_by_songlist_anon`, `tt_get_musicians_public`, `tt_get_bands_public`), niet alleen `index.html`.

**Acceptatie.** Bij 100.000 profielen in de database blijft een zoekopdracht snel en licht (geen merkbare vertraging, geen onnodig dataverkeer), ook zonder plaats/straal ingevuld.

---

## TT-11 · "Ik wil meedoen" bij bands

**Probleem.** `openBandModal()` (r. 4803) toont leden en gezochte instrumenten, maar geen actie. Leden toevoegen kan alleen door de oprichter, via `searchMembersToAdd()` (r. 4571) op naam — dus alleen mensen die hij al kent. Dat is precies het probleem dat de app zegt op te lossen.

**Wijziging.**

1. Knop in de band-modal: **"Ik wil meedoen"**, zichtbaar als de band `status = 'zoekend'` heeft en de kijker geen lid is.
2. Die knop maakt een bericht aan naar de oprichter (hergebruikt TT-01) met een voorgevulde tekst: *"Ik speel [instrumenten] en zou graag meedoen met [bandnaam]."*
3. Optioneel later: een `band_applications`-tabel met status aangevraagd/geaccepteerd/afgewezen, zodat de oprichter een lijstje aanvragen krijgt in plaats van losse berichten.

**Afhankelijk van:** TT-01.

**Acceptatie.** Een muzikant kan zich zonder de oprichter te kennen aanmelden bij een zoekende band; de oprichter krijgt daar een melding van.

---

## TT-12 · Belofte "volgen" uit Over ons

**Probleem.** De tekst op r. 2148 belooft: *"Je kunt andere muzikanten volgen."* Die functie bestaat niet. Beloftes die de app niet waarmaakt kosten direct vertrouwen bij precies de bezoeker die je wilt overtuigen.

**Wijziging.** Herschrijf die zin naar wat er wél is. Loop de hele Over ons-tekst (r. 2147–2150) na op dezelfde manier — "je kunt kiezen welke informatie je aan anderen laat zien" is namelijk ook niet waar; die instelling bestaat niet.

**Acceptatie.** Elke bewering in Over ons komt overeen met een bestaande functie.

**✅ Opgelost 06-08-2026.** "Je kunt andere muzikanten volgen" en "kan je kiezen welke informatie je aan anderen laat zien" (beide niet-bestaand) vervangen door tekst die overeenkomt met wat er werkelijk is: instrumenten/stijlen/repertoire, zoeken op instrument/stijl/afstand/nummers, de volledigheidsmeter, en de 6-maanden-verouderingsregel.

---

## TT-13 · Terugkeerredenen

**Probleem.** Niets in de app geeft een reden om morgen terug te komen. De volledigheidsmeter is eenmalig, er zijn geen notificaties en geen zichtbare activiteit.

**Wijziging, in volgorde van kosten en baten.**

1. **E-mail bij een nieuw bericht** — zit al in TT-01. Dit is verreweg de sterkste.
2. **Profielweergaven.** Tabel `profile_views (viewer_id, viewed_id, created_at)`, geregistreerd in `openMusicianModal()`, met ontdubbeling per dag. Op Mijn Profiel: *"12 mensen bekeken je profiel deze week."* Een teller volstaat; namen tonen is voor deze doelgroep onwenselijk.
3. **Wekelijkse mail "nieuw in jouw buurt"**, met de nieuwe profielen binnen 25 km sinds het laatste bezoek. Cron-job plus Edge Function. Afmelden verplicht.
4. **Bewaren.** Tabel `favorites`, hartje op de resultaatrij, lijstje op Mijn Profiel.
5. **Jam-oproepen** (later, groter). Een oproep met datum en plaats: *"Drummer gezocht, zaterdag 12 sept, Delft."* Tijdgebonden content is de sterkste terugkeermotor die er is en sluit naadloos aan op je eigen tekst over tijdelijke bandleden.

**Acceptatie.** Elke gebruiker heeft minstens één reden om zonder eigen initiatief terug te keren.

---

# P2 — Verzorging en indruk

## TT-14 · Accentkleuren splitsen

**Probleem.** In `:root` (r. 15–16) zijn `--accent` en `--accent2` beide `#f5c518`. Alle tweekleurenlogica in de code is dus een illusie. Gevolgen: genre-badges, foutmeldingen, de verwijderknop en de primaire actieknop hebben dezelfde kleur. `showSaveError()` (r. 3113) zet de titel "Oeps..." in `#f5c518` — dezelfde kleur als "Profiel aangemaakt!".

**Wijziging.**

```css
--accent:  #f5c518;  /* primaire actie, merkkleur */
--accent2: #6ec8d8;  /* secundair: genres, koele accenten */
--danger:  #e5533d;  /* fout en destructief */
--success: #4caf50;  /* al in gebruik bij band-status */
```

Loop daarna langs: foutmeldingen (`resultsEl` in `runSearch()` r. 2695, `showSaveError()`, `.auth-error`), de knop "Profiel verwijderen" (r. 2074), `confirmYesBtn` (r. 2202) en de `wanted-chip` (r. 1466). Alles wat "er is iets mis" of "dit is onomkeerbaar" betekent, krijgt `--danger`.

**Acceptatie.** Een fout is op een screenshot in één oogopslag te onderscheiden van een succesmelding.

**✅ Opgelost 05-08-2026.** Nieuwe variabelen `--danger` (`#e5533d`) en `--success` (`#4caf50`, was al her en der hardcoded); `--accent2` is nu een echte tweede kleur (`#6ec8d8`) en alleen nog gekoppeld aan genre/gezocht-badges. Toast-rand losgekoppeld naar `--accent` (neutraal, toasts zijn zowel succes als fout). **Afspraak met Ronald:** dit is een eerste opzet, kan later nog veranderen.

---

## TT-15 · Typografie en logo op mobiel

**Probleem.** Roboto is de standaardkeuze en overal ingezet, ook voor het logo en de paneeltitels — het resultaat oogt als een template, niet als een muziekplatform. Daarbij is `.logo` (r. 85) `clamp(48px, 8vw, 80px)`, staat er een tagline onder, is de nav er nog, en is het geheel sticky (`.app-topbar`, r. 58). Op een telefoon gaat bijna een derde van het scherm permanent op aan de kop.

**Wijziging.**

1. Eén karakteristieke display-font voor logo, `.panel-title`, `.filter-title`, `.landing-title` en `.band-name`. Denk affiche of poster — het heet niet voor niets een tent. Kandidaten uit Google Fonts: Anton, Archivo Black, Bebas Neue, of een condensed grotesk. Roboto (of Inter) blijft voor lopende tekst.
2. In de `@media (max-width: 560px)`-blok (r. 1468) toevoegen:
   ```css
   .logo { font-size: 28px; }
   .tagline { display: none; }
   .app-topbar { position: static; }
   ```
   Of, beter: maak de topbar sticky met alleen de nav, en laat het logo mee wegscrollen.

**Acceptatie.** Op een scherm van 375×667 is bij het openen van de zoekpagina minstens één volledig zoekresultaat zichtbaar zonder te scrollen.

**✅ Opgelost 06-08-2026**, in twee delen:
- **Mobiele kop (15a, precies zoals voorgesteld, met een verbetering):** logo naar 28px, tagline verborgen. In plaats van de hele kop sticky te houden (het ticket stelde `.app-topbar { position: static; }` voor) is gekozen voor de betere variant die het ticket zelf ook noemde: alleen de navigatiebalk blijft sticky, het logo scrollt gewoon mee. Zo blijft navigeren makkelijk zonder dat het logo blijvend ruimte kost.
- **Display-font (15b, afwijking t.o.v. het ticket, in overleg met Ronald):** het ticket stelde een kant-en-klaar Google Font voor (Anton/Archivo Black/Bebas Neue). In plaats daarvan is gekozen voor **Alfa Slab One als tijdelijke plaatsvervanger** van Ronalds eigen, nog te vectoriseren letterontwerp (huisstijlblad "PROTO2 – PERFORMANCE") — qua zware schreven en bolling het dichtst bij dat ontwerp. Toegepast via een centrale CSS-variabele `--font-display`, zodat later alleen die ene regel hoeft te wijzigen zodra het eigen font beschikbaar is. Ingezet op logo, `.landing-title`, `.panel-title`, `.filter-title`, `.band-name` — Roboto blijft voor alle lopende tekst, labels en knoppen. Projectinstructie-tekst bijgewerkt (`PROJECTINSTRUCTIE_bijgewerkt.md`), door Ronald zelf te plakken in de Project-instellingen.

---

## TT-16 · Browsergeschiedenis en terugknop

**Probleem.** `showView()` (r. 2372) wisselt views zonder de History API te gebruiken. De Android-terugknop en de browserterugknop sluiten daardoor de hele app in plaats van de modal of de vorige view. Voor een SPA op mobiel is dat een van de grootste ergernissen die er zijn, en het kost je bezoekers die niet terugkomen.

**Wijziging.**

```js
function showView(view, fromPop) {
  // ... bestaande logica ...
  if (!fromPop) history.pushState({ view }, '', '#' + view);
}

window.addEventListener('popstate', e => {
  // Open modal? Eerst die sluiten.
  const open = document.querySelector('.modal-overlay.visible');
  if (open) { open.classList.remove('visible'); history.pushState({}, ''); return; }
  showView(e.state?.view || 'landing', true);
});
```

Bij het opstarten in `appInit()` de hash uitlezen zodat een gedeelde link werkt. Let op de bestaande redirects in `showView()` (r. 2386) — die mogen geen dubbele history-entry maken.

**Acceptatie.** De terugknop sluit achtereenvolgens de modal, dan de vorige view, en pas als laatste de app.

**✅ Opgelost 06-08-2026.** `showView()` heeft nu een tweede parameter `mode`: `'pop'` (komt van de terugknop zelf, geschiedenis niet nogmaals aanpassen), `'redirect'` (interne omleiding binnen dezelfde gebruikersactie, bijv. "geen profiel → terug naar registratie" — vervangt de huidige stap i.p.v. er een nieuwe aan toe te voegen) of onbenoemd (gewone bewuste navigatie — nieuwe stap). Nieuwe `popstate`-listener sluit eerst een open modal (via de generieke `.modal-overlay.visible`-selector, werkt voor alle vier de modals), en anders pas de vorige view. `appInit()` leest nu ook de URL-hash uit bij het opstarten, zodat een gedeelde link (bijv. `#about`) direct de juiste view opent — Mijn Profiel/Mijn Bands lopen daarbij via de bestaande `requireLogin()`, zodat een uitgelogde bezoeker de gebruikelijke toast + doorverwijzing krijgt in plaats van een lege pagina. De wizardstappen (1 t/m 5) krijgen bewust geen eigen geschiedenis-stap — anders zou de terugknop halverwege een registratie kunnen terugsturen naar een tussenstap met een half aangemaakt account.

---

## TT-17 · Mobiele layoutfixes

**Probleem.** De `@media (max-width: 560px)`-regel (r. 1468) zet alleen `.field-group` naar één kolom. Daardoor:

- `.filter-row` (r. 1249) blijft twee kolommen: leeftijd min/max naast zoekstraal op 360px is knijpwerk.
- `.app-nav` (r. 1121) heeft vijf knoppen, `padding: 16px 40px 0`, geen `flex-wrap`, en `body` heeft `overflow-x: hidden`. "Inloggen" staat achter de `nav-spacer` helemaal rechts en loopt op smalle schermen buiten beeld.

**Wijziging.** In het mobiele blok toevoegen:

```css
.filter-row { grid-template-columns: 1fr; }
.app-nav { padding: 12px 12px 0; gap: 4px; overflow-x: auto;
           -webkit-overflow-scrolling: touch; }
.app-nav::-webkit-scrollbar { display: none; }
.nav-btn { padding: 10px 12px; font-size: 12px; white-space: nowrap; }
.nav-spacer { display: none; }
.search-wrap, .my-profile-wrap { padding: 24px 16px 60px; }
.modal-box { max-height: 100vh; border-radius: 0; }
```

Test daarna op 360×640 en 390×844.

**Acceptatie.** Alle navigatieknoppen zijn bereikbaar op 360px breed; geen horizontale afsnijding op enige view.

**✅ Opgelost 05-08-2026.** Alle voorgestelde CSS-regels toegevoegd binnen de bestaande mobiele media-query (desktop ongewijzigd). `.nav-spacer` verborgen op mobiel loste op dat "Inloggen" onbereikbaar was.

---

## TT-18 · Album-art bij repertoire

**Probleem.** Muziek is visueel, maar het repertoire is een tekstlijst. Bovendien is MusicBrainz traag: `onArtistSearch()` (r. 3569) wacht 400 ms en dan nog eens de responstijd, en de `User-Agent`-header die op r. 3589 wordt meegegeven wordt door de browser genegeerd — dat is een verboden header in `fetch`. MusicBrainz-recordingzoekopdrachten geven daarbij veel dubbele en obscure live-versies terug.

**Wijziging.** Overweeg de iTunes Search API of Deezer als bron: geen sleutel nodig, CORS-vriendelijk, sneller, en met album-art in het antwoord.

```js
// artiest
https://itunes.apple.com/search?term={q}&entity=musicArtist&limit=6
// nummers van een artiest
https://itunes.apple.com/lookup?id={artistId}&entity=song&limit=25
```

Sla `artwork_url` op in `musician_songs` en toon een klein hoesje van 40×40 px in `renderSongs()` en in `buildMusicianDetailHTML()`. Dat verandert het repertoire van een lijstje in iets dat je wilt bekijken.

Bewaar de MusicBrainz-code als terugval, of vervang hem volledig — beide is verdedigbaar, maar kies er één.

**Acceptatie.** Nummers zoeken voelt direct; een profiel met tien nummers toont tien hoesjes.

---

## TT-19 · Sorteeropties inperken

**Probleem.** Zes sorteeropties (r. 1929–1936) waarvan drie alfabetisch zijn: plaats, instrument en genre. Alfabetisch sorteren op instrument is geen zoekgedrag dat iemand vertoont; het is ruis die de belangrijkste twee opties verstopt.

**Wijziging.** Houd over: **Beste match** en **Dichtstbijzijnde**. Eventueel als derde: **Nieuwste** (op `updated_at`), want dat sluit aan op je verouderingslogica. Verwijder de rest uit de HTML en uit `sortMusicianList()` (r. 2467) en `sortBandList()` (r. 4017).

**Acceptatie.** Maximaal drie sorteeropties, elk met een aantoonbaar gebruiksscenario.

**✅ Opgelost 05-08-2026.** Beste match, Dichtstbijzijnde, en (nieuw) Nieuwste (op `updated_at`) — zoals de backlog als optie voorstelde.

---

## TT-20 · Geboortedatum: invoer en validatie

**Probleem.** `#birth_date` (r. 1595) is een tekstveld met een DD-MM-JJJJ-masker via `formatBirthDate()`, zonder `inputmode` — op mobiel verschijnt dus een lettertoetsenbord. `nextStep(0)` (r. 3867) controleert alleen het formaat, niet de plausibiliteit: 01-01-1899 en 01-01-2035 worden geaccepteerd, waarna `calcAgeFromISO()` onzin oplevert.

**Wijziging.**

1. `inputmode="numeric"` toevoegen aan het veld.
2. Na de formaatcontrole in `nextStep(0)`:
   ```js
   const leeftijd = calcAge(state.birth_date);
   if (isNaN(leeftijd) || leeftijd < 13) {
     showToast('Je moet minimaal 13 jaar zijn om een profiel aan te maken.'); return;
   }
   if (leeftijd > 100) { showToast('Controleer je geboortedatum.'); return; }
   ```
3. Ook de dag- en maandwaarde controleren (dag 1–31, maand 1–12), want het masker laat 45-99-2001 gewoon door.

**Acceptatie.** Een onmogelijke datum en een leeftijd onder 13 worden geweigerd met een begrijpelijke melding; op mobiel verschijnt een cijfertoetsenbord.

**✅ Opgelost 05-08-2026.** `inputmode="numeric"` toegevoegd; dag 1-31/maand 1-12-check en leeftijd 13-100-check toegevoegd aan `nextStep(0)`.

---

## TT-21 · PDOK-terugval

**Probleem.** `nextStep(0)` blokkeert op `!postcodeResolved` (r. 3864). Postcode is verplicht en de plaatsnaam komt uitsluitend van de PDOK Locatieserver (`onPostcodeInput()`, r. 3321). Valt die dienst weg of blokkeert een netwerk hem, dan kan niemand zich meer inschrijven — een externe storing legt je registratie plat.

**Wijziging.** Na twee mislukte pogingen of een time-out van drie seconden: het veld Plaats van `readonly` afhalen (r. 1607) en tonen: *"We kunnen je plaats even niet automatisch ophalen — vul hem zelf in."* Zet dan een vlag `cityManual = true`, laat `nextStep` door met een handmatig ingevulde plaats, en sla de postcode gewoon op. De afstandsberekening werkt dan bij de eerstvolgende gelegenheid alsnog, zodra de postcode geocodeerd kan worden.

**Acceptatie.** Met PDOK geblokkeerd in de netwerktab is registreren nog steeds mogelijk.

**✅ Opgelost 06-08-2026**, met één bewuste afwijking t.o.v. het ticket na overleg met Ronald: **geen vrij tekstveld.** Het ticket stelde voor het Plaats-veld gewoon te ontgrendelen voor vrije invoer; in plaats daarvan verschijnt een **keuzelijst uit bestaande plaatsnamen** (dezelfde `postcode_cache`-data als elders in de app) — de gebruiker moet een suggestie aanklikken, typen filtert alleen de lijst. Reden: een vrij tekstveld zou tikfouten/varianten in de database laten belanden; dit voorkomt dat helemaal.
- **Time-out van 3 sec** op de PDOK-aanroep (`AbortController`) — een hangende aanvraag laat de gebruiker niet langer eindeloos wachten.
- **Twee mislukte pogingen** (transiënte storing) → handmatige modus. Een **definitief "postcode bestaat niet"** (bijv. een postbusnummer zonder woonadres, zoals 2500 Den Haag) probeert eerst nog de cache en schakelt anders direct door naar handmatig — opnieuw proberen zou daar toch niets aan veranderen.
- **Nieuwe kolom `city_source`** (`pdok`/`cache`/`manual`) op zowel `musicians` als `bands`, zodat Ronald achteraf kan controleren welke profielen een handmatig gekozen plaats hebben. SQL-script `city_source_setup.sql` (door Ronald te draaien) bevat ook een kant-en-klare controlequery.
- Zelfde aanpak voor het bandformulier (`onBandPostcodeInput`/`saveBand`).
- Een handmatig gekozen plaats heeft geen coördinaten (die worden server-side afgeleid uit de postcode via `postcode_cache`) — zo iemand doet dus pas mee in afstand-gebaseerd zoeken zodra de postcode alsnog geocodeerd kan worden. De postcode zelf wordt gewoon opgeslagen, dus dit herstelt zichzelf vanzelf.

---

## TT-22 · Accountverwijdering

**Probleem.** `deleteMyProfile()` (r. 2858) verwijdert het muzikantprofiel, maar laat het auth-account bestaan. De gebruiker denkt dat hij weg is en is dat niet. Onder de AVG heb je bovendien een echt recht op verwijdering, dat je moet kunnen uitvoeren.

**Wijziging.**

1. Pas de bevestigingstekst aan zodat hij klopt over wat er gebeurt.
2. Voeg een tweede optie toe: **Account volledig verwijderen**, die via een Edge Function `auth.admin.deleteUser()` aanroept, plus alle rijen in `musicians`, `messages`, `favorites`, `band_members` en de bestanden in Storage.
3. Verwijder ook de opgeslagen bestanden uit de Storage-buckets — anders blijven foto's van minderjarigen op een publieke URL staan na verwijdering.

**Acceptatie.** Na accountverwijdering is inloggen met dezelfde gegevens onmogelijk en zijn de geüploade bestanden niet meer bereikbaar.

---

## TT-23 · Dode code opruimen

**Probleem.** Twee blokken zijn wel aanwezig, maar niet bereikbaar voor de gebruiker:

- `VIBES` (r. 3728): acht vibes gedefinieerd, nergens te kiezen, `state.vibe` blijft altijd `null`, wordt wel als kolom opgeslagen.
- `profileColor` (r. 3720): altijd `#f5c518`; de UI-logica gebruikt hem overal (`profile_color` in badges, avatars, bandkaarten), maar er is geen kleurkiezer meer.
- Dubbel gedefinieerde `.app-topbar` in de CSS (r. 57–63 en r. 65–71).
- `switchAuthTab()` (r. 2413) roept alleen `clearAuthMessages()` aan en wordt nergens gebruikt.
- Panel-id's zijn `step0` t/m `step3` en dan `step5` (r. 1791). `goTo()` werkt op index, dus het werkt — maar het is een valkuil zodra iemand een stap toevoegt.

**Wijziging.** Kies per item: teruggeven aan de gebruiker of weghalen. Voor `profileColor` en `VIBES` is teruggeven de leukere keuze — het is goedkope personalisatie die precies past bij deze doelgroep, en de weergavelogica is er al. Zet dan een kleurkiezer en een vibe-keuze in stap "profiel aanvullen". Kies je voor weghalen: verwijder ook de kolommen.

**Acceptatie.** Geen gedefinieerde constante of databasekolom zonder pad naar de gebruiker.

**✅ Opgelost 06-08-2026** — gekozen voor "weghalen" bij zowel `VIBES` als `profileColor` (i.p.v. teruggeven aan de gebruiker, zoals het ticket als optie noemde): een kleurkiezer/vibe-keuze toevoegen aan de wizard was een grotere ingreep die niet in deze batch paste. `VIBES`-array en `state.vibe` volledig verwijderd; `state.profileColor` vervangen door één vaste constante `DEFAULT_PROFILE_COLOR` — nieuwe profielen krijgen de merkkleur, en bij het bewerken van een profiel wordt `profile_color` niet meer overschreven (bestaande profielen met een afwijkende kleur blijven dus intact). Dubbele `.app-topbar`-CSS-regel verwijderd. Ongebruikte `switchAuthTab()` verwijderd. Paneel-id `step5` hernoemd naar `step4` (nu aansluitend op `step0`–`step3`, geen valkuil meer bij een volgende stap-toevoeging).

---

## TT-24 · Beheersingsniveaus bij de knoppen

**Probleem.** De uitleg van Basis, Bijna helemaal en Podiumklaar staat op r. 1741–1746 — ónder de nummerlijst, in kleine grijze letters, ná het moment waarop je de keuze maakt. `renderSongs()` laat de knoppen ondertussen pulseren (`levelPulse`) om je te dwingen te kiezen waarvan je de betekenis niet kent.

**Wijziging.** Zet de uitleg als `title`-attribuut op de drie knoppen in `renderSongs()` (r. 3823–3825), en zet één regel uitleg boven de lijst in plaats van eronder. Op mobiel werkt `title` niet, dus overweeg de tekst permanent klein onder de eerste rij te tonen, en het blok onderaan te verwijderen.

**Acceptatie.** De betekenis van de drie niveaus is zichtbaar op het moment van kiezen.

**✅ Opgelost 05-08-2026.** Uitleg staat nu als vaste regel boven de nummerlijst (altijd zichtbaar) + als `title`-tooltip per knop. Oude blok onderaan verwijderd.

---

## TT-26 · Zoektekst ongefilterd in Supabase-query

**Probleem.** Gevonden tijdens het uitvoeren van TT-05 (geen XSS, dus apart genoteerd). Twee plekken sturen getypte zoektekst ongefilterd door naar een Supabase-query:

- `onCitySearchInput()`: `.or('city.ilike.%${q}%,alternatieve_schrijfwijzen.ilike.%${q}%')` — een komma in `q` breekt de `.or()`-syntax open, want die gebruikt komma's als scheidingsteken tussen voorwaarden.
- `searchMembersToAdd()`: `.ilike('fname', '%${q}%')` — minder risicovol (één voorwaarde, geen scheidingstekens in het patroon), maar dezelfde soort ongefilterde input.

**Wijziging.** Speciale tekens die de `.or()`-syntax gebruikt (komma, punt-haakjes) escapen of het queryonderdeel opsplitsen in losse `.or()`-voorwaarden i.p.v. één samengestelde string. Voor `searchMembersToAdd()` volstaat een eenvoudige sanitatie van `%`-tekens in `q` zelf (anders kan een gebruiker met een `%` in zijn zoekterm het `ilike`-patroon beïnvloeden).

**Acceptatie.** Een zoekterm met een komma of `%`-teken geeft een normaal (leeg of gefilterd) resultaat, geen querysyntaxfout en geen onbedoeld brede match.

**✅ Opgelost 06-08-2026.** Twee nieuwe helpers: `likeSafe()` (haalt `%`, `_`, `*`, `\` uit een zoekterm — jokertekens in een ilike-patroon die de gebruiker hier nooit letterlijk bedoelt) en `orValue()` (zet de waarde tussen dubbele quotes zodat een komma de `.or()`-syntax niet openbreekt). Toegepast op `onCitySearchInput()` (plaatssuggesties bij zoeken) en `searchMembersToAdd()` (lid toevoegen aan een band), met een guard zodat een zoekterm die na opschoning niets overhoudt (bijv. alleen "%%") geen zoekopdracht start.

---

## TT-27 · Wizard-tussenresultaten incrementeel opslaan

**Probleem.** Gevonden tijdens het uitvoeren van TT-09 (geen los probleem uit de audit, dus apart genoteerd). Sinds TT-09 bestaat het account/minimaal profiel al na stap 1, maar instrument, genre, repertoire, doel en media-links worden nog steeds pas naar de database geschreven bij de allerlaatste klik op "Profiel aanmaken" (`submitProfile()`). Een refresh binnen hetzelfde tabblad wordt al opgevangen (`sessionStorage`, zie TT-09), maar sluit iemand het tabblad zelf en komt hij pas later terug, dan is alles wat hij bij stap 2 t/m 5 heeft aangeklikt alsnog kwijt — hij moet dan opnieuw beginnen bij het instrument kiezen.

**Wijziging.** Elke stap (instrument/genre kiezen, een nummer toevoegen, een doel kiezen, een link toevoegen) meteen wegschrijven naar de bijbehorende koppeltabel (`musician_instruments`, `musician_genres`, `musician_songs`, `musician_media`) i.p.v. pas te verzamelen in het lokale `state`-object tot de laatste stap. `submitProfile()` wordt dan vooral nog verantwoordelijk voor het zetten van `profile_complete = true` i.p.v. voor het in bulk wegschrijven van alles tegelijk.

**Acceptatie.** Iemand die na stap 3 het tabblad sluit en een dag later opnieuw inlogt, ziet zijn eerder gekozen instrument/genre/nummers nog staan — ook zonder dat het profiel al als "af" telt (blijft dus nog steeds onzichtbaar voor anderen tot de laatste stap).

---

# P3 — Later

## TT-25 · PWA-manifest

**Probleem.** Geen `manifest.json` en geen icoon. De app is niet als icoon op het beginscherm te zetten. Voor iets dat de vaste ontmoetingsplek wil zijn, op een doelgroep die vrijwel uitsluitend mobiel is, is dat een gemiste kans.

**Wijziging.** `manifest.json` met naam, korte naam, `display: standalone`, themakleur `#0d0d0d` en iconen van 192 en 512 px. Koppelen in de `<head>`. Een service worker is optioneel; zonder is het al voldoende voor "toevoegen aan beginscherm". Voeg ook `<meta name="theme-color" content="#0d0d0d">` toe zodat de browserbalk meekleurt.

**Acceptatie.** In Chrome op Android verschijnt de installatieprompt; het icoon opent de app zonder browserbalk.

**✅ Opgelost 06-08-2026.** `manifest.json` (naam, korte naam, `display: standalone`, `theme_color`/`background_color` `#0d0d0d`) + `<link rel="manifest">` en `<meta name="theme-color">` in de `<head>`. Geen service worker (niet nodig voor "toevoegen aan beginscherm", en wel een bron van cache-problemen). Iconen (192×192, 512×512) door Claude gegenereerd — **antraciet achtergrond (#2A2A2A) i.p.v. zwart, op verzoek van Ronald**, met een gouden "T" in een zware schreefletter. Dit zijn tijdelijke iconen; als Ronalds eigen logo-ontwerp (zie TT-15b) klaar is, vervangen `icon-192.png`/`icon-512.png` eenvoudig. **Nieuw in de repo:** `manifest.json`, `icon-192.png`, `icon-512.png` — Ronald moet deze drie bestanden samen met `index.html` uploaden.

---

## Voorgestelde volgorde

**Sprint 1 — de app werkend maken**
TT-05 (XSS) → TT-03 (achter login) → TT-04 (postcode) → TT-08 (linkbug) → TT-02 (media opslaan)

*Waarom deze eerst: TT-05, 03 en 04 zijn klein en verkleinen je risico direct. TT-08 is tien minuten werk. TT-02 maakt een bestaande belofte waar.*

**Sprint 2 — het product compleet maken**
TT-01 (berichten) → TT-11 (meedoen bij bands) → TT-06 (melden en blokkeren)

*TT-06 moet in dezelfde sprint als TT-01 live, niet later.*

**Sprint 3 — drempels weg**
TT-09 (onboarding) → TT-10 (zoeken met resultaten) → TT-16 (terugknop) → TT-17 (mobiel)

**Sprint 4 — juridisch en terugkeer**
TT-07 (ouderlijke toestemming) → TT-13 (terugkeerredenen) → TT-22 (accountverwijdering)

**Sprint 5 — indruk**
TT-14, TT-15, TT-18, TT-19, TT-12, TT-20, TT-21, TT-23, TT-24, TT-25, TT-26, TT-27, TT-28

---

## Wat er goed is en niet gewijzigd moet worden

Bij het opruimen is het verleidelijk om ook dingen aan te pakken die al kloppen. Deze niet aanraken:

- **Postcode → plaats via PDOK.** Soepel, snel, en het scheelt de gebruiker typewerk. Alleen de terugval ontbreekt (TT-21).
- **Zoeken toegestaan zonder profiel.** De juiste keuze; alleen de mate van zichtbaarheid moet bijgesteld (TT-03).
- **Verouderde profielen onderaan** (`is_stale`, >6 maanden). Slim, en het geeft je een eerlijk argument om mensen terug te laten komen.
- **`showToast()` in plaats van `alert()`** en `friendlyErrorMessage()` (r. 3050). Beide doordacht en consequent toegepast.
- **De volledigheidsmeter.** Goede hook; hij wordt na TT-09 nog waardevoller omdat hij dan de motor van het aanvullen wordt in plaats van een scorebord achteraf.
- **Setlist-zoeken.** Dit is je onderscheidende vermogen. Concreet ("kent deze nummers") waar concurrenten blijven hangen in genre-matching, wat daar juist een veelgehoorde klacht is. Overweeg deze modus na Sprint 3 te promoveren tot de eerste tab in plaats van de derde.
