import { readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { afterAll, beforeAll, expect, it } from "vitest"
import type { PinnedNode } from "../../../../scripts/node-at.ts"
import {
	buildApp,
	copyMinimal,
	install,
	MANIFEST,
	nodes,
	OPTIONAL,
	peerSpecs,
	project,
	serve,
	tarball,
	type Project,
} from "./stage.ts"

// A feature used without its optional peer fails with one message per missing peer, each naming the peer and the
// command that installs it at the package's range (plan 21 5.5, dx/features.md), at build and in dev. A built server
// bundles the i18n peers, so a deploy that drops them after the build still answers.
const FEATURES = {
	i18n: ["@formatjs/intl-localematcher", "isbot", "negotiator"],
	image: ["sharp"],
	query: ["@tanstack/solid-query"],
} as const

// Set once before the cases: the pinned Node 24 and the tarball.
const run: { current?: PinnedNode; packed?: string } = {}
const projects: Project[] = []

beforeAll(async () => {
	run.current = (await nodes()).current
	const out = project("pack")
	projects.push(out)
	run.packed = tarball(run.current, out.dir)
})

afterAll(() => {
	for (const each of projects) each.close()
})

function current(): PinnedNode {
	if (run.current === undefined) throw new Error("optional.consumer: no pinned Node")
	return run.current
}

function message(feature: keyof typeof FEATURES): string[] {
	return FEATURES[feature].map(
		(peer) =>
			`flare: ${feature} needs ${peer}. Install it: npm install ${peer}@"${MANIFEST.peerDependencies?.[peer] ?? ""}"`,
	)
}

// The minimal app with `specs` installed, the optional peers left out unless named.
function staged(name: string, specs: readonly string[] = []): string {
	const app = project(name)
	projects.push(app)
	copyMinimal(app.dir)
	const peers = [...peerSpecs(MANIFEST, "floor", { without: OPTIONAL }), ...specs]
	const added = install(current(), { dir: app.dir, packed: run.packed ?? "", specs: peers, legacy: true })
	expect([added.status, added.output]).toEqual([0, expect.any(String)])
	return app.dir
}

function edit(path: string, from: string, to: string): void {
	const text = readFileSync(path, "utf8")
	expect(text).toContain(from)
	writeFileSync(path, text.replace(from, to))
}

// The minimal app as an i18n app: one locale on the router, and the server's locale slot from `i18n`.
function useI18n(dir: string): void {
	edit(
		join(dir, "src/router.ts"),
		"createRouter({ layouts, routeTree, chunks })",
		'createRouter({ layouts, routeTree, chunks, locale: { locales: ["en"], defaultLocale: "en" } })',
	)
	edit(
		join(dir, "src/server.ts"),
		"export const server = createServer({\n\trouter,",
		'import { i18n } from "@lovrozagar/flare/i18n/server"\n\nexport const server = createServer({\n\trouter,\n\tlocale: i18n({ locales: ["en"], defaultLocale: "en" }),',
	)
}

it("i18n without peers", () => {
	const dir = staged("i18n")
	useI18n(dir)
	const built = buildApp(current(), dir)
	expect([built.status, message("i18n").filter((line) => !built.output.includes(line)), built.output]).toEqual([
		1,
		[],
		expect.any(String),
	])
})

// A deploy that drops the peers after a build that had them: the built server holds them, so it still answers.
it("i18n peers removed after build", async () => {
	const dir = staged(
		"i18n-runtime",
		peerSpecs(MANIFEST, "floor").filter((spec) => FEATURES.i18n.some((peer) => spec.startsWith(`${peer}@`))),
	)
	useI18n(dir)
	const built = buildApp(current(), dir)
	expect([built.status, built.output]).toEqual([0, expect.any(String)])
	for (const peer of FEATURES.i18n) rmSync(join(dir, "node_modules", peer), { recursive: true, force: true })
	const served = await serve(current(), { dir, args: () => ["serve.js"], timeout: 30_000 })
	try {
		const home = await fetch(`${served.origin}/`, { headers: { "x-sentinel": "i18n-bundled" } })
		expect([home.status, (await home.text()).includes("i18n-bundled")]).toEqual([200, true])
	} finally {
		await served.stop()
	}
})

// The dev server's first page names every missing peer twice: its error page carries the message, and the terminal
// that runs `vite dev` logs it (dx/plugin.md Development errors, BUGS.md 301). The lines missing from each, empty when
// both name every peer; the terminal gets 10 s to log.
async function devNames(
	dir: string,
	feature: keyof typeof FEATURES,
): Promise<{ status: number; page: string[]; terminal: string[] }> {
	const vite = join(dir, "node_modules/vite/bin/vite.js")
	const dev = await serve(current(), {
		dir,
		args: (port) => [vite, "--port", String(port), "--strictPort", "--host", "127.0.0.1"],
		timeout: 60_000,
	})
	try {
		const home = await fetch(`${dev.origin}/`)
		// The dev error page shows the message as escaped text.
		const page = (await home.text()).replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&amp;", "&")
		const missing = (text: () => string) => message(feature).filter((line) => !text().includes(line))
		const deadline = Date.now() + 10_000
		while (missing(dev.output).length > 0 && Date.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 200))
		}
		return { status: home.status, page: missing(() => page), terminal: missing(dev.output) }
	} finally {
		await dev.stop()
	}
}

// The server entry imports the i18n server, so the entry itself fails to load.
it("i18n without peers, dev", async () => {
	const dir = staged("i18n-dev")
	useI18n(dir)
	expect(await devNames(dir, "i18n")).toEqual({ status: 500, page: [], terminal: [] })
})

// A page imports the query module, so the entry loads and the page's own module fails as the request renders it:
// the app's logger names it, and the built-in error page carries it (BUGS.md 302).
it("query without solid-query, dev", async () => {
	const dir = staged("query-dev")
	useQuery(dir)
	expect(await devNames(dir, "query")).toEqual({ status: 500, page: [], terminal: [] })
})

it("image without sharp", () => {
	const dir = staged("image")
	edit(join(dir, "vite.config.ts"), "flare({ prerender: true })", "flare({ prerender: true, image: {} })")
	const built = buildApp(current(), dir)
	expect([built.status, message("image").filter((line) => !built.output.includes(line)), built.output]).toEqual([
		1,
		[],
		expect.any(String),
	])
})

// The minimal app's home page as a query page.
function useQuery(dir: string): void {
	edit(
		join(dir, "src/routes/_root_/home.page.tsx"),
		'import { createPage } from "@lovrozagar/flare"\n',
		'import { createPage } from "@lovrozagar/flare"\nimport { createQueryClientGetter } from "@lovrozagar/flare/query"\n\nexport const queryClient = createQueryClientGetter()\n',
	)
}

it("query without solid-query", () => {
	const dir = staged("query")
	useQuery(dir)
	const built = buildApp(current(), dir)
	expect([built.status, message("query").filter((line) => !built.output.includes(line)), built.output]).toEqual([
		1,
		[],
		expect.any(String),
	])
})
