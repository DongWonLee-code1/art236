/**
 * Gallery 751 폼 수신 엔드포인트
 *
 * type 으로 갈래를 구분합니다.
 *   purchase        작품 상세 모달의 구매 신청
 *   storage_notify  수장고 개설 알림 신청
 *   artist          작가 작품 등록 신청
 *   community       커뮤니티 참여 신청
 *   exhibition      오프라인 전시 참가 의향
 *
 * 알림 메일
 *   작가 쪽 제출(artist · exhibition · community) → submissions@gallery751.com
 *   구매·알림 신청(purchase · storage_notify)      → inquiries@gallery751.com
 *   보내는 주소는 noreply@gallery751.com 입니다. Resend 에 gallery751.com 도메인이 인증돼 있어야 나갑니다.
 *   도메인 발송이 실패하면 예전 경로(onboarding@resend.dev → NOTIFY_EMAIL)로 한 번 더 보내 접수가 사라지지 않게 합니다.
 */

const MAIL = {
  from: process.env.NOTIFY_FROM || 'Gallery 751 <noreply@gallery751.com>',
  submissions: process.env.SUBMISSIONS_EMAIL || 'submissions@gallery751.com',
  inquiries: process.env.INQUIRIES_EMAIL || 'inquiries@gallery751.com',
};

/* 첨부 파일 — 작가 등록만 받습니다. 사진은 브라우저에서 줄인 JPEG 로 옵니다. */
const MAX_FILES = 20;
const MAX_FILE_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4.4 * 1024 * 1024;
const FILE_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-hwp', 'application/octet-stream',
]);

const SPECS = {
  purchase: {
    to: 'inquiries',
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
    to: 'inquiries',
    required: ['contact'],
    fields: { contact: 120 },
    subject: (r) => `[수장고 알림] ${r.contact}`,
  },
  artist: {
    to: 'submissions',
    files: true,
    required: ['name', 'contact', 'worksList', 'about'],
    fields: {
      name: 60, contact: 120, phone: 30, instagram: 80, region: 60, activity: 40,
      /* 작품별 정보(작품명·연도·재료·크기·원화 여부·액자·희망 가격·타처 판매·설명)는 한 덩어리 글로 옵니다 */
      workCount: 4, worksList: 8000,
      cv: 3000, about: 1500, link: 300,
      /* 본인 작품 확인 — 분쟁 대비 증거이므로 반드시 기록합니다 */
      agreeOriginal: 10,
    },
    subject: (r) =>
      `[작가등록] ${r.name}${r.workCount ? ' · 작품 ' + r.workCount + '점' : ''}${r.region ? ' · ' + r.region : ''}`,
  },

  community: {
    to: 'submissions',
    required: ['contact', 'role'],
    fields: { contact: 120, role: 20 },
    subject: (r) => `[커뮤니티] ${r.role} · ${r.contact}`,
  },

  exhibition: {
    to: 'submissions',
    required: ['name', 'contact'],
    fields: {
      name: 60, contact: 120, instagram: 80, region: 60,
      experience: 40, works: 30, size: 60, price: 60, when: 60,
      /* 선호 지역은 복수 선택을 쉼표로 이어 보냅니다 */
      prefRegion: 200, worksList: 2000,
      link: 300, about: 1500,
      /* 참가비·일정 미확정 안내 확인 — 분쟁 대비 증거이므로 반드시 기록합니다 */
      agreeTerms: 10,
    },
    subject: (r) =>
      `[전시참가] ${r.name}${r.experience ? ' · ' + r.experience : ''}${r.prefRegion ? ' · 희망 ' + r.prefRegion : ''}`,
  },
};

const COMMON = { source: 60, referrer: 200 };

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

