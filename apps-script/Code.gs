/**
 * Gallery 751 접수함
 * 사이트 폼(api/submit.js)이 보내는 내용을 구글 시트에 종류별 탭으로 정리합니다.
 *
 * 시트 위치: dongwon@gallery751.com 계정의 「Gallery 751 접수함」 (이 코드는 그 시트에 붙어 있습니다)
 *
 * 하는 일
 *   - 접수가 들어오면 종류별 탭 맨 위에 한 줄 추가
 *   - 작가 접수 탭의 '요청 보내기'를 체크하면 submissions@ 에서 자료 요청 메일 발송
 *   - 10분마다 메일함을 보고 '보낸 메일'·'답장' 날짜와 상태를 자동으로 갱신
 *
 * 적용 방법
 *   1) 시트 → 확장 프로그램 → Apps Script 에 이 파일을 붙여넣기
 *   2) 아래 SECRET 에 Vercel 의 SHEET_SECRET 과 같은 값을 넣기 (레포에는 넣지 마세요)
 *   3) 함수 선택에서 setup 을 고르고 실행 → 권한 허용 (탭 정리·트리거 설치)
 *   4) 배포 → 배포 관리 → 연필(수정) → 새 버전 (주소 유지)
 */

const SECRET = '';
const ROOT_FOLDER = 'Gallery 751 작가 접수';
const TZ = 'Asia/Seoul';

/* 자료 요청 메일 */
const MAIL_FROM = 'submissions@gallery751.com';
const MAIL_NAME = 'Gallery 751';
const REQUEST_SUBJECT = '[Gallery 751] 작품 게시 관련 자료 요청드립니다';
function requestBody(name) {
  const who = String(name || '').replace(/\s*\(.*\)\s*$/, '').trim();
  return [
    '안녕하세요, ' + (who ? who + ' ' : '') + '작가님. Gallery 751 대표 이동원입니다.',
    '먼저 연락 주셔서 감사합니다.',
    '',
    '작품 게시를 검토하려고 하니, 아래 자료를 보내주시면 확인하고 다시 연락드리겠습니다.',
    '',
    '1. 작품 사진',
    '- 작품마다 정면 전체 사진 1장과 디테일·측면 사진 1~2장',
    '- 사진은 작가님이 직접 찍어서 보내주셔야 합니다. 실제 색에 가깝게 나오도록 찍어주시고, 원본 파일로 첨부해 주세요.',
    '- 액자가 있다면 액자를 끼운 사진도 함께 부탁드립니다.',
    '',
    '2. 작품별 정보',
    '- 작품명, 제작 연도',
    '- 재료와 기법 (예: 캔버스에 유채)',
    '- 크기 (세로×가로 cm, 호수를 알면 함께)',
    '- 원화인지 에디션인지, 액자 포함 여부',
    '- 희망 가격: 작가님이 실제로 받고 싶은 금액으로 적어주세요. 수수료를 반영한 게시 가격은 저희가 계산해서 알려드립니다.',
    '- 지금 다른 곳에서도 판매 중인지 여부',
    '',
    '3. 작품 설명',
    '- 작품마다 2~5줄 정도로, 무엇을 그렸는지와 어떤 생각으로 작업했는지 적어주세요.',
    '',
    '4. 작가 정보',
    '- 이력서(CV): 학력, 전시 이력, 수상 경력, 그 밖의 활동 (전시 경험이 없어도 괜찮습니다)',
    '- 3~5줄 정도의 작가 소개글, 활동명, 인스타그램 같은 SNS 계정',
    '- 프로필 사진 (선택)',
    '',
    '자료를 확인한 뒤 작가님과 통화나 만남으로 짧게 이야기를 나누고, 게시 여부를 알려드리겠습니다. 게시 비용은 없습니다.',
    '',
    '이 메일에 답장으로 보내주시면 되고, 사진 용량이 크면 구글 드라이브 링크로 보내주셔도 됩니다.',
    '',
    '감사합니다.',
    '이동원 드림',
    'Gallery 751 | gallery751.com',
  ].join('\n');
}

