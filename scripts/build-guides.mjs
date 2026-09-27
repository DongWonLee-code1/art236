/**
 * 검색 유입용 키워드 랜딩 생성기
 *   node scripts/build-guides.mjs
 *
 * scripts/guides.data.mjs 를 읽어 아래 파일을 만듭니다. 만든 파일도 함께 커밋합니다 (Vercel 빌드 단계 없음).
 *   guide/<slug>.html   키워드별 페이지 — vercel.json 의 cleanUrls 로 /guide/<slug> 에서 열립니다
 *   guide/index.html    안내 모음 페이지 — /guide
 *   sitemap.xml         홈 + 안내 페이지
 *   robots.txt          전체 허용 + 사이트맵 위치
 *
 * 폼은 기존 /api/submit 을 그대로 씁니다. source 에 'guide-<slug>' 가 들어가
 * 접수함 시트의 '유입' 칸에서 어느 검색어 페이지로 들어온 신청인지 보입니다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SITE, TERMS, GUIDES } from './guides.data.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const works = JSON.parse(readFileSync(join(ROOT, 'works.json'), 'utf8'));
const artists = JSON.parse(readFileSync(join(ROOT, 'artists.json'), 'utf8'));
const today = new Date().toISOString().slice(0, 10);

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, '');

/* JPEG 의 SOF 마커에서 가로·세로를 읽습니다 — 레이아웃 밀림 방지용 width/height */
function jpegSize(file) {
  const b = readFileSync(file);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  return { w: 1200, h: 1200 };
}

function workOf(id) {
  const w = works.find((x) => x.id === id);
  if (!w) throw new Error(`works.json 에 없는 작품: ${id}`);
  const a = artists.find((x) => x.id === w.artistId) || {};
  return { ...w, artistName: a.name || '', img: '/' + w.images[0], ...jpegSize(join(ROOT, w.images[0])) };
}

const FORM = {
  artist: {
    label: '작품 등록 안내 받기',
    note: '이메일만 남기시면 작품 등록 안내를 보내드립니다. 받은 연락처는 안내 목적으로만 씁니다.',
    done: '받았습니다. 적어주신 메일로 작품 등록 안내를 보내드리겠습니다.',
  },
  exhibition: {
    label: '참가 의향 보내기',
    note: '지금 결정하시는 것이 아닙니다. 일정과 참가비가 정해지면 이 메일로 안내드립니다.',
    done: '받았습니다. 일정과 참가비가 정해지면 적어주신 메일로 안내드리겠습니다.',
  },
};

const formHtml = (g, where) => `
      <form class="apply" data-type="${g.form}" data-src="guide-${g.slug}${where === 'foot' ? '-foot' : ''}" data-done="${esc(FORM[g.form].done)}" novalidate>
        <input type="email" name="contact" autocomplete="email" inputmode="email" placeholder="이메일 주소" aria-label="이메일 주소" required>
        <input type="text" name="company" tabindex="-1" autocomplete="off" hidden>
        <button type="submit">${FORM[g.form].label}</button>
      </form>
      <p class="msg" role="status"></p>
      <p class="note">${esc(FORM[g.form].note)}</p>`;

