/**
 * Resolve Solid 2 JSX / context-provider output into a string.
 *
 * Context providers return a lazy `children()` memo. Tests that mock
 * `renderToStream` as `String(factory())` otherwise serialize that memo as
 * `function () { [native code] }`.
 */
export function unwrapJsx(node: unknown, depth = 0): string {
	if (node == null || depth > 40) return "";
	if (typeof node === "string" || typeof node === "number" || typeof node === "boolean") {
		return String(node);
	}
	if (typeof node === "function") {
		try {
			return unwrapJsx((node as () => unknown)(), depth + 1);
		} catch {
			return "";
		}
	}
	if (Array.isArray(node)) {
		return node.map((n) => unwrapJsx(n, depth + 1)).join("");
	}
	if (typeof node === "object") {
		const rec = node as Record<string, unknown>;
		if (typeof rec.t === "string") return rec.t;
		if (typeof rec.outerHTML === "string") return rec.outerHTML;
		if (typeof rec.textContent === "string" && rec.textContent.length > 0) return rec.textContent;
	}
	return "";
}
