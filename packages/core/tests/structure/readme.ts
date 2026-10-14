import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// The README, read by readme.test.ts for its text and by exports.test.ts against the packed package (plan 14 leaf
// 12.3).
export const repo = fileURLToPath(new URL("../../../../", import.meta.url));
export const readme = readFileSync(join(repo, "README.md"), "utf8");

// The fenced block after each `<!-- quick-start: <path> -->` marker, with the path it is compiled at.
export function quickStart(text: string): { path: string; code: string }[] {
	return [...text.matchAll(/<!-- quick-start: (\S+) -->\n\n?```\w*\n([\s\S]*?)\n```/g)].map((match) => ({
		path: String(match[1]),
		code: `${String(match[2])}\n`,
	}));
}

// Each table row as its cells, for the tables whose first header cell is `first`.
export function tableRows(text: string, first: string): string[][] {
	const rows: string[][] = [];
	// The table the line belongs to: undefined between tables, then whether its header matched.
	let matched: boolean | undefined;
	for (const line of text.split("\n")) {
		if (!line.startsWith("|")) {
			matched = undefined;
			continue;
		}
		const cells = line
			.split(/(?<!\\)\|/)
			.slice(1, -1)
			.map((cell) => cell.trim());
		if (matched === undefined) matched = cells[0] === first;
		else if (matched && !/^-+$/.test(cells[0] ?? "")) rows.push(cells);
	}
	return rows;
}

// The identifiers in backticks: `createPage`, `useLoaderData`.
export function identifiers(cell: string): string[] {
	return [...cell.matchAll(/`([A-Za-z_$][\w$]*)`/g)].map((match) => String(match[1]));
}
