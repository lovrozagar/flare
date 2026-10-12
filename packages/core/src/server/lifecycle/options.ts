import type { FlareRegister, RegisteredEnv, RegisteredServerContext } from "../../shared/route-builder/register.ts";
import type { Router } from "../../shared/router/create-router.ts";
import type { Caller } from "../auth/caller.ts";
import type { ServerContextInput } from "../context/ctx.ts";
import type { SecurityConfig } from "../security/apply.ts";

export type Authenticate = (ctx: { request: Request; env: unknown } & Caller) => unknown;

type BaseOptions = {
	router: Router;
	authenticate?: Authenticate;
	security?: SecurityConfig | ((ctx: { nonce: string }) => SecurityConfig);
	documentResponseDefer?: "stream" | "buffer";
};

type ContextFn<R extends FlareRegister> = (ctx: {
	request: Request;
	env: RegisteredEnv<R>;
}) => RegisteredServerContext<R>;

// Required once the app's FlareRegister declares serverContext (B75).
type ContextOption<R extends FlareRegister> = unknown extends R["serverContext"]
	? { serverContext?: ContextFn<R> }
	: { serverContext: ContextFn<R> };

export type ServerOptions<R extends FlareRegister = FlareRegister> = BaseOptions & ContextOption<R>;

export type RuntimeOptions = BaseOptions & { serverContext?: ServerContextInput["serverContext"] };

export type FlareServer = {
	fetch: (request: Request, env?: unknown) => Promise<Response>;
};
