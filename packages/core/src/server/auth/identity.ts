import type { EffectiveAuth } from "./effective.ts";

export type PolicyClass = "required" | "anonymous";

export type Identity = {
	class: PolicyClass;
	key?: string;
};

export function identity(auth: EffectiveAuth, _session: unknown): Identity {
	if (auth.requires) return { class: "required" };
	return { class: "anonymous", key: "" };
}
