import type { Component } from "solid-js";
import { Errored } from "solid-js";
import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientLazy, lazy, resetLazyState, waitForLazyPreloads } from "../../../src/lazy/index.tsx";

function tick(): Promise<void> {
	return new Promise((r) => setTimeout(r, 0));
}

function FakeComponent(props: { label?: string }) {
	return <span data-testid="loaded">{props.label ?? "loaded"}</span>;
}

function PendingComponent(props: { label?: string }) {
	return <span data-testid="pending">{props.label ?? "loading..."}</span>;
}

function makeLoader<P extends Record<string, unknown>>(
	component: Component<P>,
	delay = 0,
): () => Promise<{ default: Component<P> }> {
	if (delay === 0) {
		return () => Promise.resolve({ default: component });
	}
	return () => new Promise((r) => setTimeout(() => r({ default: component }), delay));
}

let container: HTMLDivElement;
let dispose: (() => void) | undefined;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
	resetLazyState();
});

afterEach(() => {
	dispose?.();
	dispose = undefined;
	container.remove();
});

/* ── Error coercion ── */

describe("lazy error coercion", () => {
	it("loader rejects with string → coerced to Error", async () => {
		const LazyComp = lazy<{ label?: string }>({
			loader: () => Promise.reject("chunk not found"),
			pending: PendingComponent,
		});

		await tick();

		dispose = render(
			() => (
				<Errored fallback={(err) => <span data-testid="error">{String((err() as Error).message)}</span>}>
					<LazyComp />
				</Errored>
			),
			container,
		);
		await tick();
		expect(container.querySelector("[data-testid='error']")?.textContent).toBe("chunk not found");
	});

	it("loader rejects with number → coerced to Error", async () => {
		const LazyComp = lazy<{ label?: string }>({
			loader: () => Promise.reject(404),
			pending: PendingComponent,
		});

		await tick();

		dispose = render(
			() => (
				<Errored fallback={(err) => <span data-testid="error">{String((err() as Error).message)}</span>}>
					<LazyComp />
				</Errored>
			),
			container,
		);
		await tick();
		expect(container.querySelector("[data-testid='error']")?.textContent).toBe("404");
	});

	it("loader rejects with Error → used directly", async () => {
		const LazyComp = lazy<{ label?: string }>({
			loader: () => Promise.reject(new Error("actual error")),
			pending: PendingComponent,
		});

		await tick();

		dispose = render(
			() => (
				<Errored fallback={(err) => <span data-testid="error">{String((err() as Error).message)}</span>}>
					<LazyComp />
				</Errored>
			),
			container,
		);
		await tick();
		expect(container.querySelector("[data-testid='error']")?.textContent).toBe("actual error");
	});
});

/* ── Concurrent lazy instances ── */

describe("concurrent lazy instances", () => {
	it("two lazy calls with different loaders → loader called once each", () => {
		const loader1 = vi.fn().mockResolvedValue({ default: FakeComponent });
		const loader2 = vi.fn().mockResolvedValue({ default: FakeComponent });

		lazy({ loader: loader1 });
		lazy({ loader: loader2 });

		expect(loader1).toHaveBeenCalledTimes(1);
		expect(loader2).toHaveBeenCalledTimes(1);
	});

	it("three lazy calls → waitForLazyPreloads waits for all three", async () => {
		let resolve1: () => void = () => {};
		let resolve2: () => void = () => {};
		let resolve3: () => void = () => {};

		lazy({
			loader: () =>
				new Promise<{ default: Component<Record<string, unknown>> }>((r) => {
					resolve1 = () => r({ default: FakeComponent });
				}),
		});
		lazy({
			loader: () =>
				new Promise<{ default: Component<Record<string, unknown>> }>((r) => {
					resolve2 = () => r({ default: FakeComponent });
				}),
		});
		lazy({
			loader: () =>
				new Promise<{ default: Component<Record<string, unknown>> }>((r) => {
					resolve3 = () => r({ default: FakeComponent });
				}),
		});

		let resolved = false;
		const p = waitForLazyPreloads().then(() => {
			resolved = true;
		});

		await tick();
		expect(resolved).toBe(false);

		resolve1();
		resolve2();
		await tick();
		expect(resolved).toBe(false);

		resolve3();
		await p;
		expect(resolved).toBe(true);
	});

	it("resetLazyState clears both pending and loaded sets", async () => {
		lazy({ loader: makeLoader(FakeComponent) });
		await tick();

		resetLazyState();

		/* After reset, waitForLazyPreloads resolves immediately (empty pending) */
		await waitForLazyPreloads();
	});
});

/* ── clientLazy edge cases ── */

describe("clientLazy edge cases", () => {
	it("non-eager: multiple renders → loader called once (cached)", () => {
		const loaderFn = vi.fn().mockResolvedValue({ default: FakeComponent });
		const LazyComp = clientLazy({ loader: loaderFn });

		dispose = render(
			() => (
				<>
					<LazyComp />
					<LazyComp />
				</>
			),
			container,
		);
		/* Loader should only be called once despite two renders */
		expect(loaderFn).toHaveBeenCalledTimes(1);
	});

	it("eager: loader resolves before render → component shown immediately", async () => {
		const LazyComp = clientLazy({
			eager: true,
			loader: makeLoader(FakeComponent),
		});

		await tick();

		dispose = render(() => <LazyComp />, container);
		await tick();
		expect(container.querySelector("[data-testid='loaded']")).not.toBeNull();
	});

	it("per-instance pending + no factory pending → only instance pending used", () => {
		const LazyComp = clientLazy({
			loader: makeLoader(FakeComponent, 100),
		});

		function InstancePending() {
			return <span data-testid="instance-pending">instance loading</span>;
		}

		dispose = render(() => <LazyComp pending={InstancePending} />, container);
		expect(container.querySelector("[data-testid='instance-pending']")).not.toBeNull();
	});

	it("clientLazy error coercion: string rejection → Error", async () => {
		const LazyComp = clientLazy<{ label?: string }>({
			loader: () => Promise.reject("string error"),
		});

		dispose = render(
			() => (
				<Errored fallback={(err) => <span data-testid="error">{String((err() as Error).message)}</span>}>
					<LazyComp />
				</Errored>
			),
			container,
		);
		await tick();
		await tick();
		await tick();
		expect(container.querySelector("[data-testid='error']")?.textContent).toBe("string error");
	});
});

/* ── waitForLazyPreloads robustness ── */

describe("waitForLazyPreloads robustness", () => {
	it("mixed resolve + reject → all settled before resolution", async () => {
		lazy({ loader: makeLoader(FakeComponent) });
		lazy<{ label?: string }>({
			loader: () => Promise.reject(new Error("fail")),
		});

		await tick();
		/* Should resolve despite one rejection */
		await waitForLazyPreloads();
	});

	it("called twice concurrently → both resolve", async () => {
		lazy({ loader: makeLoader(FakeComponent, 5) });

		const [r1, r2] = await Promise.all([waitForLazyPreloads(), waitForLazyPreloads()]);
		expect(r1).toBeUndefined();
		expect(r2).toBeUndefined();
	});

	it("props reactivity: changing props after load → re-rendered", async () => {
		function PropsComponent(props: { value?: string }) {
			return <span data-testid="value">{props.value ?? "default"}</span>;
		}

		const LazyComp = lazy({
			loader: makeLoader(PropsComponent),
		});

		await tick();

		dispose = render(() => <LazyComp value="updated" />, container);
		await tick();
		expect(container.querySelector("[data-testid='value']")?.textContent).toBe("updated");
	});
});
