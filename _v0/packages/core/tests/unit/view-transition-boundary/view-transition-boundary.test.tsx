import { render } from "@solidjs/testing-library";
import { createSignal, Show } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewTransitionBoundary } from "../../../src/view-transition-boundary/index.tsx";
import { registeredBoundaries, resetViewTransitionBoundaries } from "../../../src/view-transition-boundary/registry.ts";

const boundaries = () => [...registeredBoundaries()];

describe("ViewTransitionBoundary", () => {
	afterEach(() => {
		resetViewTransitionBoundaries();
		vi.restoreAllMocks();
	});

	it("renders its single child unchanged and registers it", () => {
		const { container } = render(() => (
			<ViewTransitionBoundary>
				<main data-testid="content">Content</main>
			</ViewTransitionBoundary>
		));
		const main = container.querySelector('[data-testid="content"]');
		expect(main?.parentElement).toBe(container);
		expect(boundaries()).toEqual([main]);
	});

	it("unregisters on unmount", () => {
		const { unmount } = render(() => (
			<ViewTransitionBoundary>
				<main />
			</ViewTransitionBoundary>
		));
		expect(boundaries()).toHaveLength(1);
		unmount();
		expect(boundaries()).toEqual([]);
	});

	it("follows a child that a <Show> swaps", async () => {
		const [first, setFirst] = createSignal(true);
		const { container } = render(() => (
			<ViewTransitionBoundary>
				<Show when={first()} fallback={<section data-testid="b" />}>
					<main data-testid="a" />
				</Show>
			</ViewTransitionBoundary>
		));
		expect(boundaries()).toEqual([container.querySelector('[data-testid="a"]')]);
		setFirst(false);
		await Promise.resolve();
		await new Promise((r) => setTimeout(r, 0));
		expect(boundaries()).toEqual([container.querySelector('[data-testid="b"]')]);
	});

	it("is inactive with no children", () => {
		render(() => (
			<ViewTransitionBoundary>
				<Show when={false}>
					<main />
				</Show>
			</ViewTransitionBoundary>
		));
		expect(boundaries()).toEqual([]);
	});

	it("accepts a component that renders one root element", () => {
		const Content = () => <article data-testid="article" />;
		const { container } = render(() => (
			<ViewTransitionBoundary>
				<Content />
			</ViewTransitionBoundary>
		));
		expect(boundaries()).toEqual([container.querySelector('[data-testid="article"]')]);
	});

	it("rejects more than one child in dev", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() =>
			render(() => (
				<ViewTransitionBoundary>
					<main />
					<aside />
				</ViewTransitionBoundary>
			)),
		).toThrow(/exactly one element/);
		expect(boundaries()).toEqual([]);
	});

	it("rejects a text child in dev", () => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		expect(() => render(() => <ViewTransitionBoundary>plain text</ViewTransitionBoundary>)).toThrow(
			/exactly one element/,
		);
		expect(boundaries()).toEqual([]);
	});
});
