// The methods a `.response()` page may declare. HEAD follows GET and is not declared (plan 21 13.5). Only codegen and
// the server check a list, so no client bundle carries this.
const RESPONSE_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])

export const METHODS_RULE = "methods is a non-empty array of GET, POST, PUT, PATCH, DELETE, or OPTIONS, each once"

export function isMethodList(value: unknown): value is string[] {
	if (!Array.isArray(value) || value.length === 0 || new Set(value).size !== value.length) return false
	return value.every((item) => typeof item === "string" && RESPONSE_METHODS.has(item))
}
