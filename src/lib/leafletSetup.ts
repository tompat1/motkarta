import L from "leaflet";
import "leaflet.markercluster";

// Safeguard Leaflet internals against undefined/null objects
// In standard Leaflet, L.Util.stamp(undefined) throws:
// "TypeError: Cannot use 'in' operator to search for '_leaflet_id' in undefined"
// and L.Map.prototype.hasLayer(undefined) directly calls L.Util.stamp(layer).
const originalStamp = L.Util.stamp;
(L.Util as any).stamp = function (obj: any): number {
  if (!obj || (typeof obj !== "object" && typeof obj !== "function")) {
    return -1;
  }
  return originalStamp(obj);
};

const originalMapHasLayer = L.Map.prototype.hasLayer;
L.Map.prototype.hasLayer = function (layer: any): boolean {
  if (!layer) {
    return false;
  }
  return originalMapHasLayer.call(this, layer);
};

// Safeguard Leaflet.markercluster clearLayers and zoomToShowLayer
// MarkerCluster maintains an animation queue that can fire callbacks after layers are cleared.
const markerClusterGroupProto = (L as any).MarkerClusterGroup?.prototype;
if (markerClusterGroupProto) {
  const originalClearLayers = markerClusterGroupProto.clearLayers;
  markerClusterGroupProto.clearLayers = function () {
    if (this._queueTimeout) {
      clearTimeout(this._queueTimeout);
      this._queueTimeout = null;
    }
    if (this._queue && Array.isArray(this._queue)) {
      this._queue.length = 0;
    }
    return originalClearLayers.call(this);
  };

  const originalZoomToShowLayer = markerClusterGroupProto.zoomToShowLayer;
  if (originalZoomToShowLayer) {
    markerClusterGroupProto.zoomToShowLayer = function (layer: any, callback?: () => void) {
      if (!layer) return;
      const map = this._map;
      if (!map) return;

      const cb = typeof callback === "function" ? callback : () => {};
      let cleanedUp = false;

      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        map.off("moveend", showMarker, this);
        this.off("animationend", showMarker, this);
      };

      const showMarker = () => {
        // If layer was removed from cluster or parent was deleted during clearLayers
        if (!layer || (!map.hasLayer(layer) && (!layer.__parent || !map.hasLayer(layer.__parent)))) {
          if (!this._inZoomAnimation || !layer.__parent) {
            cleanup();
          }
          return;
        }

        if ((map.hasLayer(layer) || (layer.__parent && map.hasLayer(layer.__parent))) && !this._inZoomAnimation) {
          cleanup();

          if (map.hasLayer(layer)) {
            cb();
          } else if (layer.__parent && layer.__parent._icon) {
            this.once("spiderfied", cb, this);
            layer.__parent.spiderfy();
          }
        }
      };

      if (layer._icon && map.getBounds().contains(layer.getLatLng())) {
        cb();
        return;
      }

      if (layer.__parent && layer.__parent._zoom < map.getZoom()) {
        map.on("moveend", showMarker, this);
        this.fire("animationend");
      } else if (layer.__parent) {
        map.on("moveend", showMarker, this);
        this.on("animationend", showMarker, this);
        layer.__parent.zoomToBounds();
      } else {
        map.setView(layer.getLatLng(), Math.max(map.getZoom(), 15));
        cb();
      }
    };
  }
}

export { L };
export default L;