/* 상태 — 앞쪽일수록 이른 단계. 자동 갱신은 앞으로만 옮기고, 목록에 없는 값은 건드리지 않습니다 */
const ARTIST_STATUS = ['신규', '자료 요청함', '답장 옴', '인터뷰 예정', '게시 확정', '보류', '거절'];
const SHOW_STATUS = ['신규', '연락함', '답장 옴', '참가 확정', '보류', '거절'];
const LISTING = ['검토 전', '게시', '보류'];
const ORDER = ['신규', '연락함', '입금 대기', '발송', '완료', '취소'];
const OTHER = ['신규', '연락함', '완료', '보류'];

/* 탭 구성 — [열 이름, 너비]. 기존 탭은 setup 때 이 순서로 열을 옮기고 없는 열을 끼워 넣습니다 */
const TABS = {
  artist: {
    name: '작가 접수', status: '상태', list: ARTIST_STATUS, freeze: 4,
    mailCol: '이메일', sentStatus: '자료 요청함',
    rename: { '원본·작업 링크': '프로필 링크' },
    cols: [
      ['접수일시', 125], ['상태', 105], ['요청 보내기', 80], ['이름', 110], ['이메일', 190],
      ['작품 가격', 150], ['프로필 링크', 170], ['작가 소개', 260], ['보낸 메일', 115], ['답장', 115],
      ['메모', 220], ['전화', 110], ['SNS', 120], ['지역', 70], ['지금 활동', 90], ['작품 수', 60],
      ['작품·희망 가격', 200], ['이력', 260], ['사진 폴더', 80], ['이력서 파일', 80], ['프로필 사진', 80],
      ['유입', 70], ['이전 페이지', 160], ['접수 ID', 130],
    ],
  },
  works: {
    name: '작품', status: '게시', list: LISTING, freeze: 4,
    cols: [
      ['접수일시', 125], ['작가', 110], ['사진', 110], ['작품명', 150], ['제작 연도', 70],
      ['재료·기법', 130], ['크기', 110], ['원화/에디션', 90], ['액자', 80], ['희망 가격(작가 수령)', 130],
      ['다른 곳 판매', 120], ['작품 설명', 300], ['사진 파일', 80], ['게시', 80], ['게시 가격', 90],
      ['메모', 220], ['접수 ID', 130],
    ],
  },
  exhibition: {
    name: '전시 참가', status: '상태', list: SHOW_STATUS, freeze: 3,
    mailCol: '연락처', sentStatus: '연락함',
    cols: [
      ['접수일시', 125], ['상태', 105], ['이름', 110], ['연락처', 170], ['보낸 메일', 115], ['답장', 115],
      ['메모', 220], ['SNS', 120], ['지역', 70], ['전시 경험', 90], ['작품 수', 70], ['크기', 110],
      ['가격대', 110], ['가능 시기', 110], ['희망 지역', 170], ['걸고 싶은 작품', 300], ['작업 링크', 160],
      ['소개', 300], ['조건 확인', 70], ['유입', 70], ['이전 페이지', 160],
    ],
  },
  purchase: {
    name: '구매 신청', status: '상태', list: ORDER, freeze: 3,
    cols: [
      ['접수일시', 125], ['상태', 95], ['작품', 160], ['작가', 100], ['가격', 90], ['이름', 100],
      ['연락처', 160], ['지역', 110], ['걸 곳', 150], ['액자', 70], ['보관', 90], ['전할 말', 260],
      ['청약철회 동의', 90], ['재판매 동의', 90], ['메모', 220], ['작품 ID', 90], ['유입', 70], ['이전 페이지', 160],
    ],
  },
  other: {
    name: '기타 신청', status: '상태', list: OTHER, freeze: 3,
    cols: [
      ['접수일시', 125], ['상태', 95], ['종류', 100], ['연락처', 180], ['역할', 100],
      ['메모', 220], ['유입', 70], ['이전 페이지', 160],
    ],
  },
};

