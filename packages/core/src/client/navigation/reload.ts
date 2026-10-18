import {
	CHUNK_MESSAGES,
	CHUNK_RELOAD_KEY as KEY,
	CHUNK_RELOAD_WINDOW_MS as WINDOW_MS,
} from "../../shared/protocol/chunk-reload.ts"
import type { Router } from "../../shared/router/create-router.ts"

// The browser surface a document load uses, passed in so a test can observe it.
export type ReloadEnv = { storage: () => Storage; now: () => number; assign: (href: string) => void }

export function isChunkError(error: unknown): boolean {
	return error instanceof Error && CHUNK_MESSAGES.some((message) => error.message.includes(message))
}

type Probe = (url: string, init: RequestInit) => Promise<Response>

// Whether chunk files whose load failed are gone. The server says, not the page: an engine may cut a leaving page's
// loads short and give it no `beforeunload` (iOS Safari, Mac WebKit under a test's goto, BUGS.md 368). Each file gets
// an uncached HEAD: any answer not ok means gone, as after a deploy removed it; every one ok means there, the load cut
// short; one that cannot be made means the page is going. With no file to ask about, a chunk message stays gone.
export async function chunksGone(urls: readonly string[], probe: Probe): Promise<boolean> {
	if (urls.length === 0) return true
	const answers = await Promise.allSettled(urls.map((url) => probe(url, { method: "HEAD", cache: "no-store" })))
	if (answers.some((answer) => answer.status === "rejected")) return false
	return answers.some((answer) => answer.status === "fulfilled" && !answer.value.ok)
}

// The chunk files of the chain a pathname matches, each route's own: a string in dev, the first of a client bundle's
// list. A route with none known adds nothing.
export function chainChunks(router: Router, pathname: string): string[] {
	return router.match(pathname).chain.flatMap((entry) => [router.chunks[entry.id] ?? []].flat().slice(0, 1))
}

// A build mismatch and a missing chunk share one guarded document load. The same page within 10 seconds is not
// loaded again, so a broken deploy cannot loop. Without storage there is no guard, so nothing loads. The guard keys
// on the href resolved against the page: a navigation passes a path, the boot and the document's entry script
// `location.href`, and both name one page (BUGS.md 365).
export function loadDocument(href: string, env: ReloadEnv): boolean {
	const page = new URL(href, location.href).href
	let storage: Storage
	try {
		storage = env.storage()
	} catch {
		return false
	}
	const last = readLast(storage)
	if (last !== undefined && last.href === page && env.now() - last.at < WINDOW_MS) return false
	storage.setItem(KEY, JSON.stringify({ at: env.now(), href: page }))
	env.assign(href)
	return true
}

function readLast(storage: Storage): { at: number; href: string } | undefined {
	try {
		const last: { at: number; href: string } | null = JSON.parse(storage.getItem(KEY) ?? "null")
		return last ?? undefined
	} catch {
		return undefined
	}
}
