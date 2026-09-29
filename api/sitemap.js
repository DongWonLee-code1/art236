/**
 * /sitemap.xml — 사이트 첫 화면과 공개된 저널 글 목록
 * 검색엔진(구글 서치 콘솔, 네이버 서치어드바이저)에 이 주소를 등록합니다.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const SITE = 'https://www.gallery751.com';

export default async function handler(req, res) {
  try {
    const raw = await readFile(path.join(process.cwd(), 'journal.json'), 'utf8');
    const now = new Date();
    const posts = JSON.parse(raw)
      .filter(p => p && p.id && p.title && (!p.date || new Date(p.date) <= now))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const url = (loc, lastmod) => `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString()}</lastmod>` : ''}</url>`;
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
      url(`${SITE}/`),
      url(`${SITE}/journal`, posts[0]?.date),
      ...posts.map(p => url(`${SITE}/journal/${encodeURIComponent(p.id)}`, p.date)),
      '</urlset>',
    ].join('\n');
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    res.status(200).send(xml);
  } catch (e) {
    console.error('sitemap', e);
    res.status(500).send('');
  }
}
