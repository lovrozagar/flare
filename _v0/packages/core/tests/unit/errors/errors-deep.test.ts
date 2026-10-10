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
} from "../../../src/errors/index.ts";

/* ------------------------------------------------------------------ */
/*  Type guards — edge cases for all 6                                 */
/* ------------------------------------------------------------------ */

describe("isNotFoundError edge cases", () => {
	it("rejects number", () => {
		expect(isNotFoundError(404)).toBe(false);
	});

	it("rejects string", () => {
		expect(isNotFoundError("NotFoundError")).toBe(false);
	});
});

describe("isUnauthenticatedError edge cases", () => {
	it("rejects null", () => {
		expect(isUnauthenticatedError(null)).toBe(false);
	});

	it("rejects undefined", () => {
		expect(isUnauthenticatedError(undefined)).toBe(false);
	});

	it("rejects plain object with matching name", () => {
		expect(isUnauthenticatedError({ name: "UnauthenticatedError" })).toBe(false);
	});

	it("rejects number", () => {
		expect(isUnauthenticatedError(401)).toBe(false);
	});

	it("rejects string", () => {
		expect(isUnauthenticatedError("UnauthenticatedError")).toBe(false);
	});
});

describe("isUnauthorizedError edge cases", () => {
	it("rejects null", () => {
		expect(isUnauthorizedError(null)).toBe(false);
	});

	it("rejects undefined", () => {
		expect(isUnauthorizedError(undefined)).toBe(false);
	});

	it("rejects plain object with matching name", () => {
		expect(isUnauthorizedError({ name: "UnauthorizedError" })).toBe(false);
	});

	it("rejects number", () => {
		expect(isUnauthorizedError(403)).toBe(false);
	});

	it("rejects string", () => {
		expect(isUnauthorizedError("UnauthorizedError")).toBe(false);
	});
});

describe("isRedirectResponse edge cases", () => {
	it("rejects null", () => {
		expect(isRedirectResponse(null)).toBe(false);
	});

	it("rejects undefined", () => {
		expect(isRedirectResponse(undefined)).toBe(false);
	});

	it("rejects plain object with matching shape", () => {
		expect(isRedirectResponse({ external: true, name: "RedirectResponse", url: "/x" })).toBe(false);
	});

	it("rejects number", () => {
		expect(isRedirectResponse(302)).toBe(false);
	});

	it("rejects string", () => {
		expect(isRedirectResponse("RedirectResponse")).toBe(false);
	});
});

describe("isNavigationError edge cases", () => {
	it("rejects null", () => {
		expect(isNavigationError(null)).toBe(false);
	});

	it("rejects undefined", () => {
		expect(isNavigationError(undefined)).toBe(false);
	});

	it("rejects plain object with matching name", () => {
		expect(isNavigationError({ name: "NavigationError" })).toBe(false);
	});

	it("rejects number", () => {
		expect(isNavigationError(0)).toBe(false);
	});

	it("rejects string", () => {
		expect(isNavigationError("NavigationError")).toBe(false);
	});
});

describe("isServerFnValidationError edge cases", () => {
	it("rejects null", () => {
		expect(isServerFnValidationError(null)).toBe(false);
	});

	it("rejects undefined", () => {
		expect(isServerFnValidationError(undefined)).toBe(false);
	});

	it("rejects plain object with matching shape", () => {
		expect(
			isServerFnValidationError({
				errors: { fieldErrors: {}, formErrors: [] },
				name: "ServerFnValidationError",
			}),
		).toBe(false);
	});

	it("rejects number", () => {
		expect(isServerFnValidationError(422)).toBe(false);
	});

	it("rejects string", () => {
		expect(isServerFnValidationError("ServerFnValidationError")).toBe(false);
	});
});

/* ------------------------------------------------------------------ */
/*  RedirectResponse constructor — missing combos                      */
/* ------------------------------------------------------------------ */

