export const interfaceThemes = [
  { id: "system", label: "System", colors: ["#20232b", "#fff", "#5f89f2"] },
  { id: "dark", label: "Graphite", colors: ["#20232b", "#2a2e38", "#5f89f2"] },
  { id: "light", label: "Daylight", colors: ["#e7edf5", "#fff", "#1f6fc7"] },
  { id: "midnight", label: "Midnight Blue", colors: ["#09142c", "#101d3b", "#74a8ff"] },
  { id: "warm", label: "Warm Sanctuary", colors: ["#2a1b13", "#432b1d", "#efb269"] },
  { id: "forest", label: "Forest", colors: ["#142622", "#243e34", "#8eddad"] },
  { id: "mulberry", label: "Mulberry", colors: ["#291e32", "#402e48", "#edb5e7"] },
  { id: "sandstone", label: "Sandstone", colors: ["#f3e9d8", "#fff9ec", "#975520"] },
  { id: "high-contrast", label: "High Contrast", colors: ["#000", "#202020", "#00ffff"] }
] as const;

export type ThemePreference = (typeof interfaceThemes)[number]["id"];

export const isThemePreference = (value: unknown): value is ThemePreference =>
  interfaceThemes.some(theme => theme.id === value);

export const resolveInterfaceTheme = (preference: ThemePreference, prefersLight: boolean) =>
  preference === "system" ? (prefersLight ? "light" : "dark") : preference;
