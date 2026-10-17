-- Datos de demo: 3 cuentas predefinidas y viaje a París.
-- Password de todas las cuentas demo: ver DEMO_PASSWORD en .env.example

-- ---------------------------------------------------------------------------
-- Usuarios (auth.users + auth.identities)
-- ---------------------------------------------------------------------------
do $$
declare
  demo_users jsonb := '[
    {"id":"11111111-1111-4111-8111-111111111111","email":"tiago@rumbo.demo"},
    {"id":"22222222-2222-4222-8222-222222222222","email":"lucas@rumbo.demo"},
    {"id":"33333333-3333-4333-8333-333333333333","email":"nicolas@rumbo.demo"},
    {"id":"44444444-4444-4444-8444-444444444444","email":"nuevo@rumbo.demo"}
  ]';
  u jsonb;
begin
  for u in select * from jsonb_array_elements(demo_users) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', (u->>'id')::uuid, 'authenticated', 'authenticated',
      u->>'email', extensions.crypt('rumbo-demo-2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), (u->>'id')::uuid, u->>'id',
      jsonb_build_object('sub', u->>'id', 'email', u->>'email', 'email_verified', true),
      'email', now(), now(), now()
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Perfiles y gustos
-- ---------------------------------------------------------------------------
insert into public.profiles (id, full_name, home_city, travel_style, onboarded_at) values
  ('11111111-1111-4111-8111-111111111111', 'Tiago',   'Montevideo', 'Curioso, camina todo, ama los fierros', now()),
  ('22222222-2222-4222-8222-222222222222', 'Lucas',   'Buenos Aires', 'Museos, historia y librerías', now()),
  ('33333333-3333-4333-8333-333333333333', 'Nicolas',  'Santiago', 'Foodie, mercados y parques', now()),
  -- Primer login: sin gustos ni onboarding (al entrar se resetea, ver loginAsDemo).
  ('44444444-4444-4444-8444-444444444444', 'Alex Romero',   'Montevideo', null, null);

insert into public.interests (user_id, tag) values
  ('11111111-1111-4111-8111-111111111111', 'autos'),
  ('11111111-1111-4111-8111-111111111111', 'diseño'),
  ('11111111-1111-4111-8111-111111111111', 'arquitectura'),
  ('11111111-1111-4111-8111-111111111111', 'café'),
  ('22222222-2222-4222-8222-222222222222', 'arte'),
  ('22222222-2222-4222-8222-222222222222', 'historia'),
  ('22222222-2222-4222-8222-222222222222', 'libros'),
  ('33333333-3333-4333-8333-333333333333', 'comida'),
  ('33333333-3333-4333-8333-333333333333', 'mercados'),
  ('33333333-3333-4333-8333-333333333333', 'parques'),
  ('33333333-3333-4333-8333-333333333333', 'café');

-- ---------------------------------------------------------------------------
-- Viajes (relativos a hoy, para que la demo siempre esté "en viaje")
-- ---------------------------------------------------------------------------
insert into public.trips (id, user_id, destination, country, lat, lng, start_date, end_date) values
  ('aaaaaaa1-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'París', 'Francia', 48.8606, 2.3522, current_date - 2, current_date + 5),
  ('aaaaaaa1-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'París', 'Francia', 48.8606, 2.3522, current_date - 1, current_date + 3),
  ('aaaaaaa1-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'París', 'Francia', 48.8606, 2.3522, current_date,     current_date + 6),
  ('aaaaaaa1-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444', 'París', 'Francia', 48.8606, 2.3522, current_date,     current_date + 4);

insert into public.itinerary_items (trip_id, title, notes, starts_at, ends_at, lat, lng) values
  ('aaaaaaa1-0000-4000-8000-000000000001', 'Almuerzo con amigos', 'Le Marais',
   (date_trunc('day', now() at time zone 'Europe/Paris') + interval '13 hours') at time zone 'Europe/Paris', (date_trunc('day', now() at time zone 'Europe/Paris') + interval '14 hours 30 minutes') at time zone 'Europe/Paris', 48.8578, 2.3622),
  ('aaaaaaa1-0000-4000-8000-000000000001', 'Tour guiado Torre Eiffel', 'Llegar 15 min antes',
   (date_trunc('day', now() at time zone 'Europe/Paris') + interval '17 hours') at time zone 'Europe/Paris', (date_trunc('day', now() at time zone 'Europe/Paris') + interval '19 hours') at time zone 'Europe/Paris', 48.8584, 2.2945),
  -- Lucas, guion de la demo: después del Louvre tiene esto a ~22 min a pie; lo que Polo le
  -- proponga en el medio tiene que quedarle de camino (docs/pitch/casos-jurado.md).
  ('aaaaaaa1-0000-4000-8000-000000000002', 'Encuentro con amigos en el Jardin du Luxembourg', 'Fontaine Médicis',
   (date_trunc('day', now() at time zone 'Europe/Paris') + interval '18 hours') at time zone 'Europe/Paris', (date_trunc('day', now() at time zone 'Europe/Paris') + interval '19 hours 30 minutes') at time zone 'Europe/Paris', 48.8484, 2.3404),
  ('aaaaaaa1-0000-4000-8000-000000000003', 'Clase de cocina francesa', 'Traer delantal',
   (date_trunc('day', now() at time zone 'Europe/Paris') + interval '18 hours') at time zone 'Europe/Paris', (date_trunc('day', now() at time zone 'Europe/Paris') + interval '20 hours') at time zone 'Europe/Paris', 48.8650, 2.3600);

-- Los puntos de interés no van en el seed: vienen de Google Places y se guardan en
-- `places` la primera vez que alguien abre la app cerca (src/lib/places/nearby.ts).
