import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const LOGO_URL = 'https://i.ibb.co/ynMdVvwn/chouflogotransparant-1.png';
const BG_COLOR = '#0f172a'; // dark slate background matching manifest background_color

async function generateIcons() {
  console.log('Fetching logo from:', LOGO_URL);
  const response = await fetch(LOGO_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch logo: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const logoBuffer = Buffer.from(arrayBuffer);

  const targets = [
    { name: 'pwa-192x192.png', size: 192, innerSize: 120 },
    { name: 'pwa-512x512.png', size: 512, innerSize: 320 },
    { name: 'icon-192.png', size: 192, innerSize: 120 },
    { name: 'icon-512.png', size: 512, innerSize: 320 },
  ];

  for (const { name, size, innerSize } of targets) {
    console.log(`Generating ${name} (${size}x${size}, logo inner size ${innerSize}x${innerSize})...`);
    
    // Resize logo while keeping aspect ratio
    const resizedLogo = await sharp(logoBuffer)
      .resize(innerSize, innerSize, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .toBuffer();

    // Composite onto background
    const finalBuffer = await sharp({
      create: {
        width: size,
        height: size,
        channels: 4,
        background: BG_COLOR
      }
    })
    .composite([{ input: resizedLogo, gravity: 'center' }])
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
