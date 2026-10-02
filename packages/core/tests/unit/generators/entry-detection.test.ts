// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runGenerate } from "../../../src/generators/index.ts";

const PAGE = `export const route = createPage("_root_/x").authenticate().render(() => null)`;
const ROUTER = `export const router = createRouter({ queryClientGetter: () => queryClient })`;

describe("codegen app entry detection", () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "flare-entries-"));
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		rmSync(root, { force: true, recursive: true });
		vi.restoreAllMocks();
	});

	function write(rel: string, content: string): void {
		mkdirSync(dirname(join(root, rel)), { recursive: true });
		writeFileSync(join(root, rel), content);
	}

	function generated(): string {
		return readFileSync(join(root, "src/_gen/routes.gen.ts"), "utf-8");
	}

	it("default sibling entries resolve against rootDir, not the process cwd", () => {
		write("src/routes/x.tsx", PAGE);
		write("src/router.ts", ROUTER);
		write("src/server.ts", `import { router } from "./router";\nexport const server = createServer(router);`);
		runGenerate({ rootDir: root });
		expect(generated()).toContain("hasQueryClient: true");
		expect(generated()).toContain(`import type { server as _FlareHandler } from "../server"`);
	});

	it("configured server entry and the router it imports", () => {
		write("src/routes/x.tsx", PAGE);
		write("src/app.web.router.ts", ROUTER);
		write(
			"src/app.web.server.ts",
			`import { createServer } from "@lovrozagar/flare/server";\nimport { router } from "./app.web.router";\nexport const handler = createServer(router)\n\t.authenticateFn(() => null);\nexport default handler;`,
		);
		runGenerate({ rootDir: root, serverEntry: "src/app.web.server.ts" });
		const out = generated();
		expect(out).toContain("hasQueryClient: true");
		expect(out).toContain(`import type { handler as _FlareHandler } from "../app.web.server"`);
		expect(out).toContain("auth: NonNullable<");
	});

	it("absolute server entry path", () => {
		write("src/routes/x.tsx", PAGE);
		write("src/app.router.ts", ROUTER);
		write("src/app.server.ts", `import { router as r } from "./app.router";\nexport const server = createServer(r);`);
		runGenerate({ rootDir: root, serverEntry: join(root, "src/app.server.ts") });
		expect(generated()).toContain("hasQueryClient: true");
		expect(generated()).toContain(`from "../app.server"`);
	});

	it("warns when the server entry does not export its createServer chain", () => {
		write("src/routes/x.tsx", PAGE);
		write("src/app.server.ts", `const handler = createServer(router);\nexport default handler;`);
		const result = runGenerate({ rootDir: root, serverEntry: "src/app.server.ts" });
		expect(result.warnings.join("\n")).toContain("src/app.server.ts calls createServer() without exporting it");
		expect(generated()).not.toContain("_FlareHandler");
	});
});
