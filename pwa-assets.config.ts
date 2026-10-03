import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// public/favicon.svg is a full-bleed square icon whose artwork already sits inside the
// maskable safe zone, so no icon gets extra padding; phones round or crop the corners.
const fullBleed = { padding: 0 };

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, ...fullBleed },
    maskable: { ...minimal2023Preset.maskable, ...fullBleed },
    apple: { ...minimal2023Preset.apple, ...fullBleed },
  },
  images: ['public/favicon.svg'],
});
