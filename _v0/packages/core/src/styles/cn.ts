import tables from "./cn-vendor/tables.generated.ts";
import { createEngine, wrapClsx } from "./cn-vendor/engine.ts";

/** Accepted input shapes for `cn()`. Superset of the JSX `ClassValue` — adds object maps. */
export type CnValue = string | false | null | undefined | Record<string, boolean> | CnValue[];

const instance = /* @__PURE__ */ createEngine(tables);

/** Same merge the sx plugin runs on a fully static class string. */
export function mergeClassList(input: string): string {
	return instance.mergeString(input);
}

/** Join class values and resolve Tailwind conflicts. Last conflicting utility wins. */
export const cn = /* @__PURE__ */ wrapClsx(instance.mergeString, instance) as (...inputs: CnValue[]) => string;
