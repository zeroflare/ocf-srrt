export interface DnsRecord {
    // 前端自動產生的唯一 ID（不來自後端）
    _id: string;

    // 對應 Go: Timestamp time.Time `json:"timestamp"`
    timestamp: string;

    // 對應 Go: Domain string `json:"domain"`
    domain: string;

    // 對應 Go: Type string `json:"type"`
    type: string;

    // 對應 Go: ResultIP string
    resultIp: string;

    // 對應 Go: IsForeign bool
    isForeign: boolean;

    // 對應 Go: ForeignConfidence string
    foreignConfidence?: 'high' | 'low' | '';

    // 對應 Go: Latency float64
    latency: number;

    // 對應 Go: SourceIP string
    sourceIp: string;

    // 對應 Go: Country string `json:"country"`
    country: string;

    // 對應 Go: City string `json:"city,omitempty"`
    city?: string;

    // 對應 Go: Subdivision string `json:"subdivision,omitempty"`
    subdivision?: string;

    // 對應 Go: ASN uint `json:"asn"`
    asn: number;

    // 對應 Go: ISP string `json:"isp"`
    isp: string;

    // 對應 Go: AppName string
    appName: string;

    // 對應 Go: AppCategory string
    appCategory: string;

    // 對應 Go: OS string `json:"os,omitempty"`
    os?: string;

    // 對應 Go: Longitude/Latitude float64
    longitude?: number;
    latitude?: number;

    // 推測標記欄位
    // 對應 Go: AppMatchMethod string — "exact" / "regex" / "heuristic" / ""
    appMatchMethod?: 'exact' | 'regex' | 'heuristic' | '';
    // 對應 Go: OsInferred bool — OS 一律為推測
    osInferred?: boolean;
    // 對應 Go: GeoInferred bool — GeoIP 資料庫推估
    geoInferred?: boolean;
}

export interface Hop {
  index: number;
  ip: string;
  host: string;
  latency: number;       // Avg ms
  rtts?: number[];       // 保留（可能為空陣列）
  loss: number;          // 丟包率 0~100
  best: number;          // 最低延遲 ms
  worst: number;         // 最高延遲 ms
  stdev: number;         // 標準差 ms
  country: string;
  city?: string;
  subdivision?: string;
  coords: [number, number]; // [lon, lat]
  asn?: number;
  isp?: string;
  geoConfidence?: 'high' | 'low' | 'none';
}

export interface TraceResult {
  target: string;
  resolvedIP?: string;        // DNS 預解析的 IP（當 target 為域名時）
  hops: Hop[];
  status: 'completed' | 'timeout' | 'error';
  time: string;
  cached?: boolean;

  // 可觀測性欄位
  mode?: string;              // "tcp" / "icmp"
  port?: number;              // TCP port
  dnsResolveMs?: number;      // DNS 解析耗時 (ms)
  mtrExecutionMs?: number;    // mtr 執行耗時 (ms)
  mtrVersion?: string;        // mtr 版本
}
