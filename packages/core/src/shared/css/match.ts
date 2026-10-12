// Does a selector match the shell HTML (bits/11)? The shell is read into a flat list of elements that know their
// parent and their previous element sibling. A pseudo-class need not be active and a pseudo-element always fits, so a
// rule whose state the shell cannot show is kept. `:host` never matches a document.
import type { ShellElement } from "./shell.ts";

// `present` names attributes a script sets before paint, such as the theme's: they match whatever the value.
export type MatchOptions = { present?: readonly string[] };

type Attribute = { name: string; op: string; value: string; insensitive: boolean };

type Pseudo = { name: string; argument?: string };

type Compound = { type?: string; ids: string[]; classes: string[]; attributes: Attribute[]; pseudos: Pseudo[] };

// Compounds right to left, with the combinator before each: `.a > .b` is `[.b, ">", .a]`.
type Complex = { compounds: Compound[]; combinators: string[] };

export function matchesSelector(
	selector: string,
	elements: readonly ShellElement[],
	options: MatchOptions = {},
): boolean {
	const list = selectorList(selector);
	const present = new Set(options.present ?? []);
	return elements.some((element) => list.some((complex) => matchComplex(complex, 0, { element, present })));
}

// A nested rule's selector, resolved against its parent: `&` is the parent, and no `&` is a descendant of it.
export function nestedSelector(parent: string, child: string): string {
	return split(child, ",")
		.map((part) => (unescapedAmpersand(part) ? part.replace(/(?<!\\)&/g, `:is(${parent})`) : `:is(${parent}) ${part}`))
		.join(", ");
}

function unescapedAmpersand(part: string): boolean {
	return /(?<!\\)&/.test(part);
}

function selectorList(selector: string): Complex[] {
	return split(selector, ",").map(complexOf);
}

// Splits at a top-level separator, outside brackets, parentheses, strings, and escapes.
function split(text: string, separator: string): string[] {
	const parts: string[] = [];
	let depth = 0;
	let from = 0;
	for (let at = 0; at < text.length; at += 1) {
		const char = text.charAt(at);
		if (char === "\\") at += 1;
		else if (char === "(" || char === "[") depth += 1;
		else if (char === ")" || char === "]") depth -= 1;
		else if (depth === 0 && char === separator) {
			parts.push(text.slice(from, at).trim());
			from = at + 1;
		}
	}
	parts.push(text.slice(from).trim());
	return parts.filter((part) => part !== "");
}

// A complex selector read character by character. Whitespace and `>`, `+`, `~` combine compounds only at the top
// level: inside brackets or parentheses, after an escape, and in an attribute operator such as `~=` they are text.
function complexOf(selector: string): Complex {
	const compounds: Compound[] = [];
	const combinators: string[] = [];
	let token = "";
	let pending = "";
	let depth = 0;
	const flush = (): void => {
		if (token === "") return;
		if (compounds.length > 0) combinators.unshift(pending === "" ? " " : pending);
		compounds.unshift(compoundOf(token));
		token = "";
		pending = "";
	};
	for (let at = 0; at < selector.length; at += 1) {
		const char = selector.charAt(at);
		if (char === "\\") {
			const escape = /^\\(?:[0-9a-fA-F]{1,6}\s?|.)/.exec(selector.slice(at)) ?? ["\\"];
			token += escape[0];
			at += escape[0].length - 1;
		} else if (depth === 0 && (/\s/.test(char) || ">+~".includes(char))) {
			flush();
			if (!/\s/.test(char)) pending = char;
		} else {
			depth += char === "(" || char === "[" ? 1 : char === ")" || char === "]" ? -1 : 0;
			token += char;
		}
	}
	flush();
	return { compounds, combinators };
}

function compoundOf(text: string): Compound {
	const compound: Compound = { ids: [], classes: [], attributes: [], pseudos: [] };
	let at = 0;
	if (/^[a-zA-Z*]/.test(text)) {
		const name = readIdent(text, text.startsWith("*") ? 1 : 0);
		compound.type = text.startsWith("*") ? "*" : name.value.toLowerCase();
		at = name.end;
	}
	while (at < text.length) at = simple(text, at, compound);
	return compound;
}

// One simple selector at `at`, written into the compound. It returns where the next one starts.
function simple(text: string, at: number, compound: Compound): number {
	const char = text.charAt(at);
	if (char === "#" || char === ".") {
		const name = readIdent(text, at + 1);
		(char === "#" ? compound.ids : compound.classes).push(name.value);
		return name.end;
	}
	if (char === "[") {
		const end = text.indexOf("]", at);
		compound.attributes.push(attributeOf(text.slice(at + 1, end)));
		return end + 1;
	}
	const colons = text.startsWith("::", at) ? 2 : 1;
	const name = readIdent(text, at + colons);
	if (text.charAt(name.end) !== "(") {
		if (colons === 1) compound.pseudos.push({ name: name.value.toLowerCase() });
		return name.end;
	}
	const close = matchingParen(text, name.end);
	compound.pseudos.push({ name: name.value.toLowerCase(), argument: text.slice(name.end + 1, close) });
	return close + 1;
}

