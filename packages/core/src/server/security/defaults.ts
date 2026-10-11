export function defaultHeaders(url: string): Headers {
	const headers = new Headers();
	headers.set("X-Content-Type-Options", "nosniff");
	headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
	headers.set("X-Frame-Options", "DENY");
	headers.set("Cross-Origin-Opener-Policy", "same-origin");
	if (new URL(url).protocol === "https:") {
		headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
	}
	return headers;
}
