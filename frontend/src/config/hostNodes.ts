/**
 * 主機節點清單（多國部署）。
 *
 * DNS 主機部署於不同國家，各有獨立網址。前端在第 1 步提供下拉選單，
 * 使用者選擇節點後直接跳轉到對應網址（不做 SPA 內切換）。
 *
 * 新增節點時於此陣列加一筆即可；code 對應後端 host-location.json 的 country。
 */
export interface HostNode {
  /** ISO 國碼，對應後端 localCountry / host-location.json 的 country */
  code: string;
  /** 下拉選單顯示名稱 */
  label: string;
  /** 該節點的對外網址（含結尾斜線） */
  url: string;
}

export const HOST_NODES: HostNode[] = [
  { code: 'TW', label: '台灣 Taiwan', url: 'https://srtt.ocf.tw/' },
  { code: 'JP', label: '日本 Japan', url: 'https://srtt-jp.ocf.tw/' },
];

/** 取網址的 hostname；解析失敗回空字串。 */
function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * 判斷目前所在節點。
 * 優先以瀏覽器 hostname 比對節點網址（最準確），其次以 localCountry 國碼比對。
 * 都不符合時回傳 undefined（呼叫端可自行決定 fallback）。
 */
export function resolveCurrentNode(localCountry?: string | null): HostNode | undefined {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const byHost = HOST_NODES.find((n) => hostnameOf(n.url) === host);
  if (byHost) return byHost;

  if (localCountry) {
    const cc = localCountry.toUpperCase();
    return HOST_NODES.find((n) => n.code === cc);
  }
  return undefined;
}
