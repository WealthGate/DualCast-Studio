import { UpdateStatusPayload } from "../../shared/types";

export type UpdateControlAction = "check" | "download" | "install" | "none";

export type UpdateControlView = {
  action: UpdateControlAction;
  label: string;
  detail: string;
  disabled: boolean;
  emphasis: "normal" | "primary";
};

export const normalizeVersion = (version?: string | null) => {
  const normalized = version?.trim().replace(/^v/i, "");
  return normalized || "unknown";
};

export const getUpdateControlView = (
  status: UpdateStatusPayload | null,
  fallbackVersion: string
): UpdateControlView => {
  const currentVersion = normalizeVersion(status?.currentVersion ?? fallbackVersion);
  const latestVersion = normalizeVersion(status?.latestVersion);
  const installedDetail = `Installed v${currentVersion}`;

  switch (status?.state) {
    case "checking":
      return {
        action: "none",
        label: "Checking for Updates…",
        detail: installedDetail,
        disabled: true,
        emphasis: "normal"
      };
    case "available":
      return {
        action: "download",
        label: `Update to v${latestVersion}`,
        detail: installedDetail,
        disabled: false,
        emphasis: "primary"
      };
    case "downloading":
      return {
        action: "none",
        label: `Downloading Update · ${Math.round(status.progressPercent ?? 0)}%`,
        detail: `${installedDetail} · v${latestVersion} next`,
        disabled: true,
        emphasis: "primary"
      };
    case "downloaded":
      return {
        action: "install",
        label: "Restart & Install",
        detail: `v${latestVersion} is ready`,
        disabled: false,
        emphasis: "primary"
      };
    case "error":
      return {
        action: "check",
        label: "Retry Update Check",
        detail: installedDetail,
        disabled: false,
        emphasis: "normal"
      };
    default:
      return {
        action: "check",
        label: "Check for Updates",
        detail: installedDetail,
        disabled: false,
        emphasis: "normal"
      };
  }
};
