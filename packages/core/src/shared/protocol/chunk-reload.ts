// The one guarded document load a module that would not load takes, shared by the client's navigations and boot
// (client/navigation/reload.ts) and the document's entry script (entry-import.ts), so both keep one
// guard window: the same href within the window is not loaded again, and a broken deploy cannot loop (BUGS.md 352).
export const CHUNK_RELOAD_KEY = "flare_chunk_reload"
export const CHUNK_RELOAD_WINDOW_MS = 10_000

// The five messages browsers and Vite give a module that failed to load.
export const CHUNK_MESSAGES: readonly string[] = [
	"Failed to fetch dynamically imported module",
	"error loading dynamically imported module",
	"Importing a module script failed",
	"Loading chunk",
	"Loading CSS chunk",
]

// What the client logs when its boot fails with no document load to take.
export const BOOT_FAILED = "[flare] the client failed to boot"
