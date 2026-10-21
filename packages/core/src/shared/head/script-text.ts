// A case-insensitive `</script` or `</style` in the text is rewritten so it cannot close the tag (B83), in its own
// spelling, so a JSON-LD value or a JS string reads back exactly (BUGS.md 143). In a script, `<!--` is rewritten too:
// followed by `<script`, it sends the parser into its double-escaped state, where the real `</script>` no longer
// closes the element (BUGS.md 427). How depends on the script's `type`, as the reader of its text parses it: in
// JavaScript `<\x21--` reads as `<!--` in a string, a template, and a regex with or without the `u` or `v` flag; JSON
// has no `\x`, so it gets `\u003c!--`; any other type is a data block whose syntax Flare cannot escape, so `<!--` in it
// throws, naming the type. The client sets text as a DOM property.
export function keepOpen(value: string, tag: "script" | "style", type?: string): string {
	const closed = value.replaceAll(new RegExp(`</(${tag})`, "gi"), "<\\/$1")
	if (tag === "style" || !closed.includes("<!--")) return closed
	const syntax = scriptSyntax(type)
	if (syntax === "data") {
		throw new Error(`head script type "${String(type)}" holds "<!--", which Flare cannot escape in that syntax`)
	}
	return closed.replaceAll("<!--", syntax === "json" ? "\\u003c!--" : "<\\x21--")
}

// HTML runs a script whose type, trimmed and in any case, is empty, `module`, or a JavaScript MIME type essence as
// written: one with parameters is a data block.
const JAVASCRIPT = new Set([
	"",
	"module",
	"application/ecmascript",
	"application/javascript",
	"application/x-ecmascript",
	"application/x-javascript",
	"text/ecmascript",
	"text/javascript",
	"text/javascript1.0",
	"text/javascript1.1",
	"text/javascript1.2",
	"text/javascript1.3",
	"text/javascript1.4",
	"text/javascript1.5",
	"text/jscript",
	"text/livescript",
	"text/x-ecmascript",
	"text/x-javascript",
])

// JSON blocks: `application/json` and any `+json` type, parameters aside, an import map, and speculation rules.
function scriptSyntax(type: string | undefined): "js" | "json" | "data" {
	const exact = (type ?? "").trim().toLowerCase()
	if (JAVASCRIPT.has(exact)) return "js"
	const essence = exact.replace(/;.*$/s, "").trim()
	const json = essence === "application/json" || essence.endsWith("+json")
	return json || essence === "importmap" || essence === "speculationrules" ? "json" : "data"
}
