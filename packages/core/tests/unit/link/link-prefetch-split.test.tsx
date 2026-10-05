import { type JSX, render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMatchCache, createPrefetchCache } from "../../../src/caches/index.ts";
import { Link } from "../../../src/link/index.tsx";
import { FlareProvider } from "../../../src/outlet/index.tsx";
import type { FlareProviderProps } from "../../../src/outlet/types.ts";

vi.mock("../../../src/navigation", () => ({
	applyRewriteOutput: vi.fn((href: string) => href),
	hardNavigate: vi.fn(),
	isExternal: vi.fn(() => false),
	navigate: vi.fn(() => Promise.resolve()),
	prefetch: vi.fn(() => Promise.resolve()),
	resetNavigationState: vi.fn(),
	setupNavigation: vi.fn(),
}));

import { prefetch } from "../../../src/navigation/index.ts";

const mockPrefetch = prefetch as ReturnType<typeof vi.fn>;

function providerProps(overrides?: Partial<FlareProviderProps>): FlareProviderProps {
	return {
		children: null as unknown as JSX.Element,
		layouts: {},
		matchCache: createMatchCache(),
		matches: [],
		params: {},
		prefetchCache: createPrefetchCache(),
		resolvers: new Map(),
		routeTree: { s: {} },
		...overrides,
	};
}

let container: HTMLDivElement;
let dispose: (() => void) | undefined;
let intersect: (() => void) | undefined;
let observe: ReturnType<typeof vi.fn<(el: Element) => void>>;
const originalIO = globalThis.IntersectionObserver;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	vi.clearAllMocks();
	observe = vi.fn<(el: Element) => void>();
	intersect = undefined;
	globalThis.IntersectionObserver = function (cb: IntersectionObserverCallback) {
		return {
			disconnect: vi.fn(),
			observe: (el: Element) => {
				observe(el);
				intersect = () =>
					cb([{ isIntersecting: true, target: el } as IntersectionObserverEntry], {} as IntersectionObserver);
			},
			unobserve: vi.fn(),
		};
	} as unknown as typeof IntersectionObserver;
});

afterEach(() => {
	dispose?.();
	container.remove();
	globalThis.IntersectionObserver = originalIO;
	Reflect.deleteProperty(navigator, "connection");
});

function mount(link: () => JSX.Element, overrides?: Partial<FlareProviderProps>) {
	const props = providerProps(overrides);
	dispose = render(() => <FlareProvider {...props}>{link()}</FlareProvider>, container);
	return container.querySelector("a") as HTMLAnchorElement;
}

describe("Link prefetch — modules and data on separate triggers", () => {
	it("modules on viewport, data on hover", async () => {
		const a = mount(() => (
			<Link prefetch={{ data: "intent", modules: "viewport" }} to="/pricing">
				Pricing
			</Link>
		));

		await vi.waitFor(() => expect(observe).toHaveBeenCalledTimes(1));
		intersect?.();
		expect(mockPrefetch).toHaveBeenLastCalledWith({ modulesOnly: true, to: "/pricing" });

		a.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
		expect(mockPrefetch).toHaveBeenLastCalledWith({ to: "/pricing" });
	});

	it("data alone still brings modules: data on hover with modules off", () => {
		const a = mount(() => (
			<Link prefetch={{ data: "intent", modules: false }} to="/pricing">
				Pricing
			</Link>
		));

		a.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

		expect(mockPrefetch).toHaveBeenCalledWith({ to: "/pricing" });
	});

	it('default modules "all" leaves module loading to the app-wide idle prefetch', async () => {
		const a = mount(() => <Link to="/pricing">Pricing</Link>);

		a.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 20));

		expect(observe).not.toHaveBeenCalled();
		expect(mockPrefetch).not.toHaveBeenCalled();
	});

	it('on a constrained connection, "all" falls back to visible links only', async () => {
		Object.defineProperty(navigator, "connection", { configurable: true, value: { saveData: true } });
		mount(() => <Link to="/pricing">Pricing</Link>);

		await vi.waitFor(() => expect(observe).toHaveBeenCalledTimes(1));
		intersect?.();

		expect(mockPrefetch).toHaveBeenCalledWith({ modulesOnly: true, to: "/pricing" });
	});

	it("router-wide prefetch applies to every link", () => {
		const a = mount(() => <Link to="/pricing">Pricing</Link>, { routerPrefetch: { data: "intent" } });

		a.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));

		expect(mockPrefetch).toHaveBeenCalledWith({ to: "/pricing" });
	});

	it("prefetch={false} turns everything off for that link", async () => {
		const a = mount(
			() => (
				<Link prefetch={false} to="/pricing">
					Pricing
				</Link>
			),
			{ routerPrefetch: "intent" },
		);

		a.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
		await new Promise((r) => setTimeout(r, 20));

		expect(mockPrefetch).not.toHaveBeenCalled();
		expect(observe).not.toHaveBeenCalled();
	});
});
