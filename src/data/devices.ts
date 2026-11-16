/**
 * 设备展示页数据源（由 src/data/json/devices.json 驱动，支持前端后台管理）。
 * 页面展示与筛选规则由 src/config/devicesConfig.ts 控制。
 */
import type { DeviceItem } from "@/types/devicesConfig";
import devicesJson from "./json/devices.json" with { type: "json" };

export const devicesData: DeviceItem[] = devicesJson as DeviceItem[];

/** 获取所有设备数据列表 */
export function getDevicesList(): DeviceItem[] {
	return devicesData;
}
