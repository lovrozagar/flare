import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import type { ResolvedEntries, VitePlugin } from "./types.ts"

interface NodeReq {
	headers: Record<string, string | string[] | undefined>
	method?: string
	on: (event: string, fn: (chunk?: unknown) => void) => void
	socket?: { encrypted?: boolean }
	url?: string
}

interface NodeRes {
	end: (data?: unknown) => void
	on: (event: string, fn: () => void) => void
	writableEnded?: boolean
	write: (chunk: unknown) => void
	writeHead: (status: number, headers: Record<string, string | string[]>) => void
}

interface SsrEnvironment {
	runner?: { import: (id: string) => Promise<Record<string, unknown>> }
}

interface ViteDevServer {
	config?: { root?: string; server?: { middlewareMode?: boolean } }
	environments?: Record<string, SsrEnvironment>
	middlewares: {
		use: (fn: (req: NodeReq, res: NodeRes, next: (err?: unknown) => void) => void) => void
	}
	ssrFixStacktrace: (e: Error) => void
	transformIndexHtml: (url: string, html: string) => Promise<string>
}

function nodeToWebRequest(req: NodeReq, url: URL): Request {
	const headers = new Headers()
	for (const [key, value] of Object.entries(req.headers)) {
		/* skip HTTP/2 pseudo-headers (e.g. :method, :path, :scheme) */
		if (key.startsWith(":")) continue
		if (value) {
			const values = Array.isArray(value) ? value : [value]
			for (const v of values) {
				headers.append(key, v)
			}
		}
	}

	const hasBody = req.method !== "GET" && req.method !== "HEAD"
	const body = hasBody
		? new ReadableStream({
				start(controller) {
					req.on("data", (chunk: unknown) => {
						controller.enqueue(chunk)
					})
					req.on("end", () => {
						controller.close()
					})
					req.on("error", (err: unknown) => {
						controller.error(err)
					})
				},
			})
		: undefined

	return new Request(url.href, {
		body: body ?? null,
		duplex: hasBody ? "half" : undefined,
		headers,
		method: req.method ?? "GET",
	} as RequestInit)
}

async function streamResponse(response: Response, res: NodeRes): Promise<void> {
	const responseHeaders: Record<string, string | string[]> = {}
	/* Set-Cookie must be sent as separate headers — Node.js writeHead
	 * accepts string[] for multi-value headers like Set-Cookie */
	const setCookies =
		"getSetCookie" in response.headers
			? (response.headers as Headers & { getSetCookie(): string[] }).getSetCookie()
			: []
	response.headers.forEach((value, key) => {
		if (key === "set-cookie") return
		responseHeaders[key] = value
	})
	if (setCookies.length > 0) {
		responseHeaders["set-cookie"] = setCookies
	}
	res.writeHead(response.status, responseHeaders)

	if (response.body) {
		const reader = response.body.getReader()
		const pump = async (): Promise<void> => {
			const { done, value } = await reader.read()
			if (done) {
				res.end()
				return
			}
			res.write(value)
			return pump()
		}
		try {
			await pump()
		} finally {
			reader.cancel().catch(() => {})
			if (!res.writableEnded) res.end()
		}
	} else {
		res.end()
	}
}

