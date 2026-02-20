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
 * Returns true if two hops are likely connected via submarine cable (>1000km apart).
 */
export const isLikelySubmarine = (hopA: { coords?: [number, number] }, hopB: { coords?: [number, number] }): boolean => {
  if (!hopA.coords || !hopB.coords) return false;
  return calculateDistance(hopA.coords, hopB.coords) > 1000;
};

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
