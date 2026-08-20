// Configured sources for this feed. Each source is a distinct website with
// its own scraper (see server/scraper.ts) — unlike a single site with
// multiple category query params, these are structurally unrelated sites.
export interface SourceConfig {
  slug: "bmcpc" | "catholic";
  label: string;
  url: string;
  baseUrl: string;
  language: string; // RSS <language> code
}

export const SOURCES: SourceConfig[] = [
  {
    slug: "bmcpc",
    label: "華人永遠墳場管理委員會 – 最新消息",
    url: "https://www.bmcpc.org.hk/whats_new/",
    baseUrl: "https://www.bmcpc.org.hk",
    language: "zh-hk",
  },
  {
    slug: "catholic",
    label: "天主教墳場 – 最新消息",
    url: "https://cemeteries.catholic.org.hk/news",
    baseUrl: "https://cemeteries.catholic.org.hk",
    language: "zh-hk",
  },
];
