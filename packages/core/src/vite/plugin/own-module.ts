import { fileURLToPath } from "url";

// A module of this package named by its source path, resolved from the module asking. From source the file is `.ts`.
// From the installed package it is the compiled `.js`, so the asking module's own extension decides (bits/14).
export function ownModule(path: string, from: string): string {
	const extension = from.endsWith(".ts") ? ".ts" : ".js";
	return fileURLToPath(new URL(path.replace(/\.tsx?$/, extension), from));
}
