-- Money: espaço do casal + registros sincronizados.
-- Execute INTEIRO no SQL Editor do Supabase (pode rodar de novo sem estragar nada).
-- Usa o mesmo projeto e o mesmo login do app Time: as tabelas daqui têm o prefixo money_.

-- 1) Tabelas ------------------------------------------------------------------------------------

create table if not exists public.money_households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Casal',
  -- código que a segunda pessoa digita para entrar (12 caracteres aleatórios)
  invite_code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  created_by  uuid references auth.users (id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now()
);

create table if not exists public.money_members (
  household_id uuid not null references public.money_households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);
-- cada pessoa pertence a um único espaço
create unique index if not exists money_members_one_per_user on public.money_members (user_id);

-- Um registro do app (lançamento, conta, meta, categoria…). "deleted" é a lápide: apagar vira true,
-- para o outro aparelho também apagar.
create table if not exists public.money_records (
  household_id uuid not null references public.money_households (id) on delete cascade,
  store        text not null check (store in ('categories', 'bills', 'transactions', 'goals', 'rules', 'settings')),
  id           text not null,
  data         jsonb,
  deleted      boolean not null default false,
  updated_at   timestamptz not null default clock_timestamp(),
  updated_by   uuid default auth.uid(),
  primary key (household_id, store, id)
);
create index if not exists money_records_pull on public.money_records (household_id, updated_at);

-- carimba cada gravação com a hora do servidor (os aparelhos usam isso para saber o que é novo)
create or replace function public.money_touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists money_records_touch on public.money_records;
create trigger money_records_touch before insert or update on public.money_records
  for each row execute function public.money_touch();

-- 2) Segurança por linha (RLS): só quem é do espaço lê e grava ------------------------------------

create or replace function public.money_is_member(h uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.money_members where household_id = h and user_id = auth.uid())
$$;

alter table public.money_households enable row level security;
alter table public.money_members    enable row level security;
alter table public.money_records    enable row level security;

drop policy if exists "membros leem o espaço"    on public.money_households;
drop policy if exists "membros veem membros"     on public.money_members;
drop policy if exists "membros leem registros"   on public.money_records;
drop policy if exists "membros criam registros"  on public.money_records;
drop policy if exists "membros editam registros" on public.money_records;
drop policy if exists "membros apagam registros" on public.money_records;

create policy "membros leem o espaço"    on public.money_households for select to authenticated using (public.money_is_member(id));
create policy "membros veem membros"     on public.money_members    for select to authenticated using (public.money_is_member(household_id));
create policy "membros leem registros"   on public.money_records    for select to authenticated using (public.money_is_member(household_id));
create policy "membros criam registros"  on public.money_records    for insert to authenticated with check (public.money_is_member(household_id));
create policy "membros editam registros" on public.money_records    for update to authenticated
  using (public.money_is_member(household_id)) with check (public.money_is_member(household_id));
create policy "membros apagam registros" on public.money_records    for delete to authenticated using (public.money_is_member(household_id));

-- espaços e membros só mudam pelas funções abaixo (nunca direto pelo app)
revoke all on public.money_households, public.money_members, public.money_records from anon;
revoke insert, update, delete on public.money_households, public.money_members from authenticated;

-- 3) Funções: criar o espaço, entrar com o código, ver o meu ------------------------------------

create or replace function public.money_create_household(p_name text default 'Casal')
returns table (id uuid, name text, invite_code text)
language plpgsql security definer set search_path = public as $$
declare h public.money_households;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.money_members where user_id = auth.uid()) then raise exception 'already_member'; end if;
  insert into public.money_households (name, created_by)
    values (left(coalesce(nullif(trim(p_name), ''), 'Casal'), 60), auth.uid())
    returning * into h;
  insert into public.money_members (household_id, user_id) values (h.id, auth.uid());
  return query select h.id, h.name, h.invite_code;
end $$;

create or replace function public.money_join_household(p_code text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare h public.money_households; n int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if exists (select 1 from public.money_members where user_id = auth.uid()) then raise exception 'already_member'; end if;
  select * into h from public.money_households where invite_code = lower(trim(p_code)) for update;
  if not found then raise exception 'invalid_code'; end if;
  select count(*) into n from public.money_members where household_id = h.id;
  if n >= 2 then raise exception 'household_full'; end if;  -- é um app de casal: no máximo duas pessoas
  insert into public.money_members (household_id, user_id) values (h.id, auth.uid());
  return h.id;
end $$;

create or replace function public.money_my_household()
returns table (id uuid, name text, invite_code text, members int)
language sql security definer stable set search_path = public as $$
  select h.id, h.name, h.invite_code, (select count(*)::int from public.money_members m2 where m2.household_id = h.id)
  from public.money_households h
  join public.money_members m on m.household_id = h.id and m.user_id = auth.uid()
$$;

revoke execute on function public.money_create_household(text), public.money_join_household(text), public.money_my_household() from public, anon;
grant  execute on function public.money_create_household(text), public.money_join_household(text), public.money_my_household() to authenticated;

-- 4) Tempo real: o outro celular atualiza na hora ----------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.money_records;
exception when duplicate_object then null;
end $$;
