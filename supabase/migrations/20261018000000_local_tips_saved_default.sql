-- Rumbo: las recomendaciones de personas locales se guardan solas
-- Toda recomendación que el viajero no descarta queda guardada y avisa al pasar cerca
-- (C-6). Antes el valor por defecto era 'pending' y había que guardarla a mano.
alter table public.local_tips alter column status set default 'saved';
update public.local_tips set status = 'saved' where status = 'pending';
