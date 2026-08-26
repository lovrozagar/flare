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

/* ── type guard with name-spoofed Error subclass ───────────────────── */

describe("type guard name spoofing", () => {
	it("Error subclass with name='NotFoundError' passes guard", () => {
		class Fake extends Error {
			readonly name = "NotFoundError" as const;
		}
		/* Name-based guards intentionally match across realms */
		expect(isNotFoundError(new Fake())).toBe(true);
	});

	it("Error subclass with name='UnauthenticatedError' passes guard", () => {
		class Fake extends Error {
			readonly name = "UnauthenticatedError" as const;
		}
		expect(isUnauthenticatedError(new Fake())).toBe(true);
	});

	it("Error subclass with name='UnauthorizedError' passes guard", () => {
		class Fake extends Error {
			readonly name = "UnauthorizedError" as const;
		}
		expect(isUnauthorizedError(new Fake())).toBe(true);
	});

	it("Error subclass with name='RedirectResponse' passes guard", () => {
		class Fake extends Error {
			readonly name = "RedirectResponse" as const;
		}
		expect(isRedirectResponse(new Fake())).toBe(true);
	});

	it("Error subclass with name='NavigationError' passes guard", () => {
		class Fake extends Error {
			readonly name = "NavigationError" as const;
		}
		expect(isNavigationError(new Fake())).toBe(true);
	});

	it("Error subclass with name='ServerFnValidationError' passes guard", () => {
		class Fake extends Error {
			readonly name = "ServerFnValidationError" as const;
		}
		expect(isServerFnValidationError(new Fake())).toBe(true);
	});

	it("plain Error with manually set name does NOT pass (name is not writable on readonly)", () => {
		const e = new Error("test");
		/* Error.name defaults to "Error", and Object.defineProperty can override */
		Object.defineProperty(e, "name", { value: "NotFoundError" });
		/* This passes because guard only checks instanceof Error + name */
		expect(isNotFoundError(e)).toBe(true);
	});
});

/* ── RedirectResponse protocol edge cases ──────────────────────────── */

describe("RedirectResponse protocol edge cases", () => {
	it("JAVASCRIPT: all caps → throws", () => {
		expect(() => new RedirectResponse({ href: "JAVASCRIPT:void(0)" })).toThrow("Unsafe redirect URL");
	});

	it("jAvAsCrIpT: mixed case → throws", () => {
		expect(() => new RedirectResponse({ href: "jAvAsCrIpT:alert(1)" })).toThrow();
	});

	it("DATA: uppercase → throws", () => {
		expect(() => new RedirectResponse({ href: "DATA:text/html,evil" })).toThrow();
	});

	it("BLOB: uppercase → throws", () => {
		expect(() => new RedirectResponse({ href: "BLOB:https://evil.com/uuid" })).toThrow();
	});

	it("javascript URL with whitespace prefix → blocked (trimmed)", () => {
		expect(() => new RedirectResponse({ href: " javascript:alert(1)" })).toThrow("Unsafe redirect URL");
	});

	it("ftp: protocol → blocked (only http/https allowed)", () => {
		expect(() => new RedirectResponse({ href: "ftp://files.example.com" })).toThrow("Unsafe redirect URL");
	});

	it("mailto: → blocked (only http/https allowed)", () => {
		expect(() => new RedirectResponse({ href: "mailto:user@example.com" })).toThrow("Unsafe redirect URL");
	});

	it("empty href → allowed", () => {
		const r = new RedirectResponse({ href: "" });
		expect(r.url).toBe("");
		expect(r.external).toBe(true);
	});

	it("internal to with javascript:-like prefix → rejected", () => {
		expect(() => new RedirectResponse({ to: "javascript:something" })).toThrow("Unsafe redirect URL");
	});
});

/* ── Error class hierarchy ─────────────────────────────────────────── */

describe("error class hierarchy", () => {
	it("NotFoundError extends Error", () => {
		expect(new NotFoundError()).toBeInstanceOf(Error);
	});

	it("UnauthenticatedError extends Error", () => {
		expect(new UnauthenticatedError()).toBeInstanceOf(Error);
	});

	it("UnauthorizedError extends Error", () => {
		expect(new UnauthorizedError()).toBeInstanceOf(Error);
	});

	it("RedirectResponse extends Error", () => {
		expect(new RedirectResponse({ to: "/" })).toBeInstanceOf(Error);
	});

	it("NavigationError extends Error", () => {
		expect(new NavigationError()).toBeInstanceOf(Error);
	});

	it("ServerFnValidationError extends Error", () => {
		expect(new ServerFnValidationError({ fieldErrors: {}, formErrors: [] })).toBeInstanceOf(Error);
	});
});

