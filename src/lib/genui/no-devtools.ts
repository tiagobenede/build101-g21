/**
 * En desarrollo, @openuidev/react-lang monta solo un widget de devtools que baja
 * código de un CDN y lo ejecuta en la app (y muestra un cartel de deploy).
 * Marcamos la bandera que usa para no montarlo. Importar ANTES que react-lang.
 */
const flags = globalThis as Record<symbol, unknown>
flags[Symbol.for("openui.devtools.autoMount")] = true

export {}
