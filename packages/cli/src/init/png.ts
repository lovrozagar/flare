import { deflateSync } from "node:zlib"

/**
 * Generate a minimal valid PNG with a solid color.
 * No external deps — just zlib (node built-in).
 */
export function generatePlaceholderPng(size: number, r: number, g: number, b: number): Buffer {
	const width = size
	const height = size

	/* Raw image data: each row = filter byte (0) + RGB pixels */
	const rawData = Buffer.alloc((width * 3 + 1) * height)
	for (let y = 0; y < height; y++) {
		const rowOffset = y * (width * 3 + 1)
		rawData[rowOffset] = 0 /* filter: none */
		for (let x = 0; x < width; x++) {
			const px = rowOffset + 1 + x * 3
			rawData[px] = r
			rawData[px + 1] = g
			rawData[px + 2] = b
		}
	}

	const compressed = deflateSync(rawData)

	const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
	const ihdr = createChunk("IHDR", ihdrData(width, height))
	const idat = createChunk("IDAT", compressed)
	const iend = createChunk("IEND", Buffer.alloc(0))

	return Buffer.concat([signature, ihdr, idat, iend])
}

function ihdrData(width: number, height: number): Buffer {
	const buf = Buffer.alloc(13)
	buf.writeUInt32BE(width, 0)
	buf.writeUInt32BE(height, 4)
	buf[8] = 8 /* bit depth */
	buf[9] = 2 /* color type: RGB */
	buf[10] = 0 /* compression */
	buf[11] = 0 /* filter */
	buf[12] = 0 /* interlace */
	return buf
}

function createChunk(type: string, data: Buffer): Buffer {
	const length = Buffer.alloc(4)
	length.writeUInt32BE(data.length, 0)

	const typeBuffer = Buffer.from(type, "ascii")
	const crcInput = Buffer.concat([typeBuffer, data])
	const crc = Buffer.alloc(4)
	crc.writeUInt32BE(crc32(crcInput), 0)

	return Buffer.concat([length, typeBuffer, data, crc])
}

/* CRC-32 per PNG spec */
const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n++) {
	let c = n
	for (let k = 0; k < 8; k++) {
		c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
	}
	crcTable[n] = c
}

function crc32(buf: Buffer): number {
	let crc = 0xffffffff
	for (let i = 0; i < buf.length; i++) {
		crc = (crcTable[(crc ^ (buf[i] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8)
	}
	return (crc ^ 0xffffffff) >>> 0
}

/* Pre-generated placeholder set: black square with white center dot */
export function generateFaviconSet(): Record<string, Buffer> {
	return {
		"apple-touch-icon.png": generatePlaceholderPng(180, 0, 0, 0),
		"favicon-96x96.png": generatePlaceholderPng(96, 0, 0, 0),
		"web-app-manifest-192x192.png": generatePlaceholderPng(192, 0, 0, 0),
		"web-app-manifest-512x512.png": generatePlaceholderPng(512, 0, 0, 0),
	}
}

/**
 * Minimal valid ICO file — 32x32 embedded BMP.
 * ICO format: header + directory entry + BMP DIB data.
 */
export function generatePlaceholderIco(): Buffer {
	const size = 32
	const bpp = 24
	const rowBytes = size * 3
	const paddedRow = (rowBytes + 3) & ~3
	const pixelDataSize = paddedRow * size
	const dibSize = 40
	const andMaskRowBytes = ((size + 31) & ~31) / 8
	const andMaskSize = andMaskRowBytes * size
	const imageSize = dibSize + pixelDataSize + andMaskSize

	/* ICO header */
	const header = Buffer.alloc(6)
	header.writeUInt16LE(0, 0) /* reserved */
	header.writeUInt16LE(1, 2) /* type: icon */
	header.writeUInt16LE(1, 4) /* count */

	/* Directory entry */
	const dir = Buffer.alloc(16)
	dir[0] = size /* width */
	dir[1] = size /* height */
	dir[2] = 0 /* palette */
	dir[3] = 0 /* reserved */
	dir.writeUInt16LE(1, 4) /* color planes */
	dir.writeUInt16LE(bpp, 6) /* bits per pixel */
	dir.writeUInt32LE(imageSize, 8) /* image size */
	dir.writeUInt32LE(22, 12) /* offset (6 header + 16 dir) */

	/* BMP DIB header */
	const dib = Buffer.alloc(dibSize)
	dib.writeUInt32LE(dibSize, 0) /* header size */
	dib.writeInt32LE(size, 4) /* width */
	dib.writeInt32LE(size * 2, 8) /* height (doubled for ICO) */
	dib.writeUInt16LE(1, 12) /* planes */
	dib.writeUInt16LE(bpp, 14) /* bits per pixel */
	dib.writeUInt32LE(0, 20) /* image size (0 = uncompressed) */

	/* Pixel data (bottom-up BGR, black) */
	const pixels = Buffer.alloc(pixelDataSize)

	/* AND mask (all 0 = fully opaque) */
	const andMask = Buffer.alloc(andMaskSize)

	return Buffer.concat([header, dir, dib, pixels, andMask])
}
