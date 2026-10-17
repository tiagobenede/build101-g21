-- Rumbo: deshacer cambios del itinerario (C-2)
-- Antes de cada cambio se guarda una copia del itinerario del viaje; "deshacer"
-- restaura la última copia y la borra. Son funciones SQL para que restaurar
-- (borrar + reinsertar) sea una sola transacción. security invoker: corren con
-- los permisos del usuario, así que RLS sigue decidiendo qué viajes puede tocar.

-- Copias que se guardan por viaje; las más viejas se borran.
create function public.snapshot_itinerary(p_trip_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  snapshot_id uuid;
begin
  insert into public.itinerary_snapshots (trip_id, items)
  select p_trip_id, coalesce(jsonb_agg(to_jsonb(i) order by i.starts_at), '[]'::jsonb)
  from public.itinerary_items i
  where i.trip_id = p_trip_id
  returning id into snapshot_id;

  delete from public.itinerary_snapshots s
  where s.trip_id = p_trip_id
    and s.id not in (
      select id from public.itinerary_snapshots
      where trip_id = p_trip_id
      order by created_at desc
      limit 20
    );

  return snapshot_id;
end;
$$;

-- Devuelve cuántas actividades quedaron, o null si no había nada para deshacer.
create function public.restore_itinerary_snapshot(p_trip_id uuid)
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

  delete from public.itinerary_items where trip_id = p_trip_id;
  insert into public.itinerary_items
  select * from jsonb_populate_recordset(null::public.itinerary_items, snap.items);
  get diagnostics restored = row_count;

  delete from public.itinerary_snapshots where id = snap.id;
  return restored;
end;
$$;
