// PWA icons from public/icon.svg: `pnpm --filter @liftwise/web icons`, then commit the PNGs.
// Maskable and Apple icons fill the rounded corners with the icon background (full bleed).
const background = '#1B1E23';

export default {
  preset: {
    transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']], padding: 0.05 },
    maskable: { sizes: [512], padding: 0, resizeOptions: { background } },
    apple: { sizes: [180], padding: 0, resizeOptions: { background } },
  },
  images: ['public/icon.svg'],
};
