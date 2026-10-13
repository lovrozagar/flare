import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { escapeInlineJson } from "../../shared/csp/index.ts";
import { escapeAttr, escapeInlineScript } from "./escape.ts";

const corpus = readFileSync(new URL("./escape.corpus.txt", import.meta.url), "utf8");

function row(name: string): string {
	const line = corpus.split("\n").find((item) => item.startsWith(`${name}\t`)) ?? "";
	return line
		.slice(name.length + 1)
		.replaceAll("\\u2028", "\u2028")
		.replaceAll("\\u2029", "\u2029")
		.replaceAll("\\n", "\n");
}

it("script close", () => {
	const escaped = escapeInlineScript(row("script close"));
	expect(escaped.toLowerCase().includes("</script")).toBe(false);
});

it("dollar brace", () => {
	const raw = row("dollar brace");
	const escaped = escapeInlineScript(raw);
	expect(escaped.includes("`")).toBe(false);
	expect(Function(`return \`${escaped}\``)()).toBe(raw);
});

it("line separator", () => {
	const raw = row("line separator");
	const escaped = escapeInlineJson(raw);
	expect(escaped.includes("\u2028")).toBe(false);
	expect(escaped.includes("\u2029")).toBe(false);
	expect(Function(`return \`${escaped}\``)()).toBe(raw);
});

it("attr quote", () => {
	const escaped = escapeAttr(row("attr quote"));
	expect(escaped.includes('"')).toBe(false);
	expect(escaped.includes("\n")).toBe(false);
	expect(escaped).toBe("&quot;&#10;");
});
