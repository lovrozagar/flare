import { expect, it } from "vitest"
import { stateText } from "./boot.fixture.ts"
import { readState, renderedLocation } from "./hydrate.ts"

const match = {
	id: "_root_",
	params: {},
	search: {},
	data: { n: 1 },
	preloader: null,
	head: null,
	error: null,
}

it("reads the script", () => {
	document.body.innerHTML = `<script>var marker = 1</script><script id="flare-state">${stateText({ matches: [match] })}</script><div id="app"></div>`
	expect(readState().matches[0]).toEqual(match)
})

// A page's own script or text that holds `self.flare=`, before the state, is not the state: the boot reads the last
// script with the state id (BUGS.md 167).
it("state among lookalikes", () => {
	const lookalike = `<script>self.flare={"matches":[]}</script><p>self.flare=text</p>`
	const forged = `<script id="flare-state">self.flare={"matches":[]}</script>`
	document.body.innerHTML = `${lookalike}${forged}<script id="flare-state">${stateText({ matches: [match] })}</script>`
	expect(readState().matches).toEqual([match])
})

it("no state", () => {
	document.body.innerHTML = '<div id="app"></div>'
	expect(() => readState()).toThrow(/self\.flare/)
})

// Hydrate mounts on the location the server rendered: the browser's path, the state's search or none, and no hash
// (plan 21 13.8, 13.9, BUGS.md 211).
it("rendered location", () => {
	const shown = { pathname: "/a", search: "?utm=mail", hash: "#top" }
	expect(renderedLocation({ matches: [], nonce: "" }, shown)).toEqual({ pathname: "/a", search: "", hash: "" })
	expect(renderedLocation({ matches: [], nonce: "", search: "?q=x" }, shown)).toEqual({
		pathname: "/a",
		search: "?q=x",
		hash: "",
	})
})