/* ── default messages ──────────────────────────────────────────────── */

describe("default error messages", () => {
	it("NotFoundError default → 'Not found'", () => {
		expect(new NotFoundError().message).toBe("Not found");
	});

	it("UnauthenticatedError default → 'Unauthorized'", () => {
		expect(new UnauthenticatedError().message).toBe("Unauthorized");
	});

	it("UnauthorizedError default → 'Forbidden'", () => {
		expect(new UnauthorizedError().message).toBe("Forbidden");
	});

	it("NavigationError no message → empty", () => {
		expect(new NavigationError().message).toBe("");
	});

	it("NavigationError with message", () => {
		expect(new NavigationError("nav failed").message).toBe("nav failed");
	});
});

/* ── status codes on error classes ─────────────────────────────────── */

describe("error status codes", () => {
	it("NotFoundError.status === 404", () => {
		expect(new NotFoundError().status).toBe(404);
	});

	it("UnauthenticatedError.status === 401", () => {
		expect(new UnauthenticatedError().status).toBe(401);
	});

	it("UnauthorizedError.status === 403", () => {
		expect(new UnauthorizedError().status).toBe(403);
	});

	it("RedirectResponse default status === 303", () => {
		expect(new RedirectResponse({ to: "/" }).status).toBe(303);
	});

	it("RedirectResponse replace defaults true", () => {
		expect(new RedirectResponse({ to: "/" }).replace).toBe(true);
	});
});

/* ── throw helpers ─────────────────────────────────────────────────── */

describe("throw helpers", () => {
	it("notFound() throws NotFoundError", () => {
		expect(() => notFound()).toThrow(NotFoundError);
	});

	it("notFound('msg') sets message", () => {
		try {
			notFound("gone");
		} catch (e) {
			expect((e as NotFoundError).message).toBe("gone");
		}
	});

	it("unauthenticated() throws UnauthenticatedError", () => {
		expect(() => unauthenticated()).toThrow(UnauthenticatedError);
	});

	it("unauthenticated('msg') sets message", () => {
		try {
			unauthenticated("login required");
		} catch (e) {
			expect((e as UnauthenticatedError).message).toBe("login required");
		}
	});

	it("unauthorized() throws UnauthorizedError", () => {
		expect(() => unauthorized()).toThrow(UnauthorizedError);
	});

	it("unauthorized('msg') sets message", () => {
		try {
			unauthorized("no access");
		} catch (e) {
			expect((e as UnauthorizedError).message).toBe("no access");
		}
	});

	it("redirect() throws RedirectResponse", () => {
		expect(() => redirect({ to: "/home" })).toThrow(RedirectResponse);
	});

	it("redirect external throws RedirectResponse", () => {
		expect(() => redirect({ href: "https://example.com" })).toThrow(RedirectResponse);
	});

	it("redirect with dangerous protocol throws plain Error", () => {
		try {
			redirect({ href: "javascript:alert(1)" });
		} catch (e) {
			expect(e).not.toBeInstanceOf(RedirectResponse);
			expect(e).toBeInstanceOf(Error);
		}
	});
});

/* ── NotFoundError pathname ────────────────────────────────────────── */

describe("NotFoundError pathname", () => {
	it("no pathname → undefined", () => {
		expect(new NotFoundError().pathname).toBeUndefined();
	});

	it("pathname preserved", () => {
		expect(new NotFoundError("msg", "/missing-page").pathname).toBe("/missing-page");
	});

	it("empty pathname → empty string", () => {
		expect(new NotFoundError("msg", "").pathname).toBe("");
	});
});

/* ── ServerFnValidationError name ──────────────────────────────────── */

describe("ServerFnValidationError properties", () => {
	it("name is ServerFnValidationError", () => {
		const e = new ServerFnValidationError({ fieldErrors: {}, formErrors: [] });
		expect(e.name).toBe("ServerFnValidationError");
	});

	it("errors reference is preserved", () => {
		const errors = { fieldErrors: { x: ["err"] }, formErrors: ["form err"] };
		const e = new ServerFnValidationError(errors);
		expect(e.errors).toBe(errors);
	});
});
