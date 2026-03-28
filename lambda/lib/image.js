import sharp from 'sharp';

// KDP 8.5x11" at 300 DPI
const PRINT_WIDTH = 2550;
const PRINT_HEIGHT = 3300;
const PRINT_DPI = 300;

/**
 * Derive the print-ready S3 key from an original key.
 * attempt-3.png → attempt-3-print.png
 */
export const printKey = (originalKey) =>
  originalKey.replace(/\.png$/, '-print.png');

/**
 * Upscale an image buffer to print dimensions using Lanczos resampling.
 * Returns a PNG buffer at 300 DPI.
 */
export const upscaleForPrint = async (buffer) => {
  return sharp(buffer)
    .resize(PRINT_WIDTH, PRINT_HEIGHT, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
      kernel: sharp.kernel.lanczos3,
    })
    .png({ compressionLevel: 6 })
    .withMetadata({ density: PRINT_DPI })
    .toBuffer();
};
