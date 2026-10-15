import { app } from "electron";
import fs from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { getSettings } from "./settingsService";
import {
  ScriptureFetchPayload,
  ScriptureFetchResult,
  ScriptureLibraryDownloadPayload,
  ScriptureLibraryLookupPayload,
  ScriptureLibraryRemovePayload,
  ScriptureLibraryCatalog,
  ScriptureLibrarySummary
} from "../../src/shared/types";
import { sanitizeScriptureText } from "../../src/shared/scriptureText";

const stripMarkup = sanitizeScriptureText;

type ScriptureLibraryPassage = {
  reference: string;
  text: string;
  translation?: string;
};

type StoredScriptureLibrary = {
  schemaVersion: 1;
  id: string;
  name: string;
  translation?: string;
  source?: string;
  savedPassages?: boolean;
  passages: ScriptureLibraryPassage[];
};

const MAX_LIBRARY_BYTES = 25 * 1024 * 1024;
const SAVED_LIBRARY_ID = "saved-passages";

const libraryDirectory = () => path.join(app.getPath("userData"), "scripture-libraries");
const libraryPath = (libraryId: string) => path.join(libraryDirectory(), `${libraryId}.json`);
const safeText = (value: unknown) => typeof value === "string" ? stripMarkup(value) : "";

const directPassage = (value: unknown): ScriptureLibraryPassage | null => {
  if (!value || typeof value !== "object") return null;
  const entry = value as Record<string, unknown>;
  const bookName = entry.book_name ?? entry.book;
  const reference = safeText(entry.reference ?? entry.ref ?? (
    bookName && entry.chapter && entry.verse
      ? `${bookName} ${entry.chapter}:${entry.verse}`
      : ""
  ));
  const text = safeText(entry.text ?? entry.content ?? entry.verseText);
  const translation = safeText(entry.translation ?? entry.translation_name ?? entry.version) || undefined;
  return reference && text ? { reference, text, ...(translation ? { translation } : {}) } : null;
};

const passagesFromBooks = (books: unknown): ScriptureLibraryPassage[] => {
  if (!Array.isArray(books)) return [];
  const passages: ScriptureLibraryPassage[] = [];
  books.forEach((rawBook) => {
    if (!rawBook || typeof rawBook !== "object") return;
    const book = rawBook as Record<string, unknown>;
    const bookName = safeText(book.name ?? book.book ?? book.book_name);
    if (!bookName) return;
    const chapters = book.chapters;
    if (Array.isArray(chapters)) {
      chapters.forEach((rawChapter, chapterIndex) => {
        const chapterObject = rawChapter && typeof rawChapter === "object" && !Array.isArray(rawChapter)
          ? rawChapter as Record<string, unknown>
          : null;
        const chapterNumber = Number(chapterObject?.chapter ?? chapterObject?.number ?? chapterIndex + 1);
        const verses = chapterObject?.verses ?? rawChapter;
        if (Array.isArray(verses)) {
          verses.forEach((rawVerse, verseIndex) => {
            const verseObject = rawVerse && typeof rawVerse === "object" && !Array.isArray(rawVerse)
              ? rawVerse as Record<string, unknown>
              : null;
            const verseNumber = Number(verseObject?.verse ?? verseObject?.number ?? verseIndex + 1);
            const text = safeText(verseObject?.text ?? verseObject?.content ?? rawVerse);
            if (text) passages.push({ reference: `${bookName} ${chapterNumber}:${verseNumber}`, text });
          });
        }
      });
    } else if (chapters && typeof chapters === "object") {
      Object.entries(chapters as Record<string, unknown>).forEach(([chapterKey, rawVerses]) => {
        const verses = Array.isArray(rawVerses)
          ? rawVerses.map((rawVerse, verseIndex) => [String(verseIndex + 1), rawVerse] as const)
          : Object.entries((rawVerses as Record<string, unknown>) ?? {});
        verses.forEach(([verseKey, rawVerse], verseIndex) => {
          const verseObject = rawVerse && typeof rawVerse === "object" && !Array.isArray(rawVerse)
            ? rawVerse as Record<string, unknown>
            : null;
          const keyedVerse = Number(verseKey);
          const verseNumber = Number(verseObject?.verse ?? verseObject?.number ?? (Number.isFinite(keyedVerse) ? keyedVerse : verseIndex + 1));
          const text = safeText(verseObject?.text ?? verseObject?.content ?? rawVerse);
          if (text) passages.push({ reference: `${bookName} ${chapterKey}:${verseNumber}`, text });
        });
      });
    }
  });
  return passages;
};

