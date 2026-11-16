/**
 * 时间线页数据源（由 src/data/json/timeline.json 驱动，支持前端后台管理）。
 * 页面展示与筛选规则由 src/config/timelineConfig.ts 控制。
 */
import type { TimelineItem } from "@/types/timelineConfig";
import timelineJson from "./json/timeline.json" with { type: "json" };

export const timelineData: TimelineItem[] = timelineJson as TimelineItem[];

/** 获取所有时间线数据列表 */
export function getTimelineList(): TimelineItem[] {
	return timelineData;
}
