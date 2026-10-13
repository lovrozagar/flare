import { createComponent, flush, untrack } from "solid-js";
import { render, type JSX } from "@solidjs/web";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RouterContext } from "../../../shared/router/context.ts";
import { createRouter, type Router } from "../../../shared/router/create-router.ts";
import type { ThemeOptions } from "../../../shared/router/features.ts";
import { ThemeProvider, useTheme } from "./provider.tsx";

const flags = vi.hoisted(() => ({ enabled: true }));

vi.mock("../../../client/sync/enabled.ts", () => ({
	get broadcastEnabled() {
		return flags.enabled;
	},
}));

type Theme = ReturnType<typeof useTheme>;
type FlareScope = typeof globalThis & { flare?: { nonce: string } };

const media = { dark: false, listeners: new Set<(event: { matches: boolean }) => void>() };
const frames: Array<() => void> = [];

// Node's own `localStorage` global shadows the document's. The browser has one, the document's, which jsdom holds.
const documentStorage = (globalThis as unknown as { jsdom: { window: Window } }).jsdom.window.localStorage;

beforeEach(() => {
	vi.stubGlobal("localStorage", documentStorage);
	(globalThis as FlareScope).flare = { nonce: "n" };
	vi.stubGlobal("matchMedia", (query: string) => ({
		media: query,
		get matches() {
			return media.dark;
		},
		addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => media.listeners.add(listener),
		removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) =>
			media.listeners.delete(listener),
	}));
	vi.stubGlobal("requestAnimationFrame", (callback: () => void) => frames.push(callback));
});

afterEach(() => {
	flags.enabled = true;
	media.dark = false;
	media.listeners.clear();
	frames.length = 0;
	documentStorage.clear();
	document.documentElement.removeAttribute("data-theme");
	document.documentElement.style.colorScheme = "";
	document.head.innerHTML = "";
	delete (globalThis as FlareScope).flare;
	vi.unstubAllGlobals();
});

function routerWith(theme?: ThemeOptions): Router {
	return createRouter({ layouts: {}, routeTree: [], ...(theme && { theme }) });
}

function tree(router: Router, child: () => JSX.Element): () => JSX.Element {
	return () =>
		createComponent(RouterContext, {
			value: router,
			get children() {
				return createComponent(ThemeProvider, {
					get children() {
						return child();
					},
				});
			},
		});
}

// Mounts the provider and returns the hook's value, the theme the hydration render saw, and the unmount.
function mount(router = routerWith({})): { theme: Theme; first: string; dispose: () => void } {
	const seen: { theme?: Theme; first?: string } = {};
	const host = document.createElement("div");
	const dispose = render(
		tree(router, () => {
			seen.theme = useTheme();
			seen.first = untrack(seen.theme.theme);
			return "child";
		}),
		host,
	);
	flush();
	if (seen.theme === undefined || seen.first === undefined) throw new Error("not mounted");
	return { theme: seen.theme, first: seen.first, dispose };
}

function setMedia(dark: boolean): void {
	media.dark = dark;
	for (const listener of media.listeners) listener({ matches: dark });
	flush();
}

function runFrames(): void {
	for (const frame of frames.splice(0)) frame();
}

function transitionStyles(): HTMLStyleElement[] {
	return [...document.head.querySelectorAll("style")].filter(
		(style) => style.textContent === "*{transition:none!important}",
	);
}

function attribute(): string | null {
	return document.documentElement.getAttribute("data-theme");
}

const PROBE = "probe";

// Another tab's posts, then a probe: once the probe arrives, every post before it has been heard.
async function deliver(...messages: unknown[]): Promise<void> {
	const sender = new BroadcastChannel("flare.sync");
	const done = new Promise<void>((resolve) => {
		const tail = new BroadcastChannel("flare.sync");
		tail.onmessage = (event: MessageEvent<unknown>) => {
			if (event.data !== PROBE) return;
			tail.close();
			resolve();
		};
	});
	for (const message of messages) sender.postMessage(message);
	sender.postMessage(PROBE);
	await done;
	await new Promise((resolve) => setTimeout(resolve, 0));
	sender.close();
	flush();
}

// What other tabs hear while `run` runs.
async function posted(run: () => void): Promise<unknown[]> {
	const heard: unknown[] = [];
	const listener = new BroadcastChannel("flare.sync");
	listener.onmessage = (event: MessageEvent<unknown>) => void heard.push(event.data);
	run();
	await deliver();
	listener.close();
	return heard.filter((data) => data !== PROBE);
}

it("no transition", () => {
	const { theme, dispose } = mount();
	theme.setTheme("dark");
	const styles = transitionStyles();
	expect(styles).toHaveLength(1);
	expect(styles[0]?.getAttribute("nonce")).toBe("n");
	expect(attribute()).toBe("dark");
	runFrames();
	expect(transitionStyles()).toHaveLength(0);
	(globalThis as FlareScope).flare = { nonce: "" };
	theme.setTheme("light");
	expect(transitionStyles()[0]?.hasAttribute("nonce")).toBe(false);
	dispose();
});

it("transition kept", () => {
	const { theme, dispose } = mount(routerWith({ disableTransitionOnChange: false }));
	theme.setTheme("dark");
	expect(attribute()).toBe("dark");
	expect(document.head.querySelectorAll("style")).toHaveLength(0);
	dispose();
});

