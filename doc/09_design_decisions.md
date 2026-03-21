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
選擇 MTR (`mtr --report --json`) 取代傳統 `traceroute` 作為路徑追蹤引擎。
- **動機**: 傳統 traceroute 每跳僅提供 3 次 RTT，無法呈現丟包率與延遲穩定度。MTR 單次執行即可取得 Loss%、Avg、Best、Worst、StDev 完整統計。
- **優點**: 資訊密度高，JSON 輸出可直接 `json.Unmarshal`，省去 text parsing 的脆弱性。
- **取捨**: MTR 執行時間較長（10 cycles），API timeout 需調高至 60 秒；Docker 映像需額外安裝 `mtr` 套件。

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

## Async DNS Enrichment
DNS 回應立即回覆用戶端，富化（GeoIP、Recognition、Probe）在 goroutine 中異步進行。
- **動機**: DNS 查詢對延遲極為敏感，富化處理（尤其 ICMP Probe）耗時不可預測。
- **優點**: DNS 回應延遲不受富化管線影響，使用者體驗與純 DNS forwarder 一致。
- **取捨**: 前端可能在富化完成前就已顯示部分資訊；透過 WaitGroup + 5 秒 timeout 確保 graceful shutdown。
