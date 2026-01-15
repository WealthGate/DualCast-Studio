import Store from "electron-store";
import { safeStorage } from "electron";
import crypto from "crypto";

type StreamKeyRecord =
  | { mode: "safe"; payload: string }
  | { mode: "local"; payload: { iv: string; tag: string; data: string } };

type SecretsStore = {
  streamKey?: string;
  localKey?: string;
};

let store: Store<SecretsStore> | null = null;

const getStore = () => {
  if (!store) {
    store = new Store<SecretsStore>({ name: "streaming-secrets" });
  }
  return store;
};

const getLocalKey = () => {
  const storeInstance = getStore();
  let key = storeInstance.get("localKey");
  if (!key) {
    key = crypto.randomBytes(32).toString("base64");
    storeInstance.set("localKey", key);
  }
  return Buffer.from(key, "base64");
};

const encryptLocal = (value: string) => {
  const key = getLocalKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  };
};

const decryptLocal = (payload: { iv: string; tag: string; data: string }) => {
  const key = getLocalKey();
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const encrypted = Buffer.from(payload.data, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
};

export const isEncryptionAvailable = () => safeStorage.isEncryptionAvailable();

export const setStreamKey = (streamKey: string) => {
  if (!streamKey) {
    return false;
  }
  let record: StreamKeyRecord;

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(streamKey).toString("base64");
    record = { mode: "safe", payload: encrypted };
  } else {
    record = { mode: "local", payload: encryptLocal(streamKey) };
  }

  getStore().set("streamKey", JSON.stringify(record));
  return true;
};

export const getStreamKey = () => {
  const stored = getStore().get("streamKey");
  if (!stored) {
    return null;
  }

  try {
    const record = JSON.parse(stored) as StreamKeyRecord;
    if (record.mode === "safe") {
      if (!safeStorage.isEncryptionAvailable()) {
        return null;
      }
      return safeStorage.decryptString(Buffer.from(record.payload, "base64"));
    }
    if (record.mode === "local") {
      return decryptLocal(record.payload);
    }
  } catch {
    return null;
  }

  return null;
};

export const clearStreamKey = () => {
  const storeInstance = getStore();
  storeInstance.delete("streamKey");
  return true;
};
