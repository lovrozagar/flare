import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveTransitionScope } from "../../../src/navigation/transition-scope.ts";

function el(tag: string, parent: Element = document.body, style?: string): HTMLElement {
	const node = document.createElement(tag);
	if (style) node.setAttribute("style", style);
	parent.appendChild(node);
	return node;
}

describe("resolveTransitionScope", () => {
	afterEach(() => {
		document.body.innerHTML = "";
		vi.restoreAllMocks();
	});

	it("picks the boundary that wraps the swapped content", () => {
		const shell = el("div");
		const main = el("main", shell);
		const page = el("section", main);
		expect(resolveTransitionScope([main], [page])).toBe(main);
	});

	it("ignores a sibling boundary (sidebar) that does not contain the content", () => {
		const shell = el("div");
		const aside = el("aside", shell);
		const main = el("main", shell);
		const page = el("section", main);
		expect(resolveTransitionScope([aside], [page])).toBeNull();
		expect(resolveTransitionScope([aside, main], [page])).toBe(main);
	});

	it("ignores a boundary inside the swapped content: the update replaces it", () => {
		const main = el("main");
		const page = el("section", main);
		const inner = el("div", page);
		expect(resolveTransitionScope([inner], [page])).toBeNull();
		expect(resolveTransitionScope([inner, main], [page])).toBe(main);
	});

	it("picks the innermost of nested boundaries, however many", () => {
		let parent: HTMLElement = document.body;
		const chain: HTMLElement[] = [];
		for (let i = 0; i < 10; i++) {
			parent = el("div", parent);
			chain.push(parent);
		}
		const page = el("section", parent);
		expect(resolveTransitionScope([...chain].reverse(), [page])).toBe(chain.at(-1));
		expect(resolveTransitionScope(chain, [page])).toBe(chain.at(-1));
	});

	it("needs every swapped node inside the boundary", () => {
		const shell = el("div");
		const main = el("main", shell);
		const a = el("section", main);
		const b = el("section", shell);
		expect(resolveTransitionScope([main], [a, b])).toBeNull();
		expect(resolveTransitionScope([shell, main], [a, b])).toBe(shell);
	});

	it("counts a duplicate element once", () => {
		const main = el("main");
		const page = el("section", main);
		expect(resolveTransitionScope([main, main], [page])).toBe(main);
	});

	it("returns null with no swapped nodes", () => {
		const main = el("main");
		expect(resolveTransitionScope([main], [])).toBeNull();
	});

	it("rejects disconnected, html, svg, display: contents / none / inline boundaries", () => {
		vi.spyOn(console, "warn").mockImplementation(() => {});
		const detached = document.createElement("main");
		const page0 = document.createElement("section");
		detached.appendChild(page0);
		expect(resolveTransitionScope([detached], [page0])).toBeNull();

		const pageHtml = el("section");
		expect(resolveTransitionScope([document.documentElement], [pageHtml])).toBeNull();

		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		document.body.appendChild(svg);
		const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
		svg.appendChild(g);
		expect(resolveTransitionScope([svg], [g])).toBeNull();

		for (const display of ["contents", "none", "inline", "inline-block"]) {
			const box = el("div", document.body, `display: ${display}`);
			const page = el("section", box);
			expect(resolveTransitionScope([box], [page])).toBeNull();
		}
	});
});
