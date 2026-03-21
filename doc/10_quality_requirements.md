# 10. Quality Requirements

## Performance
- 後端應能處理每秒數千個 DNS 查詢（DNS 回應同步回覆，富化異步處理）。
- 前端應能流暢顯示即時更新的數據表格與地圖動畫（批次緩衝 500ms throttle 防止過度渲染）。
- 三層快取機制（DNS 30s、Probe 10min、Traceroute 5min）減少重複運算。
- Traceroute 全域併發限制（max 5）防止系統過載。

## Security
- Token-based 認證，每個用戶端 IP 自動獲得唯一 UUID。
- CORS 中間件可透過環境變數限制允許來源。
- Production 容器安全強化：read-only FS、no new privileges、capability 最小化。
- HTTPS（Let's Encrypt）加密傳輸。
- DNS 查詢輸入驗證，防止指令注入（traceroute target 正規表達式驗證 + DNS lookup 二次確認）。

## Privacy
- 無持久化存儲，重啟後所有資料清空。
- Ring Buffer 自動過期（10 分鐘閒置清除 session）。
- 分享功能純 client-side 壓縮，資料不經過伺服器。

## Maintainability
- 遵循 SOLID 原則。
- 禁止循環依賴。
- 完善的 arc42 文檔記錄。
- TypeScript strict mode 確保型別安全。
- 前後端測試：Vitest（前端）、Go test（後端）。

## Usability
- i18n 支援中文與英文，瀏覽器語言自動偵測。
- Dark mode 支援。
- 引導式導覽（react-joyride）協助新使用者。
- 響應式設計（RWD），支援桌面與行動裝置。
