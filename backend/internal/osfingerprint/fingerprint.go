package osfingerprint

import "strings"

// OS 類型常數
const (
	Android = "Android"
	IOS     = "iOS"
	Windows = "Windows"
)

// rule 定義一條 fingerprint 規則
type rule struct {
	suffix string
	os     string
}

// 依照優先順序排列，越具體的規則放越前面
var rules = []rule{
	// Android
	{suffix: "connectivitycheck.gstatic.com.", os: Android},
	{suffix: "connectivitycheck.android.com.", os: Android},
	{suffix: "android.clients.google.com.", os: Android},
	{suffix: "android.googleapis.com.", os: Android},
	{suffix: "play.googleapis.com.", os: Android},
	{suffix: "mtalk.google.com.", os: Android},

	// iOS / macOS
	{suffix: "captive.apple.com.", os: IOS},
	{suffix: "gateway.icloud.com.", os: IOS},
	{suffix: "setup.icloud.com.", os: IOS},
	{suffix: "configuration.apple.com.", os: IOS},
	{suffix: "gs.apple.com.", os: IOS},
	{suffix: "push.apple.com.", os: IOS},
	{suffix: "lcdn-registration.apple.com.", os: IOS},
	{suffix: "mesu.apple.com.", os: IOS},

	// Windows
	{suffix: "msftconnecttest.com.", os: Windows},
	{suffix: "dns.msftncsi.com.", os: Windows},
	{suffix: "msftncsi.com.", os: Windows},
	{suffix: "windowsupdate.com.", os: Windows},
	{suffix: "update.microsoft.com.", os: Windows},
	{suffix: "settings-win.data.microsoft.com.", os: Windows},
}

// Detect 根據 DNS 查詢域名推斷作業系統類型。
// 回傳空字串表示無法判斷。
func Detect(domain string) string {
	lower := strings.ToLower(domain)
	for _, r := range rules {
		if lower == r.suffix || strings.HasSuffix(lower, "."+r.suffix) {
			return r.os
		}
	}
	return ""
}
