# RIPE IPmap 整合設計文件

> **狀態**：Draft，待 review 後進入實作。
> **作者**：Aaron Chuang
> **最後更新**：2026-05-06

---

## 1. 背景與目標

### 1.1 現況

目前 `backend/internal/geoip/geoip.go` 完全依賴 MaxMind GeoLite2（`GeoLite2-City.mmdb` + `GeoLite2-ASN.mmdb`）做 IP → 國家 / 城市 / 座標 / ASN 的對應。
被三處呼叫：

- `cmd/main.go` — 本機 client IP 國家
- `dns/server.go` — DNS 回應 IP enrichment
- `traceroute/traceroute.go` — 每個 hop 的地理座標（已加上 rDNS PoP / ccTLD / 國家中心三層 fallback）

### 1.2 問題

MaxMind 對「基礎建設 IP」（核心路由器、IXP、跨國 PoP）的精度偏弱，常見：

- Hop 被定位到 ISP 註冊地址（通常是總部，不是實際 router 位置）
- 同一 ASN 大量 hop 被歸到同一座標
- 跨國長距離中繼 hop 會錯落

### 1.3 目標

目標：改用 **RIPE IPmap**（https://ipmap.ripe.net/）作為主要 IP 對應來源。RIPE IPmap 利用 RIPE Atlas probe 主動量測 + crowdsourced PTR 解析，對基礎建設 IP 精度遠優於商業 GeoIP DB。

### 1.4 採用策略（2026-05 修訂）

最初規劃為「純 RIPE」觀察期，實測後反映 RIPE 對住家寬頻 IP 覆蓋率不足、active engines 第一次查詢常處 `queued` 導致位置欄空白變多。決策改為 **MaxMind 為主、RIPE 保留為可切換來源**。

| 項目 | 決策 |
|---|---|
| 取代 / 並用 | **MaxMind 為主，RIPE IPmap 為可切換來源**（`GEOIP_PROVIDER=maxmind\|ripe`，預設 `maxmind`）|
| 套用範圍 | **統一**：DNS 回應 IP + traceroute hops 都套 |
| 網路依賴 | 接受。需 in-memory cache + timeout |
| MaxMind City/Country | **預設啟用**（`MAXMIND_LOCATION_ENABLED=true`），作為 primary 或 RIPE primary 時的 fallback |
| RIPE IPmap | **預設可用**（`RIPE_IPMAP_ENABLED=true`）但非 primary；切到 RIPE 只需改 `GEOIP_PROVIDER=ripe`，無需重新部署 |
| Fallback 行為 | 主來源失敗（網路錯誤 / 無資料 / DB 缺失）且另一邊 enabled 時，自動 fallback |
| MaxMind ASN | **維持啟用**：RIPE IPmap 不提供 ASN/ISP，與位置查詢正交 |
| Source 來源標示 | 不在 UI 顯示 |

---

## 2. RIPE IPmap API 規格

> ⚠️ 以下資訊整理自 RIPE 公開文件搜尋結果（`https://ipmap.ripe.net/docs/02.api-reference/`、`https://labs.ripe.net/`）。**實作前需以實際 API 回應驗證 JSON 欄位名稱與型別**。

### 2.1 API 概覽

RIPE IPmap API 分三大區：

| API | 用途 | 我們會用嗎 |
|---|---|---|
| **Locate API** | IP → 地理位置查詢，主要 endpoint | ✅ 主要使用 |
| Worlds API | 提供結構化的地理層級（city/country）|  暫不用 |
| Crowdsource API | 上傳 / 查詢外部貢獻的地理資料 |  不用 |

### 2.2 主要 Endpoint

> API host 為 `ipmap-api.ripe.net`（2026-05 起 RIPE 將 API 從 `ipmap.ripe.net/api/v1/...` 搬到此處，舊 URL 仍以 302 redirect 暫時可用）。

| Endpoint | 功能 | 適用場景 |
|---|---|---|
| `GET /v1/locate/{ip}/best` | 回傳該 IP 信心分數最高的單一位置 | **我們的主要用法** |
| `GET /v1/locate/{ip}` | 回傳所有 engine 對該 IP 的可能位置陣列 | Debug / 分析 |
| `GET /v1/locate/all?resources={ip1},{ip2},...` | Batch 查詢多個 IP 的 best location | 後續優化批次查詢 |
| `GET /v1/locate/{ip}?engine={name}` | 指定 engine 查詢 | 特殊 case |

**Geolocation engines**（IPmap 內部會平行跑、各自打分）：
`single-radius`（RIPE Atlas 主動量測）、`simple-anycast`（anycast 偵測）、`ixp`（PeeringDB IXP/datacenter 對應）、`reverse-dns`（PTR 命名規則）、`latency`（光速延遲反推）。

