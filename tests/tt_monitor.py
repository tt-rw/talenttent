#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TT MONITOR — vaste onderhoudscontrole van The Talent Tent.

Doel: elke sessie in een paar seconden vaststellen of de repo nog klopt met
de afspraken in de projectinstructies, zonder dat iemand iets hoeft na te
lopen. Dit is de tegenhanger van `tests/tt_tests.py`: die toetst gedrag tegen
de stub, dit toetst de repo zelf.

Draaien vanuit de hoofdmap van de repo:   python3 tests/tt_monitor.py
Afsluitcode 0 = geen enkel punt. Afsluitcode 1 = er staat iets open.

Vaste regel: elke controle die hier staat, meet iets dat een mens anders moet
onthouden. Een controle die valse meldingen geeft, hoort hier niet - die kost
meer vertrouwen dan hij oplevert. Zakt een controle, dan is dat een vraag:
of de code klopt niet, of de regel klopt niet (projectinstructies §2, regel 11).
"""

import os
import re
import sys
import hashlib
import subprocess
import unicodedata

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# ---------------------------------------------------------------- vaste feiten
# Deze lijsten komen uit de projectinstructies. Wijzigt de app, dan wijzigt
# dit mee - en dan is dat een bewuste handeling, geen sluipend verschil.

BINDENDE_SCRIPTVOLGORDE = [
    "core.js", "utils.js", "veiligheid.js", "auth.js", "postcode.js",
    "wizard.js", "search.js", "musicians.js", "bands.js", "messages.js",
    "modals-shared.js",
]

VERWACHTE_VIEWS = [
    "landing", "auth", "register", "profieltegels", "search", "myprofile",
    "bands", "messages", "about", "privacy", "terms", "gedragscode",
    "instellingen", "reset",
]

# Bewust in de repo, bewust niet geladen door index.html (projectinstructies §7).
DODE_BESTANDEN = {"profiel-v2.html", "profiel-gedeeld.js"}

# Documenten die in het claude.ai-project horen, niet in de repo (§8).
PROJECTDOCUMENTEN = [
    "huisstijl-en-consistentie", "app-first-toetslijst",
    "testprotocol-regressiepreventie", "zoekfunctienaslagwerk",
]

# Typografische tekens die de huisstijl uitdrukkelijk toestaat (§11).
TOEGESTANE_TEKENS = set("✕→★✓⋯←↑↓·—–…‹›«»×÷±°•§¶‘’“”€≥≤≠″′")

punten = []   # (code, tekst)
regels = []   # (blok, naam, goed)


def lees(naam):
    pad = os.path.join(REPO, naam)
    if not os.path.exists(pad):
        return ""
    with open(pad, encoding="utf-8", errors="replace") as f:
        return f.read()


def zonder_commentaar(tekst, css=False):
    """Haalt commentaar weg. Een regel die alleen in een toelichting staat,
    is geen regel in de code - anders meldt de monitor zijn eigen geschiedenis."""
    tekst = re.sub(r"/\*.*?\*/", " ", tekst, flags=re.S)
    if not css:
        tekst = re.sub(r"(?m)^\s*//[^\n]*", " ", tekst)
        tekst = re.sub(r"<!--.*?-->", " ", tekst, flags=re.S)
    return tekst


def toets(blok, naam, goed, code=None, uitleg=None):
    regels.append((blok, naam, goed))
    if not goed and uitleg:
        punten.append((code or blok, uitleg))
    return goed


def kort(lijst, maximaal=8):
    lijst = sorted(lijst)
    if len(lijst) <= maximaal:
        return ", ".join(lijst)
    return ", ".join(lijst[:maximaal]) + " ... (%d totaal)" % len(lijst)


# ============================================================ A - repo-integriteit

def blok_a():
    html = lees("index.html")

    # A1 - de scriptvolgorde is bindend (§7)
    gevonden = re.findall(r'<script src="([a-z-]+\.js)\?v=', html)
    toets("A", "scriptvolgorde gelijk aan de bindende volgorde",
          gevonden == BINDENDE_SCRIPTVOLGORDE, "A1",
          "scriptvolgorde wijkt af. Gevonden: %s" % " · ".join(gevonden))

    # A2 - elk eigen script draagt een cachebuster
    zonder = re.findall(r'<script src="((?!https?:)[^"?]+\.js)"', html)
    toets("A", "elk eigen script draagt een ?v=-achtervoegsel",
          not zonder, "A2", "script zonder ?v=: %s" % ", ".join(zonder))

    # A3 - elk JS-bestand is syntactisch geldig
    if subprocess.call(["which", "node"], stdout=subprocess.DEVNULL,
                       stderr=subprocess.DEVNULL) == 0:
        stuk = []
        for js in BINDENDE_SCRIPTVOLGORDE:
            pad = os.path.join(REPO, js)
            if not os.path.exists(pad):
                stuk.append("%s ontbreekt" % js)
                continue
            if subprocess.call(["node", "--check", pad],
                               stdout=subprocess.DEVNULL,
                               stderr=subprocess.DEVNULL) != 0:
                stuk.append(js)
        toets("A", "elk JS-bestand doorstaat node --check",
              not stuk, "A3", "syntaxfout in: %s" % ", ".join(stuk))
    else:
        toets("A", "elk JS-bestand doorstaat node --check (node ontbreekt)", True)

    # A4 - alle veertien views staan er, geen onbekende (§9)
    aanwezig = set(re.findall(r'id="view-([a-z]+)"', html))
    mist = [v for v in VERWACHTE_VIEWS if v not in aanwezig]
    extra = sorted(aanwezig - set(VERWACHTE_VIEWS))
    toets("A", "alle veertien views aanwezig, geen onbekende",
          not mist and not extra, "A4",
          "views missen: %s; onbekend: %s" % (mist or "-", extra or "-"))

    # A5 - geen JS-bestand dat niemand laadt
    op_schijf = {f for f in os.listdir(REPO) if f.endswith(".js")}
    wees = op_schijf - set(BINDENDE_SCRIPTVOLGORDE) - DODE_BESTANDEN
    toets("A", "geen onbekend JS-bestand in de hoofdmap",
          not wees, "A5", "wordt door niets geladen: %s" % kort(wees))

    # A6 - niets met het voorvoegsel _niet-uploaden- (§2.6a)
    fout = []
    for wortel, mappen, bestanden in os.walk(REPO):
        mappen[:] = [m for m in mappen if m != ".git"]
        fout += [b for b in bestanden if b.startswith("_niet-uploaden")]
    toets("A", "geen _niet-uploaden-bestand in de repo",
          not fout, "A6", "hoort niet in de repo: %s" % kort(fout))

    # A7 - geen projectdocument in de repo. Alles hier is publiek (§8).
    dubbel = [b for b in os.listdir(REPO)
              if any(b.lower().startswith(d) for d in PROJECTDOCUMENTEN)]
    toets("A", "geen projectdocument in de repo",
          not dubbel, "A7",
          "hoort in het claude.ai-project, niet in de publieke repo: %s"
          % kort(dubbel))

    # A8 - geen geheim in de repo. De anon-sleutel hoort er wel: die is publiek.
    verdacht = []
    patronen = [
        (r"-----BEGIN [A-Z ]*PRIVATE KEY", "private key"),
        (r"\bsk-[A-Za-z0-9]{20,}", "api-sleutel"),
        (r"[\"'][Ss]ervice[_-]?[Rr]ole[\"']\s*:", "service_role-toewijzing"),
        (r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*service_role", "service-key"),
    ]
    for b in sorted(os.listdir(REPO)):
        if not b.endswith((".js", ".html", ".json", ".txt", ".sql")):
            continue
        inhoud = lees(b)
        for patroon, wat in patronen:
            if re.search(patroon, inhoud):
                verdacht.append("%s in %s" % (wat, b))
    toets("A", "geen geheime sleutel in de repo",
          not verdacht, "A8", kort(verdacht))


# ============================================================ B - huisstijl

def blok_b():
    css_ruw = lees("styles.css")
    css = zonder_commentaar(css_ruw, css=True)
    html = zonder_commentaar(lees("index.html"))
    alle_js = "\n".join(zonder_commentaar(lees(js))
                        for js in BINDENDE_SCRIPTVOLGORDE)

    # B1 - alleen --fs-sm bestaat als lettermaat (TT-260)
    fs = sorted(set(re.findall(r"--fs-[a-z]+", css)))
    toets("B", "alleen --fs-sm als lettermaatvariabele",
          fs == ["--fs-sm"], "B1",
          "lettermaatvariabelen in de code: %s" % ", ".join(fs))

    # B2 - elke gebruikte CSS-variabele bestaat. TT-262, punt (a).
    gedefinieerd = set(re.findall(r"(--[a-z0-9-]+)\s*:", css))
    gedefinieerd |= set(re.findall(r"setProperty\(\s*['\"](--[a-z0-9-]+)",
                                   alle_js))
    gebruikt = set(re.findall(r"var\(\s*(--[a-z0-9-]+)", css + html + alle_js))
    onbekend = gebruikt - gedefinieerd
    toets("B", "elke gebruikte CSS-variabele is gedefinieerd",
          not onbekend, "B2",
          "gebruikt maar nergens gedefinieerd: %s" % kort(onbekend))

    # B3 - geen variabele die niemand gebruikt. TT-262, punt (b).
    ongebruikt = gedefinieerd - gebruikt
    toets("B", "geen ongebruikte CSS-variabele",
          not ongebruikt, "B3",
          "gedefinieerd maar nergens gebruikt: %s" % kort(ongebruikt))

    # B4 - geen losse z-index op één modal. TT-229, §2 regel 11, TT-262 (h).
    # De gezamenlijke basisregel `.modal-overlay { z-index: 200 }` hoort er wel:
    # initModalStapeling() telt vanaf dat getal op. Fout is een z-index die
    # één modal boven de andere zet.
    los = set()
    for selector, inhoud in re.findall(r"([^{}]+)\{([^}]*)\}", css):
        if "z-index" not in inhoud:
            continue
        selector = " ".join(selector.split())
        if not re.search(r"[Mm]odal", selector):
            continue
        if selector == ".modal-overlay":
            continue
        los.add(selector)
    toets("B", "geen losse z-index per modal",
          not los, "B4", "modalstapeling wordt omzeild door: %s" % kort(los))

    # B5 - geen emoji in de UI (§11)
    emoji = set()
    for tekst in [html] + [zonder_commentaar(lees(js))
                           for js in BINDENDE_SCRIPTVOLGORDE]:
        for teken in tekst:
            if ord(teken) < 0x2000 or teken in TOEGESTANE_TEKENS:
                continue
            naam = unicodedata.name(teken, "")
            if ord(teken) >= 0x1F000 or "EMOJI" in naam or "FACE" in naam:
                emoji.add(teken)
    toets("B", "geen emoji-icoon in de UI",
          not emoji, "B5", "emoji gevonden: %s" % " ".join(sorted(emoji)))


# ============================================================ C - dode code

def _voorvoegselvarianten(naam):
    """`mhSpeelMedia` wordt aangeroepen als fn('speelMedia'): de naam wordt in
    utils.js samengesteld uit een voorvoegsel. Zonder deze varianten meldt de
    monitor elke mediahoek-functie ten onrechte als dood."""
    uit = set()
    for lengte in (1, 2, 3):
        rest = naam[lengte:]
        if rest and rest[0].isupper():
            uit.add(rest[0].lower() + rest[1:])
            uit.add(rest)
    return uit


def blok_c():
    html = lees("index.html")
    alle_js_ruw = "\n".join(lees(js) for js in BINDENDE_SCRIPTVOLGORDE)
    alle_js = zonder_commentaar(alle_js_ruw)
    naam_ruimte = zonder_commentaar(html) + "\n" + alle_js

    # Alleen echte declaraties. Een named function expression - `(function
    # bewaakModals() {...})()` of een listener - heeft geen aanroep nodig.
    gedefinieerd = set()
    for m in re.finditer(r"(?m)^(function\s+|(?:const|let|var)\s+)"
                         r"([A-Za-z_$][\w$]*)", alle_js):
        if m.group(1).startswith("function"):
            gedefinieerd.add(m.group(2))
        else:
            staart = alle_js[m.end():m.end() + 40]
            if re.match(r"\s*=\s*(?:async\s*)?(?:function|\([^)]*\)\s*=>)",
                        staart):
                gedefinieerd.add(m.group(2))

    ingebouwd = {"alert", "confirm", "prompt", "open", "print", "close"}

    # C1 - elke knop in index.html roept een functie aan die bestaat
    ontbreekt = set()
    for aanroep in re.findall(r'on\w+="\s*([A-Za-z_$][\w$]*)\s*\(', html):
        if aanroep in gedefinieerd or aanroep in ingebouwd:
            continue
        if re.search(r"\b%s\b" % re.escape(aanroep), alle_js):
            continue
        ontbreekt.add(aanroep)
    toets("C", "elke knop roept een bestaande functie aan",
          not ontbreekt, "C1",
          "knop verwijst naar niets: %s" % kort(ontbreekt))

    # C2 - geen functie die nergens wordt aangeroepen (§2 regel 10)
    dood = set()
    for fn in gedefinieerd:
        if fn.startswith("_") or len(fn) < 5:
            continue
        if len(re.findall(r"\b%s\b" % re.escape(fn), naam_ruimte)) > 1:
            continue
        if any(re.search(r"['\"]%s['\"]" % re.escape(v), naam_ruimte)
               for v in _voorvoegselvarianten(fn)):
            continue
        dood.add(fn)
    toets("C", "geen functie zonder enige aanroep",
          not dood, "C2", "nergens aangeroepen: %s" % kort(dood))

    # C3 - geen achtergebleven console.log in app-code
    resten = []
    for js in BINDENDE_SCRIPTVOLGORDE:
        aantal = len(re.findall(r"\bconsole\.log\s*\(",
                                zonder_commentaar(lees(js))))
        if aantal:
            resten.append("%s (%dx)" % (js, aantal))
    toets("C", "geen achtergebleven console.log",
          not resten, "C3", "console.log staat nog in: %s" % ", ".join(resten))


# ============================================================ D - stand

def blok_d():
    lijst = lees("actielijst.md")

    # D1 - de actielijst heeft zijn drie vaste delen
    koppen = re.findall(r"(?m)^# (Deel \d[a-z]?)", lijst)
    heeft = all(any(k.startswith(d) for k in koppen)
                for d in ("Deel 1", "Deel 2", "Deel 3"))
    toets("D", "actielijst heeft Deel 1, 2 en 3",
          heeft, "D1", "koppen gevonden: %s" % ", ".join(koppen))

    # D2 - elk niveau heeft een tabel in Deel 1 (regel van 11-09-2026)
    deel1 = ""
    m = re.search(r"(?ms)^# Deel 1 .*?(?=^# Deel 2)", lijst)
    if m:
        deel1 = m.group(0)
    niveaus = [n for n in ("## P0", "## P1", "## P2", "## P3") if n in deel1]
    toets("D", "Deel 1 heeft een tabel per niveau",
          len(niveaus) == 4, "D2",
          "niveaus in Deel 1: %s" % (", ".join(niveaus) or "geen"))

    # D3 - CHECKSUMS.txt klopt voor elk bestand dat erin staat (§4.8)
    afwijkend = []
    for regel in lees("CHECKSUMS.txt").strip().split("\n"):
        deel = regel.split()
        if len(deel) < 2:
            continue
        verwacht, naam = deel[0], deel[-1]
        pad = os.path.join(REPO, naam)
        if not os.path.exists(pad):
            afwijkend.append("%s ontbreekt" % naam)
            continue
        with open(pad, "rb") as f:
            if hashlib.sha256(f.read()).hexdigest() != verwacht:
                afwijkend.append(naam)
    toets("D", "CHECKSUMS.txt klopt met de bestanden",
          not afwijkend, "D3", "checksum wijkt af: %s" % kort(afwijkend))


# ============================================================ afdruk

NAMEN = {
    "A": "repo-integriteit",
    "B": "huisstijl en consistentie",
    "C": "dode code",
    "D": "stand en oplevering",
}


def main():
    blok_a()
    blok_b()
    blok_c()
    blok_d()

    print("")
    print("TT MONITOR — vaste onderhoudscontrole")
    print("=" * 54)
    for letter in "ABCD":
        eigen = [r for r in regels if r[0] == letter]
        goed = sum(1 for r in eigen if r[2])
        vlag = "" if goed == len(eigen) else "   ← %d punt" % (len(eigen) - goed)
        print("Blok %s — %-28s %d/%d%s"
              % (letter, NAMEN[letter], goed, len(eigen), vlag))

    open_regels = [r for r in regels if not r[2]]
    if open_regels:
        print("-" * 54)
        for letter, naam, _ in open_regels:
            print("  LET OP  %s" % naam)

    if punten:
        print("")
        print("PUNTEN (%d)" % len(punten))
        for code, tekst in punten:
            print("  %-3s %s" % (code, tekst))
    else:
        print("-" * 54)
        print("  Geen punten.")

    goed = sum(1 for r in regels if r[2])
    print("")
    print("Eindstand: %d van %d goed" % (goed, len(regels)))
    return 0 if goed == len(regels) else 1


if __name__ == "__main__":
    sys.exit(main())
