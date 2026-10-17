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

// The dev server names the missing peers on the first page that reaches the matcher: its error page carries the
// message (dx/plugin.md Development errors). The terminal does not yet (BUGS.md 301).
it("i18n without peers, dev", async () => {
	const dir = staged("i18n-dev")
	useI18n(dir)
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
		expect([home.status, message("i18n").filter((line) => !page.includes(line)), page]).toEqual([
			500,
			[],
			expect.any(String),
		])
	} finally {
		await dev.stop()
	}
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

it("query without solid-query", () => {
	const dir = staged("query")
	const page = join(dir, "src/routes/_root_/home.page.tsx")
	edit(
		page,
		'import { createPage } from "@lovrozagar/flare"\n',
		'import { createPage } from "@lovrozagar/flare"\nimport { createQueryClientGetter } from "@lovrozagar/flare/query"\n\nexport const queryClient = createQueryClientGetter()\n',
	)
	const built = buildApp(current(), dir)
	expect([built.status, message("query").filter((line) => !built.output.includes(line)), built.output]).toEqual([
		1,
		[],
		expect.any(String),
	])
})
