/**
 * 저널 글 주소 (/journal, /journal/글ID)
 *
 * 사이트는 index.html 한 장이라 글 내용이 자바스크립트로 그려집니다.
 * 검색엔진(특히 네이버)이 글마다 제목·요약·본문을 읽을 수 있도록,
 * 여기서 index.html 에 그 글의 제목·설명·대표 사진·본문을 미리 넣어서 보냅니다.
 * 브라우저에서는 index.html 이 평소처럼 뜨고 같은 글을 다시 그립니다.
 *
 * date 가 아직 오지 않은 글은 없는 글로 취급합니다 (예약 발행).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://www.gallery751.com';

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const abs = (u) => /^https?:\/\//.test(u) ? u : SITE + '/' + String(u).replace(/^\/+/, '');

/* 본문 링크는 사이트의 해시 링크(#w-작품ID 등)를 루트 기준으로 */
const href = (h) => {
  const s = String(h || '');
  if (/^https?:\/\//.test(s)) return s;
  const j = s.match(/^#\/journal(?:\/(.+))?$/);
  if (j) return '/journal' + (j[1] ? '/' + j[1] : '');
  return s.startsWith('#') ? '/' + s : '/journal';
};

const visible = (list, now = new Date()) => list
  .filter(p => p && p.id && p.title && (!p.date || new Date(p.date) <= now))
  .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

const kicker = (p) => p.series ? `${p.series} · ${p.no}편` : (p.category || '저널');

function postHTML(p) {
  const hero = p.hero || p.images?.[0] || '';
  const body = (p.body || []).map(b => {
    if (b.lead) return `<p class="jn-lead">${esc(b.lead)}</p>`;
    if (b.h) return `<h2>${esc(b.h)}</h2>`;
    if (b.p) return `<p>${esc(b.p)}</p>`;
    if (b.note) return `<p class="jn-note">${esc(b.note)}</p>`;
    if (b.list) return `<ul class="jn-ul">${b.list.map(i => `<li><strong>${esc(i.t)}</strong>${i.d ? `<span>${esc(i.d)}</span>` : ''}</li>`).join('')}</ul>`;
    if (b.img) {
      const im = `<img src="${esc(b.img)}" alt="${esc(b.cap || '')}" loading="lazy">`;
      return `<figure class="jn-fig">${b.href ? `<a href="${esc(href(b.href))}">${im}</a>` : im}${b.cap ? `<figcaption>${esc(b.cap)}</figcaption>` : ''}</figure>`;
    }
    return '';
  }).join('');
  const links = (p.links || []).map(l => `<a href="${esc(href(l.href))}">${esc(l.t)}</a>`).join('');
  const src = (p.sources || []).map(x => `참고 · ${esc(x)}`).join('<br>');
  return `
    <a class="jn-back" href="/journal">← 저널</a>
    <header class="jn-head"><span class="label">${esc(kicker(p))}</span><h1>${esc(p.title)}</h1><time datetime="${esc(p.date || '')}"></time></header>
    ${hero ? `<figure class="jn-hero"><img src="${esc(hero)}" alt=""></figure>` : ''}
    <div class="jn-body">${body}${links ? `<div class="jn-links">${links}</div>` : ''}${src ? `<p class="jn-src">${src}</p>` : ''}</div>`;
}

function listHTML(list) {
  return list.map(p => `<a class="jn-card" href="/journal/${encodeURIComponent(p.id)}"><span class="jn-k"><span>${esc(kicker(p))}</span></span><h3>${esc(p.title)}</h3>${p.summary ? `<p class="jn-sum">${esc(p.summary)}</p>` : ''}</a>`).join('');
}

/* <head> 의 제목·설명·공유 태그를 바꿉니다 */
function setHead(html, { title, desc, url, image, type, jsonld }) {
  const rep = (re, val) => { html = html.replace(re, val); };
  rep(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  rep(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`);
  rep(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${esc(url)}">`);
  rep(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`);
  rep(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`);
  rep(/<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${esc(type)}">`);
  rep(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${esc(url)}">`);
  if (image) {
    rep(/<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${esc(image)}">`);
    rep(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${esc(image)}">`);
    /* 대표 사진 크기는 고정값이 아니므로 1200×630 표기를 뺍니다 */
    rep(/<meta property="og:image:width" content="[^"]*">\n?/, '');
    rep(/<meta property="og:image:height" content="[^"]*">\n?/, '');
  }
  if (jsonld) html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>\n</head>`);
  return html;
}

export async function render(id, now = new Date()) {
  const root = process.cwd();
  const [tpl, raw] = await Promise.all([
    readFile(path.join(root, 'index.html'), 'utf8'),
    readFile(path.join(root, 'journal.json'), 'utf8'),
  ]);
  const list = visible(JSON.parse(raw), now);
  /* 홈 대신 저널이 보이는 상태로 보냅니다 (스크립트가 돌기 전 화면과 검색엔진이 읽는 본문) */
  let html = tpl
    .replace('<main class="page" id="page-home">', '<main class="page" id="page-home" hidden>')
    .replace('<main class="page" id="page-journal" hidden>', '<main class="page" id="page-journal">')
    .replace('<body>', '<body class="subpage">');

  if (!id) {
    html = setHead(html, {
      title: '저널 — Gallery 751',
      desc: '그림을 처음 사는 분을 위한 안내와 입점 작가의 이야기, Gallery 751의 소식을 전합니다.',
      url: `${SITE}/journal`, type: 'website',
    });
    html = html.replace('<div class="jn-grid" id="jn-grid"></div>', `<div class="jn-grid" id="jn-grid">${listHTML(list)}</div>`);
    return { status: 200, html };
  }

  const p = list.find(x => x.id === id);
  if (!p) {
    html = setHead(html, { title: '저널 — Gallery 751', desc: '찾는 글이 없습니다.', url: `${SITE}/journal`, type: 'website' });
    html = html.replace('<head>', '<head>\n<meta name="robots" content="noindex">');
    return { status: 404, html };
  }

  const url = `${SITE}/journal/${encodeURIComponent(p.id)}`;
  const hero = p.hero || p.images?.[0] || '';
  const image = hero ? abs(hero) : '';
  const desc = p.summary || (p.body || []).find(b => b.lead || b.p)?.lead || '';
  html = setHead(html, {
    title: `${p.title} — Gallery 751`, desc, url, image, type: 'article',
    jsonld: {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: p.title, description: desc, datePublished: p.date || undefined,
      image: image || undefined, mainEntityOfPage: url,
      author: { '@type': 'Organization', name: 'Gallery 751', url: SITE },
      publisher: { '@type': 'Organization', name: 'Gallery 751', url: SITE },
    },
  });
  html = html
    .replace('<main class="page" id="page-journal">', '<main class="page is-post" id="page-journal">')
    .replace('<article class="wrap jn-post" id="jn-post" hidden></article>', `<article class="wrap jn-post" id="jn-post">${postHTML(p)}</article>`);
  return { status: 200, html };
}

export default async function handler(req, res) {
  const id = typeof req.query?.id === 'string' ? req.query.id : '';
  try {
    const { status, html } = await render(id);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    /* 예약 글이 제시간에 열리도록 캐시는 짧게 */
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    res.status(status).send(html);
  } catch (e) {
    console.error('journal', e);
    res.status(500).send('저널을 불러오지 못했습니다.');
  }
}
