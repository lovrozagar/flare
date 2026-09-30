/**
 * Real path: loader pipeline → SSR `renderHeadToHtml` → `hydrateHeadState`.
 * Does not mock the modules under test.
 *
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyPerRouteHeads, clearRouteTracking } from "../../../src/head-client/index.ts";
import { hydrateHeadState } from "../../../src/hydration/index.ts";
import type { PipelineConfig, ResolvedRoute } from "../../../src/loader-pipeline/index.ts";
import { runPipeline } from "../../../src/loader-pipeline/index.ts";
import { renderHeadToHtml } from "../../../src/ssr/head.ts";

const LAYOUT_CSS = ".layout-inline-sheet { color: rgb(1, 2, 3); }";
const PAGE_CSS = ".page-inline-sheet { font-weight: 700; }";
const NONCE = "unit-ssr-nonce";

function makeRoute(overrides?: Partial<ResolvedRoute>): ResolvedRoute {
	return {
		_type: "render",
		variablePath: "/",
		virtualPath: "_root_",
		...overrides,
	};
}

function makeConfig(overrides?: Partial<PipelineConfig>): PipelineConfig {
	return {
		abortController: new AbortController(),
		cause: "enter",
		env: {},
		prefetch: false,
		request: new Request("http://localhost/"),
		routes: [],
		url: new URL("http://localhost/"),
		...overrides,
	};
}

function stylesWithCss(css: string): HTMLStyleElement[] {
	return [...document.querySelectorAll("style")].filter((el) => el.textContent === css) as HTMLStyleElement[];
}

function insertSsrHead(html: string): void {
	document.head.insertAdjacentHTML("beforeend", html);
	/* jsdom may drop nonce from innerHTML; restore from the SSR contract. */
	for (const el of document.head.querySelectorAll("style, script")) {
		if (!el.getAttribute("nonce")) {
			el.setAttribute("nonce", NONCE);
			(el as HTMLStyleElement).nonce = NONCE;
		}
	}
}

function phFromPipeline(matches: Awaited<ReturnType<typeof runPipeline>>["matches"]) {
	return matches.filter((m) => m.headConfig).map((m) => ({ head: m.headConfig!, matchId: m.matchId }));
}

beforeEach(() => {
	document.head.innerHTML = "";
	document.title = "";
	clearRouteTracking();
});

afterEach(() => {
	clearRouteTracking();
	document.head.innerHTML = "";
});

