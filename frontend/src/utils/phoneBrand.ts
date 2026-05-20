import { DnsRecord } from '../types';

export type PhoneBrand =
  | 'apple'
  | 'google'
  | 'motorola'
  | 'samsung'
  | 'xiaomi'
  | 'huawei'
  | 'oppo'
  | 'vivo'
  | 'other';

/**
 * 各品牌 DNS 特徵：後綴比對（不含開頭點）。
 * 排序與權重關係：愈獨特的域名權重愈高。
 */
const SIGNATURES: { brand: PhoneBrand; suffix: string; weight: number }[] = [
  // Apple — iOS / macOS 一定會打的回呼
  { brand: 'apple', suffix: 'gsp-ssl.ls.apple.com', weight: 6 },
  { brand: 'apple', suffix: 'captive.apple.com', weight: 6 },
  { brand: 'apple', suffix: 'mask.icloud.com', weight: 5 },
  { brand: 'apple', suffix: 'mask-h2.icloud.com', weight: 5 },
  { brand: 'apple', suffix: 'gateway.icloud.com', weight: 4 },
  { brand: 'apple', suffix: 'init.itunes.apple.com', weight: 4 },
  { brand: 'apple', suffix: 'time.apple.com', weight: 3 },
  { brand: 'apple', suffix: 'mzstatic.com', weight: 2 },
  { brand: 'apple', suffix: 'icloud.com', weight: 2 },
  { brand: 'apple', suffix: 'apple.com', weight: 1 },

  // Samsung
  { brand: 'samsung', suffix: 'samsungcloud.com', weight: 6 },
  { brand: 'samsung', suffix: 'samsungdm.com', weight: 6 },
  { brand: 'samsung', suffix: 'samsungknox.com', weight: 6 },
  { brand: 'samsung', suffix: 'samsungelectronics.com', weight: 5 },
  { brand: 'samsung', suffix: 'samsungqbe.com', weight: 5 },
  { brand: 'samsung', suffix: 'samsungapps.com', weight: 4 },
  { brand: 'samsung', suffix: 'samsung.com', weight: 2 },

  // Xiaomi / MIUI
  { brand: 'xiaomi', suffix: 'miui.com', weight: 6 },
  { brand: 'xiaomi', suffix: 'mi.com', weight: 4 },
  { brand: 'xiaomi', suffix: 'xiaomi.com', weight: 5 },
  { brand: 'xiaomi', suffix: 'duokanbox.com', weight: 3 },

  // Huawei / Honor
  { brand: 'huawei', suffix: 'hicloud.com', weight: 6 },
  { brand: 'huawei', suffix: 'huaweicloud.com', weight: 5 },
  { brand: 'huawei', suffix: 'hihonor.com', weight: 5 },
  { brand: 'huawei', suffix: 'huawei.com', weight: 4 },
  { brand: 'huawei', suffix: 'vmall.com', weight: 3 },

  // OPPO / Realme
  { brand: 'oppo', suffix: 'heytapmobi.com', weight: 6 },
  { brand: 'oppo', suffix: 'heytapmobile.com', weight: 6 },
  { brand: 'oppo', suffix: 'oppomobile.com', weight: 5 },
  { brand: 'oppo', suffix: 'oppo.com', weight: 3 },
  { brand: 'oppo', suffix: 'realme.com', weight: 4 },

  // vivo
  { brand: 'vivo', suffix: 'vivoglobal.com', weight: 6 },
  { brand: 'vivo', suffix: 'vivo.com.cn', weight: 5 },
  { brand: 'vivo', suffix: 'vivo.com', weight: 4 },

  // Google / Pixel
  { brand: 'google', suffix: 'connectivitycheck.gstatic.com', weight: 4 },
  { brand: 'google', suffix: 'safebrowsing.googleapis.com', weight: 2 },
  { brand: 'google', suffix: 'android.googleapis.com', weight: 3 },
  // Pixel 專屬的較少；上面通用 Android 信號是低權重

  // Motorola
  { brand: 'motorola', suffix: 'motorola.com', weight: 5 },
  { brand: 'motorola', suffix: 'motorolasolutions.com', weight: 4 },
];

export interface BrandDetection {
  brand: PhoneBrand;
  confidence: 'high' | 'medium' | 'low' | 'none';
  score: number;
  /** 各候選品牌的累積分數，供 UI 顯示「次選」品牌 */
  scores: Record<PhoneBrand, number>;
}

const EMPTY_SCORES: Record<PhoneBrand, number> = {
  apple: 0, google: 0, motorola: 0, samsung: 0, xiaomi: 0, huawei: 0, oppo: 0, vivo: 0, other: 0,
};

/**
 * 從 DNS records 推測手機品牌。
 *
 * - 比對每筆 record.domain 的後綴；命中加上對應 weight
 * - 取最高分品牌為偵測結果
 * - 信心度：score >= 8 high、>= 4 medium、>= 1 low、否則 none
 */
export function detectPhoneBrand(records: DnsRecord[]): BrandDetection {
  if (records.length === 0) {
    return { brand: 'other', confidence: 'none', score: 0, scores: { ...EMPTY_SCORES } };
  }
  const scores = { ...EMPTY_SCORES };
  for (const r of records) {
    const d = r.domain?.toLowerCase().replace(/\.$/, '');
    if (!d) continue;
    for (const sig of SIGNATURES) {
      if (d === sig.suffix || d.endsWith('.' + sig.suffix)) {
        scores[sig.brand] += sig.weight;
        // 一筆 record 只計分最具特徵的那條 signature；用 break 避免短後綴重複疊加
        break;
      }
    }
  }
  let bestBrand: PhoneBrand = 'other';
  let bestScore = 0;
  for (const [brand, s] of Object.entries(scores) as [PhoneBrand, number][]) {
    if (s > bestScore) {
      bestScore = s;
      bestBrand = brand;
    }
  }
  let confidence: BrandDetection['confidence'] = 'none';
  if (bestScore >= 8) confidence = 'high';
  else if (bestScore >= 4) confidence = 'medium';
  else if (bestScore >= 1) confidence = 'low';
  return { brand: bestBrand, confidence, score: bestScore, scores };
}
