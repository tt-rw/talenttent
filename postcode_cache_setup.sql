-- Postcode-cache tabel voor The Talent Tent
-- Doel: als de PDOK Locatieserver (overheidsdienst) tijdelijk niet bereikbaar is,
-- kan de app terugvallen op eerder opgezochte postcodes uit deze tabel.
-- De cache vult zichzelf automatisch: elke succesvolle opzoeking wordt hier opgeslagen.
-- Kan ook in één keer volledig gevuld worden met een gratis, kant-en-klare lijst
-- van alle NL postcodes (zie postcode_cache_import_instructies.txt).

create table if not exists postcode_cache (
  postcode   text primary key,
  city       text not null,
  latitude   numeric,
  longitude  numeric,
  updated_at timestamptz default now()
);

alter table postcode_cache enable row level security;

-- Iedereen (ook niet-ingelogde bezoekers tijdens registratie) mag de cache lezen
create policy "postcode_cache_select_all"
on postcode_cache for select
using (true);

-- Iedereen mag nieuwe postcodes toevoegen aan de cache
create policy "postcode_cache_insert_all"
on postcode_cache for insert
with check (true);

-- Iedereen mag bestaande postcode-gegevens bijwerken (upsert)
create policy "postcode_cache_update_all"
on postcode_cache for update
using (true);
