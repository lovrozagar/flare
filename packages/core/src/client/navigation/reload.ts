import {
	CHUNK_MESSAGES,
	CHUNK_RELOAD_KEY as KEY,
	CHUNK_RELOAD_WINDOW_MS as WINDOW_MS,
} from "../../shared/protocol/chunk-reload.ts"

// The browser surface a document load uses, passed in so a test can observe it.
export type ReloadEnv = { storage: () => Storage; now: () => number; assign: (href: string) => void }

export function isChunkError(error: unknown): boolean {
	return error instanceof Error && CHUNK_MESSAGES.some((message) => error.message.includes(message))
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
