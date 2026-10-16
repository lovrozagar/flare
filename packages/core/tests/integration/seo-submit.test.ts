import { spawn } from "node:child_process"
import { createPublicKey, generateKeyPairSync, verify } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { createServer as createTlsServer, type Server as TlsServer } from "node:https"
import { connect, type AddressInfo } from "node:net"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest"
import { CA_CERT, HOSTS, SERVER_CERT, SERVER_KEY } from "./seo-tls.ts"

// dx/seo.md's submitters through real requests (B96). Each call runs in a child process, as a deploy script would:
// its fetch goes through an HTTPS proxy to a local TLS server that holds a certificate for the services' hosts,
// signed by a CA only the child trusts. The proxy refuses any other host. The fence: the child first fetches a
// `.invalid` host, which resolves nowhere, and calls a submitter only once that probe came back through the proxy, so a
// runtime that ignored the proxy reaches no real service.

const SEO = fileURLToPath(new URL("../../src/exports/seo.ts", import.meta.url))
const ALLOWED = new Set(HOSTS.map((host) => `${host}:443`))

type Seen = { method: string; host: string; path: string; headers: Record<string, string>; body: string }
type Answer = (seen: Seen) => { status: number; body?: string; delay?: number }

const seen: Seen[] = []
let answer: Answer = () => ({ status: 200 })
let inFlight = 0
let mostInFlight = 0
let services: TlsServer | undefined
let proxy: Server | undefined
let dir = ""

async function serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
	let body = ""
	for await (const chunk of request) body += String(chunk)
	const entry = {
		method: request.method ?? "",
		host: request.headers.host ?? "",
		path: request.url ?? "",
		headers: Object.fromEntries(Object.entries(request.headers).map(([name, value]) => [name, String(value)])),
		body,
	}
	if (entry.host === "flare-probe.invalid") {
		response.setHeader("x-flare-probe", "1")
		response.end()
		return
	}
	seen.push(entry)
	inFlight += 1
	mostInFlight = Math.max(mostInFlight, inFlight)
	const { status, body: text = "", delay = 0 } = answer(entry)
	await new Promise((resolve) => setTimeout(resolve, delay))
	inFlight -= 1
	response.writeHead(status, { "content-type": "application/json" }).end(text)
}

beforeAll(async () => {
	dir = mkdtempSync(join(tmpdir(), "flare-seo-"))
	writeFileSync(join(dir, "ca.pem"), CA_CERT)
	services = createTlsServer(
		{ cert: SERVER_CERT, key: SERVER_KEY },
		(request, response) => void serve(request, response),
	)
	await new Promise<void>((resolve) => services?.listen(0, "127.0.0.1", resolve))
	const port = (services.address() as AddressInfo).port
	proxy = createServer((_request, response) => response.writeHead(405).end())
	proxy.on("connect", (request: IncomingMessage, socket) => {
		if (!ALLOWED.has(request.url ?? "")) {
			socket.end("HTTP/1.1 403 Forbidden\r\n\r\n")
			return
		}
		const upstream = connect(port, "127.0.0.1", () => {
			socket.write("HTTP/1.1 200 Connection Established\r\n\r\n")
			upstream.pipe(socket)
			socket.pipe(upstream)
		})
		upstream.on("error", () => socket.destroy())
		socket.on("error", () => upstream.destroy())
	})
	await new Promise<void>((resolve) => proxy?.listen(0, "127.0.0.1", resolve))
})

afterAll(async () => {
	await new Promise((resolve) => proxy?.close(resolve))
	await new Promise((resolve) => services?.close(resolve))
	rmSync(dir, { recursive: true, force: true })
})

beforeEach(() => {
	seen.length = 0
	answer = () => ({ status: 200 })
	inFlight = 0
	mostInFlight = 0
})

type Run = { result: unknown; output: string }

