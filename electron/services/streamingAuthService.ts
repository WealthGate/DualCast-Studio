import { shell } from "electron";
import { createServer } from "http";
import { createHash, randomBytes } from "crypto";
import { AddressInfo } from "net";
import { StreamingAuthorizationPayload, StreamingAuthorizationResult } from "../../src/shared/types";
import {
  buildYouTubeBroadcastResource,
  buildYouTubeStreamResource,
  normalizeYouTubeBroadcastSettings,
  validateYouTubeBroadcastSettings
} from "../../src/shared/streamingPlatforms";
import {
  clearStoredProviderToken,
  getStoredProviderToken,
  resolveStreamingCredentials,
  setStoredProviderToken
} from "./streamingCredentialService";

const waitForCode = async (authorizeUrl: (redirectUri: string, state: string) => string) => {
  const state = randomBytes(24).toString("hex");
  return new Promise<{ code: string; redirectUri: string }>((resolve, reject) => {
    let settled = false;
    const finish = (result: { code: string; redirectUri: string } | Error) => {
      if (settled) return;
      settled = true;
      try {
        server.close();
      } catch {
        // The listener may have failed before the server started.
      }
      if (result instanceof Error) reject(result);
      else resolve(result);
    };
    const server = createServer((request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (url.pathname !== "/callback") {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end("<h2>OpenChurch authorization complete</h2><p>You may close this browser tab and return to the studio.</p>");
      if (error) finish(new Error(`Authorization was declined: ${error}`));
      else if (!code || returnedState !== state) finish(new Error("Authorization response could not be verified."));
      else finish({ code, redirectUri: `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback` });
    });
    server.once("error", (error) => finish(error));
    server.listen(0, "127.0.0.1", async () => {
      const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
      try {
        await shell.openExternal(authorizeUrl(redirectUri, state));
      } catch (error) {
        finish(error instanceof Error ? error : new Error("Unable to open the authorization page."));
      }
    });
    const timeout = setTimeout(() => {
      finish(new Error("Authorization timed out. Please try again."));
    }, 180_000);
    server.on("close", () => clearTimeout(timeout));
  });
};

type YouTubeApiError = {
  error?: {
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
};

const readYouTubeResponse = async <T>(response: Response, action: string): Promise<T> => {
  const body = await response.json().catch(() => ({})) as T & YouTubeApiError;
  if (response.ok) return body;
  const detail = body.error?.errors?.[0]?.message || body.error?.message;
  throw new Error(detail ? `${action}: ${detail}` : `${action} failed (${response.status}).`);
};

type GoogleTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

const requestYouTubeAccessToken = async (
  clientId: string,
  clientSecret: string | undefined,
  forceAccountSelection: boolean
) => {
  const stored = forceAccountSelection ? null : getStoredProviderToken("youtube");
  if (stored?.refreshToken) {
    const refreshBody = new URLSearchParams({
      client_id: clientId,
      refresh_token: stored.refreshToken,
      grant_type: "refresh_token"
    });
    if (clientSecret) refreshBody.set("client_secret", clientSecret);
    const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: refreshBody
    });
    if (refreshResponse.ok) {
      const refreshed = await refreshResponse.json() as GoogleTokenResponse;
      setStoredProviderToken("youtube", {
        ...stored,
        accessToken: refreshed.access_token,
        expiresAt: Date.now() + Math.max(60, refreshed.expires_in ?? 3600) * 1000
      });
      return refreshed.access_token;
    }
    clearStoredProviderToken("youtube");
  }

  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  const { code, redirectUri } = await waitForCode((callback, state) => {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callback,
      response_type: "code",
      scope: "openid email https://www.googleapis.com/auth/youtube.force-ssl",
      access_type: "offline",
      prompt: "select_account consent",
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state
    }).toString();
    return url.toString();
  });
  const tokenBody = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier
  });
  if (clientSecret) tokenBody.set("client_secret", clientSecret);
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: tokenBody
  });
  const token = await readYouTubeResponse<GoogleTokenResponse>(tokenResponse, "YouTube token exchange");
  setStoredProviderToken("youtube", {
    refreshToken: token.refresh_token,
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max(60, token.expires_in ?? 3600) * 1000
  });
  return token.access_token;
};

