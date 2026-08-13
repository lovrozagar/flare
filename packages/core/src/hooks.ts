import type { Accessor } from "solid-js"
import type { ExtractT, Translator } from "./i18n/index.ts"
import { useRouter } from "./outlet/index.tsx"
import type { BlockerState, ClientMatch, FlareRouter, ProviderLocation } from "./outlet/types.ts"
import type {
	RouteLoaderData,
	RoutePathParams,
	RoutePreloaderContext,
	RouteSearchParams,
	RouteVirtualPaths,
} from "./route-builder/register.ts"

export function useBlocker(when: () => boolean): BlockerState {
	return useRouter().useBlocker(when)
}

export function useLoaderData<TPath extends RouteVirtualPaths>(options: {
	from: TPath
}): Accessor<RouteLoaderData<TPath>> {
	return useRouter().useLoaderData(options)
}

export function useLoaderT<TPath extends RouteVirtualPaths>(options: {
	from: TPath
}): Translator<ExtractT<RouteLoaderData<TPath>>> {
	return useRouter().useLoaderT(options)
}

export function useLocation(): Accessor<ProviderLocation> {
	return useRouter().location
}

export function useMatch(options: { from: RouteVirtualPaths }): Accessor<ClientMatch | undefined> {
	return useRouter().useMatch(options)
}

export function useNavigate(): FlareRouter["navigate"] {
	return useRouter().navigate
}

export function useParams<TPath extends RouteVirtualPaths>(options: {
	from: TPath
}): Accessor<RoutePathParams<TPath>> {
	return useRouter().useParams(options)
}

export function usePreloaderContext<TPath extends RouteVirtualPaths>(options: {
	from: TPath
}): Accessor<RoutePreloaderContext<TPath>> {
	return useRouter().usePreloaderContext(options)
}

export function usePreloaderT<TPath extends RouteVirtualPaths>(options: {
	from: TPath
}): Translator<ExtractT<RoutePreloaderContext<TPath>>> {
	return useRouter().usePreloaderT(options)
}

export function useSearch<TPath extends RouteVirtualPaths>(options: {
	from: TPath
}): Accessor<RouteSearchParams<TPath>> {
	return useRouter().useSearch(options)
}
