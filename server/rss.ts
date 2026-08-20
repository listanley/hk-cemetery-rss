// Generic RSS 2.0 XML builder — reusable as-is across sources.
// Only things you'll typically need to change per-project:
//   - <language> in buildRssFeed below (set to the source's locale, e.g. "en-us", "zh-hk")
//   - whether you want a <category> tag per item (leave categoryLabel undefined to omit)
import type { Article } from "@shared/schema";

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function toRfc822(ms: number): string {
  return new Date(ms).toUTCString(); // RFC 1123 / valid RSS2 pubDate format
}

export interface ChannelMeta {
  title: string;
  link: string;
  description: string;
  selfUrl: string;
  language?: string; // e.g. "en-us", "zh-hk" — defaults to "en-us"
  ttlMinutes?: number; // suggested reader poll interval — defaults to 15
}

export function buildRssFeed(channel: ChannelMeta, items: (Article & { categoryLabel?: string })[]): string {
  const lastBuildDate = toRfc822(Date.now());

  const itemsXml = items
    .map((item) => {
      const categoryTag = item.categoryLabel
        ? `<category>${escapeXml(item.categoryLabel)}</category>`
        : "";
      return `    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="true">${escapeXml(item.link)}</guid>
      <pubDate>${toRfc822(item.pubDate)}</pubDate>
      ${categoryTag}
      <description>${escapeXml(item.description || item.title)}</description>
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <atom:link href="${escapeXml(channel.selfUrl)}" rel="self" type="application/rss+xml" />
    <description>${escapeXml(channel.description)}</description>
    <language>${escapeXml(channel.language || "en-us")}</language>
    <ttl>${channel.ttlMinutes ?? 15}</ttl>
    <lastBuildDate>${lastBuildDate}</lastBuildDate>
${itemsXml}
  </channel>
</rss>
`;
}
