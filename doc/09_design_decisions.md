# 09. Design Decisions

## No-Database Architecture
選擇不使用資料庫是為了極大化隱私與效能，這對於即時分析工具來說是一個關鍵決定。

## miekg/dns 取代 gopacket
選擇 `miekg/dns` 作為 DNS 處理庫，實作 DNS Proxy 模式，取代早期的 `gopacket` 封包擷取設計。
- **動機**: DNS Proxy 可同時接收查詢與回應，不依賴 libpcap 或特殊網路介面設定，且能自動處理 UDP/TCP fallback。
- **優點**: 純 Go 實作，無 CGO 依賴（runtime 層面）；可同時作為 DNS 伺服器對外提供服務。
- **取捨**: 需要用戶端主動將 DNS 指向本系統（無法被動監聽）；但對於本專案的使用情境（用戶端手動設定 DNS）這是合理的。

## React Simple Maps → MapLibre GL
初期使用 React Simple Maps 進行地理視覺化，後期 CyberMap 與 TraceMap 均遷移至 **MapLibre GL** 以提供更好的向量性能與大型地理資料集支援。
- react-simple-maps 仍作為依賴保留，但主要地圖功能已使用 MapLibre GL。

## Submarine Cable Highlighting
決定在 CyberMap 中將 `available_path` (台灣出發可用路徑) 獨立圖層化，並大幅降低非可用路徑的透明度。
- **優點**: 視覺焦點明確，快速識別台灣連外關鍵路徑。
- **缺點**: 若單一海纜有多段可用路徑，視覺上會比一般路徑複雜，已透過 Hover Popup 文字標註補足。

## DNS Target Display（動態 hostname）
`DnsSetupBanner` 使用 `window.location.hostname` 顯示 DNS 目標，而非 hardcoded IP。
- **動機**: 應用程式可能部署於不同主機（開發、測試、正式環境），hardcoded IP 會導致說明資訊錯誤。
- **優點**: 多環境部署自動正確，無需維護靜態設定。
- **取捨**: 若後端與前端分開部署於不同網域，需額外處理；目前架構中前後端同域，無此問題。

## MTR 取代 Traceroute
選擇 MTR (`mtr --report --json --report-cycles 1 --max-ttl 30`) 取代傳統 `traceroute` 作為路徑追蹤引擎。
- **動機**: 傳統 traceroute 每跳僅提供 3 次 RTT，無法呈現丟包率與延遲穩定度。MTR 單次執行即可取得 Loss%、Avg、Best、Worst、StDev 完整統計。
- **優點**: 資訊密度高，JSON 輸出可直接 `json.Unmarshal`，省去 text parsing 的脆弱性。支援 TCP（預設 port 443）與 ICMP 模式切換。
- **取捨**: API timeout 需調高至 60 秒；Docker 映像需額外安裝 `mtr` 套件。

## Traceroute Multi-stage GeoIP Correction
MTR 結果經三階段地理修正（延遲啟發式 → rDNS PoP → ccTLD），而非僅依賴 MaxMind GeoIP。
- **動機**: CDN/Anycast 節點的 GeoIP 資料經常不準確（IP 註冊地與實際部署地不同）。
- **優點**: 多重驗證顯著提升地理標記準確度，尤其對 Cloudflare、Akamai、Fastly 等 CDN 節點。
- **取捨**: rDNS 解析依賴內建的 IATA 機場代碼資料庫（80+ 筆），覆蓋範圍有限；ccTLD 僅作輔助信號。

## TraceMap 使用 MapLibre GL（與 CyberMap 一致）
`TraceMap` 沿用與 `CyberMap` 相同的 MapLibre GL 技術棧，不另外引入 react-leaflet。
- **動機**: 避免同時維護兩套地圖函式庫，減少 bundle 大小與學習成本。
- **優點**: 共用相同的 tile source、樣式設定與 geo utility（`calculateDistance`、`createCurve`）。

## Cloud Provider Detection（前端純運算）
使用 ISP/ASN 字串 pattern matching（`utils/cloudProvider.ts`）在前端識別 AWS、GCP、Azure、Cloudflare、Akamai 等主要雲端服務商。
- **動機**: 判斷 DNS 解析結果是否指向雲端基礎設施，協助使用者辨識潛在的資料流向。
- **優點**: 純 client-side 運算，無需後端 API 異動，延遲低。
- **限制**: 基於 ISP 名稱的字串比對，對自定義 ASN 名稱或新服務商可能有遺漏；規則需定期維護。

## URL-based Data Sharing（pako 壓縮）
使用 pako（deflate）壓縮 DNS 記錄與追蹤結果，編碼為 URL-safe Base64 後透過 `?zdata=` 參數分享。
- **動機**: 系統無資料庫，無法透過 server-side 儲存分享資料；需要一個 stateless 的分享機制。
- **優點**: 完全 client-side，無需後端儲存；URL 可直接分享、書籤化。
- **限制**: URL 長度有瀏覽器限制（壓縮後 max 100KB），大量資料時可能超限。

## City-level GeoIP Enrichment
擴充 `GeoResult` struct 加入 `City` 與 `Subdivision` 欄位，並在 `GetAll()` 中一次查詢取得，取代原本分三次呼叫 `GetCountry`/`GetCoords`/`GetASN` 的做法。
- **動機**: MaxMind City DB 本來就包含城市與行政區資訊，卻只取用 Country + 座標，浪費現有資料。同國內多跳無城市級座標時全部 fallback 到國家中心點，地圖上重疊無法辨識。
- **優點**: 零成本提升地理精度（不需額外資料來源）；合併查詢減少 MMDB I/O 次數。
- **影響**: 前後端 struct/type 均新增 `city`、`subdivision` 欄位；HopTable、LiveTable、CyberMap popup 顯示城市名。

