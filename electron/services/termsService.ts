import { app, dialog } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const readTerms = async () => (await readFile(join(app.getAppPath(), "assets", "terms-and-conditions.txt"), "utf8")).trim();

export const requireTermsAcceptance = async () => {
  if (!app.isPackaged) return true;

  const profile = app.getPath("userData");
  const receipt = join(profile, "terms-accepted-version");
  const version = app.getVersion();
  const accepted = await readFile(receipt, "utf8").catch(() => "");
  if (accepted.trim() === version) return true;

  const terms = await readTerms();
  const { response } = await dialog.showMessageBox({
    type: "info",
    title: "Terms and Conditions",
    message: `OpenChurch Broadcast Studio v${version}`,
    detail: terms,
    buttons: ["Decline and Quit", "Accept and Continue"],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  if (response !== 1) return false;

  try {
    await mkdir(profile, { recursive: true });
    await writeFile(receipt, version, "utf8");
  } catch {
    dialog.showErrorBox("Terms accepted for this session", "Your profile could not save the acceptance. You will be asked again the next time you open this version.");
  }
  return true;
};