function matchingParen(text: string, open: number): number {
	let depth = 0;
	for (let at = open; at < text.length; at += 1) {
		const char = text.charAt(at);
		if (char === "\\") at += 1;
		else if (char === "(") depth += 1;
		else if (char === ")" && --depth === 0) return at;
	}
	return text.length;
}

function attributeOf(inner: string): Attribute {
	const found = /^\s*([^\s~|^$*=]+)\s*(?:([~|^$*]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\s]+))\s*([is])?)?\s*$/.exec(inner);
	const parts = found ?? ["", inner.trim()];
	const value = parts[3] ?? parts[4] ?? parts[5] ?? "";
	return { name: String(parts[1]).toLowerCase(), op: parts[2] ?? "", value, insensitive: parts[6] === "i" };
}

// An identifier with its CSS escapes undone: `md\:flex` is `md:flex`, and `\31 a` is `1a`.
function readIdent(text: string, start: number): { value: string; end: number } {
	let value = "";
	let at = start;
	while (at < text.length) {
		const char = text.charAt(at);
		if (char === "\\") {
			const hex = /^[0-9a-fA-F]{1,6}\s?/.exec(text.slice(at + 1));
			if (hex === null) value += text.charAt(at + 1);
			else value += String.fromCodePoint(Number.parseInt(hex[0], 16));
			at += 1 + (hex?.[0].length ?? 1);
		} else if (/[\w-]/.test(char) || char.charCodeAt(0) > 127) {
			value += char;
			at += 1;
		} else break;
	}
	return { value, end: at };
}

type Context = { element: ShellElement; present: ReadonlySet<string> };

function matchComplex(complex: Complex, index: number, context: Context): boolean {
	const compound = complex.compounds[index];
	// A selector with no compound, such as a lone combinator, matches nothing.
	if (compound === undefined) return false;
	if (!matchCompound(compound, context)) return false;
	const combinator = complex.combinators[index];
	if (combinator === undefined) return true;
	const at = (element: ShellElement): boolean => matchComplex(complex, index + 1, { ...context, element });
	const { parent, previous } = context.element;
	if (combinator === ">") return parent !== undefined && at(parent);
	if (combinator === "+") return previous !== undefined && at(previous);
	const step = combinator === "~" ? "previous" : "parent";
	for (let next = context.element[step]; next !== undefined; next = next[step]) if (at(next)) return true;
	return false;
}

function matchCompound(compound: Compound, context: Context): boolean {
	const element = context.element;
	if (compound.type !== undefined && compound.type !== "*" && compound.type !== element.tag) return false;
	if (!compound.ids.every((id) => element.attributes.get("id") === id)) return false;
	if (!compound.classes.every((name) => element.classes.has(name))) return false;
	if (!compound.attributes.every((attribute) => matchAttribute(attribute, context))) return false;
	return compound.pseudos.every((pseudo) => matchPseudo(pseudo, context));
}

function matchAttribute(attribute: Attribute, context: Context): boolean {
	if (context.present.has(attribute.name)) return true;
	const actual = context.element.attributes.get(attribute.name);
	if (actual === undefined) return false;
	const [have, want] = attribute.insensitive
		? [actual.toLowerCase(), attribute.value.toLowerCase()]
		: [actual, attribute.value];
	if (attribute.op === "=") return have === want;
	if (attribute.op === "~=") return have.split(/\s+/).includes(want);
	if (attribute.op === "|=") return have === want || have.startsWith(`${want}-`);
	if (attribute.op === "^=") return have.startsWith(want);
	if (attribute.op === "$=") return have.endsWith(want);
	if (attribute.op === "*=") return have.includes(want);
	return true;
}

function matchPseudo(pseudo: Pseudo, context: Context): boolean {
	const inner = (): boolean => selectorList(pseudo.argument ?? "").some((complex) => matchComplex(complex, 0, context));
	if (pseudo.name === "host" || pseudo.name === "host-context") return false;
	if (pseudo.name === "root") return context.element.parent === undefined;
	if (pseudo.name === "not") return !inner();
	if (pseudo.name === "is" || pseudo.name === "where" || pseudo.name === "matches") return inner();
	return true;
}

// The keys a rule is indexed by: each complex selector's rightmost compound gives its first class, else its id, else
// its tag. A list with an unkeyed item, such as `*` or `:root`, is unkeyed: every shell tests it.
export function selectorKeys(selector: string): string[] | undefined {
	const keys: string[] = [];
	for (const complex of selectorList(selector)) {
		const key = compoundKey(complex.compounds[0]);
		if (key === undefined) return undefined;
		keys.push(key);
	}
	return keys;
}

function compoundKey(compound: Compound | undefined): string | undefined {
	const name = compound?.classes[0];
	if (name !== undefined) return `.${name}`;
	const id = compound?.ids[0];
	if (id !== undefined) return `#${id}`;
	return compound?.type === undefined || compound.type === "*" ? undefined : compound.type;
}
