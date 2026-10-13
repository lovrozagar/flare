import { expect, it } from "vitest";
import { ownModule } from "./own-module.ts";

// The plugin names its own modules by path. From source they are `.ts`. From the installed package they are `.js`.
it("own module", () => {
	expect(ownModule("../shared/config.ts", "file:///pkg/src/features/image/vite/optimize.ts")).toBe(
		"/pkg/src/features/image/shared/config.ts",
	);
	expect(ownModule("../shared/config.ts", "file:///pkg/dist/features/image/vite/optimize.js")).toBe(
		"/pkg/dist/features/image/shared/config.js",
	);
	expect(ownModule("./view.tsx", "file:///pkg/dist/shared/a.js")).toBe("/pkg/dist/shared/view.js");
});