describe("RedirectResponse constructor combos", () => {
	it("internal with replace: false", () => {
		const err = new RedirectResponse({ replace: false, to: "/dashboard" });
		expect(err.replace).toBe(false);
		expect(err.external).toBe(false);
		expect(err.url).toBe("/dashboard");
	});

	it("external with replace: false", () => {
		const err = new RedirectResponse({ href: "https://ext.com", replace: false });
		expect(err.replace).toBe(false);
		expect(err.external).toBe(true);
		expect(err.url).toBe("https://ext.com");
	});

	it("status 301", () => {
		const err = new RedirectResponse({ status: 301, to: "/old" });
		expect(err.status).toBe(301);
	});

	it("status 303", () => {
		const err = new RedirectResponse({ status: 303, to: "/post-submit" });
		expect(err.status).toBe(303);
	});

	it("status 307", () => {
		const err = new RedirectResponse({ status: 307, to: "/temp" });
		expect(err.status).toBe(307);
	});

	it("status 308", () => {
		const err = new RedirectResponse({ status: 308, to: "/permanent" });
		expect(err.status).toBe(308);
	});

	it("external with status 301", () => {
		const err = new RedirectResponse({ href: "https://moved.com", status: 301 });
		expect(err.external).toBe(true);
		expect(err.status).toBe(301);
	});

	it("external with status 308", () => {
		const err = new RedirectResponse({ href: "https://perm.com", status: 308 });
		expect(err.external).toBe(true);
		expect(err.status).toBe(308);
	});

	it("internal with replace: false and status: 303", () => {
		const err = new RedirectResponse({ replace: false, status: 303, to: "/form" });
		expect(err.replace).toBe(false);
		expect(err.status).toBe(303);
		expect(err.external).toBe(false);
	});

	it("external with replace: false and status: 307", () => {
		const err = new RedirectResponse({ href: "https://temp.com", replace: false, status: 307 });
		expect(err.replace).toBe(false);
		expect(err.status).toBe(307);
		expect(err.external).toBe(true);
	});

	it("message is always Redirect", () => {
		const a = new RedirectResponse({ to: "/a" });
		const b = new RedirectResponse({ href: "https://b.com" });
		expect(a.message).toBe("Redirect");
		expect(b.message).toBe("Redirect");
	});
});

/* ------------------------------------------------------------------ */
/*  Factory throw functions — missing prop combos                      */
/* ------------------------------------------------------------------ */

describe("redirect() factory combos", () => {
	it("internal with replace: false", () => {
		try {
			redirect({ replace: false, to: "/login" });
		} catch (e) {
			const r = e as RedirectResponse;
			expect(r.replace).toBe(false);
			expect(r.external).toBe(false);
		}
	});

	it("external with replace: false", () => {
		try {
			redirect({ href: "https://ext.com", replace: false });
		} catch (e) {
			const r = e as RedirectResponse;
			expect(r.replace).toBe(false);
			expect(r.external).toBe(true);
		}
	});

	it("internal with status 303", () => {
		try {
			redirect({ status: 303, to: "/post" });
		} catch (e) {
			expect((e as RedirectResponse).status).toBe(303);
		}
	});

	it("internal with status 308", () => {
		try {
			redirect({ status: 308, to: "/permanent" });
		} catch (e) {
			expect((e as RedirectResponse).status).toBe(308);
		}
	});

	it("external with status 301", () => {
		try {
			redirect({ href: "https://moved.com", status: 301 });
		} catch (e) {
			const r = e as RedirectResponse;
			expect(r.external).toBe(true);
			expect(r.status).toBe(301);
		}
	});
});

/* ------------------------------------------------------------------ */
/*  NotFoundError constructor edge cases                               */
/* ------------------------------------------------------------------ */

describe("NotFoundError constructor edge cases", () => {
	it("empty string message", () => {
		const err = new NotFoundError("");
		expect(err.message).toBe("");
	});

	it("empty string pathname", () => {
		const err = new NotFoundError("msg", "");
		expect(err.pathname).toBe("");
	});

	it("both message and pathname — instanceof chain", () => {
		const err = new NotFoundError("gone", "/missing");
		expect(err).toBeInstanceOf(NotFoundError);
		expect(err).toBeInstanceOf(Error);
		expect(err.message).toBe("gone");
		expect(err.pathname).toBe("/missing");
	});

	it("undefined message falls back to default", () => {
		const err = new NotFoundError(undefined, "/path");
		expect(err.message).toBe("Not found");
		expect(err.pathname).toBe("/path");
	});

	it("notFound() with empty string", () => {
		try {
			notFound("");
		} catch (e) {
			expect((e as NotFoundError).message).toBe("");
		}
	});
});

/* ------------------------------------------------------------------ */
/*  ServerFnValidationError — complex error shapes                     */
/* ------------------------------------------------------------------ */

