/**
 * Zero-dependency PKZIP 2.0 ("store" method) archive builder.
 *
 * Photos (WebP, JPEG, PNG, AVIF, GIF) are already compressed binary formats,
 * so storing them uncompressed avoids seconds of browser CPU work while
 * producing standard `.zip` archives with full UTF-8 filename support.
 */

export interface ZipStoreEntry {
	readonly name: string;
	readonly data: Uint8Array;
	readonly modifiedAt?: Date;
}

const LOCAL_FILE_HEADER_SIG = 0x04034b50;
const CENTRAL_DIR_HEADER_SIG = 0x02014b50;
const END_OF_CENTRAL_DIR_SIG = 0x06054b50;
const ZIP_VERSION_20 = 20;
const UTF8_FILENAME_FLAG = 0x0800;

let crcTable: Uint32Array | null = null;

function getCrc32Table(): Uint32Array {
	if (crcTable) return crcTable;
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i += 1) {
		let c = i;
		for (let k = 0; k < 8; k += 1) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[i] = c >>> 0;
	}
	crcTable = table;
	return table;
}

/** Computes standard IEEE 802.3 CRC-32 checksum. */
export function crc32(data: Uint8Array): number {
	const table = getCrc32Table();
	let crc = 0xffffffff;
	for (let i = 0; i < data.length; i += 1) {
		crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date: Date): { dosTime: number; dosDate: number } {
	const year = Math.max(0, Math.min(127, date.getFullYear() - 1980));
	const month = date.getMonth() + 1;
	const day = date.getDate();
	const hours = date.getHours();
	const minutes = date.getMinutes();
	const seconds = Math.floor(date.getSeconds() / 2);
	return {
		dosTime:
			((hours & 0x1f) << 11) | ((minutes & 0x3f) << 5) | (seconds & 0x1f),
		dosDate: ((year & 0x7f) << 9) | ((month & 0x0f) << 5) | (day & 0x1f),
	};
}

/** Encodes entries into a standard uncompressed `.zip` archive (`Uint8Array`). */
export function buildZipStore(entries: readonly ZipStoreEntry[]): Uint8Array {
	const encoder = new TextEncoder();
	const now = new Date();

	const prepared = entries.map((entry) => {
		const normalizedName = entry.name.replace(/^\/+/, "");
		const nameBytes = encoder.encode(normalizedName);
		const { dosTime, dosDate } = toDosDateTime(entry.modifiedAt ?? now);
		return {
			nameBytes,
			data: entry.data,
			crc: crc32(entry.data),
			dosTime,
			dosDate,
			localOffset: 0,
		};
	});

	let localSectionSize = 0;
	let centralSectionSize = 0;
	for (const item of prepared) {
		item.localOffset = localSectionSize;
		localSectionSize += 30 + item.nameBytes.length + item.data.byteLength;
		centralSectionSize += 46 + item.nameBytes.length;
	}

	const totalSize = localSectionSize + centralSectionSize + 22;
	const output = new Uint8Array(totalSize);
	const view = new DataView(output.buffer);

	let offset = 0;
	for (const item of prepared) {
		view.setUint32(offset, LOCAL_FILE_HEADER_SIG, true);
		view.setUint16(offset + 4, ZIP_VERSION_20, true);
		view.setUint16(offset + 6, UTF8_FILENAME_FLAG, true);
		view.setUint16(offset + 8, 0, true);
		view.setUint16(offset + 10, item.dosTime, true);
		view.setUint16(offset + 12, item.dosDate, true);
		view.setUint32(offset + 14, item.crc, true);
		view.setUint32(offset + 18, item.data.byteLength, true);
		view.setUint32(offset + 22, item.data.byteLength, true);
		view.setUint16(offset + 26, item.nameBytes.length, true);
		view.setUint16(offset + 28, 0, true);
		offset += 30;

		output.set(item.nameBytes, offset);
		offset += item.nameBytes.length;

		output.set(item.data, offset);
		offset += item.data.byteLength;
	}

	const centralStart = offset;
	for (const item of prepared) {
		view.setUint32(offset, CENTRAL_DIR_HEADER_SIG, true);
		view.setUint16(offset + 4, ZIP_VERSION_20, true);
		view.setUint16(offset + 6, ZIP_VERSION_20, true);
		view.setUint16(offset + 8, UTF8_FILENAME_FLAG, true);
		view.setUint16(offset + 10, 0, true);
		view.setUint16(offset + 12, item.dosTime, true);
		view.setUint16(offset + 14, item.dosDate, true);
		view.setUint32(offset + 16, item.crc, true);
		view.setUint32(offset + 20, item.data.byteLength, true);
		view.setUint32(offset + 24, item.data.byteLength, true);
		view.setUint16(offset + 28, item.nameBytes.length, true);
		view.setUint16(offset + 30, 0, true);
		view.setUint16(offset + 32, 0, true);
		view.setUint16(offset + 34, 0, true);
		view.setUint16(offset + 36, 0, true);
		view.setUint32(offset + 38, 0, true);
		view.setUint32(offset + 42, item.localOffset, true);
		offset += 46;

		output.set(item.nameBytes, offset);
		offset += item.nameBytes.length;
	}

	view.setUint32(offset, END_OF_CENTRAL_DIR_SIG, true);
	view.setUint16(offset + 4, 0, true);
	view.setUint16(offset + 6, 0, true);
	view.setUint16(offset + 8, prepared.length, true);
	view.setUint16(offset + 10, prepared.length, true);
	view.setUint32(offset + 12, centralSectionSize, true);
	view.setUint32(offset + 16, centralStart, true);
	view.setUint16(offset + 20, 0, true);

	return output;
}
