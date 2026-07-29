-- Uitbreiding op postcode_cache: kolommen voor coördinaten toevoegen.
-- Alleen nodig als je de tabel al eerder had aangemaakt (met het vorige script).
-- Voeg niets toe als de tabel deze kolommen al heeft.

alter table postcode_cache add column if not exists latitude numeric;
alter table postcode_cache add column if not exists longitude numeric;
