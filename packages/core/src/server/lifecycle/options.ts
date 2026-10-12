import type {
	FlareRegister,
	RegisterField,
	RegisteredEnv,
	RegisteredServerContext,
} from "../../shared/route-builder/register.ts";
import type { Router } from "../../shared/router/create-router.ts";
import type { Caller } from "../auth/caller.ts";
import type { ServerContextInput } from "../context/ctx.ts";
import type { SecurityConfig } from "../security/apply.ts";
import type { ServerFns } from "../server-fn/dispatch.ts";

export type Authenticate = (ctx: { request: Request; env: unknown } & Caller) => unknown;

type BaseOptions = {
	router: Router;
	authenticate?: Authenticate;
	security?: SecurityConfig | ((ctx: { nonce: string }) => SecurityConfig);
	// Hosts whose `Sec-Fetch-Site: same-site` a server function accepts (B44).
	sameSite?: readonly string[];
	// The server function POST cap in bytes. 1 MiB when omitted.
	bodyLimit?: number;
	// From src/_gen/server-fns.gen.ts. Without it every `/_flare/fn/<id>` is 404.
	serverFns?: ServerFns;
	documentResponseDefer?: "stream" | "buffer";
};

type ContextFn<R extends FlareRegister> = (ctx: {
	request: Request;
	env: RegisteredEnv<R>;
}) => RegisteredServerContext<R>;

// Required once the app's FlareRegister declares serverContext (B75).
type ContextOption<R extends FlareRegister> =
	unknown extends RegisterField<R, "serverContext">
		? { serverContext?: ContextFn<R> }
		: { serverContext: ContextFn<R> };

export type ServerOptions<R extends FlareRegister = FlareRegister> = BaseOptions & ContextOption<R>;

export type RuntimeOptions = BaseOptions & { serverContext?: ServerContextInput["serverContext"] };

export type FlareServer = {
	fetch: (request: Request, env?: unknown) => Promise<Response>;
};
