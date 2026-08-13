import { error } from "../../logger.ts"
import type { FlareMiddleware, MiddlewareContext } from ".."

const PING_PATH = "/_flare/keepalive"

interface KeepaliveConfig<TEnv = unknown> {
	handler?: (ctx: MiddlewareContext<TEnv>) => Promise<void> | void
}

export function keepalive<TEnv = unknown>(config?: KeepaliveConfig<TEnv>): FlareMiddleware<TEnv> {
	return async (ctx: MiddlewareContext<TEnv>) => {
		if (ctx.url.pathname !== PING_PATH || ctx.request.method !== "GET") return ctx.next()

		if (config?.handler) {
			try {
				await config.handler(ctx)
			} catch (e: unknown) {
				error("keepalive", "handler error", e)
			}
		}

		return ctx.bypass(new Response(null, { status: 204 }))
	}
}
