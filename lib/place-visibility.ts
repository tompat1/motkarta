/** Publication controls, separate from venue quality and recommendation scores. */
export type PlaceIdentity = {
  id: number;
  idNamespace?: string;
  name?: string;
  osmIdentity?: string;
  osmAliases?: string[];
  latitude?: number | null;
  longitude?: number | null;
};

type PublicationPlace = PlaceIdentity & {
  lifecycleState?: string;
  validationLabel?: string | null;
  duplicateResolution?: string | null;
  chainStatus?: string | null;
};

export function isClosedPlace(place: PublicationPlace): boolean {
  return place.lifecycleState === "closed"
    || place.validationLabel === "closed_wrong_category";
}

export function isCommercialPlace(place: PublicationPlace): boolean {
  return place.chainStatus === "chain";
}

export function isUnpublishedPlace(place: PublicationPlace): boolean {
  return isClosedPlace(place)
    || isCommercialPlace(place)
    || place.duplicateResolution === "merged"
    || place.lifecycleState === "candidate";
}

export function samePlaceIdentity(place: PlaceIdentity, other: PlaceIdentity): boolean {
  if (place.idNamespace && place.idNamespace === other.idNamespace && place.id === other.id) return true;
  const identities = [place.osmIdentity, ...(place.osmAliases ?? [])].filter(Boolean);
  const otherIdentities = [other.osmIdentity, ...(other.osmAliases ?? [])].filter(Boolean);
  if (identities.length && otherIdentities.length) {
    return identities.some((identity) => otherIdentities.includes(identity));
  }
  // Legacy imports can lack OSM identity. Never join separate ID namespaces by
  // numeric ID or name alone: require the same name and near-identical location.
  const name = (value?: string) => value?.normalize("NFKC").trim().toLocaleLowerCase("sv");
  return !!name(place.name) && name(place.name) === name(other.name)
    && typeof place.latitude === "number" && typeof place.longitude === "number"
    && typeof other.latitude === "number" && typeof other.longitude === "number"
    && Math.abs(place.latitude - other.latitude) < 0.0001
    && Math.abs(place.longitude - other.longitude) < 0.0001;
}

export function filterPublishedPlaces<T extends PublicationPlace>(places: T[], blocked: PlaceIdentity[] = []): T[] {
  const exclusions = [...blocked, ...places.filter((place) => isClosedPlace(place) || isCommercialPlace(place))];
  return places.filter((place) => !isUnpublishedPlace(place)
    && !exclusions.some((other) => samePlaceIdentity(place, other)));
}

type VisibilityRow = PlaceIdentity & { osmType?: string; osmId?: string; validationLabel?: string; chainStatus?: string };
export type VisibilityDatabase = {
  prepare(query: string): { all<T>(): Promise<{ results?: T[] }> };
};

export async function loadUnpublishedPlaces(db: VisibilityDatabase): Promise<PlaceIdentity[]> {
  const { results = [] } = await db.prepare(`
    SELECT id, name, osm_type AS osmType, osm_id AS osmId, latitude, longitude,
      validation_label AS validationLabel, chain_status AS chainStatus
    FROM establishments
    WHERE validation_label = 'closed_wrong_category'
       OR chain_status = 'chain'
  `).all<VisibilityRow>();
  return results.filter((row) => row.validationLabel === "closed_wrong_category" || row.chainStatus === "chain")
    .map(({ osmType, osmId, validationLabel: _label, chainStatus: _chain, ...row }) => ({
      ...row,
      idNamespace: "d1",
      ...(osmType && osmId ? { osmIdentity: `${osmType}:${osmId}` } : {}),
    }));
}
