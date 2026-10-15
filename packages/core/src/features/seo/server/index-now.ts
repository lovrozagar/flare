import type { Middleware } from "../../../server/middleware/types.ts"
import { isHttpsUrl, JSON_TYPE, send, type SubmitResult } from "./request.ts"

export type IndexNowOptions = {
	host: string
	key: string
	urls: readonly string[]
	keyLocation?: string
}

const ENDPOINT = "https://api.indexnow.org/indexnow"
const KEY = /^[A-Za-z0-9-]{8,128}$/
const LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?"
const HOST = new RegExp(`^${LABEL}(?:\\.${LABEL})*$`, "i")
// The IndexNow protocol's per-request limit.
const MAX_URLS = 10_000

// The key is a token, so it is safe in a path and in a message that only says the rule.
function checkedKey(key: string): string {
	if (!KEY.test(key)) throw new Error("indexNow key must be 8 to 128 letters, digits, or hyphens")
	return key
}

function checked(options: IndexNowOptions): void {
	if (!HOST.test(options.host)) throw new Error("indexNow host must be a hostname with no scheme or path")
	checkedKey(options.key)
	if (options.urls.length === 0) throw new Error("indexNow needs at least one url")
	if (options.urls.length > MAX_URLS) throw new Error(`indexNow takes at most ${MAX_URLS} urls`)
	const host = options.host.toLowerCase()
	for (const url of options.urls) {
		if (!isHttpsUrl(url) || new URL(url).hostname !== host) {
			throw new Error(`indexNow url ${url} is not https on ${options.host}`)
		}
	}
	const location = options.keyLocation
	if (location !== undefined && !isHttpsUrl(location)) {
		throw new Error("indexNow keyLocation must be an absolute https url")
	}
}

// One IndexNow submission (dx/seo.md). A bad option throws before any request. A failed request is `{ ok: false }`.
async function submit(options: IndexNowOptions): Promise<SubmitResult> {
	checked(options)
	const body = {
		host: options.host,
		key: options.key,
		urlList: options.urls,
		...(options.keyLocation !== undefined && { keyLocation: options.keyLocation }),
	}
	return send("IndexNow", ENDPOINT, {
		method: "POST",
		headers: { "content-type": JSON_TYPE },
		body: JSON.stringify(body),
	})
}

// `GET /<key>.txt` answers the key as text. Every other request goes on.
function file(key: string): Middleware {
	const path = `/${checkedKey(key)}.txt`
	return (ctx) => {
		if (ctx.request.method !== "GET" || ctx.path !== path) return ctx.next()
		ctx.respond(new Response(key, { headers: { "content-type": "text/plain; charset=utf-8" } }))
		return undefined
	}
}

export const indexNow: typeof submit & { file: typeof file } = Object.assign(submit, { file })
