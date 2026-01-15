import React, { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { buildCameraSourceId } from "../utils/media";

type CameraDevice = {
  deviceId: string;
  label: string;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const CameraPanel: React.FC = () => {
  const {
    cameraDeviceId,
    cameraOverlayMode,
    cameraRect,
    setCameraDeviceId,
    setCameraOverlayMode,
    updateCameraRect,
    setPreviewSourceId
  } = useAppStore();
  const [cameras, setCameras] = useState<CameraDevice[]>([]);

  const refreshCameras = async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameraDevices = devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `Camera ${index + 1}`
      }));
    setCameras(cameraDevices);
  };

  useEffect(() => {
    refreshCameras();
  }, []);

  const handlePreviewCamera = () => {
    if (!cameraDeviceId) {
      return;
    }
    setPreviewSourceId(buildCameraSourceId(cameraDeviceId));
  };

  const updateNumeric = (key: "x" | "y" | "width" | "height", value: string) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      return;
    }
    updateCameraRect({ [key]: clamp(parsed, 0, 100) });
  };

  const overlayDisabled = cameraOverlayMode === "none";

  return (
    <section className="panel camera-panel">
      <div className="panel-header">
        <h2>Camera</h2>
        <button className="btn btn-outline" onClick={refreshCameras}>
          Refresh
        </button>
      </div>
      <div className="field">
        <label htmlFor="cameraDevice">Camera Device</label>
        <select
          id="cameraDevice"
          value={cameraDeviceId ?? ""}
          onChange={(event) => setCameraDeviceId(event.target.value || null)}
        >
          <option value="">None</option>
          {cameras.map((camera) => (
            <option key={camera.deviceId} value={camera.deviceId}>
              {camera.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field field-row">
        <label>Preview Camera</label>
        <button className="btn btn-outline" onClick={handlePreviewCamera} disabled={!cameraDeviceId}>
          Show in Preview
        </button>
      </div>
      <div className="field">
        <label htmlFor="overlayMode">Overlay Mode</label>
        <select
          id="overlayMode"
          value={cameraOverlayMode}
          onChange={(event) => setCameraOverlayMode(event.target.value as "none" | "camera-over-program" | "program-over-camera")}
        >
          <option value="none">Off</option>
          <option value="camera-over-program">Camera over Program</option>
          <option value="program-over-camera">Program over Camera</option>
        </select>
      </div>
      <div className="field">
        <label>Overlay Size/Position (%)</label>
        <div className="field-grid">
          <div className="field-inline">
            <span>X</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={cameraRect.x}
              onChange={(event) => updateNumeric("x", event.target.value)}
              disabled={overlayDisabled}
            />
          </div>
          <div className="field-inline">
            <span>Y</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={cameraRect.y}
              onChange={(event) => updateNumeric("y", event.target.value)}
              disabled={overlayDisabled}
            />
          </div>
          <div className="field-inline">
            <span>W</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={cameraRect.width}
              onChange={(event) => updateNumeric("width", event.target.value)}
              disabled={overlayDisabled}
            />
          </div>
          <div className="field-inline">
            <span>H</span>
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={cameraRect.height}
              onChange={(event) => updateNumeric("height", event.target.value)}
              disabled={overlayDisabled}
            />
          </div>
        </div>
      </div>
    </section>
  );
};

export default CameraPanel;
