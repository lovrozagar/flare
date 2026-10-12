export type NodeIncoming = {
	url: string;
	headers?: Record<string, string | undefined>;
	socketAddress?: string;
	trustProxy?: number;
	router?: () => void;
};

export type AdaptedRequest = {
	status: number;
	secure: boolean;
	clientIp: string;
	resolvedOrigin: string;
	url: string;
};

export function toRequest(input: NodeIncoming): AdaptedRequest {
	const headers = input.headers ?? {};
	void input.router;
	if (badTarget(input.url)) return rejected();
	const hops = input.trustProxy ?? 0;
	const socket = input.socketAddress ?? "";
	const secure = hops > 0 && headers["x-forwarded-proto"] === "https";
	const origin = `${secure ? "https" : "http"}://${headers["host"] ?? "localhost"}`;
	return {
		status: 200,
		secure,
		clientIp: clientIp(headers["x-forwarded-for"], hops, socket),
		resolvedOrigin: origin,
		url: `${origin}${input.url}`,
	};
}

function rejected(): AdaptedRequest {
	return { status: 400, secure: false, clientIp: "", resolvedOrigin: "", url: "" };
}

function badTarget(url: string): boolean {
	if (url.startsWith("//")) return true;
	if (url.includes("\\")) return true;
	if (url.includes("://")) return true;
	return hasControl(url);
}

function hasControl(url: string): boolean {
	for (const char of url) {
		if (char.charCodeAt(0) < 32) return true;
	}
	return false;
}

function clientIp(forwarded: string | undefined, hops: number, socket: string): string {
	const parts = forwarded ? forwarded.split(",").map((part) => part.trim()) : [];
	if (hops > 0 && parts.length >= hops) return parts[parts.length - hops] as string;
	return socket;
}
