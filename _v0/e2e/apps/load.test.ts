import { describe, expect, it } from "bun:test";
import { e2eEnvCommand } from "./load.ts";

describe("e2eEnvCommand prod workers", () => {
	it("demo prod build uses the cloudflare vite config, not the default node config", () => {
		const cmd = e2eEnvCommand("workers", "demo", "prod", 4108);
		expect(cmd).toContain("vite.cf.config.ts");
		expect(cmd).toMatch(/build.*vite\.cf\.config\.ts/);
		expect(cmd).not.toMatch(/^bun run build &&/);
	});

	it("product prod build uses vite.workers.config.ts", () => {
		const cmd = e2eEnvCommand("workers", "product", "prod", 4108);
		expect(cmd).toContain("vite.workers.config.ts");
		expect(cmd).toMatch(/build.*vite\.workers\.config\.ts/);
	});

	it("fs-routes prod build uses the cloudflare vite config", () => {
		const cmd = e2eEnvCommand("workers", "fs-routes", "prod", 4108);
		expect(cmd).toContain("vite.cf.config.ts");
	});
});
