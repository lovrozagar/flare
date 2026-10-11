import { expect, it } from "vitest";
import { notFound, unauthenticated, unauthorized } from "./http.ts";
import { redirect } from "./redirect.ts";
import { statusOf } from "./status.ts";

function catchStatus(run: () => never): number {
	try {
		run();
	} catch (error) {
		return statusOf(error);
	}
	throw new Error("returned");
}

it("named", () => {
	expect(catchStatus(notFound)).toBe(404);
	expect(catchStatus(unauthenticated)).toBe(401);
	expect(catchStatus(unauthorized)).toBe(403);
	expect(catchStatus(() => redirect({ to: "_root_", status: 308 }))).toBe(308);
});

it("other", () => {
	expect(statusOf(new Error("boom"))).toBe(500);
});
