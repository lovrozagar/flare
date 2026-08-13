import type { UnauthenticatedError, UnauthorizedError } from "../errors/index.ts"
import type { Location } from "../router-primitives/types.ts"

export interface ErrorRenderProps<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
> {
	error: Error
	location: Location<TParams, TSearch>
	reset: () => void
	retry: () => void
}

export interface NotFoundRenderProps<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
> {
	location: Location<TParams, TSearch>
}

export interface UnauthenticatedRenderProps<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
> {
	error: UnauthenticatedError
	location: Location<TParams, TSearch>
	retry: () => void
}

export interface UnauthorizedRenderProps<
	TParams = Record<string, string>,
	TSearch = Record<string, string>,
> {
	error: UnauthorizedError
	location: Location<TParams, TSearch>
	retry: () => void
}

export interface GlobalBoundaries {
	error?: (props: ErrorRenderProps) => unknown
	notFound?: (props: NotFoundRenderProps) => unknown
	unauthenticated?: (props: UnauthenticatedRenderProps) => unknown
	unauthorized?: (props: UnauthorizedRenderProps) => unknown
}

export type ErrorRenderFn = (props: Record<string, unknown>) => unknown
export type NotFoundRenderFn = (props: Record<string, unknown>) => unknown
export type UnauthenticatedRenderFn = (props: Record<string, unknown>) => unknown
export type UnauthorizedRenderFn = (props: Record<string, unknown>) => unknown

export interface BoundaryRoute {
	errorRender?: ErrorRenderFn
	notFoundRender?: NotFoundRenderFn
	unauthenticatedRender?: UnauthenticatedRenderFn
	unauthorizedRender?: UnauthorizedRenderFn
	virtualPath: string
}

/**
 * Walk up the route chain from errorRouteIndex to find an errorRender.
 * errorRender on a route catches that route's OWN errors.
 */
export function findErrorBoundary(
	routes: BoundaryRoute[],
	errorRouteIndex: number,
): ErrorRenderFn | null {
	for (let i = errorRouteIndex; i >= 0; i--) {
		const route = routes[i]
		if (route?.errorRender) return route.errorRender
	}
	return null
}

/**
 * Walk up from the throwing route's PARENT to find a notFoundRender.
 * notFoundRender catches NotFoundError from CHILD routes, not its own.
 */
export function findNotFoundBoundary(
	routes: BoundaryRoute[],
	throwRouteIndex: number,
): NotFoundRenderFn | null {
	for (let i = throwRouteIndex - 1; i >= 0; i--) {
		const route = routes[i]
		if (route?.notFoundRender) return route.notFoundRender
	}
	return null
}

/**
 * Walk up the route chain to find an unauthenticatedRender.
 * Catches UnauthenticatedError (401).
 */
export function findUnauthenticatedBoundary(
	routes: BoundaryRoute[],
	errorRouteIndex: number,
): UnauthenticatedRenderFn | null {
	for (let i = errorRouteIndex; i >= 0; i--) {
		const route = routes[i]
		if (route?.unauthenticatedRender) return route.unauthenticatedRender
	}
	return null
}

/**
 * Walk up the route chain to find an unauthorizedRender.
 * Catches UnauthorizedError (403).
 */
export function findUnauthorizedBoundary(
	routes: BoundaryRoute[],
	errorRouteIndex: number,
): UnauthorizedRenderFn | null {
	for (let i = errorRouteIndex; i >= 0; i--) {
		const route = routes[i]
		if (route?.unauthorizedRender) return route.unauthorizedRender
	}
	return null
}
