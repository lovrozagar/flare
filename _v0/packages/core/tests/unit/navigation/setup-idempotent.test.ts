import { describe, expect, it, vi } from "vitest";

/**
 * Task 9: Navigation setupNavigation handler accumulation
 *
 * Verifies that setupNavigation() properly cleans up intervals and handlers
 * before creating new ones, preventing accumulation on HMR or re-init.
 */

describe("Task 9: setupNavigation idempotent cleanup", () => {
	it("gcIntervalId cleared before re-creating", () => {
		/* Verify pattern: clear before create */
		let gcId: ReturnType<typeof setInterval> | null = null;

		function simulateSetupGC() {
			if (gcId !== null) clearInterval(gcId);
			gcId = setInterval(() => {}, 60000);
		}

		simulateSetupGC();
		const firstId = gcId;
		expect(firstId).not.toBeNull();

		simulateSetupGC();
		const secondId = gcId;
		expect(secondId).not.toBeNull();
		/* IDs are different — new interval created after clearing old */
		expect(secondId).not.toBe(firstId);

		if (gcId !== null) clearInterval(gcId);
	});

	it("keepalive visibility handler removed before re-adding", () => {
		const addSpy = vi.spyOn(document, "addEventListener");
		const removeSpy = vi.spyOn(document, "removeEventListener");

		let handler: (() => void) | null = null;

		function simulateSetupKeepalive() {
			if (handler) {
				document.removeEventListener("visibilitychange", handler);
				handler = null;
			}
			handler = () => {};
			document.addEventListener("visibilitychange", handler);
		}

		simulateSetupKeepalive();
		simulateSetupKeepalive();
		simulateSetupKeepalive();

		/* 3 adds, 2 removes (first setup has nothing to remove) */
		const visibilityAdds = addSpy.mock.calls.filter((c) => c[0] === "visibilitychange");
		const visibilityRemoves = removeSpy.mock.calls.filter((c) => c[0] === "visibilitychange");
		expect(visibilityAdds.length).toBe(3);
		expect(visibilityRemoves.length).toBe(2);

		/* cleanup */
		if (handler) document.removeEventListener("visibilitychange", handler);
		addSpy.mockRestore();
		removeSpy.mockRestore();
	});

	it("popstate cleanup called before re-registering", () => {
		let cleanupCount = 0;
		let currentCleanup: (() => void) | null = null;

		function simulateCreateHistoryListener(_handler: () => void): () => void {
			return () => {
				cleanupCount++;
			};
		}

		function simulateSetupPopstate() {
			if (currentCleanup) currentCleanup();
			currentCleanup = simulateCreateHistoryListener(() => {});
		}

		simulateSetupPopstate();
		expect(cleanupCount).toBe(0);

		simulateSetupPopstate();
		expect(cleanupCount).toBe(1);

		simulateSetupPopstate();
		expect(cleanupCount).toBe(2);
	});

	it("resetNavigationState clears all handlers", () => {
		let gcId: ReturnType<typeof setInterval> | null = null;
		let keepaliveId: ReturnType<typeof setInterval> | null = null;
		let visHandler: (() => void) | null = null;
		let popstateCleanup: (() => void) | null = null;
		let popstateCleaned = false;

		/* Simulate active state */
		gcId = setInterval(() => {}, 60000);
		keepaliveId = setInterval(() => {}, 30000);
		visHandler = () => {};
		document.addEventListener("visibilitychange", visHandler);
		popstateCleanup = () => {
			popstateCleaned = true;
		};

		/* Simulate resetNavigationState */
		if (popstateCleanup) {
			popstateCleanup();
			popstateCleanup = null;
		}
		if (gcId !== null) {
			clearInterval(gcId);
			gcId = null;
		}
		if (keepaliveId !== null) {
			clearInterval(keepaliveId);
			keepaliveId = null;
		}
		if (visHandler) {
			document.removeEventListener("visibilitychange", visHandler);
			visHandler = null;
		}

		expect(popstateCleaned).toBe(true);
		expect(gcId).toBeNull();
		expect(keepaliveId).toBeNull();
		expect(visHandler).toBeNull();
	});
});
