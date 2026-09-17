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
    /* 첫 접수는 이름·이메일·작품 가격·프로필만 받습니다. 사진과 자세한 소개는 메일로 따로 받습니다.
       예전 화면이 캐시에 남아 긴 폼으로 보내와도 받아 둘 수 있게 예전 항목과 첨부도 계속 허용합니다. */
    files: true,
    required: ['name', 'contact', 'price'],
    /* 첫 화면에서 이메일만 남기는 신청(quick)은 이메일만 필수입니다 */
    quickRequired: ['contact'],
    fields: {
      quick: 10,
      name: 60, contact: 120, price: 120, profile: 300, about: 1500,
      phone: 30, instagram: 80, region: 60, activity: 40,
      workCount: 4, worksList: 8000, cv: 3000, link: 300, agreeOriginal: 10,
    },
    subject: (r) => (r.quick === 'true'
      ? `[작가신청·이메일만] ${r.contact}`
      : `[작가등록] ${r.name}${r.price ? ' · ' + r.price : ''}`),
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

const cut = (v, n) => String(v ?? '').slice(0, n);
const B64 = /^[A-Za-z0-9+/]+=*$/;

/* 작품별 정보 — 시트의 '작품' 탭용 */
function takeWorks(list){
  if (!Array.isArray(list)) return [];
  return list.slice(0, 5).map((w) => ({
    title: cut(w?.title, 120), year: cut(w?.year, 20), medium: cut(w?.medium, 120),
    size: cut(w?.size, 80), edition: cut(w?.edition, 20), framed: cut(w?.framed, 20),
    price: cut(w?.price, 60), elsewhere: cut(w?.elsewhere, 30), desc: cut(w?.desc, 1500),
    photos: Array.isArray(w?.photos) ? w.photos.slice(0, 3).map((x) => cut(x, 40)) : [],
    thumb: typeof w?.thumb === 'string' && w.thumb.length <= 80000 && B64.test(w.thumb) ? w.thumb : '',
  }));
}

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

function takeFiles(list){
  if (!Array.isArray(list)) return [];
  const out = [];
  let total = 0;
  for (const f of list.slice(0, MAX_FILES)) {
    const filename = String(f?.name || '').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 60);
    const type = String(f?.type || '');
    const content = String(f?.data || '');
    if (!filename || !content || !FILE_TYPES.has(type) || !B64.test(content)) continue;
    const bytes = Math.floor(content.length * 3 / 4);
    if (bytes > MAX_FILE_BYTES || total + bytes > MAX_TOTAL_BYTES) continue;
    total += bytes;
    out.push({ filename, content, type });
  }
  return out;
}

/* 작가 등록 메일은 읽기 좋게 묶어서 보냅니다 */
function artistText(r, files){
  const line = (k, v) => (v ? k + ': ' + v : null);
  return [
    '■ 작가 정보',
    line('이름', r.name), line('이메일', r.contact), line('작품 가격', r.price),
    line('프로필 링크', r.profile || r.link), line('전화', r.phone),
    line('SNS', r.instagram), line('지역', r.region), line('지금 활동', r.activity),
    '',
    r.about ? '■ 소개\n' + r.about + '\n' : null,
    r.worksList ? '■ 작품 ' + (r.workCount || '') + '점\n' + r.worksList + '\n' : null,
    r.cv ? '■ 이력\n' + r.cv + '\n' : null,
    files.length ? '■ 첨부 ' + files.length + '개\n' + files.map((f) => f.filename).join(', ') + '\n' : null,
    r.quick === 'true' ? '첫 화면에서 이메일만 남긴 신청입니다.' : null,
    '자료 요청 메일은 접수함 시트의 \'요청 보내기\'를 체크하면 나갑니다.',
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

  const required = body.quick === true && spec.quickRequired ? spec.quickRequired : spec.required;
  const missing = required.filter((k) => !String(body[k] || '').trim());
  if (missing.length) {
    return res.status(400).json({ error: 'missing fields', fields: missing });
  }

  if (type === 'purchase' && !(body.agreeWithdraw === true && body.agreeRoyalty === true)) {
    return res.status(400).json({ error: 'consent required' });
  }

  if (type === 'exhibition' && body.agreeTerms !== true) {
    return res.status(400).json({ error: 'terms not agreed' });
  }

  if (type === 'artist' && !isEmail(body.contact)) {
    return res.status(400).json({ error: 'invalid email' });
  }

  const files = spec.files ? takeFiles(body.files) : [];
  const works = type === 'artist' ? takeWorks(body.works) : [];


  const clip = (v, n) => String(v ?? '').slice(0, n);
  const record = { type, submitted_at: new Date().toISOString() };
  for (const [k, n] of Object.entries({ ...spec.fields, ...COMMON })) {
    if (body[k] === undefined || body[k] === '') continue;
    record[k] = typeof body[k] === 'boolean' ? String(body[k]) : clip(body[k], n);
  }
  if (files.length) record.attachments = files.map((f) => f.filename).join(', ');

  /* 시트와 메일은 동시에 보냅니다 — 시트 쪽은 사진을 드라이브에 저장하느라 몇 초 걸립니다 */
  const jobs = [];

  if (process.env.SHEET_WEBHOOK_URL) {
    jobs.push((async () => {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 25000);
      try {
        const payload = { ...record, secret: process.env.SHEET_SECRET || '' };
        if (type === 'artist') {
          payload.works = works;
          payload.files = files.map((f) => ({ name: f.filename, type: f.type, data: f.content }));
        }
        const r = await fetch(process.env.SHEET_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ac.signal,
        });
        /* Apps Script 는 오류도 200 으로 돌려주므로 본문의 ok 를 함께 봅니다 */
        const j = await r.json().catch(() => null);
        if (j && j.ok === false) console.error('sheet rejected', j.error);
        return { sheet: r.ok && !(j && j.ok === false) };
      } catch (e) {
        console.error('sheet error', e);
        return { sheet: false };
      } finally {
        clearTimeout(t);
      }
    })());
  }

  if (process.env.RESEND_API_KEY) {
    jobs.push((async () => {
      try {
        const text = type === 'artist'
          ? artistText(record, files)
          : Object.entries(record).map(([k, v]) => k + ': ' + v).join('\n');
        const mail = {
          subject: spec.subject(record),
          text,
          ...(files.length ? { attachments: files.map(({ filename, content }) => ({ filename, content })) } : {}),
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
        return { email: ok };
      } catch (e) {
        console.error('email error', e);
        return { email: false };
      }
    })());
  }

  const results = await Promise.all(jobs);

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