describe("pipeline: ancestor custom.* is not stored on descendant headConfig", () => {
	it("root custom.styles + child title only → child headConfig has no styles", async () => {
		const root = makeRoute({
			head: () => ({
				custom: { styles: [{ children: LAYOUT_CSS }] },
				title: "App",
			}),
			virtualPath: "_root_",
		});
		const page = makeRoute({
			head: () => ({ title: "Home" }),
			virtualPath: "_root_/",
		});
		const result = await runPipeline(makeConfig({ routes: [root, page] }));

		expect(result.mergedHead?.custom?.styles).toEqual([{ children: LAYOUT_CSS }]);
		expect(result.mergedHead?.title).toBe("Home");
		expect(result.matches[0]?.headConfig?.custom?.styles).toEqual([{ children: LAYOUT_CSS }]);
		expect(result.matches[1]?.headConfig?.custom?.styles).toBeUndefined();
		expect(result.matches[1]?.headConfig?.title).toBe("Home");
	});

	it("root custom.meta/links/scripts are not replayed on the child match", async () => {
		const root = makeRoute({
			head: () => ({
				custom: {
					links: [{ href: "/root.css", rel: "stylesheet" }],
					meta: [{ content: "root-val", name: "root-meta" }],
					scripts: [{ src: "/root.js" }],
					styles: [{ children: LAYOUT_CSS }],
				},
			}),
			virtualPath: "_root_",
		});
		const page = makeRoute({
			head: () => ({
				custom: {
					links: [{ href: "/page.css", rel: "stylesheet" }],
					meta: [{ content: "page-val", name: "page-meta" }],
				},
				title: "Home",
			}),
			virtualPath: "_root_/",
		});
		const result = await runPipeline(makeConfig({ routes: [root, page] }));

		expect(result.mergedHead?.custom?.styles).toEqual([{ children: LAYOUT_CSS }]);
		expect(result.mergedHead?.custom?.meta).toEqual([
			{ content: "root-val", name: "root-meta" },
			{ content: "page-val", name: "page-meta" },
		]);
		expect(result.mergedHead?.custom?.scripts).toEqual([{ src: "/root.js" }]);
		expect(result.mergedHead?.custom?.links).toEqual([
			{ href: "/root.css", rel: "stylesheet" },
			{ href: "/page.css", rel: "stylesheet" },
		]);

		expect(result.matches[0]?.headConfig?.custom?.styles).toEqual([{ children: LAYOUT_CSS }]);
		expect(result.matches[0]?.headConfig?.custom?.scripts).toEqual([{ src: "/root.js" }]);
		expect(result.matches[1]?.headConfig?.custom?.styles).toBeUndefined();
		expect(result.matches[1]?.headConfig?.custom?.scripts).toBeUndefined();
		expect(result.matches[1]?.headConfig?.custom?.meta).toEqual([{ content: "page-val", name: "page-meta" }]);
		expect(result.matches[1]?.headConfig?.custom?.links).toEqual([{ href: "/page.css", rel: "stylesheet" }]);
	});

	it("route without head does not inherit ancestor custom.styles", async () => {
		const root = makeRoute({
			head: () => ({ custom: { styles: [{ children: LAYOUT_CSS }] }, title: "App" }),
			virtualPath: "_root_",
		});
		const layout = makeRoute({
			_type: "layout",
			virtualPath: "_root_/(group)",
		});
		const result = await runPipeline(makeConfig({ routes: [root, layout] }));
		expect(result.matches[1]?.headConfig?.custom?.styles).toBeUndefined();
		expect(result.mergedHead?.custom?.styles).toEqual([{ children: LAYOUT_CSS }]);
	});

	it("headReplace still clears ancestor headConfig so ph will not replay", async () => {
		const root = makeRoute({
			head: () => ({ custom: { styles: [{ children: LAYOUT_CSS }] }, title: "App" }),
			virtualPath: "_root_",
		});
		const page = makeRoute({
			head: () => ({ title: "Replaced" }),
			headReplace: true,
			virtualPath: "_root_/",
		});
		const result = await runPipeline(makeConfig({ routes: [root, page] }));
		expect(result.matches[0]?.headConfig).toBeUndefined();
		expect(result.matches[1]?.headConfig?.title).toBe("Replaced");
		expect(result.matches[1]?.headConfig?.custom?.styles).toBeUndefined();
		expect(result.mergedHead?.title).toBe("Replaced");
		expect(result.mergedHead?.custom?.styles).toBeUndefined();
	});
});

