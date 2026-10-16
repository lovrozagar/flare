import { forwardedHttps, validHost } from "../../shared/url/index.ts"

export type NodeIncoming = {
	url: string
	headers?: Record<string, string | undefined>
	socketAddress?: string
	trustProxy?: number
	router?: () => void
}

export type AdaptedRequest = {
	status: number
	secure: boolean
	clientIp: string
	resolvedOrigin: string
	url: string
}

export function toRequest(input: NodeIncoming): AdaptedRequest {
	const headers = input.headers ?? {}
	void input.router
	const target = whatwgPath(input.url)
	if (badTarget(target) || !validHost(headers["host"])) return rejected()
	const hops = input.trustProxy ?? 0
	const socket = input.socketAddress ?? ""
	const secure = forwardedHttps(hops, headers["x-forwarded-proto"])
	const origin = `${secure ? "https" : "http"}://${headers["host"] ?? "localhost"}`
	return {
		status: 200,
		secure,
		clientIp: clientIp(headers["x-forwarded-for"], hops, socket),
		resolvedOrigin: origin,
		url: `${origin}${target}`,
	}
}

function rejected(): AdaptedRequest {
	return { status: 400, secure: false, clientIp: "", resolvedOrigin: "", url: "" }
}

// A backslash in the path reads as `/`, as WHATWG's URL parser reads it and as Bun and Workers hand it to Flare, so a
// path is one answer on every runtime: `/a\b` is `/a/b`, and `/\a` is `//a`, which the rule below refuses (B22,
// BUGS.md 163). The query and fragment keep theirs.
function whatwgPath(url: string): string {
	const end = url.search(/[?#]/)
	const path = end === -1 ? url : url.slice(0, end)
	return path.replaceAll("\\", "/") + (end === -1 ? "" : url.slice(end))
}

// A target is a path in origin form: one that does not start with `/`, such as the absolute form `http://evil/`, is a
// 400, and so is `//`, which a URL parser reads as a host. A URL in the query, `?next=https://…`, is plain query
// text, served as Bun and Workers serve it (plan 21 3.14).
function badTarget(url: string): boolean {
	if (!url.startsWith("/") || url.startsWith("//")) return true
	return hasControl(url)
}

function hasControl(url: string): boolean {
	for (const char of url) {
		if (char.charCodeAt(0) < 32) return true
	}
	return false
}

function clientIp(forwarded: string | undefined, hops: number, socket: string): string {
	const parts = forwarded ? forwarded.split(",").map((part) => part.trim()) : []
	if (hops > 0 && parts.length >= hops) return parts[parts.length - hops] as string
	return socket
}
