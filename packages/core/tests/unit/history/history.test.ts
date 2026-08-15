import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	createHistoryListener,
	createHistoryState,
	createScrollStore,
	getCurrentScroll,
	getHistoryIndex,
	incrementHistoryIndex,
	initHistoryIndex,
	parseHistoryState,
	pushHistoryState,
	replaceHistoryState,
	restoreScroll,
	scrollToTop,
	setHistoryIndex,
} from "../../../src/history/index.ts";

describe("createHistoryState", () => {
	it("returns state with pathname, params, search, key, historyIndex", () => {
		const state = createHistoryState("/about", { id: "1" }, "?q=x");
		expect(state.pathname).toBe("/about");
		expect(state.params).toEqual({ id: "1" });
		expect(state.search).toBe("?q=x");
		expect(state.key).toBeDefined();
		expect(state.historyIndex).toBe(0);
	});

	it("key is unique across calls", () => {
		const a = createHistoryState("/a");
		const b = createHistoryState("/b");
		expect(a.key).not.toBe(b.key);
	});

	it("default params → {}", () => {
		const state = createHistoryState("/x");
		expect(state.params).toEqual({});
	});

	it("default search → empty string", () => {
		const state = createHistoryState("/x");
		expect(state.search).toBe("");
	});

	it("default historyIndex → 0", () => {
		const state = createHistoryState("/x");
		expect(state.historyIndex).toBe(0);
	});

	it("user state passed through", () => {
		const state = createHistoryState("/x", {}, "", { state: { custom: true } });
		expect(state.state).toEqual({ custom: true });
	});

	it("historyIndex from options", () => {
		const state = createHistoryState("/x", {}, "", { historyIndex: 5 });
		expect(state.historyIndex).toBe(5);
	});
});

describe("pushHistoryState", () => {
	let pushStateSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		pushStateSpy = vi.fn();
		vi.stubGlobal("history", { pushState: pushStateSpy, replaceState: vi.fn() });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("calls history.pushState with state and URL", () => {
		const state = pushHistoryState("/about", {}, "?q=x");
		expect(pushStateSpy).toHaveBeenCalledWith(state, "", "/about?q=x");
	});

	it("URL composed from pathname + search + hash", () => {
		pushHistoryState("/page", {}, "?a=1", { hash: "#top" });
		expect(pushStateSpy.mock.calls[0][2]).toBe("/page?a=1#top");
	});

	it("returns created HistoryState", () => {
		const state = pushHistoryState("/x");
		expect(state.pathname).toBe("/x");
		expect(state.key).toBeDefined();
	});
});

describe("pushHistoryState SSR-safe", () => {
	it("no-op without history API", () => {
		const original = globalThis.history;
		vi.stubGlobal("history", undefined);
		const state = pushHistoryState("/x");
		expect(state.pathname).toBe("/x");
		vi.unstubAllGlobals();
		if (original) vi.stubGlobal("history", original);
	});
});

describe("replaceHistoryState", () => {
	let replaceStateSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		replaceStateSpy = vi.fn();
		vi.stubGlobal("history", { pushState: vi.fn(), replaceState: replaceStateSpy });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("calls history.replaceState with state and URL", () => {
		const state = replaceHistoryState("/home");
		expect(replaceStateSpy).toHaveBeenCalledWith(state, "", "/home");
	});

	it("returns created HistoryState", () => {
		const state = replaceHistoryState("/home");
		expect(state.pathname).toBe("/home");
	});
});

