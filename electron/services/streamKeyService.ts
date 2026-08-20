import Store from "electron-store";
import { safeStorage } from "electron";
import crypto from "crypto";

type StreamKeyRecord =
  | { mode: "safe"; payload: string }
  | { mode: "local"; payload: { iv: string; tag: string; data: string } };

type SecretsStore = {
  streamKey?: string;
  streamKeys?: Record<string, string>;
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

export const setStreamKey = (streamKey: string, destinationId = "primary") => {
  if (!streamKey || !safeStorage.isEncryptionAvailable()) {
    return false;
  }
  const encrypted = safeStorage.encryptString(streamKey).toString("base64");
  const record: StreamKeyRecord = { mode: "safe", payload: encrypted };

  const storeInstance = getStore();
  const streamKeys = storeInstance.get("streamKeys") ?? {};
  streamKeys[destinationId] = JSON.stringify(record);
  storeInstance.set("streamKeys", streamKeys);
  return true;
};

export const getStreamKey = (destinationId = "primary") => {
  const storeInstance = getStore();
  const stored = storeInstance.get("streamKeys")?.[destinationId] ?? storeInstance.get("streamKey");
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

export const clearStreamKey = (destinationId?: string) => {
  const storeInstance = getStore();
  if (!destinationId) {
    storeInstance.delete("streamKey");
    storeInstance.delete("streamKeys");
    storeInstance.delete("localKey");
    return true;
  }
  const streamKeys = storeInstance.get("streamKeys") ?? {};
  delete streamKeys[destinationId];
  storeInstance.set("streamKeys", streamKeys);
  return true;
};
