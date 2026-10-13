import { getRequestEvent, type RequestEvent } from "@solidjs/web";
import { provideRequestEvent } from "@solidjs/web/storage";
import type { LocaleConfig } from "../../shared/router/index.ts";

export type ScopeKind = "loader" | "preloader";

type RawParams = Readonly<Record<string, string | string[]>>;

// What a run gives its loaders and preloaders: the request's raw params and the router's locale config.
export type ScopeSource = { params?: RawParams | undefined; locale?: LocaleConfig | undefined };

// The function running now. i18n's useLoaderT and usePreloaderT read it, so core imports no feature.
export type LoaderScope = { kind: ScopeKind; params: RawParams; locale: LocaleConfig | undefined };

type ScopedEvent = RequestEvent & { flareLoader: LoaderScope };

// Runs one loader or preloader call under a child of the request event. The child inherits everything the request
// carries, serverCtx() included, and Solid's async-local storage keeps each call's scope apart across awaits. Once
// the call returns, the request event is the parent again. Outside a request the call runs with no scope. A top-level
// write to the event inside the scope lands on the child and is gone after that call, so nothing caches on the event
// from a loader. A nested object is the parent's, shared by reference.
export function inLoaderScope<T>(kind: ScopeKind, source: ScopeSource, run: () => T): T {
	const parent: RequestEvent | undefined = getRequestEvent();
	if (parent === undefined) return run();
	const child: ScopedEvent = Object.assign(Object.create(parent), {
		flareLoader: { kind, params: source.params ?? {}, locale: source.locale },
	});
	return provideRequestEvent(child, run);
}

// The scope of the call running now, as a feature hook reads it. Undefined outside a loader or preloader.
export function loaderScope(): LoaderScope | undefined {
	const event: RequestEvent | undefined = getRequestEvent();
	return scoped(event) ? event.flareLoader : undefined;
}

// The field is written only by inLoaderScope.
function scoped(event: RequestEvent | undefined): event is ScopedEvent {
	return event !== undefined && "flareLoader" in event;
}
