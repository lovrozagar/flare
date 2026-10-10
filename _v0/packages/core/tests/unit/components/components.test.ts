import { describe, expect, it } from "vitest";
import {
	type CapturedError,
	createDevErrorStore,
	getViewTransitionCss,
	resetCss,
	viewTransitionCss,
} from "../../../src/components/index.ts";

describe("resetCss", () => {
	it("is a non-empty string", () => {
		expect(typeof resetCss).toBe("string");
		expect(resetCss.length).toBeGreaterThan(0);
	});

	it("contains box-sizing reset", () => {
		expect(resetCss).toContain("box-sizing");
	});

	it("contains margin reset", () => {
		expect(resetCss).toContain("margin");
	});

	it("is a static constant (same reference)", () => {
		const a = resetCss;
		const b = resetCss;
		expect(a).toBe(b);
	});
});

describe("viewTransitionCss", () => {
	it("is a non-empty string", () => {
		expect(typeof viewTransitionCss).toBe("string");
		expect(viewTransitionCss.length).toBeGreaterThan(0);
	});

	it("contains @view-transition rule", () => {
		expect(viewTransitionCss).toContain("@view-transition");
	});

	it("contains default 175ms duration", () => {
		expect(viewTransitionCss).toContain("175ms");
	});

	it("contains navigation:auto", () => {
		expect(viewTransitionCss).toContain("navigation:auto");
	});

	it("contains ::view-transition-old and ::view-transition-new", () => {
		expect(viewTransitionCss).toContain("::view-transition-old(*)");
		expect(viewTransitionCss).toContain("::view-transition-new(*)");
	});
});

describe("getViewTransitionCss", () => {
	it("returns CSS with specified duration", () => {
		const css = getViewTransitionCss(200);
		expect(css).toContain("200ms");
	});

	it("300ms duration", () => {
		const css = getViewTransitionCss(300);
		expect(css).toContain("300ms");
		expect(css).toContain("@view-transition");
	});

	it("contains animation-duration", () => {
		const css = getViewTransitionCss(250);
		expect(css).toContain("animation-duration");
	});

	it("default 175ms matches viewTransitionCss", () => {
		expect(getViewTransitionCss(175)).toBe(viewTransitionCss);
	});
});

describe("devErrorStore", () => {
	it("register(Error) → adds to errors list", () => {
		const store = createDevErrorStore();
		store.register(new Error("test error"), "test");
		expect(store.errors().length).toBe(1);
		expect(store.errors()[0]?.error.message).toBe("test error");
	});

	it("register(SerializedError) → converts to Error", () => {
		const store = createDevErrorStore();
		store.register({ message: "ssr error", name: "Error", source: "ssr" });
		expect(store.errors().length).toBe(1);
		expect(store.errors()[0]?.error.message).toBe("ssr error");
		expect(store.errors()[0]?.error.name).toBe("Error");
	});

	it("register with source → captured error has source", () => {
		const store = createDevErrorStore();
		store.register(new Error("oops"), "window.onerror");
		expect(store.errors()[0]?.source).toBe("window.onerror");
	});

	it("duplicate error (same hash) → not added twice", () => {
		const store = createDevErrorStore();
		const err = new Error("dup");
		store.register(err, "test");
		store.register(err, "test");
		expect(store.errors().length).toBe(1);
	});

	it("different errors → both added", () => {
		const store = createDevErrorStore();
		store.register(new Error("first"), "test");
		store.register(new Error("second"), "test");
		expect(store.errors().length).toBe(2);
	});

	it("dismiss(id) → marks dismissed, still in list", () => {
		const store = createDevErrorStore();
		store.register(new Error("dismissable"), "test");
		const id = store.errors()[0]?.id ?? "";
		store.dismiss(id);
		expect(store.errors().length).toBe(1);
		expect(store.errors()[0]?.dismissed).toBe(true);
	});

	it("clear() → empties list", () => {
		const store = createDevErrorStore();
		store.register(new Error("a"), "test");
		store.register(new Error("b"), "test");
		expect(store.errors().length).toBe(2);
		store.clear();
		expect(store.errors().length).toBe(0);
	});

	it("hasErrors() → false when empty", () => {
		const store = createDevErrorStore();
		expect(store.hasErrors()).toBe(false);
	});

	it("hasErrors() → true when undismissed errors exist", () => {
		const store = createDevErrorStore();
		store.register(new Error("active"), "test");
		expect(store.hasErrors()).toBe(true);
	});

	it("hasErrors() → false when all dismissed", () => {
		const store = createDevErrorStore();
		store.register(new Error("dismissed"), "test");
		const id = store.errors()[0]?.id ?? "";
		store.dismiss(id);
		expect(store.hasErrors()).toBe(false);
	});

	it("errors() returns CapturedError shape", () => {
		const store = createDevErrorStore();
		store.register(new Error("shape"), "test");
		const captured = store.errors()[0] as CapturedError;
		expect(typeof captured.id).toBe("string");
		expect(typeof captured.timestamp).toBe("number");
		expect(typeof captured.dismissed).toBe("boolean");
		expect(typeof captured.source).toBe("string");
		expect(captured.error).toBeInstanceOf(Error);
	});

	it("dismissed error cannot be re-registered (same hash)", () => {
		const store = createDevErrorStore();
		const err = new Error("no-flash");
		store.register(err, "test");
		const id = store.errors()[0]?.id ?? "";
		store.dismiss(id);
		store.register(err, "test");
		/* still 1 entry, still dismissed */
		expect(store.errors().length).toBe(1);
		expect(store.errors()[0]?.dismissed).toBe(true);
	});

	it("clear allows re-registration of same error", () => {
		const store = createDevErrorStore();
		const err = new Error("cleared");
		store.register(err, "test");
		store.clear();
		store.register(err, "test");
		expect(store.errors().length).toBe(1);
		expect(store.errors()[0]?.dismissed).toBe(false);
	});

	it("SerializedError with stack → preserved on Error", () => {
		const store = createDevErrorStore();
		store.register({
			message: "boom",
			name: "TypeError",
			source: "ssr",
			stack: "TypeError: boom\n  at foo.ts:1",
		});
		expect(store.errors()[0]?.error.stack).toContain("TypeError: boom");
	});

	it("register without source → defaults to 'unknown'", () => {
		const store = createDevErrorStore();
		store.register(new Error("no source"));
		expect(store.errors()[0]?.source).toBe("unknown");
	});
});
