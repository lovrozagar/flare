import { expect, it } from "vitest";
import { NotFoundError, notFound, unauthenticated, unauthorized } from "./http.ts";
import { redirect } from "./redirect.ts";
import { rankStatus, statusOf } from "./status.ts";

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

// A component that calls notFound() while it renders.
function renderMissing(): never {
	return notFound();
}

it("render NotFoundError", () => {
	expect(catchStatus(renderMissing)).toBe(404);
	expect(statusOf(new NotFoundError())).toBe(404);
});

it("rank", () => {
	expect(rankStatus([500, 404])).toBe(500);
	expect(rankStatus([404, 500])).toBe(404);
	expect(rankStatus([500, 403, 401])).toBe(401);
	expect(rankStatus([404, 403])).toBe(403);
	expect(rankStatus([200])).toBe(200);
});

it("not found keeps 500", () => {
	expect(rankStatus([statusOf(new Error("loader")), catchStatus(notFound)])).toBe(500);
});
