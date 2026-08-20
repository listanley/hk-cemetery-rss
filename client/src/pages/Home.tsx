import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, AlertTriangle, XCircle, Copy, Check, RefreshCcw, ExternalLink, Rss, Sun, Moon } from "lucide-react";

interface ScrapeStatusRow {
  source: string;
  label: string;
  sourceUrl: string;
  lastRunAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastItemCount: number;
  newItemsLastRun: number;
  structuralAlert: number;
}

interface StatusResponse {
  sources: ScrapeStatusRow[];
  lastFullRefreshAt: number;
  refreshing: boolean;
  refreshIntervalMs: number;
}

interface ArticleRow {
  articleId: string;
  source: string;
  title: string;
  link: string;
  pubDate: number;
  description: string;
  categories: string;
  firstSeenAt: number;
}

const SOURCE_LABELS: Record<string, string> = {
  bmcpc: "華永會",
  catholic: "天主教墳場",
};

function formatTime(ms: number | null): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong", dateStyle: "medium", timeStyle: "short" });
}

function CopyableUrl({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 font-mono text-xs sm:text-sm overflow-hidden">
      <Rss className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <span className="truncate flex-1 min-w-0" title={url}>{url}</span>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 shrink-0"
        aria-label="複製 Feed 網址"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // clipboard may be unavailable in sandboxed preview; ignore
          }
        }}
      >
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

function StatusCard({ status }: { status: ScrapeStatusRow }) {
  const feedUrl = `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}/feed/${status.source}.xml`;
  const healthy = status.consecutiveFailures === 0 && !status.structuralAlert;
  const icon = status.structuralAlert ? (
    <AlertTriangle className="h-5 w-5 text-warning" aria-hidden="true" style={{ color: "hsl(var(--destructive))" }} />
  ) : status.consecutiveFailures > 0 ? (
    <XCircle className="h-5 w-5" style={{ color: "hsl(var(--destructive))" }} aria-hidden="true" />
  ) : (
    <CheckCircle2 className="h-5 w-5 text-primary" aria-hidden="true" />
  );

  return (
    <Card data-testid={`card-status-${status.source}`} className="min-w-0">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <CardTitle className="text-base flex items-center gap-2">
            {icon}
            <span className="truncate">{status.label}</span>
          </CardTitle>
          <a
            href={status.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 mt-1"
          >
            原始網頁 <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        <Badge variant={healthy ? "secondary" : "destructive"} className="shrink-0">
          {status.structuralAlert ? "版面可能已變更" : status.consecutiveFailures > 0 ? `連續失敗 ${status.consecutiveFailures} 次` : "正常"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="min-w-0">
            <div className="text-muted-foreground text-xs">最後更新</div>
            <div className="truncate">{formatTime(status.lastSuccessAt)}</div>
          </div>
          <div className="min-w-0">
            <div className="text-muted-foreground text-xs">最後檢查</div>
            <div className="truncate">{formatTime(status.lastRunAt)}</div>
          </div>
          <div className="min-w-0">
            <div className="text-muted-foreground text-xs">目前項目數</div>
            <div>{status.lastItemCount}</div>
          </div>
          <div className="min-w-0">
            <div className="text-muted-foreground text-xs">上次新增</div>
            <div>{status.newItemsLastRun}</div>
          </div>
        </div>
        {status.lastError && (
          <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 break-words">
            最近錯誤：{status.lastError}
          </div>
        )}
        <CopyableUrl url={feedUrl} />
      </CardContent>
    </Card>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(prefersDark);
    document.documentElement.classList.toggle("dark", prefersDark);
  }, []);

  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={dark ? "切換至亮色模式" : "切換至暗色模式"}
      onClick={() => {
        const next = !dark;
        setDark(next);
        document.documentElement.classList.toggle("dark", next);
      }}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}

export default function Home() {
  const [filter, setFilter] = useState<string>("all");

  const statusQuery = useQuery<StatusResponse>({
    queryKey: ["/api/status"],
    refetchInterval: 30000,
  });

  const articlesQuery = useQuery<ArticleRow[]>({
    queryKey: ["/api/articles", filter],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "30" });
      if (filter !== "all") params.set("source", filter);
      const res = await fetch(`${API_BASE}/api/articles?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load articles");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const allFeedUrl = `${window.location.origin}${window.location.pathname.replace(/\/$/, "")}/feed/all.xml`;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12 space-y-8">
        <header className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2" style={{ fontFamily: "var(--font-serif)" }}>
              <Rss className="h-6 w-6 text-primary" aria-hidden="true" />
              墳場消息 RSS Feed
            </h1>
            <p className="text-sm text-muted-foreground max-w-2xl">
              自動監察華人永遠墳場管理委員會及天主教墳場網站的最新消息，每 6 小時更新一次，並提供標準 RSS 2.0 feed 供 n8n / Telegram / RSS 閱讀器訂閱。
            </p>
          </div>
          <ThemeToggle />
        </header>

        <section className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">合併 Feed（兩個來源）</h2>
          <CopyableUrl url={allFeedUrl} />
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-medium text-muted-foreground">來源狀態</h2>
          {statusQuery.isLoading && (
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((i) => (
                <Card key={i} className="min-w-0"><CardContent className="p-6 h-32 animate-pulse bg-muted/40 rounded-md" /></Card>
              ))}
            </div>
          )}
          {statusQuery.isError && (
            <div className="text-sm text-muted-foreground">無法載入狀態資料，請稍後重試。</div>
          )}
          {statusQuery.data && (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              {statusQuery.data.sources.map((s) => (
                <StatusCard key={s.source} status={s} />
              ))}
            </div>
          )}
          {statusQuery.data && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <RefreshCcw className={`h-3 w-3 ${statusQuery.data.refreshing ? "animate-spin" : ""}`} />
              更新間隔：每 {Math.round(statusQuery.data.refreshIntervalMs / 3600000)} 小時
              {statusQuery.data.refreshing ? "（正在檢查中…）" : ""}
            </p>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-medium text-muted-foreground">最新消息</h2>
            <Tabs value={filter} onValueChange={setFilter}>
              <TabsList>
                <TabsTrigger value="all" data-testid="tab-all">全部</TabsTrigger>
                <TabsTrigger value="bmcpc" data-testid="tab-bmcpc">華永會</TabsTrigger>
                <TabsTrigger value="catholic" data-testid="tab-catholic">天主教墳場</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {articlesQuery.isLoading && (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-16 animate-pulse bg-muted/40 rounded-md" />
              ))}
            </div>
          )}
          {articlesQuery.isError && (
            <div className="text-sm text-muted-foreground">無法載入最新消息，請稍後重試。</div>
          )}
          {articlesQuery.data && articlesQuery.data.length === 0 && (
            <div className="text-sm text-muted-foreground border border-dashed border-border rounded-md p-6 text-center">
              暫無資料，等待下一次更新。
            </div>
          )}
          {articlesQuery.data && articlesQuery.data.length > 0 && (
            <ul className="divide-y divide-border rounded-md border border-border overflow-hidden" role="list">
              {articlesQuery.data.map((a) => {
                const cats: string[] = JSON.parse(a.categories || "[]");
                return (
                  <li key={a.articleId} className="p-4 bg-card hover:bg-muted/40 transition-colors">
                    <a
                      href={a.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-sm sm:text-base hover:text-primary block"
                    >
                      {a.title}
                    </a>
                    {a.description && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">{SOURCE_LABELS[a.source] || a.source}</Badge>
                      {cats.map((c) => (
                        <Badge key={c} variant="secondary" className="text-xs">{c}</Badge>
                      ))}
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(a.pubDate).toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" })}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
