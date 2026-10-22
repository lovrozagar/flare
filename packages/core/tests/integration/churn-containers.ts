// network-churn.test's containers, the churn sidecars and the probe: each names its owner's pid, so a run removes only
// its own, never a peer's running one, and a run killed before its cleanup leaves containers the next run removes once
// their owner is gone (plan 34 9.1). Each also ends by itself: the churn loop at CHURN_SECONDS, the probe after its sleep.

export const CHURN_LABEL = "flare.churn=1"
const OWNER = "flare.churn.owner"
// Longer than the slowest case (600 s), so a live run's sidecar never stops under it.
export const CHURN_SECONDS = 900

type Docker = (...args: string[]) => { stdout: string }

export function ownedLabels(pid: number): string[] {
	return ["--label", CHURN_LABEL, "--label", `${OWNER}=${pid}`]
}

// Each labeled container's id and its owner's pid, 0 for one that names none.
function listed(docker: Docker): { id: string; owner: number }[] {
	const format = `{{.ID}} {{.Label "${OWNER}"}}`
	const rows = docker("ps", "-a", "--filter", `label=${CHURN_LABEL}`, "--format", format).stdout.split("\n")
	return rows
		.filter((row) => row.trim() !== "")
		.map((row) => {
			const [id = "", owner = ""] = row.trim().split(" ")
			return { id, owner: Number(owner) || 0 }
		})
}

function removed(docker: Docker, ids: string[]): string[] {
	if (ids.length > 0) docker("rm", "-f", ...ids)
	return ids
}

export function removeOwned(docker: Docker, pid: number): string[] {
	return removed(
		docker,
		listed(docker)
			.filter((each) => each.owner === pid)
			.map((each) => each.id),
	)
}

// Whether a process lives: signal 0 tests it without sending one, and EPERM is a live process of another user.
export function alive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === "EPERM"
	}
}

// One that names no owner is an older run's, which its own timeout ends.
export function removeOrphans(docker: Docker, alive: (pid: number) => boolean): string[] {
	return removed(
		docker,
		listed(docker)
			.filter((each) => each.owner !== 0 && !alive(each.owner))
			.map((each) => each.id),
	)
}
