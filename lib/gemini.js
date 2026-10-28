// // Talks to the Gemini REST API and runs the tool-calling loop.
// Used by the website chat (/api/chat) and by WhatsApp (/api/whatsapp).
import { TOOL_DECLARATIONS, runTool } from '@/lib/chatTools';

const SYSTEM = `You are the assistant of the Smart Medicine Inventory app for a hospital pharmacy.
Answer ONLY from tool results. Never invent numbers, names or dates. If a tool returns nothing, say so.
Use plain text only: no markdown, no tables, no asterisks, because the text is sent through WhatsApp.
Start with one short title line that includes the total count, for example: Items below ROP (12 total)
Then list at most 5 items, most urgent first, separated by a blank line, each item in exactly this format:
1) Name (Code)
On hand: X | ROP: Y | Coverage: Z days
Stockout: Date | Model: Model (Accuracy: A%)
If more items exist than were shown, end with one line saying how many more there are.
Keep the whole reply under 1400 characters.
Reply in the same language as the question (Arabic or English).
If the question is not about pharmacy stock, say you can only help with stock, reorder points and stockouts.`;

async function callGemini(contents, timeoutMs) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEy;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is missing in the environment');
  }
  const primaryModel = process.env.GEMINI_MODEL || 'gemini-flash-lite-latest';
  const modelsToTry = [primaryModel];
  if (primaryModel !== 'gemini-flash-lite-latest') {
    modelsToTry.push('gemini-flash-lite-latest');
  }

  // One shared deadline for all models, so the fallback cannot exceed the time budget
  const endTime = Date.now() + timeoutMs;
  let lastErr = null;
  for (const model of modelsToTry) {
    const remaining = endTime - Date.now();
    if (remaining < 1000) break;
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents,
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }]
        }),
        signal: AbortSignal.timeout(remaining)
      });
      if (res.ok) {
        return await res.json();
      }
      const errText = await res.text();
      lastErr = new Error(`Gemini ${res.status}: ${errText}`);
      // Retry with the fallback model on overload (503), missing model (404) or rate limit (429)
      if (res.status === 503 || res.status === 404 || res.status === 429) {
        console.warn(`Model ${model} returned ${res.status}, trying fallback...`);
        continue;
      }
      throw lastErr;
    } catch (e) {
      lastErr = e;
      if (model === modelsToTry[modelsToTry.length - 1]) throw e;
    }
  }
  throw lastErr || new Error('Gemini call failed');
}

// Turn earlier chat turns [{ from: 'me' | 'bot', text }] into Gemini contents.
// Roles must alternate user/model and the list must end with a model turn.
function historyToContents(history) {
  const out = [];
  let expected = 'user';
  for (const h of Array.isArray(history) ? history.slice(-8) : []) {
    const role = h && h.from === 'me' ? 'user' : 'model';
    const text = String((h && h.text) || '').slice(0, 1500);
    if (role !== expected || !text) continue;
    out.push({ role, parts: [{ text }] });
    expected = expected === 'user' ? 'model' : 'user';
  }
  if (expected === 'model') out.pop();
  return out;
}

export async function askGemini(userText, history = []) {
  const contents = [...historyToContents(history), { role: 'user', parts: [{ text: userText }] }];

  // Twilio waits 15 seconds for the webhook, so stop after 13 seconds in total
  const deadline = Date.now() + 13000;

  for (let step = 0; step < 4; step++) {
    const left = deadline - Date.now();
    if (left < 2000) return 'Sorry, that took too long. Please try a simpler question.';

    const data = await callGemini(contents, Math.min(8000, left));
    const content = data.candidates?.[0]?.content;
    if (!content) return 'Sorry, I could not answer that.';

    const parts = content.parts || [];
    const calls = parts.filter((p) => p.functionCall);

    // No tool requested: this is the final answer
    if (calls.length === 0) {
      const text = parts
        .filter((p) => p.text && !p.thought)
        .map((p) => p.text)
        .join('')
        .trim();
      return text || 'Sorry, I could not answer that.';
    }

    // Keep the model turn exactly as returned (Gemini 3 needs its thought signatures back)
    contents.push(content);
    const responses = [];
    for (const p of calls) {
      const { name, args, id } = p.functionCall;
      let result;
      try {
        result = await runTool(name, args);
      } catch (err) {
        console.error('Tool failed:', name, err);
        result = { error: 'Tool failed' };
      }
      responses.push({ functionResponse: { name, ...(id ? { id } : {}), response: { result } } });
    }
    contents.push({ role: 'user', parts: responses });
  }
  return 'Sorry, that took too many steps. Please ask a simpler question.';
}
