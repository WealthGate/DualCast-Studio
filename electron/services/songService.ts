import { app } from "electron";
import { createHash } from "crypto";
import fs from "fs/promises";
import path from "path";
import { SongDownloadPayload, SongLibraryEntry, SongRemovePayload } from "../../src/shared/types";

type StoredSong = SongLibraryEntry & { schemaVersion: 1 };

const MAX_SONG_BYTES = 2 * 1024 * 1024;
const songDirectory = () => path.join(app.getPath("userData"), "song-library");
const songPath = (songId: string) => path.join(songDirectory(), `${songId}.json`);
const cleanText = (value: unknown) => typeof value === "string"
  ? value.replace(/<[^>]+>/g, " ").replace(/\r\n/g, "\n").trim()
  : "";

export const normalizeSong = (data: unknown, fallbackTitle: string, source?: string): Omit<StoredSong, "id"> => {
  if (typeof data === "string") {
    const lyrics = cleanText(data);
    if (!lyrics) throw new Error("The downloaded song file contains no lyrics.");
    return { schemaVersion: 1, title: fallbackTitle || "Downloaded Song", lyrics, source };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("The song file is not a supported text or JSON document.");
  const root = data as Record<string, unknown>;
  const sections = Array.isArray(root.slides)
    ? root.slides
    : Array.isArray(root.verses)
      ? root.verses
      : [];
  const sectionText = sections.flatMap((section) => {
    if (typeof section === "string") return cleanText(section) ? [cleanText(section)] : [];
    if (!section || typeof section !== "object") return [];
    const entry = section as Record<string, unknown>;
    const text = cleanText(entry.text ?? entry.lyrics ?? entry.content);
    return text ? [text] : [];
  }).join("\n\n");
  const lyrics = cleanText(root.lyrics ?? root.text ?? root.content) || sectionText;
  if (!lyrics) throw new Error("The song file contains no lyrics/text or slides/verses.");
  return {
    schemaVersion: 1,
    title: cleanText(root.title ?? root.name) || fallbackTitle || "Downloaded Song",
    lyrics,
    source
  };
};

const writeSong = async (song: Omit<StoredSong, "id">): Promise<SongLibraryEntry> => {
  await fs.mkdir(songDirectory(), { recursive: true });
  const id = `song-${createHash("sha256").update(`${song.title}\n${song.lyrics}`).digest("hex").slice(0, 16)}`;
  const stored: StoredSong = { ...song, id };
  await fs.writeFile(songPath(id), JSON.stringify(stored), "utf8");
  return { id, title: stored.title, lyrics: stored.lyrics, source: stored.source };
};

const readSong = async (songId: string): Promise<SongLibraryEntry> => {
  if (!/^song-[a-f0-9]{16}$/i.test(songId)) throw new Error("Invalid song ID.");
  const parsed = JSON.parse(await fs.readFile(songPath(songId), "utf8")) as Partial<StoredSong>;
  if (parsed.schemaVersion !== 1 || parsed.id !== songId) throw new Error("The saved song file is damaged.");
  const title = cleanText(parsed.title);
  const lyrics = cleanText(parsed.lyrics);
  if (!title || !lyrics) throw new Error("The saved song file is damaged.");
  return { id: songId, title, lyrics, source: typeof parsed.source === "string" ? parsed.source : undefined };
};

export const listSongs = async (): Promise<SongLibraryEntry[]> => {
  await fs.mkdir(songDirectory(), { recursive: true });
  const files = await fs.readdir(songDirectory());
  const songs = await Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file) => {
    try {
      return await readSong(path.basename(file, ".json"));
    } catch {
      return null;
    }
  }));
  return songs.flatMap((song) => song ? [song] : []).sort((left, right) => left.title.localeCompare(right.title));
};

export const importSong = async (filePath: string): Promise<SongLibraryEntry> => {
  const stats = await fs.stat(filePath);
  if (stats.size > MAX_SONG_BYTES) throw new Error("Song lyric files must be 2 MB or smaller.");
  const raw = await fs.readFile(filePath, "utf8");
  const extension = path.extname(filePath).toLowerCase();
  const data = extension === ".json" ? JSON.parse(raw) as unknown : raw;
  return writeSong(normalizeSong(data, path.basename(filePath, extension), filePath));
};

export const downloadSong = async (payload: SongDownloadPayload): Promise<SongLibraryEntry> => {
  const url = new URL(payload?.url?.trim());
  if (url.protocol !== "https:") throw new Error("Use an HTTPS address for song downloads.");
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Song download returned ${response.status}.`);
  const finalUrl = new URL(response.url || url.toString());
  if (finalUrl.protocol !== "https:") throw new Error("The song download redirected to an insecure address.");
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_SONG_BYTES) throw new Error("Song lyric files must be 2 MB or smaller.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_SONG_BYTES) throw new Error("Song lyric files must be 2 MB or smaller.");
  const raw = new TextDecoder().decode(bytes);
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("json") || finalUrl.pathname.toLowerCase().endsWith(".json");
  const data = isJson ? JSON.parse(raw) as unknown : raw;
  const fallbackTitle = path.basename(finalUrl.pathname, path.extname(finalUrl.pathname)) || finalUrl.hostname;
  return writeSong(normalizeSong(data, fallbackTitle, finalUrl.toString()));
};

export const removeSong = async (payload: SongRemovePayload): Promise<boolean> => {
  if (!/^song-[a-f0-9]{16}$/i.test(payload.songId)) throw new Error("Invalid song ID.");
  await fs.unlink(songPath(payload.songId));
  return true;
};
