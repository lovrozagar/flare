import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import mkcert from "vite-plugin-mkcert"
import solid from "vite-plugin-solid"

export default defineConfig({
  plugins: [solid(), tailwindcss(), mkcert()],
  server: { port: 4099, https: true },
})
