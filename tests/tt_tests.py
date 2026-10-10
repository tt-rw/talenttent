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

import glob
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
    "push.js", "modals-shared.js",
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

    # TT-393: een schermwissel en het sluiten van een gesprek scrollen meteen naar boven.
    core = open(os.path.join(ROOT, "core.js"), encoding="utf-8").read()
    msgs = open(os.path.join(ROOT, "messages.js"), encoding="utf-8").read()
    sv = core[core.index("function showView("):core.index("// ─── De landingspagina")]
    cc = msgs[msgs.index("function closeConversation("):]
    cc = cc[:cc.index("\n}\n")]
    check("TT-393: showView scrolt niet vloeiend naar boven", "behavior: 'smooth'" not in sv, "smooth in showView()")
    check("TT-393: closeConversation scrolt meteen naar boven", "scrollTo({ top: 0, behavior: 'instant' })" in cc, "scrollTo ontbreekt")

    html = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()

    srcs = re.findall(r'<script\s+src="([^"?]+)(?:\?v=([^"]*))?"', html)
    local = [(s, v) for s, v in srcs if not s.startswith("http")]
    order = [s for s, _ in local]
    check("scriptvolgorde is bindend en klopt", order == SCRIPT_ORDER,
          f"gevonden: {order}")
    zonder_v = [s for s, v in local if not v]
    check("elk lokaal script heeft ?v=", not zonder_v, f"zonder ?v=: {zonder_v}")

    check("geen emoji in de UI", not re.search(
        r"[\U0001F300-\U0001FAFF❤⭐]", html), "emoji gevonden in index.html")

    # TT-281: wissen en opnieuw vullen gebeurt alleen nog in een
    # databasefunctie, in één transactie. Een los .delete() op deze tabellen
    # in de opslagpaden is precies de fout die TT-281 wegnam.
    los = []
    # bands.js staat erbij sinds 26-09-2026: saveBand() en saveBandRun()
    # (band_wanted) zijn toen uit musicians.js verhuisd.
    for f in ("wizard.js", "musicians.js", "bands.js"):
        src = open(os.path.join(ROOT, f), encoding="utf-8").read()
        for t in ("musician_instruments", "musician_genres", "musician_songs",
                  "musician_media", "band_wanted"):
            if re.search(r"from\('" + t + r"'\)\s*\.delete\(", src):
                los.append(f"{f}: {t}")
    check("geen los wissen van koppeltabellen in de opslagpaden (TT-281)", not los,
          f"gevonden: {los}")

    # TT-312: band opheffen gebeurt alleen nog in tt_dissolve_band, in één
    # transactie. Een los .delete() in dissolveBand() is precies de fout die
    # TT-312 wegnam: leden weg, band nog wel.
    bsrc = open(os.path.join(ROOT, "bands.js"), encoding="utf-8").read()
    m = re.search(r"async function dissolveBand\(bandId\) \{(.*?)\n\}", bsrc, re.S)
    body = m.group(1) if m else ""
    check("band opheffen wist niets los, alleen via tt_dissolve_band (TT-312)",
          bool(m) and ".delete(" not in body and "tt_dissolve_band" in body,
          body[:200] if m else "dissolveBand() niet gevonden")


    # TT-431: de terugknop heeft precies één plek. Wie elders de browser-
    # geschiedenis aanraakt, maakt het terugprobleem opnieuw: een tweede
    # pad naast appTerug(). Alleen core.js mag stappen zetten of terug gaan.
    verboden = []
    for f in JS_FILES:
        if f == "core.js":
            continue
        src = open(os.path.join(ROOT, f), encoding="utf-8").read()
        for patroon in (r"history\.(pushState|back|forward|go)\s*\(", r"safeHistoryPush\s*\(", r"addEventListener\(\s*'popstate'"):
            if re.search(patroon, src):
                verboden.append(f"{f}: {patroon}")
    check("buiten core.js raakt niets de browsergeschiedenis aan (TT-431)", not verboden,
          f"gevonden: {verboden}")
    core = open(os.path.join(ROOT, "core.js"), encoding="utf-8").read()
    stappen = len(re.findall(r"history\.pushState\(", core)) + len(re.findall(r"safeHistoryPush\(", core))
    check("core.js zet maar op twee plekken een stap: het vangnet bij het laden en de herstelstap in popstate (TT-431; telt de definitie mee)",
          stappen == 4, f"{stappen} (safeHistoryPush: definitie en gebruik in popstate; vangnet: pushState)")


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
        # TT-341 stap 3: de app volgt licht of donker van het toestel, en
        # Playwright doet zich standaard voor als een toestel op licht. De
        # blokken hieronder zijn voor donker geschreven. Elke context krijgt
        # daarom donker, tenzij een blok zelf iets anders vraagt (blok 41).
        _nieuwe_context = browser.new_context
        def _context_donker(**kw):
            kw.setdefault("color_scheme", "dark")
            return _nieuwe_context(**kw)
        browser.new_context = _context_donker
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
              vorm["regelGrootte"] == "12px" and vorm["regelInspringing"] == "10px",  # --field-inset 10px sinds TT-341 stap 2
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
          history.back();
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
          history.back();
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

          // 7. Laatst actief (25-09-2026, Ronald): de regel "Deze week
          //    bijgewerkt" staat niet meer op het profiel, ook geen groene balk.
          uit.geenBijgewerkt = !/bijgewerkt/i.test(vak.innerText);
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
        check("de balk is 2:1 (TT-384, was 5:2), niet 16:9", banner["verhouding"] == "2/1", banner["verhouding"])
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
        check("het profiel toont geen 'bijgewerkt'-regel meer", banner["geenBijgewerkt"], "")
        check("de groene balk met kloppende stip is weg", banner["geenGroeneBalk"], "")
        check("relativeUpdatedLabel() is weg (dode code)",
              page.evaluate("typeof relativeUpdatedLabel") == "undefined", "")
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

        # TT-408 (06-10-2026): het muzikant- en bandvenster hadden geen kruisje meer;
        # de pijl links in de koprij was de uitgang. TT-410b: het muzikantprofiel
        # en (fase 2) de bandpagina zijn een scherm met de kop van de app; de
        # pijl is daar de terugknop van elk scherm.
        kruis = page.evaluate("""() => ({
          oudVenster: !!document.getElementById('bandModal'),
          scherm: !!document.getElementById('view-profiel'),
          pijl: document.querySelectorAll('header .kop-terug').length
        })""")
        check("het bandvenster bestaat niet meer; de bandpagina is een scherm met de pijl van de app (TT-410b fase 2)",
              kruis["scherm"] and not kruis["oudVenster"] and kruis["pijl"] == 1, json.dumps(kruis))

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
          const mk = null; // TT-410b: het profiel is een scherm, geen venster met een eigen koprij
          return {
            schermBestaat: !!document.getElementById('view-profiel'),
            oudVenster: !!document.getElementById('musicianModal'),
            goudenBalk: goud,
            eersteElement: eerste,
            koprijInModal: !!mk,
            woordmerkInModal: !!(mk && mk.querySelector('.logo')),
            kruisInKoprij: !!(mk && mk.querySelector('.modal-close')),
            pijlInKoprij: !!(mk && mk.querySelector('.kop-terug')),
            // TT-287: het tikvlak mag niet het hele venster dekken. Sinds TT-318
            // is het kruis een gewone knop in de rij, zonder los tikvlak.
            kruisStatisch: ''
          };
        }""")
        check("de gouden balk bovenaan het profiel is weg", not profielkop["goudenBalk"], "")
        check("de hero is nu het eerste element van het profiel",
              profielkop["eersteElement"] == "profiel-banner", profielkop["eersteElement"])
        check("het profiel van iemand anders is een eigen scherm met de kop van de app, geen venster meer (TT-410b)",
              profielkop["schermBestaat"] and not profielkop["oudVenster"], json.dumps(profielkop))

        # TT-269 (15-09-2026, Ronald): "voer dit door in de hele app."
        appbreed = page.evaluate("""() => {
          showView('profieltegels');
          const m = document.querySelector('#view-profieltegels main');
          const sm = getComputedStyle(m);
          return {
            gouddenBalkenOver: document.querySelectorAll('.hero-band').length,
            mainBoven: sm.paddingTop,
            mainZij: sm.paddingLeft,
          };
        }""")
        check("geen enkele gouden balk meer in Profiel bewerken",
              appbreed["gouddenBalkenOver"] == 0, str(appbreed["gouddenBalkenOver"]))
        check("Profiel bewerken begint direct onder de kop",
              appbreed["mainBoven"] == "0px" and appbreed["mainZij"] == "16px", json.dumps(appbreed))

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
          window.openProfielScherm = (id) => { window.__geopend = id; };
          document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
          document.getElementById('view-messages').classList.add('active');
          document.body.classList.remove('landing-op-foto'); // de test wisselt de view zonder showView()
          document.getElementById('appBottomNav').style.display = '';
          const lijst = [];
          for (let i = 0; i < 30; i++) lijst.push({ id: 'x' + i, sender_id: i % 2 ? 'm1' : 'm2',
            recipient_id: i % 2 ? 'm2' : 'm1', body: 'Bericht ' + i,
            created_at: new Date(Date.now() - (30 - i) * 60000).toISOString(), read_at: null });
          window.TT_STUB.data.messages = lijst;
          await openConversation('m2', 'Dylan de Vries', '', false, false);
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
          await openConversation('m2', 'Verwijderd', '', false, true);
          document.getElementById('messagesThreadName').click();
          r.verwijderdOpent = window.__geopend;
          openMessageComposer('m2', 'Dylan');
          await new Promise(r => setTimeout(r, 120));
          r.modalFocus = document.activeElement === document.getElementById('messagesReplyInput'); // TT-410a: het gesprek vervangt het venster
          // TT-305 (22-09-2026): openConversation() zonder gesprekspartner
          // mag niets doen. Deed hij dat wel, dan vroeg hij de database om
          // recipient_id=eq.null en toonde hij "Gesprek laden is niet gelukt".
          await openConversation('m2', 'Dylan de Vries', '', false, false);
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
            up.wait_for_timeout(450)  # TT-368: het paneel glijdt eerst uit, hooguit 300 ms
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
        ip.evaluate("openConversation('m2', 'Dylan', '', false, false)")
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
          await openConversation('m2', 'Dylan', '', false, false); }""")
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
        # Blok 20 — het profiel is een scherm (TT-287, herschreven in TT-410b).
        # Tot TT-410b was het een venster (#musicianModal). Nu is het view-profiel,
        # met een eigen stap in de geschiedenis en het adres #profiel/<id>.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 20 — het profiel is een eigen scherm (TT-410b)")
        page_errors.clear()
        page.evaluate("() => { showView('search'); }")
        page.wait_for_timeout(100)
        uit20 = page.evaluate("""async () => {
          const r = {};
          const S = window.TT_STUB;
          const was = { hasOwnProfile, myMusicianId };
          hasOwnProfile = false; myMusicianId = null;
          S.rpcResults.tt_get_musicians_public = () => [{ id: 'm2', username: 'dylan', age: 30, city: 'Delft',
            bio: '', goal: null, avatar_url: null, instrument_levels: [{ instrument: 'Drums', niveau: 3 }],
            genres: ['Rock'], songs: [], media: [] }];
          const voor = history.length;
          await openProfielScherm('m2');
          r.view = huidigeView;
          r.actief = document.getElementById('view-profiel').classList.contains('active');
          r.hash = location.hash;
          r.stap = history.state;
          r.oudVenster = !!document.getElementById('musicianModal');
          r.naam = (document.querySelector('#profielSchermContent .profile-name') || {}).textContent || '';
          r.vensterOpen = document.querySelectorAll('.modal-overlay.visible').length;
          r.terugKnop = getComputedStyle(document.getElementById('navTerugBtn')).visibility;
          r.onderbalk = document.getElementById('appBottomNav').style.display;
          r.stapErbij = history.length - voor;
          hasOwnProfile = was.hasOwnProfile; myMusicianId = was.myMusicianId;
          delete S.rpcResults.tt_get_musicians_public;
          return r;
        }""")
        check("het profiel opent als eigen scherm, niet als venster",
              uit20["view"] == "profiel" and uit20["actief"] and not uit20["oudVenster"] and uit20["vensterOpen"] == 0, json.dumps(uit20))
        check("het scherm heeft een eigen adres en een eigen stap, met het id en 'in de app geopend'; de browser krijgt er geen stap bij (TT-431)",
              uit20["hash"] == "#profiel/m2" and uit20["stap"] == {"view": "profiel", "id": "m2", "app": True}
              and uit20["stapErbij"] == 0, json.dumps(uit20))
        check("de kop van de app staat erbij: terugknop zichtbaar, onderbalk er",
              uit20["terugKnop"] != "hidden" and uit20["onderbalk"] != "none", json.dumps(uit20))
        page.evaluate("() => terugKnop()")
        page.wait_for_timeout(300)
        terug = page.evaluate("() => ({ view: huidigeView, hash: location.hash })")
        check("de pijl in de kop gaat terug naar Zoeken", terug["view"] == "search", json.dumps(terug))
        page.evaluate("""async () => {
          window.__was20 = { hasOwnProfile, myMusicianId };
          hasOwnProfile = false; myMusicianId = null;
          window.TT_STUB.rpcResults.tt_get_musicians_public = () => [{ id: 'm2', username: 'dylan', age: 30, city: 'Delft',
            bio: '', goal: null, avatar_url: null, instrument_levels: [], genres: [], songs: [], media: [] }];
          await openProfielScherm('m2');
        }""")
        page.wait_for_timeout(200)
        page.click("header .logo")
        page.wait_for_timeout(200)
        naar_home = page.evaluate("() => document.getElementById('view-landing').classList.contains('active')")
        page.evaluate("""() => { hasOwnProfile = window.__was20.hasOwnProfile; myMusicianId = window.__was20.myMusicianId;
          delete window.TT_STUB.rpcResults.tt_get_musicians_public; }""")
        check("het woordmerk gaat naar het hoogste scherm", naar_home, "")
        check("geen paginafouten in blok 20", not page_errors, "; ".join(page_errors)[:200])

        # ─────────────────────────────────────────────────────────────
        # Blok 21 — Maak setlist (tot 29-09-2026 "Zoek setlist"): van muzikanten naar gedeelde nummers
        # (TT-289, 17-09-2026). Tegen de stub, uitgelogd.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 21 — Maak setlist: muzikanten kiezen, gedeelde nummers")
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
        check("schakelaar heeft de labels Zoek muzikanten en Maak setlist",
              sch["tekst"] == ["Zoek muzikanten", "Maak setlist"], json.dumps(sch))
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
        sub1 = page.evaluate("() => document.querySelector('#setlistDeelMuzikanten .filter-sub').textContent.trim()")
        check("uitleg van Zoek muzikanten (TT-413)",
              sub1 == "Maak een setlist en ontdek wie deze nummers speelt.", sub1)

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
        check("tik op Maak setlist wisselt de stand",
              st["gekozen"] == ["false", "true"] and st["muz"] == "none" and st["num"] != "none", json.dumps(st))
        check("kop en uitleg van Maak setlist",
              st["titel"] == "Maak setlist" and st["sub"] == "Kies een groep muzikanten en ontdek jullie gezamenlijke setlist.", json.dumps(st))
        check("straalwiel staat op 10 km, sorteren op Meeste spelers",
              st["straal"] == "10 km" and st["sorteer"] == "Meeste spelers", json.dumps(st))
        check("knoppenrij: Lijst wissen links, Maak setlist rechts (TT-374)",
              st["knoppen"] == ["Lijst wissen", "Maak setlist"], json.dumps(st))
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
        # 08-10-2026 (bevinding Ronald): wie een profiel heeft, staat als eerste
        # vanzelf in Maak setlist; met het ✕ haal je jezelf weg.
        page.evaluate("""() => {
          window.getMyMusicianId = async () => 'm1';
          hasOwnProfile = true; myMusicianId = 'm1';
          gedeeldGekozen = []; gedeeldEigenId = null;
          setSetlistSoort('muzikanten');
          setSetlistSoort('nummers');
        }""")
        page.wait_for_timeout(300)
        eigen = page.evaluate("""() => ({ namen: gedeeldGekozen.map(g => g.naam), lijst: document.getElementById('gedeeldGekozenList').innerText,
          teller: document.getElementById('gedeeldTeller').textContent, kruis: document.querySelectorAll('#gedeeldGekozenList .song-remove').length })""")
        check("Maak setlist: je eigen naam staat vanzelf als eerste, met ✕, teller 1 van 20",
              eigen["namen"] == ["ronnie"] and "ronnie" in eigen["lijst"] and eigen["kruis"] == 1 and eigen["teller"].startswith("1 van 20"), json.dumps(eigen))
        page.evaluate("""() => { gedeeldKandidaten = { sleutel: 'x', straalActief: true, lijst: [{ id: 'm2', username: 'dylan', city: 'Delft', distance_km: 8 }] };
          addGedeeldMuzikant('m2'); }""")
        page.evaluate("removeGedeeldMuzikant(0)")
        page.evaluate("setSetlistSoort('muzikanten'); setSetlistSoort('nummers')")
        page.wait_for_timeout(300)
        weg = page.evaluate("gedeeldGekozen.map(g => g.naam)")
        check("jezelf weghalen blijft zo: de naam komt niet terug bij heropenen", weg == ["dylan"], json.dumps(weg))
        page.evaluate("resetGedeeldSearch()")
        page.wait_for_timeout(300)
        wis2 = page.evaluate("gedeeldGekozen.map(g => g.naam)")
        check("Lijst wissen: terug naar alleen jezelf", wis2 == ["ronnie"], json.dumps(wis2))
        page.evaluate("() => { hasOwnProfile = false; }")
        page.evaluate("gedeeldEigenToevoegen()")
        page.wait_for_timeout(200)
        uit = page.evaluate("gedeeldGekozen.length")
        check("uitgelogd of zonder profiel: jezelf staat er niet in", uit == 0, str(uit))
        page.evaluate("hasOwnProfile = false; myMusicianId = null; gedeeldEigenId = null; resetGedeeldSearch()")
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
          // TT-318: de plek voor het menu staat niet meer vast in index.html
          // maar in het geladen profiel, naast de naam. Deze blok toetst het
          // menu zelf; de plek toetst blok 33. Daarom hier een kale plek.
          const vpp = document.getElementById('view-profiel'); vpp.classList.add('active'); // TT-410b: een scherm moet zichtbaar zijn om te meten
          for (const [box, id] of [['profielSchermContent', 'profielSchermActies'], ['profielSchermContent', 'profielSchermActies']]) {
            if (!document.getElementById(id)) document.getElementById(box).insertAdjacentHTML('beforeend', '<span id="' + id + '"></span>');
          }

          zetVeiligheidMenu('profielSchermActies', 'muzikant', 'm2', 'Dylan');
          r.menuBijAnder = !!document.querySelector('#profielSchermActies .veiligheid-menu-wrap');
          r.items = labels('profielSchermActies');
          const knop = document.querySelector('#profielSchermActies .nav-menu-btn');
          const kr = knop.getBoundingClientRect();
          r.tikdoel = [Math.round(kr.width), Math.round(kr.height)];
          knop.click();
          r.opentNaKlik = document.querySelector('#profielSchermActies .inline-menu-dropdown').classList.contains('visible');
          // Sinds 24-09-2026 ligt er een donkere laag achter elk open menu; een
          // tik ernaast landt op die laag.
          document.querySelector('#profielSchermActies .menu-laag')?.click();
          r.sluitBuitenKlik = !document.querySelector('#profielSchermActies .inline-menu-dropdown').classList.contains('visible');

          zetVeiligheidMenu('profielSchermActies', 'muzikant', null, '');
          r.menuBijEigen = !!document.querySelector('#profielSchermActies .veiligheid-menu-wrap');

          zetVeiligheidMenu('profielSchermActies', 'band', 'b1', 'Van Delft');
          r.bandItems = labels('profielSchermActies');

          hasOwnProfile = false;
          zetVeiligheidMenu('profielSchermActies', 'muzikant', 'm2', 'Dylan');
          r.menuZonderProfiel = !!document.querySelector('#profielSchermActies .veiligheid-menu-wrap');
          hasOwnProfile = true;
          vpp.classList.remove('active');
          return r;
        }""")
        check("het ⋯-menu staat bij andermans profiel",
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
          zetVeiligheidMenu('profielSchermActies', 'muzikant', 'm2', 'Dylan');
          r.itemsNa = Array.from(document.querySelectorAll('#profielSchermActies .nav-menu-item')).map(b => b.textContent);
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

        # TT-410a (06-10-2026): het berichtvenster bestaat niet meer. "Bericht
        # sturen" opent het gesprek; de terugknop van het toestel gaat terug naar
        # het scherm waar je vandaan kwam, en laat gesprekVanuit leeg achter.
        bericht = page.evaluate("""async () => {
          const r = {};
          showView('search');
          await new Promise(res => setTimeout(res, 80));
          openMessageComposer('m9', 'Test');
          await new Promise(res => setTimeout(res, 120));
          r.open = { view: huidigeView, conv: activeConversationId, van: gesprekVanuit };
          history.back();
          await new Promise(res => setTimeout(res, 400));
          r.dicht = { view: huidigeView, conv: activeConversationId, van: gesprekVanuit,
                      draad: document.getElementById('messagesThreadPanel').style.display };
          return r;
        }""")
        check("bericht sturen vanuit Zoeken opent het gesprek, niet een venster",
              bericht["open"] == {"view": "messages", "conv": "m9", "van": "search"}
              and not page.evaluate("!!document.getElementById('messageModal')"), json.dumps(bericht))
        check("de terugknop van het toestel gaat terug naar Zoeken en sluit het gesprek",
              bericht["dicht"]["view"] == "search" and bericht["dicht"]["conv"] is None
              and bericht["dicht"]["van"] is None and bericht["dicht"]["draad"] == "none", json.dumps(bericht))

        melden2 = page.evaluate("""async () => {
          const r = {};
          openMeldModal('muzikant', 'm9', 'Test');
          kiesMeldReden(document.querySelector('#meldRedenen .tag'), 'Ongepast gedrag');
          r.voorDoel = !!meldDoel;
          r.voorReden = meldReden;
          history.back();
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
          history.back();
          await new Promise(res => setTimeout(res, 50));
          r.dicht = !document.getElementById('pickerListModal').classList.contains('visible');
          r.naActief = activeListPickerId;
          return r;
        }""")
        check("terugknop sluit de kies-uit-lijst", picker["dicht"], "")
        check("en maakt activeListPickerId leeg", picker["voorActief"] == "genre"
              and picker["naActief"] is None, json.dumps(picker))

        # TT-410a (08-10-2026): de instrumentkeuze is alleen nog de lijst. Het niveau
        # kies je inline (blok 76). De terugknop sluit de lijst en laat de
        # instrumenten ongewijzigd.
        instrument = page.evaluate("""async () => {
          const r = {};
          state.instruments = [];
          state.instrumentLevels = {};
          openInstrumentPicker('wizard');
          r.open = document.getElementById('instrumentLevelModal').classList.contains('visible');
          history.back();
          await new Promise(res => setTimeout(res, 50));
          r.dicht = !document.getElementById('instrumentLevelModal').classList.contains('visible');
          r.naLijst = state.instruments.slice();
          return r;
        }""")
        check("terugknop sluit de instrumentenlijst", instrument["open"] and instrument["dicht"], json.dumps(instrument))
        check("en laat de gekozen instrumenten ongemoeid", instrument["naLijst"] == [], json.dumps(instrument))

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
          const fout = (el) => { const p = el.closest('.field').querySelector('.field-msg');
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
          history.back();
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
        # TT-318 (24-09-2026, besluit Ronald): optisch in het midden, niet
        # gemeten — 7px links van het midden van de kop.
        check("het woordmerk staat optisch in het midden: 7px links van het kopmidden (TT-318)",
              abs((kop301["kopMid"] - 7) - kop301["logoMid"]) <= 1, json.dumps(kop301))
        check("terugknop en hamburger staan allebei in de koprij zelf",
              kop301["terugInHeader"] and kop301["hamInHeader"], json.dumps(kop301))
        # TT-318: niet de knoppen maar de tekens staan even ver van de rand.
        # De pijl is smaller dan de hamburger; zijn knop schuift 5px naar buiten.
        inkt = page.evaluate("""() => {
          const h = document.querySelector('header').getBoundingClientRect();
          const x = (el, kant) => { const b = el.getBBox(), m = el.getScreenCTM();
            const sw = parseFloat(el.closest('svg').getAttribute('stroke-width')) / 2;
            return kant === 'l' ? m.a * (b.x - sw) + m.e : m.a * (b.x + b.width + sw) + m.e; };
          return {
            pijlLinks: +(x(document.querySelector('#navTerugBtn polyline'), 'l') - h.left).toFixed(1),
            hamRechts: +(h.right - x(document.querySelector('#navMenuBtn line'), 'r')).toFixed(1)
          };
        }""")
        check("pijl en hamburger staan even ver van hun eigen rand (TT-318)",
              abs(inkt["pijlLinks"] - inkt["hamRechts"]) <= 0.5, json.dumps(inkt))
        check("de hamburger staat op 16px van de rand, de terugknop op 11px (TT-318)",
              kop301["terugLinks"] == 11 and kop301["hamRechts"] == 16, json.dumps(kop301))
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
        check("elk terugteken en de hamburger zijn 24px; de kop van de app is er sinds TT-410b (fase 2) de enige van (TT-307, TT-311)",
              len(maten) >= 2 and all(m == "24x24" for m in maten), json.dumps(maten))
        # TT-388 (01-10-2026): het attribuut zei 24, maar een regel in
        # styles.css tekende de hamburger op 26px. Meet daarom ook de
        # getekende maat.
        getekend = page.evaluate("""() => ['#navTerugBtn svg', '#navMenuBtn svg'].map(q => {
          const r = document.querySelector(q).getBoundingClientRect();
          return Math.round(r.width) + 'x' + Math.round(r.height);
        })""")
        check("terugpijl en hamburger worden allebei op 24×24px getekend (TT-388)",
              getekend == ["24x24", "24x24"], json.dumps(getekend))
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
          navStack.length = 0; werkTerugKnopBij();
          uit.bijStart = zichtbaar();
          uit.magBijStart = magTerug();
          const hashVoor = location.hash;
          terugKnop();
          uit.hashNaLozeKlik = location.hash === hashVoor;
          showView('search');
          uit.naEenStap = zichtbaar();
          const modal = document.getElementById('legalModal');
          navStack.length = 0; modal.classList.add('visible');
          uit.metOpenVenster = magTerug();
          modal.classList.remove('visible');
          return uit;
        }""")
        check("op het openingsscherm (de landingspagina) is er niets om naar terug te gaan, en de knop staat er niet (besluit Ronald 06-10-2026)",
              (not zicht["bijStart"]) and not zicht["magBijStart"], json.dumps(zicht))
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
        check("geen venster heeft nog een eigen koprij: muzikant en band gebruiken de kop van de app (TT-410b)",
              len(vensterkop) == 0, json.dumps(vensterkop))

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
          const stap = () => history.back();
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

          // TT-408: de grote Terug-knop onderin een tegelscherm bestaat niet meer.
          uit.grotekopTerug = ['wbj','wsp','wzj','jst','mh','bw','bb','bmz','bm']
            .filter(p => document.getElementById(p + 'CancelBtn')).length;

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
        check("TT-408: geen enkel tegelscherm heeft nog een grote Terug-knop onderin",
              terug["grotekopTerug"] == 0, json.dumps(terug))


        check("geen paginafouten in blok 26", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ------------------------------------------------------------------
        # Blok 27 — TT-303/TT-428: hoogste scherm, terugknop op een tabblad, volgorde onderin
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
              len(merk) >= 1 and all("naarHoogsteScherm()" in o for o in merk)
              and not any("showView('landing')" in o for o in merk), json.dumps(merk))

        hoogste = page.evaluate("""async () => {
          const btn = document.getElementById('navTerugBtn');
          const zichtbaar = () => getComputedStyle(btn).visibility === 'visible';
          const uit = {};
          const bewaard = currentUser;

          currentUser = null;
          uit.uitgelogd = hoogsteScherm();
          showView('landing'); navStack.length = 0; werkTerugKnopBij();
          uit.opLanding = zichtbaar();
          uit.magOpLanding = magTerug();

          currentUser = { id: 'test' };
          uit.ingelogd = hoogsteScherm();
          showView('myprofile'); navStack.length = 0; werkTerugKnopBij();
          uit.opProfiel = zichtbaar();
          uit.magOpProfiel = magTerug();
          // Een druk op het hoogste scherm doet niets: je blijft waar je bent.
          terugKnop();
          await new Promise(res => setTimeout(res, 60));
          uit.naLozeDruk = [...document.querySelectorAll('.app-view.active')].map(v => v.id);

          // TT-428: op een hoofdtabblad doet de knop niets, en een wissel tussen
          // tabbladen laat geen stap achter.
          showView('myprofile'); navStack.length = 0;
          showView('search'); showView('messages'); showView('bands');
          uit.opTabblad = zichtbaar();
          uit.magOpTabblad = magTerug();
          terugKnop();
          await new Promise(res => setTimeout(res, 60));
          uit.naDruk = [...document.querySelectorAll('.app-view.active')].map(v => v.id);
          // De terugknop van het toestel doet daar ook niets.
          history.back();
          await new Promise(res => setTimeout(res, 120));
          uit.naToestelknop = [...document.querySelectorAll('.app-view.active')].map(v => v.id);
          // Dieper in een tabblad is het één stap terug, naar die bovenkant.
          showView('search'); await new Promise(res => setTimeout(res, 60));
          showView('profiel', undefined, { id: 'x', app: true });
          uit.diepMag = magTerug();
          terugKnop();
          await new Promise(res => setTimeout(res, 120));
          uit.naDiep = [...document.querySelectorAll('.app-view.active')].map(v => v.id);

          currentUser = bewaard;
          showView('landing'); navStack.length = 0; werkTerugKnopBij();
          return uit;
        }""")
        check("het hoogste scherm is Mijn Profiel ingelogd, de landingspagina uitgelogd",
              hoogste["ingelogd"] == "myprofile" and hoogste["uitgelogd"] == "landing",
              json.dumps(hoogste))
        check("op Mijn Profiel staat de terugknop er ook (TT-310); op de landingspagina niet (besluit Ronald 06-10-2026)",
              (not hoogste["opLanding"]) and hoogste["opProfiel"], json.dumps(hoogste))
        check("maar daar is niets om naar terug te gaan, en een druk laat je op Mijn Profiel",
              not hoogste["magOpLanding"] and not hoogste["magOpProfiel"]
              and hoogste["naLozeDruk"] == ["view-myprofile"], json.dumps(hoogste))
        check("op een hoofdtabblad staat hij er, maar doet niets (TT-428; was TT-303: omhoog)",
              hoogste["opTabblad"] and not hoogste["magOpTabblad"], json.dumps(hoogste))
        check("een druk op een tabblad brengt je niet naar Mijn Profiel of het vorige tabblad",
              hoogste["naDruk"] == ["view-bands"], json.dumps(hoogste))
        check("de terugknop van het toestel doet op een tabblad ook niets",
              hoogste["naToestelknop"] == ["view-bands"], json.dumps(hoogste))
        check("dieper in een tabblad is terug één stap, naar de bovenkant van dat tabblad",
              hoogste["diepMag"] and hoogste["naDiep"] == ["view-search"], json.dumps(hoogste))

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
          showView('search');
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

        # TT-330 t/m TT-333 (26-09-2026): de goedkeuringspagina en de teksten.
        ouder2 = page.evaluate("""async () => {
          const uit = {};
          const echteApi = ouderApi;
          const tekst = () => document.getElementById('toestemmingInhoud').innerText;
          const actief = () => [...document.querySelectorAll('.app-view.active')].map(v => v.id);

          // TT-330: een onbekende code geeft een melding, niet de homepage.
          ouderApi = async () => { throw new Error('Onbekende link.'); };
          history.replaceState({}, '', '#toestemming/onbekend');
          await toestemmingPaginaOpenen('onbekend');
          uit.onbekendView = actief();
          uit.onbekendTekst = tekst();

          // TT-332: beide eindschermen sluiten met dezelfde afsluiter.
          ouderApi = async () => ({ ok: true });
          document.getElementById('toestemmingInhoud').innerHTML = '<input type="checkbox" id="toestemmingVinkje" checked>';
          await ouderBesluit(true);
          uit.ja = tekst();
          await ouderBesluit(false);
          uit.nee = tekst();

          // TT-331: de knop uit de mail aan het kind.
          ouderApi = async () => ({ stand: 'open' });
          clearOnboardingProgress();
          history.replaceState({}, '', '#toestemming-gegeven');
          toestemmingGegevenOpenen();
          uit.eldersView = actief();
          uit.eldersTekst = tekst();
          uit.eldersHash = location.hash;
          state.ouderRoute = true; state.fname = 'Testkind'; state.currentStep = 1;
          saveOnboardingProgress();
          toestemmingGegevenOpenen();
          uit.hierView = actief();
          clearOnboardingProgress();
          state.ouderRoute = false;
          ouderPaneelSluiten();
          clearInterval(ouderStandTimer);

          // TT-333: nergens "verzoek" in een zichtbare tekst van de ouderroute.
          const html = ['ouderStap', 'ouderWacht', 'ouderWachtwoord']
            .map(id => document.getElementById(id).innerText).join(' ');
          uit.verzoekInSchermen = /verzoek/i.test(html);
          ouderApi = echteApi;
          showView('landing');
          return uit;
        }""")
        check("TT-330: een onbekende link toont een melding op de goedkeuringspagina",
              ouder2["onbekendView"] == ["view-toestemming"]
              and "werkt niet" in ouder2["onbekendTekst"], json.dumps(ouder2))
        check("TT-332: toestemming en weigering sluiten allebei met de afsluiter",
              ouder2["ja"].strip().endswith("Je kunt dit venster nu sluiten.")
              and ouder2["nee"].strip().endswith("Je kunt dit venster nu sluiten."), json.dumps(ouder2))
        check("TT-331: zonder wachtend profiel legt de pagina uit waar het staat",
              ouder2["eldersView"] == ["view-toestemming"]
              and "toestel waar je begon" in ouder2["eldersTekst"]
              and ouder2["eldersHash"] == "#toestemming-gegeven", json.dumps(ouder2))
        check("TT-331: met wachtend profiel gaat het kind gewoon verder",
              ouder2["hierView"] == ["view-register"], json.dumps(ouder2))
        check("TT-333: de ouderschermen zeggen nergens \"verzoek\"",
              not ouder2["verzoekInSchermen"], json.dumps(ouder2))
        bron = open(os.path.join(ROOT, "ouder.js"), encoding="utf-8").read()
        zichtbaar = re.findall(r"'[^'\n]*'|`[^`]*`", bron)
        check("TT-333: geen \"verzoek\" in de teksten van ouder.js",
              not [t for t in zichtbaar if re.search(r"\bverzoek", t, re.I)],
              str([t for t in zichtbaar if re.search(r"\bverzoek", t, re.I)])[:300])

        # TT-337 (26-09-2026): een ouder die zelf ingelogd is, opent de link
        # uit de mail. Een echte opstart, geen losse functie: het ging mis in
        # de volgorde tussen appInit() en onUserLoggedIn().
        def ouder_ingelogd(zonder_gebruikersnaam):
            body = stub_js + """
window.TT_STUB.session = { user: { id: 'u1', email: 'test@talenttent.org' } };
(function () {
  const maak = window.supabase.createClient;
  window.supabase.createClient = function () {
    const c = maak.apply(this, arguments);
    c.functions = { invoke: async () => ({ data: { stand: 'open', kind_voornaam: 'Testkind' }, error: null }) };
    return c;
  };
})();
"""
            if zonder_gebruikersnaam:
                body += "\nwindow.TT_STUB.data.musicians[0].username = null;\n"
            c = browser.new_context(viewport={"width": 390, "height": 844},
                                    is_mobile=True, has_touch=True)
            fouten = []
            pg = c.new_page()
            pg.on("pageerror", lambda e: fouten.append(str(e)))
            pg.route("**/supabase-js@2/**", lambda r: r.fulfill(
                status=200, content_type="application/javascript", body=body))
            for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**",
                        "**/api.pdok.nl/**", "**/itunes.apple.com/**"):
                pg.route(pat, lambda r: r.abort())
            pg.goto(f"http://127.0.0.1:{port}/index.html#toestemming/abc123", wait_until="load")
            pg.wait_for_timeout(800)
            uit = pg.evaluate("""() => ({
              views: [...document.querySelectorAll('.app-view.active')].map(v => v.id),
              hash: location.hash,
              vinkje: !!document.getElementById('toestemmingVinkje'),
              poort: document.getElementById('usernameGateModal').classList.contains('visible')
            })""")
            c.close()
            return uit, fouten

        ingelogd, fouten337 = ouder_ingelogd(False)
        check("TT-337: een ingelogde ouder blijft op de goedkeuringspagina",
              ingelogd["views"] == ["view-toestemming"] and ingelogd["vinkje"]
              and ingelogd["hash"] == "#toestemming/abc123", json.dumps(ingelogd))
        zonder, fouten337b = ouder_ingelogd(True)
        check("TT-337: ook zonder gebruikersnaam ligt er geen scherm over de goedkeuring",
              zonder["views"] == ["view-toestemming"] and not zonder["poort"],
              json.dumps(zonder))
        check("TT-337: geen paginafouten bij de ingelogde ouder",
              not fouten337 and not fouten337b, "; ".join(fouten337 + fouten337b)[:300])

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
        # De focusrand is --accent: in donker goud (weer sinds 27-09-2026,
        # besluit Ronald), in licht zwart. Deze meting draait in donker.
        check("de focusrand van een veld is 2px vol --accent, zonder gloed (TT-259, 27-09-2026)",
              focus[0] == "rgb(245, 197, 24) 0px 0px 0px 1px" and focus[1] == "rgb(245, 197, 24)", json.dumps(focus))

        # Eén tagvorm in de hele app (TT-315). TT-341 stap 2 (rustig, akkoord Ronald):
        # geen vlak, een dunne neutrale rand (--rand-neutraal), tekst in de tekstkleur.
        tags = page.evaluate("""() => {
          const plek = document.createElement('div'); document.getElementById('appRoot').appendChild(plek);
          plek.innerHTML = tagSolid('Drums') + tagSolid('Rock')
            + '<span class="level-pill">Basis</span><span class="band-status-badge band-status-zoekend">Zoekend</span>';
          const uit = [...plek.children].map(e => { const cs = getComputedStyle(e);
            return [cs.backgroundColor, cs.borderTopWidth + ' ' + cs.borderTopStyle + ' ' + cs.borderTopColor, cs.color]; });
          plek.remove(); return uit; }""")
        check("elke tag heeft geen vlak en een rand van 1px #3a3a3a (TT-315, TT-341)",
              all(t[0] == "rgba(0, 0, 0, 0)" and t[1] == "1px solid rgb(58, 58, 58)" for t in tags), json.dumps(tags))
        check("de tekst van een tag is de tekstkleur, ook de status 'Zoekend' (--accent)",
              all(t[2] == "rgb(240, 240, 240)" for t in tags), json.dumps(tags))
        check("tagSolid() zet geen eigen kleur meer",
              "style" not in page.evaluate("tagSolid('x')"), page.evaluate("tagSolid('x')"))

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
        # TT-341 stap 2 (besluit Ronald, 26-09-2026): gewone letters, 16px. Was 14px, hoofdletters.
        check("K1: elke hoofdknop 16px, vet, gewone letters, zwart op goud",
              all(h[:5] == ["16px", "700", "none", "rgb(0, 0, 0)", "rgb(245, 197, 24)"] for h in hoofd),
              json.dumps([h for h in hoofd if h[:5] != ["16px", "700", "none", "rgb(0, 0, 0)", "rgb(245, 197, 24)"]])[:300])

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
        # TT-385 fase 3: de ledenlijst in "Bandleden beheren" is weg; de leden
        # staan in de tegel Onze bezetting, met de drie puntjes in plaats van
        # een knop. Alleen de zoeklijst van Lid uitnodigen heeft nog knoppen.
        check("K3: de zoeklijst van Lid uitnodigen draagt de klasse lijst-rij",
              len(re.findall(r'class="(?:member-search-row )?lijst-rij"', js316)) == 1, "")
        page.evaluate("showView('register')"); page.wait_for_timeout(450)
        wiz = page.evaluate("""() => { const r = document.querySelector('#view-register .wizard-action-bar-inner');
            const b = [...r.children].filter(x => x.offsetParent).map(x => x.getBoundingClientRect());
            return { grid: getComputedStyle(r).display, breed: b.map(x => Math.round(x.width)), hoog: b.map(x => Math.round(x.height)) }; }""")
        check("K3: de wizardbalk is een knoppenrij met gelijke breedte (TT-228)",
              wiz["grid"] == "grid" and len(set(wiz["breed"])) == 1, json.dumps(wiz))

        # K5 — tweede knop: wit, rand --line. Ook Terug in de wizard.
        terug = page.evaluate("""() => { const b = [...document.querySelectorAll('#view-register .wizard-action-bar .btn-ghost')].find(x => x.offsetParent);
            const cs = getComputedStyle(b); return [cs.color, cs.borderTopStyle, cs.fontSize, cs.textTransform, b.className]; }""")
        check("K5: Terug in de wizard is een tweede knop: wit, 16px, gewone letters",
              terug[:4] == ["rgb(240, 240, 240)", "solid", "16px", "none"] and "btn-ghost" in terug[4], json.dumps(terug))
        check("K5: de tweede knop heeft een rand van --line", rand(".btn-ghost") == "var(--line)", str(rand(".btn-ghost")))
        # "Foto verwijderen" was hier een tweede knop; sinds TT-381 is het een kruisje. Zie blok 51.

        # K2 — Account verwijderen omlijnd in rood.
        rood = page.evaluate("""() => { const b = document.getElementById('deleteAccountConfirmBtn'); const cs = getComputedStyle(b);
            return [cs.backgroundColor, cs.color, cs.borderTopColor, cs.borderTopStyle]; }""")
        check("K2: Account verwijderen is omlijnd in rood, geen vlak (§5)",
              rood == ["rgba(0, 0, 0, 0)", "rgb(229, 83, 61)", "rgb(229, 83, 61)", "solid"], json.dumps(rood))

        # K6 — één gestippelde vorm (de bio-voorzet is vervallen, 08-10-2026).
        stip = page.evaluate("""() => { const e = document.querySelector('.add-link-btn'); const cs = getComputedStyle(e);
            return [cs.borderTopStyle, cs.borderTopLeftRadius, cs.minHeight, document.querySelectorAll('.bio-prompt-chip').length]; }""")
        check("K6: + Link toevoegen is gestippeld, 8px, 44px; er is nergens meer een bio-voorzet",
              stip == ["dashed", "8px", "44px", 0], json.dumps(stip))

        wb = page.evaluate("""() => { const v = document.getElementById('bio'); return [v.classList.contains('bio-voorbeeld'), v.placeholder.startsWith('Hoi allemaal! Ik ben Kevin.'),
            getComputedStyle(v, '::placeholder').fontStyle, v.closest('.field').querySelectorAll('button').length]; }""")
        check("de bio in de wizard heeft dezelfde cursieve voorbeeldtekst als de tegels en geen voorzetknoppen (consistentie)",
              wb == [True, True, "italic", 0], json.dumps(wb))

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
              pil == ["rgba(0, 0, 0, 0)", "11px", "6px", "none", "700", "italic", "rgb(240, 240, 240)", "100px"], json.dumps(pil))

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
                    bandErvaringTagHTML(3, true).includes('star-display'), bandErvaringTagHTML(3, false)]; }""")
        check("bandster weg uit de zoekresultaten (rij en kaart)", ster[:2] == [False, False], json.dumps(ster))
        # TT-385 (02-10-2026, punt 14): de ervaring is een tag op de bandpagina,
        # alleen zolang de band iemand zoekt.
        check("de ervaring van de band bestaat nog als tag, alleen zolang de band zoekt (TT-385)",
              ster[2] and ster[3] == "", json.dumps(ster))
        aanroepen = [r for r in re.findall(r"[^\n]*bandErvaringTagHTML\([^\n]*", js316) if "function " not in r]
        check("bandErvaringTagHTML() staat alleen op de bandpagina, niet op Mijn Bands",
              len(aanroepen) == 1 and "bandErvaringTagHTML(b.niveau, zoekend)" in aanroepen[0], str(len(aanroepen)))

        check("geen paginafouten in blok 31", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()
        page.evaluate("showView('landing'); window.TT_STUB.reset()")

        # ------------------------------------------------------------------
        # Blok 32 — TT-318: het eigen woordmerk
        # ------------------------------------------------------------------
        print("\nBlok 32 — het eigen woordmerk (TT-318)")
        css318 = open(os.path.join(ROOT, "styles.css"), encoding="utf-8").read()
        html318 = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        js318 = "".join(open(os.path.join(ROOT, f), encoding="utf-8").read() for f in JS_FILES)
        check("het lettertype staat in de repo (tt-woordmerk.woff2)",
              os.path.isfile(os.path.join(ROOT, "tt-woordmerk.woff2")), "bestand ontbreekt")
        check("styles.css declareert het met @font-face",
              re.search(r"@font-face\s*\{[^}]*'TT Woordmerk'[^}]*url\('tt-woordmerk\.woff2'\)", css318) is not None,
              "geen @font-face voor TT Woordmerk")
        check("index.html laadt het vooraf, met dezelfde URL",
              re.search(r'<link rel="preload" href="tt-woordmerk\.woff2" as="font" type="font/woff2" crossorigin>', html318) is not None,
              "geen preload")
        check("Alfa Slab One wordt nergens meer geladen of gebruikt",
              "Alfa+Slab" not in html318 and "font-family: 'Alfa Slab" not in css318
              and "font-family:'Alfa Slab" not in js318, "Alfa Slab One nog in gebruik")
        # Bevinding Ronald 28-09-2026: de vorm van de T staat sinds die dag in
        # .avatar-t, met --font-display. Blok 47 meet het lettertype in de browser.
        check("de T in een lege profielfoto gebruikt --font-display (TT-33), via .avatar-t",
              "const AVATAR_T_FALLBACK = `<span class=\"avatar-t\">T</span>`;" in js318
              and re.search(r"\.avatar-t\s*\{[^}]*font-family:\s*var\(--font-display\)", css318) is not None,
              "AVATAR_T_FALLBACK of .avatar-t wijkt af")

        wm = page.evaluate("""async () => {
          await document.fonts.load("28px 'TT Woordmerk'");
          const c = document.createElement('canvas').getContext('2d');
          const heeft = ch => { c.font = "40px 'TT Woordmerk', monospace"; const a = c.measureText(ch).width;
            c.font = '40px monospace'; const b = c.measureText(ch).width;
            c.font = "40px 'TT Woordmerk', serif"; const d = c.measureText(ch).width;
            c.font = '40px serif'; const e = c.measureText(ch).width; return a !== b || d !== e; };
          const kop = document.querySelector('header .logo');
          fitKopLogo(document);
          const vl = kop; // TT-410b: geen venster met een eigen woordmerk meer; alleen de kop van de app
          const uit = {
            geladen: document.fonts.check("28px 'TT Woordmerk'"),
            letters: [...new Set(kop.textContent.replace(/\s/g, '') + 'T')].filter(ch => !heeft(ch)),
            familie: getComputedStyle(kop).fontFamily.split(',')[0],
            kopPx: getComputedStyle(kop).fontSize, kopAfstand: getComputedStyle(kop).letterSpacing,
            vensterPx: getComputedStyle(vl).fontSize, vensterAfstand: getComputedStyle(vl).letterSpacing,
            kopTussen: getComputedStyle(kop.querySelector('span')).marginRight,
            vensterTussen: getComputedStyle(vl.querySelector('span')).marginRight
          };
          return uit;
        }""")
        check("het lettertype laadt in de browser", wm["geladen"], json.dumps(wm))
        check("elke letter van het woordmerk staat in het lettertype", wm["letters"] == [], json.dumps(wm))
        check("het woordmerk gebruikt TT Woordmerk", wm["familie"].strip('"\'') == "TT Woordmerk", json.dumps(wm))
        # TT-365 (28-09-2026, besluit Ronald): geen letterafstand meer; de
        # spatiëring is die van Tentype zelf. Was 2px bij 28px (TT-328).
        geenAfstand = lambda v: v in ("normal", "0px")
        check("geen letterafstand, in de kop én in een venster (TT-365)",
              wm["kopPx"] == wm["vensterPx"] == "28px"
              and geenAfstand(wm["kopAfstand"]) and geenAfstand(wm["vensterAfstand"]), json.dumps(wm))
        # TT-365: tussen TALENT en TENT 2px bij 28px, in de kop én in een venster.
        check("tussen TALENT en TENT 2px bij 28px, in de kop én in een venster (TT-365)",
              abs(float(wm["kopTussen"][:-2]) - 2) < 0.01
              and abs(float(wm["vensterTussen"][:-2]) - 2) < 0.01, json.dumps(wm))
        # TT-328: "het woordmerk mag nergens met spatie." Tussen TALENT en TENT
        # staat geen spatie, alleen de 2px van TT-365. Sinds TT-61 (30-09-2026)
        # zonder inline kleur: die stond al in .logo span, en de kop op de foto
        # van de landingspagina moet TALENT wit kunnen maken.
        logos328 = re.findall(r'<div class="logo"[^>]*>(.*?)</div>', html318)
        check("het woordmerk staat nergens met een spatie (TT-328)",
              len(logos328) == 1 and all(l == '<span>TALENT</span>TENT' for l in logos328),
              json.dumps(logos328))
        # TT-365 (28-09-2026): het lettertype is Tentype, niet meer het
        # nagetekende woordmerk van TT-318. Herkenbaar aan de L (594 van 1000,
        # was 540) en aan de kerning: alleen T-A schuift onder (77 van 1000).
        # Marge 0,5px: Chromium zonder scherm rondt de letterbreedte af op hele pixels.
        kern365 = page.evaluate("""async () => {
          await document.fonts.load("100px 'TT Woordmerk'");
          const s = document.createElement('span');
          s.style.cssText = "font-family:'TT Woordmerk';font-size:100px;position:absolute;left:-9999px;white-space:nowrap";
          document.body.appendChild(s);
          const w = (t, k) => { s.style.fontKerning = k; s.textContent = t; return s.getBoundingClientRect().width; };
          const uit = { L: w('L','normal'), TA: w('TA','none') - w('TA','normal'), TT: w('TT','none') - w('TT','normal') };
          s.remove(); return uit;
        }""")
        check("het lettertype is Tentype: L 59,4px bij 100px, T-A 7,7px onder, T-T niet (TT-365)",
              abs(kern365["L"] - 59.4) <= 0.5 and abs(kern365["TA"] - 7.7) <= 0.5 and abs(kern365["TT"]) < 0.01,
              json.dumps(kern365))
        # TT-365 (28-09-2026): het app-icoon is een plaatje, geen tekst. Het nieuwe
        # icoon (de T van Tentype) komt alleen bij wie het al had, als elke
        # verwijzing een ?v= draagt: index.html, manifest.json en de manifest-link.
        man365 = json.load(open(os.path.join(ROOT, "manifest.json"), encoding="utf-8"))
        ico365 = re.findall(r'(?:href|content)="(?:https://talenttent\.org/)?(icon-(?:192|512)\.png[^"]*)"', html318)
        check("elke verwijzing naar het app-icoon draagt een ?v= (TT-365)",
              len(ico365) == 4 and all("?v=" in i for i in ico365)
              and all("?v=" in ic["src"] for ic in man365["icons"])
              and re.search(r'<link rel="manifest" href="manifest\.json\?v=', html318) is not None,
              json.dumps([ico365, [ic["src"] for ic in man365["icons"]]]))
        check("geen paginafouten in blok 32", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ------------------------------------------------------------------
        # Blok 33 — TT-318: het ⋯-menu naast de naam, kruisje als de pijl,
        # bandvenster even breed als het muzikantvenster
        # ------------------------------------------------------------------
        print("\nBlok 33 — vensters: ⋯ bij de naam, kruisje en bandvenster (TT-318, TT-380)")
        page.set_viewport_size({"width": 375, "height": 812})
        page.wait_for_timeout(80)
        venster = page.evaluate("""async () => {
          const S = window.TT_STUB;
          const was = { hasOwnProfile, myMusicianId };
          hasOwnProfile = false; myMusicianId = 'm1';
          S.rpcResults.tt_get_musicians_public = () => [{ id: 'm2', username: 'dylan', age: 30, city: 'Den Haag',
            bio: '', goal: null, profile_color: '#f5c518', avatar_url: null, updated_at: new Date().toISOString(),
            instrument_levels: [{ instrument: 'Drums', niveau: 3 }], genres: ['Rock'], songs: [], media: [] }];
          S.rpcResults.tt_get_bands_public = () => [{ id: 'b2', name: 'Testband', city: 'Den Haag', description: '',
            status: 'zoekend', profile_color: '#3ecfff', updated_at: new Date().toISOString(), avatar_url: null,
            genres: ['Rock'], niveau: 3, members: [{ username: 'dylan', profile_color: '#f5c518' }], wanted: [] }];
          // TT-410b: muzikant én (fase 2) band zijn een scherm met de kop van de
          // app. Het menu staat bij de naam, recht onder de hamburger.
          const meet = async (soort) => {
            if (soort === 'muzikant') await openProfielScherm('m2'); else await openBandScherm('b2');
            hasOwnProfile = true;
            zetVeiligheidMenu('profielSchermActies', soort, soort === 'band' ? 'b2' : 'm2', 'Test');
            hasOwnProfile = false;
            const sc = document.getElementById('view-profiel');
            const plek = document.getElementById('profielSchermActies');
            const knop = plek && plek.querySelector('.nav-menu-btn');
            const kb = knop ? knop.getBoundingClientRect() : null;
            const naam = sc.querySelector('.profile-name');
            const hl = document.querySelector('#navMenuBtn line');
            const hb = hl.getBBox(), hm = hl.getScreenCTM();
            const kL = hm.a * (hb.x - 1) + hm.e, kR = hm.a * (hb.x + hb.width + 1) + hm.e;
            return {
              inKoprij: !!(plek && plek.closest('.modal-kop')),
              onderNaam: !!(plek && naam && plek.closest('.profiel-knoppen') && naam.parentElement.contains(plek)),
              naamVol: !!(naam && naam.clientWidth === naam.parentElement.clientWidth),
              menuMidden: kb ? (kb.left + kb.right) / 2 : null,
              kruisMidden: (kL + kR) / 2,
              naam: naam ? naam.clientWidth : null,
              overloop: document.documentElement.scrollWidth - document.documentElement.clientWidth
            };
          };
          const uit = { muzikant: await meet('muzikant'), band: await meet('band') };
          // Je eigen profiel in het venster: geen plek, dus geen lege tussenruimte.
          myMusicianId = 'm2';
          await openProfielScherm('m2');
          uit.eigenPlek = !!document.getElementById('profielSchermActies');
          hasOwnProfile = was.hasOwnProfile; myMusicianId = was.myMusicianId;
          delete S.rpcResults.tt_get_musicians_public; delete S.rpcResults.tt_get_bands_public;
          return uit;
        }""")
        for soort in ("muzikant", "band"):
            v = venster[soort]
            check(f"{soort}: het ⋯-menu staat in de profielkop, naast het deelicoon, niet in de koprij (TT-380, TT-384)",
                  v["onderNaam"] and not v["inKoprij"], json.dumps(v))
            check(f"{soort}: het ⋯-menu staat recht onder de hamburger (de plek van het oude kruisje)",
                  v["menuMidden"] is not None and abs(v["menuMidden"] - v["kruisMidden"]) <= 2, json.dumps(v))
            check(f"{soort}: niets steekt zijwaarts buiten het scherm of venster",
                  v["overloop"] <= 0, json.dumps(v))
        # TT-380: hier stond "de naam houdt 187px". Sinds het menu onder de naam
        # staat, heeft de naam de volle breedte van zijn kolom.
        check("de naam in het muzikant- en bandvenster heeft de volle breedte (TT-380)",
              venster["muzikant"]["naamVol"] and venster["band"]["naamVol"]
              and venster["muzikant"]["naam"] > 187, json.dumps(venster))
        check("op je eigen profiel in het venster komt er geen plek voor het menu",
              not venster["eigenPlek"], json.dumps(venster))
        check("geen paginafouten in blok 33", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(80)

        # ------------------------------------------------------------------
        # Blok 34 — TT-322: één kruisje in de hele app
        # ------------------------------------------------------------------
        print("\nBlok 34 — één kruisje in elk venster (TT-322)")
        html322 = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        knoppen = re.findall(r'<button class="modal-close"[^>]*>(.*?)</button>', html322, re.S)
        teken = '<line x1="5" y1="5" x2="19" y2="19"></line><line x1="19" y1="5" x2="5" y2="19"></line>'
        check("elk kruisje in index.html is het sluitteken, nergens meer de letter ✕",
              len(knoppen) == 10 and all(teken in k and "✕" not in k for k in knoppen), str(len(knoppen)))
        check("elk kruisje heeft een aria-label",
              all("aria-label" in t for t in re.findall(r'<button class="modal-close"[^>]*>', html322)), "")
        terug322 = re.findall(r'<button class="modal-back"[^>]*>(.*?)</button>', html322, re.S)
        check("geen terugknop meer in een venster (TT-410a: het niveau is inline), en nergens de letter ←",
              len(terug322) == 0 and "←" not in html322, str(terug322)[:120])
        page.set_viewport_size({"width": 375, "height": 812})
        page.wait_for_timeout(80)
        kruis322 = page.evaluate("""() => {
          const uit = {};
          for (const id of ['niveauInfoModal', 'legalModal', 'inloggegevensModal']) {
            const ov = document.getElementById(id);
            if (!ov) { uit[id] = null; continue; }
            ov.classList.add('visible');
            const box = ov.querySelector('.modal-box');
            const k = ov.querySelector('.modal-close');
            const kb = k.getBoundingClientRect(), bb = box.getBoundingClientRect();
            const l = k.querySelector('line'); const b = l.getBBox(), m = l.getScreenCTM();
            const inktR = m.a * (b.x + b.width + 1) + m.e;
            const na = getComputedStyle(k, '::after').content;
            uit[id] = { rechts: +(bb.right - inktR).toFixed(1), midY: Math.round((kb.top + kb.bottom) / 2 - bb.top),
                        b: Math.round(kb.width), h: Math.round(kb.height), cirkel: getComputedStyle(k).borderRadius,
                        rand: getComputedStyle(k).borderTopColor, na };
            ov.classList.remove('visible');
          }
          return uit;
        }""")
        for mid, k in kruis322.items():
            check(f"{mid}: het kruisje staat 29px van de rand en op de middellijn van de kop (34px)",
                  k is not None and abs(k["rechts"] - 29) <= 0.5 and abs(k["midY"] - 34) <= 1, json.dumps(k))
            check(f"{mid}: knop van 44×44px, geen cirkel, geen los tikvlak",
                  k is not None and k["b"] == 44 and k["h"] == 44 and k["cirkel"] != "50%"
                  and k["na"] in ("none", "normal"), json.dumps(k))
        check("geen paginafouten in blok 34", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(80)

        # ------------------------------------------------------------------
        # Blok 35 — TT-312: band opheffen is alles of niets
        # ------------------------------------------------------------------
        print("\nBlok 35 — band opheffen is alles of niets (TT-312)")
        page.evaluate("window.TT_STUB.reset()")
        tt312 = page.evaluate("""async () => {
          const S = window.TT_STUB;
          const uit = {};
          const bewaard = JSON.stringify({ bands: S.data.bands, band_members: S.data.band_members,
                                           band_wanted: S.data.band_wanted });
          const zet = () => {
            S.data.bands = [{ id: 'b9', name: 'Proefband', city: 'Delft', postcode: '2611',
                              status: 'Zoekend naar leden', niveau: 3, description: '',
                              photo_url: null, city_source: 'pdok' }];
            S.data.band_members = [
              { band_id: 'b9', musician_id: 'm1', role: 'Oprichter', status: 'bevestigd', founder_offer: null, founder_offer_at: null },
              { band_id: 'b9', musician_id: 'm2', role: 'Lid', status: 'bevestigd', founder_offer: null, founder_offer_at: null }];
            S.data.band_wanted = [{ band_id: 'b9', instrument: 'Bas' }];
          };
          const stand = () => ({
            band: S.data.bands.filter(r => r.id === 'b9').length,
            leden: S.data.band_members.filter(r => r.band_id === 'b9').length,
            gezocht: S.data.band_wanted.filter(r => r.band_id === 'b9').length });
          const losGewist = () => S.calls.some(c => c.kind === 'table' && c.op === 'delete');
          const toast = () => (document.getElementById('appToast') || {}).textContent || '';

          // Mislukt: band, leden en Gezocht blijven alle drie staan
          zet(); S.calls = [];
          S.rpcErrors.tt_dissolve_band = { code: 'P0001', message: 'Band b9 kon niet worden opgeheven' };
          await dissolveBand('b9');
          uit.fout = stand();
          uit.foutLos = losGewist();
          uit.foutToast = toast();
          delete S.rpcErrors.tt_dissolve_band;

          // Lukt: alles weg, met één aanroep
          zet(); S.calls = [];
          await dissolveBand('b9');
          uit.goed = stand();
          uit.goedLos = losGewist();
          uit.goedRpc = S.calls.filter(c => c.kind === 'rpc' && c.name === 'tt_dissolve_band')
                               .map(c => JSON.stringify(c.params));
          uit.goedToast = toast();
          Object.assign(S.data, JSON.parse(bewaard));
          return uit;
        }""")
        check("mislukt opheffen laat band, leden en Gezocht staan",
              tt312["fout"] == {"band": 1, "leden": 2, "gezocht": 1}, json.dumps(tt312))
        check("mislukt opheffen wist niets los vooraf", not tt312["foutLos"], json.dumps(tt312))
        check("mislukt opheffen meldt dat het niet gelukt is",
              "niet gelukt" in tt312["foutToast"], tt312["foutToast"])
        check("gelukt opheffen wist band, leden en Gezocht in één aanroep",
              tt312["goed"] == {"band": 0, "leden": 0, "gezocht": 0} and not tt312["goedLos"]
              and tt312["goedRpc"] == ['{"p_band_id":"b9"}'], json.dumps(tt312))
        check("gelukt opheffen meldt 'Band opgeheven.'",
              "Band opgeheven." in tt312["goedToast"], tt312["goedToast"])
        check("geen paginafouten in blok 35", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")

        # ------------------------------------------------------------------
        # Blok 36 — TT-45: media van 13- tot 15-jarigen afgeschermd voor
        # bezoekers zonder account, en de meldknop in de teksten
        # ------------------------------------------------------------------
        print("\nBlok 36 — afgeschermde media en de meldknop in de teksten (TT-45)")
        page.evaluate("window.TT_STUB.reset()")
        tt45 = page.evaluate("""async () => {
          const S = window.TT_STUB;
          const was = { hasOwnProfile, myMusicianId };
          hasOwnProfile = false; myMusicianId = null;
          const rij = (media, avatar) => [{ id: 'm2', username: 'kim', age: 14, city: 'Den Haag',
            bio: '', goal: null, profile_color: '#f5c518', avatar_url: avatar, updated_at: new Date().toISOString(),
            instrument_levels: [{ instrument: 'Drums', niveau: 3 }], genres: ['Rock'], songs: [], media }];
          const meet = async () => {
            await openProfielScherm('m2');
            const vak = document.getElementById('profielSchermContent');
            const t = [...vak.querySelectorAll('.media-afgeschermd')];
            const r = {
              tegels: vak.querySelectorAll('.profile-media-tegel.media-afgeschermd').length,
              banner: vak.querySelectorAll('.pb-item.media-afgeschermd').length,
              balk: vak.querySelectorAll('.profiel-banner').length,
              opBanner: !!vak.querySelector('.profiel-kop.op-banner'),
              knoppen: t.filter(e => e.tagName === 'BUTTON' || e.closest('button') || e.hasAttribute('onclick')).length,
              tekst: t.map(e => e.textContent.trim()),
              beeld: vak.querySelectorAll('.profile-media img, .profile-media video, .profiel-banner img, .profiel-banner video').length,
              fotoAvatar: vak.querySelectorAll('.profile-avatar-photo').length,
              tAvatar: vak.querySelectorAll('.profile-avatar-initials').length,
              gewoneTegels: vak.querySelectorAll('button.profile-media-tegel').length,
            };
            if (t[0]) { const cs = getComputedStyle(t[0]); r.kleur = cs.color; r.cursor = cs.cursor; }
            return r;
          };
          const uit = {};
          // Afgeschermd: drie items zonder adres, één daarvan in de banner
          S.rpcResults.tt_get_musicians_public = () => rij([
            { media_type: 'foto', url: null, platform: null, in_banner: true, afgeschermd: true },
            { media_type: 'video', url: null, platform: null, in_banner: false, afgeschermd: true },
            { media_type: 'link', url: null, platform: null, in_banner: false, afgeschermd: true }], null);
          uit.af = await meet();
          // Niet afgeschermd (16+): zelfde soorten, met adres — mag niet veranderen
          S.rpcResults.tt_get_musicians_public = () => rij([
            { media_type: 'foto', url: 'https://x.test/a.jpg', platform: null, in_banner: false },
            { media_type: 'video', url: 'https://x.test/b.mp4', platform: null, in_banner: false },
            { media_type: 'link', url: 'https://open.spotify.com/track/1', platform: 'Spotify', in_banner: false }],
            'https://x.test/avatar.jpg');
          uit.open = await meet();
          hasOwnProfile = was.hasOwnProfile; myMusicianId = was.myMusicianId;
          return uit;
        }""")
        af, op = tt45["af"], tt45["open"]
        check("afgeschermd: foto, video en link staan er als T-tegel",
              af["tegels"] == 3 and all(t == "T" for t in af["tekst"]), json.dumps(af))
        # TT-385 (02-10-2026, besluit Ronald: "dan banner weglaten bij publieke
        # profielen onder 16 jaar"): geen bannerbalk, ook geen T-vlak.
        check("afgeschermd: geen bannerbalk, ook geen T-vlak (TT-385)",
              af["banner"] == 0 and af["balk"] == 0 and not af["opBanner"], json.dumps(af))
        check("afgeschermd: geen enkel beeld of video in de pagina", af["beeld"] == 0, json.dumps(af))
        check("afgeschermd: de T is geen knop (er valt niets te openen)",
              af["knoppen"] == 0 and af.get("cursor") == "default", json.dumps(af))
        # TT-341 stap 2: het afgeschermde vlak is het profielvlak — geel met een zwarte T.
        check("afgeschermd: de T is zwart op geel, zoals het profielvlak",
              af.get("kleur") == "rgb(0, 0, 0)", json.dumps(af))
        check("afgeschermd: profielfoto wordt de T", af["tAvatar"] == 1 and af["fotoAvatar"] == 0, json.dumps(af))
        check("16+: foto, video en link blijven gewone knoppen",
              op["gewoneTegels"] == 2 and op["tegels"] == 0 and op["fotoAvatar"] == 1, json.dumps(op))

        html45 = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        check("geen 'meldknop volgt nog' meer in de voorwaarden en de gedragscode",
              "volgt nog" not in html45 and "binnenkort ook een meldknop" not in html45)
        voorw = html45.split('id="view-terms"')[1].split('id="view-gedragscode"')[0]
        gedr = html45.split('id="view-gedragscode"')[1].split('<div class="view')[0]
        priv = html45.split('id="view-privacy"')[1].split('id="view-terms"')[0]
        check("voorwaarden en gedragscode wijzen naar de knop ⋯",
              "knop ⋯" in voorw and "knop ⋯" in gedr)
        check("privacyverklaring noemt het afschermen voor 13, 14 en 15",
              "Ben je 13, 14 of 15?" in priv and "De T van The Talent Tent" in priv.replace("de T", "De T"))
        check("geen paginafouten in blok 36", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")

        # ------------------------------------------------------------------
        # Blok 37 — laatst actief bepaalt de plek in de zoekresultaten
        # (25-09-2026, besluit Ronald)
        # ------------------------------------------------------------------
        print("\nBlok 37 — laatst actief bepaalt de volgorde (25-09-2026)")
        page.evaluate("window.TT_STUB.reset()")
        actief = page.evaluate("""async () => {
          const S = window.TT_STUB;
          const uit = {};
          const oud = { m: S.rpcResults.tt_actief_stand, b: S.rpcResults.tt_band_actief_stand,
                        zoek: S.rpcResults.tt_search_musicians_anon, pub: S.rpcResults.tt_get_musicians_public,
                        origin: S.rpcResults.tt_resolve_search_origin };
          const groepen = { m2: [2, 3], m3: [0, 2], m4: [1, 1], m5: [0, 1] };
          S.rpcResults.tt_actief_stand = (p) => p.ids.map(id => ({ id, groep: groepen[id][0], rang: groepen[id][1] }));

          // Van dichtbij naar ver: m2 (3 km) is het langst niet actief.
          hasOwnProfile = false;
          S.rpcResults.tt_resolve_search_origin = [{ lat: 52.0, lng: 4.3 }];
          S.rpcResults.tt_search_musicians_anon = () => ([
            { musician_id: 'm2', distance_km: 3, is_stale: false },
            { musician_id: 'm3', distance_km: 4, is_stale: false },
            { musician_id: 'm4', distance_km: 5, is_stale: false },
            { musician_id: 'm5', distance_km: 6, is_stale: false }
          ]);
          const publiek = (id) => ({
            id, username: 'u' + id, age: 30, city: 'Delft', bio: '', goal: null,
            profile_color: '#f5c518', avatar_url: null,
            instrument_levels: [{ instrument: 'Drums', niveau: 3 }], genres: ['Rock'], songs: []
          });
          S.rpcResults.tt_get_musicians_public = ['m2', 'm3', 'm4', 'm5'].map(publiek);
          document.getElementById('filterCity').value = 'Delft';
          document.getElementById('filterRadius').value = '50';
          S.calls = [];
          selectSortModeByValue('filterSortMode', 'distance');
          searchSortMode = 'distance';
          await runSearch();
          await new Promise(r => setTimeout(r, 200));
          uit.afstand = lastMusicianResults.map(m => m.id);
          uit.vraag = S.calls.filter(c => c.kind === 'rpc' && c.name === 'tt_actief_stand').map(c => c.params.ids.slice().sort().join(','));
          setSearchSortMode('actief');
          uit.laatstActief = lastMusicianResults.map(m => m.id);

          // Mislukt de vraag, dan geldt gewoon de gekozen sortering.
          S.rpcErrors.tt_actief_stand = { code: 'PGRST202', message: 'Could not find the function' };
          setSearchSortMode('distance');
          await runSearch();
          await new Promise(r => setTimeout(r, 200));
          uit.zonderStand = lastMusicianResults.map(m => m.id);
          delete S.rpcErrors.tt_actief_stand;

          // Bands: de beheerder telt, via een eigen functie.
          S.rpcResults.tt_band_actief_stand = (p) => p.ids.map(id => ({ id, groep: id === 'b1' ? 2 : 0, rang: id === 'b1' ? 2 : 1 }));
          const banden = [{ id: 'b1', distance_km: 1, matchScore: 5 }, { id: 'b2', distance_km: 9, matchScore: 1 }];
          await zetActiefStand('band', banden);
          bandSearchSortMode = 'score';
          uit.bands = sortBandList(banden).map(b => b.id);

          // Setlist: zelfde regel, ook bij meer gematchte nummers.
          const set = [{ id: 'm2', matchCount: 5, distance_km: 1 }, { id: 'm5', matchCount: 1, distance_km: 9 }];
          await zetActiefStand('muzikant', set);
          setlistSearchSortMode = 'score';
          uit.setlist = sortSetlistList(set).map(m => m.id);

          // Elke sorteerkeuzelijst heeft "Laatst actief", geen "Nieuwste".
          uit.opties = ['filterSortMode', 'filterBandSortMode', 'filterSetlistSortMode'].map(id =>
            [...document.getElementById(id).options].map(o => o.value + '=' + o.textContent));

          // Inloggen of opstarten met een sessie markeert je als actief.
          S.calls = [];
          markeerActief();
          await new Promise(r => setTimeout(r, 30));
          uit.markeer = S.calls.filter(c => c.kind === 'rpc' && c.name === 'tt_markeer_actief').length;
          uit.markeerInLogin = onUserLoggedIn.toString().includes('markeerActief()');

          Object.assign(S.rpcResults, { tt_actief_stand: oud.m, tt_band_actief_stand: oud.b,
            tt_search_musicians_anon: oud.zoek, tt_get_musicians_public: oud.pub,
            tt_resolve_search_origin: oud.origin });
          searchSortMode = 'score';
          return uit;
        }""")
        check("de app vraagt de stand op voor precies de gevonden muzikanten",
              actief["vraag"] == ["m2,m3,m4,m5"], json.dumps(actief["vraag"]))
        check("eerst op groep, daarbinnen op afstand",
              actief["afstand"] == ["m3", "m5", "m4", "m2"], json.dumps(actief["afstand"]))
        check("'Laatst actief' sorteert binnen de groep op rang",
              actief["laatstActief"] == ["m5", "m3", "m4", "m2"], json.dumps(actief["laatstActief"]))
        check("mislukt de vraag, dan blijft de gekozen sortering staan",
              actief["zonderStand"] == ["m2", "m3", "m4", "m5"], json.dumps(actief["zonderStand"]))
        check("bij bands telt de stand van de beheerder, vóór de matchscore",
              actief["bands"] == ["b2", "b1"], json.dumps(actief["bands"]))
        check("bij Setlist gaat de groep vóór het aantal gematchte nummers",
              actief["setlist"] == ["m5", "m2"], json.dumps(actief["setlist"]))
        check("alle drie de keuzelijsten tonen 'Laatst actief', niet 'Nieuwste'",
              all("actief=Laatst actief" in o and not any(x.startswith("newest") for x in o)
                  for o in actief["opties"]), json.dumps(actief["opties"]))
        check("markeerActief() roept tt_markeer_actief aan", actief["markeer"] == 1, str(actief["markeer"]))
        check("en draait bij elk inloggen en elke opstart met sessie",
              actief["markeerInLogin"], "")
        check("geen paginafouten in blok 37", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")

        print("\nBlok 38 — geen keuze Licht/Donker bij E-mailvoorkeuren (TT-327)")
        mailstijl = page.evaluate("""() => ({
          veld: !!document.getElementById('emailThemeControl'),
          label: [...document.querySelectorAll('#searchPrefsModal label')].map(l => l.textContent.trim()),
          functies: ['selectEmailTheme', 'setEmailTheme'].filter(n => typeof window[n] !== 'undefined'),
          lezen: openSearchPrefsModal.toString().includes('email_theme'),
          schrijven: saveSearchPrefs.toString().includes('email_theme'),
          frequentie: !!document.getElementById('digestFrequencyControl')
        })""")
        check("het veld E-mailstijl staat niet meer in het scherm",
              not mailstijl["veld"] and "E-mailstijl" not in mailstijl["label"], json.dumps(mailstijl["label"]))
        check("selectEmailTheme() en setEmailTheme() bestaan niet meer",
              not mailstijl["functies"], json.dumps(mailstijl["functies"]))
        check("openen leest email_theme niet, opslaan schrijft het niet",
              not mailstijl["lezen"] and not mailstijl["schrijven"], "")
        check("de keuze Nieuwe-matches e-mail staat er nog", mailstijl["frequentie"], "")
        check("geen paginafouten in blok 38", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ─────────────────────────────────────────────────────────────
        # Blok 39 — TT-295 (26-09-2026): de bewaarde zoekopdracht.
        # Besluiten Ronald: één per muzikant, alle filters behalve de naam,
        # alleen het tabblad Muzikant. De digest leest hem in de database;
        # dat toetst laag 2. Hier: het blok onder het resultaat, bewaren,
        # vervangen, stoppen, en Instellingen.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 39 — de bewaarde zoekopdracht (TT-295)")

        def zoekopzet(pg):
            pg.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load")
            pg.wait_for_timeout(500)
            pg.evaluate("""() => {
              const d = window.TT_STUB.data;
              d.musicians.forEach(m => {
                m.fname = m.first_name; m.musician_songs = []; m.musician_media = [];
                m.musician_instruments = d.musician_instruments.filter(x => x.musician_id === m.id);
                m.musician_genres = d.musician_genres.filter(x => x.musician_id === m.id);
              });
              d.musicians[1].musician_instruments = [{ instrument: 'Gitaar', niveau: 2 }];
              // TT-62: binnen 10 km niets, vanaf 25 km Dylan. Zo is ook te zien
              // dat de ingestelde straal wordt bewaard, niet de verruimde.
              window.TT_STUB.rpcResults.tt_search_musicians = (p) => p.radius_km < 25 ? []
                : [{ musician_id: 'm2', distance_km: 19.1, score: 0.5, is_stale: false }];
              showView('search');
            }""")
            pg.wait_for_timeout(200)

        def zoek(pg, straal="10", naam=""):
            pg.evaluate("""([s, n]) => { filterInstruments = ['Gitaar']; filterGenres = ['Rock'];
              document.getElementById('filterRadius').value = s;
              document.getElementById('filterName').value = n; runSearch(); }""", [straal, naam])
            pg.wait_for_timeout(500)

        def blok(pg):
            return pg.evaluate("""() => { const b = document.querySelector('#searchResults .seintje-blok');
              if (!b) return null;
              const k = b.querySelector('.seintje-knop');
              return { kop: b.querySelector('.seintje-kop').textContent.trim(),
                       zoek: b.querySelector('.seintje-zoek').textContent.trim(),
                       klein: [...b.querySelectorAll('.seintje-klein')].map(x => x.textContent.trim()).join(' '),
                       knop: k ? k.textContent.trim() : '', hoogte: k ? k.getBoundingClientRect().height : 0 }; }""")

        # Uitgelogd: niemand om te mailen, dus geen blok.
        uc39, up39, uf39 = telefoon(False)
        zoekopzet(up39)
        uf39.clear()
        up39.evaluate("""() => { window.TT_STUB.rpcResults.tt_search_musicians_anon =
            [{ musician_id: 'm2', distance_km: 9, score: 0, is_stale: false }]; }""")
        zoek(up39)
        check("uitgelogd staat er geen blok onder het resultaat", blok(up39) is None, str(blok(up39)))
        uc39.close()

        ic39, ip39, if39 = telefoon(True)
        zoekopzet(ip39)
        # Bij het opstarten tekent Mijn Profiel met de platte stubrijen; die
        # fout hoort bij de stub, niet bij dit blok. Pas hierna telt het.
        if39.clear()
        ip39.evaluate("window.TT_STUB.data.musicians[0].email_digest_frequency = 'off'")
        zoek(ip39)
        b = blok(ip39) or {}
        check("met profiel staat het blok onder het resultaat", bool(b), "geen .seintje-blok")
        plek = ip39.evaluate("""() => { const p = document.getElementById('seintjePlek');
            const l = document.querySelector('#searchResults .results-list, #searchResults .results-grid-view');
            return !!(p && l && (p.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING)); }""")
        check("na verruimen (TT-62) staat het blok bóven de lijst, onder de verruim-regel", plek, "")
        check("het blok noemt de zoekopdracht in woorden, met de ingestelde straal (TT-62)",
              b.get("zoek") == "Gitaar · Rock · binnen 10 km van Den Haag", str(b.get("zoek")))
        check("de knop heet 'Bewaar deze zoekopdracht' en is minstens 44px hoog",
              b.get("knop") == "Bewaar deze zoekopdracht" and b.get("hoogte", 0) >= 44,
              f"{b.get('knop')} / {b.get('hoogte')}")
        # Twee tikken snel achter elkaar schrijven één keer (TT-252).
        ip39.evaluate("bewaarZoek(); bewaarZoek();")
        ip39.wait_for_timeout(500)
        rijen = ip39.evaluate("window.TT_STUB.data.musician_saved_search")
        schrijf = ip39.evaluate("""window.TT_STUB.calls.filter(c => c.kind === 'table'
            && c.table === 'musician_saved_search' && c.op === 'upsert').length""")
        check("bewaren schrijft één rij, ook bij een dubbele tik",
              len(rijen) == 1 and schrijf == 1, f"rijen {len(rijen)}, upserts {schrijf}")
        r = rijen[0] if rijen else {}
        check("de rij bewaart instrument, genre en straal, en geen naam",
              r.get("instruments") == ["Gitaar"] and r.get("genres") == ["Rock"]
              and r.get("radius_km") == 10 and r.get("plaats") is None and "naam" not in r, json.dumps(r))
        check("stond de mail uit, dan staat hij daarna op dagelijks",
              ip39.evaluate("window.TT_STUB.data.musicians[0].email_digest_frequency") == "daily",
              str(ip39.evaluate("window.TT_STUB.data.musicians[0].email_digest_frequency")))
        b = blok(ip39) or {}
        check("daarna zegt het blok dat je een mail krijgt, met de knop Stoppen",
              b.get("kop") == "Je krijgt een mail als er iemand bijkomt" and b.get("knop") == "Stoppen", str(b))

        # Een andere zoekopdracht: vervangen, met de controlevraag (huisstijl §19).
        zoek(ip39, "50")
        b = blok(ip39) or {}
        check("bij een andere zoekopdracht staat de bewaarde erbij, met 'Vervangen door deze'",
              "binnen 10 km" in b.get("klein", "") and b.get("knop") == "Vervangen door deze", str(b))
        ip39.click("#searchResults .seintje-knop")
        ip39.wait_for_timeout(200)
        vraag = ip39.evaluate("""() => ({ open: document.getElementById('confirmModal').classList.contains('visible'),
            tekst: document.getElementById('confirmMessage').textContent,
            ja: document.getElementById('confirmYesBtn').textContent.trim() })""")
        check("vervangen vraagt eerst, en noemt de oude en de nieuwe zoekopdracht",
              vraag["open"] and "10 km" in vraag["tekst"] and "50 km" in vraag["tekst"] and vraag["ja"] == "Ja, vervangen",
              json.dumps(vraag))
        ip39.click("#confirmYesBtn")
        ip39.wait_for_timeout(400)
        rijen = ip39.evaluate("window.TT_STUB.data.musician_saved_search")
        check("na 'Ja, vervangen' staat er één rij, met de nieuwe straal",
              len(rijen) == 1 and rijen[0].get("radius_km") == 50, json.dumps(rijen))

        # Zoeken op naam: je zoekt één persoon, dus geen blok (TT-257).
        zoek(ip39, "50", "Dylan")
        check("met een naam in het zoekveld staat er geen blok", blok(ip39) is None, str(blok(ip39)))

        # Instellingen → E-mailvoorkeuren.
        ip39.evaluate("openSearchPrefsModal()")
        ip39.wait_for_timeout(400)
        inst = ip39.evaluate("""() => { const p = document.getElementById('bewaardeZoekInstellingen');
            return { tekst: p ? p.textContent.replace(/\\s+/g, ' ').trim() : null,
                     blokken: document.querySelectorAll('#searchPrefsModal .modal-blok').length }; }""")
        check("Instellingen toont de bewaarde zoekopdracht in een eigen blok",
              inst["blokken"] == 3 and "binnen 50 km van Den Haag" in (inst["tekst"] or "")
              and "Stoppen" in (inst["tekst"] or ""), json.dumps(inst))
        ip39.click("#bewaardeZoekInstellingen .seintje-knop")
        ip39.wait_for_timeout(400)
        check("Stoppen in Instellingen haalt de rij weg",
              ip39.evaluate("window.TT_STUB.data.musician_saved_search.length") == 0, "")
        check("en daarna staat er 'Nog geen'",
              "Nog geen" in ip39.evaluate("document.getElementById('bewaardeZoekInstellingen').textContent"), "")
        ic39.close()
        check("uitloggen wist de bewaarde zoekopdracht van de vorige gebruiker",
              page.evaluate("""() => { const f = Object.values(window).find(v => typeof v === 'function'
                  && v.toString().includes('wisBlokkades();') && v.toString().includes('wisBewaardeZoek();'));
                  return !!f; }"""), "")
        check("geen paginafouten in blok 39", not (if39 or uf39), "; ".join(if39 + uf39)[:300])

        print("\nBlok 40 — licht thema en rustig (TT-341 stap 2)")
        # Meet de rollen in beide thema's. Elk element wordt los gemaakt, zodat de
        # meting niet afhangt van de stand van de app.
        meet40 = """(thema) => {
          const html = document.documentElement;
          if (thema) html.dataset.theme = thema; else delete html.dataset.theme;
          const plek = document.createElement('div'); document.getElementById('appRoot').appendChild(plek);
          plek.innerHTML = '<div class="result-row-avatar">T</div><div class="message-bubble own">x</div>'
            + '<button class="bottom-nav-btn active">Zoeken</button><span class="unread-badge">2</span>'
            + '<button class="btn btn-primary">Opslaan</button><div class="search-mode-tab active">Band</div>'
            + '<label>Plaats</label><div class="logo"><span style="color:var(--text);">TALENT</span>TENT</div>';
          const k = [...plek.children].map(e => getComputedStyle(e));
          const span = getComputedStyle(plek.querySelector('.logo span'));
          const uit = {
            bg: getComputedStyle(document.body).backgroundColor,
            accent: getComputedStyle(html).getPropertyValue('--accent').trim(),
            avatar: [k[0].backgroundColor, k[0].color], eigen: k[1].backgroundColor,
            tab: [k[2].backgroundColor, k[2].color], ongelezen: k[3].backgroundColor,
            knop: [k[4].backgroundColor, k[4].color, k[4].textTransform],
            gekozen: [k[5].backgroundColor, k[5].color], label: [k[6].textTransform, k[6].color],
            woordmerk: [k[7].color, span.color] };
          plek.remove(); delete html.dataset.theme; return uit; }"""
        d40 = page.evaluate(meet40, None)
        l40 = page.evaluate(meet40, "licht")
        # Besluit Ronald, 27-09-2026: de gele accenten terug in donker.
        check("donker: --accent is goud, zoals vóór 26-09-2026", d40["accent"] == "#f5c518", d40["accent"])
        check("donker: ondergrond ongewijzigd #0d0d0d", d40["bg"] == "rgb(13, 13, 13)", d40["bg"])
        check("donker: profielvlak geel met zwarte T", d40["avatar"] == ["rgb(245, 197, 24)", "rgb(0, 0, 0)"], json.dumps(d40["avatar"]))
        # TT-371 (variant C) en TT-440 (Ronald, 08-10-2026, "1 - rustig"): niet grijs, warm goud, niet het merkgeel. Blok 47 toetst de kleur.
        check("donker: je eigen bericht is warm goud #E0B52A, niet het merkgeel", d40["eigen"] == "rgb(224, 181, 42)", d40["eigen"])
        check("donker: actieve tab onderin is een geel vlak met zwarte tekst",
              d40["tab"] == ["rgb(245, 197, 24)", "rgb(0, 0, 0)"], json.dumps(d40["tab"]))
        check("donker: ongelezen blijft het rode rondje", d40["ongelezen"] == "rgb(229, 83, 61)", d40["ongelezen"])
        check("donker: gekozen tabblad houdt de gouden stand", d40["gekozen"][1] == "rgb(245, 197, 24)", json.dumps(d40["gekozen"]))
        # Besluit Ronald, 26-09-2026 ("1 B", "2 B mits niet vetgedrukt", "3 B"): vorm in beide thema's gelijk.
        check("donker: knoppen en veldlabels in gewone letters, labels in de tekstkleur",
              d40["knop"][2] == "none" and d40["label"] == ["none", "rgb(240, 240, 240)"], json.dumps([d40["knop"], d40["label"]]))
        vorm40 = page.evaluate("""() => { const plek = document.createElement('div'); document.getElementById('appRoot').appendChild(plek);
          plek.innerHTML = '<button class="btn btn-primary">x</button><label>Plaats</label>';
          const b = getComputedStyle(plek.children[0]), l = getComputedStyle(plek.children[1]);
          const r = getComputedStyle(document.documentElement);
          const u = [b.fontSize, l.fontSize, l.fontWeight, r.getPropertyValue('--radius').trim(), r.getPropertyValue('--radius-field').trim()];
          plek.remove(); return u; }""")
        check("knop 16px, label 14px niet vet, kaart 16px en veld 10px rond",
              vorm40 == ["16px", "14px", "400", "16px", "10px"], json.dumps(vorm40))
        check("licht: ondergrond crème #F6F3EC", l40["bg"] == "rgb(246, 243, 236)", l40["bg"])
        check("licht: --accent is zwart #1E1E1E", l40["accent"] == "#1E1E1E", l40["accent"])
        check("licht: woordmerk TALENT zwart, TENT geel",
              l40["woordmerk"] == ["rgb(245, 197, 24)", "rgb(30, 30, 30)"], json.dumps(l40["woordmerk"]))
        check("licht: hoofdknop geel met zwarte tekst, gewone letters",
              l40["knop"] == ["rgb(245, 197, 24)", "rgb(30, 30, 30)", "none"], json.dumps(l40["knop"]))
        check("licht: gekozen tabblad is een geel vlak met zwarte tekst",
              l40["gekozen"] == ["rgb(245, 197, 24)", "rgb(30, 30, 30)"], json.dumps(l40["gekozen"]))
        check("licht: profielvlak geel met zwarte T", l40["avatar"] == ["rgb(245, 197, 24)", "rgb(30, 30, 30)"], json.dumps(l40["avatar"]))
        check("licht: je eigen bericht vol geel #F2CE4A (TT-440)", l40["eigen"] == "rgb(242, 206, 74)", l40["eigen"])
        check("licht: ongelezen blijft hetzelfde rood als donker", l40["ongelezen"] == d40["ongelezen"], l40["ongelezen"])
        check("licht: veldlabel donker, gewone letters",
              l40["label"] == ["none", "rgb(30, 30, 30)"], json.dumps(l40["label"]))
        check("toestel op donker, geen eigen keuze: de app is donker (geen data-theme)",
              page.evaluate("document.documentElement.dataset.theme") is None, "")
        # De profielkleur per persoon bestaat niet meer (Ronald, 26-09-2026): geen
        # enkele weergave leest nog profile_color. Schrijven bij aanmelden blijft.
        leest = [f for f in JS_FILES if re.search(r"\.profile_color|profile_color[,)]", open(os.path.join(ROOT, f)).read())]
        check("geen JS-bestand leest nog profile_color", not leest, ", ".join(leest))

        print("\nBlok 41 — licht of donker kiezen (TT-341 stap 3)")
        # Besluit Ronald, 26-09-2026 ("a"): zonder eigen keuze volgt de app het
        # toestel. De keuze in Instellingen staat op het toestel (localStorage).
        html41 = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        check("het blok voor licht of donker staat vóór styles.css (geen flits bij laden)",
              0 < html41.find("pasLichtDonkerToe();") < html41.find('href="styles.css'), "")
        def open41(schema, keuze=None):
            c = browser.new_context(viewport={"width": 390, "height": 844}, color_scheme=schema)
            if keuze:
                c.add_init_script(f"try {{ localStorage.setItem('tt_licht_donker', '{keuze}'); }} catch (e) {{}}")
            pg = c.new_page()
            fouten = []
            pg.on("pageerror", lambda e: fouten.append(str(e)))
            pg.route("**/supabase-js@2/**", lambda r: r.fulfill(
                status=200, content_type="application/javascript", body=stub_js))
            for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**",
                        "**/api.pdok.nl/**", "**/itunes.apple.com/**"):
                pg.route(pat, lambda r: r.abort())
            pg.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load")
            pg.wait_for_timeout(300)
            return c, pg, fouten
        stand41 = """() => ({ thema: document.documentElement.dataset.theme || 'donker',
            balk: document.querySelector('meta[name=theme-color]').content,
            bg: getComputedStyle(document.body).backgroundColor,
            gekozen: document.getElementById('themaKeuze').value,
            tegel: document.querySelector('#themaTegel .tile-sub').textContent,
            opslag: localStorage.getItem('tt_licht_donker') })"""
        def kies41(pg, stand):
            pg.click("#themaTegel"); pg.wait_for_timeout(300)
            pg.click(f"#themaMenu .choice-option[data-waarde={stand}]"); pg.wait_for_timeout(350)
        c41, p41, f41 = open41("light")
        s = p41.evaluate(stand41)
        check("toestel op licht, geen keuze: de app is licht",
              s["thema"] == "licht" and s["bg"] == "rgb(246, 243, 236)", json.dumps(s))
        check("en de balk van het toestel is crème (theme-color #F6F3EC)", s["balk"] == "#F6F3EC", s["balk"])
        check("de tegel Thema toont 'Zoals mijn browser' (TT-440)",
              s["gekozen"] == "toestel" and s["tegel"].startswith("Zoals mijn browser"), json.dumps(s))
        p41.evaluate("window.showView('instellingen')")
        p41.wait_for_timeout(150)
        # Besluit Ronald, 26-09-2026: de tegel is even groot als de andere, en een
        # tik opent een klein menu waarin je kiest.
        hoogtes = p41.evaluate("[...document.querySelectorAll('#view-instellingen .tile')].map(t => Math.round(t.getBoundingClientRect().height)).filter(h => h > 0)")
        check("de tegel Thema is even hoog als de andere tegels", len(set(hoogtes)) == 1, json.dumps(hoogtes))
        p41.click("#themaTegel"); p41.wait_for_timeout(300)
        menu41 = p41.evaluate("""() => { const m = document.getElementById('themaMenu');
            return { open: m.classList.contains('open'),
                     rijen: [...m.querySelectorAll('.choice-option')].map(r => [r.dataset.waarde, Math.round(r.getBoundingClientRect().height), r.getAttribute('aria-selected')]),
                     laag: !!document.querySelector('.menu-laag') }; }""")
        check("een tik op de tegel opent het keuzemenu met drie regels van 44px, de keuze van nu gemarkeerd",
              menu41["open"] and [r[0] for r in menu41["rijen"]] == ["toestel", "licht", "donker"]
              and all(r[1] >= 44 for r in menu41["rijen"]) and menu41["rijen"][0][2] == "true" and menu41["laag"],
              json.dumps(menu41))
        p41.click("#themaMenu .choice-option[data-waarde=donker]"); p41.wait_for_timeout(350)
        s = p41.evaluate(stand41)
        check("kiezen voor Donker werkt meteen en sluit het menu, ook op een toestel op licht",
              s["thema"] == "donker" and s["balk"] == "#0d0d0d" and s["gekozen"] == "donker"
              and s["tegel"].startswith("Donker")
              and not p41.evaluate("document.getElementById('themaMenu').classList.contains('open')"), json.dumps(s))
        check("de keuze staat op het toestel", s["opslag"] == "donker", str(s["opslag"]))
        p41.reload(wait_until="load"); p41.wait_for_timeout(300)
        s = p41.evaluate(stand41)
        check("na opnieuw laden blijft Donker staan", s["thema"] == "donker" and s["gekozen"] == "donker", json.dumps(s))
        p41.evaluate("window.showView('instellingen')"); p41.wait_for_timeout(150)
        kies41(p41, "toestel")
        p41.emulate_media(color_scheme="dark"); p41.wait_for_timeout(100)
        d = p41.evaluate(stand41)
        p41.emulate_media(color_scheme="light"); p41.wait_for_timeout(100)
        l = p41.evaluate(stand41)
        check("op 'Zoals mijn browser' wisselt de app mee als de melding van de browser wisselt",
              d["thema"] == "donker" and l["thema"] == "licht", json.dumps([d["thema"], l["thema"]]))
        check("geen paginafouten (toestel op licht)", not f41, "; ".join(f41)[:300])
        c41.close()
        c41, p41, f41 = open41("dark")
        s = p41.evaluate(stand41)
        check("toestel op donker, geen keuze: de app is donker",
              s["thema"] == "donker" and s["balk"] == "#0d0d0d" and s["bg"] == "rgb(13, 13, 13)", json.dumps(s))
        c41.close()
        c41, p41, f41 = open41("dark", "licht")
        s = p41.evaluate(stand41)
        check("eigen keuze Licht gaat voor het toestel op donker",
              s["thema"] == "licht" and s["gekozen"] == "licht", json.dumps(s))
        check("geen paginafouten (eigen keuze)", not f41, "; ".join(f41)[:300])
        c41.close()

        print("\nBlok 42 — de link uit 'Kies een nieuw wachtwoord' (TT-344)")
        # Gemeten op talenttent.org, 26-09-2026: de herstellink logt in, en de
        # app stuurde daarna door naar Mijn Profiel. Deze opstart bootst
        # supabase-js na: het #-deel verdwijnt vóór getSession() antwoordt, de
        # melding PASSWORD_RECOVERY komt pas daarna (setTimeout 0), en de
        # database antwoordt trager dan die melding — zoals op de echte site.
        def herstel_opstart(zonder_gebruikersnaam):
            body = stub_js + """
window.TT_STUB.session = { user: { id: 'u1', email: 'test@talenttent.org' } };
(function () {
  const maak = window.supabase.createClient;
  window.supabase.createClient = function () {
    const c = maak.apply(this, arguments);
    const vanTabel = c.from.bind(c);
    c.from = function (t) {
      const q = vanTabel(t);
      if (t === 'musicians') {
        const dan = q.then.bind(q);
        q.then = (a, b) => new Promise(r => setTimeout(r, 300)).then(() => dan(a, b));
      }
      return q;
    };
    const sessie = c.auth.getSession.bind(c.auth);
    let gemeld = false;
    c.auth.getSession = async function () {
      const r = await sessie();
      if (!gemeld) {
        gemeld = true;
        location.hash = '';
        setTimeout(() => { if (window.TT_STUB.authCallback) window.TT_STUB.authCallback('PASSWORD_RECOVERY', r.data.session); }, 0);
      }
      return r;
    };
    return c;
  };
})();
"""
            if zonder_gebruikersnaam:
                body += "\nwindow.TT_STUB.data.musicians[0].username = null;\n"
            c = browser.new_context(viewport={"width": 390, "height": 844},
                                    is_mobile=True, has_touch=True)
            fouten = []
            pg = c.new_page()
            pg.on("pageerror", lambda e: fouten.append(str(e)))
            pg.route("**/supabase-js@2/**", lambda r: r.fulfill(
                status=200, content_type="application/javascript", body=body))
            for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**",
                        "**/api.pdok.nl/**", "**/itunes.apple.com/**"):
                pg.route(pat, lambda r: r.abort())
            pg.goto(f"http://127.0.0.1:{port}/index.html#access_token=x&expires_in=3600"
                    "&refresh_token=y&token_type=bearer&type=recovery", wait_until="load")
            pg.wait_for_timeout(1500)
            uit = pg.evaluate("""() => ({
              views: [...document.querySelectorAll('.app-view.active')].map(v => v.id),
              velden: !!document.getElementById('resetPassword1') && !!document.getElementById('resetPassword2'),
              poort: document.getElementById('usernameGateModal').classList.contains('visible')
            })""")
            c.close()
            return uit, fouten

        herstel, f42 = herstel_opstart(False)
        check("TT-344: de herstellink blijft op het scherm 'Nieuw wachtwoord'",
              herstel["views"] == ["view-reset"] and herstel["velden"], json.dumps(herstel))
        herstel2, f42b = herstel_opstart(True)
        check("TT-344: ook zonder gebruikersnaam ligt er geen scherm over 'Nieuw wachtwoord'",
              herstel2["views"] == ["view-reset"] and not herstel2["poort"], json.dumps(herstel2))
        check("TT-344: geen paginafouten bij de herstellink",
              not f42 and not f42b, "; ".join(f42 + f42b)[:300])

        print("\nBlok 43 — het e-mailadres bevestigen (TT-336)")
        # Besluiten Ronald, 26-09-2026: bevestigen na "Profiel aanmaken"; tot
        # de klik geen berichten en geen band (1a); een verkeerd getypt
        # e-mailadres is aan te passen (2a). De database zelf staat niet in de
        # stub: `wacht_op_bevestiging` zetten we hier zoals de trigger dat doet.
        def bevestig_pagina(hash, extra):
            body = stub_js + """
window.TT_STUB.fnCalls = [];
window.TT_STUB.fnAntwoord = {};
(function () {
  const maak = window.supabase.createClient;
  window.supabase.createClient = function () {
    const c = maak.apply(this, arguments);
    c.functions = { invoke: async (naam, o) => {
      window.TT_STUB.fnCalls.push({ naam, body: o && o.body });
      const a = window.TT_STUB.fnAntwoord[o && o.body && o.body.actie];
      return { data: a === undefined ? { ok: true, email: 'sanne@gmail.com' } : a, error: null };
    } };
    return c;
  };
})();
""" + extra
            c = browser.new_context(viewport={"width": 390, "height": 844},
                                    is_mobile=True, has_touch=True)
            fouten = []
            pg = c.new_page()
            pg.on("pageerror", lambda e: fouten.append(str(e)))
            pg.route("**/supabase-js@2/**", lambda r: r.fulfill(
                status=200, content_type="application/javascript", body=body))
            for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**",
                        "**/api.pdok.nl/**", "**/itunes.apple.com/**"):
                pg.route(pat, lambda r: r.abort())
            pg.goto(f"http://127.0.0.1:{port}/index.html{hash}", wait_until="load")
            pg.wait_for_timeout(800)
            return c, pg, fouten

        # Mijn Profiel leest de koppelingen mee; de stub kent geen ingebedde select.
        INGELOGD = ("\nwindow.TT_STUB.session = { user: { id: 'u1', email: 'sanne@gmial.com' } };\n"
                    "Object.assign(window.TT_STUB.data.musicians[0], { musician_instruments: [], musician_genres: [],"
                    " musician_songs: [], musician_media: [] });\n")
        WACHT = "\nObject.assign(window.TT_STUB.data.musicians[0], { profile_complete: false, wacht_op_bevestiging: true, email_bevestigd_op: null });\n"
        ONAF = "\nObject.assign(window.TT_STUB.data.musicians[0], { profile_complete: false, wacht_op_bevestiging: false, email_bevestigd_op: null });\n"
        alle_fouten = []

        # 1. "Profiel aanmaken" bij 16+: wacht → mail aanvragen, Mijn Profiel met het blok.
        c, pg, f = bevestig_pagina("", INGELOGD + ONAF)
        uit = pg.evaluate("""async () => {
          const S = window.TT_STUB;
          localStorage.setItem('tt_onboarding_v1', JSON.stringify({ userId: 'u1', mid: 'm1', step: 5 }));
          // Wat de trigger in de database doet: profile_complete naar waar wordt wachten.
          const maak = db.from.bind(db);
          db.from = (t) => { const q = maak(t); if (t === 'musicians') { const u = q.update.bind(q);
            q.update = (v) => { if (v && v.profile_complete === true) { v = Object.assign({}, v, { profile_complete: false, wacht_op_bevestiging: true }); } return u(v); }; } return q; };
          state.onboarding = true; editingMusicianId = 'm1'; pendingMessageRecipient = { id: 'm2', displayName: 'Dylan' };
          await saveEditedProfile();
          await new Promise(r => setTimeout(r, 600));
          const blok = document.getElementById('emailBevestigBanner');
          return {
            acties: S.fnCalls.map(x => x.naam + ':' + x.body.actie),
            voortgang: localStorage.getItem('tt_onboarding_v1'),
            views: [...document.querySelectorAll('.app-view.active')].map(v => v.id),
            blok: blok ? blok.textContent.replace(/\\s+/g, ' ') : '',
            overlay: document.getElementById('saveOverlay').classList.contains('visible'),
            pending: pendingMessageRecipient
          };
        }""")
        check("TT-336: 'Profiel aanmaken' bij 16+ vraagt de mail aan",
              uit["acties"] == ["email-bevestigen:start"], json.dumps(uit))
        check("TT-336: de bewaarde voortgang is gewist",
              uit["voortgang"] is None, json.dumps(uit))
        check("TT-336: daarna Mijn Profiel met 'Nog één stap' en het e-mailadres",
              uit["views"] == ["view-myprofile"] and "Nog één stap" in uit["blok"]
              and "sanne@gmial.com" in uit["blok"] and not uit["overlay"], json.dumps(uit))
        check("TT-336: geen berichtvenster achteraf (TT-32)", uit["pending"] is None, json.dumps(uit))

        # Het blok: e-mailadres aanpassen.
        uit = pg.evaluate("""async () => {
          const S = window.TT_STUB;
          bevestigEmailadresTonen(true);
          const vak = document.getElementById('bevestigEmailadresVak');
          const zichtbaar = getComputedStyle(vak).display !== 'none';
          document.getElementById('bevestigNieuwEmailadres').value = 'sanne@gmial';
          await bevestigEmailadresOpslaan();
          const foutGetoond = !!vak.querySelector('.field-error, .error-msg, [class*="fout"], [class*="error"]');
          const voor = S.fnCalls.length;
          document.getElementById('bevestigNieuwEmailadres').value = 'sanne@gmail.com';
          S.fnAntwoord['e-mailadres'] = { ok: true, email: 'sanne@gmail.com' };
          await bevestigEmailadresOpslaan();
          await new Promise(r => setTimeout(r, 300));
          return { zichtbaar, foutGetoond, geenAanroepBijFout: voor === 1,
                   laatste: S.fnCalls[S.fnCalls.length - 1].body,
                   blok: document.getElementById('emailBevestigBanner').textContent.replace(/\\s+/g, ' ') };
        }""")
        check("TT-336: 'E-mailadres klopt niet?' opent het veld",
              uit["zichtbaar"], json.dumps(uit))
        check("TT-336: een ongeldig e-mailadres geeft een veldfout, geen aanroep",
              uit["foutGetoond"] and uit["geenAanroepBijFout"], json.dumps(uit))
        check("TT-336: een geldig e-mailadres gaat naar de functie en staat daarna in het blok",
              uit["laatste"] == {"actie": "e-mailadres", "email": "sanne@gmail.com"}
              and "sanne@gmail.com" in uit["blok"], json.dumps(uit))
        c.close(); alle_fouten += f

        # 2. Zonder wachten (13 t/m 15, of de database nog niet bijgewerkt):
        #    "Profiel aangemaakt!", niet meer "Profiel bijgewerkt!".
        c, pg, f = bevestig_pagina("", INGELOGD + ONAF)
        uit = pg.evaluate("""async () => {
          localStorage.setItem('tt_onboarding_v1', JSON.stringify({ userId: 'u1', mid: 'm1', step: 5 }));
          state.onboarding = true; editingMusicianId = 'm1';
          await saveEditedProfile();
          const nieuw = document.getElementById('saveTitle').textContent;
          const voortgang = localStorage.getItem('tt_onboarding_v1');
          await new Promise(r => setTimeout(r, 2300));
          editingMusicianId = 'm1';
          await saveEditedProfile();
          return { nieuw, voortgang, bewerkt: document.getElementById('saveTitle').textContent,
                   acties: window.TT_STUB.fnCalls.length };
        }""")
        check("TT-336: een nieuwe registratie eindigt op 'Profiel aangemaakt!' en wist de voortgang",
              uit["nieuw"] == "Profiel aangemaakt!" and uit["voortgang"] is None and uit["acties"] == 0,
              json.dumps(uit))
        check("TT-336: bewerken blijft 'Profiel bijgewerkt!'",
              uit["bewerkt"] == "Profiel bijgewerkt!", json.dumps(uit))
        c.close(); alle_fouten += f

        # 3. Geen berichten en geen band zolang het profiel wacht (1a).
        c, pg, f = bevestig_pagina("", INGELOGD + WACHT)
        uit = pg.evaluate("""async () => {
          const S = window.TT_STUB;
          const toasts = [];
          const oud = window.showToast; window.showToast = (t) => { toasts.push(t); oud(t); };
          const ok = await insertMessage('m2', 'Hoi!');
          const berichten = S.data.messages.length;
          showView('bands');
          await new Promise(r => setTimeout(r, 200));
          await showCreateBandForm();
          const form = document.getElementById('createBandForm').style.display;
          return { ok, berichten, form, toasts };
        }""")
        check("TT-336: een wachtend profiel stuurt geen bericht",
              uit["ok"] is False and uit["berichten"] == 0
              and any("Bevestig eerst je e-mailadres" in t for t in uit["toasts"]), json.dumps(uit))
        check("TT-336: een wachtend profiel opent geen bandformulier",
              uit["form"] in ("", "none") and any("een band oprichten" in t for t in uit["toasts"]),
              json.dumps(uit))
        c.close(); alle_fouten += f

        c, pg, f = bevestig_pagina("", INGELOGD + ONAF)
        uit = pg.evaluate("""async () => {
          const toasts = [];
          const oud = window.showToast; window.showToast = (t) => { toasts.push(t); oud(t); };
          const ok = await insertMessage('m2', 'Hoi!');
          return { ok, toasts };
        }""")
        check("TT-336: halverwege de wizard ook geen bericht",
              uit["ok"] is False and any("Maak eerst je profiel af" in t for t in uit["toasts"]),
              json.dumps(uit))
        c.close(); alle_fouten += f

        c, pg, f = bevestig_pagina("", INGELOGD)
        uit = pg.evaluate("""async () => ({ ok: await insertMessage('m2', 'Hoi!'),
                                            berichten: window.TT_STUB.data.messages.length })""")
        check("TT-336: een profiel dat online staat, stuurt gewoon berichten",
              uit["ok"] is True and uit["berichten"] == 1, json.dumps(uit))
        c.close(); alle_fouten += f

        # 4. De knop in de mail: #bevestig/<code>.
        def via_link(extra, antwoord):
            c, pg, f = bevestig_pagina("#bevestig/abc123",
                extra + "\nwindow.TT_STUB.fnAntwoord.bevestig = " + json.dumps(antwoord) + ";\n")
            uit = pg.evaluate("""() => ({
              views: [...document.querySelectorAll('.app-view.active')].map(v => v.id),
              hash: location.hash,
              tekst: (document.getElementById('toestemmingInhoud') || {}).textContent || '',
              knop: [...document.querySelectorAll('#toestemmingInhoud button')].map(b => b.textContent),
              acties: window.TT_STUB.fnCalls.map(x => x.body)
            })""")
            c.close()
            return uit, f

        uit, f = via_link("", {"stand": "bevestigd", "musician_id": "m1"})
        alle_fouten += f
        check("TT-336: de link zonder inlog: 'Je e-mailadres is bevestigd' met de knop Inloggen",
              uit["views"] == ["view-toestemming"] and "Je e-mailadres is bevestigd" in uit["tekst"]
              and uit["knop"] == ["Inloggen"] and uit["acties"] == [{"actie": "bevestig", "code": "abc123"}]
              and uit["hash"] == "#bevestig/abc123", json.dumps(uit))
        uit, f = via_link(INGELOGD, {"stand": "bevestigd", "musician_id": "m1"})
        alle_fouten += f
        check("TT-336: de link, ingelogd met hetzelfde account: meteen Mijn Profiel",
              uit["views"] == ["view-myprofile"], json.dumps(uit))
        uit, f = via_link("", {"stand": "oud"})
        alle_fouten += f
        check("TT-336: een link naar een aangepast e-mailadres zegt dat hij niet meer werkt",
              "werkt niet meer" in uit["tekst"] and not uit["knop"], json.dumps(uit))
        uit, f = via_link("", {"stand": "onbekend"})
        alle_fouten += f
        check("TT-336: een onbekende link zegt dat hij niet werkt",
              "Deze link werkt niet" in uit["tekst"], json.dumps(uit))

        # 5. Woordkeus (Ronald, 26-09-2026): "e-mailadres", nooit los "adres".
        bron = open(os.path.join(ROOT, "wizard.js"), encoding="utf-8").read()
        stuk = bron[bron.index("// ─── TT-336"):bron.index("// TT-168-overgang (02-09-2026): saveEditedProfileHere()")]
        teksten = re.findall(r"'[^'\n]*'|`[^`]*`", stuk)
        los = [t for t in teksten if re.search(r"(?<![-\w])adres", t, re.I)]
        check("TT-336: de teksten zeggen 'e-mailadres', nergens los 'adres'", not los, str(los)[:300])
        check("TT-336: geen paginafouten in blok 43", not alle_fouten, "; ".join(alle_fouten)[:300])

        print("\nBlok 44 — na uitloggen is de wizard leeg (TT-352)")
        # Ronald, 27-09-2026: "als ik op nieuw profiel aanmaken klik dan kom ik
        # terug in het profiel van uke." nextStep() leest de velden, niet state.
        # Bleven e-mailadres en wachtwoord staan, dan logde "Verder" de volgende
        # persoon in op het account van de vorige.
        c, pg, f = bevestig_pagina("", "")
        uit = pg.evaluate("""async () => {
          showView('register');
          const zet = (id, w) => { document.getElementById(id).value = w; };
          zet('fname', 'Uke'); zet('lname', 'Proef'); zet('birth_date', '01-01-2000');
          zet('zip', '2497AB'); zet('city', 'Den Haag'); zet('bio', 'Ik speel ukelele.');
          zet('username', 'uke'); zet('regEmail', 'uke@proton.me'); zet('regPassword', 'geheim123');
          zet('artistSearch', 'Queen'); zet('trackSearch', 'Bohemian');
          document.getElementById('consentCheckbox').checked = true;
          Object.assign(state, { fname: 'Uke', regEmail: 'uke@proton.me', regPassword: 'geheim123',
            instruments: ['Ukelele'], genres: ['Pop'], goal: 'band',
            songs: [{ title: 'Bohemian Rhapsody', artist: 'Queen', level: 2 }],
            mediaLinks: [{ url: 'https://youtu.be/x' }] });
          populateWizardFieldsFromState();
          setFieldError(document.getElementById('zip'), 'Proef');
          goTo(2);
          onUserLoggedOut();
          showView('register');
          await new Promise(r => setTimeout(r, 200));
          const v = document.getElementById('view-register');
          const gevuld = [...v.querySelectorAll('input, textarea')]
            .filter(el => el.type === 'checkbox' ? el.checked : el.value !== '')
            .map(el => el.id || el.type);
          const panelen = [...v.querySelectorAll('.panel')];
          return {
            gevuld,
            stateGevuld: ['fname', 'regEmail', 'regPassword', 'goal'].filter(k => state[k]),
            lijsten: ['instruments', 'genres', 'songs', 'mediaLinks', 'mediaFiles'].filter(k => state[k].length),
            stap: panelen.findIndex(p => p.classList.contains('active')),
            veldfouten: v.querySelectorAll('.field-error').length,
            songs: document.getElementById('songsList').children.length,
            instrumentBadges: document.getElementById('instrumentBadgeRow').children.length,
            knop: document.getElementById('submitProfileBtn').disabled
          };
        }""")
        check("TT-352: na uitloggen staat er niets meer in de velden van de wizard",
              uit["gevuld"] == [], json.dumps(uit))
        check("TT-352: na uitloggen is state leeg",
              uit["stateGevuld"] == [] and uit["lijsten"] == [], json.dumps(uit))
        check("TT-352: na uitloggen begint de wizard weer bij stap 1, zonder veldfouten",
              uit["stap"] == 0 and uit["veldfouten"] == 0, json.dumps(uit))
        check("TT-352: na uitloggen geen nummers of instrumenten van de vorige, vinkje uit",
              uit["songs"] == 0 and uit["instrumentBadges"] == 0 and uit["knop"] is True,
              json.dumps(uit))
        check("TT-352: geen paginafouten in blok 44", not f, "; ".join(f)[:300])
        c.close()
        # Eén bron voor een lege wizard: state staat niet meer los uitgeschreven
        # in core.js. Die kopie liep al achter (ouderRoute ontbrak).
        js = "".join(open(os.path.join(ROOT, n), encoding="utf-8").read()
                     for n in ("core.js", "wizard.js"))
        check("TT-352: een lege wizard staat op één plek in de code",
              js.count("regEmail: '', regPassword: ''") == 1,
              str(js.count("regEmail: '', regPassword: ''")))

        print("\nBlok 45 — wachtwoordvelden: Toon, autocomplete, oud wachtwoord (TT-353/354/355)")
        # Ronald, 27-09-2026 (TT-344, laag 2): zijn oude wachtwoord gaf "Er ging
        # iets mis"; "Nieuw wachtwoord" had geen knop Toon; de browser vulde een
        # bewaard wachtwoord in bij "Wachtwoord herhalen". Supabase antwoordt
        # 422, code same_password — gemeten in de console op talenttent.org.
        html45 = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        wwvelden = re.findall(r'<input[^>]*type="password"[^>]*>', html45)
        zonder_toon, zonder_ac = [], []
        for veld in wwvelden:
            vid = re.search(r'id="([^"]+)"', veld).group(1)
            if not re.search(r"togglePassword\('" + re.escape(vid) + r"', this\)", html45):
                zonder_toon.append(vid)
            if not re.search(r'autocomplete="(new|current)-password"', veld):
                zonder_ac.append(vid)
        check("TT-354: elk wachtwoordveld heeft een knop Toon", wwvelden and not zonder_toon,
              str(zonder_toon))
        check("TT-355: elk wachtwoordveld zegt de browser of het nieuw of huidig is",
              wwvelden and not zonder_ac, str(zonder_ac))
        check("TT-355: de twee velden van 'Nieuw wachtwoord' zijn new-password",
              all(re.search(r'id="' + i + r'"[^>]*autocomplete="new-password"', html45)
                  for i in ("resetPassword1", "resetPassword2")), "")

        c, pg, f = bevestig_pagina("", INGELOGD)
        uit = pg.evaluate("""async () => {
          const fout = (el) => { const p = el.closest('.field').querySelector('.field-msg');
            return p ? p.textContent : null; };
          const toast = () => document.getElementById('appToast').classList.contains('visible');
          const wwCalls = () => window.TT_STUB.calls
            .filter(c => c.name === 'updateUser' && c.attrs && c.attrs.password).length;
          const OUD = { code: 'same_password', status: 422,
                        message: 'New password should be different from the old password.' };
          const r = {};

          showView('reset');
          const r1 = document.getElementById('resetPassword1');
          const r2 = document.getElementById('resetPassword2');
          const knop = r1.closest('.password-wrap')?.querySelector('.password-toggle');
          if (knop) { knop.click(); r.toonType = r1.type; r.toonTekst = knop.textContent;
                      knop.click(); r.terugType = r1.type; }
          window.TT_STUB.updateUserError = OUD;
          r1.value = 'oudgeheim1'; r2.value = 'oudgeheim1';
          await saveNewPassword();
          r.reset = fout(r1); r.resetToast = toast(); r.resetRij2 = fout(r2);
          window.TT_STUB.updateUserError = null;
          document.getElementById('appToast').classList.remove('visible');

          openInloggegevens();
          const h = document.getElementById('igHuidigWachtwoord');
          const p1 = document.getElementById('igNieuwWachtwoord1');
          const p2 = document.getElementById('igNieuwWachtwoord2');
          const voor = wwCalls();
          h.value = 'zelfde123'; p1.value = 'zelfde123'; p2.value = 'zelfde123';
          await wijzigWachtwoord();
          r.igGelijk = fout(p1); r.igGelijkCalls = wwCalls() - voor;

          window.TT_STUB.updateUserError = OUD;
          h.value = 'anders123'; p1.value = 'nieuwgeheim1'; p2.value = 'nieuwgeheim1';
          await wijzigWachtwoord();
          r.igServer = fout(p1); r.igToast = toast();
          window.TT_STUB.updateUserError = null;
          r.vertaling = friendlyErrorMessage(OUD);
          return r;
        }""")
        check("TT-354: Toon maakt 'Nieuw wachtwoord' leesbaar en weer verborgen",
              uit.get("toonType") == "text" and uit.get("toonTekst") == "Verberg"
              and uit.get("terugType") == "password", json.dumps(uit))
        check("TT-353: het oude wachtwoord kiezen geeft een melding bij 'Nieuw wachtwoord', geen toast",
              uit["reset"] and "ander wachtwoord" in uit["reset"] and not uit["resetToast"]
              and not uit["resetRij2"], json.dumps(uit))
        check("TT-353: in Instellingen houdt nieuw = huidig de wijziging tegen, bij het nieuwe veld",
              uit["igGelijk"] and "ander wachtwoord" in uit["igGelijk"] and uit["igGelijkCalls"] == 0,
              json.dumps(uit))
        check("TT-353: weigert Supabase het oude wachtwoord in Instellingen, dan ook bij het veld",
              uit["igServer"] and "ander wachtwoord" in uit["igServer"] and not uit["igToast"],
              json.dumps(uit))
        check("TT-353: friendlyErrorMessage zegt nooit meer 'Er ging iets mis' bij same_password",
              "ander wachtwoord" in uit["vertaling"], uit["vertaling"])
        check("TT-353/354/355: geen paginafouten in blok 45", not f, "; ".join(f)[:300])
        c.close()

        print("\nBlok 46 — bevindingen 27-09-2026: goud in donker, knoppen, meldingen, ouderroute")
        # Besluiten Ronald, 27-09-2026: (a) de gele accenten terug in donker;
        # (b) de tweede knop een grijze rand die 3:1 haalt, voor de hele app;
        # (c) wachtscherm en "Nog één stap" binnen de standaard.
        # 1. Statisch: elke .btn heeft precies één soort, en geen knop krijgt
        #    zijn uitgeschakelde stand als inline stijl.
        zonder_soort = []
        for f in ["index.html"] + sorted(glob.glob(os.path.join(ROOT, "*.js"))):
            f = os.path.basename(f)
            if f in ("profiel-gedeeld.js",):
                continue
            src = open(os.path.join(ROOT, f), encoding="utf-8").read()
            for m in re.finditer(r'class=\\?["\']([^"\']*)\\?["\']', src):
                cl = m.group(1).split()
                if "btn" in cl and not any(k in cl for k in ("btn-primary", "btn-ghost", "btn-danger")):
                    zonder_soort.append(f"{f}:{src.count(chr(10), 0, m.start()) + 1}")
        check("elke .btn heeft een soort (hoofdknop, tweede knop of destructief)",
              not zonder_soort, ", ".join(zonder_soort))
        inline_uit = []
        for f in ("ouder.js", "wizard.js", "core.js", "index.html"):
            src = open(os.path.join(ROOT, f), encoding="utf-8").read()
            if re.search(r"(knop|btn|submitProfileBtn'\))\.style\.(opacity|cursor)", src) \
                    or 'submitProfile()" disabled style=' in src:
                inline_uit.append(f)
        check("een uitgeschakelde knop krijgt zijn vorm uit CSS, niet uit een inline stijl",
              not inline_uit, ", ".join(inline_uit))
        melding_inline = [f for f in ("wizard.js", "bands.js")
                          if "border-left-width:4px" in open(os.path.join(ROOT, f), encoding="utf-8").read()]
        check("de vier meldingen gebruiken .melding, geen eigen inline opmaak",
              not melding_inline, ", ".join(melding_inline))

        # 2. Kleuren in beide thema's.
        c, pg, f = bevestig_pagina("", "")
        kl = pg.evaluate("""() => {
          const meet = (thema) => {
            if (thema) document.documentElement.dataset.theme = thema; else delete document.documentElement.dataset.theme;
            const plek = document.createElement('div'); document.getElementById('appRoot').appendChild(plek);
            plek.innerHTML = '<button class="btn btn-ghost">A</button><button class="btn btn-primary" disabled>B</button>'
              + '<div class="melding"><p class="melding-kop">K</p><p class="melding-tekst">T</p></div>'
              + '<span class="band-status-badge band-status-zoekend">Zoekend</span>';
            const [g, pr, m, st] = plek.children; const cs = x => getComputedStyle(x);
            const uit = { accent: cs(document.documentElement).getPropertyValue('--accent').trim(),
              ghost: cs(g).borderTopColor, uitgeschakeld: [cs(pr).opacity, cs(pr).cursor],
              melding: [cs(m).borderTopColor, cs(m).borderLeftWidth, cs(m).backgroundColor],
              meldingTekst: [cs(m.children[0]).fontSize, cs(m.children[1]).fontSize, cs(m.children[1]).color],
              status: cs(st).color, tekst: cs(document.body).color };
            plek.remove(); return uit; };
          const d = meet(null), l = meet('licht'); delete document.documentElement.dataset.theme; return { d, l }; }""")
        check("donker: --accent is weer goud; licht blijft zwart",
              kl["d"]["accent"] == "#f5c518" and kl["l"]["accent"].lower() == "#1e1e1e", json.dumps(kl))
        check("tweede knop: rand #888 in donker, #8A8782 in licht (3:1 of meer)",
              kl["d"]["ghost"] == "rgb(136, 136, 136)" and kl["l"]["ghost"] == "rgb(138, 135, 130)", json.dumps(kl))
        check("een uitgeschakelde knop is half zichtbaar zonder handje",
              kl["d"]["uitgeschakeld"] == ["0.5", "not-allowed"], json.dumps(kl["d"]["uitgeschakeld"]))
        check("melding: rand in --accent, links 4px, vlak --surface2, kop 16px en tekst 14px in de tekstkleur",
              kl["d"]["melding"] == ["rgb(245, 197, 24)", "4px", "rgb(30, 30, 30)"]
              and kl["d"]["meldingTekst"] == ["16px", "14px", "rgb(240, 240, 240)"], json.dumps(kl["d"]))
        check("een status-tag blijft in de tekstkleur, ook 'Zoekend'",
              kl["d"]["status"] == kl["d"]["tekst"] and kl["l"]["status"] == kl["l"]["tekst"], json.dumps(kl))
        c.close()

        # 3. Het wachtscherm van de ouderaanvraag.
        c, pg, f = bevestig_pagina("", "\nwindow.TT_STUB.fnAntwoord = { stand: { stand: 'open' } };\n")
        w = pg.evaluate("""async () => {
          localStorage.setItem('tt_ouder_v1', JSON.stringify({ ouderEmail: 'ouder@mail.nl', aanvraagId: 'a1', verstuurd: 1, laatstVerstuurd: Date.now() - 60000 }));
          showView('register'); ouderWachtTonen(); await new Promise(r => setTimeout(r, 300));
          const acties = document.getElementById('ouderWachtActies');
          const r = { knoppen: [...acties.querySelectorAll('button')].map(b => b.className),
            volgorde: [...acties.children].map(e => e.id || e.tagName),
            regel: document.getElementById('ouderHerstuurRegel').textContent,
            melding: !!document.querySelector('#ouderWacht .melding'),
            adres: document.getElementById('ouderWachtAdres').textContent };
          ouderVerlopenTonen();
          const zichtbaar = id => { const e = document.getElementById(id); return e ? getComputedStyle(e).display !== 'none' : null; };
          r.verlopen = { melding: zichtbaar('ouderWachtMelding'), vraag: zichtbaar('ouderWachtVraag'),
            knoppen: [...document.querySelectorAll('#ouderWachtActies button')].map(b => b.className) };
          ouderWachtTonen(); await new Promise(r => setTimeout(r, 200));
          r.hersteld = { kop: document.getElementById('ouderWachtKop').textContent, melding: zichtbaar('ouderWachtMelding'),
            opnieuw: !!document.getElementById('ouderOpnieuwKnop') };
          clearInterval(ouderStandTimer);
          return r; }""")
        check("wachtscherm: twee tweede knoppen, de wachttijd direct onder 'Mail opnieuw sturen'",
              w["knoppen"] == ["btn btn-ghost", "btn btn-ghost"]
              and w["volgorde"] == ["ouderOpnieuwKnop", "ouderHerstuurRegel", "BUTTON"]
              and w["regel"].startswith("Opnieuw sturen kan over"), json.dumps(w))
        check("wachtscherm: de losse regels zijn één melding", w["melding"] and w["adres"] == "ouder@mail.nl", json.dumps(w))
        check("verlopen: melding en vraag weg, 'Aanvraag opnieuw versturen' is de hoofdknop",
              not w["verlopen"]["melding"] and not w["verlopen"]["vraag"]
              and w["verlopen"]["knoppen"] == ["btn btn-primary"], json.dumps(w["verlopen"]))
        check("na een verlopen aanvraag staat het wachtscherm weer in zijn oorspronkelijke vorm",
              w["hersteld"] == {"kop": "Je aanvraag is verstuurd", "melding": True, "opnieuw": True}, json.dumps(w["hersteld"]))
        check("de gebruikersnaam-hint zegt het zoals Ronald het schreef",
              "Ben je jonger dan 16 jaar? Dan staat alleen deze naam op je profiel en moet hij anders zijn dan je voornaam."
              in pg.evaluate("document.querySelector('#username').closest('.field').textContent"))
        c.close()

        # 4. De goedkeuringspagina: hoofdknop, en "Bedankt!" staat in beeld.
        c2 = browser.new_context(viewport={"width": 1100, "height": 420}, color_scheme="light")
        pg = c2.new_page(); f4 = []; pg.on("pageerror", lambda e: f4.append(str(e)))
        pg.route("**/supabase-js@2/**", lambda r: r.fulfill(status=200, content_type="application/javascript",
            body=stub_js + "\n(function(){ const m = window.supabase.createClient; window.supabase.createClient = function(){ const c = m.apply(this, arguments); c.functions = { invoke: async () => ({ data: { ok: true }, error: null }) }; return c; }; })();\n"))
        for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**"):
            pg.route(pat, lambda r: r.abort())
        pg.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load"); pg.wait_for_timeout(500)
        pg.evaluate("() => { showView('toestemming'); toestemmingCode = 'x'; toestemmingVraagTonen({ kind_voornaam: 'Veertien' }); }")
        soorten = pg.evaluate("() => [...document.querySelectorAll('.toestemming-knoppen button')].map(b => b.className)")
        pg.check("#toestemmingVinkje")
        pg.evaluate("() => window.scrollTo(0, document.body.scrollHeight)"); pg.wait_for_timeout(150)
        pg.click("#toestemmingJaKnop"); pg.wait_for_timeout(600)
        bd = pg.evaluate("""() => { const h = document.querySelector('#toestemmingInhoud h1');
          return { tekst: h.textContent, boven: Math.round(h.getBoundingClientRect().top),
                   kop: Math.round(document.querySelector('header').getBoundingClientRect().bottom) }; }""")
        check("goedkeuringspagina: 'Toestemming geven' is de hoofdknop, 'Weigeren' de tweede knop",
              soorten == ["btn btn-primary", "btn btn-ghost"], json.dumps(soorten))
        check("na 'Toestemming geven' staat 'Bedankt!' onder de kop in beeld, niet erachter",
              bd["tekst"] == "Bedankt!" and bd["boven"] >= bd["kop"], json.dumps(bd))
        check("bevindingen 27-09-2026: geen paginafouten", not f4, "; ".join(f4)[:300])
        c2.close()

        print("\nBlok 47 — bevindingen 28-09-2026: sterren, namen, de T, terugknop, Maak setlist")
        # Bevindingen Ronald, 28-09-2026 (4, 5, 7, 8 en 9).
        c47 = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        p47 = c47.new_page(); f47 = []; p47.on("pageerror", lambda e: f47.append(str(e)))
        p47.route("**/supabase-js@2/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=stub_js))
        for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**", "**/api.pdok.nl/**", "**/itunes.apple.com/**"):
            p47.route(pat, lambda r: r.abort())
        p47.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load"); p47.wait_for_timeout(500)

        # 4. Elke gevulde ster is goud (--merk), ook in een tag en ook in licht
        #    (besluit Ronald, 29-09-2026). Op een gekozen keuzeknop de tekstkleur.
        st47 = p47.evaluate("""() => {
          const meet = (thema) => {
            if (thema) document.documentElement.dataset.theme = thema; else delete document.documentElement.dataset.theme;
            const plek = document.createElement('div'); document.getElementById('appRoot').appendChild(plek);
            plek.innerHTML = '<span class="tag-solid">Drums ' + starDisplayHTML(3) + '</span>'
              + starDisplayHTML(2)
              + '<div class="picker-badge-stars">★★</div>'
              + '<div class="level-choice-stars"><span class="filled">★</span></div>'
              + '<div class="star-picker"><span class="star filled">★</span></div>'
              + '<div class="level-choice selected"><span class="level-choice-stars"><span class="filled">★</span></span></div>';
            const c = x => getComputedStyle(x).color;
            const uit = { accent: getComputedStyle(document.body).getPropertyValue('--accent').trim(),
              tag: c(plek.querySelector('.tag-solid .star-display-filled')),
              los: c(plek.children[1].querySelector('.star-display-filled')),
              badge: c(plek.querySelector('.picker-badge-stars')),
              keuze: c(plek.querySelector('.level-choice-stars .filled')),
              kiezer: c(plek.querySelector('.star-picker .star.filled')),
              gekozen: c(plek.querySelector('.level-choice.selected .filled')),
              gekozenVlak: getComputedStyle(plek.querySelector('.level-choice.selected')).backgroundColor };
            plek.remove(); return uit; };
          const d = meet(null), l = meet('licht'); delete document.documentElement.dataset.theme; return { d, l }; }""")
        goud, zwart = "rgb(245, 197, 24)", "rgb(30, 30, 30)"
        check("donker: elke gevulde ster is goud, ook in een instrumenttag",
              all(st47["d"][k] == goud for k in ("tag", "los", "badge", "keuze", "kiezer")), json.dumps(st47["d"]))
        check("licht: elke gevulde ster is ook goud, ook in een tag",
              all(st47["l"][k] == goud for k in ("tag", "los", "badge", "keuze", "kiezer")), json.dumps(st47["l"]))
        check("licht: op een gekozen (gele) keuzeknop is de ster zwart, niet onzichtbaar",
              st47["l"]["gekozen"] == zwart and st47["l"]["gekozenVlak"] == goud, json.dumps(st47["l"]))

        # 5. Een naam in een lijst is 16px, overal gelijk.
        nm = p47.evaluate("""() => {
          const plek = document.createElement('div'); document.getElementById('appRoot').appendChild(plek);
          plek.innerHTML = '<div class="messages-conv-name">A</div><div class="result-row-name">B</div>'
            + '<div class="result-card-name">C</div><div class="geblokkeerd-naam">D</div>';
          const uit = [...plek.children].map(x => getComputedStyle(x).fontSize); plek.remove(); return uit; }""")
        check("naam in berichtenlijst, zoekresultaat (rij en kaart) en blokkadelijst: 16px",
              nm == ["16px"] * 4, json.dumps(nm))

        # 7. De T: één klasse, in het lettertype van het logo, 25% groter dan zijn vak.
        t47 = p47.evaluate("""() => {
          const plek = document.createElement('div'); document.getElementById('appRoot').appendChild(plek);
          plek.innerHTML = '<div class="result-row-avatar">' + AVATAR_T_FALLBACK + '</div>'
            + '<div class="messages-conv-avatar">' + AVATAR_T_FALLBACK + '</div>'
            + '<div class="profile-avatar-initials">' + AVATAR_T_FALLBACK + '</div>'
            + '<div class="band-avatar">' + AVATAR_T_FALLBACK + '</div>'
            + mediaAfgeschermdHTML('tegel') + mediaAfgeschermdHTML('banner');
          const r = [...plek.children].map(v => { const t = v.querySelector('span');
            return t ? [t.className, Math.round(parseFloat(getComputedStyle(t).fontSize) / parseFloat(getComputedStyle(v).fontSize) * 100),
                        getComputedStyle(t).fontFamily.includes('TT Woordmerk')] : null; });
          // TT-385 fase 4: de bandfoto kies je in de tegel Onze media, niet meer in Band aanmaken.
          const voorbeeld = ['avatarInitials', 'mhAvatarInitials'].map(id => {
            const e = document.getElementById(id); return e ? e.className : 'ontbreekt'; })
            .concat([(document.querySelector('#bmFotoPreview > span') || { className: 'ontbreekt' }).className]);
          plek.remove(); return { r, voorbeeld }; }""")
        check("elke T zonder foto is .avatar-t, in het lettertype van het logo, 125% van zijn vak",
              all(x and x[0] == "avatar-t" and x[1] == 125 and x[2] for x in t47["r"]), json.dumps(t47["r"]))
        check("de T bij het uploaden van een foto is ook .avatar-t (wizard, mediahoek, band)",
              t47["voorbeeld"] == ["avatar-t"] * 3, json.dumps(t47["voorbeeld"]))

        # 8. Op een telefoon blijft na een tik geen vlak achter de terugknop staan.
        css47 = open(os.path.join(ROOT, "styles.css"), encoding="utf-8").read()
        guard = css47.find("@media (hover: hover)")
        los_hover = [m.start() for m in re.finditer(r"\.nav-menu-btn:hover", css47)
                     if not (guard != -1 and guard < m.start() < css47.find("\n  }\n", guard))]
        check("de aanwijsstand van .nav-menu-btn staat alleen in de hover-guard (TT-182)",
              not los_hover, f"los op positie {los_hover}")
        p47.evaluate("() => showView('search')"); p47.wait_for_timeout(150)
        p47.tap("#navTerugBtn"); p47.wait_for_timeout(350)
        tb = p47.evaluate("""() => { const b = document.getElementById('navTerugBtn'); const c = getComputedStyle(b);
          return { vlak: c.backgroundColor, rand: c.borderTopColor, zichtbaar: c.visibility, view: document.querySelector('.app-view.active')?.id }; }""")
        check("na een tik op de terugknop op een hoofdtabblad: geen vlak, geen rand; je blijft op het tabblad (TT-428)",
              tb["vlak"] == "rgba(0, 0, 0, 0)" and tb["rand"] == "rgba(0, 0, 0, 0)" and tb["zichtbaar"] == "visible"
              and tb["view"] == "view-search", json.dumps(tb))

        # 9. "Zoek setlist" heet "Maak setlist": knop en paneeltitel.
        ms = p47.evaluate("""() => ({ knop: document.getElementById('setlistSoortNummersBtn').textContent.trim(),
          titel: document.querySelector('#setlistDeelNummers .filter-title').textContent.trim(),
          actie: document.querySelector('#setlistDeelNummers .btn-row .btn-primary').textContent.trim(),
          oud: document.getElementById('appRoot').innerText.includes('Zoek setlist') })""")
        check("de tweede stand van Setlist heet Maak setlist: knop, titel en de hoofdknop onderin",
              ms["knop"] == "Maak setlist" and ms["titel"] == "Maak setlist" and ms["actie"] == "Maak setlist"
              and not ms["oud"], json.dumps(ms))

        # 6. Je eigen bericht: gedempt goud met zwarte tekst (variant C, besluit Ronald 29-09-2026).
        #    En compacter: een bericht van één regel is hooguit 34px hoog, de tijd staat ernaast.
        bb = p47.evaluate("""() => {
          const meet = (thema) => {
            if (thema) document.documentElement.dataset.theme = thema; else delete document.documentElement.dataset.theme;
            const plek = document.createElement('div'); plek.style.cssText = 'display:flex;flex-direction:column;width:358px';
            document.getElementById('appRoot').appendChild(plek);
            plek.innerHTML = '<div class="messages-day-divider">Gisteren</div>'
              + '<div class="message-bubble own">Hoi<div class="message-bubble-time">19:31<span class="message-bubble-read">✓</span></div></div>'
              + '<div class="message-bubble other">Hoi<div class="message-bubble-time">07:02</div></div>'
              + '<div class="message-bubble own">' + 'Zin om zaterdag te jammen bij mij in de oefenruimte? '.repeat(3) + '<div class="message-bubble-time">19:31</div></div>';
            const [dag, eigen, ander, lang] = plek.children; const cs = x => getComputedStyle(x);
            const r = x => x.getBoundingClientRect();
            const uit = { eigen: [cs(eigen).backgroundColor, cs(eigen).color], ander: cs(ander).backgroundColor,
              anderRand: cs(ander).borderTopColor, tijdEigen: cs(eigen.querySelector('.message-bubble-time')).opacity,
              hoog: [Math.round(r(eigen).height), Math.round(r(ander).height)],
              naast: Math.abs(r(eigen.querySelector('.message-bubble-time')).bottom - r(eigen).bottom) <= 8
                     && r(eigen.querySelector('.message-bubble-time')).left > r(eigen).left + 20,
              langBinnen: r(lang.querySelector('.message-bubble-time')).right <= r(lang).right,
              dag: Math.round(r(dag).height + parseFloat(cs(dag).marginTop) + parseFloat(cs(dag).marginBottom)) };
            plek.remove(); return uit; };
          const d = meet(null), l = meet('licht'); delete document.documentElement.dataset.theme; return { d, l }; }""")
        check("donker: je eigen bericht is warm goud (#E0B52A) met zwarte tekst (TT-440)",
              bb["d"]["eigen"] == ["rgb(224, 181, 42)", "rgb(30, 30, 30)"], json.dumps(bb["d"]))
        check("licht: je eigen bericht is vol geel (#F2CE4A) met zwarte tekst (TT-440)",
              bb["l"]["eigen"] == ["rgb(242, 206, 74)", "rgb(30, 30, 30)"], json.dumps(bb["l"]))
        check("het bericht van de ander is zichtbaar tegen de ondergrond: donker #333333, licht rand #8A8782 (TT-440)",
              bb["d"]["ander"] == "rgb(51, 51, 51)" and bb["l"]["anderRand"] == "rgb(138, 135, 130)", json.dumps([bb["d"]["ander"], bb["l"]["anderRand"]]))
        check("de tijd in je eigen bericht heeft dekking 0,85 (TT-440)",
              bb["d"]["tijdEigen"] == "0.85" and bb["l"]["tijdEigen"] == "0.85", json.dumps([bb["d"]["tijdEigen"], bb["l"]["tijdEigen"]]))
        check("een bericht van één regel is hooguit 34px hoog, de tijd staat op dezelfde regel",
              max(bb["d"]["hoog"]) <= 34 and bb["d"]["naast"] and bb["d"]["langBinnen"], json.dumps(bb["d"]))
        check("een dagscheiding neemt hooguit 34px in", bb["d"]["dag"] <= 34, json.dumps(bb["d"]))
        check("bevindingen 28-09-2026: geen paginafouten", not f47, "; ".join(f47)[:300])
        c47.close()

        print("\nBlok 48 — vegen tussen de zoektabbladen volgt de vinger (TT-368)")
        # Bevinding Ronald, 28-09-2026: "dat moet lekker soepel gaan, net als
        # naar boven-beneden." Besluit Ronald, 29-09-2026: "doe wat gebruikelijk is."
        c48 = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        p48 = c48.new_page(); f48 = []; p48.on("pageerror", lambda e: f48.append(str(e)))
        p48.route("**/supabase-js@2/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=stub_js))
        for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**", "**/api.pdok.nl/**", "**/itunes.apple.com/**"):
            p48.route(pat, lambda r: r.abort())
        p48.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load"); p48.wait_for_timeout(500)
        p48.evaluate("showView('search'); setSearchMode('musician'); document.activeElement && document.activeElement.blur()")
        p48.wait_for_timeout(300)
        cdp48 = c48.new_cdp_session(p48)
        Y48 = p48.evaluate("Math.round(document.querySelector('.search-mode-tabs-outer').getBoundingClientRect().bottom + 12)")
        def raak(soort, x, y=None):
            y = Y48 if y is None else y
            pts = [] if soort in ("touchEnd", "touchCancel") else [{"x": x, "y": y}]
            cdp48.send("Input.dispatchTouchEvent", {"type": soort, "touchPoints": pts})
        def sleep(x0, x1, stappen=8, y1=None):
            raak("touchStart", x0)
            for i in range(1, stappen + 1):
                yy = None if y1 is None else round(Y48 + (y1 - Y48) * i / stappen)
                raak("touchMove", round(x0 + (x1 - x0) * i / stappen), yy)
                p48.wait_for_timeout(16)
            p48.wait_for_timeout(50)
        stand48 = """() => { const x = el => { const m = getComputedStyle(el).transform;
            return m === 'none' ? 0 : Math.round(new DOMMatrix(m).m41); };
          const p = id => document.getElementById(id);
          return { tab: currentSearchMode,
            muz: x(p('searchModeMusician')), band: x(p('searchModeBand')), set: x(p('searchModeSetlist')),
            bandZicht: getComputedStyle(p('searchModeBand')).display, muzZicht: getComputedStyle(p('searchModeMusician')).display,
            setZicht: getComputedStyle(p('searchModeSetlist')).display,
            view: p('view-search').style.position }; }"""

        # 1. Tijdens het slepen volgt het paneel de vinger, het buurtabblad schuift ernaast mee.
        # De browser meldt de eerste millimeters niet (de "slop"); vanaf de eerste
        # gemelde beweging volgt het paneel de vinger precies.
        sleep(300, 200)
        s1a = p48.evaluate(stand48)
        raak("touchMove", 150); p48.wait_for_timeout(50)
        s1 = p48.evaluate(stand48)
        check("tijdens het slepen schuift het paneel precies mee met de vinger",
              s1a["muz"] < -50 and s1["muz"] - s1a["muz"] == -50, json.dumps([s1a, s1]))
        check("en het buurtabblad staat er direct naast, zichtbaar",
              s1["bandZicht"] == "block" and s1["band"] == 390 + s1["muz"], json.dumps(s1))
        # 2. Stilhouden en loslaten na een kort stuk: terugveren.
        p48.wait_for_timeout(200); raak("touchEnd", 150); p48.wait_for_timeout(450)
        s2 = p48.evaluate(stand48)
        check("kort stuk, stilgehouden, losgelaten: het paneel veert terug",
              s2["tab"] == "musician" and s2["muz"] == 0 and s2["bandZicht"] == "none" and s2["view"] == "", json.dumps(s2))
        # 3. Een flink stuk (meer dan een derde): doorglijden.
        sleep(330, 110); p48.wait_for_timeout(200); raak("touchEnd", 110); p48.wait_for_timeout(450)
        s3 = p48.evaluate(stand48)
        check("meer dan een derde gesleept en losgelaten: het volgende tabblad staat er",
              s3["tab"] == "band" and s3["muzZicht"] == "none" and s3["bandZicht"] == "block"
              and s3["band"] == 0 and s3["muz"] == 0 and s3["view"] == "", json.dumps(s3))
        # 4. Een snelle, korte veeg glijdt ook door.
        # (Elke stap via CDP kost zo'n 30 ms; daarom grote stappen, zonder wachten.)
        raak("touchStart", 260)
        for x in (230, 190, 150): raak("touchMove", x)
        raak("touchEnd", 150); p48.wait_for_timeout(450)
        s4 = p48.evaluate(stand48)
        check("een snelle veeg van minder dan een derde (110px) glijdt ook door", s4["tab"] == "setlist", json.dumps(s4))
        # 5. Aan het uiteinde beweegt er niets.
        sleep(300, 150)
        s5 = p48.evaluate(stand48)
        raak("touchEnd", 150); p48.wait_for_timeout(450)
        s5b = p48.evaluate(stand48)
        check("aan het uiteinde (Setlist) beweegt niets en blijft het tabblad staan",
              s5["set"] == 0 and s5b["tab"] == "setlist" and s5b["muzZicht"] == "none", json.dumps([s5, s5b]))
        # 6. Neemt het toestel de veeg over (terugveeg van Android): terugveren.
        sleep(100, 250)
        s6a = p48.evaluate(stand48)
        raak("touchCancel", 250); p48.wait_for_timeout(450)
        s6 = p48.evaluate(stand48)
        check("veeg overgenomen door het toestel (touchcancel): het paneel veert terug",
              s6a["set"] > 100 and s6["tab"] == "setlist" and s6["set"] == 0 and s6["bandZicht"] == "none", json.dumps([s6a, s6]))
        # 7. Een verticale beweging schuift niets opzij.
        sleep(200, 205, y1=Y48 + 150)
        s7 = p48.evaluate(stand48)
        raak("touchEnd", 205, Y48 + 150); p48.wait_for_timeout(300)
        check("een verticale veeg schuift het paneel niet opzij", s7["set"] == 0 and s7["bandZicht"] == "none", json.dumps(s7))
        # 8. De oude sprong-animatie is weg (dode code, TT-368).
        oud48 = p48.evaluate("""() => typeof animeerZoekPaneel === 'undefined'
          && ![...document.styleSheets].some(sh => { try { return [...sh.cssRules].some(r => r.name === 'searchPaneVanRechts'); } catch (e) { return false; } })""")
        check("de oude sprong van 24px na het loslaten bestaat niet meer", oud48, "")
        check("vegen (TT-368): geen paginafouten", not f48, "; ".join(f48)[:300])
        c48.close()

        print("\nBlok 49 — de landingspagina, richting F (TT-61)")
        # Besluiten Ronald, 29 en 30-09-2026: "Zoek een <woord>" (zonder punt), tien woorden
        # in vaste volgorde, elke 4 seconden vanzelf de volgende, geen
        # keuzeknoppen, de knop opent altijd Zoeken, past op één scherm.
        import base64
        FOTO49 = base64.b64decode("/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAQAAkDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCnRRRXsnkn/9k=")
        WOORDEN49 = ["zangeres", "drummer", "bassist", "gitarist", "zanger", "band",
                     "toetsenist", "violist", "saxofonist", "DJ"]
        def ctx49(w, h, **kw):
            c = browser.new_context(viewport={"width": w, "height": h}, **kw)
            pg = c.new_page(); fouten = []; pg.on("pageerror", lambda e: fouten.append(str(e)))
            pg.route("**/supabase-js@2/**", lambda r: r.fulfill(status=200, content_type="application/javascript", body=stub_js))
            for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**", "**/api.pdok.nl/**", "**/itunes.apple.com/**"):
                pg.route(pat, lambda r: r.abort())
            gevraagd = []
            def foto(r):
                naam = r.request.url.rsplit("/", 1)[1]; gevraagd.append(naam)
                if naam == "zangeres.jpg": r.fulfill(status=200, content_type="image/jpeg", body=FOTO49)
                else: r.fulfill(status=400, body="")
            pg.route("**/storage/v1/object/public/landing/**", foto)
            pg.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load"); pg.wait_for_timeout(600)
            return c, pg, fouten, gevraagd

        c49, p49, f49, g49 = ctx49(390, 844)
        st49 = p49.evaluate("""() => ({
          kop: document.querySelector('#view-landing h1').textContent,
          regel: document.getElementById('landingWaarvoor').textContent,
          woorden: LANDING_WOORDEN.map(w => w.woord), tempo: LANDING_TEMPO,
          dias: document.querySelectorAll('#landingDias .landing-dia').length,
          knoppen: [...document.querySelectorAll('#view-landing button')].map(b => b.textContent.trim()),
          chips: document.querySelectorAll('#view-landing .chip, #view-landing .tag').length,
          sub: document.querySelector('.landing-sub').textContent,
          login: document.querySelector('.landing-login').textContent,
          klok: !!landingKlok })""")
        check("de kop leest \"Zoek een zangeres\", zonder punt, met \"Voor je eerste optreden.\" eronder",
              st49["kop"] == "Zoek eenzangeres" and st49["regel"] == "Voor je eerste optreden.", json.dumps(st49)[:300])
        check("tien woorden in de volgorde van Ronald, elk een eigen laag, 4 seconden per woord",
              st49["woorden"] == WOORDEN49 and st49["dias"] == 10 and st49["tempo"] == 4000, json.dumps(st49)[:300])
        check("geen keuzeknoppen: alleen \"Zoek muzikanten →\", \"Inloggen\" en \"Profiel aanmaken\"",
              st49["knoppen"] == ["Zoek muzikanten →", "Inloggen", "Profiel aanmaken"] and st49["chips"] == 0, json.dumps(st49["knoppen"]))
        check("subkop en inlogregel zoals besloten",
              st49["sub"] == "Muzikanten bij jou in de buurt." and st49["login"].startswith("Zoeken kan zonder profiel."), json.dumps(st49)[:300])
        check("\"Profiel aanmaken\" op de landingspagina opent de wizard (blokkerend voor livegang, 08-10-2026)",
              p49.evaluate("() => { const b = [...document.querySelectorAll('#view-landing button')].find(x => x.textContent.trim() === 'Profiel aanmaken'); b.click(); const id = document.querySelector('.app-view.active').id; showView('landing'); return id; }") == "view-register", "")
        check("het wisselen loopt zolang de landingspagina in beeld is", st49["klok"], "")
        # Een foto wordt pas gevraagd als hij bijna aan de beurt is; laadt hij niet, dan blijft het vlak.
        p49.wait_for_timeout(300)
        fo49 = p49.evaluate("""() => { const d = [...document.querySelectorAll('#landingDias .landing-dia')];
          return { img0: !!d[0].querySelector('img') && d[0].querySelector('img').naturalWidth > 0,
                   img1: !!d[1].querySelector('img'), gevraagd: d.filter(x => x.querySelector('img[src]')).length }; }""")
        check("bij het openen worden alleen de eerste twee foto's gevraagd",
              sorted(g49) == ["drummer.jpg", "zangeres.jpg"], json.dumps(g49))
        check("een foto die laadt staat in beeld; een woord zonder foto houdt het warme vlak",
              fo49["img0"] and not fo49["img1"], json.dumps(fo49))
        # Besluit Ronald, 30-09-2026: de foto's zijn via de landingspagina niet te openen.
        dicht49 = p49.evaluate("""() => { const f = document.querySelector('.landing-foto').getBoundingClientRect();
          const el = document.elementFromPoint(f.left + f.width / 2, f.top + f.height / 3);
          const cs = getComputedStyle(document.getElementById('landingDias'));
          return { raak: el.tagName + '.' + el.className, pe: cs.pointerEvents, callout: cs.webkitTouchCallout || '', select: cs.userSelect }; }""")
        check("een tik of rechtermuisklik op de foto raakt geen afbeelding: de foto is niet te openen of op te slaan",
              not dicht49["raak"].startswith("IMG") and dicht49["pe"] == "none" and dicht49["select"] == "none", json.dumps(dicht49))
        # De kop ligt op de foto: doorzichtig, tekens en TALENT wit, TENT geel.
        kop49 = p49.evaluate("""() => { const t = document.querySelector('.app-topbar'), cs = getComputedStyle(t);
          return { pos: cs.position, bg: cs.backgroundColor, top: Math.round(t.getBoundingClientRect().top),
            talent: getComputedStyle(document.querySelector('header .logo span')).color,
            tent: getComputedStyle(document.querySelector('header .logo')).color,
            menu: getComputedStyle(document.getElementById('navMenuBtn')).color,
            terug: getComputedStyle(document.getElementById('navTerugBtn')).color,
            terugZicht: getComputedStyle(document.getElementById('navTerugBtn')).visibility,
            foto: Math.round(document.querySelector('.landing-foto').getBoundingClientRect().top) }; }""")
        check("de kop ligt doorzichtig op de foto, de foto begint bovenaan het scherm",
              kop49["pos"] == "fixed" and kop49["bg"] == "rgba(0, 0, 0, 0)" and kop49["top"] == 0 and kop49["foto"] == 0, json.dumps(kop49))
        check("op de foto: hamburger en TALENT wit, TENT geel; geen terugknop (besluit Ronald 06-10-2026)",
              kop49["talent"] == kop49["menu"] == "rgb(255, 255, 255)"
              and kop49["tent"] == "rgb(245, 197, 24)" and kop49["terugZicht"] == "hidden", json.dumps(kop49))
        # Na 4 seconden het volgende woord, met zijn eigen regel.
        p49.wait_for_timeout(4200)
        na49 = p49.evaluate("""() => ({ woord: document.getElementById('landingWoord').textContent,
          regel: document.getElementById('landingWaarvoor').textContent,
          aan: [...document.querySelectorAll('#landingDias .landing-dia')].findIndex(d => d.classList.contains('aan')) })""")
        check("na 4 seconden: \"drummer\" met \"Voor een band die wél repeteert.\", tweede foto in beeld",
              na49 == {"woord": "drummer", "regel": "Voor een band die wél repeteert.", "aan": 1}, json.dumps(na49))
        check("de derde foto wordt gevraagd zodra de tweede in beeld komt", "bassist.jpg" in g49, json.dumps(g49))
        # De knop opent altijd Zoeken, ook als "band" in beeld staat.
        p49.evaluate("landingNaar(5)"); p49.wait_for_timeout(400)
        check("een sprong naar een woord vraagt ook de foto van dat woord zelf op, niet alleen de volgende",
              "band.jpg" in g49, json.dumps(g49))
        p49.click(".landing-knop"); p49.wait_for_timeout(400)
        weg49 = p49.evaluate("""() => ({ view: document.querySelector('.app-view.active').id, klok: !!landingKlok,
          klasse: document.getElementById('appRoot').classList.contains('landing-op-foto'),
          pos: getComputedStyle(document.querySelector('.app-topbar')).position,
          talent: getComputedStyle(document.querySelector('header .logo span')).color,
          modus: currentSearchMode })""")
        check("de knop opent Zoeken, ook bij \"band\" (besluit Ronald 30-09-2026)",
              weg49["view"] == "view-search" and weg49["modus"] == "musician", json.dumps(weg49))
        check("buiten de landingspagina: wisselen gestopt, de kop weer gewoon en in de tekstkleur",
              not weg49["klok"] and not weg49["klasse"] and weg49["pos"] == "sticky"
              and weg49["talent"] == "rgb(240, 240, 240)", json.dumps(weg49))
        p49.evaluate("showView('landing')"); p49.wait_for_timeout(300)
        check("terug op de landingspagina loopt het wisselen weer",
              p49.evaluate("!!landingKlok && document.getElementById('appRoot').classList.contains('landing-op-foto')"), "")
        # Inloggen: tikdoel 44px (TT-68) en opent het inlogscherm.
        lg49 = p49.evaluate("(() => { const r = document.querySelector('.landing-inloggen').getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()")
        p49.click(".landing-inloggen"); p49.wait_for_timeout(300)
        check("\"Inloggen\" heeft een tikdoel van 44px hoog en opent het inlogscherm",
              lg49[1] >= 44 and lg49[0] >= 44 and p49.evaluate("document.querySelector('.app-view.active').id") == "view-auth", json.dumps(lg49))
        # Een open hamburgermenu op de foto: het teken houdt de kleur van .active, anders is het wit op licht.
        p49.evaluate("showView('landing')"); p49.wait_for_timeout(200)
        p49.click("#navMenuBtn"); p49.wait_for_timeout(300)
        mn49 = p49.evaluate("(() => { const b = document.getElementById('navMenuBtn'), cs = getComputedStyle(b); return [b.classList.contains('active'), cs.color, cs.backgroundColor]; })()")
        check("een open hamburgermenu op de foto blijft zichtbaar: teken niet wit op zijn eigen vlak",
              mn49[0] and mn49[1] != "rgb(255, 255, 255)" and mn49[1] != mn49[2], json.dumps(mn49))
        p49.keyboard.press("Escape")
        check("landingspagina: geen paginafouten", not f49, "; ".join(f49)[:300])
        c49.close()

        # Past op één scherm, zonder scrollen: de drie gemeten toestellen, licht en donker.
        past49 = []
        for (w, h) in [(375, 667), (390, 844), (430, 932), (1280, 800)]:
            for thema in ("light", "dark"):
                c, pg, fo, _ = ctx49(w, h, color_scheme=thema)
                m = pg.evaluate("""() => { const r = s => document.querySelector(s).getBoundingClientRect();
                  const nav = document.getElementById('appBottomNav');
                  return { scroll: document.documentElement.scrollHeight - innerHeight,
                    knop: Math.round(r('.landing-knop').bottom), login: Math.round(r('.landing-inloggen').bottom - 12),
                    navZichtbaar: getComputedStyle(nav).display !== 'none', onderkant: innerHeight,
                    var: getComputedStyle(document.documentElement).getPropertyValue('--onderbalk-hoogte').trim(),
                    foto: Math.round(r('.landing-foto').height) }; }""")
                ok = (m["scroll"] <= 0 and m["knop"] < m["onderkant"] and m["login"] <= m["onderkant"]
                      and not m["navZichtbaar"] and m["var"] == "0px" and m["foto"] > 300 and not fo)
                if not ok: past49.append({"w": w, "h": h, "thema": thema, **m, "fouten": fo})
                c.close()
        check("past op één scherm op 375×667, 390×844, 430×932 en een laptop (1280×800), licht en donker; zonder onderbalk (besluit Ronald 06-10-2026)",
              not past49, json.dumps(past49)[:400])
        # Bij "minder beweging" wisselt er niets vanzelf.
        c, pg, fo, _ = ctx49(390, 844, reduced_motion="reduce")
        pg.wait_for_timeout(4300)
        rm49 = pg.evaluate("({ klok: !!landingKlok, woord: document.getElementById('landingWoord').textContent })")
        check("bij \"minder beweging\" blijft het eerste woord staan", rm49 == {"klok": False, "woord": "zangeres"}, json.dumps(rm49))
        c.close()
        # Een verborgen tabblad: het wisselen staat stil.
        c, pg, fo, _ = ctx49(390, 844)
        vb49 = pg.evaluate("""() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
          document.dispatchEvent(new Event('visibilitychange')); const uit = !landingKlok;
          Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
          document.dispatchEvent(new Event('visibilitychange')); return [uit, !!landingKlok]; }""")
        check("de app op de achtergrond: het wisselen stopt, en loopt weer als hij terugkomt", vb49 == [True, True], json.dumps(vb49))
        c.close()

        # ------------------------------------------------------------------
        # Blok 50 — TT-380: delen is een icoon bij de naam, op elk profiel
        # ------------------------------------------------------------------
        print("\nBlok 50 — het deelicoon bij de naam, op elk profiel (TT-380)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 375, "height": 812})
        page.evaluate("showView('about')")
        page.wait_for_timeout(100)
        d50 = page.evaluate("""async () => {
          const S = window.TT_STUB;
          const was = { hasOwnProfile, myMusicianId, share: navigator.share };
          let gedeeld = null;
          Object.defineProperty(navigator, 'share', { configurable: true, value: async d => { gedeeld = d; } });
          S.rpcResults.tt_get_musicians_public = () => [{ id: 'm2', username: 'dylan', age: 30, city: 'Den Haag',
            bio: '', goal: null, profile_color: '#f5c518', avatar_url: null, updated_at: new Date().toISOString(),
            instrument_levels: [{ instrument: 'Drums', niveau: 3 }], genres: ['Rock'], songs: [], media: [] }];
          S.rpcResults.tt_get_bands_public = () => [{ id: 'b2', name: 'Testband', city: 'Den Haag', description: '',
            status: 'zoekend', profile_color: '#3ecfff', updated_at: new Date().toISOString(), avatar_url: null,
            genres: ['Rock'], niveau: 3, members: [{ username: 'dylan', profile_color: '#f5c518' }], wanted: [] }];
          const rect = e => e ? e.getBoundingClientRect() : null;
          const meet = async (vak, sluit) => {
            const naam = vak.querySelector('.profile-name');
            const deel = vak.querySelectorAll('.deel-knop');
            const knop = deel[0];
            const menu = knop && knop.parentElement.querySelector('.profile-actions-menu-wrap .nav-menu-btn, .profiel-menu-plek .nav-menu-btn');
            const regels = vak.querySelector('.profiel-regels');
            const k = rect(knop), m = rect(menu), r = rect(regels), n = rect(naam);
            // TT-384: bij een muzikant staan de knoppen naast de foto, op het
            // midden van de onderste helft. Bij een band (nog) op de regels.
            const f = rect(vak.querySelector('.profiel-kop-rij .profile-avatar-photo, .profiel-kop-rij .profile-avatar-initials, .profiel-kop-rij .bandfoto'));
            // De inkt: de meest rechtse cirkel van het deelteken en de stippen van het menu.
            const inktR = knop ? Math.max(...[...knop.querySelectorAll('circle')].map(c => rect(c).right)) : null;
            const stipL = menu ? Math.min(...[...menu.querySelectorAll('circle')].map(c => rect(c).left)) : null;
            const breed = [...(vak.closest('.modal-box') || vak).querySelectorAll('button')]
              .filter(b => /Deel dit (band)?profiel/.test(b.textContent)).length;
            const x = sluit ? rect(sluit) : null;
            let url = null;
            if (knop) { gedeeld = null; knop.click(); await new Promise(z => setTimeout(z, 20)); url = gedeeld && gedeeld.url; }
            return { aantal: deel.length, breed,
              maat: k ? [Math.round(k.width), Math.round(k.height)] : null,
              menuMaat: m ? [Math.round(m.width), Math.round(m.height)] : null,
              overlap: (k && m) ? +(k.right - m.left).toFixed(1) : null,
              inktGat: (inktR != null && stipL != null) ? +(stipL - inktR).toFixed(1) : null,
              hoogte: (k && r) ? +(((k.top + k.bottom) - (r.top + r.bottom)) / 2).toFixed(1) : null,
              naastFoto: (k && f) ? +((k.top + k.bottom) / 2 - (f.top + f.height * 0.75)).toFixed(1) : null,
              naamVol: !!(naam && naam.clientWidth === naam.parentElement.clientWidth),
              naamRegels: (n && r) ? +(r.top - n.bottom).toFixed(1) : null,
              alleenOnderKruis: (k && !m && x) ? +(((k.left + k.right) - (x.left + x.right)) / 2).toFixed(1) : null,
              url: url ? url.replace(/^.*#/, '#') : null,
              label: knop ? knop.getAttribute('aria-label') : null };
          };
          const uit = {};
          // 1. Mijn Profiel.
          hasOwnProfile = true; myMusicianId = 'm1';
          document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
          document.getElementById('view-myprofile').classList.add('active');
          const eigen = document.getElementById('myProfileContent');
          eigen.innerHTML = buildMusicianDetailHTML({ id: 'm1', fname: 'Ronald', lname: 'W', username: 'ronald', bio: '',
            city: 'Den Haag', age: 25, musician_songs: [], musician_media: [], musician_wanted: [],
            musician_instruments: [{ instrument: 'Drums', niveau: 3 }], musician_genres: [{ genre: 'Rock' }] }, true, false);
          fitProfileName(eigen);
          uit.mijnProfiel = await meet(eigen, null);
          const ham = rect(document.getElementById('navMenuBtn'));
          const mm = rect(document.getElementById('profileMoreBtn'));
          uit.menuOnderHamburger = +(((mm.left + mm.right) - (ham.left + ham.right)) / 2).toFixed(1);
          eigen.innerHTML = '';
          showView('about');
          // 2. Het venster van een ander, met een eigen profiel: deelicoon en ⋯.
          hasOwnProfile = false; myMusicianId = 'm1';
          await openProfielScherm('m2');
          hasOwnProfile = true; zetVeiligheidMenu('profielSchermActies', 'muzikant', 'm2', 'Dylan'); hasOwnProfile = false;
          const mv = document.getElementById('profielSchermContent');
          uit.ander = await meet(mv, document.getElementById('navMenuBtn'));
          // 3. Hetzelfde scherm, bezoeker zonder profiel: alleen het deelicoon.
          await openProfielScherm('m2');
          uit.anderZonderProfiel = await meet(mv, document.getElementById('navMenuBtn'));
          // 4. Je eigen profiel in het venster: alleen het deelicoon.
          myMusicianId = 'm2';
          await openProfielScherm('m2');
          uit.eigenInVenster = await meet(mv, document.getElementById('navMenuBtn'));
          uit.eigenVoet = document.getElementById('profielSchermVoet').innerHTML.trim();
          myMusicianId = 'm1';
          // 5. Het bandvenster, met menu.
          await openBandScherm('b2');
          hasOwnProfile = true; zetVeiligheidMenu('profielSchermActies', 'band', 'b2', 'Testband'); hasOwnProfile = false;
          uit.band = await meet(document.getElementById('profielSchermContent'), document.getElementById('navMenuBtn'));
                    hasOwnProfile = was.hasOwnProfile; myMusicianId = was.myMusicianId;
          delete S.rpcResults.tt_get_musicians_public; delete S.rpcResults.tt_get_bands_public;
          Object.defineProperty(navigator, 'share', { configurable: true, value: was.share });
          return uit;
        }""")
        for naam50, v in (("Mijn Profiel", d50["mijnProfiel"]), ("muzikantvenster", d50["ander"]),
                          ("muzikantvenster zonder eigen profiel", d50["anderZonderProfiel"]),
                          ("je eigen profiel in het venster", d50["eigenInVenster"]), ("bandvenster", d50["band"])):
            check(f"{naam50}: precies één deelicoon, geen brede deelknop meer",
                  v["aantal"] == 1 and v["breed"] == 0, json.dumps(v))
            # TT-385 (02-10-2026): de bandpagina heeft dezelfde kop als het muzikantprofiel.
            check(f"{naam50}: het deelicoon is 44×44 en staat naast de foto, op het midden van de onderste helft (TT-384, TT-385)",
                  v["maat"] == [44, 44] and v["naastFoto"] is not None and abs(v["naastFoto"]) <= 3, json.dumps(v))
            check(f"{naam50}: de naam heeft de volle breedte, de regels staan er direct onder",
                  v["naamVol"] and v["naamRegels"] is not None and 0 <= v["naamRegels"] <= 8, json.dumps(v))
        for naam50, v in (("Mijn Profiel", d50["mijnProfiel"]), ("muzikantvenster", d50["ander"]), ("bandvenster", d50["band"])):
            check(f"{naam50}: deelicoon en ⋯ zijn elk 44px, de tikvlakken overlappen niet",
                  v["menuMaat"] == [44, 44] and v["overlap"] is not None and v["overlap"] <= 0.5, json.dumps(v))
            # TT-403 (Ronald: "verder af van 3 puntjes"): 28px, was 20px.
            check(f"{naam50}: het deelteken staat 28px van de stippen (TT-403; 26 tot 30px)",
                  v["inktGat"] is not None and 26 <= v["inktGat"] <= 30, json.dumps(v))
        check("Mijn Profiel: het ⋯-menu staat nog recht onder de hamburger",
              abs(d50["menuOnderHamburger"]) <= 2, json.dumps(d50["menuOnderHamburger"]))
        for naam50, v in (("zonder eigen profiel", d50["anderZonderProfiel"]), ("eigen profiel in het venster", d50["eigenInVenster"])):
            check(f"{naam50}: het deelicoon alleen staat op de plek van het menu, onder de hamburger (waar het kruisje stond)",
                  v["alleenOnderKruis"] is not None and abs(v["alleenOnderKruis"]) <= 1.5, json.dumps(v))
        check("je eigen profiel in het venster: geen lege voetbalk meer", d50["eigenVoet"] == "", d50["eigenVoet"][:120])
        check("een tik deelt de juiste link: #profiel/m1, #profiel/m2, #band/b2",
              d50["mijnProfiel"]["url"] == "#profiel/m1" and d50["ander"]["url"] == "#profiel/m2"
              and d50["band"]["url"] == "#band/b2", json.dumps([d50[k]["url"] for k in d50 if isinstance(d50[k], dict)]))
        check("het deelicoon heeft een aria-label voor een schermlezer",
              d50["mijnProfiel"]["label"] == "Deel dit profiel" and d50["band"]["label"] == "Deel dit bandprofiel",
              json.dumps([d50["mijnProfiel"]["label"], d50["band"]["label"]]))
        js50 = open(os.path.join(ROOT, "musicians.js"), encoding="utf-8").read() + open(os.path.join(ROOT, "bands.js"), encoding="utf-8").read()
        # TT-385 fase 3 (besluit g): het deelblad van de beheerder deelt ook,
        # met de knop Delen. Dat is de enige andere aanroep.
        # TT-410b: de vierde plek is shareProfile() zelf, die zichzelf opnieuw aanroept
        # nadat je delen hebt aangezet; fase 2 voegt dezelfde vraag voor de band toe (vijfde).
        check("één deelknop in de code: alleen deelKnopHTML() en het deelblad roepen shareProfile() aan",
              len(re.findall(r"shareProfile\(", js50)) == 5 and "if (b) shareProfile('band', b.id, b.name);" in js50
              and "Deel dit profiel</button>" not in js50
              and "Deel dit bandprofiel</button>" not in js50, str(len(re.findall(r"shareProfile\(", js50))))
        check("geen paginafouten in blok 50", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(80)

        print("\nBlok 51 — het kruisje op de profielfoto en de zwarte tekst in Wijzig (TT-381)")
        # Bevinding Ronald, 30-09-2026: "Foto verwijderen" wordt het kruisje rechtsboven
        # de foto; de tekst in Wijzig wordt zwart. Besluiten Ronald: op alle drie de
        # plekken, en het kruisje vraagt eerst.
        # TT-385 fase 4: de bandfoto staat niet meer in Band aanmaken, maar in de tegel Onze media.
        PLEKKEN50 = [("avatarRemoveBtn", "avatarPreview"), ("mhAvatarRemoveBtn", "mhAvatarPreview"),
                     ("bmFotoRemoveBtn", "bmFotoPreview")]
        bouw50 = page.evaluate("""(plekken) => plekken.map(([id, voorbeeld]) => {
          const b = document.getElementById(id); if (!b) return 'ontbreekt';
          const wrap = b.closest('.avatar-preview-wrap');
          return [b.tagName, b.textContent.trim(), b.className, !!wrap && wrap.contains(document.getElementById(voorbeeld)),
                  b.getAttribute('aria-label') || '', b.getAttribute('type')]; })""", PLEKKEN50)
        check("op alle drie de plekken is Foto verwijderen een kruisje bij de foto, geen knop met tekst",
              all(x != 'ontbreekt' and x[0] == "BUTTON" and x[1] == "✕" and x[2] == "avatar-remove-btn" and x[3]
                  and x[4].endswith("verwijderen") and x[5] == "button" for x in bouw50), json.dumps(bouw50))
        check("er staat nergens meer een knop met de tekst Foto verwijderen",
              page.evaluate("[...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Foto verwijderen').length") == 0, "")
        stijl50 = page.evaluate("""() => { const b = document.getElementById('mhAvatarRemoveBtn'), t = document.querySelector('.media-thumb .thumb-remove')
            || (() => { const d = document.createElement('div'); d.className = 'media-thumb'; d.innerHTML = '<button class="thumb-remove">✕</button>';
                        document.getElementById('appRoot').appendChild(d); return d.firstChild; })();
          const w = e => { const c = getComputedStyle(e), a = getComputedStyle(e, '::after');
            return [c.backgroundColor, c.color, c.width, c.height, c.borderRadius, c.fontSize, a.top, a.left]; };
          const r = [w(b), w(t)]; if (!t.closest('#mhMediaGrid, #mediaGrid')) t.parentElement.remove(); return r; }""")
        check("het kruisje ziet er precies zo uit als het kruisje op een mediategel, met een tikvlak van 44px",
              stijl50[0] == stijl50[1] and stijl50[0][2] == "22px" and stijl50[0][6] == "-11px", json.dumps(stijl50))
        page.evaluate("showView('register')"); page.wait_for_timeout(300)
        page.evaluate("goTo(4)"); page.wait_for_timeout(450)
        plek50 = page.evaluate("""() => { const b = document.getElementById('avatarRemoveBtn'); b.classList.add('visible');
          const k = b.getBoundingClientRect(), f = document.getElementById('avatarPreview').getBoundingClientRect(),
                w = document.querySelector('#step4 .avatar-edit-btn').getBoundingClientRect();
          const raak = document.elementFromPoint(k.left + k.width / 2, k.top - 9) === b;
          b.classList.remove('visible'); const weg = getComputedStyle(b).display;
          return { rechts: Math.round(f.right - k.right), boven: Math.round(k.top - f.top), raak,
                   losVanWijzig: k.bottom + 11 <= w.top, weg }; }""")
        check("het kruisje staat rechtsboven de foto (4px van de rand), zonder foto verborgen",
              plek50["rechts"] == 4 and plek50["boven"] == 4 and plek50["weg"] == "none", json.dumps(plek50))
        check("ook net naast de schijf raakt een tik het kruisje, en de tikvlakken van kruisje en Wijzig raken elkaar niet",
              plek50["raak"] and plek50["losVanWijzig"], json.dumps(plek50))
        wijzig50 = page.evaluate("""() => { const m = () => [...document.querySelectorAll('.avatar-edit-btn')].map(e => {
            const c = getComputedStyle(e); return [c.color, c.backgroundColor]; });
          const donker = m(); document.documentElement.dataset.theme = 'licht'; const licht = m();
          delete document.documentElement.dataset.theme; return { donker, licht }; }""")
        # TT-385 fase 4: drie plekken — registratie, mediahoek en de tegel Wie zijn we van een band.
        check("Wijzig: zwarte tekst op geel, op alle drie de plekken (donker thema)",
              len(wijzig50["donker"]) == 3 and all(x == ["rgb(0, 0, 0)", "rgb(245, 197, 24)"] for x in wijzig50["donker"]), json.dumps(wijzig50))
        check("Wijzig in het lichte thema: de donkere merktekst op hetzelfde geel",
              all(x == ["rgb(30, 30, 30)", "rgb(245, 197, 24)"] for x in wijzig50["licht"]), json.dumps(wijzig50))
        vraag50 = page.evaluate("""async () => {
          const uit = [], modal = document.getElementById('confirmModal'), tekst = () => document.getElementById('confirmMessage').textContent;
          const ja = document.getElementById('confirmYesBtn');
          const ronde = async (zet, vraag, zichtbaar, id) => {
            zet(); const voor = document.getElementById(id).classList.contains('visible');
            vraag(); await new Promise(r => setTimeout(r, 50));
            const open = modal.classList.contains('visible'), msg = tekst(), rood = ja.classList.contains('btn-danger');
            const nogErVoorJa = zichtbaar();
            ja.click(); await new Promise(r => setTimeout(r, 50));
            uit.push({ voor, open, msg, rood, nogErVoorJa, naJa: zichtbaar(), knopWeg: !document.getElementById(id).classList.contains('visible') });
          };
          await ronde(() => { state.avatarUrl = 'https://x.test/a.jpg'; const p = document.getElementById('avatarPreview');
                              p.innerHTML = '<img src="https://x.test/a.jpg">'; document.getElementById('avatarRemoveBtn').classList.add('visible'); },
                      askRemoveAvatar, () => !!state.avatarUrl, 'avatarRemoveBtn');
          await ronde(() => { mhAvatarUrl = 'https://x.test/b.jpg'; mhRenderAvatar(); }, mhAskRemoveAvatar, () => !!mhAvatarUrl, 'mhAvatarRemoveBtn');
          await ronde(() => { bmFotoUrl = 'https://x.test/c.jpg'; bmRenderFoto(); }, bmVraagFotoWeg,
                      () => !!bmFotoUrl, 'bmFotoRemoveBtn');
          return uit; }""")
        check("het kruisje vraagt eerst, zonder rood (rood is alleen voor het account); pas na Ja is de foto weg (registratie, mediahoek, band)",
              len(vraag50) == 3 and all(x["voor"] and x["open"] and not x["rood"] and x["nogErVoorJa"] and not x["naJa"] and x["knopWeg"] for x in vraag50)
              and [x["msg"] for x in vraag50] == ["Profielfoto verwijderen?", "Profielfoto verwijderen?", "Bandfoto verwijderen?"],
              json.dumps(vraag50))
        css50 = open(os.path.join(ROOT, "styles.css"), encoding="utf-8").read()
        check("geen dode regels meer voor de oude knop (btn-cancel-armed en hover op .avatar-remove-btn)",
              ".avatar-remove-btn.btn-cancel-armed" not in css50 and ".avatar-remove-btn:hover" not in css50, "")

        print("\nBlok 52 — postcode en plaats naast elkaar, overal (TT-382, bevinding Ronald 30-09-2026)")
        pp50 = page.evaluate("""() => [['zip','city'],['wbjZip','wbjCity'],['bandZip','bandCity']].map(([z, c]) => {
          const zi = document.getElementById(z), ci = document.getElementById(c);
          const rij = zi.closest('.postcode-plaats-rij');
          if (!rij || rij !== ci.closest('.postcode-plaats-rij')) return z + ': niet in dezelfde rij';
          // Meten op een zichtbare kopie van 358px (390 min 2×16): de drie formulieren staan
          // elk in een ander scherm en zijn nu verborgen.
          const kopie = rij.cloneNode(true); kopie.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
          kopie.style.width = '358px'; document.body.appendChild(kopie);
          const [a, b] = [...kopie.querySelectorAll('input')].map(e => e.getBoundingClientRect());
          kopie.remove();
          return z + ': ' + (Math.round(a.top) === Math.round(b.top) && Math.round(a.width) === 104 && b.left > a.right ? 'ok' : `boven ${a.top}/${b.top}, breedte ${a.width}`);
        })""")
        check("postcode (104px) en plaats staan op één regel in wizard, Je gegevens en bandformulier, ook op 390px",
              pp50 == ["zip: ok", "wbjZip: ok", "bandZip: ok"], json.dumps(pp50))
        fout50 = page.evaluate("""() => { setFieldError('bandZip', 'Proef');
          const rij = document.getElementById('bandZip').closest('.postcode-plaats-rij');
          const ok = !!(rij.nextElementSibling && rij.nextElementSibling.classList.contains('field-msg'));
          clearFieldError('bandZip'); return [ok, !(rij.nextElementSibling || {}).classList?.contains('field-msg')]; }""")
        check("de foutregel van de postcode staat onder de hele rij, niet in de smalle kolom, en verdwijnt weer",
              fout50 == [True, True], json.dumps(fout50))

        print("\nBlok 53 — deelicoon en ⋯-menu bij de naam lichten niet op (TT-383, bevinding Ronald 30-09-2026)")
        vlak53 = page.evaluate("""() => {
          const w = document.createElement('div');
          w.innerHTML = profielKnoppenHTML('profiel', 'x', 'Proef', '<button type="button" class="nav-menu-btn active">⋯</button>');
          document.body.appendChild(w);
          const uit = [...w.querySelectorAll('.nav-menu-btn')].map(b => { b.classList.add('active'); const s = getComputedStyle(b);
            return [s.backgroundColor, s.borderTopColor, s.webkitTapHighlightColor]; });
          w.remove(); return uit; }""")
        leeg53 = ["rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)", "rgba(0, 0, 0, 0)"]
        check("deelknop en ⋯-menu: geen vlak, geen rand en geen tap-highlight, ook als het menu open staat",
              len(vlak53) == 2 and all(x == leeg53 for x in vlak53), json.dumps(vlak53))
        css53 = open(os.path.join(ROOT, "styles.css"), encoding="utf-8").read()
        check("ook bij aanwijzen geen vlak (hover-regel voor .profiel-knoppen)",
              ".profiel-knoppen .nav-menu-btn:hover { background: transparent; border-color: transparent; }" in css53[css53.find("@media (hover: hover)"):], "")
        vlak53b = page.evaluate("""() => { const b = document.createElement('button'); b.className = 'nav-menu-btn active';
          document.body.appendChild(b); const c = getComputedStyle(b).backgroundColor; b.remove(); return c; }""")
        check("het hamburgermenu elders houdt zijn open-stand (buiten deze rij niets gewijzigd)",
              vlak53b != "rgba(0, 0, 0, 0)", vlak53b)

        print("\nBlok 54 — de profielkop onder elkaar, de foto half over de banner (TT-384, besluiten Ronald 30-09-2026)")
        page_errors.clear()
        page.set_viewport_size({"width": 375, "height": 812})
        page.wait_for_timeout(80)
        d54 = page.evaluate("""async () => {
          const was = { hasOwnProfile, myMusicianId };
          hasOwnProfile = true; myMusicianId = 'm1';
          const r = e => e ? e.getBoundingClientRect() : null;
          const profiel = (media) => ({ id: 'm1', fname: 'Ronald', lname: 'W', username: 'ronald', bio: '',
            city: 'Den Haag', age: 25, avatar_url: null, musician_songs: [], musician_media: media, musician_wanted: [],
            musician_instruments: [{ instrument: 'Drums', niveau: 3 }], musician_genres: [{ genre: 'Rock' }] });
          document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
          document.getElementById('view-myprofile').classList.add('active');
          const el = document.getElementById('myProfileContent');
          const meet = () => {
            const kop = el.querySelector('.profiel-kop'), rij = el.querySelector('.profiel-kop-rij');
            const foto = r(rij && rij.querySelector('.profile-avatar-photo, .profile-avatar-initials'));
            const knoppen = r(rij && rij.querySelector('.profiel-knoppen'));
            const naam = r(el.querySelector('.profiel-kop > .profile-name'));
            const spoor = r(el.querySelector('.pb-spoor'));
            const inhoud = r(el);
            return { kop: !!kop, rij: !!rij, oudeOpbouw: !!el.querySelector('.profiel-onder'),
              foto: foto && [Math.round(foto.width), Math.round(foto.height)],
              fotoLinks: foto ? Math.round(foto.left - inhoud.left) : null,
              fotoMiddenOpRand: (foto && spoor) ? +((foto.top + foto.bottom) / 2 - spoor.bottom).toFixed(1) : null,
              fotoBovenaan: foto ? +(foto.top - inhoud.top).toFixed(1) : null,
              knoppenRechts: (knoppen && foto) ? knoppen.left > foto.right && Math.abs(knoppen.right - inhoud.right) <= 1 : null,
              naamOnderFoto: (naam && foto) ? +(naam.top - foto.bottom).toFixed(1) : null,
              naamVol: naam ? Math.round(naam.width) === Math.round(inhoud.width) : null };
          };
          const uit = {};
          el.innerHTML = buildMusicianDetailHTML(profiel([
            { media_type: 'foto', url: 'https://x/a.jpg', platform: null, in_banner: true },
            { media_type: 'foto', url: 'https://x/b.jpg', platform: null, in_banner: true }]), true, false);
          profielBannerStarten(el); fitProfileName(el);
          await new Promise(z => setTimeout(z, 40));
          uit.met = meet();
          // De stippen blijven aantikbaar, ook al ligt de rij van de kop eroverheen.
          const stip = el.querySelectorAll('.pb-stip')[1], sr = r(stip);
          const raak = sr && document.elementFromPoint((sr.left + sr.right) / 2, (sr.top + sr.bottom) / 2);
          uit.stipRaakbaar = raak === stip;
          // De stippen duwen de kop niet omlaag: ze hangen los onder de balk.
          uit.stippenLos = getComputedStyle(el.querySelector('.pb-stippen')).position === 'absolute';
          // Het ⋯-menu: de donkere laag ligt nog over de onderbalk (huisstijl §8.2).
          toggleProfileMoreMenu({ stopPropagation() {}, currentTarget: document.getElementById('profileMoreBtn') });
          await new Promise(z => setTimeout(z, 30));
          const ob = r(document.querySelector('.app-bottom-nav'));
          const opBalk = document.elementFromPoint(ob.left + 20, (ob.top + ob.bottom) / 2);
          uit.laagOverOnderbalk = !!(opBalk && opBalk.classList.contains('menu-laag'));
          sluitAlleMenus();
          el.innerHTML = buildMusicianDetailHTML(profiel([]), true, false);
          fitProfileName(el);
          uit.zonder = meet();
          uit.zonderOpBanner = !!el.querySelector('.profiel-kop.op-banner');
          el.innerHTML = ''; showView('about');
          // TT-385 (02-10-2026): de bandpagina heeft dezelfde kop, met een vierkante bandfoto.
          const S = window.TT_STUB;
          S.rpcResults.tt_get_bands_public = () => [{ id: 'b2', name: 'Testband', city: 'Den Haag', description: '',
            status: 'zoekend', profile_color: '#3ecfff', updated_at: new Date().toISOString(), avatar_url: null,
            genres: ['Rock'], niveau: 3, members: [{ username: 'dylan', profile_color: '#f5c518' }], wanted: [] }];
          hasOwnProfile = false;
          await openBandScherm('b2');
          uit.bandOud = !!document.querySelector('#profielSchermContent .profiel-onder');
          uit.bandNieuw = !!document.querySelector('#profielSchermContent .profiel-kop .profiel-kop-rij .bandfoto + .profiel-knoppen');
                    delete S.rpcResults.tt_get_bands_public;
          hasOwnProfile = was.hasOwnProfile; myMusicianId = was.myMusicianId;
          return uit;
        }""")
        m54, z54 = d54["met"], d54["zonder"]
        check("met banner: de kop staat onder elkaar (foto en knoppen in een rij, naam eronder), niet meer .profiel-onder",
              m54["kop"] and m54["rij"] and not m54["oudeOpbouw"], json.dumps(m54))
        check("met banner: het midden van de foto ligt op de onderrand van de balk (50% overlap)",
              m54["fotoMiddenOpRand"] is not None and abs(m54["fotoMiddenOpRand"]) <= 1, json.dumps(m54))
        check("de foto is 80×80 en staat links tegen de inhoud",
              m54["foto"] == [80, 80] and m54["fotoLinks"] == 0 and z54["foto"] == [80, 80], json.dumps([m54, z54]))
        check("het deelicoon en het ⋯-menu staan rechts naast de foto, tegen de rechterrand",
              m54["knoppenRechts"] and z54["knoppenRechts"], json.dumps([m54, z54]))
        check("de naam staat 12px onder de foto en heeft de volle breedte",
              m54["naamOnderFoto"] is not None and 11 <= m54["naamOnderFoto"] <= 13 and m54["naamVol"]
              and z54["naamOnderFoto"] is not None and 11 <= z54["naamOnderFoto"] <= 13 and z54["naamVol"], json.dumps([m54, z54]))
        check("de stippen hangen los onder de balk en blijven aantikbaar door de kop heen",
              d54["stippenLos"] and d54["stipRaakbaar"], json.dumps(d54))
        check("een open ⋯-menu legt zijn donkere laag nog over de onderbalk (§8.2)", d54["laagOverOnderbalk"], json.dumps(d54))
        check("zonder banner: dezelfde opbouw, de foto bovenaan zonder overlap",
              z54["kop"] and z54["rij"] and not d54["zonderOpBanner"] and z54["fotoBovenaan"] == 0, json.dumps(z54))
        check("de bandpagina heeft dezelfde kop: bandfoto en knoppen in een rij, geen .profiel-onder meer (TT-385)",
              d54["bandNieuw"] and not d54["bandOud"], json.dumps(d54))
        check("geen paginafouten in blok 54", not page_errors, "; ".join(page_errors)[:300])
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(80)

        print("\nBlok 55 — de profielvolledigheid als lage balk, percentage als finish (TT-386, besluit Ronald 30-09-2026)")
        page_errors.clear()
        page.set_viewport_size({"width": 375, "height": 812})
        page.wait_for_timeout(80)
        d55 = page.evaluate("""() => {
          const r = e => e ? e.getBoundingClientRect() : null;
          const uit = {};
          for (const [naam, m] of [['nul', {}], ['half', { avatar_url: 'x', bio: 'een bio van ruim twintig tekens', musician_instruments: [1] }],
                                   ['vol', { avatar_url: 'x', bio: 'een bio van ruim twintig tekens', musician_instruments: [1], musician_genres: [1], musician_songs: [1,2,3], musician_media: [1] }]]) {
            const w = document.createElement('div'); w.style.width = '343px';
            w.innerHTML = renderCompletenessMeter(m); document.body.appendChild(w);
            const wrap = w.querySelector('.completeness-wrap'), lab = w.querySelector('.completeness-label');
            const rij = w.querySelector('.completeness-rij'), fill = r(w.querySelector('.completeness-fill'));
            const pct = r(w.querySelector('.completeness-pct')), rest = r(w.querySelector('.completeness-rest'));
            const binnen = r(rij);
            uit[naam] = { label: lab && lab.textContent.trim(), labelKleur: lab && getComputedStyle(lab).color,
              pct: w.querySelector('.completeness-pct') && w.querySelector('.completeness-pct').textContent.trim(),
              pctKleur: pct && getComputedStyle(w.querySelector('.completeness-pct')).color,
              vinkjes: w.querySelectorAll('.comp-item, .completeness-items').length, tip: w.querySelectorAll('p').length,
              fill: !!fill, rest: !!rest,
              finish: fill && pct ? Math.round(pct.left - fill.right) : null,
              restNaPct: rest && pct ? Math.round(rest.left - pct.right) : null,
              binnenRand: pct && binnen ? pct.right <= binnen.right + 0.5 : false,
              hoogte: lab && rij ? Math.round(r(rij).bottom - r(lab).top) : null,
              aria: rij && rij.getAttribute('aria-valuenow') };
            w.remove();
          }
          return uit; }""")
        goud55 = "rgb(245, 197, 24)"
        check("titel 'Profielvolledigheid' in goud, geen vinkjes en geen tiptekst meer",
              all(d55[k]["label"] == "Profielvolledigheid" and d55[k]["labelKleur"] == goud55 and d55[k]["vinkjes"] == 0 and d55[k]["tip"] == 0 for k in d55), json.dumps(d55))
        check("het percentage staat direct achter het gele stuk (6px), in goud",
              d55["half"]["finish"] == 6 and d55["vol"]["finish"] == 6 and d55["half"]["pct"] == "50%" and d55["half"]["pctKleur"] == goud55, json.dumps(d55))
        check("0%: geen geel stuk; 100%: geen grijze rest; het percentage blijft binnen de rand",
              not d55["nul"]["fill"] and d55["nul"]["rest"] and d55["vol"]["fill"] and not d55["vol"]["rest"]
              and all(d55[k]["binnenRand"] for k in d55) and d55["vol"]["pct"] == "100%", json.dumps(d55))
        check("titel plus balk samen hooguit 32px hoog (was 43px)",
              all(d55[k]["hoogte"] is not None and d55[k]["hoogte"] <= 32 for k in d55), json.dumps(d55))
        check("de balk meldt zijn waarde aan een schermlezer (progressbar)", d55["half"]["aria"] == "50", json.dumps(d55))
        check("geen paginafouten in blok 55", not page_errors, "; ".join(page_errors)[:300])
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(80)

        # Blok 56 — onderhoudsronde 01-10-2026: TT-387 en TT-389
        print("\nBlok 56 — zoeken zonder opslag (TT-387) en een los #-deel (TT-389)")
        # TT-387: de browser blokkeert opslag, zoals bij "alle cookies
        # blokkeren". localStorage gooit dan een SecurityError.
        bctx = browser.new_context(viewport={"width": 390, "height": 844})
        bctx.add_init_script("""Object.defineProperty(window, 'localStorage', {
          configurable: true, get() { throw new DOMException('geblokkeerd', 'SecurityError'); } });""")
        bp = bctx.new_page()
        b_fouten = []
        bp.on("pageerror", lambda e: b_fouten.append(str(e)))
        bp.route("**/supabase-js@2/**", lambda r: r.fulfill(
            status=200, content_type="application/javascript", body=stub_js))
        for pat in ("**/fonts.googleapis.com/**", "**/fonts.gstatic.com/**",
                    "**/api.pdok.nl/**", "**/itunes.apple.com/**"):
            bp.route(pat, lambda r: r.abort())
        bp.goto(f"http://127.0.0.1:{port}/index.html", wait_until="load")
        bp.wait_for_timeout(400)
        geblokkeerd = bp.evaluate("""() => { try { localStorage; return false; } catch (e) { return true; } }""")
        check("de proef blokkeert opslag echt", geblokkeerd, "")
        check("search.js laadt helemaal, ook zonder opslag (TT-387)",
              not b_fouten and bp.evaluate("typeof musicianViewMode === 'string' && typeof bandViewMode === 'string' && typeof setlistViewMode === 'string'"),
              "; ".join(b_fouten)[:300])
        zonder = bp.evaluate("""async () => {
          window.TT_STUB.rpcResults.tt_resolve_search_origin = [{ lat: 52.0, lng: 4.3 }];
          window.TT_STUB.rpcResults.tt_search_musicians_anon = () => [{ musician_id: 'm1', distance_km: 4, is_stale: false }];
          window.TT_STUB.rpcResults.tt_get_musicians_public = [{
            id: 'm1', username: 'ronnie', age: 30, city: 'Delft', bio: '', goal: null,
            profile_color: '#f5c518', avatar_url: null, updated_at: new Date().toISOString(),
            instrument_levels: [{ instrument: 'Drums', niveau: 3 }], genres: ['Rock'], songs: []
          }];
          showView('search');
          document.getElementById('filterCity').value = 'Delft';
          document.getElementById('filterRadius').value = '25';
          await runSearch();
          await new Promise(r => setTimeout(r, 150));
          return document.getElementById('searchResults').innerText;
        }""")
        check("zoeken zonder opslag geeft gewoon resultaat (TT-387)",
              "1 muzikant gevonden" in zonder and not b_fouten, (zonder[:150] + " | " + "; ".join(b_fouten))[:300])
        check("zonder opslag geldt de standaardweergave: kaarten op een telefoon",
              bp.evaluate("musicianViewMode") == "grid", bp.evaluate("musicianViewMode"))
        bctx.close()

        # TT-389: een stap in de geschiedenis die de app niet zelf maakte.
        page_errors.clear()
        hash56 = page.evaluate("""async () => {
          const wacht = () => new Promise(r => setTimeout(r, 120));
          const actief = () => document.querySelector('.app-view.active')?.id;
          const uit = {};
          currentUser = { id: 'test' };
          showView('myprofile');
          location.hash = '#search'; await wacht();
          uit.ingelogdZoeken = actief(); uit.state = history.state && history.state.view;
          location.hash = '#bestaatniet'; await wacht();
          uit.ingelogdOnbekend = actief();
          location.hash = '#auth'; await wacht();
          uit.ingelogdAuth = actief();
          currentUser = null;
          showView('landing');
          location.hash = '#messages'; await wacht();
          uit.uitgelogdAfgeschermd = actief();
          location.hash = '#bestaatniet'; await wacht();
          uit.uitgelogdOnbekend = actief();
          location.hash = '#about'; await wacht();
          uit.uitgelogdOver = actief();
          return uit;
        }""")
        check("ingelogd: #search in de link toont Zoeken, niet de landingspagina (TT-389)",
              hash56["ingelogdZoeken"] == "view-search" and hash56["state"] == "search", json.dumps(hash56))
        check("ingelogd: een onbekend #-deel of #auth gaat naar Mijn Profiel",
              hash56["ingelogdOnbekend"] == "view-myprofile" and hash56["ingelogdAuth"] == "view-myprofile", json.dumps(hash56))
        check("uitgelogd: een afgeschermd scherm gaat naar Inloggen, een onbekend #-deel naar de landingspagina",
              hash56["uitgelogdAfgeschermd"] == "view-auth" and hash56["uitgelogdOnbekend"] == "view-landing"
              and hash56["uitgelogdOver"] == "view-about", json.dumps(hash56))
        terug56 = page.evaluate("""async () => {
          const wacht = () => new Promise(r => setTimeout(r, 120));
          showView('landing'); showView('search'); showView('about');
          history.back(); await wacht();
          return document.querySelector('.app-view.active')?.id;
        }""")
        check("een gewone stap terug werkt zoals voorheen", terug56 == "view-search", terug56)
        check("geen paginafouten in blok 56", not page_errors, "; ".join(page_errors)[:300])

        # ------------------------------------------------------------------
        # Blok 57 — TT-385 fase 2 (02-10-2026): de bandpagina om te bekijken
        # ------------------------------------------------------------------
        print("\nBlok 57 — de bandpagina om te bekijken (TT-385, fase 2)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 375, "height": 812})
        page.evaluate("showView('about')")
        page.wait_for_timeout(80)
        d57 = page.evaluate("""async () => {
          const S = window.TT_STUB;
          const was = { hasOwnProfile, myMusicianId, from: db.from };
          const vak = () => document.getElementById('profielSchermContent');
          const voet = () => document.getElementById('profielSchermVoet');
          const titels = () => [...vak().querySelectorAll('.profile-media-title')].map(t => t.textContent.trim());
          const tags = () => [...vak().querySelectorAll('.profile-badges .tag-solid')].map(t => t.textContent.trim());
          const gisteren = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
          const straks = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
          const uit = {};
          // 1. Zonder eigen profiel, afgeschermd (een lid van 14, bezoeker zonder account).
          hasOwnProfile = false; myMusicianId = null;
          S.rpcResults.tt_get_bands_public = () => [{ id: 'b7', name: 'Nachtploeg', city: 'Den Haag', description: 'Vier vrienden.',
            status: 'zoekend', profile_color: null, updated_at: null, avatar_url: null, genres: ['Indie'], niveau: 3,
            wanted: ['Basgitaar'], afgeschermd: true, soort: 'beide', pauze: false, contact_id: 'm1',
            instagram: '', tiktok: null, youtube: '',
            members: [{ id: 'm1', username: 'jesse', role: 'Oprichter', avatar_url: null, instruments: ['Gitaar', 'Zang'] },
                      { id: 'm2', username: 'sam', role: 'Lid', avatar_url: null, instruments: ['Toetsen'] }],
            media: [{ media_type: 'foto', url: null, platform: null, in_banner: true, afgeschermd: true }],
            nummers: [{ titel: 'Tram 11', url: null, platform: null, afgeschermd: true }],
            covers: [{ song_title: 'Last Nite', song_artist: 'The Strokes' }],
            invallers: [{ instrument: 'Drums', datum: straks }] }];
          await openBandScherm('b7');
          uit.gast = { titels: titels(), tags: tags(),
            balk: vak().querySelectorAll('.profiel-banner').length,
            tegelT: vak().querySelectorAll('.profile-media-tegel.media-afgeschermd').length,
            nummerKnop: vak().querySelectorAll('button.band-nummer').length,
            nummerDicht: vak().querySelectorAll('div.band-nummer .media-afgeschermd').length,
            socialDicht: vak().querySelectorAll('.social-dicht').length,
            socialLink: vak().querySelectorAll('a.social-knop').length,
            gezichtenT: vak().querySelectorAll('.bezetting-lid .bb-foto-t').length,
            open: [...vak().querySelectorAll('.bezetting-open')].map(e => [...e.querySelectorAll('.bb-foto, .bb-naam, .bb-sub')].map(c => c.textContent.trim()).join(' ')),
            openKnop: vak().querySelectorAll('button.bezetting-open').length,
            ledenKnop: vak().querySelectorAll('button.bezetting-lid:not(.bezetting-open)').length,
            namen: [...vak().querySelectorAll('.bezetting-lid:not(.bezetting-open) .bb-naam')].map(e => e.textContent),
            rijen: [...vak().querySelectorAll('.bezetting > .bb-rij')].map(e => getComputedStyle(e).flexDirection + '/' + (e.querySelector('.bb-foto').getBoundingClientRect().left < e.querySelector('.bb-tekst').getBoundingClientRect().left)),
            fotoVierkant: getComputedStyle(vak().querySelector('.bandfoto')).borderRadius,
            voet: voet().textContent.trim() };
                    // 2. Met een eigen profiel: de tabellen zelf (nagebootst, de stub kent geen ingesloten tabellen).
          const rij = { id: 'b8', name: 'Zoutwater', city: 'Rijswijk', description: '', niveau: 4, avatar_url: null,
            genres: ['Pop'], soort: null, pauze: false, founder_id: 'm1', contact_id: 'm3',
            instagram: '@zoutwater.band', tiktok: 'https://www.tiktok.com/@zoutwater', youtube: null,
            band_members: [
              { role: 'Lid', status: 'bevestigd', joined_at: '2026-02-01', musicians: { id: 'm3', fname: 'Sanne', weergavenaam: 'Sanne', username: 'sanne', avatar_url: null, musician_instruments: [{ instrument: 'Zang' }] } },
              { role: 'Oprichter', status: 'bevestigd', joined_at: '2026-01-01', musicians: { id: 'm1', fname: 'Ronald', weergavenaam: 'Ronald', username: 'ronnie', avatar_url: null, musician_instruments: [{ instrument: 'Drums' }] } },
              { role: 'Lid', status: 'uitgenodigd', joined_at: '2026-03-01', musicians: { id: 'm2', fname: 'Dylan', weergavenaam: 'Dylan', username: 'dylan', avatar_url: null, musician_instruments: [] } }],
            band_wanted: [],
            band_media: [{ media_type: 'foto', url: 'https://x.test/a.jpg', platform: null, in_banner: true, created_at: '2026-01-02' },
                         { media_type: 'link', url: 'https://open.spotify.com/track/1', platform: 'Spotify', in_banner: false, created_at: '2026-01-03' }],
            band_nummers: [{ titel: 'Golf', url: 'https://www.youtube.com/watch?v=abcdefghijk', platform: 'YouTube', created_at: '2026-01-01' }],
            band_covers: [],
            band_invallers: [{ instrument: 'Bas', datum: gisteren }, { instrument: 'Drums', datum: straks }] };
          db.from = () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: JSON.parse(JSON.stringify(rij)), error: null }) });
          const kijk = async (ik) => {
            hasOwnProfile = true; myMusicianId = ik;
            await openBandScherm('b8');
            const r = { titels: titels(), tags: tags(),
              namen: [...vak().querySelectorAll('.bezetting-lid:not(.bezetting-open) .bb-naam')].map(e => e.textContent),
              open: [...vak().querySelectorAll('.bezetting-open')].map(e => [...e.querySelectorAll('.bb-foto, .bb-naam, .bb-sub')].map(c => c.textContent.trim()).join(' ')),
              balk: vak().querySelectorAll('.profiel-banner').length,
              links: [...vak().querySelectorAll('a.social-knop')].map(a => a.getAttribute('href')),
              nummer: vak().querySelectorAll('button.band-nummer img').length,
              menu: [...vak().querySelectorAll('.profiel-knoppen .nav-menu-item')].map(b => b.textContent.trim()),
              plek: !!vak().querySelector('#profielSchermActies'),
              voet: voet().textContent.trim(),
              ikoon: [...vak().querySelectorAll('.profiel-knoppen .nav-menu-btn svg')].map(e => Math.round(e.getBoundingClientRect().width)),
              titelMarge: getComputedStyle(vak().querySelector('.profile-media-title')).marginBottom };
                        return r;
          };
          uit.bezoeker = await kijk('m2');
          uit.lid = await kijk('m3');
          uit.beheerder = await kijk('m1');
          // De knop onderin opent het berichtvenster met de contactpersoon.
          hasOwnProfile = true; myMusicianId = 'm2';
          await openBandScherm('b8');
          voet().querySelector('button').click();
          await new Promise(res => setTimeout(res, 150));
          uit.bericht = document.getElementById('messagesThreadList').innerText.replace(/\\s+/g, ' ');
          closeConversation(true); gesprekVanuit = null;
          openMessageComposer('m3', 'Sanne');
          await new Promise(res => setTimeout(res, 150));
          uit.berichtGewoon = document.getElementById('messagesThreadList').innerText.replace(/\\s+/g, ' ');
          closeConversation(true); gesprekVanuit = null;
          db.from = was.from;
          delete S.rpcResults.tt_get_bands_public;
          hasOwnProfile = was.hasOwnProfile; myMusicianId = was.myMusicianId;
          return uit;
        }""")
        g57, bz57, lid57, bh57 = d57["gast"], d57["bezoeker"], d57["lid"], d57["beheerder"]
        check("gast: de secties staan in de volgorde van de besluiten",
              g57["titels"] == ["Bezetting", "Wie zijn we", "Onze nummers", "Foto's en video's", "Volg ons", "Covers (1 nummer)"], json.dumps(g57))
        check("gast: tags genre, soort, Zoekend en de ervaring (de band zoekt)",
              g57["tags"][:3] == ["Indie", "Eigen nummers en covers", "Zoekend"] and g57["tags"][3].startswith("Ervaring"), json.dumps(g57))
        check("gast, afgeschermd: geen banner, de foto's de T, het nummer zonder knop",
              g57["balk"] == 0 and g57["tegelT"] == 1 and g57["nummerKnop"] == 0 and g57["nummerDicht"] == 1, json.dumps(g57))
        check("gast, afgeschermd: de socials gedempt, zonder link (besluit f)",
              g57["socialDicht"] == 2 and g57["socialLink"] == 0, json.dumps(g57))
        check("gast: gebruikersnamen, de T zonder foto, open rol en invaller zonder knop",
              g57["namen"][:2] == ["jesse", "sam"] and g57["gezichtenT"] == 2 and len(g57["open"]) == 2
              and g57["open"][0] == "? Basgitaar gezocht" and g57["open"][1].startswith("? Drums invaller") and g57["openKnop"] == 0, json.dumps(g57))
        check("gast: elk lid in de bezetting is een knop die het profiel opent (TT-434)",
              g57["ledenKnop"] == len(g57["namen"]) and g57["ledenKnop"] > 0, json.dumps(g57))
        check("gast: de bezetting is een lijst van rijen, foto links van de tekst, zoals Onze bezetting (TT-450)",
              len(g57["rijen"]) >= 4 and all(r == "row/true" for r in g57["rijen"]), json.dumps(g57["rijen"]))
        check("gast: de bandfoto is vierkant met hoeken van 12px, de knop vraagt om een profiel",
              g57["fotoVierkant"] == "12px" and g57["voet"] == "Maak een profiel aan om contact te leggen", json.dumps(g57))
        check("met profiel: alleen bevestigde leden, op volgorde van binnenkomst, met voornaam",
              bz57["namen"] == ["Ronald", "Sanne"], json.dumps(bz57))
        check("met profiel: een invaller van gisteren staat er niet meer, die van straks wel",
              len(bz57["open"]) == 1 and bz57["open"][0].startswith("? Drums invaller"), json.dumps(bz57))
        check("met profiel: zonder open rol heet de band Compleet, zonder ervaringstag",
              "Compleet" in bz57["tags"] and not any(t.startswith("Ervaring") for t in bz57["tags"]), json.dumps(bz57))
        check("met profiel: de banner, het nummer met YouTube-beeld en de link uit de media",
              bz57["balk"] == 1 and bz57["nummer"] == 1 and "Links" in bz57["titels"], json.dumps(bz57))
        check("socials: een gebruikersnaam wordt een link, een volledige link blijft",
              bz57["links"] == ["https://www.instagram.com/zoutwater.band", "https://www.tiktok.com/@zoutwater"], json.dumps(bz57))
        check("bezoeker: ⋯ voor melden, een knop naar de contactpersoon",
              bz57["plek"] and bz57["voet"] == "Stuur een bericht aan de band →", json.dumps(bz57))
        check("lid: ⋯ met Band verlaten, geen knop onderin",
              lid57["menu"] == ["Band verlaten"] and not lid57["plek"] and lid57["voet"] == "", json.dumps(lid57))
        check("beheerder: ⋯ met Bandprofiel bewerken (fase 3), geen knop onderin",
              bh57["menu"] == ["Bandprofiel bewerken"] and not bh57["plek"] and bh57["voet"] == "", json.dumps(bh57))
        check("het gesprek noemt de contactpersoon van de band (besluit h, TT-410a); een gewoon bericht niet",
              "Sanne is de contactpersoon van Zoutwater." in d57["bericht"] and "contactpersoon" not in d57["berichtGewoon"], json.dumps([d57["bericht"], d57["berichtGewoon"]]))
        check("delen en ⋯ naast de foto zijn 24px (TT-385)", bz57["ikoon"] == [24, 24] and lid57["ikoon"] == [24, 24], json.dumps([bz57["ikoon"], lid57["ikoon"]]))
        check("de titel van een sectie staat 8px boven zijn inhoud (huisstijl §3; was 10px)", bz57["titelMarge"] == "8px", bz57["titelMarge"])
        check("geen paginafouten in blok 57", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()
        page.set_viewport_size({"width": 390, "height": 844})

        # ------------------------------------------------------------------
        # Blok 58 — TT-385 fase 3 (02-10-2026): het bandprofiel bewerken
        # ------------------------------------------------------------------
        print("\nBlok 58 — het bandprofiel bewerken (TT-385, fase 3)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 390, "height": 844})
        page.evaluate("showView('about')")
        page.wait_for_timeout(80)
        # De stub kent alleen platte rijen. Voor dit blok krijgt een band zijn
        # geneste tabellen erbij, en een lid zijn muzikant; een nieuwe rij in
        # een bandtabel krijgt een id, zoals in de database.
        page.evaluate(r"""() => {
          const S = window.TT_STUB;
          window.__b58From = db.from;
          const echt = db.from.bind(db);
          let teller = 0;
          const kind = ['band_wanted', 'band_members', 'band_media', 'band_nummers', 'band_covers', 'band_invallers'];
          const muz = id => { const m = (S.data.musicians || []).find(x => x.id === id); if (!m) return null;
            return { id: m.id, weergavenaam: m.fname || m.first_name || m.username, username: m.username, avatar_url: m.avatar_url || null,
                     musician_instruments: (S.data.musician_instruments || []).filter(i => i.musician_id === id).map(i => ({ instrument: i.instrument })) }; };
          db.from = (t) => { const q = echt(t); const run = q._run.bind(q);
            q._run = () => {
              if (q.op === 'insert' && kind.includes(t)) (Array.isArray(q.payload) ? q.payload : [q.payload]).forEach(r => { if (r && !r.id) r.id = 'n' + (++teller); });
              const r = run();
              if (q.op !== 'select' || !r.data) return r;
              const rijen = Array.isArray(r.data) ? r.data : [r.data];
              if (t === 'bands') rijen.forEach(b => kind.forEach(k => { b[k] = (S.data[k] || []).filter(x => x.band_id === b.id).map(x => {
                const y = JSON.parse(JSON.stringify(x)); if (k === 'band_members') y.musicians = muz(x.musician_id); return y; }); }));
              if (t === 'band_members') rijen.forEach(m => { m.musicians = muz(m.musician_id); });
              return r; };
            return q; };
          window.__b58Was = { hasOwnProfile, myMusicianId, currentUser, bands: S.data.bands, members: S.data.band_members, wanted: S.data.band_wanted };
          currentUser = currentUser || { id: 'u1', email: 'test@talenttent.org' }; myMusicianId = 'm1'; hasOwnProfile = true;
          S.data.bands = [{ id: 'b9', name: 'Nachtploeg', city: 'Den Haag', zip: '2512', city_source: 'pdok', description: '', niveau: null,
            avatar_url: null, genres: ['Indie'], soort: null, pauze: false, founder_id: 'm1', contact_id: null, status: 'compleet',
            instagram: null, tiktok: null, youtube: null }];
          S.data.band_members = [
            { band_id: 'b9', musician_id: 'm1', role: 'Oprichter', status: 'bevestigd', joined_at: '2026-01-01', founder_offer: null }];
          S.data.band_wanted = []; S.data.band_media = []; S.data.band_nummers = []; S.data.band_covers = []; S.data.band_invallers = [];
        }""")
        d58 = page.evaluate(r"""async () => {
          const S = window.TT_STUB, w = (n = 150) => new Promise(r => setTimeout(r, n)), u = {};
          const vak = () => document.getElementById('profielSchermContent');
          const toasts = []; const oudToast = window.showToast; window.showToast = t => { toasts.push(t); oudToast(t); };
          // 1. De privé bandpagina, net aangemaakt: alles is een uitnodiging, 15%.
          await openBandScherm('b9'); await w();
          u.leeg = { uitnodigingen: [...vak().querySelectorAll('.add-link-btn')].map(b => b.textContent),
            pct: vak().querySelector('.completeness-pct')?.textContent,
            balkLaatst: vak().lastElementChild?.classList.contains('completeness-wrap'),
            menu: [...vak().querySelectorAll('.profiel-knoppen .nav-menu-item')].map(b => b.textContent),
            fotoKnop: !!vak().querySelector('button.bandfoto-leeg'),
            tags: [...vak().querySelectorAll('.profile-badges .tag-solid')].map(t => t.textContent.trim()).filter(t => /^(Zoekend|Compleet)/.test(t)) };
          // Het ⋯-menu sluit bij een tik op de donkere laag (was alleen op Mijn Bands).
          vak().querySelector('.profiel-knoppen .profile-actions-menu-wrap .nav-menu-btn').click(); await w(50);
          const laag = vak().querySelector('.menu-laag'); u.menuOpen = !!vak().querySelector('.inline-menu-dropdown.visible');
          if (laag) laag.click(); await w(50);
          u.menuDicht = !vak().querySelector('.inline-menu-dropdown.visible');
          // Delen: eerst het deelblad met wat mist.
          vak().querySelector('.deel-knop').click(); await w(50);
          u.deelblad = [document.getElementById('bandDeelModal').classList.contains('visible'), document.getElementById('bandDeelTekst').textContent];
          sluitBandDeelBlad();
          // 2. Een uitnodiging opent het tegeloverzicht (TT-449); daarna kies je de tegel.
          [...vak().querySelectorAll('.add-link-btn')].find(b => b.textContent.includes('Vertel wie')).click(); await w(400);
          u.uitnodigingOpent = [document.querySelector('.app-view.active').id, activeTegelScreen, bewerkBandId, history.state && history.state.band];
          openTegelScreen('bandWie'); await w(200);
          // 3. Wie zijn we: fouten bij het veld, opslaan, "Terug zonder opslaan?".
          document.getElementById('bwNaam').value = ''; await saveBandWie(); await w(50);
          u.wieFout = [...document.querySelectorAll('#bandWieScreen .field-msg')].map(e => e.textContent.trim());
          document.getElementById('bwNaam').value = 'Nachtploeg';
          document.getElementById('bwBio').value = 'Vier vrienden.'; bwNiveau = 3;
          u.wieGewijzigd = tegelHeeftWijzigingen();
          history.back(); await w(250);
          u.wieGewapend = [terugGewapend, activeTegelScreen];
          await saveBandWie(); await w(100);
          u.wieOpgeslagen = [S.data.bands[0].description, S.data.bands[0].niveau, tegelHeeftWijzigingen()];
          tegelScreenHistoryPushed = false; openTegelOverview(); await w(200);
          u.overzicht = { tegels: [...document.querySelectorAll('#bandTegelsWrap .tile-title')].map(e => e.textContent),
            eigenVerborgen: document.getElementById('tegelOverviewScreen').style.display === 'none',
            beheer: [...document.querySelectorAll('#bandBeheerBlok .segmented-btn, #bandBeheerBlok .btn')].map(e => e.textContent),
            opheffenRood: !!document.querySelector('#bandBeheerBlok .btn-danger') };
          // 4. Onze bezetting, met een lid en een uitnodiging erbij.
          S.data.band_members.push(
            { band_id: 'b9', musician_id: 'm2', role: 'Lid', status: 'bevestigd', joined_at: '2026-02-01', founder_offer: null },
            { band_id: 'b9', musician_id: 'm3', role: 'Lid', status: 'aangevraagd', joined_at: '2026-03-01', founder_offer: null });
          openTegelScreen('bandBezetting'); await w(400);
          u.leden = [...document.querySelectorAll('#bbLeden .bb-rij')].map(r => [r.querySelector('.bb-naam').textContent, [...r.querySelectorAll('.nav-menu-item')].map(b => b.textContent).join('|')]);
          u.uitgenodigd = [...document.querySelectorAll('#bbUitgenodigd .bb-rij')].map(r => [r.querySelector('.bb-naam').textContent, r.querySelector('.nav-menu-item').textContent]);
          u.contactKeuze = [...document.getElementById('bbContactKeuze').options].map(o => o.textContent);
          removeMember('b9', 'm2', 'Dylan', 'Nachtploeg');
          u.uitVraag = [document.getElementById('confirmMessage').textContent, document.getElementById('confirmYesBtn').textContent,
                        document.getElementById('confirmYesBtn').classList.contains('btn-danger')];
          confirmModalYes(); await w(300);
          u.naUit = [S.data.band_members.filter(m => m.status === 'bevestigd').map(m => m.musician_id), [...document.querySelectorAll('#bbLeden .bb-naam')].length];
          await bbIntrekken('m3', 'Sanne'); await w(300);
          u.naIntrekken = [S.data.band_members.length, document.getElementById('bbUitgenodigdBlok').hidden];
          document.getElementById('bbRolKnop').click(); await w(50);
          choosePickerListValue('Basgitaar'); closePickerList();
          bbInvalFormulier(true);
          document.getElementById('bbInvalDatum').value = '01-01-2020'; bbInvalToevoegen();
          u.invalFout = [...document.querySelectorAll('#bbInvalForm .field-msg')].map(e => e.textContent.trim());
          bbInvalInstrument.push('Drums');
          const d = new Date(Date.now() + 5 * 86400000);
          document.getElementById('bbInvalDatum').value = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
          bbInvalToevoegen();
          await saveBandBezetting(); await w(300);
          u.bezettingOpgeslagen = [S.data.band_wanted.map(x => x.instrument), S.data.band_invallers.map(x => x.instrument), S.data.bands[0].status, tegelHeeftWijzigingen()];
          // Zoeken vanuit een open rol, met de plaats van de band.
          u.plus = { open: [...document.querySelectorAll('#bbOpen button.bb-plus')].map(b => [b.textContent, b.getAttribute('aria-label')]),
            inval: [...document.querySelectorAll('#bbInvallers button.bb-plus')].map(b => b.textContent),
            menuOpen: [...document.querySelectorAll('#bbOpen .nav-menu-item')].map(b => b.textContent),
            menuInval: [...document.querySelectorAll('#bbInvallers .nav-menu-item')].map(b => b.textContent),
            tikvlak: (() => { const b = document.querySelector('#bbOpen button.bb-plus'), a = getComputedStyle(b, '::after'); return [Math.round(b.getBoundingClientRect().width) + parseFloat(a.top) * -2, Math.round(b.getBoundingClientRect().height) + parseFloat(a.top) * -2]; })() };
          document.querySelector('#bbOpen button.bb-plus').click(); await w(300);
          u.zoek = [document.querySelector('.app-view.active').id, filterInstruments.slice(), document.getElementById('filterCity').value,
                    document.getElementById('zoekRolMelding').hidden, document.getElementById('zoekRolMelding').textContent.trim(), bewerkBandId, activeTegelScreen];
          // TT-450: terug uit Zoeken komt weer in het tegeloverzicht van deze band, met pijl en met toestelknop.
          u.zoekStapel = navStack.map(x => x.state.view + (x.state.band ? ':' + x.state.band : ''));
          const histLen = history.length;
          appTerug(); await w(300);
          u.terugEdit = [document.querySelector('.app-view.active').id, bewerkBandId, activeTegelScreen, huidigeView];
          zoekMuzikantVoorRol('Basgitaar', bewerkBandStad, bewerkBandNaam, '', bewerkBandId); await w(300);
          history.back(); await w(300);
          u.terugEditToestel = [document.querySelector('.app-view.active').id, bewerkBandId, history.length - histLen];
          zoekMuzikantVoorRol('Basgitaar', bewerkBandStad, bewerkBandNaam, '', bewerkBandId); await w(300);
          // Vanuit die zoekopdracht: "Uitnodigen voor Nachtploeg" in het muzikantvenster, niet bij een lid.
          u.zoekBand = zoekRolBand && zoekRolBand.id;
          const knop = () => document.querySelector('#profielSchermVoet .rol-uitnodig-knop');
          // De stub kent de geneste tabellen van een muzikant niet; daarom de voet zelf, met de aanroep uit openProfielScherm().
          const voet = document.getElementById('profielSchermVoet'), voetWas = voet.innerHTML;
          const vp = document.getElementById('view-profiel'), vpWas = vp.classList.contains('active'); vp.classList.add('active');
          voet.innerHTML = '<button class="btn btn-primary">Stuur een bericht</button>';
                    S.data.band_members.push({ band_id: 'b9', musician_id: 'm2', role: 'Lid', status: 'bevestigd', joined_at: '2026-02-01' });
          await rolUitnodigKnopPlaatsen('m2'); await w(50); u.knopLid = !!knop();
          S.data.band_members = S.data.band_members.filter(m => !(m.musician_id === 'm2' && m.band_id === 'b9'));
          await rolUitnodigKnopPlaatsen('m3'); await w(50); u.knopNieuw = knop() && knop().textContent;
          u.knopEerst = voet.firstElementChild === knop(); u.knopMaat = knop() && [knop().offsetWidth === voet.clientWidth - parseFloat(getComputedStyle(voet).paddingLeft) - parseFloat(getComputedStyle(voet).paddingRight), getComputedStyle(knop()).marginBottom];
          await rolUitnodigen('m3'); await w(200);
          u.naUitnodigen = [S.data.band_members.filter(m => m.musician_id === 'm3' && m.band_id === 'b9').map(m => m.status), !!knop()];
          voet.innerHTML = voetWas; if (!vpWas) vp.classList.remove('active');
          S.data.band_members = S.data.band_members.filter(m => !(m.musician_id === 'm3' && m.band_id === 'b9'));
          configureSearchAccess(); u.zoekBandNaOpen = zoekRolBand;
          // Een coverband telt geen eigen nummers mee, een band met alleen eigen nummers geen covers.
          const kaal = { avatar_url: 'x', description: 'x', leden: [], wanted: [], nummers: [], covers: [], media: [], genres: ['Indie'], soort: 'covers' };
          u.meterCovers = bandVoortgang(kaal); u.meterEigen = bandVoortgang({ ...kaal, soort: 'eigen' });
          // 5. Onze muziek.
          openBandTegels('b9'); openTegelScreen('bandMuziek'); await w(400);
          bmzKiesSoort('beide');
          bmzNummerErbij(); bmzNummers[0].titel = 'Golf'; bmzNummers[0].url = 'https://www.youtube.com/watch?v=abcdefghijk';
          bmzNummerErbij(); bmzNummers[1].titel = 'Zonder link';
          await saveBandMuziek(); await w(100);
          u.muziekFout = [...document.querySelectorAll('#bandMuziekScreen .field-msg')].map(e => e.textContent.trim());
          bmzNummerWeg(1);
          bcAddCover('Last Nite', 'The Strokes'); bcAddCover('Last Nite', 'The Strokes');
          await saveBandMuziek(); await w(300);
          u.muziekOpgeslagen = [S.data.bands[0].soort, S.data.band_nummers.map(n => n.titel + '/' + n.platform), S.data.band_covers.map(c => c.song_title), tegelHeeftWijzigingen()];
          // De covers gebruiken dezelfde zoekfunctie als Je setlist.
          songArtiest.bc = { id: '1', name: 'Froukje' };
          const ac = document.getElementById('bcTrackAc');
          jstRenderTrackResults(ac, [{ trackName: 'Groter dan ik' }], 'gro', 'bc');
          u.coverZoek = ac.querySelector('.ac-item').getAttribute('onmousedown');
          songArtiest.jst = { id: '1', name: 'Froukje' };
          jstRenderTrackResults(ac, [{ trackName: 'Groter dan ik' }], 'gro');
          u.setlistZoek = ac.querySelector('.ac-item').getAttribute('onmousedown');
          songZoekLeeg('bc'); songArtiest.jst = null;
          tegelScreenHistoryPushed = false; openTegelOverview(); await w(200);
          // 6. Onze media.
          openTegelScreen('bandMedia'); await w(300);
          document.getElementById('bmInstagram').value = 'geen geldige naam!';
          await saveBandMedia(); await w(50);
          u.mediaFout = [...document.querySelectorAll('#bandMediaScreen .field-msg')].map(e => e.textContent.trim());
          document.getElementById('bmInstagram').value = '@nachtploeg';
          bmAddLinkRow(); bmMediaLinks[0].url = 'https://open.spotify.com/track/1'; bmToggleLinkBanner(0);
          await saveBandMedia(); await w(300);
          u.mediaOpgeslagen = [S.data.bands[0].instagram, S.data.band_media.map(m => [m.media_type, m.platform, m.in_banner].join('/')), tegelHeeftWijzigingen()];
          tegelScreenHistoryPushed = false; openTegelOverview(); await w(300);
          // 7. We spelen even niet.
          const statusVoor = S.data.bands[0].status;
          await zetBandBeschikbaar(false); await w(200);
          u.pauze = [S.data.bands[0].pauze, S.data.bands[0].status === statusVoor];
          await zetBandBeschikbaar(true); await w(200);
          // 8. De bandpagina na het invullen.
          await openBandScherm('b9'); await w(200);
          u.gevuld = { pct: vak().querySelector('.completeness-pct')?.textContent,
            uitnodigingen: [...vak().querySelectorAll('.add-link-btn')].map(b => b.textContent),
            openKnop: [...vak().querySelectorAll('button.bezetting-open')].map(b => b.getAttribute('aria-label')),
            tags: [...vak().querySelectorAll('.profile-badges .tag-solid')].map(t => t.textContent.trim().split(' ')[0]) };
                    // TT-450: een open rol op de bandpagina is geen knop. Zoeken opent boven de bandpagina; terug komt er weer op.
          u.pagina = { plus: vak().innerHTML.includes('>+<'), vraag: [...vak().querySelectorAll('.bezetting-open .bb-foto')].map(e => e.textContent) };
          showView('bands'); await w(100); await openBandScherm('b9'); await w(200);
          zoekMuzikantVoorRol('Basgitaar', 'Den Haag', 'Nachtploeg', '', 'b9'); await w(300);
          u.vanafPagina = [huidigeView, navStack.map(x => x.state.view)];
          appTerug(); await w(300);
          u.terugPagina = [huidigeView, !!vak().querySelector('.profile-name'), location.hash.startsWith('#band/')];
          zoekMuzikantVoorRol('Basgitaar', 'Den Haag', 'Nachtploeg', '', 'b9'); await w(300);
          history.back(); await w(300);
          u.terugPaginaToestel = [huidigeView, !!vak().querySelector('.profile-name')];
          appTerug(); await w(300);
          u.terugBands = [huidigeView, navStack.length];
          appTerug(); await w(200);
          u.terugBoven = [huidigeView, navStack.length];
          // 9. Bezoeker en lid: geen uitnodigingen, geen balk, open rol geen knop.
          for (const [rol, ik] of [['bezoeker', 'm3'], ['lid', 'm2']]) {
            if (rol === 'lid') S.data.band_members.push({ band_id: 'b9', musician_id: 'm2', role: 'Lid', status: 'bevestigd', joined_at: '2026-02-01' });
            myMusicianId = ik; await openBandScherm('b9'); await w(150);
            u[rol] = [vak().querySelectorAll('.add-link-btn').length, vak().querySelectorAll('.completeness-wrap').length, vak().querySelectorAll('button.bezetting-open').length];
                      }
          myMusicianId = 'm1';
          // 10. Band verlaten: de vraag noemt het gevolg (§19).
          leaveBand('b9', 'Nachtploeg');
          u.verlaten = [document.getElementById('confirmMessage').textContent, document.getElementById('confirmYesBtn').textContent];
          document.getElementById('confirmModal').classList.remove('visible');
          // 11. Een andere view laat geen band achter; je eigen profiel krijgt zijn eigen tegels.
          showView('about'); u.weg = [bewerkBandId, activeTegelScreen];
          showView('profieltegels'); await w(100);
          u.eigen = [document.getElementById('tegelOverviewScreen').style.display, document.getElementById('bandTegelOverviewScreen').style.display];
          // 12. De bio staat inline, voor beide kanten (TT-410a stap 3b): geen voorzetknoppen, een zichtbaar tekstveld met cursief voorbeeld, geen venster.
          const bioInline = (id) => {
            const vak = document.getElementById(id), veld = vak.closest('.field');
            return [vak.tagName, vak.style.display !== 'none', veld.querySelectorAll('.bio-prompt-chip').length,
                    vak.placeholder.slice(0, 4), getComputedStyle(vak, '::placeholder').fontStyle, !!veld.querySelector('.field-hint')];
          };
          u.bioMuzikant = bioInline('wbjBio'); u.bioBand = bioInline('bwBio');
          u.bioGeenVenster = [!document.getElementById('bioModal'), typeof openBioModal];
          // 13. Opheffen vanuit Bandbeheer: de vraag noemt het gevolg, daarna Mijn Bands.
          openBandTegels('b9'); await w(300);
          vraagBandOpheffen();
          u.opheffen = [document.getElementById('confirmMessage').textContent, document.getElementById('confirmYesBtn').textContent, document.getElementById('confirmYesBtn').classList.contains('btn-danger')];
          confirmModalYes(); await w(300);
          u.naOpheffen = [document.querySelector('.app-view.active').id, bewerkBandId, S.data.bands.length];
          u.toasts = toasts;
          window.showToast = oudToast;
          return u;
        }""")
        page.evaluate("""() => { const S = window.TT_STUB, w = window.__b58Was;
          db.from = window.__b58From; hasOwnProfile = w.hasOwnProfile; myMusicianId = w.myMusicianId; currentUser = w.currentUser;
          S.data.bands = w.bands; S.data.band_members = w.members; S.data.band_wanted = w.wanted;
          S.data.band_media = []; S.data.band_nummers = []; S.data.band_covers = []; S.data.band_invallers = []; showView('about'); }""")
        j58 = lambda k: json.dumps(d58[k], ensure_ascii=False)
        check("privé: elke lege sectie is een uitnodiging, de balk staat onderaan op 15%",
              d58["leeg"]["uitnodigingen"] == ["+ Wie spelen er in de band?", "+ Vertel wie jullie zijn", "+ Laat horen hoe jullie klinken",
                                               "+ Foto's en video's toevoegen", "+ Instagram, TikTok of YouTube", "+ Welke covers spelen jullie?"]
              and d58["leeg"]["pct"] == "15%" and d58["leeg"]["balkLaatst"], j58("leeg"))
        check("privé: ⋯ met Bandprofiel bewerken, een lege bandfoto is een knop",
              d58["leeg"]["menu"] == ["Bandprofiel bewerken"] and d58["leeg"]["fotoKnop"], j58("leeg"))
        check("het ⋯-menu van een band sluit bij een tik op de donkere laag, ook op de bandpagina",
              d58["menuOpen"] and d58["menuDicht"], json.dumps([d58["menuOpen"], d58["menuDicht"]]))
        check("delen van een pagina die nog niet af is: het deelblad noemt wat mist (besluit g)",
              d58["deelblad"][0] and d58["deelblad"][1].startswith("Nog niet op je pagina: een bandfoto, Wie zijn we,")
              and d58["deelblad"][1].endswith(" en wat voor band jullie zijn."), j58("deelblad"))
        check("een uitnodiging opent het tegeloverzicht, en de stap onthoudt de band",
              d58["uitnodigingOpent"] == ["view-profieltegels", "overview", "b9", "b9"], j58("uitnodigingOpent"))
        check("Wie zijn we: de fout staat bij het veld, terug vraagt eerst, opslaan bewaart",
              d58["wieFout"] == ["Vul een bandnaam in"] and d58["wieGewijzigd"] and d58["wieGewapend"] == [True, "bandWie"]
              and d58["wieOpgeslagen"] == ["Vier vrienden.", 3, False], json.dumps([d58["wieFout"], d58["wieGewapend"], d58["wieOpgeslagen"]], ensure_ascii=False))
        check("het overzicht: vier tegels, Bandbeheer met de schakelaar, overdragen en opheffen (rood omlijnd)",
              d58["overzicht"]["tegels"] == ["Wie zijn we", "Onze bezetting", "Onze muziek", "Onze media"] and d58["overzicht"]["eigenVerborgen"]
              and d58["overzicht"]["beheer"] == ["Beschikbaar", "Niet beschikbaar", "Aan", "Uit", "Beheer overdragen", "Band opheffen"]
              and d58["overzicht"]["opheffenRood"], j58("overzicht"))
        check("Onze bezetting: de beheerder zonder menu, een lid met Uit de band, een uitnodiging met Intrekken",
              d58["leden"] == [["Ronald (jij)", ""], ["Dylan", "Uit de band"]] and d58["uitgenodigd"] == [["Sanne", "Uitnodiging intrekken"]]
              and d58["contactKeuze"] == ["Ronald (jij)", "Dylan"], json.dumps([d58["leden"], d58["uitgenodigd"], d58["contactKeuze"]], ensure_ascii=False))
        check("Uit de band: de vraag noemt het gevolg, zonder rood (keuze a, §19)",
              d58["uitVraag"] == ["Dylan staat dan niet meer in de bezetting van Nachtploeg.", "Uit de band", False]
              and d58["naUit"] == [["m1"], 1] and "Dylan is uit de band." in d58["toasts"], json.dumps([d58["uitVraag"], d58["naUit"]], ensure_ascii=False))
        check("een uitnodiging intrekken gaat meteen", d58["naIntrekken"] == [1, True], j58("naIntrekken"))
        check("een invaller in het verleden of zonder instrument wordt bij het veld geweigerd",
              d58["invalFout"] == ["Kies een instrument", "Kies een datum vanaf vandaag"], j58("invalFout"))
        check("Opslaan bewaart open rol en invaller; de status volgt uit de open rol (zoekend)",
              d58["bezettingOpgeslagen"] == [["Basgitaar"], ["Drums"], "zoekend", False], j58("bezettingOpgeslagen"))
        check("Zoek een muzikant: Zoeken met het instrument en de plaats van de band, met één regel erboven",
              d58["zoek"][:4] == ["view-search", ["Basgitaar"], "Den Haag", False]
              and d58["zoek"][4] == "Basgitaar voor Nachtploeg. Muzikanten rond Den Haag. Open een profiel om uit te nodigen."
              and d58["zoek"][5] is None and d58["zoek"][6] == "overview", j58("zoek"))
        check("een vaste rol zoeken onthoudt de band; Zoeken opnieuw openen vergeet hem",
              d58["zoekBand"] == "b9" and d58["zoekBandNaOpen"] is None, json.dumps([d58["zoekBand"], d58["zoekBandNaOpen"]]))
        check("muzikantvenster na een rolzoekopdracht: 'Uitnodigen voor Nachtploeg', niet bij een lid; daarna weg",
              d58["knopLid"] is False and d58["knopNieuw"] == "Uitnodigen voor Nachtploeg" and d58["naUitnodigen"] == [["aangevraagd"], False]
              and d58["knopEerst"] and d58["knopMaat"] == [True, "0px"],
              json.dumps([d58["knopLid"], d58["knopNieuw"], d58["knopEerst"], d58["knopMaat"], d58["naUitnodigen"]], ensure_ascii=False))
        check("openProfielScherm() plaatst de knop, niet bij je eigen profiel",
              "rolUitnodigKnopPlaatsen(isOwn ? null : m.id);" in open(os.path.join(ROOT, "musicians.js"), encoding="utf-8").read())
        mc, me = d58["meterCovers"], d58["meterEigen"]
        check("coverband: eigen nummers tellen niet mee in de balk; alleen eigen nummers: covers tellen niet mee",
              mc["telt"]["nummers"] is False and mc["telt"]["covers"] is True and "eigen nummers" not in mc["mist"] and "covers" in mc["mist"]
              and me["telt"]["covers"] is False and me["telt"]["nummers"] is True and "covers" not in me["mist"], json.dumps([mc, me], ensure_ascii=False))
        check("net aangemaakt, beheerder alleen en geen open rol: geen statuslabel", d58["leeg"]["tags"] == [], j58("leeg"))
        check("Onze muziek: een nummer zonder link wordt bij het veld geweigerd",
              d58["muziekFout"] == ["Vul een link in die begint met https://"], j58("muziekFout"))
        check("Onze muziek: soort, eigen nummer met platform en een cover (één keer) worden bewaard",
              d58["muziekOpgeslagen"] == ["beide", ["Golf/YouTube"], ["Last Nite"], False], j58("muziekOpgeslagen"))
        check("covers en setlist delen de zoekfunctie, elk met hun eigen keuze",
              d58["coverZoek"] == "bcAddCover('Groter dan ik','Froukje')" and d58["setlistZoek"] == "jstAddSong('Groter dan ik','Froukje')",
              json.dumps([d58["coverZoek"], d58["setlistZoek"]]))
        check("Onze media: een ongeldige social bij het veld, daarna social en link met banner bewaard",
              d58["mediaFout"] == ["Vul een gebruikersnaam in, of een link die begint met https://"]
              and d58["mediaOpgeslagen"] == ["@nachtploeg", ["link/Spotify/true"], False], json.dumps([d58["mediaFout"], d58["mediaOpgeslagen"]], ensure_ascii=False))
        check("Niet beschikbaar (TT-457): meteen bewaard, de status blijft zoals de bezetting hem bepaalt", d58["pauze"] == [True, True], j58("pauze"))
        # Acht van de negen onderdelen (alleen de bandfoto mist): 15 + 85 × 8/9 = 91%.
        check("na het invullen: 91%, geen uitnodigingen meer, de open rol op de bandpagina is ook voor de beheerder geen knop",
              d58["gevuld"]["pct"] == "91%" and d58["gevuld"]["uitnodigingen"] == [] and d58["gevuld"]["openKnop"] == []
              and "Zoekend" in d58["gevuld"]["tags"], j58("gevuld"))
        check("Bandprofiel bewerken: het plusje van een open rol en een invaller is een knop die Zoeken opent; het menu heeft alleen weghalen (TT-450)",
              d58["plus"]["open"] == [["+", "Zoek een muzikant: Basgitaar"]] and d58["plus"]["inval"] == ["+"]
              and d58["plus"]["menuOpen"] == ["Open rol weghalen"] and d58["plus"]["menuInval"] == ["Invaller weghalen"]
              and d58["plus"]["tikvlak"][0] >= 44 and d58["plus"]["tikvlak"][1] >= 44, j58("plus"))
        check("Zoeken vanuit Bandprofiel bewerken legt Zoeken boven het overzicht; terug (pijl en toestelknop) komt er weer en de geschiedenis groeit niet (TT-450)",
              d58["zoekStapel"][-1] == "profieltegels:b9" and d58["terugEdit"][:2] == ["view-profieltegels", "b9"] and d58["terugEdit"][2] == "overview"
              and d58["terugEditToestel"][:2] == ["view-profieltegels", "b9"] and d58["terugEditToestel"][2] <= 1,
              json.dumps([d58["zoekStapel"], d58["terugEdit"], d58["terugEditToestel"]]))
        check("bandpagina: de open rol heeft een vraagteken, nooit een plus, en is geen knop (TT-450)",
              d58["pagina"]["plus"] is False and d58["pagina"]["vraag"] == ["?", "?"], j58("pagina"))
        check("Zoeken vanaf een open rol legt Zoeken boven de bandpagina; terug komt op de bandpagina, dan Mijn Bands, dan niets (TT-450)",
              d58["vanafPagina"][0] == "search" and d58["vanafPagina"][1][-2:] == ["bands", "profiel"] and d58["terugPagina"] == ["profiel", True, True]
              and d58["terugPaginaToestel"] == ["profiel", True] and d58["terugBands"] == ["bands", 0] and d58["terugBoven"] == ["bands", 0],
              json.dumps([d58["vanafPagina"], d58["terugPagina"], d58["terugPaginaToestel"], d58["terugBands"], d58["terugBoven"]]))
        check("bezoeker en lid: geen uitnodigingen, geen balk, de open rol is geen knop",
              d58["bezoeker"] == [0, 0, 0] and d58["lid"] == [0, 0, 0], json.dumps([d58["bezoeker"], d58["lid"]]))
        check("Band verlaten: de vraag noemt het gevolg (§19)",
              d58["verlaten"] == ["Je staat dan niet meer in de bezetting van Nachtploeg.", "Band verlaten"], j58("verlaten"))
        check("een andere view laat geen band of open tegel achter; Profiel bewerken toont je eigen tegels",
              d58["weg"] == [None, "overview"] and d58["eigen"] == ["", "none"], json.dumps([d58["weg"], d58["eigen"]]))
        check("de bio staat inline (TT-410a): een zichtbaar tekstveld met cursief voorbeeld en een regel uitleg, zonder voorzetknoppen, voor muzikant én band",
              d58["bioMuzikant"] == ["TEXTAREA", True, 0, "Hoi ", "italic", True]
              and d58["bioBand"] == ["TEXTAREA", True, 0, "Hoi!", "italic", True], json.dumps([d58["bioMuzikant"], d58["bioBand"]]))
        check("het bio-venster bestaat niet meer: geen element, geen functie",
              d58["bioGeenVenster"] == [True, "undefined"], json.dumps(d58["bioGeenVenster"]))
        check("Band opheffen: de vraag noemt het gevolg, rood omlijnd, daarna Mijn Bands",
              d58["opheffen"][0].startswith("Nachtploeg verdwijnt dan voor alle leden") and d58["opheffen"][1:] == ["Band opheffen", True]
              and d58["naOpheffen"] == ["view-bands", None, 0], json.dumps([d58["opheffen"], d58["naOpheffen"]], ensure_ascii=False))
        check("geen paginafouten in blok 58", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ------------------------------------------------------------------
        # Blok 59 — TT-385 fase 4 (02-10-2026): de korte wizard en de bandkaart in Mijn Bands
        # ------------------------------------------------------------------
        print("\nBlok 59 — de korte bandwizard en de bandkaart in Mijn Bands (TT-385, fase 4)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 390, "height": 844})
        page.evaluate("showView('about')")
        page.wait_for_timeout(80)
        # Zelfde opzet als blok 58: een band krijgt zijn geneste tabellen, een
        # nieuwe rij (ook in bands) een id, zoals in de database. De postcode
        # zoekt niet echt op, en het e-mailadres is bevestigd.
        page.evaluate(r"""() => {
          const S = window.TT_STUB;
          window.__b59 = { from: db.from, hasOwnProfile, myMusicianId, currentUser, pc: lookupPostcodeCity, mail: emailWachtOpBevestiging, toast: window.showToast };
          const echt = db.from.bind(db);
          let teller = 0;
          const kind = ['band_wanted', 'band_members', 'band_media', 'band_nummers', 'band_covers', 'band_invallers'];
          const muz = id => { const m = (S.data.musicians || []).find(x => x.id === id); if (!m) return null;
            return { id: m.id, weergavenaam: m.fname || m.first_name || m.username, username: m.username, avatar_url: m.avatar_url || null, musician_instruments: [] }; };
          db.from = (t) => { const q = echt(t); const run = q._run.bind(q);
            q._run = () => {
              if (q.op === 'insert' && (kind.includes(t) || t === 'bands')) (Array.isArray(q.payload) ? q.payload : [q.payload]).forEach(r => { if (r && !r.id) r.id = 'n' + (++teller); });
              const r = run();
              if (q.op !== 'select' || !r.data) return r;
              const rijen = Array.isArray(r.data) ? r.data : [r.data];
              if (t === 'bands') rijen.forEach(b => kind.forEach(k => { b[k] = (S.data[k] || []).filter(x => x.band_id === b.id).map(x => {
                const y = JSON.parse(JSON.stringify(x)); if (k === 'band_members') y.musicians = muz(x.musician_id); return y; }); }));
              return r; };
            return q; };
          currentUser = currentUser || { id: 'u1', email: 'test@talenttent.org' }; myMusicianId = 'm1'; hasOwnProfile = true;
          ['bands', 'band_members', 'band_wanted', 'band_media', 'band_nummers', 'band_covers', 'band_invallers'].forEach(k => { S.data[k] = []; });
          lookupPostcodeCity = async (pc) => pc === '2512' ? { found: true, city: 'Den Haag', source: 'pdok' } : { found: false, reason: 'notfound' };
          emailWachtOpBevestiging = async () => null;
          window.__b59Toasts = [];
          window.showToast = (t) => { window.__b59Toasts.push(t); window.__b59.toast(t); };
        }""")
        d59 = page.evaluate(r"""async () => {
          const S = window.TT_STUB, w = (n = 150) => new Promise(r => setTimeout(r, n)), u = {};
          const $ = id => document.getElementById(id);
          const zichtbaar = id => !!$(id) && $(id).offsetParent !== null;
          const pct = () => ($('bandWizardBalk').querySelector('.completeness-pct') || {}).textContent;
          const r = el => el.getBoundingClientRect();
          showView('bands'); await w(250);
          await showCreateBandForm(); await w(200);
          u.open = { wizard: bandWizardOpen(), kop: zichtbaar('mijnBandsKop'), lijst: zichtbaar('myBandsList'), stap: false,
                     staat: !!(history.state && history.state.wizard), pct: pct(),
                     magTerug: magTerug() };
          // Alleen de drie vragen; de velden van het oude formulier zijn weg.
          u.velden = [...$('createBandForm').querySelectorAll('input, .picker-field')].map(e => e.id);
          u.oud = ['bandDescription', 'bandStatusGrid', 'bandWantedField', 'bandLevelPicker', 'bandAvatarPreview', 'bandAvatarInput'].filter(id => $(id));
          u.titel = [$('createBandForm').querySelector('.panel-title').textContent, $('createBandForm').querySelector('.panel-sub').textContent];
          // UI-meting (huisstijl §2, §3, §6, §7).
          const naamVeld = $('bandName'), naamLabel = naamVeld.previousElementSibling, genreLabel = $('bandGenreField').previousElementSibling;
          const balk = $('bandWizardBalk').firstElementChild, titel = $('createBandForm').querySelector('.panel-title');
          const knoppen = [...$('createBandForm').querySelectorAll('.action-row .btn')];
          u.maten = { labelVeld: Math.round(r(naamVeld).top - r(naamLabel).bottom), balkTitel: Math.round(r(titel).top - r(balk).bottom),
                      veldH: Math.round(r(naamVeld).height), veldLetter: getComputedStyle(naamVeld).fontSize, labelLetter: getComputedStyle(naamLabel).fontSize,
                      zipH: Math.round(r($('bandZip')).height), genreH: Math.round(r($('bandGenreField')).height),
                      naamTotPostcode: Math.round(r($('bandZip').previousElementSibling).top - r(naamVeld).bottom),
                      genreLabelVeld: Math.round(r($('bandGenreField')).top - r(genreLabel).bottom),
                      knopH: knoppen.map(k => Math.round(r(k).height)), knopB: knoppen.map(k => Math.round(r(k).width)),
                      knopTekst: knoppen.map(k => k.textContent.trim()), links: Math.round(r(naamVeld).left), rechts: Math.round(390 - r(naamVeld).right) };
          // Alle drie de fouten tegelijk, bij hun veld (huisstijl §13.1).
          await saveBand(); await w(80);
          u.fouten = [...$('createBandForm').querySelectorAll('.field-error')].map(e => e.id);
          // De balk loopt 5% op per ingevuld veld.
          $('bandName').value = 'Nachtploeg'; $('bandName').dispatchEvent(new Event('input')); await w(30);
          u.naNaam = pct();
          onBandPostcodeInput('2512'); await w(700);
          u.naPostcode = [pct(), $('bandCity').value];
          openPickerList('bandGenre'); choosePickerListValue('Indie'); closePickerList(); await w(30);
          u.naGenre = [pct(), $('bandGenreField').classList.contains('field-error'), !!$('bandGenreField').parentElement.querySelector('.field-msg')];
          u.foutWegNaam = !$('bandName').classList.contains('field-error');
          // Opslaan: alleen naam, plaats en genres; de status volgt uit de open rollen.
          await saveBand(); await w(500);
          const band = S.data.bands[0] || {};
          u.opgeslagen = { aantal: S.data.bands.length, name: band.name, city: band.city, zip: band.zip, genres: band.genres, status: band.status,
                           founder: band.founder_id, bron: band.city_source,
                           extra: ['description', 'niveau', 'avatar_url'].filter(k => k in band),
                           leden: S.data.band_members.map(m => [m.band_id === band.id, m.musician_id, m.role, m.status]),
                           wanted: S.calls.filter(c => c.kind === 'rpc' && c.name === 'tt_save_band_wanted').length };
          u.na = { wizard: bandWizardOpen(), lijst: zichtbaar('myBandsList'), kop: zichtbaar('mijnBandsKop'), stap: false,
                   modal: $('view-profiel').classList.contains('active'), staat: history.state && !!history.state.wizard,
                   balk: ($('profielSchermContent').querySelector('.completeness-pct') || {}).textContent,
                   toast: window.__b59Toasts.slice(-1)[0], velden: [$('bandName').value, $('bandZip').value, bandState.genres.length] };
          await w(50);
          // TT-410b fase 2: de bandpagina is een scherm; terug naar Mijn Bands.
          showView('bands'); await w(200);
          // De terugknop in de kop: met iets ingevuld eerst de vraag, dan dicht.
          await showCreateBandForm(); await w(150);
          $('bandName').value = 'Proef'; $('bandName').dispatchEvent(new Event('input'));
          terugKnop(); await w(250);
          u.kopTerug1 = { wizard: bandWizardOpen(), vraag: $('terugLabel').style.display !== 'none', gewapend: terugGewapend, staat: history.state && !!history.state.wizard };
          terugKnop(); await w(250);
          u.kopTerug2 = { wizard: bandWizardOpen(), vraag: $('terugLabel').style.display !== 'none', lijst: zichtbaar('myBandsList'), view: huidigeView,
                          staat: history.state && !!history.state.wizard, leeg: $('bandName').value };
          // Zonder invoer gaat hij meteen dicht.
          await showCreateBandForm(); await w(150);
          terugKnop(); await w(250);
          u.kopTerugLeeg = { wizard: bandWizardOpen(), view: huidigeView, staat: history.state && !!history.state.wizard };
          // TT-408: onderin staat geen Terug-knop meer, alleen Band aanmaken.
          u.grotekopTerug = !!$('bandWizardTerugBtn');
          // Een andere view sluit de wizard zonder opslaan.
          await showCreateBandForm(); await w(150);
          $('bandName').value = 'Proef';
          showView('search'); await w(100);
          u.andereView = { wizard: bandWizardOpen(), stap: false, leeg: $('bandName').value };
          // Mijn Bands: de bandkaart.
          const id = band.id;
          showView('bands'); await w(300);
          const kaart = () => document.querySelector('#myBandsList .band-card');
          const tags = () => [...kaart().querySelectorAll('.tag-solid')].map(t => t.textContent);
          u.kaartAlleen = { tags: tags(), body: !!kaart().querySelector('.band-card-body'), leden: kaart().querySelectorAll('.band-member-chip, .band-members-row').length,
                            meta: kaart().querySelector('.band-meta').textContent, foto: getComputedStyle(kaart().querySelector('.band-avatar')).borderRadius };
          S.data.band_wanted.push({ band_id: id, instrument: 'Basgitaar' });
          await loadMyBands(); await w(100);
          u.kaartOpen = tags();
          const vlak = r(kaart().querySelector('.band-card-body .profile-badges')), lijn = r(kaart().querySelector('.band-card-body'));
          u.kaartTagAfstand = Math.round(vlak.top - lijn.top - parseFloat(getComputedStyle(kaart().querySelector('.band-card-body')).borderTopWidth));
          S.data.band_wanted = []; S.data.band_members.push({ band_id: id, musician_id: 'm2', role: 'Lid', status: 'bevestigd', founder_offer: null });
          await loadMyBands(); await w(100);
          u.kaartCompleet = tags();
          S.data.bands[0].pauze = true;
          await loadMyBands(); await w(100);
          u.kaartPauze = tags();
          // Een tik ergens op de kaart opent de bandpagina; het ⋯-menu niet.
          kaart().querySelector('.band-card-body').click(); await w(300);
          u.tikKaart = $('view-profiel').classList.contains('active');
          showView('bands'); await w(150); // TT-410b fase 2: de bandpagina is een scherm; terug naar de lijst
          // TT-433: de kaart heeft geen ⋯-menu en geen knop; alles staat op de bandpagina.
          u.kaartKnoppen = kaart().querySelectorAll('.nav-menu-btn, .inline-menu-dropdown, button').length;
          return u;
        }""")
        page.evaluate("""() => { const S = window.TT_STUB, w = window.__b59;
          db.from = w.from; hasOwnProfile = w.hasOwnProfile; myMusicianId = w.myMusicianId; currentUser = w.currentUser;
          lookupPostcodeCity = w.pc; emailWachtOpBevestiging = w.mail; window.showToast = w.toast;
          ['bands', 'band_members', 'band_wanted', 'band_media', 'band_nummers', 'band_covers', 'band_invallers'].forEach(k => { S.data[k] = []; });
          showView('about'); }""")
        j59 = lambda k: json.dumps(d59[k], ensure_ascii=False)
        check("Band aanmaken opent de wizard op de plek van de lijst, als laag van de app, op 0%",
              d59["open"] == {"wizard": True, "kop": False, "lijst": False, "stap": False, "staat": False, "pct": "0%",
                              "magTerug": True}, j59("open"))
        check("drie vragen: bandnaam, postcode en plaats, genres; de oude velden zijn weg",
              d59["velden"] == ["bandName", "bandZip", "bandCity", "bandGenreField"] and d59["oud"] == []
              and d59["titel"] == ["Band aanmaken", "Drie vragen, dan staat je band. De rest vul je later aan."], json.dumps([d59["velden"], d59["oud"], d59["titel"]], ensure_ascii=False))
        m = d59["maten"]
        check("UI: label tot veld 8px, tussen twee velden 20px, balk tot titel 8px, zijmarge 16px",
              m["labelVeld"] == 8 and m["genreLabelVeld"] == 8 and m["naamTotPostcode"] == 20 and m["balkTitel"] == 8
              and m["links"] == 16 and m["rechts"] == 16, j59("maten"))
        check("UI: velden 44px hoog met 16px letter, labels 14px; knoppen 44px, Band aanmaken over de volle breedte",
              m["veldH"] == 44 and m["zipH"] == 44 and m["genreH"] == 44 and m["veldLetter"] == "16px" and m["labelLetter"] == "14px"
              and all(h >= 44 for h in m["knopH"]) and m["knopTekst"] == ["Band aanmaken"], j59("maten"))
        check("leeg opslaan: alle drie de fouten tegelijk, bij hun veld", d59["fouten"] == ["bandName", "bandZip", "bandGenreField"], j59("fouten"))
        check("de balk loopt 5% op per ingevuld veld: 5, 10, 15%",
              d59["naNaam"] == "5%" and d59["naPostcode"] == ["10%", "Den Haag"] and d59["naGenre"][0] == "15%", json.dumps([d59["naNaam"], d59["naPostcode"], d59["naGenre"]]))
        check("een gekozen genre haalt de foutmarkering van het keuzeveld weg (§13.1), een getypte naam die van het naamveld",
              d59["naGenre"][1:] == [False, False] and d59["foutWegNaam"], json.dumps([d59["naGenre"], d59["foutWegNaam"]]))
        o = d59["opgeslagen"]
        check("opslaan bewaart naam, plaats, postcode en genres; de status volgt uit de open rollen (compleet); geen Gezocht meer",
              o["aantal"] == 1 and o["name"] == "Nachtploeg" and o["city"] == "Den Haag" and o["zip"] == "2512" and o["genres"] == ["Indie"]
              and o["status"] == "compleet" and o["founder"] == "m1" and o["bron"] == "pdok" and o["extra"] == [] and o["wanted"] == 0, j59("opgeslagen"))
        check("de oprichter is meteen bevestigd lid en beheerder", o["leden"] == [[True, "m1", "Oprichter", "bevestigd"]], j59("opgeslagen"))
        check("daarna: de privé bandpagina op 15%, met de melding; de wizard is dicht en leeg, zijn stap is terug",
              d59["na"] == {"wizard": False, "lijst": False, "kop": False, "stap": False, "modal": True, "staat": False, "balk": "15%",
                            "toast": "Nachtploeg staat. Vul hem aan wanneer je wilt.", "velden": ["", "", 0]}, j59("na"))
        check("terugknop in de kop met iets ingevuld: eerst 'Terug zonder opslaan?', de wizard blijft",
              d59["kopTerug1"] == {"wizard": True, "vraag": True, "gewapend": True, "staat": False}, j59("kopTerug1"))
        check("tweede druk: de wizard gaat dicht, leeg, terug op Mijn Bands",
              d59["kopTerug2"] == {"wizard": False, "vraag": False, "lijst": True, "view": "bands", "staat": False, "leeg": ""}, j59("kopTerug2"))
        check("terugknop zonder invoer: meteen dicht, één stap", d59["kopTerugLeeg"] == {"wizard": False, "view": "bands", "staat": False}, j59("kopTerugLeeg"))
        check("TT-408: Band aanmaken heeft geen grote Terug-knop meer", d59["grotekopTerug"] is False, j59("grotekopTerug"))
        check("een andere view sluit de wizard zonder opslaan", d59["andereView"] == {"wizard": False, "stap": False, "leeg": ""}, j59("andereView"))
        ka = d59["kaartAlleen"]
        check("bandkaart: vierkante foto, plaats en genres, geen leden; beheerder alleen zonder open rol: geen statustag",
              ka["tags"] == [] and ka["body"] is False and ka["leden"] == 0 and ka["meta"] == "Den Haag · Indie" and ka["foto"] == "10px", j59("kaartAlleen"))
        check("bandkaart met een open rol: Zoekend en de rol als tag, 12px onder de lijn",
              d59["kaartOpen"] == ["Zoekend", "+ Basgitaar"] and d59["kaartTagAfstand"] == 12, json.dumps([d59["kaartOpen"], d59["kaartTagAfstand"]]))
        check("bandkaart met een tweede lid: Compleet; niet beschikbaar (TT-457) verandert de tag niet",
              d59["kaartCompleet"] == ["Compleet"] and d59["kaartPauze"] == ["Compleet"], json.dumps([d59["kaartCompleet"], d59["kaartPauze"]]))
        check("een tik op de kaart opent de bandpagina; de kaart heeft zelf geen ⋯-menu en geen knop (TT-433)",
              d59["tikKaart"] is True and d59["kaartKnoppen"] == 0, json.dumps([d59["tikKaart"], d59["kaartKnoppen"]]))
        js59 = open(os.path.join(ROOT, "bands.js"), encoding="utf-8").read()
        css59 = open(os.path.join(ROOT, "styles.css"), encoding="utf-8").read()
        check("één functie voor de statustag (bandpagina en Mijn Bands); de dode code van het oude formulier is weg",
              js59.count("bandStatusLabel(") == 3 and not any(f in js59 for f in ["function selectBandStatus", "function renderBandLevelPicker",
              "function populateBandAvatarPreview", "function handleBandAvatarUpload", "function askRemoveBandAvatar", "p_instruments: bandState"])
              and ".band-member-chip" not in css59, str(js59.count("bandStatusLabel(")))
        check("geen paginafouten in blok 59", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # Blok 60 — TT-385 fase 5 (02-10-2026): de bandkaart in Zoeken, "We spelen even niet" uit Zoeken, het blok Bands
        # ------------------------------------------------------------------
        print("\nBlok 60 — de bandkaart in Zoeken en het blok Bands op het muzikantprofiel (TT-385, fase 5)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 390, "height": 844})
        page.evaluate("showView('about')")
        page.wait_for_timeout(80)
        # Zelfde opzet als blok 59: een band krijgt zijn geneste tabellen.
        page.evaluate(r"""() => {
          const S = window.TT_STUB;
          window.__b60 = { from: db.from, hasOwnProfile, myMusicianId, currentUser, view: bandViewMode, rpc: JSON.parse(JSON.stringify(S.rpcResults || {})) };
          const echt = db.from.bind(db);
          const kind = ['band_wanted', 'band_members', 'band_invallers'];
          db.from = (t) => { const q = echt(t); const run = q._run.bind(q);
            q._run = () => { const r = run();
              if (q.op !== 'select' || !r.data || t !== 'bands') return r;
              (Array.isArray(r.data) ? r.data : [r.data]).forEach(b => kind.forEach(k => { b[k] = (S.data[k] || []).filter(x => x.band_id === b.id).map(x => JSON.parse(JSON.stringify(x))); }));
              return r; };
            return q; };
          const morgen = new Date(Date.now() + 864e5), gisteren = new Date(Date.now() - 864e5);
          const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          window.__b60datum = { morgen: iso(morgen), gisteren: iso(gisteren) };
          S.data.bands = [
            { id: 'b5', name: 'Nachtploeg', city: 'Den Haag', genres: ['Indie', 'Rock', 'Pop'], status: 'zoekend', niveau: 3, avatar_url: 'https://x.supabase.co/storage/v1/object/public/avatars/bands/b5/f.jpg', pauze: false, founder_id: 'm1' },
            { id: 'b6', name: 'Zoutwater', city: 'Rijswijk', genres: ['Pop'], status: 'compleet', niveau: 3, avatar_url: null, pauze: false, founder_id: 'm2' },
            { id: 'b7', name: 'Stille Week', city: 'Delft', genres: ['Jazz'], status: 'inactief', niveau: 3, avatar_url: null, pauze: true, founder_id: 'm3' },
            { id: 'b8', name: 'Solo', city: 'Delft', genres: ['Folk'], status: 'compleet', niveau: 3, avatar_url: null, pauze: false, founder_id: 'm3' }
          ];
          S.data.band_members = [
            { band_id: 'b5', musician_id: 'm1', role: 'Oprichter', status: 'bevestigd' }, { band_id: 'b5', musician_id: 'm2', role: 'Lid', status: 'bevestigd' },
            { band_id: 'b6', musician_id: 'm2', role: 'Oprichter', status: 'bevestigd' }, { band_id: 'b6', musician_id: 'm3', role: 'Lid', status: 'bevestigd' },
            { band_id: 'b7', musician_id: 'm3', role: 'Oprichter', status: 'bevestigd' }, { band_id: 'b8', musician_id: 'm3', role: 'Oprichter', status: 'bevestigd' }
          ];
          S.data.band_wanted = [{ band_id: 'b5', instrument: 'Basgitaar' }, { band_id: 'b7', instrument: 'Drums' }];
          S.data.band_invallers = [{ band_id: 'b5', instrument: 'Drums', datum: window.__b60datum.morgen }, { band_id: 'b6', instrument: 'Zang', datum: window.__b60datum.gisteren },
                                   { band_id: 'b8', instrument: 'DJ', datum: window.__b60datum.morgen }];
          S.rpcResults.tt_search_bands_for_musician = () => ['b5', 'b6', 'b7', 'b8'].map((id, i) => ({ band_id: id, distance_km: 2 + i, score: 1 }));
          currentUser = currentUser || { id: 'u1', email: 'test@talenttent.org' }; myMusicianId = 'm1'; hasOwnProfile = true;
        }""")
        d60 = page.evaluate(r"""async () => {
          const S = window.TT_STUB, w = (n = 150) => new Promise(r => setTimeout(r, n)), u = {};
          const $ = id => document.getElementById(id), r = el => el.getBoundingClientRect();
          showView('search'); await w(200); setSearchMode('band'); await w(100);
          setBandViewMode('list'); await runBandSearch(); await w(200);
          const rijen = () => [...$('bandSearchResults').querySelectorAll('.result-row')];
          const rij = n => rijen().find(x => x.querySelector('.result-row-name').textContent === n);
          const tags = el => [...el.querySelectorAll('.tag-solid')].map(t => t.textContent);
          u.namen = rijen().map(x => x.querySelector('.result-row-name').textContent);
          const n = rij('Nachtploeg'), z = rij('Zoutwater'), s = rij('Solo');
          u.nacht = { tags: tags(n), status: (n.querySelector('.band-status-badge') || {}).textContent, foto: !!n.querySelector('.result-row-avatar img'),
                      hoek: getComputedStyle(n.querySelector('.result-row-avatar')).borderRadius, meta: n.querySelector('.result-row-meta').firstChild.textContent.trim() };
          u.zout = { tags: tags(z), status: (z.querySelector('.band-status-badge') || {}).textContent, t: !!z.querySelector('.result-row-avatar .avatar-t') };
          u.solo = { tags: tags(s), status: !!s.querySelector('.band-status-badge') };
          // UI: de badge staat 8px na de plaats; foto 44px; tags 8px onder de naamregel.
          const badge = n.querySelector('.band-status-badge'), av = n.querySelector('.result-row-avatar');
          u.maten = { badgeLinks: getComputedStyle(badge).marginLeft, badgeLetter: getComputedStyle(badge).fontSize, foto: [Math.round(r(av).width), Math.round(r(av).height)],
                      naam: getComputedStyle(n.querySelector('.result-row-name')).fontSize,
                      tagsUitlijning: Math.round(r(n.querySelector('.result-row-badges .tag-solid')).left - r(n.querySelector('.result-row-name')).left) };
          // Kaartweergave: vierkante foto, één regel tags.
          setBandViewMode('grid'); await w(100);
          const kaarten = [...$('bandSearchResults').querySelectorAll('.result-card')];
          const kaart = nm => kaarten.find(x => x.querySelector('.result-card-name').textContent === nm);
          const kf = kaart('Nachtploeg').querySelector('.result-card-photo');
          u.kaart = { namen: kaarten.map(x => x.querySelector('.result-card-name').textContent), vierkant: Math.round(r(kf).width) === Math.round(r(kf).height),
                      nacht: tags(kaart('Nachtploeg')), zout: tags(kaart('Zoutwater')), solo: kaart('Solo').querySelectorAll('.result-card-badges-line').length,
                      regels: kaart('Nachtploeg').querySelectorAll('.result-card-badges-line').length };
          setBandViewMode('list');
          // Alles op pauze: de app verruimt eerst, dan de lege staat (TT-62).
          S.data.bands.forEach(b => { b.pauze = true; b.status = 'inactief'; });
          const voor = S.calls.filter(c => c.kind === 'rpc' && c.name === 'tt_search_bands_for_musician').length;
          await runBandSearch(); await w(300);
          u.allesPauze = { stappen: S.calls.filter(c => c.kind === 'rpc' && c.name === 'tt_search_bands_for_musician').length - voor,
                           kop: ($('bandSearchResults').querySelector('.no-results p') || {}).textContent };
          S.data.bands.forEach(b => { b.pauze = b.id === 'b7'; b.status = b.id === 'b7' ? 'inactief' : 'zoekend'; });
          // Zonder eigen profiel: de publieke functie, zelfde kaart; de bandfoto is leeg bij afscherming.
          hasOwnProfile = false;
          S.rpcResults.tt_search_bands_anon = () => ['b5', 'b7'].map((id, i) => ({ band_id: id, distance_km: 2 + i, score: null }));
          S.rpcResults.tt_get_bands_public = (p) => (p.ids || []).map(id => ({ b5: { id: 'b5', name: 'Nachtploeg', city: 'Den Haag', genres: ['Indie'], status: 'zoekend', avatar_url: null, pauze: false,
              afgeschermd: true, members: [{ id: 'm1', role: 'Oprichter', instruments: ['Gitaar'] }, { id: 'm2', role: 'Lid', instruments: [] }], wanted: ['Basgitaar'],
              invallers: [{ instrument: 'Drums', datum: window.__b60datum.morgen }] },
            b7: { id: 'b7', name: 'Stille Week', city: 'Delft', genres: [], status: 'inactief', pauze: true, members: [], wanted: [], invallers: [] } }[id])).filter(Boolean);
          await runBandSearch(); await w(200);
          u.anon = { namen: rijen().map(x => x.querySelector('.result-row-name').textContent), tags: rijen()[0] ? tags(rijen()[0]) : [],
                     t: !!(rijen()[0] && rijen()[0].querySelector('.result-row-avatar .avatar-t')), status: rijen()[0] && (rijen()[0].querySelector('.band-status-badge') || {}).textContent };
          hasOwnProfile = true;
          // Het blok Bands op Mijn Profiel.
          S.rpcResults.tt_musician_band_ids = (p) => p.mid === 'm1' ? [{ band_id: 'b5' }, { band_id: 'b8' }] : [];
          S.rpcResults.tt_get_bands_public = (p) => (p.ids || []).map(id => ({
            b5: { id: 'b5', name: 'Nachtploeg', avatar_url: 'https://x.supabase.co/storage/v1/object/public/avatars/bands/b5/f.jpg', members: [{ id: 'm1', role: 'Oprichter', instruments: ['Gitaar', 'Zang'] }] },
            b8: { id: 'b8', name: 'Solo', avatar_url: null, members: [{ id: 'm3', role: 'Oprichter', instruments: [] }, { id: 'm1', role: 'Lid', instruments: ['Gitaar'] }] } }[id])).filter(Boolean);
          showView('about'); await w(50);
          document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
          $('view-myprofile').classList.add('active');
          const eigen = $('myProfileContent');
          const m = { id: 'm1', fname: 'Ronald', lname: 'W', username: 'ronald', bio: 'Gitarist en zanger.', city: 'Den Haag', age: 25,
                      musician_songs: [{ song_title: 'A', song_artist: 'B', mastery_level: 'kan_ik' }], musician_media: [], musician_wanted: [],
                      musician_instruments: [{ instrument: 'Gitaar', niveau: 3 }], musician_genres: [{ genre: 'Rock' }] };
          m.bands = await profielBandsOphalen('m1');
          eigen.innerHTML = buildMusicianDetailHTML(m, true, false);
          const blok = [...eigen.querySelectorAll('.profile-media')].find(x => x.querySelector('.profile-media-title').textContent === 'Bands');
          const bandRijen = blok ? [...blok.querySelectorAll('.bb-rij-knop')] : [];
          u.blok = { er: !!blok, rijen: bandRijen.map(x => [x.querySelector('.bb-naam').textContent, (x.querySelector('.bb-sub') || {}).textContent || '']),
                     naBio: blok && blok.previousElementSibling && blok.previousElementSibling.textContent === 'Gitarist en zanger.',
                     voorRepertoire: blok && blok.nextElementSibling && blok.nextElementSibling.classList.contains('profile-songs'),
                     knop: bandRijen[0] && bandRijen[0].tagName, t: !!(bandRijen[1] && bandRijen[1].querySelector('.bb-foto-t')) };
          if (blok) {
            const titel = blok.querySelector('.profile-media-title'), eerste = bandRijen[0], foto = eerste.querySelector('.bb-foto');
            u.blokMaten = { titelRij: Math.round(r(eerste).top - r(titel).bottom), rijH: Math.round(r(eerste).height), links: Math.round(r(eerste).left), rechts: Math.round(390 - r(eerste).right),
                            foto: [Math.round(r(foto).width), Math.round(r(foto).height), getComputedStyle(foto).borderRadius],
                            naam: [getComputedStyle(eerste.querySelector('.bb-naam')).fontSize, getComputedStyle(eerste.querySelector('.bb-naam')).fontWeight],
                            sub: getComputedStyle(eerste.querySelector('.bb-sub')).fontSize, rand: getComputedStyle(bandRijen[1]).borderBottomWidth };
            // Een tik opent de bandpagina.
            const echtOpen = window.openBandScherm; let geopend = null; window.openBandScherm = (id) => { geopend = id; };
            eerste.click(); window.openBandScherm = echtOpen; u.tik = geopend;
          }
          // Geen bands: geen blok. Een fout: geen blok, wel in de foutlog.
          m.bands = await profielBandsOphalen('m9'); eigen.innerHTML = buildMusicianDetailHTML(m, true, false);
          u.geen = [...eigen.querySelectorAll('.profile-media-title')].map(x => x.textContent).includes('Bands');
          appErrorLogCount = 0; // de teller van 20 is per paginabezoek; deze controle toetst de logregel, niet de teller
          S.rpcErrors.tt_musician_band_ids = { code: '42883', message: 'function does not exist' };
          const logVoor = (S.data.app_error_log || []).length;
          m.bands = await profielBandsOphalen('m1'); eigen.innerHTML = buildMusicianDetailHTML(m, true, false);
          u.fout = { blok: [...eigen.querySelectorAll('.profile-media-title')].map(x => x.textContent).includes('Bands'), log: (S.data.app_error_log || []).length - logVoor };
          delete S.rpcErrors.tt_musician_band_ids;
          eigen.innerHTML = '';
          // In het venster, ook voor een bezoeker zonder profiel.
          hasOwnProfile = false; myMusicianId = null;
          S.rpcResults.tt_get_musicians_public = [{ id: 'm1', username: 'ronald', age: 25, city: 'Den Haag', bio: 'Gitarist en zanger.', instrument_levels: [], genres: [], songs: [], media: [] }];
          await openProfielScherm('m1'); await w(100);
          u.venster = [...$('profielSchermContent').querySelectorAll('.bb-rij-knop .bb-naam')].map(x => x.textContent);
          u.vensterVraag = S.calls.filter(c => c.kind === 'rpc' && c.name === 'tt_musician_band_ids').slice(-1).map(c => c.params)[0];
          showView('about');
          return u;
        }""")
        page.evaluate("""() => { const S = window.TT_STUB, w = window.__b60;
          db.from = w.from; hasOwnProfile = w.hasOwnProfile; myMusicianId = w.myMusicianId; currentUser = w.currentUser;
          S.rpcResults = w.rpc; setBandViewMode(w.view);
          ['bands', 'band_members', 'band_wanted', 'band_invallers'].forEach(k => { S.data[k] = []; });
          showView('about'); }""")
        j60 = lambda k: json.dumps(d60.get(k), ensure_ascii=False)
        check("Zoeken: een band die niet beschikbaar is (pauze) staat er gewoon tussen (TT-457)",
              d60["namen"] == ["Nachtploeg", "Zoutwater", "Stille Week", "Solo"], j60("namen"))
        check("bandrij: vierkante bandfoto (hoek 10px), Zoekend achter de plaats, open rol en invaller als tag, dan twee genres en +1",
              d60["nacht"] == {"tags": ["+ Basgitaar", "Invaller drums", "Indie", "Rock", "+1"], "status": "Zoekend", "foto": True, "hoek": "10px", "meta": "Den Haag · 2.0 km"}, j60("nacht"))
        check("bandrij: een invaller van gisteren telt niet; zonder foto de T; Compleet",
              d60["zout"] == {"tags": ["Pop"], "status": "Compleet", "t": True}, j60("zout"))
        check("bandrij: beheerder alleen zonder open rol: geen statustag; DJ blijft DJ",
              d60["solo"] == {"tags": ["Invaller DJ", "Folk"], "status": False}, j60("solo"))
        mt = d60["maten"]
        check("UI: statustag 8px na de plaats, 11px; foto 44×44; naam 16px; tags op één lijn met de naam",
              mt["badgeLinks"] == "8px" and mt["badgeLetter"] == "11px" and mt["foto"] == [44, 44] and mt["naam"] == "16px" and mt["tagsUitlijning"] == 0, j60("maten"))
        check("kaartweergave: vierkante foto, één regel tags (eerste open rol met +N, anders de status)",
              d60["kaart"] == {"namen": ["Nachtploeg", "Zoutwater", "Stille Week", "Solo"], "vierkant": True, "nacht": ["+ Basgitaar", "+1"],
                               "zout": ["Compleet"], "solo": 1, "regels": 1}, j60("kaart"))
        check("alle bands niet beschikbaar (TT-457): ze staan er allemaal, de app verruimt niet en toont geen lege staat",
              d60["allesPauze"]["stappen"] == 1 and d60["allesPauze"]["kop"] is None, j60("allesPauze"))
        check("zonder eigen profiel: zelfde kaart uit tt_get_bands_public; afgeschermd de T; pauze eruit",
              d60["anon"] == {"namen": ["Nachtploeg", "Stille Week"], "tags": ["+ Basgitaar", "Invaller drums", "Indie"], "t": True, "status": "Zoekend"}, j60("anon"))
        b = d60["blok"]
        check("Mijn Profiel: blok Bands direct onder de bio, vóór het repertoire; één knop per band",
              b["er"] and b["naBio"] and b["voorRepertoire"] and b["knop"] == "BUTTON", j60("blok"))
        check("blok Bands: naam, instrumenten en Beheerder; zonder bandfoto de T",
              b["rijen"] == [["Nachtploeg", "Gitaar · Zang · Beheerder"], ["Solo", "Gitaar"]] and b["t"], j60("blok"))
        bm = d60["blokMaten"]
        check("UI blok Bands: titel tot rij 8px, rij 56px plus de lijn (tikvlak ≥ 44), zijmarge 16px, foto 40×40 vierkant 8px, naam 16px vet, regel 12px, geen lijn onder de laatste",
              bm["titelRij"] == 8 and bm["rijH"] == 57 and bm["links"] == 16 and bm["rechts"] == 16 and bm["foto"] == [40, 40, "8px"]
              and bm["naam"] == ["16px", "700"] and bm["sub"] == "12px" and bm["rand"] == "0px", j60("blokMaten"))
        check("een tik op een band opent de bandpagina", d60["tik"] == "b5", j60("tik"))
        check("geen bands: geen blok; een fout: geen blok, wel een regel in de foutlog",
              d60["geen"] is False and d60["fout"] == {"blok": False, "log": 1}, json.dumps([d60["geen"], d60["fout"]]))
        check("het muzikantvenster, ook zonder eigen profiel, toont hetzelfde blok",
              d60["venster"] == ["Nachtploeg", "Solo"] and d60["vensterVraag"] == {"mid": "m1"}, json.dumps([d60["venster"], d60["vensterVraag"]]))
        js60 = open(os.path.join(ROOT, "search.js"), encoding="utf-8").read()
        css60 = open(os.path.join(ROOT, "styles.css"), encoding="utf-8").read()
        check("de statustag in Zoeken komt uit bandStatusLabel(); de oude statuslabels en kleuren zijn weg",
              "bandStatusLabel(" in js60 and "statusLabels" not in js60 and ".band-status-compleet" not in css60
              and ".result-card-badges {" not in css60 and "musicians(fname)" not in js60, "")
        check("geen paginafouten in blok 60", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # Blok 61 — TT-253, TT-402, TT-403 (02-10-2026): Lid uitnodigen als Zoeken, licht met meer contrast, het deelteken
        # ------------------------------------------------------------------
        print("\nBlok 61 — Lid uitnodigen volgt Zoeken, licht heeft contrast, het deelteken is gesloten (TT-253, TT-402, TT-403)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 390, "height": 844})
        d61 = page.evaluate(r"""async () => {
          const w = ms => new Promise(z => setTimeout(z, ms));
          const uit = {};
          const S = window.TT_STUB;
          S.data.musicians = [{ id: 'm5', fname: 'Eku', username: 'eku', city: 'Delft', accepts_band_invites: true,
            musician_instruments: [{ instrument: 'Drums' }] }];
          openAddMemberModal('b1', 'Van Delft');
          const box = document.querySelector('#addMemberModal .modal-box');
          uit.geenSelect = !box.querySelector('select') && !box.querySelector('input[type=number]');
          uit.keuzeveld = !!box.querySelector('#memberSearchInstrumentsField.picker-field');
          uit.wielveld = !!box.querySelector('.filter-row-city #memberSearchRadiusField.wheel-field');
          uit.straalBreed = Math.round(document.getElementById('memberSearchRadiusField').getBoundingClientRect().width);
          uit.straalTekst = document.querySelector('#memberSearchRadiusField .wheel-field-label').textContent;
          uit.geenStijl = [...box.querySelectorAll('input, .field, .filter-row-city')].every(e => !e.getAttribute('style'));
          // Een instrument kiezen zoekt meteen, zonder naam.
          openPickerList('memberSearchInstruments'); choosePickerListValue('Drums'); await w(500);
          uit.badge = document.getElementById('memberSearchInstrumentsBadgeRow').textContent.trim();
          uit.gezocht = !/Typ minimaal/.test(document.getElementById('memberSearchResults').textContent);
          // Opnieuw openen: instrument en straal leeg.
          setWheelFieldValues('memberRadius', ['25'], false);
          openAddMemberModal('b1', 'Van Delft');
          uit.leegNaOpenen = memberSearchInstruments.length === 0 && document.getElementById('memberSearchRadius').value === ''
            && document.getElementById('memberSearchInstrumentsBadgeRow').innerHTML.trim() === '';
          document.getElementById('addMemberModal').classList.remove('visible');
          // Het deelteken: drie gesloten stippen.
          const t = document.createElement('div'); t.innerHTML = deelKnopHTML('band', 'b1', 'X');
          const c = [...t.querySelectorAll('circle')];
          uit.gesloten = c.length === 3 && c.every(e => (e.getAttribute('fill') || e.closest('svg').getAttribute('fill')) === 'currentColor' && e.getAttribute('stroke') === 'none');
          // Licht: ondergrond, vlak, veldrand en gedempte tekst.
          const r = document.documentElement; const was = r.getAttribute('data-theme');
          r.setAttribute('data-theme', 'licht'); const cs = getComputedStyle(r);
          uit.licht = ['--bg', '--surface', '--field-border', '--muted', '--border'].map(v => cs.getPropertyValue(v).trim());
          if (was) r.setAttribute('data-theme', was); else r.removeAttribute('data-theme');
          return uit;
        }""")
        check("TT-253: geen zichtbare keuzelijst en geen kaal getalveld meer", d61["geenSelect"], json.dumps(d61))
        check("TT-253: instrument is een keuzeveld, straal een wielveld naast Plaats", d61["keuzeveld"] and d61["wielveld"], json.dumps(d61))
        check("TT-253: het wielveld is 104px of breder en start op Alle", d61["straalBreed"] >= 104 and d61["straalTekst"] == "Alle", json.dumps(d61))
        check("TT-253: geen losse style= op de velden (huisstijl §3)", d61["geenStijl"], "")
        check("TT-253: een instrument kiezen toont een badge en zoekt", "Drums" in d61["badge"] and d61["gezocht"], json.dumps(d61))
        check("TT-253: opnieuw openen begint leeg", d61["leegNaOpenen"], "")
        check("TT-403: het deelteken heeft drie gesloten stippen", d61["gesloten"], "")
        def _lum(h):
            h = h.lstrip('#'); c = [int(h[i:i+2], 16) / 255 for i in (0, 2, 4)]
            c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
            return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
        def _ratio(a, b):
            x, y = sorted([_lum(a), _lum(b)]); return (y + 0.05) / (x + 0.05)
        bg61, vlak61, veld61, gedempt61, rand61 = d61["licht"]
        check("TT-402: licht, de veldrand haalt 3:1 op het vlak", _ratio(veld61, vlak61) >= 3, json.dumps(d61["licht"]))
        check("TT-402: licht, gedempte tekst haalt 4,5:1 op het vlak", _ratio(gedempt61, vlak61) >= 4.5, json.dumps(d61["licht"]))
        check("TT-402: licht, de ondergrond blijft licht crème (herzien)", bg61.upper() == "#F6F3EC", json.dumps(d61["licht"]))
        check("TT-402: licht, de veldrand haalt 3:1 op de ondergrond", _ratio(veld61, bg61) >= 3, json.dumps(d61["licht"]))
        check("geen paginafouten in blok 61", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # Blok 62 — TT-404, TT-405 (03-10-2026): terug op dezelfde plek, een nieuw e-mailadres komt in de sessie
        # ------------------------------------------------------------------
        print("\nBlok 62 — terug op dezelfde plek; nieuw e-mailadres in de sessie (TT-404, TT-405)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 390, "height": 844})
        d62 = page.evaluate(r"""async () => {
          const w = ms => new Promise(z => setTimeout(z, ms));
          const uit = {};
          const S = window.TT_STUB;
          uit.handmatig = history.scrollRestoration;
          hasOwnProfile = false; currentUser = null; myMusicianId = null; filterInstruments = [];
          S.rpcResults.tt_resolve_search_origin = [{ lat: 52, lng: 4.3 }];
          const ids = [...Array(40).keys()].map(i => 'm' + (i + 2));
          S.rpcResults.tt_search_musicians_anon = S.rpcResults.tt_search_musicians = () => ids.map((id, i) => ({ musician_id: id, distance_km: i + 1, is_stale: false }));
          S.rpcResults.tt_get_musicians_public = ids.map(id => ({ id, username: 'u' + id, age: 30, city: 'Delft', bio: '', goal: null,
            profile_color: '#f5c518', avatar_url: null, updated_at: new Date().toISOString(),
            instrument_levels: [{ instrument: 'Drums', niveau: 3 }], genres: ['Rock'], songs: [] }));
          showView('search'); setSearchMode('musician'); await w(700);
          document.getElementById('filterCity').value = 'Delft'; document.getElementById('filterRadius').value = '50';
          hasOwnProfile = false;
          await runSearch(); await w(300);
          uit.kaarten = document.querySelectorAll('#searchResults [onclick*=openProfielScherm]').length;
          window.scrollTo({ top: 1500, behavior: 'instant' }); await w(150);
          // Een andere view en terug: de scrollstand van Zoeken komt terug.
          // Zoeken laadt bij het openen opnieuw (TT-10); hier niet, want de
          // stub levert die tweede keer iets anders dan de eerste.
          const echteZoek = runSearch; runSearch = async () => {};
          showView('about'); await w(700);
          uit.opAbout = Math.round(window.scrollY);
          history.back(); await w(700);
          uit.naViewTerug = Math.round(window.scrollY);
          uit.actief = [...document.querySelectorAll('.app-view.active')].map(e => e.id).join();
          runSearch = echteZoek; hasOwnProfile = false;
          const kaart = () => [...document.querySelectorAll('#searchResults [onclick*=openProfielScherm]')][12];
          window.scrollTo({ top: 1500, behavior: 'instant' }); await w(150);
          kaart().click(); await w(500);
          history.back(); await w(500);
          uit.naTerug = Math.round(window.scrollY);
          uit.modalDicht = !document.querySelector('.modal-overlay.visible');
          kaart().click(); await w(500);
          document.getElementById('navTerugBtn').click(); await w(500);
          uit.naKruisje = Math.round(window.scrollY);
          // Een gewone navigatie begint bovenaan.
          window.scrollTo({ top: 900, behavior: 'instant' }); await w(150);
          showView('about'); await w(900);
          uit.nieuweNav = Math.round(window.scrollY);
          // TT-405: na het aanpassen van het e-mailadres kent de sessie het nieuwe.
          currentUser = { id: 'u1', email: 'fout@talenttent.org' };
          S.refreshUser = { id: 'u1', email: 'goed@talenttent.org' };
          bevestigApi = async () => ({ ok: true, email: 'goed@talenttent.org' });
          const vak = document.createElement('div'); vak.id = 'bevestigEmailadresVak';
          vak.innerHTML = '<input id="bevestigNieuwEmailadres" value="goed@talenttent.org"><button id="bevestigEmailadresBtn"></button>';
          document.body.appendChild(vak);
          await bevestigEmailadresOpslaan(); await w(100);
          uit.sessieEmail = currentUser.email;
          uit.verversd = S.calls.some(c => c.kind === 'auth' && c.name === 'refreshSession');
          vak.remove();
          // Nieuwe sessie: de opgeslagen sessie heeft het oude e-mailadres, de server het nieuwe.
          S.session = { user: { id: 'u1', email: 'fout@talenttent.org' } };
          S.userNu = { id: 'u1', email: 'goed@talenttent.org' };
          currentUser = null;
          await appInit(); await w(300);
          uit.nieuweSessieEmail = currentUser && currentUser.email;
          S.userNu = null; S.session = null; currentUser = null;
          return uit;
        }""")
        check("TT-404: de browser zet de scrollstand niet meer zelf terug", d62["handmatig"] == "manual", json.dumps(d62))
        check("TT-404: een venster sluiten via terug laat Zoeken staan waar je was", d62["modalDicht"] and abs(d62["naTerug"] - 1500) <= 2, json.dumps(d62))
        check("TT-404: de pijl in het venster doet hetzelfde", abs(d62["naKruisje"] - 1500) <= 2, json.dumps(d62))
        check("TT-404: een andere view opent bovenaan", d62["opAbout"] <= 2, json.dumps(d62))
        check("TT-404: terug naar Zoeken komt uit waar je was", d62["actief"] == "view-search" and abs(d62["naViewTerug"] - 1500) <= 2, json.dumps(d62))
        check("TT-404: een gewone navigatie begint nog steeds bovenaan", d62["nieuweNav"] <= 2, json.dumps(d62))
        check("TT-405: de sessie wordt ververst na een nieuw e-mailadres", d62["verversd"], json.dumps(d62))
        check("TT-405: het nieuwe e-mailadres staat daarna in de app", d62["sessieEmail"] == "goed@talenttent.org", json.dumps(d62))
        check("TT-405: een nieuwe sessie toont het e-mailadres van de server, niet van de opgeslagen sessie", d62["nieuweSessieEmail"] == "goed@talenttent.org", json.dumps(d62))
        check("geen paginafouten in blok 62", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ─────────────────────────────────────────────────────────────
        # Blok 63 — TT-407 (03-10-2026): een tik bereikt de knop, en een
        # gesloten venster vangt geen tik af.
        # Aanleiding: `.profiel-kop-rij > * { pointer-events: auto }` won van
        # de `none` van het gesloten venster. De onzichtbare deel- en ⋯-knoppen
        # lagen boven Band aanmaken, de tabbladen in Zoeken en de eerste rij in
        # Berichten. Elke andere controle klikte met element.click(), en dat
        # slaat het hit-testen over: alles slaagde, terwijl een echte tik
        # niets deed. Deze controle test zoals een vinger: wat zit er op dit punt?
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 63 — een tik bereikt de knop; een gesloten venster vangt niets af (TT-407)")
        page.evaluate("window.TT_STUB.reset()")
        page.evaluate("showView('landing')")
        page.wait_for_timeout(300)
        d63 = page.evaluate("""async () => {
          const w = ms => new Promise(r => setTimeout(r, ms));
          const uit = { dicht: [], bedekt: [], gemeten: 0 };
          // 1. Gesloten vensters: geen enkel onderdeel mag een tik opvangen.
          document.querySelectorAll('.modal-overlay:not(.visible)').forEach(m => {
            m.querySelectorAll('*').forEach(e => {
              if (getComputedStyle(e).pointerEvents !== 'none') {
                const r = e.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) uit.dicht.push(m.id + ' > ' + (e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className || e.tagName));
              }
            });
          });
          // 2. Elke zichtbare knop: vijf punten, de tik moet de knop zelf raken.
          const SEL = 'button, a[href], [onclick], .tag, .level-btn, .segmented-btn, .search-mode-tab, .goal-card';
          for (const v of ['landing', 'auth', 'register', 'search', 'about', 'privacy', 'terms', 'gedragscode']) {
            showView(v); await w(450);
            const els = [...document.querySelectorAll(SEL)].filter(e => {
              const r = e.getBoundingClientRect(), cs = getComputedStyle(e);
              if (!(r.width > 4 && r.height > 4) || cs.display === 'none' || cs.visibility === 'hidden' || e.disabled) return false;
              if (e.closest('.modal-overlay:not(.visible)') || e.closest('.app-view:not(.active)')) return false;
              for (let n = e; n && n !== document.body; n = n.parentElement) {
                const s = getComputedStyle(n);
                if (s.opacity === '0' || s.visibility === 'hidden' || s.display === 'none') return false;
              }
              return true;
            });
            for (const e of els) {
              e.scrollIntoView({ block: 'center' }); await w(20);
              const r = e.getBoundingClientRect();
              for (const [fx, fy] of [[.5, .5], [.15, .2], [.85, .2], [.15, .8], [.85, .8]]) {
                const x = r.left + r.width * fx, y = r.top + r.height * fy;
                if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
                const t = document.elementFromPoint(x, y);
                // Een laag die dezelfde handeling doet (het Wijzig-bolletje op de foto) telt niet als bedekt.
                const zelfde = t && e.getAttribute('onclick') && (t.closest('[onclick]') || t).getAttribute('onclick') === e.getAttribute('onclick');
                if (!(t === e || e.contains(t) || zelfde)) {
                  uit.bedekt.push(v + ': ' + (e.innerText || e.id || e.tagName).trim().slice(0, 24).replace(/\\n/g, ' ') + ' @' + Math.round(x) + ',' + Math.round(y));
                  break;
                }
              }
              uit.gemeten++;
            }
          }
          showView('landing');
          return uit;
        }""")
        check("TT-407: een gesloten venster vangt geen tik af", not d63["dicht"], json.dumps(d63["dicht"][:6]))
        check("TT-407: elke knop in elke view wordt door een echte tik bereikt", not d63["bedekt"], json.dumps(d63["bedekt"][:6]))
        check("TT-407: de controle heeft knoppen gemeten", d63["gemeten"] >= 30, str(d63["gemeten"]))
        check("geen paginafouten in blok 63", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ─────────────────────────────────────────────────────────────
        # Blok 64 — TT-408 (06-10-2026): één pad voor alle manieren terug.
        # A: de grote Terug-knop onderin een bewerkscherm voegde een stap toe;
        #    de knoppen zijn weg. B: met twee vensters open sloot de terugknop
        #    het onderste. C: het verplichte gebruikersnaamscherm sloot met de
        #    terugknop van het toestel. Wat er nog "Terug" heet, is een
        #    stap in de wizard.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 64 — één pad voor alle manieren terug (TT-408)")
        page.evaluate("window.TT_STUB.reset()")
        page.evaluate("showView('landing')")
        page.wait_for_timeout(300)
        d64 = page.evaluate("""async () => {
          const w = ms => new Promise(r => setTimeout(r, ms));
          const $ = id => document.getElementById(id);
          const pop = () => history.back();
          const uit = {};
          // B: eerst het venster dat DOM-eerst staat, dan een later venster erbovenop.
          $('confirmModal').classList.add('visible'); await w(30);
          $('meldModal').classList.add('visible'); await w(30);
          uit.zOnder = parseInt($('confirmModal').style.zIndex || 0, 10) < parseInt($('meldModal').style.zIndex || 0, 10);
          pop(); await w(80);
          uit.boven = { onderOpen: $('confirmModal').classList.contains('visible'), bovenOpen: $('meldModal').classList.contains('visible') };
          pop(); await w(80);
          uit.daarna = { onderOpen: $('confirmModal').classList.contains('visible') };
          $('confirmModal').classList.remove('visible'); $('meldModal').classList.remove('visible'); await w(30);
          // C: het verplichte scherm blijft staan.
          $('usernameGateModal').classList.add('visible'); await w(30);
          pop(); await w(80);
          uit.verplicht = $('usernameGateModal').classList.contains('visible');
          $('usernameGateModal').classList.remove('visible'); await w(30);
          // A: geen grote Terug-knop meer buiten de wizardstappen.
          const terugKnoppen = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === 'Terug');
          uit.terugOverig = terugKnoppen.filter(b => !/^prevStep/.test(b.getAttribute('onclick') || '')).map(b => b.getAttribute('onclick'));
          uit.wizardStappen = terugKnoppen.length - uit.terugOverig.length;
          uit.keuzeknoppen = ['confirmModal', 'deleteAccountModal', 'meldModal']
            .map(id => [...$(id).querySelectorAll('.btn-ghost')].map(b => b.textContent.trim())[0]);
          return uit;
        }""")
        check("TT-408 B: een later geopend venster ligt bovenop", d64["zOnder"], json.dumps(d64))
        check("TT-408 B: de terugknop sluit het bovenste venster, niet het onderste",
              d64["boven"] == {"onderOpen": True, "bovenOpen": False} and d64["daarna"]["onderOpen"] is False, json.dumps(d64))
        check("TT-408 C: het verplichte gebruikersnaamscherm sluit niet met de terugknop", d64["verplicht"], json.dumps(d64))
        check("TT-408 A: geen grote Terug-knop meer buiten de wizardstappen", d64["terugOverig"] == [], json.dumps(d64))
        check("TT-408: de wizard houdt zijn vijf Terug-knoppen", d64["wizardStappen"] == 5, json.dumps(d64))
        check("TT-408: in een keuzevraag heet de knop Annuleren", d64["keuzeknoppen"] == ["Annuleren"] * 3, json.dumps(d64))
        # TT-408 stap 3 (06-10-2026, besluit Ronald: "alle velden waar het kruisje
        # overbodig is kan je het kruisje weghalen"): het kruisje blijft alleen
        # staan waar het de enige uitgang is.
        d64k = page.evaluate("""() => {
          const uit = { zonderUitgang: [], metKruis: [], zonderKruis: [] };
          const uitTekst = /^(Annuleren|Klaar|Gereed|Sluiten|Uitloggen)$/;
          // Een bladwijzer (.wheel-overlay) is geen scherm: een tik ernaast sluit hem (huisstijl §7.1).
          for (const ov of document.querySelectorAll('.modal-overlay:not(.wheel-overlay)')) {
            const was = ov.classList.contains('visible');
            ov.classList.add('visible');
            const zichtbaar = (e) => e.getClientRects().length > 0 && getComputedStyle(e).visibility !== 'hidden';
            const kruis = [...ov.querySelectorAll('.modal-close')].filter(zichtbaar).length;
            const pijl = [...ov.querySelectorAll('.kop-terug, .modal-back')].filter(zichtbaar).length;
            const knop = [...ov.querySelectorAll('button')].filter(b => zichtbaar(b) && uitTekst.test(b.textContent.trim())).length;
            if (kruis) uit.metKruis.push(ov.id); else uit.zonderKruis.push(ov.id);
            if (!kruis && !pijl && !knop) uit.zonderUitgang.push(ov.id);
            if (!was) ov.classList.remove('visible');
          }
          // De instrumentkeuze, stap 1: geen pijl en geen voet, dus het kruisje is de uitgang.
          const ins = document.getElementById('instrumentLevelModal');
          uit.instrumentKruis = !!ins.querySelector('.modal-close');
          return uit;
        }""")
        check("TT-408: elk venster zonder kruisje heeft een andere zichtbare uitgang (pijl of knop)",
              d64k["zonderUitgang"] == [], json.dumps(d64k["zonderUitgang"]))
        for vid in ("deleteAccountModal", "meldModal"):
            check(f"TT-408: {vid} heeft geen kruisje meer", vid in d64k["zonderKruis"], json.dumps(d64k))
        check("TT-408: de instrumentkeuze houdt zijn kruisje (de lijst heeft verder geen uitgang)", d64k["instrumentKruis"], json.dumps(d64k))
        check("TT-408: er zijn tien kruisjes over", len(re.findall(r'<button class="modal-close"', open(os.path.join(ROOT, "index.html"), encoding="utf-8").read())) == 10, "")
        check("geen paginafouten in blok 64", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ─────────────────────────────────────────────────────────────
        # Blok 65 — bevindingen 06-10-2026: band verlaten ververst Mijn Profiel
        # en meldt een geweigerde verwijdering; het blok "bevestig je
        # e-mailadres" is te sluiten; geen terugknop en geen onderbalk op de
        # landingspagina.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 65 — band verlaten, blok bevestigen sluiten, landing zonder terug en onderbalk (bevindingen 06-10-2026)")
        page.evaluate("window.TT_STUB.reset()")
        d65 = page.evaluate("""async () => {
          const w = ms => new Promise(r => setTimeout(r, ms));
          const uit = {};
          const oudFrom = db.from.bind(db), oudToast = window.showToast, oudLoad = window.loadMyProfile, oudMy = myMusicianId;
          const toasts = []; window.showToast = t => toasts.push(t);
          window.loadMyProfile = () => {};
          // 1. Het blok bevestigen.
          currentUser = { id: 'u1', email: 'test@example.com' };
          db.from = t => t === 'musicians'
            ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { wacht_op_bevestiging: true }, error: null }) }) }) }
            : oudFrom(t);
          try { sessionStorage.removeItem('tt-bevestig-melding-dicht'); } catch (e) {}
          await renderEmailBevestigBanner();
          const vak = () => document.getElementById('emailBevestigBanner');
          uit.blokOpen = !!vak().querySelector('.melding');
          uit.kruisje = !!vak().querySelector('.melding .modal-close');
          vak().querySelector('.modal-close')?.click();
          uit.naSluiten = vak().innerHTML.trim();
          await renderEmailBevestigBanner();
          uit.naHerladen = vak().innerHTML.trim();
          try { sessionStorage.removeItem('tt-bevestig-melding-dicht'); } catch (e) {}
          await renderEmailBevestigBanner();
          uit.terugBijNieuweSessie = !!vak().querySelector('.melding');
          // 2. Band verlaten: de verwijdering wordt geweigerd (0 rijen).
          myMusicianId = 'm1';
          let rijen = [];
          db.from = t => t === 'band_members'
            ? { delete: () => { const k = { eq: () => k, select: async () => ({ data: rijen, error: null }) }; return k; },
                select: (...a) => oudFrom(t).select(...a) }
            : oudFrom(t);
          let geladen = 0; window.loadMyProfile = () => { geladen++; };
          showView('myprofile'); geladen = 0;
          await executeLeaveBand('b1'); await w(50);
          uit.geweigerd = { toast: toasts.slice(), profielGeladen: geladen };
          toasts.length = 0; rijen = [{ musician_id: 'm1' }];
          await executeLeaveBand('b1'); await w(50);
          uit.gelukt = { toast: toasts.slice(), profielGeladen: geladen };
          // 3. De landingspagina.
          showView('landing'); await w(300);
          const zicht = id => { const e = document.getElementById(id); const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; };
          uit.landing = { terug: zicht('navTerugBtn'), onderbalk: zicht('appBottomNav'), menu: zicht('navMenuBtn') };
          showView('search'); await w(200);
          uit.zoeken = { terug: zicht('navTerugBtn'), onderbalk: zicht('appBottomNav') };
          // Opruimen.
          db.from = oudFrom; window.showToast = oudToast; window.loadMyProfile = oudLoad; myMusicianId = oudMy; currentUser = null;
          showView('landing');
          return uit;
        }""")
        j65 = json.dumps(d65, ensure_ascii=False)
        check("het blok \"bevestig je e-mailadres\" heeft het kruisje van de app en sluit", d65["blokOpen"] and d65["kruisje"] and d65["naSluiten"] == "", j65)
        check("het blok blijft dicht tot de app opnieuw opent, en komt dan terug", d65["naHerladen"] == "" and d65["terugBijNieuweSessie"], j65)
        check("band verlaten: een geweigerde verwijdering (0 rijen) is een foutmelding, geen succes",
              len(d65["geweigerd"]["toast"]) == 1 and d65["geweigerd"]["toast"][0] != "Je hebt de band verlaten." and d65["geweigerd"]["profielGeladen"] == 0, j65)
        check("band verlaten: Mijn Profiel wordt opnieuw geladen, zodat de band uit het blok Bands verdwijnt",
              d65["gelukt"]["toast"] == ["Je hebt de band verlaten."] and d65["gelukt"]["profielGeladen"] == 1, j65)
        check("landingspagina: geen terugknop en geen onderbalk, wel de hamburger",
              not d65["landing"]["terug"] and not d65["landing"]["onderbalk"] and d65["landing"]["menu"], j65)
        check("daarbuiten staan terugknop en onderbalk er weer", d65["zoeken"]["terug"] and d65["zoeken"]["onderbalk"], j65)
        check("geen paginafouten in blok 65", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ─────────────────────────────────────────────────────────────
        # Blok 66 — TT-410a, stap 1 (06-10-2026, besluit Ronald): geen
        # berichtvenster meer. "Bericht sturen" opent het gesprek; pijl en
        # verstuurd bericht gaan terug naar waar je vandaan kwam. Het
        # chat-icoon op de zoekrij is groter (optie 1) en heeft ook in licht
        # een vlak en een dikkere lijn.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 66 — bericht sturen is het gesprek, terug naar Zoeken (TT-410a)")
        page_errors.clear()
        d66 = page.evaluate("""async () => {
          const uit = {};
          const wasInsert = insertMessage;
          insertMessage = async () => true;
          showView('search');
          // De knop zoals de zoekrij hem tekent (search.js: MESSAGE_ICON_SVG in .result-row-msg-btn).
          const plek = document.createElement('div'); plek.id = 'testChatIcoon';
          plek.innerHTML = `<div class="result-row-msg-btn">${MESSAGE_ICON_SVG}</div>`;
          document.getElementById('view-search').prepend(plek);
          const knop = plek.querySelector('.result-row-msg-btn');
          const ico = knop.querySelector('svg');
          uit.maat = { vlak: [knop.offsetWidth, knop.offsetHeight], icoon: [ico.getBoundingClientRect().width, ico.getBoundingClientRect().height],
                       lijn: getComputedStyle(ico).strokeWidth };
          const had = document.documentElement.getAttribute('data-theme');
          document.documentElement.setAttribute('data-theme', 'licht');
          uit.lichtVlak = getComputedStyle(knop).backgroundColor;
          if (had === null) document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', had);
          // Eerst een bericht versturen vanuit Zoeken.
          openMessageComposer('m2', 'Dylan');
          await new Promise(r => setTimeout(r, 150));
          uit.open = { view: huidigeView, conv: activeConversationId, van: gesprekVanuit };
          document.getElementById('messagesReplyInput').value = 'Hoi, zin om te jammen?';
          await sendReplyInThread();
          await new Promise(r => setTimeout(r, 500));
          uit.naSturen = { view: huidigeView, conv: activeConversationId, van: gesprekVanuit,
                           toast: document.getElementById('appToast').textContent,
                           draad: document.getElementById('messagesThreadPanel').style.display };
          // Dan de eigen pijl in de kop van het gesprek.
          openMessageComposer('m2', 'Dylan');
          await new Promise(r => setTimeout(r, 150));
          terugKnop();
          await new Promise(r => setTimeout(r, 500));
          uit.naPijl = { view: huidigeView, conv: activeConversationId, van: gesprekVanuit };
          // Een gesprek uit de inbox werkt zoals altijd: de pijl sluit alleen het gesprek.
          showView('messages');
          await new Promise(r => setTimeout(r, 100));
          await openConversation('m2', 'Dylan', null, false, false);
          uit.inboxVan = gesprekVanuit;
          terugKnop();
          await new Promise(r => setTimeout(r, 300));
          uit.naInbox = { view: huidigeView, conv: activeConversationId };
          insertMessage = wasInsert; plek.remove();
          return uit;
        }""")
        j66 = json.dumps(d66)
        check("chat-icoon op de zoekrij: vlak 44, icoon 22, lijn 2,5 (optie 1, Ronald)",
              d66["maat"]["vlak"] == [44, 44] and d66["maat"]["icoon"] == [22, 22] and d66["maat"]["lijn"] == "2.5px", j66)
        check("in licht staat er een vlak onder het chat-icoon (was doorzichtig)",
              d66["lichtVlak"] not in ("rgba(0, 0, 0, 0)", "transparent"), j66)
        check("bericht sturen vanuit Zoeken opent het gesprek en onthoudt Zoeken",
              d66["open"] == {"view": "messages", "conv": "m2", "van": "search"}, j66)
        check("een verstuurd bericht gaat terug naar Zoeken, met de melding",
              d66["naSturen"] == {"view": "search", "conv": None, "van": None, "toast": "Bericht verstuurd", "draad": "none"}, j66)
        check("de pijl bovenin de app gaat terug naar Zoeken (de gespreksKop heeft geen eigen pijl meer)",
              d66["naPijl"] == {"view": "search", "conv": None, "van": None}
              and not page.evaluate("!!document.querySelector('.messages-thread-back')"), j66)
        check("een gesprek vanuit de inbox sluit alleen het gesprek",
              d66["inboxVan"] is None and d66["naInbox"] == {"view": "messages", "conv": None}, j66)
        check("geen paginafouten in blok 66", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ─────────────────────────────────────────────────────────────
        # Blok 67 — TT-410b (06-10-2026, besluiten Ronald): het muzikantprofiel
        # is een eigen scherm met een deelbare link. Delen staat standaard
        # aan; de muzikant zet het zelf uit. Een link naar een profiel dat
        # delen uitzette, toont "niet beschikbaar". In de app blijft elk
        # profiel gewoon te openen.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 67 — profiel als scherm met deelbare link (TT-410b)")
        page_errors.clear()
        d67 = page.evaluate("""async () => {
          const S = window.TT_STUB, w = ms => new Promise(z => setTimeout(z, ms));
          const was = { hasOwnProfile, myMusicianId, runSearch, share: navigator.share };
          const uit = {};
          hasOwnProfile = false; myMusicianId = 'm1';
          S.rpcResults.tt_get_musicians_public = (p) => [{ id: p.ids[0], username: 'sanne', age: 30, city: 'Delft',
            bio: 'Drummer', goal: null, avatar_url: null, instrument_levels: [{ instrument: 'Drums', niveau: 3 }],
            genres: ['Rock'], songs: [], media: [] }];
          // Eerdere blokken kunnen rpcResults vervangen hebben: zet de delen-vraag zelf neer.
          S.rpcResults.tt_profiel_delen = (p) => { const r = (S.data.musicians || []).find(x => x.id === p.mid); return r ? r.delen_aan !== false : null; };
          const naam = () => (document.querySelector('#profielSchermContent .profile-name') || {}).textContent;
          const leeg = () => !!document.querySelector('#profielSchermContent .empty-state-title');
          const deelIcoon = () => document.querySelectorAll('#profielSchermContent .deel-knop').length;
          // Eerdere blokken kunnen de testrij hebben verwijderd: zet hem terug.
          S.data.musicians = S.data.musicians || [];
          let rij = S.data.musicians.find(m => m.id === 'm3');
          const rijToegevoegd = !rij;
          // Het zoekscherm zet hasOwnProfile weer aan: de rij moet ook via de tabelroute leesbaar zijn.
          if (!rij) { rij = { id: 'm3', user_id: 'u2', username: 'sanne', first_name: 'Sanne', lname: 'Bakker', city: 'Delft', postcode: '2611', bio: '', avatar_url: null, city_source: 'pdok', profile_complete: true }; S.data.musicians.push(rij); }
          Object.assign(rij, { musician_songs: [], musician_instruments: [], musician_genres: [], musician_media: [] });

          // 1. Standaard aan: de kolom ontbreekt in de testdata en telt als aan.
          showView('search'); await w(50);
          await openProfielScherm('m3'); await w(80);
          uit.standaard = { naam: naam(), leeg: leeg(), deel: deelIcoon(), rpc: S.calls.filter(c => c.kind === 'rpc' && c.name === 'tt_profiel_delen').slice(-1)[0].params };

          // 2. Een link naar een profiel dat delen uitzette: niet beschikbaar.
          rij.delen_aan = false;
          await openProfielScherm('m3', { link: true }); await w(80);
          uit.linkUit = { leeg: leeg(), tekst: document.querySelector('#profielSchermContent .empty-state-text')?.textContent,
                          knop: document.querySelector('#profielSchermContent .empty-state button')?.textContent, naam: naam() || null,
                          voet: document.getElementById('profielSchermVoet').innerHTML };
          // 3. In de app geopend blijft het profiel gewoon zichtbaar, maar zonder deelicoon.
          await openProfielScherm('m3'); await w(80);
          uit.appUit = { naam: naam(), leeg: leeg(), deel: deelIcoon() };
          // 4. Verversen: de stap onthoudt of het in de app is geopend.
          uit.stapApp = history.state;
          await openProfielScherm('m3', { redirect: true, link: !history.state.app }); await w(80);
          uit.naVerversApp = { naam: naam(), leeg: leeg() };
          // 5. Je eigen profiel is altijd te openen, ook via een link.
          myMusicianId = 'm3';
          await openProfielScherm('m3', { link: true }); await w(80);
          uit.eigenLink = { naam: document.querySelector('#profielSchermContent .profile-name') ? 'aanwezig' : null, leeg: leeg() };
          myMusicianId = 'm1';
          // 6. Delen weer aan: de link werkt.
          rij.delen_aan = true;
          await openProfielScherm('m3', { link: true }); await w(80);
          uit.linkAan = { naam: naam(), leeg: leeg(), deel: deelIcoon() };

          // 7. Zet delen uit: de app schrijft musicians.delen_aan en onthoudt de stand.
          S.calls.length = 0;
          myMusicianId = 'm3'; myDeelAan = true;
          const ok = await zetProfielDelen(false);
          uit.uit = { ok, stand: myDeelAan, tekst: document.getElementById('deelKeuze').value, rij: rij.delen_aan,
                      toast: document.getElementById('appToast').textContent,
                      aanroep: S.calls.filter(c => c.kind === 'update' || (c.table === 'musicians' && c.op === 'update')).length };
          // 8. Het deelicoon op je eigen profiel met delen uit: eerst de vraag.
          let gedeeld = null; Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => { gedeeld = d.url; return Promise.resolve(); } });
          shareProfile('profiel', 'm3', 'Sanne'); await w(50);
          uit.vraag = { open: document.getElementById('confirmModal').classList.contains('visible'),
                        tekst: document.getElementById('confirmMessage').textContent,
                        knop: document.getElementById('confirmYesBtn').textContent, gedeeld };
          document.getElementById('confirmYesBtn').click(); await w(150);
          uit.naAanzetten = { gedeeld, stand: myDeelAan, rij: rij.delen_aan };
          document.getElementById('deelKeuze').value = 'aan';

          // 9. Terug van een profiel naar Zoeken laadt de resultaten niet opnieuw.
          myMusicianId = 'm1'; delete rij.delen_aan; if (rijToegevoegd) S.data.musicians = S.data.musicians.filter(x => x.id !== 'm3');
          let zoekAantal = 0; const echteZoek = runSearch; runSearch = async () => { zoekAantal++; };
          showView('search'); await w(100);
          const voorZoek = zoekAantal;
          await openProfielScherm('m3'); await w(80);
          history.back(); await w(300);
          uit.terugZoeken = { view: huidigeView, extraZoek: zoekAantal - voorZoek };
          runSearch = echteZoek;

          // 10. De knop onderaan staat vast, boven de onderbalk.
          await openProfielScherm('m3'); await w(80);
          document.getElementById('profielSchermVoet').innerHTML = '<button class="btn btn-primary" style="width:100%;">Stuur een bericht →</button>';
          const voet = document.getElementById('profielSchermVoet');
          const vs = getComputedStyle(voet);
          const ob = document.getElementById('appBottomNav').getBoundingClientRect();
          uit.voet = { positie: vs.position, onder: vs.bottom, onderbalk: getComputedStyle(document.documentElement).getPropertyValue('--onderbalk-hoogte').trim(),
                       zichtbaar: voet.getBoundingClientRect().bottom <= ob.top + 1 };
          showView('search'); await w(50);

          hasOwnProfile = was.hasOwnProfile; myMusicianId = was.myMusicianId;
          Object.defineProperty(navigator, 'share', { configurable: true, value: was.share });
          delete S.rpcResults.tt_get_musicians_public;
          return uit;
        }""")
        j67 = json.dumps(d67, ensure_ascii=False)
        check("standaard staat delen aan: het profiel opent, met deelicoon; de vraag gaat met het id",
              d67["standaard"]["naam"] == "sanne" and not d67["standaard"]["leeg"] and d67["standaard"]["deel"] == 1
              and d67["standaard"]["rpc"] == {"mid": "m3"}, j67)
        check("een link naar een profiel dat delen uitzette toont 'niet beschikbaar' met één knop naar Zoeken, zonder profiel",
              d67["linkUit"]["leeg"] and d67["linkUit"]["naam"] is None and d67["linkUit"]["knop"] == "Naar Zoeken →"
              and d67["linkUit"]["tekst"] == "De muzikant deelt dit profiel niet via een link."
              and d67["linkUit"]["voet"] == "", j67)
        check("in de app blijft hetzelfde profiel te openen, zonder deelicoon",
              d67["appUit"]["naam"] == "sanne" and not d67["appUit"]["leeg"] and d67["appUit"]["deel"] == 0, j67)
        check("de stap in de geschiedenis onthoudt het id en dat het in de app is geopend; verversen houdt het profiel",
              d67["stapApp"] == {"view": "profiel", "id": "m3", "app": True}
              and d67["naVerversApp"]["naam"] == "sanne" and not d67["naVerversApp"]["leeg"], j67)
        check("je eigen profiel is altijd te openen, ook via een link",
              d67["eigenLink"]["naam"] == "aanwezig" and not d67["eigenLink"]["leeg"], j67)
        check("delen weer aan: de link werkt weer",
              d67["linkAan"]["naam"] == "sanne" and not d67["linkAan"]["leeg"] and d67["linkAan"]["deel"] == 1, j67)
        check("delen uitzetten schrijft musicians.delen_aan, werkt de knop bij en meldt het",
              d67["uit"]["ok"] and d67["uit"]["stand"] is False and d67["uit"]["rij"] is False
              and d67["uit"]["tekst"] == "uit"
              and d67["uit"]["toast"] == "Delen staat uit. Je link werkt niet meer.", j67)
        check("het deelicoon op je eigen profiel met delen uit vraagt eerst: 'Aanzetten en delen'; daarna deelt het",
              d67["vraag"]["open"] and d67["vraag"]["gedeeld"] is None
              and d67["vraag"]["knop"] == "Aanzetten en delen"
              and d67["vraag"]["tekst"] == "Delen staat uit. Zet het aan om je link te delen."
              and d67["naAanzetten"]["stand"] is True and d67["naAanzetten"]["rij"] is True
              and (d67["naAanzetten"]["gedeeld"] or "").endswith("#profiel/m3"), j67)
        check("terug van een profiel naar Zoeken laadt de resultaten niet opnieuw",
              d67["terugZoeken"] == {"view": "search", "extraZoek": 0}, j67)
        check("de knop onderaan het profiel staat vast (sticky) boven de onderbalk",
              d67["voet"]["positie"] == "sticky" and d67["voet"]["onder"] == d67["voet"]["onderbalk"]
              and d67["voet"]["zichtbaar"], j67)
        js67 = open(os.path.join(ROOT, "musicians.js"), encoding="utf-8").read()
        sql67 = open(os.path.join(ROOT, "core.js"), encoding="utf-8").read()
        check("het oude profielvenster is weg: geen #musicianModal en geen openMusicianModal() meer in de code",
              "musicianModal" not in open(os.path.join(ROOT, "index.html"), encoding="utf-8").read().replace("#musicianModal", "")
              and not re.search(r"openMusicianModal|closeMusicianModal", js67 + sql67), "")
        check("geen paginafouten in blok 67", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ─────────────────────────────────────────────────────────────
        # Blok 68 — TT-410b fase 2 (06-10-2026, besluiten Ronald): de bandpagina
        # is, net als het muzikantprofiel, een eigen scherm met een deelbare
        # link (view-profiel, #band/<id>). Delen staat standaard aan; alleen
        # de beheerder zet het uit. Een link naar een band waarvan delen uit
        # staat, toont "niet beschikbaar"; in de app opent elke band.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 68 — bandpagina als scherm met deelbare link (TT-410b, fase 2)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 375, "height": 812})
        d68 = page.evaluate("""async () => {
          const S = window.TT_STUB, w = ms => new Promise(z => setTimeout(z, ms));
          const was = { hasOwnProfile, myMusicianId, uitTabellen: bandUitTabellen, share: navigator.share };
          const uit = {};
          const vak = () => document.getElementById('profielSchermContent');
          const leeg = () => !!vak().querySelector('.empty-state-title');
          const naam = () => (vak().querySelector('.profile-name') || {}).textContent || null;
          const deelIcoon = () => vak().querySelectorAll('.deel-knop').length;
          let stand = true; // de delen-stand van de testband
          S.rpcResults.tt_band_delen = () => stand;
          S.rpcResults.tt_get_bands_public = (p) => [{ id: p.ids[0], name: 'Nachtploeg', city: 'Den Haag', description: 'Vier vrienden.',
            status: 'zoekend', avatar_url: null, genres: ['Indie'], niveau: 3, wanted: ['Basgitaar'], afgeschermd: false,
            soort: 'beide', pauze: false, contact_id: 'm1', instagram: null, tiktok: null, youtube: null,
            members: [{ id: 'm1', username: 'jesse', role: 'Oprichter', avatar_url: null, instruments: ['Gitaar'] }],
            media: [], nummers: [], covers: [], invallers: [] }];

          // 1. Een bezoeker zonder account. Standaard aan: de band opent, met deelicoon.
          // (Zoeken zet hasOwnProfile weer aan; daarom beginnen we op een ander scherm.)
          showView('about'); await w(80);
          hasOwnProfile = false; myMusicianId = null;
          await openBandScherm('b7'); await w(80);
          uit.standaard = { naam: naam(), leeg: leeg(), deel: deelIcoon(), hash: location.hash, stap: history.state,
                            rpc: S.calls.filter(c => c.kind === 'rpc' && c.name === 'tt_band_delen').slice(-1)[0].params,
                            actief: document.getElementById('view-profiel').classList.contains('active'),
                            bericht: document.getElementById('profielSchermVoet').textContent.trim() };
          // 2. Delen uit, via een link: niet beschikbaar, één knop naar Zoeken, geen band.
          stand = false;
          await openBandScherm('b7', { link: true }); await w(80);
          uit.linkUit = { leeg: leeg(), naam: naam(),
                          kop: vak().querySelector('.empty-state-title')?.textContent,
                          tekst: vak().querySelector('.empty-state-text')?.textContent,
                          knop: vak().querySelector('.empty-state button')?.textContent,
                          voet: document.getElementById('profielSchermVoet').innerHTML };
          // 3. In de app opent dezelfde band, zonder deelicoon.
          await openBandScherm('b7'); await w(80);
          uit.appUit = { naam: naam(), leeg: leeg(), deel: deelIcoon() };
          // 4. Verversen: de stap onthoudt dat het in de app is geopend.
          uit.stapApp = history.state;
          await openBandScherm('b7', { redirect: true, link: !history.state.app }); await w(80);
          uit.naVerversApp = { naam: naam(), leeg: leeg() };
          // 5. Het script is niet gedraaid: de vraag mislukt en delen telt als aan.
          delete S.rpcResults.tt_band_delen;
          await openBandScherm('b7', { link: true }); await w(80);
          uit.zonderScript = { naam: naam(), leeg: leeg() };
          S.rpcResults.tt_band_delen = () => stand;

          // 6. Met een eigen profiel: beheerder, lid en bezoeker (de tabellen zijn nagebootst).
          const band = (leden) => ({ id: 'b8', name: 'Zoutwater', city: 'Rijswijk', description: '', niveau: 4, avatar_url: null,
            genres: ['Pop'], soort: null, pauze: false, instagram: null, tiktok: null, youtube: null, afgeschermd: false,
            leden, beheerderId: 'm1', contact: null, wanted: [], invallers: [], media: [], nummers: [], covers: [] });
          const ledenLijst = [{ id: 'm1', naam: 'Ronald', avatar_url: null, instrumenten: ['Drums'], rol: 'Oprichter' },
                              { id: 'm3', naam: 'Sanne', avatar_url: null, instrumenten: ['Zang'], rol: 'Lid' }];
          bandUitTabellen = async () => band(ledenLijst);
          hasOwnProfile = true;
          stand = false;
          myMusicianId = 'm1';
          await openBandScherm('b8', { link: true }); await w(80);
          uit.beheerderLink = { naam: naam(), leeg: leeg(), deel: deelIcoon(),
            menu: [...vak().querySelectorAll('.profiel-knoppen .nav-menu-item')].map(b => b.textContent.trim()) };
          myMusicianId = 'm3';
          await openBandScherm('b8', { link: true }); await w(80);
          uit.lidLink = { leeg: leeg(), naam: naam() };
          await openBandScherm('b8'); await w(80);
          uit.lidApp = { naam: naam(), leeg: leeg(), deel: deelIcoon() };
          myMusicianId = 'm2';
          await openBandScherm('b8', { link: true }); await w(80);
          uit.bezoekerLink = { leeg: leeg() };

          // 7. De beheerder zet delen uit en aan. De app schrijft bands.delen_aan en meldt het.
          myMusicianId = 'm1';
          S.data.bands.push({ id: 'b8', name: 'Zoutwater', city: 'Rijswijk', delen_aan: true });
          const rij = S.data.bands.find(b => b.id === 'b8');
          stand = true;
          await openBandScherm('b8'); await w(80);
          uit.menuAan = vak().querySelector('#bandDelenToggleBtn') ? 'in menu' : 'niet in menu';
          S.calls.length = 0;
          await zetBandDelen('b8', false);
          uit.uit = { rij: rij.delen_aan, tekst: bandDeelGegevens.delen_aan ? 'aan' : 'uit',
                      toast: document.getElementById('appToast').textContent,
                      aanroep: S.calls.filter(c => c.kind === 'table' && c.table === 'bands' && c.op === 'update').length,
                      stand: bandDeelGegevens.delen_aan };
          // 8. Het deelicoon met delen uit: eerst de vraag. Daarna deelt het.
          stand = false;
          let gedeeld = null;
          Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => { gedeeld = d.url; return Promise.resolve(); } });
          shareProfile('band', 'b8', 'Zoutwater'); await w(50);
          uit.vraag = { open: document.getElementById('confirmModal').classList.contains('visible'),
                        tekst: document.getElementById('confirmMessage').textContent,
                        knop: document.getElementById('confirmYesBtn').textContent, gedeeld };
          document.getElementById('confirmYesBtn').click(); await w(150);
          uit.naAanzetten = { rij: rij.delen_aan, gedeeld, toast: document.getElementById('appToast').textContent };
          // 9. Een geweigerde wijziging (0 rijen) is een foutmelding, geen succes.
          const ok = await zetBandDelen('b-bestaat-niet', false);
          uit.geweigerd = { ok, toast: document.getElementById('appToast').textContent };
          // 10. Terug uit een band laat Zoeken staan: dezelfde stap als bij een muzikant.
          showView('search'); await w(150);
          hasOwnProfile = false; myMusicianId = null;
          await openBandScherm('b7'); await w(80);
          history.back(); await w(300);
          uit.terug = { view: huidigeView };

          bandUitTabellen = was.uitTabellen;
          Object.defineProperty(navigator, 'share', { configurable: true, value: was.share });
          S.data.bands = S.data.bands.filter(b => b.id !== 'b8');
          delete S.rpcResults.tt_band_delen; delete S.rpcResults.tt_get_bands_public;
          hasOwnProfile = was.hasOwnProfile; myMusicianId = was.myMusicianId;
          showView('about');
          return uit;
        }""")
        j68 = json.dumps(d68, ensure_ascii=False)
        check("een band opent als scherm op #band/<id>, met deelicoon; de vraag gaat met het id; zonder account geen bericht-knop",
              d68["standaard"]["naam"] == "Nachtploeg" and not d68["standaard"]["leeg"] and d68["standaard"]["deel"] == 1
              and d68["standaard"]["hash"] == "#band/b7" and d68["standaard"]["actief"]
              and d68["standaard"]["rpc"] == {"bid": "b7"}
              and d68["standaard"]["bericht"] == "Maak een profiel aan om contact te leggen", j68)
        check("de stap in de geschiedenis is { view, id, app, soort: 'band' }",
              d68["standaard"]["stap"] == {"view": "profiel", "id": "b7", "app": True, "soort": "band"}, j68)
        check("een link naar een band waarvan delen uit staat toont 'niet beschikbaar' met één knop naar Zoeken, zonder band",
              d68["linkUit"]["leeg"] and d68["linkUit"]["naam"] is None
              and d68["linkUit"]["kop"] == "Deze bandpagina is niet beschikbaar"
              and d68["linkUit"]["tekst"] == "De band deelt deze pagina niet via een link."
              and d68["linkUit"]["knop"] == "Naar Zoeken →" and d68["linkUit"]["voet"] == "", j68)
        check("in de app opent dezelfde band, zonder deelicoon; verversen houdt hem",
              d68["appUit"]["naam"] == "Nachtploeg" and not d68["appUit"]["leeg"] and d68["appUit"]["deel"] == 0
              and d68["stapApp"] == {"view": "profiel", "id": "b7", "app": True, "soort": "band"}
              and d68["naVerversApp"]["naam"] == "Nachtploeg" and not d68["naVerversApp"]["leeg"], j68)
        check("ontbreekt het databasescript, dan geldt delen aan",
              d68["zonderScript"]["naam"] == "Nachtploeg" and not d68["zonderScript"]["leeg"], j68)
        check("de beheerder opent zijn band altijd, ook via een link, en ziet het deelicoon; zijn ⋯-menu toont de stand",
              d68["beheerderLink"]["naam"] == "Zoutwater" and not d68["beheerderLink"]["leeg"] and d68["beheerderLink"]["deel"] == 1
              and d68["beheerderLink"]["menu"] == ["Bandprofiel bewerken"], j68)
        check("een lid of bezoeker krijgt via een link 'niet beschikbaar'; in de app opent de band ook voor een lid, zonder deelicoon",
              d68["lidLink"]["leeg"] and d68["bezoekerLink"]["leeg"]
              and d68["lidApp"]["naam"] == "Zoutwater" and d68["lidApp"]["deel"] == 0, j68)
        check("delen uitzetten schrijft bands.delen_aan, werkt de knop bij en meldt het",
              d68["menuAan"] == "niet in menu" and d68["uit"]["rij"] is False and d68["uit"]["stand"] is False
              and d68["uit"]["tekst"] == "uit" and d68["uit"]["aanroep"] == 1
              and d68["uit"]["toast"] == "Delen staat uit. De link van de band werkt niet meer.", j68)
        check("het deelicoon van de beheerder met delen uit vraagt eerst: 'Aanzetten en delen'; daarna deelt het #band/<id>",
              d68["vraag"]["open"] and d68["vraag"]["gedeeld"] is None and d68["vraag"]["knop"] == "Aanzetten en delen"
              and d68["vraag"]["tekst"] == "Delen staat uit. Zet het aan om de link van de band te delen."
              and d68["naAanzetten"]["rij"] is True and (d68["naAanzetten"]["gedeeld"] or "").endswith("#band/b8"), j68)
        check("een geweigerde wijziging (0 rijen) is een foutmelding, geen succes",
              d68["geweigerd"]["ok"] is False and d68["geweigerd"]["toast"] not in ("", "Delen staat aan. De link van de band werkt."), j68)
        check("terug van een band naar Zoeken (history.back) doet wat bij een muzikant",
              d68["terug"]["view"] == "search", j68)
        src68 = "".join(open(os.path.join(ROOT, f), encoding="utf-8").read() for f in ["index.html"] + JS_FILES)
        check("het oude bandvenster is weg: geen #bandModal en geen openBandModal() meer in de code",
              "bandModal" not in src68 and "openBandModal" not in src68, "")
        check("er komt geen view bij: view-profiel blijft de enige voor muzikant en band",
              len(re.findall(r'<div class="app-view[ "]', open(os.path.join(ROOT, "index.html"), encoding="utf-8").read())) == 16, "")
        check("geen paginafouten in blok 68", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()


        # ─────────────────────────────────────────────────────────────
        # Blok 69 — TT-430 (07-10-2026, besluit Ronald): zoeken op alleen
        # artiest. Een artiest kiezen is al een zoekopdracht; een nummer maakt
        # de selectie af en vervangt de rij met alleen de artiest.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 69 — Zoek muzikanten: artiest alleen (TT-430)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        d69 = page.evaluate("""async () => {
          const S = window.TT_STUB, w = ms => new Promise(z => setTimeout(z, ms)), u = {};
          const aanroepen = [];
          S.rpcResults.tt_search_musicians_by_songlist_anon = (p) => { aanroepen.push({ titles: p.titles, artists: p.artists }); return [{ musician_id: 'm1' }]; };
          S.rpcResults.tt_get_musicians_public = (p) => p.ids.map(id => ({ id, username: 'jesse', city: 'Den Haag', avatar_url: null,
            songs: [{ song_title: 'One', song_artist: 'Metallica', mastery_level: 2 }], instrument_levels: [] }));
          const was = { hasOwnProfile };
          showView('search'); await w(150);
          hasOwnProfile = false;
          resetSetlistSearch();
          selectSetlistArtist(1, 'Metallica'); await w(400);
          u.naArtiest = { rijen: setlistWantedSongs.slice(), lijst: document.getElementById('setlistSongsList').textContent.replace(/\s+/g, ' ').trim(),
                          aanroep: aanroepen[aanroepen.length - 1], gevonden: lastSetlistResults.length,
                          trackZichtbaar: document.getElementById('setlistTrackSearchWrap').style.display !== 'none' };
          const voor = aanroepen.length;
          selectSetlistArtist(1, 'Metallica'); await w(150);
          u.nogEens = { rijen: setlistWantedSongs.length, aanroepen: aanroepen.length - voor };
          addSetlistSong('One', 'Metallica'); await w(400);
          u.naNummer = { rijen: setlistWantedSongs.slice(), aanroep: aanroepen[aanroepen.length - 1], badge: lastSetlistResults[0] && lastSetlistResults[0].matchedNumbers };
          selectSetlistArtist(2, 'Nirvana'); await w(400);
          u.tweede = { rijen: setlistWantedSongs.map(s => s.artist + '|' + s.title), matchCount: lastSetlistResults[0] && lastSetlistResults[0].matchCount };
          hasOwnProfile = was.hasOwnProfile; resetSetlistSearch();
          return u;
        }""")
        j69 = json.dumps(d69, ensure_ascii=False)
        check("een artiest kiezen zoekt meteen, met een lege titel, en laat het nummerveld staan",
              d69["naArtiest"]["rijen"] == [{"title": "", "artist": "Metallica"}]
              and d69["naArtiest"]["aanroep"] == {"titles": [""], "artists": ["Metallica"]}
              and d69["naArtiest"]["gevonden"] == 1 and d69["naArtiest"]["trackZichtbaar"], j69)
        check("de rij met alleen een artiest zegt 'Alle nummers'",
              "Metallica" in d69["naArtiest"]["lijst"] and "Alle nummers" in d69["naArtiest"]["lijst"], j69)
        check("dezelfde artiest nog eens kiezen voegt niets toe en zoekt niet opnieuw",
              d69["nogEens"] == {"rijen": 1, "aanroepen": 0}, j69)
        check("een nummer maakt de selectie af: de rij met alleen de artiest maakt plaats",
              d69["naNummer"]["rijen"] == [{"title": "One", "artist": "Metallica"}]
              and d69["naNummer"]["aanroep"] == {"titles": ["One"], "artists": ["Metallica"]}
              and d69["naNummer"]["badge"] == [1], j69)
        check("een tweede artiest komt erbij; een muzikant telt per rij",
              d69["tweede"]["rijen"] == ["Metallica|One", "Nirvana|"] and d69["tweede"]["matchCount"] == 1, j69)
        check("geen paginafouten in blok 69", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ─────────────────────────────────────────────────────────────
        # Blok 70 — TT-431 (07-10-2026, P0, besluit Ronald): de terugknop.
        # Elke situatie met de pijl én met de toestelknop. Beide moeten
        # hetzelfde doen, in één druk, en de browsergeschiedenis groeit nooit.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 70 — terug: pijl en toestelknop doen hetzelfde, in één druk (TT-431)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        d70 = {}
        for knop in ("pijl", "toestel"):
            d70[knop] = page.evaluate("""async (knop) => {
              const w = ms => new Promise(z => setTimeout(z, ms)), u = {};
              const bewaard = currentUser;
              const nu = () => ({ v: huidigeView, h: location.hash, n: history.length });
              const druk = async () => { if (knop === 'pijl') terugKnop(); else history.back(); await w(150); };
              const actief = () => huidigeView;
              currentUser = { id: 'test' };
              showView('myprofile'); await w(100);
              const lengte0 = history.length;
              // 1. de bovenkant van elk tabblad: een druk doet niets
              u.top = {};
              for (const v of ['myprofile', 'search', 'messages', 'bands']) {
                showView(v); await w(100);
                await druk();
                u.top[v] = actief();
              }
              // 2. wisselen tussen tabbladen laat niets achter: terug blijft binnen het tabblad
              showView('search'); await w(60); showView('messages'); await w(60); showView('bands'); await w(60);
              showView('search'); await w(60); showView('search'); await w(60);
              await druk();
              u.naTabWissel = actief();
              // 3. dieper in een tabblad: één druk naar de bovenkant, de tweede doet niets
              showView('search'); await w(100);
              showView('profiel', undefined, { id: 'x', app: true }); await w(150);
              u.diepScherm = actief();
              await druk();
              u.diepEen = actief();
              await druk();
              u.diepTwee = actief();
              // 4. diep, dan tabbladen wisselen, dan terug: je komt nooit in een ander tabblad
              showView('search'); await w(60);
              showView('profiel', undefined, { id: 'x', app: true }); await w(100);
              showView('messages'); await w(60); showView('search'); await w(60);
              await druk();
              u.diepWissel = actief();
              // 5. Instellingen vanuit Mijn Profiel: terug naar Mijn Profiel
              showView('myprofile'); await w(60);
              showView('instellingen'); await w(100);
              await druk();
              u.instellingen = actief();
              // 6. een open venster sluit eerst; het scherm eronder blijft
              showView('search'); await w(60);
              showView('profiel', undefined, { id: 'x', app: true }); await w(100);
              document.getElementById('confirmModal').classList.add('visible'); await w(60);
              await druk();
              u.modal = { open: document.getElementById('confirmModal').classList.contains('visible'), view: actief() };
              await druk();
              u.modalDaarna = actief();
              // 7. een gesprek dat uit Zoeken komt: terug naar Zoeken, en dan niets
              showView('search'); await w(100);
              openMessageComposer('m2', 'dylan'); await w(150);
              u.gesprek = { view: actief(), open: !!activeConversationId };
              await druk();
              u.gesprekTerug = { view: actief(), open: !!activeConversationId };
              await druk();
              u.gesprekDaarna = actief();
              // 8. uitgelogd: Inloggen vanaf de landingspagina, terug naar de landingspagina
              currentUser = null;
              showView('landing'); await w(100);
              showView('auth'); await w(100);
              await druk();
              u.uitgelogd = actief();
              // 9. de geschiedenis van de browser is door dit alles niet gegroeid
              u.lengteGroei = history.length - lengte0;
              u.stapIsApp = !!(history.state && history.state.view);
              currentUser = bewaard;
              showView('myprofile'); await w(60);
              return u;
            }""", knop)
        j70 = json.dumps(d70, ensure_ascii=False)
        for knop, d in d70.items():
            check(f"[{knop}] de bovenkant van elk tabblad: een druk doet niets",
                  d["top"] == {"myprofile": "myprofile", "search": "search", "messages": "messages", "bands": "bands"}, j70)
            check(f"[{knop}] tabbladen wisselen laat geen stap achter: terug blijft op Zoeken",
                  d["naTabWissel"] == "search", j70)
            check(f"[{knop}] dieper in een tabblad: één druk naar de bovenkant, de tweede doet niets",
                  d["diepScherm"] == "profiel" and d["diepEen"] == "search" and d["diepTwee"] == "search", j70)
            check(f"[{knop}] diep, tabbladen wisselen, terug: nooit een ander tabblad",
                  d["diepWissel"] == "search", j70)
            check(f"[{knop}] Instellingen: terug naar Mijn Profiel", d["instellingen"] == "myprofile", j70)
            check(f"[{knop}] een open venster sluit eerst, daarna het scherm",
                  d["modal"] == {"open": False, "view": "profiel"} and d["modalDaarna"] == "search", j70)
            check(f"[{knop}] een gesprek uit Zoeken: terug naar Zoeken, daarna niets",
                  d["gesprek"] == {"view": "messages", "open": True}
                  and d["gesprekTerug"] == {"view": "search", "open": False} and d["gesprekDaarna"] == "search", j70)
            check(f"[{knop}] uitgelogd: Inloggen gaat terug naar de landingspagina", d["uitgelogd"] == "landing", j70)
            check(f"[{knop}] de browsergeschiedenis groeit niet en de app blijft op haar eigen stap",
                  d["lengteGroei"] == 0 and d["stapIsApp"], j70)
        check("geen paginafouten in blok 70", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ─────────────────────────────────────────────────────────────
        # Blok 71 — TT-431: de harde regels van de terugknop, voor elk scherm
        # dat de app heeft. Geen lijst die iemand bijhoudt: de schermen komen
        # uit index.html. Komt er een scherm bij, dan geldt de regel meteen.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 71 — terug: dezelfde regels voor elk scherm, met beide knoppen (TT-431)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        d71 = {}
        for knop in ("pijl", "toestel"):
            d71[knop] = page.evaluate("""async (knop) => {
              const w = ms => new Promise(z => setTimeout(z, ms));
              const bewaard = currentUser;
              const TABS = ['myprofile', 'search', 'messages', 'bands'];
              const schermen = [...document.querySelectorAll('.app-view')].map(v => v.id.replace('view-', ''))
                .filter(v => !['landing', 'toestemming'].includes(v));
              const druk = async () => { if (knop === 'pijl') terugKnop(); else history.back(); await w(120); };
              const fouten = [];
              const eigen = { myMusicianId, hasOwnProfile };
              currentUser = { id: 'test' }; myMusicianId = 'm1'; hasOwnProfile = true;
              for (const tab of TABS) {
                for (const v of schermen) {
                  showView(tab); await w(60);
                  const lengte = history.length;
                  // Profiel bewerken bestaat alleen mét profiel, registreren alleen zonder.
                  myMusicianId = v === 'register' ? null : 'm1'; hasOwnProfile = v !== 'register';
                  showView(v, undefined, v === 'profiel' ? { id: 'x', app: true } : undefined); await w(120);
                  const gaatNaar = [];
                  for (let i = 0; i < 6; i++) { await druk(); gaatNaar.push(huidigeView); }
                  const naam = tab + ' > ' + v;
                  // 1. de reeks eindigt op de bovenkant van het tabblad waar je begon, en blijft daar
                  if (!TABS.includes(v) && gaatNaar[5] !== tab) fouten.push(naam + ' eindigt op ' + gaatNaar[5]);
                  if (TABS.includes(v) && gaatNaar[5] !== v) fouten.push(naam + ' (tabtop) eindigt op ' + gaatNaar[5]);
                  // 2. nooit een ander tabblad onderweg
                  const vreemd = gaatNaar.filter(x => TABS.includes(x) && x !== (TABS.includes(v) ? v : tab));
                  if (vreemd.length) fouten.push(naam + ' komt langs ' + vreemd.join(','));
                  // 3. maximaal twee drukken tot de bovenkant
                  const eerst = gaatNaar.findIndex(x => x === (TABS.includes(v) ? v : tab));
                  if (eerst > 2) fouten.push(naam + ' heeft ' + (eerst + 1) + ' drukken nodig');
                  // 4. de geschiedenis van de browser groeit nooit en de app staat op haar eigen stap
                  if (history.length !== lengte) fouten.push(naam + ' geschiedenis ' + lengte + ' -> ' + history.length);
                  if (!(history.state && history.state.view)) fouten.push(naam + ' staat niet op de stap van de app');
                }
              }
              currentUser = bewaard; myMusicianId = eigen.myMusicianId; hasOwnProfile = eigen.hasOwnProfile;
              showView('myprofile'); await w(60);
              return { aantal: schermen.length, schermen, fouten };
            }""", knop)
        j71 = json.dumps(d71, ensure_ascii=False)
        for knop, d in d71.items():
            check(f"[{knop}] {d['aantal']} schermen x 4 tabbladen: alle regels van de terugknop gelden overal",
                  not d["fouten"] and d["aantal"] >= 10, j71[:600])
        check("geen paginafouten in blok 71", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ─────────────────────────────────────────────────────────────
        # Blok 72 — TT-432 en TT-433 (07-10-2026, besluiten Ronald).
        # TT-433: de bandkaart in Mijn Bands heeft geen ⋯-menu en geen knop.
        # TT-432: de beheerder kiest zelf één bevestigd lid; dat lid ziet het
        # verzoek op zijn bandkaart, met een stip op de Bands-knop.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 72 — beheer overdragen aan een gekozen lid, kaart zonder menu (TT-432, TT-433)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        d72 = page.evaluate(r"""async () => {
          const S = window.TT_STUB, w = (n = 150) => new Promise(r => setTimeout(r, n)), u = {};
          const $ = id => document.getElementById(id);
          const keep = { from: db.from, myMusicianId, currentUser, hasOwnProfile, toast: window.showToast, wie: window.getMyMusicianId };
          // Eerdere blokken zetten getMyMusicianId vast op 'm1'; hier volgt hij het gekozen account.
          window.getMyMusicianId = async () => myMusicianId;
          const echt = db.from.bind(db);
          const muz = id => { const m = (S.data.musicians || []).find(x => x.id === id); return m ? { weergavenaam: m.fname || m.username, username: m.username } : null; };
          db.from = (t) => { const q = echt(t); const run = q._run.bind(q);
            q._run = () => { const r = run();
              if (q.op !== 'select' || !r.data) return r;
              const rijen = Array.isArray(r.data) ? r.data : [r.data];
              if (t === 'bands') rijen.forEach(b => { b.band_wanted = []; b.band_members = (S.data.band_members || []).filter(x => x.band_id === b.id).map(x => {
                const y = JSON.parse(JSON.stringify(x)); y.musicians = muz(x.musician_id); return y; }); });
              return r; };
            return q; };
          S.data.musicians = [{ id: 'm1', username: 'beheerder' }, { id: 'm2', username: 'dyl', fname: 'Dylan', weergavenaam: 'Dylan' }, { id: 'm3', username: 'sanne' }, { id: 'm4', username: 'gast' }];
          S.data.bands = [{ id: 'b9', name: 'Van Delft', city: 'Delft', genres: ['Country'], status: 'compleet', pauze: false, founder_id: 'm1', avatar_url: null, updated_at: '2026-10-01' }];
          S.data.band_wanted = [];
          S.data.band_members = [
            { band_id: 'b9', musician_id: 'm1', role: 'Oprichter', status: 'bevestigd', founder_offer: null },
            { band_id: 'b9', musician_id: 'm2', role: 'Lid', status: 'bevestigd', founder_offer: null },
            { band_id: 'b9', musician_id: 'm3', role: 'Lid', status: 'bevestigd', founder_offer: null },
            { band_id: 'b9', musician_id: 'm4', role: 'Lid', status: 'aangevraagd', founder_offer: null }];
          const aangenomen = [];
          S.rpcResults.tt_accept_founder_offer = (p) => { aangenomen.push(p.p_band_id); return null; };
          const ik = async (id) => { myMusicianId = id; currentUser = currentUser || { id: 'u1', email: 'test@talenttent.org' }; hasOwnProfile = true;
            showView('bands'); await w(200); await loadMyBands(); await w(150); };
          const kaart = () => document.querySelector('#myBandsList .band-card');
          const stip = () => { const d = $('bandsDotBottom'); return d ? [getComputedStyle(d).display !== 'none', d.textContent, Math.round(d.getBoundingClientRect().width), !!d.closest('#bottomNavBands')] : null; };
          const knoppen = () => [...kaart().querySelectorAll('.melding .btn')].map(b => b.textContent);
          // TT-433: beheerder en lid zien dezelfde kaart, zonder menu en zonder knop.
          await ik('m1'); u.beheerderKaart = kaart().querySelectorAll('button, .nav-menu-btn, .inline-menu-dropdown').length;
          await ik('m2'); u.lidKaart = kaart().querySelectorAll('button, .nav-menu-btn, .inline-menu-dropdown').length;
          u.stipVoor = stip();
          // TT-432: de beheerder opent Bandbeheer en kiest uit de bevestigde leden.
          await ik('m1'); openBandTegels('b9'); await w(300);
          await askFounderTransfer('b9'); await w(150);
          u.keuze = [...document.querySelectorAll('#overdragKeuze .btn')].map(b => b.textContent);
          document.querySelectorAll('#overdragKeuze .btn')[0].click(); await w(300);
          u.aanbod = S.data.band_members.map(m => m.musician_id + ':' + (m.founder_offer ? 'ja' : 'nee')).join(' ');
          u.knopNa = [...document.querySelectorAll('#bandBeheerBlok .knoppen-stapel .btn')].map(b => b.textContent);
          // Het gekozen lid ziet het verzoek op zijn kaart en een stip; een ander lid niet.
          await ik('m2'); await refreshBandsDot(); await w(100);
          u.gekozen = { melding: !!kaart().querySelector('.melding'), kop: (kaart().querySelector('.melding-kop') || {}).textContent, knoppen: knoppen(), stip: stip(),
                        tikOpKnop: (() => { let open = false; const f = window.openBandScherm; window.openBandScherm = () => { open = true; }; const kn = kaart().querySelector('.melding-tekst'); if (kn) kn.dispatchEvent(new MouseEvent('click', { bubbles: true })); window.openBandScherm = f; return open; })() };
          await ik('m3'); await refreshBandsDot(); await w(100);
          u.ander = { melding: !!kaart().querySelector('.melding'), stip: stip() };
          // Nee zeggen haalt het verzoek en de stip weg; de beheerder blijft.
          await ik('m2'); await respondToFounderOffer('b9', false); await w(300);
          u.naNee = { melding: !!kaart().querySelector('.melding'), stip: stip(), aanbod: S.data.band_members.some(m => m.founder_offer), beheerder: S.data.bands[0].founder_id };
          // Ja zeggen gaat via de databasefunctie.
          S.data.band_members.find(m => m.musician_id === 'm3').founder_offer = true;
          await ik('m3'); await respondToFounderOffer('b9', true); await w(300);
          u.naJa = aangenomen.slice();
          // Wat er niet meer is.
          u.weg = { banner: !!$('founderOfferBanner'), functie: typeof loadFounderOffers };
          db.from = keep.from; myMusicianId = keep.myMusicianId; currentUser = keep.currentUser; hasOwnProfile = keep.hasOwnProfile; window.showToast = keep.toast; window.getMyMusicianId = keep.wie;
          showView('about'); await w(100);
          return u;
        }""")
        j72 = json.dumps(d72, ensure_ascii=False)
        check("TT-433: de bandkaart heeft voor de beheerder en voor een lid geen ⋯-menu en geen knop",
              d72["beheerderKaart"] == 0 and d72["lidKaart"] == 0, j72)
        check("TT-432: de beheerder kiest uit de bevestigde leden; een uitgenodigd lid staat er niet bij",
              d72["keuze"] == ["Dylan", "sanne"], j72)
        check("TT-432: alleen het gekozen lid krijgt het verzoek; de knop wordt 'Aanbod intrekken'",
              d72["aanbod"] == "m1:nee m2:ja m3:nee m4:nee" and "Aanbod intrekken" in d72["knopNa"], j72)
        check("TT-432: het gekozen lid ziet het verzoek op zijn kaart, met twee knoppen; een tik in de melding opent de bandpagina niet",
              d72["gekozen"]["melding"] and "Van Delft" in d72["gekozen"]["kop"]
              and d72["gekozen"]["knoppen"] == ["Nee, liever niet", "Ik neem het over"] and d72["gekozen"]["tikOpKnop"] is False, j72)
        check("TT-432: de Bands-knop krijgt een stip zonder cijfer (10px) bij het gekozen lid; niet bij een ander lid, niet zonder verzoek",
              d72["gekozen"]["stip"] == [True, "", 10, True] and d72["ander"] == {"melding": False, "stip": [False, "", 0, True]}
              and d72["stipVoor"][0] is False, j72)
        check("TT-432: nee zeggen haalt kaartmelding en stip weg en laat de beheerder staan",
              d72["naNee"] == {"melding": False, "stip": [False, "", 0, True], "aanbod": False, "beheerder": "m1"}, j72)
        check("TT-432: ja zeggen loopt via tt_accept_founder_offer", d72["naJa"] == ["b9"], j72)
        check("TT-432: de melding op Mijn Profiel is weg (geen dubbele plek)",
              d72["weg"] == {"banner": False, "functie": "undefined"}, j72)
        core72 = open(os.path.join(ROOT, "core.js"), encoding="utf-8").read()
        check("TT-432: uitloggen haalt de stip weg en inloggen ververst hem",
              "'bandsDotBottom'" in core72 and "refreshBandsDot();" in core72, "")
        check("geen paginafouten in blok 72", not page_errors, "; ".join(page_errors)[:300])

        # Blok 73 — TT-435 (07-10-2026, besluit Ronald): een gesprek verwijderen,
        # alleen bij jezelf, vanuit het ⋯-menu van het gesprek.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 73 — gesprek verwijderen, alleen bij jezelf (TT-435)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        d73 = page.evaluate(r"""async () => {
          const S = window.TT_STUB, w = (n = 150) => new Promise(r => setTimeout(r, n)), u = {};
          const $ = id => document.getElementById(id);
          const keep = { myMusicianId, currentUser, hasOwnProfile, wie: window.getMyMusicianId, conf: window.showConfirm, toast: window.showToast };
          window.getMyMusicianId = async () => myMusicianId;
          myMusicianId = 'm1'; currentUser = currentUser || { id: 'u1', email: 'test@talenttent.org' }; hasOwnProfile = true;
          S.data.musicians = [{ id: 'm1', username: 'ik' }, { id: 'm2', username: 'dyl', fname: 'Dylan', weergavenaam: 'Dylan' }, { id: 'm3', username: 'sanne' }];
          const nu = Date.now();
          S.data.messages = [
            { id: 1, sender_id: 'm2', recipient_id: 'm1', body: 'hoi vanaf Dylan', created_at: new Date(nu - 60000).toISOString(), read_at: null },
            { id: 2, sender_id: 'm1', recipient_id: 'm2', body: 'hoi terug', created_at: new Date(nu - 50000).toISOString(), read_at: null },
            { id: 3, sender_id: 'm3', recipient_id: 'm1', body: 'hoi vanaf Sanne', created_at: new Date(nu - 40000).toISOString(), read_at: null },
            { id: 4, sender_id: 'm9', recipient_id: 'm1', body: 'van een weg account', created_at: new Date(nu - 30000).toISOString(), read_at: null }];
          S.data.gesprek_verborgen = [];
          // Eerdere blokken vervangen rpcResults; de functie staat daarom hier zelf.
          S.rpcResults.tt_gesprek_verbergen = (p) => {
            const nu2 = new Date().toISOString();
            S.data.gesprek_verborgen = (S.data.gesprek_verborgen || []).filter(r => !(r.musician_id === myMusicianId && r.ander_id === p.ander));
            S.data.gesprek_verborgen.push({ musician_id: myMusicianId, ander_id: p.ander, verborgen_op: nu2 });
            S.data.messages.forEach(m => { if (m.recipient_id === myMusicianId && m.sender_id === p.ander && !m.read_at) m.read_at = nu2; });
            return null; };
          const rijen = () => [...document.querySelectorAll('#messagesInboxList .messages-conv-row .messages-conv-name')].map(e => e.textContent.replace(/\d+$/, '').trim());
          const menuItems = () => [...document.querySelectorAll('#messagesThreadActies .nav-menu-item')].map(b => b.textContent);
          showView('messages'); await w(300); await loadInbox(); await w(200);
          u.voor = rijen();
          // Het menu van een gewoon gesprek: melden, blokkeren en verwijderen.
          await openConversation('m2', 'Dylan', null, false, false); await w(300);
          u.menu = menuItems();
          // Verwijderen vraagt eerst om bevestiging, met de tekst dat het alleen bij jou verdwijnt.
          let vraag = null, knop = null, rood = null;
          const conf = window.showConfirm; window.showConfirm = (m, f, l, d) => { vraag = m; knop = l; rood = d; window._doe = f; };
          gesprekVerwijderen('m2', 'Dylan');
          u.vraag = { tekst: vraag, knop, rood, aangeroepen: S.calls.some(c => c.name === 'tt_gesprek_verbergen') };
          await window._doe(); await w(400);
          window.showConfirm = conf;
          u.na = { rijen: rijen(), rpc: S.calls.filter(c => c.name === 'tt_gesprek_verbergen').map(c => c.params.ander), paneel: $('messagesThreadPanel').style.display,
                   gelezen: S.data.messages.filter(m => m.recipient_id === 'm1' && m.sender_id === 'm2').every(m => m.read_at), anderNog: S.data.messages.length };
          // De ander schrijft opnieuw: het gesprek is terug, met alleen het nieuwe bericht.
          S.data.messages.push({ id: 5, sender_id: 'm2', recipient_id: 'm1', body: 'ben je er nog', created_at: new Date(Date.now() + 5000).toISOString(), read_at: null });
          await loadInbox(); await w(200);
          u.terug = rijen();
          await openConversation('m2', 'Dylan', null, false, false); await w(300);
          u.draad = [...document.querySelectorAll('#messagesThreadList .message-bubble')].map(e => e.textContent).filter(t => t).join('|');
          // Een gesprek met een verwijderd account heeft alleen dit ene item.
          await openConversation('m9', 'Verwijderde gebruiker', null, false, true); await w(300);
          u.menuWeg = menuItems();
          window.showConfirm = (m) => { vraag = m; };
          gesprekVerwijderen('m9', 'Verwijderde gebruiker');
          window.showConfirm = conf;
          u.vraagWeg = vraag;
          // Mislukt de database, dan blijft het gesprek staan en komt er een melding.
          S.rpcErrors.tt_gesprek_verbergen = { code: '42501', message: 'permission denied' };
          let melding = null; window.showToast = (t) => { melding = t; };
          await gesprekVerwijderenUitvoeren('m9'); await w(200);
          u.fout = { melding: !!melding, paneel: $('messagesThreadPanel').style.display };
          delete S.rpcErrors.tt_gesprek_verbergen;
          // Een ontbrekende tabel laat alles zichtbaar.
          S.errors['gesprek_verborgen'] = { code: '42P01', message: 'relation does not exist' };
          closeConversation(true); await loadInbox(); await w(200);
          u.zonderTabel = rijen();
          delete S.errors['gesprek_verborgen'];
          myMusicianId = keep.myMusicianId; currentUser = keep.currentUser; hasOwnProfile = keep.hasOwnProfile; window.getMyMusicianId = keep.wie; window.showToast = keep.toast;
          showView('about'); await w(100);
          return u;
        }""")
        j73 = json.dumps(d73, ensure_ascii=False)
        check("TT-435: het ⋯-menu van een gesprek heeft Gesprek verwijderen, naast Melden en Blokkeren",
              d73["menu"] == ["Muzikant melden", "Blokkeren", "Gesprek verwijderen"], j73)
        check("TT-435: eerst een bevestiging: alleen bij jou, de ander houdt het; knop Verwijderen, rood omlijnd",
              d73["vraag"]["tekst"] == "Gesprek met Dylan verwijderen? Het verdwijnt alleen bij jou. Dylan houdt het."
              and d73["vraag"]["knop"] == "Verwijderen" and d73["vraag"]["rood"] is True and d73["vraag"]["aangeroepen"] is False, j73)
        check("TT-435: na bevestigen is het gesprek uit de lijst, het gesprek sluit, de berichten van de ander blijven bestaan en zijn gelezen",
              "Dylan" in d73["voor"] and "Dylan" not in d73["na"]["rijen"] and "sanne" in d73["na"]["rijen"]
              and d73["na"]["rpc"] == ["m2"] and d73["na"]["paneel"] == "none" and d73["na"]["gelezen"] and d73["na"]["anderNog"] == 4, j73)
        check("TT-435: schrijft de ander opnieuw, dan komt het gesprek terug met alleen het nieuwe bericht",
              "Dylan" in d73["terug"] and "ben je er nog" in d73["draad"] and "hoi vanaf Dylan" not in d73["draad"] and "hoi terug" not in d73["draad"], j73)
        check("TT-435: een gesprek met een verwijderd account is ook te verwijderen, zonder melden en blokkeren",
              d73["menuWeg"] == ["Gesprek verwijderen"] and "Het verdwijnt alleen bij jou." in d73["vraagWeg"] and "houdt het" not in d73["vraagWeg"], j73)
        check("TT-435: mislukt de database, dan blijft het gesprek open en komt er een melding",
              d73["fout"]["melding"] and d73["fout"]["paneel"] == "block", j73)
        check("TT-435: ontbreekt de tabel, dan blijft alles zichtbaar",
              "Dylan" in d73["zonderTabel"] and "sanne" in d73["zonderTabel"], j73)
        check("geen paginafouten in blok 73", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # Blok 74 — 07-10-2026 (bevindingen Ronald, Bandprofiel bewerken):
        # de bandnaam onder de titel, de bandfoto in Onze media, de i direct
        # achter "Ervaring van de band".
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 74 — bandnaam onder de titel, bandfoto in Onze media, i naast het label")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 390, "height": 844})
        d74 = page.evaluate(r"""async () => {
          const S = window.TT_STUB, w = (n = 150) => new Promise(r => setTimeout(r, n)), u = {};
          const $ = id => document.getElementById(id);
          const keep = { from: db.from, myMusicianId, currentUser, hasOwnProfile, wie: window.getMyMusicianId };
          window.getMyMusicianId = async () => myMusicianId;
          myMusicianId = 'm1'; currentUser = currentUser || { id: 'u1', email: 'test@talenttent.org' }; hasOwnProfile = true;
          const echt = db.from.bind(db);
          db.from = (t) => { const q = echt(t); const run = q._run.bind(q);
            q._run = () => { const r = run();
              if (q.op !== 'select' || !r.data) return r;
              const rijen = Array.isArray(r.data) ? r.data : [r.data];
              if (t === 'bands') rijen.forEach(b => { b.band_wanted = []; b.band_members = []; b.band_media = []; b.band_nummers = []; b.band_covers = []; b.band_invallers = []; });
              return r; };
            return q; };
          S.data.musicians = [{ id: 'm1', username: 'ik' }];
          S.data.bands = [{ id: 'b9', name: 'Silver Earring', city: 'Den Haag', zip: '2497', city_source: 'pdok', description: '', niveau: 3,
            avatar_url: null, genres: ['Indie'], soort: null, pauze: false, founder_id: 'm1', contact_id: null, status: 'compleet',
            instagram: null, tiktok: null, youtube: null }];
          S.data.band_members = [{ band_id: 'b9', musician_id: 'm1', role: 'Oprichter', status: 'bevestigd', founder_offer: null }];
          const regel = id => { const e = document.querySelector('#' + id + ' .band-naam-regel'); return e ? [e.textContent, getComputedStyle(e).display, getComputedStyle(e).fontSize] : null; };
          openBandTegels('b9'); await w(400);
          u.overzicht = regel('bandTegelOverviewScreen');
          u.subs = [...document.querySelectorAll('#bandTegelsWrap .tile-sub')].map(e => e.textContent);
          for (const [id, scherm] of [['bandBezetting', 'bandBezettingScreen'], ['bandMuziek', 'bandMuziekScreen'], ['bandMedia', 'bandMediaScreen']]) {
            openTegelScreen(id); await w(400); u[id] = regel(scherm); }
          u.wieRegel = !!document.querySelector('#bandWieScreen .band-naam-regel');
          // Wie zijn we: geen foto meer.
          openTegelScreen('bandWie'); await w(300);
          u.wieFoto = ['bwFotoPreview', 'bwFotoRemoveBtn', 'bwFotoInput'].map(id => !!$(id));
          const lab = document.querySelector('#bandWieScreen label.label-with-info'), kn = lab.querySelector('.niveau-info-btn');
          const tekst = document.createRange(); tekst.selectNodeContents(lab.firstChild);
          const tr = tekst.getBoundingClientRect(), kr = kn.getBoundingClientRect();
          u.info = { afstand: Math.round(kr.left - tr.right), rechts: Math.round(lab.getBoundingClientRect().right - kr.right), knopTekst: kn.textContent };
          // Onze media: foto, kruisje, opslaan.
          openTegelScreen('bandMedia'); await w(400);
          u.mediaFoto = ['bmFotoPreview', 'bmFotoRemoveBtn', 'bmFotoInput'].map(id => !!$(id));
          u.kruisVoor = $('bmFotoRemoveBtn').classList.contains('visible');
          bmFotoUrl = 'https://x.test/b.jpg'; bmRenderFoto();
          u.kruisNa = [$('bmFotoRemoveBtn').classList.contains('visible'), $('bmFotoRemoveBtn').textContent.trim()];
          u.wijziging = tegelHeeftWijzigingen();
          await saveBandMedia(); await w(300);
          u.opgeslagen = S.data.bands[0].avatar_url;
          bmVraagFotoWeg(); await w(50); u.vraag = $('confirmMessage').textContent; confirmModalYes(); await w(50);
          await saveBandMedia(); await w(300);
          u.weg = S.data.bands[0].avatar_url;
          db.from = keep.from; myMusicianId = keep.myMusicianId; currentUser = keep.currentUser; hasOwnProfile = keep.hasOwnProfile; window.getMyMusicianId = keep.wie;
          return u;
        }""")
        j74 = json.dumps(d74, ensure_ascii=False)
        check("de bandnaam staat als gedempte regel onder de titel: overzicht, bezetting, muziek en media; in Wie zijn we niet",
              all(d74[k] and d74[k][0] == "Silver Earring" and d74[k][1] == "block" and d74[k][2] == "14px"
                  for k in ["overzicht", "bandBezetting", "bandMuziek", "bandMedia"]) and d74["wieRegel"] is False, j74)
        check("Wie zijn we heeft geen bandfoto meer; Onze media wel, met het kruisje pas bij een foto",
              d74["wieFoto"] == [False] * 3 and d74["mediaFoto"] == [True] * 3 and d74["kruisVoor"] is False
              and d74["kruisNa"] == [True, "✕"], j74)
        check("de tegelondertitels noemen de bandfoto bij Onze media, niet meer bij Wie zijn we",
              d74["subs"][0] == "naam - plaats - ervaring - bio" and d74["subs"][3].startswith("bandfoto - "), j74)
        check("de bandfoto hoort bij Onze media: een wijziging telt voor 'Terug zonder opslaan?', Opslaan bewaart hem, het kruisje vraagt eerst en haalt hem weg",
              d74["wijziging"] is True and d74["opgeslagen"] == "https://x.test/b.jpg" and d74["vraag"] == "Bandfoto verwijderen?" and d74["weg"] is None, j74)
        check("het i-teken staat direct achter 'Ervaring van de band' (8px), niet meer rechts",
              d74["info"]["knopTekst"] == "i" and 4 <= d74["info"]["afstand"] <= 12 and d74["info"]["rechts"] > 100, j74)
        check("geen paginafouten in blok 74", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ─────────────────────────────────────────────────────────────
        # Blok 75 — TT-442 en TT-443 (08-10-2026, besluiten Ronald): je eigen
        # profiel staat niet in de resultaten van Zoeken; de uitleg bij de
        # banner is groter en past nog op één regel.
        # ─────────────────────────────────────────────────────────────
        print("\nBlok 75 — eigen profiel niet in Zoeken; bannertekst op één regel (TT-442, TT-443)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 375, "height": 812})
        d75 = page.evaluate(r"""async () => {
          const S = window.TT_STUB, w = ms => new Promise(r => setTimeout(r, ms)), u = {};
          const $ = id => document.getElementById(id);
          const keep = { myMusicianId, currentUser, hasOwnProfile, wie: window.getMyMusicianId, filt: filterInstruments };
          window.getMyMusicianId = async () => myMusicianId;
          myMusicianId = 'm1'; currentUser = currentUser || { id: 'u1', email: 'test@talenttent.org' }; hasOwnProfile = true;
          filterInstruments = [];
          const rij = (id, naam) => ({ id, weergavenaam: naam, username: naam.toLowerCase(), city: 'Den Haag', zip: '2491AA', bio: '', goal: null,
            avatar_url: null, musician_instruments: [{ instrument: 'Gitaar', niveau: 3 }], musician_genres: [{ genre: 'Rock' }],
            musician_songs: [{ song_title: 'One', song_artist: 'Metallica', mastery_level: 3 }] });
          S.data.musicians = [rij('m1', 'Ronald'), rij('m2', 'Colin'), rij('m3', 'Tester1')];
          const treffers = () => ['m1', 'm2', 'm3'].map((id, i) => ({ musician_id: id, distance_km: i + 2, score: 0.5, is_stale: false }));
          S.rpcResults.tt_search_musicians = treffers;
          S.rpcResults.tt_musicians_ages = [];
          // 1. Zoek muzikanten
          showView('search'); setSearchMode('musician'); await w(500);
          document.getElementById('filterRadius').value = '10';
          await runSearch(); await w(300);
          const tekst = $('searchResults').textContent;
          u.muz = { ik: /Ronald/.test(tekst), colin: /Colin/.test(tekst), tester: /Tester1/.test(tekst) };
          u.muzLijst = lastMusicianResults.map(m => m.id);
          // 2. Zoek muzikanten via een setlist, ook met een getypte Plaats
          S.rpcResults.tt_search_musicians_by_songlist_anon = () => treffers();
          S.rpcResults.tt_search_musicians_anon = () => treffers();
          setlistWantedSongs = [{ title: '', artist: 'Metallica' }];
          document.getElementById('filterSetlistRadius').value = '10';
          document.getElementById('filterSetlistCity').value = '';
          await runSetlistSearch(); await w(300);
          u.setlist = lastSetlistResults.map(m => m.id);
          // 3. Zonder profiel verandert er niets: niemand valt weg
          myMusicianId = null; hasOwnProfile = false;
          await runSearch(); await w(300);
          u.zonderProfiel = lastMusicianResults.length;
          // 4. De bannertekst
          currentUser = currentUser || { id: 'u1' }; myMusicianId = 'm1'; hasOwnProfile = true;
          showView('profieltegels'); openTegelScreen('mediahoek'); await w(250);
          const el = $('mhBannerTeller'); el.innerHTML = bannerTellerHTML(3);
          const cs = getComputedStyle(el), r = el.getBoundingClientRect();
          u.banner = { fs: cs.fontSize, regels: Math.round(r.height / parseFloat(cs.lineHeight)), breed: Math.round(r.width) };
          u.alleTellers = ['wizardBannerTeller', 'mhBannerTeller', 'bmBannerTeller'].map(id => !!$(id) && $(id).classList.contains('banner-teller'));
          window.getMyMusicianId = keep.wie; myMusicianId = keep.myMusicianId; currentUser = keep.currentUser;
          hasOwnProfile = keep.hasOwnProfile; filterInstruments = keep.filt;
          return u;
        }""")
        j75 = json.dumps(d75, ensure_ascii=False)
        check("Zoek muzikanten: je eigen profiel staat er niet bij, de anderen wel",
              d75["muz"] == {"ik": False, "colin": True, "tester": True} and d75["muzLijst"] == ["m2", "m3"], j75)
        check("Zoek muzikanten via een setlist: je eigen profiel staat er niet bij, de anderen wel",
              d75["setlist"] == ["m2", "m3"], j75)
        check("zonder eigen profiel valt niemand weg", d75["zonderProfiel"] == 3, j75)
        check("de uitleg bij de banner is 14px en past op 375px op één regel, voor alle drie de schermen",
              d75["banner"]["fs"] == "14px" and d75["banner"]["regels"] == 1 and d75["alleTellers"] == [True] * 3, j75)
        check("geen paginafouten in blok 75", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()
        page.set_viewport_size({"width": 390, "height": 844})

        # ────────────────────────────────────────────────────────────
        # Blok 76 — TT-410a (08-10-2026, besluit Ronald): het niveau van een
        # instrument kies je inline, onder de badges, niet in een venster. De
        # instrumentenlijst blijft een keuzelaag. Eén paneel per veld, voor één
        # instrument tegelijk. Een instrument zonder niveau mag (TT-U09).
        # ────────────────────────────────────────────────────────────
        print("\nBlok 76 — niveau inline kiezen, instrumentenlijst blijft een keuzelaag (TT-410a)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 390, "height": 844})
        d76 = page.evaluate(r"""async () => {
          const w = ms => new Promise(r => setTimeout(r, ms)), u = {}, $ = id => document.getElementById(id);
          const keep = { myMusicianId, currentUser, hasOwnProfile };
          myMusicianId = 'm1'; currentUser = currentUser || { id: 'u1', email: 'test@talenttent.org' }; hasOwnProfile = true;
          showView('profieltegels'); openTegelScreen('watSpeelJe'); await w(300);
          wspState = { instruments: [], instrumentLevels: {}, genres: [] };
          initInstrumentPicker({ id: 'wsp', fieldId: 'wspInstrumentField', badgeRowId: 'wspInstrumentBadgeRow',
            getInstruments: () => wspState.instruments, getLevels: () => wspState.instrumentLevels });
          initInstrumentPicker({ id: 'wsp', fieldId: 'wspInstrumentField', badgeRowId: 'wspInstrumentBadgeRow',
            getInstruments: () => wspState.instruments, getLevels: () => wspState.instrumentLevels });
          const paneel = () => $('wspInstrumentBadgeRowNiveau');
          const badges = () => [...$('wspInstrumentBadgeRow').children];
          u.paneelAantal = document.querySelectorAll('#wspInstrumentBadgeRowNiveau').length;
          u.beginVerborgen = paneel().hidden;
          // 1. Instrument kiezen uit de lijst: de laag sluit, het paneel opent, er is nog geen niveau
          $('wspInstrumentField').click(); await w(60);
          u.lijstOpen = $('instrumentLevelModal').classList.contains('visible');
          pickInstrumentFromSheet('Gitaar'); await w(60);
          u.naKeuze = { lijstDicht: !$('instrumentLevelModal').classList.contains('visible'), lijst: wspState.instruments.slice(),
            niveau: wspState.instrumentLevels.Gitaar || null, paneelOpen: !paneel().hidden,
            keuzes: paneel().querySelectorAll('.level-choice').length, badgeOpen: badges()[0].classList.contains('open'),
            badgeTekst: badges()[0].querySelector('.picker-badge-stars').textContent.trim(),
            titel: paneel().querySelector('.niveau-paneel-titel').textContent };
          // 2. Maat: vijf keuzes van minstens 44px, binnen het scherm
          const r = paneel().getBoundingClientRect();
          u.maat = { minHoogte: Math.min(...[...paneel().querySelectorAll('.level-choice')].map(b => Math.round(b.getBoundingClientRect().height))),
            binnen: r.left >= 0 && r.right <= window.innerWidth, scrollBreed: document.documentElement.scrollWidth <= window.innerWidth };
          // 3. Niveau kiezen: een tik, het paneel blijft open met één zin over het niveau
          const knoppen = () => [...paneel().querySelectorAll('.level-choice')];
          knoppen()[2].click(); await w(60);
          u.niveau3 = { niveau: wspState.instrumentLevels.Gitaar, paneelOpen: !paneel().hidden,
            gekozen: knoppen().map(b => b.classList.contains('selected')), badge: badges()[0].querySelector('.picker-badge-stars').textContent.trim(),
            zin: paneel().querySelector('.picker-level-blurb').textContent === instrumentLevelBlurbs()[2] };
          knoppen()[3].click(); await w(60);
          u.niveau4 = wspState.instrumentLevels.Gitaar;
          // 4. De uitleg is een klapper in het paneel, geen tweede venster
          paneel().querySelector('.niveau-uitleg-knop').click(); await w(40);
          u.uitleg = { open: paneel().querySelectorAll('.niveau-uitleg p').length, modal: !!document.querySelector('#niveauInfoModal.visible') };
          paneel().querySelector('.niveau-uitleg-knop').click(); await w(40);
          u.uitlegDicht = paneel().querySelectorAll('.niveau-uitleg p').length;
          // 5. Tik op de badge sluit het paneel, nog een tik opent het met het gekozen niveau
          badges()[0].click(); await w(40);
          u.dicht = paneel().hidden;
          badges()[0].click(); await w(40);
          u.weerOpen = { open: !paneel().hidden, gekozen: knoppen().map(b => b.classList.contains('selected')) };
          // 6. Een tweede instrument: het eerste paneel sluit, het tweede opent, het niveau van het eerste blijft
          $('wspInstrumentField').click(); await w(40);
          pickInstrumentFromSheet('Bas'); await w(60);
          u.tweede = { titel: paneel().querySelector('.niveau-paneel-titel').textContent, open: badges().map(b => b.classList.contains('open')),
            niveauGitaar: wspState.instrumentLevels.Gitaar, zonderNiveau: badges()[1].querySelector('.picker-badge-stars').textContent.trim() };
          // 7. Een instrument zonder niveau mag blijven staan (TT-U09)
          u.zonderNiveauBlijft = wspState.instruments.slice();
          // 8. Het open instrument weghalen: paneel dicht, niveau weg
          badges()[1].querySelector('.picker-badge-remove').click(); await w(60);
          u.weg = { lijst: wspState.instruments.slice(), dicht: paneel().hidden, niveauBas: wspState.instrumentLevels.Bas || null };
          // 9. De oude stappen zijn weg
          u.oud = ['instrumentLevelStep', 'instrumentLevelFooter', 'instrumentLevelBackBtn', 'instrumentLevelChoices'].filter(id => $(id));
          u.oudeFuncties = ['showInstrumentLevelStep', 'backToInstrumentPick', 'removeInstrumentFromSheet', 'closeInstrumentLevelSheet',
            'renderInstrumentLevelChoices', 'equalizeLevelChoiceHeights'].filter(n => typeof window[n] === 'function');
          wspState = { instruments: [], instrumentLevels: {}, genres: [] };
          myMusicianId = keep.myMusicianId; currentUser = keep.currentUser; hasOwnProfile = keep.hasOwnProfile;
          return u;
        }""")
        j76 = json.dumps(d76, ensure_ascii=False)
        check("het veld heeft één paneel, ook na twee keer initialiseren, en het begint verborgen",
              d76["paneelAantal"] == 1 and d76["beginVerborgen"] is True, j76)
        check("een instrument kiezen: de lijst sluit, het instrument staat erin zonder niveau, het paneel opent met vijf keuzes",
              d76["lijstOpen"] and d76["naKeuze"]["lijstDicht"] and d76["naKeuze"]["lijst"] == ["Gitaar"] and d76["naKeuze"]["niveau"] is None
              and d76["naKeuze"]["paneelOpen"] and d76["naKeuze"]["keuzes"] == 5 and d76["naKeuze"]["badgeOpen"]
              and d76["naKeuze"]["badgeTekst"] == "Kies niveau" and d76["naKeuze"]["titel"] == "Niveau voor Gitaar", j76)
        check("de vijf keuzes zijn minstens 44px hoog en passen op 390px",
              d76["maat"]["minHoogte"] >= 44 and d76["maat"]["binnen"] and d76["maat"]["scrollBreed"], j76)
        check("een niveau kiezen is één tik: het wordt gezet, het paneel blijft open, de badge toont de sterren, één zin legt het uit",
              d76["niveau3"]["niveau"] == 3 and d76["niveau3"]["paneelOpen"] and d76["niveau3"]["gekozen"] == [False, False, True, False, False]
              and d76["niveau3"]["badge"] == "★★★" and d76["niveau3"]["zin"], j76)
        check("het niveau is te wijzigen met een tik", d76["niveau4"] == 4, j76)
        check("de uitleg is een klapper in het paneel: vijf niveaus, geen tweede venster",
              d76["uitleg"]["open"] == 5 and not d76["uitleg"]["modal"] and d76["uitlegDicht"] == 0, j76)
        check("een tik op de badge sluit het paneel, nog een tik opent het met het gekozen niveau",
              d76["dicht"] is True and d76["weerOpen"]["open"] and d76["weerOpen"]["gekozen"] == [False, False, False, True, False], j76)
        check("een tweede instrument: het eerste paneel sluit, het tweede opent, het niveau van het eerste blijft",
              d76["tweede"]["titel"] == "Niveau voor Bas" and d76["tweede"]["open"] == [False, True]
              and d76["tweede"]["niveauGitaar"] == 4 and d76["tweede"]["zonderNiveau"] == "Kies niveau", j76)
        check("een instrument zonder niveau mag blijven staan (TT-U09)", d76["zonderNiveauBlijft"] == ["Gitaar", "Bas"], j76)
        check("het open instrument weghalen sluit het paneel en wist het niveau",
              d76["weg"] == {"lijst": ["Gitaar"], "dicht": True, "niveauBas": None}, j76)
        check("het niveau-venster en zijn stappen bestaan niet meer",
              d76["oud"] == [] and d76["oudeFuncties"] == [], j76)
        check("geen paginafouten in blok 76", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ────────────────────────────────────────────────────────────
        # Blok 77 — TT-410a stap 2 en 3b (08-10-2026, besluit Ronald: "Behouden,
        # mits het nog leesbaar is. UX gaat voor alles."): de voorwaardenlaag
        # toont de documenten met dezelfde opmaak als de losse schermen, en de
        # bio staat inline in de tegel Wie ben je.
        # ────────────────────────────────────────────────────────────
        print("\nBlok 77 — voorwaardenlaag leesbaar; bio inline in Wie ben je (TT-410a)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 375, "height": 812})
        d77 = page.evaluate(r"""async () => {
          const w = ms => new Promise(r => setTimeout(r, ms)), u = {}, $ = id => document.getElementById(id);
          const stijl = el => { const c = getComputedStyle(el); return [c.fontSize, c.lineHeight, c.marginTop, c.marginBottom, c.color, c.fontWeight].join('|'); };
          u.laag = {};
          for (const [type, viewId] of [['terms', 'view-terms'], ['privacy', 'view-privacy'], ['gedragscode', 'view-gedragscode']]) {
            const bron = document.querySelector('#' + viewId + ' .doc-view');
            openLegalModal(type); await w(40);
            const inh = $('legalModalContent'), box = document.querySelector('#legalModal .modal-box');
            const gelijk = sel => { const a = bron.querySelector(sel), b = inh.querySelector(sel); return !a ? true : (!!b && stijl(a) === stijl(b)); };
            u.laag[type] = { h2: gelijk('h2'), p: gelijk('p'), li: gelijk('li'), upd: gelijk('.doc-updated'),
              h2Maat: getComputedStyle(inh.querySelector('h2')).fontSize, pMaat: getComputedStyle(inh.querySelector('p')).fontSize,
              regel: getComputedStyle(inh.querySelector('p')).lineHeight,
              breed: box.scrollWidth <= box.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth };
            closeLegalModal();
          }
          const keep = { myMusicianId, currentUser, hasOwnProfile };
          myMusicianId = 'm1'; currentUser = currentUser || { id: 'u1', email: 'test@talenttent.org' }; hasOwnProfile = true;
          showView('profieltegels'); openTegelScreen('wieBenJe'); await w(400);
          const vak = $('wbjBio'), r = vak.getBoundingClientRect(), veld = vak.closest('.field');
          u.tegel = { zichtbaar: r.width > 0 && r.height > 0, binnen: r.left >= 0 && r.right <= window.innerWidth, hoogte: Math.round(r.height),
            scrollBreed: document.documentElement.scrollWidth <= window.innerWidth, chips: veld.querySelectorAll('.bio-prompt-chip').length,
            voorbeeld: vak.placeholder.startsWith('Hoi allemaal! Ik ben Kevin.') && vak.placeholder.split('\n').length === 3,
            stijl: [getComputedStyle(vak, '::placeholder').fontStyle], leeg: vak.value === '' };
          const voor = tegelHeeftWijzigingen();
          vak.value = 'Hoi'; vak.dispatchEvent(new Event('input', { bubbles: true })); await w(30);
          u.tegel.wijziging = [voor, tegelHeeftWijzigingen()];
          vak.value = '';
          myMusicianId = keep.myMusicianId; currentUser = keep.currentUser; hasOwnProfile = keep.hasOwnProfile;
          showView('about');
          return u;
        }""")
        j77 = json.dumps(d77, ensure_ascii=False)
        check("de voorwaardenlaag toont elk document met dezelfde opmaak als het losse scherm: koppen, alinea's, lijsten en datum",
              all(d77["laag"][t][k] for t in d77["laag"] for k in ("h2", "p", "li", "upd")), j77)
        check("de voorwaardenlaag is leesbaar: koppen 16px, tekst 14px met regelafstand 1,7, geen zijwaartse scroll op 375px",
              all(v["h2Maat"] == "16px" and v["pMaat"] == "14px" and v["regel"] == "23.8px" and v["breed"] for v in d77["laag"].values()), j77)
        check("Wie ben je: de bio is een zichtbaar tekstveld binnen het scherm van 375px, zonder voorzetknoppen",
              d77["tegel"]["zichtbaar"] and d77["tegel"]["binnen"] and d77["tegel"]["scrollBreed"] and d77["tegel"]["chips"] == 0, j77)
        check("Wie ben je: het veld toont de voorbeeldtekst van Kevin (3 alinea's) als cursieve placeholder en is zelf leeg",
              d77["tegel"]["voorbeeld"] and d77["tegel"]["stijl"] == ["italic"] and d77["tegel"]["leeg"], j77)
        check("Wie ben je: typen in de bio telt mee voor \"Terug zonder opslaan?\"",
              d77["tegel"]["wijziging"] == [False, True], j77)
        check("geen paginafouten in blok 77", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ────────────────────────────────────────────────────────────
        # Blok 78 — TT-444 (09-10-2026, bevinding Ronald na een test op de
        # telefoon): drie meldingen die niets zeiden of bleven staan.
        #  1. een bestaand e-mailadres gaf "Er ging iets mis";
        #  2. een ontbrekend genre gaf een toast, bij een veld buiten beeld;
        #  3. het blok "Nog één stap" bleef staan na de klik in de mail.
        # ────────────────────────────────────────────────────────────
        print("\nBlok 78 — meldingen die iets zeggen (TT-444)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 375, "height": 812})
        d78 = page.evaluate(r"""async () => {
          const w = ms => new Promise(r => setTimeout(r, ms)), u = {}, $ = id => document.getElementById(id);
          const keep = { myMusicianId, currentUser, hasOwnProfile };
          const regel = id => { const e = $(id), n = e && e.nextElementSibling; return n && n.classList.contains('field-msg') ? n.textContent.trim() : null; };
          // 1. Bestaand e-mailadres, ander wachtwoord
          showView('register'); await w(60);
          currentUser = null;
          Object.assign(state, { regEmail: 'bestaat@talenttent.org', regPassword: 'fout-wachtwoord', fname: 'Test', username: 'testje', city: 'Den Haag', zip: '2497AA' });
          TT_STUB.signUpError = { message: 'User already registered' };
          TT_STUB.authError = { message: 'Invalid login credentials' };
          $('appToast').textContent = ''; $('appToast').classList.remove('visible');
          const ok1 = await createAccountAndProfile();
          u.bestaand = { ok: ok1, veld: $('regEmail').classList.contains('field-error'), tekst: regel('regEmail'),
            toast: $('appToast').textContent, overlay: $('saveOverlay').classList.contains('visible') };
          // Een andere fout bij het inloggen is geen "bestaat al"
          clearFieldError('regEmail');
          TT_STUB.authError = { message: 'Email rate limit exceeded' };
          await createAccountAndProfile();
          u.anders = { veld: $('regEmail').classList.contains('field-error'), toast: $('appToast').textContent };
          delete TT_STUB.signUpError; delete TT_STUB.authError;
          // 2. Stap 2 van de wizard: geen instrument en geen genre
          state.instruments = []; state.genres = []; state.instrumentLevels = {};
          $('appToast').textContent = ''; $('appToast').classList.remove('visible');
          await nextStep(1);
          u.stap2 = { instr: regel('instrumentPickerField'), genre: regel('genrePickerField'),
            instrRood: $('instrumentPickerField').classList.contains('field-error'), genreRood: $('genrePickerField').classList.contains('field-error'),
            toast: $('appToast').textContent };
          state.genres.push('Rock'); renderPickerBadges(PICKERS.genre);
          u.naGenre = { genre: regel('genrePickerField'), instr: regel('instrumentPickerField') };
          state.instruments.push('Gitaar'); renderInstrumentBadges('wizard');
          u.naInstrument = regel('instrumentPickerField');
          state.instruments = []; state.genres = []; state.instrumentLevels = {};
          clearFieldErrors(document);
          // 2b. Dezelfde regel in de tegel Wat speel je
          wspState = { instruments: [], instrumentLevels: {}, genres: [] };
          myMusicianId = 'm1'; hasOwnProfile = true;
          await saveWatSpeelJe();
          u.tegel = { instr: regel('wspInstrumentField'), genre: regel('wspGenreField'), toast: $('appToast').textContent };
          clearFieldErrors(document);
          wspState = { instruments: [], instrumentLevels: {}, genres: [] };
          u.oudeTekst = [nextStep.toString(), saveWatSpeelJe.toString()].some(t => t.includes('Selecteer minimaal'));
          // 3. Het blok "Nog één stap" verdwijnt na de bevestiging
          currentUser = { id: 'u1', email: 'test@talenttent.org' };
          bevestigPeilStoppen();
          Object.assign(TT_STUB.data.musicians[0], { user_id: 'u1', wacht_op_bevestiging: true });
          try { sessionStorage.removeItem('tt-bevestig-melding-dicht'); } catch (e) { /* geen opslag */ }
          showView('myprofile'); await w(300);
          await renderEmailBevestigBanner();
          const el = $('emailBevestigBanner');
          u.blok = { eerst: !!el.querySelector('.melding-kop') && el.textContent.includes('Nog één stap'), timer: !!bevestigPeilTimer };
          await bevestigPeilen(); await w(50);
          u.nogWachten = !!el.querySelector('#bevestigKnoppen');
          TT_STUB.data.musicians[0].wacht_op_bevestiging = false;
          await bevestigPeilen(); await w(300);
          u.bevestigd = { tekst: el.textContent.includes('bevestigd') && !el.textContent.includes('Nog één stap'),
            knoppen: !!el.querySelector('#bevestigKnoppen'), timer: !!bevestigPeilTimer };
          await renderEmailBevestigBanner();
          u.blijftStaan = el.textContent.includes('bevestigd');
          await w(6300);
          u.weg = el.innerHTML.trim() === '';
          currentUser = keep.currentUser; myMusicianId = keep.myMusicianId; hasOwnProfile = keep.hasOwnProfile;
          showView('about');
          return u;
        }""")
        j78 = json.dumps(d78, ensure_ascii=False)
        check("bestaand e-mailadres: de fout staat bij het veld E-mailadres, in gewone taal, zonder toast en zonder wachtscherm",
              d78["bestaand"]["ok"] is False and d78["bestaand"]["veld"]
              and d78["bestaand"]["tekst"] == "Dit e-mailadres heeft al een account. Log in, of gebruik een ander e-mailadres"
              and "iets mis" not in d78["bestaand"]["toast"].lower() and not d78["bestaand"]["overlay"], j78)
        check("een andere inlogfout (te veel pogingen) wordt niet als bestaand e-mailadres gemeld",
              d78["anders"]["veld"] is False and "Te veel pogingen" in d78["anders"]["toast"], j78)
        check("stap 2: geen instrument en geen genre geeft twee veldfouten bij de velden zelf, geen toast",
              d78["stap2"]["instr"] == "Kies minimaal één instrument" and d78["stap2"]["genre"] == "Kies minimaal één genre"
              and d78["stap2"]["instrRood"] and d78["stap2"]["genreRood"] and d78["stap2"]["toast"] == "", j78)
        check("stap 2: een genre kiezen haalt alleen de genrefout weg, een instrument kiezen die van het instrument",
              d78["naGenre"]["genre"] is None and d78["naGenre"]["instr"] == "Kies minimaal één instrument" and d78["naInstrument"] is None, j78)
        check("tegel Wat speel je: dezelfde veldfouten, geen toast",
              d78["tegel"]["instr"] == "Kies minimaal één instrument" and d78["tegel"]["genre"] == "Kies minimaal één genre" and d78["tegel"]["toast"] == "", j78)
        check("de oude toasts \"Selecteer minimaal\" bestaan niet meer", d78["oudeTekst"] is False, j78)
        check("het blok Nog één stap staat zolang het profiel wacht, en de app kijkt mee",
              d78["blok"]["eerst"] and d78["blok"]["timer"] and d78["nogWachten"], j78)
        check("na de bevestiging staat er \"Je e-mailadres is bevestigd\" in plaats van het blok; de app stopt met kijken",
              d78["bevestigd"]["tekst"] and not d78["bevestigd"]["knoppen"] and not d78["bevestigd"]["timer"], j78)
        check("de bevestigingsmelding blijft staan als het profiel opnieuw laadt, en verdwijnt daarna vanzelf",
              d78["blijftStaan"] and d78["weg"], j78)
        check("geen paginafouten in blok 78", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ────────────────────────────────────────────────────────────
        # Blok 79 — TT-445 (09-10-2026, Ronald): geen generieke meldingen.
        # Elke melding noemt de oorzaak of de actie die niet lukte, en zegt
        # wat je dan doet. Eigen zinnen in de code worden niet overschreven.
        # ────────────────────────────────────────────────────────────
        print("\nBlok 79 — meldingen met oorzaak en volgende stap (TT-445)")
        page_errors.clear()
        d79 = page.evaluate(r"""() => {
          const f = friendlyErrorMessage, r = {};
          r.onbekend = f(new Error('iets vreemds'), 'je profiel opslaan');
          r.zonderActie = f(new Error('iets vreemds'));
          r.eigen = f(eigenFout('Je staat niet meer bij deze band.'), 'de band verlaten');
          r.trigger = f(new Error('Bevestig eerst je e-mailadres.'), 'je bericht versturen');
          r.server = f({ message: 'x', status: 503 }, 'zoeken');
          r.verbinding = f(new Error('Failed to fetch'), 'zoeken');
          r.autor = f(new Error('author unknown'), 'je profiel opslaan');
          r.rls = f(new Error('new row violates row-level security policy'), 'de band opslaan');
          r.nietNul = f(new Error('null value in column "x"'), 'je profiel opslaan');
          return r;
        }""")
        j79 = json.dumps(d79, ensure_ascii=False)
        check("TT-445: een onbekende fout noemt de actie en zegt dat je invoer blijft staan",
              d79["onbekend"].startswith("Je profiel opslaan is niet gelukt.") and "blijft staan" in d79["onbekend"], j79)
        check("TT-445: nergens meer 'Er ging iets mis' in de centrale tekst",
              all("iets mis" not in v.lower() for v in d79.values()), j79)
        check("TT-445: een eigen zin in de code komt ongewijzigd door",
              d79["eigen"] == "Je staat niet meer bij deze band.", j79)
        check("TT-445: de Nederlandse tekst uit de database komt ongewijzigd door",
              d79["trigger"] == "Bevestig eerst je e-mailadres.", j79)
        check("TT-445: een serverfout zegt dat je even moet wachten",
              "even" in d79["server"].lower() or "minuut" in d79["server"], j79)
        check("TT-445: 'author' is geen verlopen sessie",
              "sessie" not in d79["autor"], j79)
        check("TT-445: geen toegang noemt inloggen als volgende stap",
              "Log opnieuw in" in d79["rls"], j79)
        check("TT-445: nergens meer 'meld dit aan Ronald' in meldingen",
              "Ronald" not in d79["nietNul"], j79)
        import re as _re79, glob as _glob79
        bron79 = "".join(open(x, encoding="utf-8").read() for x in _glob79.glob(os.path.join(ROOT, "*.js")))
        check("TT-445: de losse vage teksten zijn weg",
              not any(t in bron79 for t in ["Zoekopdracht mislukt", "Kon postcode nu niet controleren", "Kopiëren niet gelukt",
                                            "Bandbeheer is nu niet beschikbaar", "Kon niet controleren. Probeer"]), "")
        check("TT-445: geen aanroep van friendlyErrorMessage zonder actie",
              not _re79.findall(r"friendlyErrorMessage\(\w+\)", bron79), "")
        check("TT-445: geen 'neem contact op' als oplossing in de app",
              "neem contact op" not in bron79.lower(), "")
        check("TT-445: geen paginafouten in blok 79", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ────────────────────────────────────────────────────────────
        # Blok 80 — TT-446 (09-10-2026, Ronald): een grote telefoonfoto wordt
        # niet meer geweigerd; de app verkleint hem zelf voor het uploaden.
        # ────────────────────────────────────────────────────────────
        print("\nBlok 80 — foto's verkleinen voor het uploaden (TT-446)")
        page_errors.clear()
        d80 = page.evaluate(r"""async () => {
          const r = {};
          const c = document.createElement('canvas'); c.width = 3200; c.height = 2400;
          const x = c.getContext('2d'); const d = x.createImageData(3200, 2400);
          for (let i = 0; i < d.data.length; i += 4) { d.data[i] = Math.random()*255; d.data[i+1] = Math.random()*255; d.data[i+2] = Math.random()*255; d.data[i+3] = 255; }
          x.putImageData(d, 0, 0);
          const blob = await new Promise(ok => c.toBlob(ok, 'image/png'));
          const groot = new File([blob], 'IMG_0001.PNG', { type: 'image/png' });
          r.voor = groot.size;
          const klein = await fotoVerkleinen(groot);
          r.na = klein.size; r.type = klein.type; r.naam = klein.name;
          const bm = await createImageBitmap(klein);
          r.breed = bm.width; r.hoog = bm.height;
          const mini = new File([new Uint8Array(1000)], 'k.png', { type: 'image/png' });
          r.miniZelfde = (await fotoVerkleinen(mini)) === mini;
          const gif = new File([new Uint8Array(6*1024*1024)], 'a.gif', { type: 'image/gif' });
          r.gifZelfde = (await fotoVerkleinen(gif)) === gif;
          r.foto12 = bestandTeGrootMelding(new File([new Uint8Array(12*1024*1024)], 'f.jpg', { type: 'image/jpeg' }), 5*1024*1024);
          r.foto40 = bestandTeGrootMelding(new File([new Uint8Array(40*1024*1024)], 'f.jpg', { type: 'image/jpeg' }), 5*1024*1024);
          r.video = bestandTeGrootMelding(new File([new Uint8Array(60*1024*1024)], 'v.mp4', { type: 'video/mp4' }), 50*1024*1024);
          r.gif = bestandTeGrootMelding(gif, 5*1024*1024);
          return r;
        }""")
        j80 = json.dumps(d80, ensure_ascii=False)
        check("TT-446: een grote foto wordt een kleinere JPG van maximaal 1600 pixels",
              d80["type"] == "image/jpeg" and d80["na"] < d80["voor"] and max(d80["breed"], d80["hoog"]) <= 1600
              and d80["naam"] == "IMG_0001.jpg", j80)
        check("TT-446: een kleine foto en een GIF blijven ongemoeid",
              d80["miniZelfde"] and d80["gifZelfde"], j80)
        check("TT-446: een foto van 12 MB wordt niet meer geweigerd, een van 40 MB wel met een duidelijke tekst",
              d80["foto12"] is None and "30 MB" in (d80["foto40"] or ""), j80)
        check("TT-446: een video boven 50 MB zegt wat je doet; een grote GIF wijst naar JPG of PNG",
              "Kort de video in" in (d80["video"] or "") and "JPG of PNG" in (d80["gif"] or ""), j80)
        bron80 = "".join(open(os.path.join(ROOT, x), encoding="utf-8").read() for x in ["wizard.js", "musicians.js", "bands.js"])
        check("TT-446: geen vaste grens van 5 MB meer op foto's in de schermen",
              "Afbeelding is te groot" not in bron80, "")
        check("TT-446: geen paginafouten in blok 80", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ────────────────────────────────────────────────────────────
        # Blok 81 — TT-451 (09-10-2026, Ronald): berichten van Talent Tent in de
        # inbox. Alleen lezen, de matches als tikbare rijen, een getal op
        # Berichten zolang er een ongelezen bericht is (de stip is voor TT-452).
        # ────────────────────────────────────────────────────────────
        print("\nBlok 81 — berichten van Talent Tent in de inbox (TT-451)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 390, "height": 844})
        d81 = page.evaluate(r"""async () => {
          const S = window.TT_STUB, w = (n = 150) => new Promise(r => setTimeout(r, n)), u = {};
          const $ = id => document.getElementById(id);
          const keep = { myMusicianId, currentUser, hasOwnProfile, wie: window.getMyMusicianId, blok: blokkadeDoorMij, bands: S.rpcResults.tt_get_bands_public };
          window.getMyMusicianId = async () => myMusicianId;
          myMusicianId = 'm1'; currentUser = currentUser || { id: 'u1', email: 'test@talenttent.org' }; hasOwnProfile = true;
          ttBerichtenBeschikbaar = true;
          const nu = Date.now();
          S.data.musicians = [
            { id: 'm1', username: 'ik', fname: 'Ik', weergavenaam: 'Ik' },
            { id: 'm2', username: 'dyl', fname: 'Dylan', weergavenaam: 'Dylan', city: 'Delft', avatar_url: null },
            { id: 'm3', username: 'sanne', fname: 'Sanne', weergavenaam: 'Sanne', city: 'Rijswijk', avatar_url: null }];
          S.data.messages = [];
          S.rpcResults.tt_get_bands_public = [{ id: 'b1', name: 'Van Delft', city: 'Delft', avatar_url: null }];
          blokkadeDoorMij = new Set();
          S.data.talent_tent_berichten = [
            { id: 't1', musician_id: 'm1', created_at: new Date(nu - 3 * 86400000).toISOString(), read_at: new Date(nu - 2 * 86400000).toISOString(),
              inhoud: { muzikanten: [{ id: 'm3', km: 4.2, instrumenten: ['Zang'] }], bands: [], meer: 0 } },
            { id: 't2', musician_id: 'm1', created_at: new Date(nu - 3600000).toISOString(), read_at: null,
              inhoud: { muzikanten: [{ id: 'm2', km: 8.5, instrumenten: ['Gitaar', 'Bas'] }, { id: 'm9', km: 3, instrumenten: ['Drums'] }],
                        bands: [{ id: 'b1', km: 12, zoekt: ['Drums'] }], meer: 2 } }];
          const rij = () => [...document.querySelectorAll('#messagesInboxList .messages-conv-row')].map(e => ({
            naam: e.querySelector('.messages-conv-name').childNodes[0].textContent.trim(),
            voorbeeld: e.querySelector('.messages-conv-preview').textContent, ongelezen: e.classList.contains('unread'),
            badge: (e.querySelector('.unread-badge') || {}).textContent || null }));
          const getal = () => ({ onder: $('unreadBadgeBottom').style.display, boven: $('unreadBadge').style.display, tekst: $('unreadBadgeBottom').textContent });
          // 1. De inbox: Talent Tent als gesprek, met de kernzin als voorbeeld en het aantal ongelezen.
          showView('messages'); await w(300); await loadInbox(); await w(300);
          u.inbox = rij();
          await refreshUnreadBadge(); await w(200);
          u.getalOngelezen = getal();
          // 2. Een bericht van een muzikant en een van Talent Tent tellen samen in één getal.
          S.data.messages = [{ id: 1, sender_id: 'm2', recipient_id: 'm1', body: 'hoi', created_at: new Date(nu - 1000).toISOString(), read_at: null }];
          await refreshUnreadBadge(); await w(200);
          u.getalSamen = getal();
          S.data.messages = [];
          // 3. Het gesprek openen: alleen lezen, matches als rijen, een geblokkeerde muzikant en een verwijderd account ontbreken.
          blokkadeDoorMij = new Set(['m3']);
          const hist = [];
          await loadInbox(); await w(100);
          await openTalentTentGesprek(); await w(500);
          const bub = [...document.querySelectorAll('#messagesThreadList .tt-bericht')];
          u.draad = { n: bub.length, tekst: bub.map(b => b.querySelector('.tt-bericht-kop').textContent),
            rijen: [...document.querySelectorAll('#messagesThreadList .bb-rij-knop')].map(b => ({ naam: b.querySelector('.bb-naam').textContent, subs: [...b.querySelectorAll('.bb-sub')].map(x => x.textContent), klik: b.getAttribute('onclick') })),
            meer: [...document.querySelectorAll('#messagesThreadList .tt-meer')].map(b => b.textContent),
            naam: $('messagesThreadName').textContent, hash: location.hash, menu: $('messagesThreadActies').textContent.trim(),
            voet: getComputedStyle(document.querySelector('#messagesThreadPanel .messages-thread-footer')).display,
            systeem: activeConversationSysteem, dagen: [...document.querySelectorAll('#messagesThreadList .messages-day-divider')].map(e => e.textContent) };
          u.gelezen = S.data.talent_tent_berichten.every(b => b.read_at);
          u.getalNaLezen = getal();
          // 4. Niet te beantwoorden.
          document.getElementById('messagesReplyInput').value = 'hallo?';
          const voor = S.calls.filter(c => c.table === 'messages' && c.op === 'insert').length;
          await sendReplyInThread(); await w(200);
          u.verstuurd = S.calls.filter(c => c.table === 'messages' && c.op === 'insert').length - voor;
          const klikNaam = openThreadProfile(); // geen profiel om te openen
          u.profielOpen = huidigeView;
          // 5. Sluiten brengt de inbox terug, en een gewoon gesprek heeft weer zijn invoerveld.
          closeConversation(); await w(300);
          u.naSluiten = { systeem: activeConversationSysteem, paneel: $('messagesThreadPanel').classList.contains('thread-systeem') };
          await openConversation('m2', 'Dylan', null, false, false); await w(300);
          u.gewoon = { voet: getComputedStyle(document.querySelector('#messagesThreadPanel .messages-thread-footer')).display, systeem: activeConversationSysteem };
          closeConversation(true);
          // 6. Verversen op #messages/talent-tent opent het gesprek weer.
          await heropenGesprek('talent-tent'); await w(400);
          u.heropen = { id: activeConversationId, systeem: activeConversationSysteem };
          closeConversation(true);
          // 7. Een ontbrekende tabel laat de inbox gewoon werken, zonder Talent Tent en zonder getal.
          S.data.messages = [{ id: 2, sender_id: 'm2', recipient_id: 'm1', body: 'hoi', created_at: new Date(nu - 500).toISOString(), read_at: new Date(nu).toISOString() }];
          S.errors['talent_tent_berichten'] = { code: '42P01', message: 'relation does not exist' };
          ttBerichtenBeschikbaar = true;
          await loadInbox(); await w(300); await refreshUnreadBadge(); await w(200);
          u.zonderTabel = { rijen: rij().map(r => r.naam), getal: getal(), beschikbaar: ttBerichtenBeschikbaar };
          delete S.errors['talent_tent_berichten'];
          ttBerichtenBeschikbaar = true;
          // 8. Alleen verdwenen matches: geen bericht, geen lege bubbel.
          S.data.messages = [];
          S.data.talent_tent_berichten = [{ id: 't3', musician_id: 'm1', created_at: new Date(nu).toISOString(), read_at: null,
            inhoud: { muzikanten: [{ id: 'm9', km: 1, instrumenten: [] }], bands: [], meer: 0 } }];
          await openTalentTentGesprek(); await w(400);
          u.leeg = { bubbels: document.querySelectorAll('#messagesThreadList .tt-bericht').length, tekst: $('messagesThreadList').textContent.includes('Nog geen berichten van Talent Tent') };
          closeConversation(true);
          // 9. De dag-scheiding komt uit één functie.
          u.dag = [dagLabel(new Date()), dagLabel(new Date(Date.now() - 86400000))];
          myMusicianId = keep.myMusicianId; currentUser = keep.currentUser; hasOwnProfile = keep.hasOwnProfile; window.getMyMusicianId = keep.wie;
          blokkadeDoorMij = keep.blok; S.rpcResults.tt_get_bands_public = keep.bands; S.data.talent_tent_berichten = []; S.data.messages = [];
          showView('about'); await w(100);
          return u;
        }""")
        j81 = json.dumps(d81, ensure_ascii=False)
        check("TT-451: Talent Tent staat als gesprek in de inbox, met de kernzin als voorbeeld en het aantal ongelezen",
              [r["naam"] for r in d81["inbox"]] == ["Talent Tent"] and d81["inbox"][0]["ongelezen"] and d81["inbox"][0]["badge"] == "1"
              and d81["inbox"][0]["voorbeeld"] == "Er zijn 5 nieuwe matches bij jou in de buurt", j81)
        check("TT-451: een ongelezen bericht van Talent Tent geeft een getal op Berichten, in de bovenbalk en in de onderbalk",
              d81["getalOngelezen"]["onder"] != "none" and d81["getalOngelezen"]["tekst"] == "1" and d81["getalOngelezen"]["boven"] != "none", j81)
        check("TT-451: een bericht van een muzikant en een van Talent Tent tellen samen in één getal",
              d81["getalSamen"]["tekst"] == "2", j81)
        check("TT-451: het gesprek toont één bericht per digestrun, oud naar nieuw, met dag-scheiding",
              d81["draad"]["n"] == 1 and len(d81["draad"]["dagen"]) == 1 and d81["draad"]["dagen"][0] == "Vandaag", j81)
        check("TT-451: de kernzin telt alleen wat je ziet (een geblokkeerde en een verwijderde match tellen niet, \"en nog\" wel)",
              d81["draad"]["tekst"] == ["Er zijn 4 nieuwe matches bij jou in de buurt"], j81)
        check("TT-451: elke match is een tikbare rij met naam, plaats, afstand en instrumenten; een band met wat hij zoekt",
              [r["naam"] for r in d81["draad"]["rijen"]] == ["Dylan", "Van Delft"]
              and d81["draad"]["rijen"][0]["subs"] == ["Delft · 8.5 km", "Gitaar · Bas"]
              and d81["draad"]["rijen"][1]["subs"] == ["Delft · 12 km", "zoekt: Drums"]
              and "openProfielScherm('m2')" in d81["draad"]["rijen"][0]["klik"] and "openBandScherm('b1')" in d81["draad"]["rijen"][1]["klik"], j81)
        check("TT-451: wat de mail onder de vijf weglaat staat er als \"En nog N andere\", als knop naar Zoeken",
              d81["draad"]["meer"] == ["En nog 2 andere — bekijk ze in Zoeken"], j81)
        check("TT-451: het gesprek is alleen te lezen: geen invoerveld, geen menu, naam niet tikbaar, het adres noemt het gesprek",
              d81["draad"]["voet"] == "none" and d81["draad"]["menu"] == "" and d81["draad"]["naam"] == "Talent Tent"
              and d81["draad"]["hash"] == "#messages/talent-tent" and d81["draad"]["systeem"] is True and d81["profielOpen"] == "messages", j81)
        check("TT-451: er valt niets te versturen naar Talent Tent",
              d81["verstuurd"] == 0, j81)
        check("TT-451: openen leest alles als gelezen; het getal verdwijnt",
              d81["gelezen"] and d81["getalNaLezen"]["onder"] == "none" and d81["getalNaLezen"]["boven"] == "none", j81)
        check("TT-451: na sluiten heeft een gewoon gesprek weer zijn invoerveld",
              d81["naSluiten"]["systeem"] is False and d81["naSluiten"]["paneel"] is False and d81["gewoon"]["voet"] != "none" and d81["gewoon"]["systeem"] is False, j81)
        check("TT-451: verversen op #messages/talent-tent opent het gesprek weer",
              d81["heropen"]["id"] == "talent-tent" and d81["heropen"]["systeem"] is True, j81)
        check("TT-451: ontbreekt de tabel, dan werkt de inbox gewoon, zonder Talent Tent",
              d81["zonderTabel"]["rijen"] == ["Dylan"], j81)
        check("TT-451: ontbreekt de tabel, dan staat er geen getal en wordt er niet blijven gevraagd",
              d81["zonderTabel"]["getal"]["onder"] == "none" and d81["zonderTabel"]["beschikbaar"] is False, j81)
        check("TT-451: een bericht waarvan alle matches weg zijn, geeft geen lege bubbel maar de lege staat",
              d81["leeg"]["bubbels"] == 0 and d81["leeg"]["tekst"], j81)
        check("TT-451: Vandaag en Gisteren komen uit één functie (dagLabel)",
              d81["dag"] == ["Vandaag", "Gisteren"], j81)
        # Besluit Ronald, 09-10-2026: de pulserende stip is voor het browsersignaal op het icoon; in de app staat alleen een getal.
        html81 = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read() + open(os.path.join(ROOT, "styles.css"), encoding="utf-8").read()
        check("TT-451: in de app zelf is er geen stip voor Talent Tent, alleen het getal",
              "ttDot" not in html81 and "tt-dot" not in html81 and "ttHartslag" not in html81, "")
        bron81 = open(os.path.join(ROOT, "messages.js"), encoding="utf-8").read()
        check("TT-451: de app schrijft nooit een bericht van Talent Tent; alleen de digest maakt ze (de app leest en zet alleen read_at)",
              "talent_tent_berichten').insert" not in bron81 and "talent_tent_berichten').delete" not in bron81
              and bron81.count("from('talent_tent_berichten')") == 3, "")
        check("TT-451: geen paginafouten in blok 81", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ────────────────────────────────────────────────────────────
        # Blok 82 — TT-452 (09-10-2026, Ronald): het seintje op het toestel
        # (web push). Stille melding met een stip op het icoon; gaat weg zodra
        # de app opent; toestemming pas na het eerste bericht van Talent Tent;
        # uit te zetten per toestel; mail uit = geen seintje (digest).
        # ────────────────────────────────────────────────────────────
        print("\nBlok 82 — het seintje op het toestel (TT-452)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 390, "height": 844})
        d82 = page.evaluate(r"""async () => {
          const S = window.TT_STUB, w = (n = 150) => new Promise(r => setTimeout(r, n)), u = {};
          const $ = id => document.getElementById(id);
          const keep = { myMusicianId, currentUser, hasOwnProfile, wie: window.getMyMusicianId, api: { ...ttPushApi } };
          window.getMyMusicianId = async () => myMusicianId;
          myMusicianId = 'm1'; currentUser = currentUser || { id: 'u1', email: 'test@talenttent.org' }; hasOwnProfile = true;
          ttBerichtenBeschikbaar = true;
          const nu = Date.now();
          S.data.musicians = [{ id: 'm1', username: 'ik', fname: 'Ik', weergavenaam: 'Ik' }, { id: 'm2', username: 'dyl', fname: 'Dylan', weergavenaam: 'Dylan', city: 'Delft', avatar_url: null }];
          S.data.messages = [];
          S.data.talent_tent_berichten = [{ id: 't1', musician_id: 'm1', created_at: new Date(nu - 3600000).toISOString(), read_at: null,
            inhoud: { muzikanten: [{ id: 'm2', km: 8.5, instrumenten: ['Gitaar'] }], bands: [], meer: 0 } }];
          // Een nagebootste browser: toestemming, abonnement en seintjes zijn in te stellen.
          const m = { beschikbaar: true, toestemming: 'default', vraagt: 0, sub: null, abonneerd: 0, meldingen: [], gesloten: 0, uitgeschreven: 0, antwoord: 'granted' };
          const maakSub = () => ({ endpoint: 'https://push.example/abc', toJSON() { return { endpoint: this.endpoint, keys: { p256dh: 'P256', auth: 'AUTH' } }; },
            getKey() { return new Uint8Array([1, 2, 3]).buffer; }, unsubscribe: async () => { m.uitgeschreven++; m.sub = null; return true; } });
          ttPushApi.beschikbaar = () => m.beschikbaar;
          ttPushApi.toestemming = () => m.toestemming;
          ttPushApi.vraagToestemming = async () => { m.vraagt++; m.toestemming = m.antwoord; return m.antwoord; };
          ttPushApi.abonnement = async () => m.sub;
          ttPushApi.abonneer = async () => { m.abonneerd++; m.sub = maakSub(); return m.sub; };
          ttPushApi.meldingen = async () => m.meldingen;
          const rpcs = naam => S.calls.filter(c => c.kind === 'rpc' && c.name === naam);
          S.rpcResults.tt_push_abonneren = null; S.rpcResults.tt_push_uitzetten = null;
          localStorage.removeItem(TT_SEINTJE_NIET_NU);
          // 1. De stand.
          m.beschikbaar = false; u.stand_niet = await ttSeintjeStand();
          m.beschikbaar = true; m.toestemming = 'denied'; u.stand_geblokkeerd = await ttSeintjeStand();
          m.toestemming = 'default'; u.stand_uit = await ttSeintjeStand();
          m.toestemming = 'granted'; u.stand_toestemming_zonder_sub = await ttSeintjeStand();
          m.sub = maakSub(); u.stand_aan = await ttSeintjeStand(); m.sub = null; m.toestemming = 'default';
          // 2. De vraag staat alleen in het gesprek van Talent Tent, en pas als er een bericht te zien is.
          await openTalentTentGesprek(); await w(500);
          u.vraag_met_bericht = !!$('ttSeintjeVraag');
          u.vraag_tekst = $('ttSeintjeVraag') ? $('ttSeintjeVraag').textContent : '';
          u.vraag_knoppen = [...document.querySelectorAll('#ttSeintjeVraag button')].map(b => b.textContent);
          u.toestemming_gevraagd_door_openen = m.vraagt;
          closeConversation(true);
          S.data.talent_tent_berichten = [];
          await openTalentTentGesprek(); await w(400);
          u.vraag_zonder_bericht = !!$('ttSeintjeVraag');
          closeConversation(true);
          S.data.talent_tent_berichten = [{ id: 't1', musician_id: 'm1', created_at: new Date(nu - 3600000).toISOString(), read_at: null,
            inhoud: { muzikanten: [{ id: 'm2', km: 8.5, instrumenten: ['Gitaar'] }], bands: [], meer: 0 } }];
          // 3. "Niet nu": de vraag verdwijnt, en komt niet terug.
          await openTalentTentGesprek(); await w(400);
          ttSeintjeVraagNietNu();
          u.na_niet_nu = { weg: !$('ttSeintjeVraag'), bewaard: localStorage.getItem(TT_SEINTJE_NIET_NU) === '1', vraagt: m.vraagt };
          closeConversation(true);
          await openTalentTentGesprek(); await w(400);
          u.vraag_na_niet_nu = !!$('ttSeintjeVraag');
          closeConversation(true);
          localStorage.removeItem(TT_SEINTJE_NIET_NU);
          // 4. Aanzetten: toestemming vragen, abonneren, bij ons bewaren.
          S.calls.length = 0;
          u.aan = await ttSeintjeAanzetten();
          u.aan_detail = { vraagt: m.vraagt, abonneerd: m.abonneerd, rpc: rpcs('tt_push_abonneren').map(c => c.params) };
          // 5. Geweigerd: niets bij ons bewaard.
          m.sub = null; m.toestemming = 'default'; m.antwoord = 'denied'; m.abonneerd = 0; S.calls.length = 0;
          u.geweigerd = await ttSeintjeAanzetten();
          u.geweigerd_detail = { abonneerd: m.abonneerd, rpc: rpcs('tt_push_abonneren').length };
          m.antwoord = 'granted';
          // 6. Een fout bij het bewaren zegt 'fout', geen halve stand.
          m.sub = null; m.toestemming = 'default'; S.rpcErrors['tt_push_abonneren'] = { code: 'XX', message: 'stuk' };
          u.fout = await ttSeintjeAanzetten();
          delete S.rpcErrors['tt_push_abonneren'];
          // 7. Uitzetten: bij ons weg en in de browser.
          m.toestemming = 'granted'; m.sub = maakSub(); m.uitgeschreven = 0; S.calls.length = 0;
          u.uit = await ttSeintjeUitzetten();
          u.uit_detail = { uitgeschreven: m.uitgeschreven, rpc: rpcs('tt_push_uitzetten').map(c => c.params) };
          // 8. Een klaarstaand seintje verdwijnt zodra de app opent of weer zichtbaar wordt.
          m.toestemming = 'granted';
          m.meldingen = [{ close() { m.gesloten++; } }, { close() { m.gesloten++; } }];
          await ttSeintjeWeghalen();
          u.weggehaald = m.gesloten;
          m.gesloten = 0; m.toestemming = 'default';
          await ttSeintjeWeghalen();
          u.zonder_toestemming_niets = m.gesloten;
          m.toestemming = 'granted'; m.gesloten = 0;
          Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
          document.dispatchEvent(new Event('visibilitychange')); await w(100);
          u.zichtbaar_weggehaald = m.gesloten;
          delete document.visibilityState;
          // 9. Instellingen: het blok staat er, met de juiste knop; weg als de browser het niet kan.
          showView('instellingen'); await w(100);
          m.toestemming = 'default'; m.sub = null; m.gesloten = 0;
          await openSearchPrefsModal(); await w(300);
          u.inst_uit = { zichtbaar: $('pushBlok').style.display !== 'none', knop: $('pushKnop').textContent, tekst: $('pushTekst').textContent };
          m.toestemming = 'granted'; m.sub = maakSub();
          await vulPushInInstellingen(); await w(100);
          u.inst_aan = { knop: $('pushKnop').textContent, tekst: $('pushTekst').textContent };
          m.toestemming = 'denied'; m.sub = null;
          await vulPushInInstellingen(); await w(100);
          u.inst_geblokkeerd = { knop: $('pushKnop').style.display, tekst: $('pushTekst').textContent };
          m.beschikbaar = false;
          await vulPushInInstellingen(); await w(100);
          u.inst_niet = $('pushBlok').style.display;
          m.beschikbaar = true; m.toestemming = 'default'; m.sub = null;
          // 10. De schakelaar in Instellingen zet het seintje aan en uit.
          await vulPushInInstellingen(); await w(100);
          m.antwoord = 'granted'; S.calls.length = 0;
          await pushSchakelen(); await w(200);
          u.schakel_aan = { knop: $('pushKnop').textContent, rpc: rpcs('tt_push_abonneren').length };
          await pushSchakelen(); await w(200);
          u.schakel_uit = { knop: $('pushKnop').textContent, rpc: rpcs('tt_push_uitzetten').length };
          closeSearchPrefsModal();
          // 11. Uitloggen stopt het seintje op dit toestel (het hoort bij het account).
          m.toestemming = 'granted'; m.sub = maakSub(); m.uitgeschreven = 0; S.calls.length = 0;
          await signOut(); await w(200);
          u.uitloggen = { uitgeschreven: m.uitgeschreven, rpc: rpcs('tt_push_uitzetten').length };
          Object.assign(ttPushApi, keep.api);
          myMusicianId = keep.myMusicianId; currentUser = keep.currentUser; hasOwnProfile = keep.hasOwnProfile; window.getMyMusicianId = keep.wie;
          S.data.talent_tent_berichten = []; S.data.messages = [];
          showView('about'); await w(100);
          return u;
        }""")
        j82 = json.dumps(d82, ensure_ascii=False)
        check("TT-452: de stand is aan, uit, geblokkeerd of niet beschikbaar",
              d82["stand_niet"] == "nietBeschikbaar" and d82["stand_geblokkeerd"] == "geblokkeerd" and d82["stand_uit"] == "uit"
              and d82["stand_toestemming_zonder_sub"] == "uit" and d82["stand_aan"] == "aan", j82)
        check("TT-452: de vraag om een seintje staat in het gesprek van Talent Tent, met twee knoppen; openen vraagt zelf niets aan de browser",
              d82["vraag_met_bericht"] and d82["vraag_knoppen"] == ["Zet aan", "Niet nu"]
              and "seintje" in d82["vraag_tekst"] and d82["toestemming_gevraagd_door_openen"] == 0, j82)
        check("TT-452: zonder bericht van Talent Tent staat de vraag er niet (eerst waarde zien)",
              d82["vraag_zonder_bericht"] is False, j82)
        check("TT-452: \"Niet nu\" laat de vraag verdwijnen en komt niet terug",
              d82["na_niet_nu"]["weg"] and d82["na_niet_nu"]["bewaard"] and d82["na_niet_nu"]["vraagt"] == 0 and d82["vraag_na_niet_nu"] is False, j82)
        check("TT-452: aanzetten vraagt toestemming, abonneert en bewaart het toestel bij het account",
              d82["aan"] == "aan" and d82["aan_detail"]["vraagt"] == 1 and d82["aan_detail"]["abonneerd"] == 1
              and d82["aan_detail"]["rpc"] == [{"p_endpoint": "https://push.example/abc", "p_p256dh": "P256", "p_auth": "AUTH"}], j82)
        check("TT-452: geweigerd in de browser bewaart niets en zegt het",
              d82["geweigerd"] == "geblokkeerd" and d82["geweigerd_detail"] == {"abonneerd": 0, "rpc": 0}, j82)
        check("TT-452: een fout bij het bewaren geeft 'fout'",
              d82["fout"] == "fout", j82)
        check("TT-452: uitzetten verwijdert het toestel bij ons en in de browser",
              d82["uit"] is True and d82["uit_detail"]["uitgeschreven"] == 1
              and d82["uit_detail"]["rpc"] == [{"p_endpoint": "https://push.example/abc"}], j82)
        check("TT-452: een klaarstaand seintje gaat weg zodra de app opent of weer zichtbaar wordt (de stip gaat uit)",
              d82["weggehaald"] == 2 and d82["zonder_toestemming_niets"] == 0 and d82["zichtbaar_weggehaald"] == 2, j82)
        check("TT-452: Instellingen heeft het blok \"Seintje op dit toestel\", met Zet aan, Zet uit of een uitleg als de browser het blokkeert",
              d82["inst_uit"]["zichtbaar"] and d82["inst_uit"]["knop"] == "Zet aan" and d82["inst_aan"]["knop"] == "Zet uit"
              and d82["inst_geblokkeerd"]["knop"] == "none" and "browser" in d82["inst_geblokkeerd"]["tekst"], j82)
        check("TT-452: kan de browser geen seintjes, dan staat het blok er niet",
              d82["inst_niet"] == "none", j82)
        check("TT-452: de schakelaar in Instellingen zet het seintje aan en weer uit",
              d82["schakel_aan"] == {"knop": "Zet uit", "rpc": 1} and d82["schakel_uit"] == {"knop": "Zet aan", "rpc": 1}, j82)
        check("TT-452: uitloggen stopt het seintje op dit toestel",
              d82["uitloggen"] == {"uitgeschreven": 1, "rpc": 1}, j82)
        sw82 = open(os.path.join(ROOT, "sw.js"), encoding="utf-8").read()
        push82 = open(os.path.join(ROOT, "push.js"), encoding="utf-8").read()
        html82 = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        msg82 = open(os.path.join(ROOT, "messages.js"), encoding="utf-8").read()
        core82 = open(os.path.join(ROOT, "core.js"), encoding="utf-8").read()
        check("TT-452: de service worker toont een stil seintje met één tag en opent bij een tik het gesprek; geen cache, geen fetch",
              "addEventListener('push'" in sw82 and "addEventListener('notificationclick'" in sw82 and "silent: true" in sw82
              and "tag: SEINTJE_TAG" in sw82 and "setAppBadge()" in sw82 and "clearAppBadge" in push82 and "#messages/talent-tent" in sw82 and "addEventListener('fetch'" not in sw82 and "caches." not in sw82, "")
        check("TT-452: de app bewaart een toestel alleen via de functies, en bevat alleen de publieke sleutel",
              "tt_push_abonneren" in push82 and "tt_push_uitzetten" in push82 and "from('push_abonnementen')" not in push82
              and "VAPID_PRIVATE" not in push82 and "TT_VAPID_PUBLIEK" in push82, "")
        check("TT-452: push.js staat na messages.js met een ?v=, en de vraag wordt alleen in het gesprek van Talent Tent gesteld (nooit bij opstarten)",
              html82.index('push.js?v=') > html82.index('messages.js?v=')
              and msg82.count("ttSeintjeVraagTonen()") == 1 and "ttSeintjeVraagTonen" not in core82 and "ttSeintjeAanzetten" not in core82, "")
        check("TT-452: geen paginafouten in blok 82", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ────────────────────────────────────────────────────────────
        # Blok 83 — 09-10-2026 (bevinding Ronald): de ruimte tussen de kop en
        # het eerste blok is op de vier hoofdschermen gelijk (--kop-ruimte,
        # 20px), en de ondertitel van Mijn bands staat in de kolom van de
        # titel, links van de knop. Berichten en Bands stonden 0px onder de
        # kop; Mijn Profiel zonder bannerbalk ook.
        # ────────────────────────────────────────────────────────────
        print("\nBlok 83 — gelijke ruimte onder de kop, kop van Mijn bands")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 390, "height": 844})
        d83 = page.evaluate(r"""async () => {
          const S = window.TT_STUB, w = (n = 500) => new Promise(r => setTimeout(r, n)), u = {};
          const keep = { currentUser, myMusicianId, hasOwnProfile, musicians: S.data.musicians };
          currentUser = { id: 'u1', email: 'test@talenttent.org' }; myMusicianId = 'm1'; hasOwnProfile = true;
          S.data.musicians = [{ id: 'm1', user_id: 'u1', fname: 'Ik', username: 'ik', city: 'Den Haag', bio: 'Test',
            musician_instruments: [], musician_genres: [], musician_songs: [], musician_media: [] }];
          const kop = () => document.querySelector('header').getBoundingClientRect().bottom;
          const top = sel => { const e = document.querySelector(sel); return e ? Math.round((e.getBoundingClientRect().top - kop()) * 10) / 10 : null; };
          showView('search'); await w(); u.zoeken = top('#view-search .search-mode-tab');
          showView('messages'); await w(); u.berichten = top('#messagesInboxPanel .filter-title');
          showView('bands'); await w(); u.bands = top('#mijnBandsKop .btn');
          const sub = document.querySelector('.mijn-bands-sub').getBoundingClientRect(), knop = document.querySelector('#mijnBandsKop .btn').getBoundingClientRect(),
                titel = document.querySelector('#mijnBandsKop .filter-title').getBoundingClientRect();
          u.sub = { rechtsVoorKnop: sub.right <= knop.left, onderTitel: sub.top >= titel.bottom, links: Math.round(sub.left), knopLinks: Math.round(knop.left),
                    middenTitel: Math.round((titel.top + titel.bottom) / 2), middenKnop: Math.round((knop.top + knop.bottom) / 2) };
          showView('myprofile'); await w(800); u.profiel = top('#myProfileContent .profile-avatar-initials');
          currentUser = keep.currentUser; myMusicianId = keep.myMusicianId; hasOwnProfile = keep.hasOwnProfile; S.data.musicians = keep.musicians;
          return u;
        }""")
        check("de eerste knop of titel staat op Zoeken, Berichten, Bands en Mijn Profiel (zonder bannerbalk) 20px onder de kop",
              d83["zoeken"] == d83["berichten"] == d83["bands"] == d83["profiel"] == 20, json.dumps(d83))
        check("Mijn bands: de ondertitel staat onder de titel en stopt vóór de knop; titel en knop op één middellijn",
              d83["sub"]["rechtsVoorKnop"] and d83["sub"]["onderTitel"] and d83["sub"]["links"] == 16
              and abs(d83["sub"]["middenTitel"] - d83["sub"]["middenKnop"]) <= 1, json.dumps(d83["sub"]))
        css83 = open(os.path.join(ROOT, "styles.css"), encoding="utf-8").read()
        check("--kop-ruimte staat in :root en de drie regels (Zoeken, Berichten en Bands, Mijn Profiel) gebruiken hem",
              "--kop-ruimte: 20px" in css83 and css83.count("var(--kop-ruimte)") == 3, "")
        check("geen paginafouten in blok 83", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ────────────────────────────────────────────────────────────
        # Blok 84 — 09-10-2026 (TT-420, besluiten Ronald): de gebruiker kiest
        # welke naam anderen zien, Echte naam of Gebruikersnaam. De database
        # zet dat om in de kolom weergavenaam; de app leest alleen die kolom.
        # Voor ingelogd en uitgelogd gelijk. Onder de 16 geen keuze.
        # ────────────────────────────────────────────────────────────
        print("\nBlok 84 — naamkeuze (TT-420)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 390, "height": 844})
        d84 = page.evaluate(r"""async () => {
          const S = window.TT_STUB, w = (n = 300) => new Promise(r => setTimeout(r, n)), u = {};
          const keep = { currentUser, myMusicianId, hasOwnProfile, musicians: S.data.musicians };
          currentUser = { id: 'u1', email: 'test@talenttent.org' }; myMusicianId = 'm1'; hasOwnProfile = true;

          // 1. displayNameOf leest alleen weergavenaam; fname en lname tellen niet mee.
          u.naam = {
            gekozen: displayNameOf({ weergavenaam: 'Henk de Jong', username: 'Drummer123', fname: 'Henk', lname: 'de Jong' }),
            gebruikersnaam: displayNameOf({ weergavenaam: 'Drummer123', username: 'Drummer123', fname: 'Henk' }),
            zonderVeld: displayNameOf({ username: 'Drummer123', fname: 'Henk' }),
            leeg: displayNameOf({ weergavenaam: null, username: null }),
            niets: displayNameOf(null)
          };

          // 2. het voorbeeld onder de keuze
          u.zoalsAnderen = [
            naamZoalsAnderen('Henk', 'de Jong', 'Drummer123', 'echt', 30),
            naamZoalsAnderen('Henk', '', 'Drummer123', 'echt', 30),
            naamZoalsAnderen('Henk', 'de Jong', 'Drummer123', 'gebruikersnaam', 30),
            naamZoalsAnderen('Henk', 'de Jong', 'Drummer123', 'echt', 15),
            naamZoalsAnderen('', 'de Jong', 'Drummer123', 'echt', 30)
          ];

          // 3. zoeken vindt de naam die je ziet, en alleen die
          const term = t => naamZoekTerm(t);
          const henk = { weergavenaam: 'Henk de Jong', username: 'Drummer123' };
          const drum = { weergavenaam: 'Drummer123', username: 'Drummer123' };
          u.zoek = {
            echtOpNaam: naamMatcht(term('henk de jong'), displayNameOf(henk)),
            echtOpDeel: naamMatcht(term('de jong'), displayNameOf(henk)),
            echtNietOpGebruikersnaam: naamMatcht(term('drummer'), displayNameOf(henk)),
            gebrNietOpEchteNaam: naamMatcht(term('henk'), displayNameOf(drum)),
            gebrOpGebruikersnaam: naamMatcht(term('drummer'), displayNameOf(drum))
          };

          // 4. bezoekers: de naam komt uit tt_weergavenamen, in één vraag
          S.data.musicians = [{ id: 'm1', user_id: 'u1', username: 'ronnie', weergavenaam: 'Ronald Wever', city: 'Den Haag' },
                              { id: 'm2', user_id: 'u2', username: 'dylan', weergavenaam: 'dylan', city: 'Delft' }];
          const rijen = [{ id: 'm1', username: 'ronnie' }, { id: 'm2', username: 'dylan' }];
          const rpcKeep = S.rpcResults.tt_weergavenamen; S.rpcResults.tt_weergavenamen = p => S.weergavenamen(p);
          S.calls = [];
          await weergavenamenToevoegen(rijen);
          u.bezoeker = { namen: rijen.map(displayNameOf), rpc: S.calls.filter(c => c.kind === 'rpc' && c.name === 'tt_weergavenamen').map(c => c.params) };
          S.rpcErrors.tt_weergavenamen = { code: 'XX000', message: 'stuk' };
          const stuk = [{ id: 'm1', username: 'ronnie' }];
          await weergavenamenToevoegen(stuk);
          u.bezoekerStuk = displayNameOf(stuk[0]);
          delete S.rpcErrors.tt_weergavenamen;
          if (rpcKeep === undefined) delete S.rpcResults.tt_weergavenamen; else S.rpcResults.tt_weergavenamen = rpcKeep;

          // 5. de tegel Wie ben je: 25 jaar, echte naam
          S.data.musicians = [{ id: 'm1', user_id: 'u1', fname: 'Ronald', lname: 'Wever', username: 'ronnie', zip: '2497', city: 'Den Haag',
                                city_source: 'pdok', bio: '', naam_tonen: 'echt', weergavenaam: 'Ronald Wever' }];
          S.rpcResults.tt_get_my_birth_date = '2001-01-01';
          showView('profieltegels'); await w();
          await openWieBenJe(); await w();
          const blok = document.getElementById('wbjNaamKeuze');
          const knoppen = () => Array.from(document.querySelectorAll('#wbjNaamTonenControl .segmented-btn')).map(b => [b.textContent.trim(), b.classList.contains('selected')]);
          u.tegel25 = { zichtbaar: blok.style.display !== 'none', knoppen: knoppen(), voorbeeld: document.getElementById('wbjNaamVoorbeeld').textContent };
          zetWbjNaamTonen('gebruikersnaam');
          u.tegelGebr = { knoppen: knoppen(), voorbeeld: document.getElementById('wbjNaamVoorbeeld').textContent };
          document.getElementById('wbjLname').value = 'Wever-Proef'; document.getElementById('wbjLname').dispatchEvent(new Event('input', { bubbles: true }));
          zetWbjNaamTonen('echt');
          u.tegelAchternaam = document.getElementById('wbjNaamVoorbeeld').textContent;
          // opslaan stuurt de keuze mee
          zetWbjNaamTonen('gebruikersnaam');
          document.getElementById('wbjPostcodeStatus').textContent = '';
          await saveWieBenJe(); await w();
          u.opgeslagen = S.data.musicians[0].naam_tonen;

          // 6. onder de 16: geen keuze
          S.rpcResults.tt_get_my_birth_date = new Date(new Date().getFullYear() - 14, 5, 15).toISOString().slice(0, 10);
          S.data.musicians[0].naam_tonen = 'gebruikersnaam';
          await openWieBenJe(); await w();
          u.tegel14 = { zichtbaar: document.getElementById('wbjNaamKeuze').style.display !== 'none' };

          currentUser = keep.currentUser; myMusicianId = keep.myMusicianId; hasOwnProfile = keep.hasOwnProfile; S.data.musicians = keep.musicians;
          S.rpcResults.tt_get_my_birth_date = null;
          return u;
        }""")
        j84 = json.dumps(d84, ensure_ascii=False)
        check("TT-420: de naam die anderen zien is weergavenaam; fname en lname tellen niet mee, zonder veld de gebruikersnaam",
              d84["naam"] == {"gekozen": "Henk de Jong", "gebruikersnaam": "Drummer123", "zonderVeld": "Drummer123", "leeg": "Muzikant", "niets": "Muzikant"}, j84)
        check("TT-420: het voorbeeld: vanaf 16 voor- en achternaam (achternaam optioneel), anders de gebruikersnaam; onder de 16 altijd de gebruikersnaam",
              d84["zoalsAnderen"] == ["Henk de Jong", "Henk", "Drummer123", "Drummer123", "Drummer123"], j84)
        check("TT-420: zoeken vindt alleen de naam die je ziet (echte naam op naam, gebruikersnaam op gebruikersnaam, niet kruislings)",
              d84["zoek"] == {"echtOpNaam": True, "echtOpDeel": True, "echtNietOpGebruikersnaam": False,
                              "gebrNietOpEchteNaam": False, "gebrOpGebruikersnaam": True}, j84)
        check("TT-420: voor een bezoeker komt de gekozen naam in één vraag uit tt_weergavenamen",
              d84["bezoeker"] == {"namen": ["Ronald Wever", "dylan"], "rpc": [{"ids": ["m1", "m2"]}]}, j84)
        check("TT-420: mislukt tt_weergavenamen, dan toont de lijst de gebruikersnaam en geen fout",
              d84["bezoekerStuk"] == "ronnie", j84)
        check("TT-420: de tegel Wie ben je: vanaf 16 twee keuzes met Echte naam gekozen en het voorbeeld eronder",
              d84["tegel25"] == {"zichtbaar": True, "knoppen": [["Echte naam", True], ["Gebruikersnaam", False]],
                                 "voorbeeld": "Zo zien anderen je: Ronald Wever"}, j84)
        check("TT-420: kiezen voor Gebruikersnaam wisselt de knop en het voorbeeld; de achternaam komt in het voorbeeld mee",
              d84["tegelGebr"] == {"knoppen": [["Echte naam", False], ["Gebruikersnaam", True]], "voorbeeld": "Zo zien anderen je: ronnie"}
              and d84["tegelAchternaam"] == "Zo zien anderen je: Ronald Wever-Proef", j84)
        check("TT-420: opslaan bewaart de keuze (naam_tonen)", d84["opgeslagen"] == "gebruikersnaam", j84)
        check("TT-420: onder de 16 staat er geen keuze", d84["tegel14"] == {"zichtbaar": False}, j84)
        js84 = {f: open(os.path.join(ROOT, f), encoding="utf-8").read() for f in
                ["search.js", "bands.js", "messages.js", "musicians.js", "veiligheid.js", "wizard.js"]}
        import re as re84
        lezen84 = {f: re84.findall(r"select\(\s*[`'\"][^`'\"]*\bfname\b", t) for f, t in js84.items()}
        check("TT-420: geen enkele leesvraag van de app haalt fname of lname op voor andermans naam (alleen de eigen tegel Wie ben je leest ze)",
              all(not v for f, v in lezen84.items() if f != "musicians.js") and len(lezen84["musicians.js"]) == 1,
              json.dumps({f: len(v) for f, v in lezen84.items()}))
        check("TT-420: het naamveld van Zoeken en Maak setlist toetst de weergavenaam, en Lid uitnodigen zoekt in weergavenaam",
              "naamMatcht(nameTerm, displayNameOf(m))" in js84["search.js"] and "naamMatcht(term, displayNameOf(m))" in js84["search.js"]
              and "ilike('weergavenaam'" in js84["bands.js"] and "fname.ilike" not in js84["bands.js"], "")
        html84 = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        check("TT-420: de keuze heeft twee knoppen in de vaste vorm van een keuzeknop (.segmented-btn), gelabeld Echte naam en Gebruikersnaam",
              html84.count("zetWbjNaamTonen(") == 2 and 'id="wbjNaamTonenControl"' in html84, "")
        check("TT-420: in de tegel Wie ben je staan de naam, de geboortedatum, de gebruikersnaam en dan de naamkeuze (de keuze hangt van de leeftijd af)",
              html84.index('id="wbjLname"') < html84.index('id="wbjBirthDate"') < html84.index('id="wbjUsername"') < html84.index('id="wbjNaamKeuze"'), "")
        check("TT-420: het profiel toont één naam, geen tweede regel \"Gebruikersnaam: …\" onder de echte naam",
              "Gebruikersnaam: <strong" not in js84["musicians.js"], "")
        check("TT-420: de privacyverklaring zegt niet meer dat de voor- of achternaam nooit getoond wordt",
              "Je voornaam is alleen zichtbaar" not in html84 and "Je postcode en achternaam worden nooit" not in html84, "")
        check("geen paginafouten in blok 84", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ────────────────────────────────────────────────────────────
        # Blok 85 — TT-457 (10-10-2026, besluit Ronald): beschikbaarheid. Een
        # muzikant of band die niet beschikbaar is, toont één zin onder de
        # badges (de gewone .melding). Standaard staat er niets. De tegel
        # Band-uitnodigingen is de tegel Beschikbaarheid geworden; "We spelen
        # even niet" is Niet beschikbaar geworden en haalt de band niet meer
        # uit Zoeken.
        # ────────────────────────────────────────────────────────────
        print("\nBlok 85 — beschikbaarheid (TT-457)")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 375, "height": 812})
        d85 = page.evaluate(r"""async () => {
          const S = window.TT_STUB, w = (n = 400) => new Promise(r => setTimeout(r, n)), u = {};
          const keep = { currentUser, myMusicianId, hasOwnProfile, musicians: S.data.musicians, bands: S.data.bands, rpcBands: S.rpcResults.tt_get_bands_public };
          currentUser = { id: 'u1', email: 'test@talenttent.org' }; myMusicianId = 'm1'; hasOwnProfile = true;
          const basis = { city: 'Den Haag', bio: 'Test', musician_instruments: [], musician_genres: [], musician_songs: [], musician_media: [] };
          S.data.musicians = [
            { ...basis, id: 'm1', user_id: 'u1', fname: 'Ik', username: 'ik', accepts_band_invites: false },
            { ...basis, id: 'm2', user_id: 'u2', fname: 'Ander', username: 'ander', accepts_band_invites: true },
            { ...basis, id: 'm3', user_id: 'u3', fname: 'Derde', username: 'derde', accepts_band_invites: false }];
          // Eerdere blokken kunnen rpcResults vervangen hebben: zet de vragen zelf neer.
          S.rpcResults.tt_profiel_beschikbaar = (p) => { const r = (S.data.musicians || []).find(x => x.id === p.mid); return r ? r.accepts_band_invites !== false : null; };
          S.rpcResults.tt_profiel_delen = (p) => { const r = (S.data.musicians || []).find(x => x.id === p.mid); return r ? r.delen_aan !== false : null; };
          S.rpcResults.tt_musician_band_ids = () => [];
          const melding = root => root.querySelector('.melding-beschikbaar');
          const maten = el => { if (!el) return null;
            const r = el.getBoundingClientRect(), p = el.querySelector('.melding-tekst'), pr = p.getBoundingClientRect(), cs = getComputedStyle(p);
            const vorige = el.previousElementSibling.getBoundingClientRect(), volgende = el.nextElementSibling.getBoundingClientRect();
            return { tekst: p.textContent, vet: p.querySelector('strong').textContent, regels: Math.round(pr.height / parseFloat(cs.lineHeight)),
                     letter: cs.fontSize, boven: Math.round(r.top - vorige.bottom), onder: Math.round(volgende.top - r.bottom),
                     voor: el.previousElementSibling.className, na: el.nextElementSibling.className, breedte: Math.round(r.width),
                     kop: !!el.querySelector('.melding-kop'), knop: !!el.querySelector('button, a'), rand: getComputedStyle(el).borderLeftWidth }; };
          // 1. Mijn Profiel, niet beschikbaar: de zin, onder de badges en boven de bio.
          showView('myprofile'); await w(900);
          u.eigen = maten(melding(document.getElementById('myProfileContent')));
          // 2. Mijn Profiel, beschikbaar: geen zin.
          S.data.musicians[0].accepts_band_invites = true;
          showView('search'); await w(100); showView('myprofile'); await w(900);
          u.eigenBeschikbaar = !melding(document.getElementById('myProfileContent'));
          S.data.musicians[0].accepts_band_invites = false;
          // 3. Het profiel van een ander, met en zonder de zin.
          const vak = document.getElementById('profielSchermContent');
          await openProfielScherm('m3'); await w(700); u.ander = maten(melding(vak));
          await openProfielScherm('m2'); await w(700); u.anderBeschikbaar = !melding(vak);
          // 4. Zonder eigen profiel (een bezoeker): de zin staat er ook.
          hasOwnProfile = false; S.rpcResults.tt_get_musicians_public = (p) => (p.ids || []).map(id => { const m = S.data.musicians.find(x => x.id === id);
            return { id, username: m.username, age: 30, city: m.city, bio: m.bio, avatar_url: null, instrument_levels: [], genres: [], songs: [], media: [] }; });
          await openProfielScherm('m3'); await w(700); u.bezoeker = !!melding(vak);
          hasOwnProfile = true;
          // 5. Een band die niet beschikbaar is (publieke vraag): de zin van de band, de band blijft staan.
          hasOwnProfile = false;
          const bandRij = pauze => ({ id: 'b9', name: 'Nachtploeg', city: 'Den Haag', genres: ['Indie'], status: 'compleet', avatar_url: null, pauze,
            afgeschermd: false, members: [{ id: 'm1', role: 'Oprichter', instruments: ['Gitaar'] }], wanted: [], invallers: [], media: [], nummers: [], covers: [], description: 'Vier vrienden.' });
          S.rpcResults.tt_get_bands_public = (p) => (p.ids || []).map(() => bandRij(true));
          await openBandScherm('b9'); await w(700); u.band = maten(melding(vak));
          S.rpcResults.tt_get_bands_public = (p) => (p.ids || []).map(() => bandRij(false));
          await openBandScherm('b9'); await w(700); u.bandBeschikbaar = !melding(vak);
          hasOwnProfile = true;
          // 6. Instellingen: de tegel heet Beschikbaarheid en werkt meteen.
          showView('instellingen'); await w(600);
          u.tegel = { titel: (document.querySelector('#beschikbaarTegel .tile-title') || {}).textContent, sub: (document.querySelector('#beschikbaarTegel .wheel-field-label') || {}).textContent,
                      oud: !!document.getElementById('uitnodigTegel'), opties: [...document.querySelectorAll('#beschikbaarKeuze option')].map(o => o.textContent) };
          await zetBeschikbaarheid(true); await w(200);
          u.naAan = [S.data.musicians[0].accepts_band_invites, document.getElementById('beschikbaarKeuze').value];
          await zetBeschikbaarheid(false); await w(200);
          u.naUit = [S.data.musicians[0].accepts_band_invites, document.getElementById('beschikbaarKeuze').value];
          currentUser = keep.currentUser; myMusicianId = keep.myMusicianId; hasOwnProfile = keep.hasOwnProfile; S.data.musicians = keep.musicians; S.data.bands = keep.bands;
          S.rpcResults.tt_get_bands_public = keep.rpcBands;
          showView('about');
          return u;
        }""")
        j85 = lambda k: json.dumps(d85.get(k), ensure_ascii=False)
        check("muzikant, Mijn Profiel: de zin staat onder de badges en boven de bio, als .melding zonder kop, knop of kruisje",
              d85["eigen"] and d85["eigen"]["tekst"] == "Momenteel niet beschikbaar." and d85["eigen"]["vet"] == "niet beschikbaar"
              and d85["eigen"]["voor"] == "profile-badges" and d85["eigen"]["na"] == "profile-bio" and not d85["eigen"]["kop"] and not d85["eigen"]["knop"], j85("eigen"))
        check("UI: de zin is 14px, de lijn links 4px, en staat 20px onder de badges en 20px boven de bio",
              d85["eigen"]["letter"] == "14px" and d85["eigen"]["rand"] == "4px" and d85["eigen"]["boven"] == 20 and d85["eigen"]["onder"] == 20, j85("eigen"))
        check("beschikbaar (de standaard): er staat geen zin op Mijn Profiel", d85["eigenBeschikbaar"] is True, j85("eigenBeschikbaar"))
        check("het profiel van een ander: de zin alleen als die muzikant niet beschikbaar is, via tt_profiel_beschikbaar",
              d85["ander"] and d85["ander"]["tekst"] == "Momenteel niet beschikbaar." and d85["anderBeschikbaar"] is True, json.dumps([d85["ander"], d85["anderBeschikbaar"]], ensure_ascii=False))
        check("een bezoeker zonder account ziet dezelfde zin", d85["bezoeker"] is True, j85("bezoeker"))
        check("band: de zin van de band staat onder de badges; een beschikbare band heeft geen zin",
              d85["band"] and d85["band"]["tekst"] == "Momenteel niet beschikbaar." and d85["band"]["vet"] == "niet beschikbaar"
              and d85["band"]["voor"] == "profile-badges" and d85["bandBeschikbaar"] is True, json.dumps([d85["band"], d85["bandBeschikbaar"]], ensure_ascii=False))
        check("de zin past op één regel op 375px (breedte en aantal regels gemeten)",
              d85["eigen"]["regels"] == 1 and d85["band"]["regels"] == 1, json.dumps([d85["eigen"]["regels"], d85["band"]["regels"], d85["eigen"]["breedte"]]))
        check("Instellingen: de tegel heet Beschikbaarheid, Band-uitnodigingen is weg, de keuze werkt meteen",
              d85["tegel"]["titel"] == "Beschikbaarheid" and d85["tegel"]["oud"] is False
              and d85["tegel"]["opties"] == ["Beschikbaar", "Niet beschikbaar: staat op je profiel"]
              and d85["naAan"] == [True, "ja"] and d85["naUit"] == [False, "nee"], j85("tegel") + j85("naAan") + j85("naUit"))
        js85 = {f: open(os.path.join(ROOT, f), encoding="utf-8").read() for f in ["bands.js", "search.js", "wizard.js", "musicians.js", "utils.js"]}
        html85 = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        check("TT-457: één functie voor de zin (utils.js), gebruikt door het muzikantprofiel en de bandpagina",
              "function nietBeschikbaarMeldingHTML(" in js85["utils.js"] and "nietBeschikbaarMeldingHTML()" in js85["musicians.js"]
              and "nietBeschikbaarMeldingHTML()" in js85["bands.js"], "")
        check("TT-457: Zoeken laat een niet-beschikbare band staan, en bandStatusAfgeleid() en bandStatusLabel() kennen geen pauze meer",
              "b.pauze" not in js85["search.js"] and "'inactief'" not in js85["search.js"] and "function bandStatusAfgeleid(aantalOpenRollen)" in js85["bands.js"]
              and "function bandStatusLabel(aantalLeden, aantalOpenRollen)" in js85["bands.js"], "")
        check("TT-457: de oude namen zijn weg (zetBandUitnodigingen, zetBandPauze, uitnodigKeuze, We spelen even niet)",
              not any(t in js85[f] for f in js85 for t in ["zetBandUitnodigingen", "zetBandPauze", "myAcceptsBandInvites"])
              and "uitnodigKeuze" not in html85 and not any("We spelen even niet" in js85[f] for f in js85), "")
        check("TT-457: Lid uitnodigen noemt een niet-beschikbare muzikant Niet beschikbaar", ">Niet beschikbaar</span>" in js85["bands.js"], "")
        check("geen paginafouten in blok 85", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

        # ────────────────────────────────────────────────────────────
        # Blok 86 — 10-10-2026 (gemeld door Ronald, vóór livegang): "Wachtwoord
        # vergeten" gaf geen reactie tot het antwoord van Supabase binnen was.
        # De gebruiker tikte meerdere keren; elke tik stuurt een mail en alleen
        # de nieuwste link werkt (otp_expired). Nu: direct "Versturen...",
        # knop dicht tijdens en na het versturen, het e-mailadres in de
        # bevestiging; en een verlopen link krijgt een eigen melding.
        # ────────────────────────────────────────────────────────────
        print("\nBlok 86 — wachtwoord vergeten geeft direct antwoord")
        page_errors.clear()
        page.evaluate("window.TT_STUB.reset()")
        page.set_viewport_size({"width": 375, "height": 812})
        d86 = page.evaluate(r"""async () => {
          const w = (n) => new Promise(r => setTimeout(r, n)), u = {};
          showView('auth'); await w(100);
          const knop = document.getElementById('forgotPasswordBtn');
          const suc = document.getElementById('authSuccess');
          const verlopen = document.getElementById('authLinkVerlopen');
          if (verlopen) verlopen.hidden = false;
          let aantal = 0;
          const oud = db.auth.resetPasswordForEmail;
          db.auth.resetPasswordForEmail = () => { aantal++; return new Promise(r => setTimeout(() => r({ data: {}, error: null }), 500)); };
          document.getElementById('loginEmail').value = 'test@talenttent.org';
          forgotPassword(); await w(50);
          u.tijdens = { uit: knop.disabled, tekst: knop.textContent, succes: suc.classList.contains('visible'), verlopenWeg: verlopen ? verlopen.hidden : null };
          forgotPassword(); forgotPassword(); await w(50);
          await w(700);
          u.na = { uit: knop.disabled, tekst: knop.textContent, succes: suc.classList.contains('visible'), melding: suc.textContent, aantal };
          // Een fout: de knop komt terug en er staat geen succesmelding.
          knop.disabled = false; knop.textContent = 'Wachtwoord vergeten?';
          db.auth.resetPasswordForEmail = () => Promise.resolve({ data: {}, error: { message: 'x', status: 429 } });
          forgotPassword(); await w(200);
          u.fout = { uit: knop.disabled, tekst: knop.textContent, succes: suc.classList.contains('visible') };
          db.auth.resetPasswordForEmail = oud;
          return u;
        }""")
        j86 = lambda k: json.dumps(d86[k], ensure_ascii=False)
        check("direct na de tik: knop dicht, tekst Versturen..., melding van een verlopen link weg", d86["tijdens"]["uit"] is True and d86["tijdens"]["tekst"] == "Versturen..." and d86["tijdens"]["succes"] is False and d86["tijdens"]["verlopenWeg"] is True, j86("tijdens"))
        check("drie tikken, één mail", d86["na"]["aantal"] == 1, j86("na"))
        check("na het versturen: bevestiging met het e-mailadres, knop blijft dicht",
              d86["na"]["succes"] is True and "test@talenttent.org" in d86["na"]["melding"] and d86["na"]["uit"] is True and d86["na"]["tekst"] == "Herstelmail verstuurd", j86("na"))
        check("bij een fout: knop weer open, geen succesmelding", d86["fout"]["uit"] is False and d86["fout"]["tekst"] == "Wachtwoord vergeten?" and d86["fout"]["succes"] is False, j86("fout"))
        core86 = open(os.path.join(ROOT, "core.js"), encoding="utf-8").read()
        html86 = open(os.path.join(ROOT, "index.html"), encoding="utf-8").read()
        check("een verlopen herstellink (otp_expired) toont een eigen melding op het inlogscherm en wist de foutcode uit de adresregel",
              "error_code=otp_expired" in core86 and "herstelLinkVerlopen" in core86 and "authLinkVerlopen" in core86 and 'id="authLinkVerlopen"' in html86 and "history.replaceState(history.state, ''" in core86, "")
        check("geen paginafouten in blok 86", not page_errors, "; ".join(page_errors)[:300])
        page_errors.clear()

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
