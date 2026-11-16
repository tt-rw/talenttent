#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TT OMZETTEN — de uitleg voor ontwikkelaars eruit, vóór een levering (TT-615).

De bron met uitleg staat in de gedeelde map. Naar de repo's gaat dezelfde
code zonder commentaar: de telefoon van een bezoeker hoeft de uitleg niet te
laden. Besluit Ronald 15-11-2026 (sessie 150): "ja en ja".

Wat het doet, en niets anders:
- haalt commentaar weg uit .js, .css en index.html (ook uit de scripts en
  stijlen in index.html);
- laat elk ander teken staan, ook tekenreeksen, reguliere expressies en
  sjabloonteksten (`...${...}...`);
- houdt elk regelnummer gelijk: een commentaar over drie regels wordt drie
  lege regels. Een regel in het foutenlog wijst zo de goede regel in de bron aan;
- laat index.html tot en met de regel die laden en versturen begrenst
  (Content-Security-Policy) ongewijzigd (monitor A9);
- laat supabase.js (de bibliotheek) en tests/ ongewijzigd.

Gebruik:
  python3 tests/tt_omzetten.py <bronmap> <doelmap> <bestand> [<bestand> ...]
  python3 tests/tt_omzetten.py --controle <map>   (afsluitcode 0: niets meer om te zetten)