function takeFiles(list){
  if (!Array.isArray(list)) return [];
  const out = [];
  let total = 0;
  for (const f of list.slice(0, MAX_FILES)) {
    const filename = String(f?.name || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
    const type = String(f?.type || '');
    const content = String(f?.data || '');
    if (!filename || !content || !FILE_TYPES.has(type) || !/^[A-Za-z0-9+/]+=*$/.test(content)) continue;
    const bytes = Math.floor(content.length * 3 / 4);
    if (bytes > MAX_FILE_BYTES || total + bytes > MAX_TOTAL_BYTES) continue;
    total += bytes;
    out.push({ filename, content });
  }
  return out;
}

/* 작가 등록 메일은 읽기 좋게 묶어서 보냅니다 */
function artistText(r, files){
  const line = (k, v) => (v ? k + ': ' + v : null);
  return [
    '■ 작가 정보',
    line('이름', r.name), line('이메일', r.contact), line('전화', r.phone),
    line('SNS', r.instagram), line('지역', r.region), line('지금 활동', r.activity),
    line('원본·작업 링크', r.link),
    '',
    '■ 작품 ' + (r.workCount || '') + '점',
    r.worksList,
    '',
    '■ 이력',
    r.cv || '(첨부 파일 참고)',
    '',
    '■ 작가 소개',
    r.about,
    '',
    '■ 첨부 ' + files.length + '개',
    files.map((f) => f.filename).join(', ') || '없음',
    '',
    line('본인 작품 확인', r.agreeOriginal),
    line('유입', r.source),
    line('이전 페이지', r.referrer),
    line('접수 시각', r.submitted_at),
  ].filter((x) => x !== null).join('\n');
}

async function sendResend(payload){
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), 20000);
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + process.env.RESEND_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    if (!r.ok) console.error('resend', r.status, payload.from, '→', payload.to, await r.text().catch(() => ''));
    return r.ok;
  } finally {
    clearTimeout(t);
  }
}

export default async function handler(req, res) {
  /* 설정 점검용 — 브라우저에서 /api/submit 을 열면 어떤 경로가 살아 있는지 보여줍니다.
     값 자체는 절대 내보내지 않고 설정 여부만 알려줍니다. */
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      channels: {
        sheet: Boolean(process.env.SHEET_WEBHOOK_URL),
        email: Boolean(process.env.RESEND_API_KEY),
        emailFallback: Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL),
      },
      mailTo: { submissions: MAIL.submissions, inquiries: MAIL.inquiries },
    });
  }

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

  if (type === 'exhibition' && body.agreeTerms !== true) {
    return res.status(400).json({ error: 'terms not agreed' });
  }

  if (type === 'artist' && body.agreeOriginal !== true) {
    return res.status(400).json({ error: 'consent required' });
  }

  if (type === 'artist' && !isEmail(body.contact)) {
    return res.status(400).json({ error: 'invalid email' });
  }

  const files = spec.files ? takeFiles(body.files) : [];

  if (type === 'artist') {
    if (!files.some((f) => f.filename.startsWith('work'))) {
      return res.status(400).json({ error: 'photos required' });
    }
    if (!String(body.cv || '').trim() && !files.some((f) => f.filename.startsWith('cv.'))) {
      return res.status(400).json({ error: 'cv required' });
    }
  }

  const clip = (v, n) => String(v ?? '').slice(0, n);
  const record = { type, submitted_at: new Date().toISOString() };
  for (const [k, n] of Object.entries({ ...spec.fields, ...COMMON })) {
    if (body[k] === undefined || body[k] === '') continue;
    record[k] = typeof body[k] === 'boolean' ? String(body[k]) : clip(body[k], n);
  }
  if (files.length) record.attachments = files.map((f) => f.filename).join(', ');

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

  if (process.env.RESEND_API_KEY) {
    try {
      const text = type === 'artist'
        ? artistText(record, files)
        : Object.entries(record).map(([k, v]) => k + ': ' + v).join('\n');
      const mail = {
        subject: spec.subject(record),
        text,
        ...(files.length ? { attachments: files } : {}),
        ...(isEmail(record.contact) ? { reply_to: String(record.contact).trim() } : {}),
      };
      let ok = await sendResend({ from: MAIL.from, to: MAIL[spec.to], ...mail });
      /* 도메인 발송이 막혀 있으면 예전 경로로라도 받습니다 */
      if (!ok && process.env.NOTIFY_EMAIL) {
        ok = await sendResend({
          from: 'onboarding@resend.dev',
          to: process.env.NOTIFY_EMAIL,
          ...mail,
          subject: '[임시 수신] ' + mail.subject,
        });
      }
      results.push({ email: ok });
    } catch (e) {
      console.error('email error', e);
      results.push({ email: false });
    }
  }

  /* 예전에는 저장할 곳이 없어도 ok 를 돌려줬습니다.
     그러면 화면에는 "받았습니다"가 뜨는데 데이터는 사라집니다.
     한 곳이라도 실제로 들어간 경우에만 성공으로 답합니다. */
  const delivered = results.some((r) => Object.values(r)[0] === true);

  if (results.length === 0) {
    console.error('[' + type + '] 전송 경로 미설정 — 데이터가 유실됩니다', record);
    return res.status(503).json({ error: 'no delivery channel configured' });
  }
  if (!delivered) {
    console.error('[' + type + '] 모든 전송 경로 실패', record);
    return res.status(502).json({ error: 'delivery failed' });
  }

  return res.status(200).json({ ok: true });
}
