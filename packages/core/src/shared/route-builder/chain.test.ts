import { expect, it } from "vitest";
import { createChain } from "./chain.ts";

const authorize = (): boolean => true;
const preloader = (): string => "pre";
const loader = (): string => "data";
const render = (): string => "view";
const head = (): { title: string } => ({ title: "Home" });

const noop = () => null;
const answer = (): Response => new Response(null);

it("second render throws", () => {
	expect(() => createChain("_root_").render(noop).render(noop)).toThrow(/render/);
});

it("loader then response throws", () => {
	expect(() => createChain("_root_").loader(noop).response(answer)).toThrow(/loader/);
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

it("stores in order", () => {
	const record = createChain("_root_")
		.cache({ ssr: { ttl: "1m" } })
		.authenticate("admin")
		.authorize(authorize)
		.preloader(preloader)
		.loader(loader)
		.head(head)
		.render(render)
		.record();
	expect(record).toEqual({
		cache: { ssr: { ttl: "1m" } },
		auth: { mode: true, callerData: ["admin"] },
		authorize,
		preloader,
		loader,
		head,
		render,
	});
	expect(() =>
		createChain("_root_")
			.preloader(noop)
			.authorize(() => true),
	).toThrow(/order/);
	expect(() => createChain("_root_").response(answer).loader(noop)).toThrow(/loader/);
	expect(createChain("_root_").response(answer).record()).toEqual({ response: answer });
});

it("authenticate records", () => {
	expect(createChain("_root_").authenticate().record()).toEqual({ auth: { mode: true, callerData: [] } });
	expect(createChain("_root_").authenticateOptional("a", "b").record()).toEqual({
		auth: { mode: "optional", callerData: ["a", "b"] },
	});
	expect(() => createChain("_root_").authenticate().authenticateOptional()).toThrow(/authenticate/);
});
