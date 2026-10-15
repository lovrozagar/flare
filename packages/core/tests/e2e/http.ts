import { Agent, request as send, type IncomingHttpHeaders } from "node:http"

// The e2e specs' HTTP client, the `http` fixture (crash.ts). Each call opens its own connection and closes it after the
// response, so no socket outlives its request: Playwright's `request` shares one keep-alive agent per worker process,
// and a socket a case left idle could carry a later case's request just as the server closed it, failing it with
// ECONNRESET (BUGS.md 125). It takes the call shape the specs use: `get` and `post` with `headers`, `data` (sent as
// JSON), and `maxRedirects` (default 20; a 3xx is returned once they are used up, as Playwright does).
export type HttpOptions = { headers?: Record<string, string>; data?: unknown; maxRedirects?: number }

export type HttpResponse = {
	url: () => string
	status: () => number
	headers: () => Record<string, string>
	body: () => Promise<Buffer>
	text: () => Promise<string>
	json: () => Promise<unknown>
}

export type HttpClient = {
	get: (url: string, options?: HttpOptions) => Promise<HttpResponse>
	post: (url: string, options?: HttpOptions) => Promise<HttpResponse>
	close: () => void
}

const REDIRECTS = new Set([301, 302, 303, 307, 308])

export function httpClient(): HttpClient {
	const agent = new Agent({ keepAlive: false })
	const call = async (method: string, url: string, options: HttpOptions = {}): Promise<HttpResponse> => {
		let current = { method, url, data: options.data }
		for (let left = options.maxRedirects ?? 20; ; left -= 1) {
			const response = await once(agent, { ...options, ...current })
			const location = response.headers()["location"]
			if (!REDIRECTS.has(response.status()) || location === undefined || left === 0) return response
			// A 303, or a 301 or 302 answering a POST, is followed with a GET and no body; 307 and 308 keep both.
			const keep = response.status() >= 307 || (response.status() !== 303 && current.method === "GET")
			current = keep
				? { ...current, url: new URL(location, current.url).href }
				: { method: "GET", url: new URL(location, current.url).href, data: undefined }
		}
	}
	return {
		get: (url, options) => call("GET", url, options),
		post: (url, options) => call("POST", url, options),
		close: () => agent.destroy(),
	}
}

function once(agent: Agent, options: HttpOptions & { method: string; url: string }): Promise<HttpResponse> {
	const { method, url } = options
	const body = options.data === undefined ? undefined : JSON.stringify(options.data)
	const headers: Record<string, string> = {
		...(body === undefined ? {} : { "content-type": "application/json" }),
		...options.headers,
	}
	return new Promise((resolve, reject) => {
		const outgoing = send(url, { method, agent, headers }, (incoming) => {
			const chunks: Buffer[] = []
			incoming.on("data", (chunk: Buffer) => chunks.push(chunk))
			incoming.on("error", reject)
			incoming.on("end", () => {
				const bytes = Buffer.concat(chunks)
				resolve({
					url: () => url,
					status: () => incoming.statusCode ?? 0,
					headers: () => flat(incoming.headers),
					body: async () => bytes,
					text: async () => bytes.toString("utf8"),
					json: async () => JSON.parse(bytes.toString("utf8")) as unknown,
				})
			})
		})
		outgoing.on("error", reject)
		outgoing.end(body)
	})
}

// Lower-case names, one string each; repeated headers such as `set-cookie` are joined with a newline, as Playwright's
// `headers()` joins them.
function flat(headers: IncomingHttpHeaders): Record<string, string> {
	return Object.fromEntries(
		Object.entries(headers).flatMap(([name, value]) =>
			value === undefined ? [] : [[name, Array.isArray(value) ? value.join("\n") : value]],
		),
	)
}
