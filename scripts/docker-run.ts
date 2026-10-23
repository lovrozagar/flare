import { spawnSync } from "node:child_process"

// One `docker` call's outcome. `signal` names what ended a call a signal ended, its status then null (BUGS.md 500.9).
export type DockerResult = { status: number | null; signal?: NodeJS.Signals | null; stdout: string; stderr: string }

// One call of the Docker CLI, FLARE_DOCKER's when set, as the tests that start containers read it.
export function dockerRun(args: readonly string[]): DockerResult {
	const done = spawnSync(process.env["FLARE_DOCKER"] ?? "docker", args, { encoding: "utf8" })
	return { status: done.status, signal: done.signal, stdout: done.stdout ?? "", stderr: done.stderr ?? "" }
}

// A pinned image's container start that survives the machine's pruner (BUGS.md 484): `docker-auto-prune` removes an
// image nothing uses, and can take its layers while a run is unpacking them ("parent snapshot … does not exist") or the
// lease of a pull in flight ("lease does not exist"). On that, or an image Docker no longer has, the image is pulled
// again by its digest and the run retried, three runs at most; any other failure is returned for the caller to judge.
const PRUNED = /No such image|parent snapshot [^\n]* does not exist|lease does not exist/

export function runPinned(
	run: (args: readonly string[]) => DockerResult,
	image: string,
	args: readonly string[],
	attempts = 3,
): DockerResult {
	let last: DockerResult = { status: null, stdout: "", stderr: "" }
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		last = run(args)
		if (last.status === 0 || !PRUNED.test(last.stderr)) return last
		if (attempt < attempts) run(["pull", image])
	}
	throw new Error(
		`docker could not run ${image} after ${attempts} attempts, pulling it again between them: ${last.stderr}`,
	)
}
