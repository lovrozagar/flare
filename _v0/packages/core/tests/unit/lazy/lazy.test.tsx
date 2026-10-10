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

describe("lazy", () => {
	let container: HTMLDivElement;
	let dispose: () => void;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		resetLazyState();
	});

	afterEach(() => {
		dispose?.();
		container.remove();
	});

	it("client post-hydration: renders loaded immediately", async () => {
		const LazyComp = lazy({
			loader: makeLoader(FakeComponent),
		});

		/* Wait for loader to resolve */
		await tick();

		dispose = render(() => <LazyComp />, container);
		expect(container.querySelector("[data-testid='loaded']")).not.toBeNull();
	});

	it("renders pending when component not yet loaded", () => {
		const LazyComp = lazy({
			loader: makeLoader(FakeComponent, 100),
			pending: PendingComponent,
		});

		dispose = render(() => <LazyComp />, container);
		expect(container.querySelector("[data-testid='pending']")).not.toBeNull();
		expect(container.querySelector("[data-testid='loaded']")).toBeNull();
	});

	it("renders null when no pending and not yet loaded", () => {
		const LazyComp = lazy({
			loader: makeLoader(FakeComponent, 100),
		});

		dispose = render(() => <LazyComp />, container);
		expect(container.innerHTML).toBe("");
	});

	it("swaps to loaded after mount", async () => {
		const LazyComp = lazy({
			loader: makeLoader(FakeComponent, 5),
			pending: PendingComponent,
		});

		dispose = render(() => <LazyComp />, container);
		expect(container.querySelector("[data-testid='pending']")).not.toBeNull();

		/* Wait for load + mount */
		await new Promise((r) => setTimeout(r, 20));

		expect(container.querySelector("[data-testid='loaded']")).not.toBeNull();
	});

	it("loader called once (cached)", () => {
		const loaderFn = vi.fn().mockResolvedValue({ default: FakeComponent });
		const LazyComp = lazy({ loader: loaderFn });

		dispose = render(
			() => (
				<>
					<LazyComp />
					<LazyComp />
				</>
			),
			container,
		);

		/* Loader should only be called once at factory call */
		expect(loaderFn).toHaveBeenCalledTimes(1);
	});

	it("passes props to loaded component", async () => {
		const LazyComp = lazy({
			loader: makeLoader(FakeComponent),
		});

		await tick();

		dispose = render(() => <LazyComp label="custom" />, container);
		expect(container.querySelector("[data-testid='loaded']")?.textContent).toBe("custom");
	});

	it("retries a transient chunk-load error then renders", async () => {
		let calls = 0;
		const LazyComp = lazy({
			loader: () => {
				calls++;
				if (calls === 1) {
					return Promise.reject(new Error("Failed to fetch dynamically imported module: /island.js"));
				}
				return Promise.resolve({ default: FakeComponent });
			},
		});

		await new Promise((r) => setTimeout(r, 300));
		dispose = render(() => <LazyComp />, container);
		await tick();
		expect(container.querySelector("[data-testid='loaded']")).not.toBeNull();
		expect(calls).toBe(2);
	});

	it("loader rejection surfaces error to Errored", async () => {
		const LazyComp = lazy<{ label?: string }>({
			loader: () => Promise.reject<{ default: Component<{ label?: string }> }>(new Error("chunk 404")),
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
		/* Error surfaces after mount via deferred setError */
		await tick();
		expect(container.querySelector("[data-testid='error']")?.textContent).toBe("chunk 404");
	});
});

