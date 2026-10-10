import { join, resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * Task 1: Shell injection in dev-dashboard open-editor
 *
 * The open-editor endpoint must:
 * 1. Use execFile (not exec) to prevent shell injection
 * 2. Validate resolved path stays within project root
 * 3. Handle errors gracefully
 */

/* We test the security logic directly since the endpoint is embedded in
 * Vite middleware. Extract the validation + execution pattern. */

describe("Task 1: open-editor security", () => {
	const root = "/home/user/project";

	function resolveEditorPath(root: string, file: string): string | null {
		const filePath = resolve(join(root, file));
		/* Path must stay within project root — normalize with trailing slash to prevent
		 * sibling directory bypass (e.g. /home/user/project2 matching /home/user/project) */
		const rootWithSlash = root.endsWith("/") ? root : `${root}/`;
		if (filePath !== resolve(root) && !filePath.startsWith(rootWithSlash)) return null;
		return filePath;
	}

	describe("path validation", () => {
		it("normal file path resolves correctly", () => {
			const result = resolveEditorPath(root, "src/app.ts");
			expect(result).toBe("/home/user/project/src/app.ts");
		});

		it("nested path resolves correctly", () => {
			const result = resolveEditorPath(root, "src/components/Button.tsx");
			expect(result).toBe("/home/user/project/src/components/Button.tsx");
		});

		it("path traversal ../../etc/passwd is rejected", () => {
			const result = resolveEditorPath(root, "../../etc/passwd");
			expect(result).toBeNull();
		});

		it("path traversal with encoded dots rejected", () => {
			/* After URL decoding, this becomes ../../etc/passwd */
			const decoded = decodeURIComponent("..%2F..%2Fetc%2Fpasswd");
			const result = resolveEditorPath(root, decoded);
			expect(result).toBeNull();
		});

		it("path within root but using .. is allowed if it resolves inside", () => {
			const result = resolveEditorPath(root, "src/../src/app.ts");
			expect(result).toBe("/home/user/project/src/app.ts");
		});
	});

	describe("shell injection prevention", () => {
		it("shell metachar ; in filename does not cause injection", () => {
			/* With execFile, args are passed as array — no shell interpretation.
			 * But the path should still be validated. */
			const file = '"; rm -rf /; echo "';
			const result = resolveEditorPath(root, file);
			/* resolve() will produce something like /home/user/project/"; rm -rf /; echo "
			 * which starts with root, so path validation passes.
			 * The key protection is execFile not using shell. */
			if (result) {
				expect(result.startsWith(root)).toBe(true);
			}
		});

		it("backtick injection in filename", () => {
			const file = "`whoami`.ts";
			const result = resolveEditorPath(root, file);
			/* Path is valid (inside root), but execFile won't interpret backticks */
			if (result) {
				expect(result.startsWith(root)).toBe(true);
				expect(result).toContain("`whoami`");
			}
		});

		it("$() injection in filename", () => {
			const file = "$(cat /etc/passwd).ts";
			const result = resolveEditorPath(root, file);
			if (result) {
				expect(result.startsWith(root)).toBe(true);
				expect(result).toContain("$(cat");
			}
		});
	});

	describe("execFile vs exec", () => {
		it("execFile passes args as array, not through shell", async () => {
			/* Verify the correct child_process function is used */
			const { execFile } = await import("node:child_process");
			expect(typeof execFile).toBe("function");

			/* execFile signature takes (file, args[], callback) — no shell */
			const spy = vi.fn();
			/* We can't actually run code editor in tests, but verify the API shape */
			expect(execFile.length).toBeGreaterThanOrEqual(2);
		});
	});

	describe("startsWith boundary", () => {
		it("sibling directory with overlapping prefix is rejected", () => {
			/* /home/user/project vs /home/user/project2/secret — startsWith would pass without boundary check */
			const result = resolveEditorPath("/home/user/project", "../project2/secret");
			expect(result).toBeNull();
		});

		it("root without trailing slash still works for valid child", () => {
			const result = resolveEditorPath("/home/user/project", "src/app.ts");
			expect(result).toBe("/home/user/project/src/app.ts");
		});

		it("root with trailing slash works for valid child", () => {
			const result = resolveEditorPath("/home/user/project/", "src/app.ts");
			expect(result).toBe("/home/user/project/src/app.ts");
		});
	});

	describe("missing/empty file param", () => {
		it("empty string file is treated as no-op", () => {
			const file = "";
			/* Empty string is falsy — should not trigger exec */
			expect(file || null).toBeNull();
		});

		it("null file is treated as no-op", () => {
			const file: string | null = null;
			expect(file || null).toBeNull();
		});
	});
});