const CSS = `
:root{--ink:#111;--ink-2:#4A4D50;--mute:#767676;--line:rgba(17,17,17,.14);--paper:#fff;--paper-2:#F4F4F2;--err:#B3261E;
  --sans:'Pretendard','Pretendard Variable',-apple-system,BlinkMacSystemFont,system-ui,sans-serif;--gut:clamp(16px,4.5vw,80px)}
*{box-sizing:border-box;margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{font-family:var(--sans);background:var(--paper);color:var(--ink);font-size:16px;line-height:1.6;-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit}
img{display:block;max-width:100%;height:auto}
.wrap{width:100%;max-width:1320px;margin:0 auto;padding:0 var(--gut)}
.top{position:sticky;top:0;z-index:5;background:rgba(255,255,255,.96);box-shadow:inset 0 -1px 0 var(--line)}
.top .wrap{display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{font-weight:600;font-size:15px;letter-spacing:.16em;text-transform:uppercase;text-decoration:none}
.top nav a{font-size:14px;text-decoration:none;margin-left:22px}
.top nav a:hover{text-decoration:underline}
.hero{display:grid;grid-template-columns:minmax(0,1.05fr) minmax(0,.95fr);gap:clamp(28px,5vw,88px);align-items:center;padding:clamp(40px,7vw,112px) 0}
.crumb{font-size:13px;color:var(--mute);margin-bottom:18px}
.crumb a{text-decoration:none}
h1{font-size:clamp(30px,3.6vw,56px);font-weight:600;line-height:1.18;letter-spacing:-.025em;word-break:keep-all}
.lead{margin-top:22px;font-size:clamp(16px,1.2vw,19px);color:var(--ink-2);max-width:40em;word-break:keep-all}
.terms{display:flex;flex-wrap:wrap;gap:8px 28px;margin-top:28px;padding-top:20px;border-top:1px solid var(--line)}
.terms div{font-size:14px}
.terms dt{color:var(--mute);font-size:12.5px}
.terms dd{font-weight:600}
.box{margin-top:30px;max-width:520px}
.apply{display:flex;border:1px solid var(--ink)}
.apply input[type=email]{flex:1;min-width:0;height:54px;border:0;padding:0 16px;font:inherit;font-size:16px;background:#fff;color:var(--ink);outline:none;border-radius:0;-webkit-appearance:none}
.apply button{flex:none;height:54px;padding:0 20px;border:0;background:var(--ink);color:#fff;font:inherit;font-size:15px;font-weight:600;cursor:pointer;border-radius:0}
.apply button:disabled{opacity:.6;cursor:default}
.apply.bad{border-color:var(--err)}
.msg{min-height:0;font-size:14px;margin-top:8px}
.msg.err{color:var(--err)}
.note{font-size:13px;color:var(--mute);margin-top:8px}
.done{padding:16px 18px;background:var(--paper-2);font-size:15px;font-weight:500}
figure img{width:100%;background:var(--paper-2)}
figcaption{margin-top:12px;font-size:13px;color:var(--mute);line-height:1.5}
figcaption b{display:block;color:var(--ink);font-weight:600;font-size:14px}
article{border-top:1px solid var(--line);padding:clamp(48px,6vw,96px) 0}
.body{max-width:760px}
article section+section{margin-top:clamp(40px,4.5vw,64px)}
article h2{font-size:clamp(21px,1.7vw,28px);font-weight:600;letter-spacing:-.015em;line-height:1.3;word-break:keep-all}
article p{margin-top:14px;font-size:clamp(16px,1.1vw,17.5px);color:var(--ink-2);line-height:1.8;word-break:keep-all}
article p strong{color:var(--ink);font-weight:600}
article p a{text-underline-offset:3px}
.faq{border-top:1px solid var(--line);padding:clamp(48px,6vw,96px) 0}
.faq h2{font-size:clamp(21px,1.7vw,28px);font-weight:600;letter-spacing:-.015em}
.faq details{border-bottom:1px solid var(--line);max-width:760px}
.faq summary{list-style:none;cursor:pointer;padding:20px 32px 20px 0;font-size:17px;font-weight:500;position:relative;word-break:keep-all}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:'+';position:absolute;right:4px;top:18px;font-size:20px;font-weight:300}
.faq details[open] summary::after{content:'−'}
.faq details p{padding:0 0 22px;color:var(--ink-2);line-height:1.75;word-break:keep-all}
.foot-apply{background:var(--paper-2);padding:clamp(48px,6vw,96px) 0}
.foot-apply h2{font-size:clamp(24px,2.2vw,36px);font-weight:600;letter-spacing:-.02em;word-break:keep-all}
.more{padding:clamp(40px,5vw,72px) 0;border-top:1px solid var(--line)}
.more h2{font-size:13px;font-weight:600;letter-spacing:.06em;color:var(--mute)}
.more ul{list-style:none;margin-top:14px;display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:0 32px}
.more li a{display:block;padding:14px 0;border-bottom:1px solid var(--line);text-decoration:none;font-size:16px;word-break:keep-all}
.more li a:hover{text-decoration:underline}
footer{border-top:1px solid var(--line);padding:28px 0 40px;font-size:13px;color:var(--mute)}
footer .wrap{display:flex;flex-wrap:wrap;gap:8px 24px}
footer a{text-decoration:none}
.list{padding:clamp(40px,6vw,96px) 0}
.list ul{list-style:none;margin-top:36px;border-top:1px solid var(--line)}
.list li a{display:block;padding:24px 0;border-bottom:1px solid var(--line);text-decoration:none}
.list li b{display:block;font-size:clamp(18px,1.5vw,22px);font-weight:600;word-break:keep-all}
.list li span{display:block;margin-top:6px;color:var(--ink-2);font-size:15px;word-break:keep-all}
@media(max-width:860px){
  .hero{grid-template-columns:1fr}
  figure{order:2}
}
@media(max-width:480px){
  .top nav a:not(.cta){display:none}
  .apply{flex-direction:column;border:0;gap:8px}
  .apply input[type=email]{flex:none;height:54px;border:1px solid var(--ink)}
  .apply.bad input[type=email]{border-color:var(--err)}
  .apply button{width:100%}
}`;

