import type { ClassValue, Sx } from "../styles/sx-types"

declare module "solid-js" {
	namespace JSX {
		interface HTMLAttributes<T> {
			sx?: Sx
			class?: string | ClassValue[]
		}
		interface CoreSVGAttributes<T> {
			sx?: Sx
			class?: string | ClassValue[]
		}
	}
}
