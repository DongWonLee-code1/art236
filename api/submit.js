/**
 * art239 폼 수신 엔드포인트
 *
 * type 으로 세 갈래를 구분합니다.
 *   purchase        작품 상세 모달의 구매 신청
 *   storage_notify  수장고 개설 알림 신청
 *   (작가 등록은 Tally 가 직접 처리하므로 여기를 거치지 않습니다)
 */

const SPECS = {
  purchase: {
    required: ['name', 'contact', 'region'],
    fields: {
      workId: 60, workTitle: 120, artist: 60, price: 20,
      name: 60, contact: 120, region: 120, place: 200,
      message: 1000, framed: 20, custody: 40,
      /* 청약철회·재판매 2% 동의 여부는 분쟁 대비 증거이므로 반드시 기록합니다 */
      agreeWithdraw: 10, agreeRoyalty: 10,
    },
    subject: (r) => `[구매신청] 「${r.workTitle || '작품'}」 · ${r.artist || ''} · ${r.name}`,
  },
  storage_notify: {
    required: ['contact'],
    fields: { contact: 120 },
    subject: (r) => `[수장고 알림] ${r.contact}`,
  },
};

const COMMON = { source: 60, referrer: 200 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'method not allowed' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

  // 허니팟 — 봇이 채우면 조용히 성공 응답
  if (body.company) return res.status(200).json({ ok: true });

  const type = String(body.type || '').trim();
  const spec = SPECS[type];
  if (!spec) return res.status(400).json({ error: 'unknown type' });

  const missing = spec.required.filter((k) => !String(body[k] || '').trim());
  if (missing.length) {
    return res.status(400).json({ error: 'missing fields', fields: missing });
  }

  if (type === 'purchase' && !(body.agreeWithdraw === true && body.agreeRoyalty === true)) {
    return res.status(400).json({ error: 'consent required' });
  }

  const clip = (v, n) => String(v ?? '').slice(0, n);
  const record = { type, submitted_at: new Date().toISOString() };
  for (const [k, n] of Object.entries({ ...spec.fields, ...COMMON })) {
    if (body[k] === undefined || body[k] === '') continue;
    record[k] = typeof body[k] === 'boolean' ? String(body[k]) : clip(body[k], n);
  }

  const results = [];

  if (process.env.SHEET_WEBHOOK_URL) {
    try {
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
          subject: spec.subject(record),
          text: lines,
        }),
      });
      results.push({ email: r.ok });
    } catch (e) {
      console.error('email error', e);
      results.push({ email: false });
    }
  }

  if (results.length === 0) console.log('[' + type + ' · 저장소 미설정]', record);

  return res.status(200).json({ ok: true });
}
