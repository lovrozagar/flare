import { expect, it } from "vitest";
import { shellTree } from "./shell.ts";

// Each element knows its parent and its previous element sibling. Text, comments, and raw text are not elements.
it("tree", () => {
	const [html, body, first, second, nested] = shellTree(
		`<html><body><p class="a b" id="x">t<!-- c --></p><script>"<i>"</script><div><span title='q>r'></span></div></body></html>`,
	);
	expect(html).toMatchObject({ tag: "html", parent: undefined, previous: undefined });
	expect(body?.parent).toBe(html);
	expect(first).toMatchObject({ tag: "p", parent: body, previous: undefined });
	expect([...(first?.classes ?? [])]).toEqual(["a", "b"]);
	expect(first?.attributes.get("id")).toBe("x");
	expect(second).toMatchObject({ tag: "script", parent: body, previous: first });
	expect(nested).toMatchObject({ tag: "div", parent: body, previous: second });
	expect(shellTree(`<div><span title='q>r'></span></div>`)[1]?.attributes.get("title")).toBe("q>r");
});

// Unquoted and empty attribute values, and an unterminated comment or tag, which ends the shell.
it("loose markup", () => {
	const [input] = shellTree(`<input type=text disabled data-x=''><!-- open`);
	expect(input?.attributes.get("type")).toBe("text");
	expect(input?.attributes.get("disabled")).toBe("");
	expect(input?.attributes.get("data-x")).toBe("");
	expect(shellTree(`<p></p><!DOCTYPE`)).toHaveLength(1);
	expect(shellTree(`<p></p></p`)).toHaveLength(1);
});

// Solid's SSR writes `&` as `&amp;` and quotes as `&quot;` or `&#39;` in attributes. Values are decoded before
// classes and attributes are read, so Tailwind's arbitrary variants match.
it("entities", () => {
	const [element] = shellTree(
		`<p class="[&amp;>*]:p-2 content-[&#39;x&#39;] a&amp;b q-[&quot;y&quot;] n&nbsp;b" data-x="&#x41;&lt;&gt;&apos;&unknown;"></p>`,
	);
	expect([...(element?.classes ?? [])]).toEqual(["[&>*]:p-2", "content-['x']", "a&b", 'q-["y"]', "n b"]);
	expect(element?.attributes.get("data-x")).toBe("A<>'&unknown;");
});
