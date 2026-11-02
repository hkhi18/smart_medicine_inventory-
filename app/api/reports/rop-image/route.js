import { generateRopAnalysisPng } from '@/lib/rop-chart';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
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
