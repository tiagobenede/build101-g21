/**
 * Prueba de punta a punta de C-3 contra las APIs reales (Google Places, Jev, OpenAI)
 * y la base local. Cuesta plata, así que está apagada por defecto:
 *
 *   npm run test:vision                                  # imagen que no es ningún lugar
 *   VISION_PHOTO=~/fotos/vosges.jpg npm run test:vision  # una foto tuya (JPEG o PNG)
 *
 * Opcional: VISION_LAT / VISION_LNG / VISION_CITY (por defecto, Place des Vosges en París).
 * Ejemplo con el Capitolio de EE. UU.:
 *
 *   VISION_PHOTO=src/lib/vision/fixtures/capitolio-eeuu.jpg VISION_LAT=38.8899 VISION_LNG=-77.0091 VISION_CITY=Washington npm run test:vision
 *
 * VISION_DECOYS=1 suma una prueba de confiabilidad de Jev con señuelos (lugares famosos que
 * no están en la foto, algunos muy parecidos): A) el lugar real mezclado con señuelos tiene
 * que ganar; B) solo señuelos, tiene que decir "ninguno". Muestra la probabilidad de cada opción.
 */
import { readFileSync } from "node:fs"
import { homedir } from "node:os"

import { describe, expect, it, vi } from "vitest"

import type { NearbyPlace } from "@/lib/data/session"

vi.mock("server-only", () => ({}))
// supabase-js pide WebSocket al crear el cliente; Node 20 no lo trae y acá no usamos Realtime.
;(globalThis as { WebSocket?: unknown }).WebSocket ??= class {}

const enabled = process.env.VISION_E2E === "1"
if (enabled) process.loadEnvFile(".env.local")

const city = process.env.VISION_CITY ?? "París"
const here = { lat: Number(process.env.VISION_LAT ?? 48.8556), lng: Number(process.env.VISION_LNG ?? 2.3655) }
const photoPath = (process.env.VISION_PHOTO ?? "src/lib/vision/fixtures/no-es-un-lugar.jpg").replace(/^~/, homedir())
const photo = () => ({
  bytes: new Uint8Array(readFileSync(photoPath)),
  mime: photoPath.toLowerCase().endsWith(".png") ? ("image/png" as const) : ("image/jpeg" as const),
})