// Runs `body` in a child on this runtime, with `seo` the package's seo exports, and returns what it resolved to, or
// `{ threw }` with the message, and everything the child printed.
function run(body: string): Promise<Run> {
	const source = [
		'const probe = await fetch("https://flare-probe.invalid/").catch(() => undefined);',
		'if (probe?.headers.get("x-flare-probe") !== "1") { console.error("fence: the proxy did not answer"); process.exit(3); }',
		`const seo = await import(${JSON.stringify(SEO)});`,
		`const result = await (async () => { ${body} })().catch((error) => ({ threw: String(error.message) }));`,
		'console.log("RESULT " + JSON.stringify(result));',
	].join("\n")
	const bun = process.versions["bun"] !== undefined
	const address = proxy?.address() as AddressInfo
	const child = spawn(process.execPath, bun ? ["-e", source] : ["--input-type=module", "-e", source], {
		env: {
			PATH: process.env["PATH"],
			NODE_USE_ENV_PROXY: "1",
			HTTPS_PROXY: `http://127.0.0.1:${address.port}`,
			NODE_EXTRA_CA_CERTS: join(dir, "ca.pem"),
		},
		stdio: ["ignore", "pipe", "pipe"],
	})
	let output = ""
	child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()))
	child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()))
	return new Promise((resolve, reject) => {
		child.on("close", (code) => {
			const line = output.split("\n").find((text) => text.startsWith("RESULT "))
			if (code !== 0 || line === undefined) reject(new Error(`the child exited ${code}: ${output}`))
			else resolve({ result: JSON.parse(line.slice(7)), output })
		})
	})
}

const KEY = "flare-key-0123"

// One POST to IndexNow with the JSON body; keyLocation only when set.
it("indexnow posts", async () => {
	const urls = '["https://flare.test/a", "https://flare.test/b"]'
	const location = `keyLocation: "https://flare.test/${KEY}.txt"`
	expect(
		(await run(`return seo.indexNow({ host: "flare.test", key: "${KEY}", urls: ${urls}, ${location} })`)).result,
	).toEqual({ ok: true })
	expect((await run(`return seo.indexNow({ host: "flare.test", key: "${KEY}", urls: ${urls} })`)).result).toEqual({
		ok: true,
	})
	expect(seen.map(({ method, host, path }) => `${method} ${host}${path}`)).toEqual([
		"POST api.indexnow.org/indexnow",
		"POST api.indexnow.org/indexnow",
	])
	expect(seen[0]?.headers["content-type"]).toBe("application/json; charset=utf-8")
	const urlList = ["https://flare.test/a", "https://flare.test/b"]
	expect(JSON.parse(seen[0]?.body ?? "")).toEqual({
		host: "flare.test",
		key: KEY,
		urlList,
		keyLocation: `https://flare.test/${KEY}.txt`,
	})
	expect(JSON.parse(seen[1]?.body ?? "")).toEqual({ host: "flare.test", key: KEY, urlList })
})

// A non-2xx is `{ ok: false }`, named by the service and status, with no key anywhere the caller sees.
it("indexnow fails", async () => {
	answer = () => ({ status: 500 })
	const { result, output } = await run(
		`return seo.indexNow({ host: "flare.test", key: "${KEY}", urls: ["https://flare.test/a"] })`,
	)
	expect(result).toEqual({ ok: false, error: expect.stringContaining("500") })
	expect(JSON.stringify(result) + output).not.toContain(KEY)
})

// One IndexNow call with one url.
function call(host: string, key: string, url: string): Promise<Run> {
	return run(`return seo.indexNow({ host: "${host}", key: "${key}", urls: ["${url}"] })`)
}

// A scheme in host, a short key, and an off-host url throw before any request.
it("indexnow checks", async () => {
	expect((await call("https://flare.test", KEY, "https://flare.test/a")).result).toEqual({
		threw: expect.stringMatching(/host/),
	})
	expect((await call("flare.test", "short", "https://flare.test/a")).result).toEqual({
		threw: expect.stringMatching(/8 to 128/),
	})
	const offHost = await call("flare.test", KEY, "https://other.test/a")
	expect(offHost.result).toEqual({ threw: expect.stringMatching(/other\.test/) })
	expect(JSON.stringify(offHost.result)).not.toContain(KEY)
	expect(seen).toEqual([])
})

const { privateKey: PEM, publicKey } = generateKeyPairSync("rsa", {
	modulusLength: 2048,
	privateKeyEncoding: { type: "pkcs8", format: "pem" },
	publicKeyEncoding: { type: "spki", format: "pem" },
})
const EMAIL = "indexer@flare.iam.gserviceaccount.com"
const CREDENTIALS = `{ clientEmail: "${EMAIL}", privateKey: ${JSON.stringify(PEM)} }`
const TOKEN = "ya29.flare-test-token"

