import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, it } from "vitest"
import { fetchNode, nodeAt, NODES, type Pin } from "./node-at.ts"

const dirs: string[] = []

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function temp(): string {
	const dir = mkdtempSync(join(tmpdir(), "node-at-test-"))
	dirs.push(dir)
	return dir
}

// A tarball laid out as nodejs.org's: `node-v<version>-<platform>/bin/node` and the bundled npm's CLI.
function fakeNode(version: string, platform: string): { bytes: Buffer; sum: string } {
	const root = temp()
	const name = `node-v${version}-${platform}`
	mkdirSync(join(root, name, "bin"), { recursive: true })
	mkdirSync(join(root, name, "lib/node_modules/npm/bin"), { recursive: true })
	writeFileSync(join(root, name, "bin/node"), "#!/bin/sh\n")
	writeFileSync(join(root, name, "lib/node_modules/npm/bin/npm-cli.js"), "")
	const tarball = join(root, "node.tar.gz")
	execFileSync("tar", ["-czf", tarball, "-C", root, name])
	const bytes = readFileSync(tarball)
	return { bytes, sum: createHash("sha256").update(bytes).digest("hex") }
}

function served(bytes: Buffer): { fetch: (url: string) => Promise<Response>; urls: string[] } {
	const urls: string[] = []
	return {
		urls,
		fetch: async (url) => {
			urls.push(url)
			return new Response(new Uint8Array(bytes))
		},
	}
}

it("fetches and caches", async () => {
	const { bytes, sum } = fakeNode("9.9.9", "linux-x64")
	const pin: Pin = { version: "9.9.9", sums: { "linux-x64": sum } }
	const cache = temp()
	const net = served(bytes)
	const first = await fetchNode(pin, { platform: "linux", arch: "x64", fetch: net.fetch, cache })
	expect(first).toEqual({
		node: join(cache, "node-v9.9.9-linux-x64/bin/node"),
		npm: join(cache, "node-v9.9.9-linux-x64/lib/node_modules/npm/bin/npm-cli.js"),
	})
	expect(net.urls).toEqual(["https://nodejs.org/dist/v9.9.9/node-v9.9.9-linux-x64.tar.gz"])
	expect(existsSync(first.node)).toBe(true)
	const second = await fetchNode(pin, { platform: "linux", arch: "x64", fetch: net.fetch, cache })
	expect([second, net.urls.length]).toEqual([first, 1])
})

it("rejects a wrong sum", async () => {
	const { bytes } = fakeNode("9.9.9", "darwin-arm64")
	const pin: Pin = { version: "9.9.9", sums: { "darwin-arm64": "0".repeat(64) } }
	const cache = temp()
	const net = served(bytes)
	await expect(fetchNode(pin, { platform: "darwin", arch: "arm64", fetch: net.fetch, cache })).rejects.toThrow(
		"node-at: node-v9.9.9-darwin-arm64.tar.gz has sha256",
	)
	expect(existsSync(join(cache, "node-v9.9.9-darwin-arm64"))).toBe(false)
})

const gone = async (): Promise<Response> => new Response("gone", { status: 404 })

it("failed download", async () => {
	const pin: Pin = { version: "9.9.9", sums: { "linux-x64": "0".repeat(64) } }
	await expect(fetchNode(pin, { platform: "linux", arch: "x64", fetch: gone, cache: temp() })).rejects.toThrow(
		"node-at: https://nodejs.org/dist/v9.9.9/node-v9.9.9-linux-x64.tar.gz answered 404",
	)
})

it("unsupported platform", async () => {
	const pin: Pin = { version: "9.9.9", sums: { "linux-x64": "0".repeat(64) } }
	const net = served(Buffer.from(""))
	await expect(fetchNode(pin, { platform: "win32", arch: "x64", fetch: net.fetch, cache: temp() })).rejects.toThrow(
		"node-at: no pinned Node 9.9.9 for win32-x64",
	)
	expect(net.urls).toEqual([])
})

it("unpinned version", async () => {
	await expect(nodeAt("20.0.0")).rejects.toThrow("node-at: Node 20.0.0 is not pinned (22.12.0, 24.22.0)")
})

// The two pins: the published floor (B3) and the current 24 LTS, each with nodejs.org's SHASUMS256 for the four
// platforms CI and the two local machines run.
it("pins", () => {
	expect(Object.keys(NODES)).toEqual(["22.12.0", "24.22.0"])
	for (const pin of Object.values(NODES)) {
		expect(Object.keys(pin.sums).toSorted()).toEqual(["darwin-arm64", "darwin-x64", "linux-arm64", "linux-x64"])
		for (const sum of Object.values(pin.sums)) expect(sum).toMatch(/^[0-9a-f]{64}$/)
	}
})
