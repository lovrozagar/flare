import { expect, it } from "vitest"
import { call, ENTER, ESCAPE, SafariSession, TAB, type Fetcher } from "./safari-driver.ts"

// A fake safaridriver: answers from `answer` by method and path, and records each command.
function driver(answer: (method: string, path: string) => unknown) {
	const sent: string[] = []
	const fetch: Fetcher = async (url, init) => {
		const path = url.replace("http://driver", "")
		sent.push(`${init.method} ${path}${init.body === undefined ? "" : ` ${init.body}`}`)
		return { json: async () => ({ value: answer(init.method, path) }) }
	}
	return { fetch, sent }
}

const opened = (method: string, path: string): unknown =>
	method === "POST" && path === "/session" ? { sessionId: "s1", capabilities: { browserVersion: "17.6" } } : null

// A command's `value` comes back; a WebDriver error answer throws its error and message.
it("command value", async () => {
	const ok = driver(() => 42)
	expect(await call(ok.fetch, "http://driver/status", { method: "GET", body: undefined })).toBe(42)
	expect(ok.sent).toEqual(["GET /status"])
	const failing = driver(() => ({ error: "no such element", message: "#missing" }))
	await expect(call(failing.fetch, "http://driver/x", { method: "POST", body: {} })).rejects.toThrow(
		"no such element: #missing",
	)
})

// A session opens at 1280×800, clicks the element it found, polls a script until it holds, and closes.
it("session commands", async () => {
	let polls = 0
	const fake = driver((method, path) => {
		if (path === "/session/s1/element") return { "element-6066-11e4-a52e-4f735466cecf": "e7" }
		if (path === "/session/s1/execute/sync") return (polls += 1) >= 3
		return opened(method, path)
	})
	const safari = await SafariSession.open("http://driver", fake.fetch)
	expect(safari.version).toBe("17.6")
	await safari.go("http://site/")
	await safari.click("#start")
	expect(await safari.wait("return ready", 2000)).toBe(true)
	await safari.close()
	expect(fake.sent).toEqual([
		'POST /session {"capabilities":{"alwaysMatch":{"browserName":"safari"}}}',
		'POST /session/s1/window/rect {"x":0,"y":0,"width":1280,"height":800}',
		'POST /session/s1/url {"url":"http://site/"}',
		'POST /session/s1/element {"using":"css selector","value":"#start"}',
		"POST /session/s1/element/e7/click {}",
		'POST /session/s1/execute/sync {"script":"return ready","args":[]}',
		'POST /session/s1/execute/sync {"script":"return ready","args":[]}',
		'POST /session/s1/execute/sync {"script":"return ready","args":[]}',
		"DELETE /session/s1",
	])
})

// A script that never holds gives up at its timeout.
it("wait times out", async () => {
	const safari = await SafariSession.open(
		"http://driver",
		driver((method, path) => opened(method, path) ?? false).fetch,
	)
	expect(await safari.wait("return false", 120)).toBe(false)
})

// A driver that keeps refusing a session fails the run with its error, after its retries.
it("session refused", async () => {
	const busy = driver(() => ({ error: "session not created", message: "one session at a time" }))
	await expect(SafariSession.open("http://driver", busy.fetch)).rejects.toThrow(
		"safaridriver did not open a session: Error: session not created: one session at a time",
	)
	expect(busy.sent).toHaveLength(10)
}, 15_000)

// A pointer sequence goes to Perform Actions as one mouse, so a flow moves and presses where a person would, and the
// page hit-tests the point itself (B129's `pointer during transition`).
it("pointer actions", async () => {
	const fake = driver(opened)
	const safari = await SafariSession.open("http://driver", fake.fetch)
	await safari.pointer([
		{ type: "pointerMove", duration: 0, origin: "viewport", x: 10, y: 20 },
		{ type: "pointerDown", button: 0 },
	])
	expect(fake.sent.at(-1)).toBe(
		'POST /session/s1/actions {"actions":[{"type":"pointer","id":"mouse","parameters":{"pointerType":"mouse"},"actions":[{"type":"pointerMove","duration":0,"origin":"viewport","x":10,"y":20},{"type":"pointerDown","button":0}]}]}',
	)
})

// A user prompt, a page's own confirm, is read and dismissed; keys go to the element a selector finds, Enter as
// WebDriver's U+E007 (plan 35).
it("prompt and keys", async () => {
	const fake = driver((method, path) => {
		if (path === "/session/s1/alert/text") return "Discard your notes?"
		if (path === "/session/s1/element") return { "element-6066-11e4-a52e-4f735466cecf": "e9" }
		return opened(method, path)
	})
	const safari = await SafariSession.open("http://driver", fake.fetch)
	expect(await safari.alertText()).toBe("Discard your notes?")
	await safari.dismissAlert()
	await safari.keys("#draft", "notes")
	await safari.keys("#link", ENTER)
	expect(fake.sent.slice(2)).toEqual([
		"GET /session/s1/alert/text",
		"POST /session/s1/alert/dismiss {}",
		'POST /session/s1/element {"using":"css selector","value":"#draft"}',
		'POST /session/s1/element/e9/value {"text":"notes"}',
		'POST /session/s1/element {"using":"css selector","value":"#link"}',
		`POST /session/s1/element/e9/value ${JSON.stringify({ text: ENTER })}`,
	])
})

// A key goes to whatever holds focus, pressed and released through Perform Actions, as a person's Tab or Escape would
// (plan 35).
it("press", async () => {
	const fake = driver(opened)
	const safari = await SafariSession.open("http://driver", fake.fetch)
	await safari.press(TAB)
	await safari.press(ESCAPE)
	const key = (value: string) =>
		JSON.stringify({
			actions: [
				{
					type: "key",
					id: "keyboard",
					actions: [
						{ type: "keyDown", value },
						{ type: "keyUp", value },
					],
				},
			],
		})
	expect(fake.sent.slice(2)).toEqual([
		`POST /session/s1/actions ${key(TAB)}`,
		`POST /session/s1/actions ${key(ESCAPE)}`,
	])
})