it("set theme", () => {
	const { theme, dispose } = mount();
	theme.setTheme("dark");
	flush();
	expect(theme.theme()).toBe("dark");
	expect(theme.resolvedTheme()).toBe("dark");
	expect(localStorage.getItem("flare.theme")).toBe("dark");
	expect(attribute()).toBe("dark");
	expect(document.documentElement.style.colorScheme).toBe("dark");
	runFrames();
	theme.setTheme("dark");
	expect(transitionStyles()).toHaveLength(0);
	dispose();
});

it("set theme rejects", () => {
	const { theme, dispose } = mount(routerWith({ themes: ["light", "dark"], defaultTheme: "light" }));
	// @ts-expect-error a value outside the themes
	expect(() => theme.setTheme("blue")).toThrow(/blue/);
	expect(() => theme.setTheme("system")).toThrow(/system/);
	// @ts-expect-error the argument is required
	expect(() => theme.setTheme()).toThrow("setTheme undefined");
	expect(() => theme.setTheme(undefined as never)).toThrow("setTheme undefined");
	expect(localStorage.getItem("flare.theme")).toBeNull();
	dispose();
});

it("no config", () => {
	const host = document.createElement("div");
	const errors: unknown[] = [];
	const dispose = render(
		tree(routerWith(), () => {
			try {
				useTheme();
			} catch (error) {
				errors.push(error);
			}
			return "child";
		}),
		host,
	);
	flush();
	expect(host.textContent).toBe("child");
	expect(String(errors[0])).toMatch(/ThemeProvider/);
	dispose();
});

it("hydrate", () => {
	localStorage.setItem("flare.theme", "dark");
	const { theme, first, dispose } = mount();
	expect(first).toBe("system");
	expect(theme.theme()).toBe("dark");
	dispose();
	vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
		throw new Error("denied");
	});
	const denied = mount();
	expect(denied.theme.theme()).toBe("system");
	denied.dispose();
	vi.restoreAllMocks();
});

it("media", () => {
	const { theme, dispose } = mount();
	setMedia(true);
	expect(theme.resolvedTheme()).toBe("dark");
	expect(attribute()).toBe("dark");
	expect(theme.theme()).toBe("system");
	setMedia(false);
	expect(attribute()).toBe("light");
	dispose();
	expect(media.listeners.size).toBe(0);
});

it("media ignored", () => {
	const { theme, dispose } = mount();
	theme.setTheme("light");
	setMedia(true);
	expect(attribute()).toBe("light");
	expect(theme.resolvedTheme()).toBe("light");
	dispose();
});

it("theme channel", async () => {
	const { theme, dispose } = mount();
	await deliver({ type: "theme", value: "dark" });
	expect(theme.theme()).toBe("dark");
	expect(attribute()).toBe("dark");
	expect(document.documentElement.style.colorScheme).toBe("dark");
	expect(transitionStyles()).toHaveLength(1);
	runFrames();
	await deliver({ type: "theme", value: "dark" });
	expect(transitionStyles()).toHaveLength(0);
	expect(localStorage.getItem("flare.theme")).toBeNull();
	dispose();
});

it("theme channel system", async () => {
	localStorage.setItem("flare.theme", "light");
	media.dark = true;
	const { theme, dispose } = mount();
	await deliver({ type: "theme", value: "system" });
	expect(theme.theme()).toBe("system");
	expect(attribute()).toBe("dark");
	expect(document.documentElement.style.colorScheme).toBe("dark");
	dispose();
});

it("theme channel bad", async () => {
	const { theme, dispose } = mount(routerWith({ themes: ["light", "system"], defaultTheme: "system" }));
	await deliver(
		{ type: "theme", value: "dark" },
		{ type: "theme", value: "light", extra: 1 },
		{ type: "other" },
		{ type: "theme", value: 1 },
		null,
	);
	window.dispatchEvent(new StorageEvent("storage", { key: "flare.theme", newValue: "light" }));
	flush();
	expect(theme.theme()).toBe("system");
	dispose();
});

it("theme channel throw", async () => {
	const { theme, dispose } = mount();
	vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
		throw new Error("full");
	});
	expect(await posted(() => theme.setTheme("dark"))).toEqual([{ type: "theme", value: "dark" }]);
	expect(attribute()).toBe("dark");
	vi.restoreAllMocks();
	dispose();
});

it("theme channel mount", async () => {
	await deliver({ type: "theme", value: "light" });
	const { theme, first, dispose } = mount();
	expect(first).toBe("system");
	expect(theme.theme()).toBe("system");
	await deliver({ type: "theme", value: "dark" });
	expect(theme.theme()).toBe("dark");
	dispose();
	await deliver({ type: "theme", value: "light" });
	expect(theme.theme()).toBe("dark");
});

it("theme channel quiet", async () => {
	flags.enabled = false;
	const off = mount();
	expect(await posted(() => off.theme.setTheme("dark"))).toEqual([]);
	expect(localStorage.getItem("flare.theme")).toBe("dark");
	off.dispose();
	flags.enabled = true;
	const Real = BroadcastChannel;
	vi.stubGlobal("BroadcastChannel", undefined);
	const missing = mount();
	missing.theme.setTheme("light");
	vi.stubGlobal("BroadcastChannel", Real);
	expect(localStorage.getItem("flare.theme")).toBe("light");
	missing.dispose();
});

it("no toggle", () => {
	const { theme, dispose } = mount();
	expect(Object.keys(theme).sort()).toEqual(["resolvedTheme", "setTheme", "theme"]);
	expect(theme).not.toHaveProperty("toggleTheme");
	dispose();
});
