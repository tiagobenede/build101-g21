import { notFound } from "next/navigation"

import { GenUiGallery } from "./gallery"

/** Galería de los componentes generativos con datos de ejemplo. Solo en desarrollo. */
export default function GenUiGalleryPage() {
  if (process.env.NODE_ENV !== "development") notFound()
  return <GenUiGallery />
}
