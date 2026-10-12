import { expectTypeOf, it } from "vitest";
import type { PropagationApp as App } from "../../src/shared/route-builder/register.ts";
import {
	createServerFn,
	type FnContext,
	type FnStart,
	type ServerFnBuilder,
} from "../../src/server/server-fn/builder.ts";

// The dx/types.md matrix rows whose producer is `createServerFn`. The other rows are in `propagation.test.ts`. A
// chain here is built, never called: a call outside a request throws.

type Authed = { auth: true; input: void; output: void; used: "authenticate" };

// A Standard Schema names its two sides in `types`. The validator runs on the server between them.
const query = { q: "" };
const echo = createServerFn()
	.input({ "~standard": { validate: (value: unknown) => ({ value }), types: { input: query, output: query } } })
	.handler(async ({ input }) => input);
const counted = createServerFn()
	.input({ "~standard": { validate: (value: unknown) => ({ value: Number(value) }), types: { input: "", output: 0 } } })
	.handler(({ input }) => input);
const parsed = createServerFn()
	.input({ parse: (value: string) => value.length })
	.handler(({ input }) => input);
const coerced = createServerFn()
	.input((value: string) => new Date(value))
	.handler(({ input }) => input.toISOString());
// An unannotated parameter is `unknown`, so the validator body still narrows it.
const raw = createServerFn()
	.input((value) => {
		expectTypeOf(value).toBeUnknown();
		return value;
	})
	.handler(({ input }) => input);
const ping = createServerFn().handler(({ input }) => input);
const secret = createServerFn().handler(async () => ({ secret: "s" }));
const loose = createServerFn()
	.input({ "~standard": { validate: (value: unknown) => ({ value }) } })
	.handler(({ input }) => input);
const ticks = createServerFn().stream(async function* () {
	yield { n: 1 };
	return "done";
});

// @ts-expect-error authenticate takes no caller argument on a server function
const _caller = () => createServerFn().authenticate("user");
// @ts-expect-error a handler context has no signal
const _signal = () => createServerFn().handler(({ signal }) => signal);

it("server fn no optional", () => {
	expectTypeOf<ServerFnBuilder<App, FnStart>>().toHaveProperty("authenticate");
	expectTypeOf<ServerFnBuilder<App, FnStart>>().not.toHaveProperty("authenticateOptional");
});
it("server fn auth null", () => {
	expectTypeOf<FnContext<App, FnStart>["auth"]>().toEqualTypeOf<null>();
	// @ts-expect-error skipping authenticate is null, not the session
	const _bad: FnContext<App, FnStart>["auth"] = { userId: "a" };
});
it("server fn auth required", () => {
	expectTypeOf<FnContext<App, Authed>["auth"]["userId"]>().toEqualTypeOf<string>();
	expectTypeOf<ServerFnBuilder<App, FnStart>["authenticate"]>().parameters.toEqualTypeOf<[]>();
});
it("server fn input", () => {
	expectTypeOf(echo).parameters.toEqualTypeOf<[{ q: string }]>();
	expectTypeOf(echo).returns.toEqualTypeOf<Promise<{ q: string }>>();
	// The caller passes the validator's input, and the handler reads its output.
	expectTypeOf(counted).parameters.toEqualTypeOf<[string]>();
	expectTypeOf(counted).returns.toEqualTypeOf<Promise<number>>();
	expectTypeOf(parsed).parameters.toEqualTypeOf<[string]>();
	expectTypeOf(parsed).returns.toEqualTypeOf<Promise<number>>();
	expectTypeOf(coerced).parameters.toEqualTypeOf<[string]>();
	expectTypeOf(coerced).returns.toEqualTypeOf<Promise<string>>();
	// @ts-expect-error the transforming schema takes its input, not its output
	const _output = () => counted(1);
	// @ts-expect-error extra keys are rejected
	const _extra = () => echo({ q: "a", extra: true });
	// @ts-expect-error the argument is required
	const _missing = () => echo();
});
it("server fn input void", () => {
	expectTypeOf(ping).parameters.toEqualTypeOf<[]>();
	expectTypeOf(ping).returns.toEqualTypeOf<Promise<undefined>>();
	// @ts-expect-error a void input takes no argument
	const _passed = () => ping({ q: "a" });
});
it("server fn schema unknown", () => {
	expectTypeOf(loose).parameters.toEqualTypeOf<[unknown]>();
	expectTypeOf(raw).parameters.toEqualTypeOf<[unknown]>();
	// A schema whose output is unknown does not reject a bad key. This row documents that limit.
	const _bad = () => loose({ bad: true });
	expectTypeOf(_bad).toBeFunction();
});
it("server fn return", () => {
	expectTypeOf(secret).returns.toEqualTypeOf<Promise<{ secret: string }>>();
	// @ts-expect-error the client does not see an envelope
	const _bad: Awaited<ReturnType<typeof secret>> = { data: { secret: "a" } };
});
it("server fn stream", () => {
	expectTypeOf(ticks).returns.toEqualTypeOf<AsyncIterable<{ n: number }>>();
	type Start = ServerFnBuilder<App, FnStart>;
	type StreamCtx = Parameters<Parameters<Start["stream"]>[0]>[0];
	type HandlerCtx = Parameters<Parameters<Start["handler"]>[0]>[0];
	expectTypeOf<StreamCtx>().toHaveProperty("signal");
	expectTypeOf<StreamCtx>().not.toHaveProperty("revalidate");
	expectTypeOf<HandlerCtx>().not.toHaveProperty("signal");
});
it("server fn render call", () => {
	expectTypeOf(secret).toBeCallableWith();
	expectTypeOf(secret).returns.toEqualTypeOf<Promise<{ secret: string }>>();
});
it("server fn methods", () => {
	const authed = createServerFn().authenticate();
	expectTypeOf(authed).toHaveProperty("input");
	expectTypeOf(authed).toHaveProperty("authorize");
	expectTypeOf(authed).toHaveProperty("handler");
	expectTypeOf(authed).toHaveProperty("stream");
	expectTypeOf(authed).not.toHaveProperty("authenticate");
	const validated = createServerFn().input((value: unknown) => value);
	expectTypeOf(validated).not.toHaveProperty("input");
	expectTypeOf(validated.authorize(() => true)).not.toHaveProperty("authorize");
});
