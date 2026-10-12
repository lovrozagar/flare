import { createRequestEvent, getRequestEvent, type RequestEvent } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import type { FlareRegister, RegisteredServerContext } from "../../shared/route-builder/register.ts";

type ServerContext = RegisteredServerContext<FlareRegister>;

export type ServerContextInput = {
	request: Request;
	env: unknown;
	serverContext?: (ctx: { request: Request; env: unknown }) => unknown;
};

type ContextEvent = RequestEvent & { flareServerContext: ServerContext };

type Taken = { ok: true; value: unknown } | { ok: false; error: unknown };

// Solid owns the request event (B1). Its AsyncLocalStorage keeps the value across awaits and apart from a
// concurrent request, which a module slot cannot. A serverContext throw is answered by `fail` (500).
export function withServerContext<T>(
	input: ServerContextInput,
	run: () => Promise<T>,
	fail: (error: unknown) => T,
): Promise<T> {
	const taken = takeContext(input);
	if (!taken.ok) return Promise.resolve(fail(taken.error));
	const event = Object.assign(createRequestEvent(input.request), { flareServerContext: taken.value });
	return new Promise<T>((resolve, reject) => {
		provideRequestEvent(event, () => run().then(resolve, reject));
	});
}

function takeContext(input: ServerContextInput): Taken {
	if (input.serverContext === undefined) return { ok: true, value: {} };
	try {
		return { ok: true, value: input.serverContext({ request: input.request, env: input.env }) };
	} catch (error) {
		return { ok: false, error };
	}
}

export function serverCtx(): ServerContext {
	const event: RequestEvent | undefined = getRequestEvent();
	if (!carries(event)) throw new Error("serverCtx: called outside a request");
	return event.flareServerContext;
}

// The field is written only by withServerContext, from the registered serverContext function.
function carries(event: RequestEvent | undefined): event is ContextEvent {
	return event !== undefined && "flareServerContext" in event;
}
