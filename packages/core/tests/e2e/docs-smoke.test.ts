import { appendFileSync } from "node:fs"
import type { Page } from "@playwright/test"
import { bootCopy } from "./copy-boot.ts"
import { loadHydrated } from "../../src/testing/playwright.ts"
import { dataTraffic, documents, expect, isProd, open, serverOf, test } from "./docs.fixture.ts"
import { PAGES } from "./docs-pages.ts"
import { flushEvents } from "./flush.ts"

// Every project (B94): each page of the docs route map answers its status, hydrates, and leaves the console empty.
// A document whose own status is not 200 logs that resource failure, and nothing else (docs-pages.ts).

test.describe("every page hydrates", () => {
	for (const { path, status } of PAGES) {
		test(path, async ({ page, docs }) => {
			const statuses: number[] = []
			page.on("response", (response) => {
				if (response.request().resourceType() === "document") statuses.push(response.status())
			})
			const problems = await open(page, docs.origin, path)
			// A changelog fill and the deferred values settle after hydrate.
			await page.waitForLoadState("networkidle")
			expect(statuses[0]).toBe(status)
			const own = `status of ${status}`
			expect(problems.filter((problem) => status === 200 || !problem.includes(own))).toEqual([])
		})
	}
})

// The hydration wait still fails a page that never hydrates: with every script request aborted, the client never
// boots, and the wait throws at its deadline instead of hanging (BUGS.md 107).
test("never hydrated", async ({ page, docs }) => {
	await page.route("**/*", (route) => (route.request().resourceType() === "script" ? route.abort() : route.fallback()))
	const url = `${docs.origin}/docs/routing`
	await expect(loadHydrated(page, url, { deadline: 3000, slice: 1000 })).rejects.toThrow(
		"The page never hydrated: no html[data-flare-hydrated] within 3000 ms",
	)
	expect(await page.locator("#doc-title").textContent()).toBe("Routing")
})

// A production page logs nothing once the engine's unused-preload check has run: a lazy route's modulepreload names
// no chunk the page already loaded (BUGS.md 79), and the stylesheet's preload is used (BUGS.md 81). The page is served
// with one more preload nothing uses, so the check's warning about it says the check ran, and it is the only warning.
// Chromium and WebKit run that check about 3 s after the load event; Playwright's Firefox has none.
test("preloads settle", async ({ page, docs, browserName }, info) => {
	test.skip(!isProd(info), "preloads are production markup")
	test.skip(browserName === "firefox", "this engine has no unused-preload check")
	await page.route(`${docs.origin}${SENTINEL}`, (route) =>
		route.fulfill({ status: 200, contentType: "text/css", body: "/* never used */" }),
	)
	await page.route(`${docs.origin}/changelog`, async (route) => {
		const response = await route.fetch()
		const preload = `<link rel="preload" href="${SENTINEL}" as="style">`
		await route.fulfill({ response, body: (await response.text()).replace("</head>", `${preload}</head>`) })
	})
	const checked = page.waitForEvent("console", { predicate: (message) => message.text().includes(SENTINEL) })
	const problems = await open(page, docs.origin, "/changelog")
	await checked
	// The check warns in one task; a line the page logs after it arrives after all of its warnings.
	const flushed = page.waitForEvent("console", { predicate: (message) => message.text() === FLUSH })
	await page.evaluate((line) => console.log(line), FLUSH)
	await flushed
	expect(problems.filter((problem) => !problem.includes(SENTINEL))).toEqual([])
})

// The preload `preloads settle` adds and nothing uses, and the line that flushes the console after the check.
const SENTINEL = "/__unused-preload-sentinel.css"
const FLUSH = "preloads settle: console flushed"

// After hydrate the changelog fills its stream holes. The fill commits once its last value is in, so the commit is
// never held behind one, and Solid logs no SILENT_HOLD for it (BUGS.md 89). Solid warns during a hold, so once the
// fill's last value is on screen and the console is flushed, any warning has arrived.
test("fill holds nothing", async ({ page, docs }) => {
	const problems = await open(page, docs.origin, "/changelog")
	await expect(page.locator("#stats")).toContainText("18,420 downloads")
	await expect(page.locator("#latest")).toContainText("1.0.0")
	await flushEvents(page)
	expect(problems).toEqual([])
})