/* 상태 색 */
const COLORS = [
  [['신규', '검토 전'], '#fff4c2', '#6b5200'],
  [['답장 옴'], '#ffe0cc', '#8a3500'],
  [['자료 요청함', '연락함', '인터뷰 예정', '입금 대기', '발송'], '#e3edff', '#1f4aa8'],
  [['게시 확정', '참가 확정', '게시', '완료'], '#dff3e4', '#1e6b35'],
  [['보류', '거절', '취소'], '#eeeeee', '#777777'],
];

/* ── 받기 ── */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SECRET && d.secret !== SECRET) return reply({ ok: false, error: 'forbidden' });

    const ss = book();
    const at = when(d.submitted_at);
    const tail = { '유입': t(d.source), '이전 페이지': t(d.referrer) };

    switch (d.type) {
      case 'artist':
        addArtist(ss, d, at, tail);
        break;
      case 'exhibition':
        addRow(ss, 'exhibition', Object.assign({
          '접수일시': at, '상태': '신규', '이름': t(d.name), '연락처': t(d.contact), 'SNS': t(d.instagram),
          '지역': t(d.region), '전시 경험': t(d.experience), '작품 수': t(d.works), '크기': t(d.size),
          '가격대': t(d.price), '가능 시기': t(d.when), '희망 지역': t(d.prefRegion),
          '걸고 싶은 작품': t(d.worksList), '작업 링크': t(d.link), '소개': t(d.about), '조건 확인': yes(d.agreeTerms),
        }, tail));
        break;
      case 'purchase':
        addRow(ss, 'purchase', Object.assign({
          '접수일시': at, '상태': '신규', '작품': t(d.workTitle), '작가': t(d.artist), '가격': t(d.price),
          '이름': t(d.name), '연락처': t(d.contact), '지역': t(d.region), '걸 곳': t(d.place), '액자': t(d.framed),
          '보관': t(d.custody), '전할 말': t(d.message), '청약철회 동의': yes(d.agreeWithdraw),
          '재판매 동의': yes(d.agreeRoyalty), '작품 ID': t(d.workId),
        }, tail));
        break;
      case 'community':
        addRow(ss, 'other', Object.assign({ '접수일시': at, '상태': '신규', '종류': '커뮤니티', '연락처': t(d.contact), '역할': t(d.role) }, tail));
        break;
      case 'storage_notify':
        addRow(ss, 'other', Object.assign({ '접수일시': at, '상태': '신규', '종류': '수장고 알림', '연락처': t(d.contact) }, tail));
        break;
      default:
        return reply({ ok: false, error: 'unknown type' });
    }
    return reply({ ok: true });
  } catch (err) {
    console.error(err);
    return reply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/* 브라우저로 배포 주소를 열면 살아 있는지 확인할 수 있습니다 */
function doGet() {
  return reply({ ok: true, tabs: Object.keys(TABS).map((k) => TABS[k].name) });
}

/* ── 작가 접수 ── */
function addArtist(ss, d, at, tail) {
  const id = Utilities.formatDate(new Date(), TZ, 'yyMMdd-HHmmss') + '-' + Math.random().toString(36).slice(2, 5);
  const works = Array.isArray(d.works) ? d.works : [];
  const files = Array.isArray(d.files) ? d.files : [];

  /* 예전 폼에서 사진·이력서가 함께 오면 접수 건별 폴더에 저장합니다 */
  let folder = null;
  const saved = {};
  if (files.length) {
    const day = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
    folder = rootFolder().createFolder(day + ' ' + (d.name || '이름 없음') + ' (' + id + ')');
    files.forEach((f) => {
      try {
        const blob = Utilities.newBlob(Utilities.base64Decode(f.data), f.type || mimeOf(f.name), f.name);
        saved[f.name] = folder.createFile(blob).getUrl();
      } catch (err) {
        console.error('파일 저장 실패', f.name, err);
      }
    });
  }
  const cv = Object.keys(saved).find((n) => n.indexOf('cv.') === 0);
  const legacyCv = [d.since && '그려온 기간: ' + d.since, d.materials && '주 재료: ' + d.materials]
    .filter(Boolean).join('\n');
  const mail = isEmail(d.contact) ? String(d.contact).trim() : '';

  addRow(ss, 'artist', Object.assign({
    '접수일시': at, '상태': '신규', '이름': t(d.name), '이메일': t(mail),
    '작품 가격': t(d.price), '프로필 링크': t(d.profile || d.link), '작가 소개': t(d.about),
    '전화': t(d.phone || (mail ? '' : d.contact)), 'SNS': t(d.instagram), '지역': t(d.region),
    '지금 활동': t(d.activity), '작품 수': works.length || t(d.workCount || d.count),
    '작품·희망 가격': t(works.map((w) => (w.title || '무제') + ' — ' + (w.price || '가격 미정')).join('\n')),
    '이력': t(d.cv || legacyCv || (cv ? '(파일 첨부)' : '')),
    '사진 폴더': folder ? link(folder.getUrl(), '폴더') : '',
    '이력서 파일': cv ? link(saved[cv], '이력서') : '',
    '프로필 사진': saved['profile.jpg'] ? link(saved['profile.jpg'], '프로필') : '',
    '접수 ID': id,
  }, tail));

  /* 작품은 한 점당 한 줄 — 위에서부터 작품 1, 2, 3… 순서가 되도록 거꾸로 넣습니다 */
  works.slice().reverse().forEach((w) => {
    const n = (w.photos || []).filter((x) => saved[x]).length;
    const row = addRow(ss, 'works', {
      '접수일시': at, '작가': t(d.name), '작품명': t(w.title), '제작 연도': t(w.year), '재료·기법': t(w.medium),
      '크기': t(w.size), '원화/에디션': t(w.edition), '액자': t(w.framed), '희망 가격(작가 수령)': t(w.price),
      '다른 곳 판매': t(w.elsewhere), '작품 설명': t(w.desc),
      '사진 파일': folder && n ? link(folder.getUrl(), '사진 ' + n + '장') : '', '게시': '검토 전', '접수 ID': id,
    });
    if (w.thumb) {
      const sh = tab(ss, 'works');
      try {
        const img = SpreadsheetApp.newCellImage()
          .setSourceUrl('data:image/jpeg;base64,' + w.thumb)
          .setAltTextTitle(String(w.title || '작품'))
          .build();
        sh.getRange(row, colOf(sh, '사진')).setValue(img);
        sh.setRowHeight(row, 100);
      } catch (err) {
        console.error('대표 사진 넣기 실패', err);
      }
    }
  });
}

/* ── '요청 보내기' 체크 → 자료 요청 메일 ── */
function onSheetEdit(e) {
  if (!e || !e.range) return;
  const r = e.range;
  const sh = r.getSheet();
  if (sh.getName() !== TABS.artist.name || r.getRow() < 2 || r.getNumRows() !== 1 || r.getNumColumns() !== 1) return;
  if (headers(sh)[r.getColumn() - 1] !== '요청 보내기' || r.getValue() !== true) return;
  sendRequest(sh, r.getRow());
}

function sendRequest(sh, row) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  const h = headers(sh);
  const cell = (name) => sh.getRange(row, h.indexOf(name) + 1);
  try {
    const email = String(cell('이메일').getValue() || '').trim();
    if (!isEmail(email)) {
      cell('요청 보내기').setValue(false);
      note(cell('메모'), '이메일 주소가 없어 자료 요청 메일을 보내지 못했습니다.');
      return;
    }
    GmailApp.sendEmail(email, REQUEST_SUBJECT, requestBody(cell('이름').getValue()), {
      from: MAIL_FROM, name: MAIL_NAME, replyTo: MAIL_FROM,
    });
    cell('보낸 메일').setValue(new Date());
    advance(cell('상태'), TABS.artist.list, TABS.artist.sentStatus);
  } catch (err) {
    console.error(err);
    cell('요청 보내기').setValue(false);
    note(cell('메모'), '자료 요청 메일 발송 실패: ' + String(err).slice(0, 120));
  } finally {
    lock.releaseLock();
  }
}

