import { describe, expect, it } from "vitest";
import {
	isNavigationError,
	isNotFoundError,
	isRedirectResponse,
	isServerFnValidationError,
	isUnauthenticatedError,
	isUnauthorizedError,
	NavigationError,
	NotFoundError,
	notFound,
	RedirectResponse,
	redirect,
	ServerFnValidationError,
	UnauthenticatedError,
	UnauthorizedError,
	unauthenticated,
	unauthorized,
} from "../../../src/errors/index.ts";

describe("NotFoundError", () => {
	it("has correct defaults", () => {
		const err = new NotFoundError();
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("NotFoundError");
		expect(err.status).toBe(404);
		expect(err.message).toBe("Not found");
		expect(err.pathname).toBeUndefined();
	});

	it("accepts custom message and pathname", () => {
		const err = new NotFoundError("custom", "/path");
		expect(err.message).toBe("custom");
		expect(err.pathname).toBe("/path");
	});

	it("preserves stack trace", () => {
		const err = new NotFoundError();
		expect(err.stack).toBeDefined();
	});
});

describe("UnauthenticatedError", () => {
	it("has correct defaults", () => {
		const err = new UnauthenticatedError();
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("UnauthenticatedError");
		expect(err.status).toBe(401);
		expect(err.message).toBe("Unauthorized");
	});

	it("accepts custom message", () => {
		const err = new UnauthenticatedError("session expired");
		expect(err.message).toBe("session expired");
	});
});

describe("UnauthorizedError", () => {
	it("has correct defaults", () => {
		const err = new UnauthorizedError();
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("UnauthorizedError");
		expect(err.status).toBe(403);
		expect(err.message).toBe("Forbidden");
	});

	it("accepts custom message", () => {
		const err = new UnauthorizedError("no access");
		expect(err.message).toBe("no access");
	});
});

describe("RedirectResponse", () => {
	it("internal redirect defaults", () => {
		const err = new RedirectResponse({ to: "/login" });
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("RedirectResponse");
		expect(err.url).toBe("/login");
		expect(err.external).toBe(false);
		expect(err.status).toBe(303);
		expect(err.replace).toBe(true);
	});

	it("internal with custom status and replace", () => {
		const err = new RedirectResponse({ replace: true, status: 301, to: "/login" });
		expect(err.status).toBe(301);
		expect(err.replace).toBe(true);
	});

	it("external redirect", () => {
		const err = new RedirectResponse({ href: "https://example.com" });
		expect(err.external).toBe(true);
		expect(err.url).toBe("https://example.com");
		expect(err.status).toBe(303);
	});

	it("external with custom status", () => {
		const err = new RedirectResponse({ href: "https://example.com", status: 307 });
		expect(err.external).toBe(true);
		expect(err.status).toBe(307);
	});
});

describe("NavigationError", () => {
	it("has correct name", () => {
		const err = new NavigationError("nav failed");
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("NavigationError");
	});
});

describe("ServerFnValidationError", () => {
	it("carries validation errors", () => {
		const errors = { fieldErrors: { email: ["required"] }, formErrors: [] };
		const err = new ServerFnValidationError(errors);
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe("ServerFnValidationError");
		expect(err.errors.fieldErrors.email).toEqual(["required"]);
		expect(err.errors.formErrors).toEqual([]);
	});
});

