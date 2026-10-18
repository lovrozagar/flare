import { beforeEach, expect, it, vi } from "vitest"
import { createRouter } from "../../shared/router/create-router.ts"
import { chainChunks, chunksGone, isChunkError, loadDocument, type ReloadEnv } from "./reload.ts"

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

// A probe whose every HEAD answers `status`, or fails.
const answers = (status: number | "throw") =>
	vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => {
		if (status === "throw") throw new TypeError("Load failed")
		return new Response(null, { status })
	})

// Whether a chunk that failed is gone is the server's to say, not the page's: an engine may cut a leaving page's loads
// short and give it no `beforeunload` (iOS Safari, BUGS.md 368). An uncached HEAD of each file: any answer not ok is
// gone; every one ok is there, the load cut short; one that cannot be made means the page is going. With no file to ask
// about, a chunk message stays gone, as before.
it("chunks gone", async () => {
	const there = answers(200)
	expect(await chunksGone(["/assets/a.js", "/assets/b.js"], there)).toBe(false)
	expect(there).toHaveBeenCalledWith("/assets/a.js", { method: "HEAD", cache: "no-store" })
	expect(await chunksGone(["/assets/a.js"], answers(404))).toBe(true)
	expect(await chunksGone(["/assets/a.js"], answers("throw"))).toBe(false)
	expect(await chunksGone([], answers(200))).toBe(true)
})

// The chunk files of the chain a pathname matches, each route's own file first in a client bundle's list.
it("chain chunks", () => {
	const router = createRouter({
		chunks: { _root_: "/src/root.tsx", "_root_/about": ["/assets/about-1.js", "/assets/shared-2.js"] },
		layouts: { _root_: { _type: "root", id: "_root_", render: () => null } as never },
		routeTree: [
			{
				id: "_root_/about",
				path: "/about",
				module: { _type: "page", id: "_root_/about", render: () => null } as never,
			},
		],
	})
	expect(chainChunks(router, "/about")).toEqual(["/src/root.tsx", "/assets/about-1.js"])
	expect(chainChunks(router, "/nowhere")).toEqual(["/src/root.tsx"])
})
