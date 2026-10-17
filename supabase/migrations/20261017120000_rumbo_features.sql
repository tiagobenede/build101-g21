-- Rumbo: features del hackathon (docs/planning.md, sección 4)
-- Restricciones del perfil, estado del itinerario, lugares de Google, traducción,
-- recomendaciones de residentes, memoria del agente, GPS simulado, avisos y
-- snapshots del itinerario.

-- ---------------------------------------------------------------------------
-- profiles: restricciones, ritmo y perfil compilado
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column dietary          text[] not null default '{}',  -- 'vegetariano', 'celíaco', ...
  add column mobility         text,                           -- 'sin escaleras', ...
  add column daily_budget     int check (daily_budget >= 0),  -- euros por día
  add column pace             text check (pace in ('tranquilo', 'intenso')),
  add column schedule         text check (schedule in ('madrugador', 'noctámbulo')),
  add column compiled_summary text;                           -- párrafo que va a las instrucciones

-- ---------------------------------------------------------------------------
-- itinerary_items: estado, origen y reservas
-- ---------------------------------------------------------------------------
alter table public.itinerary_items
  add column status     text not null default 'planned'
             check (status in ('planned', 'in_progress', 'done', 'skipped')),
  add column source     text not null default 'user'
             check (source in ('user', 'agent', 'local_tip', 'event')),
  add column source_ref uuid,                                  -- id del local_tip que lo originó
  add column locked     boolean not null default false;        -- reserva: el planner no la mueve
-- place_id ya existe (text, sin FK): apunta a places.id

-- ---------------------------------------------------------------------------
-- places: solo los lugares que algo referencia (itinerario, tips, avisos,
-- recomendaciones). Los cercanos los busca el agente en Google Places.
-- id = place id de Google ("ChIJ..."); el upsert es por id. Lo escribe el
-- server con la secret key: para los usuarios sigue siendo de solo lectura.
-- ---------------------------------------------------------------------------
alter table public.places
  alter column city drop not null;                             -- Google no siempre la devuelve
-- opening_hours, address y demás datos de Google van en places.data (jsonb)

-- ---------------------------------------------------------------------------
-- conversations: guía o traducción
-- ---------------------------------------------------------------------------
alter table public.conversations
  add column kind      text not null default 'guide' check (kind in ('guide', 'translation')),
  add column lang_pair text;                                   -- 'es-fr'

-- ---------------------------------------------------------------------------
-- messages: rol del residente e idioma
-- ---------------------------------------------------------------------------
alter table public.messages
  drop constraint messages_role_check,
  add constraint messages_role_check check (role in ('user', 'agent', 'local')),
  add column lang            text,
  add column translated_text text;

-- ---------------------------------------------------------------------------
-- local_tips: lo que recomiendan los residentes
-- ---------------------------------------------------------------------------
create table public.local_tips (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,
  trip_id          uuid references public.trips (id) on delete set null,
  conversation_id  uuid references public.conversations (id) on delete set null,
  place_id         text references public.places (id),         -- null si no se pudo anclar
  place_name_raw   text not null,                              -- como llegó en la traducción
  what             text not null,
  why              text,
  when_to_go       text,
  price_hint       text,
  recommender      text,                                       -- "Camille, la de la panadería"
  original_quote   text,
  original_lang    text,
  translated_quote text,
  status           text not null default 'pending'
                   check (status in ('pending', 'saved', 'in_plan', 'dismissed')),
  confidence       real check (confidence between 0 and 1),
  created_at       timestamptz not null default now()
);

create index local_tips_user_idx on public.local_tips (user_id, status);

-- ---------------------------------------------------------------------------
-- profile_facts: lo que el agente aprende hablando
-- ---------------------------------------------------------------------------
create table public.profile_facts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  kind          text not null check (kind in ('constraint', 'preference')),
  statement     text not null,                                 -- "Evita museos largos, más de una hora"
  polarity      int not null default 1 check (polarity in (-1, 1)),
  source        text not null default 'stated' check (source in ('stated', 'inferred')),
  evidence      text,
  superseded_by uuid references public.profile_facts (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index profile_facts_user_idx on public.profile_facts (user_id, created_at);

-- ---------------------------------------------------------------------------
-- pings: posiciones del GPS (simulado o real)
-- ---------------------------------------------------------------------------
create table public.pings (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  heading    double precision check (heading >= 0 and heading < 360),
  source     text not null default 'mock' check (source in ('mock', 'real')),
  created_at timestamptz not null default now()
);

-- getTravelerContext() pide el último ping del usuario en cada request.
create index pings_user_latest_idx on public.pings (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- notifications: avisos proactivos por cercanía
-- ---------------------------------------------------------------------------
create table public.notifications (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles (id) on delete cascade,
  place_id       text not null references public.places (id),
  reason_text    text not null,                                -- "Estás a 2 min de X, que te recomendó Y"
  candidate_type text not null check (candidate_type in ('local_tip', 'itinerary', 'interest')),
  created_at     timestamptz not null default now(),
  seen_at        timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- itinerary_snapshots: para "volvé al plan anterior"
-- ---------------------------------------------------------------------------
create table public.itinerary_snapshots (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  items      jsonb not null,
  created_at timestamptz not null default now()
);

create index itinerary_snapshots_trip_idx on public.itinerary_snapshots (trip_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: cada usuario ve solo lo suyo
-- ---------------------------------------------------------------------------
alter table public.local_tips          enable row level security;
alter table public.profile_facts       enable row level security;
alter table public.pings               enable row level security;
alter table public.notifications       enable row level security;
alter table public.itinerary_snapshots enable row level security;

create policy "own local tips" on public.local_tips
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own profile facts" on public.profile_facts
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own pings" on public.pings
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own notifications" on public.notifications
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own itinerary snapshots" on public.itinerary_snapshots
  for all to authenticated
  using (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()))
  with check (exists (select 1 from public.trips t where t.id = trip_id and t.user_id = auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime: la UI se entera sola de lo que escriben el agente y los motores
-- ---------------------------------------------------------------------------
alter publication supabase_realtime
  add table public.itinerary_items, public.local_tips, public.notifications, public.recommendations;
