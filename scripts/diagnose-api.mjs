const key = process.env.DEEPSEEK_API_KEY;
if (!key) throw new Error('Missing DEEPSEEK_API_KEY');
const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
for (const path of ['models', 'user/balance']) {
  const started = Date.now();
  try {
    const response = await fetch(`https://api.deepseek.com/${path}`, { headers, signal: AbortSignal.timeout(10_000) });
    const data = await response.json();
    console.log(JSON.stringify({ path, status: response.status, ms: Date.now() - started,
      result: path === 'models' ? data.data?.map(model => model.id) : { is_available: data.is_available } }));
  } catch (e) { console.log(path, e.message); }
}
await Promise.all(['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-pro'].map(async model => {
  const started = Date.now();
  try {
    const response = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST', headers, signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply only OK.' }],
        thinking: { type: 'disabled' }, max_tokens: 16, stream: true }),
    });
    console.log(JSON.stringify({ model, phase: 'headers', status: response.status, ms: Date.now() - started,
      contentType: response.headers.get('content-type') }));
    let bytes = 0;
    let chunks = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (chunks++ < 5) console.log(JSON.stringify({ model, phase: 'body', ms: Date.now() - started, text: new TextDecoder().decode(chunk).slice(0,1200) }));
    }
    console.log(JSON.stringify({ model, phase: 'done', ms: Date.now() - started, bytes }));
  } catch (e) { console.log(JSON.stringify({ model, error: e.message, ms: Date.now() - started })); }
}));
