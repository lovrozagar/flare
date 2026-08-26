export type RewriteFn = (ctx: { url: URL }) => URL | string | undefined;

export interface LocationRewrite {
	input?: RewriteFn;
	output?: RewriteFn;
}

function keepSameOrigin(next: URL, original: URL): URL {
	if (next.origin !== original.origin) return original;
	if (next.pathname.startsWith("//") || next.pathname.includes("\\")) return original;
	return next;
}

export function executeRewriteInput(rewrite: LocationRewrite | undefined, url: URL): URL {
	try {
		const result = rewrite?.input?.({ url });
		if (result === undefined) return url;
		const next = typeof result === "string" ? new URL(result, url) : result;
		return keepSameOrigin(next, url);
	} catch {
		return url;
	}
}

export function executeRewriteOutput(rewrite: LocationRewrite | undefined, url: URL): URL {
	try {
		const result = rewrite?.output?.({ url });
		if (result === undefined) return url;
		const next = typeof result === "string" ? new URL(result, url) : result;
		return keepSameOrigin(next, url);
	} catch {
		return url;
	}
}

export function composeRewrites(rewrites: LocationRewrite[]): LocationRewrite {
	if (rewrites.length === 0) {
		return {};
	}

	if (rewrites.length === 1) {
		return rewrites[0] ?? {};
	}

	return {
		input: ({ url }) => {
			let current = url;
			for (const rewrite of rewrites) {
				current = executeRewriteInput(rewrite, current);
			}
			return current;
		},
		output: ({ url }) => {
			let current = url;
			for (let i = rewrites.length - 1; i >= 0; i--) {
				current = executeRewriteOutput(rewrites[i], current);
			}
			return current;
		},
	};
}

export function rewriteBasePath(opts: { basePath: string; caseSensitive?: boolean }): LocationRewrite {
	/* normalize: strip trailing slash */
	const bp = opts.basePath.endsWith("/") ? opts.basePath.slice(0, -1) : opts.basePath;

	return {
		input: ({ url }) => {
			const pathname = url.pathname;
			const prefix =
				opts.caseSensitive === false ? pathname.toLowerCase().startsWith(bp.toLowerCase()) : pathname.startsWith(bp);

			if (!prefix) return undefined;

			/* ensure match is at segment boundary: /app/x matches, /application does not */
			const rest = pathname.slice(bp.length);
			if (rest !== "" && !rest.startsWith("/")) return undefined;

			const next = new URL(url);
			next.pathname = rest || "/";
			return next;
		},
		output: ({ url }) => {
			const next = new URL(url);
			next.pathname = url.pathname === "/" ? bp : `${bp}${url.pathname}`;
			return next;
		},
	};
}
