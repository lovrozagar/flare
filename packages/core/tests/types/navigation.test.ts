import { expectTypeOf, it } from "vitest";
import type { useLocation, useMatch } from "../../src/shared/components/outlet-nodes.ts";
import type {
	From,
	LoaderDataFrom,
	ParamsFrom,
	PropagationApp as App,
	RawSearch,
	SearchFrom,
} from "../../src/shared/route-builder/register.ts";
import type { Navigate } from "../../src/shared/router/context.ts";

// The dx/types.md matrix rows whose consumer is a data hook or `useNavigate()`. The other rows are in
// `propagation.test.ts`.
const hook: (args: { from: From<App> }) => void = () => undefined;
const go: Navigate<App> = async () => undefined;

it("hook from", () => {
	expectTypeOf(hook).toBeFunction();
	expectTypeOf<ParamsFrom<App, "_root_/users/[id]">>().toEqualTypeOf<{ id: number }>();
	expectTypeOf<SearchFrom<App, "_root_/about">>().toEqualTypeOf<{ page: number }>();
	expectTypeOf<SearchFrom<App, "_root_/users/[id]">>().toEqualTypeOf<RawSearch>();
	hook({ from: "_root_/about" });
	// @ts-expect-error from is required
	hook();
});
it("hook unknown", () => {
	expectTypeOf(hook).toBeFunction();
	// @ts-expect-error an unknown id is rejected
	hook({ from: "nope" });
	// @ts-expect-error an unknown id has no loader data
	expectTypeOf<LoaderDataFrom<App, "nope">>().toBeNever();
});
it("use match untyped", () => {
	type Match = ReturnType<typeof useMatch>;
	expectTypeOf<Match>().toEqualTypeOf<{ readonly id: string; readonly routeId: string }>();
	// @ts-expect-error params are not on the untyped match
	const _bad: Match = { id: "a", routeId: "a", params: {} };
});
it("use location raw", () => {
	expectTypeOf<ReturnType<typeof useLocation>["search"]>().toEqualTypeOf<RawSearch>();
	expectTypeOf<ReturnType<typeof useLocation>["params"]>().toEqualTypeOf<RawSearch>();
	// @ts-expect-error location search is not a validator output
	const _bad: ReturnType<typeof useLocation>["search"] = { page: 1 };
});
it("use navigate", () => {
	expectTypeOf(go).not.toEqualTypeOf<(to: string) => Promise<void>>();
	void go({ to: "_root_/users/[id]", params: { id: 1 }, scroll: false });
	// @ts-expect-error params are required
	void go({ to: "_root_/users/[id]" });
	// @ts-expect-error a layout is not a target
	void go({ to: "_root_/layout" });
});
