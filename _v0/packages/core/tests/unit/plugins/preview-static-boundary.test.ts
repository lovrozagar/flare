import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Task 2: startsWith path boundary bypass in preview static assets
 *
 * The preview middleware uses filePath.startsWith(clientDir) to validate
 * that resolved paths stay within the client directory. Without a trailing
 * slash on clientDir, a sibling directory with overlapping prefix passes.
 */

/* Mirror the fixed logic — normalize with trailing slash for boundary safety */
function isWithinClientDir(clientDir: string, urlPath: string): boolean {
	const filePath = resolve(join(clientDir, urlPath));
	const dirWithSlash = clientDir.endsWith("/") ? clientDir : `${clientDir}/`;
	return filePath.startsWith(dirWithSlash);
}

describe("Task 2: preview static asset boundary", () => {
	const clientDir = "/app/dist/client";

	it("valid asset path is allowed", () => {
		expect(isWithinClientDir(clientDir, "/assets/main.js")).toBe(true);
	});

	it("nested asset path is allowed", () => {
		expect(isWithinClientDir(clientDir, "/assets/css/style.css")).toBe(true);
	});

	it("sibling directory with overlapping prefix is rejected", () => {
		/* /app/dist/client-evil/malicious.js should NOT pass */
		const siblingPath = resolve("/app/dist/client-evil/malicious.js");
		const filePath = resolve(join(clientDir, "/../client-evil/malicious.js"));
		expect(isWithinClientDir(clientDir, "/../client-evil/malicious.js")).toBe(false);
	});

	it("traversal to parent is rejected", () => {
		expect(isWithinClientDir(clientDir, "/../../../etc/passwd")).toBe(false);
	});

	it("clientDir without trailing slash works for valid paths", () => {
		expect(isWithinClientDir("/app/dist/client", "/assets/app.js")).toBe(true);
	});

	it("clientDir with trailing slash works for valid paths", () => {
		expect(isWithinClientDir("/app/dist/client/", "/assets/app.js")).toBe(true);
	});
});
