import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider, useTheme } from "../../../src/theme.ts";

function tick(): Promise<void> {
	return new Promise((r) => setTimeout(r, 0));
}

function fireStorageEvent(key: string, newValue: string | null, storageArea = localStorage): void {
	/* jsdom rejects a non-jsdom Storage on StorageEventInit. Dispatch a
	   storage-shaped Event so storageArea can be the same object the app reads. */
	const event = new Event("storage") as StorageEvent;
	Object.defineProperties(event, {
		key: { value: key },
		newValue: { value: newValue },
		storageArea: { value: storageArea },
	});
	window.dispatchEvent(event);
}

let container: HTMLDivElement;
let dispose: (() => void) | undefined;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	localStorage.clear();
	document.documentElement.removeAttribute("data-theme");
	document.documentElement.style.colorScheme = "";
});

afterEach(() => {
	dispose?.();
	dispose = undefined;
	container.remove();
	vi.restoreAllMocks();
});

describe("ThemeProvider cross-tab sync via StorageEvent", () => {
	it("valid theme value from other tab updates signal", async () => {
		let getter: (() => string) | undefined;
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "light" }}>
					{(() => {
						const ctx = useTheme();
						getter = ctx.theme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();
		expect(getter?.()).toBe("light");

		fireStorageEvent("flare.theme", "dark");
		await tick();
		expect(getter?.()).toBe("dark");
	});

	it("wrong key ignored", async () => {
		let getter: (() => string) | undefined;
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "light" }}>
					{(() => {
						const ctx = useTheme();
						getter = ctx.theme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();

		fireStorageEvent("other.key", "dark");
		await tick();
		expect(getter?.()).toBe("light");
	});

	it("invalid theme value not in cfg.themes ignored", async () => {
		let getter: (() => string) | undefined;
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "light" }}>
					{(() => {
						const ctx = useTheme();
						getter = ctx.theme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();

		fireStorageEvent("flare.theme", "sepia");
		await tick();
		expect(getter?.()).toBe("light");
	});

	it("null newValue (key deleted) ignored", async () => {
		let getter: (() => string) | undefined;
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "light" }}>
					{(() => {
						const ctx = useTheme();
						getter = ctx.theme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();

		fireStorageEvent("flare.theme", null);
		await tick();
		expect(getter?.()).toBe("light");
	});

	it("sessionStorage storageArea ignored", async () => {
		let getter: (() => string) | undefined;
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "light" }}>
					{(() => {
						const ctx = useTheme();
						getter = ctx.theme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();

		fireStorageEvent("flare.theme", "dark", sessionStorage);
		await tick();
		expect(getter?.()).toBe("light");
	});

	it("multiple rapid StorageEvents → signal matches last value", async () => {
		let getter: (() => string) | undefined;
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "light" }}>
					{(() => {
						const ctx = useTheme();
						getter = ctx.theme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();

		fireStorageEvent("flare.theme", "dark");
		fireStorageEvent("flare.theme", "system");
		fireStorageEvent("flare.theme", "light");
		await tick();
		expect(getter?.()).toBe("light");
	});

	it("cleanup removes storage listener on unmount", async () => {
		const removeSpy = vi.spyOn(window, "removeEventListener");
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "light" }}>
					{(() => {
						useTheme();
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();

		dispose?.();
		dispose = undefined;

		const storageCalls = removeSpy.mock.calls.filter((c) => c[0] === "storage");
		expect(storageCalls.length).toBeGreaterThan(0);
	});

	it("custom storageKey responds to correct key", async () => {
		let getter: (() => string) | undefined;
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "light", storageKey: "my.theme" }}>
					{(() => {
						const ctx = useTheme();
						getter = ctx.theme;
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();

		fireStorageEvent("my.theme", "dark");
		await tick();
		expect(getter?.()).toBe("dark");

		fireStorageEvent("flare.theme", "system");
		await tick();
		expect(getter?.()).toBe("dark");
	});

	it("StorageEvent also updates DOM attribute and colorScheme", async () => {
		dispose = render(
			() => (
				<ThemeProvider config={{ defaultTheme: "light" }}>
					{(() => {
						useTheme();
						return null;
					})()}
				</ThemeProvider>
			),
			container,
		);
		await tick();

		fireStorageEvent("flare.theme", "dark");
		await tick();
		expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
		expect(document.documentElement.style.colorScheme).toBe("dark");
	});

	it("sharedConfig.hydrating set still registers storage listener on client render", async () => {
		const addSpy = vi.spyOn(window, "addEventListener");
		const { sharedConfig } = await import("solid-js");
		const original = sharedConfig.hydrating;
		try {
			Object.defineProperty(sharedConfig, "hydrating", {
				configurable: true,
				value: true,
			});
			dispose = render(() => <ThemeProvider>{null}</ThemeProvider>, container);
			await tick();
			const storageCalls = addSpy.mock.calls.filter((c) => c[0] === "storage");
			expect(storageCalls.length).toBeGreaterThan(0);
		} finally {
			Object.defineProperty(sharedConfig, "hydrating", {
				configurable: true,
				value: original,
			});
		}
	});
});