describe("ServerFnValidationError complex shapes", () => {
	it("multiple field errors with multiple messages", () => {
		const errors = {
			fieldErrors: {
				email: ["required", "invalid format"],
				name: ["too short", "no special chars", "already taken"],
			},
			formErrors: [],
		};
		const err = new ServerFnValidationError(errors);
		expect(err.errors.fieldErrors.email).toEqual(["required", "invalid format"]);
		expect(err.errors.fieldErrors.name).toEqual(["too short", "no special chars", "already taken"]);
	});

	it("empty fieldErrors with formErrors populated", () => {
		const errors = {
			fieldErrors: {},
			formErrors: ["form expired", "csrf mismatch"],
		};
		const err = new ServerFnValidationError(errors);
		expect(err.errors.fieldErrors).toEqual({});
		expect(err.errors.formErrors).toEqual(["form expired", "csrf mismatch"]);
	});

	it("both fieldErrors and formErrors populated", () => {
		const errors = {
			fieldErrors: { age: ["must be number"] },
			formErrors: ["submission limit reached"],
		};
		const err = new ServerFnValidationError(errors);
		expect(err.errors.fieldErrors.age).toEqual(["must be number"]);
		expect(err.errors.formErrors).toEqual(["submission limit reached"]);
	});

	it("message defaults to Validation error when formErrors empty", () => {
		const err = new ServerFnValidationError({ fieldErrors: {}, formErrors: [] });
		expect(err.message).toBe("Validation error");
	});

	it("message uses first formError when formErrors present", () => {
		const err = new ServerFnValidationError({ fieldErrors: {}, formErrors: ["bad data", "second"] });
		expect(err.message).toBe("bad data, second");
	});
});

/* ------------------------------------------------------------------ */
/*  Cross-class instanceof rejection                                   */
/* ------------------------------------------------------------------ */

describe("cross-class instanceof rejection", () => {
	const notFoundErr = new NotFoundError();
	const unauthenticatedErr = new UnauthenticatedError();
	const unauthorizedErr = new UnauthorizedError();
	const redirectErr = new RedirectResponse({ to: "/x" });
	const navigationErr = new NavigationError();
	const validationErr = new ServerFnValidationError({ fieldErrors: {}, formErrors: [] });

	it("NotFoundError rejects all other classes", () => {
		expect(isUnauthenticatedError(notFoundErr)).toBe(false);
		expect(isUnauthorizedError(notFoundErr)).toBe(false);
		expect(isRedirectResponse(notFoundErr)).toBe(false);
		expect(isNavigationError(notFoundErr)).toBe(false);
		expect(isServerFnValidationError(notFoundErr)).toBe(false);
	});

	it("UnauthenticatedError rejects all other classes", () => {
		expect(isNotFoundError(unauthenticatedErr)).toBe(false);
		expect(isUnauthorizedError(unauthenticatedErr)).toBe(false);
		expect(isRedirectResponse(unauthenticatedErr)).toBe(false);
		expect(isNavigationError(unauthenticatedErr)).toBe(false);
		expect(isServerFnValidationError(unauthenticatedErr)).toBe(false);
	});

	it("UnauthorizedError rejects all other classes", () => {
		expect(isNotFoundError(unauthorizedErr)).toBe(false);
		expect(isUnauthenticatedError(unauthorizedErr)).toBe(false);
		expect(isRedirectResponse(unauthorizedErr)).toBe(false);
		expect(isNavigationError(unauthorizedErr)).toBe(false);
		expect(isServerFnValidationError(unauthorizedErr)).toBe(false);
	});

	it("RedirectResponse rejects all other classes", () => {
		expect(isNotFoundError(redirectErr)).toBe(false);
		expect(isUnauthenticatedError(redirectErr)).toBe(false);
		expect(isUnauthorizedError(redirectErr)).toBe(false);
		expect(isNavigationError(redirectErr)).toBe(false);
		expect(isServerFnValidationError(redirectErr)).toBe(false);
	});

	it("NavigationError rejects all other classes", () => {
		expect(isNotFoundError(navigationErr)).toBe(false);
		expect(isUnauthenticatedError(navigationErr)).toBe(false);
		expect(isUnauthorizedError(navigationErr)).toBe(false);
		expect(isRedirectResponse(navigationErr)).toBe(false);
		expect(isServerFnValidationError(navigationErr)).toBe(false);
	});

	it("ServerFnValidationError rejects all other classes", () => {
		expect(isNotFoundError(validationErr)).toBe(false);
		expect(isUnauthenticatedError(validationErr)).toBe(false);
		expect(isUnauthorizedError(validationErr)).toBe(false);
		expect(isRedirectResponse(validationErr)).toBe(false);
		expect(isNavigationError(validationErr)).toBe(false);
	});
});
