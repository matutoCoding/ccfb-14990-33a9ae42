// 相机：透视轨道 / 俯视正交两种模式
import type { LightPreset } from '../core/types'
import { lookAt, mat4Multiply, ortho, perspective, type Mat4 } from './mat4'

export interface CameraState {
  mode: 'orbit' | 'top'
  yaw: number
  pitch: number
  distance: number
  zoom: number
  target: [number, number, number]
}

export function defaultCamera(domainMm: number): CameraState {
  return {
    mode: 'orbit',
    yaw: -0.6,
    pitch: 0.7,
    distance: domainMm * 1.15,
    zoom: 1,
    target: [0, 0, 0]
  }
}

export function viewProjection(cam: CameraState, aspect: number): { vp: Mat4; eye: number[] } {
  if (cam.mode === 'top') {
    const size = (cam.target[2] + 320) / cam.zoom
    // 近平面必须在相机前方，正交视图取近 1 远 2400
    const proj = ortho(size, aspect, 1, 2400)
    const eye: number[] = [cam.target[0], cam.target[1], cam.target[2] + 1200]
    const view = lookAt(eye, cam.target, [0, 1, 0])
    return { vp: mat4Multiply(proj, view), eye }
  }
  const cp = Math.cos(cam.pitch)
  const eye: number[] = [
    cam.target[0] + cam.distance * cp * Math.sin(cam.yaw),
    cam.target[1] - cam.distance * cp * Math.cos(cam.yaw),
    cam.target[2] + cam.distance * Math.sin(cam.pitch)
  ]
  const proj = perspective(45 * (Math.PI / 180), aspect, 1, 6000)
  const view = lookAt(eye, cam.target, [0, 0, 1])
  return { vp: mat4Multiply(proj, view), eye }
}

export interface LightConfig {
  dir: [number, number, number]
  color: [number, number, number]
  ambient: number
  clearcoat: number
}

export const LIGHT_PRESETS: Record<LightPreset, LightConfig> = {
  studio: {
    dir: [0.35, -0.45, 0.82],
    color: [1, 0.98, 0.95],
    ambient: 0.32,
    clearcoat: 1.0
  },
  warm: {
    dir: [-0.5, -0.2, 0.84],
    color: [1, 0.86, 0.66],
    ambient: 0.28,
    clearcoat: 1.15
  },
  daylight: {
    dir: [0.1, -0.6, 0.79],
    color: [0.82, 0.9, 1],
    ambient: 0.4,
    clearcoat: 0.85
  }
}
