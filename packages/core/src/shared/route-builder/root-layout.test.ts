import { expect, it } from "vitest";
import { createRootLayout } from "./root-layout.ts";

it("root render is the document", () => {
	const render = () => "<html>";
	expect(createRootLayout("_root_").render(render).document).toBe(true);
});
