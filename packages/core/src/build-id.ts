/**
 * Build id of the page the client booted from (`FlareState.b`). Data and server-fn
 * requests send it so the server can tell a client from a previous deploy.
 * Undefined before hydration and for pages rendered without a build (dev, tests).
 */
let clientBuildId: string | undefined;

export function setBuildId(id: string | undefined): void {
	clientBuildId = id;
}

export function getBuildId(): string | undefined {
	return clientBuildId;
}
