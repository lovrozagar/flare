import { expect, vi } from "vitest";

// Runs a call that must throw in dev, with `reportError` stubbed. Solid hands an uncaught render error to the
// platform's `reportError` as well as rethrowing it: Bun and the browsers have one, Node does not, so a bare throw
// test would also raise an uncaught error under Bun. This asserts the throw and one report of the same failure, alike
// on every runtime (00-rules, BUGS.md B48).
export function expectReported(run: () => unknown, message: string | RegExp): void {
	const had = Object.getOwnPropertyDescriptor(globalThis, "reportError");
	const report = vi.fn<(error: unknown) => void>();
	Object.defineProperty(globalThis, "reportError", { value: report, configurable: true, writable: true });
	let thrown: unknown;
	try {
		run();
	} catch (error) {
		thrown = error;
	} finally {
		if (had === undefined) Reflect.deleteProperty(globalThis, "reportError");
		else Object.defineProperty(globalThis, "reportError", had);
	}
	expect(() => {
		throw thrown;
	}).toThrow(message);
	// Solid reports its own error for the same failure, so the report matches by message, not identity.
	expect(report).toHaveBeenCalledOnce();
	expect(() => {
		throw report.mock.calls[0]?.[0];
	}).toThrow(message);
}
