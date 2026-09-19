/** Decodes Google's polyline algorithm format (used by the Routes API) into lat/lng pairs.
 *  https://developers.google.com/maps/documentation/utilities/polylinealgorithm */
export function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  if (!encoded) return []
  const points: { lat: number; lng: number }[] = []
  let index = 0
  let lat = 0
  let lng = 0

  while (index < encoded.length) {
    lat += decodeSignedValue()
    lng += decodeSignedValue()
    points.push({ lat: lat / 1e5, lng: lng / 1e5 })
  }
  return points

  function decodeSignedValue(): number {
    let result = 0
    let shift = 0
    let byte: number
    do {
      byte = encoded.charCodeAt(index++) - 63
      result |= (byte & 0x1f) << shift
      shift += 5
    } while (byte >= 0x20)
    return (result & 1) !== 0 ? ~(result >> 1) : result >> 1
  }
}
