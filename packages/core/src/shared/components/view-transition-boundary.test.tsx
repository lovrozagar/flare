import { createComponent, flush } from "solid-js";
import { Dynamic, render, type JSX } from "@solidjs/web";
import { expect, it, vi } from "vitest";
import { transitionScope, ViewTransitionBoundary } from "./view-transition-boundary.tsx";

function element(tag: string, children?: JSX.Element): JSX.Element {
	return createComponent(Dynamic, { component: tag, children });
}

function mount(children: () => JSX.Element): HTMLElement & { dispose?: () => void } {
	const host: HTMLElement & { dispose?: () => void } = document.createElement("div");
	document.body.append(host);
	host.dispose = render(
		() =>
			createComponent(ViewTransitionBoundary, {
				get children() {
					return children();
				},
			}),
		host,
	);
	flush();
	return host;
}

it("one element", () => {
	const host = mount(() => element("main", "page"));
	expect(host.innerHTML).toBe("<main>page</main>");
});

it("empty", () => {
	const host = mount(() => false);
	expect(host.innerHTML).toBe("");
	const outside = document.createElement("p");
	host.append(outside);
	expect(transitionScope(outside)).toBe(document);
});

it("dev throw", () => {
	expect(() => mount(() => [element("main"), element("aside")])).toThrow(/one element/);
	expect(() => mount(() => "text")).toThrow(/one element/);
});

it("scope", () => {
	const host = mount(() => element("main", element("section", "outlet")));
	const main = host.querySelector("main");
	const outlet = host.querySelector("section");
	if (main === null || outlet === null) throw new Error("render");
	expect(transitionScope(outlet)).toBe(main);
	expect(transitionScope(host)).toBe(document);
	host.dispose?.();
	expect(transitionScope(outlet)).toBe(document);
});

it("no name", () => {
	// @ts-expect-error The boundary takes only children.
	const props: Parameters<typeof ViewTransitionBoundary>[0] = { children: "x", name: "main" };
	expect(props).toHaveProperty("name");
});

it("production skips", async () => {
	vi.stubEnv("DEV", false);
	vi.resetModules();
	const production = await import("./view-transition-boundary.tsx");
	const host = document.createElement("div");
	render(
		() => createComponent(production.ViewTransitionBoundary, { children: [element("main"), element("aside")] }),
		host,
	);
	flush();
	const main = host.querySelector("main");
	if (main === null) throw new Error("render");
	expect(production.transitionScope(main)).toBe(document);
	vi.unstubAllEnvs();
	vi.resetModules();
});
