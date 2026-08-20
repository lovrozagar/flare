import "@solidjs/web";
import type { Sx } from "../styles/sx-types";

declare module "@solidjs/web" {
	namespace JSX {
		interface HTMLAttributes<T> {
			sx?: Sx;
		}
		interface SVGAttributes<T> {
			sx?: Sx;
		}
	}
}
