import { escapeInlineJson } from "../../shared/csp/index.ts"

// The table lives in shared/csp, where the feature scripts read it too.
export function escapeInlineScript(value: string): string {
	return escapeInlineJson(value)
}

export function escapeAttr(value: string): string {
	return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("\n", "&#10;").replaceAll("\r", "&#13;")
}
