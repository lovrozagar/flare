import { createComponent, flush, useContext } from "solid-js";
import { Dynamic, render, type JSX } from "@solidjs/web";
import { expect, it, vi } from "vitest";
import { TransitionScopeContext, ViewTransitionBoundary } from "./view-transition-boundary.tsx";

// A child that renders nothing and keeps the scope its outlet would read.
function probe(seen: { scope?: () => Element | undefined }): JSX.Element {
	return createComponent(() => {
		seen.scope = useContext(TransitionScopeContext);
		return undefined;
	}, {});
}

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

function probeWith(context: typeof TransitionScopeContext, seen: { scope?: () => Element | undefined }): JSX.Element {
	return createComponent(() => {
		seen.scope = useContext(context);
		return undefined;
	}, {});
}

it("one element", () => {
	const host = mount(() => element("main", "page"));
	expect(host.innerHTML).toBe("<main>page</main>");
});

it("empty", () => {
	const seen: { scope?: () => Element | undefined } = {};
	const host = mount(() => probe(seen));
	expect(host.innerHTML).toBe("");
	expect(seen.scope?.()).toBeUndefined();
	const outside: { scope?: () => Element | undefined } = {};
	render(() => probe(outside), document.createElement("div"));
	expect(outside.scope?.()).toBeUndefined();
});

it("dev throw", () => {
	expect(() => mount(() => [element("main"), element("aside")])).toThrow(/one element/);
	expect(() => mount(() => "text")).toThrow(/one element/);
});

it("scope", () => {
	const seen: { scope?: () => Element | undefined } = {};
	const host = mount(() => element("main", element("section", probe(seen))));
	const main = host.querySelector("main");
	if (main === null) throw new Error("render");
	expect(seen.scope?.()).toBe(main);
	const inner: { scope?: () => Element | undefined } = {};
	mount(() =>
		element(
			"main",
			createComponent(ViewTransitionBoundary, {
				get children() {
					return element("aside", probe(inner));
				},
			}),
		),
	);
	expect(inner.scope?.()?.tagName).toBe("ASIDE");
	host.dispose?.();
	expect(seen.scope?.()).toBeUndefined();
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
	const seen: { scope?: () => Element | undefined } = {};
	render(
		() =>
			createComponent(production.TransitionScopeContext, {
				value: () => undefined,
				get children() {
					return createComponent(production.ViewTransitionBoundary, {
						get children() {
							return [element("main", probeWith(production.TransitionScopeContext, seen)), element("aside")];
						},
					});
				},
			}),
		host,
	);
	flush();
	expect(seen.scope?.()).toBeUndefined();
	vi.unstubAllEnvs();
	vi.resetModules();
});
