#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const svgPath = path.resolve(__dirname, '../src/assets/icon/favicon.svg');
if (!fs.existsSync(svgPath)) {
  console.error('SVG icon not found at', svgPath);
  process.exit(1);
}

// Android launcher sizes (px) for density buckets
const sizes = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192
};

const outBase = path.resolve(__dirname, '../android/app/src/main/res');

(async () => {
  for (const [folder, size] of Object.entries(sizes)) {
    const dir = path.join(outBase, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const outFile = path.join(dir, 'ic_launcher.png');
    await sharp(svgPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outFile);

    const outFileRound = path.join(dir, 'ic_launcher_round.png');
    await sharp(svgPath)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outFileRound);

    console.log('Written', outFile);
  }

  // Create a simple adaptive icon xml (basic) for v26+ in mipmap-anydpi-v26
  const adaptiveDir = path.join(outBase, 'mipmap-anydpi-v26');
  if (!fs.existsSync(adaptiveDir)) fs.mkdirSync(adaptiveDir, { recursive: true });
  const xml = `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n  <background android:drawable="@color/launcher_background"/>\n  <foreground android:drawable="@mipmap/ic_launcher"/>\n</adaptive-icon>`;
  fs.writeFileSync(path.join(adaptiveDir, 'ic_launcher.xml'), xml);
  fs.writeFileSync(path.join(adaptiveDir, 'ic_launcher_round.xml'), xml);
  console.log('Written adaptive icon xml in', adaptiveDir);

  // Ensure a launcher background color resource exists
  const valuesDir = path.join(outBase, 'values');
  if (!fs.existsSync(valuesDir)) fs.mkdirSync(valuesDir, { recursive: true });
  const colorsXmlPath = path.join(valuesDir, 'colors.xml');
  if (!fs.existsSync(colorsXmlPath)) {
    const colorsXml = `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="launcher_background">#12192d</color>\n</resources>`;
    fs.writeFileSync(colorsXmlPath, colorsXml);
    console.log('Created', colorsXmlPath);
  }

  console.log('All icons generated. Run `npx cap sync android` to copy assets to the native project.');
})();
