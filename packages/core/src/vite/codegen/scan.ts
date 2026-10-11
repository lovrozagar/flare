import { parseSync, visitorKeys } from "oxc-parser";

type Ast = Record<string, unknown> & { type?: string; start?: number; end?: number };

export type Scan = {
	file: string;
	auth?: true | "optional";
	intercept?: { from: string[]; render: string; spans: Array<{ start: number; end: number }> };
	query: boolean;
};

export function scanRoute(file: string, source: string): Scan {
	const parsed = parseSync(file, source, { sourceType: "module", lang: "tsx" });
	if (parsed.errors.length > 0) throw new Error(`${file}: ${parsed.errors[0].message}`);
	const scan: Scan = { file, query: false };
	walk(parsed.program, (node) => {
		if (node.type === "ImportDeclaration") readImport(scan, node);
		if (node.type === "CallExpression") readCall(scan, node);
	});
	return scan;
}

function walk(node: unknown, visit: (node: Ast) => void): void {
	if (typeof node !== "object" || node === null) return;
	const record = node as Ast;
	visit(record);
	const keys = visitorKeys[String(record.type)];
	for (const key of keys) {
		const child = record[key];
		if (Array.isArray(child)) {
			for (const item of child) walk(item, visit);
		} else walk(child, visit);
	}
}

function readImport(scan: Scan, node: Ast): void {
	if ((node.source as Ast).value === "@lovrozagar/flare/query") scan.query = true;
}

function readCall(scan: Scan, node: Ast): void {
	const callee = node.callee as Ast;
	const name = (callee.property as Ast).name;
	if (name === "authenticate") scan.auth = true;
	if (name === "authenticateOptional") scan.auth = "optional";
	if (name === "intercept") scan.intercept = readIntercept(scan.file, node.arguments as Ast[]);
}

function readIntercept(file: string, args: readonly Ast[]): Scan["intercept"] {
	const object = args[0] as Ast;
	const properties = object.properties as Ast[];
	const from = properties.find((property) => (property.key as Ast).name === "from");
	const render = properties.find((property) => (property.key as Ast).name === "render");
	const value = (from as Ast).value as Ast;
	if (value.type !== "ArrayExpression") throw new Error(`${file}: intercept`);
	const fromIds: string[] = [];
	const spans: Array<{ start: number; end: number }> = [];
	for (const element of value.elements as Ast[]) {
		fromIds.push(String(element.value));
		spans.push({ start: element.start as number, end: element.end as number });
	}
	const renderValue = (render as Ast).value as Ast;
	return { from: fromIds, render: String(renderValue.value), spans };
}
