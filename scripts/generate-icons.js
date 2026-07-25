import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const LOGO_URL = 'https://i.ibb.co/dwgQycV6/choufpictogram.png';

async function generateIcons() {
  console.log('Fetching Chouf pictogram from:', LOGO_URL);
  const response = await fetch(LOGO_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch logo: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const logoBuffer = Buffer.from(arrayBuffer);

  const targets = [
    { name: 'pwa-192x192.png', size: 192 },
    { name: 'pwa-512x512.png', size: 512 },
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
    { name: 'apple-touch-icon.png', size: 180 },
    { name: 'favicon.png', size: 64 },
  ];

  for (const { name, size } of targets) {
    console.log(`Generating ${name} (${size}x${size})...`);
    
    const finalBuffer = await sharp(logoBuffer)
      .resize(size, size, {
        fit: 'cover',
      })
      .png()
      .toBuffer();

    const outPath = path.join(process.cwd(), 'public', name);
    fs.writeFileSync(outPath, finalBuffer);
    console.log(`Successfully written ${outPath} (${finalBuffer.length} bytes)`);
  }

  console.log('All icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
