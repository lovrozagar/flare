// One `docker` call's outcome.
export type DockerResult = { status: number | null; stdout: string; stderr: string }

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