### 2.3 Response Schema（已從官方範例確認）

```jsonc
{
  "location": {
    "id": "AMSTERDAM-NL-07-U173ZQ2SF4C47GPE4JPJ",
    "type": "city",                          // "city" 或 "country"
    "cityName": "Amsterdam",
    "cityNameAscii": "Amsterdam",
    "iataCode": "AMS",
    "geonameId": 2759794,
    "latitude": 52.37403,
    "longitude": 4.88969,
    "stateName": "Noord-Holland",
    "stateIsoCode": "NL-NH",
    "stateAnsiCode": "07",
    "countryName": "Netherlands",
    "countryCodeAlpha2": "NL",
    "countryCodeAlpha3": "NLD",
    "cityPopulation": 741636,
    "pointGeometry": "0101000020E61000001E5036E50A8F134087DC0C37E02F4A40", // WKB
    "geofeed": "193.0.20.1,NL,NL-NH,Amsterdam,",                          // RFC 8805
    "contributions": {
      "worlds":       { "score": 2, "populationScore": 2 },
      "crowdsourced": { "score": 5, "userId": "0",
                        "submitted": "2019-03-07T13:45:15.417Z" }
    },
    "score": 14
  },
  "alternatives": [
    { "id": "UTRECHT-NL-09-U178KDCGH6S09CKUYC6H", "score": 12 }
  ],
  "metadata": {
    "service": {
      "contributions": {
        "193.0.20.1": {
          "engines": [
            { "engine": "crowdsourced",   "type": "passive", "empty": false,
              "scoreFactor": 2, "metadata": {} },
            { "engine": "simple-anycast", "type": "active",  "empty": true,
              "scoreFactor": 4,
              "metadata": { "anycast": null, "locating": "193.0.20.1" } },
            { "engine": "single-radius",  "type": "active",  "empty": true,
              "scoreFactor": 4,
              "metadata": { "status": "queued",
                            "message": "Your measurement will be scheduled soon",
                            "locating": true } }
            // ... ixp / latency / reverse-dns / worlds
          ]
        }
      }
    },
    "request": { "params": { "ip": "193.0.20.1" }, "query": {} }
  }
}
```

**關鍵特性（影響實作）**：

1. **`score` 是整數累加值，不是 0~1 機率**。算法是 `Σ (contributions[engine].score × engines[engine].scoreFactor)`。範例 14 = `worlds(2×2) + crowdsourced(5×2)`。
2. **`location` 可能整個是 `null`**（IP 完全沒資料時），這才是「無結果」的正確判斷依據。
3. **Active engines（`single-radius`、`simple-anycast`）會 lazy 觸發**：第一次查到的常是 `status: queued`，過幾分鐘後再查才會有結果。對 cache 策略：失敗 / 低分結果不要 cache 太久。
4. **`iataCode` / `geonameId` 直接給** — 既有 `traceroute/rdns.go` 中那張 80+ 筆手刻 IATA 表，有機會大幅縮減（後續優化）。
5. **`alternatives` 提供次優位置** — 可用於：當 best 與 alternatives 分數差距小時，標記為「位置不確定」。
6. **`pointGeometry` 是 WKB hex**（PostGIS-style），我們不需要解析，因為 lat/lon 已分開提供。

### 2.3.1 我們會擷取的欄位

```go
type RipeResponse struct {
    Location *struct {
        Type              string  `json:"type"`              // "city" | "country"
        CityName          string  `json:"cityName"`
        CountryCodeAlpha2 string  `json:"countryCodeAlpha2"`
        CountryName       string  `json:"countryName"`
        StateName         string  `json:"stateName"`
        IataCode          string  `json:"iataCode"`
        Latitude          float64 `json:"latitude"`
        Longitude         float64 `json:"longitude"`
        Score             int     `json:"score"`
    } `json:"location"`
    Alternatives []struct {
        ID    string `json:"id"`
        Score int    `json:"score"`
    } `json:"alternatives"`
}
```

其餘欄位（`pointGeometry`、`geofeed`、`metadata.*`）暫時忽略，後續若需要 debug 才考慮存。

### 2.4 認證與額度

- **公開 API，免註冊、免 token**（依官方文件描述為 open for public use）
- **未公開明確 rate limit 數字** — 需依「合理使用」原則：
  - 加 in-memory cache + 大量重複 IP 收斂
  - 每個 IP 加 jitter 避免突發
  - 過載時 fail-open 走 fallback，不 retry storm

