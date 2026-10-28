export const VIRTUAL_CAMERA_NAME = "OpenChurch Virtual Camera";
export const VIRTUAL_CAMERA_WIDTH = 1280;
export const VIRTUAL_CAMERA_HEIGHT = 720;
export const VIRTUAL_CAMERA_FPS = 30;
export const VIRTUAL_CAMERA_FRAME_BYTES = VIRTUAL_CAMERA_WIDTH * VIRTUAL_CAMERA_HEIGHT * 4;

export type VirtualCameraStatus = {
  supported: boolean;
  installed: boolean;
  state: "stopped" | "starting" | "running" | "error";
  name: string;
  message?: string;
  session?: string;
};

export type VirtualCameraFrame = { session: string; data: Uint8Array };