// Safari before 27 has no async iteration of ReadableStream (BUGS.md 123): with it removed before the page runs, a
// sidebar navigation still lands as a client navigation, and a streamed server function still delivers every line.
test("no stream iteration", async ({ page, docs }) => {
	await page.addInitScript(() => {
		Reflect.deleteProperty(ReadableStream.prototype, Symbol.asyncIterator)
		Reflect.deleteProperty(ReadableStream.prototype, "values")
	})
	await open(page, docs.origin, "/docs/routing")
	const loads = documents(page)
	await page.locator("#sidebar").getByRole("link", { name: "Caching" }).click()
	await expect(page.locator("#doc-title")).toHaveText("Caching")
	await page.locator("#nav").getByRole("link", { name: "Playground", exact: true }).click()
	await page.locator("#stream-start").click()
	await expect(page.locator("#stream-status")).toHaveText("done")
	await expect(page.locator("#stream-log li")).toHaveCount(6)
	expect(loads).toEqual([])
})

test("click through", async ({ page, docs }) => {
	const problems = await open(page, docs.origin, "/")
	const loads = documents(page)
	await page.evaluate(() => Reflect.set(document.getElementById("nav") ?? {}, "docsMark", 1))
	await page.locator('[data-feature="routing"]').click()
	await expect(page.locator("#doc-title")).toHaveText("Routing")
	await page.locator("#sidebar").getByRole("link", { name: "Caching" }).click()
	await expect(page.locator("#doc-title")).toHaveText("Caching")
	await page.goBack()
	await expect(page.locator("#doc-title")).toHaveText("Routing")
	await page.goBack()
	await expect(page.locator("#message")).toHaveText("Hello")
	expect(loads).toEqual([])
	expect(await page.evaluate(() => Reflect.get(document.getElementById("nav") ?? {}, "docsMark"))).toBe(1)
	expect(problems).toEqual([])
})

// A node the server did not write, put into the served <head> the way an extension or a proxy does, at the start or
// between Flare's own nodes: the page still hydrates, a header link renders the API page, and the node stays where it
// was put (BUGS.md 120). `first` reads the node back from the hydrated head.
const FOREIGN: readonly { name: string; edit: (html: string) => string; first: string }[] = [
	{ name: "meta", edit: (html) => afterHead(html, '<meta name="x-ext" content="1">'), first: "META x-ext" },
	{ name: "style", edit: (html) => afterHead(html, "<style>.x-ext { color: red }</style>"), first: "STYLE" },
	{ name: "script", edit: (html) => afterHead(html, "<script>void 0</script>"), first: "SCRIPT" },
	{ name: "comment", edit: (html) => afterHead(html, "<!-- x-ext -->"), first: "#comment x-ext" },
	{ name: "whitespace", edit: (html) => afterHead(html, "\n  "), first: "#text" },
	{
		name: "between",
		edit: (html) => html.replace("<!--/-->", '<!--/--><meta name="x-ext" content="1">'),
		first: "#comment $",
	},
]

function afterHead(html: string, node: string): string {
	return html.replace(/<head[^>]*>/, (open) => `${open}${node}`)
}

// /docs/routing with its served HTML edited, as a proxy edits it.
async function serveEdited(page: Page, origin: string, edit: (html: string) => string): Promise<void> {
	await page.route(`${origin}/docs/routing`, async (route) => {
		const response = await route.fetch()
		await route.fulfill({ response, body: edit(await response.text()) })
	})
}

test.describe("foreign head node", () => {
	for (const { name, edit, first } of FOREIGN) {
		test(name, async ({ page, docs }) => {
			await serveEdited(page, docs.origin, edit)
			await open(page, docs.origin, "/docs/routing")
			await page.locator('#nav a[href="/api/server/create-server"]').click()
			await expect(page.locator("#api-name")).toHaveText("createServer")
			const head = await page.evaluate(() => {
				const node = document.head.firstChild
				const label = node instanceof Element ? `${node.tagName} ${node.getAttribute("name") ?? ""}`.trim() : ""
				const nodeLabel = node === null ? "none" : `${node.nodeName} ${node.nodeValue?.trim() ?? ""}`.trim()
				const ext = document.head.querySelectorAll('[name="x-ext"]')
				return { first: label === "" ? nodeLabel : label, ext: ext.length, after: ext[0]?.previousSibling?.nodeValue }
			})
			expect(head.first).toBe(first)
			expect(head.ext).toBe(name === "meta" || name === "between" ? 1 : 0)
			if (name === "between") expect(head.after).toBe("/")
		})
	}
})

