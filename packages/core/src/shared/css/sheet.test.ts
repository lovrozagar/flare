import { expect, it } from "vitest";
import { builtSheet } from "./sheet.ts";

// The source module is empty. The server build replaces it with the client build's one stylesheet (vite/css/inject).
it("empty", () => {
	expect(builtSheet).toBe("");
});
