# 05. Building Block View

## Level 1: White Box Overall System
- **Backend (Go)**: 負責 DNS 代理、查詢轉發、回應富化（GeoIP/ASN/應用識別/OS 指紋/境外偵測）、WebSocket 即時推送及 REST API。
- **Frontend (React)**: 負責接收資料、狀態管理及視覺化展示，含報告產生與分享功能。
- **Nginx**: 反向代理，提供 HTTPS、靜態檔案服務、WebSocket 代理。

```mermaid
graph TB
    subgraph Backend ["Backend (Go :53 + :8080)"]
        DNSProxy["DNS Proxy<br/>miekg/dns :53"]
        Pipeline["Enrichment Pipeline<br/>GeoIP → Recognize → OS → Probe"]
        Buffer["Ring Buffer<br/>In-Memory"]
        Cache["Cache Layer<br/>DNS / Probe / Traceroute"]
        Auth["Token Store<br/>UUID ↔ IP"]
        MTRE["MTR Engine<br/>/api/traceroute"]
        RateLimit["Rate Limiter<br/>+ Semaphore"]
        CORS["CORS Middleware"]
        WSHub["WebSocket Hub"]
        Health["Health Check<br/>/health"]
    end

    subgraph Frontend ["Frontend (React SPA)"]
        DnsStore["useDnsStore"]
        TraceStore["useTracerouteStore"]
        UI["Dashboard / CyberMap / LiveTable"]
        Trace["TraceroutePage / TraceMap / HopTable"]
        Report["ReportPage / ReportModal"]
    end

    subgraph Nginx ["Nginx (:80/:443)"]
        Proxy["反向代理 + SSL"]
    end

    DNSProxy --> Pipeline
    Pipeline --> Buffer
    Pipeline --> Cache
    Buffer --> WSHub
    Auth --> DNSProxy
    Auth --> WSHub
    RateLimit --> MTRE
    CORS --> WSHub
    CORS --> MTRE
    WSHub -->|"WS 即時推送"| Proxy
    MTRE -->|"HTTP JSON"| Proxy
    Health -->|"HTTP"| Proxy
    Proxy --> DnsStore
    Proxy --> TraceStore
    DnsStore --> UI
    TraceStore --> Trace
    DnsStore --> Report
```

## Level 2: Backend Internals

### Packages (`backend/internal/`)

| Package | 職責 |
|---------|------|
| `dns/` | DNS 代理伺服器（UDP/TCP :53），查詢轉發、回應快取、異步富化管線 |
| `api/` | HTTP 路由（REST + WebSocket）、CORS 中間件、Traceroute handler。WebSocket Hub 支援 `readPump`/`writePump` 雙向通訊，前端可透過 `subscribe` 訊息動態切換監控 IP |
| `auth/` | Token Store（UUID ↔ IP 雙向映射），自動產生 token |
| `buffer/` | Per-IP Ring Buffer（5000 筆/session、2000 session 上限、10min 閒置清除） |
| `geoip/` | IP→位置 + ASN 對應。位置查詢以 **RIPE IPmap** 為主（`ripe.go` HTTP client），MaxMind City/Country 為可選 fallback（預設關），ASN/ISP 由 MaxMind ASN DB 提供。`resolver.go` 統籌查詢流程 + TTL cache（成功 24h / 失敗 1m）|
| `recognition/` | 三層應用識別（Exact → Regex → Heuristic） |
| `osfingerprint/` | DNS 查詢模式 OS 辨識（Android/iOS/Windows） |
| `traceroute/` | MTR 執行與解析、rDNS PoP 解析、TLD 輔助、結果快取、IPv6→IPv4 自動轉換 |
| `ratelimit/` | Per-token 速率限制 + 全域 Semaphore 併發控制 |
| `types/` | 共用 `DNSQueryRecord` struct（含 City、Subdivision 欄位） |

### DNS 富化管線

```mermaid
graph LR
    Client["Client DNS<br/>UDP/TCP :53"]
    Client --> DNSProxy["DNS Proxy<br/>miekg/dns"]
    DNSProxy -->|"轉發"| Upstream["Upstream DNS"]
    Upstream -->|"回應"| DNSProxy
    DNSProxy -->|"立即回覆"| Client
    DNSProxy -->|"異步"| GeoIP["GetAll()<br/>RIPE IPmap → MaxMind ASN"]
    GeoIP --> OS["OS Fingerprint"]
    OS --> Recog["App Recognition<br/>Exact → Regex → Heuristic"]
    Recog --> Probe["Foreign IP Probe<br/>ICMP Ping"]
    Probe --> Buffer["Ring Buffer<br/>per-IP, max 5000"]
    Buffer --> WS["WebSocket<br/>Broadcast"]
```

### HTTP API 端點

