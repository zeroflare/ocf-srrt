package geoip

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

// RIPE IPmap /best 回應 body 上限 (1MiB)：避免異常上游灌爆記憶體。
const ripeMaxBodyBytes = 1 << 20

// errRipeNoLocation 表示 RIPE 回應正常但 location 為 null（IP 無資料）。
// 與 HTTP 錯誤區分，便於 caller 決定是否 fallback。
var errRipeNoLocation = errors.New("ripe ipmap: no location for ip")

// ripeLocation 對應 /best 回應中的 location 物件，僅擷取我們會用到的欄位。
type ripeLocation struct {
	Type              string  `json:"type"`
	CityName          string  `json:"cityName"`
	CountryCodeAlpha2 string  `json:"countryCodeAlpha2"`
	CountryName       string  `json:"countryName"`
	StateName         string  `json:"stateName"`
	IataCode          string  `json:"iataCode"`
	Latitude          float64 `json:"latitude"`
	Longitude         float64 `json:"longitude"`
	Score             int     `json:"score"`
}

// ripeAlternative 是 alternatives 陣列的元素；僅在 confidence 比較時使用。
type ripeAlternative struct {
	ID    string `json:"id"`
	Score int    `json:"score"`
}

// ripeBestResponse 是 /best 回應的最小化結構。
// metadata.* 欄位刻意省略，未來 debug 需要時再擴充。
type ripeBestResponse struct {
	Location     *ripeLocation     `json:"location"`
	Alternatives []ripeAlternative `json:"alternatives"`
}

// ripeClient 封裝 RIPE IPmap HTTP 呼叫，與 cache、fallback 邏輯解耦。
type ripeClient struct {
	baseURL    string
	httpClient *http.Client
	userAgent  string
}

// newRipeClient 建立可重用的 client。傳入的 timeout 同時控制 connect + read。
func newRipeClient(baseURL string, timeout time.Duration, userAgent string) *ripeClient {
	return &ripeClient{
		baseURL:    baseURL,
		userAgent:  userAgent,
		httpClient: &http.Client{Timeout: timeout},
	}
}

// LocateBest 透過 GET /v1/locate/{ip}/best 查詢單一 IP 的最佳位置。
//
// 三種回傳語意：
//   - (resp, nil)         成功並含有 location
//   - (nil, errRipeNoLocation)  RIPE 回 200 但 location=null，或 404
//   - (nil, err)           HTTP 5xx / timeout / 解析錯誤；caller 決定 fallback 行為
func (c *ripeClient) LocateBest(ctx context.Context, ip string) (*ripeBestResponse, error) {
	endpoint := fmt.Sprintf("%s/v1/locate/%s/best", c.baseURL, url.PathEscape(ip))
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("build ripe request: %w", err)
	}
	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ripe request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, errRipeNoLocation
	}
	if resp.StatusCode >= http.StatusBadRequest {
		return nil, fmt.Errorf("ripe http %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, ripeMaxBodyBytes))
	if err != nil {
		return nil, fmt.Errorf("ripe read body: %w", err)
	}

	var parsed ripeBestResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("ripe parse json: %w", err)
	}

	if parsed.Location == nil {
		return nil, errRipeNoLocation
	}
	return &parsed, nil
}
