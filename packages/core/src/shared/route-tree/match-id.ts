import { defined } from "../errors/defined.ts";

// A catch-all value is its raw segments joined with "/", as the URL holds them.
export function matchId(params: Readonly<Record<string, string | readonly string[]>>, search: string): string {
	const body = Object.keys(params)
		.sort()
		.map((key) => {
			const value = defined(params[key], "the param");
			return `${key}=${typeof value === "string" ? value : value.join("/")}`;
		})
		.join("&");
	return `${body}&${search}`;
}
