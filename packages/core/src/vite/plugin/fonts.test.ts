import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { createBuilder } from "vite"
import { afterEach, expect, it } from "vitest"
import { flare } from "./flare.ts"
import { fontsPlugin } from "./fonts.ts"
import type { FlareOptions } from "./options.ts"

// A real client build of an app under the repo's node_modules, so its imports resolve as an app's would.
const FIXTURES = fileURLToPath(new URL("../../../../../node_modules/.flare-fixtures/", import.meta.url))
const BUILD = 120_000
const roots: string[] = []

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function write(root: string, files: Record<string, string>): void {
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(root, path)), { recursive: true })
		writeFileSync(join(root, path), text)
	}
}

// An app whose one page imports the `abeezee` registry family, and a font directory holding two families.
function fixture(): string {
	mkdirSync(FIXTURES, { recursive: true })
	const app = mkdtempSync(join(FIXTURES, "fonts-"))
	roots.push(app)
	write(app, {
		"src/client.tsx":
			'import { createClient } from "@lovrozagar/flare/client";\nimport { router } from "./router.ts";\ncreateClient(router);\n',
		"src/router.ts":
			'import { createRouter } from "@lovrozagar/flare";\nimport { chunks, layouts, routeTree } from "./_gen/routes.gen.ts";\nexport const router = createRouter({ layouts, routeTree, chunks });\n',
		"src/server.ts":
			'import { createServer } from "@lovrozagar/flare/server";\nimport { router } from "./router.ts";\nexport const server = createServer({ router });\n',
		"src/routes/_root_/root.root-layout.tsx":
			'import { createRootLayout } from "@lovrozagar/flare";\nexport const route = createRootLayout("_root_").render((props) => (\n\t<html>\n\t\t<head></head>\n\t\t<body>{props.children}</body>\n\t</html>\n));\n',
		"src/routes/_root_/home.page.tsx":
			'import { createPage } from "@lovrozagar/flare";\nimport abeezee from "@lovrozagar/flare/fonts/abeezee";\nexport const route = createPage("_root_/").render(() => <p>{abeezee.family}</p>);\n',
		"woff/abeezee/latin-400.woff2": "abeezee latin",
		"woff/abeezee/latin-i-400.woff2": "abeezee latin italic",
		"woff/abeezee/latin-ext-400.woff2": "abeezee latin-ext",
		"woff/abeezee/latin-ext-i-400.woff2": "abeezee latin-ext italic",
		"woff/abel/latin-400.woff2": "abel latin",
	})
	return app
}

async function build(app: string, options: FlareOptions): Promise<void> {
	const builder = await createBuilder({ root: app, configFile: false, logLevel: "silent", plugins: flare(options) })
	await builder.buildApp()
}

function emitted(app: string): string[] {
	const fonts = join(app, "dist/client/fonts")
	if (!existsSync(fonts)) return []
	return readdirSync(fonts, { recursive: true, encoding: "utf8" })
		.filter((name) => name.endsWith(".woff2"))
		.toSorted()
}

it(
	"fonts emit",
	async () => {
		const app = fixture()
		await build(app, { fonts: { dir: "woff" } })
		expect(emitted(app)).toEqual([
			"abeezee/latin-400.woff2",
			"abeezee/latin-ext-400.woff2",
			"abeezee/latin-ext-i-400.woff2",
			"abeezee/latin-i-400.woff2",
		])
	},
	BUILD,
)

it(
	"fonts absent",
	async () => {
		const app = fixture()
		await build(app, {})
		expect(emitted(app)).toEqual([])
		expect(existsSync(join(app, "dist/client"))).toBe(true)
	},
	BUILD,
)

it(
	"fonts dir missing file",
	async () => {
		const app = fixture()
		rmSync(join(app, "woff/abeezee/latin-ext-i-400.woff2"))
		await expect(build(app, { fonts: { dir: "woff" } })).rejects.toThrow(/abeezee\/latin-ext-i-400\.woff2/)
	},
	BUILD,
)

type Answer = { status?: number; headers: Record<string, string>; body?: string; ended: boolean }
type Middleware = (req: { url?: string; method?: string }, res: object, next: () => void) => unknown

// The middleware `vite dev` installs for `fonts: { dir }`, and one request through it.
function devMiddleware(root: string): Middleware {
	const used: Middleware[] = []
	const hook: unknown = fontsPlugin("woff").configureServer
	if (typeof hook !== "function") throw new Error("no configureServer")
	Reflect.apply(hook, undefined, [
		{ config: { root }, middlewares: { use: (handler: Middleware) => used.push(handler) } },
	])
	const middleware = used[0]
	if (middleware === undefined) throw new Error("no middleware")
	return middleware
}

async function serve(middleware: Middleware, url: string, method = "GET"): Promise<Answer | "next"> {
	const answer: Answer = { headers: {}, ended: false }
	const res = {
		set statusCode(status: number) {
			answer.status = status
		},
		setHeader: (name: string, value: string) => void (answer.headers[name] = value),
		end: (body?: Uint8Array) => {
			answer.ended = true
			if (body !== undefined) answer.body = new TextDecoder().decode(body)
		},
	}
	let passed = false
	await middleware({ url, method }, res, () => void (passed = true))
	return passed ? "next" : answer
}

// `vite dev` serves a registry url from `dir`, so the preload and `@font-face` load in dev too (BUGS.md B7).
it("dev serve", async () => {
	const middleware = devMiddleware(fixture())
	expect(await serve(middleware, "/fonts/abeezee/latin-400.woff2")).toEqual({
		status: 200,
		headers: { "content-type": "font/woff2", "cache-control": "no-cache" },
		body: "abeezee latin",
		ended: true,
	})
	const head = await serve(middleware, "/fonts/abel/latin-400.woff2?v=1", "HEAD")
	expect(head).toEqual({
		status: 200,
		headers: { "content-type": "font/woff2", "cache-control": "no-cache" },
		ended: true,
	})
})

// A url that is not a registry file, or a registry file `dir` lacks, is the app's: `public/fonts` or its 404.
it("dev fallthrough", async () => {
	const app = fixture()
	rmSync(join(app, "woff/abeezee/latin-ext-i-400.woff2"))
	const middleware = devMiddleware(app)
	for (const url of [
		"/fonts/abeezee/latin-ext-i-400.woff2",
		"/fonts/not-a-family/x.woff2",
		"/fonts/abeezee/../secret.woff2",
		"/fonts/abeezee/latin-400.ttf",
		"/about",
	]) {
		expect(await serve(middleware, url)).toBe("next")
	}
	expect(await serve(middleware, "/fonts/abeezee/latin-400.woff2", "POST")).toBe("next")
	let passed = false
	await middleware({ method: "GET" }, {}, () => void (passed = true))
	expect(passed).toBe(true)
})
