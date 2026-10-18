import { cpSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { bootApp, type Boot } from "./boot.ts"

const apps = fileURLToPath(new URL("./apps/", import.meta.url))
const repo = fileURLToPath(new URL("../../../../", import.meta.url))
const DEPS = "node_modules"

// A dev boot over a private copy of an app, for a case that writes into the app, such as an HMR edit: the shared app
// is never written, so no other boot sees the edit (B70, BUGS.md 111). The copy is in the OS temp dir with the repo's
// dependencies linked in, and goes on close. Under the boot outputs, Tailwind's scanner reads sources beyond the app's
// own: the docs page carried 187 KB of dev styles there, against 68 KB from the app and from this copy alike.
export async function bootCopy(input: {
	app: "minimal" | "basepath" | "docs" | "dashboard"
	runtime: string
}): Promise<Boot> {
	const appDir = await mkdtemp(join(tmpdir(), `flare-${input.app}-`))
	try {
		copyApp(join(apps, input.app), appDir)
		return await bootApp({ appDir, runtime: input.runtime, mode: "dev", dirs: [appDir] })
	} catch (error) {
		rmSync(appDir, { recursive: true, force: true })
		throw error
	}
}

// The app's sources and config, without what a boot left in it. The tsconfig's relative `extends` points back at the
// repo's base. The removal on close unlinks the dependency link and leaves the repo's dependencies alone.
function copyApp(from: string, to: string): void {
	const skipped = [DEPS, ".wrangler", "dist"].map((name) => join(from, name))
	const kept = (path: string): boolean => !skipped.some((dir) => path === dir || path.startsWith(`${dir}/`))
	cpSync(from, to, { recursive: true, filter: kept })
	symlinkSync(join(repo, DEPS), join(to, DEPS), "dir")
	const tsconfig = join(to, "tsconfig.json")
	const base = JSON.stringify(join(repo, "tsconfig.base.json"))
	writeFileSync(
		tsconfig,
		readFileSync(tsconfig, "utf8").replace(/"extends": "[./]*tsconfig\.base\.json"/, `"extends": ${base}`),
	)
}
