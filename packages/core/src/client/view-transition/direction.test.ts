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

function stub() {
	const calls: { types?: string[] }[] = [];
	const start = vi.fn<(options: { update: () => void; types?: string[] }) => { updateCallbackDone: Promise<void> }>(
		(options) => {
			calls.push({ types: options.types });
			options.update();
			return { updateCallbackDone: Promise.resolve() };
		},
	);
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
});

it("types", async () => {
	const { start, calls } = stub();
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: start });
	const update = vi.fn<() => void>();
	await runTransition({ option: {}, info, auto, update });
	await runTransition({ option: { types: ["slide"] }, info, auto, update });
	await runTransition({ option: { types: (seen) => [`to-${seen.toLocation.pathname}`] }, info, auto, update });
	await runTransition({ option: { types: () => false }, info, auto, update });
	await runTransition({ option: false, info, auto, update });
	expect(calls).toEqual([{ types: ["back"] }, { types: ["slide"] }, { types: ["to-/a"] }]);
	expect(update).toHaveBeenCalledTimes(5);
});

it("scope", async () => {
	const fromDocument = stub();
	Object.defineProperty(document, "startViewTransition", { configurable: true, value: fromDocument.start });
	const element = document.createElement("main");
	const fromElement = stub();
	Object.defineProperty(element, "startViewTransition", { configurable: true, value: fromElement.start });
	await runTransition({ option: {}, info, auto: () => element, update });
	await runTransition({ option: { scope: "document" }, info, auto: () => element, update });
	await runTransition({ option: { scope: () => "auto" }, info, auto: () => element, update });
	await runTransition({ option: {}, info, auto: () => document.createElement("section"), update });
	expect(fromElement.start).toHaveBeenCalledTimes(2);
	expect(fromDocument.start).toHaveBeenCalledTimes(2);
	Reflect.deleteProperty(document, "startViewTransition");
	const plain = vi.fn<() => void>();
	await runTransition({ option: {}, info, auto: () => document, update: plain });
	expect(plain).toHaveBeenCalledOnce();
});

it("options", () => {
	const router = { types: ["fade"] };
	expect(transitionOption(undefined, router)).toBe(router);
	expect(transitionOption(undefined, false)).toBe(false);
	expect(transitionOption(true, false)).toEqual({});
	expect(transitionOption(false, router)).toBe(false);
	expect(transitionOption({ scope: "document" }, router)).toEqual({ scope: "document" });
});