export const normalizeScriptureLibrary = (data: unknown, fallbackName: string, source?: string): Omit<StoredScriptureLibrary, "id"> => {
  const root = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
  const direct = Array.isArray(data)
    ? data
    : Array.isArray(root.passages)
      ? root.passages
      : Array.isArray(root.verses)
        ? root.verses
        : [];
  const passages = direct.map(directPassage).filter((entry): entry is ScriptureLibraryPassage => Boolean(entry));
  passages.push(...passagesFromBooks(root.books));
  if (passages.length === 0) {
    throw new Error("No Scripture passages were found. Use passages/verses with reference and text, or books with chapters and verses.");
  }
  const unique = Array.from(new Map(passages.map((passage) => [
    passage.reference.toLowerCase().replace(/\s+/g, " "),
    passage
  ])).values());
  return {
    schemaVersion: 1,
    name: safeText(root.name ?? root.title) || fallbackName,
    translation: safeText(root.translation ?? root.translation_name ?? root.version) || undefined,
    source,
    passages: unique.slice(0, 100_000)
  };
};

const writeLibrary = async (library: Omit<StoredScriptureLibrary, "id">, preferredId?: string): Promise<ScriptureLibrarySummary> => {
  await fs.mkdir(libraryDirectory(), { recursive: true });
  const digest = createHash("sha256").update(JSON.stringify(library.passages)).digest("hex").slice(0, 16);
  const id = preferredId ?? `library-${digest}`;
  const stored: StoredScriptureLibrary = { ...library, id };
  await fs.writeFile(libraryPath(id), JSON.stringify(stored), "utf8");
  return {
    id,
    name: stored.name,
    translation: stored.translation,
    source: stored.source,
    passageCount: stored.passages.length,
    savedPassages: stored.savedPassages
  };
};

const readLibrary = async (libraryId: string): Promise<StoredScriptureLibrary> => {
  if (!/^[a-z0-9-]+$/i.test(libraryId)) throw new Error("Invalid Scripture library ID.");
  const raw = await fs.readFile(libraryPath(libraryId), "utf8");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("The Scripture library file is damaged.");
  }
  const candidate = parsed as Partial<StoredScriptureLibrary>;
  if (candidate.schemaVersion !== 1 || candidate.id !== libraryId || typeof candidate.name !== "string" || !Array.isArray(candidate.passages)) {
    throw new Error("The Scripture library file is damaged or unsupported.");
  }
  const passages = candidate.passages.map(directPassage).filter((entry): entry is ScriptureLibraryPassage => Boolean(entry));
  if (passages.length === 0) {
    throw new Error("The Scripture library contains no usable passages.");
  }
  return {
    schemaVersion: 1,
    id: libraryId,
    name: safeText(candidate.name) || "Scripture Library",
    translation: safeText(candidate.translation) || undefined,
    source: typeof candidate.source === "string" ? candidate.source : undefined,
    savedPassages: candidate.savedPassages === true,
    passages
  };
};

export const listScriptureLibraries = async (): Promise<ScriptureLibrarySummary[]> => {
  await fs.mkdir(libraryDirectory(), { recursive: true });
  const files = await fs.readdir(libraryDirectory());
  const summaries = await Promise.all(files.filter((file) => file.endsWith(".json")).map(async (file): Promise<ScriptureLibrarySummary | null> => {
    try {
      const libraryId = path.basename(file, ".json");
      const library = await readLibrary(libraryId);
      return {
        id: library.id,
        name: library.name,
        translation: library.translation,
        source: library.source,
        passageCount: library.passages?.length ?? 0,
        savedPassages: library.savedPassages
      };
    } catch {
      return null;
    }
  }));
  return summaries.flatMap((summary) => summary ? [summary] : []);
};

