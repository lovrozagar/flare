/**
 * Solid 2 hydratable `<head>` walks `head.firstChild` as `<!--$-->`.
 * Vite (`/@vite/client`) and Flare headPrefix used to prepend nodes, so
 * getNextMarker started on the wrong child and hydration threw
 * `Cannot read properties of null (reading 'firstChild'|'nextSibling')`.
 *
 * Move the Solid `<!--$-->…<!--/-->` region to the start of `<head>`.
 * Injected scripts/meta stay in `<head>` (still before `</head>` / body).
 */
export function hoistHydrationHeadMarkers(html: string): string {
	const open = /<head[^>]*>/i.exec(html);
	if (!open) return html;
	const start = open.index + open[0].length;
	const end = html.indexOf("</head>", start);
	if (end === -1) return html;
	const inner = html.slice(start, end);
	const first = inner.indexOf("<!--$-->");
	if (first <= 0) return html;
	const last = inner.lastIndexOf("<!--/-->");
	if (last === -1 || last < first) return html;
	const closeAt = last + "<!--/-->".length;
	const solid = inner.slice(first, closeAt);
	const rest = inner.slice(0, first) + inner.slice(closeAt);
	return html.slice(0, start) + solid + rest + html.slice(end);
}
