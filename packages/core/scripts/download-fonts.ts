/**
 * Downloads woff2 font files from CDN URLs listed in font-urls.gen.json.
 *
 * Usage:
 *   bun run scripts/download-fonts.ts <outdir>
 *   bun run scripts/download-fonts.ts ../../flare-e2e/public
 *   bun run scripts/download-fonts.ts ../../flare-e2e/public --latin-only
 *   bun run scripts/download-fonts.ts ../../flare-e2e/public --force
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"

const BATCH_SIZE = 10

interface CliArgs {
	force: boolean
	latinOnly: boolean
	outDir: string
}

function parseArgs(): CliArgs {
	const args = process.argv.slice(2)
	const flags = new Set(args.filter((a) => a.startsWith("--")))
	const positional = args.filter((a) => !a.startsWith("--"))

	const outDir = positional[0]
	if (!outDir) {
		console.error("Usage: bun run scripts/download-fonts.ts <outdir> [--latin-only] [--force]")
		process.exit(1)
	}

	return {
		force: flags.has("--force"),
		latinOnly: flags.has("--latin-only"),
		outDir: resolve(outDir),
	}
}

async function downloadBatch(
	entries: Array<[localPath: string, cdnUrl: string]>,
	outDir: string,
	force: boolean,
): Promise<{ downloaded: number; skipped: number; failed: number }> {
	let downloaded = 0
	let skipped = 0
	let failed = 0

	const results = await Promise.allSettled(
		entries.map(async ([localPath, cdnUrl]) => {
			const dest = join(outDir, localPath)

			if (!force && existsSync(dest)) {
				skipped++
				return
			}

			const dir = dirname(dest)
			if (!existsSync(dir)) {
				mkdirSync(dir, { recursive: true })
			}

			const res = await fetch(cdnUrl)
			if (!res.ok) {
				console.error(`  FAIL ${localPath} (${res.status})`)
				failed++
				return
			}

			const buffer = await res.arrayBuffer()
			writeFileSync(dest, Buffer.from(buffer))
			downloaded++
		}),
	)

	for (const result of results) {
		if (result.status === "rejected") {
			console.error(`  ERROR: ${result.reason}`)
			failed++
		}
	}

	return { downloaded, failed, skipped }
}

async function main(): Promise<void> {
	const { force, latinOnly, outDir } = parseArgs()

	const urlMapPath = join(import.meta.dirname ?? ".", "..", "src", "fonts", "font-urls.gen.json")
	if (!existsSync(urlMapPath)) {
		console.error(`font-urls.gen.json not found at ${urlMapPath}`)
		console.error("Run scripts/populate-fonts.ts first to generate it.")
		process.exit(1)
	}

	const raw = readFileSync(urlMapPath, "utf-8")
	const urlMap = JSON.parse(raw) as Record<string, string>

	let entries = Object.entries(urlMap)

	if (latinOnly) {
		entries = entries.filter(([localPath]) => {
			const fileName = localPath.split("/").pop() ?? ""
			return fileName.startsWith("latin-") || fileName === "latin.woff2"
		})
	}

	const total = entries.length
	console.log(`Downloading ${total} woff2 files to ${outDir}`)
	if (latinOnly) console.log("  (latin-only mode)")
	if (force) console.log("  (force re-download)")

	let totalDownloaded = 0
	let totalSkipped = 0
	let totalFailed = 0

	for (let i = 0; i < entries.length; i += BATCH_SIZE) {
		const batch = entries.slice(i, i + BATCH_SIZE)
		const batchEnd = Math.min(i + BATCH_SIZE, total)
		process.stdout.write(`  [${batchEnd}/${total}] `)

		const { downloaded, failed, skipped } = await downloadBatch(batch, outDir, force)
		totalDownloaded += downloaded
		totalSkipped += skipped
		totalFailed += failed

		console.log(`+${downloaded} downloaded, ${skipped} skipped, ${failed} failed`)
	}

	console.log(
		`\nDone: ${totalDownloaded} downloaded, ${totalSkipped} skipped, ${totalFailed} failed`,
	)

	if (totalFailed > 0) {
		process.exit(1)
	}
}

main().catch(console.error)