/* ── 메일함 → 시트 (10분마다) ── */
function syncMail() {
  const ss = book();
  const cache = {};
  ['artist', 'exhibition'].forEach((key) => {
    const conf = TABS[key];
    const sh = ss.getSheetByName(conf.name);
    if (!sh || sh.getLastRow() < 2) return;
    const h = headers(sh);
    const c = (name) => h.indexOf(name);
    const rows = sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getValues();
    rows.forEach((r, i) => {
      const email = String(r[c(conf.mailCol)] || '').trim().toLowerCase();
      if (!isEmail(email) || r[c('답장')]) return;          /* 답장이 기록되면 더 보지 않습니다 */
      const info = cache[email] || (cache[email] = mailInfo(email));
      const row = i + 2;
      const known = r[c('보낸 메일')] ? new Date(r[c('보낸 메일')]) : null;
      const sent = info.sent && (!known || info.sent > known) ? info.sent : known;
      if (sent && sent !== known) {
        sh.getRange(row, c('보낸 메일') + 1).setValue(sent);
        advance(sh.getRange(row, c('상태') + 1), conf.list, conf.sentStatus);
      }
      if (info.reply && (!sent || info.reply > sent)) {
        sh.getRange(row, c('답장') + 1).setValue(info.reply);
        advance(sh.getRange(row, c('상태') + 1), conf.list, '답장 옴');
      }
    });
  });
}

