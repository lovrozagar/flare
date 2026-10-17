import { fnPrefix } from "../../shared/protocol/index.ts"
import { canonicalPath, type CanonicalOptions, type CanonicalPath } from "../../shared/url/canonical.ts"
import { foldCase } from "../../shared/router/fold.ts"
import { mountSpelling, type Mount } from "../mount/mount.ts"
import type { RuntimeOptions } from "./options.ts"
import { isRetired } from "./retire-worker.ts"

export type PathRewrite = (path: string) => string | undefined

export type CanonicalStep = { status: number; location?: string }

// A redirect keeps a GET or HEAD as 301. Every other method is 308, so the method and body survive (B22). A
// server-function path skips the trailing-slash, rewrite, and case rules, so its POST is never redirected. A hostile
// one is still 400.
export function applyCanonical(input: {
	method: string
	url: string
	// The router's base, which the server-function prefix sits under. "/" when omitted.
	basePath?: string
	trailingSlash?: CanonicalOptions["trailingSlash"]
	caseSensitive?: boolean
	// 02-system step 4: one replacement, redirected to like any other canonical change.
	rewrite?: PathRewrite | undefined
	// The router's case fold toward the matched route, which runs when `caseSensitive` is false (B22).
	fold?: (path: string) => string
	// A path served as asked for, as a server function's is: a retired worker's (dx/server.md `retireServiceWorker`).
	fixed?: boolean
}): CanonicalStep {
	const parsed = new URL(input.url, "http://localhost")
	const fn = input.fixed === true || parsed.pathname.startsWith(fnPrefix(input.basePath ?? "/"))
	const options = { trailingSlash: fn ? ("preserve" as const) : input.trailingSlash }
	const first = readPath(canonicalPath(parsed.pathname, options))
	if (first === undefined) return { status: 400 }
	let path = first
	// A server function's endpoint is no page path: a rewrite never touches it (plan 21 8.4).
	if (input.rewrite && !fn) {
		const rewritten = rewriteOnce(input.rewrite, first, options)
		if (rewritten === undefined) return { status: 400 }
		path = rewritten
	}
	if (!fn && input.caseSensitive !== true && input.fold !== undefined) path = input.fold(path)
	if (path === parsed.pathname) return { status: 200 }
	const status = input.method === "GET" || input.method === "HEAD" ? 301 : 308
	return { status, location: `${path}${parsed.search}` }
}

// The rewrite's replacement, canonicalized; undefined when that is hostile. A replacement the rewrite changes again
// would answer a chain of redirects, so it throws, and the request is a projected 500 (dx/server.md `rewrite`).
function rewriteOnce(rewrite: PathRewrite, path: string, options: CanonicalOptions): string | undefined {
	const next = rewrite(path)
	if (typeof next !== "string") return path
	const rewritten = readPath(canonicalPath(next, options))
	if (rewritten === undefined) return undefined
	const again = rewrite(rewritten)
	if (typeof again === "string" && readPath(canonicalPath(again, options)) !== rewritten) {
		throw new Error(
			`rewrite: ${path} became ${rewritten}, which rewrites again to ${again}. A rewrite ends in one step`,
		)
	}
	return rewritten
}

function readPath(result: CanonicalPath): string | undefined {
	return "path" in result ? result.path : undefined
}

// One request's canonical step as the pipeline runs it (02-system steps 1 to 4). A retired worker's path is answered as
// asked for, since its update fetch fails on a redirect. The app's rewrite runs only on a path no mount handles, and a
// mount prefix folds before the matched route (B22). A Node adapter runs it too, for a method it cannot make a request
// of (BUGS.md 284).
export function canonicalStep(
	serving: { options: Pick<RuntimeOptions, "router" | "rewrite" | "retireServiceWorker">; mounts: readonly Mount[] },
	request: { method: string; url: string },
): CanonicalStep {
	const { router, rewrite, retireServiceWorker } = serving.options
	const mounted = (path: string) => mountSpelling(serving.mounts, path)
	return applyCanonical({
		method: request.method,
		url: request.url,
		fixed: isRetired(retireServiceWorker, new URL(request.url).pathname),
		basePath: router.basePath,
		trailingSlash: router.trailingSlash,
		caseSensitive: router.caseSensitive,
		rewrite: rewrite === undefined ? undefined : (path) => (mounted(path) === undefined ? rewrite(path) : undefined),
		fold: (path) => mounted(path) ?? foldCase(router, path),
	})
}
