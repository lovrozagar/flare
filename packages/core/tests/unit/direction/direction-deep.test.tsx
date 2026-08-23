import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectionProvider, useDirection } from "../../../src/direction.ts";

function tick(): Promise<void> {
	return new Promise((r) => setTimeout(r, 0));
}

let container: HTMLDivElement;
let dispose: (() => void) | undefined;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	localStorage.clear();
	document.documentElement.removeAttribute("data-dir");
	document.documentElement.removeAttribute("dir");
});

afterEach(() => {
	dispose?.();
	dispose = undefined;
	container.remove();
	vi.restoreAllMocks();
});

describe("DirectionProvider initialization", () => {
	it("default config reads localStorage, falls back to defaultDir ltr", () => {
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						const ctx = useDirection();
						expect(ctx.direction()).toBe("ltr");
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
	});

	it("stored rtl in localStorage used as initial", () => {
		localStorage.setItem("flare.dir", "rtl");
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						const ctx = useDirection();
						expect(ctx.direction()).toBe("rtl");
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
	});

	it("invalid stored value not ltr/rtl ignored, uses default", () => {
		localStorage.setItem("flare.dir", "auto");
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						const ctx = useDirection();
						expect(ctx.direction()).toBe("ltr");
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
	});

	it("localStorage throws → falls back to default", () => {
		vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
			throw new Error("SecurityError");
		});
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						const ctx = useDirection();
						expect(ctx.direction()).toBe("ltr");
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
	});
});

describe("DOM dir attribute fallback", () => {
	it("no localStorage + document dir=rtl → uses rtl", () => {
		document.documentElement.setAttribute("dir", "rtl");
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						const ctx = useDirection();
						expect(ctx.direction()).toBe("rtl");
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
		document.documentElement.removeAttribute("dir");
	});

	it("no localStorage + no DOM dir → uses default", () => {
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						const ctx = useDirection();
						expect(ctx.direction()).toBe("ltr");
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
	});

	it("localStorage overrides DOM dir", () => {
		document.documentElement.setAttribute("dir", "ltr");
		localStorage.setItem("flare.dir", "rtl");
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						const ctx = useDirection();
						/* localStorage "rtl" ≠ defaultDir "ltr", so DOM fallback skipped */
						expect(ctx.direction()).toBe("rtl");
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
		document.documentElement.removeAttribute("dir");
	});
});