## Traceroute Fan-out Spreading
同座標的 Traceroute 跳點在地圖上以圓心等角散開（`spreadOverlappingHops`），避免重疊。
- **動機**: 同一國家/城市內的多個跳點座標相同（尤其 fallback 到國家中心時），地圖上完全重疊，label 不可辨識。
- **實作**: 偵測重複座標後以 ~0.08 度為半徑等角排列；僅調整渲染座標（`displayCoords`），不修改原始資料；連線連到散開後的座標。
- **適用範圍**: CyberMap 與 TraceMap 共用同一 utility function。

## IPv6 Traceroute Graceful Handling
後端僅支援 IPv4 traceroute（mtr 預設行為）。收到 IPv6 target 時，嘗試 rDNS → 再解析為 IPv4；失敗則回傳 HTTP 400 明確錯誤。前端 LiveTable 對 IPv6 resultIp 改用 Domain 發起 traceroute。
- **動機**: 點擊 AAAA 記錄的 IPv6 地址會導致 mtr 執行失敗（HTTP 500），使用者體驗差。
- **優點**: 後端 graceful degradation，前端自動繞路，使用者無感知。

## Async DNS Enrichment
DNS 回應立即回覆用戶端，富化（GeoIP、Recognition、Probe）在 goroutine 中異步進行。
- **動機**: DNS 查詢對延遲極為敏感，富化處理（尤其 ICMP Probe）耗時不可預測。
- **優點**: DNS 回應延遲不受富化管線影響，使用者體驗與純 DNS forwarder 一致。
- **取捨**: 前端可能在富化完成前就已顯示部分資訊；透過 WaitGroup + 5 秒 timeout 確保 graceful shutdown。

## GeoIP 位置來源：MaxMind 為主、RIPE IPmap 可切換
位置查詢由 `GEOIP_PROVIDER` 選擇主來源，預設 `maxmind`（MaxMind GeoLite2 City）；設為 `ripe` 則改走 [RIPE IPmap](https://ipmap.ripe.net/) `GET https://ipmap-api.ripe.net/v1/locate/{ip}/best`。主來源失敗且另一邊仍 enabled 時自動 fallback。ASN/ISP 一律由 MaxMind ASN DB 提供（RIPE 不提供）。詳見 [`ripe-ipmap-integration.md`](ripe-ipmap-integration.md)。
- **演進**:
  1. 早期僅 MaxMind GeoLite2 City。
  2. 中期改為 pure RIPE（`MAXMIND_LOCATION_ENABLED=false`），觀察 RIPE 對基礎建設 IP（核心路由器、IXP、跨國 PoP）精度的提升幅度。
  3. 實測回饋：RIPE 對住家寬頻 IP 覆蓋率不及 MaxMind，且 RIPE active engines 第一次查詢常處 `queued`，DNS 列表上「位置欄空白」的比例變高，使用者體感變差。改回 **MaxMind 為主、RIPE 保留可切換**。
- **架構**: `geoip.resolver` 依 `cfg.Provider` 計算 `(primary, secondary)`，呼叫 `tryProvider()` 兩次。MaxMind 走套件層 `countryDB`，RIPE 走 `ripeClient` HTTP；任一邊未 enabled 時對應 `tryProvider` 靜默回 false。對外 API（`GetAll` / `GetCountry` / `GetCoords` / `GetASN`）不變。
- **快取策略**: in-memory TTL，成功 24h、失敗 1m。失敗 TTL 故意設短以容忍 RIPE active engines lazy 觸發。
- **取捨**:
  - MaxMind primary 時無網路依賴，延遲穩定；RIPE primary 時引入 800ms timeout，DNS enrichment 是 async pipeline 不影響主流程。
  - 兩來源同時 enabled 會多出一次「primary miss → secondary 查詢」的開銷；可透過關閉其中一邊規避。
  - RIPE 沒公布明確 rate limit；以 24h cache + UA 標識緩解。
- **後續優化**: RIPE response 直接給 `iataCode`，未來可考慮取代 `traceroute/rdns.go` 的 80+ 筆手刻 IATA 表。

## WebSocket Subscribe（跨裝置監控）
新增 WebSocket 雙向通訊機制，允許前端透過 `{"type":"subscribe","ip":"x.x.x.x"}` 訊息動態切換後端的監控目標 IP。
- **動機**: 原設計 WebSocket Hub 以 token 對應的 HTTP clientIP 過濾 broadcast。在 Dual-stack（IPv4+IPv6）網路環境下，電腦瀏覽器可能透過 IPv6 取得 token，而手機的 DNS 查詢走 IPv4，導致兩者 IP 不匹配，前端無法收到任何資料。此問題在 ISP 逐步開通 IPv6 後愈發常見。
- **實作**: 後端新增 `readPump` goroutine 監聽前端訊息，收到 subscribe 後透過 mutex 安全更新 `client.clientIP` 並立即重送目標 IP 的歷史 snapshot。前端在使用者點擊「開始監控」時呼叫 `sendSubscribe(ip)`。
- **優點**: 完全向後相容（不發 subscribe 則行為與原本一致）；解決所有跨裝置、跨 IP 版本的監控場景。
- **取捨**: subscribe 不驗證目標 IP 的所有權，理論上可監控任意已知 IP 的 DNS 流量。在本專案的單一用戶/小規模部署場景中可接受；若需多租戶隔離，需加入權限驗證機制。
