import { createHash } from "node:crypto"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

// A Node release nodejs.org publishes, by exact version, with the SHA-256 of its tarball per `<os>-<arch>`.
export type Pin = { version: string; sums: Record<string, string> }

// The Nodes the consumer cells run (plan 21 5.5), never the host's: the published floor (B3) and the current 24 LTS,
// whose bundled npm installs every consumer project. The sums are nodejs.org's SHASUMS256.txt for each release.
export const NODES = {
	"22.12.0": {
		version: "22.12.0",
		sums: {
			"linux-x64": "e05a4d65232ae2b27b3d77da2e368522fb46b923335b8e0d5f77624c32484044",
			"linux-arm64": "9e7905fdee722f9650a03ae644b51c4c6effd3b98ac93c588700072ab35c9ddb",
			"darwin-arm64": "293dcc6c2408da21562d135b0412525e381bb6fe150d688edb58fe850d0f3e13",
			"darwin-x64": "52bc25dd026db7247c3c00439afdb83e95087248267f02d6c1a7250d1f896173",
		},
	},
	"24.22.0": {
		version: "24.22.0",
		sums: {
			"linux-x64": "28ea0a438de9a13bd7891fd758eee6c7819ee8af5442dfd8d45bd65e56d4228c",
			"linux-arm64": "b7e7991d5407815adfa74a2a9cd4db683552c8ce32ff4a295c22e972849c3f5d",
			"darwin-arm64": "6a9724d9b50a5f22b4816cded441b5a8d9ddae546191a5e5b7efa5a5e2ee26d5",
			"darwin-x64": "495e3f273c645f3c4677d438304cdfc701729ea5dec5728f5c8e76a2dece4b91",
		},
	},
} as const satisfies Record<string, Pin>

// A pinned Node on disk: its binary and its bundled npm's CLI, which that binary runs.
export type PinnedNode = { node: string; npm: string }

export type NodeAtDeps = {
	platform: string
	arch: string
	fetch: (url: string) => Promise<Response>
	cache: string
}

// The pinned Node `version` for this machine, downloaded once into `FLARE_NODE_CACHE` (default under the OS temp dir)
// and checked against its pinned sum.
export function nodeAt(version: string, deps: Partial<NodeAtDeps> = {}): Promise<PinnedNode> {
	const pin: Pin | undefined = Reflect.get(NODES, version)
	if (pin === undefined) {
		return Promise.reject(new Error(`node-at: Node ${version} is not pinned (${Object.keys(NODES).join(", ")})`))
	}
	return fetchNode(pin, {
		platform: deps.platform ?? process.platform,
		arch: deps.arch ?? process.arch,
		fetch: deps.fetch ?? ((url) => fetch(url)),
		cache: deps.cache ?? process.env["FLARE_NODE_CACHE"] ?? join(tmpdir(), "flare-node"),
	})
}

// Downloads `pin` for one platform, verifies it, and unpacks it into `cache/node-v<version>-<os>-<arch>`. The tree
// is unpacked beside the cache and renamed in, so a parallel run never sees half of it; a second call reads the cache.
export async function fetchNode(pin: Pin, deps: NodeAtDeps): Promise<PinnedNode> {
	const target = `${deps.platform}-${deps.arch}`
	const sum = pin.sums[target]
	if (sum === undefined) throw new Error(`node-at: no pinned Node ${pin.version} for ${target}`)
	const name = `node-v${pin.version}-${target}`
	const dir = join(deps.cache, name)
	const pinned = { node: join(dir, "bin/node"), npm: join(dir, "lib/node_modules/npm/bin/npm-cli.js") }
	if (existsSync(pinned.node)) return pinned
	const url = `https://nodejs.org/dist/v${pin.version}/${name}.tar.gz`
	const response = await deps.fetch(url)
	if (!response.ok) throw new Error(`node-at: ${url} answered ${response.status}`)
	const bytes = new Uint8Array(await response.arrayBuffer())
	const actual = createHash("sha256").update(bytes).digest("hex")
	if (actual !== sum) throw new Error(`node-at: ${name}.tar.gz has sha256 ${actual}, pinned ${sum}`)
	mkdirSync(deps.cache, { recursive: true })
	const work = mkdtempSync(join(deps.cache, ".unpack-"))
	try {
		const tarball = join(work, `${name}.tar.gz`)
		writeFileSync(tarball, bytes)
		execFileSync("tar", ["-xzf", tarball, "-C", work])
		// Another run may have renamed the same tree in first; its copy is as good as this one.
		if (!existsSync(dir)) renameSync(join(work, name), dir)
	} finally {
		rmSync(work, { recursive: true, force: true })
	}
	return pinned
}

// `bun scripts/node-at.ts <version>` prints that pinned Node's binary path.
if (import.meta.main) {
	const pinned = await nodeAt(process.argv[2] ?? "")
	console.log(pinned.node)
}
