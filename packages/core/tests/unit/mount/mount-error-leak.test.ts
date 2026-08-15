/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { dispatchMount } from "../../../src/mount/index.ts";

/**
 * Bug 66: dispatchMount leaks internal error messages to HTTP clients
 *
 * When mount.fetch throws, the error message is forwarded in the 500 response.
 * This can expose internal details like DB errors, file paths, stack traces.
 */

describe("Bug 66: mount error message leak", () => {
	it("should not expose internal error message in 500 response", async () => {
		const mount = {
			fetch: () => {
				throw new Error("Connection to postgres://user:pass@db:5432/app failed");
			},
			prefix: "/api",
		};

		const request = new Request("http://localhost/api/users");
		const url = new URL(request.url);
		const response = await dispatchMount(request, {}, mount, url, {});

		expect(response.status).toBe(500);
		const body = (await response.json()) as Record<string, unknown>;

		/* Should NOT contain the internal error details */
		expect(JSON.stringify(body)).not.toContain("postgres");
		expect(JSON.stringify(body)).not.toContain("pass@db");
		expect(body.error).toBe("Internal Server Error");
	});

	it("should still return 500 for generic errors", async () => {
		const mount = {
			fetch: () => {
				throw new Error("something went wrong");
			},
			prefix: "/api",
		};

		const request = new Request("http://localhost/api/test");
		const url = new URL(request.url);
		const response = await dispatchMount(request, {}, mount, url, {});

		expect(response.status).toBe(500);
		const body = (await response.json()) as Record<string, unknown>;
		expect(body.error).toBe("Internal Server Error");
	});
});
