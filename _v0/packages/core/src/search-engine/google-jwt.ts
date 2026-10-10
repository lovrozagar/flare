/* ── Types ────────────────────────────────────────────────────────────── */

export interface ServiceAccountCredentials {
	clientEmail: string;
	privateKey: string;
}

interface TokenResponse {
	access_token: string;
	expires_in: number;
	token_type: string;
}

/* ── Base64url ────────────────────────────────────────────────────────── */

function base64url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i] ?? 0);
	}
	return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlEncode(str: string): string {
	const encoder = new TextEncoder();
	return base64url(encoder.encode(str).buffer as ArrayBuffer);
}

/* ── PEM parsing ──────────────────────────────────────────────────────── */

function parsePemKey(pem: string): Uint8Array {
	const lines = pem
		.replace(/-----BEGIN [\w\s]+-----/, "")
		.replace(/-----END [\w\s]+-----/, "")
		.replace(/\s+/g, "");
	const binary = atob(lines);
	const buffer = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		buffer[i] = binary.charCodeAt(i);
	}
	return buffer;
}

/* ── JWT signing ──────────────────────────────────────────────────────── */

export async function signJwt(payload: Record<string, unknown>, privateKeyPem: string): Promise<string> {
	const keyBytes = parsePemKey(privateKeyPem);
	const keyBuffer = new ArrayBuffer(keyBytes.length);
	new Uint8Array(keyBuffer).set(keyBytes);
	const key = await crypto.subtle.importKey("pkcs8", keyBuffer, { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" }, false, [
		"sign",
	]);

	const header = base64urlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const claims = base64urlEncode(JSON.stringify(payload));
	const input = `${header}.${claims}`;

	const encoder = new TextEncoder();
	const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, encoder.encode(input));

	return `${input}.${base64url(signature)}`;
}

/* ── Token exchange ───────────────────────────────────────────────────── */

const JWT_EXPIRY_SECONDS = 3600;

export async function getGoogleAccessToken(credentials: ServiceAccountCredentials, scope: string): Promise<string> {
	const now = Math.floor(Date.now() / 1000);
	const jwt = await signJwt(
		{
			aud: "https://oauth2.googleapis.com/token",
			exp: now + JWT_EXPIRY_SECONDS,
			iat: now,
			iss: credentials.clientEmail,
			scope,
		},
		credentials.privateKey,
	);

	const response = await fetch("https://oauth2.googleapis.com/token", {
		body: `grant_type=${encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer")}&assertion=${encodeURIComponent(jwt)}`,
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		method: "POST",
	});

	if (!response.ok) {
		await response.body?.cancel();
		throw new Error(`Google token exchange failed (${response.status})`);
	}

	const data = (await response.json()) as TokenResponse;
	return data.access_token;
}
