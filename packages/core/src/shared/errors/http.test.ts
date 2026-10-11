import { expect, it } from "vitest";
import {
	NotFoundError,
	UnauthenticatedError,
	UnauthorizedError,
	notFound,
	unauthenticated,
	unauthorized,
} from "./http.ts";

function thrown(run: () => never): NotFoundError {
	try {
		run();
	} catch (error) {
		return error as NotFoundError;
	}
	throw new Error("returned");
}

it("not found", () => {
	const error = thrown(notFound);
	expect(error).toBeInstanceOf(NotFoundError);
	expect(error.status).toBe(404);
});

it("unauthenticated", () => {
	const error = thrown(unauthenticated);
	expect(error).toBeInstanceOf(UnauthenticatedError);
	expect(error.status).toBe(401);
});

it("unauthorized", () => {
	const error = thrown(unauthorized);
	expect(error).toBeInstanceOf(UnauthorizedError);
	expect(error.status).toBe(403);
});
