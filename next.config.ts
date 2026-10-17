import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Dev server blocks non-localhost origins; allow ngrok tunnels.
  allowedDevOrigins: [
    "*.ngrok-free.app",
    "*.ngrok-free.dev",
    "*.ngrok.app",
    "*.ngrok.dev",
    "*.ngrok.io",
  ],
  // Para probar en el celular por un túnel (un solo dominio): el navegador le habla a
  // Supabase por /supabase y Next lo reenvía al Supabase local, WebSockets incluidos.
  // Ver browserSupabaseUrl() en src/lib/supabase/env.ts.
  async rewrites() {
    return process.env.NODE_ENV === "development"
      ? [{ source: "/supabase/:path*", destination: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/:path*` }]
      : []
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
