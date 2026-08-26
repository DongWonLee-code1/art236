const REQUIRED = ['name', 'contact', 'status', 'count', 'size', 'where', 'next', 'price'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  if (body.company) {
    return res.status(200).json({ ok: true });
  }

  const missing = REQUIRED.filter((k) => !String(body[k] || '').trim());
  if (missing.length) {
    return res.status(400).json({ error: 'missing fields', fields: missing });
  }

  const clip = (v, n) => String(v ?? '').slice(0, n);

  const record = {
    submitted_at: new Date().toISOString(),
    name: clip(body.name, 60),
    contact: clip(body.contact, 120),
    status: clip(body.status, 60),
    count: clip(body.count, 10),
    size: clip(body.size, 60),
    where: clip(body.where, 200),
    next: clip(body.next, 120),
    price: clip(body.price, 40),
    note: clip(body.note, 1000),
    source: clip(body.source, 60),
    referrer: clip(body.referrer, 200),
  };

  const results = [];

  if (process.env.SHEET_WEBHOOK_URL) {
    try {
      // 최대 8초까지만 기다리고, 넘으면 그냥 넘어갑니다
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 8000);
      const r = await fetch(process.env.SHEET_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...record, secret: process.env.SHEET_SECRET || '' }),
        signal: ac.signal,
      });
      clearTimeout(t);
      results.push({ sheet: r.ok });
    } catch (e) {
      console.error('sheet error', e);
      results.push({ sheet: false });
    }
  }

  if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL) {
    try {
      const lines = Object.entries(record).map(([k, v]) => k + ': ' + v).join('\n');
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'onboarding@resend.dev',
          to: process.env.NOTIFY_EMAIL,
          subject: '[사전등록] ' + record.name + ' · ' + record.count + '점 · ' + record.price,
          text: lines,
        }),
      });
      results.push({ email: r.ok });
    } catch (e) {
      console.error('email error', e);
      results.push({ email: false });
    }
  }

  if (results.length === 0) {
    console.log('[사전등록 · 저장소 미설정]', record);
  }

  return res.status(200).json({ ok: true });
}
