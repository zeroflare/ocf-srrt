package recognition

import (
	"encoding/json"
	"log"
	"os"
	"regexp"
	"strings"
)

type AppRule struct {
	Name     string `json:"name"`
	Domain   string `json:"domain"`
	Category string `json:"category"`
	Logo     string `json:"logo,omitempty"`
}

var rules []AppRule
var compiledRules []struct {
	Rule   AppRule
	Regexp *regexp.Regexp
}

func init() {
	loadRules()
}

func loadRules() {
	data, err := os.ReadFile("data/app.json")
	if err != nil {
		log.Printf("Warning: Could not read app recognition rules: %v", err)
		return
	}

	if err := json.Unmarshal(data, &rules); err != nil {
		log.Printf("Warning: Could not parse app recognition rules: %v", err)
		return
	}

	for _, rule := range rules {
		// 將 domain 轉換為 regex，支援 wildcard (*)
		pattern := strings.ReplaceAll(rule.Domain, ".", "\\.")
		pattern = strings.ReplaceAll(pattern, "*", ".*")
		pattern = "^" + pattern + "$"

		re, err := regexp.Compile(pattern)
		if err != nil {
			log.Printf("Warning: Invalid regex for domain %s: %v", rule.Domain, err)
			continue
		}

		compiledRules = append(compiledRules, struct {
			Rule   AppRule
			Regexp *regexp.Regexp
		}{rule, re})
	}
}

// IdentifyApp 根據域名識別 App
func IdentifyApp(domain string) (string, string) {
	// 移除末尾的點 (DNS 查詢通常帶有末尾的點)
	domain = strings.TrimSuffix(domain, ".")

	for _, cr := range compiledRules {
		if cr.Regexp.MatchString(domain) {
			return cr.Rule.Name, cr.Rule.Category
		}
	}

	return "Unknown", "General"
}
