import "@solidjs/web";

declare module "@solidjs/web" {
	namespace JSX {
		interface HTMLAttributes<T> {
			css?: string;
		}
		interface SVGAttributes<T> {
			css?: string;
		}
	}
}
