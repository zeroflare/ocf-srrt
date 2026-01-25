export interface DnsRecord {
    // 對應 Go: Timestamp time.Time `json:"timestamp"`
    timestamp: string;

    // 對應 Go: Domain string `json:"domain"`
    domain: string;

    // 對應 Go: Type string `json:"type"`
    type: string;

    // 對應 Go: ResultIP string `json:"result_ip"` (注意底線)
    result_ip: string;

    // 對應 Go: IsForeign bool `json:"is_foreign"` (注意底線)
    is_foreign: boolean;

    // 對應 Go: SourceIP string `json:"source_ip"` (注意底線)
    source_ip: string;

    // 對應 Go: Country string `json:"country"`
    country: string;

    // 對應 Go: ASN uint `json:"asn"`
    asn: number;

    // 對應 Go: ISP string `json:"isp"`
    isp: string;

    // 對應 Go: AppName string `json:"app_name"` (注意底線)
    app_name: string;

    // 對應 Go: AppCategory string `json:"app_category"` (注意底線)
    app_category: string;
}