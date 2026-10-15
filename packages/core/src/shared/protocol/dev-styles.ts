// The dev styles round trip on a server environment's hot channel (B104). The server sends the matched chain's route
// ids with a request number; the dev server answers that number with each CSS module the chain imports, in import
// order, as Vite serves it.
export const STYLES_EVENT = "flare:styles"

// `id` is the module id Vite's client keys a style by (`data-vite-dev-id`), so the client adopts the server's style.
export type DevStyle = { id: string; css: string }

export type StylesRequest = { request: number; routes: string[] }

export type StylesReply = { request: number; styles: DevStyle[] }

// The parts of a reply that are well formed. Anything else is no styles.
export function stylesReply(value: unknown): StylesReply | undefined {
	const request: unknown = Reflect.get(Object(value), "request")
	const styles: unknown = Reflect.get(Object(value), "styles")
	if (typeof request !== "number" || !Array.isArray(styles)) return undefined
	return { request, styles: styles.filter(isStyle) }
}

export function stylesRequest(value: unknown): StylesRequest | undefined {
	const request: unknown = Reflect.get(Object(value), "request")
	const routes: unknown = Reflect.get(Object(value), "routes")
	if (typeof request !== "number" || !Array.isArray(routes)) return undefined
	return { request, routes: routes.filter((route): route is string => typeof route === "string") }
}

function isStyle(value: unknown): value is DevStyle {
	return typeof Reflect.get(Object(value), "id") === "string" && typeof Reflect.get(Object(value), "css") === "string"
}
