-- Rumbo: un aviso por lugar (C-6)
-- El motor de cercanía nunca avisa dos veces del mismo lugar. Corre en cada ping (cada
-- 5 s), así que dos pings casi juntos podrían insertar el mismo aviso: el índice lo impide
-- y el motor inserta con "on conflict do nothing".
create unique index notifications_user_place_key on public.notifications (user_id, place_id);
