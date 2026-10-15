import { afterEach, expect, it, vi } from "vitest"
import { tabbedFetch } from "./tab.ts"

type Fetch = (url: string, init: RequestInit) => Promise<Response>

afterEach(() => {
	document.head.innerHTML = ""
})

// create-client.test.ts `dev tab` runs this through bootClient. These are its edges: the request's own headers stay,
// and no hot channel or no token leaves the fetch as it is (BUGS.md B42).
it("tabbed fetch", async () => {
	const fetch = vi.fn<Fetch>(async () => new Response("ok"))
	const hot = { send: vi.fn<(event: string, payload: unknown) => void>() }
	expect(tabbedFetch(fetch, hot, document)).toBe(fetch)
	document.head.innerHTML = '<meta name="flare-dev-tab" content="T">'
	expect(tabbedFetch(fetch, undefined, document)).toBe(fetch)
	expect(hot.send).not.toHaveBeenCalled()
	await tabbedFetch(fetch, hot, document)("/x", { method: "POST", headers: { "content-type": "application/json" } })
	expect(hot.send).toHaveBeenCalledExactlyOnceWith("flare:tab", { token: "T" })
	const headers = new Headers(fetch.mock.calls[0]?.[1].headers)
	expect([headers.get("content-type"), headers.get("flare-dev-tab")]).toEqual(["application/json", "T"])
	expect(fetch.mock.calls[0]?.[1].method).toBe("POST")
})
