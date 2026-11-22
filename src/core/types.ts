// 全局领域模型与常量

export type ShapeType = 'plate' | 'box' | 'bowl'
export type ReliefMode = 'jittered' | 'finger' | 'hemp' | 'ridge'
export type ToolType = 'planar' | 'disc' | 'stick'
export type ViewMode = 'lacquer' | 'relief' | 'heatmap'
export type LightPreset = 'studio' | 'warm' | 'daylight'
export type OverlayMode = 'none' | 'alert' | 'heatmap' | 'both'

export interface BodyParams {
  shape: ShapeType
  diameter_mm: number
  height_mm: number
  wall_mm: number
  // 导入 OBJ 时使用其外接盒缩放后的边长
  obj_id: string | null
}

export interface ReliefParams {
  mode: ReliefMode
  density_per_cm2: number
  height_mm: number
  radius_mm: number
  jitter: number
  seed: number
  // 捺痕沿走向的拉伸
  stretch: number
}

export interface LacquerLayer {
  id: string
  name: string
  color: string
  // 名义髹涂厚度，单位毫米
  thickness_mm: number
  // 阴干天数
  dry_days: number
  // 干燥收缩率 0~0.3
  shrink: number
  // 凸顶流薄系数 0~1
  flow: number
}

export interface GrindTool {
  type: ToolType
  name: string
  // 接触面直径，单位毫米
  diameter_mm: number
  // 下压力度 0~1
  pressure: number
  hardness: number
}

export interface GrindSample {
  // 盘面平面坐标，单位毫米（相对胎体中心）
  x: number
  y: number
  p: number
}

export interface GrindOperation {
  id: string
  label: string
  tool: GrindTool
  // planar 模式单次整体下磨量，单位毫米
  planar_depth_mm: number
  samples: GrindSample[]
  // 采样步长，单位毫米，决定确定性重采样
  step_mm: number
  created_at: number
}

export interface Work {
  id: string
  name: string
  order_no: string
  note: string
  created_at: number
  updated_at: number
  body: BodyParams
  relief: ReliefParams
  layers: LacquerLayer[]
  operations: GrindOperation[]
  // 推演网格分辨率
  sim_resolution: number
  // 参考照片（IndexedDB 内 blob 引用 id）
  reference_id: string | null
  version: number
}

export interface LayerStat {
  layer_index: number
  // 实际平均厚度
  avg_mm: number
  min_mm: number
  max_mm: number
}

export interface WorkSummary {
  id: string
  name: string
  order_no: string
  shape: ShapeType
  layer_count: number
  op_count: number
  updated_at: number
}

export interface PatternMetrics {
  // 主色块面积占比
  color_ratio: { color: string; ratio: number }[]
  // 纹路密度：边缘像素占比
  line_density: number
  // 圈纹密度：同心环状边缘占比
  ring_density: number
}

export const MAX_LAYERS = 16
export const STAT_RESOLUTION = 64
export const DEFAULT_SIM_RESOLUTION = 1024
export const SIM_VERSIONS = [512, 1024]

export const TOOL_PRESETS: GrindTool[] = [
  { type: 'planar', name: '水磨平台', diameter_mm: 400, pressure: 0.35, hardness: 0.9 },
  { type: 'disc', name: '木炭圆磨', diameter_mm: 40, pressure: 0.5, hardness: 0.55 },
  { type: 'stick', name: '磨石条', diameter_mm: 12, pressure: 0.65, hardness: 0.8 }
]

export function uid(prefix = 'id'): string {
  const rand = Math.floor(Math.random() * 0xffff_ffff).toString(36)
  return `${prefix}_${Date.now().toString(36)}_${rand}`
}
