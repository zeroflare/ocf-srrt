# 04. Solution Strategy

## Technology Decisions
- 使用 Go 的 `miekg/dns` 實作 DNS 代理伺服器，直接接收與轉發 DNS 查詢，同時異步富化回應資料。
- 使用 WebSocket（gorilla/websocket）確保低延遲的即時資料推送。
- 前端採用 Zustand 管理全域狀態（2 個 Store：DNS、Traceroute），並使用 MapLibre GL 進行地理視覺化。
- **Interactive Debugging**: 整合 MTR (My Traceroute) 到 DNS 列表點擊，一次取得完整路徑統計（Loss%、Avg、Best、Worst、StDev），簡化診斷流程。
- **Multi-stage Traceroute Enrichment**: MTR 結果經三階段地理修正：延遲啟發式（CDN 偵測）→ rDNS PoP 解析（IATA 機場代碼）→ ccTLD 輔助。
- **Context-aware Onboarding**: 提供浮動的 DNS 設定說明（DnsSetupBanner）以及 react-joyride 引導式導覽。
- **Client-side Enrichment**: 在前端執行 ISP/Cloud Provider 偵測（`utils/cloudProvider.ts`），減輕後端負載並保持靈活性。
- **URL-based Sharing**: 使用 pako（deflate）壓縮 DNS 記錄與追蹤結果，編碼為 URL-safe Base64 後透過 `?zdata=` 參數分享，無需後端儲存。

## Architecture Patterns
- **Monorepo**: 後端與前端代碼存放在同一個倉庫中。
- **DNS Proxy Pattern**: 後端同時扮演 DNS 伺服器與富化管線，查詢轉發後異步處理（不阻塞 DNS 回應）。
- **In-Memory Ring Buffer**: 使用循環緩衝區管理內存中的 DNS 記錄（每 IP 最多 5000 筆、最多 2000 個 session），防止 OOM 並實現自動過期（10 分鐘閒置清除）。
- **Three-tier Caching**: DNS 回應快取（30s）、ICMP Probe 結果快取（10min）、Traceroute 結果快取（5min），減少重複運算。
- **Rate Limiting + Semaphore**: Per-IP DNS 速率限制（50 req/s, burst 100）、Traceroute 全域併發限制（最多 5 個同時執行）。
- **Host Network Mode**: 生產環境下使用 Docker host 模式以獲取原始 IP 資訊。
- **Token-based Auth**: 每個用戶端 IP 自動獲得 UUID token，用於 WebSocket 連線與 API 認證。
