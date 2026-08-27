import Store from "electron-store";
import { safeStorage } from "electron";

type StreamKeyRecord =
  | { mode: "safe"; payload: string }
  | { mode: "local"; payload: { iv: string; tag: string; data: string } };

type SecretsStore = {
  streamKey?: string;
  streamKeys?: Record<string, string>;
  secureSecrets?: Record<string, string>;
  localKey?: string;
};

let store: Store<SecretsStore> | null = null;

const getStore = () => {
  if (!store) {
    store = new Store<SecretsStore>({ name: "streaming-secrets" });
  }
  return store;
};

const removeLegacyLocalKeys = () => {
  const storeInstance = getStore();
  const streamKeys = storeInstance.get("streamKeys") ?? {};
  const safeKeys = Object.fromEntries(Object.entries(streamKeys).filter(([, serialized]) => {
    try {
      return (JSON.parse(serialized) as StreamKeyRecord).mode === "safe";
    } catch {
      return false;
    }
  }));
  if (Object.keys(safeKeys).length > 0) storeInstance.set("streamKeys", safeKeys);
  else storeInstance.delete("streamKeys");
  const singleKey = storeInstance.get("streamKey");
  if (singleKey) {
    try {
      if ((JSON.parse(singleKey) as StreamKeyRecord).mode !== "safe") storeInstance.delete("streamKey");
    } catch {
      storeInstance.delete("streamKey");
    }
  }
  storeInstance.delete("localKey");
};

export const isEncryptionAvailable = () => safeStorage.isEncryptionAvailable();

export const setSecureSecret = (key: string, value: string) => {
  if (!key || !value || !safeStorage.isEncryptionAvailable()) return false;
  const encrypted = safeStorage.encryptString(value).toString("base64");
  const record: StreamKeyRecord = { mode: "safe", payload: encrypted };
  const storeInstance = getStore();
  const secureSecrets = storeInstance.get("secureSecrets") ?? {};
  secureSecrets[key] = JSON.stringify(record);
  storeInstance.set("secureSecrets", secureSecrets);
  return true;
};

export const getSecureSecret = (key: string) => {
  const stored = getStore().get("secureSecrets")?.[key];
  if (!stored || !safeStorage.isEncryptionAvailable()) return null;
  try {
    const record = JSON.parse(stored) as StreamKeyRecord;
    return record.mode === "safe"
      ? safeStorage.decryptString(Buffer.from(record.payload, "base64"))
      : null;
  } catch {
    return null;
  }
};

export const clearSecureSecret = (key: string) => {
  const storeInstance = getStore();
  const secureSecrets = storeInstance.get("secureSecrets") ?? {};
  delete secureSecrets[key];
  if (Object.keys(secureSecrets).length) storeInstance.set("secureSecrets", secureSecrets);
  else storeInstance.delete("secureSecrets");
  return true;
};

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
      removeLegacyLocalKeys();
      return null;
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
