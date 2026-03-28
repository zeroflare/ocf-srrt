# 06. Runtime View

## DNS Traffic Processing
1. **DNS Proxy** 接收用戶端 DNS 查詢（UDP/TCP :53）。
2. **Forward** 轉發至上游 DNS 解析器，取得回應後**立即回覆**用戶端。
3. **Async Enrichment** 異步進行富化（不阻塞 DNS 回應）：
   a. **GeoIP** 透過 `GetAll()` 一次查詢 Country、City、Subdivision、Coords、ASN/ISP。
   b. **OS Fingerprint** 根據查詢域名模式辨識裝置 OS。
   c. **App Recognition** 三層識別應用程式類型。
   d. **Foreign Probe** 境外 IP 觸發 ICMP Ping 測量延遲。
4. **Buffer** 存入 Per-IP Ring Buffer。
5. **WebSocket** 推送更新至前端。

```mermaid
sequenceDiagram
    participant C as Client Device
    participant D as DNS Proxy (miekg/dns)
    participant U as Upstream DNS
    participant E as Enrichment Pipeline
    participant B as Ring Buffer
    participant W as WebSocket Hub
    participant F as Frontend

    C->>D: DNS Query (UDP/TCP 53)
    D->>U: Forward Query
    U-->>D: DNS Response
    D-->>C: DNS Response (立即回覆)
    D--)E: Async: processAndRecord()
    Note over E: GetAll(Country+City+ASN) → OS → Recognition → Probe
    E->>B: DNSQueryRecord
    B->>W: New Record Event
    W->>F: JSON Push
```

## Token Authentication Flow
用戶端首次 DNS 查詢或請求 `/api/token` 時自動取得 UUID token。

```mermaid
sequenceDiagram
    participant C as Client
    participant D as DNS Proxy
    participant T as Token Store
    participant FE as Frontend
    participant WS as WebSocket

    C->>D: 首次 DNS Query (new IP)
    D->>T: GetOrCreate(clientIP)
    T-->>D: UUID Token

    FE->>FE: GET /api/token
    Note over FE: 取得 token, clientIP, localCountry

    FE->>WS: Connect /ws?token=UUID
    WS->>T: Validate Token → get IP
    WS-->>FE: 歷史快照 + 即時串流
```

## Cross-device Subscribe Flow
當使用者從電腦 Dashboard 監控其他裝置（如手機）的 DNS 流量時，因 Dual-stack 網路環境可能導致電腦（HTTP）與手機（DNS）使用不同 IP 位址（如 IPv6 vs IPv4），WebSocket Hub 的 IP 過濾會不匹配。透過 `subscribe` 機制，前端可動態切換後端的監控目標 IP。

```mermaid
sequenceDiagram
    participant PC as 電腦 (Dashboard)
    participant FE as Frontend
    participant WS as WebSocket Hub
    participant B as Ring Buffer

    Note over PC,FE: 電腦以 IPv6 取得 token，手機 DNS 走 IPv4
    FE->>WS: Connect /ws?token=UUID (clientIP=IPv6)
    WS-->>FE: Snapshot (空，因 IPv6 無 DNS 紀錄)
    PC->>FE: 輸入手機 IPv4，點擊「開始監控」
    FE->>WS: {"type":"subscribe","ip":"手機IPv4"}
    WS->>WS: 更新 client.clientIP = 手機IPv4
    WS->>B: buffer.Get(手機IPv4)
    WS-->>FE: Snapshot (手機的歷史 DNS 紀錄)
    Note over WS,FE: 後續 broadcast 也會比對新 IP，即時推送手機的 DNS 流量
```

## MTR Path Tracing
使用者在 LiveTable 點擊 IP 後觸發 MTR 路徑追蹤，後端執行 `mtr --report --json` 並回傳結果。

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant FE as Frontend
    participant API as Backend API
    participant RL as Rate Limiter
    participant Cache as Traceroute Cache
    participant MTR as mtr Process
    participant GEO as GeoIP DB

    U->>FE: 點擊 IP 觸發 Traceroute
    FE->>API: GET /api/traceroute?target=x.x.x.x
    API->>Cache: 檢查快取
    alt 快取命中
        Cache-->>API: Cached TraceResult
        API-->>FE: TraceResult (cached=true)
    else 快取未命中
        API->>RL: 檢查速率限制 + Semaphore
        RL-->>API: OK (max 5 concurrent)
        API->>MTR: exec mtr --report --json --report-cycles 1 --max-ttl 30
        Note over MTR: 支援 TCP (--tcp --port) / ICMP 模式
        MTR-->>API: JSON stdout (hubs[])
        loop 每個 Hub
            API->>GEO: GetAll(Country, City, Coords, ASN)
            GEO-->>API: 地理資訊（含城市級精度）
        end
        Note over API: Stage 1: 延遲啟發式 CDN 修正
        Note over API: Stage 2: rDNS PoP IATA 解析
        Note over API: Stage 3: ccTLD 輔助修正
        API->>Cache: 快取結果 (TTL 5min)
        API-->>FE: TraceResult JSON
    end
    FE->>U: 渲染 HopTable + TraceMap
```

## Shared Report Flow
使用者可透過壓縮 URL 分享 DNS 記錄與追蹤結果。

```mermaid
sequenceDiagram
    participant A as User A (分享者)
    participant FE_A as Frontend A
    participant FE_B as Frontend B
    participant B as User B (接收者)

    A->>FE_A: 點擊分享
    FE_A->>FE_A: pako.deflate(records + traceResult)
    FE_A->>FE_A: URL-safe Base64 encode
    FE_A-->>A: 複製 URL (?zdata=...)

    A->>B: 傳送 URL
    B->>FE_B: 開啟 URL
    FE_B->>FE_B: useSharedReport: 解壓 zdata
    FE_B->>FE_B: 載入 DNS records + traceResult
    FE_B-->>B: 顯示共享報告（唯讀模式）
```
