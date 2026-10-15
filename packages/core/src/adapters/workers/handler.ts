import { finalize } from "../../server/lifecycle/finalize.ts"
import { createLogger } from "../../server/lifecycle/logger.ts"

export type WorkerCtx = {
	waitUntil: (promise: Promise<unknown>) => void
	clientIp?: string | undefined
}

export type AssetBinding = {
	fetch: (request: Request) => Response | Promise<Response>
}

export type WorkerEnv = Record<string, AssetBinding | undefined>

type Server = {
	fetch: (request: Request, env: WorkerEnv, ctx: WorkerCtx) => Response | Promise<Response>
}

export function createWorkersHandler(
	server: Server,
	options?: { assets?: string },
): { fetch: (request: Request, env: WorkerEnv, ctx: WorkerCtx) => Promise<Response> } {
	const assets = options?.assets
	return {
		async fetch(request, env, ctx) {
			// The server's ingress computes the canonical path once (B22): a non-canonical one is its 301 or 400 here, as
			// on Node and Bun.
			const response = await server.fetch(request, env, {
				waitUntil(promise) {
					ctx.waitUntil(promise)
				},
				clientIp: connectingIp(request),
			})
			if (response.status !== 404 || assets === undefined) return response
			if (request.method !== "GET" && request.method !== "HEAD") {
				return finalize({ status: 405, body: "", headers: new Headers({ allow: "GET, HEAD, OPTIONS" }) })
			}
			const binding = env[assets]
			if (binding === undefined) {
				createLogger({ dev: false }).error("assets", "missing binding")
				return finalize({ status: 500, body: "" })
			}
			// A file the binding has is its response, untouched. A path it does not have either is the app's own
			// not-found answer, as on Node and Bun (dx/adapters.md). A 404 passed the server's ingress, so the path is
			// already canonical.
			const asset = await binding.fetch(request)
			const [kept, dropped] = asset.status === 404 ? [response, asset] : [asset, response]
			void dropped.body?.cancel()
			return kept
		},
	}
}

function connectingIp(request: Request): string | undefined {
	const header = request.headers.get("cf-connecting-ip")
	if (header === null) return undefined
	return header
}
