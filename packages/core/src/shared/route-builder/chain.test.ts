import { expect, it } from "vitest";
import { createChain } from "./chain.ts";

const noop = () => null;

it("second render throws", () => {
	expect(() => createChain("_root_").render(noop).render(noop)).toThrow(/render/);
});

it("loader then response throws", () => {
	expect(() => createChain("_root_").loader(noop).response(noop)).toThrow(/loader/);
});

it("order", () => {
	expect(() =>
		createChain("_root_")
			.loader(noop)
			.cache({ ssr: { ttl: "1m" } }),
	).toThrow(/order/);
});

it("one mode", () => {
	expect(() => {
		// @ts-expect-error ssr and isr are mutually exclusive
		createChain("_root_").cache({ ssr: { ttl: "1m" }, isr: true });
	}).toThrow(/one cache mode/);
	expect(() => createChain("_root_").cache({ ssr: { ttl: "1m" }, isr: true } as never)).toThrow(/one cache mode/);
});

it("no author key", () => {
	const built = createChain("_root_");
	// @ts-expect-error ssr has no author key
	const chain = built.cache({ ssr: { ttl: "1m", key: () => "x" } });
	expect(typeof chain.render).toBe("function");
});

it("optional argument", () => {
	expect(() => createChain("_root_").authenticate("optional")).toThrow(/authenticateOptional/);
});
