/**
 * Perillas de visión (C-3) y avisos por cercanía (C-6), todas en un lugar.
 *
 * Para probar otro valor sin tocar código, poné la variable en `.env.local` y reiniciá
 * `npm run dev` (por ejemplo `TUNE_NOTIFY_RADIUS_M=200`). Para cambiarlo para todos,
 * cambiá el valor por defecto acá. Si la variable no es un número válido, se usa el
 * valor por defecto.
 */

function num(envVar: string, fallback: number): number {
  const raw = process.env[envVar]
  if (raw === undefined || raw.trim() === "") return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

/** Cuánto camina como mucho lo que recomienda el agente (src/lib/agent). */
export const WALK = {
  /** "Cerca", "por acá" y comida o café: más que esto ya no es cerca. */
  nearMinutes: num("TUNE_WALK_NEAR_MIN", 10),
  /** Qué hacer o adónde ir, sin decir cuánto quiere caminar. */
  defaultMaxMinutes: num("TUNE_WALK_DEFAULT_MAX_MIN", 20),
} as const

/** "¿Qué estoy viendo?" (C-3, src/lib/vision). */
export const VISION = {
  /** Lugares a esta distancia de la foto se le ofrecen a Jev como opciones. */
  candidateRadiusMeters: num("TUNE_VISION_RADIUS_M", 250),
  /** Cuántos lugares cercanos se le pasan a Jev como mucho (los más cercanos). */
  maxCandidates: num("TUNE_VISION_MAX_OPTIONS", 8),
  /** Confianza mínima de Jev para dar el lugar por bueno; por debajo responde el LLM. */
  minJevConfidence: num("TUNE_VISION_MIN_CONFIDENCE", 0.5),
  /** Tiempo máximo esperando a Jev antes de pasar al LLM. */
  jevTimeoutMs: num("TUNE_VISION_JEV_TIMEOUT_MS", 6_000),
  /** Tiempo máximo esperando al LLM de respaldo. */
  llmTimeoutMs: num("TUNE_VISION_LLM_TIMEOUT_MS", 12_000),
} as const

/** Avisos por cercanía (C-6, src/lib/proximity). */
export const PROXIMITY = {
  /** Recomendaciones de residentes y actividades del plan: a esta distancia se avisa. */
  notifyRadiusMeters: num("TUNE_NOTIFY_RADIUS_M", 150),
  /** Lugares por gustos: los que estén a esta distancia van a Jev como opciones. */
  interestRadiusMeters: num("TUNE_INTEREST_RADIUS_M", 100),
  /** Confianza mínima de Jev para avisar de un lugar por gustos. */
  minInterestConfidence: num("TUNE_INTEREST_MIN_CONFIDENCE", 0.6),
  /** Lugares por gustos con menos reseñas en Google no se avisan (fichas duplicadas o vacías). */
  minInterestReviews: num("TUNE_INTEREST_MIN_REVIEWS", 50),
  /** Un lugar a esta distancia de otro mucho más conocido es parte de ese (una sala de un museo). */
  samePointMeters: num("TUNE_INTEREST_SAME_POINT_M", 25),
  /** Hasta esta distancia, un lugar de la misma categoría y con una palabra del nombre de otro mucho
   * más conocido es parte de ese ("Musée du Louvre - Galerie des Antiquités" del Louvre). */
  partOfMeters: num("TUNE_INTEREST_PART_OF_M", 300),
  /** Cuántos lugares por gustos se le pasan a Jev como mucho (los más cercanos). */
  maxInterestOptions: num("TUNE_INTEREST_MAX_OPTIONS", 8),
  /** Pausa mínima entre dos avisos (1 min para la demo; en un viaje real, más). */
  cooldownSeconds: num("NOTIFY_COOLDOWN_SECONDS", 60),
  /** Si la próxima reserva empieza en menos de estos minutos, solo se avisa de esa. */
  lockedGuardMinutes: num("TUNE_LOCKED_GUARD_MIN", 20),
  /** Con las mismas opciones, no se le vuelve a preguntar a Jev en estos minutos. */
  jevRepeatMinutes: num("TUNE_INTEREST_JEV_REPEAT_MIN", 10),
  /** Tiempo máximo esperando a Jev (si tarda, no se avisa nada por gustos). */
  jevTimeoutMs: num("TUNE_INTEREST_JEV_TIMEOUT_MS", 4_000),
} as const