export const getScriptureLibraryCatalog = async (libraryId: string): Promise<ScriptureLibraryCatalog> => {
  const library = await readLibrary(libraryId);
  const books = new Map<string, Map<number, Set<number>>>();
  library.passages.forEach((passage) => {
    const parts = referenceParts(passage.reference);
    if (!parts) return;
    const bookName = passage.reference.replace(/\s+\d+:.*$/, "").trim();
    const chapters = books.get(bookName) ?? new Map<number, Set<number>>();
    const verses = chapters.get(parts.chapter) ?? new Set<number>();
    for (let verse = parts.start; verse <= parts.end; verse += 1) verses.add(verse);
    chapters.set(parts.chapter, verses);
    books.set(bookName, chapters);
  });
  return {
    libraryId,
    books: Array.from(books.entries()).map(([name, chapters]) => ({
      name,
      chapters: Array.from(chapters.entries())
        .sort(([left], [right]) => left - right)
        .map(([number, verses]) => ({ number, verses: Array.from(verses).sort((left, right) => left - right) }))
    }))
  };
};

export const importScriptureLibrary = async (filePath: string): Promise<ScriptureLibrarySummary> => {
  const stats = await fs.stat(filePath);
  if (stats.size > MAX_LIBRARY_BYTES) throw new Error("Scripture library files must be 25 MB or smaller.");
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  return writeLibrary(normalizeScriptureLibrary(parsed, path.basename(filePath, path.extname(filePath)), filePath));
};

