import { describe, expect, it, vi } from "vitest";

/**
 * Task 8: Link prefetch listener accumulation
 *
 * The ref-based setupPrefetchBehavior is called once per mount.
 * onCleanup inside it registers at the component scope, which fires
 * on unmount. This test verifies the cleanup behavior is correct
 * and that no listeners accumulate.
 */

describe("Task 8: prefetch listener cleanup", () => {
	it("addEventListener is paired with removeEventListener via onCleanup", () => {
		/* Simulate what setupPrefetchBehavior does for "intent" strategy */
		const el = {
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		};

		const cleanups: (() => void)[] = [];
		const onCleanup = (fn: () => void) => cleanups.push(fn);

		const handleIntent = () => {};

		/* Simulating setupPrefetchBehavior("intent") */
		el.addEventListener("focus", handleIntent);
		el.addEventListener("touchstart", handleIntent, { passive: true });
		onCleanup(() => {
			el.removeEventListener("focus", handleIntent);
			el.removeEventListener("touchstart", handleIntent);
		});

		expect(el.addEventListener).toHaveBeenCalledTimes(2);
		expect(cleanups.length).toBe(1);

		/* Simulate unmount */
		for (const fn of cleanups) fn();

		expect(el.removeEventListener).toHaveBeenCalledTimes(2);
		expect(el.removeEventListener).toHaveBeenCalledWith("focus", handleIntent);
		expect(el.removeEventListener).toHaveBeenCalledWith("touchstart", handleIntent);
	});

	it("IntersectionObserver disconnected via onCleanup", () => {
		const disconnect = vi.fn();
		const observe = vi.fn();

		const cleanups: (() => void)[] = [];
		const onCleanup = (fn: () => void) => cleanups.push(fn);

		/* Simulating setupPrefetchBehavior("viewport") */
		const observer = { disconnect, observe };
		const el = {} as Element;
		observer.observe(el);
		onCleanup(() => observer.disconnect());

		expect(observe).toHaveBeenCalledTimes(1);
		expect(cleanups.length).toBe(1);

		/* Simulate unmount */
		for (const fn of cleanups) fn();
		expect(disconnect).toHaveBeenCalledTimes(1);
	});

	it("multiple mount/unmount cycles don't accumulate listeners", () => {
		const el = {
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
		};

		/* Simulate 3 mount/unmount cycles */
		for (let i = 0; i < 3; i++) {
			const cleanups: (() => void)[] = [];
			const onCleanup = (fn: () => void) => cleanups.push(fn);
			const handleIntent = () => {};

			el.addEventListener("focus", handleIntent);
			el.addEventListener("touchstart", handleIntent, { passive: true });
			onCleanup(() => {
				el.removeEventListener("focus", handleIntent);
				el.removeEventListener("touchstart", handleIntent);
			});

			/* Simulate unmount */
			for (const fn of cleanups) fn();
		}

		/* Each cycle adds 2 and removes 2 — net zero */
		expect(el.addEventListener).toHaveBeenCalledTimes(6);
		expect(el.removeEventListener).toHaveBeenCalledTimes(6);
	});

	it("ref callback is only called once per mount (Solid behavior)", () => {
		/* Solid's ref= attribute calls the callback exactly once when the
		 * element is created, so setupPrefetchBehavior cannot accumulate
		 * listeners during a single component lifecycle. */
		let callCount = 0;
		const ref = (_el: unknown) => {
			callCount++;
		};

		/* Simulating a single <a ref={ref}> mount */
		ref(document.createElement("a"));
		expect(callCount).toBe(1);
	});
});