/** Lugares de Google alrededor de `at`, como los arma getTravelerContext. */
async function loadNearby(at = here, cityName = city): Promise<NearbyPlace[]> {
  const { ensureNearbyPlaces } = await import("@/lib/places/nearby")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const { distanceMeters, walkMinutes } = await import("@/lib/geo")

  await ensureNearbyPlaces(at, cityName)
  const { data, error } = await createAdminClient()
    .from("places")
    .select("id, name, category, tags, description, lat, lng, rating, typical_visit_minutes")
    .eq("city", cityName)
    .eq("listed", true)
  if (error) throw new Error(error.message)
  return data
    .map((p) => ({ ...p, distanceMeters: distanceMeters(at, p), walkMinutes: walkMinutes(at, p) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
}

/** Lugares famosos que no son los de la foto. Los primeros cuatro se parecen a un capitolio. */
const DECOYS: [name: string, category: string, description: string][] = [
  ["Capitolio del Estado de Texas", "Monumento", "Capitolio estatal en Austin, con cúpula y fachada de granito rosado."],
  ["Capitolio de La Habana", "Monumento", "Edificio con gran cúpula blanca y escalinata, inspirado en el Capitolio de Washington."],
  ["Panteón de París", "Monumento", "Mausoleo neoclásico con cúpula y pórtico de columnas en el Barrio Latino."],
  ["Casa Blanca", "Monumento", "Residencia del presidente de EE. UU.: edificio neoclásico blanco con pórtico de columnas."],
  ["Empire State Building", "Rascacielos", "Rascacielos art déco de 102 pisos en Manhattan, Nueva York."],
  ["Monumento a Lincoln", "Monumento", "Templo neoclásico con columnas dóricas y la estatua de Lincoln sentado."],
]

const decoyPlaces = (): NearbyPlace[] =>
  DECOYS.map(([name, category, description], i) => ({
    id: `decoy:${i}`,
    name,
    category,
    tags: [],
    description,
    lat: here.lat,
    lng: here.lng,
    rating: null,
    typical_visit_minutes: 30,
    // Más "cerca" que los reales, para que vayan primero en la lista de opciones.
    distanceMeters: i,
    walkMinutes: 1,
  }))

describe.skipIf(!enabled)("identifyPhoto (e2e, APIs reales)", () => {
  it("identifica la foto", async () => {
    const { nearestPlaceLabel } = await import("@/lib/geo")
    const { identifyPhoto } = await import("./identify")
    const { pickCandidates } = await import("./choose")

    const nearby = await loadNearby()
    // Lo mínimo de TravelerContext que usa identifyPhoto.
    const ctx = {
      nearby,
      location: here,
      locationLabel: nearestPlaceLabel(here, nearby, city),
      trip: { destination: city },
    } as unknown as Parameters<typeof identifyPhoto>[1]

    console.log(`\nFoto: ${photoPath}`)
    console.log(`Ubicación: ${ctx.locationLabel} (${here.lat}, ${here.lng})`)
    console.log(`Candidatos para Jev (≤ 250 m): ${pickCandidates(nearby).map((p) => `${p.name} (${Math.round(p.distanceMeters)} m)`).join(", ") || "ninguno"}`)

    const started = Date.now()
    const result = await identifyPhoto(photo(), ctx)
    console.log(`\nRespondió: ${result.via === "jev" ? "Jev" : "LLM de respaldo"} en ${Date.now() - started} ms`)
    console.log(JSON.stringify(result, null, 2))

    expect(["jev", "llm"]).toContain(result.via)
  }, 30_000)

  it.runIf(process.env.VISION_DECOYS === "1")("Jev con señuelos", async () => {
    const { nearestPlaceLabel } = await import("@/lib/geo")
    const { askJev } = await import("./jev")
    const { buildJevOptions, MAX_CANDIDATES, NONE_KEY, pickCandidates, readJevChoice } = await import("./choose")

    const real = pickCandidates(await loadNearby())
    const label = nearestPlaceLabel(here, real, city)

    const run = async (title: string, candidates: NearbyPlace[]) => {
      const { criteria, places } = buildJevOptions(candidates)
      const started = Date.now()
      const answer = await askJev(photo(), label, criteria)
      const ms = Date.now() - started
      const nameOf = (key: string) => (key === NONE_KEY ? "(ninguno)" : places.get(key)!.name)
      const rows = Object.entries(answer.probabilities ?? {})
        .sort(([, a], [, b]) => b - a)
        .map(([key, prob]) => `  ${(prob * 100).toFixed(1).padStart(5)}%  ${nameOf(key)}${key === answer.choice ? "  ← elegida" : ""}`)
      const picked = readJevChoice(answer, places)
      console.log(`\n${title} (${candidates.length} lugares + "ninguno", ${ms} ms, confianza ${answer.confidence.toFixed(2)})`)
      console.log(rows.join("\n"))
      console.log(`  → identifyPhoto usaría: ${picked ? picked.place.name : "el LLM de respaldo"}`)
      return picked
    }

    console.log(`\nFoto: ${photoPath} | ubicación: ${label}`)
    // A: los reales (hasta 2) mezclados con señuelos, sin pasar el máximo que usa la app.
    const mixed = [...decoyPlaces().slice(0, MAX_CANDIDATES - Math.min(real.length, 2)), ...real.slice(0, 2)]
    const a = await run("A) Lugar real + señuelos", mixed)
    // B: solo señuelos.
    const b = await run("B) Solo señuelos (el lugar real no está)", decoyPlaces())

    expect(a?.place.id).toBe(real[0]?.id)
    expect(b).toBeNull()
  }, 30_000)

  /**
   * VISION_BATTERY=1: 10 casos con fotos reales, variantes difíciles (noche, recorte, baja
   * resolución, blanco y negro, espejo) y casos adversariales (la foto en otra ciudad, una
   * imagen que no es un lugar). Cada uno pasa por identifyPhoto como en la app.
   */
  it.runIf(process.env.VISION_BATTERY === "1")("batería de 10 casos", async () => {
    const { default: sharp } = await import("sharp")
    const { nearestPlaceLabel } = await import("@/lib/geo")
    const { identifyPhoto } = await import("./identify")

    const VOSGES = { at: { lat: 48.8556, lng: 2.3655 }, city: "París" }
    const CAPITOL = { at: { lat: 38.8899, lng: -77.0091 }, city: "Washington" }
    const file = (name: string) => readFileSync(`src/lib/vision/fixtures/${name}`)
    const vosges = file("place-des-vosges.jpg") // 1280×853
    const capitol = file("capitolio-eeuu.jpg") // 1280×663
    const jpeg = (img: ReturnType<typeof sharp>) => img.jpeg({ quality: 85 }).toBuffer()

    type Expected = { via: "jev" | "llm"; name: RegExp | null }
    const cases: { title: string; where: typeof VOSGES; png?: boolean; photo: () => Promise<Buffer>; expected: Expected }[] = [
      { title: "Place des Vosges, original", where: VOSGES, photo: async () => vosges, expected: { via: "jev", name: /vosg/i } },
      { title: "Place des Vosges, de noche", where: VOSGES, photo: () => jpeg(sharp(vosges).modulate({ brightness: 0.3, saturation: 0.6 })), expected: { via: "jev", name: /vosg/i } },
      { title: "Place des Vosges, recorte del centro", where: VOSGES, photo: () => jpeg(sharp(vosges).extract({ left: 352, top: 234, width: 576, height: 384 })), expected: { via: "jev", name: /vosg/i } },
      { title: "Place des Vosges, PNG de 400 px", where: VOSGES, png: true, photo: () => sharp(vosges).resize(400).png().toBuffer(), expected: { via: "jev", name: /vosg/i } },
      { title: "Place des Vosges, blanco y negro y borrosa", where: VOSGES, photo: () => jpeg(sharp(vosges).grayscale().blur(3)), expected: { via: "jev", name: /vosg/i } },
      { title: "Place des Vosges, espejada", where: VOSGES, photo: () => jpeg(sharp(vosges).flop()), expected: { via: "jev", name: /vosg/i } },
      { title: "Capitolio, original", where: CAPITOL, photo: async () => capitol, expected: { via: "jev", name: /capitol/i } },
      { title: "Capitolio, recorte de la cúpula", where: CAPITOL, photo: () => jpeg(sharp(capitol).extract({ left: 440, top: 0, width: 400, height: 330 })), expected: { via: "jev", name: /capitol/i } },
      // La cámara es en vivo: este caso solo pasa con una foto de una pantalla o un póster.
      { title: "Capitolio, pero el GPS dice París", where: VOSGES, photo: async () => capitol, expected: { via: "llm", name: /capitol/i } },
      { title: "No es un lugar, en Place des Vosges", where: VOSGES, photo: async () => file("no-es-un-lugar.jpg"), expected: { via: "llm", name: null } },
    ]

    const nearbyByCity = new Map<string, NearbyPlace[]>()
    const rows: string[] = []
    let failures = 0

    for (const [i, c] of cases.entries()) {
      let nearby = nearbyByCity.get(c.where.city)
      if (!nearby) nearbyByCity.set(c.where.city, (nearby = await loadNearby(c.where.at, c.where.city)))
      const ctx = {
        nearby,
        location: c.where.at,
        locationLabel: nearestPlaceLabel(c.where.at, nearby, c.where.city),
        trip: { destination: c.where.city },
      } as unknown as Parameters<typeof identifyPhoto>[1]

      const bytes = new Uint8Array(await c.photo())
      const started = Date.now()
      const r = await identifyPhoto({ bytes, mime: c.png ? "image/png" : "image/jpeg" }, ctx)
      const ms = Date.now() - started

      const nameOk = c.expected.name === null ? r.name === null : r.name !== null && c.expected.name.test(r.name)
      const ok = r.via === c.expected.via && nameOk && ms < 5_000
      if (!ok) failures++
      const conf = r.confidence === null ? "" : ` ${r.confidence.toFixed(2)}`
      rows.push(
        `${ok ? "✓" : "✗"} ${String(i + 1).padStart(2)}. ${c.title.padEnd(42)} ${`${r.via}${conf}`.padEnd(9)} ${String(ms).padStart(5)} ms  → ${r.name ?? "null"}`
      )
    }

    console.log(`\n${rows.join("\n")}\n\n${cases.length - failures}/${cases.length} correctos`)
    expect(failures).toBe(0)
  }, 120_000)
})
