// Website chat endpoint. It stays behind your normal login (proxy.ts).
import { NextResponse } from 'next/server';
import { askGemini } from '@/lib/gemini';
import { audit } from '@/lib/audit';

export const maxDuration = 30;

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const text = String(body.message || '').trim().slice(0, 500);
  if (!text) return NextResponse.json({ error: 'Empty message' }, { status: 400 });

  try {
    const reply = await askGemini(text, body.history);
    await audit('web-chat', 'chat_question', 'chatbot', text);
    const isRop = /rop|reorder|below|stockout|out of stock|نقطة|طلب|ناقص|خطر|نقص/i.test(text);
    return NextResponse.json({
      reply,
      image: isRop ? `/api/reports/rop-image?t=${Date.now()}` : null
    });
  } catch (err) {
    console.error(err);
    const quota = String(err.message).includes('Gemini 429');
    return NextResponse.json(
      {
        reply: quota
          ? 'The free Gemini quota is used up for now. Try again in a minute.'
          : 'The assistant is unavailable right now. Check the server log for details.'
      },
      { status: 502 }
    );
  }
}
