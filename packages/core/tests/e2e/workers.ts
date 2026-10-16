import { readFileSync } from "node:fs"
import { availableParallelism, freemem } from "node:os"

// One e2e worker at its peak: its subtree (the servers and builds it boots), its share of the runner, and the
// browsers it drives. Measured from the 1 s memory polls beside two full verifies on 2026-10-16 (BUGS.md 128.17 to
// 128.19, .tmp/grunt/p14/b128-worker-peak.py): at most 20.2 GB over 8 workers, 2.52 GB each, rounded up.
export const WORKER_PEAK_BYTES = 2.6e9

// What a local run leaves for everything else on the machine: other sessions, editors, and what starts mid-run.
export const RESERVE_BYTES = 2e9

// workers = max(1, min(⌊cores / 2⌋, ⌊(MemAvailable − reserve) / peak per worker⌋)). Eight workers at 2.5 GB each ran
// a 30 GB machine down to 2.4 GB available, and the kernel's pressure killed a server or a worker (BUGS.md 128). CI
// keeps Playwright's own count, half the cores, on runners that run nothing else.
export function gridWorkers(input: { ci: boolean; cores: number; available: number }): number | undefined {
	if (input.ci) return undefined
	const byMemory = Math.floor((input.available - RESERVE_BYTES) / WORKER_PEAK_BYTES)
	return Math.max(1, Math.min(Math.floor(input.cores / 2), byMemory))
}

// MemAvailable, the kernel's estimate of what can be allocated without swapping. Without /proc (macOS), free memory.
export function memAvailable(meminfo = "/proc/meminfo"): number {
	try {
		const kb = /^MemAvailable:\s+(\d+) kB$/m.exec(readFileSync(meminfo, "utf8"))?.[1]
		if (kb !== undefined) return Number(kb) * 1024
	} catch {
		// No /proc: the fallback below.
	}
	return freemem()
}

// Bytes as gigabytes, one decimal.
const gb = (bytes: number): string => (bytes / 1e9).toFixed(1)

// The count for this machine now, and the line a run logs once at its start.
export function machineWorkers(env: NodeJS.ProcessEnv): { workers: number | undefined; line: string } {
	const available = memAvailable()
	const cores = availableParallelism()
	const workers = gridWorkers({ ci: env["CI"] !== undefined, cores, available })
	const chosen = workers === undefined ? "Playwright's default (CI)" : String(workers)
	return { workers, line: `[flare e2e] workers: ${chosen}; ${cores} cores, ${gb(available)} GB available` }
}
