-- ============================================================================
-- TT-42 — tabel ouder_toestemming
-- 22-09-2026. Draai dit in de SQL-editor van Supabase, in één keer.
-- Dit bestand gaat NIET naar de repo.
--
-- Wat het doet:
--   1. maakt de tabel ouder_toestemming
--   2. zet row level security aan en geeft NIEMAND rechten
--      (anon en authenticated dus ook niet — alle toegang loopt via de
--       Edge Function met de service-role-sleutel)
--   3. maakt twee onderhoudsfuncties voor de herinnering en het verlopen
--
-- Veilig om twee keer te draaien.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── 1. De tabel ─────────────────────────────────────────────────────────────

create table if not exists public.ouder_toestemming (
  id                  uuid        primary key default gen_random_uuid(),

  -- het kind, vóór er een account bestaat
  kind_voornaam       text        not null,
  kind_leeftijd       int         not null check (kind_leeftijd between 13 and 15),
  kind_email          text        not null,

  -- de ouder
  ouder_email         text        not null,

  -- de code uit de link, versleuteld opgeslagen (sha-256).
  -- De leesbare code staat alleen in de mail aan de ouder.
  code_hash           text        not null unique,

  stand               text        not null default 'open'
                      check (stand in ('open','goedgekeurd','geweigerd','verlopen')),

  aangemaakt_op       timestamptz not null default now(),
  vervalt_op          timestamptz not null default (now() + interval '14 days'),
  herinnerd_op        timestamptz,
  besloten_op         timestamptz,

  -- bewijs
  voorwaarden_versie  text,
  ouder_ip_land       text,

  -- teller voor "stuur nog een keer" (hoogstens drie per aanvraag)
  mail_verstuurd      int         not null default 1,
  laatst_verstuurd_op timestamptz not null default now(),

  -- wordt pas gevuld als het account er is
  musician_id         uuid        references public.musicians(id) on delete set null
);

create index if not exists ouder_toestemming_stand_idx
  on public.ouder_toestemming (stand, vervalt_op);

create index if not exists ouder_toestemming_kind_email_idx
  on public.ouder_toestemming (lower(kind_email));

-- ── 2. Rechten: dicht ───────────────────────────────────────────────────────
-- Geen enkele policy. Met RLS aan en nul policies kan anon noch authenticated
-- iets lezen of schrijven. De service-role-sleutel van de Edge Function gaat
-- langs RLS heen; die is de enige weg naar binnen.

alter table public.ouder_toestemming enable row level security;

revoke all on public.ouder_toestemming from anon, authenticated;

-- ── 3. Onderhoud: herinneren en verlopen ────────────────────────────────────

-- Zet elke aanvraag die over de vervaldatum is op 'verlopen'.
-- Geeft terug hoeveel rijen het betrof.
create or replace function public.tt_ouder_verlopen()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  aantal int;
begin
  update public.ouder_toestemming
     set stand = 'verlopen'
   where stand = 'open'
     and vervalt_op < now();
  get diagnostics aantal = row_count;
  return aantal;
end;
$$;

-- Levert de aanvragen op die een herinnering verdienen: zeven dagen oud,
-- nog open, en nog niet herinnerd. De Edge Function verstuurt ze en zet
-- daarna herinnerd_op.
create or replace function public.tt_ouder_herinneringen()
returns table (
  id            uuid,
  kind_voornaam text,
  ouder_email   text,
  vervalt_op    timestamptz
)
language sql
security definer
set search_path = public
as $$
  select id, kind_voornaam, ouder_email, vervalt_op
    from public.ouder_toestemming
   where stand = 'open'
     and herinnerd_op is null
     and aangemaakt_op < now() - interval '7 days'
     and vervalt_op > now()
   order by aangemaakt_op
   limit 200;
$$;

-- Is dit e-mailadres al in gebruik als inlognaam? De Edge Function vraagt dit
-- op het moment dat het kind het adres van zijn ouder invult. Zonder deze
-- controle zou hij pas ná de goedkeuring horen dat zijn eigen adres al bezet
-- is — veertien dagen later.
-- Geeft alleen waar of niet waar terug, nooit een adres of een gebruiker.
create or replace function public.tt_email_in_gebruik(p_email text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from auth.users where lower(email) = lower(p_email)
  );
$$;

revoke all on function public.tt_ouder_verlopen()          from anon, authenticated;
revoke all on function public.tt_ouder_herinneringen()     from anon, authenticated;
revoke all on function public.tt_email_in_gebruik(text)    from anon, authenticated;

grant execute on function public.tt_ouder_verlopen()       to service_role;
grant execute on function public.tt_ouder_herinneringen()  to service_role;
grant execute on function public.tt_email_in_gebruik(text) to service_role;

-- ============================================================================
-- Controle achteraf — draai deze twee regels apart en stuur me de uitkomst.
-- ============================================================================
-- select to_regclass('public.ouder_toestemming');
-- select count(*) from public.ouder_toestemming;
