import type { JSX } from "solid-js";
import type {
	ClientErrorRenderProps,
	ClientNotFoundRenderProps,
	ClientUnauthenticatedRenderProps,
	ClientUnauthorizedRenderProps,
	RenderProps,
} from "../outlet/types.ts";
import type { SearchParams } from "../url/index.ts";

export interface LocationSnapshot {
	hash: string;
	params: Record<string, string | string[]>;
	pathname: string;
	search: SearchParams;
}

export interface EffectsConfig {
	loaderDeps?: (ctx: { search: SearchParams }) => unknown[];
	shouldRefetch?: (ctx: {
		location: { current: LocationSnapshot; next: LocationSnapshot };
		trigger: string;
	}) => boolean;
}

export interface LoadedRouteModule {
	_type: "layout" | "render" | "root-layout";
	effectsConfig?: EffectsConfig;
	errorRender?: (props: ClientErrorRenderProps) => JSX.Element;
	notFoundRender?: (props: ClientNotFoundRenderProps) => JSX.Element;
	cache?: {
		client?:
			| {
					cacheDeferred?: boolean;
					gcTime?: number;
					prefetchGcTime?: number;
					prefetchStaleTime?: number;
					staleTime?: number;
			  }
			| false;
	};
	render: (props: RenderProps) => JSX.Element;
	unauthenticatedRender?: (props: ClientUnauthenticatedRenderProps) => JSX.Element;
	unauthorizedRender?: (props: ClientUnauthorizedRenderProps) => JSX.Element;
	variablePath: string;
	virtualPath: string;
}

export interface LoadedRouteModules {
	layouts: LoadedRouteModule[];
	page: LoadedRouteModule;
	params: Record<string, string | string[]>;
}

export type LoadRouteModulesFn = (
	pathname: string,
	routeTree: unknown,
	layouts: Record<string, () => Promise<{ default: unknown }>>,
) => Promise<LoadedRouteModules>;
