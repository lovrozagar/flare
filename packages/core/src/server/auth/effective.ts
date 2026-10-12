export type AuthModule = {
	authenticate?: true;
	authenticateOptional?: true;
	authorize?: true;
	hint?: "public";
};

export type EffectiveAuth = {
	requires: boolean;
	reads: boolean;
};

export function effectiveAuth(modules: readonly AuthModule[]): EffectiveAuth {
	let requires = false;
	let reads = false;
	for (const loaded of modules) {
		if (loaded.authenticate === true) {
			requires = true;
			reads = true;
		}
		if (loaded.authenticateOptional === true) reads = true;
		if (loaded.authorize === true) reads = true;
	}
	return { requires, reads };
}
