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
    "core.js", "utils.js", "auth.js", "postcode.js", "wizard.js",
    "search.js", "musicians.js", "bands.js", "messages.js", "modals-shared.js",
]

# Scriptvolgorde uit de projectinstructies. Bindend.
SCRIPT_ORDER = JS_FILES[:]

VIEWS = [
    "view-landing", "view-auth", "view-register", "view-profieltegels",
    "view-search", "view-myprofile", "view-bands", "view-messages",
    "view-about", "view-privacy", "view-terms", "view-gedragscode",
    "view-instellingen", "view-reset",
]

NAV_IDS = [
    "navMyProfile", "navMyBands", "navSearch", "navMessages", "navLogin",
    "navMenuBtn", "navAbout", "navPrivacy", "navTerms", "navGedragscode",
    "navSettings", "navLogout",
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
