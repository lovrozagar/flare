const MARKER = Symbol.for("flare/mount")

/* ── Types ─────────────────────────────────────────────────────────────── */

export type MountFetchHandler<TEnv = unknown> = (
	request: Request,
	env: TEnv,
	ctx: { waitUntil(promise: Promise<unknown>): void },
) => Response | Promise<Response>

export interface MountConfig<TEnv = unknown> {
	[MARKER]?: true
	fetch: MountFetchHandler<TEnv>
	prefix: string
}

/* ── Brand guard ───────────────────────────────────────────────────────── */

export function isFlareMount(value: unknown): value is MountConfig {
	if (value === null || value === undefined || typeof value !== "object") return false
	return "prefix" in value && "fetch" in value && typeof (value as MountConfig).fetch === "function"
}

/* ── API security headers (subset of SSR — no CSP, no X-Frame-Options) ─ */

const API_SECURITY_HEADERS: Record<string, string> = {
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
	"X-Content-Type-Options": "nosniff",
}

/* ── Core functions ────────────────────────────────────────────────────── */

export function matchMount<TEnv>(
	mounts: MountConfig<TEnv>[],
	pathname: string,
): MountConfig<TEnv> | undefined {
	for (const mount of mounts) {
		if (pathname === mount.prefix || pathname.startsWith(`${mount.prefix}/`)) {
			return mount
		}
	}
	return undefined
}

export function buildMountRequest<TEnv>(
	request: Request,
	mount: MountConfig<TEnv>,
	url: URL,
): Request {
	const strippedPath = url.pathname.slice(mount.prefix.length) || "/"
	const target = new URL(strippedPath, url.origin)
	target.search = url.search
	target.hash = url.hash
	return new Request(target.toString(), {
		body: request.body,
		duplex: "half",
		headers: request.headers,
		method: request.method,
	} as RequestInit)
}

export function apiJsonError(status: number, message: string): Response {
	return new Response(JSON.stringify({ error: message, status }), {
		headers: { "Content-Type": "application/json; charset=utf-8" },
		status,
	})
}

function applyApiHeaders(response: Response): Response {
	const headers = new Headers(response.headers)
	for (const [key, value] of Object.entries(API_SECURITY_HEADERS)) {
		if (!headers.has(key)) {
			headers.set(key, value)
		}
	}
	return new Response(response.body, {
		headers,
		status: response.status,
		statusText: response.statusText,
	})
}

export async function dispatchMount<TEnv>(
	request: Request,
	env: TEnv,
	mount: MountConfig<TEnv>,
	url: URL,
	opts: { waitUntil?: (promise: Promise<unknown>) => void },
): Promise<Response> {
	const strippedRequest = buildMountRequest(request, mount, url)
	const ctx = { waitUntil: opts.waitUntil ?? (() => {}) }

	try {
		const response = await mount.fetch(strippedRequest, env, ctx)
		return applyApiHeaders(response)
	} catch {
		return applyApiHeaders(apiJsonError(500, "Internal Server Error"))
	}
}

/* ── proxy() ───────────────────────────────────────────────────────────── */

function buildProxyRequest(request: Request, targetUrl: URL): Request {
	const headers = new Headers(request.headers)
	headers.set("Host", targetUrl.host)
	return new Request(targetUrl.toString(), {
		body: request.body,
		duplex: "half",
		headers,
		method: request.method,
	} as RequestInit)
}

function proxyUrl<TEnv>(baseUrl: string): MountFetchHandler<TEnv> {
	return (request, _env, _ctx) => {
		const incoming = new URL(request.url)
		const target = new URL(incoming.pathname + incoming.search, baseUrl)
		return fetch(buildProxyRequest(request, target))
	}
}

export function proxy<TEnv = unknown>(target: string): MountFetchHandler<TEnv>
export function proxy<TEnv = unknown>(
	target: ((env: TEnv) => string) | ((request: Request, env: TEnv) => string | Request),
): MountFetchHandler<TEnv>
export function proxy<TEnv = unknown>(
	target: string | ((env: TEnv) => string) | ((request: Request, env: TEnv) => string | Request),
): MountFetchHandler<TEnv> {
	if (typeof target === "string") {
		return proxyUrl(target)
	}

	return (request, env, _ctx) => {
		/*
		 * Arity dispatch: 1-arg fns receive env only (dynamic URL mode),
		 * 2-arg fns receive (request, env) and differentiate by return type.
		 */
		const result =
			target.length <= 1
				? (target as (env: TEnv) => string)(env)
				: (target as (request: Request, env: TEnv) => string | Request)(request, env)

		if (typeof result === "string") {
			const incoming = new URL(request.url)
			const resolved = new URL(incoming.pathname + incoming.search, result)
			return fetch(buildProxyRequest(request, resolved))
		}

		/* Custom mode: fn returned a Request */
		return fetch(result)
	}
}