/* 그 주소로 우리가 보낸 마지막 메일, 그 주소에서 온 마지막 메일 */
function mailInfo(email) {
  const out = { sent: null, reply: null };
  const later = (a, b) => (!a || b > a ? b : a);
  GmailApp.search('in:sent to:"' + email + '"', 0, 5).forEach((th) => th.getMessages().forEach((m) => {
    if (/@gallery751\.com/i.test(m.getFrom()) && (m.getTo() + ',' + m.getCc()).toLowerCase().indexOf(email) >= 0) {
      out.sent = later(out.sent, m.getDate());
    }
  }));
  GmailApp.search('from:"' + email + '" -in:sent -in:spam -in:trash', 0, 5).forEach((th) => th.getMessages().forEach((m) => {
    if (m.getFrom().toLowerCase().indexOf(email) >= 0) out.reply = later(out.reply, m.getDate());
  }));
  return out;
}

/* 상태를 목표 단계까지만 앞으로 옮깁니다 */
function advance(range, list, target) {
  const value = String(range.getValue());
  const now = list.indexOf(value);
  const goal = list.indexOf(target);
  if (goal >= 0 && ((now >= 0 && now < goal) || value === '')) range.setValue(target);
}

function note(range, text) {
  const stamp = Utilities.formatDate(new Date(), TZ, 'MM-dd HH:mm');
  const before = String(range.getValue() || '');
  range.setValue((before ? before + '\n' : '') + '[' + stamp + '] ' + text);
}

/* ── 시트 다루기 ── */

/* 새 접수는 항상 맨 위(2행)에 넣습니다. 값은 열 이름으로 찾아 넣습니다 */
function addRow(ss, key, data) {
  const sh = tab(ss, key);
  const h = headers(sh);
  const row = h.map((name) => (data[name] === undefined ? '' : data[name]));

  if (sh.getLastRow() >= 2) sh.insertRowBefore(2);
  const r = sh.getRange(2, 1, 1, h.length);
  /* clearFormat 은 조건부 서식(상태 색)까지 지우므로 쓰지 않고 필요한 서식만 되돌립니다 */
  r.clearDataValidations();
  r.setValues([row]);
  r.setFontWeight('normal').setFontColor(null).setBackground(null).setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sh.setRowHeight(2, 34);
  rowWidgets(sh, key, 2, 1, true);
  return 2;
}

