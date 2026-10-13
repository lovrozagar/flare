import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { emitFonts, type FontRegistry } from "./emit.ts";

// A two-family fixture. The real registry data is bit 14's.
const source = mkdtempSync(join(tmpdir(), "flare-fonts-"));
const registry: FontRegistry = {
	abel: { files: [{ url: "/fonts/abel/latin-400.woff2" }] },
	inter: { files: [{ url: "/fonts/inter/latin.woff2" }, { url: "/fonts/inter/greek.woff2" }] },
};

beforeAll(() => {
	mkdirSync(join(source, "abel"), { recursive: true });
	mkdirSync(join(source, "inter"), { recursive: true });
	writeFileSync(join(source, "abel", "latin-400.woff2"), "abel");
	writeFileSync(join(source, "inter", "latin.woff2"), "inter-latin");
	writeFileSync(join(source, "inter", "greek.woff2"), "inter-greek");
});

afterAll(() => rmSync(source, { recursive: true, force: true }));

it("copy", async () => {
	const out: Array<{ fileName: string; source: Uint8Array }> = [];
	await emitFonts({ registry, families: ["abel"], source, emit: (file) => void out.push(file) });
	expect(out.map((file) => file.fileName)).toEqual(["fonts/abel/latin-400.woff2"]);
	expect(Buffer.from(out[0]?.source ?? []).toString()).toBe("abel");
	// Two families, one listed twice, copy each file once.
	const both: string[] = [];
	await emitFonts({
		registry,
		families: ["inter", "abel", "inter"],
		source,
		emit: (file) => void both.push(file.fileName),
	});
	expect(both).toEqual(["fonts/inter/latin.woff2", "fonts/inter/greek.woff2", "fonts/abel/latin-400.woff2"]);
});

it("escape", async () => {
	const out: unknown[] = [];
	const bad: FontRegistry = {
		...registry,
		inter: { files: [{ url: "/fonts/inter/latin.woff2" }, { url: "/fonts/../../etc/passwd" }] },
	};
	await expect(
		emitFonts({ registry: bad, families: ["inter"], source, emit: (file) => void out.push(file) }),
	).rejects.toThrow("font url /fonts/../../etc/passwd leaves the font directory");
	expect(out).toEqual([]);
	// A url outside `/fonts/`, and the directory itself, are not font files either.
	for (const url of ["/etc/passwd", "/fonts/"]) {
		const outside: FontRegistry = { odd: { files: [{ url }] } };
		await expect(emitFonts({ registry: outside, families: ["odd"], source, emit: () => undefined })).rejects.toThrow(
			`font url ${url} leaves the font directory`,
		);
	}
	await expect(emitFonts({ registry, families: ["missing"], source, emit: () => undefined })).rejects.toThrow(
		"missing is not a registry font",
	);
});
