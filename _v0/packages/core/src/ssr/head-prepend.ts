/**
 * Solid 2 hydrates `<head>` by walking its children from `head.firstChild` in render order, static
 * elements (meta, title) and component regions (`<!--$-->…<!--/-->`) alike. Vite's
 * transformIndexHtml prepends tags (`/@vite/client`, plugin head-prepend tags) ahead of them, so
 * hydration would meet those first. Mark where Solid's output starts before the transform, then
 * move whatever landed ahead of the mark to the end of `<head>`.
 */
const SOLID_HEAD_START = "<!--flare-solid-head-->";

/** Marks the start of Solid's head children. Call on the SSR HTML before transformIndexHtml. */
export function markSolidHeadStart(html: string): string {
	return html.replace(/<head(\s[^>]*)?>/i, (open) => `${open}${SOLID_HEAD_START}`);
}

/** Moves tags injected ahead of the mark to just before `</head>` and drops the mark. */
export function moveHeadPrependsAfterSolid(html: string): string {
	const open = /<head(\s[^>]*)?>/i.exec(html);
	if (!open) return html;
	const start = open.index + open[0].length;
	const mark = html.indexOf(SOLID_HEAD_START, start);
	const end = html.indexOf("</head>", start);
	if (mark === -1 || end === -1 || mark > end) return html;
	const prepended = html.slice(start, mark);
	const solidAndRest = html.slice(mark + SOLID_HEAD_START.length, end);
	return html.slice(0, start) + solidAndRest + prepended + html.slice(end);
}
