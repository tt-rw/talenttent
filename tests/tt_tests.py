#!/usr/bin/env python3
"""
The Talent Tent — vaste testset, laag 1 (TT-231).

Draait volledig automatisch in de sessie, tegen de Supabase-stub in
tests/stub/supabase-stub.js. Raakt de echte database niet.

Gebruik:    python3 tests/tt_tests.py
Uitvoer:    een regel per controle, plus een eindstand.
Afsluitcode 0 = alles geslaagd, 1 = minstens een controle gezakt.

Wat laag 1 NIET dekt: database, RLS-regels, echt inloggen. Dat is laag 2,
die Claude in de browser doorloopt. Zie actielijst.md, TT-231.
"""

import http.server
import json
import os
import re
import socketserver
import subprocess
import sys
import threading

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STUB = os.path.join(ROOT, "tests", "stub", "supabase-stub.js")

JS_FILES = [
    "core.js", "utils.js", "veiligheid.js", "auth.js", "postcode.js", "wizard.js",
    "ouder.js", "search.js", "musicians.js", "bands.js", "messages.js",
    "modals-shared.js",
]

# Scriptvolgorde uit de projectinstructies. Bindend.
SCRIPT_ORDER = JS_FILES[:]

VIEWS = [
    "view-landing", "view-auth", "view-register", "view-profieltegels",
    "view-search", "view-myprofile", "view-bands", "view-messages",
    "view-about", "view-privacy", "view-terms", "view-gedragscode",
    "view-instellingen", "view-reset", "view-toestemming",
]

NAV_IDS = [
    "navMyProfile", "navMyBands", "navSearch", "navMessages", "navLogin",
    "navMenuBtn", "navAbout", "navPrivacy", "navTerms", "navGedragscode",
    "navSettings", "navLogout", "navMenuLogin",
    "bottomNavSearch", "bottomNavMessages", "bottomNavBands", "bottomNavProfile",
    "unreadBadge", "unreadBadgeBottom",
]

# Na deze woorden volgt een reguliere expressie, geen deling.
KEYWORDS = {
    "return", "typeof", "instanceof", "in", "of", "new", "delete", "void",
    "case", "do", "else", "yield", "await", "throw",
}

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    mark = "GESLAAGD" if ok else "GEZAKT  "
    line = f"  {mark}  {name}"
    if detail and not ok:
        line += f"\n            {detail}"
    print(line, flush=True)


# --------------------------------------------------------------------------
# Blok 1 — statische controles, zonder browser
# --------------------------------------------------------------------------

def skip_string(text, i, quote):
    """Staat achter het sluitteken van een gewone string."""
    n = len(text)
    while i < n:
        if text[i] == "\\":
            i += 2
            continue
        if text[i] == quote:
            return i + 1
        i += 1
    return i


def skip_template(text, i):
    """Staat achter het sluitende backtick. Verwerkt ${...} en geneste sjablonen."""
    n = len(text)
    while i < n:
        c = text[i]
        if c == "\\":
            i += 2
            continue
        if c == "`":
            return i + 1
        if c == "$" and i + 1 < n and text[i + 1] == "{":
            i += 2
            diepte = 1
            while i < n and diepte:
                d = text[i]
                if d == "\\":
                    i += 2
                    continue
                if d == "`":
                    i = skip_template(text, i + 1)
                    continue
                if d in "'\"":
                    i = skip_string(text, i + 1, d)
                    continue
                if d == "{":
                    diepte += 1
                elif d == "}":
                    diepte -= 1
                i += 1
            continue
        i += 1
    return i


def balans(text):
    """Haakjesbalans, met strings, commentaar en reguliere expressies overgeslagen."""
    paren = {"(": ")", "[": "]", "{": "}"}
    closing = {v: k for k, v in paren.items()}
    stack = []
    vorige = ""          # laatste betekenisdragende teken
    laatste_woord = ""   # laatste volledige woord, voor de sleutelwoordtoets
    i, n = 0, len(text)
    while i < n:
        c = text[i]
        nxt = text[i + 1] if i + 1 < n else ""
        if c == "/" and nxt == "/":
            j = text.find("\n", i)
            i = n if j < 0 else j
            continue
        if c == "/" and nxt == "*":
            j = text.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        # Een / na een waarde is deling; anders begint er een reguliere
        # expressie. Zonder dit onderscheid telt /[^)]/ als een los haakje.
        # Let op: na een sleutelwoord (return, typeof, case ...) volgt een
        # reguliere expressie, ook al eindigt dat woord op een letter.
        na_waarde = (vorige.isalnum() or vorige in ")]_$") and laatste_woord not in KEYWORDS
        if c == "/" and not na_waarde:
            i += 1
            in_klasse = False
            while i < n:
                if text[i] == "\\":
                    i += 2
                    continue
                if text[i] == "[":
                    in_klasse = True
                elif text[i] == "]":
                    in_klasse = False
                elif text[i] == "/" and not in_klasse:
                    break
                elif text[i] == "\n":
                    break
                i += 1
            i += 1
            vorige = "/"
            continue
        if c == "`":
            i = skip_template(text, i + 1)
            vorige = "'"
            laatste_woord = ""
            continue
        if c in "'\"":
            i = skip_string(text, i + 1, c)
            vorige = "'"
            laatste_woord = ""
            continue
        if c in paren:
            stack.append(c)
        elif c in closing:
            if not stack or stack[-1] != closing[c]:
                return False, f"onverwachte {c} op positie {i}"
            stack.pop()
        if c.isalnum() or c in "_$":
            j = i
            while j < n and (text[j].isalnum() or text[j] in "_$"):
                j += 1
            laatste_woord = text[i:j]
            vorige = text[j - 1]
            i = j
            continue
        if not c.isspace():
            vorige = c
            laatste_woord = ""
        i += 1
    if stack:
        return False, f"niet gesloten: {''.join(stack)}"
    return True, ""


def blok1_statisch():
    print("\nBlok 1 — statische controles")
    for f in JS_FILES:
        path = os.path.join(ROOT, f)
        if not os.path.exists(path):
            check(f"{f} bestaat", False, "bestand ontbreekt")
            continue
        r = subprocess.run(["node", "--check", path], capture_output=True, text=True)
        check(f"node --check {f}", r.returncode == 0, r.stderr.strip()[:300])
        ok, why = balans(open(path, encoding="utf-8").read())
        check(f"haakjesbalans {f}", ok, why)

    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()

    srcs = re.findall(r'<script\s+src="([^"?]+)(?:\?v=([^"]*))?"', html)
    local = [(s, v) for s, v in srcs if not s.startswith("http")]
    order = [s for s, _ in local]
    check("scriptvolgorde is bindend en klopt", order == SCRIPT_ORDER,
          f"gevonden: {order}")
    zonder_v = [s for s, v in local if not v]
    check("elk lokaal script heeft ?v=", not zonder_v, f"zonder ?v=: {zonder_v}")

    # Dode bestanden mogen niet geladen worden.
    dood = [s for s in order if s in ("profiel-gedeeld.js", "profiel-v2.html")]
    check("dode bestanden niet geladen", not dood, f"wel geladen: {dood}")

    check("geen emoji in de UI", not re.search(
        r"[\U0001F300-\U0001FAFF❤⭐]", html), "emoji gevonden in index.html")

    # TT-281: wissen en opnieuw vullen gebeurt alleen nog in een
    # databasefunctie, in één transactie. Een los .delete() op deze tabellen
    # in de opslagpaden is precies de fout die TT-281 wegnam.
    los = []
    for f in ("wizard.js", "musicians.js"):
        src = open(os.path.join(ROOT, f), encoding="utf-8").read()
        for t in ("musician_instruments", "musician_genres", "musician_songs",
                  "musician_media", "band_wanted"):
            if re.search(r"from\('" + t + r"'\)\s*\.delete\(", src):
                los.append(f"{f}: {t}")
    check("geen los wissen van koppeltabellen in de opslagpaden (TT-281)", not los,
          f"gevonden: {los}")


# --------------------------------------------------------------------------
# Blok 2 t/m 5 — in de browser, tegen de stub
# --------------------------------------------------------------------------

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def log_message(self, *a):
        pass


def serve():
    httpd = socketserver.TCPServer(("127.0.0.1", 0), QuietHandler)
    port = httpd.server_address[1]
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, port


