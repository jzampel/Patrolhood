const Jimp = require('jimp');
const path = require('path');

async function processImage() {
    try {
        const inputPath = path.join(__dirname, '../client/public/app_logo_final.png');
        const outputPath = path.join(__dirname, '../client/public/logo_transparent_real.png');

        console.log('Reading:', inputPath);
        const image = await Jimp.read(inputPath);

        // Scan and make black transparent
        image.scan(0, 0, image.bitmap.width, image.bitmap.height, function (x, y, idx) {
            const r = this.bitmap.data[idx + 0];
            const g = this.bitmap.data[idx + 1];
            const b = this.bitmap.data[idx + 2];

            // If pixel is very dark (black), make it transparent
            if (r < 20 && g < 20 && b < 20) {
                this.bitmap.data[idx + 3] = 0; // Alpha 0
            }
        });

        await image.writeAsync(outputPath);
        console.log('Success! Saved to:', outputPath);
    } catch (err) {
        console.error('Error:', err);
    }
}

processImage();
