# 04. Solution Strategy

## Technology Decisions
- 使用 Go 的 `gopacket` 進行高效能封包擷取。
- 使用 WebSocket 確保低延遲的資料推送。
- 前端採用 Zustand 管理全域狀態，並使用 React Simple Maps 進行地理視覺化。

- **Interactive Debugging**: 整合 MTR (My Traceroute) 到 DNS 列表點擊，一次取得完整路徑統計（Loss%、Avg、Best、Worst、StDev），簡化診斷流程。
- **Context-aware Onboarding**: 提供浮動的 DNS 設定說明（Overlay），減少使用者離開畫面查找說明的斷裂感。
- **Client-side Enrichment**: 在前端執行 ISP/Cloud Provider 偵測，減輕後端負載並保持靈活性。

## Architecture Patterns
- **Monorepo**: 後端與前端代碼存放在同一個倉庫中。
- **In-Memory Ring Buffer**: 使用循環緩衝區管理內存中的 DNS 記錄，防止 OOM 並實現自動過期。
- **Host Network Mode**: 生產環境下使用 Docker host 模式以獲取原始 IP 資訊。
