// 窗口吸附几何逻辑（纯函数，可单测）。
// 挂件窗口拖拽到屏幕边缘时自动吸附：右缘/左缘贴边收缩成窄条。

export interface DockGeometry {
  /** 窗口左边缘 x（逻辑像素） */
  windowX: number;
  /** 窗口宽度 */
  windowWidth: number;
  /** 屏幕工作区宽度 */
  screenWidth: number;
  /** 吸附触发阈值：距边缘小于该值视为"拖到边缘" */
  threshold?: number;
}

export type SnapEdge = "right" | "left" | null;

/**
 * 判断窗口当前是否应吸附到某侧边缘。
 * - 距右缘 < threshold → 'right'
 * - 距左缘 < threshold → 'left'
 * - 否则 null（不吸附）
 */
export function detectSnapEdge({
  windowX,
  windowWidth,
  screenWidth,
  threshold = 48,
}: DockGeometry): SnapEdge {
  const rightDistance = screenWidth - (windowX + windowWidth);
  if (rightDistance < threshold) return "right";
  if (windowX < threshold) return "left";
  return null;
}

/** 吸附后窄条的宽度（逻辑像素）。 */
export const DOCK_COMPACT_WIDTH = 46;
/** 吸附后贴边的留白（逻辑像素）。 */
export const DOCK_EDGE_GAP = 0;

/**
 * 计算吸附后的窗口位置：
 * - right: x = screenWidth - compactWidth - gap
 * - left:  x = gap
 */
export function snapPosition(edge: "right" | "left", screenWidth: number): number {
  if (edge === "left") return DOCK_EDGE_GAP;
  return screenWidth - DOCK_COMPACT_WIDTH - DOCK_EDGE_GAP;
}
