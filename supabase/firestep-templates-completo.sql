-- =============================================================================
-- firestep TEMPLATES — schema completo para o Supabase
-- Cole e execute este arquivo em: SQL Editor → New query → Run
-- =============================================================================
-- Depois do SQL:
-- 1. Authentication → Users → Add user (e-mail + senha, auto confirm)
-- 2. Rode o INSERT no final deste arquivo, trocando o e-mail
-- 3. Authentication → Providers → Email ligado; desligue "Confirm email" se
--    quiser entrar na hora. Não habilite cadastro público no site.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Função de updated_at
-- -----------------------------------------------------------------------------
create or replace function public.firestep_set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Quem pode acessar o admin
-- -----------------------------------------------------------------------------
create table if not exists public.firestep_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  name text,
  created_at timestamptz not null default now()
);

create index if not exists firestep_admins_email_idx on public.firestep_admins (email);

create or replace function public.is_firestep_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.firestep_admins
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_firestep_admin() from public;
revoke all on function public.is_firestep_admin() from anon;
grant execute on function public.is_firestep_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- Templates do catálogo
-- -----------------------------------------------------------------------------
create table if not exists public.firestep_templates (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null default '',
  sku text,
  status text not null default 'Ativo',
  service_type text,
  category text,
  subcategory text,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists firestep_templates_status_idx on public.firestep_templates (status);
create index if not exists firestep_templates_category_idx on public.firestep_templates (category);

drop trigger if exists firestep_templates_updated_at on public.firestep_templates;
create trigger firestep_templates_updated_at
before update on public.firestep_templates
for each row execute function public.firestep_set_updated_at();

-- -----------------------------------------------------------------------------
-- Empresas
-- -----------------------------------------------------------------------------
create table if not exists public.firestep_companies (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  legal_name text,
  trade_name text,
  document text,
  status text,
  segment text,
  city text,
  state text,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists firestep_companies_name_idx on public.firestep_companies (trade_name);

drop trigger if exists firestep_companies_updated_at on public.firestep_companies;
create trigger firestep_companies_updated_at
before update on public.firestep_companies
for each row execute function public.firestep_set_updated_at();

-- -----------------------------------------------------------------------------
-- Briefings
-- -----------------------------------------------------------------------------
create table if not exists public.firestep_briefings (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id text references public.firestep_companies (id) on delete set null,
  company_name text,
  service_type text,
  chosen_template text,
  project_priority text,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists firestep_briefings_company_idx on public.firestep_briefings (company_id);

drop trigger if exists firestep_briefings_updated_at on public.firestep_briefings;
create trigger firestep_briefings_updated_at
before update on public.firestep_briefings
for each row execute function public.firestep_set_updated_at();

-- -----------------------------------------------------------------------------
-- Pedidos / interesses do catálogo
-- -----------------------------------------------------------------------------
create table if not exists public.firestep_pedidos (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text not null,
  whatsapp text not null,
  email text not null,
  template_id text,
  template_name text,
  service_type text,
  category text,
  sku text,
  template_url text,
  base_price text,
  delivery_time text,
  page_url text,
  status text not null default 'Novo',
  payload jsonb
);

create index if not exists firestep_pedidos_created_at_idx on public.firestep_pedidos (created_at desc);
create index if not exists firestep_pedidos_status_idx on public.firestep_pedidos (status);

drop trigger if exists firestep_pedidos_updated_at on public.firestep_pedidos;
create trigger firestep_pedidos_updated_at
before update on public.firestep_pedidos
for each row execute function public.firestep_set_updated_at();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.firestep_admins enable row level security;
alter table public.firestep_templates enable row level security;
alter table public.firestep_companies enable row level security;
alter table public.firestep_briefings enable row level security;
alter table public.firestep_pedidos enable row level security;

-- Admins: cada um lê só a própria linha
drop policy if exists firestep_admins_select on public.firestep_admins;
create policy firestep_admins_select on public.firestep_admins
  for select to authenticated
  using (user_id = auth.uid());

-- Templates: catálogo público lê ativos; admin gerencia tudo
drop policy if exists firestep_templates_public_select on public.firestep_templates;
create policy firestep_templates_public_select on public.firestep_templates
  for select to anon
  using (status is distinct from 'Arquivado' and status is distinct from 'Rascunho');

drop policy if exists firestep_templates_admin_all on public.firestep_templates;
create policy firestep_templates_admin_all on public.firestep_templates
  for all to authenticated
  using (public.is_firestep_admin())
  with check (public.is_firestep_admin());

-- Empresas e briefings: só admin
drop policy if exists firestep_companies_admin_all on public.firestep_companies;
create policy firestep_companies_admin_all on public.firestep_companies
  for all to authenticated
  using (public.is_firestep_admin())
  with check (public.is_firestep_admin());

drop policy if exists firestep_briefings_admin_all on public.firestep_briefings;
create policy firestep_briefings_admin_all on public.firestep_briefings
  for all to authenticated
  using (public.is_firestep_admin())
  with check (public.is_firestep_admin());

-- Pedidos: visitante envia; só admin lê e altera
drop policy if exists firestep_pedidos_insert on public.firestep_pedidos;
create policy firestep_pedidos_insert on public.firestep_pedidos
  for insert to anon, authenticated
  with check (
    status = 'Novo'
    and length(btrim(full_name)) between 2 and 120
    and length(btrim(whatsapp)) between 8 and 32
    and length(btrim(email)) between 6 and 160
    and position('@' in email) > 1
  );

drop policy if exists firestep_pedidos_select on public.firestep_pedidos;
create policy firestep_pedidos_select on public.firestep_pedidos
  for select to authenticated
  using (public.is_firestep_admin());

drop policy if exists firestep_pedidos_update on public.firestep_pedidos;
create policy firestep_pedidos_update on public.firestep_pedidos
  for update to authenticated
  using (public.is_firestep_admin())
  with check (public.is_firestep_admin());

-- -----------------------------------------------------------------------------
-- Grants (mínimos). Nunca conceder TRUNCATE/ALL a anon — TRUNCATE ignora RLS.
-- -----------------------------------------------------------------------------
revoke all on table public.firestep_admins from public, anon, authenticated;
revoke all on table public.firestep_templates from public, anon, authenticated;
revoke all on table public.firestep_companies from public, anon, authenticated;
revoke all on table public.firestep_briefings from public, anon, authenticated;
revoke all on table public.firestep_pedidos from public, anon, authenticated;

grant select on public.firestep_admins to authenticated;
grant select on public.firestep_templates to anon, authenticated;
grant insert, update, delete on public.firestep_templates to authenticated;
grant select, insert, update, delete on public.firestep_companies to authenticated;
grant select, insert, update, delete on public.firestep_briefings to authenticated;
grant insert on public.firestep_pedidos to anon, authenticated;
grant select, update on public.firestep_pedidos to authenticated;

grant all on public.firestep_admins to service_role;
grant all on public.firestep_templates to service_role;
grant all on public.firestep_companies to service_role;
grant all on public.firestep_briefings to service_role;
grant all on public.firestep_pedidos to service_role;

-- =============================================================================
-- Liberar o primeiro administrador (OBRIGATÓRIO)
-- Crie o usuário em Authentication → Users e depois rode:
-- =============================================================================
-- insert into public.firestep_admins (user_id, email, name)
-- select id, email, 'Admin'
-- from auth.users
-- where email = 'SEU_EMAIL_AQUI'
-- on conflict (user_id) do nothing;
