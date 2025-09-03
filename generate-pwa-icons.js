/**
 * PWA Icon Generator
 * Converts SVG to proper PNG icons for PWA
 */

// Icon sizes required for PWA
const iconSizes = [
  { size: 72, name: 'icon-72x72.png' },
  { size: 96, name: 'icon-96x96.png' },
  { size: 128, name: 'icon-128x128.png' },
  { size: 144, name: 'icon-144x144.png' },
  { size: 152, name: 'icon-152x152.png' },
  { size: 192, name: 'icon-192x192.png' },
  { size: 384, name: 'icon-384x384.png' },
  { size: 512, name: 'icon-512x512.png' }
];

// Create canvas-based icon generator
function generateIcons() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  iconSizes.forEach(({ size, name }) => {
    canvas.width = size;
    canvas.height = size;
    
    // Background
    ctx.fillStyle = '#0b0f19';
    ctx.fillRect(0, 0, size, size);
    
    // Create gradient
    const gradient = ctx.createRadialGradient(
      size/2, size/2, 0,
      size/2, size/2, size * 0.33
    );
    gradient.addColorStop(0, '#49e0e8');
    gradient.addColorStop(0.5, '#1FA2FF');
    gradient.addColorStop(1, '#12D8FA');
    
    // Circle
    ctx.beginPath();
    ctx.arc(size/2, size/2, size * 0.33, 0, 2 * Math.PI);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Text
    ctx.fillStyle = '#0b0f19';
    ctx.font = `bold ${size * 0.23}px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LC', size/2, size/2);
    
    // Download
    const link = document.createElement('a');
    link.download = name;
    link.href = canvas.toDataURL('image/png');
    link.click();
    
    console.log(`Generated ${name} (${size}x${size})`);
  });
  
  // Create maskable icon (for Android adaptive icons)
  canvas.width = 512;
  canvas.height = 512;
  
  // Background extends to edges for maskable
  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(0, 0, 512, 512);
  
  // Smaller circle for safe area
  const gradient = ctx.createRadialGradient(256, 256, 0, 256, 256, 140);
  gradient.addColorStop(0, '#49e0e8');
  gradient.addColorStop(0.5, '#1FA2FF');
  gradient.addColorStop(1, '#12D8FA');
  
  ctx.beginPath();
  ctx.arc(256, 256, 140, 0, 2 * Math.PI);
  ctx.fillStyle = gradient;
  ctx.fill();
  
  ctx.fillStyle = '#0b0f19';
  ctx.font = 'bold 100px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('LC', 256, 256);
  
  const maskableLink = document.createElement('a');
  maskableLink.download = 'icon-512x512-maskable.png';
  maskableLink.href = canvas.toDataURL('image/png');
  maskableLink.click();
  
  console.log('Generated maskable icon');
}

// Auto-run when page loads
document.addEventListener('DOMContentLoaded', generateIcons);