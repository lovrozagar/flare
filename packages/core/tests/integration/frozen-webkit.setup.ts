import { webkit } from "@playwright/test"
import { beforeEach, type TestContext } from "vitest"
import { browserEndpoint, FROZEN_WEBKIT, frozenWebkit } from "../../../../scripts/browser-server.ts"

// The integration project's setup file: it runs before each test file, so every WebKit case gets the hook below.

// Whether a case runs under WebKit: a suite above it whose name starts with `webkit`, as `describe.each(ENGINES)`
// names them, `webkit visitor` too.
function underWebkit(task: TestContext["task"]): boolean {
	for (let suite = task.suite; suite !== undefined; suite = suite.suite) {
		if (suite.name.split(" ")[0] === "webkit") return true
	}
	return false
}

// With the installed engines and Playwright's frozen WebKit, the macOS 14 build that opens no page, each WebKit case
// skips with the reason, so a report counts it skipped and names why, never a pass or a 60 s timeout (BUGS.md 351).
// The path is read first, so only a machine with that build asks where the engines come from (scripts/browser-server.ts).
beforeEach(async (context) => {
	if (!underWebkit(context.task) || !frozenWebkit(webkit.executablePath())) return
	if ((await browserEndpoint()) === undefined) context.skip(FROZEN_WEBKIT)
})
