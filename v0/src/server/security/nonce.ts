/**
 * Nonce Generation
 *
 * Generates cryptographically secure nonces for CSP.
 * Uses 128 bits of entropy (16 bytes → 32 hex chars).
 */

function generateNonce(): string {
	const array = new Uint8Array(16)
	crypto.getRandomValues(array)

	let result = ""
	for (let i = 0; i < array.length; i++) {
		const byte = array[i]
		if (byte !== undefined) {
			result += byte.toString(16).padStart(2, "0")
		}
	}
	return result
}

export { generateNonce }
