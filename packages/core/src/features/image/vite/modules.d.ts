// An optimized image import opts in with `?image` and binds to the plugin's `{ src, width, height, variants }` (B88). A
// plain `./a.png` stays Vite's URL string, so this never collides with vite/client. `./vite` references this file.
type FlareImageBinding = {
	src: string
	width: number
	height: number
	variants: readonly { width: number; src: string }[]
}

declare module "*.avif?image" {
	const binding: FlareImageBinding
	export default binding
}

declare module "*.jpg?image" {
	const binding: FlareImageBinding
	export default binding
}

declare module "*.jpeg?image" {
	const binding: FlareImageBinding
	export default binding
}

declare module "*.png?image" {
	const binding: FlareImageBinding
	export default binding
}

declare module "*.tiff?image" {
	const binding: FlareImageBinding
	export default binding
}

declare module "*.webp?image" {
	const binding: FlareImageBinding
	export default binding
}