describe("parseHistoryState", () => {
	it("valid state → HistoryState", () => {
		const raw = { historyIndex: 0, key: "abc", params: {}, pathname: "/x", search: "" };
		const result = parseHistoryState(raw);
		expect(result).not.toBeNull();
		expect(result?.pathname).toBe("/x");
	});

	it("null → null", () => {
		expect(parseHistoryState(null)).toBeNull();
	});

	it("undefined → null", () => {
		expect(parseHistoryState(undefined)).toBeNull();
	});

	it("no pathname → null", () => {
		expect(parseHistoryState({ key: "abc" })).toBeNull();
	});

	it("no key → null", () => {
		expect(parseHistoryState({ pathname: "/x" })).toBeNull();
	});

	it("array → null", () => {
		expect(parseHistoryState([1, 2])).toBeNull();
	});

	it("partial state → defaults for optional fields", () => {
		const result = parseHistoryState({ key: "k", pathname: "/x" });
		expect(result).not.toBeNull();
		expect(result?.historyIndex).toBe(0);
		expect(result?.params).toEqual({});
		expect(result?.search).toBe("");
	});
});

describe("createHistoryListener", () => {
	let addSpy: ReturnType<typeof vi.fn>;
	let removeSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		addSpy = vi.fn();
		removeSpy = vi.fn();
		vi.stubGlobal("addEventListener", addSpy);
		vi.stubGlobal("removeEventListener", removeSpy);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("registers popstate handler", () => {
		createHistoryListener(() => {});
		expect(addSpy).toHaveBeenCalledWith("popstate", expect.any(Function));
	});

	it("returns cleanup function", () => {
		const cleanup = createHistoryListener(() => {});
		expect(typeof cleanup).toBe("function");
	});

	it("cleanup removes handler", () => {
		const cleanup = createHistoryListener(() => {});
		cleanup();
		expect(removeSpy).toHaveBeenCalledWith("popstate", expect.any(Function));
	});

	it("valid state → onNavigate called with HistoryNavigateEvent", () => {
		const onNavigate = vi.fn();
		createHistoryListener(onNavigate);
		const handler = addSpy.mock.calls[0][1];
		handler({
			state: { historyIndex: 1, key: "k1", params: {}, pathname: "/x", search: "" },
		});
		expect(onNavigate).toHaveBeenCalledWith(expect.objectContaining({ key: "k1", pathname: "/x", type: "popstate" }));
	});

	it("invalid state (non-Flare entry) → ignored", () => {
		const onNavigate = vi.fn();
		createHistoryListener(onNavigate);
		const handler = addSpy.mock.calls[0][1];
		handler({ state: null });
		expect(onNavigate).not.toHaveBeenCalled();
	});
});

describe("createHistoryListener SSR-safe", () => {
	it("returns no-op cleanup", () => {
		const original = globalThis.addEventListener;
		vi.stubGlobal("addEventListener", undefined);
		const cleanup = createHistoryListener(() => {});
		expect(typeof cleanup).toBe("function");
		cleanup();
		vi.unstubAllGlobals();
		if (original) vi.stubGlobal("addEventListener", original);
	});
});

describe("ScrollStore", () => {
	it("save + get → returns position", () => {
		const store = createScrollStore();
		store.save("k1", { x: 10, y: 20 });
		expect(store.get("k1")).toEqual({ x: 10, y: 20 });
	});

	it("unknown key → null", () => {
		const store = createScrollStore();
		expect(store.get("unknown")).toBeNull();
	});

	it("LRU eviction: save 201 entries (max 200) → first evicted", () => {
		const store = createScrollStore(200);
		for (let i = 0; i < 201; i++) {
			store.save(`k${i}`, { x: i, y: i });
		}
		expect(store.get("k0")).toBeNull();
		expect(store.get("k200")).toEqual({ x: 200, y: 200 });
	});

	it("save existing key → moves to end (not evicted first)", () => {
		const store = createScrollStore(3);
		store.save("a", { x: 0, y: 0 });
		store.save("b", { x: 1, y: 1 });
		store.save("c", { x: 2, y: 2 });
		/* touch "a" to move it to end */
		store.save("a", { x: 10, y: 10 });
		/* add new entry → evicts oldest (b) */
		store.save("d", { x: 3, y: 3 });
		expect(store.get("b")).toBeNull();
		expect(store.get("a")).toEqual({ x: 10, y: 10 });
	});

	it("multiple gets don't affect LRU order", () => {
		const store = createScrollStore(3);
		store.save("a", { x: 0, y: 0 });
		store.save("b", { x: 1, y: 1 });
		store.save("c", { x: 2, y: 2 });
		store.get("a");
		store.get("a");
		/* add new → evicts "a" (oldest by save, not by get) */
		store.save("d", { x: 3, y: 3 });
		expect(store.get("a")).toBeNull();
	});
});

