import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { clientSources, scanFiles, scanSource, type Finding } from "./browser-floor.ts";

// The browser floor (decision B123, BUGS.md 123.4): every browser API a client-reachable source uses works in Chrome and
// Edge 111, Firefox 114, and Safari 16.4, per @mdn/browser-compat-data. The e2e `node-prod-floor` project proves the
// APIs it deletes have fallbacks. This test catches the ones nobody listed.

const core = join(import.meta.dirname, "../..");

// A finding the scanner cannot tell from a real use: the line is the source line that shows why it is safe, and it must
// still be in the file. A feature-checked use names its guard here the same way.
const ALLOWED: readonly { file: string; api: string; line: string; why: string }[] = [
	{
		file: "src/shared/components/view-transition-boundary.tsx",
		api: ".toArray",
		line: "const resolved = children(() => props.children);",
		why: "Solid's children() helper's own toArray, not an Iterator helper",
	},
	{
		file: "src/client/navigation/navigate.ts",
		api: ".navigation",
		line: "const end = deps.navigation.begin();",
		why: "NavigatorDeps' pending-state tracker, not the Navigation API",
	},
];

const allowed = (finding: Finding): boolean =>
	ALLOWED.some((entry) => entry.file === finding.file && entry.api === finding.api);

it("floor", () => {
	const findings = scanFiles(core, clientSources(core));
	expect(
		findings.filter((finding) => !allowed(finding)).map(({ file, line, api }) => `${file}:${line} ${api}`),
	).toEqual([]);
	// Each entry still matches a finding, and its proving line is still in its file.
	const stale = ALLOWED.filter((entry) => {
		const lines = readFileSync(join(core, entry.file), "utf8").split("\n");
		const matched = findings.some((finding) => finding.file === entry.file && finding.api === entry.api);
		return !matched || !lines.map((line) => line.trim()).includes(entry.line);
	});
	expect(stale.map((entry) => `${entry.file} ${entry.api}: ${entry.why}`)).toEqual([]);
});

// An unguarded `URL.parse` outside src fails the scan, so a use nobody listed in the e2e floor is still caught.
it("planted URL.parse", () => {
	expect(scanFiles(core, ["tests/structure/browser-floor.fixture.ts"])).toEqual([
		{ file: "tests/structure/browser-floor.fixture.ts", line: 4, api: "URL.parse" },
	]);
});

// Each rule, on one line apiece: what throws in a floor browser is found, and a feature check, a `?.`, a Map's own
// `values`, and a name the file declares are not.
it("each rule", () => {
	const source = [
		"export async function a(body: ReadableStream) { for await (const c of body) use(c); }",
		"export async function b(body: ReadableStream) { for await (const c of chunks(body)) use(c); }",
		"export const c = (body: ReadableStream) => body[Symbol.asyncIterator]();",
		"export const d = (s: Set<number>, t: Set<number>) => s.union(t);",
		"addEventListener('scrollend', () => undefined);",
		"export const e = navigator.connection.saveData;",
		"export const f = navigator.connection?.saveData;",
		"export const g = () => requestIdleCallback(() => undefined);",
		"export const h = typeof requestIdleCallback === 'function';",
		"export const i = [1].values().toArray();",
		"export const j = Promise.withResolvers();",
		"export const k = document.startViewTransition(() => undefined);",
		"export const l = new Map().values();",
		"const fetch = () => 1; export const m = fetch();",
		"export const n = [3, 1].toSorted();",
		"export const o = globalThis.navigation.navigate('/');",
		"export const p = (x: { navigation: number }) => x.navigation;",
	].join("\n");
	expect(scanSource("rules.ts", source).map(({ line, api }) => `${line} ${api}`)).toEqual([
		"1 for await over body",
		"3 Symbol.asyncIterator",
		"4 .union",
		"5 scrollend event",
		"6 navigator.connection",
		"8 requestIdleCallback",
		"10 .toArray",
		"11 Promise.withResolvers",
		"12 document.startViewTransition",
		"15 .toSorted",
		"16 navigation",
	]);
});
