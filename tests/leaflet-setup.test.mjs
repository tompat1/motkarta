import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  setTimeout: setTimeout,
  clearTimeout: clearTimeout,
  requestAnimationFrame: (cb) => setTimeout(cb, 16),
  cancelAnimationFrame: (id) => clearTimeout(id),
  navigator: globalThis.navigator || { userAgent: 'node' },
  devicePixelRatio: 1,
  screen: { deviceXDPI: 1, logicalXDPI: 1 },
};
globalThis.document = {
  documentElement: { style: {} },
  createElement: () => ({ getContext: () => null, style: {} }),
  createElementNS: () => ({ style: {} }),
};

const leafletModule = await import('leaflet');
globalThis.L = leafletModule.default || leafletModule;

const { default: L } = await import('../src/lib/leafletSetup.ts');

test("L.Util.stamp handles undefined and null gracefully without throwing", () => {
  assert.doesNotThrow(() => {
    const resUndef = L.Util.stamp(undefined);
    assert.equal(resUndef, -1);
  });

  assert.doesNotThrow(() => {
    const resNull = L.Util.stamp(null);
    assert.equal(resNull, -1);
  });

  assert.doesNotThrow(() => {
    const resNum = L.Util.stamp(123);
    assert.equal(resNum, -1);
  });

  const obj = {};
  const id = L.Util.stamp(obj);
  assert.ok(typeof id === 'number' && id > 0, "Real objects should receive a valid leaflet ID");
  assert.equal(L.Util.stamp(obj), id, "Subsequent stamps should return the identical ID");
});

test("L.Map.prototype.hasLayer handles undefined and null safely", () => {
  // Create a mock leaflet map instance to check hasLayer
  const mockMap = Object.create(L.Map.prototype);
  mockMap._layers = {};

  assert.doesNotThrow(() => {
    assert.equal(mockMap.hasLayer(undefined), false);
    assert.equal(mockMap.hasLayer(null), false);
  });
});

test("L.MarkerClusterGroup prototype has safe clearLayers and zoomToShowLayer", () => {
  const clusterProto = L.MarkerClusterGroup.prototype;
  assert.ok(typeof clusterProto.clearLayers === 'function');
  assert.ok(typeof clusterProto.zoomToShowLayer === 'function');
});
