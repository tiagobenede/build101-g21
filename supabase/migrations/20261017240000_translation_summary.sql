-- Resumen de la charla con el traductor: se arma al cerrarla y el agente lo recibe si
-- la llamada empieza poco después.
alter table public.conversations add column summary text;
