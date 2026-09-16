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
          // De stub legt een insert vast in TT_STUB.data; saveJeMediahoek wist
          // de tabel eerst, dus wat er staat is precies wat er is weggeschreven.
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
          uit.knop = (modal.querySelector('.media-speler-knop') || {}).textContent || '';
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
            kruisStatisch: mk ? getComputedStyle(mk.querySelector('.modal-close')).position : ''
          };
        }""")
        check("de gouden balk bovenaan het profiel is weg", not profielkop["goudenBalk"], "")
        check("de hero is nu het eerste element van het profiel",
              profielkop["eersteElement"] == "profiel-banner", profielkop["eersteElement"])
        check("het profiel van iemand anders houdt de koprij met het woordmerk",
              profielkop["koprijInModal"] and profielkop["woordmerkInModal"], json.dumps(profielkop))
        check("met het sluiten-kruisje in die rij, niet los erboven",
              profielkop["kruisInKoprij"] and profielkop["kruisStatisch"] == "static",
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
