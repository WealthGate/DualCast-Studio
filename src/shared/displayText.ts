export type DisplayTextMode = "show" | "text-only" | "hide" | "theme" | "logo";

export const showsPresentationText = (mode: DisplayTextMode) => mode === "show" || mode === "text-only";
export const presentationTextMode = (mode: DisplayTextMode): DisplayTextMode => mode === "text-only" ? mode : "show";
