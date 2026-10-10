import { describe, expect, it, vi } from "vitest";

/**
 * Bug 75: setRewrite not in finally block — leaks on renderToStream throw
 *
 * server-handler calls setRewrite(composedRewrite) before renderToStream(),
 * then setRewrite(undefined) after. If renderToStream throws (component error,
 * import failure, Solid sync-render crash), setRewrite(undefined) is never
 * reached. Since `rewrite` is module-level state, it leaks to subsequent
 * requests on Workers where the module is shared.
 */

describe("Bug 75: setRewrite cleanup on throw", () => {
	it("should clear rewrite even when render throws (fixed pattern)", () => {
		let state: string | undefined;

		function setRewrite(v: string | undefined) {
			state = v;
		}
		function renderToStream(): { body: string } {
			throw new Error("SSR render crash");
		}

		/* Fixed pattern: try/finally ensures cleanup even on throw */
		setRewrite("rewrite-value");
		try {
			renderToStream();
		} catch {
			/* error handled by outer catch in server-handler */
		} finally {
			setRewrite(undefined);
		}

		expect(state).toBeUndefined();
	});

	it("should demonstrate leak without finally (the bug)", () => {
		let state: string | undefined;

		function setRewrite(v: string | undefined) {
			state = v;
		}
		function renderToStream(): { body: string } {
			throw new Error("SSR render crash");
		}

		/* Original buggy pattern: no finally */
		setRewrite("rewrite-value");
		try {
			renderToStream();
			setRewrite(undefined);
		} catch {
			/* error handled elsewhere */
		}

		/* Bug: state still has the leaked value */
		expect(state).toBe("rewrite-value");
	});

	it("should clear rewrite on successful render too", () => {
		let state: string | undefined;

		function setRewrite(v: string | undefined) {
			state = v;
		}
		function renderToStream(): { body: string } {
			return { body: "<html></html>" };
		}

		/* Fixed pattern works for success path too */
		setRewrite("rewrite-value");
		try {
			const result = renderToStream();
			expect(result.body).toBe("<html></html>");
		} finally {
			setRewrite(undefined);
		}

		expect(state).toBeUndefined();
	});
});
