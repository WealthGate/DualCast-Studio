import type React from "react";
import { useAudioMeterLevels } from "../audioMeterBus";

const Meter: React.FC<{ id: string; label: string; horizontal?: boolean }> = ({ id, label, horizontal }) => {
  const meters = useAudioMeterLevels();
  const level = meters[id] ?? { left: 0, right: 0, channels: 1 as const, clipping: false };
  return (
    <div
      className={`mixer-meter ${horizontal ? "horizontal" : ""} ${level.channels === 1 ? "mono" : "stereo"} ${level.clipping ? "clipping" : ""}`}
      aria-label={`${label}: ${level.channels === 1 ? "mono" : "stereo"}${level.clipping ? ", clipping" : ""}`}
    >
      <span className="meter-scale meter-safe" />
      <span className="meter-scale meter-warning" />
      <span className="meter-scale meter-clip" />
      <span className="meter-bar meter-left" style={{ [horizontal ? "width" : "height"]: `${level.left * 100}%` }} />
      {level.channels === 2 ? <span className="meter-bar meter-right" style={{ [horizontal ? "width" : "height"]: `${level.right * 100}%` }} /> : null}
      <small>{level.channels === 1 ? "M" : "L R"}</small>
    </div>
  );
};

export default Meter;
