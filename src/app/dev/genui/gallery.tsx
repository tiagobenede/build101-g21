"use client"

import "@/lib/genui/no-devtools"

import { Renderer } from "@openuidev/react-lang"
import { useState } from "react"

import { GenUiEnvProvider, genUiLibrary, type GenUiEnv } from "@/components/genui/genui-library"
import { Button } from "@/components/ui/button"
import { GENUI_EXAMPLES } from "@/lib/genui/library"
import type { GenUiData, GenUiPlace } from "@/lib/genui/types"

type Defaults = "tags" | "description" | "photoUrl" | "openNow" | "hoursToday" | "closesAt" | "closesInMinutes"
const place = (p: Omit<GenUiPlace, Defaults> & Partial<GenUiPlace>): GenUiPlace => ({
  tags: [],
  description: null,
  photoUrl: null,
  openNow: null,
  hoursToday: null,
  closesAt: null,
  closesInMinutes: null,
  ...p,
})

// En la app la foto sale de Google (/api/places/photo); acá una de Wikimedia, para no pagar.
const PICASSO_PHOTO = "https://upload.wikimedia.org/wikipedia/commons/thumb/9/93/H%C3%B4tel_Sal%C3%A9.JPG/960px-H%C3%B4tel_Sal%C3%A9.JPG"

const VOSGES_PHOTO = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Place_des_Vosges_vue_a%C3%A9rienne.png/960px-Place_des_Vosges_vue_a%C3%A9rienne.png"

// El Marais: los mismos ids que usan los ejemplos del prompt.
const DATA: GenUiData = {
  origin: { lat: 48.8575, lng: 2.3592 },
  weather: "18° y nublado, sin lluvia",
  itineraryTitles: ["Clase de cocina"],
  story: {
    subject: "Museo Picasso",
    facts: [
      "Funciona en el Hôtel Salé, una mansión de 1659 construida para un recaudador del impuesto a la sal.",
      "Abrió en 1985 con obras que la familia de Picasso entregó al Estado para pagar impuestos de herencia.",
      "Tiene más de 5.000 obras: es la mayor colección pública de Picasso del mundo.",
    ],
    anecdote: "El nombre \"Salé\" (salado) fue una burla de los parisinos a la fortuna que el dueño hizo con la sal.",
  },
  seen: {
    name: "Place des Vosges",
    kind: "lugar",
    where: null,
    description: "La plaza planificada más antigua de París, de 1612, con 36 casas iguales alrededor.",
    placeId: "vosges",
    photoUrl: VOSGES_PHOTO,
  },
  phrase: {
    text: "Bonjour, un croissant et un café, s'il vous plaît.",
    translation: "Hola, un croissant y un café, por favor.",
    pronunciation: "bonyúr, an cruasán e an cafe, sil vu plé",
    lang: "fr-FR",
  },
  places: {
    picasso: place({ id: "picasso", name: "Museo Picasso", category: "Museo", photoUrl: PICASSO_PHOTO, openNow: true, closesAt: "18:00", closesInMinutes: 130, rating: 4.6, walkMinutes: 6, visitMinutes: 70, lat: 48.8599, lng: 2.3624 }),
    carnavalet: place({ id: "carnavalet", name: "Musée Carnavalet", category: "Museo", openNow: true, closesAt: "17:30", closesInMinutes: 35, rating: 4.7, walkMinutes: 4, visitMinutes: 60, lat: 48.8575, lng: 2.3625 }),
    vosges: place({ id: "vosges", name: "Place des Vosges", category: "Plaza", rating: 4.8, walkMinutes: 8, visitMinutes: 20, lat: 48.8556, lng: 2.3655 }),
    cafe: place({ id: "cafe", name: "Café Charlot", category: "Café", openNow: false, rating: 4.2, walkMinutes: 5, visitMinutes: 30, lat: 48.8627, lng: 2.3628 }),
    panaderia: place({ id: "panaderia", name: "Du Pain et des Idées", category: "Panadería", rating: 4.5, walkMinutes: 14, visitMinutes: 15, lat: 48.8713, lng: 2.3628 }),
  },
}

