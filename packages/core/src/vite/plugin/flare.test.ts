import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import solid from "@solidjs/vite-plugin";
import { expect, it, vi } from "vitest";
import { flare } from "./flare.ts";

vi.mock("@solidjs/vite-plugin", () => ({
	default: vi.fn<() => Array<{ name: string }>>(() => [{ name: "solid" }]),
}));

function project(): string {
	const root = mkdtempSync(join(tmpdir(), "flare-plugin-"));
	mkdirSync(join(root, "src"));
	writeFileSync(join(root, "src/client.tsx"), "");
	writeFileSync(join(root, "src/server.ts"), "");
	return root;
}

function apply(
	config: { root: string; server?: { host?: string | boolean } },
	options?: Parameters<typeof flare>[0],
): void {
	const plugin = flare(options).find((item) => item.name === "flare");
	const hook = plugin?.config;
	if (typeof hook !== "function") throw new Error("config");
	hook.call(null as never, config as never, { command: "serve", mode: "development" } as never);
}

it("entry", () => {
	const root = project();
	try {
		expect(() => apply({ root })).not.toThrow();
		rmSync(join(root, "src/client.tsx"));
		expect(() => apply({ root })).toThrow("entry.client src/client.tsx");
		writeFileSync(join(root, "src/client.tsx"), "");
		rmSync(join(root, "src/server.ts"));
		expect(() => apply({ root })).toThrow("entry.server src/server.ts");
		writeFileSync(join(root, "src/server.ts"), "");
		expect(() => apply({ root }, { entry: { client: "/tmp/client.tsx" } })).toThrow(/^entry\.client$/);
		expect(() => apply({ root }, { entry: { server: "/tmp/server.ts" } })).toThrow(/^entry\.server$/);
		expect(() => apply({ root }, { entry: { client: "src/missing.tsx" } })).toThrow("entry.client src/missing.tsx");
		expect(() => apply({ root }, { entry: { server: "src/missing.ts" } })).toThrow("entry.server src/missing.ts");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("host", () => {
	const root = project();
	try {
		expect(() => apply({ root, server: { host: true } })).toThrow(/^true$/);
		expect(() => apply({ root, server: { host: "0.0.0.0" } })).toThrow("0.0.0.0");
		expect(() => apply({ root, server: { host: "::" } })).toThrow(/^::$/);
		expect(() => apply({ root })).not.toThrow();
		expect(() => apply({ root, server: { host: "localhost" } })).not.toThrow();
		expect(() => apply({ root, server: { host: "127.0.0.1" } })).not.toThrow();
		expect(() => apply({ root, server: { host: "::1" } })).not.toThrow();
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

it("solid options", () => {
	flare();
	expect(vi.mocked(solid)).toHaveBeenCalledWith({ ssr: true, extensions: [".tsx", ".jsx"] });
});
