/**
 * Ask the Resources — the answer endpoint behind the search panel.
 *
 * WHAT THIS IS. A router, not an oracle. The site holds resource *metadata*
 * (title, section, module, a summary sentence, sometimes a body or a quote),
 * not the resources themselves: the PDFs and Docs live in Drive and nothing
 * here ever sees their text. So this answers "which of our resources speaks to
 * that, and why" and refuses to answer "how do I do the practice". The prompt
 * below enforces that, and the two-sentence cap keeps the shape honest.
 *
 * WHY NO RETRIEVAL LAYER. The entire published library is ~21k tokens, which
 * fits in a single prompt with room to spare. Embeddings, chunking and a vector
 * store would all be machinery for a problem this corpus does not have. The
 * corpus arrives as a generated ES module (corpus-data.mjs, written by
 * build.js) so it is bundled with the function and can never drift from the
 * page it shipped with.
 *
 * WHY A FUNCTION AT ALL. The site is static. An API key cannot live in the
 * page, so this is the one piece of the site with a server in it — and the one
 * piece that can be down. Everything on the client degrades to plain search
 * when it is.
 *
 * THE HALLUCINATION GUARD. The model returns an id; this file checks that id
 * against the real set before the answer is allowed out (`KNOWN` below). A
 * misattributed citation is the failure that would actually cost Marshall
 * credibility, and it is the one failure that is cheap to make structurally
 * impossible rather than merely unlikely.
 */
import Anthropic from '@anthropic-ai/sdk';
import corpus from './corpus-data.mjs';

export const config = { path: '/api/ask' };

const MODEL = 'claude-opus-5-5';

// Every id the model is allowed to cite, plus the explicit "nothing fits"
// escape hatch. Built once per cold start from the same corpus the prompt sees,
// so the two can never disagree.
const KNOWN = new Set(corpus.resources.map(r => r.id));
const BY_ID = new Map(corpus.resources.map(r => [r.id, r]));

// Guardrails on the question itself. Long inputs are the cheap way to turn a
// public endpoint into someone else's compute budget.
const MIN_Q = 3;
const MAX_Q = 300;

