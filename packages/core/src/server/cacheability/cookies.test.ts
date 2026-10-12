import { expect, it } from "vitest";
import { withCookies } from "./cookies.ts";
import type { Decision } from "./decide.ts";

const shared: Decision = { policy: "shared", class: "public", cdn: {} };
const allowed: Decision = { ...shared, cdn: { allowCookies: true } };

it("set-cookie downgrades", () => {
	expect(withCookies(shared, { route: ["s=1"], all: ["s=1"] }).policy).toBe("private");
	expect(withCookies(shared, { route: [], all: [] }).policy).toBe("shared");
});

it("allow", () => {
	expect(withCookies(allowed, { route: ["s=1"], all: ["s=1"] }).policy).toBe("shared");
});

// Bit 13 must not set the locale cookie on a shared document. Here, any cookie it set would downgrade.
it("locale cookie", () => {
	const locale = "flare.locale=fr; Path=/; SameSite=Lax";
	expect(withCookies(shared, { route: [locale], all: [locale] }).policy).toBe("private");
	expect(withCookies({ policy: "no-store", cdn: {} }, { route: [locale], all: [locale] }).policy).toBe("no-store");
});

// `allowCookies` covers only the route's own cookies. One a middleware added after the page stage downgrades.
it("late cookie", () => {
	expect(withCookies(allowed, { route: ["s=1"], all: ["s=1", "late=1"] }).policy).toBe("private");
	expect(withCookies(allowed, { route: [], all: ["s=1"] }).policy).toBe("private");
	expect(withCookies(allowed, { route: ["s=1"], all: ["s=1"] }).policy).toBe("shared");
});
