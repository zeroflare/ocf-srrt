package recognition

import (
	"encoding/json"
	"log/slog"
	"os"
	"regexp"
	"strings"
	"sync"
	"unicode"
)

// AppRule 定義規則結構
type AppRule struct {
	Name     string   `json:"name"`
	Category string   `json:"category"`
	Patterns []string `json:"patterns"`
}

type AppConfig struct {
	Apps []AppRule `json:"apps"`
}

var (
	rules         []AppRule
	compiledRules []struct {
		Rule   AppRule
		Regexp *regexp.Regexp
	}
	once sync.Once
)

// LoadRules 使用 Singleton 模式讀取，確保只讀一次
func LoadRules(path string) {
	once.Do(func() {
		// 1. 讀取檔案
		data, err := os.ReadFile(path)
		if err != nil {
			slog.Warn("Could not read app recognition rules", "component", "recognition", "path", path, "error", err)
			return
		}

		// 2. 解析 JSON
		// 注意：這裡假設 JSON 結構是 { "apps": [ ... ] }
		var config AppConfig
		if err := json.Unmarshal(data, &config); err != nil {
			// 相容舊格式：如果直接是 Array
			if err := json.Unmarshal(data, &rules); err != nil {
				slog.Warn("Could not parse rules", "component", "recognition", "error", err)
				return
			}
		} else {
			rules = config.Apps
		}

		// 3. 預編譯 Regex (效能優化)
		for _, rule := range rules {
			for _, pattern := range rule.Patterns {
				// 簡單判斷：如果包含 * 或是特殊字元，才當作 Regex 編譯
				// 這樣可以保留單純字串比對的彈性
				if strings.Contains(pattern, "*") {
					// 使用字串邊界錨點，避免 google.com 匹配到 notgoogle.com
					// 或是 www.google.com.tw 這種非預期的情況。
					// 我們採用 (?:^|\.)PATTERN$ 的邏輯：
					// 以該 pattern 為開頭，或者前綴是一個點（子網域），並且必須以該 pattern 結尾。
					regexPattern := strings.ReplaceAll(pattern, ".", "\\.")
					regexPattern = strings.ReplaceAll(regexPattern, "*", ".*")
					regexPattern = "(?:^|\\.)" + regexPattern + "$"

					re, err := regexp.Compile(regexPattern)
					if err == nil {
						compiledRules = append(compiledRules, struct {
							Rule   AppRule
							Regexp *regexp.Regexp
						}{rule, re})
					}
				}
			}
		}
		slog.Info("Loaded app recognition rules", "component", "recognition", "count", len(rules), "path", path)
	})
}

// MatchMethod 表示辨識所使用的比對方式
type MatchMethod string

const (
	MatchExact     MatchMethod = "exact"     // 精確 / 後綴規則命中
	MatchRegex     MatchMethod = "regex"     // 正規表達式規則命中
	MatchHeuristic MatchMethod = "heuristic" // 啟發式推測（從 SLD 擷取）
	MatchNone      MatchMethod = ""          // 完全未命中 (Unknown)
)

// AppResult 包含辨識結果與比對方式
type AppResult struct {
	Name        string      `json:"name"`
	Category    string      `json:"category"`
	MatchMethod MatchMethod `json:"matchMethod"`
}

// IdentifyApp 根據域名識別 App，並回傳比對方式
func IdentifyApp(domain string) AppResult {
	// 1. 資料清理：移除末尾的點，轉小寫
	cleanDomain := strings.TrimSuffix(strings.ToLower(domain), ".")

	// 2. Level 1: 優先比對 Rules
	for _, rule := range rules {
		for _, pattern := range rule.Patterns {
			// A. 規則比對 (最快)
			// 如果 pattern 不含 wildcard，直接檢查後綴匹配 (Suffix Match)
			// 避免 google.com 匹配到 notgoogle.com，但允許 www.google.com
			if !strings.Contains(pattern, "*") {
				if cleanDomain == pattern || strings.HasSuffix(cleanDomain, "."+pattern) {
					return AppResult{Name: rule.Name, Category: rule.Category, MatchMethod: MatchExact}
				}
			}
		}
	}

	// B. Regex 比對 (針對有 wildcard 的規則)
	for _, cr := range compiledRules {
		if cr.Regexp.MatchString(cleanDomain) {
			return AppResult{Name: cr.Rule.Name, Category: cr.Rule.Category, MatchMethod: MatchRegex}
		}
	}

	// 3. Level 2: 智能猜測 (Heuristic Fallback)
	// 如果規則都沒中，嘗試從網域中提取主名稱
	guessedName := extractSLD(cleanDomain)
	if guessedName != "" {
		return AppResult{Name: capitalize(guessedName), Category: "General", MatchMethod: MatchHeuristic}
	}

	return AppResult{Name: "Unknown", Category: "General", MatchMethod: MatchNone}
}

// extractSLD 提取二級網域 (SLD)
// 例如: api.notion.so -> notion
// 例如: google.com -> google
func extractSLD(domain string) string {
	parts := strings.Split(domain, ".")
	length := len(parts)

	if length < 2 {
		return domain
	}

	// 取倒數第二個部分
	candidate := parts[length-2]

	// 簡單過濾：如果抓到的是 com, org, net, co 這種 TLD，就再往前抓一個
	// 例如: amazon.co.jp -> 抓到 co -> 太短 -> 改抓 amazon
	isCommonTLD := len(candidate) <= 2 || candidate == "com" || candidate == "org" || candidate == "net" || candidate == "gov" || candidate == "edu"

	if isCommonTLD {
		if length >= 3 {
			return parts[length-3]
		}
	}

	return candidate
}

func capitalize(s string) string {
	if len(s) == 0 {
		return s
	}
	r := []rune(s)
	r[0] = unicode.ToUpper(r[0])
	return string(r)
}
