import { finalize, isUnmatched, rebodied, streamsBody } from "../../server/lifecycle/finalize.ts"
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
			// Only a document no route matched reaches the binding: the app's own 404s stay (plan 21 13.4).
			if (!isUnmatched(response) || assets === undefined) return keepingSent(response)
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

// A stream body that fails keeps the bytes before the failure: workerd drops a chunk it has not sent when the body
// errors in the same turn, so the error waits one (BUGS.md 382). workerd ends the message with its last chunk all the
// same, so the cut is not visible to a cache; a public stream is buffered before it is answered (BUGS.md 383). This
// rests on workerd's scheduling, measured in Miniflare's workerd, not on a signal: the chunk arrived in 0 runs with the
// error at once or thrown from `pull`, and in 5 of 5 with it a `setTimeout(0)` later. A change in that order fails
// tests/workerd `worker cut keeps sent`.
function keepingSent(response: Response): Response {
	if (!streamsBody(response)) return response
	const reader = response.body.getReader()
	const body = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const step = await reader.read()
				if (step.done) return controller.close()
				controller.enqueue(step.value)
			} catch (error) {
				setTimeout(() => controller.error(error), 0)
			}
		},
		cancel: (reason) => reader.cancel(reason),
	})
	return rebodied(response, body)
}
