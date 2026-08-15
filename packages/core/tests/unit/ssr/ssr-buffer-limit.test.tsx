/**
 * @vitest-environment node
 *
 * Tests the stream buffer size limit in renderToStream to prevent DoS
 * via pathological SSR output that never produces injection markers.
 */
import type { JSX } from "solid-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDeferContext } from "../../../src/defer/index.ts";
import type { PipelineMatch, ResolvedRoute } from "../../../src/loader-pipeline/index.ts";
import { createRouter } from "../../../src/router-config/index.ts";
import { clearScopedStyles } from "../../../src/styles/index.ts";

const OVERSIZED_CHUNK_LEN = 3 * 1024 * 1024;

vi.mock("solid-js/web", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return {
		...actual,
		Hydration: (props: { children: unknown }) => props.children,
		NoHydration: (props: { children: unknown }) => props.children,
		renderToStream: (factory: () => unknown) => {
			factory();
			return {
				pipe: vi.fn(),
				pipeTo: (writable: WritableStream<string>) => {
					const writer = writable.getWriter();
					/* Produce a single enormous chunk without head/body markers */
					const huge = "x".repeat(OVERSIZED_CHUNK_LEN);
					writer.write(huge).then(() => writer.close());
				},
			};
		},
	};
});

vi.mock("../../../src/theme", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return { ...actual, ThemeProvider: (props: { children: unknown }) => props.children };
});

vi.mock("../../../src/direction", async (importOriginal) => {
	const actual = await importOriginal<Record<string, unknown>>();
	return { ...actual, DirectionProvider: (props: { children: unknown }) => props.children };
});

vi.mock("../../../src/broadcast/provider", () => ({
	BroadcastProvider: (props: { children: unknown }) => props.children,
}));

vi.mock("../../../src/outlet", () => {
	let currentCtx: Record<string, unknown> = {};
	return {
		DepthContext: { id: Symbol("DepthContext") },
		FlareProvider: (props: {
			children: unknown;
			matches: Array<Record<string, unknown>>;
			params: Record<string, unknown>;
			onContextReady?: (ctx: unknown) => void;
		}) => {
			currentCtx = { matches: props.matches, params: props.params };
			return props.children;
		},
		Outlet: () => {
			const matches = (currentCtx.matches ?? []) as Array<{
				render?: (p: Record<string, unknown>) => unknown;
			}>;
			let content: unknown = null;
			for (let i = matches.length - 1; i >= 0; i--) {
				const m = matches[i];
				if (m?.render) content = m.render({});
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

const { renderToStream, MAX_STREAM_BUFFER_SIZE } = await import("../../../src/ssr");
type SSRConfig = Parameters<typeof renderToStream>[0];
type SSRResult = ReturnType<typeof renderToStream>;

function makeRoute(overrides?: Partial<ResolvedRoute>): ResolvedRoute {
	return { _type: "render", variablePath: "/", virtualPath: "_root_/page", ...overrides };
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

function simplePage(): JSX.Element {
	return "oversized" as unknown as JSX.Element;
}

function makeConfig(overrides?: Partial<SSRConfig>): SSRConfig {
	return {
		auth: null,
		cause: "enter",
		matches: [makeMatch({ matchId: "m1", route: makeRoute({ render: simplePage }) })],
		moduleScripts: [],
		nonce: "testnonce",
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

describe("stream buffer size limit", () => {
	it("MAX_STREAM_BUFFER_SIZE is exported and is 2MB", () => {
		expect(MAX_STREAM_BUFFER_SIZE).toBe(2 * 1024 * 1024);
	});

	it("stream with oversized chunk completes without hanging", async () => {
		const result = renderToStream(makeConfig());
		const html = await readStream(result);
		/* Stream should complete (not hang), and total output should be bounded */
		expect(html.length).toBeLessThan(OVERSIZED_CHUNK_LEN);
	});
});
