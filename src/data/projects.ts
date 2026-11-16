/**
 * 项目页数据源（由 src/data/json/projects.json 驱动，支持前端后台管理）。
 * 页面展示与筛选规则由 src/config/projectsConfig.ts 控制。
 */
import type { ProjectItem } from "@/types/projectsConfig";
import projectsJson from "./json/projects.json" with { type: "json" };

export const projectsData: ProjectItem[] = projectsJson as ProjectItem[];

/** 获取所有项目数据列表 */
export function getProjectsList(): ProjectItem[] {
	return projectsData;
}
