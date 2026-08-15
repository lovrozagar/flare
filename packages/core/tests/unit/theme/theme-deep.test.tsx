import { render } from "solid-js/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "../../../src/theme.ts";

function tick(): Promise<void> {
	return new Promise((r) => setTimeout(r, 0));
}

let container: HTMLDivElement;
let dispose: (() => void) | undefined;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
	document.documentElement.removeAttribute("data-mode");
	document.documentElement.style.colorScheme = "";
});

afterEach(() => {
	dispose?.();
	dispose = undefined;
	container.remove();
	vi.restoreAllMocks();
});

describe("ThemeProvider initialization", () => {
	it("default config reads localStorage, falls back to defaultTheme", () => {
		dispose = render(
			() => (
				<ThemeProvider>
					{(() => {
						const ctx = useTheme();
						expect(ctx.theme()).toBe("system");
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
	});

	it("stored theme in localStorage used as initial", () => {
		localStorage.setItem("flare.theme", "dark");
		dispose = render(
			() => (
				<ThemeProvider>
					{(() => {
						const ctx = useTheme();
						expect(ctx.theme()).toBe("dark");
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
	});

	it("invalid stored theme not in cfg.themes ignored, uses default", () => {
		localStorage.setItem("flare.theme", "sepia");
		dispose = render(
			() => (
				<ThemeProvider>
					{(() => {
						const ctx = useTheme();
						expect(ctx.theme()).toBe("system");
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
	});

	it("localStorage throws → graceful fallback to default", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("SecurityError");
		});
		dispose = render(
			() => (
				<ThemeProvider>
					{(() => {
						const ctx = useTheme();
						expect(ctx.theme()).toBe("system");
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
	});

	it("custom config merges with defaults", () => {
		localStorage.setItem("custom.key", "light");
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "dark", storageKey: "custom.key" }}>
					{(() => {
						const ctx = useTheme();
						expect(ctx.theme()).toBe("light");
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
	});
});

describe("ThemeProvider DOM sync", () => {
	it("applies data-theme synchronously on first land, before effects", () => {
		localStorage.setItem("flare.theme", "dark");
		dispose = render(
			() => (
				<ThemeProvider>
					{(() => {
						useTheme();
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
		expect(document.documentElement.style.colorScheme).toBe("dark");
	});

	it("resolved theme sets data-theme attribute on documentElement", async () => {
		localStorage.setItem("flare.theme", "dark");
		dispose = render(
			() => (
				<ThemeProvider>
					{(() => {
						useTheme();
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
	});

	it("resolved theme sets colorScheme style on documentElement", async () => {
		localStorage.setItem("flare.theme", "light");
		dispose = render(
			() => (
				<ThemeProvider>
					{(() => {
						useTheme();
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();
		expect(document.documentElement.style.colorScheme).toBe("light");
	});

	it("custom attribute name used instead of data-theme", async () => {
		localStorage.setItem("flare.theme", "dark");
		dispose = render(
			() => (
				<ThemeProvider config={{ attribute: "data-mode" }}>
					{(() => {
						useTheme();
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();
		expect(document.documentElement.getAttribute("data-mode")).toBe("dark");
	});

	it("disableTransitionOnChange false skips transition-none injection", async () => {
		const appendChildSpy = vi.spyOn(document.head, "appendChild");
		localStorage.setItem("flare.theme", "light");

		let setter: ((t: "light" | "dark" | "system") => void) | undefined;
		dispose = render(
			() => (
				<ThemeProvider config={{ disableTransitionOnChange: false }}>
					{(() => {
						const ctx = useTheme();
						setter = ctx.setTheme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();
		appendChildSpy.mockClear();

		setter?.("dark");
		await tick();
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
		/* no transition-none style should have been added */
		const styleAdded = appendChildSpy.mock.calls.some((call) => {
			const el = call[0] as HTMLElement;
			return el.tagName === "STYLE" && el.textContent?.includes("transition: none");
		});
		expect(styleAdded).toBe(false);
	});
});

describe("setTheme / toggleTheme", () => {
	it("setTheme(dark) updates signal + DOM + localStorage", async () => {
		let setter: ((t: "light" | "dark" | "system") => void) | undefined;
		let getter: (() => string) | undefined;
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "light" }}>
					{(() => {
						const ctx = useTheme();
						setter = ctx.setTheme;
						getter = ctx.theme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();

		setter?.("dark");
		await tick();

		expect(getter?.()).toBe("dark");
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
		expect(localStorage.getItem("flare.theme")).toBe("dark");
	});

	it("setTheme(invalid) ignored — not in cfg.themes", async () => {
		let setter: ((t: "light" | "dark" | "system") => void) | undefined;
		let getter: (() => string) | undefined;
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "light" }}>
					{(() => {
						const ctx = useTheme();
						setter = ctx.setTheme;
						getter = ctx.theme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();

		setter?.("sepia" as "light");
		await tick();
		expect(getter?.()).toBe("light");
	});

	it("toggleTheme from light → dark", async () => {
		let toggle: (() => void) | undefined;
		let resolved: (() => string) | undefined;
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "light" }}>
					{(() => {
						const ctx = useTheme();
						toggle = ctx.toggleTheme;
						resolved = ctx.resolvedTheme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();
		expect(resolved?.()).toBe("light");

		toggle?.();
		await tick();
		expect(resolved?.()).toBe("dark");
	});

	it("toggleTheme from dark → light", async () => {
		localStorage.setItem("flare.theme", "dark");
		let toggle: (() => void) | undefined;
		let resolved: (() => string) | undefined;
		dispose = render(
			() => (
				<ThemeProvider>
					{(() => {
						const ctx = useTheme();
						toggle = ctx.toggleTheme;
						resolved = ctx.resolvedTheme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();
		expect(resolved?.()).toBe("dark");

		toggle?.();
		await tick();
		expect(resolved?.()).toBe("light");
	});
});

describe("System theme detection", () => {
	it("theme system resolves via matchMedia dark → resolvedTheme dark", () => {
		const originalMatchMedia = globalThis.matchMedia;
		globalThis.matchMedia = vi.fn().mockReturnValue({
			addEventListener: vi.fn(),
			matches: true,
			removeEventListener: vi.fn(),
		}) as unknown as typeof matchMedia;

		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "system" }}>
					{(() => {
						const ctx = useTheme();
						expect(ctx.resolvedTheme()).toBe("dark");
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);

		globalThis.matchMedia = originalMatchMedia;
	});

	it("theme system + matchMedia light → resolvedTheme light", () => {
		const originalMatchMedia = globalThis.matchMedia;
		globalThis.matchMedia = vi.fn().mockReturnValue({
			addEventListener: vi.fn(),
			matches: false,
			removeEventListener: vi.fn(),
		}) as unknown as typeof matchMedia;

		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "system" }}>
					{(() => {
						const ctx = useTheme();
						expect(ctx.resolvedTheme()).toBe("light");
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);

		globalThis.matchMedia = originalMatchMedia;
	});

	it("OS preference change event updates systemTheme", async () => {
		let changeHandler: ((e: { matches: boolean }) => void) | undefined;
		const originalMatchMedia = globalThis.matchMedia;
		globalThis.matchMedia = vi.fn().mockReturnValue({
			addEventListener: (_event: string, handler: (e: { matches: boolean }) => void) => {
				changeHandler = handler;
			},
			matches: false,
			removeEventListener: vi.fn(),
		}) as unknown as typeof matchMedia;

		let resolved: (() => string) | undefined;
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "system" }}>
					{(() => {
						const ctx = useTheme();
						resolved = ctx.resolvedTheme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();
		expect(resolved?.()).toBe("light");

		changeHandler?.({ matches: true });
		await tick();
		expect(resolved?.()).toBe("dark");

		globalThis.matchMedia = originalMatchMedia;
	});
});

describe("SSR passthrough", () => {
	it("hydration does not read localStorage as initial (avoids first-land freeze)", async () => {
		localStorage.setItem("flare.theme", "dark");
		const { sharedConfig } = await import("solid-js");
		const original = sharedConfig.context;
		try {
			Object.defineProperty(sharedConfig, "context", {
				configurable: true,
				value: { count: 0, id: "test" },
			});
			const first: string[] = [];
			let getter: (() => string) | undefined;
			dispose = render(
				() => (
					<ThemeProvider>
						{(() => {
							const ctx = useTheme();
							getter = ctx.theme;
							first.push(ctx.theme());
							return null;
						})()}
					</ThemeProvider>
				),
				container,
			);
			expect(first[0]).toBe("system");
			await tick();
			expect(getter?.()).toBe("dark");
			expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
		} finally {
			Object.defineProperty(sharedConfig, "context", {
				configurable: true,
				value: original,
			});
		}
	});

	it("sharedConfig.context truthy → still provides useTheme context", async () => {
		const { sharedConfig } = await import("solid-js");
		const original = sharedConfig.context;
		try {
			Object.defineProperty(sharedConfig, "context", {
				configurable: true,
				value: { count: 0, id: "test" },
			});
			let theme: string | undefined;
			dispose = render(
				() => (
					<ThemeProvider>
						{(() => {
							theme = useTheme().theme();
							return null;
						})()}
					</ThemeProvider>
				),
				container,
			);
			expect(theme).toBe("system");
		} finally {
			Object.defineProperty(sharedConfig, "context", {
				configurable: true,
				value: original,
			});
		}
	});

	it("localStorage.setItem throws on persist → no crash", async () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("QuotaExceeded");
		});
		let setter: ((t: "light" | "dark" | "system") => void) | undefined;
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "light" }}>
					{(() => {
						const ctx = useTheme();
						setter = ctx.setTheme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();
		/* Should not throw */
		expect(() => setter?.("dark")).not.toThrow();
		await tick();
	});
});
