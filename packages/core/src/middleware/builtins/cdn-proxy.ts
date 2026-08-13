import type { FlareMiddleware, MiddlewareContext } from ".."

interface R2Object {
	body: ReadableStream
	etag: string
	httpMetadata?: { contentType?: string }
	size: number
}

interface R2BucketBinding {
	get: (key: string) => Promise<R2Object | null>
}

interface CdnProxyConfig<TEnv = unknown> {
	bucket: (ctx: { env: TEnv }) => R2BucketBinding
	cacheControl?: string
	edgeCache?: boolean
	pathPrefix: string
}

export function cdnProxy<TEnv = unknown>(config: CdnProxyConfig<TEnv>): FlareMiddleware<TEnv> {
	const defaultCacheControl = config.cacheControl ?? "public, max-age=31536000, immutable"

	return async (ctx: MiddlewareContext<TEnv>) => {
		const pathname = ctx.url.pathname
		if (!pathname.startsWith(`${config.pathPrefix}/`)) return ctx.next()

		const rawKey = pathname.slice(config.pathPrefix.length + 1)
		let key: string
		try {
			key = decodeURIComponent(rawKey)
		} catch {
			return ctx.bypass(new Response("Bad Request", { status: 400 }))
		}
		/* Reject path traversal, null bytes, backslashes, and CRLF */
		if (
			key.includes("..") ||
			key.includes("\0") ||
			key.includes("\\") ||
			key.includes("\r") ||
			key.includes("\n")
		) {
			return ctx.bypass(new Response("Bad Request", { status: 400 }))
		}
		const bucket = config.bucket({ env: ctx.env })
		const object = await bucket.get(key)

		if (!object) {
			return ctx.bypass(new Response("Not Found", { status: 404 }))
		}

		const headers: Record<string, string> = {
			"Cache-Control": defaultCacheControl,
			"Content-Length": String(object.size),
			ETag: object.etag,
		}

		if (object.httpMetadata?.contentType) {
			headers["Content-Type"] = object.httpMetadata.contentType
		}

		return ctx.bypass(new Response(object.body, { headers }))
	}
}
