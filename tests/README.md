# Vaste testset — laag 1 (TT-231)

Draaien:

```
python3 tests/tt_tests.py
```

Afsluitcode 0 = alles geslaagd. Claude draait dit vóór elke oplevering.

## Wat laag 1 dekt

| Blok | Controle |
|---|---|
| 1 | `node --check` en haakjesbalans op alle tien JS-bestanden; scriptvolgorde; `?v=` per script; dode bestanden niet geladen; geen emoji |
| 2 | app start zonder JS-fout; veertien views aanwezig; landing actief |
| 3 | elke `onclick` in `index.html` wijst naar een bestaande functie |
| 4 | alle navigatie-id's aanwezig; hamburger buiten de scrollbare balk |
| 5 | knoppenrijen: grid, gelijke breedte, 8px, tikdoel 44px (TT-228) |
| 6 | een databasefout komt als fout terug, niet als lege lijst (TT-230) |
| 7 | modals binnen `#appRoot`; `overflow-x` op `#appRoot`, niet op `body` (TT-212) |
| 8 | elke view opent zonder JS-fout |

## Wat laag 1 niet dekt

Database, RLS-regels en echt inloggen. Dat is laag 2: Claude loopt de app door
in de browser, op de echte site.

## De stub

`tests/stub/supabase-stub.js` vervangt de Supabase-bibliotheek tijdens een test.
Playwright zet hem in de plaats van het CDN-script; `index.html` is hiervoor
niet gewijzigd. De stub wordt nooit door de app zelf geladen.

Een test stuurt de stub aan via `window.TT_STUB`:

| Veld | Gebruik |
|---|---|
| `data` | vaste testdata per tabel |
| `calls` | elke aanroep, op volgorde |
| `errors` | `{'band_members.founder_offer': {code,message}}` dwingt een fout af |
| `rpcErrors` | idem, per databasefunctie |
| `session` | `null` of een sessie-object |

## Let op

GitHub Pages publiceert alles in de productierepo. Deze map is dus publiek
leesbaar. Er staan geen sleutels of gegevens van gebruikers in — alleen
testcode en verzonnen testdata. Zet hier nooit een echte sleutel neer.
