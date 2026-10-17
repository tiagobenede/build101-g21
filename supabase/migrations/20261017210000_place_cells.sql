-- Zonas ya pedidas a Google Places (Nearby Search). Antes se contaba cuántos lugares
-- había guardados cerca y, con 15, no se volvía a pedir: lo que había llegado por una
-- búsqueda suelta tapaba la zona y faltaban lugares. Ahora cada zona se pide una vez
-- (y se renueva cada tanto), sobreviviendo a los reinicios del server.
create table public.place_cells (
  cell        text primary key,
  fetched_at  timestamptz not null default now()
);

-- Solo la usa el server con la clave secreta: RLS sin políticas = nadie más la lee.
alter table public.place_cells enable row level security;

-- Los lugares cercanos se buscan por caja de coordenadas.
create index if not exists places_lat_lng_idx on public.places (lat, lng);

-- Cuántas reseñas tiene en Google: mide qué tan conocido es (el shopping del barrio vs. una tienda).
alter table public.places add column if not exists rating_count integer;
