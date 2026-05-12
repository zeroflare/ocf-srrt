/**
 * Haversine distance between two [lon, lat] points in km.
 */
export const calculateDistance = (p1: [number, number], p2: [number, number]): number => {
  const R = 6371;
  const dLat = (p2[1] - p1[1]) * Math.PI / 180;
  const dLon = (p2[0] - p1[0]) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(p1[1] * Math.PI / 180) * Math.cos(p2[1] * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * 同座標 hop 散開：將重疊的 hop 以原座標為圓心等角散開，避免地圖上疊成一團。
 * 只調整渲染座標，不修改原始資料。
 * @param radius 散開半徑（經緯度，約 0.08 度 ≈ 8km）
 */
export function spreadOverlappingHops<T extends { coords: [number, number] }>(
  hops: T[],
  radius = 0.08,
): (T & { displayCoords: [number, number] })[] {
  const groups = new Map<string, number[]>();
  hops.forEach((h, i) => {
    const key = `${h.coords[0].toFixed(4)},${h.coords[1].toFixed(4)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });

  const result = hops.map(h => ({ ...h, displayCoords: [...h.coords] as [number, number] }));

  for (const indices of groups.values()) {
    if (indices.length <= 1) continue;
    const n = indices.length;
    const angleStep = (2 * Math.PI) / n;
    indices.forEach((idx, i) => {
      const angle = angleStep * i - Math.PI / 2; // 從正上方開始
      result[idx].displayCoords = [
        result[idx].coords[0] + radius * Math.cos(angle),
        result[idx].coords[1] + radius * Math.sin(angle),
      ];
    });
  }

  return result;
}

/**
 * Create a curved line (arc) between two [lon, lat] points.
 */
export const createCurve = (start: [number, number], end: [number, number]): [number, number][] => {
  const points: [number, number][] = [];
  const steps = 50;
  const dist = calculateDistance(start, end);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const lng = start[0] + (end[0] - start[0]) * t;
    const lat = start[1] + (end[1] - start[1]) * t;
    const offset = Math.sin(t * Math.PI) * (dist / 5000) * 10;
    points.push([lng, lat + offset]);
  }
  return points;
};
