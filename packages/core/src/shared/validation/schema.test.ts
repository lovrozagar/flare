import { expect, it } from "vitest";
import { runValidator } from "./schema.ts";

const failure = {
	"~standard": {
		validate: () => ({ issues: [{ message: "bad", path: ["email"] }] }),
	},
};

it("standard schema failure", () => {
	expect(runValidator(failure, {})).toEqual({
		issues: [{ message: "bad", path: ["email"] }],
		fieldErrors: { email: ["bad"] },
	});
});

it("function validator", () => {
	expect(runValidator((raw) => raw, { n: 1 })).toEqual({ n: 1 });
});

it("throwing validator", () => {
	const previous = process.env.NODE_ENV;
	process.env.NODE_ENV = "production";
	try {
		const result = runValidator(() => {
			throw new Error("secret-token");
		}, {}) as { status: number; message: string };
		expect(result.status).toBe(400);
		expect(result.message).toBe("Something went wrong");
		expect(result.message).not.toContain("secret-token");
		process.env.NODE_ENV = "development";
		const dev = runValidator(() => {
			throw new Error("secret-token");
		}, {}) as { status: number; message: string };
		expect(dev.status).toBe(400);
		expect(dev.message).toBe("secret-token");
	} finally {
		process.env.NODE_ENV = previous;
	}
});