| Endpoint | Method | Auth | 用途 |
|----------|--------|------|------|
| `/ws` | WebSocket | Token (query param) | 即時 DNS 記錄串流，連線時發送歷史快照。支援 `subscribe` 訊息動態切換監控目標 IP（跨裝置監控） |
| `/api/token` | GET | None | 取得/建立 session token，回傳 token、client IP、localCountry、dnsPublicIP |
| `/api/traceroute` | GET | Token (Bearer / query) | 執行 MTR，含快取檢查 + 速率限制 + 併發控制 |
| `/health` | GET | None | 健康檢查（status、uptime、session count、client count） |

## Level 3: Frontend Components

### Pages（Lazy-loaded）
- **Main Dashboard**（`/`）: 預設頁面，左右分割面板（CyberMap + 右側面板）。
- **TraceroutePage**（`/traceroute`）: 獨立全頁路徑檢視器，大螢幕 `grid-cols-[2fr_3fr]`（左地圖右表格），手機版垂直堆疊。支援 URL 分享（`?zdata=` 壓縮編碼）與直接執行（`?target=&token=`）。
- **ReportPage**（`/report`）: 獨立報告檢視頁面。

### Zustand Stores
- **useDnsStore**: DNS 記錄狀態、監控 IP、主題切換、token 管理、批次緩衝（500ms throttle）、壓縮匯出。
- **useTracerouteStore**: 追蹤結果、歷史紀錄（sessionStorage, max 20）、載入狀態、Mock 資料。

### UI Components
- **CyberMap**: 基於 MapLibre GL 的世界地圖，整合 DNS 查詢點（外國紅/本地綠）與 Traceroute 路徑視覺化（**只渲染起點→終點兩節點 + 一條連線**，與 TraceMap 一致；見 `doc/09`）。Hover Popup 顯示 IP、城市、ISP、延遲。
- **LiveTable**: 即時 DNS 查詢列表。ISP/Cloud Provider badge（AWS、GCP、Azure、Cloudflare、Akamai 等），點擊 Domain 或 Result IP 觸發 MTR 追蹤（IPv6 地址自動改用 Domain 發起）。Country 欄附加城市名（如 `TW · Taipei`）。
- **LiveTrafficChart**: 基於 Recharts 的即時流量圖表。
- **TrafficDashboard**: 流量統計儀表板（指標與圖表）。
- **TracerouteDrawer**: 側邊抽屜，嵌入 `HopTable`（緊湊模式）顯示 MTR 結果，含歷史紀錄與分享功能。
- **HopTable**: 共用跳點表格元件（`TraceroutePage` 與 `TracerouteDrawer` 共用）。欄位：# / IP / ASN·ISP / Country·City / Loss% / Avg（含進度條）/ Best / Worst / StDev。支援 `compact` 模式。
- **TraceMap**: 基於 MapLibre GL 的路徑地圖（僅 `TraceroutePage`）。**地圖只顯示「起點→終點」兩節點 + 一條連線**（中間 hop 因 CDN/anycast 地理失真不在地圖上呈現，完整 hop 資訊仍由 `HopTable` 顯示，見 `doc/09`）。圓形標記依延遲漸變色（綠→黃→紅），Popup 顯示 IP/Country·City/ASN·ISP/延遲，支援自動 fitBounds 與流向動畫。
- **DnsSetupBanner**: DNS 設定說明，動態讀取 `window.location.hostname`，含一鍵複製。
- **ReportModal**: 報告產生表單（app metadata、URL、logo），統計國內外流量佔比。
- **ReportView**: 報告檢視 Overlay，含編輯/關閉操作。
- **AboutModal**: 應用程式資訊與致謝。
- **AppInfoTooltip**: 應用程式詳細資訊 Tooltip。
- **Tooltip**: 通用 Tooltip 元件。
- **ErrorBoundary**: 錯誤邊界元件。

### Hooks
- **useDnsStream**: WebSocket 連線管理，含 token 取得、自動重連（指數退避）、本地國家快取（7 天 TTL）。提供 `sendSubscribe(ip)` 方法，當使用者開始監控時通知後端切換目標 IP。
- **useMockDnsStream**: Mock 模式 DNS 串流（`VITE_USE_MOCK=true`）。
- **useSharedReport**: 解壓 URL `?zdata=` 參數，載入共享的 DNS 記錄與追蹤結果。
- **useTour**: react-joyride 引導式導覽管理。

### Utilities (`frontend/src/utils/`)
- **geo.ts**: 地理計算（Haversine 距離、曲線生成、同座標跳點散開 `spreadOverlappingHops`、`pickPathEndpoints`）。
- **cableInference.ts**: 海纜推測 utility（畫面已移除，仍保留供未來 traceroute 整合使用）。
- **cloudProvider.ts**: ISP/ASN 字串 pattern matching 偵測雲端供應商。
- **appInfo.ts**: 應用程式詳細資訊查詢。
- **reportShare.ts**: 報告 URL 壓縮分享工具。
- **tracerouteShare.ts**: Traceroute 結果 URL 壓縮分享工具。
- **logger.ts**: 前端日誌工具。
