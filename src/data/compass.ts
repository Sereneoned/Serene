import compassJson from "./json/compass.json" with { type: "json" };

/** 单条站点记录 */
export interface CompassEntry {
	label: string;
	href: string;
	note?: string;
	icon?: string;
	image?: string;
}

/** 分组（Shelf = 罗盘上的收纳格） */
export interface CompassShelf {
	key: string;
	name: string;
	icon?: string;
	blurb?: string;
	entries: CompassEntry[];
}

export const compassData: CompassShelf[] = compassJson as CompassShelf[];
