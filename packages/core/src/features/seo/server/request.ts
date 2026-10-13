// What every submitter returns. `error` names the service and the status only, so it never holds a key or a token.
export type SubmitResult = { ok: true } | { ok: false; error: string };

export const JSON_TYPE = "application/json; charset=utf-8";

function parsed(value: string): URL | undefined {
	return URL.canParse(value) ? new URL(value) : undefined;
}

export function isHttpsUrl(value: string): boolean {
	return parsed(value)?.protocol === "https:";
}

// `https://host[:port]`, with at most a bare `/` after it.
export function isHttpsOrigin(value: string): boolean {
	const url = parsed(value);
	return url?.protocol === "https:" && url.origin === value.replace(/\/$/, "");
}

export function failure(error: string): SubmitResult {
	return { ok: false, error };
}

// One request. A non-2xx and a thrown fetch are failures named by `service`, never thrown, and the thrown error's
// message is dropped because it may echo the url and its key.
export async function send(service: string, url: string, init: RequestInit): Promise<SubmitResult> {
	try {
		const response = await fetch(url, init);
		await response.body?.cancel();
		return response.ok ? { ok: true } : failure(`${service} answered ${response.status}`);
	} catch {
		return failure(`${service} request failed`);
	}
}
