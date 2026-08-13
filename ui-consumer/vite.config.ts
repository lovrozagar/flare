import tailwindcss from "@tailwindcss/vite"
import { defineConfig } from "vite"
import solid from "vite-plugin-solid"

/* solid-refresh's HMR wrap collides with oxc's parser on TS function overloads
 * inside @solidports/base-ui. Disable HMR for that workspace package — its
 * source rarely changes during consumer dev anyway. */
export default defineConfig({
	plugins: [
		solid({
			hot: false,
		}),
		tailwindcss(),
	],
	server: { port: 4100 },
})
