import { defined } from "../errors/defined.ts"

// A catch-all value is its raw segments joined with "/", as the URL holds them. `%`, `&`, and `=` inside a value are
// percent-encoded, so a value that holds them cannot read as another param (plan 21 7.8). `search` is `searchKey`'s
// text, so every spelling of one value set is one id (B31).
export function matchId(params: Readonly<Record<string, string | readonly string[]>>, search: string): string {
	const body = Object.keys(params)
		.sort()
		.map((key) => {
			const value = defined(params[key], "the param")
			return `${key}=${typeof value === "string" ? text(value) : value.map(text).join("/")}`
		})
		.join("&")
	return `${body}&${search}`
}

function text(value: string): string {
	return value.replaceAll("%", "%25").replaceAll("&", "%26").replaceAll("=", "%3D")
}
