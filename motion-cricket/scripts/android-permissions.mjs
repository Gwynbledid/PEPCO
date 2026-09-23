// Adds the camera permission and a landscape, fullscreen activity to the
// Android project that `npx cap add android` generates.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const manifest = 'android/app/src/main/AndroidManifest.xml';
if (!existsSync(manifest)) {
  console.error('android/ not found. Run `npm run android:add` first.');
  process.exit(1);
}
let xml = readFileSync(manifest, 'utf8');
const perms = [
  '<uses-permission android:name="android.permission.CAMERA" />',
  '<uses-feature android:name="android.hardware.camera.front" android:required="false" />',
];
for (const p of perms) {
  if (!xml.includes(p)) xml = xml.replace('</manifest>', `    ${p}\n</manifest>`);
}
if (!xml.includes('android:screenOrientation')) {
  xml = xml.replace('<activity', '<activity\n            android:screenOrientation="sensorLandscape"');
}
writeFileSync(manifest, xml);
console.log('[android] camera permission + landscape orientation set in AndroidManifest.xml');
