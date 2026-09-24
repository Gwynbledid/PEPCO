// Optional art. Drop files with these names into public/assets/ and they
// replace the procedural versions. See ASSET_PROMPTS.md for how to make them.
export const ASSET_FILES = {
  sky: 'sky.jpg',
  grass: 'grass.jpg',
  pitch: 'pitch.jpg',
  roofBanner: 'roof_banner.png',
  batSticker: 'bat_sticker.png',
  logo: 'logo.png',
  sponsor1: 'sponsor_1.png',
  sponsor2: 'sponsor_2.png',
  sponsor3: 'sponsor_3.png',
  sponsor4: 'sponsor_4.png',
  sponsor5: 'sponsor_5.png',
  sponsor6: 'sponsor_6.png',
};

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Resolves to { key: HTMLImageElement | null } for every optional asset. */
export async function loadAssets() {
  const entries = await Promise.all(
    Object.entries(ASSET_FILES).map(async ([key, file]) => [key, await loadImage(`assets/${file}`)]),
  );
  const assets = Object.fromEntries(entries);
  const found = entries.filter(([, img]) => img).map(([k]) => k);
  if (found.length) console.info('[assets] using custom art for:', found.join(', '));
  return assets;
}