const JS = `
(function(){
  var EMAIL=/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
  var q=new URLSearchParams(location.search).get('src');
  document.querySelectorAll('form.apply').forEach(function(form){
    var input=form.querySelector('input[type=email]'),btn=form.querySelector('button'),
        msg=form.parentNode.querySelector('.msg'),label=btn.textContent;
    input.addEventListener('input',function(){form.classList.remove('bad');msg.textContent='';msg.classList.remove('err')});
    form.addEventListener('submit',function(e){
      e.preventDefault();
      var email=input.value.trim();
      if(!EMAIL.test(email)){form.classList.add('bad');msg.classList.add('err');
        msg.textContent=email?'이메일 주소를 다시 확인해주세요.':'이메일 주소를 적어주세요.';input.focus();return}
      btn.disabled=true;btn.textContent='보내는 중…';
      fetch('/api/submit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        type:form.dataset.type,quick:true,contact:email,company:form.querySelector('[name=company]').value,
        source:(q?q+' / ':'')+form.dataset.src,referrer:String(document.referrer||'').slice(0,200)})})
      .then(function(r){if(!r.ok)throw new Error('status '+r.status);
        var d=document.createElement('div');d.className='done';d.textContent=form.dataset.done;form.replaceWith(d);
        var n=d.parentNode.querySelector('.note');if(n)n.remove()})
      .catch(function(err){console.error(err);btn.disabled=false;btn.textContent=label;msg.classList.add('err');
        msg.textContent='전송에 실패했습니다. 잠시 후 다시 시도해주세요.'});
    });
  });
})();`;

const head = ({ title, description, url, image }) => `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index,follow">
<meta property="og:type" content="article">
<meta property="og:site_name" content="Gallery 751">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${image}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${image}">
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css">
<style>${CSS}</style>`;

const topbar = (cta) => `
<header class="top"><div class="wrap">
  <a class="logo" href="/">Gallery 751</a>
  <nav><a href="/guide">작가 안내</a><a href="/">홈</a>${cta ? `<a class="cta" href="#apply-foot">신청</a>` : ''}</nav>
</div></header>`;

const footer = `
<footer><div class="wrap">
  <span>© 2026 Gallery 751</span>
  <a href="mailto:submissions@gallery751.com">submissions@gallery751.com</a>
  <a href="https://www.instagram.com/gallery751__/" target="_blank" rel="noopener">Instagram</a>
  <a href="https://www.threads.com/@gallery751__" target="_blank" rel="noopener">Threads</a>
</div></footer>`;

function page(g) {
  const url = `${SITE}/guide/${g.slug}`;
  const w = workOf(g.work);
  const others = GUIDES.filter((x) => x.slug !== g.slug);
  const ld = [
    {
      '@context': 'https://schema.org', '@type': 'Article',
      headline: g.h1, description: g.description, image: SITE + w.img,
      inLanguage: 'ko-KR', mainEntityOfPage: url, dateModified: today,
      author: { '@type': 'Organization', name: 'Gallery 751', url: SITE },
      publisher: { '@type': 'Organization', name: 'Gallery 751', url: SITE },
    },
    {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Gallery 751', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: '작가 안내', item: SITE + '/guide' },
        { '@type': 'ListItem', position: 3, name: g.h1, item: url },
      ],
    },
    {
      '@context': 'https://schema.org', '@type': 'FAQPage',
      mainEntity: g.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    },
  ];

  return `${head({ title: g.title, description: g.description, url, image: SITE + w.img })}
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
</head>
<body>
${topbar(true)}
<main>
<div class="wrap">
  <section class="hero">
    <div>
      <p class="crumb"><a href="/guide">작가 안내</a></p>
      <h1>${esc(g.h1)}</h1>
      <p class="lead">${esc(g.lead)}</p>
      <dl class="terms">${TERMS.map((t) => `<div><dt>${esc(t.k)}</dt><dd>${esc(t.v)}</dd></div>`).join('')}</dl>
      <div class="box" id="apply">${formHtml(g, 'top')}
      </div>
    </div>
    <figure>
      <img src="${w.img}" alt="${esc(`${w.artistName}, ${w.title}`)}" width="${w.w}" height="${w.h}" fetchpriority="high">
      <figcaption><b>${esc(w.artistName)}</b>${esc(w.title)}${w.year ? ', ' + w.year : ''}<br>${esc([w.medium, w.size].filter(Boolean).join(' · '))}</figcaption>
    </figure>
  </section>
</div>

<article><div class="wrap"><div class="body">
${g.sections.map((s) => `  <section>
    <h2>${esc(s.h)}</h2>
