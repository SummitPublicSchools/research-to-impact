/**
 * Self-test for netlify/functions/ask.mjs — no API key, no network, no cost.
 *
 * The Anthropic SDK calls global fetch, so stubbing globalThis.fetch lets this
 * drive the real handler end to end: request validation, the prompt it builds,
 * the structured-output parsing, the citation guard and the rate limit. The two
 * cases that matter most are the invented id (which must never reach a reader)
 * and the prompt shape (a silent change there throws away the cache, which is
 * the difference between roughly a cent and roughly a dime per question).
 *
 *   node tools/ask-selftest.mjs
 */
import corpus from '../netlify/functions/corpus-data.mjs';

const realFetch = globalThis.fetch;
let lastBody = null;

/** Canned Messages API response carrying `out` as the structured answer. */
function stub(out, extra = {}) {
  globalThis.fetch = async (url, init) => {
    lastBody = JSON.parse(init.body);
    const payload = {
      id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5',
      content: [{ type: 'text', text: JSON.stringify(out) }],
      stop_reason: 'end_turn', stop_details: null,
      usage: { input_tokens: 40, output_tokens: 70, cache_read_input_tokens: 11000, cache_creation_input_tokens: 0 },
      ...extra,
    };
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  };
}

function ask(q, ip, method = 'POST') {
  return new Request('https://example.test/api/ask', {
    method,
    headers: { 'content-type': 'application/json', 'x-nf-client-connection-ip': ip },
    body: method === 'POST' ? JSON.stringify({ q }) : undefined,
  });
}

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

const realId = corpus.resources[0].id;
const realTitle = corpus.resources[0].title;

// The handler reads the key at call time, so set it before importing nothing —
// import order does not matter, but the unset-key case must run first.
delete process.env.ANTHROPIC_API_KEY;
const { default: handler } = await import('../netlify/functions/ask.mjs');

console.log('\nAsk the Resources — self-test\n');
console.log(`corpus: ${corpus.resources.length} resources, ${corpus.modules.length} module intros, ${corpus.sections.length} section intros`);
console.log(`        ${JSON.stringify(corpus).length.toLocaleString()} chars in the prompt\n`);

console.log('degradation');
{
  const r = await handler(ask('How do I start co-planning?', '1.1.1.1'));
  const b = await r.json();
  check('no API key returns 503 not_configured', r.status === 503 && b.error === 'not_configured', `got ${r.status} ${b.error}`);
}

process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key';

console.log('\nrequest validation');
{
  const r = await handler(ask('x', '2.2.2.2', 'GET'));
  check('GET returns 405', r.status === 405, `got ${r.status}`);
}
{
  const r = await handler(ask('hi', '2.2.2.2'));
  check('two-character question returns 400', r.status === 400, `got ${r.status}`);
}
{
  const r = await handler(ask('a'.repeat(301), '2.2.2.2'));
  const b = await r.json();
  check('301-character question returns 400 too_long', r.status === 400 && b.error === 'too_long', `got ${r.status} ${b.error}`);
}

console.log('\nthe happy path');
stub({ answer: 'Two grounded sentences about the resource. And what you will find in it.', resource_id: realId });
{
  const r = await handler(ask('How do I start co-planning with a new co-teacher?', '3.3.3.3'));
  const b = await r.json();
  check('200 with the answer', r.status === 200 && typeof b.answer === 'string', `got ${r.status}`);
  check('source resolves to a real resource', b.source && b.source.id === realId && b.source.title === realTitle,
    JSON.stringify(b.source));
  check('usage is reported back', b.usage && b.usage.cache_read === 11000, JSON.stringify(b.usage));
}

console.log('\nthe prompt (a silent change here costs ~20x per question)');
{
  check('model is claude-opus-5-5', lastBody.model === 'claude-opus-5-5', lastBody.model);
  check('system is two blocks: instructions then catalogue',
    Array.isArray(lastBody.system) && lastBody.system.length === 2 && lastBody.system[1].text.startsWith('CATALOGUE'),
    JSON.stringify(lastBody.system && lastBody.system.map(b => b.text.slice(0, 20))));
  check('the catalogue block is cached with a 1h TTL',
    lastBody.system[1].cache_control && lastBody.system[1].cache_control.ttl === '1h',
    JSON.stringify(lastBody.system[1].cache_control));
  check('the question is in messages, after the cached prefix',
    lastBody.messages.length === 1 && lastBody.messages[0].content.includes('co-teacher'),
    JSON.stringify(lastBody.messages));
  check('the corpus is not duplicated into the volatile part',
    !JSON.stringify(lastBody.messages).includes(realTitle.slice(0, 20)));
  check('structured output is requested', lastBody.output_config.format.type === 'json_schema');
  check('effort is low (latency: this runs inside a function timeout)', lastBody.output_config.effort === 'low', lastBody.output_config.effort);
  check('a thinking budget is not sent (400 on this model)', lastBody.thinking === undefined || lastBody.thinking.type === 'adaptive');
  check('refusal fallback is on', lastBody.fallbacks === 'default');
}

console.log('\nthe citation guard');
stub({ answer: 'A confident, fluent, entirely invented answer.', resource_id: 'co-planning-guide-that-does-not-exist' });
{
  const r = await handler(ask('How do I run a first co-planning meeting?', '4.4.4.4'));
  const b = await r.json();
  check('an invented id is refused, not shown', r.status === 502 && b.error === 'bad_citation', `got ${r.status} ${b.error}`);
  check('no answer text leaks with it', b.answer === undefined, JSON.stringify(b));
}
stub({ answer: 'The library does not cover that yet.', resource_id: 'none' });
{
  const r = await handler(ask('What is the weather in Oakland today?', '5.5.5.5'));
  const b = await r.json();
  check('"none" is allowed through with a null source', r.status === 200 && b.source === null, `got ${r.status} ${JSON.stringify(b.source)}`);
}

console.log('\nupstream failure modes');
stub({ answer: 'x', resource_id: realId }, { stop_reason: 'max_tokens' });
{
  const r = await handler(ask('A question that runs long.', '6.6.6.6'));
  const b = await r.json();
  check('a truncated answer is dropped', r.status === 502 && b.error === 'truncated', `got ${r.status} ${b.error}`);
}
stub({ answer: 'x', resource_id: realId }, { stop_reason: 'refusal', stop_details: { type: 'refusal', category: 'general_harms' } });
{
  const r = await handler(ask('A question that gets declined.', '7.7.7.7'));
  const b = await r.json();
  check('a refusal returns a null answer, not an error page', r.status === 200 && b.answer === null && b.reason === 'refused', `got ${r.status} ${JSON.stringify(b)}`);
}
{
  globalThis.fetch = async () => new Response('{"type":"error","error":{"type":"overloaded_error","message":"overloaded"}}', { status: 529, headers: { 'content-type': 'application/json' } });
  const r = await handler(ask('A question while the API is down.', '8.8.8.8'));
  check('an upstream 529 becomes a clean 502', r.status === 502, `got ${r.status}`);
}

console.log('\nrate limit');
stub({ answer: 'ok', resource_id: realId });
{
  let last = 0;
  for (let i = 0; i < 10; i++) last = (await handler(ask(`question number ${i}`, '9.9.9.9'))).status;
  check('the ninth question in a minute is rate limited', last === 429, `got ${last}`);
  const other = await handler(ask('a question from somewhere else', '10.10.10.10'));
  check('a different visitor is unaffected', other.status === 200, `got ${other.status}`);
}

globalThis.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
