#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TT BEWAKING — live controle van The Talent Tent (TT-496, 22-10-2026).

Verschil met `tests/tt_monitor.py`: die toetst de bestanden in de repo. Dit
script kijkt naar de LIVE app en haalt de aantallen op uit de databasefunctie
`tt_bewaking(p_code)`. Het draait elk kwartier in `.github/workflows/monitor.yml`
(job `bewaking`). Afsluitcode 1 = er is iets mis; GitHub mailt dan naar de
eigenaar van de repo. Die weg loopt niet via de mailserver van cloud86.

De code voor de databasefunctie staat als geheim `TT_BEWAKING_CODE` in GitHub
(Settings -> Secrets and variables -> Actions). Nooit in een bestand.
Alleen standaardbibliotheek: geen pip-installatie die zelf kan falen.
"""

import datetime
UTC = datetime.timezone.utc
import json
import os
import re
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Drempels: een telling op of boven de drempel laat de run falen.
# Aanname (22-10-2026): de getallen zijn een eerste schatting; wijzig ze hier.
DREMPELS = {
    "edge_fouten_uur": 1,          # elke fout van een Edge Function
    "bevestig_fouten_uur": 1,      # de app kon de bevestigingsmail niet laten sturen
    "app_fouten_uur": 50,          # piek van fouten uit de app
    "nieuwe_soorten_uur": 5,       # veel nieuwe soorten fout tegelijk
    "wacht_zonder_mail": 1,        # wacht op bevestiging, mail nooit gestart
    "welkom_ontbreekt": 1,         # online, geen welkomstmail
    "ouder_mail_mislukt": 1,       # eerste mail aan een ouder niet verstuurd (TT-496, 23-10-2026)
    "db_aanroep_mislukt_6u": 1,    # een aanroep van de database naar een Edge Function gaf 400 of hoger (TT-469, 23-10-2026)
    "aanroep_zonder_naam": 1,      # een aanroep naar een Edge Function die niet via tt_aanroep_noteren loopt (8D bewaking, 29-10-2026)
    "meldingen_niet_gemaild": 1,   # melding aan privacy@ niet verstuurd
    "cron_sleutel_in_tekst": 1,    # een cron-taak met een letterlijke sleutel in de tekst (TT-470, 27-10-2026)
    "accounts_zonder_profiel": 3,  # wizard blijft hangen (een enkele is normaal)
}
VERWACHTE_CRONTAKEN = 7  # sinds 29-10-2026 ook tt-aanroepen-nakijken (elke 5 minuten)
CRON_MISLUKT_DREMPEL = 1
CERT_MIN_DAGEN = 30
DOMEIN_MIN_DAGEN = 30

SITE = os.environ.get("TT_SITE", "talenttent.org")
POGINGEN = 3
WACHT_SECONDEN = int(os.environ.get("TT_WACHT", "10"))


def database():
    """URL en publishable key van productie, uit core.js (één bron)."""
    basis = os.environ.get("TT_BEWAKING_BASIS")
    sleutel = os.environ.get("TT_BEWAKING_SLEUTEL")
    if basis and sleutel:
        return basis, sleutel
    tekst = open(os.path.join(REPO, "core.js"), encoding="utf-8").read()
    m = re.search(r"const TT_DB_PRODUCTIE = \{\s*url: '([^']+)',\s*key: '([^']+)'", tekst)
    if not m:
        raise RuntimeError("TT_DB_PRODUCTIE niet gevonden in core.js")
    return m.group(1), m.group(2)


def met_herhaling(naam, functie):
    """Een storing van het netwerk van de runner mag geen valse melding geven."""
    laatste = None
    for poging in range(POGINGEN):
        try:
            return functie()
        except Exception as e:  # noqa: BLE001
            laatste = e
            if poging < POGINGEN - 1:
                time.sleep(WACHT_SECONDEN)
    raise RuntimeError("%s: %s" % (naam, laatste))


def vraag(url, headers=None, data=None):
    req = urllib.request.Request(url, headers=headers or {}, data=data)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status, r.read().decode("utf-8", "replace")


def tellingen():
    basis, sleutel = database()
    code = os.environ.get("TT_BEWAKING_CODE", "")
    if not code:
        raise RuntimeError("geheim TT_BEWAKING_CODE ontbreekt in GitHub")
    body = json.dumps({"p_code": code}).encode()
    headers = {"apikey": sleutel, "Content-Type": "application/json"}
    status, tekst = vraag(basis + "/rest/v1/rpc/tt_bewaking", headers, body)
    if status != 200:
        raise RuntimeError("tt_bewaking gaf status %s" % status)
    return json.loads(tekst)


def beoordeel(t):
    """Geeft een lijst (naam, waarde, drempel, goed). Zuiver, dus toetsbaar."""
    uit = []
    for naam, drempel in DREMPELS.items():
        waarde = t.get(naam)
        uit.append((naam, waarde, "< %d" % drempel, isinstance(waarde, int) and waarde < drempel))
    taken = t.get("cron_taken")
    uit.append(("cron_taken", taken, "= %d" % VERWACHTE_CRONTAKEN, taken == VERWACHTE_CRONTAKEN))
    mislukt = t.get("cron_mislukt")
    uit.append(("cron_mislukt", mislukt, "< %d" % CRON_MISLUKT_DREMPEL,
                isinstance(mislukt, int) and mislukt < CRON_MISLUKT_DREMPEL))
    return uit


def site_antwoordt():
    status, _ = vraag("https://%s/" % SITE)
    return status == 200


def supabase_antwoordt():
    basis, sleutel = database()
    status, _ = vraag(basis + "/auth/v1/health", {"apikey": sleutel})
    return status == 200


def cert_dagen():
    ctx = ssl.create_default_context()
    with socket.create_connection((SITE, 443), timeout=20) as s:
        with ctx.wrap_socket(s, server_hostname=SITE) as ss:
            eind = ss.getpeercert()["notAfter"]
    verloopt = datetime.datetime.strptime(eind, "%b %d %H:%M:%S %Y %Z").replace(tzinfo=UTC)
    return (verloopt - datetime.datetime.now(UTC)).days


def domein_dagen():
    """RDAP van het domein. Is RDAP onbereikbaar, dan geeft dit None (geen valse melding)."""
    domein = ".".join(SITE.split(".")[-2:])
    status, tekst = vraag("https://rdap.org/domain/%s" % domein)
    for e in json.loads(tekst).get("events", []):
        if e.get("eventAction") == "expiration":
            eind = datetime.datetime.strptime(e["eventDate"][:10], "%Y-%m-%d").replace(tzinfo=UTC)
            return (eind - datetime.datetime.now(UTC)).days
    return None


def main():
    regels = []   # (naam, uitkomst, goed)

    def stap(naam, functie, beoordeling=None, kritiek=True):
        try:
            waarde = met_herhaling(naam, functie)
        except Exception as e:  # noqa: BLE001
            regels.append((naam, "FOUT: %s" % e, not kritiek))
            return None
        goed, tekst = beoordeling(waarde) if beoordeling else (bool(waarde), str(waarde))
        regels.append((naam, tekst, goed))
        return waarde

    stap("site antwoordt (%s)" % SITE, site_antwoordt)
    stap("Supabase antwoordt", supabase_antwoordt)
    stap("certificaat", cert_dagen,
         lambda d: (d >= CERT_MIN_DAGEN, "%d dagen" % d))
    # Het domein: een onbereikbare RDAP-dienst is geen alarm.
    stap("domein verloopt", domein_dagen,
         lambda d: (True, "onbekend (RDAP gaf geen datum)") if d is None
         else (d >= DOMEIN_MIN_DAGEN, "%d dagen" % d), kritiek=False)

    t = stap("tellingen uit de database", tellingen,
             lambda x: (True, "opgehaald"))
    if t is not None:
        for naam, waarde, drempel, goed in beoordeel(t):
            regels.append((naam, "%s (moet %s zijn)" % (waarde, drempel), goed))

    print("TT BEWAKING — %s UTC" % datetime.datetime.now(UTC).strftime("%d-%m-%Y %H:%M"))
    print("=" * 60)
    for naam, tekst, goed in regels:
        print("  %-4s %-30s %s" % ("ok" if goed else "MIS", naam, tekst))
    fout = [r for r in regels if not r[2]]
    print("-" * 60)
    print("%d van %d goed" % (len(regels) - len(fout), len(regels)))
    # Niet gecontroleerd: de laatste back-up op Backblaze (TT-496, nog niet gebouwd).
    return 1 if fout else 0


if __name__ == "__main__":
    sys.exit(main())
