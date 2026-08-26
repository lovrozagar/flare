import type { RouteParamsProps, RoutePaths, RouteSearchProps } from "../route-builder/register.ts";
import { buildUrl } from "../url/index.ts";

/* Internal type for RedirectResponse constructor — accepts already-resolved URLs */
type RawRedirectOptions =
	| { href: string; replace?: boolean; status?: number }
	| { replace?: boolean; status?: number; to: string };

/* Public type — route-typed like <Link> when FlareRegister is augmented */
export type RedirectOptions<TPath extends RoutePaths = RoutePaths> =
	| { href: string; replace?: boolean; status?: number }
	| ({ replace?: boolean; status?: number; to: TPath } & RouteParamsProps<TPath> & RouteSearchProps<TPath>);

export type FlattenedError = {
	fieldErrors: Record<string, string[]>;
	formErrors: string[];
};

export class NotFoundError extends Error {
	readonly name = "NotFoundError" as const;
	readonly status = 404 as const;
	readonly pathname?: string;

	constructor(message?: string, pathname?: string) {
		super(message ?? "Not found");
		this.pathname = pathname;
	}
}

export class UnauthenticatedError extends Error {
	readonly name = "UnauthenticatedError" as const;
	readonly status = 401 as const;

	constructor(message?: string) {
		super(message ?? "Unauthorized");
	}
}

export class UnauthorizedError extends Error {
	readonly name = "UnauthorizedError" as const;
	readonly status = 403 as const;

	constructor(message?: string) {
		super(message ?? "Forbidden");
	}
}

const SAFE_PROTOCOLS = new Set(["http:", "https:"]);
const SENTINEL_ORIGIN = "https://flare.invalid";
const HAS_SCHEME = /^[a-zA-Z][a-zA-Z+\-.]*:/;

/**
 * Allowlist-based redirect URL validation using the URL constructor.
 * Lets the platform's URL parser handle encoding, backslash normalization,
 * and unicode instead of a regex blocklist that can be bypassed.
 *
 * Protocol-relative (`//host`) is not a same-origin path — `startsWith("/")`
 * would treat it as one. Internal `to` must stay on the sentinel origin.
 */
function validateRedirectUrl(raw: string, mode: "internal" | "external"): string {
	if (/[\0\r\n]/.test(raw)) {
		throw new Error(`Unsafe redirect URL: ${raw}`);
	}

	let parsed: URL;
	try {
		parsed = new URL(raw, SENTINEL_ORIGIN);
	} catch {
		throw new Error(`Unsafe redirect URL: ${raw}`);
	}

	if (!SAFE_PROTOCOLS.has(parsed.protocol)) {
		throw new Error(`Unsafe redirect URL: ${raw}`);
	}

	const sameOrigin = parsed.origin === SENTINEL_ORIGIN;
	if (mode === "internal") {
		let decodedPath = parsed.pathname;
		try {
			decodedPath = decodeURIComponent(parsed.pathname);
		} catch {
			/* keep pathname */
		}
		if (
			!sameOrigin ||
			!raw.startsWith("/") ||
			raw.startsWith("//") ||
			raw.includes("\\") ||
			parsed.pathname.startsWith("//") ||
			decodedPath.includes("\\") ||
			decodedPath.startsWith("//")
		) {
			throw new Error(`Unsafe redirect URL: ${raw}`);
		}
		return `${parsed.pathname}${parsed.search}${parsed.hash}`;
	}

	if (!sameOrigin && !HAS_SCHEME.test(raw.trimStart())) {
		throw new Error(`Unsafe redirect URL: ${raw}`);
	}

	return raw;
}

export class RedirectResponse extends Error {
	readonly name = "RedirectResponse" as const;
	readonly url: string;
	readonly external: boolean;
	readonly status: number;
	readonly replace: boolean;

	constructor(options: RawRedirectOptions) {
		super("Redirect");
		if ("href" in options) {
			this.url = validateRedirectUrl(options.href, "external");
			this.external = true;
		} else {
			this.url = validateRedirectUrl(options.to, "internal");
			this.external = false;
		}
		this.status = options.status ?? 303;
		this.replace = options.replace ?? true;
	}
}

export class NavigationError extends Error {
	readonly name = "NavigationError" as const;
}

export class ServerFnValidationError extends Error {
	readonly name = "ServerFnValidationError" as const;
	readonly errors: FlattenedError;

	constructor(errors: FlattenedError) {
		super(errors.formErrors?.length ? errors.formErrors.join(", ") : "Validation error");
		this.errors = errors;
	}
}

export function notFound(message?: string): never {
	throw new NotFoundError(message);
}

export function unauthenticated(message?: string): never {
	throw new UnauthenticatedError(message);
}

export function unauthorized(message?: string): never {
	throw new UnauthorizedError(message);
}

export function redirect<TPath extends RoutePaths>(options: RedirectOptions<TPath>): never;
export function redirect(options: {
	href?: string;
	params?: Record<string, unknown>;
	replace?: boolean;
	search?: Record<string, unknown>;
	status?: number;
	to?: string;
}): never {
	if (options.href !== undefined) {
		throw new RedirectResponse({
			href: options.href,
			replace: options.replace,
			status: options.status,
		});
	}
	if (options.to === undefined) {
		throw new Error("redirect() requires either 'to' or 'href'");
	}
	/* Validate the raw path before buildUrl collapses leading slashes (`//host` → `/host`) */
	validateRedirectUrl(options.to, "internal");
	const url = buildUrl({ params: options.params, search: options.search, to: options.to });
	throw new RedirectResponse({ replace: options.replace, status: options.status, to: url });
}

/* Name-based guards work across realms and with reconstructed errors */
export function isNotFoundError(e: unknown): e is NotFoundError {
	return e instanceof Error && e.name === "NotFoundError";
}

export function isUnauthenticatedError(e: unknown): e is UnauthenticatedError {
	return e instanceof Error && e.name === "UnauthenticatedError";
}

export function isUnauthorizedError(e: unknown): e is UnauthorizedError {
	return e instanceof Error && e.name === "UnauthorizedError";
}

export function isRedirectResponse(e: unknown): e is RedirectResponse {
	return e instanceof Error && e.name === "RedirectResponse";
}

export function isNavigationError(e: unknown): e is NavigationError {
	return e instanceof Error && e.name === "NavigationError";
}

export function isServerFnValidationError(e: unknown): e is ServerFnValidationError {
	return e instanceof Error && e.name === "ServerFnValidationError";
}
