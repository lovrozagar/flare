import { expect, it, vi } from "vitest";
import { createClientOnlyFn } from "./client-only.ts";

it("returns", () => {
	const body = vi.fn<() => string>(() => "focused");
	const focus = createClientOnlyFn(body);
	expect(focus()).toBe("focused");
	expect(body).toHaveBeenCalledOnce();
});

it("backstop", () => {
	// The ssr graph's rewrite drops the body, so the call there has no argument.
	const rewritten: () => unknown = Reflect.apply(createClientOnlyFn, undefined, []);
	expect(() => rewritten()).toThrow("A createClientOnlyFn function was called outside the client");
});
