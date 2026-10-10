import { expect, it } from "vitest";
import { createLayout } from "./layout.ts";

type Layout = ReturnType<typeof createLayout>;

it("layout has no response", () => {
	const absent: "response" extends keyof Layout ? never : true = true;
	const layout = createLayout("_root_");
	expect(absent).toBe(true);
	expect("response" in layout).toBe(false);
	expect(layout.render(() => "child").document).toBe(false);
});
