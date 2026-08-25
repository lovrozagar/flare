import { createSignal, flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import { Link } from "../../../src/link/index.tsx";
import { FlareProvider } from "../../../src/outlet/index.tsx";
import type { FlareProviderProps } from "../../../src/outlet/types.ts";
import { createTreeNode, insertRoute } from "../../../src/router-primitives/index.ts";
import type { TreeNode } from "../../../src/router-primitives/types.ts";

/* Mock navigation module */
vi.mock("../../../src/navigation", () => ({
	applyRewriteOutput: vi.fn((href: string) => href),
	hardNavigate: vi.fn(),
	isExternal: vi.fn((href: string) => {
		if (href.startsWith("mailto:") || href.startsWith("tel:")) return true;
		if (href.startsWith("http://") || href.startsWith("https://")) {
			try {
				const url = new URL(href);
				return url.origin !== window.location.origin;
			} catch {
				return false;
			}
		}
		return false;
	}),
	navigate: vi.fn(() => Promise.resolve()),
	prefetch: vi.fn(() => Promise.resolve()),
	resetNavigationState: vi.fn(),
	setupNavigation: vi.fn(),
}));

import { navigate, prefetch } from "../../../src/navigation/index.ts";

const mockNavigate = navigate as ReturnType<typeof vi.fn>;
const mockPrefetch = prefetch as ReturnType<typeof vi.fn>;

function makeFakeTree(): TreeNode {
	return { s: {} };
}

function makeProviderProps(overrides?: Partial<FlareProviderProps>): FlareProviderProps {
	return {
		children: null as unknown as import("solid-js").JSX.Element,
		layouts: {},
		matchCache: createMatchCache(),
		matches: [],
		params: {},
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree: makeFakeTree(),
		...overrides,
	};
}

describe("Link", () => {
	let container: HTMLDivElement;
	let dispose: () => void;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		vi.clearAllMocks();
		window.history.replaceState({}, "", "/");
	});

	afterEach(() => {
		dispose?.();
		container.remove();
	});

	it("renders <a> with href", () => {
		const props = makeProviderProps();
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Link to="/about">About</Link>
				</FlareProvider>
			),
			container,
		);

		const a = container.querySelector("a");
		expect(a).not.toBeNull();
		expect(a?.getAttribute("href")).toBe("/about");
		expect(a?.textContent).toBe("About");
	});

	it("class prop forwarded", () => {
		const props = makeProviderProps();
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Link class="nav-link" to="/about">
						About
					</Link>
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("a")?.className).toContain("nav-link");
	});

	it("target prop forwarded", () => {
		const props = makeProviderProps();
		dispose = render(
			() => (
				<FlareProvider {...props}>
					<Link target="_blank" to="/about">
						About
					</Link>
				</FlareProvider>
			),
			container,
		);

		expect(container.querySelector("a")?.getAttribute("target")).toBe("_blank");
	});

	describe("click handling", () => {
		it("left click → navigate called", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/about" }));
		});

		it("right click → no navigate", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 2 }));

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("metaKey → no navigate", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, metaKey: true }));

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("ctrlKey → no navigate", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, ctrlKey: true }));

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("target=_blank → no navigate", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link target="_blank" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("target=_parent → no navigate (browser handles)", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link target="_parent" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("target=_top → no navigate (browser handles)", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link target="_top" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("target=_self → navigate intercepts normally", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link target="_self" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ to: "/about" }));
		});

		it("replace: true forwarded", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link replace to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ replace: true }));
		});

		it("scroll: false forwarded", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link scroll={false} to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ scroll: false }));
		});

		it("<Link href='/about'> raw-href click no longer bails before navigate", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link href="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			/* Pre-fix: line 217 `if (local.href !== undefined) return` bails before navigate() */
			expect(mockNavigate).toHaveBeenCalled();
		});

		it("same URL without force → no navigate", () => {
			window.history.replaceState({}, "", "/about");

			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("same URL with force → navigate called", () => {
			window.history.replaceState({}, "", "/about");

			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link force to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).toHaveBeenCalled();
		});
	});

	describe("active state", () => {
		it("matches pathname → activeClass applied", () => {
			window.history.replaceState({}, "", "/about");

			const props = makeProviderProps({
				matches: [
					{
						_type: "render",
						loaderData: null,
						render: () => null,
						variablePath: "/about",
						virtualPath: "_root_/about",
					},
				],
			});
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link activeClass="active" class="link" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			expect(a?.className).toContain("active");
			expect(a?.className).toContain("link");
		});

		it("no match → inactiveClass applied", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link inactiveClass="dim" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.className).toContain("dim");
		});

		it("isActive callback overrides default", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link activeClass="custom-active" isActive={() => true} to="/other">
							Other
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.className).toContain("custom-active");
		});

		it("active link has aria-current=page", () => {
			window.history.replaceState({}, "", "/about");

			const props = makeProviderProps({
				matches: [
					{
						_type: "render",
						loaderData: null,
						render: () => null,
						variablePath: "/about",
						virtualPath: "_root_/about",
					},
				],
			});
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link activeClass="active" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			expect(a?.getAttribute("aria-current")).toBe("page");
		});

		it("inactive link has no aria-current", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			expect(a?.getAttribute("aria-current")).toBeNull();
		});
	});

	describe("prefetch", () => {
		it("intent → prefetch on mouseenter", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link prefetch="intent" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).toHaveBeenCalledWith({ to: "/about" });
		});

		it("intent → prefetch on focus", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link prefetch="intent" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);
			flush();

			const a = container.querySelector("a");
			a?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));

			expect(mockPrefetch).toHaveBeenCalledWith({ to: "/about" });
		});

		it("intent → prefetch on touchstart", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link prefetch="intent" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);
			flush();

			const a = container.querySelector("a");
			a?.dispatchEvent(new TouchEvent("touchstart", { bubbles: true }));

			expect(mockPrefetch).toHaveBeenCalledWith({ to: "/about" });
		});

		it("false → no prefetch on mouseenter", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link prefetch={false} to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});

		it("false → no prefetch on focus", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link prefetch={false} to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);
			flush();

			const a = container.querySelector("a");
			a?.dispatchEvent(new FocusEvent("focus", { bubbles: true }));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});
	});

	describe("prefetch=render", () => {
		it("prefetches immediately on mount", async () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link prefetch="render" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			/* render prefetch waits for load + idle so it stays off the LCP chain */
			await vi.waitFor(() => expect(mockPrefetch).toHaveBeenCalledWith({ modulesOnly: true, to: "/about" }));
		});

		it("no prefetch on mount when strategy is false", async () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link prefetch={false} to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			await new Promise<void>((r) => queueMicrotask(r));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});
	});

	describe("disabled", () => {
		it("renders <span> not <a>", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link disabled to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")).toBeNull();
			const span = container.querySelector("span");
			expect(span).not.toBeNull();
			expect(span?.getAttribute("aria-disabled")).toBe("true");
			expect(span?.getAttribute("tabindex")).toBe("-1");
		});

		it("no navigate on click", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link disabled to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const span = container.querySelector("span");
			span?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("cursor:not-allowed style applied", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link disabled to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const span = container.querySelector("span");
			const style = span?.getAttribute("style") ?? "";
			expect(style).toContain("not-allowed");
		});

		it("class still applied", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link class="my-class" disabled to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("span")?.className).toContain("my-class");
		});

		it("toggling disabled reactively switches between <a> and <span>", () => {
			const [disabled, setDisabled] = createSignal(true);
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link disabled={disabled()} to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("span")).not.toBeNull();
			expect(container.querySelector("a")).toBeNull();

			setDisabled(false);
			flush();

			expect(container.querySelector("a")).not.toBeNull();
			expect(container.querySelector("span")).toBeNull();

			setDisabled(true);
			flush();

			expect(container.querySelector("span")).not.toBeNull();
			expect(container.querySelector("a")).toBeNull();
		});
	});

	describe("external links", () => {
		it("external URL → no navigate interception", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="https://external.com/page">Ext</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("external link with prefetch=intent → no prefetch on mouseenter", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link prefetch="intent" to="https://external.com/page">
							Ext
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});
	});

	describe("dangerous protocol sanitization", () => {
		it("javascript: URI → href renders as #", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="javascript:alert(1)">XSS</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			expect(a?.getAttribute("href")).toBe("#");
		});

		it("data: URI → href renders as #", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="data:text/html,<h1>bad</h1>">Data</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			expect(a?.getAttribute("href")).toBe("#");
		});

		it("blob: URI → href renders as #", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="blob:http://evil.com/abc">Blob</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			expect(a?.getAttribute("href")).toBe("#");
		});
	});

	describe("prefetch=viewport", () => {
		let observerCallback: IntersectionObserverCallback;
		let observeSpy: ReturnType<typeof vi.fn>;
		let disconnectSpy: ReturnType<typeof vi.fn>;
		let originalIO: typeof IntersectionObserver;

		beforeEach(() => {
			observeSpy = vi.fn();
			disconnectSpy = vi.fn();
			originalIO = globalThis.IntersectionObserver;

			const MockIO = vi.fn(function (callback: IntersectionObserverCallback) {
				observerCallback = callback;
				return {
					disconnect: disconnectSpy,
					observe: observeSpy,
					unobserve: vi.fn(),
				};
			});
			globalThis.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;
		});

		afterEach(() => {
			globalThis.IntersectionObserver = originalIO;
		});

		it("prefetch called when link enters viewport", async () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link prefetch="viewport" to="/lazy">
							Lazy
						</Link>
					</FlareProvider>
				),
				container,
			);

			await vi.waitFor(() => expect(observeSpy).toHaveBeenCalledTimes(1));
			expect(mockPrefetch).not.toHaveBeenCalled();

			/* Simulate intersection */
			const anchor = container.querySelector("a");
			observerCallback(
				[{ isIntersecting: true, target: anchor } as unknown as IntersectionObserverEntry],
				{} as IntersectionObserver,
			);

			expect(mockPrefetch).toHaveBeenCalledWith({ modulesOnly: true, to: "/lazy" });
		});

		it("prefetch NOT called before intersection", async () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link prefetch="viewport" to="/lazy2">
							Lazy2
						</Link>
					</FlareProvider>
				),
				container,
			);

			/* Observer created after load/idle, but no intersection triggered */
			await vi.waitFor(() => expect(observeSpy).toHaveBeenCalledTimes(1));
			expect(mockPrefetch).not.toHaveBeenCalled();
		});

		it("disabled + viewport → no observer created, no prefetch", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link disabled prefetch="viewport" to="/lazy3">
							Lazy3
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(observeSpy).not.toHaveBeenCalled();
			expect(mockPrefetch).not.toHaveBeenCalled();
		});
	});

	describe("default prefetch", () => {
		it("no prefetch prop → no prefetch on mouseenter", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});
	});

	describe("keyboard modifier guards", () => {
		it("shiftKey → no navigate", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, shiftKey: true }));

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("altKey → no navigate", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { altKey: true, bubbles: true, button: 0 }));

			expect(mockNavigate).not.toHaveBeenCalled();
		});
	});

	describe("same-URL guard", () => {
		it("click on link to current URL → no navigate (unless force)", () => {
			window.history.replaceState({}, "", "/about");

			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).not.toHaveBeenCalled();
		});
	});

	describe("revalidate", () => {
		it("passes revalidate: true to navigate", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link revalidate to="/dashboard">
							Dashboard
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ revalidate: true, to: "/dashboard" }));
		});

		it("omits revalidate when not set", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/other">Other</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).toHaveBeenCalledWith(expect.objectContaining({ revalidate: undefined, to: "/other" }));
		});
	});

	function makeRouteData(
		path: string,
		prefetch?: false | "intent" | "render" | "viewport",
	): Parameters<typeof insertRoute>[2] {
		return {
			e: "",
			o: prefetch !== undefined ? { client: { prefetch } } : {},
			p: () => Promise.resolve({ default: {} }),
			t: "r",
			v: path,
			x: path,
		};
	}

	function makeTreeWithPrefetch(path: string, prefetch: false | "intent" | "render" | "viewport"): TreeNode {
		const tree = createTreeNode();
		insertRoute(tree, path, makeRouteData(path, prefetch));
		return tree;
	}

	describe("prefetch inheritance from route tree", () => {
		it("no prefetch prop + route has intent → mouseenter triggers prefetch", () => {
			const tree = makeTreeWithPrefetch("/about", "intent");
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).toHaveBeenCalledWith({ to: "/about" });
		});

		it("no prefetch prop + route has viewport → IntersectionObserver triggers prefetch", async () => {
			const observeSpy = vi.fn();
			const disconnectSpy = vi.fn();
			let observerCallback: IntersectionObserverCallback = () => {};
			const originalIO = globalThis.IntersectionObserver;

			const MockIO = vi.fn(function (callback: IntersectionObserverCallback) {
				observerCallback = callback;
				return { disconnect: disconnectSpy, observe: observeSpy, unobserve: vi.fn() };
			});
			globalThis.IntersectionObserver = MockIO as unknown as typeof IntersectionObserver;

			const tree = makeTreeWithPrefetch("/lazy", "viewport");
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/lazy">Lazy</Link>
					</FlareProvider>
				),
				container,
			);

			await vi.waitFor(() => expect(observeSpy).toHaveBeenCalledTimes(1));

			const anchor = container.querySelector("a");
			observerCallback(
				[{ isIntersecting: true, target: anchor } as unknown as IntersectionObserverEntry],
				{} as IntersectionObserver,
			);

			expect(mockPrefetch).toHaveBeenCalledWith({ modulesOnly: true, to: "/lazy" });
			globalThis.IntersectionObserver = originalIO;
		});

		it("explicit prefetch=intent overrides route viewport", () => {
			const tree = makeTreeWithPrefetch("/about", "viewport");
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link prefetch="intent" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).toHaveBeenCalledWith({ to: "/about" });
		});

		it("explicit prefetch=false overrides route intent", () => {
			const tree = makeTreeWithPrefetch("/about", "intent");
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link prefetch={false} to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});

		it("external link → route tree lookup skipped", () => {
			const tree = makeTreeWithPrefetch("/about", "intent");
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="https://external.com/about">Ext</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});

		it("no route match → falls back to false", () => {
			const tree = makeFakeTree();
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/nonexistent">None</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});

		it("dynamic param route /products/[id] → Link to /products/123 inherits intent", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/products/[id]", makeRouteData("/products/[id]", "intent"));
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/products/123">Product</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).toHaveBeenCalledWith({ to: "/products/123" });
		});

		it("catch-all route /docs/[...slug] → Link to /docs/a/b/c inherits intent", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/docs/[...slug]", makeRouteData("/docs/[...slug]", "intent"));
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/docs/a/b/c">Docs</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).toHaveBeenCalledWith({ to: "/docs/a/b/c" });
		});

		it("href with query string → pathname still matches route", () => {
			const tree = makeTreeWithPrefetch("/about", "intent");
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about?foo=bar">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).toHaveBeenCalledWith({ to: "/about?foo=bar" });
		});

		it("href with hash → pathname still matches route", () => {
			const tree = makeTreeWithPrefetch("/about", "intent");
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link hash="section" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).toHaveBeenCalledWith({ to: "/about#section" });
		});

		it("route exists but has no prefetch config → falls back to false", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/about", makeRouteData("/about"));
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});

		it("route has prefetch: false explicitly → no prefetch", () => {
			const tree = makeTreeWithPrefetch("/about", false);
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});

		it("external href link → route tree lookup skipped, no prefetch", () => {
			const tree = makeTreeWithPrefetch("/about", "intent");
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link href="https://external.com/about">Ext</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});

		it("disabled link + inherited intent → no prefetch on mouseenter", () => {
			const tree = makeTreeWithPrefetch("/about", "intent");
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link disabled to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			/* disabled renders <span>, but even if mouseenter fires it should be blocked */
			const span = container.querySelector("span");
			span?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});

		it("multiple routes in tree → correct one matched", () => {
			const tree = createTreeNode();
			insertRoute(tree, "/about", makeRouteData("/about", "intent"));
			insertRoute(tree, "/contact", makeRouteData("/contact", "viewport"));
			insertRoute(tree, "/blog", makeRouteData("/blog", false));
			const props = makeProviderProps({ routeTree: tree });

			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/contact">Contact</Link>
					</FlareProvider>
				),
				container,
			);

			/* contact has viewport, not intent — mouseenter should NOT trigger prefetch */
			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});

		it("sanitized href (javascript:) becomes # → no route lookup crash", () => {
			const tree = makeTreeWithPrefetch("/about", "intent");
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="javascript:alert(1)">XSS</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			expect(a?.getAttribute("href")).toBe("#");
			/* mouseenter must not throw — prefetch of "#" is harmless */
			expect(() => a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }))).not.toThrow();
		});
	});

	describe("router-level prefetch defaults", () => {
		it("no prefetch prop + no route prefetch + router default intent → mouseenter triggers prefetch", () => {
			const tree = makeFakeTree();
			const props = makeProviderProps({
				routeTree: tree,
				routerCacheDefaults: { prefetch: "intent" },
			});
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).toHaveBeenCalledWith({ to: "/about" });
		});

		it("route prefetch overrides router default", () => {
			const tree = makeTreeWithPrefetch("/about", false);
			const props = makeProviderProps({
				routeTree: tree,
				routerCacheDefaults: { prefetch: "intent" },
			});
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			/* Route says false → no prefetch despite router default "intent" */
			expect(mockPrefetch).not.toHaveBeenCalled();
		});

		it("explicit Link prefetch overrides both route and router", () => {
			const tree = makeTreeWithPrefetch("/about", "viewport");
			const props = makeProviderProps({
				routeTree: tree,
				routerCacheDefaults: { prefetch: "viewport" },
			});
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link prefetch="intent" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			/* Explicit Link prop "intent" wins */
			expect(mockPrefetch).toHaveBeenCalledWith({ to: "/about" });
		});
	});

	describe("caseSensitive through route prefetch lookup", () => {
		it("caseSensitive=true: /About does NOT match /about route → no route prefetch", () => {
			const tree = makeTreeWithPrefetch("/about", "intent");
			const props = makeProviderProps({ caseSensitive: true, routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/About">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			/* Route not found due to case mismatch → no route-level prefetch config */
			expect(mockPrefetch).not.toHaveBeenCalled();
		});

		it("caseSensitive=false (default): /About matches /about route → prefetch fires", () => {
			const tree = makeTreeWithPrefetch("/about", "intent");
			const props = makeProviderProps({ routeTree: tree });
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/About">About</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			/* Case-insensitive match → route has intent prefetch → fires */
			expect(mockPrefetch).toHaveBeenCalledWith({ to: "/About" });
		});
	});

	describe("external href", () => {
		it("renders <a> with correct href", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link href="https://example.com/page">External</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			expect(a).not.toBeNull();
			expect(a?.getAttribute("href")).toBe("https://example.com/page");
			expect(a?.textContent).toBe("External");
		});

		it("click does NOT call navigate", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link href="https://example.com">Ext</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));

			expect(mockNavigate).not.toHaveBeenCalled();
		});

		it("target=_blank auto-applies rel='noopener noreferrer'", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link href="https://example.com" target="_blank">
							Ext
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("rel")).toBe("noopener noreferrer");
		});

		it("explicit rel preserved over auto rel", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link href="https://example.com" rel="sponsored" target="_blank">
							Ext
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("rel")).toBe("sponsored");
		});

		it("does not trigger prefetch on intent", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link href="https://example.com">Ext</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			a?.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

			expect(mockPrefetch).not.toHaveBeenCalled();
		});

		it("disabled renders <span>", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link disabled href="https://example.com">
							Ext
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")).toBeNull();
			const span = container.querySelector("span");
			expect(span).not.toBeNull();
			expect(span?.getAttribute("aria-disabled")).toBe("true");
		});

		it("javascript: href sanitized to #", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link href="javascript:alert(1)">XSS</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("href")).toBe("#");
		});

		it("has no active state (no aria-current)", () => {
			window.history.replaceState({}, "", "/");

			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link href="/">Home</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("aria-current")).toBeNull();
		});
	});

	describe("auto rel", () => {
		it("to + target=_blank → auto rel='noopener noreferrer'", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link target="_blank" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("rel")).toBe("noopener noreferrer");
		});

		it("to + target=_blank + explicit rel → preserves user rel", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link rel="nofollow" target="_blank" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("rel")).toBe("nofollow");
		});

		it("to without target=_blank → no auto rel", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link to="/about">About</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("rel")).toBeNull();
		});

		it("to + rel=sponsored without target=_blank → preserves rel", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link rel="sponsored" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("rel")).toBe("sponsored");
		});
	});

	describe("native attr forwarding", () => {
		it("title prop forwarded to <a>", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link title="Go to about" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("title")).toBe("Go to about");
		});

		it("download prop forwarded to <a>", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link download="file.pdf" to="/about">
							Download
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("download")).toBe("file.pdf");
		});

		it("id prop forwarded to <a>", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link id="about-link" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("id")).toBe("about-link");
		});

		it("aria-label forwarded to <a>", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link aria-label="Navigate to about page" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("aria-label")).toBe("Navigate to about page");
		});

		it("data-testid forwarded to <a>", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link data-testid="about-nav" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("data-testid")).toBe("about-nav");
		});

		it("native attrs forwarded to disabled <span>", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link data-testid="disabled-link" disabled id="my-link" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const span = container.querySelector("span");
			expect(span?.getAttribute("id")).toBe("my-link");
			expect(span?.getAttribute("data-testid")).toBe("disabled-link");
		});
	});

	describe("activeProps / inactiveProps", () => {
		it("activeProps class merged when active", () => {
			window.history.replaceState({}, "", "/about");

			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link activeProps={{ class: "font-bold" }} class="base" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			expect(a?.className).toContain("base");
			expect(a?.className).toContain("font-bold");
		});

		it("activeProps + activeClass both applied when active", () => {
			window.history.replaceState({}, "", "/about");

			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link activeClass="active" activeProps={{ class: "font-bold" }} class="base" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			expect(a?.className).toContain("base");
			expect(a?.className).toContain("font-bold");
			expect(a?.className).toContain("active");
		});

		it("inactiveProps class merged when inactive", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link class="base" inactiveProps={{ class: "opacity-50" }} to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			expect(a?.className).toContain("base");
			expect(a?.className).toContain("opacity-50");
		});

		it("activeProps ignored when inactive", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link activeProps={{ class: "font-bold" }} class="base" to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			expect(a?.className).toContain("base");
			expect(a?.className).not.toContain("font-bold");
		});

		it("inactiveProps ignored when active", () => {
			window.history.replaceState({}, "", "/about");

			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link class="base" inactiveProps={{ class: "opacity-50" }} to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			expect(a?.className).toContain("base");
			expect(a?.className).not.toContain("opacity-50");
		});

		it("activeProps style merged with base style (object)", () => {
			window.history.replaceState({}, "", "/about");

			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link activeProps={{ style: { "font-weight": "bold" } }} style={{ color: "red" }} to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			const a = container.querySelector("a");
			const style = a?.getAttribute("style") ?? "";
			expect(style).toContain("color");
			expect(style).toContain("font-weight");
		});

		it("activeProps aria-selected applied when active", () => {
			window.history.replaceState({}, "", "/about");

			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link activeProps={{ "aria-selected": "true" }} to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("aria-selected")).toBe("true");
		});

		it("activeProps aria-selected removed when inactive", () => {
			const props = makeProviderProps();
			dispose = render(
				() => (
					<FlareProvider {...props}>
						<Link activeProps={{ "aria-selected": "true" }} to="/about">
							About
						</Link>
					</FlareProvider>
				),
				container,
			);

			expect(container.querySelector("a")?.getAttribute("aria-selected")).toBeNull();
		});
	});
});
