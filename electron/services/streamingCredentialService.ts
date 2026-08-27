import {
  StreamingCredentialInput,
  StreamingCredentialProvider,
  StreamingCredentialStatus
} from "../../src/shared/types";
import {
  clearSecureSecret,
  getSecureSecret,
  isEncryptionAvailable,
  setSecureSecret
} from "./streamKeyService";

type ProviderCredentials = {
  clientId: string;
  clientSecret?: string;
};

export type StoredProviderToken = {
  refreshToken?: string;
  accessToken?: string;
  expiresAt?: number;
  account?: string;
};

const credentialsKey = (provider: StreamingCredentialProvider) => `oauth:${provider}:credentials`;
const tokenKey = (provider: StreamingCredentialProvider) => `oauth:${provider}:token`;

const environmentCredentials = (provider: StreamingCredentialProvider): ProviderCredentials | null => {
  const clientId = provider === "youtube"
    ? process.env.OPENCHURCH_YOUTUBE_CLIENT_ID
    : process.env.OPENCHURCH_FACEBOOK_APP_ID;
  const clientSecret = provider === "youtube"
    ? process.env.OPENCHURCH_YOUTUBE_CLIENT_SECRET
    : process.env.OPENCHURCH_FACEBOOK_APP_SECRET;
  if (!clientId || (provider === "facebook" && !clientSecret)) return null;
  return { clientId, ...(clientSecret ? { clientSecret } : {}) };
};

const parseStoredJson = <T>(key: string): T | null => {
  const value = getSecureSecret(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    clearSecureSecret(key);
    return null;
  }
};

const clientIdHint = (value: string) => {
  if (value.length <= 10) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
};

export const resolveStreamingCredentials = (provider: StreamingCredentialProvider) =>
  parseStoredJson<ProviderCredentials>(credentialsKey(provider)) ?? environmentCredentials(provider);

export const getStoredProviderToken = (provider: StreamingCredentialProvider) =>
  parseStoredJson<StoredProviderToken>(tokenKey(provider));

export const setStoredProviderToken = (provider: StreamingCredentialProvider, token: StoredProviderToken) =>
  setSecureSecret(tokenKey(provider), JSON.stringify(token));

export const clearStoredProviderToken = (provider: StreamingCredentialProvider) =>
  clearSecureSecret(tokenKey(provider));

export const getStreamingCredentialStatus = (provider: StreamingCredentialProvider): StreamingCredentialStatus => {
  const secure = parseStoredJson<ProviderCredentials>(credentialsKey(provider));
  const environment = environmentCredentials(provider);
  const credentials = secure ?? environment;
  const token = getStoredProviderToken(provider);
  return {
    provider,
    configured: Boolean(credentials),
    source: secure ? "secure" : environment ? "environment" : "none",
    clientIdHint: credentials ? clientIdHint(credentials.clientId) : undefined,
    account: token?.account ?? null
  };
};

export const setStreamingCredentials = (payload: StreamingCredentialInput) => {
  if (!isEncryptionAvailable()) {
    throw new Error("Secure operating-system credential storage is unavailable on this computer.");
  }
  const clientId = payload.clientId.trim();
  const clientSecret = payload.clientSecret?.trim() ?? "";
  if (!clientId) throw new Error("Enter the client ID.");
  if (payload.provider === "facebook" && !clientSecret) throw new Error("Enter both the Facebook app ID and app secret.");
  const saved = setSecureSecret(credentialsKey(payload.provider), JSON.stringify({
    clientId,
    ...(clientSecret ? { clientSecret } : {})
  }));
  if (!saved) throw new Error("The streaming credentials could not be protected and saved.");
  clearStoredProviderToken(payload.provider);
  return getStreamingCredentialStatus(payload.provider);
};

export const clearStreamingCredentials = (provider: StreamingCredentialProvider) => {
  clearSecureSecret(credentialsKey(provider));
  clearStoredProviderToken(provider);
  return getStreamingCredentialStatus(provider);
};

export const disconnectStreamingAccount = (provider: StreamingCredentialProvider) => {
  clearStoredProviderToken(provider);
  return getStreamingCredentialStatus(provider);
};
