import { defined } from "../../shared/errors/index.ts"
import type { ChainEntry, ModuleRef, Router } from "../../shared/router/create-router.ts"
import { importStarted, loadChain } from "../../shared/router/load-chain.ts"
import type { UserWork } from "./user-work.ts"

// The router's `modules: "all"` warm-up after load and idle (B64, B127): every route module the client has not
// imported, as `<link rel=prefetch>` where the browser has it and as imports where it does not, a few at a time and
// yielding to the user's own requests (BUGS.md 520).

// The browser surface the warm reads: the navigator for Data Saver and 2G, the head links go into, whether
// rel=prefetch is supported, and the document's protocol.
export type WarmEnv = { network: object; head: HTMLElement; relPrefetch?: boolean; protocol?: string }

// The after-load warm-up is the router's `modules: "all"`; any other router setting warms nothing (BUGS.md 305).
export function warmAll(router: Router, env: WarmEnv, work: UserWork): void {
	if (router.prefetch.modules !== "all" || lowData(env.network)) return
	const at = { work, cap: warmCap(env.protocol) }
	if (env.relPrefetch ?? document.createElement("link").relList.supports("prefetch")) {
		warm([...unloadedChunks(router)], (href) => linked(env.head, prefetchLink(href)), at)
	} else warm(unloadedEntries(router), (entry) => loadChain([entry]), at)
}

// How many warm-up requests may be in flight at once. Over HTTP/1.1 a browser opens six connections to a host, so two
// leave four for the user. Over h2 or h3 one connection multiplexes every request and nothing waits for a connection,
// so six; an empty, unknown, or missing protocol keeps two (BUGS.md 520, decision B127).
function warmCap(protocol: string | undefined): number {
	return protocol === "h2" || protocol === "h3" ? 6 : 2
}

// The protocol the document came over, from its navigation entry; "" when there is none.
export function hopProtocol(entries: readonly { nextHopProtocol?: string }[]): string {
	return entries[0]?.nextHopProtocol ?? ""
}

// Issues `items` at most `cap` at a time, the next once one settles, and none while the user's own work is in
// flight: it goes on when that work ends (`whenIdle`). Items already issued go on; a prefetch link or an import cannot
// be taken back.
function warm<T>(
	items: T[],
	issue: (item: T) => Promise<unknown>,
	{ work, cap }: { work: UserWork; cap: number },
): void {
	let flying = 0
	let waiting = false
	const pump = (): void => {
		while (flying < cap && items.length > 0) {
			if (work.busy()) {
				if (!waiting) {
					waiting = true
					work.whenIdle(() => {
						waiting = false
						pump()
					})
				}
				return
			}
			const item = defined(items.shift(), "a warm-up item")
			flying += 1
			void issue(item)
				.catch(() => undefined)
				.finally(() => {
					flying -= 1
					pump()
				})
		}
	}
	pump()
}

// A prefetch link in the head, settled when it loads or fails.
function linked(head: HTMLElement, link: HTMLLinkElement): Promise<void> {
	return new Promise((resolve) => {
		link.addEventListener("load", () => resolve(), { once: true })
		link.addEventListener("error", () => resolve(), { once: true })
		head.append(link)
	})
}

// Every chunk file the client has not imported: each route's own file and, in a build, the files it imports, each once.
// A file in a loaded route's closure is in the module map already, and a prefetch would fetch it again (BUGS.md 80,
// 124.6).
function unloadedChunks(router: Router): Set<string> {
	const modules = new Map<string, ModuleRef>(Object.entries(router.layouts))
	for (const node of router.routeTree) modules.set(node.id, node.module)
	const entries = Object.entries(router.chunks).map(([id, files]) => [id, [files].flat()] as const)
	const loaded = new Set(
		entries
			.filter(([id]) => {
				const ref = modules.get(id)
				return ref !== undefined && importStarted(ref)
			})
			.flatMap(([, files]) => files),
	)
	return new Set(entries.flatMap(([, files]) => files).filter((href) => !loaded.has(href)))
}

// Where rel=prefetch is unsupported (Safari through 26.x), every route and layout module the client has not imported is
// imported, as intent prefetch does: the module map then holds it and its whole static closure for the next navigation.
// A modulepreload would warn in the console for each chunk not used within seconds of load, and a fetch() is not reused
// (BUGS.md 124.3, 124.7; decision B127). Route modules have no side effects (lint `no-module-side-effects`), and in real
// Safari on the docs app the imports changed no computed style and left no frame gap over 50 ms (124.9).
function unloadedEntries(router: Router): ChainEntry[] {
	const layouts = Object.entries(router.layouts).map(([id, module]) => ({ id, kind: "layout" as const, module }))
	const pages = router.routeTree.map((node) => ({ id: node.id, kind: "page" as const, module: node.module }))
	return [...layouts, ...pages].filter((entry) => typeof entry.module === "function" && !importStarted(entry.module))
}

// Data Saver and 2G skip `"all"` and fall back to viewport module prefetch (dx/link.md).
export function lowData(network: object): boolean {
	if (!("connection" in network) || typeof network.connection !== "object" || network.connection === null) {
		return false
	}
	const connection = network.connection
	if ("saveData" in connection && connection.saveData === true) return true
	return "effectiveType" in connection && (connection.effectiveType === "2g" || connection.effectiveType === "slow-2g")
}

function prefetchLink(href: string): HTMLLinkElement {
	const link = document.createElement("link")
	const attributes: ReadonlyArray<readonly [string, string]> = [
		["rel", "prefetch"],
		["as", "script"],
		["crossorigin", ""],
		["fetchpriority", "low"],
		["href", href],
	]
	for (const [name, value] of attributes) link.setAttribute(name, value)
	return link
}
