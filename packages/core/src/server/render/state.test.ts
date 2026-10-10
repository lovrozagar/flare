import { expect, it } from "vitest";
import { insertState, stateScript } from "./state.ts";

const match = {
	id: "_root_",
	params: {},
	search: {},
	data: { n: 1 },
	preloader: null,
	head: null,
	error: null,
};

it("one script", () => {
	const script = stateScript({ matches: [match] });
	expect(script.match(/self\.flare/g)).toHaveLength(1);
	const source = script.replace("<script>", "").replace("</script>", "");
	const value = Function(`const self = {}; ${source}; return self.flare;`)() as {
		matches: Array<{ data: { n: number } }>;
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

it("insertion", () => {
	const script = "<script>self.flare=1</script>";
	const html = insertState("<body>hi</body>", script);
	expect(html.indexOf(script)).toBeGreaterThan(-1);
	expect(html.indexOf(script)).toBeLessThan(html.indexOf("</body>"));
});
