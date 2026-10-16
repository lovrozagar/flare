import { createComponent, type Element } from "solid-js"
import { Dynamic } from "@solidjs/web"
import { expect, expectTypeOf, it } from "vitest"
import type { CacheConfig } from "../../shared/route-builder/chain.ts"
import { decide, type DecideInput } from "./decide.ts"
import { createPage } from "../../shared/route-builder/page.ts"
import { createRootLayout } from "../../shared/route-builder/root-layout.ts"
import { createPathSegment } from "../../shared/route-builder/segment.ts"
import { createRouter } from "../../shared/router/create-router.ts"
import { createMemoryStore } from "../cache/memory.ts"
import { serveWith } from "../lifecycle/create.ts"

const open = { requires: false, reads: false }
const reads = { requires: false, reads: true }
const requires = { requires: true, reads: true }

// The chain is each match's `cache`, root to page. The page is last.
function input(page: CacheConfig | undefined, extra: Partial<DecideInput> = {}): DecideInput {
	return { chain: [undefined, page], auth: open, session: false, ...extra }
}

const ssr = { ssr: { ttl: "1h" } }

it("no config", () => {
	expect(decide(input(undefined)).policy).toBe("no-store")
})

it("ssr public", () => {
	expect(decide(input(ssr))).toMatchObject({ policy: "shared", class: "public" })
})

it("required auth", () => {
	expect(decide(input(ssr, { auth: requires, session: true })).policy).toBe("no-store")
})

// The store key gets no class segment (B73): the class only tells the header apart.
it("optional auth", () => {
	expect(decide(input(ssr, { auth: reads }))).toMatchObject({ policy: "shared", class: "anonymous" })
})

it("isr", () => {
	expect(decide(input({ isr: true }))).toMatchObject({ policy: "shared", class: "public" })
})

it("isr under auth", () => {
	expect(decide(input({ isr: true }, { auth: requires })).policy).toBe("no-store")
})

it("cdn private", () => {
	expect(decide(input({ ...ssr, cdn: { private: true } })).policy).toBe("private")
})

it("cdn without a mode", () => {
	const cdn: CacheConfig = { cdn: { maxAge: "60s" } }
	expectTypeOf(cdn).toMatchTypeOf<CacheConfig>()
	expect(decide(input(cdn)).policy).toBe("no-store")
})

// Only the anonymous answer is shared (B27).
it("optional with session", () => {
	expect(decide(input(ssr, { auth: reads, session: true })).policy).toBe("private")
})

it("ssg", () => {
	expect(decide(input({ ssg: true }))).toMatchObject({ policy: "shared", class: "public" })
})

it("ssg under auth", () => {
	expect(decide(input({ ssg: true }, { auth: requires })).policy).toBe("no-store")
})

// A segment's or a layout's `cdn` is a default for the pages under it. The nearer match wins per field.
it("segment cdn", () => {
	const chain = [{ cdn: { maxAge: "60s" } }, { isr: true as const, cdn: { swr: "30s" } }]
	expect(decide({ chain, auth: open, session: false }).cdn).toEqual({ maxAge: "60s", swr: "30s" })
	const own = [{ cdn: { maxAge: "60s" } }, { isr: true as const, cdn: { maxAge: "5s" } }]
	expect(decide({ chain: own, auth: open, session: false }).cdn).toEqual({ maxAge: "5s" })
	// A mode on a layout does not store the pages under it.
	expect(decide({ chain: [ssr, undefined], auth: open, session: false }).policy).toBe("no-store")
})

it("private sticky", () => {
	const chain = [{ cdn: { private: true } }, { ...ssr, cdn: { private: false } }]
	expect(decide({ chain, auth: open, session: false }).policy).toBe("private")
})

const quiet = { level: "error" as const, error: () => undefined, warn: () => undefined, log: () => undefined }

// A root that renders a document, so its shared body is stored.
function documentOf(children: Element): Element {
	return createComponent(Dynamic, {
		component: "html",
		get children() {
			return [
				createComponent(Dynamic, { component: "head" }),
				createComponent(Dynamic, { component: "body", children }),
			]
		},
	})
}

// Through the real chain: a segment's `cdn` is the default for the shared page under it, and the segment's own `l`
// frame carries no data (BUGS.md B22).
it("segment cdn served", async () => {
	const segment = createPathSegment("_root_/api").cache({ cdn: { maxAge: "1m", swr: "10m", tags: ["api-reference"] } })
	const page = createPage("_root_/api/[...path]")
		.cache({ ssr: { ttl: "10m", tags: ["api"] } })
		.render(() => "api")
	const router = createRouter({
		layouts: {
			_root_: createRootLayout("_root_").render((props) => documentOf(props.children)),
			"_root_/api": segment,
		},
		routeTree: [{ id: "_root_/api/[...path]", path: "/api/[...path]", module: page }],
	})
	const app = serveWith({ router, site: "https://example.com", store: createMemoryStore() }, { dev: false, log: quiet })
	await (await app.fetch(new Request("https://example.com/api/x"))).text()
	const hit = await app.fetch(new Request("https://example.com/api/x"))
	expect(hit.headers.get("flare-cache")).toBe("hit")
	expect(hit.headers.get("cache-control")).toBe("public, max-age=0, s-maxage=60")
	expect(hit.headers.get("cdn-cache-control")).toBe("public, max-age=60, stale-while-revalidate=600")
	expect(hit.headers.get("cache-tag")).toBe("api-reference")
	const data = await (await app.fetch(new Request("https://example.com/api/y?_flare=data"))).text()
	expect(data).toContain('{"t":"l","m":"_root_/api","d":null}')
})
