import { beforeEach, expect, it, vi } from "vitest"
import { isChunkError, loadDocument, type ReloadEnv } from "./reload.ts"

beforeEach(() => {
	sessionStorage.clear()
})

function env(at: number): ReloadEnv & { assign: ReturnType<typeof vi.fn> } {
	return { storage: () => sessionStorage, now: () => at, assign: vi.fn<(href: string) => void>() }
}

it("reload guard", () => {
	const first = env(1000)
	expect(loadDocument("/about", first)).toBe(true)
	expect(first.assign).toHaveBeenCalledExactlyOnceWith("/about")
	expect(JSON.parse(sessionStorage.getItem("flare_chunk_reload") ?? "null")).toEqual({
		at: 1000,
		href: `${location.origin}/about`,
	})
	const again = env(10_999)
	expect(loadDocument("/about", again)).toBe(false)
	expect(again.assign).not.toHaveBeenCalled()
	const later = env(11_001)
	expect(loadDocument("/about", later)).toBe(true)
})

it("reload other href", () => {
	loadDocument("/about", env(1000))
	const other = env(2000)
	expect(loadDocument("/contact", other)).toBe(true)
	expect(other.assign).toHaveBeenCalledExactlyOnceWith("/contact")
})

it("reload no storage", () => {
	const locked = {
		...env(1000),
		storage: (): Storage => {
			throw new Error("SecurityError")
		},
	}
	expect(loadDocument("/about", locked)).toBe(false)
	expect(locked.assign).not.toHaveBeenCalled()
	sessionStorage.setItem("flare_chunk_reload", "{bad")
	expect(loadDocument("/about", env(1000))).toBe(true)
})

it("chunk", () => {
	for (const message of [
		"Failed to fetch dynamically imported module: /assets/a.js",
		"error loading dynamically imported module",
		"Importing a module script failed.",
		"Loading chunk 7 failed.",
		"Loading CSS chunk 3 failed.",
	]) {
		expect(isChunkError(new TypeError(message))).toBe(true)
	}
	expect(isChunkError(new Error("boom"))).toBe(false)
	expect(isChunkError("Loading chunk 1 failed")).toBe(false)
})

// A navigation's chunk load passes the target as a path; the boot and the document's entry script pass `location.href`.
// Both name one page, so the guard holds the second (BUGS.md 365).
it("reload path and url", () => {
	expect(loadDocument("/about?tab=a", env(1000))).toBe(true)
	const boot = env(2000)
	expect(loadDocument(`${location.origin}/about?tab=a`, boot)).toBe(false)
	expect(boot.assign).not.toHaveBeenCalled()
})
