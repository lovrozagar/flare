import { defineConfig } from "vitest/config"

// The consumer cells (plan 21 5.5): each installs the packed tarball into a fresh project from the npm registry, so
// they need the network and stay out of `test` and `verify`. `bun run test:consumers` runs them; CI runs them in the
// `consumers` job, and with FLARE_CONSUMER_PEERS=newest daily and before a release. A cell packs, installs, builds,
// and serves: minutes on a runner, so a case gets 30 min, ten times the slowest local cell. Files run one at a time,
// since every cell is a full install and build.
const CELL_TIMEOUT = 1_800_000

export default defineConfig({
	root: import.meta.dirname,
	test: {
		name: "consumers",
		environment: "node",
		include: ["tests/consumers/**/*.consumer.test.ts"],
		testTimeout: CELL_TIMEOUT,
		hookTimeout: CELL_TIMEOUT,
		fileParallelism: false,
	},
})
