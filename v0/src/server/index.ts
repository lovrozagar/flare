/**
 * Flare Server - Public API
 *
 * Server-side rendering, middleware, and security utilities.
 */

/* Context */
export type { ServerRequestContextStore } from "./context"
export { getServerNonce, getServerRequest, getServerRequestContext } from "./context"

/* Handler */
export type {
	CspDirectives,
	ExecutionContext,
	FlareMiddleware,
	MiddlewareContext,
	MiddlewareResult,
	RouterDefaults,
	ServerHandler,
	ServerHandlerConfig,
} from "./handler"
export { createServerHandler } from "./handler"

/* Middleware helpers */
export { middlewareBypass, middlewareNext, middlewareRespond } from "./middleware"

/* Security */
export { DEFAULT_CSP_DIRECTIVES } from "./security"

/* Types for generated routes */
export interface GeneratedBoundary {
	boundaryType: "error" | "forbidden" | "notFound" | "streaming" | "unauthorized"
	component: () => Promise<{ default: unknown }>
	exportName: string
	path: string
	target: "layout" | "page"
}

export interface LayoutModule {
	default: unknown
}
