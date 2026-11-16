import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
	createEmptyCompassShelf,
	ensureUniqueKey,
	mergeDomainConfigOverride,
	moveListItem,
	normalizeCompassShelves,
	normalizeGameItems,
	normalizeProjectItems,
	normalizeTimelineItems,
	serializeCompassShelves,
	serializeGameItems,
	serializeProjectItems,
	serializeTimelineItems,
} from "../src/utils/admin/data-editors.ts";
import { UI_ICON_PRESETS } from "../src/utils/admin/icon-presets.ts";
import { parseId3TagsFromBytes } from "../src/utils/admin/media.ts";
import {
	parseMomentMarkdown,
	parsePostMarkdown,
	serializeAlbumInfoJson,
	serializeMomentMarkdown,
	serializePostMarkdown,
} from "../src/utils/admin/serializers.ts";
import {
	collectTagsFromRecords,
	mergeUniqueTags,
	parseTagTokens,
	removeTagValue,
	toggleTagValue,
} from "../src/utils/admin/tag-presets.ts";
import { parseTrackFromFilename } from "../src/utils/music/filename-parser.ts";
import { scanLocalMusicFolder } from "../src/utils/music/folder-scanner.server.ts";

function buildSyntheticId3v23({ title, artist, album, coverBytes }) {
	const enc = new TextEncoder();
	const frames = [];

	const addTextFrame = (id, value) => {
		const text = enc.encode(value);
		const payload = new Uint8Array(1 + text.length);
		payload[0] = 3; // UTF-8
		payload.set(text, 1);
		const frame = new Uint8Array(10 + payload.length);
		frame.set(enc.encode(id), 0);
		const sz = payload.length;
		frame[4] = (sz >>> 24) & 0xff;
		frame[5] = (sz >>> 16) & 0xff;
		frame[6] = (sz >>> 8) & 0xff;
		frame[7] = sz & 0xff;
		frame.set(payload, 10);
		frames.push(frame);
	};

	addTextFrame("TIT2", title);
	addTextFrame("TPE1", artist);
	if (album) addTextFrame("TALB", album);

	if (coverBytes) {
		const mime = enc.encode("image/png");
		const payload = new Uint8Array(
			1 + mime.length + 1 + 1 + 1 + coverBytes.length,
		);
		let ptr = 0;
		payload[ptr++] = 0; // ISO-8859-1
		payload.set(mime, ptr);
		ptr += mime.length;
		payload[ptr++] = 0; // null terminate mime
		payload[ptr++] = 3; // front cover
		payload[ptr++] = 0; // empty description
		payload.set(coverBytes, ptr);

		const frame = new Uint8Array(10 + payload.length);
		frame.set(enc.encode("APIC"), 0);
		const sz = payload.length;
		frame[4] = (sz >>> 24) & 0xff;
		frame[5] = (sz >>> 16) & 0xff;
		frame[6] = (sz >>> 8) & 0xff;
		frame[7] = sz & 0xff;
		frame.set(payload, 10);
		frames.push(frame);
	}

	const totalBody = frames.reduce((s, f) => s + f.length, 0);
	const out = new Uint8Array(10 + totalBody);
	out[0] = 0x49; // I
	out[1] = 0x44; // D
	out[2] = 0x33; // 3
	out[3] = 3; // v2.3
	out[4] = 0;
	out[5] = 0;
	// syncsafe tag size
	out[6] = (totalBody >>> 21) & 0x7f;
	out[7] = (totalBody >>> 14) & 0x7f;
	out[8] = (totalBody >>> 7) & 0x7f;
	out[9] = totalBody & 0x7f;
	let pos = 10;
	for (const frame of frames) {
		out.set(frame, pos);
		pos += frame.length;
	}
	return out;
}

