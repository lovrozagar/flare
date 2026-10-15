import { readFileSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import {
	prerendererOf,
	type PrerenderEntry,
	type PrerenderPage,
	type PrerenderParams,
	type Prerenderer,
	type PrerenderResult,
} from "../../shared/protocol/prerender.ts"
import { sitemap, type SitemapBuild, type SitemapOptions } from "../../features/seo/vite/index.ts"
import { authHint, type AuthHint } from "../codegen/auth-hint.ts"
import { generateRoutes } from "../codegen/routes.ts"
import { scanRoute } from "../codegen/scan.ts"
import { routeFilesOf } from "../codegen/write.ts"
import { writeSeed } from "./artifacts.ts"

type Env = Record<string, unknown>

// `flare({ prerender })` once parsed: `false` when omitted or off (dx/plugin.md).
export type PrerenderConfig = {
	concurrency?: number
	env?: Env | (() => Env | Promise<Env>)
	exclude?: readonly string[]
	sitemap?: SitemapOptions
}

// `hint` is undefined for a page codegen does not know. `writeFile` writes a file at the client output root.
export type RunInput = {
	prerenderer: Prerenderer
	config: PrerenderConfig | false
	hint: (id: string) => AuthHint | undefined
	write: (key: string, entry: PrerenderEntry) => Promise<unknown>
	writeFile: (name: string, body: string) => Promise<unknown>
	// A Workers app's server, prerendered on Node (B109): a failed page names the binding cause.
	workers?: boolean
}

export type RunResult = { code: 0 | 1; stderr: string[] }

type Job = { id: string; params: PrerenderParams }

type Written = { key: string; entry: PrerenderEntry }

type Rendered = { id: string; path: string }

// Renders every ssg page and every isr page with params (B49). Each page is checked first: `authorize`, a chain that
// requires auth, a codegen hint that disagrees with the loaded modules (B25), and a dynamic page with no params fail
// before anything renders. A render that is not a 200 with an entry fails the build. Then the sitemap, when set, is
// built from every route and the paths just rendered. Seeds and the sitemap's files are written only when every page
// rendered and the sitemap has no error, so a failed build writes nothing. Each problem names its route.
export async function runPrerender(input: RunInput): Promise<RunResult> {
	const pages = (await input.prerenderer.pages()).filter((page) => page.mode === "ssg" || page.listed)
	if (input.config === false) return failed(pages.map(off))
	const excluded = new Set(input.config.exclude ?? [])
	const targets = pages.filter((page) => !excluded.has(page.id))
	const refused = targets.flatMap((page) => refusal(page, input.hint(page.id)))
	if (refused.length > 0) return failed(refused)
	const env = typeof input.config.env === "function" ? await input.config.env() : (input.config.env ?? {})
	const jobs = await jobsOf(input.prerenderer, targets)
	const results = await inGroups(jobs, input.config.concurrency ?? 1, async (job) => ({
		job,
		result: await input.prerenderer.render({ ...job, env }),
	}))
	const problems: string[] = []
	const written: Written[] = []
	const rendered: Rendered[] = []
	for (const done of results) settle({ ...done, problems, written, rendered, workers: input.workers === true })
	if (problems.length > 0) return failed(problems)
	const map = await sitemapOf(input, input.config.sitemap, rendered)
	if (map.errors.length > 0) return failed(map.errors)
	for (const seed of written) await input.write(seed.key, seed.entry)
	for (const file of map.files) await input.writeFile(file.name, file.body)
	return { code: 0, stderr: [] }
}

// The sitemap step (dx/seo.md): every route the built server describes, and the paths prerender already rendered.
async function sitemapOf(
	input: RunInput,
	options: SitemapOptions | undefined,
	rendered: readonly Rendered[],
): Promise<SitemapBuild> {
	if (options === undefined) return { files: [], errors: [] }
	const site = input.prerenderer.site
	if (site === undefined) return { files: [], errors: ["prerender.sitemap reads createServer({ site })"] }
	return sitemap(options)({ site, routes: await input.prerenderer.routes(), rendered, hint: input.hint })
}

function failed(lines: readonly string[]): RunResult {
	return lines.length === 0
		? { code: 0, stderr: [] }
		: { code: 1, stderr: lines.map((line) => `[flare:prerender] ${line}`) }
}

function off(page: PrerenderPage): string {
	return `${page.id} renders at build, and flare({ prerender }) is off. Set prerender, or make the route live`
}

function refusal(page: PrerenderPage, hint: AuthHint | undefined): string[] {
	if (page.authorize) return [`${page.id} has authorize: a prerendered page is public`]
	if (page.auth.requires) return [`${page.id} requires auth (401): a prerendered page is public`]
	const runtime: AuthHint = page.auth.reads ? "reads" : "public"
	if (hint !== undefined && hint !== runtime)
		return [`${page.id}: the codegen auth hint says ${hint}, the loaded modules say ${runtime} (B25)`]
	if (page.dynamic && !page.listed) return [`${page.id} is a dynamic ${page.mode} page with no params`]
	return []
}

async function jobsOf(prerenderer: Prerenderer, pages: readonly PrerenderPage[]): Promise<Job[]> {
	const jobs = await Promise.all(
		pages.map(async (page) => (await prerenderer.params(page.id)).map((params) => ({ id: page.id, params }))),
	)
	return jobs.flat()
}

// At most `size` renders at once, in order.
async function inGroups<T, R>(items: readonly T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = []
	for (let start = 0; start < items.length; start += size) {
		results.push(...(await Promise.all(items.slice(start, start + size).map(run))))
	}
	return results
}

type Settle = {
	job: Job
	result: PrerenderResult
	problems: string[]
	written: Written[]
	rendered: Rendered[]
	workers: boolean
}

// A Workers app prerenders on Node (B109): a loader that needs a binding fails there, and this says why.
const WORKERS_CAUSE =
	"prerender runs the server on Node at build time, with no Workers binding (KV, D1, R2, caches). A route whose " +
	"loader needs one cannot be prerendered: mark it ssr or isr"

function settle(at: Settle): void {
	const where = `${at.job.id} ${JSON.stringify(at.job.params)}`
	const { status, key, entry } = at.result
	if (status !== 200) at.problems.push(`${where} answered ${status}${at.workers ? `: ${WORKERS_CAUSE}` : ""}`)
	else if (key === undefined || entry === undefined) at.problems.push(`${where} rendered nothing storable`)
	else {
		at.written.push({ key, entry })
		at.rendered.push({ id: at.job.id, path: at.result.path })
	}
}

export type AppInput = {
	root: string
	serverFile: string
	clientDir: string
	assetsBase: string
	config: PrerenderConfig | false
	workers?: boolean
}

// After the server build: load the built server, check its pages against the codegen hints, render, and write the
// seeds into the client output. A failure throws, so `vite build` exits non-zero with every line (B49).
export async function prerenderApp(input: AppInput): Promise<void> {
	const loaded: unknown = await import(pathToFileURL(input.serverFile).href)
	const prerenderer = prerendererOf(Reflect.get(Object(loaded), "server"))
	if (prerenderer === undefined) throw new Error(`${input.serverFile} exports no server made by createServer`)
	const result = await runPrerender({
		prerenderer,
		config: input.config,
		hint: hintsOf(input.root),
		write: (key, entry) => writeSeed({ clientDir: input.clientDir, assetsBase: input.assetsBase, key, entry }),
		writeFile: (name, body) => writeFile(join(input.clientDir, name), body),
		workers: input.workers === true,
	})
	if (result.code !== 0) throw new Error(`prerender failed\n${result.stderr.join("\n")}`)
}

// Each page's auth hint, from the codegen scan of its chain's files: its layouts and the page itself (B25).
export function hintsOf(root: string): (id: string) => AuthHint | undefined {
	const routesDir = join(root, "src/routes")
	const read = (file: string): string => readFileSync(join(routesDir, file), "utf8")
	const files = routeFilesOf(root)
	const hints = new Map<string, AuthHint>()
	if (files.length > 0) {
		const generated = generateRoutes(files, read)
		for (const route of generated.routes) {
			const layouts = generated.layouts.filter((layout) => route.id.startsWith(`${layout.id}/`))
			hints.set(route.id, authHint([...layouts, route].map((item) => scanRoute(item.file, read(item.file)))))
		}
	}
	// A page codegen does not know, such as one of a router written by hand, has no hint to disagree with.
	return (id) => hints.get(id)
}