describe("DirectionProvider DOM sync", () => {
	it("direction change sets both data-dir and dir attributes", async () => {
		dispose = render(
			() => (
				<DirectionProvider config={{ defaultDir: "ltr" }}>
					{(() => {
						useDirection();
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
		await tick();
		expect(document.documentElement.getAttribute("data-dir")).toBe("ltr");
		expect(document.documentElement.getAttribute("dir")).toBe("ltr");
	});

	it("custom attribute name used", async () => {
		dispose = render(
			() => (
				<DirectionProvider config={{ attribute: "data-direction" }}>
					{(() => {
						useDirection();
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
		await tick();
		expect(document.documentElement.getAttribute("data-direction")).toBe("ltr");
		expect(document.documentElement.getAttribute("dir")).toBe("ltr");
	});

	it("setDirection rtl persists to localStorage", async () => {
		let setter: ((dir: "ltr" | "rtl") => void) | undefined;
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						const ctx = useDirection();
						setter = ctx.setDirection;
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
		await tick();

		setter?.("rtl");
		await tick();
		expect(localStorage.getItem("flare.dir")).toBe("rtl");
	});
});

describe("setDirection / toggleDirection", () => {
	it("setDirection rtl updates DOM", async () => {
		let setter: ((dir: "ltr" | "rtl") => void) | undefined;
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						const ctx = useDirection();
						setter = ctx.setDirection;
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
		await tick();

		setter?.("rtl");
		await tick();
		expect(document.documentElement.getAttribute("data-dir")).toBe("rtl");
		expect(document.documentElement.getAttribute("dir")).toBe("rtl");
	});

	it("setDirection ltr updates DOM", async () => {
		localStorage.setItem("flare.dir", "rtl");
		let setter: ((dir: "ltr" | "rtl") => void) | undefined;
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						const ctx = useDirection();
						setter = ctx.setDirection;
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
		await tick();

		setter?.("ltr");
		await tick();
		expect(document.documentElement.getAttribute("dir")).toBe("ltr");
	});

	it("toggleDirection from ltr → rtl", async () => {
		let toggle: (() => void) | undefined;
		let getter: (() => string) | undefined;
		dispose = render(
			() => (
				<DirectionProvider config={{ defaultDir: "ltr" }}>
					{(() => {
						const ctx = useDirection();
						toggle = ctx.toggleDirection;
						getter = ctx.direction;
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
		await tick();
		expect(getter?.()).toBe("ltr");

		toggle?.();
		await tick();
		expect(getter?.()).toBe("rtl");
	});

	it("toggleDirection from rtl → ltr", async () => {
		localStorage.setItem("flare.dir", "rtl");
		let toggle: (() => void) | undefined;
		let getter: (() => string) | undefined;
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						const ctx = useDirection();
						toggle = ctx.toggleDirection;
						getter = ctx.direction;
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
		await tick();
		expect(getter?.()).toBe("rtl");

		toggle?.();
		await tick();
		expect(getter?.()).toBe("ltr");
	});
});

describe("SSR passthrough + context getDirFromLocale", () => {
	it("hydration does not read localStorage as initial (avoids first-land freeze)", async () => {
		localStorage.setItem("flare.dir", "rtl");
		const { sharedConfig } = await import("solid-js");
		const original = sharedConfig.hydrating;
		try {
			Object.defineProperty(sharedConfig, "hydrating", {
				configurable: true,
				value: true,
			});
			const first: string[] = [];
			let getter: (() => string) | undefined;
			dispose = render(
				() => (
					<DirectionProvider>
						{(() => {
							const ctx = useDirection();
							getter = ctx.direction;
							first.push(ctx.direction());
							return null;
						})()}
					</DirectionProvider>
				),
				container,
			);
			expect(first[0]).toBe("ltr");
			await tick();
			expect(getter?.()).toBe("rtl");
			expect(document.documentElement.getAttribute("dir")).toBe("rtl");
		} finally {
			Object.defineProperty(sharedConfig, "hydrating", {
				configurable: true,
				value: original,
			});
		}
	});

	it("sharedConfig.hydrating truthy → still provides useDirection context", async () => {
		const { sharedConfig } = await import("solid-js");
		const original = sharedConfig.hydrating;
		try {
			Object.defineProperty(sharedConfig, "hydrating", {
				configurable: true,
				value: true,
			});
			let dir: string | undefined;
			dispose = render(
				() => (
					<DirectionProvider>
						{(() => {
							dir = useDirection().direction();
							return null;
						})()}
					</DirectionProvider>
				),
				container,
			);
			expect(dir).toBe("ltr");
		} finally {
			Object.defineProperty(sharedConfig, "hydrating", {
				configurable: true,
				value: original,
			});
		}
	});

	it("context getDirFromLocale uses cfg.rtlLocales", () => {
		let dirFromLocale: ((locale: string | undefined) => string) | undefined;
		dispose = render(
			() => (
				<DirectionProvider config={{ rtlLocales: ["ar", "he", "ku"] }}>
					{(() => {
						const ctx = useDirection();
						dirFromLocale = ctx.getDirFromLocale;
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
		expect(dirFromLocale?.("ar")).toBe("rtl");
		expect(dirFromLocale?.("ku")).toBe("rtl");
		expect(dirFromLocale?.("fa")).toBe("ltr"); /* not in custom list */
		expect(dirFromLocale?.("en")).toBe("ltr");
	});

	it("localStorage.setItem throws on persist → no crash", async () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("QuotaExceeded");
		});
		let setter: ((dir: "ltr" | "rtl") => void) | undefined;
		dispose = render(
			() => (
				<DirectionProvider>
					{(() => {
						const ctx = useDirection();
						setter = ctx.setDirection;
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
		await tick();
		expect(() => setter?.("rtl")).not.toThrow();
		await tick();
	});

	it("defer: true on persist effect → initial value not persisted", async () => {
		const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
		dispose = render(
			() => (
				<DirectionProvider config={{ defaultDir: "ltr" }}>
					{(() => {
						useDirection();
						return null;
					})()}
				</DirectionProvider>
			),
			container,
		);
		await tick();
		/* The deferred effect should not fire for the initial value */
		const dirCalls = setItemSpy.mock.calls.filter((c) => c[0] === "flare.dir");
		expect(dirCalls).toHaveLength(0);
	});
});