export const downloadScriptureLibrary = async (payload: ScriptureLibraryDownloadPayload): Promise<ScriptureLibrarySummary> => {
  const url = new URL(payload?.url?.trim());
  if (url.protocol !== "https:") throw new Error("Use an HTTPS address for Scripture library downloads.");
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Scripture library download returned ${response.status}.`);
  const finalUrl = new URL(response.url || url.toString());
  if (finalUrl.protocol !== "https:") throw new Error("The Scripture library redirected to an insecure address.");
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_LIBRARY_BYTES) throw new Error("Scripture library files must be 25 MB or smaller.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_LIBRARY_BYTES) throw new Error("Scripture library files must be 25 MB or smaller.");
  const parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  const fallbackName = path.basename(finalUrl.pathname, path.extname(finalUrl.pathname)) || finalUrl.hostname;
  return writeLibrary(normalizeScriptureLibrary(parsed, fallbackName, finalUrl.toString()));
};

const normalizedReference = (value: string) => value.toLowerCase().replace(/[.]/g, "").replace(/\s+/g, " ").trim();
const referenceParts = (value: string) => {
  const match = normalizedReference(value).match(/^(.+?)\s+(\d+):(\d+)(?:\s*-\s*(\d+))?$/);
  return match ? { book: match[1], chapter: Number(match[2]), start: Number(match[3]), end: Number(match[4] ?? match[3]) } : null;
};

export const lookupScriptureLibrary = async (payload: ScriptureLibraryLookupPayload): Promise<ScriptureFetchResult> => {
  const library = await readLibrary(payload.libraryId);
  const query = normalizedReference(payload.reference);
  if (!query) throw new Error("Enter a Bible reference, for example John 3:16-18.");
  const exact = library.passages.find((passage) => normalizedReference(passage.reference) === query);
  if (exact) return {
    ...exact,
    translation: exact.translation ?? library.translation,
    verses: [{ reference: exact.reference, text: exact.text }]
  };
  const range = referenceParts(query);
  if (range) {
    const matches = library.passages.filter((passage) => {
      const parts = referenceParts(passage.reference);
      return parts && parts.book === range.book && parts.chapter === range.chapter && parts.start >= range.start && parts.start <= range.end;
    });
    if (matches.length > 0) {
      return {
        reference: payload.reference.trim(),
        text: matches.map((passage) => passage.text).join(" "),
        verses: matches.map((passage) => ({ reference: passage.reference, text: passage.text })),
        translation: matches.every((passage) => passage.translation === matches[0].translation)
          ? matches[0].translation ?? library.translation
          : library.translation
      };
    }
  }
  const partial = library.passages.find((passage) => normalizedReference(passage.reference).includes(query));
  if (partial) return {
    ...partial,
    translation: partial.translation ?? library.translation,
    verses: [{ reference: partial.reference, text: partial.text }]
  };
  throw new Error(`No passage matching ${payload.reference} was found in ${library.name}.`);
};

export const saveScripturePassage = async (passage: ScriptureFetchResult): Promise<ScriptureLibrarySummary> => {
  const clean = directPassage({ ...passage, translation: passage.translation });
  if (!clean) throw new Error("Load or enter a complete Scripture passage first.");
  let existing: StoredScriptureLibrary | null = null;
  try {
    existing = await readLibrary(SAVED_LIBRARY_ID);
  } catch {
    // The personal saved-passage library is created on first use.
  }
  const passages = existing?.passages ?? [];
  const key = normalizedReference(clean.reference);
  const merged = [...passages.filter((entry) => normalizedReference(entry.reference) !== key), clean];
  return writeLibrary({
    schemaVersion: 1,
    name: "Saved Passages",
    savedPassages: true,
    passages: merged
  }, SAVED_LIBRARY_ID);
};

export const removeScriptureLibrary = async (payload: ScriptureLibraryRemovePayload): Promise<boolean> => {
  if (payload.libraryId === SAVED_LIBRARY_ID) throw new Error("Saved Passages is managed by saving individual passages.");
  if (!/^[a-z0-9-]+$/i.test(payload.libraryId)) throw new Error("Invalid Scripture library ID.");
  await fs.unlink(libraryPath(payload.libraryId));
  return true;
};

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
    const data = await response.json() as {
      reference?: string;
      text?: string;
      translation_name?: string;
      verses?: Array<{ book_name?: string; chapter?: number; verse?: number; text?: string }>;
    };
    if (!data.text) throw new Error("No verses were returned for that reference.");
    return {
      reference: stripMarkup(data.reference || reference),
      text: stripMarkup(data.text),
      translation: data.translation_name,
      verses: data.verses?.flatMap((verse) => {
        const text = stripMarkup(verse.text || "");
        return text ? [{ reference: stripMarkup(`${verse.book_name ?? ""} ${verse.chapter ?? ""}:${verse.verse ?? ""}`), text }] : [];
      })
    };
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
      text: passages.map((passage) => stripMarkup(passage.content || "")).filter(Boolean).join(" "),
      verses: passages.flatMap((passage) => {
        const text = stripMarkup(passage.content || "");
        return text ? [{ reference: passage.reference || reference, text }] : [];
      })
    };
  }
  const baseUrl = integrations.scriptureApiUrl.trim();
  if (!baseUrl) throw new Error("Configure a custom Scripture API URL first.");
  const url = new URL(baseUrl);
  url.searchParams.set("reference", reference);
  const key = process.env[integrations.scriptureApiKeyEnv];
  const response = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : undefined });
  if (!response.ok) throw new Error(`Scripture provider returned ${response.status}.`);
  const data = await response.json() as {
    reference?: string;
    text?: string;
    translation?: string;
    verses?: Array<{ reference?: string; text?: string }>;
  };
  if (!data.text) throw new Error("Custom provider must return JSON containing text.");
  return {
    reference: stripMarkup(data.reference || reference),
    text: stripMarkup(data.text),
    translation: data.translation,
    verses: data.verses?.flatMap((verse) => {
      const text = stripMarkup(verse.text || "");
      return text ? [{ reference: stripMarkup(verse.reference || reference), text }] : [];
    })
  };
};