/* 줄마다 붙는 것들 — 상태 드롭다운, 요청 체크박스, 날짜 형식 */
function rowWidgets(sh, key, from, count, fresh) {
  const conf = TABS[key];
  const h = headers(sh);
  const col = (name) => h.indexOf(name) + 1;
  sh.getRange(from, 1, count, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  if (col(conf.status)) {
    sh.getRange(from, col(conf.status), count, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(conf.list, true).setAllowInvalid(true).build())
      .setFontWeight('bold');
  }
  ['보낸 메일', '답장'].forEach((name) => {
    if (col(name)) sh.getRange(from, col(name), count, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  });
  if (col('요청 보내기')) {
    const box = sh.getRange(from, col('요청 보내기'), count, 1);
    if (fresh) {
      box.insertCheckboxes();
    } else {
      /* 이미 체크 여부가 있는 칸은 값을 지우지 않도록 빈 칸에만 넣습니다 */
      box.getValues().forEach((v, i) => {
        if (v[0] === '' || v[0] === null) sh.getRange(from + i, col('요청 보내기')).insertCheckboxes();
      });
    }
  }
}

function headers(sh) {
  const n = sh.getLastColumn();
  return n ? sh.getRange(1, 1, 1, n).getValues()[0].map(String) : [];
}
function colOf(sh, name) { return headers(sh).indexOf(name) + 1; }

/* 탭이 없으면 만들고 머리글·열 너비·상태 색을 맞춥니다 */
function tab(ss, key) {
  const conf = TABS[key];
  let sh = ss.getSheetByName(conf.name);
  if (sh) return sh;

  sh = ss.insertSheet(conf.name);
  const width = conf.cols.length;
  sh.getRange(1, 1, 1, width).setValues([conf.cols.map((c) => c[0])]);
  if (sh.getMaxColumns() > width) sh.deleteColumns(width + 1, sh.getMaxColumns() - width);
  styleHead(sh, key);
  return sh;
}

/* 기존 탭을 지금 구성에 맞춥니다 — 열 이름 바꾸기, 없는 열 끼워 넣기, 순서 맞추기 */
function ensureLayout(sh, key) {
  const conf = TABS[key];
  Object.keys(conf.rename || {}).forEach((from) => {
    const h = headers(sh);
    const to = conf.rename[from];
    if (h.indexOf(from) >= 0 && h.indexOf(to) < 0) sh.getRange(1, h.indexOf(from) + 1).setValue(to);
  });
  conf.cols.forEach((c, i) => {
    const want = i + 1;
    const at = headers(sh).indexOf(c[0]) + 1;
    if (at === want) return;
    if (at === 0) {
      sh.insertColumnsAfter(want - 1, 1);
      sh.getRange(1, want).setValue(c[0]);
    } else {
      sh.moveColumns(sh.getRange(1, at), want);
    }
  });
  styleHead(sh, key);
}

function styleHead(sh, key) {
  const conf = TABS[key];
  const width = headers(sh).length;
  sh.getRange(1, 1, 1, width)
    .clearDataValidations()
    .setFontWeight('bold').setFontColor(null).setBackground('#f1eee8').setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 32);
  conf.cols.forEach((c) => {
    const at = headers(sh).indexOf(c[0]) + 1;
    if (at) sh.setColumnWidth(at, c[1]);
  });
  sh.setFrozenColumns(conf.freeze || 3);
  paintStatus(sh, key);
}

/* 상태 칸 색 — 열 전체에 겁니다 */
function paintStatus(sh, key) {
  const conf = TABS[key];
  const col = headers(sh).indexOf(conf.status) + 1;
  if (!col) return;
  /* 1행부터 잡아야 2행에 새 줄을 끼워 넣을 때 범위가 같이 늘어납니다 */
  const range = sh.getRange(1, col, sh.getMaxRows(), 1);
  const rules = [];
  COLORS.forEach((g) => g[0].forEach((text) => {
    if (conf.list.indexOf(text) < 0) return;
    rules.push(SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(text).setBackground(g[1]).setFontColor(g[2]).setRanges([range]).build());
  }));
  sh.setConditionalFormatRules(rules);
}

/* 이 코드가 붙어 있는 시트 — 웹앱·트리거 실행 중에도 확실히 잡히도록 setup 때 ID 를 기억해 둡니다 */
function book() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function rootFolder() {
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('ROOT_FOLDER_ID');
  if (saved) {
    try { return DriveApp.getFolderById(saved); } catch (err) { /* 지워졌으면 새로 만듭니다 */ }
  }
  const it = DriveApp.getFoldersByName(ROOT_FOLDER);
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_FOLDER);
  props.setProperty('ROOT_FOLDER_ID', folder.getId());
  return folder;
}

