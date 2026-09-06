export type UserCoordinates = { latitude: number; longitude: number };
export type LocationResult = { status: 'acquired'; location: UserCoordinates }
  | { status: 'denied' | 'timeout' | 'unavailable' | 'unsupported' };
type GeolocationProvider = Pick<Geolocation, 'getCurrentPosition'>;

export function createLocationRequester(getProvider: () => GeolocationProvider | undefined, timeoutMs = 10000) {
  let pending: Promise<LocationResult> | undefined;
  return (): Promise<LocationResult> => {
    if (pending) return pending;
    pending = new Promise<LocationResult>((resolve) => {
      let settled = false;
      const finish = (result: LocationResult) => {
        if (settled) return;
        settled = true; clearTimeout(timer); resolve(result);
      };
      const timer = setTimeout(() => finish({ status: 'timeout' }), timeoutMs);
      try {
        const provider = getProvider();
        if (!provider) { finish({ status: 'unsupported' }); return; }
        provider.getCurrentPosition((position) => {
          const { latitude, longitude } = position.coords;
          if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
            finish({ status: 'unavailable' }); return;
          }
          finish({ status: 'acquired', location: { latitude, longitude } });
        }, (error) => finish({ status: error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable' }),
        { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 60000 });
      } catch { finish({ status: 'unavailable' }); }
    }).finally(() => { pending = undefined; });
    return pending;
  };
}

// Shared across map and concierge. No automatic retries or persistent location storage.
export const requestPosition = createLocationRequester(() => typeof navigator === 'undefined' ? undefined : navigator.geolocation);

export function locationFailureMessage(status: Exclude<LocationResult['status'], 'acquired'>, language: 'sv' | 'en') {
  const messages = {
    denied: ['Platsåtkomst är blockerad. Tillåt den i webbläsaren eller sök på ett område.', 'Location access is blocked. Allow it in your browser or search by area.'],
    timeout: ['Det tog för lång tid att hitta din position. Försök igen eller sök på ett område.', 'Finding your location took too long. Try again or search by area.'],
    unavailable: ['Din position är inte tillgänglig just nu. Försök igen eller sök på ett område.', 'Your location is unavailable right now. Try again or search by area.'],
    unsupported: ['Den här webbläsaren kan inte dela din position. Sök på ett område i stället.', 'This browser cannot share your location. Search by area instead.'],
  };
  return messages[status][language === 'sv' ? 0 : 1];
}
