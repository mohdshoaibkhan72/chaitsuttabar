import { Vector3 } from 'three'

// Shared, non-reactive scroll state read by the 3D scene every frame.
export const store = {
  stage: 0, // fractional section index driven by scroll
  focus: new Vector3(), // world point the camera is looking at (for the shadow light)
  themeT: 0, // 0 = dark theme, 1 = light theme (damped)
  vel: 0, // smoothed scroll velocity, spins the 3D objects
}

export const STAGES = [
  { id: 'home', center: [0, 0, 0], side: -1 },
  { id: 'story', center: [9, 0, -16], side: 1 },
  { id: 'menu', center: [-7, 0, -32], side: -1 },
  { id: 'vibe', center: [8, 0, -48], side: 1 },
  { id: 'visit', center: [0, 0, -64], side: 0 },
]
