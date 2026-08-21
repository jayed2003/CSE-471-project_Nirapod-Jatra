export type Place = { lat: number; lon: number; displayName: string };
export async function searchPlace(query: string): Promise<Place> {
  const response = await fetch(`/api/geocode?q=${encodeURIComponent(query)}`);
  if (response.status === 404) throw new Error("Place not found.");
  if (!response.ok) throw new Error("Please check your internet connection.");
  return response.json() as Promise<Place>;
}
