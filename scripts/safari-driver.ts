// A WebDriver client for real Safari through safaridriver, with no dependencies. macOS refuses a safaridriver started
// over SSH, so the person at the Mac runs `safaridriver -p 4799` in a Terminal there, and verify:safari reaches it
// through an SSH tunnel (scripts/verify-safari.ts).

export type Fetcher = (
	url: string,
	init: { method: string; body?: string; headers?: Record<string, string> },
) => Promise<{
	json: () => Promise<unknown>
}>

// WebDriver's Enter, Tab, and Escape keys, sent with `keys` or `press`.
export const ENTER = "\ue007"
export const TAB = "\ue004"
export const ESCAPE = "\ue00c"

export class SafariSession {
	readonly #base: string
	readonly #fetch: Fetcher
	readonly #id: string
	readonly version: string

	private constructor(input: { base: string; fetch: Fetcher; id: string; version: string }) {
		this.#base = input.base
		this.#fetch = input.fetch
		this.#id = input.id
		this.version = input.version
	}

	// One session at 1280×800. Safari allows one automation session at a time, so a session a crashed run left open
	// is retried for a few seconds before the run fails.
	static async open(base: string, fetch: Fetcher): Promise<SafariSession> {
		const capabilities = { capabilities: { alwaysMatch: { browserName: "safari" } } }
		let last: unknown
		for (let attempt = 0; attempt < 10; attempt += 1) {
			try {
				const value = Object(await call(fetch, `${base}/session`, { method: "POST", body: capabilities }))
				const id = String(Reflect.get(value, "sessionId"))
				const version = String(Reflect.get(Object(Reflect.get(value, "capabilities")), "browserVersion"))
				const session = new SafariSession({ base, fetch, id, version })
				await session.#call("POST", "/window/rect", { x: 0, y: 0, width: 1280, height: 800 })
				return session
			} catch (error) {
				last = error
				await new Promise((resolve) => setTimeout(resolve, 500))
			}
		}
		throw new Error(`safaridriver did not open a session: ${String(last)}`)
	}

	go(url: string): Promise<unknown> {
		return this.#call("POST", "/url", { url })
	}

	js(script: string): Promise<unknown> {
		return this.#call("POST", "/execute/sync", { script, args: [] })
	}

	async click(css: string): Promise<void> {
		await this.#call("POST", `/element/${await this.#element(css)}/click`, {})
	}

	// Keys typed into the element a selector finds, as a person would; WebDriver's special keys, ENTER among them, are
	// Private Use characters.
	async keys(css: string, text: string): Promise<void> {
		await this.#call("POST", `/element/${await this.#element(css)}/value`, { text })
	}

	// The open user prompt's text, a page's own `alert` or `confirm`: WebDriver errors when none is open.
	async alertText(): Promise<string> {
		return String(await this.#call("GET", "/alert/text", undefined))
	}

	// Dismisses the open prompt: a `confirm` answers false.
	dismissAlert(): Promise<unknown> {
		return this.#call("POST", "/alert/dismiss", {})
	}

	// One mouse's moves and presses, through Perform Actions: the page hit-tests the point as it would for a person.
	pointer(actions: readonly Record<string, unknown>[]): Promise<unknown> {
		const mouse = { type: "pointer", id: "mouse", parameters: { pointerType: "mouse" }, actions }
		return this.#call("POST", "/actions", { actions: [mouse] })
	}

	// A key pressed and released on whatever holds focus, through Perform Actions: a person's Tab or Escape.
	press(key: string): Promise<unknown> {
		const keyboard = {
			type: "key",
			id: "keyboard",
			actions: [
				{ type: "keyDown", value: key },
				{ type: "keyUp", value: key },
			],
		}
		return this.#call("POST", "/actions", { actions: [keyboard] })
	}

	back(): Promise<unknown> {
		return this.#call("POST", "/back", {})
	}

	// Polls a script until it returns a truthy value, for at most `timeout` ms.
	async wait(script: string, timeout = 10_000): Promise<boolean> {
		const end = Date.now() + timeout
		while (Date.now() < end) {
			if (await this.js(script)) return true
			await new Promise((resolve) => setTimeout(resolve, 50))
		}
		return false
	}

	close(): Promise<unknown> {
		return this.#call("DELETE", "", undefined)
	}

	async #element(css: string): Promise<string> {
		const found = Object(await this.#call("POST", "/element", { using: "css selector", value: css }))
		return String(Object.values(found)[0])
	}

	#call(method: string, path: string, body: unknown): Promise<unknown> {
		return call(this.#fetch, `${this.#base}/session/${this.#id}${path}`, { method, body })
	}
}

// A WebDriver command's `value`. An error answer throws its message.
export async function call(fetch: Fetcher, url: string, input: { method: string; body: unknown }): Promise<unknown> {
	const response = await fetch(url, {
		method: input.method,
		...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
		headers: { "content-type": "application/json" },
	})
	const value: unknown = Reflect.get(Object(await response.json()), "value")
	const error = Reflect.get(Object(value), "error")
	if (typeof error === "string") throw new Error(`${error}: ${String(Reflect.get(Object(value), "message"))}`)
	return value
}
