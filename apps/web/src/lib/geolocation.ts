export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Wraps the browser Geolocation API in a promise with clear, distinguishable
 * failure reasons — used by both Clock In (attendance-tab.tsx) and the
 * Branch Location admin card ("Use My Current Location").
 */
export function getCurrentPosition(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("GEOLOCATION_UNAVAILABLE"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          reject(new Error("GEOLOCATION_PERMISSION_DENIED"));
        } else {
          reject(new Error("GEOLOCATION_UNAVAILABLE"));
        }
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}
