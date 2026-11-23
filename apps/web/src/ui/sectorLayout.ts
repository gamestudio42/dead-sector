/** Which way a campaign-map label grows so a node near the edge stays inside the map. */
export function sectorAnchor(xPercent: number): 'left' | 'center' | 'right' {
  if (xPercent <= 22) return 'left';
  if (xPercent >= 78) return 'right';
  return 'center';
}
