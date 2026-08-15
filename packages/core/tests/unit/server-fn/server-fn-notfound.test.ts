import { describe, expect, it } from "vitest";
import {
	isNotFoundError,
	isRedirectResponse,
	isServerFnValidationError,
	isUnauthenticatedError,
	isUnauthorizedError,
	NotFoundError,
	UnauthenticatedError,
	UnauthorizedError,
} from "../../../src/errors/index.ts";

/* ── server-fn error handler chain mirrors actual code at server-fn/index.ts:370-385 ── */

describe("server-fn error handler chain", () => {
	function catchChain(e: unknown): { message: string; status: number } {
		if (isRedirectResponse(e)) throw e;
		if (isServerFnValidationError(e)) {
			return { message: (e as Error).message, status: 400 };
		}
		if (isUnauthenticatedError(e)) {
			return { message: (e as Error).message, status: 401 };
		}
		if (isUnauthorizedError(e)) {
			return { message: (e as Error).message, status: 403 };
		}
		if (isNotFoundError(e)) {
			return { message: (e as Error).message, status: 404 };
		}
		return { message: "Internal server error", status: 500 };
	}

	it("NotFoundError → 404", () => {
		const result = catchChain(new NotFoundError("Page not found"));
		expect(result.status).toBe(404);
		expect(result.message).toBe("Page not found");
	});

	it("UnauthenticatedError → 401", () => {
		const result = catchChain(new UnauthenticatedError());
		expect(result.status).toBe(401);
	});

	it("UnauthorizedError → 403", () => {
		const result = catchChain(new UnauthorizedError());
		expect(result.status).toBe(403);
	});

	it("generic Error → 500", () => {
		const result = catchChain(new Error("boom"));
		expect(result.status).toBe(500);
		expect(result.message).toBe("Internal server error");
	});
});
