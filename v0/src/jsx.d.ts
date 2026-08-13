/**
 * Flare JSX Type Extensions
 *
 * Extends Solid's JSX types with flare-specific props:
 * - css: Scoped inline CSS (transforms to data-c attribute)
 * - tw: Tailwind classes (transforms to css at build time)
 */

import "solid-js"

declare module "solid-js" {
	namespace JSX {
		interface HTMLAttributes<T> {
			/** Scoped inline CSS - transformed to data-c={registerCSS(...)} */
			css?: string
			/** Tailwind classes - transformed to css at build time */
			tw?: string
		}

		interface SVGAttributes<T> {
			/** Scoped inline CSS - transformed to data-c={registerCSS(...)} */
			css?: string
			/** Tailwind classes - transformed to css at build time */
			tw?: string
		}

		interface DOMAttributes<T> {
			/** Scoped inline CSS - transformed to data-c={registerCSS(...)} */
			css?: string
			/** Tailwind classes - transformed to css at build time */
			tw?: string
		}
	}
}

export { JSX } from "solid-js"
