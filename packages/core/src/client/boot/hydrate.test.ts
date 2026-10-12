import { expect, it } from "vitest";
import { readState } from "./hydrate.ts";

const match = {
	id: "_root_",
	params: {},
	search: {},
	data: { n: 1 },
	preloader: null,
	head: null,
	error: null,
};

it("reads the script", () => {
	document.body.innerHTML = `<script>var marker = 1</script><script>self.flare=${JSON.stringify({ matches: [match] })}</script><div id="app"></div>`;
	expect(readState().matches[0]).toEqual(match);
});

it("no state", () => {
	document.body.innerHTML = '<div id="app"></div>';
	expect(() => readState()).toThrow(/self\.flare/);
});