const SAMPLES: { title: string; note: string; lang: string; needsMap?: boolean }[] = [
  { title: "Say", note: "Frase corta arriba de todo.", lang: `root = Screen([s])\ns = Say("Con una hora te da justo para el Picasso.")` },
  { title: "PlaceHero", note: "LA recomendación principal.", lang: `root = Screen([h])\nh = PlaceHero("picasso", "Arte y tenés tiempo de sobra")` },
  { title: "PlaceHero sin foto", note: "Si Google no tiene foto, queda el color de la categoría.", lang: `root = Screen([h])\nh = PlaceHero("vosges", "La plaza más linda del Marais")` },
  { title: "PlaceList", note: "Alternativas: abierto, cierra pronto o cerrado según Google.", lang: `root = Screen([l])\nl = PlaceList(["carnavalet", "vosges", "cafe"])` },
  { title: "Compare", note: "Elegir entre 2 o 3 (verde = mejor).", lang: `root = Screen([c])\nc = Compare(["picasso", "carnavalet", "panaderia"])` },
  {
    title: "Timeline + Stop",
    note: "Plan con horarios; las fijas del itinerario llevan candado.",
    lang: `root = Screen([t])\nt = Timeline([a, b, c])\na = Stop("16:15", "picasso", null)\nb = Stop("17:25", "vosges", null)\nc = Stop("18:00", null, "Clase de cocina")`,
  },
  { title: "Weather", note: "Chip, solo si cambia la recomendación.", lang: `root = Screen([w])\nw = Weather()` },
  { title: "Phrase", note: "Frase para decirle a alguien; el botón la lee con la voz del sistema.", lang: `root = Screen([s, p])\ns = Say("Decilo así, tranqui.")\np = Phrase()` },
  { title: "Story", note: "Los datos y la anécdota de place_facts.", lang: `root = Screen([s, t])\ns = Say("El Picasso tiene historia.")\nt = Story()` },
  { title: "Seen", note: "Lo que reconoció la cámara, con tu foto.", lang: `root = Screen([v])\nv = Seen()` },
  { title: "RouteMap", note: "Caminata en el mapa (usa Google Maps + Routes).", lang: `root = Screen([m])\nm = RouteMap("picasso")`, needsMap: true },
  ...GENUI_EXAMPLES.map((lang, i) => ({
    title: `Pantalla completa ${i + 1}`,
    note: "Ejemplo del prompt, tal cual lo arma el modelo.",
    lang,
    needsMap: lang.includes("RouteMap"),
  })),
]

export function GenUiGallery() {
  const [log, setLog] = useState<string[]>([])
  const [mapsOn, setMapsOn] = useState(false)
  const env: GenUiEnv = {
    data: DATA,
    ask: (request, ids) => setLog((l) => [`ask("${request}", [${ids.join(", ")}])`, ...l].slice(0, 4)),
    addToPlan: (p) => setLog((l) => [`addToPlan(${p.name})`, ...l].slice(0, 4)),
  }

  return (
    <main className="bg-background mx-auto flex w-full max-w-md flex-col gap-8 px-4 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-[28px] font-bold">UI generativa</h1>
        <p className="text-muted-foreground text-[14px]">Componentes OpenUI con datos de ejemplo. Sin llamadas al modelo.</p>
        {log.length > 0 && (
          <pre className="bg-card mt-2 rounded-xl p-2 text-[11px] whitespace-pre-wrap">{log.join("\n")}</pre>
        )}
      </header>

      <GenUiEnvProvider value={env}>
        {SAMPLES.map((s) => (
          <section key={s.title} id={s.title} className="flex flex-col gap-2">
            <div>
              <h2 className="text-[13px] font-semibold tracking-wide uppercase">{s.title}</h2>
              <p className="text-muted-foreground text-[13px]">{s.note}</p>
            </div>
            {s.needsMap && !mapsOn ? (
              <Button variant="secondary" className="self-start rounded-full" onClick={() => setMapsOn(true)}>
                Cargar mapas (Google)
              </Button>
            ) : (
              <Renderer response={s.lang} library={genUiLibrary} isStreaming={false} />
            )}
            <details className="text-muted-foreground text-[11px]">
              <summary className="cursor-pointer">OpenUI Lang</summary>
              <pre className="mt-1 whitespace-pre-wrap">{s.lang}</pre>
            </details>
          </section>
        ))}
      </GenUiEnvProvider>
    </main>
  )
}
