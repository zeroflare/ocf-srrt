package api

import (
	"net/http"
)

// CORSMiddleware 為 HTTP handler 加上 CORS 標頭。
// 使用與 WebSocket 相同的 allowedOrigins 清單（來自 ALLOWED_ORIGINS 環境變數）。
func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		if origin != "" {
			allowed := len(allowedOrigins) == 0
			if !allowed {
				for _, o := range allowedOrigins {
					if origin == o {
						allowed = true
						break
					}
				}
			}
			if allowed {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Max-Age", "86400")
			}
		}

		// 處理 preflight
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
