-- Karo shared Kanban database
-- Run this entire file in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  position integer not null default 0
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  column_id uuid not null references public.columns(id) on delete cascade,
  title text not null,
  tag text not null default 'Planning',
  priority text not null default 'Medium',
  points integer not null default 3,
  assignee text not null default '',
  starred boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.boards enable row level security;
alter table public.columns enable row level security;
alter table public.cards enable row level security;

-- This board is intentionally link-shareable and editable by anyone who has the URL.
-- If you later want private/member-only boards, replace these policies with authenticated membership policies.
drop policy if exists "public boards read" on public.boards;
drop policy if exists "public boards write" on public.boards;
drop policy if exists "public columns read" on public.columns;
drop policy if exists "public columns write" on public.columns;
drop policy if exists "public cards read" on public.cards;
drop policy if exists "public cards write" on public.cards;

create policy "public boards read" on public.boards for select using (true);
create policy "public boards write" on public.boards for all using (true) with check (true);
create policy "public columns read" on public.columns for select using (true);
create policy "public columns write" on public.columns for all using (true) with check (true);
create policy "public cards read" on public.cards for select using (true);
create policy "public cards write" on public.cards for all using (true) with check (true);

-- Seed the board from the screenshot. Safe to run once.
do $$
declare
  b uuid;
  todo uuid;
  progress uuid;
  review uuid;
  done uuid;
begin
  select id into b from public.boards where slug='sam-ayushi';
  if b is null then
    insert into public.boards(name,slug) values('Sam & Ayushi','sam-ayushi') returning id into b;
    insert into public.columns(board_id,name,position) values(b,'TO DO',0) returning id into todo;
    insert into public.columns(board_id,name,position) values(b,'IN PROGRESS',1) returning id into progress;
    insert into public.columns(board_id,name,position) values(b,'IN REVIEW',2) returning id into review;
    insert into public.columns(board_id,name,position) values(b,'DONE',3) returning id into done;
    insert into public.cards(board_id,column_id,title,tag,priority,points,assignee,starred,position)
      values(b,todo,'Write the MVP PRD','Planning','High',3,'AY',true,0);
    insert into public.cards(board_id,column_id,title,tag,priority,points,assignee,starred,position)
      values(b,todo,'Vibe-code a prototype','Build','Medium',5,'SA',false,1);
  end if;
end $$;

-- Enable realtime updates.
alter publication supabase_realtime add table public.boards;
alter publication supabase_realtime add table public.columns;
alter publication supabase_realtime add table public.cards;
