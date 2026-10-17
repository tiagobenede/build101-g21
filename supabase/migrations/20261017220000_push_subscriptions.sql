-- Rumbo: suscripciones a notificaciones push (Web Push)
-- Una fila por navegador en el que el viajero activó los avisos. El server manda el push
-- a todas las del usuario cuando el motor de cercanía (C-6) crea un aviso; si el servicio
-- de push responde que la suscripción ya no existe (404/410), se borra.
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null unique,     -- URL del servicio de push del navegador
  p256dh     text not null,            -- clave pública del navegador (cifra el mensaje)
  auth       text not null,            -- secreto de autenticación del navegador
  user_agent text,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "own push subscriptions" on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
