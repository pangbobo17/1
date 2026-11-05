import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

/**
 * Loads the vendored fonts (see scripts/fetch-fonts.mjs). loadFont() blocks
 * rendering until the font is ready, so no frame is ever captured with a
 * fallback font (a common source of text jumping / re-flowing mid-video).
 */
let loaded = false;
export const ensureFonts = () => {
  if (loaded) return;
  loaded = true;
  for (const weight of ["500", "700", "900"]) {
    loadFont({
      family: "Noto Sans SC",
      url: staticFile(`fonts/NotoSansSC-${weight}.woff2`),
      weight,
    });
  }
  for (const weight of ["500", "700"]) {
    loadFont({
      family: "Space Grotesk",
      url: staticFile(`fonts/SpaceGrotesk-${weight}.woff2`),
      weight,
    });
  }
};
