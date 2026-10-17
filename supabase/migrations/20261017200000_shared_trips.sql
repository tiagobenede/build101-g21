-- Rumbo: viaje compartido (L-1, Dev A)
-- Varias personas, cada una con su cuenta y su llamada, en el mismo viaje: comparten
-- itinerario, recomendaciones de locales y restricciones. Cada cambio queda firmado
-- con quién lo hizo, y "deshacer" solo deshace lo propio.
--
-- Los permisos pasan de "el dueño del viaje" a "los miembros del viaje". Para no caer
-- en recursión de RLS (trip_members se consulta desde las políticas de trips y de sí
-- misma), la membresía se chequea con funciones security definer.

-- ---------------------------------------------------------------------------
-- trip_members: quién está en cada viaje (el dueño también)
-- ---------------------------------------------------------------------------
create table public.trip_members (
  trip_id   uuid not null references public.trips (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (trip_id, user_id)
);

create index trip_members_user_idx on public.trip_members (user_id, joined_at desc);

insert into public.trip_members (trip_id, user_id, role, joined_at)
select id, user_id, 'owner', created_at from public.trips;

-- Quien crea un viaje queda como su dueño.
create function public.add_trip_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.trip_members (trip_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (trip_id, user_id) do nothing;
  return new;
end;
$$;

create trigger trips_add_owner
  after insert on public.trips
  for each row execute function public.add_trip_owner();

-- ---------------------------------------------------------------------------
-- Funciones de membresía (security definer: no pasan por RLS)
-- ---------------------------------------------------------------------------
create function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.trip_members m
    where m.trip_id = p_trip_id and m.user_id = auth.uid()
  );
$$;

-- ¿Comparto algún viaje con esta persona? (para leer su nombre y restricciones)
create function public.shares_trip_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trip_members mine
    join public.trip_members theirs on theirs.trip_id = mine.trip_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  );
$$;

-- El viaje en curso: entre los viajes de los que soy miembro y que incluyen hoy,
-- el último al que me sumé (si me invitan a otro, pasa a ser ese).
create function public.active_trip_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select m.trip_id
  from public.trip_members m
  join public.trips t on t.id = m.trip_id
  where m.user_id = auth.uid()
    and current_date between t.start_date and t.end_date
  order by m.joined_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- trip_invites: código corto para sumarse a un viaje
-- ---------------------------------------------------------------------------
create table public.trip_invites (
  code       text primary key check (code ~ '^[A-Z0-9]{6}$'),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days'
);

create index trip_invites_trip_idx on public.trip_invites (trip_id);

