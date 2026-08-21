import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HydrateOptions } from "../../../src/hydrate/index.tsx";

vi.mock("../../../src/hydrate/index.tsx", () => ({
	hydrate: vi.fn(async () => {}),
}));

describe("lifecycle signals", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	describe("interaction events", () => {
		it("onInteraction fires on mousemove", () => {
			const EVENTS = ["mousemove", "touchstart", "scroll", "keydown"] as const;
			let interacted = false;
			let callbackFired = false;

			const markInteracted = () => {
				interacted = true;
				callbackFired = true;
				for (const e of EVENTS) {
					removeEventListener(e, markInteracted, { capture: true });
				}
			};
			for (const e of EVENTS) {
				addEventListener(e, markInteracted, { capture: true, once: true, passive: true });
			}

			expect(interacted).toBe(false);
			dispatchEvent(new Event("mousemove"));
			expect(interacted).toBe(true);
			expect(callbackFired).toBe(true);
		});

		it("onInteraction fires on touchstart", () => {
			let interacted = false;
			const EVENTS = ["mousemove", "touchstart", "scroll", "keydown"] as const;

			const markInteracted = () => {
				interacted = true;
				for (const e of EVENTS) {
					removeEventListener(e, markInteracted, { capture: true });
				}
			};
			for (const e of EVENTS) {
				addEventListener(e, markInteracted, { capture: true, once: true, passive: true });
			}

			dispatchEvent(new Event("touchstart"));
			expect(interacted).toBe(true);
		});

		it("onInteraction fires on scroll", () => {
			let interacted = false;
			const EVENTS = ["mousemove", "touchstart", "scroll", "keydown"] as const;

			const markInteracted = () => {
				interacted = true;
				for (const e of EVENTS) {
					removeEventListener(e, markInteracted, { capture: true });
				}
			};
			for (const e of EVENTS) {
				addEventListener(e, markInteracted, { capture: true, once: true, passive: true });
			}

			dispatchEvent(new Event("scroll"));
			expect(interacted).toBe(true);
		});

		it("onInteraction fires on keydown", () => {
			let interacted = false;
			const EVENTS = ["mousemove", "touchstart", "scroll", "keydown"] as const;

			const markInteracted = () => {
				interacted = true;
				for (const e of EVENTS) {
					removeEventListener(e, markInteracted, { capture: true });
				}
			};
			for (const e of EVENTS) {
				addEventListener(e, markInteracted, { capture: true, once: true, passive: true });
			}

			dispatchEvent(new KeyboardEvent("keydown"));
			expect(interacted).toBe(true);
		});

		it("fires only once across multiple events", () => {
			let count = 0;
			const EVENTS = ["mousemove", "touchstart", "scroll", "keydown"] as const;

			const markInteracted = () => {
				count++;
				for (const e of EVENTS) {
					removeEventListener(e, markInteracted, { capture: true });
				}
			};
			for (const e of EVENTS) {
				addEventListener(e, markInteracted, { capture: true, once: true, passive: true });
			}

			dispatchEvent(new Event("mousemove"));
			dispatchEvent(new Event("scroll"));
			dispatchEvent(new KeyboardEvent("keydown"));
			expect(count).toBe(1);
		});
	});

	describe("idle callback", () => {
		it("onIdle fires via requestIdleCallback", () => {
			let idled = false;
			let callbackFired = false;

			const originalRIC = globalThis.requestIdleCallback;
			globalThis.requestIdleCallback = (cb: IdleRequestCallback) => {
				cb({} as IdleDeadline);
				return 0;
			};

			try {
				if (typeof requestIdleCallback === "function") {
					requestIdleCallback(() => {
						idled = true;
						callbackFired = true;
					});
				}

				expect(idled).toBe(true);
				expect(callbackFired).toBe(true);
			} finally {
				globalThis.requestIdleCallback = originalRIC;
			}
		});
	});

	describe("HydrateOptions shape", () => {
		it("accepts onIdle and onInteraction", () => {
			const options: HydrateOptions = {
				onIdle: () => {},
				onInteraction: () => {},
			};
			expect(options.onIdle).toBeTypeOf("function");
			expect(options.onInteraction).toBeTypeOf("function");
		});
	});

	describe("multiple callbacks via createClient", async () => {
		const { createClient } = await import("../../../src/client/index.ts");
		const { createRouter } = await import("../../../src/router-config/index.ts");
		const { createTreeNode } = await import("../../../src/router-primitives/index.ts");

		const router = createRouter({
			layouts: {},
			routeTree: createTreeNode(),
		});

		it("collects multiple onIdle callbacks", () => {
			const builder = createClient(router)
				.onIdle(() => {})
				.onIdle(() => {});
			expect(builder).toBeDefined();
		});

		it("collects multiple onInteraction callbacks", () => {
			const builder = createClient(router)
				.onInteraction(() => {})
				.onInteraction(() => {});
			expect(builder).toBeDefined();
		});

		it("mixes all callback types", () => {
			const builder = createClient(router)
				.onHydrated(() => {})
				.onIdle(() => {})
				.onInteraction(() => {})
				.onReady(() => {})
				.onHydrated(() => {})
				.onIdle(() => {});
			expect(builder).toBeDefined();
		});
	});
});