// The token endpoint answers a token; every other Google call answers 200.
function google(fail: (seen: Seen) => boolean = () => false): Answer {
	return (entry) => {
		if (entry.host === "oauth2.googleapis.com")
			return { status: 200, body: JSON.stringify({ access_token: TOKEN, expires_in: 3600 }) }
		return { status: fail(entry) ? 500 : 200, delay: 100 }
	}
}

function decode(part: string): Record<string, unknown> {
	return JSON.parse(Buffer.from(part, "base64url").toString())
}

// The assertion the token request carried, its signature checked with the key's public half.
function assertion(entry: Seen | undefined): { header: unknown; claims: Record<string, unknown> } {
	const form = new URLSearchParams(entry?.body)
	expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer")
	const [header = "", claims = "", signature = ""] = (form.get("assertion") ?? "").split(".")
	const signed = verify(
		"RSA-SHA256",
		Buffer.from(`${header}.${claims}`),
		createPublicKey(publicKey),
		Buffer.from(signature, "base64url"),
	)
	expect(signed).toBe(true)
	return { header: decode(header), claims: decode(claims) }
}

// Sitemap mode: an RS256 token for the webmasters scope, then one PUT of the encoded site and sitemap with it.
it("google sitemap", async () => {
	answer = google()
	const sitemap = '{ siteUrl: "https://flare.test/", sitemapUrl: "https://flare.test/sitemap.xml" }'
	expect((await run(`return seo.googleIndexing({ credentials: ${CREDENTIALS}, sitemap: ${sitemap} })`)).result).toEqual(
		{ ok: true },
	)
	expect(seen.map(({ method, host }) => `${method} ${host}`)).toEqual([
		"POST oauth2.googleapis.com",
		"PUT www.googleapis.com",
	])
	const { header, claims } = assertion(seen[0])
	expect(header).toEqual({ alg: "RS256", typ: "JWT" })
	expect(claims).toMatchObject({
		iss: EMAIL,
		aud: "https://oauth2.googleapis.com/token",
		scope: "https://www.googleapis.com/auth/webmasters",
	})
	expect(Number(claims["exp"]) - Number(claims["iat"])).toBe(3600)
	expect(seen[1]?.path).toBe(
		"/webmasters/v3/sites/https%3A%2F%2Fflare.test%2F/sitemaps/https%3A%2F%2Fflare.test%2Fsitemap.xml",
	)
	expect(seen[1]?.headers["authorization"]).toBe(`Bearer ${TOKEN}`)
})

const THREE =
	'[{ url: "https://flare.test/a", type: "URL_UPDATED" }, { url: "https://flare.test/b", type: "URL_DELETED" }, { url: "https://flare.test/c", type: "URL_UPDATED" }]'

// Notify mode: the indexing scope, one publish per url, at most `concurrency` in flight, one by default.
it("google notify", async () => {
	answer = google()
	expect(
		(await run(`return seo.googleIndexing({ credentials: ${CREDENTIALS}, urls: ${THREE}, concurrency: 2 })`)).result,
	).toEqual({ ok: true })
	expect(assertion(seen[0]).claims["scope"]).toBe("https://www.googleapis.com/auth/indexing")
	const published = seen.filter((entry) => entry.host === "indexing.googleapis.com")
	expect(published.map((entry) => `${entry.method} ${entry.path} ${entry.headers["authorization"]}`)).toEqual(
		Array.from({ length: 3 }, () => `POST /v3/urlNotifications:publish Bearer ${TOKEN}`),
	)
	expect(published.map((entry) => JSON.parse(entry.body))).toEqual([
		{ url: "https://flare.test/a", type: "URL_UPDATED" },
		{ url: "https://flare.test/b", type: "URL_DELETED" },
		{ url: "https://flare.test/c", type: "URL_UPDATED" },
	])
	expect(mostInFlight).toBe(2)
	mostInFlight = 0
	expect((await run(`return seo.googleIndexing({ credentials: ${CREDENTIALS}, urls: ${THREE} })`)).result).toEqual({
		ok: true,
	})
	expect(mostInFlight).toBe(1)
})

