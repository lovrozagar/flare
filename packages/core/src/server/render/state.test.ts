import { expect, it } from "vitest";
import { createRouter } from "../../shared/router/create-router.ts";
import { renderDocument } from "./document.ts";
import { insertState } from "./state.ts";

it("one script", async () => {
	const html = await renderDocument({
		request: new Request("http://localhost/"),
		router: createRouter({ layouts: {}, routeTree: [] }),
		loader: () => ({ n: 1 }),
		render: () => "page",
	});
	expect(html.match(/self\.flare/g)).toHaveLength(1);
	const source = html.slice(html.indexOf("self.flare="), html.indexOf("</script>"));
	const value = Function(`const self = {}; ${source}; return self.flare;`)() as {
		matches: Array<Record<string, unknown> & { data: { n: number } }>;
	};
	expect(value.matches[0]?.data.n).toBe(1);
	expect(Object.keys(value.matches[0] ?? {}).sort()).toEqual([
		"data",
		"error",
		"head",
		"id",
		"params",
		"preloader",
		"search",
	]);
});

it("nonce field", async () => {
	const html = await renderDocument({
		request: new Request("http://localhost/"),
		router: createRouter({ layouts: {}, routeTree: [] }),
		nonce: "abc",
		render: () => "page",
	});
	expect(html).toContain('"nonce":"abc"');
});

it("empty nonce", async () => {
	const html = await renderDocument({
		request: new Request("http://localhost/"),
		router: createRouter({ layouts: {}, routeTree: [] }),
		nonce: "",
		render: () => "page",
	});
	expect(html).toContain('"nonce":""');
});

it("insertion", () => {
	const script = "<script>self.flare=1</script>";
	const html = insertState("<body>hi</body>", script);
	expect(html.indexOf(script)).toBeGreaterThan(-1);
	expect(html.indexOf(script)).toBeLessThan(html.indexOf("</body>"));
});