### 2.5 IPv6 支援

RIPE IPmap 支援 IPv6（地址直接帶入 path）。需驗證 URL encoding。

### 2.6 Failure Modes

我們需要處理以下失敗：

| 狀況 | 處理 |
|---|---|
| HTTP 4xx（IP 無資料 / 私有 IP）| 回 `not_found`，走 MaxMind fallback |
| HTTP 5xx | 走 MaxMind fallback，標記 source = `ripe-degraded` |
| Timeout（>800ms）| 走 MaxMind fallback |
| Network unreachable | 走 MaxMind fallback，後台跑 health check |
| Score 過低（< 0.3 推測值）| 走 MaxMind fallback（避免 RIPE 給出沒把握的位置反而比 MaxMind 更糟）|

---

## 3. 整合架構

### 3.1 套件結構

```
backend/internal/geoip/
├── geoip.go              # 既有：MaxMind 查詢（保留不動，改名為 internal func）
├── ripe.go               # 新增：RIPE IPmap client
├── ripe_test.go          # 新增：測試（含 mock HTTP server）
├── cache.go              # 新增：thread-safe TTL cache（或復用 traceroute/cache.go）
└── resolver.go           # 新增：對外統一介面（RIPE → MaxMind fallback 邏輯）
```

對外 API 不變：呼叫端依然只用 `geoip.GetAll(ip)`、`geoip.GetCountry(ip)` 等，內部變成 RIPE 優先。

### 3.2 查詢流程

```
caller → resolver.GetAll(ip)
              │
              ├─► 私有 / loopback / bogon → 跳過外部查詢，僅補 ASN
              │
              ├─► cache.Get(ip)?  ──hit──► return (cached)
              │
              ├─► providerOrder() = (primary, secondary)
              │       primary = cfg.Provider (預設 maxmind)
              │       secondary = 另一邊
              │
              ├─► tryProvider(primary)
              │       ├── MaxMind: applyMaxMindLocation()
              │       │     ├── DB nil 或 country 空 → false（讓 secondary 接手）
              │       │     └── 成功 → located=true
              │       └── RIPE   : ripeClient.LocateBest()
              │             ├── location 有值 → located=true
              │             ├── location=null / 404 / 5xx / timeout → false
              │             └── 800ms timeout 視為失敗
              │
              ├─► if !located → tryProvider(secondary)  // 自動 fallback
              │
              ├─► 補 MaxMind ASN/ISP（與位置正交）
              ├─► applyDefaults：country 預設 "XX"、ISP 預設 "Unknown"
              └─► cache：located ? 24h : 1m + return
```

**關鍵設計點**：

- Provider 切換不需重新部署：改 `GEOIP_PROVIDER` 即可，主來源 / fallback 角色對調
- 失敗結果只 cache 1 分鐘，因應 RIPE active engines lazy 觸發
- ASN/ISP 路徑與位置查詢解耦，永遠由 MaxMind ASN DB 補上
- Primary 來源未啟用時靜默 fallback；兩來源皆未啟用時回 `country="XX"`

### 3.3 GeoResult 擴充

`types.GeoResult` 維持精簡，**不**加 `Source` / `Confidence`（決定不顯示來源 badge），但內部仍保留 `GeoConfidence` 字串給 traceroute hop 用：

```go
type GeoResult struct {
    Country     string
    City        string
    Subdivision string
    Coords      []float64
    ASN         uint
    ISP         string
    // 既有：traceroute hop 已使用 "high" / "low" / "none" 字串
}
```

`Hop.GeoConfidence` 的設定規則改為：

| 情境 | GeoConfidence |
|---|---|
| RIPE `location` 非 null 且 `score > alternatives[0].score × 1.2` | `high` |
| RIPE `location` 非 null 但與 alternatives 接近 | `medium` |
| MaxMind fallback | `low`（如果 fallback 啟用）|
| 全失敗 / 私有 IP | `none` |

### 3.4 ASN/ISP 處理

RIPE IPmap 不提供 ASN/ISP，這部分**永遠**走 MaxMind ASN DB：

- `geoip.ResolveASN(ip)` 在所有路徑中都會呼叫，與 RIPE 查詢結果獨立
- 即使 `MAXMIND_LOCATION_ENABLED=false`，ASN DB 仍然載入（不影響）
- 若 MaxMind ASN DB 也找不到，回 `Unknown`（沿用現有行為）

---

## 4. Cache 策略

### 4.1 為什麼一定要 cache

- DNS 流量場景：同一個 resolver IP / CDN edge IP 會在數秒內被查上百次
- Traceroute 場景：同一條路徑上的 hop 在多次查詢間高度重複
- RIPE 沒公布明確 rate limit，必須降低出口 QPS

