import { failure, isHttpsOrigin, isHttpsUrl, JSON_TYPE, send, type SubmitResult } from "./request.ts"

export type GoogleCredentials = { clientEmail: string; privateKey: string }

export type GoogleNotification = { url: string; type: "URL_UPDATED" | "URL_DELETED" }

export type GoogleSitemap = { siteUrl: string; sitemapUrl: string }

// Exactly one mode: submit a sitemap, or notify about urls (dx/seo.md).
export type GoogleIndexingOptions =
	| { credentials: GoogleCredentials; sitemap: GoogleSitemap; urls?: never; concurrency?: never }
	| {
			credentials: GoogleCredentials
			urls: readonly GoogleNotification[]
			concurrency?: number
			sitemap?: never
	  }

type Call = { url: string; init: RequestInit }

type Plan = { scope: string; calls: Call[]; concurrency: number }

const TOKEN_URL = "https://oauth2.googleapis.com/token"
const PUBLISH_URL = "https://indexing.googleapis.com/v3/urlNotifications:publish"
const SITEMAP_SCOPE = "https://www.googleapis.com/auth/webmasters"
const NOTIFY_SCOPE = "https://www.googleapis.com/auth/indexing"
const MAX_URLS = 100
const TYPES = ["URL_UPDATED", "URL_DELETED"]

function sitemapPlan(sitemap: GoogleSitemap): Plan {
	if (!isHttpsOrigin(sitemap.siteUrl)) throw new Error("googleIndexing sitemap.siteUrl must be an https origin")
	if (!isHttpsUrl(sitemap.sitemapUrl)) {
		throw new Error("googleIndexing sitemap.sitemapUrl must be an absolute https url")
	}
	const site = encodeURIComponent(sitemap.siteUrl)
	const url = `https://www.googleapis.com/webmasters/v3/sites/${site}/sitemaps/${encodeURIComponent(sitemap.sitemapUrl)}`
	return { scope: SITEMAP_SCOPE, calls: [{ url, init: { method: "PUT" } }], concurrency: 1 }
}

function notifyPlan(urls: readonly GoogleNotification[], concurrency = 1): Plan {
	if (urls.length === 0) throw new Error("googleIndexing needs at least one url")
	if (urls.length > MAX_URLS) throw new Error(`googleIndexing takes at most ${MAX_URLS} urls`)
	if (!Number.isInteger(concurrency) || concurrency < 1) {
		throw new Error("googleIndexing concurrency must be an integer of at least 1")
	}
	const calls = urls.map(({ url, type }) => {
		if (!isHttpsUrl(url)) throw new Error(`googleIndexing url ${url} is not an absolute https url`)
		if (!TYPES.includes(type)) throw new Error(`googleIndexing url type "${type}" is not URL_UPDATED or URL_DELETED`)
		const body = JSON.stringify({ url, type })
		return { url: PUBLISH_URL, init: { method: "POST", headers: { "content-type": JSON_TYPE }, body } }
	})
	return { scope: NOTIFY_SCOPE, calls, concurrency }
}

function planOf(options: GoogleIndexingOptions): Plan {
	if (options.urls !== undefined && options.sitemap === undefined) return notifyPlan(options.urls, options.concurrency)
	if (options.sitemap !== undefined && options.urls === undefined) return sitemapPlan(options.sitemap)
	throw new Error("googleIndexing takes exactly one of sitemap and urls")
}

function base64url(bytes: Uint8Array): string {
	let binary = ""
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}

function textPart(value: unknown): string {
	return base64url(new TextEncoder().encode(JSON.stringify(value)))
}

// RS256 over the PKCS#8 PEM with WebCrypto. A bad PEM rejects, and the caller drops that error unread.
async function signed(credentials: GoogleCredentials, scope: string): Promise<string> {
	const body = credentials.privateKey.replace(/-----(BEGIN|END) PRIVATE KEY-----|\s/g, "")
	const der = Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
	const algorithm = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
	const key = await crypto.subtle.importKey("pkcs8", der, algorithm, false, ["sign"])
	const iat = Math.floor(Date.now() / 1000)
	const claims = { iss: credentials.clientEmail, scope, aud: TOKEN_URL, exp: iat + 3600, iat }
	const unsigned = `${textPart({ alg: "RS256", typ: "JWT" })}.${textPart(claims)}`
	const signature = await crypto.subtle.sign(algorithm, key, new TextEncoder().encode(unsigned))
	return `${unsigned}.${base64url(new Uint8Array(signature))}`
}

type Token = { ok: true; token: string } | { ok: false; error: string }

// The JWT bearer exchange. The token never leaves this module except in the Authorization header.
async function accessToken(jwt: string): Promise<Token> {
	try {
		const response = await fetch(TOKEN_URL, {
			method: "POST",
			headers: { "content-type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
		})
		const value: unknown = response.ok ? await response.json() : undefined
		const token: unknown = Reflect.get(Object(value), "access_token")
		if (typeof token === "string" && token !== "") return { ok: true, token }
		return { ok: false, error: `Google token request answered ${response.status}` }
	} catch {
		return { ok: false, error: "Google request failed" }
	}
}

// At most `size` calls in flight. After a failure no call starts, and the ones in flight finish.
async function inPool(calls: readonly Call[], size: number, token: string): Promise<SubmitResult> {
	const queue = [...calls]
	let result: SubmitResult = { ok: true }
	const worker = async (): Promise<void> => {
		while (result.ok) {
			const call = queue.shift()
			if (call === undefined) return
			const headers = new Headers(call.init.headers)
			headers.set("authorization", `Bearer ${token}`)
			const done = await send("Google", call.url, { ...call.init, headers })
			if (!done.ok && result.ok) result = done
		}
	}
	await Promise.all(Array.from({ length: Math.min(size, calls.length) }, worker))
	return result
}

// Google Search Console sitemap submission, or Indexing API notifications (dx/seo.md). A bad option throws before
// any request. A signing, token, or request failure is `{ ok: false }`, and no key or token is in it or in a log.
export async function googleIndexing(options: GoogleIndexingOptions): Promise<SubmitResult> {
	const plan = planOf(options)
	const jwt = await signed(options.credentials, plan.scope).catch(() => undefined)
	if (jwt === undefined) return failure("Google signing failed")
	const token = await accessToken(jwt)
	if (!token.ok) return failure(token.error)
	return inPool(plan.calls, plan.concurrency, token.token)
}
