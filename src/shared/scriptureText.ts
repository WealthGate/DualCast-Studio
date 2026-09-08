const namedEntities: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: "\""
};

const decodeEntity = (_match: string, value: string) => {
  if (value.startsWith("#x") || value.startsWith("#X")) {
    const code = Number.parseInt(value.slice(2), 16);
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
  }
  if (value.startsWith("#")) {
    const code = Number.parseInt(value.slice(1), 10);
    return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
  }
  return namedEntities[value.toLowerCase()] ?? " ";
};

const scriptureMarkupTags = /<\/?(?:a|b|br|div|em|i|p|q|s|small|span|strong|sup|sub|u|v|verse|wj|w)\b[^>]*>/gi;

export const sanitizeScriptureText = (value: string) => value
  .replace(scriptureMarkupTags, " ")
  .replace(/&([a-z]+|#\d+|#x[0-9a-f]+);/gi, decodeEntity)
  .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
  .replace(/^\s*[<>]+\s*/, "")
  .replace(/\s*[<>]+\s*$/, "")
  .replace(/\s+/g, " ")
  .trim();