### 4.2 Cache 設計

| 屬性 | 值 | 理由 |
|---|---|---|
| 結構 | In-memory `sync.Map` 或 `patrickmn/go-cache`（後者已在 go.sum）| 簡單、無外部依賴 |
| Key | `ip` 字串（IPv4/IPv6 normalize）| 直接 |
| TTL（成功）| **24 小時** | RIPE 資料變動慢；節省外部請求 |
| TTL（失敗 / location=null）| **1 分鐘**（短負面快取）| RIPE active engines 是 lazy 觸發（`single-radius` 第一次回 `queued`），過幾分鐘後可能就有資料，TTL 太長會錯過 |
| 容量上限 | **10,000 條**，LRU 淘汰 | 上限約 ~3MB 記憶體 |
| 預熱 | 啟動時不預熱 | 真正流量自然 warm |

### 4.3 邊界情境

- **私有 IP / loopback / link-local**：直接跳過 RIPE，走 MaxMind（也通常查不到）
- **Bogon / IANA 保留**：同上
- **Hostname 而非 IP**：呼叫端負責先解析（traceroute.go 已經這樣做）

---

## 5. 設定項

新增環境變數，全部有合理預設：

| ENV | 預設 | 說明 |
|---|---|---|
| `GEOIP_PROVIDER` | **`maxmind`** | 位置主來源：`maxmind` 或 `ripe`。主來源失敗且另一邊 enabled 時自動 fallback |
| `MAXMIND_LOCATION_ENABLED` | **`true`** | MaxMind City/Country DB；預設 primary，也可作為 RIPE primary 時的 fallback |
| `MAXMIND_ASN_ENABLED` | `true` | MaxMind ASN DB（與位置查詢正交，建議常開）|
| `RIPE_IPMAP_ENABLED` | `true` | RIPE 客戶端是否載入；可作 primary 或 fallback |
| `RIPE_IPMAP_BASE_URL` | `https://ipmap-api.ripe.net` | 方便將來改 endpoint 或本地測試 |
| `RIPE_IPMAP_TIMEOUT_MS` | `800` | 單次查詢上限，超過視為失敗 |
| `RIPE_IPMAP_CACHE_TTL_OK` | `24h` | 成功（有 location）的快取 TTL |
| `RIPE_IPMAP_CACHE_TTL_MISS` | `1m` | 失敗 / `location=null` 的快取 TTL（短，因應 lazy active engines）|
| `RIPE_IPMAP_CACHE_SIZE` | `10000` | LRU 容量 |
| `RIPE_IPMAP_USER_AGENT` | `srtt-dns-analyzer/1.0` | 出口 UA |

`docker-compose.dev.yml` / `docker-compose.prod.yml` 都需要加上，並在 README「快速啟動」段落補一行說明。

---

## 6. 錯誤處理與觀測

### 6.1 結構化 log

每個外部呼叫產生一筆 `slog` 記錄（已是專案慣例）：

```go
slog.Debug("RIPE IPmap query",
    "component", "geoip-ripe",
    "ip", ip,
    "status", "ok"|"miss"|"timeout"|"5xx"|"net-error",
    "latencyMs", elapsed.Milliseconds(),
    "score", score,
    "engine", engine,
)
```

### 6.2 Metrics（建議，可分 phase 做）

簡單 in-memory counter，透過 `/api/health` 或新增 `/api/geoip/stats` 露出：

```go
type Stats struct {
    RipeHits      uint64
    RipeMisses    uint64
    RipeErrors    uint64
    RipeTimeouts  uint64
    MaxmindFallbacks uint64
    CacheHits     uint64
    AvgRipeLatencyMs float64
}
```

### 6.3 Circuit Breaker（建議，phase 2）

連續 N 次（例如 20 次）失敗時，**暫時禁用 RIPE 30 秒**，全部走 MaxMind，避免反覆 timeout 拖慢主流程。可用 `sony/gobreaker` 或自己寫。

---

## 7. 效能與 rate limit 估算

### 7.1 流量推算

最差情況（無 cache）：

- DNS：每秒約 50 筆查詢 × 平均每筆 1.5 個 IP = 75 IP/s
- Traceroute：每次 ~20 hops，但呼叫頻率低（手動觸發），可忽略

加上 24h TTL cache 後，常見 resolver / CDN edge IP 重複率極高，**穩定後對 RIPE 的實際 outbound 應該 < 1 QPS**，遠低於任何合理 rate limit 範圍。

### 7.2 對主流程延遲的影響

