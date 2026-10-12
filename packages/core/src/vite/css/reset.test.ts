import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { RESET } from "./reset.ts";

it("bytes", () => {
	expect(createHash("sha256").update(RESET).digest("hex")).toBe(
		"d2d86ff1f5c3b5e0edba40c468d26d941fd52b3e884d33e208961b5200dbcae6",
	);
});

it("layer", () => {
	expect(RESET.startsWith("@layer reset")).toBe(true);
});
