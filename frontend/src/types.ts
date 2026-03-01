export interface DnsRecord {
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
}

export interface Hop {
  index: number;
  ip: string;
  host: string;
  latency: number;
  country: string;
  coords: [number, number]; // [lon, lat]
}

export interface TraceResult {
  target: string;
  hops: Hop[];
  status: 'completed' | 'timeout' | 'error';
  time: string;
}
