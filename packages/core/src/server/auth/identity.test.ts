import { expect, it } from "vitest";
import type { EffectiveAuth } from "./effective.ts";
import { identity } from "./identity.ts";

const required: EffectiveAuth = { requires: true, reads: true };
const optional: EffectiveAuth = { requires: false, reads: true };

it("required", () => {
	const result = identity(required, { id: "ada" });
	expect(result.class).toBe("required");
	expect(result.key).toBeUndefined();
});

it("anonymous", () => {
	const result = identity(optional, null);
	expect(result.class).toBe("anonymous");
	expect(result.key).toBe("");
});

it("session does not enter the key", () => {
	const ada = identity(optional, { id: "ada" });
	const grace = identity(optional, { id: "grace" });
	expect(ada.class).toBe("anonymous");
	expect(grace.class).toBe("anonymous");
	expect(ada.key).toBe(grace.key);
	expect(ada.key).not.toContain("ada");
	expect(grace.key).not.toContain("grace");
});
