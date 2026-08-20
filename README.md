# 墳場消息 RSS Feed

Published app: https://hk-cemetery-rss.pplx.app
site_id: e7acbd94-89b5-46a2-816b-d7e517952d49

Scrapes and syndicates news from:
- https://www.bmcpc.org.hk/whats_new/ (華人永遠墳場管理委員會)
- https://cemeteries.catholic.org.hk/news (天主教墳場)

Refreshes every 6 hours. See SKILL rss-feed-builder for architecture notes.

## Feed URLs (published)
- https://hk-cemetery-rss.pplx.app/port/5000/feed/all.xml (combined, recommended for n8n)
- https://hk-cemetery-rss.pplx.app/port/5000/feed/bmcpc.xml
- https://hk-cemetery-rss.pplx.app/port/5000/feed/catholic.xml
- https://hk-cemetery-rss.pplx.app/port/5000/api/status (health JSON)
- https://hk-cemetery-rss.pplx.app/port/5000/api/articles (JSON article list)

## Local dev
npm install
npm run dev   # serves on port 5000

## Publish update
deploy_website(project_path=".../dist/public", ...) then
publish_website(..., site_id="e7acbd94-89b5-46a2-816b-d7e517952d49",
  run_command="PUBLIC_BASE_URL=https://hk-cemetery-rss.pplx.app/port/5000 NODE_ENV=production node dist/index.cjs")
