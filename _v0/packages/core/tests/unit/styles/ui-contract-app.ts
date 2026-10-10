/**
 * A private copy of the ui-contract fixture app per test file. A build writes `dist/` and
 * `src/_gen/` inside the app root, so files sharing one root raced when vitest ran them in
 * parallel: one file's cleanup removed another's output mid-build (ENOTEMPTY). Copies sit beside
 * the fixture, so package resolution is unchanged.
 */
import { cp, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE = fileURLToPath(new URL("../../fixtures/ui-contract-app", import.meta.url));

export interface UiContractApp {
	dispose(): Promise<void>;
	root: string;
}

export async function copyUiContractApp(name: string): Promise<UiContractApp> {
	const root = `${FIXTURE}-${name}`;
	await rm(root, { force: true, recursive: true });
	await cp(FIXTURE, root, { filter: (src) => src !== join(FIXTURE, "dist"), recursive: true });
	return { dispose: () => rm(root, { force: true, recursive: true }), root };
}
