import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import { Link } from "../../../src/link/index.tsx";
import { FlareProvider } from "../../../src/outlet/index.tsx";
import type { FlareProviderProps } from "../../../src/outlet/types.ts";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";
import type { TreeNode } from "../../../src/router-primitives/types.ts";

vi.mock("../../../src/navigation", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../src/navigation/index.ts")>();
	return {
		...actual,
		navigate: vi.fn(() => Promise.resolve()),
		prefetch: vi.fn(() => Promise.resolve()),
	};
});

import { prefetch, setRewrite } from "../../../src/navigation/index.ts";

const mockPrefetch = prefetch as ReturnType<typeof vi.fn>;

function makeRouteData(path: string, prefetchStrategy: "intent") {
	return {
		e: "",
		o: { client: { prefetch: prefetchStrategy } },
		p: () => Promise.resolve({ default: {} }),
		t: "r" as const,
		v: path,
		x: path,
	};
}

function makeTree(path: string): TreeNode {
	const tree = createTreeNode();
	insertRoute(tree, path, makeRouteData(path, "intent"));
	return tree;
}

function makeProviderProps(routeTree: TreeNode): FlareProviderProps {
	return {
		children: null as unknown as import("solid-js").JSX.Element,
		layouts: {},
		matchCache: createMatchCache(),
		matches: [],
		params: {},
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree,
	};
}

describe("Link routePrefetch under output rewrites", () => {
	let container: HTMLDivElement;
	let dispose: () => void;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		vi.clearAllMocks();
		window.history.replaceState({}, "", "/");
		setRewrite({
			input: ({ url }) => {
				const next = new URL(url);
				if (next.pathname.startsWith("/~acme")) {
					next.pathname = next.pathname.slice("/~acme".length) || "/";
					return next;
				}
				return undefined;
			},
			output: ({ url }) => {
				const next = new URL(url);
				next.pathname = `/~acme${url.pathname === "/" ? "" : url.pathname}`;
				return next;
			},
		});
	});

	afterEach(() => {
		dispose?.();
		container.remove();
		setRewrite(undefined);
	});

	it("href is the output-rewritten URL", () => {
		const props = makeProviderProps(makeTree("/settings"));
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Link to="/settings">Settings</Link>
				</FlareProvider>
			),
			container,
		);
		expect(container.querySelector("a")?.getAttribute("href")).toBe("/~acme/settings");
	});

	it("inherits route prefetch from the internal path, not the rewritten href", () => {
		const props = makeProviderProps(makeTree("/settings"));
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Link to="/settings">Settings</Link>
				</FlareProvider>
			),
			container,
		);

		container.querySelector("a")?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
		expect(mockPrefetch).toHaveBeenCalled();
	});
});
