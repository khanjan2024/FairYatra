-- ============================================================
-- FairYatra – Supabase Schema
-- Run this once in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ── Profiles (extends Supabase auth.users) ────────────────────────────────────
create table if not exists public.profiles (
  id          uuid references auth.users(id) on delete cascade primary key,
  name        text not null,
  role        text not null default 'user' check (role in ('user','admin')),
  banned      boolean not null default false,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Anyone logged in can read all profiles (needed for admin user list)
create policy "profiles_select" on public.profiles
  for select using (auth.role() = 'authenticated');

-- Users can only update their own profile
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Admins can update any profile
create policy "profiles_update_admin" on public.profiles
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Auto-create a profile row when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'user')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ── Community Reports ─────────────────────────────────────────────────────────
create table if not exists public.reports (
  id              text primary key,
  user_id         uuid references auth.users(id) on delete set null,
  type            text not null check (type in ('fare','complaint','review','scam_tip')),
  city            text not null,
  service_type    text not null,
  from_place      text not null default '',
  to_place        text not null default '',
  route_key       text not null default '',
  quoted_fare     numeric not null default 0,
  paid_fare       numeric not null default 0,
  is_overcharged  boolean not null default false,
  rating          integer,
  complaint_type  text,
  title           text,
  note            text,
  driver_details  text,
  evidence        jsonb,
  helpful         integer not null default 0,
  status          text not null default 'pending' check (status in ('pending','verified','disputed')),
  created_at      timestamptz not null default now()
);

alter table public.reports enable row level security;

-- Anyone logged in can read all reports
create policy "reports_select" on public.reports
  for select using (auth.role() = 'authenticated');

-- Logged-in users can insert their own reports
create policy "reports_insert" on public.reports
  for insert with check (auth.role() = 'authenticated');

-- Only admins can delete or update reports
create policy "reports_delete_admin" on public.reports
  for delete using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "reports_update_admin" on public.reports
  for update using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- Helpful votes table (prevents double-voting)
create table if not exists public.helpful_votes (
  report_id   text references public.reports(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  primary key (report_id, user_id)
);

alter table public.helpful_votes enable row level security;

create policy "votes_select" on public.helpful_votes
  for select using (auth.role() = 'authenticated');

create policy "votes_insert" on public.helpful_votes
  for insert with check (auth.uid() = user_id);


-- ── Community Scams (admin-approved tips) ────────────────────────────────────
create table if not exists public.community_scams (
  id            text primary key,
  city          text not null,
  location      text not null,
  lat           numeric not null default 0,
  lng           numeric not null default 0,
  title         text not null,
  category      text not null,
  description   text not null,
  how_to_avoid  text not null,
  typical_loss  text,
  red_flags     jsonb,
  severity      text not null check (severity in ('low','medium','high')),
  service_type  text not null,
  tags          jsonb not null default '[]',
  report_id     text references public.reports(id) on delete set null,
  submitted_by  text,
  approved_at   timestamptz not null default now()
);

alter table public.community_scams enable row level security;

-- Anyone logged in can read approved scams
create policy "community_scams_select" on public.community_scams
  for select using (auth.role() = 'authenticated');

-- Only admins can insert/update/delete
create policy "community_scams_admin" on public.community_scams
  for all using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );


-- ── Seed the first admin account ─────────────────────────────────────────────
-- After running this schema, sign up with admin@fairyatra.app in the app.
-- Then run this to promote that user to admin:
--
--   update public.profiles
--   set role = 'admin'
--   where id = (select id from auth.users where email = 'admin@fairyatra.app');
