# 11. Risks and Technical Debt

## Risks
- **OOM**: 若 Ring Buffer session 數超過 2000 或併發 MTR 過多可能導致記憶體耗盡。已設定 container memory limit (1GB) 與 session 上限作為防護。
- **DNS Port Permission**: 監聽 :53 需要 `NET_BIND_SERVICE` capability，容器需授予相應權限。
- **MTR Availability**: MTR 為外部執行檔依賴，若未安裝或版本不相容會導致 traceroute 功能失效。
- **URL Sharing Size Limit**: pako 壓縮後的 `?zdata=` 參數受瀏覽器 URL 長度限制（~2KB-8KB depending on browser），大量資料可能無法分享。

## Technical Debt
- **Traceroute Rate Limiting 已停用**: `traceroute_handler.go` 中的 per-token rate limiting 目前被註解停用（有 TODO），僅依賴 semaphore 做全域併發限制。
- `mtr --json` 輸出格式可能因版本差異而不同（例如 key 名稱），Dockerfile 應固定套件版本以降低風險。
- 應用程式識別規則 (`apps.json`) 需要持續維護。
- Cloud provider 識別規則（`utils/cloudProvider.ts`）採用靜態字串 pattern，需隨雲端服務商 ASN 異動定期更新。
- rDNS PoP 解析的 IATA 機場代碼資料庫（80+ 筆）覆蓋範圍有限，新增 CDN PoP 時需手動更新。
- react-simple-maps 仍作為依賴存在但主要地圖功能已遷移至 MapLibre GL，可考慮移除以減少 bundle 大小。

## 已解決
- ~~Hardcoded DNS IP `35.221.247.16` 寫死於前端~~ → 已透過整合 `DnsSetupBanner`（動態讀取 `window.location.hostname`）解決。
- ~~使用 gopacket 封包擷取需要 libpcap 依賴~~ → 已遷移至 `miekg/dns` 純 Go DNS Proxy 模式；Dockerfile 已移除 libpcap，改為 `CGO_ENABLED=0` 純靜態編譯。
- ~~GeoIP 只取 Country + 座標，未利用 City DB 的城市級欄位~~ → 已擴充 `GeoResult` 加入 City、Subdivision，前後端同步顯示。
- ~~DNS server.go 分三次呼叫 `GetCountry`+`GetCoords`+`GetASN`~~ → 已合併為一次 `GetAll()` 呼叫，減少 MMDB I/O。
- ~~同座標 Traceroute 跳點在地圖上重疊不可辨識~~ → 已實作 `spreadOverlappingHops` 散開邏輯，CyberMap 與 TraceMap 共用。
- ~~IPv6 地址觸發 Traceroute 導致 HTTP 500~~ → 後端偵測 IPv6 並嘗試 rDNS→IPv4 轉換，失敗回傳 400；前端 IPv6 改用 Domain 發起追蹤。
- ~~Dual-stack 網路下跨裝置監控無法顯示資料~~ → 原因是電腦（HTTP）走 IPv6、手機（DNS）走 IPv4，WebSocket Hub IP 過濾不匹配。已實作 `subscribe` 機制：前端開始監控時發送 `{"type":"subscribe","ip":"目標IP"}`，後端動態切換 `client.clientIP` 並重送 snapshot。
- ~~Traceroute 跳點為 hostname 時缺少 IP 與 GeoIP 資訊~~ → mtr `--json` 的 `Host` 欄位有時回傳 hostname（如 `ec2-x-x-x-x.compute-1.amazonaws.com`）而非 IP，導致 GeoIP 查詢失敗、前端缺少國家/ASN/座標。已在 hop 迴圈中加入 `net.ParseIP` 檢測，非 IP 時先 `net.LookupHost` 解析再查詢 GeoIP。
- ~~頁面閒置後 table 資料清空，暫停再繼續無效~~ → 兩個根因：(1) WebSocket 無 ping/pong 心跳，瀏覽器背景 tab 節流後連線靜默斷開；(2) 重連時後端建立新 Client 使用 token 原始 IP（可能是 IPv6），subscribe 狀態丟失，snapshot 送錯 IP 的資料（通常為空）覆蓋前端 records。修正：後端 `writePump` 每 30 秒發送 ping、`readPump` 設定 60 秒 pong 超時；前端 `useDnsStream` 在 `onopen` 時自動重新發送 subscribe，透過 `subscribedIpRef` 追蹤最新訂閱 IP。
