import type { Page } from "@playwright/test";
import { expect, expectTypeOf, it, vi } from "vitest";
import { flarePage, type FlarePageInput } from "./playwright.ts";

type Listener = (value: never) => void;

// A slice of Playwright's Page that records what the helper asks of it.
function fakePage(flare: unknown = undefined) {
	const listeners = new Map<string, Listener[]>();
	const page = {
		goto: vi.fn<(url: string) => Promise<null>>(async () => null),
		waitForSelector: vi.fn<(selector: string, options?: { state?: "attached" }) => Promise<null>>(async () => null),
		on(event: string, listener: Listener) {
			listeners.set(event, [...(listeners.get(event) ?? []), listener]);
			return page;
		},
		// The function runs here as it would in the document, with `self.flare` set for the call.
		async evaluate<T>(fn: () => T): Promise<T> {
			Reflect.set(globalThis, "flare", flare);
			try {
				return fn();
			} finally {
				Reflect.deleteProperty(globalThis, "flare");
			}
		},
	};
	const emit = (event: string, value: unknown): void => {
		for (const listener of listeners.get(event) ?? []) listener(value as never);
	};
	return { page, emit };
}

function message(type: string, text: string) {
	return { type: () => type, text: () => text };
}

it("hydrated", async () => {
	const { page } = fakePage();
	await flarePage(page).load();
	expect(page.goto).toHaveBeenCalledWith("/");
	expect(page.waitForSelector).toHaveBeenCalledWith("html[data-flare-hydrated]", { state: "attached" });
	await flarePage(page).load("/about");
	expect(page.goto).toHaveBeenLastCalledWith("/about");
	// The goto finishes before the wait starts.
	expect(page.goto.mock.invocationCallOrder[0]).toBeLessThan(page.waitForSelector.mock.invocationCallOrder[0] ?? 0);
	// A real Playwright Page is a FlarePageInput, so an app passes its own page.
	expectTypeOf<Page>().toMatchTypeOf<FlarePageInput>();
});

// Nothing is hidden: a hydration mismatch is the bug class an app's e2e is there to catch.
it("console all", () => {
	const { page, emit } = fakePage();
	const helper = flarePage(page);
	emit("console", message("error", "Hydration Mismatch. Unable to find DOM nodes for hydration key: 0-1"));
	emit("console", message("log", "hello"));
	emit("pageerror", new Error("boom"));
	expect(helper.consoleErrors()).toEqual([
		"Hydration Mismatch. Unable to find DOM nodes for hydration key: 0-1",
		"boom",
	]);
	// The list is a copy, collected from the moment the helper was made.
	helper.consoleErrors().push("x");
	expect(helper.consoleErrors()).toHaveLength(2);
});

const match = { id: "_root_/", params: {}, search: {}, data: { a: 1 }, preloader: null, head: null, error: null };

it("state", async () => {
	const document = { build: "abc123", nonce: "n", matches: [match], queries: null, fill: true, call: () => 1 };
	const state = await flarePage(fakePage(document).page).state();
	expect(state).toEqual({ build: "abc123", nonce: "n", matches: [match], queries: null });
	// The v0 short keys, a match missing a field, and no state at all are not Flare's document state.
	const invalid = [
		{ p: [], r: {}, c: {} },
		{ ...document, matches: [{ ...match, error: undefined }].map(({ error: _error, ...rest }) => rest) },
		{ ...document, matches: "x" },
		{ ...document, build: 1 },
		{ ...document, nonce: undefined },
		{ ...document, matches: [null] },
		undefined,
	];
	for (const value of invalid) {
		await expect(flarePage(fakePage(value).page).state()).rejects.toThrow(
			"self.flare is not Flare's document state: { build, nonce, matches, queries }",
		);
	}
});
