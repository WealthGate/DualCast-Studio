import { getSettings } from "./settingsService";
import { ScriptureFetchPayload, ScriptureFetchResult } from "../../src/shared/types";

const stripMarkup = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export const fetchScripture = async (payload: ScriptureFetchPayload): Promise<ScriptureFetchResult> => {
  const reference = payload?.reference?.trim();
  if (!reference) {
    throw new Error("Enter a Bible reference, for example John 3:16-18.");
  }
  const { integrations } = getSettings();
  if (integrations.scriptureProvider === "bible-api") {
    const baseUrl = (integrations.scriptureApiUrl || "https://bible-api.com").replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/${encodeURIComponent(reference)}`);
    if (!response.ok) throw new Error(`Bible API returned ${response.status}.`);
    const data = await response.json() as { reference?: string; text?: string; translation_name?: string };
    if (!data.text) throw new Error("No verses were returned for that reference.");
    return { reference: data.reference || reference, text: data.text.trim(), translation: data.translation_name };
  }
  if (integrations.scriptureProvider === "api-bible") {
    const apiKey = process.env[integrations.scriptureApiKeyEnv];
    if (!apiKey) throw new Error(`Set ${integrations.scriptureApiKeyEnv} before using API.Bible.`);
    if (!integrations.scriptureBibleId) throw new Error("Enter an API.Bible Bible ID in Venue & Outputs.");
    const baseUrl = integrations.scriptureApiUrl.replace(/\/$/, "");
    const response = await fetch(`${baseUrl}/bibles/${encodeURIComponent(integrations.scriptureBibleId)}/search?query=${encodeURIComponent(reference)}&limit=20`, {
      headers: { "api-key": apiKey }
    });
    if (!response.ok) throw new Error(`API.Bible returned ${response.status}.`);
    const body = await response.json() as { data?: { passages?: Array<{ reference?: string; content?: string }> } };
    const passages = body.data?.passages ?? [];
    if (!passages.length) throw new Error("No verses were returned for that reference.");
    return {
      reference: passages.map((passage) => passage.reference).filter(Boolean).join("; ") || reference,
      text: passages.map((passage) => stripMarkup(passage.content || "")).filter(Boolean).join(" ")
    };
  }
  const baseUrl = integrations.scriptureApiUrl.trim();
  if (!baseUrl) throw new Error("Configure a custom Scripture API URL first.");
  const url = new URL(baseUrl);
  url.searchParams.set("reference", reference);
  const key = process.env[integrations.scriptureApiKeyEnv];
  const response = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : undefined });
  if (!response.ok) throw new Error(`Scripture provider returned ${response.status}.`);
  const data = await response.json() as { reference?: string; text?: string; translation?: string };
  if (!data.text) throw new Error("Custom provider must return JSON containing text.");
  return { reference: data.reference || reference, text: data.text, translation: data.translation };
};
