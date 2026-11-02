import fs from 'node:fs';
import path from 'node:path';
import { generateRopAnalysisPng } from '@/lib/rop-chart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Temporary debug output for /api/reports/rop-image?debug=1 (remove after the font problem is fixed)
function fontDebugInfo() {
  const dir = path.join(process.cwd(), 'assets', 'fonts');
  try {
    return fs.readdirSync(dir).map((name) => {
      const buf = fs.readFileSync(path.join(dir, name));
      return { name, bytes: buf.length, firstBytes: buf.subarray(0, 4).toString('hex') };
    });
  } catch (err) {
    return { error: String(err) };
  }
}

function resvgVersion() {
  try {
    const file = path.join(process.cwd(), 'node_modules', '@resvg', 'resvg-js', 'package.json');
    return JSON.parse(fs.readFileSync(file, 'utf8')).version;
  } catch (err) {
    return String(err);
  }
}

export async function GET(request) {
  if (new URL(request.url).searchParams.get('debug') === '1') {
    return Response.json({ node: process.version, cwd: process.cwd(), resvg: resvgVersion(), fonts: fontDebugInfo() });
  }
  try {
    const png = await generateRopAnalysisPng();
    return new Response(png, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }
    });
  } catch (err) {
    console.error('ROP image failed:', err);
    return new Response('Could not generate image', { status: 500 });
  }
}