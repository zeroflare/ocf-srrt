// Package hostloc 載入「本機 DNS 主機所在節點」的地理設定。
//
// 設計動機：DNS 主機可能部署於不同國家（TW、JP…），前端地圖中心與境內/境外
// 判定都需要知道主機所在國家。本套件把這份設定外部化為一份 JSON 檔，
// 讓同一份映像檔可藉由掛載不同設定檔部署到不同節點，不需重編譯。
//
// 與 LOCAL_COUNTRY 環境變數的關係：兩者語意相同（皆指「境內國家」）。
// 載入策略由呼叫端（cmd/main.go）決定，慣例為「環境變數優先，未設定時才用本檔」，
// 以維持既有部署的向後相容。
package hostloc

import (
	"encoding/json"
	"fmt"
	"os"
)

// Location 描述本機 DNS 主機節點的地理資訊。
type Location struct {
	// Country 為 ISO 3166-1 alpha-2 國碼（如 TW、JP），驅動境內/境外判定。
	Country string `json:"country"`
	// Label 為人類可讀的節點顯示名稱（如「台灣節點」），供前端 UI 顯示。
	Label string `json:"label"`
	// Coordinates 為地圖中心點，格式 [經度, 緯度]（GeoJSON 慣例）。
	Coordinates [2]float64 `json:"coordinates"`
	// MapZoom 為前端地圖預設縮放等級；<=0 表示未設定，由前端自行決定預設值。
	MapZoom float64 `json:"mapZoom"`
}

// HasCoordinates 回報座標是否為有效值（非預設零值 [0,0]）。
func (l *Location) HasCoordinates() bool {
	return l.Coordinates[0] != 0 || l.Coordinates[1] != 0
}

// Load 從指定路徑讀取並解析主機位置設定檔。
//
// 找不到檔案或解析失敗時回傳錯誤，由呼叫端決定 fallback 行為
// （例如改用環境變數或 GeoIP），確保未提供設定檔的部署仍能正常啟動。
func Load(path string) (*Location, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read host location config %q: %w", path, err)
	}

	var loc Location
	if err := json.Unmarshal(data, &loc); err != nil {
		return nil, fmt.Errorf("parse host location config %q: %w", path, err)
	}

	return &loc, nil
}