/* 한 번 실행 — 탭 정리, 기존 줄 보정, 트리거 설치. 여러 번 실행해도 안전합니다 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  if (/^(제목 없는|Untitled)/.test(ss.getName())) ss.rename('Gallery 751 접수함');

  Object.keys(TABS).forEach((key) => {
    const sh = tab(ss, key);
    ensureLayout(sh, key);
    if (sh.getLastRow() >= 2) rowWidgets(sh, key, 2, sh.getLastRow() - 1, false);
  });

  /* 예전 폼의 '가격대: …' 를 작품 가격 칸으로 옮깁니다 */
  const sh = ss.getSheetByName(TABS.artist.name);
  if (sh.getLastRow() >= 2) {
    const h = headers(sh);
    const price = h.indexOf('작품 가격');
    const old = h.indexOf('작품·희망 가격');
    sh.getRange(2, 1, sh.getLastRow() - 1, h.length).getValues().forEach((r, i) => {
      if (!r[price] && /^가격대: /.test(String(r[old]))) {
        sh.getRange(i + 2, price + 1).setValue(String(r[old]).replace(/^가격대: /, ''));
        sh.getRange(i + 2, old + 1).setValue('');
      }
    });
  }

  ss.getSheets().forEach((s) => {
    if (/^(시트1|Sheet1)$/.test(s.getName()) && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });

  /* 트리거 — 같은 이름은 지우고 다시 겁니다 */
  ScriptApp.getProjectTriggers().forEach((tr) => {
    if (['syncMail', 'onSheetEdit'].indexOf(tr.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(tr);
  });
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('syncMail').timeBased().everyMinutes(10).create();

  const aliases = GmailApp.getAliases();
  console.log('보낼 수 있는 주소: ' + aliases.join(', ') + (aliases.indexOf(MAIL_FROM) < 0 ? '  ← ' + MAIL_FROM + ' 없음!' : ''));
  rootFolder();
  syncMail();
  console.log('준비 완료 — 탭: ' + Object.keys(TABS).map((k) => TABS[k].name).join(', '));
}

/* 시트를 열면 위쪽에 메뉴가 생깁니다 */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Gallery 751')
    .addItem('메일 상태 지금 확인', 'syncMail')
    .addToUi();
}

/* ── 작은 도구들 ── */

/* 사람이 쓴 글이 '=' 등으로 시작하면 수식으로 실행되지 않게 막고,
   0 으로 시작하는 숫자(전화번호)는 숫자로 바뀌어 앞자리 0 이 사라지지 않게 글자로 넣습니다 */
function t(v) {
  if (v === undefined || v === null) return '';
  const s = String(v).trim();
  return /^[=+@]/.test(s) || /^0\d+$/.test(s) ? "'" + s : s;
}
function isEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
function yes(v) { return v === true || v === 'true' ? '예' : ''; }
function link(url, label) { return '=HYPERLINK("' + url + '","' + label + '")'; }
function when(iso) {
  const d = iso ? new Date(iso) : new Date();
  return Utilities.formatDate(isNaN(d) ? new Date() : d, TZ, 'yyyy-MM-dd HH:mm');
}
function mimeOf(name) {
  const ext = String(name).split('.').pop().toLowerCase();
  return {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    hwp: 'application/x-hwp',
  }[ext] || 'application/octet-stream';
}
function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