describe("helper functions", () => {
	it("notFound() throws NotFoundError", () => {
		expect(() => notFound()).toThrow(NotFoundError);
	});

	it("notFound() has default message", () => {
		try {
			notFound();
		} catch (e) {
			expect((e as NotFoundError).message).toBe("Not found");
			expect((e as NotFoundError).status).toBe(404);
		}
	});

	it("notFound('custom') includes message", () => {
		try {
			notFound("custom");
		} catch (e) {
			expect((e as NotFoundError).message).toBe("custom");
		}
	});

	it("unauthenticated() throws UnauthenticatedError", () => {
		expect(() => unauthenticated()).toThrow(UnauthenticatedError);
	});

	it("unauthenticated('session expired') includes message", () => {
		try {
			unauthenticated("session expired");
		} catch (e) {
			expect((e as UnauthenticatedError).message).toBe("session expired");
		}
	});

	it("unauthorized() throws UnauthorizedError", () => {
		expect(() => unauthorized()).toThrow(UnauthorizedError);
	});

	it("unauthorized('no access') includes message", () => {
		try {
			unauthorized("no access");
		} catch (e) {
			expect((e as UnauthorizedError).message).toBe("no access");
		}
	});

	it("redirect({ to }) throws RedirectResponse", () => {
		expect(() => redirect({ to: "/login" })).toThrow(RedirectResponse);
	});

	it("redirect({ to }) has correct fields", () => {
		try {
			redirect({ to: "/login" });
		} catch (e) {
			const r = e as RedirectResponse;
			expect(r.url).toBe("/login");
			expect(r.status).toBe(303);
			expect(r.external).toBe(false);
			expect(r.replace).toBe(true);
		}
	});

	it("redirect({ to, status: 301 }) uses provided status", () => {
		try {
			redirect({ status: 301, to: "/login" });
		} catch (e) {
			expect((e as RedirectResponse).status).toBe(301);
		}
	});

	it("redirect({ to, replace: true })", () => {
		try {
			redirect({ replace: true, to: "/login" });
		} catch (e) {
			expect((e as RedirectResponse).replace).toBe(true);
		}
	});

	it("redirect({ href }) external", () => {
		try {
			redirect({ href: "https://example.com" });
		} catch (e) {
			const r = e as RedirectResponse;
			expect(r.external).toBe(true);
			expect(r.url).toBe("https://example.com");
		}
	});

	it("redirect({ href, status: 307 })", () => {
		try {
			redirect({ href: "https://example.com", status: 307 });
		} catch (e) {
			const r = e as RedirectResponse;
			expect(r.external).toBe(true);
			expect(r.status).toBe(307);
		}
	});
});

describe("type guards", () => {
	it("isNotFoundError", () => {
		expect(isNotFoundError(new NotFoundError())).toBe(true);
		expect(isNotFoundError(new Error())).toBe(false);
		expect(isNotFoundError(null)).toBe(false);
		expect(isNotFoundError(undefined)).toBe(false);
		expect(isNotFoundError({ name: "NotFoundError" })).toBe(false);
	});

	it("isUnauthenticatedError", () => {
		expect(isUnauthenticatedError(new UnauthenticatedError())).toBe(true);
		expect(isUnauthenticatedError(new Error())).toBe(false);
	});

	it("isUnauthorizedError", () => {
		expect(isUnauthorizedError(new UnauthorizedError())).toBe(true);
		expect(isUnauthorizedError(new Error())).toBe(false);
	});

	it("isRedirectResponse", () => {
		expect(isRedirectResponse(new RedirectResponse({ to: "/x" }))).toBe(true);
		expect(isRedirectResponse(new Error())).toBe(false);
	});

	it("isNavigationError", () => {
		expect(isNavigationError(new NavigationError())).toBe(true);
		expect(isNavigationError(new Error())).toBe(false);
	});

	it("isServerFnValidationError", () => {
		expect(isServerFnValidationError(new ServerFnValidationError({ fieldErrors: {}, formErrors: [] }))).toBe(true);
		expect(isServerFnValidationError(new Error())).toBe(false);
	});

	it("guards work with reconstructed errors (cross-realm)", () => {
		/* Simulate NDJSON client reconstructing errors with correct name */
		const notFoundLike = new Error("Not found");
		Object.defineProperty(notFoundLike, "name", { value: "NotFoundError" });
		expect(isNotFoundError(notFoundLike)).toBe(true);

		const unauthLike = new Error("Unauthorized");
		Object.defineProperty(unauthLike, "name", { value: "UnauthenticatedError" });
		expect(isUnauthenticatedError(unauthLike)).toBe(true);

		const unauthorizedLike = new Error("Forbidden");
		Object.defineProperty(unauthorizedLike, "name", { value: "UnauthorizedError" });
		expect(isUnauthorizedError(unauthorizedLike)).toBe(true);
	});

	it("guards reject plain objects without Error prototype", () => {
		expect(isNotFoundError({ message: "x", name: "NotFoundError" })).toBe(false);
		expect(isRedirectResponse({ message: "x", name: "RedirectResponse" })).toBe(false);
	});
});
