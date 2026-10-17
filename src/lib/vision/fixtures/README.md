Imágenes para `npm run test:vision` (src/lib/vision/identify.e2e.test.ts).

- `no-es-un-lugar.jpg`: círculo rojo generado a propósito; Jev tiene que decir "ninguno".
- `capitolio-eeuu.jpg`: fachada oeste del Capitolio de EE. UU., versión de 1280 px de
  [United States Capitol west front edit2.jpg](https://commons.wikimedia.org/wiki/File:United_States_Capitol_west_front_edit2.jpg)
  (Wikimedia Commons, dominio público; Architect of the Capitol).
  Correr con `VISION_LAT=38.8899 VISION_LNG=-77.0091 VISION_CITY=Washington`.
- `place-des-vosges.jpg`: Place des Vosges, París. Foto de **Diego Delso**, licencia
  [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), versión de 1280 px de
  [Plaza de los Vosgos, París, Francia, 2022-10-30, DD 58.jpg](https://commons.wikimedia.org/wiki/File:Plaza_de_los_Vosgos,_Par%C3%ADs,_Francia,_2022-10-30,_DD_58.jpg).
  Es la del "Terminado" de C-3: correr con la ubicación por defecto (Place des Vosges).
- `torre-eiffel.jpg`: Torre Eiffel, foto de **Benh LIEU SONG**, licencia
  [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/), versión de 1280 px de
  [Tour Eiffel Wikimedia Commons.jpg](https://commons.wikimedia.org/wiki/File:Tour_Eiffel_Wikimedia_Commons.jpg).
  Con `VISION_LAT=48.8556 VISION_LNG=2.2986` (Champ de Mars) Jev elige el parque y tiene que ganar el LLM.
- `gioconda.jpg`: La Gioconda, de Leonardo da Vinci (dominio público), versión de 1280 px de
  [Mona Lisa, by Leonardo da Vinci, from C2RMF retouched.jpg](https://commons.wikimedia.org/wiki/File:Mona_Lisa,_by_Leonardo_da_Vinci,_from_C2RMF_retouched.jpg).
  Con `VISION_LAT=48.8606 VISION_LNG=2.3376` (adentro del Louvre) tiene que dar la obra, no el museo.
