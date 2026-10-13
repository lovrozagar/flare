import { branchFor, type BranchKind } from "./plural.ts";
import { providerTag } from "./provider.tsx";

export type Values = Readonly<Record<string, string | number | null | undefined>>;

// A message is text, `{name}` or `{name, number}`, or a branch message: `{name, plural|selectordinal|select, ...}`
// with `key {message}` branches. `raw` is the token as written, which a missing value leaves in place.
type Node =
	| { type: "text"; text: string }
	| { type: "arg"; name: string; raw: string; number: boolean }
	| { type: "branch"; name: string; raw: string; kind: BranchKind; branches: ReadonlyMap<string, Node[]> };

type Context = { values: Values; tag: string; hash: string | undefined };

const KINDS: ReadonlySet<string> = new Set(["plural", "selectordinal", "select"]);

// Substitutes values into a message for a tag (dx/features.md i18n). Omitted `locale` during a render inside
// LocaleProvider is that provider's tag. A tag `Intl.Locale` rejects throws.
export function formatMessage(message: string, values?: Values, locale?: string): string {
	const tag = locale ?? providerTag("formatMessage needs a locale outside LocaleProvider");
	void new Intl.Locale(tag);
	return render(parseMessage(message), { values: values ?? {}, tag, hash: undefined });
}

export function parseMessage(message: string): Node[] {
	const nodes: Node[] = [];
	let text = "";
	let index = 0;
	while (index < message.length) {
		const end = message[index] === "{" ? closing(message, index) : -2;
		if (end === -1) {
			text += message.slice(index);
			break;
		}
		if (end === -2) {
			text += message[index];
			index += 1;
			continue;
		}
		if (text !== "") nodes.push({ type: "text", text });
		text = "";
		nodes.push(argument(message.slice(index, end + 1)));
		index = end + 1;
	}
	if (text !== "") nodes.push({ type: "text", text });
	return nodes;
}

// Every branch message in the tree, so createTranslations can refuse one without `other`.
export function branchNodes(nodes: readonly Node[]): Array<{ branches: ReadonlyMap<string, Node[]> }> {
	return nodes.flatMap((node) =>
		node.type === "branch" ? [node, ...[...node.branches.values()].flatMap(branchNodes)] : [],
	);
}

// The index of the brace that closes the one at `start`, or -1 when it never closes.
function closing(text: string, start: number): number {
	let depth = 0;
	for (let index = start; index < text.length; index += 1) {
		if (text[index] === "{") depth += 1;
		if (text[index] === "}") depth -= 1;
		if (depth === 0) return index;
	}
	return -1;
}

function argument(raw: string): Node {
	const inner = raw.slice(1, -1);
	const first = inner.indexOf(",");
	if (first === -1) return { type: "arg", name: inner.trim(), raw, number: false };
	const name = inner.slice(0, first).trim();
	const rest = inner.slice(first + 1);
	const second = rest.indexOf(",");
	const kind = (second === -1 ? rest : rest.slice(0, second)).trim();
	if (second === -1) return kind === "number" ? { type: "arg", name, raw, number: true } : { type: "text", text: raw };
	const branches = KINDS.has(kind) ? parseBranches(rest.slice(second + 1)) : undefined;
	if (branches === undefined) return { type: "text", text: raw };
	return { type: "branch", name, raw, kind: kindOf(kind), branches };
}

function kindOf(kind: string): BranchKind {
	return kind === "plural" ? "plural" : kind === "selectordinal" ? "selectordinal" : "select";
}

// `key {message}` pairs. Anything else in the list makes the whole token text. The token is balanced, so every
// brace inside it closes.
function parseBranches(source: string): Map<string, Node[]> | undefined {
	const branches = new Map<string, Node[]>();
	let index = 0;
	for (;;) {
		const open = source.indexOf("{", index);
		const key = source.slice(index, open === -1 ? undefined : open).trim();
		if (open === -1) return key === "" && branches.size > 0 ? branches : undefined;
		const end = closing(source, open);
		if (key === "" || /\s/.test(key)) return undefined;
		branches.set(key, parseMessage(source.slice(open + 1, end)));
		index = end + 1;
	}
}

function render(nodes: readonly Node[], context: Context): string {
	return nodes.map((node) => renderNode(node, context)).join("");
}

function renderNode(node: Node, context: Context): string {
	if (node.type === "text") return context.hash === undefined ? node.text : node.text.replaceAll("#", context.hash);
	const value = Object.hasOwn(context.values, node.name) ? context.values[node.name] : undefined;
	return node.type === "arg" ? renderArg(node, value, context) : renderBranch(node, value, context);
}

type Arg = Extract<Node, { type: "arg" }>;
type Branch = Extract<Node, { type: "branch" }>;
type Value = Values[string];

// A missing or `null` value, or a non-number for `{name, number}`, leaves the token as written.
function renderArg(node: Arg, value: Value, context: Context): string {
	if (value === undefined || value === null || (node.number && typeof value !== "number")) return node.raw;
	return typeof value === "number" ? new Intl.NumberFormat(context.tag).format(value) : value;
}

// A select takes a string, a plural or selectordinal a number. Anything else leaves the token as written.
function renderBranch(node: Branch, value: Value, context: Context): string {
	if (typeof value !== (node.kind === "select" ? "string" : "number") || value === undefined || value === null) {
		return node.raw;
	}
	const key = branchFor({ kind: node.kind, value, tag: context.tag, branches: new Set(node.branches.keys()) });
	const branch = node.branches.get(key);
	if (branch === undefined) return node.raw;
	const hash = typeof value === "number" ? new Intl.NumberFormat(context.tag).format(value) : context.hash;
	return render(branch, { ...context, hash });
}
