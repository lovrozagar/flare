import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { INTERNAL_PATH_PREFIX, KEEPALIVE_PATH } from "../../../src/protocol.ts";

describe("KEEPALIVE_PATH", () => {
	it("is INTERNAL_PATH_PREFIX + keepalive", () => {
		expect(KEEPALIVE_PATH).toBe(`${INTERNAL_PATH_PREFIX}keepalive`);
		expect(KEEPALIVE_PATH).toBe("/_flare/keepalive");
	});

	it("navigation, keepalive middleware, and server builder import KEEPALIVE_PATH", () => {
		const root = join(__dirname, "../../../src");
		const navigation = readFileSync(join(root, "navigation/index.ts"), "utf-8");
		const mw = readFileSync(join(root, "middleware/builtins/keepalive.ts"), "utf-8");
		const server = readFileSync(join(root, "server/index.ts"), "utf-8");
		expect(navigation).toContain("KEEPALIVE_PATH");
		expect(navigation).not.toContain('"/_flare/keepalive"');
		expect(mw).toContain("KEEPALIVE_PATH");
		expect(mw).not.toContain('"/_flare/keepalive"');
		expect(server).toContain("KEEPALIVE_PATH");
		expect(server).not.toContain('"/_flare/keepalive"');
	});
});
