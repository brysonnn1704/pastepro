// Contrast check script for DESIGN.md tokens
function hexToRgb(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  const num = parseInt(c, 16);
  return [num >> 16, (num >> 8) & 255, num & 255];
}

function luminance(r, g, b) {
  const a = [r, g, b].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

function contrast(hex1, hex2) {
  const lum1 = luminance(...hexToRgb(hex1));
  const lum2 = luminance(...hexToRgb(hex2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}

const pairs = [
  { name: 'Light Text Primary on Surface', fg: '#111111', bg: '#FFFFFF' },
  { name: 'Light Text Secondary on Surface', fg: '#525252', bg: '#FFFFFF' },
  { name: 'Light Accent on Surface', fg: '#0057E7', bg: '#FFFFFF' },
  { name: 'Light Text Inverse on Accent', fg: '#FFFFFF', bg: '#0057E7' },
  { name: 'Light Success on Surface', fg: '#15803D', bg: '#FFFFFF' },
  { name: 'Light Danger on Surface', fg: '#DC2626', bg: '#FFFFFF' },
  { name: 'Dark Text Primary on Surface', fg: '#FAFAFA', bg: '#0A0A0A' },
  { name: 'Dark Text Secondary on Surface', fg: '#A3A3A3', bg: '#0A0A0A' },
  { name: 'Dark Accent on Surface', fg: '#4D8EFF', bg: '#0A0A0A' },
  { name: 'Dark Success on Surface', fg: '#4ADE80', bg: '#0A0A0A' },
  { name: 'Dark Danger on Surface', fg: '#F87171', bg: '#0A0A0A' },
];

console.log('--- WCAG AA Contrast Ratios ---');
let allPass = true;
pairs.forEach(p => {
  const ratio = contrast(p.fg, p.bg);
  const pass = ratio >= 4.5;
  if (!pass) allPass = false;
  console.log(`${p.name}: ${ratio.toFixed(2)}:1 [${pass ? 'PASS' : 'FAIL'}]`);
});

if (allPass) {
  console.log('All normal text pairs meet WCAG AA (>= 4.5:1)');
}
