-- Rumbo: esquema inicial
-- Perfiles, gustos, viajes, itinerario, conversaciones de voz y lugares.

create extension if not exists "pgcrypto" with schema extensions;

-- ---------------------------------------------------------------------------
-- profiles: 1:1 con auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  full_name    text not null,
  avatar_url   text,
  home_city    text,
  language     text not null default 'es',
  travel_style text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- interests: tags de gustos del usuario ("autos", "arte", ...)
-- ---------------------------------------------------------------------------
create table public.interests (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  tag        text not null,
  created_at timestamptz not null default now(),
  unique (user_id, tag)
);

-- ---------------------------------------------------------------------------
-- trips + itinerary_items
-- ---------------------------------------------------------------------------
create table public.trips (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  destination text not null,
  country     text,
  lat         double precision not null,
  lng         double precision not null,
  start_date  date not null,
  end_date    date not null,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.itinerary_items (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  title      text not null,
  notes      text,
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  lat        double precision,
  lng        double precision,
  place_id   text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- places: puntos de interés (hoy seed; luego cache de Google Places)
-- ---------------------------------------------------------------------------
create table public.places (
  id                    text primary key,
  name                  text not null,
  category              text not null,
  tags                  text[] not null default '{}',
  description           text,
  city                  text not null,
  lat                   double precision not null,
  lng                   double precision not null,
  rating                numeric(2, 1),
  typical_visit_minutes int not null default 30,
  image_url             text,
  data                  jsonb not null default '{}',
  fetched_at            timestamptz not null default now()
);

create index places_city_idx on public.places (city);

-- ---------------------------------------------------------------------------
-- conversations + messages + recommendations
-- ---------------------------------------------------------------------------
create table public.conversations (
  id                         uuid primary key default gen_random_uuid(),
  user_id                    uuid not null references public.profiles (id) on delete cascade,
  trip_id                    uuid references public.trips (id) on delete set null,
  elevenlabs_conversation_id text,
  lat                        double precision,
  lng                        double precision,
  started_at                 timestamptz not null default now(),
  ended_at                   timestamptz
);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'agent')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create table public.recommendations (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  place_id        text not null references public.places (id),
  walk_minutes    int not null,
  status          text not null default 'suggested'
                  check (status in ('suggested', 'accepted', 'visited', 'dismissed')),
  created_at      timestamptz not null default now()
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);
create index recommendations_user_idx on public.recommendations (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: cada usuario ve solo lo suyo
-- ---------------------------------------------------------------------------
alter table public.profiles        enable row level security;
alter table public.interests       enable row level security;
alter table public.trips           enable row level security;
alter table public.itinerary_items enable row level security;
alter table public.places          enable row level security;
alter table public.conversations   enable row level security;
alter table public.messages        enable row level security;
alter table public.recommendations enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "own interests" on public.interests
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own trips" on public.trips
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own itinerary" on public.itinerary_items
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

create policy "places readable" on public.places
  for select to authenticated using (true);

create policy "own conversations" on public.conversations
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own messages" on public.messages
  for all to authenticated
  using (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.conversations c where c.id = conversation_id and c.user_id = auth.uid()));

create policy "own recommendations" on public.recommendations
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
