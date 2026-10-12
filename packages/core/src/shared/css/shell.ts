// The shell HTML as a flat list of elements that know their parent and their previous element sibling (bits/11).
// Comments, the doctype, and the text of script, style, textarea, and title are not markup. Void and self-closing
// elements take no children, and a stray end tag is ignored.
export type ShellElement = {
	tag: string;
	attributes: ReadonlyMap<string, string>;
	classes: ReadonlySet<string>;
	parent: ShellElement | undefined;
	previous: ShellElement | undefined;
};

const VOID = new Set([
	"area",
	"base",
	"br",
	"col",
	"embed",
	"hr",
	"img",
	"input",
	"link",
	"meta",
	"source",
	"track",
	"wbr",
]);

// Their text is not markup.
const RAW = new Set(["script", "style", "textarea", "title"]);

export function shellTree(html: string): ShellElement[] {
	const all: ShellElement[] = [];
	const open: ShellElement[] = [];
	const last = new Map<ShellElement | undefined, ShellElement>();
	let at = html.indexOf("<");
	while (at !== -1) {
		if (html.startsWith("<!--", at)) {
			at = html.indexOf("<", skipPast(html, at, "-->"));
			continue;
		}
		if (html.startsWith("</", at)) {
			const end = skipPast(html, at, ">");
			closeTag(
				open,
				html
					.slice(at + 2, end - 1)
					.trim()
					.toLowerCase(),
			);
			at = html.indexOf("<", end);
			continue;
		}
		if (!/[a-z]/i.test(html.charAt(at + 1))) {
			at = html.indexOf("<", skipPast(html, at, ">"));
			continue;
		}
		const tag = readTag(html, at);
		const parent = open.at(-1);
		const element: ShellElement = { ...tag, parent, previous: last.get(parent) };
		last.set(parent, element);
		all.push(element);
		if (!VOID.has(tag.tag) && !tag.closed) open.push(element);
		at = RAW.has(tag.tag) ? html.toLowerCase().indexOf(`</${tag.tag}`, tag.end) : html.indexOf("<", tag.end);
	}
	return all;
}

function skipPast(html: string, from: number, token: string): number {
	const end = html.indexOf(token, from + 1);
	return end === -1 ? html.length : end + token.length;
}

// An end tag closes the nearest open element of that name and everything inside it. A stray one is ignored.
function closeTag(open: ShellElement[], name: string): void {
	const index = open.findLastIndex((element) => element.tag === name);
	if (index !== -1) open.length = index;
}

type Tag = { tag: string; attributes: Map<string, string>; classes: Set<string>; end: number; closed: boolean };

// One start tag. A quoted value may hold `>`.
function readTag(html: string, start: number): Tag {
	// The caller checked the letter after `<`, so the name has at least one character.
	let nameEnd = start + 1;
	while (/[\w:-]/.test(html.charAt(nameEnd))) nameEnd += 1;
	const attributes = new Map<string, string>();
	const pattern = /\s*([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?|\s*(\/?>)/y;
	pattern.lastIndex = nameEnd;
	let closed = false;
	for (let found = pattern.exec(html); found !== null; found = pattern.exec(html)) {
		if (found[5] !== undefined) {
			closed = found[5] === "/>";
			break;
		}
		attributes.set(String(found[1]).toLowerCase(), decode(found[2] ?? found[3] ?? found[4] ?? ""));
	}
	// HTML splits a class list on ASCII whitespace only, so a decoded no-break space stays inside its class.
	const classes = new Set((attributes.get("class") ?? "").split(/[\t\n\f\r ]+/).filter((item) => item !== ""));
	return { tag: html.slice(start + 1, nameEnd).toLowerCase(), attributes, classes, end: pattern.lastIndex, closed };
}

const NAMED: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

// Solid's SSR writes `&`, `<`, and quotes in attributes as character references. Decimal and hex references decode,
// and so do the named ones it writes. Any other reference stays as written.
function decode(value: string): string {
	return value.replaceAll(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (whole: string, reference: string) => {
		if (/^#x/i.test(reference)) return String.fromCodePoint(Number.parseInt(reference.slice(2), 16));
		if (reference.startsWith("#")) return String.fromCodePoint(Number(reference.slice(1)));
		return NAMED[reference] ?? whole;
	});
}
