# 11. Risks and Technical Debt

## Risks
- **OOM**: 若 Ring Buffer 設置過大或併發連線過多可能導致記憶體耗盡。
- **Sniffing Permission**: 在容器內需要特定權限才能擷取封包。

## Technical Debt
- 應用程式識別規則 (`apps.json`) 需要持續維護。
- 目前尚未實作完善的單元測試覆蓋。
- Cloud provider 識別規則（`utils/cloudProvider.ts`）採用靜態字串 pattern，需隨雲端服務商 ASN 異動定期更新。

## 已解決
- ~~Hardcoded DNS IP `35.221.247.16` 寫死於前端~~ → 已透過整合 `DnsSetupBanner`（動態讀取 `window.location.hostname`）解決，移除了前端 `App.tsx` 中的靜態 IP 參照。
