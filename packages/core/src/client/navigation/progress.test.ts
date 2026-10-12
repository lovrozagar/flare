import { createComponent, flush } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as progressModule from "./progress.ts";
import { createNavigationState, NavigationContext, type NavigationState } from "./pending.ts";
import { useNavigationProgress, type ProgressOptions } from "./progress.ts";

type Seen = { readonly pending: boolean; readonly value: number | null };

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

function mount(options?: ProgressOptions): { state: NavigationState; progress: Seen; start: () => () => void } {
	const state = createNavigationState();
	const box: { progress?: Seen } = {};
	render(
		() =>
			createComponent(NavigationContext, {
				value: state,
				get children() {
					box.progress = useNavigationProgress(options);
					return "";
				},
			}),
		document.createElement("div"),
	);
	const progress: Seen = {
		get pending() {
			return box.progress?.pending ?? false;
		},
		get value() {
			return box.progress?.value ?? null;
		},
	};
	// Starts one tracked navigation. The returned function settles it.
	const start = (): (() => void) => {
		const fetch = Promise.withResolvers<void>();
		void state.track(fetch.promise);
		flush();
		return () => fetch.resolve();
	};
	return { state, progress, start };
}

async function settle(finish: () => void): Promise<void> {
	finish();
	await vi.advanceTimersByTimeAsync(0);
	flush();
}

it("start", () => {
	const { progress, start } = mount();
	expect(progress.value).toBeNull();
	start();
	expect(progress.value).toBe(0.08);
	expect(progress.pending).toBe(true);
});

it("first trickle", () => {
	const { progress, start } = mount();
	start();
	vi.advanceTimersByTime(199);
	flush();
	expect(progress.value).toBe(0.08);
	vi.advanceTimersByTime(1);
	flush();
	expect(progress.value).toBeCloseTo(0.18);
});

it("cap", () => {
	const { progress, start } = mount();
	start();
	vi.advanceTimersByTime(200 * 400);
	flush();
	expect(progress.value).toBe(0.994);
	vi.advanceTimersByTime(200);
	flush();
	expect(progress.value).toBe(0.994);
});

it("complete", async () => {
	const { progress, start } = mount();
	const finish = start();
	finish();
	await Promise.resolve();
	await Promise.resolve();
	flush();
	expect(progress.value).toBe(1);
	expect(progress.pending).toBe(false);
	await vi.advanceTimersByTimeAsync(0);
	flush();
	expect(progress.value).toBeNull();
});

it("min display", async () => {
	const { progress, start } = mount({ minDisplay: 300 });
	const finish = start();
	await vi.advanceTimersByTimeAsync(50);
	await settle(finish);
	expect(progress.value).toBe(1);
	await vi.advanceTimersByTimeAsync(249);
	flush();
	expect(progress.value).toBe(1);
	await vi.advanceTimersByTimeAsync(1);
	flush();
	expect(progress.value).toBeNull();
});

it("restart", async () => {
	const { progress, start } = mount({ minDisplay: 300 });
	await settle(start());
	expect(progress.value).toBe(1);
	start();
	expect(progress.value).toBe(0.08);
	await vi.advanceTimersByTimeAsync(300);
	flush();
	expect(progress.value).not.toBeNull();
});

it("prefetch", async () => {
	const { progress } = mount();
	await Promise.resolve("a prefetch is never tracked");
	flush();
	expect(progress.value).toBeNull();
	expect(progress.pending).toBe(false);
});

it("failure", async () => {
	const { state, progress } = mount();
	const fetch = Promise.withResolvers<void>();
	const tracked = state.track(fetch.promise).catch(() => undefined);
	flush();
	fetch.reject(new Error("network"));
	await tracked;
	flush();
	expect(progress.value).toBe(1);
	await vi.advanceTimersByTimeAsync(0);
	flush();
	expect(progress.value).toBeNull();
});

it("ssr", async () => {
	vi.resetModules();
	vi.doMock("@solidjs/web", async (original) => ({ ...(await original<object>()), isServer: true }));
	const server = await import("./progress.ts");
	const timers = vi.getTimerCount();
	expect({ ...server.useNavigationProgress() }).toEqual({ pending: false, value: null });
	expect(vi.getTimerCount()).toBe(timers);
	vi.doUnmock("@solidjs/web");
	vi.resetModules();
});

it("trickle 0", () => {
	expect(() => useNavigationProgress({ trickle: 0 })).toThrow(/trickle/);
});

it("trickle 15", () => {
	expect(() => useNavigationProgress({ trickle: 15 })).toThrow(/trickle/);
});

it("trickle 16", () => {
	const { progress, start } = mount({ trickle: 16 });
	start();
	vi.advanceTimersByTime(16);
	flush();
	expect(progress.value).toBeCloseTo(0.18);
});

it("min display negative", () => {
	expect(() => useNavigationProgress({ minDisplay: -1 })).toThrow(/minDisplay/);
	expect(() => useNavigationProgress({ minDisplay: 1.5 })).toThrow(/minDisplay/);
});

it("exports", () => {
	expect(Object.keys(progressModule)).toEqual(["useNavigationProgress"]);
	expect(progressModule).not.toHaveProperty("NavigationProgress");
});
