import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	dedupeEntryName,
	downloadAlbumAsZip,
	downloadSinglePhoto,
	resolvePhotoFilename,
	sanitizeDownloadName,
} from "../src/utils/album-download.ts";
import { buildZipStore, crc32 } from "../src/utils/zip-store.ts";

function installDownloadDomStubs() {
	const originalDocument = globalThis.document;
	const originalWindow = globalThis.window;
	const originalCreateObjectURL = URL.createObjectURL;
	const originalRevokeObjectURL = URL.revokeObjectURL;

	const anchors = [];
	const blobs = new Map();
	let nextId = 1;

	URL.createObjectURL = (blob) => {
		const id = `blob:test/${nextId++}`;
		blobs.set(id, blob);
		return id;
	};
	URL.revokeObjectURL = () => {};

	globalThis.window = {
		setTimeout: () => 0,
		clearTimeout: () => {},
	};
	globalThis.document = {
		body: {
			appendChild: (el) => el,
		},
		createElement: (tag) => {
			assert.equal(tag, "a");
			const anchor = {
				href: "",
				download: "",
				target: "",
				rel: "",
				style: {},
				clicked: false,
				removed: false,
				click() {
					this.clicked = true;
				},
				remove() {
					this.removed = true;
				},
			};
			anchors.push(anchor);
			return anchor;
		},
	};

	return {
		anchors,
		blobs,
		restore() {
			globalThis.document = originalDocument;
			globalThis.window = originalWindow;
			URL.createObjectURL = originalCreateObjectURL;
			URL.revokeObjectURL = originalRevokeObjectURL;
		},
	};
}

