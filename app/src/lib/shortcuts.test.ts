import { afterEach, expect, it, vi } from "vitest";
import { ptBR, errors } from "./locales/pt-BR";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it.each(["MacIntel", "Win32", "Linux", undefined])(
  "imports shortcuts without browser globals and formats %s",
  async (platform) => {
    vi.resetModules();
    vi.stubGlobal("navigator", platform ? { platform } : undefined);
    vi.stubGlobal("document", undefined);
    const shortcuts = await import("./shortcuts");
    expect(shortcuts.isMac).toBe(platform === "MacIntel");
    expect(shortcuts.isWindows).toBe(platform === "Win32");
    expect(shortcuts.shortcutLabel(["mod", "alt", "s"])).toBe(
      platform === "MacIntel" ? "⌥⌘S" : "Ctrl+Alt+S",
    );
    expect(shortcuts.ariaKeys(["mod", "shift", "n"])).toBe(
      platform === "MacIntel" ? "Meta+Shift+N" : "Control+Shift+N",
    );
    expect(shortcuts.projectShortcut(8)).toEqual(["mod", "9"]);
    expect(shortcuts.projectShortcut(9)).toBeUndefined();
  },
);
it("preserves every translation placeholder and has no empty translations", () => {
  for (const [key, value] of Object.entries({ ...ptBR, ...errors })) {
    expect(value.trim(), key).not.toBe("");
    const placeholders = (text: string) =>
      [...text.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort();
    expect(placeholders(value), key).toEqual(placeholders(key));
  }
});
it("loads Portuguese and interpolates values while preserving unknown backend errors", async () => {
  vi.stubGlobal("localStorage", { getItem: () => "pt-BR" });
  vi.stubGlobal("document", { documentElement: { lang: "" } });
  const { t, known, language } = await import("./i18n");
  expect(language).toBe("pt-BR");
  expect(t("New task")).toBe(ptBR["New task"]);
  expect(known("Unknown synthetic error")).toBe("Unknown synthetic error");
  for (const [key, value] of Object.entries(errors)) {
    const fill = (text: string) =>
      text.replace(/\{(\d+)\}/g, (_, i) => `value-${i}`);
    expect(known(fill(key))).toBe(fill(value));
  }
});
