# The Talent Tent — TODO

Laatste update: 29 juli 2026

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

## 🔜 Nu mee bezig / volgende
- [ ] Zoekfunctie verfijnen (muzikanten + bands)
- [ ] Contactfunctie (muzikanten kunnen elkaar benaderen)
- [ ] Personalisatie (profiel/aanbevelingen)
- [ ] E-mailprovider koppelen (voor als e-mailbevestiging weer aan moet, notificaties, etc.)
- [ ] Stad/postcode altijd correct maken — Ronald wil dit robuust, niet alleen synoniemen gelijktrekken. Voorstel: automatisch stad ophalen o.b.v. postcode via PDOK Locatieserver (gratis, officieel, geen API-key nodig). Kernfunctie van de app hangt af van correcte locatie.

## 💡 Ideeën / backlog
- Maak pagina's automatisch beeldvullend in webversie (scrollen zoveel mogelijk vermijden)
- E-mail reminder voor niveau update
- Bandprofiel en band-zoekfunctie scheiden
- Zoekresultaten tonen na gebruik zoekfunctie (tonen naar relevantie: zoekend, meest actief)
- Optie zoekopdracht maken. E-mail sturen zodra een match is ontstaan.

## 🐛 Bekende bugs / aandachtspunten
- e-mailbevestiging aanzetten

## 📝 Notities
- Ronald heeft geen programmeerervaring, uploadt via GitHub web interface.
- Stack: HTML/JS single-page app + Supabase JS client (CDN), bestand `index.html`.
- Zie project-instructies voor huisstijl, verplichte features en technische regels.
- **Huisstijl-update nodig:** Project-instructies vermelden nog "Fonts: Bebas Neue (display), DM Sans (tekst)". Dit moet Ronald zelf aanpassen in de Project-instellingen naar: "Font: Roboto (Regular)". Claude kan dit niet zelf wijzigen.
