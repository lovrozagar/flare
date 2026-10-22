import { spawn, spawnSync } from "node:child_process"
import { expect, it } from "vitest"
import { runPinned } from "../../../../scripts/docker-run.ts"
import { alive, ownedLabels, removeOrphans, removeOwned } from "./churn-containers.ts"

// A fake Docker holding labeled containers, each `id owner`; it records what it was asked to remove.
function fakeDocker(rows: readonly string[]): { docker: (...args: string[]) => { stdout: string }; removed: string[] } {
	const removed: string[] = []
	const docker = (...args: string[]) => {
		if (args[0] === "rm") removed.push(...args.slice(2))
		return { stdout: args[0] === "ps" ? rows.map((row) => `${row}\n`).join("") : "" }
	}
	return { docker, removed }
}

// Every churn container names its owner's pid beside the shared label.
it("owned labels", () => {
	expect(ownedLabels(42)).toEqual(["--label", "flare.churn=1", "--label", "flare.churn.owner=42"])
})

// A run's own cleanup removes its containers only, never a peer's running one.
it("removes its own", () => {
	const { docker, removed } = fakeDocker(["a 42", "b 43", "c 42"])
	expect(removeOwned(docker, 42)).toEqual(["a", "c"])
	expect(removed).toEqual(["a", "c"])
})

// A run killed before its cleanup leaves containers whose owner is gone: the next run removes those, and leaves a live
// owner's and one that names no owner (an older run's, bounded by its own timeout).
it("removes orphans", () => {
	const { docker, removed } = fakeDocker(["a 42", "b 43", "c ", "d 44"])
	expect(removeOrphans(docker, (pid) => pid === 43)).toEqual(["a", "d"])
	expect(removed).toEqual(["a", "d"])
})

// Nothing to remove asks Docker to remove nothing.
it("nothing left", () => {
	const { docker, removed } = fakeDocker([])
	expect([removeOwned(docker, 42), removeOrphans(docker, () => false), removed]).toEqual([[], [], []])
})

const BUSYBOX = "busybox@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e"
const dockerRun = (args: readonly string[]) => {
	const done = spawnSync(process.env["FLARE_DOCKER"] ?? "docker", args, { encoding: "utf8" })
	return { status: done.status, stdout: done.stdout ?? "", stderr: done.stderr ?? "" }
}
const docker = (...args: string[]) => dockerRun(args)

// With real Docker: an owner SIGKILLed before its cleanup leaves its container running, and the sweep removes it.
it("a killed owner's container", async (context) => {
	if (docker("version").status !== 0) return context.skip("needs Docker")
	const owner = spawn("sleep", ["60"])
	const pid = owner.pid ?? 0
	const started = runPinned(dockerRun, BUSYBOX, ["run", "-d", "--rm", ...ownedLabels(pid), BUSYBOX, "sleep", "60"])
	const id = started.stdout.trim()
	try {
		expect([started.status, id.length > 0]).toEqual([0, true])
		const exited = new Promise((resolve) => owner.once("exit", resolve))
		owner.kill("SIGKILL")
		await exited
		expect(docker("ps", "-q", "--no-trunc", "--filter", `id=${id}`).stdout.trim()).toBe(id)
		expect(removeOrphans(docker, alive).some((each) => id.startsWith(each))).toBe(true)
		expect(docker("ps", "-aq", "--filter", `id=${id}`).stdout.trim()).toBe("")
	} finally {
		owner.kill("SIGKILL")
		docker("rm", "-f", id)
	}
}, 120_000)
