# 11. Risks and Technical Debt

## Risks
- **OOM**: 若 Ring Buffer 設置過大或併發連線過多可能導致記憶體耗盡。
- **Sniffing Permission**: 在容器內需要特定權限才能擷取封包。

## Technical Debt
- 應用程式識別規則 (`apps.json`) 需要持續維護。
- 目前尚未實作完善的單元測試覆蓋。
