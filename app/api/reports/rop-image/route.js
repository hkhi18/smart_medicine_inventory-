// GET /api/reports/rop-image - Returns a dynamic PNG image of the ROP data analysis for WhatsApp
import { generateRopAnalysisPng } from '@/lib/rop-chart';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const pngBuffer = await generateRopAnalysisPng();
    return new Response(pngBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Length': String(pngBuffer.length)
      }
    });
  } catch (err) {
    console.error('Failed to generate ROP image:', err);
    return new Response('Error generating analysis image', { status: 500 });
  }
}
