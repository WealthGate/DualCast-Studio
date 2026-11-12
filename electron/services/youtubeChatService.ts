import { getYouTubeSessionToken } from "./streamingAuthService";
import type { YouTubeChatResult } from "../../src/shared/types";

const validateChat = (id: string) => {
  if (typeof id !== "string" || !id.trim() || id.length > 1024) throw Error("YouTube live chat is unavailable for this broadcast.");
};
const responseBody = async (response: Response) => {
  const body = await response.json();
  if (!response.ok) {
    const reason = body.error?.errors?.[0]?.reason;
    throw Error(reason === "liveChatEnded" ? "This live chat has ended."
      : reason === "liveChatDisabled" ? "Live chat is disabled for this broadcast."
      : reason === "rateLimitExceeded" || reason === "quotaExceeded" ? "YouTube's chat request limit was reached. Wait before reopening chat."
      : body.error?.message || "YouTube chat is unavailable. Check the connected account and broadcast.");
  }
  return body;
};
export const readYouTubeChat = async (id: string, pageToken?: string): Promise<YouTubeChatResult> => {
  try {
    validateChat(id);
    if (pageToken && (typeof pageToken !== "string" || pageToken.length > 4096)) throw Error("Invalid chat page token.");
    const token = await getYouTubeSessionToken();
    const query = new URLSearchParams({ liveChatId: id, part: "id,snippet,authorDetails", maxResults: "200" });
    if (pageToken) query.set("pageToken", pageToken);
    const body = await responseBody(await fetch(`https://www.googleapis.com/youtube/v3/liveChat/messages?${query}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000)
    }));
    return {
      ok: true, nextPageToken: body.nextPageToken,
      pollingIntervalMillis: Math.max(10000, Number(body.pollingIntervalMillis) || 10000), offline: Boolean(body.offlineAt),
      messages: (body.items ?? []).filter((item: any) => item.snippet?.displayMessage).map((item: any) => ({
        id: item.id, author: item.authorDetails?.displayName || "Viewer", text: item.snippet.displayMessage, publishedAt: item.snippet.publishedAt
      })).slice(-150)
    };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not read YouTube chat." }; }
};
export const sendYouTubeChat = async (id: string, text: string): Promise<YouTubeChatResult> => {
  try {
    validateChat(id);
    if (typeof text !== "string" || !text.trim() || Array.from(text).length > 200) throw Error("Enter a message of 1–200 characters.");
    const token = await getYouTubeSessionToken();
    await responseBody(await fetch("https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(10000),
      body: JSON.stringify({ snippet: { liveChatId: id, type: "textMessageEvent", textMessageDetails: { messageText: text.trim() } } })
    }));
    return { ok: true };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Could not send YouTube chat message." }; }
};
