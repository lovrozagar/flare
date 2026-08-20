import { render } from "@solidjs/web";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SSRContextProvider, type SSRContextValue, useSSRContext } from "../../../src/components/index.ts";

function makeValue(overrides?: Partial<SSRContextValue>): SSRContextValue {
	return {
		flareStateScript: "self.flare={}",
		isServer: false,
		nonce: "abc123",
		...overrides,
	};
}

describe("SSRContextProvider + useSSRContext", () => {
	let container: HTMLDivElement;
	let dispose: (() => void) | undefined;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		dispose?.();
		container.remove();
	});

	it("provides value to children", () => {
		let result: SSRContextValue | undefined;
		const value = makeValue();
		dispose = render(
			() => (
				<SSRContextProvider value={value}>
					{(() => {
						result = useSSRContext();
						return null;
					})()}
				</SSRContextProvider>
			),
			container,
		);

		expect(result).toBeDefined();
		expect(result?.nonce).toBe("abc123");
		expect(result?.flareStateScript).toBe("self.flare={}");
		expect(result?.isServer).toBe(false);
	});

	it("useSSRContext outside provider → undefined", () => {
		let result: SSRContextValue | undefined = makeValue();
		dispose = render(() => {
			result = useSSRContext();
			return null;
		}, container);
		expect(result).toBeUndefined();
	});

	it("passes entryScript through", () => {
		let result: SSRContextValue | undefined;
		const value = makeValue({ entryScript: "/assets/client-abc.js" });
		dispose = render(
			() => (
				<SSRContextProvider value={value}>
					{(() => {
						result = useSSRContext();
						return null;
					})()}
				</SSRContextProvider>
			),
			container,
		);

		expect(result?.entryScript).toBe("/assets/client-abc.js");
	});

	it("passes resolvedHead through", () => {
		let result: SSRContextValue | undefined;
		const value = makeValue({
			resolvedHead: { title: "Test Page" } as SSRContextValue["resolvedHead"],
		});
		dispose = render(
			() => (
				<SSRContextProvider value={value}>
					{(() => {
						result = useSSRContext();
						return null;
					})()}
				</SSRContextProvider>
			),
			container,
		);

		expect(result?.resolvedHead).toEqual({ title: "Test Page" });
	});
});
