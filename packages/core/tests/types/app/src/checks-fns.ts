// The dx/types.md `app` rows for the hooks, server functions, and the path segment. See checks.ts.
import {
	createPathSegment,
	useLoaderData,
	useLocation,
	useMatch,
	useParams,
	usePreloaderContext,
	useSearch,
} from "@lovrozagar/flare";
import { createServerFn } from "@lovrozagar/flare/server-fn";
import { echo, measure, ticks } from "./fns/echo.ts";

// server fn auth null
{
	void createServerFn().handler((ctx) => {
		const auth: null = ctx.auth;
		// @ts-expect-error skipping authenticate is null, not the session
		void ctx.auth.userId;
		return auth;
	});
}

// server fn auth required
{
	void createServerFn()
		.authenticate()
		.handler((ctx) => ctx.auth.userId.length);
	// @ts-expect-error authenticate takes no argument
	void createServerFn().authenticate("user");
}

// hook from
{
	void [
		useLoaderData({ from: "_root_/about" }),
		useParams({ from: "_root_/about" }),
		useSearch({ from: "_root_/about" }),
		usePreloaderContext({ from: "_root_/about" }),
		useMatch({ from: "_root_/about" }),
	];
	// @ts-expect-error from is required
	void useLoaderData();
}

// hook unknown
{
	// @ts-expect-error an unknown id is rejected
	void useLoaderData({ from: "nope" });
}

// use match untyped
{
	const match: { readonly id: string; readonly routeId: string } = useMatch({ from: "_root_/users/[id]" });
	void match;
	// @ts-expect-error the match has no typed params
	void useMatch({ from: "_root_/users/[id]" }).params;
	// @ts-expect-error the match has no loader data
	void useMatch({ from: "_root_/users/[id]" }).loaderData;
}

// use location raw
{
	const search: Record<string, string | string[]> = useLocation().search;
	void search;
	// @ts-expect-error the location search is not a validator output
	const _typed: { q: string; page?: number } = useLocation().search;
}

// server fn input
{
	const reply: Promise<{ q: string; secret: string }> = echo({ q: "a" });
	const doubled: Promise<number> = measure("text");
	void [reply, doubled];
	// @ts-expect-error a fresh extra key
	void echo({ q: "a", extra: 1 });
	// @ts-expect-error the argument is required
	void echo();
	// @ts-expect-error the transforming validator takes its input, a string
	void measure(4);
}

// server fn input void
{
	const ping = createServerFn().handler((ctx) => ctx.input);
	const none: Promise<undefined> = ping();
	void none;
	// @ts-expect-error a void input takes no argument
	void ping({ q: "a" });
}

// server fn return
{
	const secret: Promise<string> = echo({ q: "a" }).then((reply) => reply.secret);
	void secret;
	// @ts-expect-error the client sees the handler's value, not the envelope
	void echo({ q: "a" }).then((reply) => reply.data);
}

// server fn stream
{
	const chunks: AsyncIterable<{ n: number }> = ticks();
	void chunks;
	void createServerFn().stream(async function* (ctx) {
		// @ts-expect-error a stream context has no revalidate
		yield ctx.revalidate;
	});
	// @ts-expect-error a handler context has no signal
	void createServerFn().handler((ctx) => ctx.signal);
}

// segment no data
{
	const record = createPathSegment("_root_/seg").cache({ cdn: { maxAge: "1m" } });
	const kind: "segment" = record._type;
	const rendered = record.render({ children: "child" });
	void [kind, rendered];
	// @ts-expect-error a segment has no loader
	void createPathSegment("_root_/seg").loader;
	// @ts-expect-error a segment has no preloader
	void createPathSegment("_root_/seg").preloader;
	// @ts-expect-error a segment has no authenticate
	void createPathSegment("_root_/seg").authenticate;
	// @ts-expect-error a segment has no input
	void createPathSegment("_root_/seg").input;
	// @ts-expect-error a segment has no head
	void createPathSegment("_root_/seg").head;
}
