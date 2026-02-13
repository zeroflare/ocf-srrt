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