describe("clientLazy", () => {
	let container: HTMLDivElement;
	let dispose: () => void;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		resetLazyState();
	});

	afterEach(() => {
		dispose?.();
		container.remove();
	});

	it("client: loads and renders component", async () => {
		const LazyComp = clientLazy({
			loader: makeLoader(FakeComponent),
		});

		dispose = render(() => <LazyComp />, container);
		await tick();
		await tick();

		expect(container.querySelector("[data-testid='loaded']")).not.toBeNull();
	});

	it("renders factory pending while loading", () => {
		const LazyComp = clientLazy({
			loader: makeLoader(FakeComponent, 100),
			pending: PendingComponent,
		});

		dispose = render(() => <LazyComp />, container);
		expect(container.querySelector("[data-testid='pending']")).not.toBeNull();
	});

	it("per-instance pending prop overrides factory pending", () => {
		function OverridePending() {
			return <span data-testid="override">Override</span>;
		}

		const LazyComp = clientLazy({
			loader: makeLoader(FakeComponent, 100),
			pending: PendingComponent,
		});

		dispose = render(() => <LazyComp pending={OverridePending} />, container);
		expect(container.querySelector("[data-testid='override']")).not.toBeNull();
		expect(container.querySelector("[data-testid='pending']")).toBeNull();
	});

	it("eager: true → starts loading at factory call", () => {
		const loaderFn = vi.fn().mockResolvedValue({ default: FakeComponent });

		clientLazy({
			eager: true,
			loader: loaderFn,
		});

		/* Loader called immediately at factory time */
		expect(loaderFn).toHaveBeenCalledTimes(1);
	});

	it("eager: false → does not call loader at factory", () => {
		const loaderFn = vi.fn().mockResolvedValue({ default: FakeComponent });

		clientLazy({
			loader: loaderFn,
		});

		/* Not called until first render */
		expect(loaderFn).toHaveBeenCalledTimes(0);
	});

	it("eager: false → calls loader on first render", () => {
		const loaderFn = vi.fn().mockResolvedValue({ default: FakeComponent });

		const LazyComp = clientLazy({
			loader: loaderFn,
		});

		dispose = render(() => <LazyComp />, container);
		expect(loaderFn).toHaveBeenCalledTimes(1);
	});

	it("renders null when no pending and not loaded", () => {
		const LazyComp = clientLazy({
			loader: makeLoader(FakeComponent, 100),
		});

		dispose = render(() => <LazyComp />, container);
		expect(container.innerHTML).toBe("");
	});

	it("retries a transient chunk-load error then renders", async () => {
		let calls = 0;
		const LazyComp = clientLazy({
			loader: () => {
				calls++;
				if (calls === 1) {
					return Promise.reject(new Error("Failed to fetch dynamically imported module: /island.js"));
				}
				return Promise.resolve({ default: FakeComponent });
			},
		});

		dispose = render(() => <LazyComp />, container);
		await new Promise((r) => setTimeout(r, 300));
		await tick();
		expect(container.querySelector("[data-testid='loaded']")).not.toBeNull();
		expect(calls).toBe(2);
	});

	it("eager loader rejection surfaces error to Errored", async () => {
		const LazyComp = clientLazy<{ label?: string }>({
			eager: true,
			loader: () => Promise.reject<{ default: Component<{ label?: string }> }>(new Error("chunk 404")),
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
		/* Error surfaces after mount */
		await tick();
		expect(container.querySelector("[data-testid='error']")?.textContent).toBe("chunk 404");
	});

	it("non-eager loader rejection surfaces error to Errored", async () => {
		const LazyComp = clientLazy<{ label?: string }>({
			loader: () => Promise.reject<{ default: Component<{ label?: string }> }>(new Error("chunk 404")),
			pending: PendingComponent,
		});

		dispose = render(
			() => (
				<Errored fallback={(err) => <span data-testid="error">{String((err() as Error).message)}</span>}>
					<LazyComp />
				</Errored>
			),
			container,
		);
		/* Wait for load rejection + mount */
		await tick();
		await tick();
		await tick();

		expect(container.querySelector("[data-testid='error']")?.textContent).toBe("chunk 404");
	});
});

describe("waitForLazyPreloads", () => {
	beforeEach(() => {
		resetLazyState();
	});

	it("no lazy components → resolves immediately", async () => {
		await waitForLazyPreloads();
	});

	it("pending loads → waits for all", async () => {
		let resolve1: () => void = () => {};
		const loader1 = () =>
			new Promise<{ default: Component<Record<string, unknown>> }>((r) => {
				resolve1 = () => r({ default: FakeComponent });
			});

		lazy({ loader: loader1 });

		let resolved = false;
		const p = waitForLazyPreloads().then(() => {
			resolved = true;
		});

		await tick();
		expect(resolved).toBe(false);

		resolve1();
		await p;

		expect(resolved).toBe(true);
	});

	it("all loaded → resolves immediately", async () => {
		lazy({ loader: makeLoader(FakeComponent) });
		await tick();

		/* All loaders resolved — waitForLazyPreloads should resolve */
		await waitForLazyPreloads();
	});

	it("resolved loader cleans up from pending set", async () => {
		lazy({ loader: makeLoader(FakeComponent) });

		/* Before resolve — waitForLazyPreloads should not resolve yet or should wait */
		const beforePromise = waitForLazyPreloads();
		await beforePromise;

		/* After all resolved — pending set empty, resolves immediately */
		await waitForLazyPreloads();
	});

	it("rejected loader cleans up from pending set", async () => {
		lazy<{ label?: string }>({
			loader: () => Promise.reject(new Error("chunk fail")),
		});

		await tick();

		/* Despite rejection, pending set is cleaned up — resolves immediately */
		await waitForLazyPreloads();
	});
});
