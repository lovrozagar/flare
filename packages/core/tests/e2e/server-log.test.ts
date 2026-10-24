import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { expect, it } from "vitest"
import { attachServerLog, capture, logMarks, serverLines, tracked } from "./server-log.ts"

// A failed case's server log: each live boot's lines since the case began, under its origin. A closed boot is gone, and
// a fixture's own `server log` is kept.
it("server log", async () => {
	const dir = mkdtempSync(join(tmpdir(), "flare-server-log-"))
	const lines = ["before"]
	const closed: string[] = []
	const fake = tracked({
		origin: "http://127.0.0.1:1",
		logs: () => lines,
		close: async () => void closed.push("closed"),
	})
	const marks = logMarks()
	lines.push("during")
	const info = { attachments: [] as { name: string; path?: string }[], outputPath: (name: string) => join(dir, name) }
	const attach = async (name: string, options: { path: string; contentType: string }): Promise<void> =>
		void info.attachments.push({ name, path: options.path })
	await attachServerLog({ ...info, attach }, marks)
	expect(info.attachments.map((item) => item.name)).toEqual(["server log"])
	expect(readFileSync(join(dir, "server-log.txt"), "utf8")).toContain("== http://127.0.0.1:1\nduring\n")
	expect(readFileSync(join(dir, "server-log.txt"), "utf8")).not.toContain("before")
	await attachServerLog({ ...info, attach }, marks)
	expect(info.attachments).toHaveLength(1)
	await fake.close()
	expect(closed).toEqual(["closed"])
	expect(logMarks().has(fake)).toBe(false)
})

// A boot the case itself closed, as dev-hmr closes its private copy in its own `finally`, keeps its lines for that
// case's server log: the fixture collects after the case's body ends (BUGS.md 510). A boot closed before the case
// began is not listed.
it("server log closed during case", async () => {
	const early = tracked({ origin: "http://127.0.0.1:2", logs: () => ["gone"], close: async () => undefined })
	await early.close()
	const marks = logMarks()
	const lines = ["booted", "served"]
	const own = tracked({ origin: "http://127.0.0.1:3", logs: () => lines, close: async () => undefined })
	await own.close()
	expect(serverLines(marks)).toContain("== http://127.0.0.1:3")
	expect(serverLines(marks).slice(serverLines(marks).indexOf("== http://127.0.0.1:3"))).toEqual([
		"== http://127.0.0.1:3",
		"booted",
		"served",
	])
	expect(serverLines(marks)).not.toContain("== http://127.0.0.1:2")
})

// A stream's output, split into lines as it arrives: a line split across chunks is one line, a line still being
// written is the last entry, and ANSI colors are gone.
it("capture", () => {
	const output = capture()
	const listeners: ((chunk: Buffer) => void)[] = []
	output.attach({ on: (_event: string, listener: (chunk: Buffer) => void) => void listeners.push(listener) } as never)
	output.attach(null)
	listeners[0]?.(Buffer.from("one\ntw"))
	listeners[0]?.(Buffer.from(`o\n${String.fromCharCode(27)}[31mred${String.fromCharCode(27)}[0m\npart`))
	output.line(`${String.fromCharCode(27)}[1mbold${String.fromCharCode(27)}[0m`)
	expect(output.logs()).toEqual(["one", "two", "red", "bold", "part"])
})
