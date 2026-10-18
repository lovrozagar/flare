import { constants, Script } from "node:vm"
import { beforeEach, expect, it, vi } from "vitest"
import { BOOT_FAILED, CHUNK_MESSAGES, CHUNK_RELOAD_KEY } from "../../shared/protocol/index.ts"
import { clientScript } from "./client-script.ts"

// The entry import's handler, run as the exact text clientScript renders (BUGS.md 352). The entry is a data: module
// that throws the given error, so the import rejects as a module that would not load does; the page's globals are
// spies in a `with` scope.

type Page = {
	assign: ReturnType<typeof vi.fn<(href: string) => void>>
	error: ReturnType<typeof vi.fn<(...args: unknown[]) => void>>
	added: ReturnType<typeof vi.spyOn>
	removed: ReturnType<typeof vi.spyOn>
	unload: EventTarget
	settled: () => Promise<void>
}

const HREF = "https://app.test/docs"

// A Storage over a Map, as sessionStorage is.
function memoryStorage(): Storage {
	const items = new Map<string, string>()
	return {
		get length() {
			return items.size
		},
		clear: () => items.clear(),
		getItem: (key) => items.get(key) ?? null,
		key: (index) => [...items.keys()][index] ?? null,
		removeItem: (key) => void items.delete(key),
		setItem: (key, value) => void items.set(key, value),
	}
}

let storage = memoryStorage()

beforeEach(() => {
	storage = memoryStorage()
})

// The script's body, the text between its tags.
function body(html: string): string {
	return html.slice(html.indexOf(">") + 1, html.lastIndexOf("</script>"))
}

// An entry whose import rejects with `thrown`. Node runs a data: module that throws it through its default loader,
// since a loader callback needs --experimental-vm-modules there; Bun takes the callback, and rejects a throwing data:
// module with no error at all.
function rejecting(thrown: Error) {
	if ("Bun" in globalThis) return { entry: "/src/client.tsx", importModuleDynamically: () => Promise.reject(thrown) }
	const source = `throw new ${thrown.name}(${JSON.stringify(thrown.message)})`
	return {
		entry: `data:text/javascript,${encodeURIComponent(source)}`,
		importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER,
	}
}

function run(thrown: Error, at: { now?: number; storage?: () => Storage } = {}): Page {
	const unload = new EventTarget()
	const added = vi.spyOn(unload, "addEventListener")
	const removed = vi.spyOn(unload, "removeEventListener")
	const assign = vi.fn<(href: string) => void>()
	const error = vi.fn<(...args: unknown[]) => void>()
	const scope = {
		addEventListener: unload.addEventListener.bind(unload),
		removeEventListener: unload.removeEventListener.bind(unload),
		location: { href: HREF, assign },
		Date: { now: () => at.now ?? 1000 },
		get sessionStorage() {
			return (at.storage ?? (() => storage))()
		},
		console: { error },
	}
	const { entry, importModuleDynamically } = rejecting(thrown)
	const text = `(scope) => { with (scope) {\n${body(clientScript(entry, ""))}\n} }`
	new Script(text, { importModuleDynamically }).runInThisContext()(scope)
	const settled = () => vi.waitFor(() => expect(removed).toHaveBeenCalledOnce())
	return { assign, error, added, removed, unload, settled }
}

it("client script shape", () => {
	const html = clientScript("/src/client.tsx", "n0")
	expect(html.startsWith('<script type="module" async nonce="n0">')).toBe(true)
	expect(body(html)).toContain('import("/src/client.tsx")')
	expect(clientScript("/src/client.tsx", "").startsWith('<script type="module" async>')).toBe(true)
	expect(clientScript(undefined, "n0")).toBe("")
	expect(body(html)).not.toMatch(/[<`$]/)
})

it("entry chunk loads once", async () => {
	for (const message of CHUNK_MESSAGES) {
		storage.clear()
		const page = run(new TypeError(`${message}: /src/a.ts`))
		await page.settled()
		expect({ message, loads: page.assign.mock.calls }).toEqual({ message, loads: [[HREF]] })
		expect(page.error).not.toHaveBeenCalled()
		expect(JSON.parse(storage.getItem(CHUNK_RELOAD_KEY) ?? "null")).toEqual({ at: 1000, href: HREF })
	}
})

// The client's guard: the same href inside 10 s is not loaded again, and the failure is logged; after it, it loads.
it("entry guard window", async () => {
	const chunk = new TypeError("Importing a module script failed.")
	await run(chunk, { now: 1000 }).settled()
	const again = run(chunk, { now: 10_999 })
	await again.settled()
	expect(again.assign).not.toHaveBeenCalled()
	expect(again.error).toHaveBeenCalledExactlyOnceWith(BOOT_FAILED, expect.any(TypeError))
	const later = run(chunk, { now: 11_000 })
	await later.settled()
	expect(later.assign).toHaveBeenCalledExactlyOnceWith(HREF)
})

it("entry plain error", async () => {
	const page = run(new Error("entry broke"))
	await page.settled()
	expect(page.assign).not.toHaveBeenCalled()
	expect(page.error).toHaveBeenCalledExactlyOnceWith(BOOT_FAILED, expect.objectContaining({ message: "entry broke" }))
	expect(storage.length).toBe(0)
})

// No storage, or storage that throws, means no load, as loadDocument; an unreadable record counts as none.
it("entry storage", async () => {
	const chunk = new TypeError("Loading chunk 7 failed.")
	const refused = run(chunk, {
		storage: () => {
			throw new Error("SecurityError")
		},
	})
	await refused.settled()
	expect(refused.assign).not.toHaveBeenCalled()
	expect(refused.error).toHaveBeenCalledExactlyOnceWith(BOOT_FAILED, expect.any(TypeError))
	storage.setItem(CHUNK_RELOAD_KEY, "{bad")
	const unreadable = run(chunk)
	await unreadable.settled()
	expect(unreadable.assign).toHaveBeenCalledExactlyOnceWith(HREF)
})

// After the page's own `beforeunload`, an import its navigation cut short loads, logs, and stores nothing. The
// listener lives only while the import is pending.
it("entry while leaving", async () => {
	for (const thrown of [
		new TypeError("error loading dynamically imported module: /src/a.ts"),
		new Error("entry broke"),
	]) {
		const page = run(thrown)
		expect(page.added).toHaveBeenCalledOnce()
		page.unload.dispatchEvent(new Event("beforeunload"))
		await page.settled()
		expect(page.removed).toHaveBeenCalledExactlyOnceWith("beforeunload", page.added.mock.calls[0]?.[1])
		expect(page.assign).not.toHaveBeenCalled()
		expect(page.error).not.toHaveBeenCalled()
	}
	expect(storage.length).toBe(0)
})

it("entry leave after settle", async () => {
	const page = run(new Error("entry broke"))
	await page.settled()
	page.unload.dispatchEvent(new Event("beforeunload"))
	expect(page.error).toHaveBeenCalledOnce()
	expect(page.removed).toHaveBeenCalledExactlyOnceWith("beforeunload", page.added.mock.calls[0]?.[1])
})