/**
 * Per-IP rate limit. This is per function instance and resets when the
 * instance recycles, so it is a speed bump, not a wall — a determined caller
 * spread across cold starts gets through. The real backstop is the spend limit
 * on the Anthropic key (see docs/ask-the-resources.md); this just stops a stuck
 * client or a casual script from running up a bill by accident.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) { hits.set(ip, recent); return true; }
  recent.push(now);
  hits.set(ip, recent);
  // Keep the map from growing without bound across a long-lived instance.
  if (hits.size > 500) for (const [k, v] of hits) if (!v.some(t => now - t < WINDOW_MS)) hits.delete(k);
  return false;
}

const INSTRUCTIONS = [
  'You help educators find the right resource in Marshall Street\'s Research to Impact library.',
  '',
  'WHAT YOU HAVE. A catalogue of the library: each resource\'s title, the section and module it sits in, and short descriptive text. You do NOT have the resources themselves — the actual guides, templates and protocols are files you cannot see.',
  '',
  'WHAT TO DO. Pick the single resource that best answers the question. Write two sentences, three at the very most: the first says what the resource covers that bears on the question, drawing only on the catalogue text; the second says what the reader will find in it. Then return that resource\'s id.',
  '',
  'HARD RULES.',
  '- Use only what the catalogue text says. If it does not say something, you do not know it.',
  '- Never invent a school name, a number, a percentage, an outcome or an author. Never invent a resource or an id.',
  '- Never describe steps, agendas or protocols as if you had read the document. You are pointing someone to it, not summarising its contents.',
  '- If no resource genuinely bears on the question, set resource_id to "none" and say in one sentence that the library does not cover it yet. Do not stretch to a loose match.',
  '- If the question is not about teaching, schools, instruction or school leadership, set resource_id to "none".',
  '',
  'VOICE. Practitioner-first and concrete. Address the reader as "you". No marketing language: do not use the words innovation, ecosystem, transformation, human-centered or pipeline. Do not open with "Great question" or any other preamble. No emoji, no headings, no bullet points — just the sentences.',
].join('\n');

function bad(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export default async (req) => {
  if (req.method !== 'POST') return bad(405, { error: 'method_not_allowed' });

  if (!process.env.ANTHROPIC_API_KEY) {
    // Deliberately explicit: this is the one failure Greg can fix himself, and
    // a generic 500 would send him hunting through logs for it.
    return bad(503, { error: 'not_configured', message: 'ANTHROPIC_API_KEY is not set on this site.' });
  }

  let q;
  try {
    const body = await req.json();
    q = String(body && body.q != null ? body.q : '').trim();
  } catch {
    return bad(400, { error: 'bad_json' });
  }

  if (q.length < MIN_Q) return bad(400, { error: 'too_short' });
  if (q.length > MAX_Q) return bad(400, { error: 'too_long', message: `Questions are limited to ${MAX_Q} characters.` });

  const ip = req.headers.get('x-nf-client-connection-ip') || req.headers.get('x-forwarded-for') || 'unknown';
  if (rateLimited(ip)) return bad(429, { error: 'rate_limited', message: 'A few too many questions at once. Give it a minute.' });

  const client = new Anthropic();

  let res;
  try {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      // Thinking is always on for this model and cannot be disabled; `low` is
      // the right depth for picking one row out of a list and is what keeps
      // this inside a Netlify function's execution window.
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              answer: { type: 'string', description: 'Two to three sentences, grounded only in the catalogue text.' },
              resource_id: { type: 'string', description: 'The id of the single best resource, or the string "none".' },
            },
            required: ['answer', 'resource_id'],
            additionalProperties: false,
          },
        },
      },
      // On a policy decline the API re-runs the request on a fallback model
      // inside the same call, rather than returning nothing.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: INSTRUCTIONS },
        {
          type: 'text',
          text: 'CATALOGUE (JSON)\n' + JSON.stringify(corpus),
          // The corpus is identical on every request, so it is cached and read
          // back at a fraction of the input price. A 1h TTL rather than the
          // 5-minute default because this site's traffic is bursty: at the
          // default most questions would arrive after the entry had expired and
          // pay full price for all ~21k tokens, which is the difference between
          // roughly a cent and roughly a dime per question.
          cache_control: { type: 'ephemeral', ttl: '1h' },
        },
      ],
      messages: [{ role: 'user', content: q }],
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return bad(429, { error: 'upstream_rate_limited' });
    if (err instanceof Anthropic.AuthenticationError) return bad(503, { error: 'not_configured', message: 'The API key was rejected.' });
    console.error('ask: upstream failure', err && err.message);
    return bad(502, { error: 'upstream_failed' });
  }

  // Not an error: the panel shows a plain "I can't answer that one" and the
  // search results below it carry on doing their job.
  if (res.stop_reason === 'refusal') return new Response(JSON.stringify({ answer: null, reason: 'refused' }), okHeaders());
  if (res.stop_reason === 'max_tokens') {
    console.error('ask: hit max_tokens — answer truncated, dropping it');
    return bad(502, { error: 'truncated' });
  }

  // `parsed_output` is populated by the SDK's parse() helper; a plain create()
  // with a raw json_schema returns the JSON as text instead. Read whichever is
  // there rather than assuming, and skip thinking blocks on the way past.
  let parsed = res.parsed_output;
  if (!parsed) {
    const text = res.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    try { parsed = JSON.parse(text); } catch { parsed = null; }
  }
  if (!parsed || typeof parsed.answer !== 'string' || typeof parsed.resource_id !== 'string') {
    console.error('ask: no parsable structured output');
    return bad(502, { error: 'unparsable' });
  }

  const id = parsed.resource_id.trim();
  const answer = parsed.answer.trim();

  if (id === 'none') return new Response(JSON.stringify({ answer, source: null }), okHeaders());

  // The guard. An id the library does not contain means the model invented a
  // citation, which is exactly the answer that must not reach a reader — so the
  // whole response is dropped rather than shown without its source.
  if (!KNOWN.has(id)) {
    console.error(`ask: model cited unknown id "${id}" — dropping the answer`);
    return bad(502, { error: 'bad_citation' });
  }

  const r = BY_ID.get(id);
  return new Response(JSON.stringify({
    answer,
    source: { id: r.id, title: r.title, section: r.section, module: r.module },
    usage: {
      input: res.usage.input_tokens,
      cache_read: res.usage.cache_read_input_tokens,
      cache_write: res.usage.cache_creation_input_tokens,
      output: res.usage.output_tokens,
    },
  }), okHeaders());
};

function okHeaders() {
  return { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } };
}