// Init script: every mutation batch that moved the served `meta[name=x-ext]`, and frames that lacked it once seen.
function watchExt(): void {
	const batches: { removed: number; added: number }[] = []
	const watch = { seen: false, missing: 0 }
	Reflect.set(window, "xExtWatch", { batches, watch })
	new MutationObserver((records) => {
		const removed = records
			.flatMap((record) => [...record.removedNodes])
			.filter((node) => node instanceof Element && node.getAttribute("name") === "x-ext").length
		const added = records
			.flatMap((record) => [...record.addedNodes])
			.filter((node) => node instanceof Element && node.getAttribute("name") === "x-ext").length
		if (removed + added > 0) batches.push({ removed, added })
	}).observe(document, { childList: true, subtree: true })
	const tick = (): void => {
		const present = document.querySelector('meta[name="x-ext"]') !== null
		if (present) watch.seen = true
		else if (watch.seen) watch.missing += 1
		requestAnimationFrame(tick)
	}
	requestAnimationFrame(tick)
}

// Init script: an extension that keeps its style first in <head>, puts it back whenever it moves, and samples the
// body's background on every frame.
function fightingExtension(): void {
	const style = document.createElement("style")
	style.setAttribute("data-ext", "")
	style.textContent = "body { background-color: rgb(1, 2, 3) !important }"
	const samples: string[] = []
	Reflect.set(window, "xExtSamples", samples)
	new MutationObserver(() => {
		const head = document.head
		if (head !== null && head.firstChild !== style) head.insertBefore(style, head.firstChild)
	}).observe(document, { childList: true, subtree: true })
	const tick = (): void => {
		if (document.body !== null) samples.push(getComputedStyle(document.body).backgroundColor)
		requestAnimationFrame(tick)
	}
	requestAnimationFrame(tick)
}

// The guard against what an extension sees (B120). Its own nodes are exempt from the page's CSP, so these cases
// bypass it. `same task`: the guard took the node out and put it back in one mutation batch, so no microtask, let
// alone a frame, ran between, and every frame after the node first appeared still had it. `fights back`: a style
// the extension keeps first in <head>, put back whenever it is moved, ends as one node whose rule held on every
// frame. `runs once`: a foreign script is not run again by its return.
test.describe("foreign head extension", () => {
	test.use({ bypassCSP: true })

	test("same task", async ({ page, docs }) => {
		await page.addInitScript(watchExt)
		await serveEdited(page, docs.origin, (html) => afterHead(html, '<meta name="x-ext" content="1">'))
		await open(page, docs.origin, "/docs/routing")
		await page.locator('#nav a[href="/api/server/create-server"]').click()
		await expect(page.locator("#api-name")).toHaveText("createServer")
		const { batches, watch } = await page.evaluate(() => Reflect.get(window, "xExtWatch"))
		const moves = batches.filter((batch: { removed: number }) => batch.removed > 0)
		expect(moves.length).toBeGreaterThan(0)
		expect(moves).toEqual(moves.map((batch: { removed: number }) => ({ removed: batch.removed, added: batch.removed })))
		expect(watch).toEqual({ seen: true, missing: 0 })
	})

	test("fights back", async ({ page, docs }) => {
		await page.addInitScript(fightingExtension)
		await open(page, docs.origin, "/docs/routing")
		await page.locator('#nav a[href="/api/server/create-server"]').click()
		await expect(page.locator("#api-name")).toHaveText("createServer")
		expect(await page.locator("style[data-ext]").count()).toBe(1)
		const samples: string[] = await page.evaluate(() => Reflect.get(window, "xExtSamples"))
		expect(samples.length).toBeGreaterThan(0)
		expect(new Set(samples)).toEqual(new Set(["rgb(1, 2, 3)"]))
	})

	test("runs once", async ({ page, docs }) => {
		await serveEdited(page, docs.origin, (html) =>
			afterHead(html, "<script>window.xExtRuns = (window.xExtRuns ?? 0) + 1;</script>"),
		)
		await open(page, docs.origin, "/docs/routing")
		await page.locator('#nav a[href="/api/server/create-server"]').click()
		await expect(page.locator("#api-name")).toHaveText("createServer")
		expect(await page.evaluate(() => Reflect.get(window, "xExtRuns"))).toBe(1)
		expect(await page.evaluate(() => document.head.firstElementChild?.textContent)).toContain("xExtRuns")
	})
})

