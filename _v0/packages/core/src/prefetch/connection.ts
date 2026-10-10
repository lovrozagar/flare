/** Data Saver on, or a 2G-class connection: prefetch only what is about to be used. Client-safe. */
export function constrainedConnection(): boolean {
	if (typeof navigator === "undefined") return false;
	const connection = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } })
		.connection;
	if (!connection) return false;
	return connection.saveData === true || connection.effectiveType === "slow-2g" || connection.effectiveType === "2g";
}