"""

import os
import re
import sys

WOORD = re.compile(r"[A-Za-z0-9_$\u0080-￿]")
# Na deze woorden begint een / een reguliere expressie, geen deling.
REGEX_NA_WOORD = {"return", "typeof", "instanceof", "in", "of", "new", "delete",
                  "void", "throw", "case", "do", "else", "yield", "await"}

OMZETTEN = (".js", ".css", ".html")
NOOIT = {"supabase.js"}


def _vervang(stukken, tekst, begin, eind):
    """Commentaar tekst[begin:eind] wordt zijn regeleinden. Spaties en tabs
    direct ervoor gaan mee weg. Twee woorden die zo tegen elkaar zouden komen,
    houden één spatie."""
    while stukken and stukken[-1] and stukken[-1][-1] in " \t":
        stukken[-1] = stukken[-1][:-1]
    regels = tekst.count("\n", begin, eind)
    if regels:
        stukken.append("\n" * regels)
        return
    voor = stukken[-1][-1] if stukken and stukken[-1] else "\n"
    na = tekst[eind] if eind < len(tekst) else "\n"
    if voor not in " \t\n" and na not in " \t\n":
        stukken.append(" ")


def js(tekst):
    """JavaScript zonder commentaar, verder teken voor teken gelijk."""
    uit = []
    i, n = 0, len(tekst)
    stapel = []          # 'h' = gewone accolade, 's' = ${ in een sjabloontekst
    vorig = None         # laatste betekenisvolle stuk: ('w', woord) of ('p', teken)
    begin = 0            # begin van het stuk dat nog naar uit moet

    def sjabloon(j):
        """Leest een sjabloontekst vanaf j (na de backtick of na de } van ${...}).
        Geeft de positie na de sluitende backtick, of na ${ (dan op de stapel)."""
        while j < n:
            c = tekst[j]
            if c == "\\":
                j += 2
                continue
            if c == "`":
                return j + 1, False
            if c == "$" and j + 1 < n and tekst[j + 1] == "{":
                return j + 2, True
            j += 1
        return n, False

    while i < n:
        c = tekst[i]
        if c in " \t\r\n":
            i += 1
            continue
        if c == "/" and i + 1 < n and tekst[i + 1] == "/":
            eind = tekst.find("\n", i)
            eind = n if eind < 0 else eind
            uit.append(tekst[begin:i])
            _vervang(uit, tekst, i, eind)
            i = begin = eind
            continue
        if c == "/" and i + 1 < n and tekst[i + 1] == "*":
            eind = tekst.find("*/", i + 2)
            eind = n if eind < 0 else eind + 2
            uit.append(tekst[begin:i])
            _vervang(uit, tekst, i, eind)
            i = begin = eind
            continue
        if c in "'\"":
            j = i + 1
            while j < n and tekst[j] != c:
                j += 2 if tekst[j] == "\\" else 1
            i = j + 1
            vorig = ("w", "'")
            continue
        if c == "`":
            i, open_ = sjabloon(i + 1)
            if open_:
                stapel.append("s")
                vorig = ("p", "{")
            else:
                vorig = ("w", "`")
            continue
        if c == "/":
            regex = (vorig is None
                     or (vorig[0] == "p" and vorig[1] not in ")]}")
                     or (vorig[0] == "w" and vorig[1] in REGEX_NA_WOORD))
            if regex:
                j, klasse = i + 1, False
                while j < n:
                    t = tekst[j]
                    if t == "\\":
                        j += 2
                        continue
                    if t == "[":
                        klasse = True
                    elif t == "]":
                        klasse = False
                    elif t == "/" and not klasse:
                        break
                    elif t == "\n":
                        break
                    j += 1
                j += 1
                while j < n and WOORD.match(tekst[j]):
                    j += 1
                i = j
                vorig = ("w", "/regex/")
                continue
            i += 1
            vorig = ("p", "/")
            continue
        if c == "{":
            stapel.append("h")
            vorig = ("p", "{")
            i += 1
            continue
        if c == "}":
            soort = stapel.pop() if stapel else "h"
            if soort == "s":
                i, open_ = sjabloon(i + 1)
                if open_:
                    stapel.append("s")
                    vorig = ("p", "{")
                else:
                    vorig = ("w", "`")
                continue
            vorig = ("p", "}")
            i += 1
            continue
        if WOORD.match(c):
            j = i + 1
            while j < n and WOORD.match(tekst[j]):
                j += 1
            vorig = ("w", tekst[i:j])
            i = j
            continue
        vorig = ("p", c)
        i += 1
    uit.append(tekst[begin:])
    return "".join(uit)


def css(tekst):
    """CSS zonder commentaar, verder teken voor teken gelijk."""
    uit = []
    i, n, begin = 0, len(tekst), 0
    while i < n:
        c = tekst[i]
        if c in "'\"":
            j = i + 1
            while j < n and tekst[j] != c:
                j += 2 if tekst[j] == "\\" else 1
            i = j + 1
            continue
        if c == "/" and i + 1 < n and tekst[i + 1] == "*":
            eind = tekst.find("*/", i + 2)
            eind = n if eind < 0 else eind + 2
            uit.append(tekst[begin:i])
            _vervang(uit, tekst, i, eind)
            i = begin = eind
            continue
        i += 1
    uit.append(tekst[begin:])
    return "".join(uit)


CSP = '<meta http-equiv="Content-Security-Policy"'


def html(tekst):
    """index.html zonder commentaar. Tot en met de regel met de
    Content-Security-Policy blijft alles staan (monitor A9)."""
    p = tekst.find(CSP)
    vast = tekst.find("\n", p) + 1 if p >= 0 else 0
    uit = [tekst[:vast]]
    klein = tekst.lower()
    i, n, begin = vast, len(tekst), vast
    while i < n:
        if tekst[i] != "<":
            i += 1
            continue
        if tekst.startswith("<!--", i):
            eind = tekst.find("-->", i + 4)
            eind = n if eind < 0 else eind + 3
            uit.append(tekst[begin:i])
            _vervang(uit, tekst, i, eind)
            i = begin = eind
            continue
        m = re.match(r"<(script|style)\b[^>]*>", tekst[i:i + 400], re.I)
        if m:
            soort = m.group(1).lower()
            inhoud_begin = i + m.end()
            eind = klein.find("</%s>" % soort, inhoud_begin)
            eind = n if eind < 0 else eind
            uit.append(tekst[begin:inhoud_begin])
            inhoud = tekst[inhoud_begin:eind]
            uit.append(js(inhoud) if soort == "script" else css(inhoud))
            i = begin = eind
            continue
        i += 1
    uit.append(tekst[begin:])
    return "".join(uit)


def zet_om(naam, tekst):
    basis = os.path.basename(naam)
    if basis in NOOIT or naam.replace("\\", "/").startswith("tests/"):
        return tekst
    if naam.endswith(".js"):
        return js(tekst)
    if naam.endswith(".css"):
        return css(tekst)
    if naam.endswith(".html"):
        return html(tekst)
    return tekst


def lees(pad):
    with open(pad, encoding="utf-8", newline="") as f:
        return f.read()


def main(args):
    if args and args[0] == "--controle":
        map_ = args[1] if len(args) > 1 else "."
        nog = []
        for b in sorted(os.listdir(map_)):
            if b.endswith(OMZETTEN) and b not in NOOIT:
                t = lees(os.path.join(map_, b))
                if zet_om(b, t) != t:
                    nog.append(b)
        if nog:
            print("Nog uitleg in: " + ", ".join(nog))
            return 1
        print("Niets meer om te zetten: geen uitleg in de bestanden.")
        return 0
    if len(args) < 3:
        print(__doc__)
        return 2
    bron, doel, namen = args[0], args[1], args[2:]
    for naam in namen:
        tekst = lees(os.path.join(bron, naam))
        pad = os.path.join(doel, naam)
        os.makedirs(os.path.dirname(pad) or ".", exist_ok=True)
        with open(pad, "w", encoding="utf-8", newline="") as f:
            f.write(zet_om(naam, tekst))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
