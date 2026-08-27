import { createSignal, flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import { InterceptOutlet } from "../../../src/intercept-outlet.ts";
import { RouterContext } from "../../../src/outlet/index.tsx";
import type { FlareProviderContext, InterceptedState } from "../../../src/outlet/types.ts";

function makeInterceptedState(overrides?: Partial<InterceptedState>): InterceptedState {
	return {
		backgroundLocation: {
			hash: "",
			params: {},
			pathname: "/products",
			search: {},
			url: new URL("http://localhost/products"),
			variablePath: "/products",
			virtualPath: "_root_/products/",
		},
		dismiss: vi.fn(),
		match: {
			_type: "render",
			loaderData: { name: "Widget" },
			render: () => null,
			variablePath: "/products/[id]",
			virtualPath: "_root_/products/[id]",
		},
		params: {},
		render: "modal",
		search: {},
		...overrides,
	};
}

function makeCtx(interceptedSignal: () => InterceptedState | null): FlareProviderContext {
	return {
		hydrated: () => true,
		intercepted: interceptedSignal,
		invalidate: vi.fn(),
		isNavigating: () => false,
		layouts: {},
		location: () => ({
			hash: "",
			params: {},
			pathname: "/products",
			search: {},
			url: new URL("http://localhost/products"),
			variablePath: "/products",
			virtualPath: "_root_/products/",
		}),
		matchCache: createMatchCache(),
		matches: () => [],
		navigate: vi.fn(() => Promise.resolve()),
		navigationPhase: () => "idle" as const,
		notFound: () => false,
		params: () => ({}),
		prefetch: vi.fn(() => Promise.resolve()),
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree: { s: {} },
		search: () => ({}),
		setHydrated: vi.fn(),
		setIntercepted: vi.fn(),
		setMatches: vi.fn(),
		setNavigationPhase: vi.fn(),
		setNotFound: vi.fn(),
		setParams: vi.fn(),
		setSearch: vi.fn(),
		setViewTransition: vi.fn(),
		viewTransition: () => null,
	};
}

describe("InterceptOutlet", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	it("renders children when intercepted is not null", () => {
		const state = makeInterceptedState();
		const ctx = makeCtx(() => state);

		render(
			() => (
				<RouterContext value={ctx}>
					<InterceptOutlet>{(s) => <div data-testid="overlay">Mode: {s.render}</div>}</InterceptOutlet>
				</RouterContext>
			),
			container,
		);

		expect(container.querySelector("[data-testid=overlay]")?.textContent).toBe("Mode: modal");
	});

	it("renders nothing when intercepted is null", () => {
		const ctx = makeCtx(() => null);

		render(
			() => (
				<RouterContext value={ctx}>
					<InterceptOutlet>{(s) => <div data-testid="overlay">Mode: {s.render}</div>}</InterceptOutlet>
				</RouterContext>
			),
			container,
		);

		expect(container.querySelector("[data-testid=overlay]")).toBeNull();
	});

	it("reactively shows/hides when intercepted changes", async () => {
		const [intercepted, setIntercepted] = createSignal<InterceptedState | null>(null);
		const ctx = makeCtx(intercepted);

		render(
			() => (
				<RouterContext value={ctx}>
					<InterceptOutlet>{(s) => <div data-testid="overlay">Mode: {s.render}</div>}</InterceptOutlet>
				</RouterContext>
			),
			container,
		);

		/* Initially null → no overlay */
		expect(container.querySelector("[data-testid=overlay]")).toBeNull();

		/* Set intercepted → overlay appears */
		setIntercepted(makeInterceptedState());
		await new Promise((r) => setTimeout(r, 10));
		expect(container.querySelector("[data-testid=overlay]")?.textContent).toBe("Mode: modal");

		/* Clear intercepted → overlay disappears */
		setIntercepted(null);
		await new Promise((r) => setTimeout(r, 10));
		expect(container.querySelector("[data-testid=overlay]")).toBeNull();
	});

	it("swaps overlay content when intercept identity changes", () => {
		const [intercepted, setIntercepted] = createSignal<InterceptedState | null>(null);
		const ctx = makeCtx(intercepted);

		render(
			() => (
				<RouterContext value={ctx}>
					<InterceptOutlet>
						{(s) => (
							<div data-testid="overlay">{String((s.match.loaderData as { name?: string } | undefined)?.name)}</div>
						)}
					</InterceptOutlet>
				</RouterContext>
			),
			container,
		);

		setIntercepted(
			makeInterceptedState({
				match: {
					_type: "render",
					loaderData: { name: "Product 1" },
					render: () => null,
					variablePath: "/products/[id]",
					virtualPath: "_root_/products/[id]",
				},
				params: { id: "1" },
			}),
		);
		flush();
		expect(container.querySelector("[data-testid=overlay]")?.textContent).toBe("Product 1");

		/* Same truthy overlay, new object. Unkeyed Show must still re-read the accessor. */
		setIntercepted(
			makeInterceptedState({
				match: {
					_type: "render",
					loaderData: { name: "Product 2" },
					render: () => null,
					variablePath: "/products/[id]",
					virtualPath: "_root_/products/[id]",
				},
				params: { id: "2" },
			}),
		);
		flush();
		expect(container.querySelector("[data-testid=overlay]")?.textContent).toBe("Product 2");
	});
});
