import { writeFileSync } from "node:fs"
import { StringDecoder } from "node:string_decoder"
import type { Readable } from "node:stream"

// What an e2e boot's server printed, and the boots alive in this process, so a failed case carries what their servers
// logged while it ran (crash.ts). Split from boot.ts at its 300-line limit.

type Logged = { origin: string; logs: () => readonly string[]; close: () => Promise<void> }

// What attachServerLog needs of Playwright's TestInfo.
type CaseInfo = {
	attachments: readonly { name: string }[]
	outputPath(name: string): string
	attach(name: string, options: { path: string; contentType: string }): Promise<void>
}

// A runtime's output, split into lines as it arrives. A line still being written is the last entry.
// ANSI escape sequences: Bun colors console.error when the environment forces color, as Playwright's workers do.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, "g")

export function capture() {
	const lines: string[] = []
	const pending: string[] = []
	return {
		attach(stream: Readable | null) {
			const decoder = new StringDecoder("utf8")
			const slot = pending.push("") - 1
			stream?.on("data", (chunk: Buffer) => {
				const parts = `${pending[slot]}${decoder.write(chunk)}`.split("\n")
				pending[slot] = parts.pop() ?? ""
				lines.push(...parts.map((line) => line.replaceAll(ANSI, "")))
			})
		},
		line: (text: string) => void lines.push(...text.replaceAll(ANSI, "").split("\n")),
		logs: () => [...lines, ...pending.filter((line) => line !== "").map((line) => line.replaceAll(ANSI, ""))],
	}
}

const live = new Set<Logged>()

// The boot, counted alive until it closes.
export function tracked<T extends Logged>(boot: T): T {
	live.add(boot)
	const close = boot.close
	return Object.assign(boot, {
		close: () => {
			live.delete(boot)
			return close()
		},
	})
}

// Where each live boot's log stood, so the lines a case added can be told from the boot's earlier ones.
export function logMarks(): Map<Logged, number> {
	return new Map([...live].map((boot) => [boot, boot.logs().length]))
}

// Each live boot's lines since `marks`, under its origin: a boot started during the case gives all of its lines. A
// fixture that attached its own `server log` (docs.fixture.ts, dashboard.fixture.ts) keeps it.
export async function attachServerLog(info: CaseInfo, marks: Map<Logged, number>): Promise<void> {
	if (info.attachments.some((attachment) => attachment.name === "server log")) return
	const lines = [...live].flatMap((boot) => [`== ${boot.origin}`, ...boot.logs().slice(marks.get(boot) ?? 0)])
	const path = info.outputPath("server-log.txt")
	writeFileSync(path, `${lines.join("\n")}\n`)
	await info.attach("server log", { path, contentType: "text/plain" })
}
