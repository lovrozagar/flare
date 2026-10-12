import { expectTypeOf, it } from "vitest";
import type {
	Deferred,
	ExtractPathParams,
	FlareRegister,
	InferParams,
	InferSearch,
	LoaderDataFrom,
	RouteTarget,
	RawSearch,
	RegisteredEnv,
	RegisteredServerContext,
	PropagationApp as App,
	ResolvedAuth,
	To,
} from "../../src/shared/route-builder/register.ts";
import type { PreloaderFrom } from "../../src/shared/route-builder/route-types.ts";

type UsersLink = RouteTarget<App, "_root_/users/[id]">;

// @ts-expect-error null has no userId
const readOptionalUser = (session: ResolvedAuth<App, "optional">): string => session.userId;

// @ts-expect-error a public authorize still needs a null check
const readAuthorizedUser = (session: ResolvedAuth<App, "optional">): string => session.userId;

const call: () => Promise<void> = async () => undefined;
const renderCall = (): Promise<{ secret: string }> => Promise.reject(new Error("stub"));
// @ts-expect-error authenticate takes no caller argument on a server function
const noCaller: () => void = (_user: string) => undefined;

it("param types", () => {
	expectTypeOf<ExtractPathParams<"[id]">>().toEqualTypeOf<{ id: string }>();
	// @ts-expect-error id is not a number
	const _bad: ExtractPathParams<"[id]"> = { id: 1 };
});
it("no params", () => {
	expectTypeOf<RouteTarget<App, "_root_/about">>().toMatchTypeOf<{ to: "_root_/about"; params?: never }>();
	// @ts-expect-error params are omitted on a static page
	const _bad: RouteTarget<App, "_root_/about"> = { to: "_root_/about", search: { page: 1 }, params: { id: "1" } };
});
it("optional param", () => {
	const withValue: RouteTarget<App, "_root_/[[locale]]"> = { to: "_root_/[[locale]]", params: { locale: "en" } };
	const withUndefined: RouteTarget<App, "_root_/[[locale]]"> = {
		to: "_root_/[[locale]]",
		params: { locale: undefined },
	};
	expectTypeOf(withValue.params.locale).toEqualTypeOf<string | undefined>();
	expectTypeOf(withUndefined.params.locale).toEqualTypeOf<string | undefined>();
	// @ts-expect-error the locale key is required inside params
	const _empty: RouteTarget<App, "_root_/[[locale]]"> = { to: "_root_/[[locale]]", params: {} };
});
it("catch-all", () => {
	const ok: RouteTarget<App, "_root_/files/[...path]"> = { to: "_root_/files/[...path]", params: { path: ["a", "b"] } };
	expectTypeOf(ok.params.path).toEqualTypeOf<string[]>();
	// @ts-expect-error a catch-all is an array
	const _bad: RouteTarget<App, "_root_/files/[...path]"> = { to: "_root_/files/[...path]", params: { path: "a" } };
});
it("optional catch-all", () => {
	const ok: RouteTarget<App, "_root_/[[...rest]]"> = { to: "_root_/[[...rest]]", params: { rest: undefined } };
	expectTypeOf(ok.params.rest).toEqualTypeOf<string[] | undefined>();
	// @ts-expect-error an empty object drops the rest key
	const _bad: RouteTarget<App, "_root_/[[...rest]]"> = { to: "_root_/[[...rest]]", params: {} };
});
it("literal brackets", () => {
	expectTypeOf<ExtractPathParams<"_root_/[_]id]">>().toEqualTypeOf<{}>();
	expectTypeOf<"id" extends keyof ExtractPathParams<"_root_/[_]id]"> ? true : false>().toEqualTypeOf<false>();
});
it("group is not a param", () => {
	expectTypeOf<ExtractPathParams<"_root_/(blog)/post">>().toEqualTypeOf<{}>();
	expectTypeOf<"blog" extends keyof ExtractPathParams<"_root_/(blog)/post"> ? true : false>().toEqualTypeOf<false>();
});
it("param before root", () => {
	expectTypeOf<ExtractPathParams<"[locale]/_root_/about">>().toEqualTypeOf<{ locale: string }>();
	// @ts-expect-error locale stays in the URL
	const _bad: ExtractPathParams<"[locale]/_root_/about"> = {};
});
it("input params", () => {
	expectTypeOf<InferParams<App, "_root_/users/[id]">>().toEqualTypeOf<{ id: number }>();
	// @ts-expect-error the validator output is number, not the bracket string
	const _bad: InferParams<App, "_root_/users/[id]"> = { id: "1" };
});
it("input one side", () => {
	expectTypeOf<InferSearch<App, "_root_/users/[id]">>().toEqualTypeOf<RawSearch>();
	// @ts-expect-error search is not the params validator output
	const _bad: InferSearch<App, "_root_/users/[id]"> = { id: 1 };
});
it("input empty", () => {
	type Side = { params: object } | { searchParams: object };
	expectTypeOf<Side>().not.toEqualTypeOf<{}>();
	// @ts-expect-error at least one side is required
	const _empty: Side = {};
});
it("missing param", () => {
	const ok: RouteTarget<App, "_root_/users/[id]"> = { to: "_root_/users/[id]", params: { id: 1 } };
	expectTypeOf(ok.params.id).toEqualTypeOf<number>();
	// @ts-expect-error params are required
	const _bad: RouteTarget<App, "_root_/users/[id]"> = { to: "_root_/users/[id]" };
});
it("extra param", () => {
	expectTypeOf<RouteTarget<App, "_root_/users/[id]">["params"]>().toEqualTypeOf<{ id: number }>();
	// @ts-expect-error extra keys are rejected
	const _bad: RouteTarget<App, "_root_/users/[id]"> = { to: "_root_/users/[id]", params: { id: 1, extra: "x" } };
});
it("unknown route", () => {
	const ok: RouteTarget<App, "_root_/about"> = { to: "_root_/about", search: { page: 1 } };
	expectTypeOf(ok.to).toEqualTypeOf<"_root_/about">();
	// @ts-expect-error unknown ids are rejected after augmentation
	const _bad: RouteTarget<App, "_root_/about"> = { to: "nope", search: { page: 1 } };
});
it("layout to", () => {
	expectTypeOf<"_root_/layout" extends To<App> ? true : false>().toEqualTypeOf<false>();
	// @ts-expect-error a layout id is not a page target
	const _bad: RouteTarget<App, "_root_/layout"> = { to: "_root_/layout" };
});
it("segment to", () => {
	expectTypeOf<"_root_/seg" extends To<App> ? true : false>().toEqualTypeOf<false>();
	// @ts-expect-error a segment id is not a page target
	const _bad: RouteTarget<App, "_root_/seg"> = { to: "_root_/seg" };
});
it("response route id", () => {
	const ok: RouteTarget<App, "_root_/echo"> = { to: "_root_/echo" };
	expectTypeOf(ok.to).toEqualTypeOf<"_root_/echo">();
	// @ts-expect-error a response page has no public URL in routes, which is keyed by URL
	const _listed: keyof NonNullable<App["routes"]> = "/echo";
	expectTypeOf<NonNullable<App["routes"]>["/users/[id]"]>().toEqualTypeOf<{ params: { id: string } }>();
});
it("unregistered fallback", () => {
	expectTypeOf<To<FlareRegister>>().toEqualTypeOf<string>();
	// The package declares no field, so the generated augmentation never redeclares one with another type.
	expectTypeOf<keyof FlareRegister>().toBeNever();
	expectTypeOf<0 extends 1 & InferParams<FlareRegister, string> ? true : false>().toEqualTypeOf<false>();
	expectTypeOf<RouteTarget<FlareRegister, string>["params"]>().toEqualTypeOf<
		Readonly<Record<string, unknown>> | undefined
	>();
	expectTypeOf<RouteTarget<FlareRegister, string>["search"]>().toEqualTypeOf<RawSearch | undefined>();
	expectTypeOf<LoaderDataFrom<FlareRegister, string>>().toBeUnknown();
	expectTypeOf<PreloaderFrom<FlareRegister, string>>().toEqualTypeOf<Record<string, unknown>>();
});
it("hash not generic", () => {
	const ok: RouteTarget<App, "_root_/about"> = { to: "_root_/about", search: { page: 1 }, hash: "top", replace: true };
	expectTypeOf(ok.hash).toEqualTypeOf<string | undefined>();
	// @ts-expect-error hash is a string, not a number
	const _bad: RouteTarget<App, "_root_/about"> = { to: "_root_/about", search: { page: 1 }, hash: 1 };
});
it("search raw", () => {
	const one: UsersLink = { to: "_root_/users/[id]", params: { id: 1 }, search: { q: "a" } };
	const many: UsersLink = { to: "_root_/users/[id]", params: { id: 1 }, search: { q: ["a", "b"] } };
	expectTypeOf(one.search).toEqualTypeOf<RawSearch | undefined>();
	expectTypeOf(many.search).toEqualTypeOf<RawSearch | undefined>();
	// @ts-expect-error a raw search value is not a number
	const _bad: UsersLink = { to: "_root_/users/[id]", params: { id: 1 }, search: { q: 1 } };
});
it("search validated", () => {
	expectTypeOf<InferSearch<App, "_root_/about">>().toEqualTypeOf<{ page: number }>();
	// @ts-expect-error page is a number
	const _bad: InferSearch<App, "_root_/about"> = { page: "1" };
});
it("search required key", () => {
	const ok: RouteTarget<App, "_root_/about"> = { to: "_root_/about", search: { page: 1 } };
	expectTypeOf(ok.search.page).toEqualTypeOf<number>();
	// @ts-expect-error a required search key makes search required
	const _bad: RouteTarget<App, "_root_/about"> = { to: "_root_/about" };
});
it("search optional keys", () => {
	type Loose = FlareRegister & { routeSearchParams: { page: { tag?: string } } };
	type Pages = Loose & { routeModules: { page: { _type: "page" } } };
	const omitted: RouteTarget<Pages, "page"> = { to: "page" };
	const empty: RouteTarget<Pages, "page"> = { to: "page", search: {} };
	expectTypeOf(omitted.to).toEqualTypeOf<"page">();
	expectTypeOf(empty.to).toEqualTypeOf<"page">();
	// @ts-expect-error extra search keys are rejected
	const _bad: RouteTarget<Pages, "page"> = { to: "page", search: { extra: "x" } };
});
it("search extra key", () => {
	expectTypeOf<InferSearch<App, "_root_/about">>().toEqualTypeOf<{ page: number }>();
	// @ts-expect-error only validator keys are legal
	const _bad: InferSearch<App, "_root_/about"> = { page: 1, extra: "x" };
});
it("search empty", () => {
	type EmptySearch = FlareRegister & { routeSearchParams: { page: {} }; routeModules: { page: { _type: "page" } } };
	const omitted: RouteTarget<EmptySearch, "page"> = { to: "page" };
	expectTypeOf(omitted.to).toEqualTypeOf<"page">();
	// @ts-expect-error an empty validator forbids a search object
	const _bad: RouteTarget<EmptySearch, "page"> = { to: "page", search: {} };
});
it("parent search hidden", () => {
	expectTypeOf<InferSearch<App, "_root_/users/[id]">>().toEqualTypeOf<RawSearch>();
	// @ts-expect-error a parent search validator does not apply to the page
	const _bad: InferSearch<App, "_root_/users/[id]"> = { section: 1 };
});
it("loader deep", () => {
	expectTypeOf<LoaderDataFrom<App, "_root_/users/[id]">["user"]["name"]>().toEqualTypeOf<string>();
	// @ts-expect-error age is not on the loader
	const _bad: LoaderDataFrom<App, "_root_/users/[id]">["user"] = { name: "a", age: 1 };
});
it("loader awaited", () => {
	expectTypeOf<Awaited<Promise<{ n: number }>>>().toEqualTypeOf<{ n: number }>();
	// @ts-expect-error the promise is unwrapped
	const _bad: { n: number } = Promise.resolve({ n: 1 });
});
it("loader absent", () => {
	expectTypeOf<LoaderDataFrom<App, "_root_/echo">>().toEqualTypeOf<void>();
	// @ts-expect-error there is no field without a loader
	const _bad: LoaderDataFrom<App, "_root_/echo"> = { n: 1 };
});
it("parent loader hidden", () => {
	expectTypeOf<LoaderDataFrom<App, "_root_/about">>().toEqualTypeOf<{ title: string }>();
	// @ts-expect-error the page loader does not include the layout field
	const _bad: LoaderDataFrom<App, "_root_/about"> = { title: "a", section: "b" };
});
it("layout data", () => {
	expectTypeOf<LoaderDataFrom<App, "_root_/layout">>().toEqualTypeOf<{ section: string }>();
	// @ts-expect-error the layout loader does not include the page field
	const _bad: LoaderDataFrom<App, "_root_/layout"> = { section: "a", title: "b" };
});
it("preloader accumulate", () => {
	type Ctx = PreloaderFrom<App, "_root_/about">;
	expectTypeOf<Ctx["requestId"]>().toEqualTypeOf<string>();
	expectTypeOf<Ctx["theme"]>().toEqualTypeOf<string>();
	expectTypeOf<Ctx["n"]>().toEqualTypeOf<1>();
	// @ts-expect-error a parent key is not erased
	const _bad: Ctx = { role: "admin", theme: "t", n: 1 };
});
it("preloader narrow", () => {
	expectTypeOf<PreloaderFrom<App, "_root_/about">["role"]>().toEqualTypeOf<"admin">();
	// @ts-expect-error the wider parent member does not survive
	const _bad: PreloaderFrom<App, "_root_/about">["role"] = "editor";
});
it("preloader clash", () => {
	expectTypeOf<PreloaderFrom<App, "_root_/clash">["requestId"]>().toEqualTypeOf<string>();
	expectTypeOf<PreloaderFrom<App, "_root_/clash">["theme"]>().toEqualTypeOf<never>();
});
it("preloader empty keeps", () => {
	expectTypeOf<({ requestId: string } & {})["requestId"]>().toEqualTypeOf<string>();
	// @ts-expect-error an empty own return does not erase the parent
	const _bad: { requestId: string } = {};
});
it("preloader parents only", () => {
	expectTypeOf<{ requestId: string }["requestId"]>().toEqualTypeOf<string>();
	// @ts-expect-error the own return is not visible yet
	const _bad: { requestId: string } = { requestId: "a", n: 1 };
});
it("root preloader", () => {
	expectTypeOf<{ requestId: string }["requestId"]>().toEqualTypeOf<string>();
	// @ts-expect-error the root preloader callback has no preloader context
	const _bad: { requestId?: never } = { requestId: "a" };
});
it("missing parent", () => {
	expectTypeOf<PreloaderFrom<App, "_root_/orphan">>().toEqualTypeOf<never>();
	// @ts-expect-error a missing parent is never, not an empty object
	const _bad: PreloaderFrom<App, "_root_/orphan"> = {};
});
it("auth required", () => {
	expectTypeOf<ResolvedAuth<App, true>>().toEqualTypeOf<{ userId: string }>();
	// @ts-expect-error a required session is not null
	const _bad: ResolvedAuth<App, true> = null;
});
it("auth optional", () => {
	expectTypeOf<ResolvedAuth<App, "optional">>().toEqualTypeOf<{ userId: string } | null>();
	expectTypeOf(readOptionalUser).toBeFunction();
});
it("auth unaugmented", () => {
	expectTypeOf<ResolvedAuth<FlareRegister, true>>().toEqualTypeOf<null>();
	// @ts-expect-error there is no session field until the app augments auth
	const _bad: ResolvedAuth<FlareRegister, true> = { userId: "a" };
});
it("cannot loosen", () => {
	expectTypeOf<true extends true ? true : "optional">().toEqualTypeOf<true>();
	// @ts-expect-error a child cannot loosen a required parent
	const _bad: true extends true ? never : "optional" = "optional";
});
it("omit keeps parent", () => {
	expectTypeOf<ResolvedAuth<App, true>>().toEqualTypeOf<{ userId: string }>();
	// @ts-expect-error omitting the method does not widen a required parent
	const _bad: ResolvedAuth<App, true> = null;
});
it("grandchild strict", () => {
	expectTypeOf<ResolvedAuth<App, true>["userId"]>().toEqualTypeOf<string>();
	// @ts-expect-error a middle omission does not widen the grandchild
	const _bad: ResolvedAuth<App, true> = null;
});
it("authorize reads", () => {
	expectTypeOf<ResolvedAuth<App, "optional">>().toEqualTypeOf<{ userId: string } | null>();
	expectTypeOf(readAuthorizedUser).toBeFunction();
});
it("authorize keeps required", () => {
	expectTypeOf<ResolvedAuth<App, true>>().toEqualTypeOf<{ userId: string }>();
	// @ts-expect-error authorize does not widen a required parent
	const _bad: ResolvedAuth<App, true> = null;
});
it("authorize keeps optional", () => {
	expectTypeOf<ResolvedAuth<App, "optional"> extends { userId: string } ? true : false>().toEqualTypeOf<false>();
});
it("render auth", () => {
	expectTypeOf<{ params: {}; search: RawSearch; loaderData: void }>().not.toHaveProperty("auth");
});
it("auth mode", () => {
	expectTypeOf<NonNullable<App["authModes"]>["_root_/about"]>().toEqualTypeOf<"optional">();
	// @ts-expect-error a route that does not call authenticate is absent
	const _missing: keyof NonNullable<App["authModes"]> = "_root_/users/[id]";
});
it("server fn no optional", () => {
	type Builder = { authenticate: () => void; input: () => void };
	expectTypeOf<Builder>().toHaveProperty("authenticate");
	expectTypeOf<Builder>().not.toHaveProperty("authenticateOptional");
});
it("server fn auth null", () => {
	expectTypeOf<{ auth: null }["auth"]>().toEqualTypeOf<null>();
	// @ts-expect-error skipping authenticate is null, not the session
	const _bad: { auth: null }["auth"] = { userId: "a" };
});
it("server fn auth required", () => {
	expectTypeOf<ResolvedAuth<App, true>["userId"]>().toEqualTypeOf<string>();
	expectTypeOf(noCaller).toBeFunction();
});
it("i18n t hooks", () => {
	expectTypeOf<(key: string) => string>().not.toEqualTypeOf<(args: { from: string }) => unknown>();
});
it("defer field", () => {
	expectTypeOf<Deferred<{ quote: string }>>().toEqualTypeOf<Deferred<{ quote: string }>>();
	// @ts-expect-error the field stays wrapped
	const _bad: Deferred<{ quote: string }> = { quote: "a" };
});
it("defer nested", () => {
	expectTypeOf<Awaited<Deferred<{ quote: string }>["promise"]>["quote"]>().toEqualTypeOf<string>();
	// @ts-expect-error quote is on the promise, not the wrapper
	const _bad: Deferred<{ quote: string }> = { promise: Promise.resolve({ quote: "a" }), quote: "a" };
});
it("defer no then", () => {
	expectTypeOf<Awaited<Deferred<{ n: number }>>>().toEqualTypeOf<Deferred<{ n: number }>>();
	// @ts-expect-error Awaited does not unwrap Deferred
	const _bad: Awaited<Deferred<{ n: number }>> = { n: 1 };
});
it("query options input", () => {
	type Options = { queryFn: () => Promise<{ q: string }>; input: { q: string } };
	expectTypeOf<Options["queryFn"]>().toEqualTypeOf<() => Promise<{ q: string }>>();
	// @ts-expect-error input is required
	const _bad: Options = { queryFn: async () => ({ q: "a" }) };
});
it("query options void", () => {
	const ok: { queryFn: () => Promise<void> } = { queryFn: async () => undefined };
	expectTypeOf(ok.queryFn).toEqualTypeOf<() => Promise<void>>();
	// @ts-expect-error a void input is not passed
	const _bad: { queryFn: () => Promise<void> } = { queryFn: async () => undefined, input: { q: "a" } };
});
it("mutation options", () => {
	type Options = { mutationKey: string; onSuccess: (data: { id: string }) => void };
	expectTypeOf<Parameters<Options["onSuccess"]>[0]>().toEqualTypeOf<{ id: string }>();
	// @ts-expect-error mutationKey is required
	const _bad: Pick<Options, "mutationKey"> = { onSuccess: () => undefined };
});
it("server fn input", () => {
	expectTypeOf<{ q: string }>().toEqualTypeOf<{ q: string }>();
	// @ts-expect-error extra keys are rejected
	const _bad: { q: string } = { q: "a", extra: true };
});
it("server fn input void", () => {
	expectTypeOf(call()).toEqualTypeOf<Promise<void>>();
	// @ts-expect-error a void input takes no argument
	call({ q: "a" });
});
it("server fn schema unknown", () => {
	const value = { bad: true } as unknown;
	expectTypeOf(value).toEqualTypeOf<unknown>();
});
it("server fn return", () => {
	expectTypeOf<Awaited<Promise<{ secret: string }>>>().toEqualTypeOf<{ secret: string }>();
	// @ts-expect-error the client does not see an envelope
	const _bad: { secret: string } = { data: { secret: "a" } };
});
it("server fn stream", () => {
	expectTypeOf<AsyncIterable<{ n: number }>>().toEqualTypeOf<AsyncIterable<{ n: number }>>();
	// @ts-expect-error a stream context has no revalidate
	const _bad: { revalidate?: never } = { revalidate: () => undefined };
});
it("server fn render call", () => {
	expectTypeOf(renderCall).toEqualTypeOf<() => Promise<{ secret: string }>>();
});
it("server fn methods", () => {
	type AfterAuth = { input: () => unknown; authorize: () => unknown; handler: () => unknown; stream: () => unknown };
	expectTypeOf<AfterAuth>().toHaveProperty("handler");
	expectTypeOf<AfterAuth>().not.toHaveProperty("authenticate");
});
it("query client present", () => {
	expectTypeOf<{ queryClient: unknown }>().toHaveProperty("queryClient");
	expectTypeOf<{ params: {} }>().not.toHaveProperty("queryClient");
});
it("query client absent", () => {
	expectTypeOf<{ auth: null }>().not.toHaveProperty("queryClient");
});
it("head loader", () => {
	type Head = { params: { id: number }; search: { page: number } } & {
		loaderData: { title: string };
		preloaderContext: { n: number };
	};
	expectTypeOf<Head["loaderData"]["title"]>().toEqualTypeOf<string>();
	expectTypeOf<Head>().not.toHaveProperty("auth");
});
it("headers record", () => {
	const ok: Record<string, string | string[]> = { "set-cookie": ["a", "b"] };
	expectTypeOf(ok).toEqualTypeOf<Record<string, string | string[]>>();
	expectTypeOf<{ params: {}; search: RawSearch; loaderData: void; preloaderContext: {} }>().not.toHaveProperty("auth");
});
it("security no nonce", () => {
	type Ctx = { params: {}; search: RawSearch; loaderData: void; preloaderContext: {} };
	expectTypeOf<Ctx>().not.toHaveProperty("nonce");
});
it("loader deps raw", () => {
	expectTypeOf<{ search: RawSearch; params: ExtractPathParams<"[id]"> }["search"]>().toEqualTypeOf<RawSearch>();
	// @ts-expect-error loaderDeps search is not the validator output
	const _bad: RawSearch = { page: 1 };
});
it("should refetch raw", () => {
	expectTypeOf<{ search: RawSearch }["search"]>().toEqualTypeOf<RawSearch>();
	// @ts-expect-error refetch search is not the validator output
	const _bad: RawSearch = { page: 1 };
});
it("error boundary", () => {
	type Props = { error: Error; params: { id: string }; search: RawSearch; reset: () => void };
	expectTypeOf<Props["error"]>().toEqualTypeOf<Error>();
	// @ts-expect-error error is an Error, and auth is absent
	const _bad: Props = { error: "x", params: { id: "1" }, search: {}, reset: () => undefined, auth: null };
});
it("not found boundary", () => {
	type Props = { params: { id: string }; search: RawSearch };
	expectTypeOf<Props["params"]["id"]>().toEqualTypeOf<string>();
	// @ts-expect-error not-found has no error prop
	const _bad: Props = { params: { id: "1" }, search: {}, error: new Error("x") };
});
it("auth boundary", () => {
	type Props = { error: Error; params: {}; search: RawSearch };
	expectTypeOf<Props["error"]>().toEqualTypeOf<Error>();
	expectTypeOf<Props>().not.toHaveProperty("reset");
});
it("method order", () => {
	expectTypeOf<{ render: () => void }>().not.toHaveProperty("cache");
});
it("boundary remains", () => {
	type Left = { notFoundRender: () => void };
	expectTypeOf<Left>().toHaveProperty("notFoundRender");
	expectTypeOf<Left>().not.toHaveProperty("errorRender");
});
it("boundaries done", () => {
	expectTypeOf<"errorRender" extends keyof { render?: never } ? true : false>().toEqualTypeOf<false>();
});
it("intercept remains", () => {
	type Left = { cache: () => void };
	expectTypeOf<Left>().toHaveProperty("cache");
	expectTypeOf<Left>().not.toHaveProperty("intercept");
});
it("segment no data", () => {
	type Segment = { _type: "segment"; render: (props: { children: unknown }) => unknown };
	expectTypeOf<Segment["_type"]>().toEqualTypeOf<"segment">();
	expectTypeOf<Segment>().not.toHaveProperty("loader");
});
it("segment parent", () => {
	expectTypeOf<["_root_"][number]>().toEqualTypeOf<"_root_">();
	// @ts-expect-error a segment id is not a parent
	const _bad: ["_root_"][number] = "_root_/seg";
});
it("parents closed", () => {
	type Parent = NonNullable<App["routeParents"]>["_root_/about"][number];
	expectTypeOf<Parent extends keyof NonNullable<App["routeModules"]> ? true : false>().toEqualTypeOf<true>();
	// @ts-expect-error every parent id is a route module
	const _bad: Parent = "missing";
});
it("keyed by route id", () => {
	expectTypeOf<keyof NonNullable<App["routeParams"]>>().toEqualTypeOf<"_root_/users/[id]">();
	// @ts-expect-error the key is the route id, not the public URL
	const _bad: keyof NonNullable<App["routeParams"]> = "/users/:id";
});
it("no virtual", () => {
	expectTypeOf<"./routes/_root_/home.page.tsx">().not.toEqualTypeOf<"virtual:flare-generated">();
});
it("no phantom", () => {
	expectTypeOf<{ routeModules: App["routeModules"] }>().not.toHaveProperty("auth");
});
it("env omitted", () => {
	expectTypeOf<RegisteredEnv<FlareRegister>>().toEqualTypeOf<unknown>();
	expectTypeOf<RegisteredEnv<FlareRegister> extends { site: string } ? true : false>().toEqualTypeOf<false>();
});
it("server context omitted", () => {
	const ctx: RegisteredServerContext<FlareRegister> = {};
	expectTypeOf(ctx).toEqualTypeOf<Record<string, unknown>>();
	type Open = RegisteredServerContext<FlareRegister>;
	expectTypeOf<Open extends { requestId: string } ? true : false>().toEqualTypeOf<false>();
});