describe("ZIP store encoder & album download helpers", () => {
	it("computes standard IEEE 802.3 CRC-32 checksum", () => {
		const bytes = new TextEncoder().encode("123456789");
		assert.equal(crc32(bytes), 0xcbf43926);
		assert.equal(crc32(new Uint8Array(0)), 0x00000000);
	});

	it("encodes a valid UTF-8 ZIP archive verifiable by standard unzip tooling", () => {
		const payloadA = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4]);
		const payloadB = new TextEncoder().encode("Nakamori Akina — 昭和の歌姫");
		const archive = buildZipStore([
			{ name: "中森明菜（なかもり あきな）/01.webp", data: payloadA },
			{ name: "中森明菜（なかもり あきな）/02.txt", data: payloadB },
		]);

		// Verify signatures directly
		const view = new DataView(
			archive.buffer,
			archive.byteOffset,
			archive.byteLength,
		);
		assert.equal(view.getUint32(0, true), 0x04034b50);
		assert.equal(view.getUint32(archive.byteLength - 22, true), 0x06054b50);
		assert.equal(view.getUint16(archive.byteLength - 12, true), 2);

		// Verify using Python's stdlib zipfile (CRC + UTF-8 extraction)
		const dir = mkdtempSync(join(tmpdir(), "shirone-zip-"));
		const zipPath = join(dir, "test.zip");
		try {
			writeFileSync(zipPath, archive);
			const out = execFileSync(
				"python",
				[
					"-c",
					"import json, sys, zipfile; zf = zipfile.ZipFile(sys.argv[1]); assert zf.testzip() is None; print(json.dumps({name: list(zf.read(name)) for name in zf.namelist()}))",
					zipPath,
				],
				{ encoding: "utf8" },
			);
			const extracted = JSON.parse(out);
			assert.deepEqual(
				extracted["中森明菜（なかもり あきな）/01.webp"],
				Array.from(payloadA),
			);
			assert.deepEqual(
				extracted["中森明菜（なかもり あきな）/02.txt"],
				Array.from(payloadB),
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("sanitizes filenames, resolves extensions, and deduplicates case-insensitively", () => {
		assert.equal(
			sanitizeDownloadName('  中森明菜: /*? "测试"  ', "album"),
			"中森明菜-测试",
		);
		assert.equal(sanitizeDownloadName("...", "album"), "album");

		assert.equal(
			resolvePhotoFilename(
				{ id: "01", src: "/images/albums/nakamori-akina/01.webp", alt: "01" },
				0,
			),
			"01.webp",
		);
		assert.equal(
			resolvePhotoFilename(
				{
					id: "remote",
					src: "https://picsum.photos/800/600",
					title: "Sunset",
					alt: "Sunset",
				},
				2,
				"image/jpeg; charset=utf-8",
			),
			"Sunset.jpg",
		);

		const used = new Set();
		assert.equal(dedupeEntryName("01.webp", used), "01.webp");
		assert.equal(dedupeEntryName("01.WEBP", used), "01-2.WEBP");
		assert.equal(dedupeEntryName("01.webp", used), "01-3.webp");
	});

	it("downloads a single photo via blob and falls back to anchor when fetch fails", async () => {
		const originalFetch = globalThis.fetch;
		const dom = installDownloadDomStubs();
		let failNext = false;
		globalThis.fetch = async () => {
			if (failNext) throw new TypeError("CORS blocked");
			return new Response(new Uint8Array([10, 20, 30]), {
				status: 200,
				headers: { "content-type": "image/webp" },
			});
		};

		try {
			const name1 = await downloadSinglePhoto(
				{ id: "01", src: "/images/albums/a/01.webp", alt: "01" },
				0,
				"/Serene/images/albums/a/01.webp",
			);
			assert.equal(name1, "01.webp");
			assert.equal(dom.anchors.length, 1);
			assert.equal(dom.anchors[0].clicked, true);
			assert.equal(dom.anchors[0].download, "01.webp");
			assert.ok(dom.anchors[0].href.startsWith("blob:test/"));

			failNext = true;
			const name2 = await downloadSinglePhoto(
				{ id: "02", src: "https://remote.example/pic.jpg", alt: "02" },
				1,
				"https://remote.example/pic.jpg",
			);
			assert.equal(name2, "pic.jpg");
			assert.equal(dom.anchors.length, 2);
			assert.equal(dom.anchors[1].href, "https://remote.example/pic.jpg");
			assert.equal(dom.anchors[1].target, "_blank");
			assert.equal(dom.anchors[1].clicked, true);
		} finally {
			globalThis.fetch = originalFetch;
			dom.restore();
		}
	});

	it("packs whole album concurrently with progress reporting and partial-failure tolerance", async () => {
		const originalFetch = globalThis.fetch;
		const dom = installDownloadDomStubs();
		const progressEvents = [];

		globalThis.fetch = async (input) => {
			const u = String(input);
			if (u.endsWith("02.webp")) {
				return new Response("forbidden", { status: 403 });
			}
			return new Response(new Uint8Array([1, 2, 3, 4]), {
				status: 200,
				headers: { "content-type": "image/webp" },
			});
		};

		try {
			const result = await downloadAlbumAsZip({
				albumTitle: "中森明菜",
				albumId: "nakamori-akina",
				photos: [
					{ id: "1", src: "/images/albums/a/01.webp", alt: "1", tags: [] },
					{ id: "2", src: "/images/albums/a/02.webp", alt: "2", tags: [] },
					{ id: "3", src: "/images/albums/a/03.webp", alt: "3", tags: [] },
				],
				resolveUrl: (src) => `/Serene${src}`,
				onProgress: (p) => progressEvents.push(p),
				concurrency: 2,
			});

			assert.equal(result.downloaded, 2);
			assert.equal(result.failed, 1);
			assert.equal(result.filename, "中森明菜.zip");
			assert.equal(progressEvents.length, 3);
			assert.deepEqual(progressEvents.at(-1), { completed: 3, total: 3 });

			assert.equal(dom.anchors.length, 1);
			assert.equal(dom.anchors[0].download, "中森明菜.zip");
			const blob = dom.blobs.get(dom.anchors[0].href);
			assert.ok(blob instanceof Blob);
			const bytes = new Uint8Array(await blob.arrayBuffer());
			const view = new DataView(bytes.buffer);
			assert.equal(view.getUint32(0, true), 0x04034b50);
			assert.equal(view.getUint16(bytes.byteLength - 12, true), 2);
		} finally {
			globalThis.fetch = originalFetch;
			dom.restore();
		}
	});
});