export function createDevServerPlugin(entries: ResolvedEntries, _assetsBase: string = "/assets"): VitePlugin {
	return {
		configureServer(server: unknown) {
			const vite = server as ViteDevServer

			/* post-phase callback — runs AFTER Vite's built-in middleware */
			return () => {
				const ssrEnv = vite.environments?.ssr

				/* Auto-skip: middlewareMode means external HTTP server owns routing */
				if (vite.config?.server?.middlewareMode) return

				/* Auto-skip: no SSR environment available */
				if (!ssrEnv) return

				/*
				 * Auto-skip: platform plugin (CF, Nitro) provides its own SSR handler.
				 * Duck-type check — do not use isFetchableDevEnvironment() since Nitro
				 * implements the interface duck-style, not via class inheritance.
				 */
				if ("dispatchFetch" in ssrEnv) return

				/* Auto-skip: @cloudflare/vite-plugin owns request dispatch via its own middleware
				   (which delegates to miniflare with full env binding). It does not advertise
				   `dispatchFetch` on the ssrEnv, so the duck-type check above misses it. Detect
				   the plugin by name and yield to it. Without this, Flare's dev-server intercepts
				   first (lower middleware priority depending on plugin order) and calls
				   `handler.fetch(request)` without `env`, breaking service bindings. */
				const plugins = (vite.config as { plugins?: { name?: string }[] }).plugins
				const cfPluginPresent = Array.isArray(plugins)
					&& plugins.some((p) => typeof p?.name === "string" && p.name.startsWith("vite-plugin-cloudflare"))
				if (cfPluginPresent) return

				vite.middlewares.use(async (req, res, next) => {
					if (!req.url) return next()

					try {
						const mod = ssrEnv.runner
							? await ssrEnv.runner.import(`./${entries.server}`)
							: undefined

						if (!mod) return next()

						const handler = (mod.server ?? mod.handler ?? mod.default) as {
							fetch: (request: Request) => Promise<Response>
						}

						/* HTTP/2 uses :authority instead of host header */
						const url = new URL(
							req.url,
							`${req.socket?.encrypted ? "https" : "http"}://${req.headers.host ?? req.headers[":authority"] ?? "localhost"}`,
						)
						const webReq = nodeToWebRequest(req, url)
						const response = await handler.fetch(webReq)

						const contentType = response.headers.get("content-type") ?? ""
						if (contentType.includes("text/html")) {
							let html = await response.text()
							/*
							 * Sanitize pathname for transformIndexHtml: Vite creates virtual
							 * module IDs for inline <script> tags based on the URL pathname.
							 * If the path has a file extension (e.g. /foo.json), Vite's
							 * built-in plugins (vite:json, vite:css) match the extension
							 * and try to parse the JS as JSON/CSS, causing a 500.
							 */
							const lastSlash = url.pathname.lastIndexOf("/")
							const hasFileExt = url.pathname.indexOf(".", lastSlash) !== -1
							html = await vite.transformIndexHtml(hasFileExt ? "/" : url.pathname, html)

							const htmlHeaders: Record<string, string | string[]> = {
								"content-type": "text/html; charset=utf-8",
							}
							const htmlSetCookies =
								"getSetCookie" in response.headers
									? (response.headers as Headers & { getSetCookie(): string[] }).getSetCookie()
									: []
							response.headers.forEach((value, key) => {
								if (key === "content-type" || key === "content-length" || key === "set-cookie")
									return
								htmlHeaders[key] = value
							})
							if (htmlSetCookies.length > 0) {
								htmlHeaders["set-cookie"] = htmlSetCookies
							}
							res.writeHead(response.status, htmlHeaders)
							res.end(html)
							return
						}

						await streamResponse(response, res)
					} catch (e: unknown) {
						if (e instanceof Error) {
							vite.ssrFixStacktrace(e)
						}
						next(e)
					}
				})
			}
		},
		name: "flare:dev-server",
	}
}

/* ── Preview Server ──────────────────────────────────────────────────── */

interface PreviewServer {
	config?: { root?: string }
	middlewares: {
		use: (fn: (req: NodeReq, res: NodeRes, next: (err?: unknown) => void) => void) => void
	}
}

export function createPreviewServerPlugin(assetsBase: string = "/assets"): VitePlugin {
	return {
		configurePreviewServer(server: unknown) {
			const preview = server as PreviewServer
			const root = preview.config?.root ?? process.cwd()
			const serverPath = join(root, "dist/server/server.js")
			const clientDir = join(root, "dist/client")

			let handlerPromise: Promise<{ fetch: (request: Request) => Promise<Response> }> | undefined

			function getHandler() {
				if (!handlerPromise) {
					handlerPromise = import(`${serverPath}?t=${Date.now()}`).then(
						(mod) =>
							(mod.server ?? mod.handler) as {
								fetch: (request: Request) => Promise<Response>
							},
					)
					/* Clear on failure so next request retries instead of caching the rejection */
					handlerPromise.catch((e: unknown) => {
						const msg = e instanceof Error ? e.message : String(e)
						process.stderr.write(`[flare:preview] handler import failed, will retry: ${msg}\n`)
						handlerPromise = undefined
					})
				}
				return handlerPromise
			}

			return () => {
				preview.middlewares.use(async (req, res, next) => {
					if (!req.url) return next()

					/* Serve static client assets */
					const urlPath = req.url.split("?")[0]
					if (urlPath?.startsWith(`${assetsBase}/`)) {
						const filePath = resolve(join(clientDir, urlPath))
						const clientDirSlash = clientDir.endsWith("/") ? clientDir : `${clientDir}/`
						if (!filePath.startsWith(clientDirSlash)) return next()
						try {
							const content = readFileSync(filePath)
							const ext = filePath.split(".").pop() ?? ""
							const mimeTypes: Record<string, string> = {
								css: "text/css",
								js: "application/javascript",
								json: "application/json",
								svg: "image/svg+xml",
							}
							res.writeHead(200, {
								"cache-control": "public, max-age=31536000, immutable",
								"content-type": mimeTypes[ext] ?? "application/octet-stream",
							})
							res.end(content)
							return
						} catch {
							/* fall through to SSR */
						}
					}

					try {
						const handler = await getHandler()
						/* HTTP/2 uses :authority instead of host header */
						const url = new URL(
							req.url,
							`${req.socket?.encrypted ? "https" : "http"}://${req.headers.host ?? req.headers[":authority"] ?? "localhost"}`,
						)
						const webReq = nodeToWebRequest(req, url)
						const response = await handler.fetch(webReq)
						await streamResponse(response, res)
					} catch (e: unknown) {
						next(e)
					}
				})
			}
		},
		name: "flare:preview-server",
	}
}
