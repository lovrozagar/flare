import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { assignIds, fnId } from "./ids.ts";

function constant(): string {
	return "0123456789abcdef";
}

it("stable", () => {
	const first = fnId("src/fns/echo.ts", "echo");
	expect(first).toMatch(/^[0-9a-f]{16}$/);
	expect(fnId("src/fns/echo.ts", "echo")).toBe(first);
});

it("two names", () => {
	const ids = assignIds([
		{ path: "src/fns/echo.ts", name: "echo" },
		{ path: "src/fns/echo.ts", name: "echo2" },
	]);
	expect(ids.size).toBe(2);
});

it("same name two files", () => {
	expect(fnId("src/a.ts", "echo")).not.toBe(fnId("src/b.ts", "echo"));
	expect(
		assignIds([
			{ path: "src/a.ts", name: "echo" },
			{ path: "src/b.ts", name: "echo" },
		]).size,
	).toBe(2);
});

it("collision", () => {
	expect(() =>
		assignIds(
			[
				{ path: "src/a.ts", name: "one" },
				{ path: "src/b.ts", name: "two" },
			],
			constant,
		),
	).toThrow(/src\/a\.ts.*one.*src\/b\.ts.*two/);
});

it("export name", () => {
	const expected = createHash("sha256").update("src/fns/echo.ts\0echo").digest("hex").slice(0, 16);
	expect(fnId("src/fns/echo.ts", "echo")).toBe(expected);
	expect([...assignIds([{ path: "src/fns/echo.ts", name: "echo" }]).keys()]).toEqual([expected]);
	expect(assignIds([{ path: "src/fns/echo.ts", name: "echo" }]).get(expected)).toEqual({
		path: "src/fns/echo.ts",
		name: "echo",
	});
});

it("not exported", () => {
	expect(() => assignIds([{ path: "src/fns/inner.ts", name: undefined }])).toThrow(
		/src\/fns\/inner\.ts.*direct export/,
	);
});
