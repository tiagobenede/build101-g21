/**
 * Cuando recommend_nearby no tiene lugares guardados para el gusto pedido ("compras"
 * y no hay shoppings en caché), se busca en Google con una consulta por gusto. Puro.
 */

/** Consulta de Text Search para los gustos donde el nombre del tag busca mal. */
const QUERY_BY_TAG: Record<string, string> = {
  compras: "shopping centro comercial",
  comida: "restaurante",
  café: "café",
  libros: "librería",
  parques: "parque",
  mercados: "mercado",
  arte: "museo de arte",
  historia: "museo de historia",
  ciencia: "museo de ciencia",
  arquitectura: "edificio histórico",
  diseño: "tienda de diseño",
}

export const interestQuery = (tag: string): string => QUERY_BY_TAG[tag] ?? tag

/** Los resultados de la búsqueda cuentan como del gusto pedido (para el ranking). */
export function tagWithInterest<T extends { tags: string[] }>(places: T[], tag: string): T[] {
  return places.map((p) => (p.tags.includes(tag) ? p : { ...p, tags: [...p.tags, tag] }))
}
