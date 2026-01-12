const sharp = require('sharp');
const path = require('path');

const input = path.join(__dirname, '../client/public/logo_bull_original.jpg');
const output = path.join(__dirname, '../client/public/logo_bull.png');

async function process() {
    try {
        console.log('Processing:', input);

        // 1. Load image
        // 2. Ensure it has an alpha channel
        // 3. We will threshold to make black pixels transparent.
        //    Since sharp doesn't have a direct "replace color" as easily as pixel manipulation,
        //    we will use a raw buffer manipulation for precision.

        const { data, info } = await sharp(input)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        // Iterate pixels
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];

            // If pixel is close to black, make it transparent
            // High tolerance for compression artifacts in JPG
            if (r < 50 && g < 50 && b < 50) {
                data[i + 3] = 0; // Alpha = 0
            }
        }

        await sharp(data, {
            raw: {
                width: info.width,
                height: info.height,
                channels: 4
            }
        })
            .png()
            .toFile(output);

        console.log('Done! Saved to:', output);
    } catch (err) {
        console.error('Error:', err);
    }
}

process();
