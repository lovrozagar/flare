import { createComponent } from "solid-js";
import { Dynamic, renderToString, type JSX } from "@solidjs/web";
import { expect, it, vi } from "vitest";
import { richText, type RichComponent } from "./rich.ts";

function bold(props: { children?: JSX.Element }): JSX.Element {
	return createComponent(Dynamic, {
		component: "b",
		get children() {
			return props.children;
		},
	});
}

// The markup without Solid's hydration keys and text markers.
function html(nodes: () => JSX.Element): string {
	return renderToString(nodes)
		.replaceAll(/ _hk=\d+/g, "")
		.replaceAll("<!--!$-->", "");
}

it("tag", () => {
	const link = vi.fn<RichComponent>((props) =>
		createComponent(Dynamic, {
			component: "a",
			href: "/terms",
			get children() {
				return props.children;
			},
		}),
	);
	expect(html(() => richText("Read {link}the terms{/link}.", { link }))).toBe('Read <a href="/terms">the terms</a>.');
	expect(link).toHaveBeenCalledTimes(1);
	// A tag on its own calls the component with no children.
	const icon = vi.fn<RichComponent>(() => "*");
	expect(html(() => richText("Star {icon} here", { icon }))).toBe("Star * here");
	expect(icon).toHaveBeenCalledTimes(1);
});

it("proto tag", () => {
	const toString = vi.spyOn(Object.prototype, "toString");
	expect(html(() => richText("x {toString} y {toString}z{/toString}", {}))).toBe(
		"x {toString} y {toString}z{/toString}",
	);
	expect(toString).not.toHaveBeenCalled();
	toString.mockRestore();
});

it("escape", () => {
	expect(html(() => richText("<script>x</script> {b}<i>{/b}", { b: bold }))).toBe(
		"&lt;script>x&lt;/script> <b>&lt;i></b>",
	);
	// A closing tag with no opening one, and an opening one never closed, stay text.
	expect(html(() => richText("a{/b} {b}c", { b: bold }))).toBe("a{/b} <b></b>c");
});

it("placeholder wins", () => {
	const name = vi.fn<RichComponent>(() => "component");
	const rendered = html(() =>
		richText("Hi {name} {b}{who}{/b}", { name, b: bold }, { values: { name: "Ana", who: "you" }, tag: "en" }),
	);
	expect(rendered).toBe("Hi Ana <b>you</b>");
	expect(name).not.toHaveBeenCalled();
});
