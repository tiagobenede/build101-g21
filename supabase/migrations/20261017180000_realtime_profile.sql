-- La llamada abierta se entera cuando cambian los gustos o las restricciones
-- ("Editar mis gustos", o el agente con `remember`) y rearma sus instrucciones.
alter publication supabase_realtime add table public.profiles, public.interests;