describe("SSR + hydrateHeadState: one sheet for layout CSS", () => {
	it("root custom.styles + child title → one style after hydrate, nonce intact, same node", async () => {
		const root = makeRoute({
			head: () => ({
				custom: { styles: [{ children: LAYOUT_CSS }] },
				title: "App",
			}),
			virtualPath: "_root_",
		});
		const page = makeRoute({
			head: () => ({ title: "Home" }),
			virtualPath: "_root_/",
		});
		const result = await runPipeline(makeConfig({ routes: [root, page] }));

		const ssrHtml = renderHeadToHtml(result.mergedHead ?? {}, NONCE);
		const styleTagMatches = ssrHtml.match(/<style\b/g) ?? [];
		expect(styleTagMatches).toHaveLength(1);
		expect(ssrHtml).toContain(`<style nonce="${NONCE}">${LAYOUT_CSS}</style>`);

		insertSsrHead(ssrHtml);
		const ssrNode = stylesWithCss(LAYOUT_CSS)[0];
		expect(ssrNode).toBeDefined();

		hydrateHeadState({ ph: phFromPipeline(result.matches) });

		const live = stylesWithCss(LAYOUT_CSS);
		expect(live).toHaveLength(1);
		expect(live[0]).toBe(ssrNode);
		expect(live[0]?.getAttribute("nonce") || live[0]?.nonce).toBe(NONCE);
		expect(document.title).toBe("Home");
	});

	it("sibling navigation keeps the layout sheet; leaving the layout removes it", async () => {
		const root = makeRoute({
			head: () => ({ title: "App" }),
			virtualPath: "_root_",
		});
		const layout = makeRoute({
			_type: "layout",
			head: () => ({ custom: { styles: [{ children: LAYOUT_CSS }] } }),
			virtualPath: "_root_/(sheet)",
		});
		const pageA = makeRoute({
			head: () => ({ title: "A" }),
			virtualPath: "_root_/(sheet)/a",
		});
		const pageB = makeRoute({
			head: () => ({ title: "B" }),
			virtualPath: "_root_/(sheet)/b",
		});
		const other = makeRoute({
			head: () => ({ title: "Other" }),
			virtualPath: "_root_/other",
		});

		const first = await runPipeline(makeConfig({ routes: [root, layout, pageA] }));
		insertSsrHead(renderHeadToHtml(first.mergedHead ?? {}, NONCE));
		hydrateHeadState({ ph: phFromPipeline(first.matches) });
		expect(stylesWithCss(LAYOUT_CSS)).toHaveLength(1);
		const afterHydrate = stylesWithCss(LAYOUT_CSS)[0];

		const sibling = await runPipeline(makeConfig({ routes: [root, layout, pageB] }));
		applyPerRouteHeads(phFromPipeline(sibling.matches));
		const afterSibling = stylesWithCss(LAYOUT_CSS);
		expect(afterSibling).toHaveLength(1);
		expect(afterSibling[0]).toBe(afterHydrate);
		expect(document.title).toBe("B");

		const left = await runPipeline(makeConfig({ routes: [root, other] }));
		applyPerRouteHeads(phFromPipeline(left.matches));
		expect(stylesWithCss(LAYOUT_CSS)).toHaveLength(0);
		expect(document.title).toBe("Other");
	});

	it("page-owned custom.styles is a second sheet; layout sheet stays one copy", async () => {
		const root = makeRoute({
			head: () => ({ custom: { styles: [{ children: LAYOUT_CSS }] }, title: "App" }),
			virtualPath: "_root_",
		});
		const page = makeRoute({
			head: () => ({ custom: { styles: [{ children: PAGE_CSS }] }, title: "Home" }),
			virtualPath: "_root_/",
		});
		const result = await runPipeline(makeConfig({ routes: [root, page] }));
		insertSsrHead(renderHeadToHtml(result.mergedHead ?? {}, NONCE));
		hydrateHeadState({ ph: phFromPipeline(result.matches) });

		expect(stylesWithCss(LAYOUT_CSS)).toHaveLength(1);
		expect(stylesWithCss(PAGE_CSS)).toHaveLength(1);
	});

	it("does not adopt #flare-critical even when textContent matches", async () => {
		const critical = document.createElement("style");
		critical.id = "flare-critical";
		critical.setAttribute("nonce", NONCE);
		critical.textContent = LAYOUT_CSS;
		document.head.appendChild(critical);

		const root = makeRoute({
			head: () => ({ custom: { styles: [{ children: LAYOUT_CSS }] } }),
			virtualPath: "_root_",
		});
		const result = await runPipeline(makeConfig({ routes: [root] }));
		hydrateHeadState({ ph: phFromPipeline(result.matches) });

		const all = stylesWithCss(LAYOUT_CSS);
		expect(all).toHaveLength(2);
		expect(document.getElementById("flare-critical")).toBe(critical);
		expect(all.filter((el) => el !== critical)).toHaveLength(1);
	});

	it("adopts an un-nonced SSR sheet and stamps the document nonce", async () => {
		const meta = document.createElement("meta");
		meta.setAttribute("name", "csp-nonce");
		meta.setAttribute("content", NONCE);
		document.head.appendChild(meta);

		const ssr = document.createElement("style");
		ssr.textContent = LAYOUT_CSS;
		document.head.appendChild(ssr);

		applyPerRouteHeads([{ head: { custom: { styles: [{ children: LAYOUT_CSS }] } }, matchId: "r1" }]);
		expect(stylesWithCss(LAYOUT_CSS)).toHaveLength(1);
		expect(stylesWithCss(LAYOUT_CSS)[0]).toBe(ssr);
		expect(ssr.getAttribute("nonce") || ssr.nonce).toBe(NONCE);
	});

	it("does not adopt #flare-runtime even when textContent matches", async () => {
		const runtime = document.createElement("style");
		runtime.id = "flare-runtime";
		runtime.setAttribute("nonce", NONCE);
		runtime.textContent = LAYOUT_CSS;
		document.head.appendChild(runtime);

		const root = makeRoute({
			head: () => ({ custom: { styles: [{ children: LAYOUT_CSS }] } }),
			virtualPath: "_root_",
		});
		const result = await runPipeline(makeConfig({ routes: [root] }));
		hydrateHeadState({ ph: phFromPipeline(result.matches) });

		const all = stylesWithCss(LAYOUT_CSS);
		expect(all).toHaveLength(2);
		expect(document.getElementById("flare-runtime")).toBe(runtime);
		const owned = all.filter((el) => el !== runtime);
		expect(owned).toHaveLength(1);
		expect(owned[0]?.getAttribute("nonce") || owned[0]?.nonce).toBe(NONCE);
	});

	it("client navigation creates a nonce'd sheet when no SSR node exists", async () => {
		const meta = document.createElement("meta");
		meta.setAttribute("name", "csp-nonce");
		meta.setAttribute("content", NONCE);
		document.head.appendChild(meta);

		applyPerRouteHeads([
			{
				head: { custom: { styles: [{ children: LAYOUT_CSS }] } },
				matchId: "r1",
			},
		]);

		const live = stylesWithCss(LAYOUT_CSS);
		expect(live).toHaveLength(1);
		expect(live[0]?.getAttribute("nonce") || live[0]?.nonce).toBe(NONCE);
	});

	it("copies nonce from an existing nonce'd script when meta is absent", () => {
		const script = document.createElement("script");
		script.setAttribute("nonce", NONCE);
		script.nonce = NONCE;
		document.head.appendChild(script);

		applyPerRouteHeads([{ head: { custom: { styles: [{ children: LAYOUT_CSS }] } }, matchId: "r1" }]);
		const live = stylesWithCss(LAYOUT_CSS);
		expect(live).toHaveLength(1);
		expect(live[0]?.getAttribute("nonce") || live[0]?.nonce).toBe(NONCE);
	});

	it("creates a sheet without nonce when none is available", () => {
		applyPerRouteHeads([{ head: { custom: { styles: [{ children: LAYOUT_CSS }] } }, matchId: "r1" }]);
		const live = stylesWithCss(LAYOUT_CSS);
		expect(live).toHaveLength(1);
		expect(live[0]?.getAttribute("nonce")).toBeNull();
	});

	it("skips style insert when document is unavailable", () => {
		const saved = globalThis.document;
		delete (globalThis as { document?: Document }).document;
		try {
			applyPerRouteHeads([{ head: { custom: { styles: [{ children: LAYOUT_CSS }] } }, matchId: "r1" }]);
		} finally {
			globalThis.document = saved;
		}
		expect(stylesWithCss(LAYOUT_CSS)).toHaveLength(0);
	});
});
