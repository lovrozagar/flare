// The browser surface a document load uses, passed in so a test can observe it.
export type ReloadEnv = { storage: () => Storage; now: () => number; assign: (href: string) => void }

const KEY = "flare_chunk_reload"
const WINDOW_MS = 10_000

// The five messages browsers and Vite give a route chunk that failed to load.
const CHUNK = [
	"Failed to fetch dynamically imported module",
	"error loading dynamically imported module",
	"Importing a module script failed",
	"Loading chunk",
	"Loading CSS chunk",
]

export function isChunkError(error: unknown): boolean {
	return error instanceof Error && CHUNK.some((message) => error.message.includes(message))
}

// A build mismatch and a missing chunk share one guarded document load. The same href within 10 seconds is not
// loaded again, so a broken deploy cannot loop. Without storage there is no guard, so nothing loads.
export function loadDocument(href: string, env: ReloadEnv): boolean {
	let storage: Storage
	try {
		storage = env.storage()
	} catch {
		return false
	}
	const last = readLast(storage)
	if (last !== undefined && last.href === href && env.now() - last.at < WINDOW_MS) return false
	storage.setItem(KEY, JSON.stringify({ at: env.now(), href }))
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
