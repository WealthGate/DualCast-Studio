import React from "react";
import { UpdateStatusPayload } from "../../shared/types";
import { normalizeVersion } from "../utils/updateControl";

type UpdateBannerProps = {
  status: UpdateStatusPayload;
  onCheck: () => void;
  onDownload: () => void;
  onInstall: () => void;
  onOpenRelease: () => void;
  onDismiss: () => void;
};

const UpdateBanner: React.FC<UpdateBannerProps> = ({ status, onCheck, onDownload, onInstall, onOpenRelease, onDismiss }) => {
  const latestVersion = status.latestVersion ? `v${normalizeVersion(status.latestVersion)}` : "New version";
  const currentVersion = normalizeVersion(status.currentVersion);
  const progress = Math.round(status.progressPercent ?? 0);

  return (
    <section className={`update-banner state-${status.state}`} role="status" aria-live="polite">
      <div className="update-copy">
        <strong>
          {status.state === "available" ? `${latestVersion} is available` : null}
          {status.state === "downloading" ? `Downloading ${latestVersion} · ${progress}%` : null}
          {status.state === "downloaded" ? `${latestVersion} is ready to install` : null}
          {status.state === "checking" ? "Checking for updates…" : null}
          {status.state === "up-to-date" ? `OpenChurch v${currentVersion} is current` : null}
          {status.state === "error" ? "Update check failed" : null}
        </strong>
        <span>{status.message ?? `Installed version: v${currentVersion}`}</span>
      </div>
      {status.state === "downloading" ? (
        <div className="update-progress" aria-label={`Download ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <div className="update-actions">
        {status.state === "available" ? <button className="btn btn-primary" onClick={onDownload}>Download Update</button> : null}
        {status.state === "downloaded" ? <button className="btn btn-primary" onClick={onInstall}>Restart &amp; Install</button> : null}
        {status.state === "error" ? <button className="btn btn-outline" onClick={onCheck}>Try Again</button> : null}
        {status.state === "available" || status.state === "error" ? (
          <button className="btn btn-outline" onClick={onOpenRelease}>GitHub Download</button>
        ) : null}
        {status.state !== "downloading" && status.state !== "checking" ? (
          <button className="btn btn-outline" onClick={onDismiss}>Dismiss</button>
        ) : null}
      </div>
    </section>
  );
};

export default UpdateBanner;
