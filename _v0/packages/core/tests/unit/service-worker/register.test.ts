import { afterEach, describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "../../../src/service-worker/register.ts";

function stubServiceWorker() {
	const sw = {
		getRegistrations: vi.fn(async () => []),
		register: vi.fn(async () => ({})),
	};
	Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: sw });
	return sw;
}

afterEach(() => {
	Reflect.deleteProperty(navigator, "serviceWorker");
});

describe("registerServiceWorker", () => {
	it("registers the app's worker after load and idle, always fetching its script fresh", async () => {
		const sw = stubServiceWorker();

		registerServiceWorker("/service-worker.js");
		expect(sw.register).not.toHaveBeenCalled();

		await vi.waitFor(() =>
			expect(sw.register).toHaveBeenCalledWith("/service-worker.js", { scope: "/", updateViaCache: "none" }),
		);
	});

	it("never touches other registrations on the origin", async () => {
		const sw = stubServiceWorker();

		registerServiceWorker("/service-worker.js");
		await vi.waitFor(() => expect(sw.register).toHaveBeenCalled());

		expect(sw.getRegistrations).not.toHaveBeenCalled();
	});

	it("is a no-op where service workers are unavailable", () => {
		expect(() => registerServiceWorker("/service-worker.js")).not.toThrow();
	});
});

describe("registerServiceWorker — failures", () => {
	it("a rejected registration is swallowed, never an unhandled rejection", async () => {
		const register = vi.fn(async () => {
			throw new Error("SW failed");
		});
		Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
		const unhandled = vi.fn();
		process.on("unhandledRejection", unhandled);
		try {
			registerServiceWorker("/service-worker.js");
			await vi.waitFor(() => expect(register).toHaveBeenCalled());
			await new Promise((r) => setTimeout(r, 20));
			expect(unhandled).not.toHaveBeenCalled();
		} finally {
			process.off("unhandledRejection", unhandled);
		}
	});
});