-- Sumarse con un código. Devuelve el viaje; error 'invalid_invite' si no existe o venció.
create function public.join_trip(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select i.trip_id into v_trip_id
  from public.trip_invites i
  where i.code = upper(trim(p_code)) and i.expires_at > now();

  if v_trip_id is null then
    raise exception 'invalid_invite';
  end if;

  insert into public.trip_members (trip_id, user_id, role)
  values (v_trip_id, auth.uid(), 'member')
  -- Volver a sumarse lo hace el viaje activo otra vez.
  on conflict (trip_id, user_id) do update set joined_at = now();

  return v_trip_id;
end;
$$;

-- Salir de un viaje ajeno (el dueño no puede salir del suyo).
create function public.leave_trip(p_trip_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.trip_members
  where trip_id = p_trip_id and user_id = auth.uid() and role <> 'owner';
$$;

revoke execute on function public.join_trip(text) from public, anon;
revoke execute on function public.leave_trip(uuid) from public, anon;
grant execute on function public.join_trip(text) to authenticated;
grant execute on function public.leave_trip(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Autoría: quién sumó y quién cambió cada actividad
-- ---------------------------------------------------------------------------
alter table public.itinerary_items
  add column created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  add column updated_by uuid references public.profiles (id) on delete set null;

update public.itinerary_items i
set created_by = t.user_id
from public.trips t
where t.id = i.trip_id and i.created_by is null;

create function public.set_itinerary_updated_by()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

create trigger itinerary_items_updated_by
  before update on public.itinerary_items
  for each row execute function public.set_itinerary_updated_by();

-- Cada copia para deshacer recuerda de quién fue el cambio.
alter table public.itinerary_snapshots
  add column created_by uuid default auth.uid() references public.profiles (id) on delete set null;

update public.itinerary_snapshots s
set created_by = t.user_id
from public.trips t
where t.id = s.trip_id and s.created_by is null;

-- Deshacer solo si el último cambio es mío: si otro cambió algo después, restaurar
-- la copia le borraría su cambio. Devuelve -1 en ese caso (y null si no hay nada).
create or replace function public.restore_itinerary_snapshot(p_trip_id uuid)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  snap public.itinerary_snapshots;
  restored int;
begin
  select * into snap
  from public.itinerary_snapshots
  where trip_id = p_trip_id
  order by created_at desc
  limit 1;

  if snap.id is null then
    return null;
  end if;

  if snap.created_by is distinct from auth.uid() then
    return -1;
  end if;

  delete from public.itinerary_items where trip_id = p_trip_id;
  insert into public.itinerary_items
  select * from jsonb_populate_recordset(null::public.itinerary_items, snap.items);
  get diagnostics restored = row_count;

  delete from public.itinerary_snapshots where id = snap.id;
  return restored;
end;
$$;

-- Autor del último cambio del viaje (para decir "lo último lo cambió Sofía").
create function public.last_itinerary_change_by(p_trip_id uuid)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select created_by from public.itinerary_snapshots
  where trip_id = p_trip_id
  order by created_at desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Permisos: de "dueño" a "miembro del viaje"
-- ---------------------------------------------------------------------------
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;

drop policy "own trips" on public.trips;
create policy "members read trips" on public.trips
  for select to authenticated
  using (user_id = auth.uid() or public.is_trip_member(id));
create policy "owners insert trips" on public.trips
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "owners update trips" on public.trips
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owners delete trips" on public.trips
  for delete to authenticated
  using (user_id = auth.uid());

-- Sumarse y salir es por join_trip / leave_trip; acá solo se lee.
create policy "members read members" on public.trip_members
  for select to authenticated
  using (public.is_trip_member(trip_id));

create policy "members read invites" on public.trip_invites
  for select to authenticated
  using (public.is_trip_member(trip_id));
create policy "members create invites" on public.trip_invites
  for insert to authenticated
  with check (created_by = auth.uid() and public.is_trip_member(trip_id));

drop policy "own itinerary" on public.itinerary_items;
create policy "members itinerary" on public.itinerary_items
  for all to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

drop policy "own itinerary snapshots" on public.itinerary_snapshots;
create policy "members itinerary snapshots" on public.itinerary_snapshots
  for all to authenticated
  using (public.is_trip_member(trip_id))
  with check (public.is_trip_member(trip_id));

-- Lo que recomendaron los locales lo ve todo el viaje; cada uno escribe lo suyo
-- y cualquiera puede marcarlo (guardado, en el plan, descartado).
drop policy "own local tips" on public.local_tips;
create policy "members read local tips" on public.local_tips
  for select to authenticated
  using (user_id = auth.uid() or (trip_id is not null and public.is_trip_member(trip_id)));
create policy "own local tips insert" on public.local_tips
  for insert to authenticated
  with check (user_id = auth.uid());
create policy "members update local tips" on public.local_tips
  for update to authenticated
  using (user_id = auth.uid() or (trip_id is not null and public.is_trip_member(trip_id)))
  with check (user_id = auth.uid() or (trip_id is not null and public.is_trip_member(trip_id)));
create policy "own local tips delete" on public.local_tips
  for delete to authenticated
  using (user_id = auth.uid());

-- Nombre, gustos y restricciones de quienes viajan conmigo (para el agente y la UI).
create policy "companions read profiles" on public.profiles
  for select to authenticated
  using (public.shares_trip_with(id));
create policy "companions read interests" on public.interests
  for select to authenticated
  using (public.shares_trip_with(user_id));

-- La UI se entera cuando alguien se suma o se va.
alter publication supabase_realtime add table public.trip_members;
