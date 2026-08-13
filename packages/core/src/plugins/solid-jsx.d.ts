import "solid-js"

declare module "solid-js" {
	namespace JSX {
		interface HTMLAttributes<T> {
			css?: string
		}
		interface CoreSVGAttributes<T> {
			css?: string
		}
	}
}
