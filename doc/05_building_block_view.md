# 05. Building Block View

## Level 1: White Box Overall System
- **Backend (Go)**: 負責封包擷取、解析、富化 (GeoIP) 及 WebSocket 通訊。
- **Frontend (React)**: 負責接收資料、狀態管理及視覺化展示。

## Level 2: Backend Internals
- **Sniffer**: 監聽網路介面。
- **Parser**: 解析 DNS 協定。
- **Buffer**: Ring Buffer 管理記錄。
- **Enricher**: 整合 GeoIP 與 ASN 資訊。
- **App Recognition**: 根據規則識別應用程式。
- **Traceroute Engine**: 提供 HTTP API 進行網路路徑追蹤。

## Level 3: Frontend Components
- **Dashboard**: 即時流量監控儀表板。
- **CyberMap**: 基於 MapLibre GL 的海纜地圖，強調台灣可用路徑。
- **DataHandler**: 負責海纜資料 (GeoJSON) 的動態轉換與載入。