${s.p.map((p) => `    <p>${p}</p>`).join('\n')}
  </section>`).join('\n')}
</div></div></article>

<section class="faq"><div class="wrap">
  <h2>자주 묻는 질문</h2>
  <div style="margin-top:18px">
${g.faq.map((f) => `    <details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('\n')}
  </div>
</div></section>

<section class="foot-apply" id="apply-foot"><div class="wrap">
  <h2>${g.form === 'exhibition' ? '전시 참가 의향을 남겨 주세요' : '이메일만 남겨 주세요'}</h2>
  <div class="box">${formHtml(g, 'foot')}
  </div>
</div></section>

<nav class="more" aria-label="다른 안내"><div class="wrap">
  <h2>다른 안내</h2>
  <ul>${others.map((o) => `<li><a href="/guide/${o.slug}">${esc(o.h1)}</a></li>`).join('')}</ul>
</div></nav>
</main>
${footer}
<script>${JS}</script>
</body>
</html>
`;
}

function indexPage() {
  const url = `${SITE}/guide`;
  const title = '작가 안내 — 그림 판매·전시·가격 | Gallery 751';
  const description = '소속 없이 활동하는 작가를 위한 안내. 그림 판매하는 법, 단체전 참가, 졸업작품, 취미 작가 판매, 그림 가격 정하는 법을 정리했습니다.';
  return `${head({ title, description, url, image: SITE + '/assets/og-751.png' })}
</head>
<body>
${topbar(false)}
<main><div class="wrap list">
  <h1>작가 안내</h1>
  <p class="lead">그림을 처음 팔거나 전시를 처음 준비하는 작가님께 필요한 내용을 정리했습니다.</p>
  <ul>${GUIDES.map((g) => `
    <li><a href="/guide/${g.slug}"><b>${esc(g.h1)}</b><span>${esc(g.description)}</span></a></li>`).join('')}
  </ul>
</div></main>
${footer}
</body>
</html>
`;
}

mkdirSync(join(ROOT, 'guide'), { recursive: true });
for (const g of GUIDES) writeFileSync(join(ROOT, 'guide', `${g.slug}.html`), page(g));
writeFileSync(join(ROOT, 'guide', 'index.html'), indexPage());

const urls = [
  { loc: `${SITE}/`, pri: '1.0' },
  { loc: `${SITE}/guide`, pri: '0.8' },
  ...GUIDES.map((g) => ({ loc: `${SITE}/guide/${g.slug}`, pri: '0.8' })),
];
writeFileSync(join(ROOT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${today}</lastmod><priority>${u.pri}</priority></url>`).join('\n')}
</urlset>
`);
writeFileSync(join(ROOT, 'robots.txt'), `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${SITE}/sitemap.xml
`);

console.log(`guide/ ${GUIDES.length}개 + index, sitemap.xml, robots.txt 생성 완료`);
for (const g of GUIDES) {
  const miss = g.keywords.filter((k) => !strip([g.title, g.h1, g.lead, ...g.sections.flatMap((s) => [s.h, ...s.p]), ...g.faq.flatMap((f) => [f.q, f.a])].join(' ')).replace(/\s/g, '').includes(k.replace(/\s/g, '')));
  if (miss.length) console.log(`  · ${g.slug}: 본문에 그대로 안 나오는 검색어 — ${miss.join(', ')}`);
}
