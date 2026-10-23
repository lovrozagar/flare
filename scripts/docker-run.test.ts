import { expect, it, vi } from "vitest"
import { dockerRun, runPinned, type DockerResult } from "./docker-run.ts"

const IMAGE = "busybox@sha256:fd7dc98638c8e305f4dc34e979f1c0fdfdcaeb0fbf8fcff77ae834b6da3d7e6e"
const ok: DockerResult = { status: 0, stdout: "id\n", stderr: "" }
const missing: DockerResult = {
	status: 125,
	stdout: "",
	stderr: "Unable to find image 'busybox' locally\nNo such image",
}
const snapshot: DockerResult = {
	status: 125,
	stdout: "",
	stderr: "docker: Error response from daemon: NotFound: parent snapshot sha256:6cd03 does not exist: not found.",
}
const lease: DockerResult = {
	status: 125,
	stdout: "",
	stderr:
		"Unable to find image 'busybox@sha256:fd7dc' locally\ndocker: Error response from daemon: lease does not exist: not found",
}
const other: DockerResult = { status: 125, stdout: "", stderr: "permission denied while trying to connect" }

// A runner that answers `run` from `runs` in turn and records every call.
function runner(runs: DockerResult[]) {
	const calls: (readonly string[])[] = []
	const run = (args: readonly string[]): DockerResult => {
		calls.push(args)
		if (args[0] === "pull") return ok
		return runs.shift() ?? ok
	}
	return { run, calls }
}

// The machine's pruner removes an unused image, and can take its layers while a run unpacks them, or the lease of a pull
// in flight: the image is pulled again by its digest and the run retried.
it("pruned image pulled again", () => {
	for (const lost of [missing, snapshot, lease]) {
		const { run, calls } = runner([lost, ok])
		expect(runPinned(run, IMAGE, ["run", "-d", IMAGE, "true"])).toEqual(ok)
		expect(calls).toEqual([
			["run", "-d", IMAGE, "true"],
			["pull", IMAGE],
			["run", "-d", IMAGE, "true"],
		])
	}
})

// Any other failure is the caller's to judge: returned at once, no pull.
it("other failures pass through", () => {
	const { run, calls } = runner([other])
	expect(runPinned(run, IMAGE, ["run", IMAGE])).toEqual(other)
	expect(calls).toEqual([["run", IMAGE]])
})

// Three runs at most; the last image error throws, naming the image and what Docker said.
it("bounded", () => {
	const { run, calls } = runner([snapshot, snapshot, snapshot, ok])
	expect(() => runPinned(run, IMAGE, ["run", IMAGE])).toThrow(
		`docker could not run ${IMAGE} after 3 attempts, pulling it again between them: ${snapshot.stderr}`,
	)
	expect(calls.filter((args) => args[0] === "run")).toHaveLength(3)
})

// A Docker call a signal ended reports the signal beside its null status, so a test that starts a container names a
// kill rather than an empty failure. The child is real: FLARE_DOCKER points the call at sh, which SIGKILLs itself
// (BUGS.md 500.9).
it("killed call named", () => {
	vi.stubEnv("FLARE_DOCKER", "sh")
	try {
		expect(dockerRun(["-c", "kill -9 $$"])).toEqual({ status: null, signal: "SIGKILL", stdout: "", stderr: "" })
		expect(dockerRun(["-c", "echo broke >&2; exit 3"])).toEqual({
			status: 3,
			signal: null,
			stdout: "",
			stderr: "broke\n",
		})
	} finally {
		vi.unstubAllEnvs()
	}
})
