import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { BOOT_FAILED, CHUNK_MESSAGES } from "../../shared/protocol/index.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { env, install, stops, type Dom } from "./boot.fixture.ts"
import { bootSafely, createClient, type ClientEnv } from "./create-client.ts"
import { createReady } from "./ready.ts"

// A boot that fails is never an unhandled rejection: a module that would not load is one guarded document load of the
// page, as a navigation's chunk is, and any other failure is logged and goes to the dev overlay. A failure after the
// page's own `beforeunload` is an import its navigation cut short, and is skipped. The app's callbacks never hear the
// client is ready (BUGS.md 352).

// The root's lazy modules reject, as an import a reload cut short or a deploy removed does. `before` runs while the
// import is pending.
function failing(error: Error, before: () => void = () => undefined) {
	const rejects = () =>
		Promise.resolve().then(() => {
			before()
			throw error
		})
	return createRouter({ layouts: { _root_: rejects }, routeTree: [{ id: "_root_/", path: "/", module: rejects }] })
}

const CHUNK = new TypeError("error loading dynamically imported module: /src/a.ts")

beforeEach(() => {
	history.replaceState(null, "", "/")
	document.documentElement.removeAttribute("data-flare-hydrated")
	sessionStorage.clear()
})

afterEach(() => {
	for (const stop of stops.splice(0)) stop()
	delete (globalThis as Dom).flare
	vi.restoreAllMocks()
})

it("chunk at boot", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	for (const message of CHUNK_MESSAGES) {
		sessionStorage.clear()
		const client = env(install())
		const ready = createReady()
		const heard = vi.fn<() => void>()
		ready.api.onReady(heard).onHydrated(heard)
		await expect(bootSafely(failing(new TypeError(`${message}: /src/a.ts`)), ready, client)).resolves.toBeUndefined()
		expect({ message, loads: vi.mocked(client.assign).mock.calls }).toEqual({
			message,
			loads: [[window.location.href]],
		})
		expect(heard).not.toHaveBeenCalled()
		expect(document.documentElement.hasAttribute("data-flare-hydrated")).toBe(false)
	}
	expect(logged).not.toHaveBeenCalled()
})

it("boot reload guarded", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const client = env(install())
	await bootSafely(failing(CHUNK), createReady(), client)
	await bootSafely(failing(CHUNK), createReady(), client)
	expect(client.assign).toHaveBeenCalledOnce()
	expect(logged).toHaveBeenCalledExactlyOnceWith(BOOT_FAILED, CHUNK)
})

it("boot error reported", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const send = vi.fn<NonNullable<ClientEnv["send"]>>()
	const client = { ...env(install()), dev: true, send }
	const error = new Error("boot broke")
	const ready = createReady()
	const heard = vi.fn<() => void>()
	ready.api.onReady(heard)
	await expect(bootSafely(failing(error), ready, client)).resolves.toBeUndefined()
	expect(client.assign).not.toHaveBeenCalled()
	expect(heard).not.toHaveBeenCalled()
	expect(logged).toHaveBeenCalledExactlyOnceWith(BOOT_FAILED, error)
	expect(send).toHaveBeenCalledExactlyOnceWith(
		expect.objectContaining({ err: expect.objectContaining({ message: "boot broke" }) }),
	)
})

// A failure after the page's own `beforeunload` loads nothing, logs nothing, and stamps no guard, so the next
// document's real failure still loads once.
it("boot while leaving", async () => {
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const unload = new EventTarget()
	const client = { ...env(install()), unload }
	const leave = () => void unload.dispatchEvent(new Event("beforeunload"))
	for (const error of [CHUNK, new Error("boot broke")]) {
		await expect(bootSafely(failing(error, leave), createReady(), client)).resolves.toBeUndefined()
	}
	expect(client.assign).not.toHaveBeenCalled()
	expect(logged).not.toHaveBeenCalled()
	expect(sessionStorage.length).toBe(0)
	await bootSafely(failing(CHUNK), createReady(), client)
	expect(client.assign).toHaveBeenCalledExactlyOnceWith(window.location.href)
})

// The listener lives only while the boot is pending: one `beforeunload` after it settled changes nothing.
it("leave listener scoped", async () => {
	const unload = new EventTarget()
	const added = vi.spyOn(unload, "addEventListener")
	const removed = vi.spyOn(unload, "removeEventListener")
	const client = { ...env(install()), unload }
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	const pending = bootSafely(failing(CHUNK), createReady(), client)
	expect(added).toHaveBeenCalledOnce()
	expect(removed).not.toHaveBeenCalled()
	await pending
	expect(removed).toHaveBeenCalledExactlyOnceWith("beforeunload", added.mock.calls[0]?.[1])
	unload.dispatchEvent(new Event("beforeunload"))
	expect(client.assign).toHaveBeenCalledExactlyOnceWith(window.location.href)
	expect(logged).not.toHaveBeenCalled()
})

// createClient boots through the same guard, so a failed boot leaves no unhandled rejection behind.
it("create client failure", async () => {
	install()
	const error = new Error("boot broke")
	const logged = vi.spyOn(console, "error").mockImplementation(() => undefined)
	createClient(failing(error))
	await vi.waitFor(() => expect(logged).toHaveBeenCalledExactlyOnceWith(BOOT_FAILED, error))
})
