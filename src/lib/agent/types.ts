export type Place = {
  id: string
  name: string
  category: string
  tags: string[]
  description: string | null
  lat: number
  lng: number
  rating: number | null
  typical_visit_minutes: number
}
