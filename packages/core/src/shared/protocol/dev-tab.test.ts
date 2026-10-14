import { expect, it } from "vitest";
import { isTabToken, mintTab, tabMeta } from "./dev-tab.ts";

// A dev tab token is a fresh UUID per document; a header value outside the token shape is never one (B42, B95 (b)).
it("token", () => {
	expect(mintTab()).not.toBe(mintTab());
	expect(isTabToken(mintTab())).toBe(true);
	expect(isTabToken("tab-7")).toBe(true);
	expect(isTabToken('"><script>')).toBe(false);
	expect(isTabToken("")).toBe(false);
	expect(tabMeta("t")).toBe('<meta name="flare-dev-tab" content="t">');
});
