-- ============================================================
-- Run this in your Supabase SQL Editor (replace existing schema)
-- ============================================================

-- ── Stores ──────────────────────────────────────────────────
create table if not exists stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location text not null default '',
  created_at timestamptz not null default now()
);

-- ── Products ─────────────────────────────────────────────────
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  barcode text not null default '',
  name text not null,
  category text not null default 'Other',
  quantity numeric not null default 1,
  unit text not null default 'pcs',
  expiry_date date,
  added_at timestamptz not null default now(),
  notes text not null default ''
);

-- ── Profiles (mirrors auth.users so we can look up by email) ─
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique
);

-- Auto-create profile when a user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Store Members ─────────────────────────────────────────────
-- role: 'owner' | 'worker'
create table if not exists store_members (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'worker')),
  created_at timestamptz not null default now(),
  unique(store_id, user_id)
);

-- ── Sales ────────────────────────────────────────────────────
-- Records every sell transaction. product_id may be null if product was deleted.
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  barcode text not null default '',
  category text not null default '',
  quantity_sold numeric not null default 1,
  sold_at timestamptz not null default now()
);

create index if not exists sales_store_id_idx on sales(store_id);
create index if not exists sales_sold_at_idx  on sales(sold_at);

-- ── Store Invitations ─────────────────────────────────────────
-- Owner adds a worker by email. Auto-accepted on next login.
create table if not exists store_invitations (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references stores(id) on delete cascade,
  invited_email text not null,
  role text not null default 'worker' check (role in ('owner', 'worker')),
  created_at timestamptz not null default now(),
  unique(store_id, invited_email)
);

-- ── Indexes ───────────────────────────────────────────────────
create index if not exists products_store_id_idx on products(store_id);
create index if not exists products_expiry_date_idx on products(expiry_date);
create index if not exists store_members_user_id_idx on store_members(user_id);
create index if not exists store_invitations_email_idx on store_invitations(invited_email);

-- ── Row Level Security ────────────────────────────────────────
alter table stores enable row level security;
alter table products enable row level security;
alter table profiles enable row level security;
alter table store_members enable row level security;
alter table store_invitations enable row level security;

-- Helper: is the current user a member of a store?
create or replace function is_store_member(sid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from store_members
    where store_id = sid and user_id = auth.uid()
  );
$$;

-- Helper: is the current user an owner of a store?
create or replace function is_store_owner(sid uuid)
returns boolean language sql security definer as $$
  select exists (
    select 1 from store_members
    where store_id = sid and user_id = auth.uid() and role = 'owner'
  );
$$;

-- Create a store and its initial owner membership atomically.
-- This avoids the RLS bootstrap problem where a user can create a store
-- but is not yet allowed to insert their first owner row into store_members.
create or replace function create_store_with_owner(p_name text, p_location text default '')
returns stores
language plpgsql
security definer
set search_path = public
as $$
declare
  new_store stores;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  insert into stores (name, location)
  values (p_name, coalesce(p_location, ''))
  returning * into new_store;

  insert into store_members (store_id, user_id, role)
  values (new_store.id, auth.uid(), 'owner');

  return new_store;
end;
$$;

grant execute on function create_store_with_owner(text, text) to authenticated;

-- Stores: members can read; anyone can create (they become owner via app logic)
drop policy if exists "stores_select" on stores;
drop policy if exists "stores_insert" on stores;
drop policy if exists "stores_update" on stores;
drop policy if exists "stores_delete" on stores;

create policy "stores_select" on stores for select using (is_store_member(id));
create policy "stores_insert" on stores for insert with check (auth.uid() is not null);
create policy "stores_update" on stores for update using (is_store_owner(id));
create policy "stores_delete" on stores for delete using (is_store_owner(id));

-- Products: members can read/insert; only owners can delete/update
drop policy if exists "products_select" on products;
drop policy if exists "products_insert" on products;
drop policy if exists "products_update" on products;
drop policy if exists "products_delete" on products;

create policy "products_select" on products for select using (is_store_member(store_id));
create policy "products_insert" on products for insert with check (is_store_member(store_id));
create policy "products_update" on products for update using (is_store_owner(store_id));
create policy "products_delete" on products for delete using (is_store_owner(store_id));

-- Profiles: any authenticated user can read (needed for email lookup)
drop policy if exists "profiles_select" on profiles;
drop policy if exists "profiles_insert" on profiles;
create policy "profiles_select" on profiles for select using (auth.uid() is not null);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);

-- Store members: members can read their own store's members; owners can insert/delete
drop policy if exists "store_members_select" on store_members;
drop policy if exists "store_members_insert" on store_members;
drop policy if exists "store_members_update" on store_members;
drop policy if exists "store_members_delete" on store_members;

create policy "store_members_select" on store_members for select using (is_store_member(store_id));
create policy "store_members_insert" on store_members for insert with check (is_store_owner(store_id));
create policy "store_members_update" on store_members for update using (is_store_owner(store_id));
create policy "store_members_delete" on store_members for delete using (is_store_owner(store_id));

-- Invitations: owners can manage; invited user can read their own invitations
drop policy if exists "invitations_select" on store_invitations;
drop policy if exists "invitations_insert" on store_invitations;
drop policy if exists "invitations_delete" on store_invitations;

create policy "invitations_select" on store_invitations for select
  using (
    is_store_owner(store_id)
    or invited_email = (select email from profiles where id = auth.uid())
  );
create policy "invitations_insert" on store_invitations for insert with check (is_store_owner(store_id));
create policy "invitations_delete" on store_invitations for delete using (is_store_owner(store_id));

-- Sales: members can read and insert; only owners can delete
alter table sales enable row level security;

drop policy if exists "sales_select" on sales;
drop policy if exists "sales_insert" on sales;
drop policy if exists "sales_delete" on sales;

create policy "sales_select" on sales for select using (is_store_member(store_id));
create policy "sales_insert" on sales for insert with check (is_store_member(store_id));
create policy "sales_delete" on sales for delete using (is_store_owner(store_id));

-- ── Barcode Cache ─────────────────────────────────────────────
-- Shared product name/category lookup by barcode. Public read/write.
create table if not exists barcode_cache (
  barcode text primary key,
  name text not null,
  category text not null default 'Other',
  created_at timestamptz not null default now()
);

alter table barcode_cache enable row level security;

drop policy if exists "barcode_cache_select" on barcode_cache;
drop policy if exists "barcode_cache_insert" on barcode_cache;
drop policy if exists "barcode_cache_update" on barcode_cache;

-- Anyone (authenticated or not) can read and write cache entries
create policy "barcode_cache_select" on barcode_cache for select using (true);
create policy "barcode_cache_insert" on barcode_cache for insert with check (true);
create policy "barcode_cache_update" on barcode_cache for update using (true);
