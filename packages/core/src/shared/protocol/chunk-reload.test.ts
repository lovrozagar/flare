import { expect, it } from "vitest"
import { BOOT_FAILED, CHUNK_MESSAGES, CHUNK_RELOAD_KEY, CHUNK_RELOAD_WINDOW_MS } from "./chunk-reload.ts"

// The guard is read across deploys: a document from one build and a client from the next share the stored record, so
// the key and window are pinned, and the five messages are the browsers' and Vite's (BUGS.md 352).
it("chunk guard pinned", () => {
	expect(CHUNK_RELOAD_KEY).toBe("flare_chunk_reload")
	expect(CHUNK_RELOAD_WINDOW_MS).toBe(10_000)
	expect(CHUNK_MESSAGES).toEqual([
		"Failed to fetch dynamically imported module",
		"error loading dynamically imported module",
		"Importing a module script failed",
		"Loading chunk",
		"Loading CSS chunk",
	])
	expect(BOOT_FAILED).toBe("[flare] the client failed to boot")
})
