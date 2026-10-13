import { createServer } from "../server/lifecycle/create.ts";
import type { ServerOptions } from "../server/lifecycle/options.ts";
import type { FlareRegister, RegisterField } from "../shared/route-builder/register.ts";
import type { Router } from "../shared/router/create-router.ts";

export type TestServer = { fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> };

// The app's own `serverContext`, and nothing else: required when the register declares it, so its loaders can call
// `serverCtx()`, and optional otherwise (dx/testing.md, BUGS.md B25).
export type TestOptions<R extends FlareRegister = FlareRegister> = Pick<ServerOptions<R>, "serverContext">;

type TestArgs<R extends FlareRegister> =
	unknown extends RegisterField<R, "serverContext"> ? [options?: TestOptions<R>] : [options: TestOptions<R>];

// A relative path is resolved here, since the helper listens on no port.
const ORIGIN = "http://localhost";

// `createServer({ router, serverContext })` for an app's tests (dx/testing.md). A test that needs `site`, `store`,
// `authenticate`, or `locale` builds its own server, so another key throws instead of being half-honored.
export function createTestServer<R extends FlareRegister = FlareRegister>(
	router: Router,
	...args: TestArgs<R>
): TestServer {
	const options: object = args[0] ?? {};
	const other = Object.keys(options).find((key) => key !== "serverContext");
	if (args.length > 1 || other !== undefined) {
		throw new Error(`createTestServer takes { serverContext } only, not ${other ?? "a third argument"}`);
	}
	// The options are the register's own `serverContext`, so the whole is that register's ServerOptions.
	const server = createServer({ router, ...options } as ServerOptions<R>);
	return {
		fetch(input, init) {
			const target = input instanceof Request ? input : new URL(String(input), ORIGIN);
			return server.fetch(new Request(target, init));
		},
	};
}