// A failed token, a failed publish among others, and a key that does not sign are `{ ok: false }`; no PEM and no token
// reach the result or the output.
it("google fails", async () => {
	answer = (entry) => ({ status: entry.host === "oauth2.googleapis.com" ? 500 : 200 })
	const token = await run(`return seo.googleIndexing({ credentials: ${CREDENTIALS}, urls: ${THREE} })`)
	expect(token.result).toEqual({ ok: false, error: expect.stringContaining("500") })
	expect(seen.map((entry) => entry.host)).toEqual(["oauth2.googleapis.com"])
	seen.length = 0
	answer = google((entry) => entry.body.includes("/b"))
	const publish = await run(
		`return seo.googleIndexing({ credentials: ${CREDENTIALS}, urls: ${THREE}, concurrency: 3 })`,
	)
	expect(publish.result).toEqual({ ok: false, error: expect.stringContaining("500") })
	expect(seen.filter((entry) => entry.host === "indexing.googleapis.com")).toHaveLength(3)
	seen.length = 0
	const broken = `{ clientEmail: "${EMAIL}", privateKey: "-----BEGIN PRIVATE KEY-----\\nbm90IGEga2V5\\n-----END PRIVATE KEY-----" }`
	const unsigned = await run(`return seo.googleIndexing({ credentials: ${broken}, urls: ${THREE} })`)
	expect(unsigned.result).toEqual({ ok: false, error: expect.any(String) })
	expect(seen).toEqual([])
	for (const { result, output } of [token, publish, unsigned]) {
		expect(JSON.stringify(result) + output).not.toMatch(/PRIVATE KEY|bm90IGEga2V5/)
		expect(JSON.stringify(result) + output).not.toContain(TOKEN)
	}
})

// Both modes or neither, no urls, and more than 100 urls throw before any request.
it("google one mode", async () => {
	const sitemap = '{ siteUrl: "https://flare.test/", sitemapUrl: "https://flare.test/sitemap.xml" }'
	const many = `Array.from({ length: 101 }, (_, i) => ({ url: "https://flare.test/" + i, type: "URL_UPDATED" }))`
	const calls = [
		`{ credentials: ${CREDENTIALS}, sitemap: ${sitemap}, urls: ${THREE} }`,
		`{ credentials: ${CREDENTIALS} }`,
		`{ credentials: ${CREDENTIALS}, urls: [] }`,
		`{ credentials: ${CREDENTIALS}, urls: ${many} }`,
	]
	const results = await Promise.all(
		calls.map(async (options) => (await run(`return seo.googleIndexing(${options})`)).result),
	)
	expect(results).toEqual([
		{ threw: expect.stringMatching(/exactly one/) },
		{ threw: expect.stringMatching(/exactly one/) },
		{ threw: expect.stringMatching(/at least one/) },
		{ threw: expect.stringMatching(/at most 100/) },
	])
	expect(seen).toEqual([])
})

const BING = "bing-key-0123"

// One POST with the key in the query only, and `{ siteUrl, urlList }` as the body.
it("bing submits", async () => {
	const urls = '["https://flare.test/a"]'
	expect(
		(await run(`return seo.bingIndexing({ apiKey: "${BING}", siteUrl: "https://flare.test", urls: ${urls} })`)).result,
	).toEqual({ ok: true })
	expect(seen.map(({ method, host, path }) => `${method} ${host}${path}`)).toEqual([
		`POST ssl.bing.com/webmaster/api.svc/json/SubmitUrlbatch?apikey=${BING}`,
	])
	expect(JSON.parse(seen[0]?.body ?? "")).toEqual({ siteUrl: "https://flare.test", urlList: ["https://flare.test/a"] })
	expect(seen[0]?.body).not.toContain(BING)
})

it("bing fails", async () => {
	answer = () => ({ status: 503 })
	const { result, output } = await run(
		`return seo.bingIndexing({ apiKey: "${BING}", siteUrl: "https://flare.test", urls: ["https://flare.test/a"] })`,
	)
	expect(result).toEqual({ ok: false, error: expect.stringContaining("503") })
	expect(JSON.stringify(result) + output).not.toContain(BING)
})
