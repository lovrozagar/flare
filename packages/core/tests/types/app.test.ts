import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import { generateTypes } from "../../src/vite/codegen/types-gen.ts";

// B74: the generator runs on the fixture, then the real tsc checks it under a consumer's strict flags. The register
// goes to a temp folder under the repo's ignored .tmp, and `rootDirs` lets its `../routes/…` imports reach the
// fixture's own files, so the committed app has no `_gen`.
const app = fileURLToPath(new URL("./app", import.meta.url));
const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const temp = join(repo, ".tmp", `types-app-${process.pid}`);

afterAll(() => rmSync(temp, { recursive: true, force: true }));

function filesIn(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		return statSync(full).isDirectory() ? filesIn(full) : [relative(app, full).split(sep).join("/")];
	});
}

function writeProject(): string {
	const appFiles = filesIn(join(app, "src"));
	const routeFiles = appFiles.filter((file) => file.startsWith("src/routes/")).map((file) => file.slice(11));
	const read = (file: string): string => readFileSync(join(app, file), "utf8");
	mkdirSync(join(temp, "src", "_gen"), { recursive: true });
	writeFileSync(join(temp, "src", "_gen", "types.gen.d.ts"), generateTypes({ routeFiles, appFiles, read }).source);
	// A valid line under a directive: tsc must report it, or a stale @ts-expect-error in checks.ts would pass.
	writeFileSync(join(temp, "src", "checks-unused.ts"), '// @ts-expect-error\nexport const fine: string = "a";\n');
	const tsconfig = join(temp, "tsconfig.json");
	const sources = [join(app, "src"), join(temp, "src")];
	writeFileSync(
		tsconfig,
		JSON.stringify({ extends: join(app, "tsconfig.json"), compilerOptions: { rootDirs: sources }, include: sources }),
	);
	return tsconfig;
}

it("app compiles", () => {
	try {
		const run = spawnSync("bunx", ["tsc", "-p", writeProject()], { cwd: repo, encoding: "utf8" });
		const errors = run.stdout.split("\n").filter((line) => line.includes("error TS"));
		expect(errors).toEqual([expect.stringMatching(/checks-unused\.ts\(1,1\): error TS2578/)]);
		expect(run.status).not.toBe(0);
	} finally {
		rmSync(temp, { recursive: true, force: true });
	}
}, 120_000);

// The fixture's src/query.ts imports the ./query entry, so the generated register sets `hasQueryClient`.
it("query client generated", () => {
	const appFiles = filesIn(join(app, "src"));
	const routeFiles = appFiles.filter((file) => file.startsWith("src/routes/")).map((file) => file.slice(11));
	const read = (file: string): string => readFileSync(join(app, file), "utf8");
	expect(generateTypes({ routeFiles, appFiles, read }).source).toContain("hasQueryClient: true;");
});

it("no committed gen", () => {
	expect(existsSync(join(app, "src", "_gen"))).toBe(false);
});
