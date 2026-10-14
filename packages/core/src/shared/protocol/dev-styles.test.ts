import { expect, it } from "vitest";
import { stylesReply, stylesRequest } from "./dev-styles.ts";

// Only well-formed parts of the round trip are read; a style with a non-string field is dropped (B104).
it("shapes", () => {
	expect(stylesRequest({ request: 2, routes: ["_root_", 3] })).toEqual({ request: 2, routes: ["_root_"] });
	expect(stylesRequest({ routes: [] })).toBeUndefined();
	expect(stylesRequest({ request: 1, routes: "x" })).toBeUndefined();
	expect(stylesReply({ request: 4, styles: [{ id: "/a.css", css: "a{}" }, { id: "/b.css" }, null] })).toEqual({
		request: 4,
		styles: [{ id: "/a.css", css: "a{}" }],
	});
	expect(stylesReply({ request: "4", styles: [] })).toBeUndefined();
	expect(stylesReply(undefined)).toBeUndefined();
});
