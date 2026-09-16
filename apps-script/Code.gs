/**
 * Gallery 751 접수함
 * 사이트 폼(api/submit.js)이 보내는 내용을 구글 시트에 종류별 탭으로 정리하고,
 * 작가가 올린 사진·이력서는 드라이브 「Gallery 751 작가 접수」 폴더에 접수 건별로 저장합니다.
 *
 * 시트 위치: dongwon@gallery751.com 계정의 「Gallery 751 접수함」 (이 코드는 그 시트에 붙어 있습니다)
 *
 * 적용 방법
 *   1) 시트 → 확장 프로그램 → Apps Script 에 이 파일을 붙여넣기
 *   2) 아래 SECRET 에 Vercel 의 SHEET_SECRET 과 같은 값을 넣기 (레포에는 넣지 마세요)
 *   3) 함수 선택에서 setup 을 고르고 실행 → 권한 허용 (탭·폴더가 만들어집니다)
 *   4) 배포 → 새 배포 → 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → 나온 주소를 Vercel SHEET_WEBHOOK_URL 에
 *      이후 코드를 고칠 때는 배포 관리 → 연필(수정) → 새 버전 (주소 유지)
 */

const SECRET = '';
const ROOT_FOLDER = 'Gallery 751 작가 접수';
const TZ = 'Asia/Seoul';

const STATUS = ['신규', '연락함', '인터뷰 예정', '게시 확정', '보류', '거절'];
const LISTING = ['검토 전', '게시', '보류'];
const ORDER = ['신규', '연락함', '입금 대기', '발송', '완료', '취소'];

/* 탭 구성 — [열 이름, 너비] */
const TABS = {
  artist: {
    name: '작가 접수', status: '상태', list: STATUS,
    cols: [
      ['접수일시', 125], ['상태', 95], ['이름', 110], ['이메일', 180], ['전화', 110], ['SNS', 120],
      ['지역', 70], ['지금 활동', 90], ['작품 수', 60], ['작품·희망 가격', 200], ['이력', 260],
      ['작가 소개', 300], ['사진 폴더', 80], ['이력서 파일', 80], ['프로필 사진', 80],
      ['원본·작업 링크', 160], ['메모', 220], ['유입', 70], ['이전 페이지', 160], ['접수 ID', 130],
    ],
  },
  works: {
    name: '작품', status: '게시', list: LISTING,
    cols: [
      ['접수일시', 125], ['작가', 110], ['사진', 110], ['작품명', 150], ['제작 연도', 70],
      ['재료·기법', 130], ['크기', 110], ['원화/에디션', 90], ['액자', 80], ['희망 가격(작가 수령)', 130],
      ['다른 곳 판매', 120], ['작품 설명', 300], ['사진 파일', 80], ['게시', 80], ['게시 가격', 90],
      ['메모', 220], ['접수 ID', 130],
    ],
  },
  exhibition: {
    name: '전시 참가', status: '상태', list: STATUS,
    cols: [
      ['접수일시', 125], ['상태', 95], ['이름', 110], ['연락처', 160], ['SNS', 120], ['지역', 70],
      ['전시 경험', 90], ['작품 수', 70], ['크기', 110], ['가격대', 110], ['가능 시기', 110],
      ['희망 지역', 170], ['걸고 싶은 작품', 300], ['작업 링크', 160], ['소개', 300], ['조건 확인', 70],
      ['메모', 220], ['유입', 70], ['이전 페이지', 160],
    ],
  },
  purchase: {
    name: '구매 신청', status: '상태', list: ORDER,
    cols: [
      ['접수일시', 125], ['상태', 95], ['작품', 160], ['작가', 100], ['가격', 90], ['이름', 100],
      ['연락처', 160], ['지역', 110], ['걸 곳', 150], ['액자', 70], ['보관', 90], ['전할 말', 260],
      ['청약철회 동의', 90], ['재판매 동의', 90], ['메모', 220], ['작품 ID', 90], ['유입', 70], ['이전 페이지', 160],
    ],
  },
  other: {
    name: '기타 신청', status: '상태', list: STATUS,
    cols: [
      ['접수일시', 125], ['상태', 95], ['종류', 100], ['연락처', 180], ['역할', 100],
      ['메모', 220], ['유입', 70], ['이전 페이지', 160],
    ],
  },
};

