/**
 * FlareState Test Factories
 *
 * Create FlareState objects for testing hydration, navigation, and SSR flows.
 */

import type { NavFormat } from "../../src/server/handler/constants"
import type {
	ContextState,
	DevError,
	FlareState,
	MatchState,
	QueryState,
} from "../../src/server/handler/flare-state"

/** Router defaults configuration */
interface RouterDefaults {
	gcTime?: number
	navFormat?: NavFormat
	prefetchIntent?: "hover" | "viewport" | false
	prefetchStaleTime?: number
	staleTime?: number
	viewTransitions?: boolean | { types: string[] }
}

/** Simple input for createFlareState */
interface FlareStateInput {
	context?: ContextState
	devErrors?: DevError[]
	matches?: Array<{ id: string; loaderData?: unknown; preloaderContext?: unknown }>
	params?: Record<string, string | string[]>
	pathname?: string
	queries?: QueryState[]
}

/**
 * Create a FlareState object with sensible defaults
 *
 * @example
 * const state = createFlareState({
 *   pathname: "/products/123",
 *   params: { id: "123" },
 *   matches: [
 *     { id: "_root_", loaderData: { user: "Alice" } },
 *     { id: "_root_/products/[id]", loaderData: { product: {} } },
 *   ],
 * })
 */
function createFlareState(input: FlareStateInput = {}): FlareState {
	const { context = {}, devErrors, matches = [], params = {}, pathname = "/", queries = [] } = input

	return {
		c: context,
		e: devErrors,
		q: queries,
		r: {
			matches: matches.map((m) => ({
				id: m.id,
				loaderData: m.loaderData ?? {},
				preloaderContext: m.preloaderContext,
			})),
			params,
			pathname,
		},
	}
}

/**
 * Fluent builder for complex FlareState scenarios
 *
 * @example
 * const state = new FlareStateBuilder()
 *   .withPathname("/dashboard")
 *   .addMatch("_root_", { user: { name: "Alice" } })
 *   .addMatch("_root_/dashboard", { stats: { views: 100 } })
 *   .withContext({ locale: "en-US" })
 *   .addQuery(["user", "1"], { name: "Alice" }, { staleTime: 60000 })
 *   .build()
 */
class FlareStateBuilder {
	private context: ContextState = {}
	private devErrors: DevError[] | undefined
	private matches: MatchState[] = []
	private params: Record<string, string | string[]> = {}
	private pathname = "/"
	private queries: QueryState[] = []

	withPathname(pathname: string): this {
		this.pathname = pathname
		return this
	}

	withParams(params: Record<string, string | string[]>): this {
		this.params = params
		return this
	}

	addMatch(id: string, loaderData: unknown = {}, preloaderContext?: unknown): this {
		this.matches.push({ id, loaderData, preloaderContext })
		return this
	}

	withMatches(matches: MatchState[]): this {
		this.matches = matches
		return this
	}

	withContext(context: ContextState): this {
		this.context = { ...this.context, ...context }
		return this
	}

	withRouterDefaults(defaults: RouterDefaults): this {
		this.context.routerDefaults = { ...this.context.routerDefaults, ...defaults }
		return this
	}

	withNavFormat(navFormat: NavFormat): this {
		this.context.routerDefaults = { ...this.context.routerDefaults, navFormat }
		return this
	}

	addQuery(key: unknown[], data: unknown, options?: { staleTime?: number }): this {
		this.queries.push({ data, key, staleTime: options?.staleTime })
		return this
	}

	withQueries(queries: QueryState[]): this {
		this.queries = queries
		return this
	}

	addDevError(error: DevError): this {
		if (!this.devErrors) this.devErrors = []
		this.devErrors.push(error)
		return this
	}

	build(): FlareState {
		return {
			c: this.context,
			e: this.devErrors,
			q: this.queries,
			r: {
				matches: this.matches,
				params: this.params,
				pathname: this.pathname,
			},
		}
	}
}

export type { FlareStateInput, RouterDefaults }

export { createFlareState, FlareStateBuilder }
