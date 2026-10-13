import { encodeStatic, idPattern, patternSegments, type Segment } from "../route-tree/index.ts";
import type { Router } from "./create-router.ts";

// The path in the matched route's spelling (B22). A segment a static pattern segment consumed takes that segment's
// spelling. A locale param that equals a configured tag ignoring case takes the tag's spelling. Every other param
// value and percent-escape stays as sent. A path that matches no route is returned as it is: the router answers it.
export function foldCase(router: Pick<Router, "match" | "basePath" | "locale">, path: string): string {
	const matched = router.match(path);
	if (matched.id === undefined) return path;
	const base = router.basePath === "/" ? "" : router.basePath;
	const parts = path
		.slice(base.length)
		.split("/")
		.filter((part) => part !== "");
	const out: string[] = [];
	for (const segment of patternSegments(idPattern(matched.id))) {
		const taken = segment.kind === "static" ? 1 : count(matched.params[segment.name]);
		for (const part of parts.splice(0, taken)) out.push(spell(segment, part, router.locale));
	}
	if (out.length === 0) return path;
	return `${base}/${out.join("/")}${path.endsWith("/") ? "/" : ""}`;
}

// How many path segments a param consumed: none when absent, one per item of a catch-all.
function count(value: string | string[] | undefined): number {
	if (value === undefined) return 0;
	return Array.isArray(value) ? value.length : 1;
}

function spell(segment: Segment, part: string, locale: Router["locale"]): string {
	if (segment.kind === "static") return encodeStatic(segment.text);
	if (segment.kind !== "dynamic" || locale === undefined || segment.name !== locale.paramName) return part;
	return locale.locales.find((tag) => tag.toLowerCase() === part.toLowerCase()) ?? part;
}
