import {
  BookOpenIcon,
  CarIcon,
  ChurchIcon,
  CoffeeIcon,
  CroissantIcon,
  LandmarkIcon,
  MapPinIcon,
  ShoppingBagIcon,
  ShoppingBasketIcon,
  TreesIcon,
  UtensilsIcon,
  type LucideIcon,
} from "lucide-react"

import { cn } from "@/lib/utils"

/** Ícono y color por categoría, al estilo de los íconos de Ajustes de iOS. */
const CATEGORIES: Record<string, { icon: LucideIcon; color: string }> = {
  Museo: { icon: LandmarkIcon, color: "#FF9500" },
  Monumento: { icon: ChurchIcon, color: "#5856D6" },
  Paseo: { icon: CarIcon, color: "#007AFF" },
  Plaza: { icon: TreesIcon, color: "#34C759" },
  Parque: { icon: TreesIcon, color: "#34C759" },
  Mercado: { icon: ShoppingBasketIcon, color: "#FF3B30" },
  Restaurante: { icon: UtensilsIcon, color: "#FF3B30" },
  Panadería: { icon: CroissantIcon, color: "#A2845E" },
  Café: { icon: CoffeeIcon, color: "#A2845E" },
  Librería: { icon: BookOpenIcon, color: "#32ADE6" },
  Pasaje: { icon: ShoppingBagIcon, color: "#FF2D55" },
}

const FALLBACK = { icon: MapPinIcon, color: "#8E8E93" }

export function CategoryIcon({ category, className }: { category: string; className?: string }) {
  const { icon: Icon, color } = CATEGORIES[category] ?? FALLBACK
  return (
    <span
      className={cn("flex size-9 shrink-0 items-center justify-center rounded-[10px] text-white", className)}
      style={{ backgroundColor: color }}
    >
      <Icon className="size-[18px]" strokeWidth={2.2} />
    </span>
  )
}
