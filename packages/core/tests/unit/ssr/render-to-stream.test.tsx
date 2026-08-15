/**
 * @vitest-environment node
 *
 * Solid's renderToStream only works with SSR-compiled output.
 * vite-plugin-solid compiles for browser by default, so we mock solidRenderToStream
 * to test our wrapping logic: FlareState building, stream injection, status derivation.
 */
import type { JSX } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeferContext } from "../../../src/defer/index.ts";
import { NotFoundError, UnauthenticatedError, UnauthorizedError } from "../../../src/errors/index.ts";
import type { PipelineMatch, ResolvedRoute } from "../../../src/loader-pipeline/index.ts";
import { createRouter } from "../../../src/router-config/index.ts";
import { clearScopedStyles, registerCSSByName } from "../../../src/styles/index.ts";

vi.mock("solid-js/web", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return {
		...actual,
		Hydration: (props: { children: unknown }) => props.children,
		NoHydration: (props: { children: unknown }) => props.children,
		renderToStream: (factory: () => unknown) => {
			const content = String(factory() ?? "");
			const html = `<html lang="en"><head><title>Test</title></head><body>${content}</body></html>`;
			return {
				pipe: vi.fn(),
				pipeTo: (writable: WritableStream<string>) => {
					const writer = writable.getWriter();
					writer.write(html).then(() => writer.close());
				},
			};
		},
	};
});

/*
 * Mock outlet so FlareProvider+Outlet produce the same output as the old
 * direct-render approach: FlareProvider passes children through,
 * Outlet renders matches[depth] via render fn with loaderData/location.
 */
vi.mock("../../../src/theme", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return {
		...actual,
		ThemeProvider: (props: { children: unknown }) => props.children,
	};
});

vi.mock("../../../src/direction", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return {
		...actual,
		DirectionProvider: (props: { children: unknown }) => props.children,
	};
});

vi.mock("../../../src/broadcast/provider", () => ({
	BroadcastProvider: (props: { children: unknown }) => props.children,
}));

vi.mock("../../../src/outlet", () => {
	let currentCtx: Record<string, unknown> = {};
	return {
		DepthContext: {
			id: Symbol("DepthContext"),
		},
		FlareProvider: (props: {
			children: unknown;
			matches: Array<{
				_type: string;
				loaderData: unknown;
				render?: (p: Record<string, unknown>) => unknown;
				virtualPath: string;
				preloaderContext?: unknown;
			}>;
			params: Record<string, unknown>;
			onContextReady?: (ctx: unknown) => void;
		}) => {
			currentCtx = { matches: props.matches, params: props.params };
			return props.children;
		},
		Outlet: () => {
			const matches = (currentCtx.matches ?? []) as Array<{
				_type: string;
				loaderData: unknown;
				preloaderContext?: unknown;
				render?: (p: Record<string, unknown>) => unknown;
			}>;
			/* Render all matches sequentially — pages get no children, layouts do */
			let content: unknown = null;
			for (let i = matches.length - 1; i >= 0; i--) {
				const m = matches[i];
				if (!m?.render) continue;
				const isPage = m._type === "render" || m._type === "response";
				const props: Record<string, unknown> = {
					loaderData: m.loaderData,
					preloaderContext: m.preloaderContext,
				};
				if (!isPage) props.children = content;
				content = m.render(props);
			}
			return content;
		},
		RouterContext: {
			Provider: (props: { children: unknown }) => props.children,
			id: Symbol("RouterContext"),
		},
		useRouter: () => ({}),
	};
});

/* must import after vi.mock so the mock takes effect */
const { renderToStream } = await import("../../../src/ssr");
type SSRConfig = Parameters<typeof renderToStream>[0];
type SSRResult = ReturnType<typeof renderToStream>;

function makeRoute(overrides?: Partial<ResolvedRoute>): ResolvedRoute {
	return {
		_type: "render",
		variablePath: "/",
		virtualPath: "_root_/page",
		...overrides,
	};
}

function makeMatch(overrides?: Partial<PipelineMatch>): PipelineMatch {
	return {
		deferContext: createDeferContext("m1"),
		loaderData: undefined,
		matchId: "m1",
		preloaderContext: {},
		route: makeRoute(),
		status: "success",
		...overrides,
	};
}

function simplePage(_props: Record<string, unknown>): JSX.Element {
	return "hello" as unknown as JSX.Element;
}

function simpleLayout(props: Record<string, unknown>): JSX.Element {
	return `<div class="root-layout">${props.children}</div>` as unknown as JSX.Element;
}

