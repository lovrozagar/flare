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

// Solid owns the request event (B1). Its AsyncLocalStorage keeps the value across awaits and apart from a
// concurrent request, which a module slot cannot.
export function withServerContext<T>(input: ServerContextInput, run: () => Promise<T>): Promise<T> {
	const value =
		input.serverContext === undefined ? {} : input.serverContext({ request: input.request, env: input.env });
	const event = Object.assign(createRequestEvent(input.request), { flareServerContext: value });
	return new Promise<T>((resolve, reject) => {
		provideRequestEvent(event, () => run().then(resolve, reject));
	});
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
