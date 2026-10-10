function isGroupSegment(segment: string): boolean {
	return segment.startsWith("(") && segment.endsWith(")");
}

export function isParamSegment(segment: string): boolean {
	return segment.startsWith("[") && segment.endsWith("]");
}

export function isRootLayoutPath(path: string): boolean {
	return path.length >= 3 && path.startsWith("_") && path.endsWith("_") && !path.includes("/");
}

export function stripGroups(path: string): string {
	return path
		.split("/")
		.filter((s) => !isGroupSegment(s))
		.join("/");
}

function findRootSegmentIndex(segments: string[]): number {
	return segments.findIndex((s) => isRootLayoutPath(s));
}

export function toUrlPath(virtualPath: string): string {
	const segments = virtualPath.split("/");
	const rootIdx = findRootSegmentIndex(segments);
	const filtered = segments.filter((s, i) => {
		if (rootIdx >= 0 && i <= rootIdx) return false;
		if (isGroupSegment(s)) return false;
		return true;
	});
	if (filtered.length === 0) return "/";
	return `/${filtered.join("/")}`;
}

export function toVirtualPath(urlPath: string, root: string): string {
	const trimmed = urlPath.replace(/^\/+/, "");
	if (trimmed.length === 0) return root;
	return `${root}/${trimmed}`;
}

const PARAM_RE = /\[(?:\.\.\.)?(\w+)\](?:\])?/g;

export function deriveParams(variablePath: string): string[] {
	const matches = variablePath.matchAll(PARAM_RE);
	const result: string[] = [];
	for (const m of matches) {
		result.push(m[1]);
	}
	return result;
}

export function extractLayoutKey(virtualPath: string): string {
	const segments = virtualPath.split("/");
	const virtual: string[] = [];
	for (const segment of segments) {
		if (isRootLayoutPath(segment) || isGroupSegment(segment) || isParamSegment(segment)) {
			virtual.push(segment);
		}
	}
	return virtual.join("/");
}

export function deriveLayouts(virtualPath: string): string[] {
	const layoutKey = extractLayoutKey(virtualPath);
	if (!layoutKey) return [];
	const segments = layoutKey.split("/");
	const layouts: string[] = [];
	let accumulated = "";
	let foundRoot = false;

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i];

		if (!foundRoot) {
			/* Pre-root: accumulate param segments into compound key */
			if (isRootLayoutPath(segment)) {
				accumulated = accumulated ? `${accumulated}/${segment}` : segment;
				layouts.push(accumulated);
				foundRoot = true;
			} else if (isParamSegment(segment)) {
				accumulated = accumulated ? `${accumulated}/${segment}` : segment;
				/* Push pre-root param segments — they can be path segments with cache config */
				layouts.push(accumulated);
			}
			continue;
		}

		/* Post-root: existing logic */
		if (isGroupSegment(segment)) {
			accumulated = `${accumulated}/${segment}`;
			layouts.push(accumulated);
			/* Each trailing param segment forms its own layout boundary.
			   Enables path-segments like (group)/[org]/[repo] to resolve independently. */
			while (i + 1 < segments.length && isParamSegment(segments[i + 1])) {
				i++;
				accumulated = `${accumulated}/${segments[i]}`;
				layouts.push(accumulated);
			}
		} else if (isParamSegment(segment)) {
			/* Bare param segments (not trailing a group) also form layout boundaries.
			   Enables [locale]/_layout_.tsx without requiring a wrapping (group). */
			accumulated = `${accumulated}/${segment}`;
			layouts.push(accumulated);
		}
	}

	return layouts;
}
