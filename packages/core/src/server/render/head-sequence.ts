// The final shell's `<head>` children as the client's guard reads them (B120): an element is its tag name, with
// `+dh` when it carries `data-dh` and `+hk` when it carries `_hk`, a comment is `!` and its value, and text is `#`.
// The client matches the live `<head>` against this and keeps every other node out of Solid's hydration walk.
export function headSequence(shell: string): string[] {
	const open = /<head(?=[\s>/])[^>]*>/i.exec(shell);
	if (open === null) return [];
	const sequence: string[] = [];
	let at = open.index + open[0].length;
	while (at < shell.length) {
		if (shell.startsWith("<!--", at)) {
			const end = shell.indexOf("-->", at + 4);
			const close = end === -1 ? shell.length : end;
			sequence.push(`!${shell.slice(at + 4, close)}`);
			at = close + 3;
			continue;
		}
		TAG_NAME.lastIndex = at;
		const named = TAG_NAME.exec(shell);
		if (named !== null) {
			const tag = startTag(shell, at + named[0].length, named[0].slice(1).toLowerCase());
			sequence.push(kind(tag.name, tag.attributes));
			at = RAW_TEXT.has(tag.name) ? afterRawText(shell, tag.end, tag.name) : tag.end;
		} else if (shell.startsWith("</", at)) {
			const end = shell.indexOf(">", at);
			if (/^<\/head[\s>]/i.test(shell.slice(at, end + 1))) break;
			at = end === -1 ? shell.length : end + 1;
		} else {
			// One text node runs to the next `<` that opens a tag, a comment, or an end tag; any other `<` is its text.
			sequence.push("#");
			at = textEnd(shell, at + 1);
		}
	}
	return sequence;
}

// Elements whose content the parser reads as text up to their own end tag, so no child node comes of it. `noscript`
// is one with scripting on, and the guard only runs with scripting on.
const RAW_TEXT = new Set(["script", "style", "title", "textarea", "noscript", "template"]);

function kind(name: string, attributes: readonly string[]): string {
	return `${name}${attributes.includes("data-dh") ? "+dh" : ""}${attributes.includes("_hk") ? "+hk" : ""}`;
}

// A start tag's attributes, from after its name to its `>`, outside quoted values: their lowercase names, and the
// offset after the tag. Sticky expressions read in place, so a long shell is never copied.
const TAG_NAME = /<[a-z][^\s/>]*/iy;
const SPACE = /[\s/]*/y;
const NAME = /[^\s/>=]+/y;
const VALUE = /\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/y;

function startTag(shell: string, from: number, name: string): { name: string; attributes: string[]; end: number } {
	const attributes: string[] = [];
	let index = from;
	for (;;) {
		SPACE.lastIndex = index;
		SPACE.exec(shell);
		index = SPACE.lastIndex;
		if (index >= shell.length || shell[index] === ">") break;
		const after = sticky(NAME, shell, index);
		if (after === undefined) {
			// A stray `=` names nothing.
			index += 1;
			continue;
		}
		attributes.push(shell.slice(index, after).toLowerCase());
		index = sticky(VALUE, shell, after) ?? after;
	}
	return { name, attributes, end: Math.min(index + 1, shell.length) };
}

const OPENER = /<(?:!--|\/|[a-z])/iy;

function textEnd(shell: string, from: number): number {
	for (let next = shell.indexOf("<", from); next !== -1; next = shell.indexOf("<", next + 1)) {
		OPENER.lastIndex = next;
		if (OPENER.test(shell)) return next;
	}
	return shell.length;
}

// Where a sticky expression's match at `at` ends, or undefined when it does not match there.
function sticky(pattern: RegExp, shell: string, at: number): number | undefined {
	pattern.lastIndex = at;
	return pattern.exec(shell) === null ? undefined : pattern.lastIndex;
}

function afterRawText(shell: string, from: number, name: string): number {
	const close = new RegExp(`</${name}[\\s>/]`, "gi");
	close.lastIndex = from;
	const found = close.exec(shell);
	if (found === null) return shell.length;
	const end = shell.indexOf(">", found.index);
	return end === -1 ? shell.length : end + 1;
}
