# 09. Design Decisions

## No-Database Architecture
選擇不使用資料庫是為了極大化隱私與效能，這對於即時分析工具來說是一個關鍵決定。

## React Simple Maps
選擇此庫而非 Google Maps 或 Leaflet 是為了在輕量化的前提下實現具備「戰情室」感的視覺效果。
(註：後期 CyberMap 部分已遷移至 **MapLibre GL** 以提供更好的向量性能與大型地理資料集支援)

## Submarine Cable Highlighting
決定在 CyberMap 中將 `available_path` (台灣出發可用路徑) 獨立圖層化，並大幅降低非可用路徑的透明度。
- **優點**: 視覺焦點明確，快速識別台灣連外關鍵路徑。
- **缺點**: 若單一海纜有多段可用路徑，視覺上會比一般路徑複雜，已透過 Hover Popup 文字標註補足。

## DNS Target Display（動態 hostname）
`DnsSetupBanner` 使用 `window.location.hostname` 顯示 DNS 目標，而非 hardcoded IP。
- **動機**: 應用程式可能部署於不同主機（開發、測試、正式環境），hardcoded IP 會導致說明資訊錯誤。
- **優點**: 多環境部署自動正確，無需維護靜態設定。
- **取捨**: 若後端與前端分開部署於不同網域，需額外處理；目前 POC 架構中前後端同域，無此問題。

## MTR 取代 Traceroute
選擇 MTR (`mtr --report --json`) 取代傳統 `traceroute` 作為路徑追蹤引擎。
- **動機**: 傳統 traceroute 每跳僅提供 3 次 RTT，無法呈現丟包率與延遲穩定度。MTR 單次執行即可取得 Loss%、Avg、Best、Worst、StDev 完整統計。
- **優點**: 資訊密度高，JSON 輸出可直接 `json.Unmarshal`，省去 text parsing 的脆弱性。
- **取捨**: MTR 執行時間較長（10 cycles），API timeout 需調高至 60 秒；Docker 映像需額外安裝 `mtr` 套件。

## TraceMap 使用 MapLibre GL（與 CyberMap 一致）
`TraceMap` 沿用與 `CyberMap` 相同的 MapLibre GL 技術棧，不另外引入 react-leaflet。
- **動機**: 避免同時維護兩套地圖函式庫，減少 bundle 大小與學習成本。
- **優點**: 共用相同的 tile source、樣式設定與 geo utility（`calculateDistance`、`createCurve`）。

## Cloud Provider Detection（前端純運算）
使用 ISP/ASN 字串 pattern matching（`utils/cloudProvider.ts`）在前端識別 AWS、GCP、Azure、Cloudflare、Akamai 等主要雲端服務商。
- **動機**: 判斷 DNS 解析結果是否指向雲端基礎設施，協助使用者辨識潛在的資料流向。
- **優點**: 純 client-side 運算，無需後端 API 異動，延遲低。
- **限制**: 基於 ISP 名稱的字串比對，對自定義 ASN 名稱或新服務商可能有遺漏；規則需定期維護。
