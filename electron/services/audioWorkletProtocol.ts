import { protocol } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { AUDIO_WORKLET_FILE, AUDIO_WORKLET_SCHEME, AUDIO_WORKLET_URL } from "../../src/shared/audioPlugins";

export const declareAudioWorkletProtocol = () => protocol.registerSchemesAsPrivileged([
  { scheme: AUDIO_WORKLET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

export const registerAudioWorkletProtocol = (rendererPath: string) => protocol.handle(AUDIO_WORKLET_SCHEME, async request => {
  if (request.method !== "GET" || request.url !== AUDIO_WORKLET_URL) return new Response(null, { status: 404 });
  const source = await readFile(path.join(rendererPath, AUDIO_WORKLET_FILE), "utf8");
  return new Response(source, { headers: { "Content-Type": "text/javascript", "Access-Control-Allow-Origin": "*" } });
});
