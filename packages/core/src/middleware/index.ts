import type { FlareTracer } from "../tracing/types.ts"

export type ResponseHandler = (response: Response) => Response | Promise<Response>

export type MiddlewareResult =
	| { response: Response; type: "bypass" }
	| { response: Response; type: "respond" }
	| { type: "next" }

export type MiddlewareRunResult =
	| { response: Response; type: "bypass" }
	| { response: Response; type: "respond" }
	| { type: "next" }

export type RequestType = "internal" | "mount" | "page" | "server-fn"

export interface MiddlewareContext<TEnv = unknown> {
	bypass: (response: Response) => MiddlewareResult
	env: TEnv
	error: (...args: unknown[]) => void
	locale?: import("../locale").LocaleConfig
	log: (...args: unknown[]) => void
	next: () => Promise<MiddlewareResult>
	nonce: string
	onResponse: (handler: ResponseHandler) => void
	request: Request
	requestType: RequestType
	respond: (response: Response) => MiddlewareResult
	/** Present on live requests. Used by i18n to keep `/en/...` when the unprefixed path is not a route. */
	routeTree?: import("../router-primitives/types.ts").TreeNode
	serverContext: Record<string, unknown>
	url: URL
	warn: (...args: unknown[]) => void
}

export type FlareMiddleware<TEnv = unknown> = (
	ctx: MiddlewareContext<TEnv>,
) => Promise<MiddlewareResult>

export interface MiddlewareRunOutput {
	responseHandlers: ResponseHandler[]
	result: MiddlewareRunResult
}

const NEXT_RESULT: MiddlewareResult = Object.freeze({ type: "next" as const })

function bypassResult(response: Response): MiddlewareResult {
	return Object.freeze({ response, type: "bypass" as const })
}

function respondResult(response: Response): MiddlewareResult {
	return Object.freeze({ response, type: "respond" as const })
}

export async function runMiddlewares<TEnv = unknown>(
	middlewares: FlareMiddleware<TEnv>[],
	ctx: Omit<MiddlewareContext<TEnv>, "bypass" | "next" | "respond"> &
		Partial<Pick<MiddlewareContext<TEnv>, "bypass" | "next" | "respond">>,
	tracer?: FlareTracer,
): Promise<MiddlewareRunOutput> {
	const responseHandlers: ResponseHandler[] = []

	/* override onResponse to collect handlers, preserving ctx identity */
	ctx.onResponse = (handler) => {
		responseHandlers.push(handler)
	}

	ctx.bypass = bypassResult
	ctx.respond = respondResult

	/* After assigning flow-control methods, ctx satisfies the full interface */
	const fullCtx = ctx as MiddlewareContext<TEnv>

	if (middlewares.length === 0) {
		return { responseHandlers, result: { type: "next" } }
	}

	function buildChain(index: number): () => Promise<MiddlewareResult> {
		if (index >= middlewares.length) {
			return () => Promise.resolve(NEXT_RESULT)
		}
		let result: Promise<MiddlewareResult> | undefined
		return () => {
			if (result) return result
			const mw = middlewares[index]
			if (!mw) return Promise.resolve(NEXT_RESULT)
			fullCtx.next = buildChain(index + 1)
			if (tracer) {
				const span = tracer.startSpan(`flare.middleware.${index}`)
				span.setAttribute("index", index)
				result = mw(fullCtx).then(
					(r) => {
						span.end()
						return r
					},
					(e: unknown) => {
						span.setStatus("error")
						span.end()
						throw e
					},
				)
			} else {
				result = mw(fullCtx)
			}
			return result
		}
	}

	const result = await buildChain(0)()

	return { responseHandlers, result }
}

/* ── Path matching ────────────────────────────────────────────────────── */

export function compilePattern(pattern: string): (path: string) => boolean {
	if (pattern.endsWith("/*")) {
		const prefix = pattern.slice(0, -2)
		return (p) => p === prefix || p.startsWith(`${prefix}/`)
	}
	return (p) => p === pattern
}

/* ── Virtual path matching ─────────────────────────────────────────── */

const MATCHER_BRAND = Symbol.for("flare/matcher")

export interface PathMatcher {
	(path: string): boolean
	[MATCHER_BRAND]: true
}

export function isPathMatcher(value: unknown): value is PathMatcher {
	return typeof value === "function" && MATCHER_BRAND in (value as object)
}

type SegmentMatcher =
	| { type: "catch"; min: number }
	| { type: "literal"; value: string }
	| { type: "optional" }
	| { type: "param" }

function parseSegments(pattern: string): SegmentMatcher[] {
	const raw = pattern.split("/").filter(Boolean)
	return raw.map((seg): SegmentMatcher => {
		if (seg.startsWith("[[...") && seg.endsWith("]]")) return { min: 0, type: "catch" }
		if (seg.startsWith("[...") && seg.endsWith("]")) return { min: 1, type: "catch" }
		if (seg.startsWith("[[") && seg.endsWith("]]")) return { type: "optional" }
		if (seg.startsWith("[") && seg.endsWith("]")) return { type: "param" }
		return { type: "literal", value: seg }
	})
}

/**
 * Compile a virtual path pattern into a branded URL matcher.
 * Supports `[param]`, `[[optional]]`, `[...catch]`, `[[...optional-catch]]`.
 */
export function virtualPath(pattern: string): PathMatcher {
	const matchers = parseSegments(pattern)

	const fn = ((path: string): boolean => {
		const segments = path.split("/").filter(Boolean)

		function walk(mi: number, si: number): boolean {
			if (mi === matchers.length) return si === segments.length

			const m = matchers[mi]
			if (!m) return false

			if (m.type === "literal") {
				return si < segments.length && segments[si] === m.value && walk(mi + 1, si + 1)
			}
			if (m.type === "param") {
				return si < segments.length && walk(mi + 1, si + 1)
			}
			if (m.type === "optional") {
				return walk(mi + 1, si) || (si < segments.length && walk(mi + 1, si + 1))
			}
			if (m.type === "catch") {
				const remaining = segments.length - si
				for (let take = remaining; take >= m.min; take--) {
					if (walk(mi + 1, si + take)) return true
				}
				return false
			}
			return false
		}

		return walk(0, 0)
	}) as PathMatcher
	fn[MATCHER_BRAND] = true
	return fn
}

/* ── Request-type filter helpers ──────────────────────────────────────── */

export function onPage<TEnv = unknown>(mw: FlareMiddleware<TEnv>): FlareMiddleware<TEnv> {
	return (ctx) => (ctx.requestType === "page" ? mw(ctx) : ctx.next())
}

export function onServerFn<TEnv = unknown>(mw: FlareMiddleware<TEnv>): FlareMiddleware<TEnv> {
	return (ctx) => (ctx.requestType === "server-fn" ? mw(ctx) : ctx.next())
}

/* ── Middleware entry (used by server builder) ────────────────────────── */

export interface MiddlewareEntry<TEnv = unknown> {
	matchers?: Array<(path: string) => boolean>
	middlewares: FlareMiddleware<TEnv>[]
}

export function resolveMiddlewareEntries<TEnv = unknown>(
	entries: MiddlewareEntry<TEnv>[],
	pathname: string,
): FlareMiddleware<TEnv>[] {
	const result: FlareMiddleware<TEnv>[] = []
	for (const entry of entries) {
		if (!entry.matchers || entry.matchers.some((m) => m(pathname))) {
			for (const mw of entry.middlewares) {
				result.push(mw)
			}
		}
	}
	return result
}
