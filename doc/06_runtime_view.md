# 06. Runtime View

## DNS Traffic Processing
1. **Sniffer** 擷取封包。
2. **Parser** 提取 DNS Query/Answer。
3. **Enricher** 查詢 GeoIP/ASN。
4. **Recognition** 識別應用程式類型。
5. **Buffer** 存入 Ring Buffer。
6. **WebSocket** 推送更新至前端。

```mermaid
sequenceDiagram
    participant C as Client Device
    participant S as Sniffer (gopacket)
    participant P as Parser
    participant E as Enricher (GeoIP)
    participant R as App Recognition
    participant B as Ring Buffer
    participant W as WebSocket
    participant F as Frontend

    C->>S: DNS Query (UDP 53)
    S->>P: Raw Packet
    P->>E: Parsed DNS Record
    E->>R: + Country, ASN, ISP
    R->>B: + AppName, AppCategory
    B->>W: New Record Event
    W->>F: JSON Push
```

## MTR Path Tracing
使用者在 LiveTable 點擊 IP 後觸發 MTR 路徑追蹤，後端執行 `mtr --report --json` 並回傳結果。

```mermaid
sequenceDiagram
    participant U as User (Browser)
    participant FE as Frontend
    participant API as Backend API
    participant MTR as mtr Process
    participant GEO as GeoIP DB

    U->>FE: 點擊 IP 觸發 Traceroute
    FE->>API: GET /api/traceroute?target=x.x.x.x
    API->>MTR: exec mtr --report --json --report-cycles 10
    Note over MTR: 執行約 10~50 秒
    MTR-->>API: JSON stdout (hubs[])
    loop 每個 Hub
        API->>GEO: 查詢 Country, Coords, ASN
        GEO-->>API: 地理資訊
    end
    API-->>FE: TraceResult JSON
    FE->>U: 渲染 HopTable + TraceMap
```
