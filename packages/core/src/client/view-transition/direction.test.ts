import { afterEach, expect, it, vi } from "vitest";
import { runTransition, transitionDirection, transitionOption, type TransitionInfo } from "./direction.ts";

it("forward", () => {
	expect(transitionDirection({ from: 2, to: 3, enabled: true })).toBe("forward");
	expect(transitionDirection({ from: 2, to: 2, enabled: true })).toBe("same");
});

it("back", () => {
	expect(transitionDirection({ from: 3, to: 1, enabled: true })).toBe("back");
});

it("off", () => {
	expect(transitionDirection({ from: 2, to: 3, enabled: false })).toBeUndefined();
});

type Started = {
	updateCallbackDone: Promise<void>;
	ready: Promise<void>;
	finished: Promise<void>;
	skipTransition: () => void;
};

// A start that records how it was called: the plain callback (B119), or the object form with its types.
function stub() {
	const calls: ({ types?: string[] } | "callback")[] = [];
	const start = vi.fn<(arg: (() => void) | { update: () => void; types?: string[] }) => Started>((arg) => {
		if (typeof arg === "function") {
			calls.push("callback");
			arg();
		} else {
			calls.push({ types: arg.types });
			arg.update();
		}
		return {
			updateCallbackDone: Promise.resolve(),
			ready: Promise.resolve(),
			finished: Promise.resolve(),
			skipTransition() {},
		};
	});
	return { start, calls };
}

const info: TransitionInfo = {
	direction: "back",
	fromLocation: { pathname: "/b", search: "", hash: "" },
	toLocation: { pathname: "/a", search: "", hash: "" },
	pathChanged: true,
};

function auto(): Document {
	return document;
}

function update(): void {}

afterEach(() => {
	Reflect.deleteProperty(document, "startViewTransition");
	Reflect.deleteProperty(globalThis, "ViewTransitionTypeSet");
});

// A browser that supports view-transition types exposes their set's class.
function supportTypes(): void {
	Object.defineProperty(globalThis, "ViewTransitionTypeSet", { configurable: true, value: class {} });
}

// The plain callback unless the app configured types and the browser supports them; no direction type by default
// (B119).
it("types", async () => {
	const { start, calls } = stub();
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
	const update = vi.fn<() => void>();
	await runTransition({ option: {}, info, auto, update });
	await runTransition({ option: { types: ["slide"] }, info, auto, update });
	supportTypes();
	await runTransition({ option: {}, info, auto, update });
	await runTransition({ option: { types: ["slide"] }, info, auto, update });
	await runTransition({ option: { types: (seen) => [`to-${seen.toLocation.pathname}`] }, info, auto, update });
	await runTransition({ option: { types: () => [] }, info, auto, update });
	await runTransition({ option: { types: () => false }, info, auto, update });
	await runTransition({ option: false, info, auto, update });
	expect(calls).toEqual(["callback", "callback", "callback", { types: ["slide"] }, { types: ["to-/a"] }, "callback"]);
	expect(update).toHaveBeenCalledTimes(8);
});

// A transition still running is skipped before the next starts: two at once both freeze content being swapped (B119).
it("skips running", async () => {
	const skipped: string[] = [];
	const finishers: (() => void)[] = [];
	const running = (name: string): Started => ({
		updateCallbackDone: Promise.resolve(),
		ready: Promise.resolve(),
		finished: new Promise<void>((resolve) => void finishers.push(resolve)),
		skipTransition: () => void skipped.push(name),
	});
	let started = 0;
	const start = vi.fn<(arg: () => void) => Started>((arg) => {
		started += 1;
		arg();
		return running(`t${started}`);
	});
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
	await runTransition({ option: {}, info, auto, update });
	await runTransition({ option: {}, info, auto, update });
	expect(skipped).toEqual(["t1"]);
	finishers.at(-1)?.();
	await Promise.resolve();
	await runTransition({ option: {}, info, auto, update });
	expect(skipped).toEqual(["t1"]);
});

// An element-scoped start that throws falls back to the document transition (B119).
it("scoped throw", async () => {
	const fromDocument = stub();
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: fromDocument.start });
	const element = document.createElement("main");
	Object.defineProperty(element, "startViewTransition", {
		configurable: true,
		value: () => {
			throw new DOMException("not supported here", "InvalidStateError");
		},
	});
	const update = vi.fn<() => void>();
	await runTransition({ option: { scope: "auto" }, info, auto: () => element, update });
	expect(fromDocument.calls).toEqual(["callback"]);
	expect(update).toHaveBeenCalledOnce();
});

// The default scope is the document, though a boundary could start one; "auto" and a function returning it opt into the
// boundary's element, and an element that cannot start one falls back to the document (B119 (5)).
it("scope", async () => {
	const fromDocument = stub();
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: fromDocument.start });
	const element = document.createElement("main");
	const fromElement = stub();
	Object.defineProperty(element, "startViewTransition", { configurable: true, value: fromElement.start });
	await runTransition({ option: {}, info, auto: () => element, update });
	await runTransition({ option: { scope: "auto" }, info, auto: () => element, update });
	await runTransition({ option: { scope: "document" }, info, auto: () => element, update });
	await runTransition({ option: { scope: () => "auto" }, info, auto: () => element, update });
	await runTransition({ option: { scope: "auto" }, info, auto: () => document.createElement("section"), update });
	expect(fromElement.start).toHaveBeenCalledTimes(2);
	expect(fromDocument.start).toHaveBeenCalledTimes(3);
	Reflect.deleteProperty(document, "startViewTransition");
	const plain = vi.fn<() => void>();
	await runTransition({ option: {}, info, auto: () => document, update: plain });
	expect(plain).toHaveBeenCalledOnce();
});

// A skipped transition rejects `ready` with an AbortError. The update still completes, and the skip is expected,
// so the rejection is handled (BUGS.md B17).
it("skipped transition", async () => {
	const unhandled: unknown[] = [];
	const onUnhandled = (reason: unknown): void => void unhandled.push(reason);
	process.on("unhandledRejection", onUnhandled);
	const skipped = new DOMException("Transition was skipped", "AbortError");
	const start = vi.fn<(update: () => void) => Started>((update) => {
		update();
		return {
			updateCallbackDone: Promise.resolve(),
			ready: Promise.reject(skipped),
			finished: Promise.resolve(),
			skipTransition() {},
		};
	});
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
	const update = vi.fn<() => void>();
	await runTransition({ option: {}, info, auto, update });
	await new Promise((resolve) => setTimeout(resolve, 0));
	process.off("unhandledRejection", onUnhandled);
	expect(update).toHaveBeenCalledOnce();
	expect(unhandled).toEqual([]);
});

it("options", () => {
	const router = { types: ["fade"] };
	expect(transitionOption(undefined, router)).toBe(router);
	expect(transitionOption(undefined, false)).toBe(false);
	expect(transitionOption(true, false)).toEqual({});
	expect(transitionOption(false, router)).toBe(false);
	expect(transitionOption({ scope: "document" }, router)).toEqual({ scope: "document" });
});
