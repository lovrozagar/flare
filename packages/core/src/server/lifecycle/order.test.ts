import { expect, it } from "vitest";
import { STAGES } from "./order.ts";

it("ingress order", () => {
	expect(STAGES[0]).toBe("internal");
	expect(STAGES.indexOf("canonical")).toBeLessThan(STAGES.indexOf("match"));
	expect(STAGES.indexOf("validate")).toBeLessThan(STAGES.indexOf("authorize"));
	expect(STAGES.indexOf("authorize")).toBeLessThan(STAGES.indexOf("loaders"));
	expect(STAGES.at(-1)).toBe("finalize");
	expect(STAGES).toHaveLength(14);
});
