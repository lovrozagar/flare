import { spawnSync } from "node:child_process"

// A process's resident memory now, in MiB, by `ps -o rss=`, which Linux and macOS both have; undefined where `ps` is
// missing or fails, or the process is gone (BUGS.md 509). A peak taken from samples of it can miss a spike between two
// samples; Linux's VmHWM, which the build read before, was the true high-water mark but reads on Linux alone.
export function rssMiB(pid: number | undefined, command = "ps"): number | undefined {
	if (pid === undefined) return undefined
	const listed = spawnSync(command, ["-o", "rss=", "-p", String(pid)], { encoding: "utf8" })
	const kib = Number(listed.stdout?.trim())
	if (listed.error !== undefined || listed.status !== 0 || !Number.isFinite(kib) || kib <= 0) return undefined
	return kib / 1024
}

// A peak as a log line reads it: whole MiB, or why there is none.
export function peakText(peak: number | undefined): string {
	return peak === undefined ? "peak unknown (no ps)" : `peak ${peak.toFixed(0)} MiB`
}
