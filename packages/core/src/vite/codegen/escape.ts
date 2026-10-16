// The one writer for a value generated code holds (BUGS.md 165). JSON escapes the quote, the backslash, and every
// control character, so a newline in a route folder name cannot end the string; U+2028 and U+2029 are escaped too,
// which JSON leaves raw, and `</` is written `<\/`, so the text stays inert inside a `<script>` as well.
export function codeLiteral(value: unknown): string {
	return JSON.stringify(value).replaceAll("\u2028", "\\u2028").replaceAll("\u2029", "\\u2029").replaceAll("</", "<\\/")
}

// A string's literal without its quotes, for a template that writes the quotes itself.
export function escapeSource(value: string): string {
	return codeLiteral(value).slice(1, -1)
}
