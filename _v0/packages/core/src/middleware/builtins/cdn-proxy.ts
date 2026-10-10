import type { FlareMiddleware, MiddlewareContext } from "..";

interface R2Object {
	body: ReadableStream;
	etag: string;
	httpMetadata?: { contentType?: string };
	size: number;
}

interface R2BucketBinding {
	get: (key: string) => Promise<R2Object | null>;
}

interface CdnProxyConfig<TEnv = unknown> {
	bucket: (ctx: { env: TEnv }) => R2BucketBinding;
	cacheControl?: string;
	edgeCache?: boolean;
	pathPrefix: string;
}

const NOSNIFF = { "X-Content-Type-Options": "nosniff" } as const;

function isNavigableExecutable(contentType: string): boolean {
	const mime = contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
	return (
		mime === "application/xhtml+xml" ||
		mime === "application/xml" ||
		mime === "image/svg+xml" ||
		mime === "text/html" ||
		mime === "text/xml"
	);
}

function bypassText(ctx: MiddlewareContext, body: string, status: number) {
	return ctx.bypass(new Response(body, { headers: NOSNIFF, status }));
}

export function cdnProxy<TEnv = unknown>(config: CdnProxyConfig<TEnv>): FlareMiddleware<TEnv> {
	const defaultCacheControl = config.cacheControl ?? "public, max-age=31536000, immutable";

	return async (ctx: MiddlewareContext<TEnv>) => {
		const pathname = ctx.url.pathname;
		if (!pathname.startsWith(`${config.pathPrefix}/`)) return ctx.next();

		const rawKey = pathname.slice(config.pathPrefix.length + 1);
		let key: string;
		try {
			key = decodeURIComponent(rawKey);
		} catch {
			return bypassText(ctx, "Bad Request", 400);
		}
		/* Reject path traversal, null bytes, backslashes, and CRLF */
		if (key.includes("..") || key.includes("\0") || key.includes("\\") || key.includes("\r") || key.includes("\n")) {
			return bypassText(ctx, "Bad Request", 400);
		}
		const bucket = config.bucket({ env: ctx.env });
		const object = await bucket.get(key);

		if (!object) {
			return bypassText(ctx, "Not Found", 404);
		}

		const headers: Record<string, string> = {
			"Cache-Control": defaultCacheControl,
			"Content-Length": String(object.size),
			ETag: object.etag,
			"X-Content-Type-Options": "nosniff",
		};

		if (object.httpMetadata?.contentType) {
			headers["Content-Type"] = object.httpMetadata.contentType;
			if (isNavigableExecutable(object.httpMetadata.contentType)) {
				headers["Content-Disposition"] = "attachment";
			}
		}

		return ctx.bypass(new Response(object.body, { headers }));
	};
}