describe("getCurrentScroll", () => {
	it("returns { x: scrollX, y: scrollY }", () => {
		vi.stubGlobal("scrollX", 100);
		vi.stubGlobal("scrollY", 200);
		expect(getCurrentScroll()).toEqual({ x: 100, y: 200 });
		vi.unstubAllGlobals();
	});

	it("SSR-safe: returns { x: 0, y: 0 }", () => {
		vi.stubGlobal("scrollX", undefined);
		vi.stubGlobal("scrollY", undefined);
		const scroll = getCurrentScroll();
		expect(scroll).toEqual({ x: 0, y: 0 });
		vi.unstubAllGlobals();
	});
});

describe("restoreScroll", () => {
	it("calls scrollTo with position and default behavior", () => {
		const scrollToSpy = vi.fn();
		vi.stubGlobal("scrollTo", scrollToSpy);
		restoreScroll({ x: 50, y: 100 });
		expect(scrollToSpy).toHaveBeenCalledWith({ behavior: "auto", left: 50, top: 100 });
		vi.unstubAllGlobals();
	});

	it("SSR-safe: no-op", () => {
		vi.stubGlobal("scrollTo", undefined);
		expect(() => restoreScroll({ x: 0, y: 0 })).not.toThrow();
		vi.unstubAllGlobals();
	});
});

describe("scrollToTop", () => {
	it("calls scrollTo(0, 0)", () => {
		const scrollToSpy = vi.fn();
		vi.stubGlobal("scrollTo", scrollToSpy);
		scrollToTop();
		expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
		vi.unstubAllGlobals();
	});

	it("SSR-safe: no-op", () => {
		vi.stubGlobal("scrollTo", undefined);
		expect(() => scrollToTop()).not.toThrow();
		vi.unstubAllGlobals();
	});
});

describe("history index", () => {
	it("initHistoryIndex(5) → getHistoryIndex() === 5", () => {
		initHistoryIndex(5);
		expect(getHistoryIndex()).toBe(5);
	});

	it("incrementHistoryIndex → getHistoryIndex() === 6", () => {
		initHistoryIndex(5);
		incrementHistoryIndex();
		expect(getHistoryIndex()).toBe(6);
	});

	it("setHistoryIndex(3) → getHistoryIndex() === 3", () => {
		setHistoryIndex(3);
		expect(getHistoryIndex()).toBe(3);
	});
});

describe("parseHistoryState scroll validation", () => {
	it("valid scroll position preserved", () => {
		const state = parseHistoryState({
			key: "k1",
			pathname: "/",
			scroll: { x: 10, y: 20 },
			search: "",
		});
		expect(state?.scroll).toEqual({ x: 10, y: 20 });
	});

	it("non-numeric scroll values → undefined", () => {
		const state = parseHistoryState({
			key: "k1",
			pathname: "/",
			scroll: { x: "bad", y: 10 },
			search: "",
		});
		expect(state?.scroll).toBeUndefined();
	});

	it("NaN scroll values → undefined", () => {
		const state = parseHistoryState({
			key: "k1",
			pathname: "/",
			scroll: { x: NaN, y: 0 },
			search: "",
		});
		expect(state?.scroll).toBeUndefined();
	});

	it("Infinity scroll values → undefined", () => {
		const state = parseHistoryState({
			key: "k1",
			pathname: "/",
			scroll: { x: 0, y: Infinity },
			search: "",
		});
		expect(state?.scroll).toBeUndefined();
	});

	it("null scroll → undefined", () => {
		const state = parseHistoryState({
			key: "k1",
			pathname: "/",
			scroll: null,
			search: "",
		});
		expect(state?.scroll).toBeUndefined();
	});
});
