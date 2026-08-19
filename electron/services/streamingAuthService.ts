import { shell } from "electron";
import { createServer } from "http";
import { randomBytes } from "crypto";
import { AddressInfo } from "net";
import { StreamingAuthorizationPayload, StreamingAuthorizationResult } from "../../src/shared/types";

const waitForCode = async (authorizeUrl: (redirectUri: string, state: string) => string) => {
  const state = randomBytes(24).toString("hex");
  return new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<h2>OpenChurch authorization complete</h2><p>You may close this browser tab and return to the studio.</p>");
      if (error) reject(new Error(`Authorization was declined: ${error}`));
      else if (!code || returnedState !== state) reject(new Error("Authorization response could not be verified."));
      else resolve({ code, redirectUri: `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback` });
      server.close();
    });
    server.listen(0, "127.0.0.1", async () => {
      const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
      await shell.openExternal(authorizeUrl(redirectUri, state));
    });
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error("Authorization timed out. Please try again."));
    }, 180_000);
    server.on("close", () => clearTimeout(timeout));
  });
};

const authorizeYouTube = async (): Promise<StreamingAuthorizationResult> => {
  const clientId = process.env.OPENCHURCH_YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.OPENCHURCH_YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { ok: false, message: "Set OPENCHURCH_YOUTUBE_CLIENT_ID and OPENCHURCH_YOUTUBE_CLIENT_SECRET, then restart the app." };
  }
  const { code, redirectUri } = await waitForCode((callback, state) => {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: "code", scope: "openid email https://www.googleapis.com/auth/youtube.readonly", access_type: "offline", prompt: "consent", state }).toString();
    return url.toString();
  });
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" })
  });
  if (!tokenResponse.ok) throw new Error("YouTube token exchange failed.");
  const token = await tokenResponse.json() as { access_token: string };
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const [profileResponse, broadcastResponse] = await Promise.all([
    fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers }),
    fetch("https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,contentDetails&broadcastStatus=all&mine=true&maxResults=25", { headers })
  ]);
  const profile = await profileResponse.json() as { email?: string; name?: string };
  const broadcasts = await broadcastResponse.json() as { items?: Array<{ snippet?: { title?: string; scheduledStartTime?: string; actualStartTime?: string }; contentDetails?: { boundStreamId?: string } }> };
  const broadcast = broadcasts.items?.find((item) => item.snippet?.actualStartTime) ?? broadcasts.items?.find((item) => item.contentDetails?.boundStreamId);
  let rtmpUrl: string | undefined;
  let streamKey: string | undefined;
  if (broadcast?.contentDetails?.boundStreamId) {
    const streamResponse = await fetch(`https://www.googleapis.com/youtube/v3/liveStreams?part=cdn&id=${encodeURIComponent(broadcast.contentDetails.boundStreamId)}`, { headers });
    const stream = await streamResponse.json() as { items?: Array<{ cdn?: { ingestionInfo?: { ingestionAddress?: string; streamName?: string } } }> };
    rtmpUrl = stream.items?.[0]?.cdn?.ingestionInfo?.ingestionAddress;
    streamKey = stream.items?.[0]?.cdn?.ingestionInfo?.streamName;
  }
  return {
    ok: true,
    account: profile.email || profile.name || "YouTube account",
    rtmpUrl,
    streamKey,
    message: rtmpUrl && streamKey ? "YouTube connected and its bound live stream was loaded." : "YouTube connected. Create or bind a stream in YouTube Studio, then connect again to load its endpoint."
  };
};

const authorizeFacebook = async (): Promise<StreamingAuthorizationResult> => {
  const appId = process.env.OPENCHURCH_FACEBOOK_APP_ID;
  const appSecret = process.env.OPENCHURCH_FACEBOOK_APP_SECRET;
  const graphVersion = process.env.OPENCHURCH_FACEBOOK_GRAPH_VERSION || "v25.0";
  if (!appId || !appSecret) return { ok: false, message: "Set OPENCHURCH_FACEBOOK_APP_ID and OPENCHURCH_FACEBOOK_APP_SECRET, then restart the app." };
  const { code, redirectUri } = await waitForCode((callback, state) => {
    const url = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
    url.search = new URLSearchParams({ client_id: appId, redirect_uri: callback, response_type: "code", scope: "public_profile,email,pages_show_list,pages_read_engagement,publish_video", state }).toString();
    return url.toString();
  });
  const tokenResponse = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code })}`);
  if (!tokenResponse.ok) throw new Error("Facebook token exchange failed.");
  const token = await tokenResponse.json() as { access_token: string };
  const profileResponse = await fetch(`https://graph.facebook.com/${graphVersion}/me?fields=id,name,email&access_token=${encodeURIComponent(token.access_token)}`);
  const profile = await profileResponse.json() as { name?: string; email?: string };
  return { ok: true, account: profile.email || profile.name || "Facebook account", message: "Facebook connected. Choose or create the Live event in Facebook, then paste its Server URL and Stream Key if Facebook does not provide them through your app permissions." };
};

export const authorizeStreaming = async (payload: StreamingAuthorizationPayload) => {
  try {
    return payload.provider === "youtube" ? await authorizeYouTube() : await authorizeFacebook();
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Authorization failed." };
  }
};