function makeConfig(overrides?: Partial<SSRConfig>): SSRConfig {
	return {
		auth: null,
		cause: "enter",
		matches: [
			makeMatch({
				route: makeRoute({
					_type: "root-layout",
					render: simpleLayout,
					variablePath: "_root_",
					virtualPath: "_root_",
				}),
			}),
			makeMatch({
				matchId: "m2",
				route: makeRoute({ render: simplePage }),
			}),
		],
		moduleScripts: [],
		nonce: "testnonce123",
		prefetch: false,
		resolvedHead: {},
		url: new URL("http://localhost/page"),
		...overrides,
	};
}

async function readStream(result: SSRResult): Promise<string> {
	const reader = result.body.getReader();
	const decoder = new TextDecoder();
	let html = "";
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		html += decoder.decode(value, { stream: true });
	}
	return html;
}

beforeEach(() => {
	clearScopedStyles();
});

describe("renderToStream", () => {
	it("returns SSRResult with body, headers, status", () => {
		const result = renderToStream(makeConfig());
		expect(result.body).toBeInstanceOf(ReadableStream);
		expect(result.headers).toBeDefined();
		expect(typeof result.status).toBe("number");
	});

	it("Content-Type header set to text/html; charset=utf-8", () => {
		const result = renderToStream(makeConfig());
		expect(result.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
	});

	it("status 200 for successful matches", () => {
		const result = renderToStream(makeConfig());
		expect(result.status).toBe(200);
	});

	it("status 404 for NotFoundError match", () => {
		const result = renderToStream(
			makeConfig({
				matches: [makeMatch({ error: new NotFoundError(), status: "error" })],
			}),
		);
		expect(result.status).toBe(404);
	});

	it("status 401 for UnauthenticatedError match", () => {
		const result = renderToStream(
			makeConfig({
				matches: [makeMatch({ error: new UnauthenticatedError(), status: "error" })],
			}),
		);
		expect(result.status).toBe(401);
	});

	it("status 403 for UnauthorizedError match", () => {
		const result = renderToStream(
			makeConfig({
				matches: [makeMatch({ error: new UnauthorizedError(), status: "error" })],
			}),
		);
		expect(result.status).toBe(403);
	});

	it("status 500 for generic error match", () => {
		const result = renderToStream(
			makeConfig({
				matches: [makeMatch({ error: new Error("boom"), status: "error" })],
			}),
		);
		expect(result.status).toBe(500);
	});

	it("body stream produces content", async () => {
		const result = renderToStream(makeConfig());
		const html = await readStream(result);
		expect(html.length).toBeGreaterThan(0);
	});

	it("injects flare state script before </body>", async () => {
		const result = renderToStream(makeConfig());
		const html = await readStream(result);
		expect(html).toContain("self.flare=");
		expect(html).toContain('nonce="testnonce123"');
	});

	it("injects entry script when entryScript provided", async () => {
		const result = renderToStream(makeConfig({ entryScript: "/entry.js" }));
		const html = await readStream(result);
		expect(html).toContain('import("/entry.js")');
		expect(html).toContain('type="module"');
		expect(html).toContain("async");
	});

	it("injects module scripts", async () => {
		const result = renderToStream(makeConfig({ moduleScripts: ["/chunk-a.js", "/chunk-b.js"] }));
		const html = await readStream(result);
		expect(html).toContain('import("/chunk-a.js")');
		expect(html).toContain('import("/chunk-b.js")');
	});

	it("escapes < in entryScript path to prevent script breakout", async () => {
		const result = renderToStream(makeConfig({ entryScript: "</script><script>alert(1)</script>" }));
		const html = await readStream(result);
		expect(html).not.toContain("</script><script>alert(1)");
		expect(html).toContain("\\u003c");
	});

	it("escapes < in moduleScripts paths to prevent script breakout", async () => {
		const result = renderToStream(makeConfig({ moduleScripts: ["</script><script>alert(1)</script>"] }));
		const html = await readStream(result);
		expect(html).not.toContain("</script><script>alert(1)");
		expect(html).toContain("\\u003c");
	});

	it("injects scoped styles before </head>", async () => {
		/* register inside a render fn so it survives clearScopedStyles at start */
		function styledPage(_props: Record<string, unknown>): JSX.Element {
			registerCSSByName("test-comp", "color: red;");
			return "styled" as unknown as JSX.Element;
		}
		const result = renderToStream(
			makeConfig({
				matches: [makeMatch({ route: makeRoute({ render: styledPage }) })],
			}),
		);
		const html = await readStream(result);
		expect(html).toContain('id="flare-runtime"');
		expect(html).toContain("color:red");
	});

	it("no scoped styles → no style tag injected", async () => {
		const result = renderToStream(makeConfig());
		const html = await readStream(result);
		expect(html).not.toContain("flare-runtime");
	});

	it("clears scoped styles at start of render", async () => {
		registerCSSByName("stale", "margin: 0;");
		const result = renderToStream(
			makeConfig({
				matches: [makeMatch({ route: makeRoute({ render: simplePage }) })],
			}),
		);
		const html = await readStream(result);
		expect(html).not.toContain("margin: 0");
	});
});

describe("renderToStream — FlareState", () => {
	it("FlareState.p contains pathname", async () => {
		const result = renderToStream(makeConfig({ url: new URL("http://localhost/about") }));
		const html = await readStream(result);
		expect(html).toContain('"/about"');
	});

	it("FlareState.r contains params from config", async () => {
		const result = renderToStream(makeConfig({ params: { id: "42" } }));
		const html = await readStream(result);
		expect(html).toContain('"id"');
		expect(html).toContain('"42"');
	});

	it("FlareState.s contains search params", async () => {
		const result = renderToStream(makeConfig({ url: new URL("http://localhost/page?q=test") }));
		const html = await readStream(result);
		expect(html).toContain('"q"');
		expect(html).toContain('"test"');
	});

	it("FlareState.m contains match states with loaderData", async () => {
		const result = renderToStream(
			makeConfig({
				matches: [
					makeMatch({
						loaderData: { greeting: "hi" },
						route: makeRoute({ render: simplePage }),
					}),
				],
			}),
		);
		const html = await readStream(result);
		expect(html).toContain('"greeting"');
		expect(html).toContain('"hi"');
	});

	it("FlareState.m includes preloaderContext when non-empty", async () => {
		const result = renderToStream(
			makeConfig({
				matches: [
					makeMatch({
						preloaderContext: { user: "bob" },
						route: makeRoute({ render: simplePage }),
					}),
				],
			}),
		);
		const html = await readStream(result);
		expect(html).toContain('"user"');
		expect(html).toContain('"bob"');
	});

	it("FlareState.ph contains per-route heads", async () => {
		const result = renderToStream(
			makeConfig({
				matches: [
					makeMatch({
						headConfig: { title: "Page Title" },
						route: makeRoute({ render: simplePage }),
					}),
				],
			}),
		);
		const html = await readStream(result);
		expect(html).toContain('"Page Title"');
	});

	it("FlareState.c.router populated from router config", async () => {
		const router = createRouter({
			cache: { client: { staleTime: 5000 } },
			layouts: {},
			routeTree: { s: {} },
		});
		const result = renderToStream(makeConfig({ router }));
		const html = await readStream(result);
		expect(html).toContain("5000");
	});

	it("FlareState.c.router includes caseSensitive when set", async () => {
		const router = createRouter({
			caseSensitive: true,
			layouts: {},
			routeTree: { s: {} },
		});
		const result = renderToStream(makeConfig({ router }));
		const html = await readStream(result);
		expect(html).toContain('"caseSensitive":true');
	});

	it("FlareState.c.router includes basePath when set", async () => {
		const router = createRouter({
			basePath: "/app",
			layouts: {},
			routeTree: { s: {} },
		});
		const result = renderToStream(makeConfig({ router }));
		const html = await readStream(result);
		expect(html).toContain('"/app"');
	});

	it("FlareState.c.router includes scrollRestoration when false", async () => {
		const router = createRouter({
			layouts: {},
			routeTree: { s: {} },
			scrollRestoration: false,
		});
		const result = renderToStream(makeConfig({ router }));
		const html = await readStream(result);
		expect(html).toContain('"scrollRestoration":false');
	});

	it("FlareState.e stripped from serialized output (security: no stack leakage)", async () => {
		const err = new Error("test error msg");
		err.stack = "Error: test error msg\n    at secret/path.ts:42:5";
		const result = renderToStream(
			makeConfig({
				matches: [
					makeMatch({
						error: err,
						route: makeRoute({ render: simplePage }),
						status: "error",
					}),
				],
			}),
		);
		const html = await readStream(result);
		/* Error messages and stacks must NOT appear in serialized HTML — info disclosure risk.
		 * Only the error type name (x field) is serialized for hydration branch selection. */
		expect(html).not.toContain("test error msg");
		expect(html).not.toContain("secret/path.ts");
		expect(html).toContain('"x":"Error"');
	});

	it("FlareState.q populated from queryClientGetter", async () => {
		const mockQueryClient = {
			getQueryCache: () => ({
				getAll: () => [
					{
						options: { staleTime: 10000 },
						queryKey: ["users"],
						state: { data: [{ id: 1 }] },
					},
				],
			}),
		};
		const result = renderToStream(makeConfig({ queryClientGetter: () => mockQueryClient }));
		const html = await readStream(result);
		expect(html).toContain('"users"');
		expect(html).toContain("10000");
	});

	it("FlareState.q omitted when no queries", async () => {
		const mockQueryClient = {
			getQueryCache: () => ({
				getAll: () => [],
			}),
		};
		const result = renderToStream(makeConfig({ queryClientGetter: () => mockQueryClient }));
		const html = await readStream(result);
		const stateMatch = html.match(/self\.flare=({.*?});/);
		if (stateMatch) {
			const parsed = JSON.parse(stateMatch[1]) as Record<string, unknown>;
			expect(parsed.q).toBeUndefined();
		}
	});

	it("FlareState.r defaults to empty object when no params", async () => {
		const result = renderToStream(makeConfig());
		const html = await readStream(result);
		const stateMatch = html.match(/self\.flare=(.*?);/);
		if (stateMatch) {
			const parsed = JSON.parse(stateMatch[1]) as Record<string, unknown>;
			expect(parsed.r).toEqual({});
		}
	});
});

describe("renderToStream — response headers", () => {
	it("last match responseHeaders merged into result headers", () => {
		const result = renderToStream(
			makeConfig({
				matches: [
					makeMatch({
						responseHeaders: { "X-Custom": "value" },
						route: makeRoute({ render: simplePage }),
					}),
				],
			}),
		);
		expect(result.headers.get("X-Custom")).toBe("value");
	});

	it("route headers spread over Content-Type", () => {
		const result = renderToStream(
			makeConfig({
				matches: [
					makeMatch({
						responseHeaders: { "X-Extra": "yes" },
						route: makeRoute({ render: simplePage }),
					}),
				],
			}),
		);
		expect(result.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
		expect(result.headers.get("X-Extra")).toBe("yes");
	});

	it("no responseHeaders → only Content-Type", () => {
		const result = renderToStream(
			makeConfig({
				matches: [makeMatch({ route: makeRoute({ render: simplePage }) })],
			}),
		);
		expect(result.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
	});

	it("multiple matches → uses last match responseHeaders", () => {
		const result = renderToStream(
			makeConfig({
				matches: [
					makeMatch({
						matchId: "m1",
						responseHeaders: { "X-First": "1" },
						route: makeRoute({ virtualPath: "_root_" }),
					}),
					makeMatch({
						matchId: "m2",
						responseHeaders: { "X-Last": "2" },
						route: makeRoute({ render: simplePage }),
					}),
				],
			}),
		);
		expect(result.headers.get("X-Last")).toBe("2");
	});
});

describe("renderToStream — component tree", () => {
	it("page renders content via mock stream", async () => {
		const result = renderToStream(makeConfig());
		const html = await readStream(result);
		expect(html.length).toBeGreaterThan(0);
	});

	it("page without root layout still renders", async () => {
		const result = renderToStream(
			makeConfig({
				matches: [
					makeMatch({
						route: makeRoute({ render: simplePage }),
					}),
				],
			}),
		);
		const html = await readStream(result);
		expect(html).toContain("hello");
	});

	it("nested layouts pass children", async () => {
		function outerLayout(props: Record<string, unknown>): JSX.Element {
			return `outer[${props.children}]` as unknown as JSX.Element;
		}
		function innerPage(): JSX.Element {
			return "inner" as unknown as JSX.Element;
		}

		const result = renderToStream(
			makeConfig({
				matches: [
					makeMatch({
						matchId: "layout1",
						route: makeRoute({
							_type: "layout",
							render: outerLayout,
							variablePath: "_root_/(group)",
							virtualPath: "_root_/(group)",
						}),
					}),
					makeMatch({
						matchId: "page1",
						route: makeRoute({
							render: innerPage,
							variablePath: "_root_/(group)/page",
							virtualPath: "_root_/(group)/page",
						}),
					}),
				],
			}),
		);
		const html = await readStream(result);
		expect(html).toContain("outer");
		expect(html).toContain("inner");
	});

	it("renders loaderData via render prop", async () => {
		function dataPage(props: Record<string, unknown>): JSX.Element {
			const data = props.loaderData as { msg: string };
			return data.msg as unknown as JSX.Element;
		}

		const result = renderToStream(
			makeConfig({
				matches: [
					makeMatch({
						loaderData: { msg: "from-loader" },
						route: makeRoute({ render: dataPage }),
					}),
				],
			}),
		);
		const html = await readStream(result);
		expect(html).toContain("from-loader");
	});

	it("empty matches → stream completes with status 200", async () => {
		const result = renderToStream(makeConfig({ matches: [] }));
		await readStream(result);
		expect(result.status).toBe(200);
	});
});

describe("renderToStream — XSS prevention", () => {
	it("script tags escaped in flare state", async () => {
		const result = renderToStream(
			makeConfig({
				matches: [
					makeMatch({
						loaderData: "</script><script>alert(1)</script>",
						route: makeRoute({ render: simplePage }),
					}),
				],
			}),
		);
		const html = await readStream(result);
		const stateSection = html.split("self.flare=")[1]?.split(";</script>")[0] ?? "";
		expect(stateSection).not.toContain("</script>");
	});
});
