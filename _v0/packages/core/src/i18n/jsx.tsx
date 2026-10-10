/**
 * Rich text parsing for JSX interpolation
 * Parses [[component:content]] syntax into component calls
 */

const RICH_RE = /\[\[([a-zA-Z0-9_-]+):([^\]]*)\]\]/g;

export function parseRichText(text: string, components: Record<string, (children: string) => unknown>): unknown[] {
	const parts: unknown[] = [];
	let lastIndex = 0;

	RICH_RE.lastIndex = 0;
	let match = RICH_RE.exec(text);

	while (match !== null) {
		const before = text.slice(lastIndex, match.index);
		parts.push(before);

		const componentName = match[1] ?? "";
		const content = match[2] ?? "";
		const component = components[componentName];

		if (component) {
			parts.push(component(content));
		} else {
			parts.push(content);
		}

		lastIndex = match.index + match[0].length;
		match = RICH_RE.exec(text);
	}

	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	if (parts.length === 0) {
		parts.push(text);
	}

	return parts;
}