| 路徑 | Cache 命中 | RIPE 即時 | RIPE timeout fallback |
|---|---|---|---|
| 額外延遲 | ~0.01 ms | 100~500 ms | 800 ms + MaxMind |

**重要**：DNS server 的 enrichment 是 async pipeline，不會 block DNS response。Traceroute 本來就是幾秒等級，多 800ms 影響可接受。要在 code review 時確認 enrichment 沒有意外卡在同步路徑上。

---

## 8. 測試與 rollout 計畫

### 8.1 單元測試

- `ripe_test.go`：用 `httptest.Server` mock RIPE 回應，覆蓋 ok / 4xx / 5xx / timeout / 低分 / 無效 JSON
- `resolver_test.go`：fallback 邏輯（RIPE 失敗 → MaxMind）
- `cache_test.go`：TTL、LRU 淘汰、並發安全

### 8.2 整合測試

- 加 build tag `integration`，呼叫真實 RIPE API 對 ~10 個已知 IP（Google DNS、Cloudflare、台灣 ISP gateway）
- CI 不跑（避免外部依賴），本地 / staging 才跑

### 8.3 Rollout

1. **Stage 1**：`GEOIP_PROVIDER=maxmind` + `RIPE_IPMAP_ENABLED=true` 部署 → 預設行為，等同舊版 MaxMind primary，RIPE 僅作 fallback
2. **Stage 2**：本地 / staging 改 `GEOIP_PROVIDER=ripe`，對比 MaxMind primary 的覆蓋率與精度差異
3. **Stage 3**：根據觀察決定要不要在 production 把 primary 切到 RIPE；單一 ENV 切換即可，無需重新 build

---

## 9. 風險與待確認事項

| # | 項目 | 影響 | 處理 |
|---|---|---|---|
| R1 | ~~RIPE API JSON schema 細節未驗證~~ | — | **已解決**：已取得官方範例（見 §2.3）|
| R2 | RIPE 沒公布明確 rate limit | 可能被 ban | TTL cache + circuit breaker + UA 標識 |
| R3 | 部分 IP RIPE 完全無資料（住家 IP、新興 ISP）| RIPE primary 時這些 IP 第一次查無 location | 預設 MaxMind primary 已規避；切到 RIPE primary 時靠 MaxMind fallback 補位（前提 `MAXMIND_LOCATION_ENABLED=true`）|
| R4 | Active engines lazy 觸發（`single-radius` 第一次回 `queued`）| 同一 IP 第一次無位置、第二次有 | 失敗 cache TTL 設 1 分鐘，過短時間後會自然重查 |
| R5 | 私有網路環境（無 internet）| 全失敗 | 自動 fallback；MaxMind 是離線的，最差就是回到現況 |

---

## 10. Open Questions（已收斂，留作紀錄）

1. ~~`RIPE_IPMAP_MIN_SCORE` 預設值~~ → 改為「`location` 非 null 即採用」（觀察期決策：先全用 RIPE）
2. ~~是否顯示 source badge~~ → 不顯示
3. ~~是否顯示多個 engine 結果~~ → 只用 `/best`，alternatives 僅用於內部 confidence 計算

### 後續可考慮的優化（非阻塞）

- **重用 `iataCode`**：`traceroute/rdns.go` 那張手刻 IATA 表（80+ 筆）有機會被 RIPE 直接回的 `iataCode` 取代，可大幅簡化程式碼
- **`alternatives` 視覺化**：在 hop hover 上顯示 RIPE 認為的次優位置，當位置存疑時供使用者參考
- **Active engine retry**：若 `single-radius` 的 metadata 顯示 `status: queued`，可標記此 IP 在 5 分鐘後重新查詢（背景 job）

---

## 11. 估時

| 階段 | 工時 |
|---|---|
| 確認 API 真實 schema（fetch 1~2 個樣本 IP）| 0.5h |
| `ripe.go` client + cache | 2h |
| `resolver.go` 整合 + `GetAll` rewire | 1h |
| 既有呼叫點 audit | 0.5h |
| 單元測試 | 2h |
| 文件更新（README + arc42 ch.09）| 0.5h |
| **合計** | **約 0.5~1 工作日** |

---

## 12. 參考資料

- RIPE IPmap 入口：https://ipmap.ripe.net/
- API Reference：https://ipmap.ripe.net/docs/02.api-reference/
- Manual：https://ipmap.ripe.net/docs/01.manual/
- RIPE Labs 技術說明：https://labs.ripe.net/author/massimo_candela/ripe-ipmap-whats-under-the-hood/
- 學術論文（CCR 2020）：https://dl.acm.org/doi/10.1145/3402413.3402415
