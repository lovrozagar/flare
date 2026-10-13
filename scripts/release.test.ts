import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { release, type ReleaseDeps } from "./release.ts";

const VERSION: string = JSON.parse(
	readFileSync(new URL("../packages/core/package.json", import.meta.url), "utf8"),
).version;
const TARBALL = `/tmp/out/lovrozagar-flare-${VERSION}.tgz`;

type Call = { command: string; args: readonly string[]; env?: Record<string, string> };

// A tree, its gates, and npm, recorded. `status` answers each command line; anything unlisted succeeds.
function deps(answers: Record<string, { status: number; stdout?: string }> = {}, env: Record<string, string> = {}) {
	const calls: Call[] = [];
	const logged: string[] = [];
	const fake: ReleaseDeps = {
		run(command, args, options) {
			calls.push({ command, args, ...(options?.env && { env: options.env }) });
			const answer = answers[[command, ...args].join(" ")];
			return { status: answer?.status ?? 0, stdout: answer?.stdout ?? "" };
		},
		pack: () => TARBALL,
		env,
		log: (line) => void logged.push(line),
	};
	const published = (): Call[] => calls.filter((call) => call.command === "npm" && call.args[0] === "publish");
	return { fake, calls, logged, published };
}

const CLEAN = { "git status --porcelain": { status: 0, stdout: "" } };
const TAGGED = { "git describe --tags --exact-match": { status: 0, stdout: `v${VERSION}\n` } };

it("refuses dirty", () => {
	const { fake, published, logged } = deps({
		"git status --porcelain": { status: 0, stdout: " M scripts/release.ts\n" },
	});
	expect(release([], fake)).not.toBe(0);
	expect(logged.join("\n")).toContain("the tree is dirty");
	expect(published()).toEqual([]);
});

it("refuses red", () => {
	const failing = { "node tests/fixtures/fail.mjs": { status: 1 } };
	const { fake, calls, published, logged } = deps({ ...CLEAN, ...TAGGED, ...failing });
	expect(release(["--test-command", "node tests/fixtures/fail.mjs"], fake)).not.toBe(0);
	expect(calls.some((call) => call.command === "node" && call.args[0] === "tests/fixtures/fail.mjs")).toBe(true);
	expect(logged.join("\n")).toContain("node tests/fixtures/fail.mjs failed");
	expect(published()).toEqual([]);
});

it("tag", () => {
	const { fake, calls, published } = deps({ ...CLEAN, ...TAGGED });
	expect(release([], fake)).toBe(0);
	// The gates, then the golden proof on the very tarball that ships.
	const lines = calls.map((call) => [call.command, ...call.args].join(" "));
	for (const gate of ["bun run fmt:check", "bun run lint", "bun run typecheck", "bun run test", "bun run test:e2e"]) {
		expect(lines).toContain(gate);
	}
	expect(lines).toContain("bun scripts/check-tree.ts --complete P14");
	const golden = calls.find((call) => call.args.includes("tests/e2e/golden.test.ts"));
	expect(golden?.env).toEqual({ FLARE_TARBALL: TARBALL });
	// One package, the tag's version, and a dry run outside a tag build.
	expect(published().map((call) => call.args)).toEqual([["publish", TARBALL, "--access", "public", "--dry-run"]]);
	expect(lines.some((line) => line.includes("flare-fonts"))).toBe(false);
	// A tag that is not the manifest's version is refused before anything is packed.
	const wrong = deps({ ...CLEAN, "git describe --tags --exact-match": { status: 0, stdout: "v0.9.0\n" } });
	expect(release([], wrong.fake)).not.toBe(0);
	expect(wrong.logged.join("\n")).toContain(`tag v0.9.0 is not v${VERSION}`);
	expect(wrong.published()).toEqual([]);
});

// `--publish` refuses anywhere but a GitHub Actions run, and nothing reaches npm.
it("publish outside actions", () => {
	const local = deps({ ...CLEAN, ...TAGGED });
	expect(release(["--publish", "--tarball", TARBALL], local.fake)).not.toBe(0);
	expect(local.logged.join("\n")).toContain(`--publish runs only in GitHub Actions on refs/tags/v${VERSION}`);
	expect(local.published()).toEqual([]);
	const branch = deps({}, { GITHUB_ACTIONS: "true", GITHUB_REF: "refs/heads/main" });
	expect(release(["--publish", "--tarball", TARBALL], branch.fake)).not.toBe(0);
	expect(branch.published()).toEqual([]);
});

// In Actions, only the manifest version's tag publishes, and only the tarball of that version the verify job built.
it("publish wrong tag", () => {
	const other = deps({}, { GITHUB_ACTIONS: "true", GITHUB_REF: "refs/tags/v0.0.1" });
	expect(release(["--publish", "--tarball", TARBALL], other.fake)).not.toBe(0);
	expect(other.published()).toEqual([]);
	const ci = { GITHUB_ACTIONS: "true", GITHUB_REF: `refs/tags/v${VERSION}` };
	const named = deps({}, ci);
	expect(release(["--publish", "--tarball", "/tmp/out/other-1.0.0.tgz"], named.fake)).not.toBe(0);
	expect(named.logged.join("\n")).toContain(`other-1.0.0.tgz is not lovrozagar-flare-${VERSION}.tgz`);
	expect(named.published()).toEqual([]);
	const bare = deps({}, ci);
	expect(release(["--publish"], bare.fake)).not.toBe(0);
	expect(bare.published()).toEqual([]);
	const real = deps({}, ci);
	expect(release(["--publish", "--tarball", TARBALL], real.fake)).toBe(0);
	expect(real.published().map((call) => call.args)).toEqual([
		["publish", TARBALL, "--access", "public", "--provenance"],
	]);
});