const authorizeYouTube = async (
  payload: StreamingAuthorizationPayload
): Promise<StreamingAuthorizationResult> => {
  const credentials = resolveStreamingCredentials("youtube");
  if (!credentials) {
    return { ok: false, message: "Open Controls → Settings → Streaming Accounts and enter the YouTube Desktop OAuth client ID. Add the client secret only if Google supplied one." };
  }
  const { clientId, clientSecret } = credentials;
  const broadcastSettings = normalizeYouTubeBroadcastSettings(payload.broadcast);
  const validationError = validateYouTubeBroadcastSettings(broadcastSettings);
  if (validationError) return { ok: false, message: validationError };

  const accessToken = await requestYouTubeAccessToken(clientId, clientSecret, payload.forceAccountSelection === true);
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
  const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers });
  const profile = await readYouTubeResponse<{ email?: string; name?: string }>(profileResponse, "YouTube account lookup");
  const account = profile.email || profile.name || "YouTube account";
  const storedToken = getStoredProviderToken("youtube");
  if (storedToken) setStoredProviderToken("youtube", { ...storedToken, account });
  const currentValidationError = validateYouTubeBroadcastSettings(broadcastSettings);
  if (currentValidationError) throw new Error(currentValidationError);

  const broadcastResponse = await fetch(
    "https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails",
    {
      method: "POST",
      headers,
      body: JSON.stringify(buildYouTubeBroadcastResource(broadcastSettings))
    }
  );
  const broadcast = await readYouTubeResponse<{ id?: string }>(broadcastResponse, "YouTube broadcast creation");
  if (!broadcast.id) throw new Error("YouTube created the broadcast without returning its identifier.");

  const streamResponse = await fetch(
    "https://www.googleapis.com/youtube/v3/liveStreams?part=snippet,cdn,contentDetails",
    {
      method: "POST",
      headers,
      body: JSON.stringify(buildYouTubeStreamResource(
        broadcastSettings.title,
        payload.preset,
        payload.fps
      ))
    }
  );
  const stream = await readYouTubeResponse<{
    id?: string;
    cdn?: {
      ingestionInfo?: {
        ingestionAddress?: string;
        rtmpsIngestionAddress?: string;
        streamName?: string;
      };
    };
  }>(streamResponse, "YouTube stream endpoint creation");
  if (!stream.id) throw new Error("YouTube created the stream endpoint without returning its identifier.");

  const bindUrl = new URL("https://www.googleapis.com/youtube/v3/liveBroadcasts/bind");
  bindUrl.search = new URLSearchParams({
    id: broadcast.id,
    streamId: stream.id,
    part: "id,contentDetails"
  }).toString();
  const bindResponse = await fetch(bindUrl, { method: "POST", headers });
  await readYouTubeResponse(bindResponse, "YouTube broadcast binding");

  const ingestionInfo = stream.cdn?.ingestionInfo;
  const rtmpUrl = ingestionInfo?.rtmpsIngestionAddress || ingestionInfo?.ingestionAddress;
  const streamKey = ingestionInfo?.streamName;
  if (!rtmpUrl || !streamKey) throw new Error("YouTube did not return a usable RTMP endpoint.");
  return {
    ok: true,
    account,
    rtmpUrl,
    streamKey,
    broadcastId: broadcast.id,
    broadcastUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(broadcast.id)}`,
    message: "YouTube connected. The broadcast and reusable stream endpoint were created and bound with these settings."
  };
};

const authorizeFacebook = async (
  payload: StreamingAuthorizationPayload
): Promise<StreamingAuthorizationResult> => {
  const credentials = resolveStreamingCredentials("facebook");
  const appId = credentials?.clientId;
  const appSecret = credentials?.clientSecret;
  const graphVersion = process.env.OPENCHURCH_FACEBOOK_GRAPH_VERSION || "v25.0";
  if (!appId || !appSecret) return { ok: false, message: "Open Settings → Streaming Accounts and enter the Facebook app ID and app secret." };
  const savedToken = payload.forceAccountSelection ? null : getStoredProviderToken("facebook");
  if (savedToken?.accessToken) {
    const profileResponse = await fetch(`https://graph.facebook.com/${graphVersion}/me?fields=id,name,email&access_token=${encodeURIComponent(savedToken.accessToken)}`);
    if (profileResponse.ok) {
      const profile = await profileResponse.json() as { name?: string; email?: string };
      const account = profile.email || profile.name || savedToken.account || "Facebook account";
      setStoredProviderToken("facebook", { ...savedToken, account });
      return { ok: true, account, message: "Facebook is connected with the saved account. Choose or create the Live event in Facebook, then paste its Server URL and Stream Key if Facebook does not provide them through your app permissions." };
    }
    clearStoredProviderToken("facebook");
  }
  const { code, redirectUri } = await waitForCode((callback, state) => {
    const url = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`);
    url.search = new URLSearchParams({
      client_id: appId,
      redirect_uri: callback,
      response_type: "code",
      scope: "public_profile,email,pages_show_list,pages_read_engagement,publish_video",
      ...(payload.forceAccountSelection ? { auth_type: "rerequest" } : {}),
      state
    }).toString();
    return url.toString();
  });
  const tokenResponse = await fetch(`https://graph.facebook.com/${graphVersion}/oauth/access_token?${new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code })}`);
  if (!tokenResponse.ok) throw new Error("Facebook token exchange failed.");
  const token = await tokenResponse.json() as { access_token: string };
  const profileResponse = await fetch(`https://graph.facebook.com/${graphVersion}/me?fields=id,name,email&access_token=${encodeURIComponent(token.access_token)}`);
  if (!profileResponse.ok) throw new Error("Facebook account lookup failed.");
  const profile = await profileResponse.json() as { name?: string; email?: string };
  const account = profile.email || profile.name || "Facebook account";
  setStoredProviderToken("facebook", { accessToken: token.access_token, account });
  return { ok: true, account, message: "Facebook connected. Choose or create the Live event in Facebook, then paste its Server URL and Stream Key if Facebook does not provide them through your app permissions." };
};

export const authorizeStreaming = async (payload: StreamingAuthorizationPayload) => {
  try {
    return payload.provider === "youtube" ? await authorizeYouTube(payload) : await authorizeFacebook(payload);
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Authorization failed." };
  }
};
