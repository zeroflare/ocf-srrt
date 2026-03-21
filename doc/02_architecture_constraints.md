# 02. Architecture Constraints

## Technical Constraints
- **Backend**: Go 1.24+, 使用 `miekg/dns` 作為 DNS 協定處理庫
- **Frontend**: React 19, TypeScript 5.9+, Vite 7, Tailwind CSS v4
- **State Management**: Zustand 5
- **Map**: MapLibre GL 5（主要）、react-simple-maps 3（輔助）
- **Tables**: TanStack Table 8
- **Charts**: Recharts 3
- **Testing**: Vitest（前端）、Go test（後端）
- **Deployment**: Docker, Docker Compose, Nginx 反向代理
- **Protocol**: WebSocket（即時資料推送）、REST（API 端點）
- **Data Persistence**: RAM-only（No database），重啟後資料清空
- **Package Manager**: pnpm 9+（`node-linker=hoisted`, `symlink=false`）
- **Node**: >= 24.0.0

## Organizational Constraints
- **License**: MIT License
- **Documentation**: arc42 standard
- **Language**: 程式碼註解使用繁體中文

## Conventions
- **Code Style**: SOLID principles
- **Language-specific standards**: Follow official language specifications
- **Architecture**: No circular dependencies between classes/packages
- **Backend Logging**: 使用 `slog` JSON handler，所有日誌必須包含 `"component"` 欄位
- **JSON Field Naming**: Backend 使用 camelCase JSON tags，Frontend types 完全鏡像
- **TypeScript**: Strict mode，啟用 `noUnusedLocals` 與 `noUnusedParameters`
- **Dark Mode**: 透過 `.dark` class 在 `<html>` 元素上切換（Tailwind v4）
