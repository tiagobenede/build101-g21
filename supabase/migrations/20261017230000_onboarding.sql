-- Onboarding por voz: cuándo terminó (o lo salteó) el primer login. Sin fecha, la
-- home lo manda a /onboarding.
alter table public.profiles add column onboarded_at timestamptz;

-- Los perfiles que ya existen ya están configurados.
update public.profiles set onboarded_at = now() where onboarded_at is null;