// `public/` ships with the client and is served from it on every project (BUGS.md B11). An `.ico` is either of its
// registered types: Node's static layer says `image/x-icon`, the Workers assets binding `image/vnd.microsoft.icon`.
const PUBLIC: readonly { path: string; type: RegExp }[] = [
	{ path: "/favicon.ico", type: /^image\/(x-icon|vnd\.microsoft\.icon)/ },
	{ path: "/icon.svg", type: /^image\/svg\+xml/ },
	{ path: "/apple-touch-icon.png", type: /^image\/png/ },
	{ path: "/manifest.webmanifest", type: /^application\/manifest\+json/ },
	{ path: "/fonts/mono.woff2", type: /^font\/woff2/ },
]

test("public files", async ({ http, docs }) => {
	for (const { path, type } of PUBLIC) {
		const response = await http.get(`${docs.origin}${path}`)
		expect(response.status(), path).toBe(200)
		expect(response.headers()["content-type"], path).toMatch(type)
		expect((await response.body()).byteLength, path).toBeGreaterThan(0)
	}
})

// While every page of the route map loads, each in its own tab, the dev server logs no HTML it could not parse and no
// uncaught error, and its flare error lines are exactly the ones the pages declare (BUGS.md B8). Only the lines this
// test adds are read: the boot is shared with the other specs.
test("dev log clean", async ({ context, docs }, info) => {
	test.skip(isProd(info), "reads the dev server's log")
	// Every page in one test, each a cold dev compile the first time.
	test.setTimeout(120_000)
	const start = docs.logs().length
	for (const { path, shows } of PAGES) {
		const page = await context.newPage()
		await open(page, docs.origin, path)
		await page.waitForLoadState("networkidle")
		// Network idle can come before the post-hydrate fill starts, when hydration takes longer than its 500 ms of quiet,
		// and the page would close before the fill ran the value that logs (BUGS.md 93).
		if (shows !== undefined) await expect(page.locator(shows)).toBeVisible()
		await page.close()
	}
	const declared = PAGES.flatMap((entry) => entry.logs ?? [])
	// A line no page declares stays whole, so an extra one shows as itself. Workers dev forwards workerd's console
	// through Miniflare's structured logs to Vite's logger, after the response, so the lines are awaited (BUGS.md 93).
	const flare = () =>
		docs
			.logs()
			.slice(start)
			.filter((line) => line.startsWith("[flare:"))
			.map((line) => declared.find((message) => line.includes(message)) ?? line)
	await expect.poll(flare, { timeout: 10_000 }).toEqual(declared)
	const lines = docs.logs().slice(start)
	expect(lines.filter((line) => /Unable to parse|uncaught|unhandled/i.test(line))).toEqual([])
})

// Five main-nav links 30 ms apart. The first, Changelog, has landed with its 900 ms stats value still streaming (or
// filling, once the page is stored), so the next click aborts a body mid-stream. A superseded navigation resolves, its
// page keeps its fallbacks until the next commit, and the page reports no error (B58, B105).
test("rapid links", async ({ page, docs }) => {
	const errors: string[] = []
	page.on("pageerror", (error) => errors.push(`${error.name}: ${error.message}\n${error.stack ?? ""}`))
	await open(page, docs.origin, "/docs/routing")
	const traffic = dataTraffic(page)
	// Clicked from the page, so no actionability wait stretches the 30 ms.
	const streaming = await page.evaluate(
		async ({ nav, paths }) => {
			const link = (path: string) =>
				[...document.querySelectorAll<HTMLAnchorElement>(nav)].find((item) => item.pathname === path)
			link("/changelog")?.click()
			while (document.querySelector("main h1")?.textContent !== "Changelog") {
				await new Promise((resolve) => requestAnimationFrame(resolve))
			}
			const pending = document.querySelector("#stats-loading") !== null
			for (const path of paths) {
				link(path)?.click()
				await new Promise((resolve) => setTimeout(resolve, 30))
			}
			return pending
		},
		{ nav: "#nav nav a", paths: ["/api/server/create-server", "/examples", "/playground", "/docs/routing"] },
	)
	expect(streaming).toBe(true)
	await expect(page.locator("#doc-title")).toHaveText("Routing")
	// Every superseded navigation has ended, finished or aborted, and its page errors have arrived.
	await expect.poll(() => traffic.pending()).toBe(0)
	await flushEvents(page)
	expect(errors).toEqual([])
})

