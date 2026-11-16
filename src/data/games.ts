/**
 * 游戏展示页数据源（由 src/data/json/games.json 驱动，支持前端后台管理）。
 * 页面展示与筛选规则由 src/config/gamesConfig.ts 控制。
 */
import type { GameItem } from "@/types/gamesConfig";
import gamesJson from "./json/games.json" with { type: "json" };

export const gamesData: GameItem[] = gamesJson as GameItem[];