def blok_browser():
    stub_js = open(STUB, encoding="utf-8").read()
    httpd, port = serve()
    page_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        page.on("pageerror", lambda e: page_errors.append(str(e)))

        # De Supabase-bibliotheek van het CDN wordt vervangen door de stub.
        page.route("**/supabase-js@2/**", lambda r: r.fulfill(
            status=200, content_type="application/javascript", body=stub_js))
        # Externe diensten die een test niet mag raken.
        for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**",
                    "**/api.pdok.nl/**", "**/itunes.apple.com/**"):
            page.route(pat, lambda r: r.abort())

        page.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load")
        page.wait_for_timeout(400)

        print("\nBlok 2 — opstarten en views")
        check("geen JS-fout bij opstarten", not page_errors, "; ".join(page_errors)[:400])
        check("stub is geladen, niet de echte bibliotheek",
              page.evaluate("!!window.TT_STUB"), "TT_STUB ontbreekt")

        ontbrekend = [v for v in VIEWS if page.locator(f"#{v}").count() == 0]
        check(f"alle {len(VIEWS)} views aanwezig", not ontbrekend, f"ontbreekt: {ontbrekend}")

        actief = page.evaluate(
            "[...document.querySelectorAll('.view.active,[id^=view-].active')].map(e=>e.id)")
        check("view-landing is actief bij opstart", actief == ["view-landing"],
              f"actief: {actief}")

        print("\nBlok 3 — bedrading: elke onclick wijst naar een bestaande functie")
        html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        sleutelwoorden = {"if", "for", "while", "switch", "return", "typeof", "catch"}
        namen = sorted(set(re.findall(r'onclick="\s*([A-Za-z_$][\w$]*)\s*\(', html))
                       - sleutelwoorden)
        missend = page.evaluate(
            "ns => ns.filter(n => typeof window[n] !== 'function')", namen)
        check(f"{len(namen)} onclick-functies bestaan", not missend,
              f"ontbreekt: {missend}")

        print("\nBlok 4 — navigatie")
        weg = [i for i in NAV_IDS if page.locator(f"#{i}").count() == 0]
        check("alle navigatie-id's aanwezig", not weg, f"ontbreekt: {weg}")
        check("navMenuBtn staat buiten de scrollbare balk",
              page.evaluate("!document.querySelector('#appNav')?.contains("
                            "document.getElementById('navMenuBtn'))"),
              "navMenuBtn staat in .app-nav")

        print("\nBlok 5 — knoppenrijen (TT-228)")
        rijen = page.evaluate("""() => {
          const out = [];
          for (const el of document.querySelectorAll('.btn-row,.action-row')) {
            const cs = getComputedStyle(el);
            const kn = [...el.children].filter(c => c.offsetParent !== null);
            if (kn.length < 2) continue;
            const br = kn.map(k => Math.round(k.getBoundingClientRect().width));
            const ho = kn.map(k => Math.round(k.getBoundingClientRect().height));
            out.push({ id: el.id || el.className, display: cs.display,
                       flow: cs.gridAutoFlow, gap: cs.gap || cs.columnGap,
                       breedtes: br, hoogtes: ho });
          }
          return out;
        }""")
        zichtbaar = [r for r in rijen if r["breedtes"]]
        geen_grid = [r["id"] for r in zichtbaar if r["display"] != "grid"]
        check("knoppenrijen gebruiken grid, niet flex", not geen_grid,
              f"geen grid: {geen_grid}")
        ongelijk = [r["id"] for r in zichtbaar if max(r["breedtes"]) - min(r["breedtes"]) > 1]
        check("knoppen in een rij zijn even breed", not ongelijk,
              f"ongelijk: {ongelijk}")
        verkeerde_gap = [r["id"] for r in zichtbaar
                         if r["gap"] and not r["gap"].startswith("8px")]
        check("tussenruimte in een knoppenrij is 8px", not verkeerde_gap,
              f"afwijkend: {verkeerde_gap}")
        te_klein = [r["id"] for r in zichtbaar if min(r["hoogtes"]) < 44]
        check("tikdoel minstens 44px hoog", not te_klein, f"te klein: {te_klein}")

        print("\nBlok 6 — stil falen mag niet terugkomen (TT-230)")
        page.evaluate("""() => {
          window.TT_STUB.errors['band_members.founder_offer'] =
            { code: '42703', message: 'column band_members.founder_offer does not exist' };
        }""")
        logged = page.evaluate("""async () => {
          const before = (window.TT_STUB.data.app_error_log || []).length;
          const r = await db.from('band_members').select('founder_offer').limit(1);
          return { heeftFout: !!r.error, code: r.error && r.error.code, before };
        }""")
        check("een databasefout komt als error terug, niet als lege lijst",
              logged["heeftFout"] and logged["code"] == "42703", json.dumps(logged))
        check("logCaught bestaat in core.js",
              page.evaluate("typeof window.logCaught === 'function'"),
              "logCaught ontbreekt")
        page.evaluate("window.TT_STUB.reset()")

        print("\nBlok 7 — modals blijven binnen het canvas (TT-224)")
        buiten = page.evaluate("""() => {
          const root = document.getElementById('appRoot');
          const fout = [];
          for (const m of document.querySelectorAll('.modal,[id$=Modal]')) {
            if (!root.contains(m)) fout.push(m.id || m.className);
          }
          return fout;
        }""")
        check("alle modals staan in #appRoot", not buiten, f"buiten: {buiten}")
        # TT-256 (11-09-2026): de toets stond op precies 'hidden'. #appRoot
        # draagt nu 'clip', met 'hidden' als terugval eronder voor oudere
        # browsers. Beide knippen horizontaal weg; 'clip' doet dat zonder van
        # #appRoot een scrollbak te maken. De bedoeling van TT-212 — niet op
        # body — blijft onveranderd getoetst.
        check("#appRoot knipt horizontaal weg, body niet (TT-212, TT-256)",
              page.evaluate("['hidden','clip'].includes("
                            "getComputedStyle(document.getElementById('appRoot')).overflowX) && "
                            "!['hidden','clip'].includes("
                            "getComputedStyle(document.body).overflowX)"),
              "overflow-x staat op de verkeerde plek")

        print("\nBlok 9 — de laatst geopende modal ligt bovenop (TT-229)")
        # De laag wordt gezet door een MutationObserver, dus één tik later.
        stapel = page.evaluate("""async () => {
          const tik = () => new Promise(r => setTimeout(r, 0));
          const a = document.getElementById('addMemberModal');
          const b = document.getElementById('confirmModal');
          const z = el => parseInt(el.style.zIndex) || 0;
          const uit = {};
          a.classList.add('visible'); await tik();
          b.classList.add('visible'); await tik();
          uit.confirmBovenop = z(b) > z(a);
          a.classList.remove('visible'); b.classList.remove('visible'); await tik();
          b.classList.add('visible'); await tik();
          a.classList.add('visible'); await tik();
          uit.addMemberBovenop = z(a) > z(b);
          a.classList.remove('visible'); b.classList.remove('visible'); await tik();
          uit.tellerTerug = z(a) === 0 && z(b) === 0;
          return uit;
        }""")
        check("een dialoog boven een open modal wint", stapel["confirmBovenop"])
        check("andersom wint de andere, dus geen vaste volgorde", stapel["addMemberBovenop"])
        check("lagen worden opgeruimd als alles dicht is", stapel["tellerTerug"])
        # Alleen de werkelijke regel telt, niet de toelichting erboven.
        css = open(os.path.join(ROOT, "styles.css"), encoding="utf-8").read()
        check("de losse reparatie #niveauInfoModal z-index 210 is weg",
              not re.search(r"^\s*#niveauInfoModal\s*\{", css, re.M))

        print("\nBlok 10 — nooit nul zoekresultaten (TT-62)")
        ladder = page.evaluate("""() => ({
          van5: volgendeStraal(5), van25: volgendeStraal(25),
          van250: volgendeStraal(250), van500: volgendeStraal(500),
          vanNull: volgendeStraal(null)
        })""")
        check("straalladder loopt op en stopt",
              ladder["van5"] == 10 and ladder["van25"] == 50
              and ladder["van250"] == 500 and ladder["van500"] is None
              and ladder["vanNull"] is None, json.dumps(ladder))

        verruimd = page.evaluate("""async () => {
          hasOwnProfile = false;
          window.TT_STUB.rpcResults.tt_resolve_search_origin = [{ lat: 52.0, lng: 4.3 }];
          window.TT_STUB.rpcResults.tt_search_musicians_anon =
            (p) => (p.radius_km >= 50 ? [{ musician_id: 'm1', distance_km: 41, is_stale: false }] : []);
          window.TT_STUB.rpcResults.tt_get_musicians_public = [{
            id: 'm1', username: 'ronnie', age: 30, city: 'Delft', bio: '', goal: null,
            profile_color: '#f5c518', avatar_url: null, updated_at: new Date().toISOString(),
            instrument_levels: [{ instrument: 'Drums', niveau: 3 }], genres: ['Rock'], songs: []
          }];
          document.getElementById('filterCity').value = 'Delft';
          document.getElementById('filterRadius').value = '5';
          await runSearch();
          await new Promise(r => setTimeout(r, 150));
          return document.getElementById('searchResults').innerText;
        }""")
        # Gecorrigeerd 12-09-2026: deze controle zocht naar "Geen muzikanten
        # binnen 5 km". Die tekst staat nergens in de code en heeft er ook
        # nooit gestaan; verruimdNotice() in search.js schrijft "Binnen 5 km
        # vonden we nog geen match." Gemeten in de browser, 12-09-2026: de
        # verruiming zelf werkt wel — musicianVerruimd komt op {van:5, naar:50}
        # en de uitlegregel verschijnt. De toets was fout, niet de app. De
        # eindstand "69 van 69" in actielijst.md van 11-09-2026 klopte dus niet.
        check("bij nul treffers wordt de straal verruimd",
              "Binnen 5 km vonden we nog geen match" in verruimd, verruimd[:200])
        check("het dichtstbijzijnde resultaat staat er wel",
              "1 muzikant gevonden" in verruimd, verruimd[:200])

        leeg = page.evaluate("""async () => {
          window.TT_STUB.rpcResults.tt_search_musicians_anon = () => [];
          document.getElementById('filterRadius').value = '5';
          await runSearch();
          await new Promise(r => setTimeout(r, 150));
          return document.getElementById('searchResults').innerText;
        }""")
        check("is er landelijk niets, dan wijst de tekst naar de filters",
              "Ook in heel Nederland" in leeg, leeg[:200])
        check("de oude raad over de zoekstraal staat er dan niet meer",
              "zoekstraal aan" not in leeg, leeg[:200])
        page.evaluate("window.TT_STUB.reset()")

        print("\nBlok 11 — het wiel en vloeiend scrollen (TT-256)")
        wiel = page.evaluate("""async () => {
          showView('search');
          openWheelSheet('radius');
          await new Promise(r => requestAnimationFrame(
            () => requestAnimationFrame(() => setTimeout(r, 60))));
          const groep  = document.getElementById('wheelSheetGroup');
          const kolom  = groep.querySelector('.wheel');
          const scroll = groep.querySelector('.wheel-scroll');
          const band   = groep.querySelector('.picker-band');
          const sheet  = document.querySelector('#wheelSheetModal .wheel-sheet');
          const g = groep.getBoundingClientRect();
          const k = kolom.getBoundingClientRect();
          const zoek = document.getElementById('view-search');
          return {
            afwijkingMidden: Math.abs((k.left + k.width / 2) - (g.left + g.width / 2)),
            groepBreedte: Math.round(g.width),
            sheetBreedte: Math.round(sheet.getBoundingClientRect().width),
            spacers: groep.querySelectorAll('.wheel-unit-spacer').length,
            fades: groep.querySelectorAll('.picker-fade').length,
            bandKleur: getComputedStyle(band).backgroundColor,
            masker: getComputedStyle(scroll).maskImage || 'none',
            overscroll: getComputedStyle(scroll).overscrollBehaviorY,
            touchActie: getComputedStyle(zoek).touchAction
          };
        }""")
        check("het getal staat in het midden van het paneel",
              wiel["afwijkingMidden"] <= 1, f"{wiel['afwijkingMidden']}px naast het midden")
        check("het paneel is smaller dan de bladwijzer",
              wiel["groepBreedte"] < wiel["sheetBreedte"],
              f"paneel {wiel['groepBreedte']}px, bladwijzer {wiel['sheetBreedte']}px")
        check("de eenheid heeft een tegenhanger links",
              wiel["spacers"] == 1, str(wiel["spacers"]))
        check("de vervaging ligt over het paneel, niet op de scroller",
              wiel["fades"] == 2 and wiel["masker"] == "none",
              f"fades={wiel['fades']} masker={wiel['masker']}")
        check("de markeringsbalk is niet goud gewassen",
              "245, 197, 24" not in wiel["bandKleur"], wiel["bandKleur"])
        check("het wiel houdt zijn eigen scrollbeweging vast",
              wiel["overscroll"] == "contain", wiel["overscroll"])
        check("het zoekscherm laat verticaal scrollen aan de browser",
              "pan-y" in wiel["touchActie"], wiel["touchActie"])
        page.evaluate("closeWheelSheet()")

        print("\nBlok 12 — veldfouten (TT-247) en zoeken op naam (TT-257)")

        # De vorm: rode rand om het veld, witte regel eronder. Nooit rode
        # tekst — huisstijl §1.2, besluit Ronald 12-09-2026.
        vorm = page.evaluate("""async () => {
          showView('auth');
          document.getElementById('loginEmail').value = 'ronald@talenttent.org';
          document.getElementById('loginPassword').value = '';
          await signIn();
          // 450 ms: styles.css animeert border-color in 0,2 s, en
          // showFieldErrors() focust na 300 ms. Meten we eerder, dan lezen we
          // een tussenkleur — gemeten 12-09-2026: rgb(192,89,73) i.p.v.
          // rgb(229,83,61).
          await new Promise(r => setTimeout(r, 450));
          const veld  = document.getElementById('loginPassword');
          const regel = document.querySelector('#view-auth .field-msg');
          const cs    = regel ? getComputedStyle(regel) : null;
          const vs    = getComputedStyle(veld);
          const icoon = regel ? regel.querySelector('svg.field-msg-icon') : null;
          return {
            veldGemarkeerd: veld.classList.contains('field-error'),
            ariaInvalid: veld.getAttribute('aria-invalid'),
            randVeld: vs.borderTopColor,
            regelTekst: regel ? regel.innerText.trim() : '',
            regelKleur: cs ? cs.color : '',
            regelGrootte: cs ? cs.fontSize : '',
            regelInspringing: cs ? cs.paddingLeft : '',
            heeftIcoon: !!icoon,
            regelNaWrap: !!(regel && regel.previousElementSibling
                            && regel.previousElementSibling.classList.contains('password-wrap'))
          };
        }""")
        check("het foute veld krijgt een rode rand",
              vorm["randVeld"] == "rgb(229, 83, 61)", vorm["randVeld"])
        check("het foute veld krijgt aria-invalid",
              vorm["veldGemarkeerd"] and vorm["ariaInvalid"] == "true", json.dumps(vorm))
        check("de foutregel is wit, niet rood (huisstijl §1.2)",
              vorm["regelKleur"] == "rgb(240, 240, 240)", vorm["regelKleur"])
        check("de foutregel is 12px en springt in op --field-inset",
              vorm["regelGrootte"] == "12px" and vorm["regelInspringing"] == "8px",
              f"{vorm['regelGrootte']} / {vorm['regelInspringing']}")
        check("de foutregel heeft een lijn-icoon, geen emoji", vorm["heeftIcoon"], "")
        check("de foutregel staat onder de wachtwoord-wrap, niet ertussen",
              vorm["regelNaWrap"], "")
        check("de tekst zegt wat er moet gebeuren",
              vorm["regelTekst"] == "Vul je wachtwoord in", vorm["regelTekst"])

        # Alle fouten tegelijk, en weg zodra je dat veld wijzigt.
        gedrag = page.evaluate("""async () => {
          showView('auth');
          clearFieldErrors('view-auth');
          document.getElementById('loginEmail').value = '';
          document.getElementById('loginPassword').value = '';
          await signIn();
          await new Promise(r => setTimeout(r, 60));
          const aantal = document.querySelectorAll('#view-auth .field-msg').length;
          const email = document.getElementById('loginEmail');
          email.value = 'r@talenttent.org';
          email.dispatchEvent(new Event('input', { bubbles: true }));
          await new Promise(r => setTimeout(r, 20));
          return {
            aantal,
            naTypen: document.querySelectorAll('#view-auth .field-msg').length,
            emailNogFout: email.classList.contains('field-error')
          };
        }""")
        check("alle fouten tegelijk, niet één voor één",
              gedrag["aantal"] == 2, f"{gedrag['aantal']} foutregels")
        check("de markering verdwijnt zodra je dat veld wijzigt",
              gedrag["naTypen"] == 1 and not gedrag["emailNogFout"], json.dumps(gedrag))

        # TT-258: het e-mailformaat wordt gecontroleerd vóór verzenden.
        formaat = page.evaluate("""async () => {
          showView('auth');
          clearFieldErrors('view-auth');
          document.getElementById('loginEmail').value = 'testeremail';
          document.getElementById('loginPassword').value = 'watdanook';
          await signIn();
          await new Promise(r => setTimeout(r, 60));
          const regel = document.querySelector('#view-auth .field-msg');
          return {
            tekst: regel ? regel.innerText.trim() : '',
            bijEmail: !!(regel && regel.previousElementSibling
                         && regel.previousElementSibling.id === 'loginEmail'),
            helpers: [typeof emailFormaatGeldig, typeof setFieldError,
                      typeof clearFieldErrors, typeof showFieldErrors].join(','),
            geldig: [emailFormaatGeldig('testeremail'), emailFormaatGeldig('a@b'),
                     emailFormaatGeldig('jouw@email.nl')].join(',')
          };
        }""")
        check("een verkeerd e-mailformaat wordt bij het veld gemeld (TT-258)",
              formaat["bijEmail"] and "geldig e-mailadres" in formaat["tekst"],
              json.dumps(formaat))
        check("emailFormaatGeldig wijst af wat geen adres is",
              formaat["geldig"] == "false,false,true", formaat["geldig"])
        check("de veldfout-functies bestaan app-breed",
              formaat["helpers"] == "function,function,function,function",
              formaat["helpers"])
        page.evaluate("clearFieldErrors('view-auth')")

        # De oude bannerelementen zijn weg (§2.10, dode code meteen weg).
        check("de rode bannerbalken zijn verdwenen",
              page.evaluate("!document.getElementById('authError') "
                            "&& !document.getElementById('resetError')"),
              "authError of resetError staat er nog")
        check("showAuthError() bestaat niet meer",
              page.evaluate("typeof showAuthError === 'undefined'"),
              "showAuthError is nog gedefinieerd")

        # De bandkant volgt dezelfde regels (huisstijl, Ronald 11-09-2026).
        bandkant = page.evaluate("""async () => {
          showView('bands');
          clearFieldErrors('view-bands');
          ['bandName', 'bandZip', 'bandCity'].forEach(
            i => { document.getElementById(i).value = ''; });
          bandState.genres = [];
          await saveBandRun();
          await new Promise(r => setTimeout(r, 80));
          return {
            velden: [...document.querySelectorAll('#view-bands .field-error')].map(e => e.id),
            regels: [...document.querySelectorAll('#view-bands .field-msg')].map(
              e => e.innerText.trim())
          };
        }""")
        check("het bandformulier markeert alle drie de velden tegelijk",
              bandkant["velden"] == ["bandName", "bandZip", "bandGenreField"],
              json.dumps(bandkant["velden"]))
        check("ook een keuzeveld (genre) krijgt de markering",
              len(bandkant["regels"]) == 3
              and bandkant["regels"][2] == "Kies minimaal \u00e9\u00e9n genre",
              json.dumps(bandkant["regels"], ensure_ascii=False))
        page.evaluate("clearFieldErrors('view-bands')")

        # TT-257: zonder aanhalingstekens een deel, mét aanhalingstekens exact.
        zoek = page.evaluate("""() => ({
          deel:      naamZoekTerm('Colin'),
          exact:     naamZoekTerm('"Colin"'),
          leeg:      naamZoekTerm('   '),
          legeQuote: naamZoekTerm('""'),
          m1: naamMatcht(naamZoekTerm('Colin'), 'Colinda', 'drummer12'),
          m2: naamMatcht(naamZoekTerm('"Colin"'), 'Colinda', 'drummer12'),
          m3: naamMatcht(naamZoekTerm('"Colin"'), 'Colin', 'drummer12'),
          m4: naamMatcht(naamZoekTerm('n d'), 'Colin', 'drummer12'),
          m5: naamMatcht(null, 'Colinda', 'drummer12')
        })""")
        check("zonder aanhalingstekens matcht een deel van de naam",
              zoek["deel"] == {"tekst": "colin", "exact": False}, json.dumps(zoek["deel"]))
        check("met aanhalingstekens moet het exact zijn",
              zoek["exact"] == {"tekst": "colin", "exact": True}, json.dumps(zoek["exact"]))
        check("een lege zoekterm is geen filter",
              zoek["leeg"] is None and zoek["legeQuote"] is None, json.dumps(zoek))
        check("'Colin' vindt Colinda nog steeds", zoek["m1"], "")
        check("'\"Colin\"' vindt Colinda niet meer", not zoek["m2"], "")
        check("'\"Colin\"' vindt Colin wel", zoek["m3"], "")
        check("een zoekterm matcht nooit over twee velden heen",
              not zoek["m4"], "'n d' matchte over de grens tussen fname en username")
        check("geen zoekterm sluit niemand uit", zoek["m5"], "")

        # TT-257 (besluit Ronald 12-09-2026): zoek je op naam, dan blijft de
        # straal staan. Bewuste uitzondering op TT-62.
        straal = page.evaluate("""async () => {
          showView('search');
          hasOwnProfile = false;
          window.TT_STUB.rpcResults.tt_resolve_search_origin = [{ lat: 52.0, lng: 4.3 }];
          let gevraagd = [];
          window.TT_STUB.rpcResults.tt_search_musicians_anon = (p) => {
            gevraagd.push(p.radius_km);
            return [];
          };
          document.getElementById('filterCity').value = 'Delft';
          document.getElementById('filterRadius').value = '5';
          document.getElementById('filterName').value = 'Colin';
          await runSearch();
          await new Promise(r => setTimeout(r, 200));
          const metNaam = { stralen: gevraagd.slice(),
                            tekst: document.getElementById('searchResults').innerText };
          gevraagd = [];
          document.getElementById('filterName').value = '';
          document.getElementById('filterRadius').value = '5';
          await runSearch();
          await new Promise(r => setTimeout(r, 300));
          return { metNaam, zonderNaam: gevraagd.slice() };
        }""")
        # Gemeten 12-09-2026: de RPC wordt hier twee keer aangeroepen met
        # dezelfde straal (een lopende auto-zoekopdracht uit een eerdere
        # controle in dit blok). Wat telt is dat er nooit een ruimere straal
        # bij zit — niet hoe vaak dezelfde straal wordt gevraagd.
        check("bij zoeken op naam blijft het bij de ingestelde straal",
              set(straal["metNaam"]["stralen"]) == {5},
              f"gevraagde stralen: {straal['metNaam']['stralen']}")
        check("zonder naam verruimt de app nog steeds wel (TT-62)",
              len(straal["zonderNaam"]) > 1, f"{straal['zonderNaam']}")
        check("de lege staat wijst dan naar de naam, niet naar de filters",
              "Deze muzikant staat er niet" in straal["metNaam"]["tekst"]
              and "binnen 5 km" in straal["metNaam"]["tekst"],
              straal["metNaam"]["tekst"][:200])
        page.evaluate("document.getElementById('filterName').value = ''")
        page.evaluate("window.TT_STUB.reset()")

        # ─────────────────────────────────────────────────────────────
        # Blok 13 — Je mediahoek: bannerteken, rijvorm en het mediascherm
        # TT-263 (13-09-2026, Ronald): "gebruiker kan niet zien welke link
        # welke video is", plus de keuze voor de bannerbalk en afspelen
        # binnen de app.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 13 — mediahoek: bannerteken, rijen en het mediascherm")

        # De naam van een video komt van oEmbed. In de testset gaat die niet
        # over het echte internet: het antwoord wordt hier nagebootst, zodat
        # de weg getoetst wordt en niet de bereikbaarheid van YouTube.
        page.route("**/oembed**", lambda r: r.fulfill(
            status=200, content_type="application/json",
            body=json.dumps({"title": "Testvideo van Ronald"})))

        page_errors.clear()
        media = page.evaluate("""async () => {
          showView('profieltegels');
          openTegelScreen('mediahoek');
          myMusicianId = 'm1';
          mhMediaFiles = [
            { name: 'foto.jpg', url: 'https://x/foto.jpg', path: 'p1', type: 'foto', uploading: false, inBanner: true },
            { name: 'clip.mp4', url: 'https://x/clip.mp4', path: 'p2', type: 'video', uploading: false, inBanner: false }
          ];
          mhMediaLinks = [
            { url: 'https://youtu.be/tAGnKpE4Nxk', inBanner: false },
            { url: 'https://www.instagram.com/p/abc/', inBanner: false }
          ];
          mhRenderMediaGrid();
          mhRenderLinksList();
          await new Promise(r => setTimeout(r, 250));

          const rij = document.querySelector('#mhLinksList .media-rij');
          const titel = rij.querySelector('.media-rij-titel');
          const mini = rij.querySelector('.media-mini img');
          const knop = rij.querySelector('.banner-btn');
          const st = getComputedStyle(titel);
          const tikvlak = getComputedStyle(knop, '::after');

          const tegel = document.querySelector('#mhMediaGrid .media-thumb');
          const tKnop = tegel.querySelector('.banner-btn').getBoundingClientRect();
          const tKruis = tegel.querySelector('.thumb-remove').getBoundingClientRect();
          const tVak = tegel.getBoundingClientRect();

          return {
            aantalRijen: document.querySelectorAll('#mhLinksList .media-rij').length,
            heeftBannerKnop: !!knop,
            knopUit: knop.getAttribute('aria-pressed'),
            miniIsYoutube: !!mini && mini.src.indexOf('img.youtube.com') === 0 + mini.src.indexOf('img.youtube.com'),
            miniSrc: mini ? mini.src : '',
            titelTekst: titel.textContent,
            titelEenRegel: st.whiteSpace === 'nowrap' && st.textOverflow === 'ellipsis',
            titelAttribuut: titel.getAttribute('title'),
            tikvlakBoven: tikvlak.top,
            adresVeld: !!rij.querySelector('input.media-rij-url'),
            tellerTekst: document.getElementById('mhBannerTeller').innerText,
            tegelKnopLinks: Math.round(tKnop.left - tVak.left),
            tegelKruisRechts: Math.round(tVak.right - tKruis.right),
            tegelKnopBoven: Math.round(tKnop.top - tVak.top),
          };
        }""")
        check("elke link is een rij met miniatuur", media["aantalRijen"] == 2, json.dumps(media)[:200])
        check("elke rij heeft het bannerteken", media["heeftBannerKnop"], "")
        check("niet gekozen staat op aria-pressed=false", media["knopUit"] == "false", media["knopUit"])
        check("een YouTube-link toont het echte beeld",
              "img.youtube.com" in media["miniSrc"], media["miniSrc"])
        check("de naam van de video komt in de rij",
              media["titelTekst"] == "Testvideo van Ronald", media["titelTekst"])
        check("de naam staat op één regel en kapt af met …", media["titelEenRegel"], "")
        check("de hele naam staat in het label bij aanwijzen",
              media["titelAttribuut"] is not None, "geen title-attribuut")
        check("het bannerteken heeft een tikvlak van 44px",
              media["tikvlakBoven"] == "-10px", media["tikvlakBoven"])
        check("het adres blijft bewerkbaar in de rij", media["adresVeld"], "")
        check("de teller noemt de grens van 6",
              "van 6" in media["tellerTekst"], media["tellerTekst"])
        check("op een tegel staat het teken linksboven",
              media["tegelKnopLinks"] <= 6 and media["tegelKnopBoven"] <= 6, json.dumps(media)[:200])
        check("op een tegel staat het kruis rechtsboven",
              media["tegelKruisRechts"] <= 6, str(media["tegelKruisRechts"]))

        keuze = page.evaluate("""async () => {
          const uit = {};
          // Ronald, 13-09-2026: "alleen de knop moet aan/uit gaan, verder
          // niets." Vasthouden welk element er stond, en na de tik kijken of
          // het nog dat élement is — hertekenen zou het vervangen.
          const rijVoor = document.querySelector('#mhLinksList .media-rij');
          const miniVoor = rijVoor.querySelector('.media-mini img');
          mhToggleLinkBanner(0);
          const rijNa = document.querySelector('#mhLinksList .media-rij');
          uit.zelfdeRij = rijVoor === rijNa && rijVoor.isConnected;
          uit.zelfdeMiniatuur = miniVoor === rijNa.querySelector('.media-mini img');
          uit.naTik = document.querySelector('#mhLinksList .banner-btn').getAttribute('aria-pressed');
          uit.geenGoudeRand = getComputedStyle(rijNa).borderTopColor === getComputedStyle(document.querySelectorAll('#mhLinksList .media-rij')[1]).borderTopColor;
          uit.tekenInTeller = !!document.querySelector('#mhBannerTeller .banner-teken svg');
          uit.tekenGoud = uit.tekenInTeller
            ? getComputedStyle(document.querySelector('#mhBannerTeller .bb-schijf')).fill
            : '';
          uit.teller = document.getElementById('mhBannerTeller').innerText;
          // Grens: twee staan aan, vul aan tot zes en probeer de zevende.
          mhMediaFiles = [1,2,3,4,5].map((n,i) => ({ name: 'f'+n, url: 'https://x/'+n+'.jpg', path: 'p'+n, type: 'foto', uploading: false, inBanner: true }));
          mhRenderMediaGrid();
          uit.voorGrens = bannerAantal(mhMediaFiles, mhMediaLinks);
          mhToggleLinkBanner(1);
          uit.naGrens = bannerAantal(mhMediaFiles, mhMediaLinks);
          uit.tweedeLink = mhMediaLinks[1].inBanner;
          uit.toast = (document.getElementById('appToast') || {}).textContent || '';
          // lege link mag niet in de banner
          mhMediaLinks.push({ url: '', inBanner: false });
          mhRenderLinksList();
          mhToggleLinkBanner(2);
          uit.legeLink = mhMediaLinks[2].inBanner;
          return uit;
        }""")
        check("tikken zet het teken aan", keuze["naTik"] == "true", keuze["naTik"])
        check("aan/uit tekent de lijst niet opnieuw",
              keuze["zelfdeRij"] and keuze["zelfdeMiniatuur"], json.dumps(keuze)[:200])
        check("een gekozen rij krijgt géén gouden rand", keuze["geenGoudeRand"], "")
        check("het bannerteken staat vóór de tellertekst", keuze["tekenInTeller"], "")
        check("en staat daar in de gouden stand",
              keuze["tekenGoud"] == "rgb(245, 197, 24)", keuze["tekenGoud"])
        # Eén foto stond al in de banner, dus na deze tik zijn het er twee.
        check("de teller telt mee", "Gekozen: 2" in keuze["teller"], keuze["teller"])
        check("zes is de grens", keuze["voorGrens"] == 6 and keuze["naGrens"] == 6,
              f"voor {keuze['voorGrens']}, na {keuze['naGrens']}")
        check("de zevende keuze wordt geweigerd", keuze["tweedeLink"] is False, "")
        check("en dat wordt gemeld", "maximaal 6" in keuze["toast"], keuze["toast"])
        check("een lege link kan niet in de banner", keuze["legeLink"] is False, "")

        opslaan = page.evaluate("""async () => {
          window.TT_STUB.calls = [];
          mhAvatarUrl = null;
          mhSnapshot = '';
          await saveJeMediahoek();
          // De stub bootst tt_save_musician_koppelingen na (TT-281): de oude
          // rijen gaan weg, dus wat er staat is precies wat er is weggeschreven.
          const rijen = window.TT_STUB.data.musician_media || [];
          return {
            aantal: rijen.length,
            heeftVlag: rijen.every(r => 'in_banner' in r),
            gekozen: rijen.filter(r => r.in_banner).length,
          };
        }""")
        check("opslaan schrijft de bannerkeuze mee", opslaan["heeftVlag"], json.dumps(opslaan))
        check("en bewaart precies de gekozen items",
              opslaan["gekozen"] == 6, json.dumps(opslaan))

        speler = page.evaluate("""async () => {
          const uit = {};
          openMediaSpeler('https://youtu.be/tAGnKpE4Nxk', 'link', 'Testvideo', 'YouTube');
          const modal = document.getElementById('mediaSpelerModal');
          const frame = modal.querySelector('iframe');
          uit.open = modal.classList.contains('visible');
          uit.nocookie = frame ? frame.src.indexOf('https://www.youtube-nocookie.com/embed/') === 0 : false;
          uit.titel = document.getElementById('mediaSpelerTitel').textContent;
          // initModalStapeling() werkt met een MutationObserver; die draait pas
          // na de huidige taak. Even wachten, anders meet de toets te vroeg.
          await new Promise(r => setTimeout(r, 50));
          uit.laag = modal.style.zIndex !== '';
          closeMediaSpeler();
          uit.dicht = !modal.classList.contains('visible');
          uit.leeg = document.getElementById('mediaSpelerBeeld').innerHTML === '';
          // een platform zonder speler
          openMediaSpeler('https://www.instagram.com/p/abc/', 'link', null, 'Instagram');
          uit.uitleg = !!modal.querySelector('.media-speler-uitleg');
          uit.knop = (modal.querySelector('#mediaSpelerVoet .btn') || {}).textContent || '';
          uit.geenFrame = !modal.querySelector('iframe');
          closeMediaSpeler();
          // eigen video
          openMediaSpeler('https://x/clip.mp4', 'video', 'clip.mp4', '');
          uit.eigenVideo = !!modal.querySelector('video');
          closeMediaSpeler();
          return uit;
        }""")
        check("het mediascherm opent", speler["open"], "")
        check("YouTube speelt via de cookieloze variant", speler["nocookie"], "")
        check("de naam staat in de kop van het scherm", speler["titel"] == "Testvideo", speler["titel"])
        check("het scherm krijgt een laag van de modalstapeling (TT-229)", speler["laag"], "")
        check("sluiten stopt het afspelen", speler["dicht"] and speler["leeg"], "")
        check("een platform zonder speler krijgt uitleg",
              speler["uitleg"] and speler["geenFrame"], "")
        check("met één knop naar het platform", "Instagram" in speler["knop"], speler["knop"])
        check("een eigen video speelt in hetzelfde scherm", speler["eigenVideo"], "")

        # TT-264 (13-09-2026, Ronald): de terugknop liet het geluid doorspelen.
        controle = page.evaluate("""async () => {
          const uit = {};
          const modal = document.getElementById('mediaSpelerModal');
          const beeld = document.getElementById('mediaSpelerBeeld');
          // 1. terugknop van de browser
          openMediaSpeler('https://youtu.be/tAGnKpE4Nxk', 'link', 'Test', 'YouTube');
          await new Promise(r => setTimeout(r, 50));
          window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'myprofile' } }));
          await new Promise(r => setTimeout(r, 50));
          uit.naTerug = !modal.classList.contains('visible');
          uit.naTerugLeeg = beeld.innerHTML === '';
          // 2. Escape
          openMediaSpeler('https://youtu.be/tAGnKpE4Nxk', 'link', 'Test', 'YouTube');
          await new Promise(r => setTimeout(r, 50));
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          await new Promise(r => setTimeout(r, 50));
          uit.naEscape = !modal.classList.contains('visible') && beeld.innerHTML === '';
          // 3. wissel van view
          openMediaSpeler('https://x/clip.mp4', 'video', 'clip', '');
          await new Promise(r => setTimeout(r, 50));
          showView('search');
          await new Promise(r => setTimeout(r, 50));
          uit.naViewWissel = !modal.classList.contains('visible') && beeld.innerHTML === '';
          // 4. een modal zonder data-close gedraagt zich als voorheen
          const bevestig = document.getElementById('confirmModal');
          bevestig.classList.add('visible');
          window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'myprofile' } }));
          await new Promise(r => setTimeout(r, 50));
          uit.gewoneModal = !bevestig.classList.contains('visible');
          return uit;
        }""")
        check("de terugknop sluit het mediascherm",
              controle["naTerug"], "scherm bleef open")
        check("en stopt beeld en geluid", controle["naTerugLeeg"], "beeldvlak niet leeggemaakt")
        check("Escape doet hetzelfde", controle["naEscape"], "")
        check("een wissel van view laat geen video achter", controle["naViewWissel"], "")
        check("een modal zonder eigen sluitfunctie gedraagt zich als voorheen",
              controle["gewoneModal"], "")
        check("geen paginafouten in blok 13", not page_errors, "; ".join(page_errors)[:200])

        page.evaluate("window.TT_STUB.reset()")

        # ─────────────────────────────────────────────────────────────
        # Blok 15 — de bannerbalk op het profiel (TT-265, 15-09-2026)
        # Blok 14 is gereserveerd voor de huisstijl-check van TT-262.
        # Besluiten van Ronald: maximaal zes, swipen, stippen eronder,
        # doorschuiven na vijf seconden, pauze zodra hij zelf iets doet,
        # geen autoplay, en geen balk als er niets gekozen is.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 15 — de bannerbalk op het profiel")
        page_errors.clear()

        banner = page.evaluate("""async () => {
          const basis = (media) => ({
            id: 'm9', fname: 'Sanne', username: 'sannedrums', city: 'Den Haag',
            bio: 'Test', profile_color: '#f5c518', avatar_url: null, age: 17,
            updated_at: new Date().toISOString(),
            musician_instruments: [{ instrument: 'Drums', niveau: 3 }],
            musician_genres: [{ genre: 'Rock' }],
            musician_songs: [], musician_media: media
          });
          // In de body, niet in een view: een verborgen view heeft geen
          // breedte, en dan komt een gezette scrollpositie niet aan — precies
          // de valkuil die huisstijl §7.1 bij het wiel beschrijft.
          const vak = document.createElement('div');
          vak.style.cssText = 'width:375px;position:absolute;left:0;top:0;';
          document.body.appendChild(vak);

          // 1. Niets gekozen: geen balk.
          vak.innerHTML = buildMusicianDetailHTML(basis([
            { media_type: 'foto', url: 'https://x/a.jpg', platform: null, in_banner: false }
          ]), true);
          const zonder = !vak.querySelector('.profiel-banner');

          // 2. Vier gekozen items, elk van een ander soort.
          vak.innerHTML = buildMusicianDetailHTML(basis([
            { media_type: 'foto',  url: 'https://x/a.jpg',   platform: null, in_banner: true },
            { media_type: 'video', url: 'https://x/clip.mp4', platform: null, in_banner: true },
            { media_type: 'link',  url: 'https://youtu.be/tAGnKpE4Nxk', platform: 'YouTube', in_banner: true },
            { media_type: 'link',  url: 'https://open.spotify.com/track/abc', platform: 'Spotify', in_banner: true },
            { media_type: 'foto',  url: 'https://x/b.jpg', platform: null, in_banner: false }
          ]), true);
          profielBannerStarten(vak);
          await new Promise(r => setTimeout(r, 60));

          const spoor = vak.querySelector('.pb-spoor');
          const items = vak.querySelectorAll('.pb-item');
          const stippen = vak.querySelectorAll('.pb-stip');
          const sSpoor = getComputedStyle(spoor);
          const sItem = getComputedStyle(items[0]);
          const sStip = getComputedStyle(stippen[0]);
          const tikvlak = getComputedStyle(stippen[0], '::after');
          const video = vak.querySelector('.pb-item video');
          const kaart = vak.querySelector('.pb-kaart');

          const uit = {
            zonderKeuzeGeenBalk: zonder,
            aantalItems: items.length,
            aantalStippen: stippen.length,
            eersteStipAan: stippen[0].classList.contains('aan'),
            tweedeStipUit: !stippen[1].classList.contains('aan'),
            snapX: sSpoor.scrollSnapType.indexOf('x') === 0,
            overscroll: sSpoor.overscrollBehaviorX,
            itemVolleBreedte: Math.round(items[0].getBoundingClientRect().width) === Math.round(spoor.clientWidth),
            spoorBreedte: Math.round(spoor.clientWidth),
            verhouding: sItem.aspectRatio.replace(/\s/g, ''),
            videoGeenAutoplay: video ? (!video.autoplay && !video.hasAttribute('autoplay')) : null,
            videoStaatStil: video ? video.paused : null,
            videoLabel: video ? video.parentElement.querySelector('.pb-label').textContent : null,
            youtubeMiniatuur: !!vak.querySelector('.pb-item img[src*="img.youtube.com"]'),
            kaartVoorSpotify: !!kaart,
            kaartPlatform: kaart ? kaart.querySelector('.pb-kaart-platform').textContent : '',
            stipTikvlakBreed: tikvlak.width,
            stipTikvlakHoog: tikvlak.height,
            stipGoud: sStip.backgroundColor,
            stipGrijs: getComputedStyle(stippen[1]).backgroundColor,
          };

          // 3. De stippen volgen het swipen.
          spoor.scrollLeft = spoor.clientWidth * 2;
          spoor.dispatchEvent(new Event('scroll'));
          await new Promise(r => setTimeout(r, 30));
          uit.stipVolgtSwipe = stippen[2].classList.contains('aan') && !stippen[0].classList.contains('aan');

          // 4. Zodra de gebruiker zelf iets doet, stopt het doorschuiven.
          uit.liepEerst = profielBannerTijden.has(spoor.id);
          spoor.dispatchEvent(new Event('pointerdown'));
          uit.staatDaarnaStil = !profielBannerTijden.has(spoor.id);

          // 5. Boven de zes gekozen items telt alleen de eerste zes.
          const zeven = [];
          for (let i = 0; i < 7; i++) zeven.push({ media_type: 'foto', url: 'https://x/' + i + '.jpg', platform: null, in_banner: true });
          vak.innerHTML = buildMusicianDetailHTML(basis(zeven), true);
          uit.grensZes = vak.querySelectorAll('.pb-item').length;

          // 6. Foto's en video's staan in één raster, links eronder.
          vak.innerHTML = buildMusicianDetailHTML(basis([
            { media_type: 'foto',  url: 'https://x/a.jpg', platform: null, in_banner: false },
            { media_type: 'video', url: 'https://x/c.mp4', platform: null, in_banner: false },
            { media_type: 'link',  url: 'https://youtu.be/tAGnKpE4Nxk', platform: 'YouTube', in_banner: false }
          ]), true);
          const titels = [...vak.querySelectorAll('.profile-media-title')].map(e => e.textContent);
          uit.mediaTitels = titels;
          uit.fotoEnVideoSamen = vak.querySelectorAll('.profile-media')[0].querySelectorAll('.profile-media-tegel').length;
          uit.videoOpentMediascherm = (vak.querySelector('.profile-media-tegel[onclick*="openMediaSpeler"]') !== null);
          uit.geenLosseControls = vak.querySelectorAll('.profile-media video[controls]').length;

          // 7. De bijgewerkt-regel: eigen grijze regel, geen groene balk.
          const vers = vak.querySelector('.profile-fresh');
          uit.versRegel = vers ? vers.textContent : null;
          uit.versGrijs = vers ? getComputedStyle(vers).color : '';
          uit.muted = getComputedStyle(document.documentElement).getPropertyValue('--muted').trim();
          uit.geenGroeneBalk = !vak.querySelector('.freshness-bar') && !vak.querySelector('.freshness-dot');

          vak.remove();
          return uit;
        }""")

        check("zonder gekozen items staat er geen balk", banner["zonderKeuzeGeenBalk"], "")
        check("elk gekozen item krijgt een vlak", banner["aantalItems"] == 4, str(banner["aantalItems"]))
        check("en elk vlak een stip", banner["aantalStippen"] == 4, str(banner["aantalStippen"]))
        check("de eerste stip staat aan, de rest uit",
              banner["eersteStipAan"] and banner["tweedeStipUit"], "")
        check("de actieve stip is goud", banner["stipGoud"] == "rgb(245, 197, 24)", banner["stipGoud"])
        check("de andere stippen zijn grijs", banner["stipGrijs"] == "rgb(85, 85, 85)", banner["stipGrijs"])
        check("een stip heeft een tikvlak van 44px",
              banner["stipTikvlakBreed"] == "44px" and banner["stipTikvlakHoog"] == "44px",
              banner["stipTikvlakBreed"] + " x " + banner["stipTikvlakHoog"])
        check("swipen gaat via scroll-snap, niet via een eigen touchmove", banner["snapX"], "")
        check("het spoor houdt het scrollen binnen (huisstijl §16)",
              banner["overscroll"] == "contain", banner["overscroll"])
        check("een vlak vult de hele breedte",
              banner["itemVolleBreedte"] and banner["spoorBreedte"] == 375,
              "spoor " + str(banner["spoorBreedte"]) + "px")
        check("de balk is 5:2, niet 16:9", banner["verhouding"] == "5/2", banner["verhouding"])
        check("een video in de banner speelt niet vanzelf",
              banner["videoGeenAutoplay"] and banner["videoStaatStil"], json.dumps(banner)[:200])
        check("en is als video herkenbaar zonder icoon", banner["videoLabel"] == "Video", str(banner["videoLabel"]))
        check("een YouTube-link toont zijn miniatuur", banner["youtubeMiniatuur"], "")
        check("een link zonder miniatuur krijgt een kaart met de platformnaam",
              banner["kaartVoorSpotify"] and banner["kaartPlatform"] == "Spotify", banner["kaartPlatform"])
        check("de stippen volgen het swipen", banner["stipVolgtSwipe"], "")
        check("de balk schuift uit zichzelf door", banner["liepEerst"], "")
        check("en stopt zodra de gebruiker zelf iets doet", banner["staatDaarnaStil"], "")
        check("boven zes gekozen items telt alleen de eerste zes",
              banner["grensZes"] == 6, str(banner["grensZes"]))
        check("foto's en video's staan in één raster",
              banner["mediaTitels"] == ["Foto's en video's", "Links"], json.dumps(banner["mediaTitels"]))
        check("met een tegel per foto en per video", banner["fotoEnVideoSamen"] == 2, str(banner["fotoEnVideoSamen"]))
        check("een video in het raster opent het mediascherm", banner["videoOpentMediascherm"], "")
        check("en speelt niet meer los in de pagina", banner["geenLosseControls"] == 0, str(banner["geenLosseControls"]))
        check("bijgewerkt is een eigen grijze regel",
              banner["versRegel"] == "Deze week bijgewerkt", str(banner["versRegel"]))
        check("in de grijstint van de huisstijl",
              banner["versGrijs"] == "rgb(136, 136, 136)", banner["versGrijs"])
        check("de groene balk met kloppende stip is weg", banner["geenGroeneBalk"], "")

        standen = page.evaluate("""() => {
          const d = (n) => new Date(Date.now() - n * 86400000).toISOString();
          return [0, 6, 7, 29, 30, 89, 90, 400].map(n => relativeUpdatedLabel(d(n)));
        }""")
        check("vier standen, in de door Ronald vastgelegde bewoording",
              standen == ["Deze week bijgewerkt", "Deze week bijgewerkt",
                          "Deze maand bijgewerkt", "Deze maand bijgewerkt",
                          "Binnen 3 maanden bijgewerkt", "Binnen 3 maanden bijgewerkt",
                          "+3 maanden geleden bijgewerkt", "+3 maanden geleden bijgewerkt"],
              json.dumps(standen))
        # TT-267 (15-09-2026, Ronald): "hij blijft zo staan." De balk bleef
        # halverwege twee vlakken hangen, waardoor het eerste beeld nog maar
        # een streepje breed was. De nakijkstap zet dat binnen een cyclus
        # recht, ongeacht de oorzaak.
        rechtzet = page.evaluate("""async () => {
          const basis = {
            id: 'm9', fname: 'Sanne', username: 'sannedrums', city: 'Den Haag',
            bio: 'Test', profile_color: '#f5c518', avatar_url: null, age: 17,
            updated_at: new Date().toISOString(),
            musician_instruments: [], musician_genres: [], musician_songs: [],
            musician_media: [1,2,3].map(n => ({ media_type: 'foto', url: 'https://x/' + n + '.jpg', platform: null, in_banner: true }))
          };
          const vak = document.createElement('div');
          vak.style.cssText = 'width:375px;position:absolute;left:0;top:0;';
          document.body.appendChild(vak);
          vak.innerHTML = buildMusicianDetailHTML(basis, true);
          profielBannerStarten(vak);
          const spoor = vak.querySelector('.pb-spoor');
          // Halverwege twee vlakken zetten, zoals op Ronalds telefoon. Het
          // vastzetten van scroll-snap is nodig om dat na te bootsen: deze
          // browser snapt zelf meteen terug, de zijne deed dat niet. Zo toetst
          // dit blok de nakijkstap van de app en niet die van de browser.
          spoor.style.scrollSnapType = 'none';
          spoor.scrollLeft = Math.round(spoor.clientWidth * 0.5);
          const scheefVoor = Math.round(spoor.scrollLeft % spoor.clientWidth);
          await new Promise(r => setTimeout(r, 6200));
          const breedte = spoor.clientWidth;
          const rest = Math.round(spoor.scrollLeft % breedte);
          vak.remove();
          return { scheefVoor, restNa: rest, breedte };
        }""")
        check("een balk die halverwege staat, zet zichzelf recht",
              rechtzet["scheefVoor"] > 2 and rechtzet["restNa"] <= 2, json.dumps(rechtzet))

        vorm = page.evaluate("""() => {
          const basis = {
            id: 'm9', fname: 'S', username: 's', city: 'Den Haag', bio: '',
            profile_color: '#f5c518', avatar_url: null, age: 17,
            updated_at: new Date().toISOString(),
            musician_instruments: [], musician_genres: [], musician_songs: [],
            musician_media: [{ media_type: 'video', url: 'https://x/c.mp4', platform: null, in_banner: true }]
          };
          const vak = document.createElement('div');
          vak.style.cssText = 'width:375px;position:absolute;left:0;top:0;';
          document.body.appendChild(vak);
          vak.innerHTML = buildMusicianDetailHTML(basis, true);
          const st = getComputedStyle(vak.querySelector('.pb-label'));
          const item = getComputedStyle(vak.querySelector('.pb-item'));
          const uit = { wrap: st.whiteSpace, afkap: st.textOverflow, snapStop: item.scrollSnapStop };
          vak.remove();
          return uit;
        }""")
        check("de titel staat op één regel en kapt af met …",
              vorm["wrap"] == "nowrap" and vorm["afkap"] == "ellipsis", json.dumps(vorm))
        check("geen scroll-snap-stop die een lopende sprong afbreekt",
              vorm["snapStop"] == "normal", vorm["snapStop"])

        kruis = page.evaluate("""() => {
          const modal = document.getElementById('musicianModal');
          modal.classList.add('visible');
          const k = modal.querySelector('.modal-close').getBoundingClientRect();
          const h = document.getElementById('navMenuBtn').getBoundingClientRect();
          modal.classList.remove('visible');
          // Horizontaal vergelijken we de rechterrand, niet het midden: de
          // hamburgerknop is 48px breed en het kruis 33px, dus hun middens
          // liggen per definitie niet gelijk. Beide staan met hun rechterrand
          // tegen dezelfde marge, precies zoals in de gewone kop.
          return {
            kruisRechts: Math.round(window.innerWidth - k.right),
            kruisMidY: Math.round(k.top + k.height / 2),
            hamRechts: Math.round(window.innerWidth - h.right),
            hamMidY: Math.round(h.top + h.height / 2),
          };
        }""")
        check("het kruis staat op de plek van het hamburgermenu",
              abs(kruis["kruisRechts"] - kruis["hamRechts"]) <= 2 and abs(kruis["kruisMidY"] - kruis["hamMidY"]) <= 2,
              json.dumps(kruis))

        # TT-268 (15-09-2026, Ronald): 12px lucht boven en onder het woordmerk,
        # gouden balk weg, en het profiel van iemand anders houdt de koprij.
        kop = page.evaluate("""() => {
          const h = document.querySelector('header');
          const logo = h.querySelector('.logo');
          const knop = document.getElementById('navMenuBtn');
          const hb = h.getBoundingClientRect(), lb = logo.getBoundingClientRect(), kb = knop.getBoundingClientRect();
          return {
            boven: Math.round(lb.top - hb.top),
            onder: Math.round(hb.bottom - lb.bottom),
            kopHoogte: Math.round(hb.height),
            knopMidY: Math.round(kb.top + kb.height / 2),
            logoMidY: Math.round(lb.top + lb.height / 2),
            knopRechts: Math.round(window.innerWidth - kb.right),
          };
        }""")
        check("12px lucht boven en onder het woordmerk",
              kop["boven"] == 12 and kop["onder"] == 12, json.dumps(kop))
        check("de kop is daarmee 68px hoog", kop["kopHoogte"] == 68, str(kop["kopHoogte"]))
        check("de hamburger staat op de middellijn van het woordmerk",
              abs(kop["knopMidY"] - kop["logoMidY"]) <= 1, json.dumps(kop))

        profielkop = page.evaluate("""() => {
          const basis = {
            id: 'm9', fname: 'S', username: 's', city: 'Den Haag', bio: '',
            profile_color: '#f5c518', avatar_url: null, age: 17,
            updated_at: new Date().toISOString(),
            musician_instruments: [], musician_genres: [], musician_songs: [],
            musician_media: [{ media_type: 'foto', url: 'https://x/a.jpg', platform: null, in_banner: true }]
          };
          const vak = document.createElement('div');
          vak.style.cssText = 'width:375px;position:absolute;left:0;top:0;';
          document.body.appendChild(vak);
          vak.innerHTML = buildMusicianDetailHTML(basis, true);
          const goud = !!vak.querySelector('.profile-header-band');
          const eerste = vak.firstElementChild.className;
          vak.remove();
          const mk = document.querySelector('#musicianModalBox .modal-kop');
          return {
            goudenBalk: goud,
            eersteElement: eerste,
            koprijInModal: !!mk,
            woordmerkInModal: !!(mk && mk.querySelector('.logo')),
            kruisInKoprij: !!(mk && mk.querySelector('.modal-close')),
            // TT-287: relative, niet static — anders dekt het tikvlak het hele venster.
            kruisStatisch: mk ? getComputedStyle(mk.querySelector('.modal-close')).position : ''
          };
        }""")
        check("de gouden balk bovenaan het profiel is weg", not profielkop["goudenBalk"], "")
        check("de hero is nu het eerste element van het profiel",
              profielkop["eersteElement"] == "profiel-banner", profielkop["eersteElement"])
        check("het profiel van iemand anders houdt de koprij met het woordmerk",
              profielkop["koprijInModal"] and profielkop["woordmerkInModal"], json.dumps(profielkop))
        check("met het sluiten-kruisje in die rij, niet los erboven",
              profielkop["kruisInKoprij"] and profielkop["kruisStatisch"] == "relative",
              json.dumps(profielkop))

        # TT-269 (15-09-2026, Ronald): "voer dit door in de hele app."
        appbreed = page.evaluate("""() => {
          const bm = document.getElementById('bandModalBox');
          const mk = bm ? bm.querySelector('.modal-kop') : null;
          showView('profieltegels');
          const m = document.querySelector('#view-profieltegels main');
          const sm = getComputedStyle(m);
          return {
            gouddenBalkenOver: document.querySelectorAll('.hero-band').length,
            bandKoprij: !!mk,
            bandWoordmerk: !!(mk && mk.querySelector('.logo')),
            bandKruisInRij: !!(mk && mk.querySelector('.modal-close')),
            bandScrollArea: !!(bm && bm.querySelector('.modal-scroll-area')),
            mainBoven: sm.paddingTop,
            mainZij: sm.paddingLeft,
          };
        }""")
        check("geen enkele gouden balk meer in Profiel bewerken",
              appbreed["gouddenBalkenOver"] == 0, str(appbreed["gouddenBalkenOver"]))
        check("Profiel bewerken begint direct onder de kop",
              appbreed["mainBoven"] == "0px" and appbreed["mainZij"] == "16px", json.dumps(appbreed))
        check("het bandprofiel heeft dezelfde koprij als het muzikantprofiel",
              appbreed["bandKoprij"] and appbreed["bandWoordmerk"] and appbreed["bandKruisInRij"],
              json.dumps(appbreed))
        check("en zijn inhoud scrolt onder die koprij door",
              appbreed["bandScrollArea"], json.dumps(appbreed))

        check("geen paginafouten in blok 15", not page_errors, "; ".join(page_errors)[:200])

        page.evaluate("window.TT_STUB.reset()")

        # ─────────────────────────────────────────────────────────────
        # Blok 16 — het gesprek op de telefoon (TT-271, 16-09-2026)
        # Besluiten van Ronald: onderbalk weg tijdens typen, naam bovenin
        # zichtbaar en tikbaar, geen toetsenbord zonder tik op het veld.
        # Een aparte context met aanraakscherm: alleen daar geldt de regel.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 16 — het gesprek op de telefoon")
        tctx = browser.new_context(viewport={"width": 390, "height": 844},
                                   is_mobile=True, has_touch=True)
        tp = tctx.new_page()
        t_errors = []
        tp.on("pageerror", lambda e: t_errors.append(str(e)))
        tp.route("**/supabase-js@2/**", lambda r: r.fulfill(
            status=200, content_type="application/javascript", body=stub_js))
        for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**",
                    "**/api.pdok.nl/**", "**/itunes.apple.com/**"):
            tp.route(pat, lambda r: r.abort())
        tp.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load")
        tp.wait_for_timeout(400)

        gesprek = tp.evaluate("""async () => {
          window.getMyMusicianId = async () => 'm1';
          window.openMusicianModal = (id) => { window.__geopend = id; };
          document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
          document.getElementById('view-messages').classList.add('active');
          const lijst = [];
          for (let i = 0; i < 30; i++) lijst.push({ id: 'x' + i, sender_id: i % 2 ? 'm1' : 'm2',
            recipient_id: i % 2 ? 'm2' : 'm1', body: 'Bericht ' + i,
            created_at: new Date(Date.now() - (30 - i) * 60000).toISOString(), read_at: null });
          window.TT_STUB.data.messages = lijst;
          await openConversation('m2', 'Dylan de Vries', '#f5c518', '', false, false);
          await new Promise(r => setTimeout(r, 100));
          const invoer = document.getElementById('messagesReplyInput');
          const r = { focusNaOpenen: document.activeElement === invoer };
          const laatste = document.getElementById('messagesThreadList').lastElementChild.getBoundingClientRect();
          const voetje = document.querySelector('#messagesThreadPanel .messages-thread-footer').getBoundingClientRect();
          r.laatsteOnder = Math.round(laatste.bottom);
          r.voetBoven = Math.round(voetje.top);
          r.voetOnderVoor = Math.round(innerHeight - voetje.bottom);
          r.bodyOnder = parseFloat(getComputedStyle(document.body).paddingBottom);
          const nav = document.getElementById('appBottomNav');
          r.navVoor = getComputedStyle(nav).display;
          invoer.focus();
          await new Promise(r => setTimeout(r, 30));
          r.navTijdens = getComputedStyle(nav).display;
          const kop = document.querySelector('.app-topbar').getBoundingClientRect();
          const naam = document.getElementById('messagesThreadName').getBoundingClientRect();
          r.kopOnder = kop.bottom;
          r.naamBoven = naam.top;
          r.naamZichtbaar = naam.top >= kop.bottom - 1 && naam.bottom <= innerHeight;
          const voet = document.querySelector('#messagesThreadPanel .messages-thread-footer').getBoundingClientRect();
          r.voetOnder = Math.round(innerHeight - voet.bottom);
          invoer.blur();
          await new Promise(r => setTimeout(r, 30));
          r.navNa = getComputedStyle(nav).display;
          document.getElementById('messagesThreadName').click();
          r.naamOpent = window.__geopend;
          window.__geopend = null;
          document.getElementById('messagesThreadAvatar').click();
          r.fotoOpent = window.__geopend;
          window.__geopend = null;
          await openConversation('m2', 'Verwijderd', '#f5c518', '', false, true);
          document.getElementById('messagesThreadName').click();
          r.verwijderdOpent = window.__geopend;
          openMessageComposer('m2', 'Dylan');
          await new Promise(r => setTimeout(r, 120));
          r.modalFocus = document.activeElement === document.getElementById('messageComposerBody');
          // TT-305 (22-09-2026): openConversation() zonder gesprekspartner
          // mag niets doen. Deed hij dat wel, dan vroeg hij de database om
          // recipient_id=eq.null en toonde hij "Gesprek laden is niet gelukt".
          await openConversation('m2', 'Dylan de Vries', '#f5c518', '', false, false);
          await new Promise(r => setTimeout(r, 80));
          await openConversation(null, 'Niemand');
          await new Promise(r => setTimeout(r, 80));
          r.leegId = activeConversationId;
          r.leegNaam = document.getElementById('messagesThreadName').textContent;
          r.leegFout = document.getElementById('messagesThreadList').innerHTML.includes('niet gelukt');
          return r;
        }""")
        check("het toetsenbord komt niet op bij het openen van een gesprek",
              not gesprek["focusNaOpenen"], json.dumps(gesprek))
        check("ook niet bij het openen van 'Stuur een bericht'",
              not gesprek["modalFocus"], json.dumps(gesprek))
        check("het laatste bericht staat helemaal boven het invoerveld (TT-272)",
              gesprek["laatsteOnder"] <= gesprek["voetBoven"], json.dumps(gesprek))
        check("het invoerveld sluit aan op de onderbalk (TT-272)",
              gesprek["voetOnderVoor"] == gesprek["bodyOnder"], json.dumps(gesprek))
        check("de onderbalk staat er vóór het typen",
              gesprek["navVoor"] != "none", gesprek["navVoor"])
        check("de onderbalk is weg tijdens het typen",
              gesprek["navTijdens"] == "none", gesprek["navTijdens"])
        check("en komt terug na het typen",
              gesprek["navNa"] != "none", gesprek["navNa"])
        check("het invoerveld zakt mee naar de onderrand",
              gesprek["voetOnder"] == 0, str(gesprek["voetOnder"]))
        check("de naam staat tijdens het typen direct onder de kop",
              gesprek["naamZichtbaar"], json.dumps(gesprek))
        check("tik op de naam opent het profiel",
              gesprek["naamOpent"] == "m2", str(gesprek["naamOpent"]))
        check("tik op de foto opent het profiel",
              gesprek["fotoOpent"] == "m2", str(gesprek["fotoOpent"]))
        check("bij een verwijderd account opent er niets",
              gesprek["verwijderdOpent"] is None, str(gesprek["verwijderdOpent"]))
        check("een gesprek zonder gesprekspartner doet niets (TT-305)",
              gesprek["leegId"] == "m2" and gesprek["leegNaam"] == "Dylan de Vries"
              and not gesprek["leegFout"], json.dumps(gesprek))
        muis = page.evaluate("""() => {
          document.getElementById('messagesReplyInput').focus();
          const r = document.body.classList.contains('toetsenbord-open');
          document.getElementById('messagesReplyInput').blur();
          return r;
        }""")
        check("met een muis blijft de onderbalk staan", not muis, str(muis))
        check("geen paginafouten in blok 16", not t_errors, "; ".join(t_errors)[:200])
        tp.screenshot(path=os.path.join(os.environ.get("TT_SHOTS", "/tmp"), "blok16-typen.png"))
        tctx.close()

        # ─────────────────────────────────────────────────────────────
        # Blok 17 — tellingen en het verplicht-teken (TT-273, TT-274)
        # "1 nummers" mag niet. Het rode sterretje staat naast
        # "Mijn Instrumenten", nooit eronder — in de wizard én in
        # Profiel bewerken, op een smal scherm.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 17 — tellingen en het verplicht-teken")
        page_errors.clear()
        telling = page.evaluate("""() => {
          const basis = (n) => ({
            id: 'm9', fname: 'Sanne', username: 'sannedrums', city: 'Den Haag',
            bio: 'Test', profile_color: '#f5c518', avatar_url: null, age: 17,
            updated_at: new Date().toISOString(),
            musician_instruments: [{ instrument: 'Drums', niveau: 3 }],
            musician_genres: [{ genre: 'Rock' }], musician_media: [],
            musician_songs: Array.from({ length: n }, (_, i) =>
              ({ artist: 'A', title: 'T' + i, level: 'podiumklaar' }))
          });
          const vak = document.createElement('div');
          document.body.appendChild(vak);
          const kop = (n) => {
            vak.innerHTML = buildMusicianDetailHTML(basis(n), false);
            return vak.querySelector('.profile-songs-title').textContent.trim();
          };
          const uit = { een: kop(1), twee: kop(2) };
          vak.remove();
          return uit;
        }""")
        check("één nummer: 'Repertoire (1 nummer)'",
              telling["een"] == "Repertoire (1 nummer)", telling["een"])
        check("twee nummers: 'Repertoire (2 nummers)'",
              telling["twee"] == "Repertoire (2 nummers)", telling["twee"])

        sctx = browser.new_context(viewport={"width": 344, "height": 700})
        sp = sctx.new_page()
        sp.route("**/supabase-js@2/**", lambda r: r.fulfill(
            status=200, content_type="application/javascript", body=stub_js))
        for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**"):
            sp.route(pat, lambda r: r.abort())
        sp.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load")
        sp.wait_for_timeout(300)
        sterren = sp.evaluate("""() => {
          const uit = [];
          for (const id of ['instrumentPickerField', 'wspInstrumentField']) {
            const lab = document.getElementById(id).closest('.field').querySelector('label');
            let n = lab;
            while (n) { n.style.display = 'block'; n.classList.add('active'); n = n.parentElement; }
            lab.style.display = 'flex';
            const tekst = lab.querySelector('span');
            // De ster moet op dezelfde regel staan als het eerste woord.
            // Het vak zelf meten zegt niets: dat groeit mee met de ster.
            const r = document.createRange();
            r.selectNodeContents(tekst.firstChild);
            const woord = r.getClientRects()[0];
            const ster = tekst.querySelector('.req').getBoundingClientRect();
            uit.push({ id, eenRegel: Math.abs(ster.top - woord.top) <= 4,
                       sterTop: ster.top, woordTop: woord.top });
          }
          return uit;
        }""")
        for s in sterren:
            check(f"sterretje naast 'Mijn Instrumenten' op 344px ({s['id']})",
                  s["eenRegel"], str(s))
        sctx.close()
        check("geen paginafouten in blok 17", not page_errors, "; ".join(page_errors)[:200])

        # ─────────────────────────────────────────────────────────────
        # Blok 18 — het hele wielpaneel draait mee (TT-275) en de
        # standaardstraal is 10 km (TT-276), 16-09-2026.
        # Naast het getal en over "km" moet het wiel ook reageren; anders
        # bedekt de duim het getal dat je kiest.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 18 — het hele wielpaneel draait mee, standaardstraal 10 km")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        # De velden lezen uit het HTML-bestand zelf: een verborgen veld neemt
        # een eerder gezette waarde over als beginwaarde.
        html_bron = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        std = {
          "code": page.evaluate("STRAAL_STANDAARD"),
          "velden": [re.search(r'id="%s" value="([^"]*)"' % i, html_bron).group(1)
                     for i in ("filterRadius", "filterBandRadius", "filterSetlistRadius")]
        }
        check("standaardstraal is 10 km in de code", std["code"] == 10, str(std["code"]))
        check("de drie straalvelden beginnen op 10 km",
              std["velden"] == ["10", "10", "10"], str(std["velden"]))
        sctx = browser.new_context(viewport={"width": 412, "height": 900})
        sp = sctx.new_page()
        sp.route("**/supabase-js@2/**", lambda r: r.fulfill(
            status=200, content_type="application/javascript", body=stub_js))
        for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**"):
            sp.route(pat, lambda r: r.abort())
        sp.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load")
        sp.wait_for_timeout(300)
        for veld, kolommen in (("radius", 1), ("leeftijd", 2), ("niveau", 2)):
            vlak = sp.evaluate("""async (id) => {
              showView('search');
              openWheelSheet(id);
              await new Promise(r => requestAnimationFrame(
                () => requestAnimationFrame(() => setTimeout(r, 80))));
              const groep = document.getElementById('wheelSheetGroup');
              const g = groep.getBoundingClientRect();
              const y = g.top + g.height / 2;
              const wielOp = (x) => {
                const el = document.elementFromPoint(x, y);
                const w = el && el.closest('.wheel');
                return w ? w.id : null;
              };
              const wielen = [...groep.querySelectorAll('.wheel')].map(w => w.id);
              const uit = { links: wielOp(g.left + 4), rechts: wielOp(g.right - 4),
                            wielen, midden: [] };
              const eenheid = groep.querySelector('.wheel-unit');
              if (eenheid) { const u = eenheid.getBoundingClientRect();
                             uit.overEenheid = wielOp(u.left + u.width / 2); }
              const sep = groep.querySelector('.wheel-sep');
              if (sep) { const s = sep.getBoundingClientRect();
                         uit.naastSepL = wielOp(s.left + 2);
                         uit.naastSepR = wielOp(s.right - 2); }
              // Het getal zelf staat nog op zijn plek.
              groep.querySelectorAll('.wheel').forEach(w => {
                const k = w.getBoundingClientRect();
                const it = w.querySelector('.wheel-item.selected');
                const r = document.createRange(); r.selectNodeContents(it);
                const t = r.getBoundingClientRect();
                uit.midden.push(Math.abs((t.left + t.width / 2) - (k.left + k.width / 2)));
              });
              return uit;
            }""", veld)
            w = vlak["wielen"]
            check(f"{veld}: linkerrand van het paneel draait het eerste wiel",
                  vlak["links"] == w[0], str(vlak))
            check(f"{veld}: rechterrand van het paneel draait het laatste wiel",
                  vlak["rechts"] == w[-1], str(vlak))
            if kolommen == 1:
                check(f"{veld}: over 'km' draait het wiel",
                      vlak.get("overEenheid") == w[0], str(vlak))
            else:
                check(f"{veld}: 't/m' is links en rechts verdeeld over beide wielen",
                      vlak.get("naastSepL") == w[0] and vlak.get("naastSepR") == w[1], str(vlak))
            check(f"{veld}: de getallen staan nog midden in hun kolom",
                  max(vlak["midden"]) <= 1, str(vlak["midden"]))
            sp.evaluate("closeWheelSheet()")
            sp.wait_for_timeout(100)
        # Echt draaien met het muiswiel boven "km".
        sp.evaluate("""async () => { openWheelSheet('radius');
          await new Promise(r => requestAnimationFrame(
            () => requestAnimationFrame(() => setTimeout(r, 80)))); }""")
        u = sp.evaluate("""() => { const b = document.querySelector('#wheelSheetGroup .wheel-unit')
          .getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }""")
        sp.mouse.move(u["x"], u["y"])
        sp.mouse.wheel(0, 132)
        sp.wait_for_timeout(600)
        na = sp.evaluate("document.getElementById('filterRadius').value")
        check("scrollen boven 'km' kiest een andere straal", na != "10", f"waarde {na}")
        sctx.close()
        check("geen paginafouten in blok 18", not page_errors, "; ".join(page_errors)[:200])

        # ─────────────────────────────────────────────────────────────
        # Blok 19 — rust bij versturen, Inloggen in het menu, verversen
        # blijft op de pagina, vegen over een veld (TT-277 t/m TT-280),
        # 16-09-2026. Vier bevindingen van Ronald op zijn telefoon.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 19 — versturen, menu, verversen en vegen")

        def telefoon(ingelogd):
            c = browser.new_context(viewport={"width": 390, "height": 844},
                                    is_mobile=True, has_touch=True)
            body = stub_js
            if ingelogd:
                body += "\nwindow.TT_STUB.session = { user: { id: 'u1', email: 'test@talenttent.org' } };\n"
            fouten = []
            pg = c.new_page()
            pg.on("pageerror", lambda e: fouten.append(str(e)))
            pg.route("**/supabase-js@2/**", lambda r: r.fulfill(
                status=200, content_type="application/javascript", body=body))
            for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**",
                        "**/api.pdok.nl/**", "**/itunes.apple.com/**"):
                pg.route(pat, lambda r: r.abort())
            return c, pg, fouten

        def actieve_view(pg):
            return pg.evaluate("document.querySelector('.app-view.active')?.id")

        # TT-278 — Inloggen in het hamburgermenu, alleen uitgelogd.
        uc, up, uf = telefoon(False)
        up.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load")
        up.wait_for_timeout(400)
        check("uitgelogd staat Inloggen in het hamburgermenu (TT-278)",
              up.evaluate("getComputedStyle(document.getElementById('navMenuLogin')).display") != "none"
              if up.locator("#navMenuLogin").count() else False, "navMenuLogin")
        if up.locator("#navMenuLogin").count():
            up.click("#navMenuBtn")
            up.click("#navMenuLogin")
            up.wait_for_timeout(100)
            check("Inloggen in het menu opent het inlogscherm",
                  actieve_view(up) == "view-auth", str(actieve_view(up)))
            check("Inloggen staat onderaan, op de plek van Uitloggen",
                  up.evaluate("""() => { const k = [...document.querySelectorAll('#navMenuDropdown .nav-menu-item')];
                    return k.indexOf(document.getElementById('navMenuLogin')) === k.length - 1; }"""), "")

        # TT-280 — vegen over een tekstveld wisselt van tabblad.
        up.evaluate("showView('search')")
        up.wait_for_timeout(300)
        veld = up.evaluate("""() => { const v = document.getElementById('filterName')
            || document.querySelector('#searchModeMusician input[type=text]');
          v.blur(); const b = v.getBoundingClientRect();
          return { id: v.id, x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width }; }""")
        cdp = up.context.new_cdp_session(up)
        def veeg(x0, x1, y):
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x0, "y": y}]})
            for i in range(1, 7):
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove",
                         "touchPoints": [{"x": x0 + (x1 - x0) * i / 6, "y": y}]})
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            up.wait_for_timeout(250)
        veeg(veld["x"] + 80, veld["x"] - 80, veld["y"])
        check("vegen over een leeg, niet aangetikt veld wisselt van tabblad (TT-280)",
              up.evaluate("currentSearchMode") == "band",
              f"tabblad {up.evaluate('currentSearchMode')}, veld {veld['id']}")
        check("en het veld krijgt daarbij geen focus",
              up.evaluate("document.activeElement?.tagName") not in ("INPUT", "TEXTAREA"),
              up.evaluate("document.activeElement?.id || ''"))
        up.evaluate("setSearchMode('musician')")
        up.evaluate(f"document.getElementById('{veld['id']}').focus()")
        veeg(veld["x"] + 80, veld["x"] - 80, veld["y"])
        check("in een aangetikt veld wisselt vegen niet van tabblad",
              up.evaluate("currentSearchMode") == "musician", up.evaluate("currentSearchMode"))
        check("geen paginafouten uitgelogd", not uf, "; ".join(uf)[:200])
        uc.close()

        # TT-278 (vervolg) en TT-279 — ingelogd, verversen blijft op de pagina.
        ic, ip, iff = telefoon(True)
        # Start op #about: de stub kent geen geneste selecties, en Mijn Profiel
        # vraagt die wel. Dat is een grens van de stub, geen fout in de app.
        ip.goto(f"http://127.0.0.1:{port}/index.html#about", wait_until="load")
        ip.wait_for_timeout(500)
        check("ingelogd staat Inloggen niet in het menu",
              ip.evaluate("getComputedStyle(document.getElementById('navMenuLogin')).display") == "none"
              if ip.locator("#navMenuLogin").count() else False, "")
        for v in ("messages", "search", "bands", "instellingen", "about"):
            ip.evaluate(f"showView('{v}')")
            ip.wait_for_timeout(150)
            ip.reload(wait_until="load")
            ip.wait_for_timeout(600)
            check(f"verversen op '{v}' blijft op '{v}' (TT-279)",
                  actieve_view(ip) == f"view-{v}", str(actieve_view(ip)))
        # Terug na verversen: de vorige stap is niet ongevraagd Mijn Profiel.
        ip.evaluate("setSearchMode('band')")
        ip.evaluate("showView('search')")
        ip.wait_for_timeout(150)
        ip.reload(wait_until="load")
        ip.wait_for_timeout(600)
        check("verversen houdt het zoektabblad vast",
              ip.evaluate("currentSearchMode") == "band", ip.evaluate("currentSearchMode"))
        # Een open gesprek blijft open na verversen.
        ip.evaluate("""() => { const l = [];
          for (let i = 0; i < 30; i++) l.push({ id: 'x' + i, sender_id: i % 2 ? 'm1' : 'm2',
            recipient_id: i % 2 ? 'm2' : 'm1', body: 'Bericht ' + i,
            created_at: new Date(Date.now() - (30 - i) * 60000).toISOString(), read_at: null });
          sessionStorage.setItem('tt-test-berichten', JSON.stringify(l)); }""")
        ip.evaluate("showView('messages')")
        ip.wait_for_timeout(200)
        ip.evaluate("openConversation('m2', 'Dylan', '#f5c518', '', false, false)")
        ip.wait_for_timeout(200)
        ip.reload(wait_until="load")
        ip.wait_for_timeout(700)
        gesp = ip.evaluate("""() => ({ view: document.querySelector('.app-view.active')?.id,
          open: document.getElementById('messagesThreadPanel').style.display,
          id: typeof activeConversationId === 'undefined' ? null : activeConversationId })""")
        check("verversen in een gesprek houdt het gesprek open",
              gesp["view"] == "view-messages" and gesp["open"] == "block" and gesp["id"] == "m2",
              json.dumps(gesp))
        ip.evaluate("history.back()")
        ip.wait_for_timeout(300)
        check("terug na verversen sluit eerst het gesprek",
              ip.evaluate("document.getElementById('messagesInboxPanel').style.display") == "block"
              and actieve_view(ip) == "view-messages", str(actieve_view(ip)))
        check("geen paginafouten ingelogd", not iff, "; ".join(iff)[:200])

        # TT-277 — versturen houdt het toetsenbord open en het beeld stil.
        ip.evaluate("""async () => {
          window.TT_STUB.data.messages = JSON.parse(sessionStorage.getItem('tt-test-berichten'));
          await openConversation('m2', 'Dylan', '#f5c518', '', false, false); }""")
        ip.wait_for_timeout(200)
        ip.tap("#messagesReplyInput")
        ip.fill("#messagesReplyInput", "Hoi, zin in een jam?")
        ip.wait_for_timeout(100)
        ip.evaluate("""() => { window.__eerste = document.querySelector('#messagesThreadList .message-bubble');
          window.__voet = []; const t0 = performance.now();
          const f = () => { const r = document.querySelector('#messagesThreadPanel .messages-thread-footer').getBoundingClientRect();
            window.__voet.push(Math.round(r.top));
            if (performance.now() - t0 < 700) requestAnimationFrame(f); };
          requestAnimationFrame(f); }""")
        ip.tap("#messagesThreadPanel .messages-send-btn")
        ip.wait_for_timeout(800)
        st = ip.evaluate("""() => ({ focus: document.activeElement?.id, voet: window.__voet,
          open: document.body.classList.contains('toetsenbord-open'),
          laatste: document.getElementById('messagesThreadList').lastElementChild.textContent,
          aantal: document.querySelectorAll('#messagesThreadList .message-bubble').length,
          zelfde: window.__eerste.isConnected })""")
        check("na versturen blijft het invoerveld actief, zoals in WhatsApp (TT-277)",
              st["focus"] == "messagesReplyInput", json.dumps(st)[:200])
        check("de onderbalk komt tijdens versturen niet terug",
              st["open"], json.dumps(st)[:200])
        check("het invoerveld staat stil tijdens versturen",
              st["voet"] and max(st["voet"]) - min(st["voet"]) <= 1, str(st["voet"]))
        check("het verstuurde bericht staat er precies één keer",
              st["aantal"] == 31 and "Hoi, zin in een jam?" in st["laatste"],
              json.dumps({k: st[k] for k in ("aantal", "laatste")}))
        check("de berichtenlijst wordt na versturen niet opnieuw opgebouwd",
              st["zelfde"], "")
        check("geen paginafouten bij versturen", not iff, "; ".join(iff)[:200])
        ic.close()

        # ─────────────────────────────────────────────────────────────
        # Blok 20 — het profielvenster sluit (TT-287), 16-09-2026.
        # Het kruis en het logo riepen closeMusicianModal() aan zonder
        # klik-gegeven; dat gaf een TypeError en het venster bleef open.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 20 — het profielvenster sluit")
        page_errors.clear()
        def open_profiel():
            page.evaluate("() => document.getElementById('musicianModal').classList.add('visible')")
        def is_open():
            return page.evaluate("() => document.getElementById('musicianModal').classList.contains('visible')")
        open_profiel()
        page.click("#musicianModal .modal-close")
        check("het kruis sluit het profielvenster", not is_open(), "")
        check("het kruis geeft geen paginafout", not page_errors, "; ".join(page_errors)[:200])
        page_errors.clear()
        page.evaluate("() => showView('search')")
        open_profiel()
        page.click("#musicianModal .logo")
        page.wait_for_timeout(60)
        naar_home = page.evaluate("() => document.getElementById('view-landing').classList.contains('active')")
        check("het logo sluit het venster en gaat naar de homepagina",
              not is_open() and naar_home, f"open={is_open()} landing={naar_home}")
        check("het logo geeft geen paginafout", not page_errors, "; ".join(page_errors)[:200])
        open_profiel()
        page.evaluate("() => document.getElementById('musicianModalContent').click()")
        check("een klik ín het venster laat het open", is_open(), "")
        page.evaluate("() => document.getElementById('musicianModal').click()")
        check("een klik naast het venster sluit het", not is_open(), "")
        tikvlak = page.evaluate("""() => {
          const uit = {};
          for (const id of ['musicianModal', 'bandModal']) {
            const m = document.getElementById(id);
            m.classList.add('visible');
            const k = m.querySelector('.modal-close').getBoundingClientRect();
            const raak = (x, y) => !!document.elementFromPoint(x, y)?.closest('.modal-close');
            uit[id] = { midden: raak(innerWidth / 2, innerHeight / 2),
                        logo: raak(40, k.top + k.height / 2),
                        kruis: raak(k.left + k.width / 2, k.top + k.height / 2),
                        rand: raak(k.left - 4, k.top + k.height / 2),
                        breed: Math.round(k.width + 11) };
            m.classList.remove('visible');
          }
          return uit;
        }""")
        for mid, t in tikvlak.items():
            check(f"tikvlak van het kruis blijft bij het kruis ({mid})",
                  not t["midden"] and not t["logo"], json.dumps(t))
            check(f"kruis en 5,5px eromheen zijn raak, samen >= 44px ({mid})",
                  t["kruis"] and t["rand"] and t["breed"] >= 44, json.dumps(t))
        check("geen paginafouten in blok 20", not page_errors, "; ".join(page_errors)[:200])

        # ─────────────────────────────────────────────────────────────
        # Blok 21 — Zoek setlist: van muzikanten naar gedeelde nummers
        # (TT-289, 17-09-2026). Tegen de stub, uitgelogd.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 21 — Zoek setlist: muzikanten kiezen, gedeelde nummers")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        # Uitgelogd: eerdere blokken loggen in. Zonder sessie zet het
        # zoekscherm hasOwnProfile zelf op false.
        page.evaluate("""() => {
          window.TT_STUB.session = null;
          currentUser = null;
          myMusicianId = null;
          myOwnCity = null;
          hasOwnProfile = false;
          const nu = new Date().toISOString();
          const S = window.TT_STUB.rpcResults;
          S.tt_resolve_search_origin = [{ lat: 52.0, lng: 4.3 }];
          S.tt_search_musicians_anon = (p) => (p.radius_km == null || p.radius_km >= 10)
            ? [{ musician_id: 'm2', distance_km: 8.2, is_stale: false },
               { musician_id: 'm3', distance_km: 3.1, is_stale: false },
               { musician_id: 'm1', distance_km: 12, is_stale: false }] : [];
          const nummers = {
            m1: [{ song_title: 'Alpha', song_artist: 'Xband', mastery_level: 'basis' },
                 { song_title: 'Beta', song_artist: 'Yband', mastery_level: 'podium' },
                 { song_title: 'Gamma', song_artist: 'Zband', mastery_level: 'bijna' }],
            m2: [{ song_title: 'alpha', song_artist: 'xband', mastery_level: 'bijna' },
                 { song_title: 'Beta', song_artist: 'Yband', mastery_level: 'basis' }],
            m3: [{ song_title: 'Alpha', song_artist: 'Xband', mastery_level: 'podium' }],
          };
          const namen = { m1: ['ronnie', 'Den Haag'], m2: ['dylan', 'Delft'], m3: ['sanne', 'Rijswijk'] };
          S.tt_get_musicians_public = (p) => (p.ids || []).filter(id => namen[id]).map(id => ({
            id, username: namen[id][0], city: namen[id][1], fname: 'GEHEIM',
            profile_color: '#f5c518', avatar_url: null, updated_at: nu,
            instrument_levels: [], genres: [], songs: nummers[id]
          }));
          showView('search');
          setSearchMode('setlist');
        }""")
        page.wait_for_timeout(300)
        check("blok 21 draait uitgelogd", page.evaluate("hasOwnProfile === false"), "")

        sch = page.evaluate("""() => {
          const b = ['setlistSoortMuzikantenBtn', 'setlistSoortNummersBtn'].map(id => document.getElementById(id));
          const r = b.map(x => x.getBoundingClientRect());
          return { tekst: b.map(x => x.textContent.trim()), hoog: r.map(x => Math.round(x.height)),
                   breed: r.map(x => Math.round(x.width)),
                   gekozen: b.map(x => x.getAttribute('aria-selected')),
                   muzZichtbaar: getComputedStyle(document.getElementById('setlistDeelMuzikanten')).display !== 'none',
                   numZichtbaar: getComputedStyle(document.getElementById('setlistDeelNummers')).display !== 'none',
                   knop: [...document.querySelectorAll('#setlistDeelMuzikanten .btn-row .btn-primary')].map(x => x.textContent.trim()),
                   titel: document.querySelector('#setlistDeelMuzikanten .filter-title').textContent.trim() };
        }""")
        check("schakelaar heeft de labels Zoek muzikanten en Zoek setlist",
              sch["tekst"] == ["Zoek muzikanten", "Zoek setlist"], json.dumps(sch))
        check("schakelaar: knoppen minstens 44px hoog en even breed",
              min(sch["hoog"]) >= 44 and sch["breed"][0] == sch["breed"][1], json.dumps(sch))
        vorm = page.evaluate("""() => {
          const st = id => { const c = getComputedStyle(document.getElementById(id)); return [c.backgroundColor, c.borderTopColor, c.color]; };
          const r = id => document.getElementById(id).getBoundingClientRect();
          const a = r('setlistSoortMuzikantenBtn'), b = r('setlistSoortNummersBtn');
          const h1 = r('searchModeMusicianBtn'), h3 = r('searchModeSetlistBtn');
          document.getElementById('searchModeSetlistBtn').style.transition = 'none';
          return { hoofd: st('searchModeSetlistBtn'), sub: st('setlistSoortMuzikantenBtn'),
                   tussen: Math.round(b.left - a.right),
                   randen: [Math.round(a.left - h1.left), Math.round(b.right - h3.right)] };
        }""")
        check("standknoppen staan los van elkaar, met 14px ertussen",
              vorm["tussen"] == 14, json.dumps(vorm))
        check("actieve standknop heeft dezelfde kleuren als het tabblad Setlist",
              vorm["hoofd"] == vorm["sub"], json.dumps(vorm))
        check("standknoppen lijnen uit met de hoofdtabbladen",
              vorm["randen"] == [0, 0], json.dumps(vorm))
        check("standaard staat de stand Zoek muzikanten aan",
              sch["gekozen"] == ["true", "false"] and sch["muzZichtbaar"] and not sch["numZichtbaar"],
              json.dumps(sch))
        check("bestaande stand heet Zoek muzikanten, knop ook",
              sch["titel"] == "Zoek muzikanten" and sch["knop"] == ["Zoek muzikanten"], json.dumps(sch))

        page.click("#setlistSoortNummersBtn")
        page.wait_for_timeout(100)
        st = page.evaluate("""() => ({
          gekozen: ['setlistSoortMuzikantenBtn', 'setlistSoortNummersBtn'].map(id => document.getElementById(id).getAttribute('aria-selected')),
          muz: getComputedStyle(document.getElementById('setlistDeelMuzikanten')).display,
          num: getComputedStyle(document.getElementById('setlistDeelNummers')).display,
          titel: document.querySelector('#setlistDeelNummers .filter-title').textContent.trim(),
          sub: document.querySelector('#setlistDeelNummers .filter-sub').textContent.trim(),
          straal: document.querySelector('#filterGedeeldRadiusField .wheel-field-label').textContent.trim(),
          sorteer: document.querySelector('#gedeeldSortModeField .wheel-field-label').textContent.trim(),
          knoppen: [...document.querySelectorAll('#setlistDeelNummers .btn-row button')].map(x => x.textContent.trim()),
          resultaat: document.getElementById('gedeeldResults').innerHTML.trim()
        })""")
        check("tik op Zoek setlist wisselt de stand",
              st["gekozen"] == ["false", "true"] and st["muz"] == "none" and st["num"] != "none", json.dumps(st))
        check("kop en uitleg van Zoek setlist",
              st["titel"] == "Zoek setlist" and "2 tot 20 muzikanten" in st["sub"], json.dumps(st))
        check("straalwiel staat op 10 km, sorteren op Meeste spelers",
              st["straal"] == "10 km" and st["sorteer"] == "Meeste spelers", json.dumps(st))
        check("knoppenrij: Lijst wissen links, Zoek nummers rechts",
              st["knoppen"] == ["Lijst wissen", "Zoek nummers"], json.dumps(st))
        check("zonder gekozen muzikanten geen resultaat", st["resultaat"] == "", st["resultaat"][:100])

        page.fill("#filterGedeeldCity", "Delft")
        page.wait_for_timeout(50)
        page.fill("#gedeeldNaam", "n")
        page.wait_for_timeout(500)
        check("één letter geeft nog geen suggesties",
              not page.evaluate("document.getElementById('acGedeeldNaamList').classList.contains('open')"), "")
        page.fill("#gedeeldNaam", "an")
        page.wait_for_timeout(700)
        sug = page.evaluate("""() => [...document.querySelectorAll('#acGedeeldNaamList .ac-item')]
          .map(x => ({ naam: x.querySelector('strong')?.textContent, meta: x.querySelector('span')?.textContent,
                       hoog: Math.round(x.getBoundingClientRect().height) }))""")
        check("suggesties: alleen wie op de naam matcht, dichtstbij eerst",
              [x["naam"] for x in sug] == ["sanne", "dylan"], json.dumps(sug))
        check("suggestie toont plaats en afstand",
              sug and sug[1]["meta"] == "Delft · 8 km", json.dumps(sug))
        check("uitgelogd geen voornaam in de suggestie",
              all(x["naam"] != "GEHEIM" for x in sug), json.dumps(sug))
        check("suggestieregel minstens 44px hoog", sug and min(x["hoog"] for x in sug) >= 44, json.dumps(sug))
        straal_arg = page.evaluate("""() => window.TT_STUB.calls
          .filter(c => c.kind === 'rpc' && c.name === 'tt_search_musicians_anon').map(c => c.params.radius_km)""")
        check("de straal gaat mee naar de database", straal_arg and straal_arg[-1] == 10, json.dumps(straal_arg))

        page.keyboard.press("Enter")
        page.wait_for_timeout(200)
        een = page.evaluate("""() => ({
          gekozen: gedeeldGekozen.map(g => g.naam), veld: document.getElementById('gedeeldNaam').value,
          lijst: document.getElementById('gedeeldGekozenList').innerText,
          teller: document.getElementById('gedeeldTeller').textContent,
          resultaat: document.getElementById('gedeeldResults').innerHTML.trim(),
          x: [...document.querySelectorAll('#gedeeldGekozenList .song-remove')].map(b => Math.round(b.getBoundingClientRect().width))
        })""")
        check("Enter kiest de eerste suggestie en leegt het veld",
              een["gekozen"] == ["sanne"] and een["veld"] == "", json.dumps(een))
        check("gekozen lijst toont naam en plaats, met ✕ van 44px",
              "sanne" in een["lijst"] and "Rijswijk" in een["lijst"] and een["x"] == [44], json.dumps(een))
        check("teller zegt dat er nog één nodig is",
              een["teller"] == "1 van 20 · kies er nog 1", een["teller"])
        check("met één muzikant nog geen resultaat", een["resultaat"] == "", een["resultaat"][:100])

        page.fill("#gedeeldNaam", "an")
        page.wait_for_timeout(700)
        sug2 = page.evaluate("[...document.querySelectorAll('#acGedeeldNaamList .ac-item strong')].map(x => x.textContent)")
        check("wie al gekozen is, staat niet meer tussen de suggesties", sug2 == ["dylan"], json.dumps(sug2))
        page.evaluate("addGedeeldMuzikant('m2')")
        page.wait_for_function("document.querySelector('#gedeeldResults .results-count')", timeout=3000)
        res = page.evaluate("""() => ({
          kop: document.querySelector('#gedeeldResults .results-count')?.textContent,
          rijen: [...document.querySelectorAll('#gedeeldResults .gedeeld-rij')].map(r => ({
            titel: r.querySelector('.gedeeld-rij-titel').textContent,
            artiest: r.querySelector('.gedeeld-rij-artiest').textContent,
            tel: r.querySelector('.gedeeld-rij-telling').textContent,
            hoog: Math.round(r.querySelector('.gedeeld-rij-kop').getBoundingClientRect().height) })),
          teller: document.getElementById('gedeeldTeller').textContent
        })""")
        check("twee muzikanten: resultaat verschijnt vanzelf",
              res["kop"] == "1 nummer die minstens 2 van hen spelen", json.dumps(res))
        # sanne speelt "Alpha", dylan "alpha": dat is hetzelfde nummer.
        check("hoofdletters maken niet uit bij het vergelijken",
              [r["titel"] for r in res["rijen"]] == ["Alpha"], json.dumps(res))
        check("een nummer van één muzikant staat er niet",
              all(r["titel"] != "Gamma" for r in res["rijen"]), json.dumps(res))
        check("elke regel toont 2 van 2 en is minstens 44px hoog",
              all(r["tel"] == "2 van 2" and r["hoog"] >= 44 for r in res["rijen"]), json.dumps(res))
        check("teller zonder aanvulling bij twee", res["teller"] == "2 van 20", res["teller"])

        # De suggestiecache bevat iedereen binnen de straal, ook ronnie.
        page.evaluate("addGedeeldMuzikant('m1')")
        page.wait_for_function("document.querySelectorAll('#gedeeldResults .gedeeld-rij').length === 2", timeout=3000)
        drie = page.evaluate("""() => [...document.querySelectorAll('#gedeeldResults .gedeeld-rij')].map(r =>
          r.querySelector('.gedeeld-rij-titel').textContent + ':' + r.querySelector('.gedeeld-rij-telling').textContent)""")
        check("drie muzikanten: meeste spelers bovenaan",
              drie == ["Alpha:3 van 3", "Beta:2 van 3"], json.dumps(drie))

        page.click("#gedeeldResults .gedeeld-rij:nth-child(2) .gedeeld-rij-kop")
        page.wait_for_timeout(100)
        pan = page.evaluate("""() => {
          const r = document.querySelector('#gedeeldResults .gedeeld-rij.open');
          if (!r) return null;
          return { uitgeklapt: r.querySelector('.gedeeld-rij-kop').getAttribute('aria-expanded'),
                   spelers: [...r.querySelectorAll('.gedeeld-speler')].map(x => ({
                     naam: x.querySelector('.gedeeld-speler-naam').textContent,
                     niveau: x.querySelector('.level-pill')?.textContent || '',
                     niet: x.classList.contains('niet'),
                     tekst: x.querySelector('.gedeeld-speler-niet')?.textContent || '',
                     rechts: (() => { const p = x.querySelector('.level-pill, .gedeeld-speler-niet');
                                      return p ? Math.round(x.getBoundingClientRect().right - p.getBoundingClientRect().right) : null; })(),
                     hoog: Math.round(x.querySelector('.gedeeld-speler-naam').getBoundingClientRect().height) })) };
        }""")
        check("een tik klapt de regel open", pan and pan["uitgeklapt"] == "true", json.dumps(pan))
        check("paneel toont alle gekozen muzikanten in volgorde van kiezen",
              pan and [x["naam"] for x in pan["spelers"]] == ["sanne", "dylan", "ronnie"], json.dumps(pan))
        check("niveau staat rechts naast de naam",
              pan and pan["spelers"][1]["niveau"] == "Basis" and pan["spelers"][2]["niveau"] == "Podiumklaar"
              and pan["spelers"][1]["rechts"] == 0, json.dumps(pan))
        check("wie het niet speelt, staat grijs met 'Speelt dit niet'",
              pan and pan["spelers"][0]["niet"] and pan["spelers"][0]["tekst"] == "Speelt dit niet"
              and pan["spelers"][0]["niveau"] == "", json.dumps(pan))
        check("naam in het paneel is een tikdoel van 44px",
              pan and min(x["hoog"] for x in pan["spelers"]) >= 44, json.dumps(pan))
        page.evaluate("setGedeeldSortMode('spelers')")
        check("opengeklapte regel blijft open na opnieuw sorteren",
              page.evaluate("!!document.querySelector('#gedeeldResults .gedeeld-rij.open')"), "")
        page.click("#gedeeldResults .gedeeld-rij.open .gedeeld-rij-kop")
        check("nog een tik klapt hem dicht",
              not page.evaluate("!!document.querySelector('#gedeeldResults .gedeeld-rij.open')"), "")

        srt = page.evaluate("""() => {
          const S = window.TT_STUB.rpcResults;
          const oud = S.tt_get_musicians_public;
          gedeeldResultaat = sortGedeeldList([
            { sleutel: '1', titel: 'Zulu', artiest: 'Abba', spelers: { a: '', b: '' } },
            { sleutel: '2', titel: 'Echo', artiest: 'Muse', spelers: { a: '', b: '', c: '' } },
            { sleutel: '3', titel: 'Alfa', artiest: 'Abba', spelers: { a: '', b: '' } },
            { sleutel: '4', titel: 'Kilo', artiest: 'Muse', spelers: { a: '', b: '' } },
          ]);
          const volg = () => gedeeldResultaat.map(n => n.artiest + '/' + n.titel).join(',');
          const uit = {};
          setGedeeldSortMode('spelers'); uit.spelers = volg();
          setGedeeldSortMode('artiest'); uit.artiest = volg();
          setGedeeldSortMode('az'); uit.az = volg();
          uit.label = document.querySelector('#gedeeldSortModeField .wheel-field-label').textContent.trim();
          uit.opties = [...document.getElementById('gedeeldSortMode').options].map(o => o.textContent);
          setGedeeldSortMode('spelers');
          return uit;
        }""")
        check("sorteren: Meeste spelers", srt["spelers"] == "Muse/Echo,Abba/Alfa,Abba/Zulu,Muse/Kilo", json.dumps(srt))
        check("sorteren: Artiest, meeste spelers", srt["artiest"] == "Muse/Echo,Muse/Kilo,Abba/Alfa,Abba/Zulu", json.dumps(srt))
        check("sorteren: Artiest A–Z", srt["az"] == "Abba/Alfa,Abba/Zulu,Muse/Echo,Muse/Kilo", json.dumps(srt))
        check("sorteeropties hebben de afgesproken namen",
              srt["opties"] == ["Meeste spelers", "Artiest, meeste spelers", "Artiest A–Z"] and srt["label"] == "Artiest A–Z",
              json.dumps(srt))

        page.evaluate("runGedeeldSearch()")
        page.wait_for_timeout(200)
        wis = page.evaluate("""async () => {
          const uit = {};
          document.getElementById('filterGedeeldRadius').value = '25';
          gedeeldKandidatenVergeten();
          uit.naVerandering = gedeeldGekozen.length;
          uit.cache = gedeeldKandidaten;
          removeGedeeldMuzikant(0);
          await new Promise(r => setTimeout(r, 150));
          uit.naEen = document.querySelectorAll('#gedeeldResults .gedeeld-rij').length;
          removeGedeeldMuzikant(0);
          await new Promise(r => setTimeout(r, 50));
          uit.naTwee = document.getElementById('gedeeldResults').innerHTML.trim();
          return uit;
        }""")
        check("straal wijzigen laat gekozen muzikanten staan en vergeet de suggesties",
              wis["naVerandering"] == 3 and wis["cache"] is None, json.dumps(wis))
        # sanne eruit: dylan en ronnie delen Alpha én Beta.
        check("muzikant weghalen rekent opnieuw", wis["naEen"] == 2, json.dumps(wis))
        check("onder twee muzikanten verdwijnt het resultaat", wis["naTwee"] == "", json.dumps(wis))

        grens = page.evaluate("""() => {
          gedeeldGekozen = Array.from({ length: 20 }, (_, i) => ({ id: 'x' + i, naam: 'x' + i, city: '', distance_km: null }));
          gedeeldKandidaten = { sleutel: 'x', straalActief: true,
            lijst: [{ id: 'm9', username: 'extra', city: '', distance_km: null }] };
          addGedeeldMuzikant('m9');
          return { n: gedeeldGekozen.length, toast: document.getElementById('appToast')?.textContent || '' };
        }""")
        check("de 21e muzikant wordt geweigerd", grens["n"] == 20, json.dumps(grens))
        check("met een melding over de grens van 20", "maximaal 20" in grens["toast"], json.dumps(grens))

        page.evaluate("resetGedeeldSearch()")
        page.wait_for_timeout(50)
        rst = page.evaluate("""() => ({ n: gedeeldGekozen.length,
          rij: getComputedStyle(document.getElementById('gedeeldGekozenRow')).display,
          plaats: document.getElementById('filterGedeeldCity').value,
          straal: document.getElementById('filterGedeeldRadius').value,
          res: document.getElementById('gedeeldResults').innerHTML.trim() })""")
        check("Lijst wissen zet alles terug",
              rst["n"] == 0 and rst["rij"] == "none" and rst["plaats"] == "" and rst["straal"] == "10" and rst["res"] == "",
              json.dumps(rst))

        page.fill("#gedeeldNaam", '"dyl"')
        page.wait_for_timeout(700)
        exact = page.evaluate("document.getElementById('acGedeeldNaamList').innerText")
        check("zonder plaats en uitgelogd: geen straal in de lege melding",
              exact.strip() == "Niemand met deze naam.", exact)
        page.fill("#gedeeldNaam", '"dylan"')
        page.wait_for_timeout(700)
        exact2 = page.evaluate("[...document.querySelectorAll('#acGedeeldNaamList .ac-item strong')].map(x => x.textContent)")
        check("tussen aanhalingstekens alleen de exacte naam", exact2 == ["dylan"], json.dumps(exact2))
        straal_leeg = page.evaluate("""() => window.TT_STUB.calls
          .filter(c => c.kind === 'rpc' && c.name === 'tt_search_musicians_anon').map(c => c.params.radius_km).pop()""")
        check("uitgelogd zonder plaats: geen straalbeperking", straal_leeg is None, json.dumps(straal_leeg))
        page.evaluate("addGedeeldMuzikant('m2'); closeAC('acGedeeldNaamList')")

        page.evaluate("""() => { gedeeldKandidaten = null; }""")
        page.fill("#gedeeldNaam", "sanne")
        page.wait_for_timeout(700)
        page.evaluate("addGedeeldMuzikant('m3')")
        page.wait_for_timeout(200)
        page.evaluate("setSearchMode('musician')")
        page.wait_for_timeout(100)
        page.evaluate("""() => { window.TT_STUB.calls = []; document.getElementById('gedeeldResults').innerHTML = ''; setSearchMode('setlist'); }""")
        page.wait_for_timeout(250)
        terug = page.evaluate("""() => ({
          stand: document.getElementById('setlistSoortNummersBtn').getAttribute('aria-selected'),
          n: gedeeldGekozen.length,
          rijen: document.querySelectorAll('#gedeeldResults .gedeeld-rij').length })""")
        check("terug naar Setlist: stand en keuze blijven, resultaat ververst",
              terug["stand"] == "true" and terug["n"] == 2 and terug["rijen"] == 1, json.dumps(terug))
        page.evaluate("setSetlistSoort('muzikanten')")
        check("terug naar Zoek muzikanten toont die stand weer",
              page.evaluate("getComputedStyle(document.getElementById('setlistDeelMuzikanten')).display !== 'none'"), "")
        check("setlistlijst gebruikt dezelfde lijstvorm",
              page.evaluate("""() => { setlistWantedSongs = [{ title: 'T"1', artist: 'A' }]; renderSetlistSongsList();
                const ok = !!document.querySelector('#setlistSongsList .zoek-lijst .zoek-lijst-nr')
                  && document.querySelector('#setlistSongsList .song-remove').getAttribute('aria-label') === 'Verwijder T"1';
                setlistWantedSongs = []; renderSetlistSongsList(); return ok; }"""), "")
        check("geen paginafouten in blok 21", not page_errors, "; ".join(page_errors)[:300])
        page.evaluate("window.TT_STUB.reset()")

        # ─────────────────────────────────────────────────────────────
        # Blok 22 — melden en blokkeren (TT-06, 18-09-2026)
        # De vier besluiten van Ronald: blokkeren = geen berichten én
        # wederzijds onzichtbaar; een melding gaat naar een tabel; melden
        # kan over muzikant, band en gesprek; de ander merkt er niets van.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 22 — melden en blokkeren (TT-06)")
        page_errors.clear()
        menu = page.evaluate("""async () => {
          window.getMyMusicianId = async () => 'm1';
          hasOwnProfile = true; myMusicianId = 'm1';
          window.TT_STUB.data.musician_blocks = [];
          window.TT_STUB.data.musician_reports = [];
          await laadBlokkades();
          const r = {};
          const labels = (id) => Array.from(
            document.querySelectorAll('#' + id + ' .nav-menu-item')).map(b => b.textContent);

          zetVeiligheidMenu('musicianModalActies', 'muzikant', 'm2', 'Dylan');
          r.menuBijAnder = !!document.querySelector('#musicianModalActies .veiligheid-menu-wrap');
          r.items = labels('musicianModalActies');
          const knop = document.querySelector('#musicianModalActies .nav-menu-btn');
          const kr = knop.getBoundingClientRect();
          r.tikdoel = [Math.round(kr.width), Math.round(kr.height)];
          knop.click();
          r.opentNaKlik = document.querySelector('#musicianModalActies .inline-menu-dropdown').classList.contains('visible');
          // Sinds 24-09-2026 ligt er een donkere laag achter elk open menu; een
          // tik ernaast landt op die laag.
          document.querySelector('#musicianModalActies .menu-laag')?.click();
          r.sluitBuitenKlik = !document.querySelector('#musicianModalActies .inline-menu-dropdown').classList.contains('visible');

          zetVeiligheidMenu('musicianModalActies', 'muzikant', null, '');
          r.menuBijEigen = !!document.querySelector('#musicianModalActies .veiligheid-menu-wrap');

          zetVeiligheidMenu('bandModalActies', 'band', 'b1', 'Van Delft');
          r.bandItems = labels('bandModalActies');

          hasOwnProfile = false;
          zetVeiligheidMenu('musicianModalActies', 'muzikant', 'm2', 'Dylan');
          r.menuZonderProfiel = !!document.querySelector('#musicianModalActies .veiligheid-menu-wrap');
          hasOwnProfile = true;
          return r;
        }""")
        check("het ⋯-menu staat in de koprij van andermans profiel",
              menu["menuBijAnder"], json.dumps(menu))
        check("met precies twee acties: melden en blokkeren",
              menu["items"] == ["Muzikant melden", "Blokkeren"], json.dumps(menu["items"]))
        check("het tikdoel van het menuknopje is minstens 44px",
              menu["tikdoel"][0] >= 44 and menu["tikdoel"][1] >= 44, json.dumps(menu["tikdoel"]))
        check("het menu opent bij een klik en sluit bij een klik ernaast",
              menu["opentNaKlik"] and menu["sluitBuitenKlik"], json.dumps(menu))
        check("op je eigen profiel staat er geen menu", not menu["menuBijEigen"], "")
        check("een band is wel te melden, niet te blokkeren",
              menu["bandItems"] == ["Band melden"], json.dumps(menu["bandItems"]))
        check("zonder eigen profiel staat er geen menu",
              not menu["menuZonderProfiel"], "")

        blok = page.evaluate("""async () => {
          const r = {};
          await blokkeerMuzikantUitvoeren('m2', 'Dylan');
          r.rijen = window.TT_STUB.data.musician_blocks.map(b => b.blocker_id + '>' + b.blocked_id);
          r.geblokkeerd = isGeblokkeerd('m2');
          r.ikZelf = blokkeerIkZelf('m2');
          zetVeiligheidMenu('musicianModalActies', 'muzikant', 'm2', 'Dylan');
          r.itemsNa = Array.from(document.querySelectorAll('#musicianModalActies .nav-menu-item')).map(b => b.textContent);
          // De omgekeerde richting: een ander blokkeert mij. Ik zie hem niet
          // meer in de zoekresultaten, maar ik kan die blokkade niet opheffen.
          blokkadeOpMij.add('m3');
          r.andersom = isGeblokkeerd('m3');
          r.andersomIkZelf = blokkeerIkZelf('m3');
          return r;
        }""")
        check("blokkeren schrijft precies één rij weg",
              blok["rijen"] == ["m1>m2"], json.dumps(blok["rijen"]))
        check("de geblokkeerde telt daarna als geblokkeerd",
              blok["geblokkeerd"] and blok["ikZelf"], json.dumps(blok))
        check("het menu biedt daarna 'Blokkade opheffen'",
              blok["itemsNa"] == ["Muzikant melden", "Blokkade opheffen"], json.dumps(blok["itemsNa"]))
        check("een blokkade van een ander werkt ook, maar is niet op te heffen",
              blok["andersom"] and not blok["andersomIkZelf"], json.dumps(blok))

        zoek = page.evaluate("""async () => {
          hasOwnProfile = false;
          window.TT_STUB.rpcResults.tt_resolve_search_origin = [{ lat: 52.0, lng: 4.3 }];
          window.TT_STUB.rpcResults.tt_search_musicians_anon = () => ([
            { musician_id: 'm2', distance_km: 3, is_stale: false },
            { musician_id: 'm3', distance_km: 4, is_stale: false },
            { musician_id: 'm4', distance_km: 5, is_stale: false }
          ]);
          const publiek = (id, naam) => ({
            id, username: naam, age: 30, city: 'Delft', bio: '', goal: null,
            profile_color: '#f5c518', avatar_url: null, updated_at: new Date().toISOString(),
            instrument_levels: [{ instrument: 'Drums', niveau: 3 }], genres: ['Rock'], songs: []
          });
          window.TT_STUB.rpcResults.tt_get_musicians_public =
            [publiek('m2', 'dylan'), publiek('m3', 'sanne'), publiek('m4', 'kim')];
          document.getElementById('filterCity').value = 'Delft';
          document.getElementById('filterRadius').value = '50';
          await runSearch();
          await new Promise(r => setTimeout(r, 200));
          return { tekst: document.getElementById('searchResults').innerText,
                   ids: lastMusicianResults.map(m => m.id) };
        }""")
        check("een geblokkeerde muzikant valt uit het zoekresultaat",
              zoek["ids"] == ["m4"], json.dumps(zoek["ids"]))
        check("en de teller telt hem ook niet mee",
              "1 muzikant gevonden" in zoek["tekst"], zoek["tekst"][:200])

        inbox = page.evaluate("""async () => {
          hasOwnProfile = true;
          const nu = new Date().toISOString();
          window.TT_STUB.data.messages = [
            { id: 'x1', sender_id: 'm2', recipient_id: 'm1', body: 'Van de geblokkeerde', created_at: nu, read_at: null },
            { id: 'x2', sender_id: 'm1', recipient_id: 'm2', body: 'Mijn eigen bericht', created_at: nu, read_at: nu },
            { id: 'x3', sender_id: 'm5', recipient_id: 'm1', body: 'Van iemand anders', created_at: nu, read_at: null }
          ];
          document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
          document.getElementById('view-messages').classList.add('active');
          await loadInbox();
          await new Promise(r => setTimeout(r, 120));
          await refreshUnreadBadge();
          await new Promise(r => setTimeout(r, 60));
          return {
            tekst: document.getElementById('messagesInboxList').innerText,
            rijen: document.querySelectorAll('#messagesInboxList .messages-conv-row').length,
            badge: document.getElementById('unreadBadge').textContent
          };
        }""")
        check("het gesprek met een geblokkeerde verdwijnt uit de inbox",
              inbox["rijen"] == 1 and "Van de geblokkeerde" not in inbox["tekst"],
              json.dumps(inbox))
        check("de ongelezen-teller telt zijn bericht niet mee",
              inbox["badge"] == "1", inbox["badge"])

        melden = page.evaluate("""async () => {
          const r = {};
          openMeldModal('gesprek', 'm5', 'Kim');
          r.titel = document.getElementById('meldTitel').textContent;
          r.naam = document.getElementById('meldDoelNaam').textContent;
          r.redenen = document.querySelectorAll('#meldRedenen .tag').length;
          await verstuurMelding();
          r.zonderReden = window.TT_STUB.data.musician_reports.length;
          document.querySelectorAll('#meldRedenen .tag')[0].click();
          r.gekozen = document.querySelectorAll('#meldRedenen .tag.selected').length;
          document.getElementById('meldToelichting').value = 'Toelichting';
          await verstuurMelding();
          await new Promise(r => setTimeout(r, 80));
          r.rijen = window.TT_STUB.data.musician_reports.map(x =>
            [x.reporter_id, x.target_type, x.target_id, x.reason, x.note].join('|'));
          r.dicht = !document.getElementById('meldModal').classList.contains('visible');
          return r;
        }""")
        check("de meldmodal noemt het doel en biedt vijf redenen",
              melden["titel"] == "Gesprek melden" and melden["naam"] == "Kim"
              and melden["redenen"] == 5, json.dumps(melden))
        check("zonder reden wordt er niets weggeschreven",
              melden["zonderReden"] == 0, str(melden["zonderReden"]))
        check("één gekozen reden tegelijk", melden["gekozen"] == 1, str(melden["gekozen"]))
        check("de melding komt volledig in de tabel",
              melden["rijen"] == ["m1|gesprek|m5|Ongepast gedrag|Toelichting"],
              json.dumps(melden["rijen"]))
        check("en het scherm sluit na het versturen", melden["dicht"], "")

        lijst = page.evaluate("""async () => {
          const r = {};
          await openGeblokkeerdModal();
          await new Promise(r => setTimeout(r, 120));
          r.tekst = document.getElementById('geblokkeerdLijst').innerText;
          r.rijen = document.querySelectorAll('#geblokkeerdLijst .geblokkeerd-rij').length;
          await deblokkeerMuzikant('m2', 'Dylan');
          await new Promise(r => setTimeout(r, 120));
          r.naOpheffen = window.TT_STUB.data.musician_blocks.length;
          r.nogGeblokkeerd = isGeblokkeerd('m2');
          r.legeStaatKnoppen = document.querySelectorAll('#geblokkeerdLijst .empty-state .btn').length;
          closeGeblokkeerdModal();
          return r;
        }""")
        check("Instellingen toont de geblokkeerde muzikant met een naam",
              lijst["rijen"] == 1 and "dylan" in lijst["tekst"].lower(), json.dumps(lijst))
        check("opheffen verwijdert de rij uit de database",
              lijst["naOpheffen"] == 0 and not lijst["nogGeblokkeerd"], json.dumps(lijst))
        check("de lege lijst is een lege staat met precies één knop (§15)",
              lijst["legeStaatKnoppen"] == 1, str(lijst["legeStaatKnoppen"]))

        check("geen paginafouten in blok 22", not page_errors, "; ".join(page_errors)[:300])
        page.evaluate("""() => {
          blokkadeOpMij.clear(); blokkadeDoorMij.clear();
          window.TT_STUB.data.musician_blocks = [];
          window.TT_STUB.data.musician_reports = [];
          window.TT_STUB.data.messages = [];
          window.TT_STUB.reset();
        }""")

        # ─────────────────────────────────────────────────────────────
        # Blok 23 — terugknop sluit modals via hun eigen opruimfunctie (TT-294)
        # Bevinding Ronald, 18-09-2026: een kruisje rechtsboven kan door de
        # telefoon-terugknop worden overgenomen. Onderzoek: de generieke
        # popstate-listener in core.js sluit élke zichtbare modal, maar roept
        # de eigen sluitfunctie van een modal alleen aan via het
        # data-close-attribuut. Dat hadden er maar 2 van de 15 met een
        # kruisje. Bij vier modals doet de eigen sluitfunctie meer dan alleen
        # verbergen: messageModal en meldModal resetten eigen state,
        # pickerListModal reset welke lijst openstond, en instrumentLevelModal
        # verwijdert een net gekozen instrument zonder niveau weer — dezelfde
        # bugklasse als de P0-fix van 23-08-2026 (TT-129), nu bereikbaar via de
        # terugknop. Fix: data-close toegevoegd aan alle vier in index.html.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 23 — terugknop sluit modals via hun eigen opruimfunctie (TT-294)")
        page_errors.clear()

        bericht = page.evaluate("""async () => {
          const r = {};
          openMessageComposer('m9', 'Test');
          r.voorRecipient = messageComposerRecipientId;
          window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'messages' } }));
          await new Promise(res => setTimeout(res, 50));
          r.dicht = !document.getElementById('messageModal').classList.contains('visible');
          r.naRecipient = messageComposerRecipientId;
          return r;
        }""")
        check("terugknop sluit het berichtenscherm", bericht["dicht"], "")
        check("en maakt messageComposerRecipientId leeg",
              bericht["voorRecipient"] == "m9" and bericht["naRecipient"] is None,
              json.dumps(bericht))

        melden2 = page.evaluate("""async () => {
          const r = {};
          openMeldModal('muzikant', 'm9', 'Test');
          kiesMeldReden(document.querySelector('#meldRedenen .tag'), 'Ongepast gedrag');
          r.voorDoel = !!meldDoel;
          r.voorReden = meldReden;
          window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'search' } }));
          await new Promise(res => setTimeout(res, 50));
          r.dicht = !document.getElementById('meldModal').classList.contains('visible');
          r.naDoel = meldDoel;
          r.naReden = meldReden;
          return r;
        }""")
        check("terugknop sluit de meldmodal", melden2["dicht"], "")
        check("en maakt meldDoel en meldReden leeg",
              melden2["voorDoel"] and melden2["voorReden"] == "Ongepast gedrag"
              and melden2["naDoel"] is None and melden2["naReden"] is None,
              json.dumps(melden2))

        picker = page.evaluate("""async () => {
          const r = {};
          openPickerList('genre');
          r.voorActief = activeListPickerId;
          window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'register' } }));
          await new Promise(res => setTimeout(res, 50));
          r.dicht = !document.getElementById('pickerListModal').classList.contains('visible');
          r.naActief = activeListPickerId;
          return r;
        }""")
        check("terugknop sluit de kies-uit-lijst", picker["dicht"], "")
        check("en maakt activeListPickerId leeg", picker["voorActief"] == "genre"
              and picker["naActief"] is None, json.dumps(picker))

        instrument = page.evaluate("""async () => {
          const r = {};
          state.instruments = [];
          state.instrumentLevels = {};
          openInstrumentPicker('wizard');
          pickInstrumentFromSheet('Gitaar');
          r.voorLijst = state.instruments.slice();
          window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'register' } }));
          await new Promise(res => setTimeout(res, 50));
          r.dicht = !document.getElementById('instrumentLevelModal').classList.contains('visible');
          r.naLijst = state.instruments.slice();
          r.naTarget = instrumentLevelTarget;
          return r;
        }""")
        check("terugknop sluit het instrumentniveau-scherm", instrument["dicht"], "")
        check("en verwijdert een net gekozen instrument zonder niveau (TT-294, zelfde bugklasse als TT-129)",
              instrument["voorLijst"] == ["Gitaar"] and instrument["naLijst"] == []
              and instrument["naTarget"] is None, json.dumps(instrument))

        check("geen paginafouten in blok 23", not page_errors, "; ".join(page_errors)[:300])
        page.evaluate("""() => {
          state.instruments = []; state.instrumentLevels = {};
        }""")

        # ─────────────────────────────────────────────────────────────
        # Blok 24 — e-mailadres en wachtwoord wijzigen (TT-299, 20-09-2026)
        # Ronald, 20-09-2026: "ik kan geen email aanpassen in de app. een
        # emailadres kan wijzigen." Het veld bestond al in "Wie ben je", maar
        # stond op readonly. Wijzigen gebeurt nu in één venster bij
        # Instellingen, samen met het wachtwoord.
        #
        # Het zwaarste punt zit in de twee uitkomsten: Supabase stuurt óf een
        # bevestigingsmail (`new_email` gevuld), óf hij wijzigt meteen. Welke
        # van de twee hangt af van een dashboard-instelling, niet van de code.
        # Beide worden hier nagebootst; de app moet per geval het juiste
        # zeggen, want "controleer je mail" bij een adres dat al gewijzigd is,
        # laat iemand wachten op een mail die nooit komt.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 24 — e-mailadres en wachtwoord wijzigen (TT-299)")
        page_errors.clear()

        opening = page.evaluate("""async () => {
          window.TT_STUB.reset();
          currentUser = { id: 'u1', email: 'oud@talenttent.org' };
          openInloggegevens();
          return {
            open: document.getElementById('inloggegevensModal').classList.contains('visible'),
            huidig: document.getElementById('igHuidigEmail').textContent,
            kruisje: !!document.querySelector('#inloggegevensModal .modal-close'),
            dataClose: document.getElementById('inloggegevensModal').getAttribute('data-close')
          };
        }""")
        check("Instellingen opent het venster met het huidige adres erin",
              opening["open"] and opening["huidig"] == "oud@talenttent.org",
              json.dumps(opening))
        check("het venster houdt zijn kruisje én data-close (TT-294)",
              opening["kruisje"] and opening["dataClose"] == "closeInloggegevens",
              json.dumps(opening))

        controles = page.evaluate("""async () => {
          const veld = document.getElementById('igNieuwEmail');
          const fout = () => { const p = veld.parentNode.querySelector('.field-msg');
            return p ? p.textContent : null; };
          const r = {};
          const tel = () => window.TT_STUB.calls.filter(c => c.name === 'updateUser').length;

          veld.value = '';
          await wijzigEmail();
          r.leeg = fout();

          veld.value = 'geenadres';
          await wijzigEmail();
          r.vorm = fout();

          veld.value = 'OUD@talenttent.org';
          await wijzigEmail();
          r.zelfde = fout();

          r.aanroepen = tel();
          r.confirmDicht = !document.getElementById('confirmModal').classList.contains('visible');
          return r;
        }""")
        check("leeg adres geeft een veldfout, geen toast",
              controles["leeg"] and "Vul je e-mailadres in" in controles["leeg"],
              json.dumps(controles))
        check("verkeerde vorm geeft de vaste tekst",
              controles["vorm"] and "bijvoorbeeld jouw@email.nl" in controles["vorm"],
              json.dumps(controles))
        check("het eigen adres opnieuw invullen wordt tegengehouden",
              controles["zelfde"] and "nu al gebruikt" in controles["zelfde"],
              json.dumps(controles))
        check("geen enkele afgekeurde poging bereikt Supabase",
              controles["aanroepen"] == 0 and controles["confirmDicht"],
              json.dumps(controles))

        vraag = page.evaluate("""async () => {
          document.getElementById('igNieuwEmail').value = 'nieuw@talenttent.org';
          await wijzigEmail();
          return {
            open: document.getElementById('confirmModal').classList.contains('visible'),
            tekst: document.getElementById('confirmMessage').textContent,
            knop: document.getElementById('confirmYesBtn').textContent,
            aanroepen: window.TT_STUB.calls.filter(c => c.name === 'updateUser').length
          };
        }""")
        check("een geldig adres vraagt eerst om bevestiging",
              vraag["open"] and vraag["aanroepen"] == 0, json.dumps(vraag))
        check("de vraag noemt het nieuwe adres en de mailbox, niet 'weet je het zeker'",
              "nieuw@talenttent.org" in vraag["tekst"]
              and "Kun je bij die mailbox?" in vraag["tekst"]
              and "zeker" not in vraag["tekst"].lower()
              and vraag["knop"] == "Ja, dat klopt",
              json.dumps(vraag))

        wacht = page.evaluate("""async () => {
          window.TT_STUB.updateUserResult = (a) => ({
            id: 'u1', email: 'oud@talenttent.org', new_email: a.email
          });
          confirmModalYes();
          await new Promise(res => setTimeout(res, 60));
          const m = document.getElementById('igMelding');
          return {
            zichtbaar: m.classList.contains('visible'),
            tekst: m.textContent,
            huidig: document.getElementById('igHuidigEmail').textContent,
            veldLeeg: document.getElementById('igNieuwEmail').value === ''
          };
        }""")
        check("wacht Supabase op een bevestiging, dan zegt de app dat er een mail onderweg is",
              wacht["zichtbaar"] and "mail gestuurd naar nieuw@talenttent.org" in wacht["tekst"]
              and "oud@talenttent.org" in wacht["tekst"], json.dumps(wacht))
        check("en het adres in beeld blijft tot die tijd het oude",
              wacht["huidig"] == "oud@talenttent.org" and wacht["veldLeeg"],
              json.dumps(wacht))

        direct = page.evaluate("""async () => {
          window.TT_STUB.updateUserResult = (a) => ({ id: 'u1', email: a.email });
          document.getElementById('igNieuwEmail').value = 'direct@talenttent.org';
          await wijzigEmail();
          confirmModalYes();
          await new Promise(res => setTimeout(res, 60));
          return {
            tekst: document.getElementById('igMelding').textContent,
            huidig: document.getElementById('igHuidigEmail').textContent,
            wbj: document.getElementById('wbjEmail').value,
            user: currentUser.email
          };
        }""")
        check("wijzigt Supabase meteen, dan zegt de app dát, niet 'controleer je mail'",
              "is gewijzigd" in direct["tekst"] and "mail gestuurd" not in direct["tekst"],
              json.dumps(direct))
        check("en het nieuwe adres staat meteen in het venster, in Wie ben je en in currentUser",
              direct["huidig"] == "direct@talenttent.org"
              and direct["wbj"] == "direct@talenttent.org"
              and direct["user"] == "direct@talenttent.org", json.dumps(direct))

        bezet = page.evaluate("""async () => {
          window.TT_STUB.updateUserResult = null;
          window.TT_STUB.updateUserError = { message: 'Email address already registered by another user' };
          // Een toast uit een eerder blok kan nog in beeld staan (3,5 seconde);
          // zonder deze regel meet de controle hieronder die oude melding.
          document.getElementById('appToast').classList.remove('visible');
          document.getElementById('igNieuwEmail').value = 'bezet@talenttent.org';
          await wijzigEmail();
          confirmModalYes();
          await new Promise(res => setTimeout(res, 60));
          const veld = document.getElementById('igNieuwEmail');
          const p = veld.parentNode.querySelector('.field-msg');
          window.TT_STUB.updateUserError = null;
          return {
            fout: p ? p.textContent : null,
            toast: document.getElementById('appToast').classList.contains('visible')
          };
        }""")
        check("'adres al in gebruik' komt bij het veld te staan, niet in een toast (huisstijl §13.1)",
              bezet["fout"] and "al in gebruik" in bezet["fout"] and not bezet["toast"],
              json.dumps(bezet))

        wachtwoord = page.evaluate("""async () => {
          const h = document.getElementById('igHuidigWachtwoord');
          const p1 = document.getElementById('igNieuwWachtwoord1');
          const p2 = document.getElementById('igNieuwWachtwoord2');
          const fout = (el) => { const p = el.parentNode.querySelector('.field-msg');
            return p ? p.textContent : null; };
          const wachtwoordCalls = () => window.TT_STUB.calls
            .filter(c => c.name === 'updateUser' && c.attrs && c.attrs.password).length;
          const r = {};

          h.value = ''; p1.value = 'kort'; p2.value = 'anders';
          await wijzigWachtwoord();
          r.huidigLeeg = fout(h);
          r.teKort = fout(p1);
          r.ongelijk = fout(p2);
          r.naControles = wachtwoordCalls();

          window.TT_STUB.authError = { message: 'Invalid login credentials' };
          h.value = 'verkeerd'; p1.value = 'nieuwgeheim1'; p2.value = 'nieuwgeheim1';
          await wijzigWachtwoord();
          r.verkeerdHuidig = fout(h);
          r.naVerkeerd = wachtwoordCalls();
          window.TT_STUB.authError = null;

          h.value = 'goedgeheim'; p1.value = 'nieuwgeheim1'; p2.value = 'nieuwgeheim1';
          await wijzigWachtwoord();
          r.naGoed = wachtwoordCalls();
          r.melding = document.getElementById('igMelding').textContent;
          r.veldenLeeg = !h.value && !p1.value && !p2.value;
          return r;
        }""")
        check("de drie wachtwoordfouten staan elk bij hun eigen veld",
              wachtwoord["huidigLeeg"] and "huidige wachtwoord" in wachtwoord["huidigLeeg"]
              and wachtwoord["teKort"] and "minimaal 8 tekens" in wachtwoord["teKort"]
              and wachtwoord["ongelijk"] and "komt niet overeen" in wachtwoord["ongelijk"]
              and wachtwoord["naControles"] == 0, json.dumps(wachtwoord))
        check("een verkeerd huidig wachtwoord houdt de wijziging tegen (TT-299)",
              wachtwoord["verkeerdHuidig"]
              and "hoort niet bij het e-mailadres" in wachtwoord["verkeerdHuidig"]
              and wachtwoord["naVerkeerd"] == 0, json.dumps(wachtwoord))
        check("met het juiste huidige wachtwoord gaat de wijziging door en blijf je ingelogd",
              wachtwoord["naGoed"] == 1 and "wachtwoord is gewijzigd" in wachtwoord["melding"]
              and "ingelogd" in wachtwoord["melding"] and wachtwoord["veldenLeeg"],
              json.dumps(wachtwoord))

        terug = page.evaluate("""async () => {
          openInloggegevens();
          document.getElementById('igNieuwEmail').value = 'blijft@talenttent.org';
          window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'instellingen' } }));
          await new Promise(res => setTimeout(res, 50));
          return {
            dicht: !document.getElementById('inloggegevensModal').classList.contains('visible'),
            veld: document.getElementById('igNieuwEmail').value,
            melding: document.getElementById('igMelding').classList.contains('visible')
          };
        }""")
        check("de terugknop sluit het venster en laat geen ingetypt adres achter",
              terug["dicht"] and terug["veld"] == "" and not terug["melding"],
              json.dumps(terug))

        check("geen paginafouten in blok 24", not page_errors, "; ".join(page_errors)[:300])
        page.evaluate("""() => {
          window.TT_STUB.reset();
          currentUser = null;
          document.getElementById('wbjEmail').value = '';
        }""")

        # ------------------------------------------------------------------
        # Blok 25 — TT-301: gecentreerd woordmerk en terugknop linksboven
        # ------------------------------------------------------------------
        print("\nBlok 25 — de kop: gecentreerd woordmerk en terugknop (TT-301)")

        html_bron = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        check("'THE' staat nergens meer in het woordmerk",
              "THE </span>" not in html_bron, "woordmerk bevat nog THE")

        kop301 = page.evaluate("""() => {
          const h = document.querySelector('header');
          const logo = h.querySelector('.logo');
          const terug = document.getElementById('navTerugBtn');
          const ham = document.getElementById('navMenuBtn');
          const hb = h.getBoundingClientRect();
          const lb = logo.getBoundingClientRect();
          const tb = terug.getBoundingClientRect();
          const kb = ham.getBoundingClientRect();
          return {
            kopMid: Math.round(hb.left + hb.width / 2),
            logoMid: Math.round(lb.left + lb.width / 2),
            terugLinks: Math.round(tb.left - hb.left),
            hamRechts: Math.round(hb.right - kb.right),
            terugB: Math.round(tb.width), terugH: Math.round(tb.height),
            terugMidY: Math.round(tb.top + tb.height / 2),
            hamMidY: Math.round(kb.top + kb.height / 2),
            logoPx: Math.round(parseFloat(getComputedStyle(logo).fontSize)),
            terugInHeader: h.contains(terug), hamInHeader: h.contains(ham)
          };
        }""")
        check("het woordmerk staat midden in de kop",
              abs(kop301["kopMid"] - kop301["logoMid"]) <= 2, json.dumps(kop301))
        check("terugknop en hamburger staan allebei in de koprij zelf",
              kop301["terugInHeader"] and kop301["hamInHeader"], json.dumps(kop301))
        check("beide knoppen staan even ver van hun eigen rand (16px)",
              kop301["terugLinks"] == 16 and kop301["hamRechts"] == 16, json.dumps(kop301))
        check("de terugknop haalt het tikdoel van 44x44px",
              kop301["terugB"] >= 44 and kop301["terugH"] >= 44, json.dumps(kop301))
        check("terugknop en hamburger staan op dezelfde middellijn",
              abs(kop301["terugMidY"] - kop301["hamMidY"]) <= 2, json.dumps(kop301))
        check("op een telefoon hoeft het woordmerk niet te krimpen (28px)",
              kop301["logoPx"] == 28, json.dumps(kop301))

        teken = page.evaluate("""() => {
          const t = document.querySelector('#navTerugBtn svg');
          const h = document.querySelector('#navMenuBtn svg');
          return {
            dikte: t.getAttribute('stroke-width'), hamDikte: h.getAttribute('stroke-width'),
            vulling: t.getAttribute('fill'),
            lijn: !!t.querySelector('polyline')
          };
        }""")
        maten = page.evaluate("""() => [...document.querySelectorAll('.kop-terug svg, #navMenuBtn svg')]
          .map(s => s.getAttribute('width') + 'x' + s.getAttribute('height'))""")
        check("elk terugteken en de hamburger zijn 24px, in de kop én in elk venster (TT-307, TT-311)",
              len(maten) >= 4 and all(m == "24x24" for m in maten), json.dumps(maten))
        check("het terugteken is een lijn-teken met dezelfde dikte als de hamburger (huisstijl §12)",
              teken["dikte"] == teken["hamDikte"] == "2" and teken["vulling"] == "none"
              and teken["lijn"], json.dumps(teken))

        zicht = page.evaluate("""() => {
          const btn = document.getElementById('navTerugBtn');
          const zichtbaar = () => getComputedStyle(btn).visibility === 'visible';
          const uit = {};
          // Opstartstand nabootsen: op het hoogste scherm, geen eigen stappen,
          // niets open (TT-303: het hoogste scherm is het openingsscherm).
          showView(hoogsteScherm());
          terugDiepte = 0; werkTerugKnopBij();
          uit.bijStart = zichtbaar();
          uit.magBijStart = magTerug();
          const hashVoor = location.hash;
          terugKnop();
          uit.hashNaLozeKlik = location.hash === hashVoor;
          showView('search');
          uit.naEenStap = zichtbaar();
          const modal = document.getElementById('musicianModal');
          terugDiepte = 0; modal.classList.add('visible');
          uit.metOpenVenster = magTerug();
          modal.classList.remove('visible');
          return uit;
        }""")
        check("op het openingsscherm is er niets om naar terug te gaan, maar de knop staat er wel (TT-310)",
              zicht["bijStart"] and not zicht["magBijStart"], json.dumps(zicht))
        check("een klik doet dan ook niets — de knop verlaat de app nooit",
              zicht["hashNaLozeKlik"], json.dumps(zicht))
        check("na één stap is de knop zichtbaar",
              zicht["naEenStap"], json.dumps(zicht))
        check("een open venster telt zelf als stap terug, ook zonder eigen stappen",
              zicht["metOpenVenster"], json.dumps(zicht))

        vensterkop = page.evaluate("""() => {
          const uit = [];
          document.querySelectorAll('.modal-kop').forEach(k => {
            const box = k.closest('.modal-box');
            const terug = k.querySelector('.kop-terug');
            uit.push({ id: box ? box.id : '?', terug: !!terug,
                       klik: terug ? (terug.getAttribute('onclick') || '') : '' });
          });
          return uit;
        }""")
        check("beide koprijen in een venster hebben dezelfde terugknop",
              len(vensterkop) == 2 and all(v["terug"] and "terugKnop()" in v["klik"]
                                           for v in vensterkop), json.dumps(vensterkop))

        # Het smalste canvas dat bestaat: tussen 561 en circa 780px venster is
        # #appRoot 50% breed (TT-224), dus smaller dan een telefoon. Daar moet
        # het woordmerk een trede kleiner, anders loopt het over de knoppen.
        page.set_viewport_size({"width": 561, "height": 844})
        page.wait_for_timeout(80)
        smal = page.evaluate("""() => {
          fitKopLogo(document);
          const h = document.querySelector('header');
          const logo = h.querySelector('.logo');
          const terug = document.getElementById('navTerugBtn').getBoundingClientRect();
          const ham = document.getElementById('navMenuBtn').getBoundingClientRect();
          const lb = logo.getBoundingClientRect();
          return {
            px: Math.round(parseFloat(getComputedStyle(logo).fontSize)),
            overlapLinks: Math.round(terug.right - lb.left),
            overlapRechts: Math.round(lb.right - ham.left)
          };
        }""")
        check("op het smalste canvas krimpt het woordmerk mee",
              smal["px"] < 28, json.dumps(smal))
        check("en het loopt daar niet over de knoppen heen",
              smal["overlapLinks"] <= 0 and smal["overlapRechts"] <= 0, json.dumps(smal))

        # De krapste stand die bestaat: het smalste canvas én een koprij met
        # drie knoppen (terug, ⋯, kruis). Daar zijn de noodtreden voor.
        drie = page.evaluate("""() => {
          const acties = document.getElementById('musicianModalActies');
          acties.innerHTML = '<button class="nav-menu-btn">x</button>';
          const m = document.getElementById('musicianModal');
          m.classList.add('visible');
          fitKopLogo(document);
          const kop = m.querySelector('.modal-kop');
          const logo = kop.querySelector('.logo');
          const lb = logo.getBoundingClientRect();
          const ab = kop.querySelector('.kop-links').getBoundingClientRect();
          const rb = kop.querySelector('.modal-kop-acties').getBoundingClientRect();
          const kb = kop.getBoundingClientRect();
          m.classList.remove('visible'); acties.innerHTML = '';
          return {
            px: Math.round(parseFloat(getComputedStyle(logo).fontSize)),
            links: Math.round(ab.right - lb.left), rechts: Math.round(lb.right - rb.left),
            mid: Math.round(kb.left + kb.width / 2) - Math.round(lb.left + lb.width / 2)
          };
        }""")
        check("met drie knoppen in een koprij blijft het woordmerk vrij van de knoppen",
              drie["links"] <= 0 and drie["rechts"] <= 0, json.dumps(drie))
        check("en het staat daar nog steeds in het midden",
              abs(drie["mid"]) <= 2, json.dumps(drie))
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(80)
        page.evaluate("() => { fitKopLogo(document); showView('landing'); }")

        check("geen paginafouten in blok 25", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ------------------------------------------------------------------
        # Blok 26 — TT-302: terug zonder opslaan
        # ------------------------------------------------------------------
        print("\nBlok 26 — terug zonder opslaan (TT-302)")

        terug = page.evaluate("""async () => {
          const label = document.getElementById('terugLabel');
          const pijl = document.getElementById('navTerugBtn');
          const zichtbaar = () => getComputedStyle(label).display !== 'none';
          const stap = () => window.dispatchEvent(
            new PopStateEvent('popstate', { state: { view: 'profieltegels' } }));
          const wacht = () => new Promise(res => setTimeout(res, 60));
          const uit = {};

          uit.tekst = label.textContent.trim();
          uit.isTekstregel = !!label && label.tagName !== 'BUTTON'
            && getComputedStyle(label).borderStyle === 'none';
          uit.inKop = !!label.closest('.app-topbar');

          // Tegelscherm met wijzigingen nabootsen.
          activeTegelScreen = 'wieBenJe';
          wbjSnapshot = '__andere_momentopname__';

          stap(); await wacht();
          uit.eersteDruk = { label: zichtbaar(), scherm: activeTegelScreen,
                             pijlGewapend: pijl.classList.contains('gewapend') };

          stap(); await wacht();
          uit.tweedeDruk = { label: zichtbaar(), scherm: activeTegelScreen };

          // Een tik ergens anders haalt de vraag weg.
          activeTegelScreen = 'wieBenJe';
          wbjSnapshot = '__andere_momentopname__';
          stap(); await wacht();
          const voorKlik = zichtbaar();
          document.body.click(); await wacht();
          uit.naKlikErnaast = { was: voorKlik, nu: zichtbaar(), scherm: activeTegelScreen };

          // Zonder wijzigingen geen vraag.
          activeTegelScreen = 'wieBenJe';
          wbjSnapshot = wbjFieldSnapshot();
          stap(); await wacht();
          uit.zonderWijziging = { label: zichtbaar(), scherm: activeTegelScreen };

          // Nooit twee vragen tegelijk: de knop onderin valt terug.
          activeTegelScreen = 'wieBenJe';
          wbjSnapshot = '__andere_momentopname__';
          const knop = document.getElementById('wbjCancelBtn');
          cancelWieBenJe();                 // knop onderin armeert
          const knopGewapend = knop.dataset.armed === '1';
          stap(); await wacht();            // nu de terugknop
          uit.eenVraag = { knopWasGewapend: knopGewapend,
                           knopNu: knop.dataset.armed === '1', label: zichtbaar() };

          ontwapenTerug();
          activeTegelScreen = 'overview';
          return uit;
        }""")
        check("de regel staat in de kop en is een tekstregel, geen knop",
              terug["inKop"] and terug["isTekstregel"]
              and terug["tekst"] == "Terug zonder opslaan?", json.dumps(terug))
        check("de eerste druk gaat niet terug, maar toont de vraag",
              terug["eersteDruk"]["label"] and terug["eersteDruk"]["scherm"] == "wieBenJe",
              json.dumps(terug))
        check("de terugknop laat zien dat hij het antwoord is",
              terug["eersteDruk"]["pijlGewapend"], json.dumps(terug))
        check("de tweede druk gaat wel terug en haalt de vraag weg",
              terug["tweedeDruk"]["scherm"] == "overview"
              and not terug["tweedeDruk"]["label"], json.dumps(terug))
        check("een tik ergens anders haalt de vraag weg en laat je staan",
              terug["naKlikErnaast"]["was"] and not terug["naKlikErnaast"]["nu"]
              and terug["naKlikErnaast"]["scherm"] == "wieBenJe", json.dumps(terug))
        check("zonder wijzigingen komt er geen vraag",
              not terug["zonderWijziging"]["label"]
              and terug["zonderWijziging"]["scherm"] == "overview", json.dumps(terug))
        check("er staat nooit meer dan één vraag op het scherm",
              terug["eenVraag"]["knopWasGewapend"] and not terug["eenVraag"]["knopNu"]
              and terug["eenVraag"]["label"], json.dumps(terug))

        knoppen = page.evaluate("""() => {
          const bron = [cancelWieBenJe, cancelWatSpeelJe, cancelWatZoekJe,
                        cancelJeSetlist, cancelJeMediahoek].map(f => f.toString());
          return { viaEenControle: bron.filter(t => t.includes('tegelHeeftWijzigingen')).length,
                   totaal: bron.length };
        }""")
        check("beide wegen terug gebruiken dezelfde controle, geen variant per scherm",
              knoppen["viaEenControle"] == knoppen["totaal"] == 5, json.dumps(knoppen))

        check("geen paginafouten in blok 26", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ------------------------------------------------------------------
        # Blok 27 — TT-303: hoogste scherm, terugknop omhoog, volgorde onderin
        # ------------------------------------------------------------------
        print("\nBlok 27 — hoogste scherm en volgorde onderin (TT-303)")

        volgorde = page.evaluate("""() => [...document.querySelectorAll('.app-bottom-nav .bottom-nav-btn')]
          .map(b => b.id)""")
        check("de onderbalk staat op Profiel · Zoeken · Berichten · Bands",
              volgorde == ["bottomNavProfile", "bottomNavSearch", "bottomNavMessages", "bottomNavBands"],
              json.dumps(volgorde))

        # .naam-meter is het onzichtbare meetelement van fitKopLogo(), geen woordmerk.
        merk = page.evaluate("""() => [...document.querySelectorAll('.logo:not(.naam-meter)')]
          .map(el => el.getAttribute('onclick') || '')""")
        check("elk woordmerk gaat naar het hoogste scherm, niet vast naar de landingspagina",
              len(merk) >= 3 and all("naarHoogsteScherm()" in o for o in merk)
              and not any("showView('landing')" in o for o in merk), json.dumps(merk))

        hoogste = page.evaluate("""async () => {
          const btn = document.getElementById('navTerugBtn');
          const zichtbaar = () => getComputedStyle(btn).visibility === 'visible';
          const uit = {};
          const bewaard = currentUser;

          currentUser = null;
          uit.uitgelogd = hoogsteScherm();
          showView('landing'); terugDiepte = 0; werkTerugKnopBij();
          uit.opLanding = zichtbaar();
          uit.magOpLanding = magTerug();

          currentUser = { id: 'test' };
          uit.ingelogd = hoogsteScherm();
          showView('myprofile'); terugDiepte = 0; werkTerugKnopBij();
          uit.opProfiel = zichtbaar();
          uit.magOpProfiel = magTerug();
          // Een druk op het hoogste scherm doet niets: je blijft waar je bent.
          terugKnop();
          await new Promise(res => setTimeout(res, 60));
          uit.naLozeDruk = [...document.querySelectorAll('.app-view.active')].map(v => v.id);

          // Op een hoofdtabblad wijst de knop omhoog, niet door het klikpad.
          showView('search'); showView('messages'); showView('bands');
          uit.opTabblad = zichtbaar();
          uit.gaatOmhoog = terugGaatOmhoog();
          const stappenVoor = terugDiepte;
          terugKnop();
          await new Promise(res => setTimeout(res, 60));
          uit.naDruk = [...document.querySelectorAll('.app-view.active')].map(v => v.id);
          uit.geenStapTerug = terugDiepte > stappenVoor; // omhoog is een nieuwe stap

          currentUser = bewaard;
          showView('landing'); terugDiepte = 0; werkTerugKnopBij();
          return uit;
        }""")
        check("het hoogste scherm is Mijn Profiel ingelogd, de landingspagina uitgelogd",
              hoogste["ingelogd"] == "myprofile" and hoogste["uitgelogd"] == "landing",
              json.dumps(hoogste))
        check("op het hoogste scherm staat de terugknop er ook, uitgelogd én ingelogd (TT-310)",
              hoogste["opLanding"] and hoogste["opProfiel"], json.dumps(hoogste))
        check("maar daar is niets om naar terug te gaan, en een druk laat je op Mijn Profiel",
              not hoogste["magOpLanding"] and not hoogste["magOpProfiel"]
              and hoogste["naLozeDruk"] == ["view-myprofile"], json.dumps(hoogste))
        check("op een hoofdtabblad staat hij wel, en wijst hij omhoog",
              hoogste["opTabblad"] and hoogste["gaatOmhoog"], json.dumps(hoogste))
        check("een druk daar brengt je naar Mijn Profiel, niet naar het vorige tabblad",
              hoogste["naDruk"] == ["view-myprofile"], json.dumps(hoogste))

        check("geen paginafouten in blok 27", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ------------------------------------------------------------------
        # Blok 28 — TT-42: registratie met toestemming van een ouder (route A)
        # ------------------------------------------------------------------
        print("\nBlok 28 — toestemming van een ouder (TT-42)")

        leeftijd = page.evaluate("""() => {
          const uit = {};
          const veld = document.getElementById('birth_date');
          const hint = document.getElementById('ouderLeeftijdHint');
          const ww   = document.getElementById('regPasswordField');
          const zichtbaar = el => el && getComputedStyle(el).display !== 'none';

          const meet = (datum) => {
            veld.value = datum;
            ouderLeeftijdsregel();
            return { hint: zichtbaar(hint), ww: zichtbaar(ww) };
          };
          const nu = new Date();
          const jaarGeleden = (n) => `01-01-${nu.getFullYear() - n}`;

          uit.veertien = meet(jaarGeleden(14));
          uit.twintig  = meet(jaarGeleden(20));
          uit.dertien  = meet(jaarGeleden(13));
          uit.zestien  = meet(jaarGeleden(16));
          uit.leeg     = meet('');
          return uit;
        }""")
        check("de regel verschijnt bij 13, 14 en 15 en niet daarbuiten",
              leeftijd["veertien"]["hint"] and leeftijd["dertien"]["hint"]
              and not leeftijd["zestien"]["hint"] and not leeftijd["twintig"]["hint"]
              and not leeftijd["leeg"]["hint"], json.dumps(leeftijd))
        check("het wachtwoordveld verdwijnt precies bij die leeftijden",
              not leeftijd["veertien"]["ww"] and not leeftijd["dertien"]["ww"]
              and leeftijd["zestien"]["ww"] and leeftijd["twintig"]["ww"],
              json.dumps(leeftijd))

        # De koppeling in goTo() loopt op volgorde over `.panel`. Een zesde
        # `.panel` zou elke wizardstap één plek opschuiven.
        panelen = page.evaluate("""() => ({
          panel: [...document.querySelectorAll('.panel')].map(p => p.id),
          ouder: [...document.querySelectorAll('.panel-ouder')].map(p => p.id)
        })""")
        check("er zijn precies vijf .panel-elementen, de vijf wizardstappen",
              panelen["panel"] == ["step0", "step1", "step2", "step3", "step4"],
              json.dumps(panelen))
        check("de drie ouder-schermen dragen panel-ouder",
              panelen["ouder"] == ["ouderStap", "ouderWacht", "ouderWachtwoord"],
              json.dumps(panelen))

        tonen = page.evaluate("""() => {
          ouderPaneelTonen('ouderStap');
          const uit = {
            actief: [...document.querySelectorAll('.panel-ouder.active')].map(p => p.id),
            stappen: [...document.querySelectorAll('.panel.active')].map(p => p.id),
            balk: document.getElementById('stepsBar').style.display
          };
          ouderPaneelSluiten();
          uit.naSluiten = [...document.querySelectorAll('.panel-ouder.active')].length;
          uit.balkTerug = document.getElementById('stepsBar').style.display;
          return uit;
        }""")
        check("één ouder-scherm tegelijk, geen wizardstap ernaast, stappenbalk weg",
              tonen["actief"] == ["ouderStap"] and tonen["stappen"] == []
              and tonen["balk"] == "none" and tonen["naSluiten"] == 0
              and tonen["balkTerug"] == "", json.dumps(tonen))

        # Route A leunt erop dat het werk dagen blijft staan. sessionStorage
        # verdwijnt bij het sluiten van het tabblad; dat mag hier niet meer.
        opslag = page.evaluate("""() => {
          const uit = {};
          state.ouderRoute = true;
          state.fname = 'Testkind';
          state.currentStep = 2;
          saveOnboardingProgress();
          uit.lokaal = !!localStorage.getItem('tt_onboarding_v1');
          uit.sessie = !!sessionStorage.getItem('tt_onboarding_v1');
          const terug = leesOuderVoortgang();
          uit.naam = terug && terug.fname;
          clearOnboardingProgress();
          uit.naWissen = !!localStorage.getItem('tt_onboarding_v1');
          state.ouderRoute = false;
          return uit;
        }""")
        check("de voortgang staat in localStorage, niet in sessionStorage",
              opslag["lokaal"] and not opslag["sessie"], json.dumps(opslag))
        check("route A leest zijn eigen voortgang terug en wist hem weer",
              opslag["naam"] == "Testkind" and not opslag["naWissen"], json.dumps(opslag))

        kaal = page.evaluate("""() => {
          const zichtbaar = id => {
            const el = document.getElementById(id);
            if (!el) return false;
            const s = getComputedStyle(el);
            return s.display !== 'none' && s.visibility !== 'hidden';
          };
          showView('toestemming');
          const uit = {
            onderbalk: zichtbaar('appBottomNav'),
            hamburger: zichtbaar('navMenuBtn'),
            terug:     zichtbaar('navTerugBtn'),
            actief:    [...document.querySelectorAll('.app-view.active')].map(v => v.id)
          };
          showView('landing');
          uit.onderbalkTerug = zichtbaar('appBottomNav');
          uit.hamburgerTerug = zichtbaar('navMenuBtn');
          return uit;
        }""")
        check("de goedkeuringspagina staat er, zonder onderbalk, hamburger of terugknop",
              kaal["actief"] == ["view-toestemming"] and not kaal["onderbalk"]
              and not kaal["hamburger"] and not kaal["terug"], json.dumps(kaal))
        check("beide komen terug zodra je die pagina verlaat",
              kaal["onderbalkTerug"] and kaal["hamburgerTerug"], json.dumps(kaal))

        # De code moet in de adresregel blijven staan, anders werkt verversen
        # van de goedkeuringspagina niet meer.
        adres = page.evaluate("""() => {
          history.replaceState({}, '', '#toestemming/abc123');
          showView('toestemming');
          const uit = { hash: location.hash };
          showView('landing');
          return uit;
        }""")
        check("showView() laat de code in de adresregel staan",
              adres["hash"] == "#toestemming/abc123", json.dumps(adres))

        check("geen paginafouten in blok 28", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ------------------------------------------------------------------
        # Blok 29 — TT-281: opslaan is alles of niets
        # ------------------------------------------------------------------
        print("\nBlok 29 — opslaan is alles of niets (TT-281)")

        ato = page.evaluate("""async () => {
          const S = window.TT_STUB;
          const uit = {};
          const zet = () => {
            S.data.musician_songs = [{ musician_id: 'm1', song_title: 'Oud', song_artist: 'A', mastery_level: 3 }];
            S.data.musician_instruments = [{ musician_id: 'm1', instrument: 'Drums', niveau: 3 }];
            S.data.musician_genres = [{ musician_id: 'm1', genre: 'Rock' }];
          };
          const titels = () => S.data.musician_songs.filter(r => r.musician_id === 'm1').map(r => r.song_title);
          const losGewist = () => S.calls.some(c => c.kind === 'table' && c.op === 'delete');
          myMusicianId = 'm1';

          // Je setlist — mislukt
          zet(); S.calls = [];
          S.rpcErrors.tt_save_musician_koppelingen = { code: '23514', message: 'check' };
          jstSongs = [{ title: 'Nieuw', artist: 'B', level: 2 }]; jstSnapshot = '';
          await saveJeSetlist();
          uit.setlistFout = titels();
          uit.setlistFoutLos = losGewist();
          uit.setlistToast = (document.getElementById('appToast') || {}).textContent || '';
          delete S.rpcErrors.tt_save_musician_koppelingen;

          // Je setlist — lukt
          zet(); S.calls = [];
          jstSongs = [{ title: 'Nieuw', artist: 'B', level: 2 }]; jstSnapshot = '';
          await saveJeSetlist();
          uit.setlistGoed = titels();
          const rpc = S.calls.find(c => c.kind === 'rpc' && c.name === 'tt_save_musician_koppelingen');
          uit.setlistAlleenSongs = !!rpc && Object.keys(rpc.params).sort().join(',') === 'p_musician_id,p_songs';

          // Wat speel je — mislukt: instrumenten en genres blijven staan
          zet(); S.calls = [];
          S.rpcErrors.tt_save_musician_koppelingen = { code: '23514', message: 'check' };
          wspState = { instruments: ['Bas'], instrumentLevels: {}, genres: ['Jazz'] }; wspSnapshot = '';
          await saveWatSpeelJe();
          uit.wspFout = S.data.musician_instruments.map(r => r.instrument).concat(S.data.musician_genres.map(r => r.genre));
          uit.wspFoutLos = losGewist();
          delete S.rpcErrors.tt_save_musician_koppelingen;

          // Profiel verwijderen — mislukt: het profiel blijft staan
          zet(); S.calls = [];
          S.rpcErrors.tt_delete_own_profile = { code: 'P0001', message: 'Band kon niet worden overgedragen' };
          const voor = S.data.musicians.length;
          try { await executeAccountDeletion(); } catch (e) {}
          uit.verwijderFoutProfiel = S.data.musicians.length === voor;
          uit.verwijderFoutLos = losGewist();
          uit.verwijderFoutUit = S.calls.some(c => c.kind === 'auth' && c.name === 'signOut');
          delete S.rpcErrors.tt_delete_own_profile;
          myMusicianId = null;
          return uit;
        }""")
        check("mislukt opslaan van Je setlist laat het oude repertoire staan",
              ato["setlistFout"] == ["Oud"], json.dumps(ato))
        check("en meldt dat het niet gelukt is", "niet gelukt" in ato["setlistToast"], ato["setlistToast"])
        check("Je setlist wist niet meer los vooraf", not ato["setlistFoutLos"], "")
        check("gelukt opslaan vervangt het repertoire", ato["setlistGoed"] == ["Nieuw"], json.dumps(ato))
        check("Je setlist raakt alleen het repertoire",
              ato["setlistAlleenSongs"], json.dumps(ato))
        check("mislukt opslaan van Wat speel je laat instrumenten en genres staan",
              ato["wspFout"] == ["Drums", "Rock"] and not ato["wspFoutLos"], json.dumps(ato))
        check("mislukt verwijderen laat het profiel staan en logt niet uit",
              ato["verwijderFoutProfiel"] and not ato["verwijderFoutLos"]
              and not ato["verwijderFoutUit"], json.dumps(ato))

        check("geen paginafouten in blok 29", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ------------------------------------------------------------------
        # Blok 30 — menu's en goud (24-09-2026, Ronald)
        # Eén menu tegelijk; een donkere laag achter elk open menu; een menu
        # is lichter dan de pagina; nergens goud als doorschijnend vlak; de
        # wizard telt met één teller (TT-250).
        # ------------------------------------------------------------------
        print("\nBlok 30 — menu's en goud (TT-290, TT-259, TT-250, TT-315)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        # Het eigen profiel wordt in een gewone view gezet. loadMyProfile() zelf
        # laden kan tegen de stub niet volledig.
        page.evaluate("showView('about')")
        page.wait_for_timeout(100)
        page.evaluate("""() => {
          hasOwnProfile = true; myMusicianId = 'm1';
          const plek = document.createElement('div'); plek.id = 'testProfiel';
          document.getElementById('view-about').prepend(plek);
          plek.innerHTML = buildMusicianDetailHTML({
            id: 'm1', fname: 'Ronald', lname: 'W', username: 'ronald', bio: 'test',
            musician_songs: [], musician_media: [], musician_instruments: [],
            musician_genres: [], musician_wanted: [] }, true, false);
        }""")

        check("het eigen profiel staat in beeld, met het ⋯-menu",
              page.evaluate("document.getElementById('profileMoreBtn').getBoundingClientRect().width > 0"), "")

        def midden(sel):
            return page.evaluate("""s => { const r = document.querySelector(s).getBoundingClientRect();
              return [r.left + r.width / 2, r.top + r.height / 2]; }""", sel)

        def bovenste(x, y):
            return page.evaluate("""([x, y]) => { const e = document.elementFromPoint(x, y);
              return e ? (e.closest('.menu-laag') ? 'laag' : e.closest('.nav-menu-dropdown,.inline-menu-dropdown,.choice-menu') ? 'menu' : e.outerHTML.slice(0, 120)) : null; }""", [x, y])

        open_menus = "document.querySelectorAll('.nav-menu-dropdown.visible,.inline-menu-dropdown.visible,.choice-menu.open').length"
        lagen = "document.querySelectorAll('.menu-laag').length"

        # Hamburger open, dan het ⋯ op het profiel: één menu, één laag.
        x, y = midden("#navMenuBtn"); page.mouse.click(x, y); page.wait_for_timeout(50)
        check("hamburger open: één laag erachter", page.evaluate(lagen) == 1, str(page.evaluate(lagen)))
        onderbalk = midden("#bottomNavSearch")
        check("de laag dekt de onderbalk af", bovenste(*onderbalk) == "laag", bovenste(*onderbalk))
        check("het menu ligt boven de laag", bovenste(*midden("#navAbout")) == "menu", bovenste(*midden("#navAbout")))
        # Een tik naast het menu (links, midden in beeld) landt op de laag.
        page.mouse.click(20, 420); page.wait_for_timeout(50)
        check("een tik naast het hamburgermenu sluit het, zonder van scherm te wisselen",
              page.evaluate(open_menus) == 0 and page.evaluate("huidigeView") == "about",
              f"{page.evaluate(open_menus)} menu's open, view {page.evaluate('huidigeView')}")
        page.evaluate("toggleNavMenu()")
        page.evaluate("toggleProfileMoreMenu()")
        check("twee menu's na elkaar openen: er staat er één open",
              page.evaluate(open_menus) == 1 and page.evaluate(lagen) == 1,
              f"{page.evaluate(open_menus)} menu's, {page.evaluate(lagen)} lagen")
        check("het tweede menu is het open menu",
              page.evaluate("document.getElementById('profileMoreDropdown').classList.contains('visible')"), "")
        check("de laag dekt de kop af", bovenste(*midden(".logo")) == "laag", bovenste(*midden(".logo")))
        check("de laag dekt de onderbalk af (menu in de pagina)", bovenste(*onderbalk) == "laag", bovenste(*onderbalk))

        # Een tik op de laag sluit het menu en bereikt niets eronder.
        page.evaluate("window.__zoekGetikt = false; document.getElementById('bottomNavSearch').addEventListener('click', () => { window.__zoekGetikt = true; }, { once: true })")
        page.mouse.click(*onderbalk); page.wait_for_timeout(50)
        check("een tik op de laag sluit het menu en haalt de laag weg",
              page.evaluate(open_menus) == 0 and page.evaluate(lagen) == 0, "")
        check("die tik bereikt de onderbalk niet", not page.evaluate("window.__zoekGetikt"), "")

        # Escape en een view-wissel sluiten ook.
        page.evaluate("toggleProfileMoreMenu()"); page.keyboard.press("Escape")
        check("Escape sluit het menu en de laag",
              page.evaluate(open_menus) == 0 and page.evaluate(lagen) == 0, "")
        page.evaluate("document.getElementById('testProfiel').remove()")
        page.evaluate("toggleNavMenu()"); page.evaluate("showView('privacy')")
        check("een view-wissel sluit het menu en de laag",
              page.evaluate(open_menus) == 0 and page.evaluate(lagen) == 0
              and page.evaluate("document.querySelectorAll('.menu-drager').length") == 0, "")

        # Keuzemenu (Sorteren op) doet mee in dezelfde regel.
        page.evaluate("showView('search')"); page.wait_for_timeout(100)
        page.evaluate("toggleNavMenu()")
        page.evaluate("toggleChoiceMenu('sorteren')")
        check("keuzemenu openen sluit het hamburgermenu",
              page.evaluate(open_menus) == 1 and page.evaluate(lagen) == 1
              and page.evaluate("actiefKeuzeMenu") == "sorteren", "")
        page.evaluate("toggleNavMenu()")
        page.wait_for_timeout(300)
        check("hamburger openen sluit het keuzemenu",
              page.evaluate("actiefKeuzeMenu") is None and page.evaluate(lagen) == 1, "")
        page.evaluate("sluitAlleMenus()")

        # Het menu is lichter dan de pagina.
        kleuren = page.evaluate("""() => ['navMenuDropdown', 'profileMoreDropdown'].map(id => {
            const el = document.getElementById(id); return el ? getComputedStyle(el).backgroundColor : null; })
            .concat([getComputedStyle(document.querySelector('.choice-menu')).backgroundColor])""")
        check("elk menu heeft het vlak --surface2", all(k == "rgb(30, 30, 30)" for k in kleuren if k), json.dumps(kleuren))

        # Goud nooit als doorschijnend vlak (huisstijl §1.1).
        css = open(os.path.join(ROOT, "styles.css"), encoding="utf-8").read()
        html_src = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        goud = re.compile(r"rgba\(\s*245\s*,\s*197\s*,\s*24\s*,")
        check("styles.css en index.html gebruiken nergens doorschijnend goud",
              not goud.search(css) and not goud.search(html_src),
              "; ".join(m.group(0) for m in goud.finditer(css + html_src))[:200])
        tab = page.evaluate("""() => { const t = document.querySelector('.search-mode-tab.active');
            return t ? getComputedStyle(t).backgroundColor : null; }""")
        check("het actieve zoektabblad heeft wit op 5% (TT-290)", tab == "rgba(255, 255, 255, 0.05)", str(tab))
        focus = page.evaluate("""() => { const i = document.createElement('input'); document.getElementById('appRoot').appendChild(i);
            i.style.transition = 'none'; i.focus();
            const cs = getComputedStyle(i); const b = [cs.boxShadow, cs.borderTopColor]; i.remove(); return b; }""")
        check("de focusrand van een veld is 2px vol goud, zonder gloed (TT-259)",
              focus[0] == "rgb(245, 197, 24) 0px 0px 0px 1px" and focus[1] == "rgb(245, 197, 24)", json.dumps(focus))

        # Eén tagvorm in de hele app (TT-315): wit op 10% (vervolg 24-09-2026), geen rand, kleur in de tekst.
        tags = page.evaluate("""() => {
          const plek = document.createElement('div'); document.getElementById('appRoot').appendChild(plek);
          plek.innerHTML = tagSolid('Drums', '#f5c518') + tagSolid('Rock', '#6ec8d8')
            + '<span class="tag-solid tag-genre">Bas</span><span class="band-status-badge band-status-zoekend">Zoekend</span>';
          const uit = [...plek.children].map(e => { const cs = getComputedStyle(e);
            return [cs.backgroundColor, cs.borderTopStyle === 'none' || cs.borderTopWidth === '0px', cs.color]; });
          plek.remove(); return uit; }""")
        check("elke tag heeft het vlak wit op 10% en geen rand (TT-315)",
              all(t[0] == "rgba(255, 255, 255, 0.1)" and t[1] for t in tags), json.dumps(tags))
        check("de kleur zit in de tekst: goud, cyaan, cyaan, goud",
              [t[2] for t in tags] == ["rgb(245, 197, 24)", "rgb(110, 200, 216)", "rgb(110, 200, 216)", "rgb(245, 197, 24)"],
              json.dumps(tags))
        check("tagSolid() zet geen doorschijnende kleur meer",
              "rgba" not in page.evaluate("tagSolid('x', '#f5c518')"), page.evaluate("tagSolid('x', '#f5c518')"))

        # De wizard telt met één teller (TT-250).
        page.evaluate("showView('register')"); page.wait_for_timeout(50)
        page.evaluate("goTo(1)")
        label = page.evaluate("document.getElementById('stepLabel').textContent")
        check("de wizard toont 'Stap 2 van 5' (TT-250)", label == "Stap 2 van 5", label)
        doorzicht = page.evaluate("getComputedStyle(document.querySelector('.step-dot.done')).opacity")
        check("een afgeronde stap is vol goud", doorzicht == "1", doorzicht)
        page.evaluate("goTo(0)")
        check("en begint op 'Stap 1 van 5'",
              page.evaluate("document.getElementById('stepLabel').textContent") == "Stap 1 van 5", "")

        check("geen paginafouten in blok 30", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()
        page.evaluate("hasOwnProfile = false; myMusicianId = null; window.TT_STUB.reset()")

        # ------------------------------------------------------------------
        # Blok 31 — TT-316: knoppen en badges, één vorm per soort
        # Besluiten Ronald 24-09-2026: K1 t/m K12 akkoord, bandsterren weg uit
        # de lijsten. Alles gemeten op 390px breed.
        # ------------------------------------------------------------------
        print("\nBlok 31 — knoppen en badges, één vorm per soort (TT-316)")
        page.evaluate("window.TT_STUB.reset()")
        page_errors.clear()
        # De rand wordt gelezen uit de CSS-regel zelf. Een gemeten rand zegt
        # niets: Chromium rondt 1,5px af op 1px, ook bij pixeldichtheid 2 en 3
        # (gemeten 24-09-2026, Chromium 141).
        def rand(sel):
            return page.evaluate("""s => { for (const sh of document.styleSheets) { let rs; try { rs = sh.cssRules; } catch (e) { continue; }
                for (const r of rs) { if (!r.selectorText) continue;
                  const b = r.style.getPropertyValue('border') || r.style.getPropertyValue('border-top');
                  if (r.selectorText.split(',').map(x => x.trim()).includes(s) && b) return b.split(' ')[0]; } }
                return null; }""", sel)
        css316 = open(os.path.join(ROOT, "styles.css"), encoding="utf-8").read()
        js316 = "".join(open(os.path.join(ROOT, f), encoding="utf-8").read() for f in JS_FILES)
        html316 = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        bron316 = css316 + js316 + html316
        oude = ["search-btn", "landing-btn", "wizard-btn", "btn-sm", "media-speler-knop",
                "media-speler-sluit", "media-rij-weg", "result-card-msg-btn"]
        over = [k for k in oude if re.search(r"(?<![\w-])" + re.escape(k) + r"(?![\w-])",
                                             re.sub(r"/\*.*?\*/", "", bron316, flags=re.S))]
        check("K1: de afwijkende knopklassen zijn weg uit CSS, JS en HTML", not over, ", ".join(over))

        # K1 — elke hoofdknop één vorm. Zoekpagina, landing en wizard.
        def vorm(sel):
            return page.evaluate("""s => [...document.querySelectorAll(s)].filter(e => e.offsetParent).map(e => {
              const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
              return [cs.fontSize, cs.fontWeight, cs.textTransform, cs.color, cs.backgroundColor,
                      Math.round(r.height), e.textContent.trim()]; })""", sel)
        page.evaluate("showView('landing')"); page.wait_for_timeout(450)
        hoofd = vorm("#view-landing .btn-primary")
        page.evaluate("showView('search')"); page.wait_for_timeout(450)
        hoofd += vorm("#view-search .btn-row .btn-primary")
        page.evaluate("showView('register')"); page.wait_for_timeout(450)
        hoofd += vorm("#view-register .wizard-action-bar .btn-primary")
        check("K1: er staan hoofdknoppen in beeld op landing, zoeken en wizard", len(hoofd) >= 3, json.dumps(hoofd)[:200])
        check("K1: elke hoofdknop 14px, vet, hoofdletters, zwart op goud",
              all(h[:5] == ["14px", "700", "uppercase", "rgb(0, 0, 0)", "rgb(245, 197, 24)"] for h in hoofd),
              json.dumps([h for h in hoofd if h[:5] != ["14px", "700", "uppercase", "rgb(0, 0, 0)", "rgb(245, 197, 24)"]])[:300])

        # K3 — twee knoppen naast elkaar blijven 44px hoog, op één regel.
        rij = page.evaluate("""() => { showConfirm('Test', () => {}); const r = document.querySelector('#confirmModal .btn-row');
            const u = [...r.children].map(b => Math.round(b.getBoundingClientRect().height));
            document.getElementById('confirmModal').classList.remove('visible'); return u; }""")
        # Besluit Ronald 24-09-2026: een tekst die niet past, loopt over twee
        # regels. Geen kortere teksten. De knoppen blijven wel even hoog.
        check("K3: twee knoppen naast elkaar zijn even hoog en minstens 44px", len(set(rij)) == 1 and rij[0] >= 44, json.dumps(rij))
        opv = page.evaluate("""() => { const b = document.querySelector('#confirmModal .btn-row .btn'); return getComputedStyle(b).paddingLeft; }""")
        check("K3: in een knoppenrij 12px opvulling links en rechts", opv == "12px", opv)
        lijst = page.evaluate("""() => { const d = document.createElement('div'); d.className = 'lijst-rij';
            d.innerHTML = '<button class="btn btn-danger">Verwijderen</button>'; document.getElementById('appRoot').appendChild(d);
            const w = getComputedStyle(d.firstChild).paddingLeft; d.remove(); return w; }""")
        check("K3: een knop naast een naam in een ledenlijst ook 12px", lijst == "12px", lijst)
        check("K3: beide ledenlijsten dragen de klasse lijst-rij",
              len(re.findall(r'class="(?:member-search-row )?lijst-rij"', js316)) == 2, "")
        page.evaluate("showView('register')"); page.wait_for_timeout(450)
        wiz = page.evaluate("""() => { const r = document.querySelector('#view-register .wizard-action-bar-inner');
            const b = [...r.children].filter(x => x.offsetParent).map(x => x.getBoundingClientRect());
            return { grid: getComputedStyle(r).display, breed: b.map(x => Math.round(x.width)), hoog: b.map(x => Math.round(x.height)) }; }""")
        check("K3: de wizardbalk is een knoppenrij met gelijke breedte (TT-228)",
              wiz["grid"] == "grid" and len(set(wiz["breed"])) == 1, json.dumps(wiz))

        # K5 — tweede knop: wit, rand --line. Ook Terug in de wizard.
        terug = page.evaluate("""() => { const b = [...document.querySelectorAll('#view-register .wizard-action-bar .btn-ghost')].find(x => x.offsetParent);
            const cs = getComputedStyle(b); return [cs.color, cs.borderTopStyle, cs.fontSize, cs.textTransform, b.className]; }""")
        check("K5: Terug in de wizard is een tweede knop: wit, 14px, hoofdletters",
              terug[:4] == ["rgb(240, 240, 240)", "solid", "14px", "uppercase"] and "btn-ghost" in terug[4], json.dumps(terug))
        check("K5: de tweede knop heeft een rand van --line", rand(".btn-ghost") == "var(--line)", str(rand(".btn-ghost")))
        page.evaluate("goTo(4)"); page.wait_for_timeout(450)
        foto = page.evaluate("""() => { const b = document.getElementById('avatarRemoveBtn'); b.classList.add('visible');
            const h = Math.round(b.getBoundingClientRect().height); const c = b.className; b.classList.remove('visible'); return [h, c]; }""")
        check("K5: Foto verwijderen is een tweede knop van 44px (§6)",
              foto[0] >= 44 and "btn-ghost" in foto[1], json.dumps(foto))

        # K2 — Account verwijderen omlijnd in rood.
        rood = page.evaluate("""() => { const b = document.getElementById('deleteAccountConfirmBtn'); const cs = getComputedStyle(b);
            return [cs.backgroundColor, cs.color, cs.borderTopColor, cs.borderTopStyle]; }""")
        check("K2: Account verwijderen is omlijnd in rood, geen vlak (§5)",
              rood == ["rgba(0, 0, 0, 0)", "rgb(229, 83, 61)", "rgb(229, 83, 61)", "solid"], json.dumps(rood))

        # K6 — één gestippelde vorm.
        stip = page.evaluate("""() => ['.add-link-btn', '.bio-prompt-chip'].map(s => { const e = document.querySelector(s);
            const cs = getComputedStyle(e); return [cs.borderTopStyle, cs.borderTopWidth, cs.borderTopLeftRadius, cs.fontSize, cs.fontWeight, cs.color, cs.minHeight]; })""")
        check("K6: + Link toevoegen en de bio-voorzet hebben dezelfde vorm",
              stip[0] == stip[1] and stip[0][0] == "dashed" and stip[0][2] == "8px" and stip[0][6] == "44px"
              and rand(".bio-prompt-chip") == "var(--line)", json.dumps(stip) + " " + str(rand(".bio-prompt-chip")))

        # K7/K8/K12 — zeven keuzesoorten, één stand voor gekozen en niet-gekozen.
        keuze = page.evaluate("""() => {
          const plek = document.createElement('div'); document.getElementById('appRoot').appendChild(plek);
          const soorten = [['div','tag','selected'], ['button','level-btn','active-bijna'], ['div','segmented-btn','selected'],
                           ['button','search-mode-tab','active'], ['button','media-tab','active'], ['div','goal-card','selected'],
                           ['button','level-choice','selected']];
          const meet = e => { const cs = getComputedStyle(e);
            return [cs.backgroundColor, cs.borderTopWidth, cs.borderTopColor, cs.borderTopLeftRadius, cs.color, cs.fontWeight, cs.fontStyle].join(' | '); };
          const uit = soorten.map(([tag, k, aan]) => {
            const a = document.createElement(tag); a.className = k; a.textContent = 'x'; a.style.transition = 'none';
            const b = document.createElement(tag); b.className = k + ' ' + aan; b.textContent = 'x'; b.style.transition = 'none';
            plek.append(a, b); return [k, meet(a), meet(b)]; });
          plek.remove(); return uit; }""")
        los = {k[1] for k in keuze}
        aan = {k[2] for k in keuze}
        check("K7: niet-gekozen is bij alle zeven soorten gelijk (--surface2, rand 1,5px, hoek 8px, wit)",
              len(los) == 1 and los.pop().replace(" | 1px", "").replace(" | 1.5px", "") == "rgb(30, 30, 30) | rgb(42, 42, 42) | 8px | rgb(240, 240, 240) | 400 | normal"
              and all(rand(k) == "var(--line)" for k in (".tag", ".level-btn", ".segmented-btn", ".search-mode-tab", ".media-tab", ".goal-card", ".level-choice")),
              json.dumps(keuze)[:400])
        check("K7/K8/K12: gekozen is bij alle zeven soorten gelijk (wit op 5%, goud, vet, niet cursief)",
              len(aan) == 1 and aan.pop().replace(" | 1px", "").replace(" | 1.5px", "") == "rgba(255, 255, 255, 0.05) | rgb(245, 197, 24) | 8px | rgb(245, 197, 24) | 700 | normal",
              json.dumps(keuze)[:400])

        # TT-315 vervolg: lege sterren zichtbaar op het tagvlak (#555, niet --border).
        leeg = page.evaluate("""() => { const s = document.createElement('span'); s.className = 'star-display-empty'; s.textContent = '☆';
            document.getElementById('appRoot').appendChild(s); const c = getComputedStyle(s).color; s.remove(); return c; }""")
        check("lege sterren zijn #555, zichtbaar op het tagvlak (TT-315 vervolg)", leeg == "rgb(85, 85, 85)", leeg)

        # K9 — het niveaulabel in de tagvorm.
        pil = page.evaluate("""() => { const s = document.createElement('span'); s.className = 'level-pill'; s.textContent = 'Basis';
            document.getElementById('appRoot').appendChild(s); const cs = getComputedStyle(s);
            const u = [cs.backgroundColor, cs.fontSize, cs.borderTopLeftRadius, cs.textTransform, cs.fontWeight, cs.fontStyle, cs.color, cs.width];
            s.remove(); return u; }""")
        check("K9: niveaulabel in de tagvorm, wit, vet, cursief, vaste breedte",
              pil == ["rgba(255, 255, 255, 0.1)", "11px", "6px", "none", "700", "italic", "rgb(240, 240, 240)", "100px"], json.dumps(pil))

        # K10 — kruisjes.
        kruis = page.evaluate("""() => {
          const s = document.querySelector('#mediaSpelerModal .media-speler-kop button');
          const plek = document.createElement('div'); document.getElementById('appRoot').appendChild(plek);
          plek.innerHTML = mediaTegelHTML({ type: 'foto', url: 'https://example.org/a.jpg', name: 'a' }, 0, 'mh')
                         + mediaLinkRijHTML({ url: 'https://www.youtube.com/watch?v=abc', inBanner: false }, 0, 'mh');
          const tegel = plek.querySelector('.media-thumb');
          const na = getComputedStyle(plek.querySelector('.thumb-remove'), '::after');
          const weg = plek.querySelector('.media-rij button[aria-label="Link verwijderen"]');
          const u = { sluit: s.className, tegelKnipt: getComputedStyle(tegel).overflow,
                      fotoTikvlak: na.content !== 'none' ? na.top : null,
                      wegKlasse: weg ? weg.className : null, wegBreed: weg ? Math.round(weg.getBoundingClientRect().width) : 0 };
          plek.remove(); return u; }""")
        check("K10: het mediascherm sluit met het kruis van elk ander venster", kruis["sluit"] == "modal-close", json.dumps(kruis))
        check("K10: het ✕ op een foto heeft een tikvlak van 44px dat de tegel niet afknipt",
              kruis["fotoTikvlak"] == "-11px" and kruis["tegelKnipt"] == "visible", json.dumps(kruis))
        check("K10: een link weghalen is het kale ✕ van 44px", kruis["wegKlasse"] == "song-remove" and kruis["wegBreed"] == 44, json.dumps(kruis))

        # K11 — berichtknop op de kaart gelijk aan de lijst.
        post = page.evaluate("""() => {
          const m = { id: 'm9', fname: 'Test', lname: 'X', username: 'test', city: 'Den Haag',
                      musician_instruments: [], musician_genres: [] };
          const plek = document.createElement('div'); document.getElementById('appRoot').appendChild(plek);
          plek.innerHTML = musicianRowHTML(m) + musicianCardHTML(m);
          const k = [...plek.querySelectorAll('[onclick^="openRowMessageIcon"]')].map(e => { const r = e.getBoundingClientRect();
            return [e.className, Math.round(r.width), Math.round(r.height), getComputedStyle(e).backgroundColor]; });
          plek.remove(); return k; }""")
        check("K11: de berichtknop op de kaart is dezelfde als in de lijst (44px)",
              len(post) == 2 and post[0] == post[1] and post[0][1] == 44 and post[0][2] == 44, json.dumps(post))

        # Bandsterren: alleen op het bandprofiel.
        ster = page.evaluate("""() => { const b = { id: 'b9', name: 'Testband', status: 'zoekend', niveau: 3, band_wanted: [] };
            const l = { zoekend: 'Zoekend', compleet: 'Compleet', inactief: 'Inactief' };
            return [bandRowHTML(b, l).includes('star-display'), bandCardHTML(b, l).includes('star-display'),
                    bandStarDisplayHTML(b).includes('star-display')]; }""")
        check("bandster weg uit de zoekresultaten (rij en kaart)", ster[:2] == [False, False], json.dumps(ster))
        check("de bandster zelf bestaat nog, voor het bandprofiel", ster[2], json.dumps(ster))
        aanroepen = [r for r in re.findall(r"[^\n]*bandStarDisplayHTML\(b\)[^\n]*", js316) if "function " not in r]
        check("bandStarDisplayHTML() staat alleen nog op het bandprofiel, niet op Mijn Bands",
              len(aanroepen) == 1 and "profile-name" in aanroepen[0], str(len(aanroepen)))

        check("geen paginafouten in blok 31", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()
        page.evaluate("showView('landing'); window.TT_STUB.reset()")

        print("\nBlok 8 — elke view opent zonder fout")
        for v in VIEWS:
            naam = v.replace("view-", "")
            page_errors.clear()
            page.evaluate("n => window.showView(n)", naam)
            page.wait_for_timeout(60)
            check(f"showView('{naam}')", not page_errors, "; ".join(page_errors)[:200])

        browser.close()
    httpd.shutdown()


def main():
    print("The Talent Tent — vaste testset, laag 1 (TT-231)")
    blok1_statisch()
    blok_browser()
    gezakt = [n for n, ok, _ in results if not ok]
    print(f"\nEindstand: {len(results) - len(gezakt)} van {len(results)} geslaagd")
    if gezakt:
        print("Gezakt:")
        for n in gezakt:
            print(f"  - {n}")
    return 1 if gezakt else 0


if __name__ == "__main__":
    sys.exit(main())