// A dev hard load is styled before any client module runs: with every script blocked, Vite's client and the app's
// entry included, the server's own dev styles already style the first paint (B104, BUGS.md B59).
test("dev first paint", async ({ page, docs }, info) => {
	test.skip(isProd(info), "dev styles")
	await page.route("**/*", (route) => (route.request().resourceType() === "script" ? route.abort() : route.continue()))
	await page.goto(`${docs.origin}/docs/routing`, { waitUntil: "domcontentloaded" })
	await expect(page.locator("body")).toHaveCSS("margin", "0px")
	await expect(page.locator("h1").first()).toHaveCSS("font-weight", "600")
	await expect(page.locator("#nav")).toHaveCSS("position", "sticky")
})

// The client adopts the server's dev styles: one style per module id after hydration, Tailwind's entry compiled (B104).
test("dev styles adopted", async ({ page, docs }, info) => {
	test.skip(isProd(info), "dev styles")
	await open(page, docs.origin, "/docs/routing")
	const first = await styleIds(page)
	expect(first.some((id) => id.endsWith("/src/styles.css"))).toBe(true)
	// Tailwind's entry comes out compiled: a generated utility's rule is in it, not the `@import` source.
	const tailwind = await page.evaluate(
		() => document.querySelector<HTMLStyleElement>('style[data-vite-dev-id$="/src/styles.css"]')?.textContent ?? "",
	)
	expect(tailwind).toMatch(/\.mx-auto\s*\{/)
	expect(tailwind).not.toContain('@import "tailwindcss"')
	expect(new Set(first).size).toBe(first.length)
})

// An edit of the app's stylesheet hot-updates the adopted style in place: the new rule applies, one style per module id
// remains, and the page is not reloaded, so its state survives. The edit is on a private copy of the app, under its own
// dev server, so no other boot sees it (B70, BUGS.md 111).
test("dev styles hmr", async ({ page }, info) => {
	test.skip(isProd(info), "dev styles")
	const session = await bootCopy({ app: "docs", runtime: serverOf(info).split("-")[0] ?? "node" })
	try {
		const problems = await open(page, session.origin, "/docs/routing")
		await page.evaluate(() => Object.assign(window, { b59Kept: true }))
		const file = `${session.appDir}/src/styles.css`
		appendFileSync(file, "\n.b59-hmr-probe { color: rgb(1, 2, 3); }\n")
		await page.evaluate(() => {
			const probe = document.createElement("p")
			probe.className = "b59-hmr-probe"
			probe.id = "b59-probe"
			document.body.append(probe)
		})
		await expect(page.locator("#b59-probe")).toHaveCSS("color", "rgb(1, 2, 3)")
		expect(await page.evaluate(() => Reflect.get(window, "b59Kept"))).toBe(true)
		const after = await styleIds(page)
		expect(after.filter((id) => id.endsWith("/src/styles.css"))).toHaveLength(1)
		expect(new Set(after).size).toBe(after.length)
		const logs = session.logs()
		expect(logs.some((line) => /hmr update .*\/src\/styles\.css/.test(line))).toBe(true)
		expect(logs.filter((line) => line.includes("page reload"))).toEqual([])
		expect(problems).toEqual([])
	} finally {
		await session.close()
	}
})

function styleIds(page: Page): Promise<string[]> {
	return page.evaluate(() =>
		[...document.querySelectorAll("style[data-vite-dev-id]")].map(
			(style) => style.getAttribute("data-vite-dev-id") ?? "",
		),
	)
}