describe("Music filename and ID3 parsing", () => {
	it("parses Artist - Title and strips leading track numbers", () => {
		const parsed = parseTrackFromFilename("03. Yoasobi - 夜に駆ける.mp3");
		assert.equal(parsed.artist, "Yoasobi");
		assert.equal(parsed.title, "夜に駆ける");
		assert.ok(parsed.id.length > 0);
	});

	it("parses ID3v2.3 frames including UTF-8 text and APIC cover art", () => {
		const fakePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
		const bytes = buildSyntheticId3v23({
			title: "春雷の頃",
			artist: "22/7",
			album: "Demo Album",
			coverBytes: fakePng,
		});
		const parsed = parseId3TagsFromBytes(bytes);
		assert.equal(parsed.title, "春雷の頃");
		assert.equal(parsed.artist, "22/7");
		assert.equal(parsed.album, "Demo Album");
		assert.equal(parsed.coverMimeType, "image/png");
		assert.deepEqual(parsed.coverBytes, fakePng);
	});

	it("scans local MP3 folder and skips registered or excluded sources", () => {
		const root = mkdtempSync(join(tmpdir(), "shirone-music-scan-"));
		try {
			mkdirSync(join(root, "anime"), { recursive: true });
			writeFileSync(join(root, "Dazbee - Song One.mp3"), "dummy");
			writeFileSync(join(root, "anime", "01. Opening.mp3"), "dummy");
			writeFileSync(join(root, "ignored.txt"), "not audio");

			const discovered = scanLocalMusicFolder(
				[
					{
						id: "existing",
						title: "Existing",
						source: "/assets/music/url/Dazbee - Song One.mp3",
					},
				],
				["/assets/music/url/skip-me.mp3"],
				root,
			);

			assert.equal(discovered.length, 1);
			assert.equal(discovered[0].title, "Opening");
			assert.equal(
				discovered[0].source,
				"/assets/music/url/anime/01. Opening.mp3",
			);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});

describe("Admin Markdown and Album serializers", () => {
	it("round-trips Moment markdown with images, encryption and tags", () => {
		const md = serializeMomentMarkdown({
			published: "2026-11-16T16:10:00+08:00",
			pinned: true,
			location: "Hangzhou",
			mood: "material-symbols:headphones-rounded",
			tags: ["daily", "music"],
			images: [{ src: "/images/moments/test/1.webp", alt: "Sunset" }],
			encrypted: true,
			password: "secret",
			passwordHint: "Year",
			body: "Listening to new MP3s!",
		});

		const parsed = parseMomentMarkdown(
			"src/content/moments/2026-11-16-test.md",
			md,
		);
		assert.equal(parsed.pinned, true);
		assert.equal(parsed.location, "Hangzhou");
		assert.deepEqual(parsed.tags, ["daily", "music"]);
		assert.equal(parsed.images?.[0]?.src, "/images/moments/test/1.webp");
		assert.equal(parsed.encrypted, true);
		assert.equal(parsed.password, "secret");
		assert.equal(parsed.body, "Listening to new MP3s!");
	});

	it("round-trips Post markdown frontmatter and body", () => {
		const md = serializePostMarkdown({
			title: "Hello Shirone",
			published: "2026-11-16",
			category: "Notes",
			tags: ["astro", "admin"],
			draft: true,
			body: "# Heading\n\nBody text.",
		});

		const parsed = parsePostMarkdown("src/content/posts/hello-shirone.md", md);
		assert.equal(parsed.title, "Hello Shirone");
		assert.equal(parsed.category, "Notes");
		assert.deepEqual(parsed.tags, ["astro", "admin"]);
		assert.equal(parsed.draft, true);
		assert.match(parsed.body, /# Heading/);
	});

	it("serializes external Album info.json cleanly", () => {
		const raw = serializeAlbumInfoJson({
			id: "remote-set",
			mode: "external",
			title: "Remote Set",
			date: "2026-11-16",
			layout: "grid",
			columns: 4,
			cover: "https://example.com/cover.webp",
			photos: [
				{ id: "1", src: "https://example.com/1.webp", alt: "One", tags: [] },
			],
		});
		const parsed = JSON.parse(raw);
		assert.equal(parsed.mode, "external");
		assert.equal(parsed.layout, "grid");
		assert.equal(parsed.columns, 4);
		assert.equal(parsed.photos.length, 1);
	});
});

describe("Admin UI icon presets, tag helpers, and structured data editors", () => {
	it("provides categorized UI icon presets ready for offline bundling", () => {
		const groups = new Set(UI_ICON_PRESETS.map((item) => item.group));
		for (const expected of [
			"timeline",
			"projects",
			"games",
			"compass",
			"brands",
			"tags",
		]) {
			assert.ok(groups.has(expected), `missing icon group: ${expected}`);
		}
		for (const preset of UI_ICON_PRESETS) {
			assert.match(preset.icon, /^[a-z0-9-]+:[a-z0-9-]+$/);
			assert.ok(preset.label.trim().length > 0);
		}
	});

	it("parses, deduplicates, toggles, removes, and collects tags cleanly", () => {
		const parsed = parseTagTokens("Astro, TypeScript，astro,  Svelte\n");
		assert.deepEqual(parsed, ["Astro", "TypeScript", "Svelte"]);

		const merged = mergeUniqueTags(["Astro", "Svelte"], ["svelte", "M3E"]);
		assert.deepEqual(merged, ["Astro", "Svelte", "M3E"]);

		assert.deepEqual(toggleTagValue(["Astro", "Svelte"], "astro"), ["Svelte"]);
		assert.deepEqual(toggleTagValue(["Svelte"], "TypeScript"), [
			"Svelte",
			"TypeScript",
		]);
		assert.deepEqual(removeTagValue(["Astro", "M3E"], "m3e"), ["Astro"]);

		const collected = collectTagsFromRecords(
			[{ tags: ["RPG", "PC"] }, { tags: ["pc", "Action"] }],
			(item) => item.tags,
		);
		assert.deepEqual(collected, ["RPG", "PC", "Action"]);
	});

	it("normalizes and serializes timeline, projects, games, compass, and overrides", () => {
		assert.deepEqual(moveListItem(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
		assert.equal(ensureUniqueKey("Serene App", ["serene-app"]), "serene-app-2");

		const timelineJson = serializeTimelineItems(
			normalizeTimelineItems([
				{
					title: "Launch Blog",
					date: "2026.11",
					category: "milestone",
					icon: "material-symbols:rocket-launch-rounded",
					tags: ["Astro", "astro"],
					highlights: ["Shipped v1", ""],
					links: [{ label: "GitHub", url: "https://github.com/Sereneoned" }],
					featured: true,
				},
			]),
		);
		const timelineOut = JSON.parse(timelineJson);
		assert.equal(timelineOut[0].title, "Launch Blog");
		assert.deepEqual(timelineOut[0].tags, ["Astro"]);
		assert.deepEqual(timelineOut[0].highlights, ["Shipped v1"]);
		assert.equal(timelineOut[0].featured, true);

		const projectJson = serializeProjectItems(
			normalizeProjectItems([
				{
					title: "Demo Project",
					summary: "Build summary",
					category: "theme",
					phase: "shipped",
					technologies: ["Astro", "Svelte"],
					icon: "material-symbols:code-rounded",
				},
				{
					title: "Demo Project",
					summary: "Duplicate key guard",
					category: "theme",
					phase: "unknown-phase",
					technologies: [],
				},
			]),
		);
		const projectOut = JSON.parse(projectJson);
		assert.equal(projectOut[0].key, "demo-project");
		assert.equal(projectOut[1].key, "demo-project-2");
		assert.equal(projectOut[1].phase, "building");

		const gameJson = serializeGameItems(
			normalizeGameItems([
				{
					name: "Minecraft",
					developer: "Mojang",
					category: "sandbox",
					status: "playing",
					rating: 4.7,
					hours: 120.34,
					tags: ["Sandbox", "Building"],
					description: "Blocks everywhere",
				},
			]),
		);
		const gameOut = JSON.parse(gameJson);
		assert.equal(gameOut[0].rating, 4.5);
		assert.equal(gameOut[0].hours, 120.3);

		const emptyShelf = createEmptyCompassShelf(["dev"]);
		const compassJson = serializeCompassShelves(
			normalizeCompassShelves([
				emptyShelf,
				{
					key: "dev",
					name: "Dev",
					icon: "material-symbols:code-rounded",
					entries: [
						{
							label: "GitHub",
							href: "https://github.com",
							icon: "fa7-brands:github",
						},
					],
				},
			]),
		);
		const compassOut = JSON.parse(compassJson);
		assert.equal(compassOut[0].key, "shelf");
		assert.equal(compassOut[1].entries[0].icon, "fa7-brands:github");

		const mergedOverride = mergeDomainConfigOverride(
			{ timeline: { enable: true, order: "desc" } },
			"timeline",
			{
				categories: [
					{
						key: "milestone",
						label: "里程碑",
						icon: "material-symbols:flag-rounded",
					},
				],
				order: "asc",
			},
		);
		assert.equal(mergedOverride.timeline.enable, true);
		assert.equal(mergedOverride.timeline.order, "asc");
		assert.equal(mergedOverride.timeline.categories[0].label, "里程碑");
	});
});
