# Data Directory

此目錄用於存放 SRRT 運行所需的靜態資料庫與設定檔。

## ⚠️ 重要：關於 MaxMind GeoLite2 資料庫

由於 MaxMind EULA (終端使用者授權協定) 限制，我們 **不能** 將 `.mmdb` 檔案直接提交到 Git 儲存庫中。

### 如何獲取資料庫 (必須步驟)

在啟動專案前，您必須自行下載以下檔案並放置於此目錄：

1.  **註冊帳號**: 前往 [MaxMind 官網](https://www.maxmind.com/en/geolite2/signup) 註冊一個免費帳號。
2.  **下載檔案**: 下載 `GeoLite2 City` 與 `GeoLite2 ASN` 的 **MaxMind DB binary, gzipped** 格式。
3.  **解壓與更名**:
    * 將 City 資料庫解壓並重新命名為：`GeoLite2-City.mmdb`
    * 將 ASN 資料庫解壓並重新命名為：`GeoLite2-ASN.mmdb`

### 檔案結構確認

 `backend/data/` 目錄結構應如下所示：

```text
backend/data/
├── README.md           (本文件)
├── apps.json           (應用程式識別規則，可提交)
├── GeoLite2-City.mmdb
└── GeoLite2-ASN.mmdb