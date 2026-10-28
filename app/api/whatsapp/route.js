// Twilio WhatsApp webhook: a user texts the sandbox number and Gemini answers from the inventory data.
// Twilio sends a form POST; the reply goes back as TwiML (a small XML document).
import crypto from 'node:crypto';
import { askGemini } from '@/lib/gemini';
import { audit } from '@/lib/audit';

export const maxDuration = 30;

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Public base URL without a trailing slash
function baseUrl() {
  return String(process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
}

// Accepts a string, or a list of { text, mediaUrl } items; each item becomes one WhatsApp message
function twiml(messages) {
  const list = (Array.isArray(messages) ? messages : [messages]).map((m) =>
    typeof m === 'string' ? { text: m } : m
  );
  const body = list
    .map((m) => {
      let inner = '';
      if (m.text) inner += `<Body>${xmlEscape(m.text.slice(0, 1500))}</Body>`;
      if (m.mediaUrl) inner += `<Media>${xmlEscape(m.mediaUrl)}</Media>`;
      return inner ? `<Message>${inner}</Message>` : '';
    })
    .join('');
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml' }
  });
}

// Twilio signs: full URL + all POST params sorted by name, HMAC-SHA1 with your Auth Token
function validSignature(url, params, signature) {
  if (!signature || !process.env.TWILIO_AUTH_TOKEN) return false;
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  const expected = crypto.createHmac('sha1', process.env.TWILIO_AUTH_TOKEN).update(data).digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request) {
  const form = await request.formData();
  const params = Object.fromEntries(form.entries());

  // PUBLIC_BASE_URL + /api/whatsapp must match the webhook URL saved in the Twilio console exactly
  const url = `${baseUrl()}/api/whatsapp`;
  if (!validSignature(url, params, request.headers.get('x-twilio-signature'))) {
    console.error('WhatsApp webhook: bad Twilio signature. Check PUBLIC_BASE_URL and TWILIO_AUTH_TOKEN.');
    return new Response('Forbidden', { status: 403 });
  }

  // "whatsapp:+966591136696" -> "966591136696"
  const phone = String(params.WaId || params.From || '').replace(/\D/g, '');
  const question = String(params.Body || '').trim().slice(0, 500);
  const allowed = (process.env.WHATSAPP_ALLOWED || '').split(',').map((s) => s.trim()).filter(Boolean);

  if (!allowed.includes(phone)) {
    await audit(phone, 'whatsapp_blocked', 'chatbot', 'Number not in allow list');
    return twiml('This number is not authorized to use the pharmacy assistant.');
  }
  if (!question) return twiml('Send a question, for example: items below ROP');

  try {
    const reply = await askGemini(question);
    await audit(phone, 'whatsapp_question', 'chatbot', question);

    const messages = [{ text: reply }];

    // For stock-risk questions send the report image as a second message, so the text still arrives if the image fails
    const isRopQuestion = /rop|reorder|below|stockout|out of stock|نقطة|طلب|ناقص|خطر|نقص/i.test(question);
    if (isRopQuestion && baseUrl()) {
      messages.push({
        text: 'ROP report',
        mediaUrl: `${baseUrl()}/api/reports/rop-image?t=${Date.now()}`
      });
    }

    return twiml(messages);
  } catch (err) {
    console.error(err);
    return twiml('The assistant is unavailable right now. Please try again later.');
  }
}