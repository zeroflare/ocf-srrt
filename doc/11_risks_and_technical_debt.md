# 11. Risks and Technical Debt

## Risks
- **OOM**: 若 Ring Buffer session 數超過 2000 或併發 MTR 過多可能導致記憶體耗盡。已設定 container memory limit (1GB) 與 session 上限作為防護。
- **DNS Port Permission**: 監聽 :53 需要 `NET_BIND_SERVICE` capability，容器需授予相應權限。
- **MTR Availability**: MTR 為外部執行檔依賴，若未安裝或版本不相容會導致 traceroute 功能失效。
- **URL Sharing Size Limit**: pako 壓縮後的 `?zdata=` 參數受瀏覽器 URL 長度限制（~2KB-8KB depending on browser），大量資料可能無法分享。

## Technical Debt
- **libpcap 殘留**: Dockerfile 仍安裝 `libpcap-dev`（builder stage）與 `libpcap`（runner stage），但實際已不使用 gopacket，可移除以減少映像大小。
- **Traceroute Rate Limiting 已停用**: `traceroute_handler.go` 中的 per-token rate limiting 目前被註解停用（有 TODO），僅依賴 semaphore 做全域併發限制。
- `mtr --json` 輸出格式可能因版本差異而不同（例如 key 名稱），Dockerfile 應固定套件版本以降低風險。
- 應用程式識別規則 (`apps.json`) 需要持續維護。
- Cloud provider 識別規則（`utils/cloudProvider.ts`）採用靜態字串 pattern，需隨雲端服務商 ASN 異動定期更新。
- rDNS PoP 解析的 IATA 機場代碼資料庫（80+ 筆）覆蓋範圍有限，新增 CDN PoP 時需手動更新。
- react-simple-maps 仍作為依賴存在但主要地圖功能已遷移至 MapLibre GL，可考慮移除以減少 bundle 大小。

## 已解決
- ~~Hardcoded DNS IP `35.221.247.16` 寫死於前端~~ → 已透過整合 `DnsSetupBanner`（動態讀取 `window.location.hostname`）解決。
- ~~使用 gopacket 封包擷取需要 libpcap 依賴~~ → 已遷移至 `miekg/dns` 純 Go DNS Proxy 模式，不再需要 libpcap（但 Dockerfile 中尚未清除）。