/* ── 받기 ── */
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (SECRET && d.secret !== SECRET) return reply({ ok: false, error: 'forbidden' });

    const ss = book();
    const at = when(d.submitted_at);
    const tail = [t(d.source), t(d.referrer)];

    switch (d.type) {
      case 'artist':
        addArtist(ss, d, at);
        break;
      case 'exhibition':
        addRow(ss, 'exhibition', [
          at, '신규', t(d.name), t(d.contact), t(d.instagram), t(d.region), t(d.experience),
          t(d.works), t(d.size), t(d.price), t(d.when), t(d.prefRegion), t(d.worksList),
          t(d.link), t(d.about), yes(d.agreeTerms), '', ...tail,
        ]);
        break;
      case 'purchase':
        addRow(ss, 'purchase', [
          at, '신규', t(d.workTitle), t(d.artist), t(d.price), t(d.name), t(d.contact), t(d.region),
          t(d.place), t(d.framed), t(d.custody), t(d.message), yes(d.agreeWithdraw), yes(d.agreeRoyalty),
          '', t(d.workId), ...tail,
        ]);
        break;
      case 'community':
        addRow(ss, 'other', [at, '신규', '커뮤니티', t(d.contact), t(d.role), '', ...tail]);
        break;
      case 'storage_notify':
        addRow(ss, 'other', [at, '신규', '수장고 알림', t(d.contact), '', '', ...tail]);
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
function addArtist(ss, d, at) {
  const id = Utilities.formatDate(new Date(), TZ, 'yyMMdd-HHmmss') + '-' + Math.random().toString(36).slice(2, 5);
  const works = Array.isArray(d.works) ? d.works : [];
  const files = Array.isArray(d.files) ? d.files : [];

  /* 사진·이력서를 접수 건별 폴더에 저장 */
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

  /* 예전 폼(그려온 기간·주 재료·보유 작품 수·가격대)으로 들어온 접수도 같은 칸에 담습니다 */
  const legacyCv = [d.since && '그려온 기간: ' + d.since, d.materials && '주 재료: ' + d.materials]
    .filter(Boolean).join('\n');
  const priceText = works.length
    ? works.map((w) => (w.title || '무제') + ' — ' + (w.price || '가격 미정')).join('\n')
    : (d.price ? '가격대: ' + d.price : '');

  addRow(ss, 'artist', [
    at, '신규', t(d.name), t(d.contact), t(d.phone), t(d.instagram), t(d.region), t(d.activity),
    works.length || t(d.workCount || d.count),
    t(priceText),
    t(d.cv || legacyCv || (cv ? '(파일 첨부)' : '')), t(d.about),
    folder ? link(folder.getUrl(), '폴더') : '',
    cv ? link(saved[cv], '이력서') : '',
    saved['profile.jpg'] ? link(saved['profile.jpg'], '프로필') : '',
    t(d.link), '', t(d.source), t(d.referrer), id,
  ]);

  /* 작품은 한 점당 한 줄 — 위에서부터 작품 1, 2, 3… 순서가 되도록 거꾸로 넣습니다 */
  works.slice().reverse().forEach((w) => {
    const n = (w.photos || []).filter((x) => saved[x]).length;
    const row = addRow(ss, 'works', [
      at, t(d.name), '', t(w.title), t(w.year), t(w.medium), t(w.size), t(w.edition), t(w.framed),
      t(w.price), t(w.elsewhere), t(w.desc),
      folder && n ? link(folder.getUrl(), '사진 ' + n + '장') : '',
      '검토 전', '', '', id,
    ]);
    if (w.thumb) {
      const sh = tab(ss, 'works');
      try {
        const img = SpreadsheetApp.newCellImage()
          .setSourceUrl('data:image/jpeg;base64,' + w.thumb)
          .setAltTextTitle(String(w.title || '작품'))
          .build();
        sh.getRange(row, 3).setValue(img);
        sh.setRowHeight(row, 100);
      } catch (err) {
        console.error('대표 사진 넣기 실패', err);
      }
    }
  });
}

/* ── 시트 다루기 ── */

/* 새 접수는 항상 맨 위(2행)에 넣습니다 */
function addRow(ss, key, values) {
  const sh = tab(ss, key);
  const conf = TABS[key];
  const width = conf.cols.length;
  const row = values.slice(0, width);
  while (row.length < width) row.push('');

  if (sh.getLastRow() >= 2) sh.insertRowBefore(2);
  const r = sh.getRange(2, 1, 1, width);
  /* clearFormat 은 조건부 서식(상태 색)까지 지우므로 쓰지 않고 필요한 서식만 되돌립니다 */
  r.clearDataValidations();
  r.setValues([row]);
  r.setFontWeight('normal').setFontColor(null).setBackground(null).setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sh.getRange(2, 1).setNumberFormat('yyyy-mm-dd hh:mm');
  sh.setRowHeight(2, 34);

  const col = conf.cols.findIndex((c) => c[0] === conf.status) + 1;
  if (col > 0) {
    sh.getRange(2, col).setDataValidation(
      SpreadsheetApp.newDataValidation().requireValueInList(conf.list, true).setAllowInvalid(true).build()
    ).setFontWeight('bold');
  }
  return 2;
}

/* 탭이 없으면 만들고 머리글·열 너비·상태 색을 맞춥니다 */
function tab(ss, key) {
  const conf = TABS[key];
  let sh = ss.getSheetByName(conf.name);
  if (sh) return sh;

  sh = ss.insertSheet(conf.name);
  const width = conf.cols.length;
  const head = sh.getRange(1, 1, 1, width);
  head.setValues([conf.cols.map((c) => c[0])])
    .setFontWeight('bold').setBackground('#f1eee8').setVerticalAlignment('middle');
  sh.setFrozenRows(1);
  sh.setRowHeight(1, 32);
  conf.cols.forEach((c, i) => sh.setColumnWidth(i + 1, c[1]));
  if (sh.getMaxColumns() > width) sh.deleteColumns(width + 1, sh.getMaxColumns() - width);
  sh.setFrozenColumns(key === 'works' ? 4 : 3);
  paintStatus(sh, key);
  return sh;
}

/* 상태 칸 색 — 열 전체에 겁니다 */
function paintStatus(sh, key) {
  const conf = TABS[key];
  const col = conf.cols.findIndex((c) => c[0] === conf.status) + 1;
  if (col > 0) {
    /* 1행부터 잡아야 2행에 새 줄을 끼워 넣을 때 범위가 같이 늘어납니다 */
    const range = sh.getRange(1, col, sh.getMaxRows(), 1);
    const paint = (text, bg, fg) => SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(text).setBackground(bg).setFontColor(fg).setRanges([range]).build();
    sh.setConditionalFormatRules([
      paint('신규', '#fff4c2', '#6b5200'),
      paint('검토 전', '#fff4c2', '#6b5200'),
      paint('연락함', '#e3edff', '#1f4aa8'),
      paint('인터뷰 예정', '#e3edff', '#1f4aa8'),
      paint('입금 대기', '#e3edff', '#1f4aa8'),
      paint('게시 확정', '#dff3e4', '#1e6b35'),
      paint('게시', '#dff3e4', '#1e6b35'),
      paint('완료', '#dff3e4', '#1e6b35'),
      paint('보류', '#eeeeee', '#666666'),
      paint('거절', '#eeeeee', '#999999'),
      paint('취소', '#eeeeee', '#999999'),
    ]);
  }
}

/* 이 코드가 붙어 있는 시트 — 웹앱 실행 중에도 확실히 잡히도록 setup 때 ID 를 기억해 둡니다 */
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

/* 한 번만 실행 — 탭과 폴더를 미리 만들고 권한을 받습니다 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());
  if (/^(제목 없는|Untitled)/.test(ss.getName())) ss.rename('Gallery 751 접수함');
  Object.keys(TABS).forEach((k) => paintStatus(tab(ss, k), k));
  /* 처음 생긴 빈 탭(시트1)은 치웁니다 */
  ss.getSheets().forEach((sh) => {
    if (/^(시트1|Sheet1)$/.test(sh.getName()) && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });
  ss.setActiveSheet(ss.getSheetByName(TABS.artist.name));
  const folder = rootFolder();
  console.log('준비 완료 — 탭: ' + Object.keys(TABS).map((k) => TABS[k].name).join(', ') + ' / 폴더: ' + folder.getUrl());
}

/* ── 작은 도구들 ── */

/* 사람이 쓴 글이 '=' 등으로 시작하면 수식으로 실행되지 않게 막고,
   0 으로 시작하는 숫자(전화번호)는 숫자로 바뀌어 앞자리 0 이 사라지지 않게 글자로 넣습니다 */
function t(v) {
  if (v === undefined || v === null) return '';
  const s = String(v).trim();
  return /^[=+@]/.test(s) || /^0\d+$/.test(s) ? "'" + s : s;
}
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
