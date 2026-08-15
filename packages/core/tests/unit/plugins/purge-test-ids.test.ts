import { describe, expect, it } from "vitest";
import { createPurgeTestIdsPlugin } from "../../../src/plugins/purge.ts";

describe("createPurgeTestIdsPlugin", () => {
	describe("basic attribute removal", () => {
		it("removes data-testid with string literal value", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<div data-testid="my-element" class="foo">hello</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<div class="foo">hello</div>`);
		});

		it("removes data-testid with expression value", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<div data-testid={someVar} class="foo">hello</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<div class="foo">hello</div>`);
		});

		it("removes data-testid with template literal value", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = '<div data-testid={`item-${id}`} class="foo">hello</div>';
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<div class="foo">hello</div>`);
		});

		it("removes data-testid when it is the only attribute", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<div data-testid="solo">hello</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<div>hello</div>`);
		});

		it("removes data-testid at end of attributes", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<div class="foo" data-testid="last">hello</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<div class="foo">hello</div>`);
		});
	});

	describe("self-closing elements", () => {
		it("removes data-testid from self-closing element", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<input data-testid="input" type="text" />`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<input type="text" />`);
		});

		it("removes data-testid when only attr on self-closing", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<br data-testid="break" />`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<br />`);
		});
	});

	describe("multiline JSX", () => {
		it("handles multiline element with data-testid", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = [`<div`, `  class="container"`, `  data-testid="wrapper"`, `  id="main"`, `>`].join("\n");
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).not.toContain("data-testid");
			expect(result).toContain(`class="container"`);
			expect(result).toContain(`id="main"`);
		});

		it("handles data-testid with expression spanning line", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<div data-testid={"complex-value"} class="box">text</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).not.toContain("data-testid");
			expect(result).toContain(`class="box"`);
		});
	});

	describe("custom attribute names", () => {
		it("removes data-cy when specified", () => {
			const plugin = createPurgeTestIdsPlugin(["data-cy"]);
			const input = `<div data-cy="cypress-el" class="foo">hello</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<div class="foo">hello</div>`);
		});

		it("removes multiple custom attributes", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid", "data-cy"]);
			const input = `<div data-testid="test" data-cy="cypress" class="foo">hello</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<div class="foo">hello</div>`);
		});

		it("preserves attributes not in the list", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<div data-testid="test" data-cy="keep" class="foo">hello</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<div data-cy="keep" class="foo">hello</div>`);
		});
	});

	describe("file type filtering", () => {
		it("transforms .tsx files", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<div data-testid="test">hello</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).not.toContain("data-testid");
		});

		it("transforms .jsx files", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<div data-testid="test">hello</div>`;
			const result = callTransform(plugin, input, "component.jsx");
			expect(result).not.toContain("data-testid");
		});

		it("skips .ts files", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `const x = 'data-testid="test"'`;
			const result = callTransform(plugin, input, "utils.ts");
			expect(result).toBeNull();
		});

		it("skips .js files", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `const x = 'data-testid="test"'`;
			const result = callTransform(plugin, input, "utils.js");
			expect(result).toBeNull();
		});

		it("skips .css files", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `[data-testid="test"] { color: red; }`;
			const result = callTransform(plugin, input, "style.css");
			expect(result).toBeNull();
		});
	});

	describe("edge cases", () => {
		it("handles no data-testid in file — returns null (no transform)", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<div class="foo">hello</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBeNull();
		});

		it("preserves all other attributes", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<button data-testid="btn" onClick={handleClick} disabled type="submit" aria-label="Go">Go</button>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<button onClick={handleClick} disabled type="submit" aria-label="Go">Go</button>`);
		});

		it("handles multiple elements in same file", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = [`<div data-testid="first">one</div>`, `<span data-testid="second">two</span>`].join("\n");
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).not.toContain("data-testid");
			expect(result).toContain("<div>one</div>");
			expect(result).toContain("<span>two</span>");
		});

		it("handles data-testid with empty string value", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<div data-testid="" class="foo">hello</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<div class="foo">hello</div>`);
		});

		it("handles data-testid with nested braces in expression", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<div data-testid={obj.id} class="foo">hello</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<div class="foo">hello</div>`);
		});

		it("does not strip data-testid-like attributes (data-testid-extra)", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<div data-testid-extra="keep" data-testid="remove">hello</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<div data-testid-extra="keep">hello</div>`);
		});

		it("handles spread props alongside data-testid", () => {
			const plugin = createPurgeTestIdsPlugin(["data-testid"]);
			const input = `<div {...props} data-testid="test" class="foo">hello</div>`;
			const result = callTransform(plugin, input, "component.tsx");
			expect(result).toBe(`<div {...props} class="foo">hello</div>`);
		});
	});
});

/* Helper to call the transform hook on a VitePlugin-like object */
function callTransform(
	plugin: { transform?: (code: string, id: string) => { code: string } | null },
	code: string,
	filename: string,
): string | null {
	const result = plugin.transform?.(code, filename);
	return result ? result.code : null;
}
