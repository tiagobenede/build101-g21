import { gsap } from "gsap"

const GREEN = "#34C759"
const BADGE = 104
const TICK_PATH = "M34 54 L47 67 L72 40"
const PATH_TIMEOUT_MS = 4_000

/** Respiro para que la home pinte antes del fade out. */
export const HOME_SETTLE_MS = 250

/** Espera a que el router haya cambiado de URL (o se rinde a los pocos segundos). */
export function waitForPath(path: string): Promise<void> {
  const deadline = performance.now() + PATH_TIMEOUT_MS
  return new Promise((resolve) => {
    const check = () => {
      if (window.location.pathname === path || performance.now() > deadline) resolve()
      else requestAnimationFrame(check)
    }
    check()
  })
}

export interface SuccessTransition {
  /** Se resuelve cuando el tick terminó de dibujarse. */
  shown: Promise<void>
  /** Fade out de todo y saca el overlay del DOM. */
  dismiss: () => Promise<void>
}

/** Recorte visible de la pantalla: rectángulo con esquinas redondeadas. */
interface Shape {
  top: number
  left: number
  width: number
  height: number
  radius: number
}

// Se arma a mano: el navegador colapsa `inset()` al serializarlo y GSAP no podría interpolarlo.
const clipOf = ({ top, left, width, height, radius }: Shape) =>
  `inset(${top}px ${window.innerWidth - left - width}px ${window.innerHeight - top - height}px ${left}px round ${radius}px)`

const centered = (size: number): Shape => ({
  top: window.innerHeight / 2 - size / 2,
  left: window.innerWidth / 2 - size / 2,
  width: size,
  height: size,
  radius: size / 2,
})

const fullScreen = (): Shape => ({ top: 0, left: 0, width: window.innerWidth, height: window.innerHeight, radius: 0 })

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag)
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v))
  return el
}

function buildOverlay(startColor: string) {
  const root = document.createElement("div")
  root.setAttribute("role", "status")
  root.setAttribute("aria-label", "Listo")
  Object.assign(root.style, { position: "fixed", inset: "0", zIndex: "9999" })

  // El color del botón abajo y el verde encima: el cambio de color es un crossfade.
  const fill = document.createElement("div")
  Object.assign(fill.style, { position: "absolute", inset: "0", background: startColor })
  const green = document.createElement("div")
  Object.assign(green.style, { position: "absolute", inset: "0", background: GREEN })
  fill.append(green)

  const svg = svgEl("svg", { viewBox: "0 0 104 104" })
  Object.assign(svg.style, {
    position: "absolute",
    width: `${BADGE}px`,
    height: `${BADGE}px`,
    top: "50%",
    left: "50%",
    marginTop: `${-BADGE / 2}px`,
    marginLeft: `${-BADGE / 2}px`,
    overflow: "visible",
  })
  const stroke = { fill: "none", stroke: "white", "stroke-linecap": "round", "stroke-linejoin": "round" }
  const ring = svgEl("circle", { ...stroke, cx: "52", cy: "52", r: "48", "stroke-width": "5" })
  const tick = svgEl("path", { ...stroke, d: TICK_PATH, "stroke-width": "8" })
  svg.append(ring, tick)

  root.append(fill, svg)
  document.body.append(root)
  return { root, fill, green, svg, ring, tick }
}

/**
 * Estilo "pedido confirmado": el botón se vuelve un círculo verde que viaja al centro,
 * inunda la pantalla y dibuja un tick. Vive fuera de React para sobrevivir al cambio de ruta.
 */
export function playSuccessTransition(origin: HTMLElement): SuccessTransition {
  const from = origin.getBoundingClientRect()
  const { root, fill, green, svg, ring, tick } = buildOverlay(getComputedStyle(origin).backgroundColor)
  const ringLen = ring.getTotalLength()
  const tickLen = tick.getTotalLength()
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches

  const shape: Shape = { top: from.top, left: from.left, width: from.width, height: from.height, radius: from.height / 2 }
  const paint = () => {
    fill.style.clipPath = clipOf(shape)
  }
  paint()

  gsap.set(ring, { strokeDasharray: ringLen, strokeDashoffset: ringLen })
  gsap.set(tick, { strokeDasharray: tickLen, strokeDashoffset: tickLen })
  gsap.set(svg, { scale: 0.6, autoAlpha: 0 })
  gsap.set(green, { autoAlpha: 0 })

  const shown = new Promise<void>((resolve) => {
    if (reduced) {
      fill.style.clipPath = "none"
      gsap.set(green, { autoAlpha: 1 })
      gsap.set([ring, tick], { strokeDashoffset: 0 })
      gsap.set(svg, { scale: 1, autoAlpha: 1 })
      gsap.fromTo(root, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, onComplete: resolve })
      return
    }
    const dot = { left: from.left + from.width / 2 - from.height / 2, width: from.height }
    gsap
      .timeline({ onComplete: resolve })
      // Pastilla → círculo verde en el lugar del botón.
      .to(shape, { ...dot, duration: 0.32, ease: "power2.inOut", onUpdate: paint })
      .to(green, { autoAlpha: 1, duration: 0.32, ease: "power1.out" }, "<")
      // Viaja al centro y crece al tamaño del badge.
      .to(shape, { ...centered(BADGE), duration: 0.45, ease: "power3.inOut", onUpdate: paint })
      // Inunda la pantalla.
      .to(shape, { ...fullScreen(), duration: 0.5, ease: "power3.in", onUpdate: paint })
      .to(svg, { scale: 1, autoAlpha: 1, duration: 0.45, ease: "back.out(2.2)" }, "-=0.1")
      .to(ring, { strokeDashoffset: 0, duration: 0.45, ease: "power2.out" }, "<")
      .to(tick, { strokeDashoffset: 0, duration: 0.35, ease: "power2.out" }, "-=0.15")
      .to(svg, { scale: 1.08, duration: 0.14, yoyo: true, repeat: 1, ease: "power1.inOut" })
  })

  const dismiss = () =>
    new Promise<void>((resolve) => {
      gsap.to(root, {
        autoAlpha: 0,
        duration: 0.5,
        ease: "power2.out",
        onComplete: () => {
          root.remove()
          resolve()
        },
      })
    })

  return { shown, dismiss }
}
