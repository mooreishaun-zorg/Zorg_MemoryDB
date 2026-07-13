import * as THREE from "./vendor/three/three.module.min.js";

const graphEl = document.getElementById("graph");
const detailsEl = document.getElementById("details");
const themeToggle = document.getElementById("themeToggle");
const memoryDbNameEl = document.getElementById("memoryDbName");
const memoryStatusTitleEl = document.getElementById("memoryStatusTitle");
const engineCountEls = document.querySelectorAll("[data-engine-count]");
const urlParams = new URLSearchParams(location.search);
const proxyPrefix = location.pathname.startsWith("/zorg-memory-3d") ? "/zorg-memory-3d" : "";
const embedParam = urlParams.get("embed");
const embedMode = embedParam !== null && embedParam !== "" && embedParam !== "0";

if (embedMode) document.documentElement.dataset.embed = "true";

function proxiedPath(path) {
  return `${proxyPrefix}${path}`;
}

window.addEventListener("error", (event) => {
  graphEl.dataset.unavailable = "true";
  graphEl.dataset.error = event.message;
});

let rawGraph = { nodes: [], links: [] };
let fitTimers = [];
let Graph = null;
let engineState = null;
let initialSnapshotLoaded = false;
let fitActivityTimer = null;
let lastInteractionAt = Date.now();
let focusedNodeId = null;
let selectedNodeId = null;
let lastFocusedNodePosition = null;
let lastGraphNodeClickAt = 0;
let graphPointerDown = null;
let lastPointerFocusAttempt = null;
const vectorBulletGroup = new THREE.Group();
const vectorBulletStates = new Map();
const seenPacketEventKeys = new Set();
const packetReceiptShapeCycles = new Map();
let shapeCycleTimer = null;
let vectorBulletAnimationFrame = null;
let packetReceiptRefreshFrame = null;
const idleFitMs = 30000;
let nodeShapeOpacity = 0.95;
let vectorOpacity = 0.9;
const vectorFlowSpeed = 0.0026;
let vectorFlowOpacity = 1;
let vectorDiameterVisualScale = 2;
let packetDataNodeVisualScale = 2;
let maxLiveVectorBullets = 420;
let packetBurstMin = 3;
let packetBurstMax = 7;
let packetBurstShotSpacingMin = 70;
let packetBurstShapeCycleMs = 1200;
const graphFitScreenFill = 0.96;
const nodeFocusScreenFill = 1.28;
let completedVectorPackets = 0;
let endpointShapeOscillations = 0;
let queuedVectorPacketBursts = 0;
let queuedVectorPacketShots = 0;
let replayedPacketEvents = 0;
let fallbackNodePacketEvents = 0;

const shapeVocabulary = [
  "facetedIcosahedron",
  "facetedDodecahedron",
  "facetedOctahedron",
  "triakisIcosahedron",
  "stellatedDodecahedron",
  "rhombicTriacontahedron"
];

function linkEndpointId(endpoint) {
  return endpoint?.id || endpoint;
}

function stableStringify(value, seen = new WeakSet()) {
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item, seen)).join(",")}]`;
  if (value && typeof value === "object") {
    if (seen.has(value)) return JSON.stringify("[Circular]");
    seen.add(value);
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key], seen)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function hashUnit(value, offset = 0) {
  let hash = 2166136261;
  const text = `${value}|${offset}`;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function applySceneDepthRules(material, opacity) {
  if (!material) return;
  const isOpaque = Number(opacity) >= 0.98;
  material.transparent = !isOpaque;
  material.depthTest = true;
  material.depthWrite = isOpaque;
  material.opacity = opacity;
  material.needsUpdate = true;
}

function applyServerMaterialDescriptor(material, descriptor, fallbackOpacity = 1) {
  if (!material) return;
  const opacity = Number.isFinite(Number(descriptor?.opacity)) ? Number(descriptor.opacity) : fallbackOpacity;
  material.opacity = Math.max(0.02, Math.min(1, opacity));
  material.transparent = Boolean(descriptor?.transparent);
  material.depthTest = descriptor?.depthTest !== false;
  material.depthWrite = descriptor?.depthWrite === true;
  material.needsUpdate = true;
}

function factSignature(item, exclude = []) {
  if (item?.source !== undefined && item?.target !== undefined) {
    return stableStringify({
      source: linkEndpointId(item.source),
      target: linkEndpointId(item.target),
      type: item.type || null,
      sourceTable: item.sourceTable || null,
      value: Number.isFinite(Number(item.value)) ? Number(item.value) : null,
      lastSeen: item.lastSeen || null
    });
  }
  const blocked = new Set([
    "x",
    "y",
    "z",
    "vx",
    "vy",
    "vz",
    "visualColor",
    "visualShape",
    "visualSignature",
    ...exclude
  ]);
  const facts = {};
  for (const [key, value] of Object.entries(item || {})) {
    if (blocked.has(key) || typeof value === "function" || value === undefined) continue;
    facts[key] = key === "source" || key === "target" ? linkEndpointId(value) : value;
  }
  return stableStringify(facts);
}

function visualNodeVal(node) {
  const engineSize = Number(node.val);
  return Number.isFinite(engineSize) ? Math.max(0.5, engineSize) : 2.6;
}

function visualNodeCameraRadius(node) {
  const collisionRadius = Number(node.collisionRadius);
  if (Number.isFinite(collisionRadius) && collisionRadius > 0) return collisionRadius;
  const renderedRadius = Number(node.renderedRadius);
  if (Number.isFinite(renderedRadius) && renderedRadius > 0) return renderedRadius;
  return Math.max(2, visualNodeVal(node));
}

function visualNodeColor(node) {
  if (node.material?.color) return node.material.color;
  if (node.visualColor) return node.visualColor;
  const signature = node.visualSignature || factSignature(node);
  const hue = Math.round(hashUnit(signature, 0) * 360);
  const saturation = 54 + Math.round(hashUnit(signature, 6) * 24);
  const lightness = 48 + Math.round(hashUnit(signature, 12) * 18);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function finalNodeShape(node) {
  const shape = node.settledVisualShape || node.visualShape;
  if (shapeVocabulary.includes(shape)) return shape;
  throw new Error(`Unavailable 3D node shape: ${shape || "missing"}`);
}

function nodeShapeCycleProgress(node) {
  const localCycle = packetReceiptShapeCycles.get(node?.id);
  if (localCycle) {
    const now = Date.now();
    if (now < localCycle.until) {
      return {
        startedAt: localCycle.startedAt,
        until: localCycle.until,
        elapsed: now - localCycle.startedAt,
        duration: Math.max(1, localCycle.until - localCycle.startedAt),
        localPacketReceipt: true,
        receiptCount: localCycle.receiptCount
      };
    }
    packetReceiptShapeCycles.delete(node.id);
  }

  const startedAt = new Date(node?.shapeCycleStartedAt || 0).getTime();
  const until = new Date(node?.shapeCycleUntil || 0).getTime();
  const now = Date.now();
  if (!Number.isFinite(startedAt) || !Number.isFinite(until) || now < startedAt || now >= until) return null;
  return { startedAt, until, elapsed: now - startedAt, duration: Math.max(1, until - startedAt) };
}

function visualNodeShape(node) {
  const finalShape = finalNodeShape(node);
  const cycle = nodeShapeCycleProgress(node);
  if (!cycle) return finalShape;
  const periodMs = cycle.localPacketReceipt ? 120 : 260;
  const offset = cycle.localPacketReceipt ? Number(cycle.receiptCount || 0) : 0;
  const cycleIndex = (Math.floor(cycle.elapsed / periodMs) + offset) % shapeVocabulary.length;
  return shapeVocabulary[cycleIndex];
}

function selectedNodeShapeText(node) {
  const current = visualNodeShape(node);
  const finalShape = finalNodeShape(node);
  return current === finalShape ? finalShape : `${current} -> ${finalShape}`;
}

function hasActiveShapeCycles() {
  const now = Date.now();
  for (const [nodeId, cycle] of packetReceiptShapeCycles.entries()) {
    if (cycle.until > now) return true;
    packetReceiptShapeCycles.delete(nodeId);
  }
  return (rawGraph.nodes || []).some((node) => nodeShapeCycleProgress(node));
}

function scheduleShapeCycleRefresh() {
  if (shapeCycleTimer) return;
  if (!hasActiveShapeCycles()) return;
  shapeCycleTimer = setTimeout(() => {
    shapeCycleTimer = null;
    if (Graph) {
      Graph.nodeThreeObject(buildNodeObject);
      if (typeof Graph.refresh === "function") Graph.refresh();
    }
    renderSelectedNode();
    scheduleShapeCycleRefresh();
  }, 260);
}

function geometryFaces(geometry) {
  const positions = geometry.attributes.position;
  const vertices = [];
  const vertexIds = new Map();
  const indices = [];
  const keyFor = (vector) => [vector.x, vector.y, vector.z].map((value) => value.toFixed(8)).join(",");
  const sourceIndex = geometry.index?.array || null;

  const addPosition = (positionIndex) => {
    const vector = new THREE.Vector3().fromBufferAttribute(positions, positionIndex).normalize();
    const key = keyFor(vector);
    let vertexIndex = vertexIds.get(key);
    if (vertexIndex === undefined) {
      vertexIndex = vertices.length;
      vertices.push(vector);
      vertexIds.set(key, vertexIndex);
    }
    indices.push(vertexIndex);
  };

  if (sourceIndex) {
    for (let index = 0; index < sourceIndex.length; index += 1) addPosition(sourceIndex[index]);
  } else {
    for (let index = 0; index < positions.count; index += 1) addPosition(index);
  }

  const faces = [];
  for (let index = 0; index < indices.length; index += 3) {
    faces.push([indices[index], indices[index + 1], indices[index + 2]]);
  }
  return { vertices, faces };
}

function buildClosedGeometry(vertices, faces, radius) {
  const positions = [];
  const center = new THREE.Vector3();
  for (const vertex of vertices) center.add(vertex);
  center.divideScalar(Math.max(1, vertices.length));

  for (const face of faces) {
    const faceCenter = new THREE.Vector3();
    for (const index of face) faceCenter.add(vertices[index]);
    faceCenter.divideScalar(face.length);

    for (let index = 1; index < face.length - 1; index += 1) {
      const triangle = [face[0], face[index], face[index + 1]];
      const a = vertices[triangle[0]];
      const b = vertices[triangle[1]];
      const c = vertices[triangle[2]];
      const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
      const outward = new THREE.Vector3().subVectors(faceCenter, center);
      if (normal.dot(outward) < 0) triangle.reverse();
      for (const vertexIndex of triangle) {
        const vertex = vertices[vertexIndex].clone().normalize().multiplyScalar(radius);
        positions.push(vertex.x, vertex.y, vertex.z);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createStellatedGeometry(baseGeometry, radius, spikeFactor) {
  const { vertices, faces } = geometryFaces(baseGeometry);
  const stellatedVertices = vertices.map((vertex) => vertex.clone().multiplyScalar(0.92));
  const stellatedFaces = [];

  for (const face of faces) {
    const apex = new THREE.Vector3();
    for (const vertexIndex of face) apex.add(vertices[vertexIndex]);
    apex.normalize().multiplyScalar(spikeFactor);
    const apexIndex = stellatedVertices.push(apex) - 1;
    for (let index = 0; index < face.length; index += 1) {
      stellatedFaces.push([face[index], face[(index + 1) % face.length], apexIndex]);
    }
  }

  return buildClosedGeometry(stellatedVertices, stellatedFaces, radius);
}

function createTriakisIcosahedronGeometry(radius) {
  return createStellatedGeometry(new THREE.IcosahedronGeometry(1, 0), radius, 1.28);
}

function createStellatedDodecahedronGeometry(radius) {
  return createStellatedGeometry(new THREE.DodecahedronGeometry(1, 0), radius, 1.24);
}

function createRhombicTriacontahedronGeometry(radius) {
  const { vertices: icoVertices, faces: icoFaces } = geometryFaces(new THREE.IcosahedronGeometry(1, 0));
  const dualVertices = [];
  const pentagonCenters = [];
  const triangleCenters = [];

  for (const vertex of icoVertices) {
    pentagonCenters.push(dualVertices.push(vertex.clone().normalize().multiplyScalar(1.08)) - 1);
  }
  for (const face of icoFaces) {
    const center = new THREE.Vector3();
    for (const vertexIndex of face) center.add(icoVertices[vertexIndex]);
    triangleCenters.push(dualVertices.push(center.normalize().multiplyScalar(0.82)) - 1);
  }

  const edgeFaces = new Map();
  for (let faceIndex = 0; faceIndex < icoFaces.length; faceIndex += 1) {
    const face = icoFaces[faceIndex];
    for (let index = 0; index < face.length; index += 1) {
      const a = face[index];
      const b = face[(index + 1) % face.length];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (!edgeFaces.has(key)) edgeFaces.set(key, []);
      edgeFaces.get(key).push(faceIndex);
    }
  }

  const rhombusFaces = [];
  for (const [key, adjacentFaces] of edgeFaces.entries()) {
    if (adjacentFaces.length !== 2) throw new Error(`Open rhombic triacontahedron edge: ${key}`);
    const [a, b] = key.split(":").map((value) => Number(value));
    rhombusFaces.push([
      pentagonCenters[a],
      triangleCenters[adjacentFaces[0]],
      pentagonCenters[b],
      triangleCenters[adjacentFaces[1]]
    ]);
  }

  return buildClosedGeometry(dualVertices, rhombusFaces, radius);
}

const shapeGeometryBuilders = {
  facetedIcosahedron: (radius) => new THREE.IcosahedronGeometry(radius * 1.1, 2),
  facetedDodecahedron: (radius) => new THREE.DodecahedronGeometry(radius * 1.08, 2),
  facetedOctahedron: (radius) => new THREE.OctahedronGeometry(radius * 1.12, 3),
  triakisIcosahedron: (radius) => createTriakisIcosahedronGeometry(radius * 1.2),
  stellatedDodecahedron: (radius) => createStellatedDodecahedronGeometry(radius * 1.18),
  rhombicTriacontahedron: (radius) => createRhombicTriacontahedronGeometry(radius * 1.14)
};
const nodeGeometryCache = new Map();

function geometryFaceCount(geometry) {
  const indexedTriangles = Number(geometry?.index?.count) / 3;
  if (Number.isFinite(indexedTriangles) && indexedTriangles > 0) return Math.floor(indexedTriangles);
  const positionTriangles = Number(geometry?.attributes?.position?.count) / 3;
  return Number.isFinite(positionTriangles) && positionTriangles > 0 ? Math.floor(positionTriangles) : null;
}

function createNodeGeometry(shape, radius) {
  const builder = shapeGeometryBuilders[shape];
  if (!builder) throw new Error(`Unavailable 3D geometry for node shape: ${shape}`);
  const cacheKey = `${shape}:${Number(radius).toFixed(2)}`;
  const cached = nodeGeometryCache.get(cacheKey);
  if (cached) return cached;
  const geometry = builder(radius);
  geometry.computeBoundingSphere();
  nodeGeometryCache.set(cacheKey, geometry);
  return geometry;
}

function nodeGeometryFaceCount(node) {
  if (!node?.id) return null;
  try {
    const size = visualNodeVal(node);
    const radius = Math.max(1.8, size * 0.88);
    const geometry = createNodeGeometry(visualNodeShape(node), radius);
    return geometryFaceCount(geometry);
  } catch (error) {
    console.warn("Unable to count node geometry faces", error);
    return null;
  }
}

function buildNodeObject(node) {
  const size = visualNodeVal(node);
  const color = visualNodeColor(node);
  const shape = visualNodeShape(node);
  const materialDescriptor = node.material || {};
  const material = new THREE.MeshStandardMaterial({
    color,
    transparent: Boolean(materialDescriptor.transparent),
    opacity: Number.isFinite(Number(materialDescriptor.opacity)) ? Number(materialDescriptor.opacity) : nodeShapeOpacity,
    depthWrite: materialDescriptor.depthWrite === true,
    depthTest: materialDescriptor.depthTest !== false,
    roughness: Number.isFinite(Number(materialDescriptor.roughness)) ? Number(materialDescriptor.roughness) : 0.48,
    metalness: Number.isFinite(Number(materialDescriptor.metalness)) ? Number(materialDescriptor.metalness) : 0.16,
    emissive: color,
    emissiveIntensity: Number.isFinite(Number(materialDescriptor.emissiveIntensity)) ? Number(materialDescriptor.emissiveIntensity) : 0.045,
    flatShading: materialDescriptor.flatShading !== false
  });
  applyServerMaterialDescriptor(material, materialDescriptor, nodeShapeOpacity);
  const radius = Math.max(1.8, size * 0.88);
  const geometry = createNodeGeometry(shape, radius);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = Number.isFinite(Number(materialDescriptor.renderOrder)) ? Number(materialDescriptor.renderOrder) : 0;
  mesh.userData.node = node;
  mesh.userData.objectFaceCount = geometryFaceCount(geometry);
  return mesh;
}

function visualNodeSurfaceRadius(node) {
  if (!node || typeof node !== "object") {
    const id = linkEndpointId(node);
    const graphNode = rawGraph.nodes.find((item) => item.id === id);
    if (graphNode) return visualNodeSurfaceRadius(graphNode);
  }
  const renderedRadius = Number(node?.renderedRadius);
  if (Number.isFinite(renderedRadius) && renderedRadius > 0) return renderedRadius;
  const size = visualNodeVal(node);
  const radius = Math.max(1.8, size * 0.88);
  let shape = null;
  try {
    shape = visualNodeShape(node);
  } catch (_error) {
    shape = null;
  }
  if (shape === "facetedIcosahedron") return radius * 1.1;
  if (shape === "facetedDodecahedron") return radius * 1.08;
  if (shape === "facetedOctahedron") return radius * 1.12;
  if (shape === "triakisIcosahedron") return radius * 1.2;
  if (shape === "stellatedDodecahedron") return radius * 1.18;
  if (shape === "rhombicTriacontahedron") return radius * 1.14;
  return radius * 1.1;
}

function baseVisualLinkWidth(link) {
  const engineWidth = Number(link.visualWidth ?? link.thickness ?? link.width);
  return Number.isFinite(engineWidth) ? Math.max(0.08, engineWidth) : 0.68;
}

function visualLinkWidth(link) {
  const mode = currentServerMaterialMode(link);
  const diameter = Number(mode?.vector?.diameter);
  if (Number.isFinite(diameter)) return Math.max(0.08, diameter);
  return baseVisualLinkWidth(link) * vectorDiameterVisualScale;
}

function vectorRenderPath(link, start, end) {
  const source = new THREE.Vector3(Number(start.x), Number(start.y), Number(start.z));
  const target = new THREE.Vector3(Number(end.x), Number(end.y), Number(end.z));
  const direction = new THREE.Vector3().subVectors(target, source);
  const length = direction.length();
  if (![source.x, source.y, source.z, target.x, target.y, target.z, length].every(Number.isFinite) || length < 0.001) {
    return { valid: false };
  }

  const diameter = visualLinkWidth(link);
  const unitDirection = direction.normalize();

  return {
    valid: true,
    hardClipped: false,
    length,
    straightLength: length,
    diameter,
    start: source,
    end: target,
    direction: unitDirection,
    points: [source, target]
  };
}

function currentVisualMode(link) {
  const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  return link.visualModes?.[theme] || link.visualModes?.dark || link.visualModes?.light || null;
}

function currentServerMaterialMode(link) {
  const theme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
  return link.materialModes?.[theme] || link.materialModes?.dark || link.materialModes?.light || null;
}

function visualLinkColor(link) {
  const materialMode = currentServerMaterialMode(link);
  if (materialMode?.vector?.color) return materialMode.vector.color;
  const mode = currentVisualMode(link);
  if (mode?.color) return mode.color;
  const signature = factSignature({
    source: linkEndpointId(link.source),
    target: linkEndpointId(link.target),
    type: link.type,
    sourceTable: link.sourceTable,
    value: Number.isFinite(Number(link.value)) ? Number(link.value) : null,
    lastSeen: link.lastSeen
  });
  const hue = Math.round(hashUnit(signature, 4) * 360);
  const saturation = 42 + Math.round(hashUnit(signature, 10) * 28);
  const lightness = document.documentElement.dataset.theme === "light" ? 34 + Math.round(hashUnit(signature, 16) * 16) : 52 + Math.round(hashUnit(signature, 16) * 22);
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function parseHslColor(color) {
  const match = String(color || "").match(/hsla?\(\s*([-\d.]+)(?:deg)?\s*,\s*([-\d.]+)%\s*,\s*([-\d.]+)%/i);
  if (!match) return null;
  return {
    hue: Number(match[1]),
    saturation: Number(match[2]),
    lightness: Number(match[3])
  };
}

function oppositeColorFrom(color, signature = "") {
  const hsl = parseHslColor(color);
  if (hsl && [hsl.hue, hsl.saturation, hsl.lightness].every(Number.isFinite)) {
    const hue = (hsl.hue + 180 + 360) % 360;
    const saturation = Math.max(72, Math.min(100, hsl.saturation + 18));
    const invertedLightness = 100 - hsl.lightness;
    const lightness = Math.max(24, Math.min(86, invertedLightness));
    return `hsla(${Math.round(hue)}, ${Math.round(saturation)}%, ${Math.round(lightness)}%, ${vectorFlowOpacity.toFixed(3)})`;
  }

  const fallbackHue = Math.round((hashUnit(signature, 44) * 360 + 180) % 360);
  const fallbackLightness = document.documentElement.dataset.theme === "light" ? 24 : 84;
  return `hsla(${fallbackHue}, 92%, ${fallbackLightness}%, ${vectorFlowOpacity.toFixed(3)})`;
}

function visualLinkOpacity(link) {
  const materialMode = currentServerMaterialMode(link);
  const materialOpacity = Number(materialMode?.vector?.opacity);
  if (Number.isFinite(materialOpacity)) return Math.max(0.02, Math.min(1, materialOpacity));
  const mode = currentVisualMode(link);
  const opacity = Number(mode?.opacity);
  return Number.isFinite(opacity) ? Math.max(0.02, Math.min(vectorOpacity, opacity)) : vectorOpacity;
}

function visualParticleCount(link) {
  const mode = currentVisualMode(link);
  const engineCount = Number(mode?.particleCount);
  if (Number.isFinite(engineCount)) return Math.max(3, Math.min(8, Math.round(engineCount)));
  const value = Math.max(0.05, Number(link.value || 1));
  return Math.max(3, Math.min(5, Math.floor(Math.log2(value + 1)) + 2));
}

function visualParticleColor(link) {
  const materialMode = currentServerMaterialMode(link);
  if (materialMode?.packet?.color) return materialMode.packet.color;
  return oppositeColorFrom(visualLinkColor(link), factSignature(link));
}

function visualParticleSpeed(link) {
  const mode = currentVisualMode(link);
  const engineCount = Math.max(1, Number(mode?.particleCount) || visualParticleCount(link));
  return Math.max(0.0016, Math.min(0.0032, vectorFlowSpeed / Math.sqrt(engineCount / 3)));
}

function vectorPacketBurstSize(link, state) {
  const signature = factSignature(link);
  const sequence = Number(state?.sequence || 0);
  const spread = packetBurstMax - packetBurstMin + 1;
  return packetBurstMin + Math.floor(hashUnit(`${signature}:${sequence}`, 82) * spread);
}

function vectorPacketShotSpacing(link, state) {
  const signature = factSignature(link);
  const sequence = Number(state?.sequence || 0);
  return packetBurstShotSpacingMin + hashUnit(`${signature}:${sequence}`, 83) * 155;
}

function visualParticleWidth(link) {
  const materialMode = currentServerMaterialMode(link);
  const serverWidth = Number(materialMode?.packet?.width);
  if (Number.isFinite(serverWidth)) return Math.max(1, serverWidth);
  const mode = currentVisualMode(link);
  const engineWidth = Number(mode?.particleWidth);
  const baseWidth = Number.isFinite(engineWidth) ? Math.max(1, engineWidth) : Math.max(2.4, baseVisualLinkWidth(link) * 1.35);
  return baseWidth * packetDataNodeVisualScale;
}

function buildVectorFlowParticle(link) {
  const radius = Math.max(1.8, visualParticleWidth(link) / 2);
  const geometry = new THREE.SphereGeometry(radius, 12, 12);
  const materialDescriptor = currentServerMaterialMode(link)?.packet || {};
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setStyle(visualParticleColor(link)),
    transparent: Boolean(materialDescriptor.transparent),
    opacity: Number.isFinite(Number(materialDescriptor.opacity)) ? Number(materialDescriptor.opacity) : vectorFlowOpacity,
    depthTest: materialDescriptor.depthTest !== false,
    depthWrite: materialDescriptor.depthWrite === true
  });
  applyServerMaterialDescriptor(material, materialDescriptor, vectorFlowOpacity);
  const particle = new THREE.Mesh(geometry, material);
  particle.renderOrder = Number.isFinite(Number(materialDescriptor.renderOrder)) ? Number(materialDescriptor.renderOrder) : 0;
  return particle;
}

function vectorBulletKey(link) {
  return link.key || linkKey(link);
}

function findVectorLinkForPacketEvent(event) {
  const eventKey = event?.link?.key || event?.linkKey;
  if (eventKey) {
    const byKey = (rawGraph.links || []).find((link) => vectorBulletKey(link) === eventKey || linkKey(link) === eventKey);
    if (byKey) return byKey;
  }
  const sourceId = event?.sourceId || linkEndpointId(event?.link?.source);
  const targetId = event?.targetId || linkEndpointId(event?.link?.target);
  if (sourceId && targetId) {
    const byEndpoints = (rawGraph.links || []).find((link) => linkEndpointId(link.source) === sourceId && linkEndpointId(link.target) === targetId);
    if (byEndpoints) return byEndpoints;
  }
  return event?.link || null;
}

function vectorBulletNode(endpoint) {
  if (endpoint && typeof endpoint === "object") return endpoint;
  const id = linkEndpointId(endpoint);
  return rawGraph.nodes.find((node) => node.id === id) || null;
}

function nodeVectorPosition(node) {
  const x = Number(node?.x);
  const y = Number(node?.y);
  const z = Number(node?.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return new THREE.Vector3(x, y, z);
}

function vectorBulletTravelDuration(link, state) {
  const signature = factSignature(link);
  const sequence = Number(state?.sequence || 0);
  const speed = Math.max(0.0012, Math.min(0.0042, visualParticleSpeed(link)));
  const baseDuration = 1000 / speed / 1.72;
  const jitter = 0.72 + hashUnit(`${signature}:${sequence}`, 62) * 0.64;
  return Math.max(900, Math.min(4200, baseDuration * jitter));
}

function recolorVectorBullet(bullet, link) {
  if (!bullet?.material) return;
  bullet.material.color = new THREE.Color().setStyle(visualParticleColor(link));
  applyServerMaterialDescriptor(bullet.material, currentServerMaterialMode(link)?.packet, vectorFlowOpacity);
}

function disposeVectorBullet(bullet) {
  vectorBulletGroup.remove(bullet);
  bullet.geometry?.dispose?.();
  bullet.material?.dispose?.();
}

function liveVectorBulletCount() {
  let count = 0;
  for (const state of vectorBulletStates.values()) count += state.bullets.length;
  return count;
}

function schedulePacketReceiptRefresh(nodeId = null) {
  if (nodeId && selectedNodeId === nodeId) {
    const node = findNodeById(nodeId);
    if (node) renderSelectedNode(node);
  }
  if (packetReceiptRefreshFrame) return;
  packetReceiptRefreshFrame = requestAnimationFrame(() => {
    packetReceiptRefreshFrame = null;
    if (Graph) {
      Graph.nodeThreeObject(buildNodeObject);
      if (typeof Graph.refresh === "function") Graph.refresh();
    }
    scheduleShapeCycleRefresh();
  });
}

function triggerPacketReceiptShapeCycle(nodeId) {
  if (!nodeId) return;
  const node = findNodeById(nodeId);
  if (!node) return;
  const now = Date.now();
  const existing = packetReceiptShapeCycles.get(nodeId);
  const receiptCount = Number(existing?.receiptCount || 0) + 1;
  packetReceiptShapeCycles.set(nodeId, {
    startedAt: now,
    until: now + packetBurstShapeCycleMs,
    receiptCount
  });
  endpointShapeOscillations += 1;
  node.packetReceiptPulseAt = new Date(now).toISOString();
  schedulePacketReceiptRefresh(nodeId);
}

function fireVectorBullet(link, state, now) {
  const source = nodeVectorPosition(vectorBulletNode(link.source));
  const target = nodeVectorPosition(vectorBulletNode(link.target));
  if (!source || !target || source.distanceToSquared(target) < 1e-6) return false;
  const path = vectorRenderPath(link, source, target);
  if (!path.valid) {
    return false;
  }

  const bullet = buildVectorFlowParticle(link);
  bullet.position.copy(path.start);
  bullet.userData.vectorBullet = {
    firedAt: now,
    duration: vectorBulletTravelDuration(link, state),
    completed: false,
    sequence: state.sequence,
    sourceId: linkEndpointId(link.source),
    targetId: linkEndpointId(link.target),
    hardClippedPath: false,
    straightVectorPath: true
  };
  vectorBulletGroup.add(bullet);
  state.bullets.push(bullet);
  return true;
}

function syncVectorBulletStates() {
  const liveKeys = new Set();

  for (const link of rawGraph.links || []) {
    const key = vectorBulletKey(link);
    liveKeys.add(key);
    if (!vectorBulletStates.has(key)) {
      const signature = factSignature(link);
      vectorBulletStates.set(key, {
        link,
        bullets: [],
        sequence: 0,
        pendingBurstShots: 0,
        nextBurstShotAt: 0,
        burstShotSpacing: 120,
        eventDriven: true,
        packetSource: "database-events",
        signature
      });
    } else {
      vectorBulletStates.get(key).link = link;
    }
  }

  for (const [key, state] of [...vectorBulletStates.entries()]) {
    if (liveKeys.has(key)) continue;
    for (const bullet of state.bullets) disposeVectorBullet(bullet);
    vectorBulletStates.delete(key);
  }

  if (!vectorBulletAnimationFrame) animateVectorBullets();
}

function queueVectorPacketBurst(link, packetEvent = {}) {
  if (!link) return false;
  const key = vectorBulletKey(link);
  if (!vectorBulletStates.has(key)) {
    vectorBulletStates.set(key, {
      link,
      bullets: [],
      sequence: 0,
      pendingBurstShots: 0,
      nextBurstShotAt: 0,
      burstShotSpacing: 120,
      eventDriven: true,
      packetSource: "database-events",
      signature: factSignature(link)
    });
  }
  const state = vectorBulletStates.get(key);
  state.link = link;
  const requested = Number(packetEvent.packetCount || packetEvent.packet_count || 0);
  const fallback = vectorPacketBurstSize(link, state);
  const packetCount = Math.max(1, Math.min(12, Number.isFinite(requested) && requested > 0 ? Math.round(requested) : fallback));
  state.pendingBurstShots += packetCount;
  state.burstShotSpacing = vectorPacketShotSpacing(link, state);
  state.nextBurstShotAt = Math.max(performance.now(), Number(state.nextBurstShotAt || 0));
  state.lastPacketEvent = {
    at: Date.now(),
    linkKey: packetEvent.linkKey || key,
    dataByteSize: packetEvent.dataByteSize || null,
    triggerType: packetEvent.triggerType || packetEvent.type || "database_event"
  };
  queuedVectorPacketBursts += 1;
  queuedVectorPacketShots += packetCount;
  if (!vectorBulletAnimationFrame) animateVectorBullets();
  return true;
}

function queueVectorPacketEvent(event) {
  if (event?.type !== "vector_data_packet") return false;
  return queueVectorPacketBurst(findVectorLinkForPacketEvent(event), event);
}

function packetEventReplayKey(event, link = null) {
  const eventId = event?.event_id || event?.eventId;
  if (eventId) return `db:${eventId}`;
  const key = event?.linkKey || event?.link?.key || (link ? vectorBulletKey(link) : "");
  const trigger = event?.triggerNodeId || event?.nodeId || "";
  const at = event?.at || event?.created_at || event?.node?.pulseAt || event?.node?.shapeCycleStartedAt || "";
  const tick = event?.tick ?? event?.engineTick ?? "";
  const type = event?.triggerType || event?.type || "database_event";
  return `${type}:${key}:${trigger}:${at}:${tick}`;
}

function rememberPacketEventKey(key) {
  if (!key) return false;
  if (seenPacketEventKeys.has(key)) return false;
  seenPacketEventKeys.add(key);
  if (seenPacketEventKeys.size > 1200) {
    const removeCount = seenPacketEventKeys.size - 900;
    let removed = 0;
    for (const existing of seenPacketEventKeys) {
      seenPacketEventKeys.delete(existing);
      removed += 1;
      if (removed >= removeCount) break;
    }
  }
  return true;
}

function linksConnectedToNode(nodeId) {
  if (!nodeId) return [];
  return (rawGraph.links || []).filter((link) => linkEndpointId(link.source) === nodeId || linkEndpointId(link.target) === nodeId);
}

function nodePacketTriggerId(event) {
  if (event?.triggerNodeId) return event.triggerNodeId;
  if (event?.type === "node_spawned" || event?.type === "node_changed") return event.nodeId || event.node?.id;
  return null;
}

function queueNodeChangePacketEvents(event, remaining = 72) {
  const nodeId = nodePacketTriggerId(event);
  if (!nodeId || remaining <= 0) return 0;
  let queued = 0;
  for (const link of linksConnectedToNode(nodeId)) {
    if (queued >= remaining) break;
    const linkEvent = {
      type: "vector_data_packet",
      link,
      linkKey: vectorBulletKey(link),
      sourceId: linkEndpointId(link.source),
      targetId: linkEndpointId(link.target),
      triggerType: event.type,
      triggerNodeId: nodeId,
      dataByteSize: event.node?.dataByteSize || link.dataByteSize || null,
      packetCount: event.node?.dataRows ? Math.max(1, Math.min(12, Math.ceil(Math.log2(Number(event.node.dataRows) + 1)))) : undefined,
      at: event.at || event.node?.pulseAt || event.node?.shapeCycleStartedAt || null,
      tick: event.tick ?? null
    };
    const key = `node-fallback:${packetEventReplayKey(linkEvent, link)}`;
    if (!rememberPacketEventKey(key)) continue;
    if (queueVectorPacketBurst(link, linkEvent)) {
      queued += 1;
      fallbackNodePacketEvents += 1;
    }
  }
  return queued;
}

function queuePacketEvents(events = []) {
  if (!events.length) return 0;
  let queued = 0;
  for (const event of events) {
    if (event?.type !== "vector_data_packet") continue;
    const link = findVectorLinkForPacketEvent(event);
    const key = `packet:${packetEventReplayKey(event, link)}`;
    if (!rememberPacketEventKey(key)) continue;
    if (queueVectorPacketBurst(link, event)) {
      queued += 1;
      replayedPacketEvents += 1;
    }
  }

  if (queued > 0) return queued;
  let fallbackQueued = 0;
  for (const event of events) {
    if (event?.type !== "node_spawned" && event?.type !== "node_changed") continue;
    fallbackQueued += queueNodeChangePacketEvents(event, Math.max(0, 72 - fallbackQueued));
    if (fallbackQueued >= 72) break;
  }
  return fallbackQueued;
}

function updateVectorBulletTheme() {
  for (const state of vectorBulletStates.values()) {
    for (const bullet of state.bullets) recolorVectorBullet(bullet, state.link);
  }
}

window.__zorgVectorBulletStats = () => {
  const now = performance.now();
  const progresses = [];
  let pendingBurstShots = 0;
  let vectorTubeMeshes = 0;
  let visibleVectorTubeMeshes = 0;
  let sampleVectorTubeDiameter = null;
  let sampleNodeMaterialOpacity = null;
  let sampleNodeDepthWrite = null;
  let sampleNodeDepthTest = null;
  let sampleVectorTubeMaterialOpacity = null;
  let sampleVectorTubeDepthWrite = null;
  let sampleVectorTubeDepthTest = null;
  let samplePacketMaterialOpacity = null;
  let samplePacketDepthWrite = null;
  let samplePacketDepthTest = null;
  let samplePacketRenderOrder = null;
  const vectorTubeDiameters = [];
  let vectorTubesHardClipped = 0;
  let straightVectorTubeMeshes = 0;
  for (const state of vectorBulletStates.values()) {
    pendingBurstShots += Number(state.pendingBurstShots || 0);
    for (const bullet of state.bullets) {
      const shot = bullet.userData.vectorBullet;
      progresses.push(Math.min(1, Math.max(0, (now - shot.firedAt) / shot.duration)));
      if (samplePacketMaterialOpacity === null && Number.isFinite(Number(bullet.material?.opacity))) {
        samplePacketMaterialOpacity = Number(bullet.material.opacity);
      }
      if (samplePacketDepthWrite === null && bullet.material) samplePacketDepthWrite = Boolean(bullet.material.depthWrite);
      if (samplePacketDepthTest === null && bullet.material) samplePacketDepthTest = Boolean(bullet.material.depthTest);
      if (samplePacketRenderOrder === null) samplePacketRenderOrder = Number(bullet.renderOrder || 0);
    }
  }
  if (typeof Graph?.scene === "function") {
    Graph.scene().traverse((object) => {
      if (sampleNodeMaterialOpacity === null && object?.userData?.node && Number.isFinite(Number(object.material?.opacity))) {
        sampleNodeMaterialOpacity = Number(object.material.opacity);
        sampleNodeDepthWrite = Boolean(object.material.depthWrite);
        sampleNodeDepthTest = Boolean(object.material.depthTest);
      }
      if (object?.userData?.vectorTube) {
        vectorTubeMeshes += 1;
        if (!object.visible) return;
        visibleVectorTubeMeshes += 1;
        const path = object.userData.vectorPath;
        if (path?.hardClipped) vectorTubesHardClipped += 1;
        if (path?.straightVector) straightVectorTubeMeshes += 1;
      }
      if (object?.userData?.vectorTubeSegment) {
        const diameter = object.scale.x * 2;
        if (Number.isFinite(diameter)) vectorTubeDiameters.push(diameter);
        if (sampleVectorTubeMaterialOpacity === null && Number.isFinite(Number(object.material?.opacity))) {
          sampleVectorTubeMaterialOpacity = Number(object.material.opacity);
          sampleVectorTubeDepthWrite = Boolean(object.material.depthWrite);
          sampleVectorTubeDepthTest = Boolean(object.material.depthTest);
        }
        if (sampleVectorTubeDiameter === null && Number.isFinite(diameter) && Math.abs(diameter - 2) > 0.001) sampleVectorTubeDiameter = diameter;
      }
    });
  }
  vectorTubeDiameters.sort((a, b) => a - b);
  return {
    browserRole: "thin-render-client",
    browserOwnsEngineState: false,
    browserOwnsMaterials: false,
    serverMaterialDescriptors: {
      nodes: (rawGraph.nodes || []).filter((node) => node.material?.owner === "server-game-engine").length,
      links: (rawGraph.links || []).filter((link) => (
        link.materialModes?.dark?.vector?.owner === "server-game-engine" &&
        link.materialModes?.dark?.packet?.owner === "server-game-engine"
      )).length
    },
    browserNodeDragEnabled: false,
    nodePositionsFixedFromServerSnapshot: (rawGraph.nodes || []).every((node) => (
      Number(node.x) === Number(node.fx) &&
      Number(node.y) === Number(node.fy) &&
      Number(node.z) === Number(node.fz)
    )),
    vectorStates: vectorBulletStates.size,
    liveBullets: progresses.length,
    pendingBurstShots,
    completedPackets: completedVectorPackets,
    endpointShapeOscillations,
    queuedPacketBursts: queuedVectorPacketBursts,
    queuedPacketShots: queuedVectorPacketShots,
    replayedPacketEvents,
    fallbackNodePacketEvents,
    seenPacketEvents: seenPacketEventKeys.size,
    ambientTimerEnabled: false,
    packetSource: "database-events-only",
    vectorDiameterVisualScale,
    packetDataNodeVisualScale,
    vectorGeometry: "straight",
    nodeOpacity: nodeShapeOpacity,
    vectorOpacity,
    packetOpacity: vectorFlowOpacity,
    sampleVectorDiameter: rawGraph.links[0] ? visualLinkWidth(rawGraph.links[0]) : null,
    vectorTubeMeshes,
    sampleVectorTubeDiameter: sampleVectorTubeDiameter ?? vectorTubeDiameters[0] ?? null,
    sampleNodeMaterialOpacity,
    sampleNodeDepthWrite,
    sampleNodeDepthTest,
    sampleVectorTubeMaterialOpacity,
    sampleVectorTubeDepthWrite,
    sampleVectorTubeDepthTest,
    samplePacketMaterialOpacity,
    samplePacketDepthWrite,
    samplePacketDepthTest,
    samplePacketRenderOrder,
    minVectorTubeDiameter: vectorTubeDiameters[0] ?? null,
    maxVectorTubeDiameter: vectorTubeDiameters.at(-1) ?? null,
    updatedVectorTubeMeshes: vectorTubeDiameters.filter((diameter) => Math.abs(diameter - 2) > 0.001).length,
    visibleVectorTubeMeshes,
    vectorTubesHardClipped,
    vectorTubeCollisionDetours: 0,
    vectorTubeAvoidedObjects: 0,
    vectorTubeRemainingCollisions: 0,
    routedVectorTubeMeshes: 0,
    straightVectorTubeMeshes,
    vectorTubesClippedAtNodeSurface: 0,
    vectorTubesHiddenInsideNodes: 0,
    minVectorTubeClipRatio: null,
    maxVectorTubeClipRatio: null,
    samplePacketDiameter: rawGraph.links[0] ? visualParticleWidth(rawGraph.links[0]) : null,
    activeEndpointShapeCycles: packetReceiptShapeCycles.size,
    distinctProgressBuckets: new Set(progresses.map((progress) => Math.round(progress * 20))).size,
    minProgress: progresses.length ? Math.min(...progresses) : null,
    maxProgress: progresses.length ? Math.max(...progresses) : null,
    graphNodes: rawGraph.nodes.length,
    graphLinks: rawGraph.links.length,
    bounds: graphBounds(rawGraph),
    camera: typeof Graph?.camera === "function" ? {
      x: Graph.camera().position.x,
      y: Graph.camera().position.y,
      z: Graph.camera().position.z
    } : null,
    controlsTarget: typeof Graph?.controls === "function" ? {
      x: Graph.controls().target.x,
      y: Graph.controls().target.y,
      z: Graph.controls().target.z
    } : null
  };
};

window.__zorgVectorOcclusionStats = () => {
  const nodesById = new Map((rawGraph.nodes || []).map((node) => [node.id, node]));
  let invalid = 0;
  let fullLengthVectors = 0;
  let straightVectors = 0;
  for (const link of rawGraph.links || []) {
    const source = typeof link.source === "object" ? link.source : nodesById.get(linkEndpointId(link.source));
    const target = typeof link.target === "object" ? link.target : nodesById.get(linkEndpointId(link.target));
    if (!source || !target) {
      invalid += 1;
      continue;
    }
    const path = vectorRenderPath(link, source, target);
    if (!path.valid) {
      invalid += 1;
      continue;
    }
    fullLengthVectors += 1;
    if (path.points?.length === 2) straightVectors += 1;
  }
  return {
    browserRole: "thin-render-client",
    browserOwnsEngineState: false,
    browserOwnsMaterials: false,
    graphNodes: rawGraph.nodes.length,
    graphLinks: rawGraph.links.length,
    fullLengthVectors,
    straightVectors,
    collisionRoutedVectors: 0,
    avoidedObjects: 0,
    remainingVectorObjectCollisions: 0,
    hardClippedVectors: 0,
    hiddenInsideNodes: 0,
    invalid,
    minClipRatio: null,
    maxClipRatio: null,
    nodeOpacity: nodeShapeOpacity,
    vectorOpacity,
    vectorDiameterVisualScale,
    vectorGeometry: "straight"
  };
};

function interpolateVectorPath(points, progress) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const boundedProgress = Math.max(0, Math.min(1, progress));
  const segmentLengths = [];
  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const length = points[index].distanceTo(points[index + 1]);
    segmentLengths.push(length);
    totalLength += length;
  }
  if (!Number.isFinite(totalLength) || totalLength < 0.001) return points[0].clone();
  let remaining = totalLength * boundedProgress;
  for (let index = 0; index < segmentLengths.length; index += 1) {
    const length = segmentLengths[index];
    if (remaining <= length || index === segmentLengths.length - 1) {
      const localProgress = length > 0 ? remaining / length : 0;
      return points[index].clone().lerp(points[index + 1], Math.max(0, Math.min(1, localProgress)));
    }
    remaining -= length;
  }
  return points.at(-1).clone();
}

function animateVectorBullets() {
  vectorBulletAnimationFrame = requestAnimationFrame(animateVectorBullets);
  const now = performance.now();
  let liveCount = liveVectorBulletCount();

  for (const state of vectorBulletStates.values()) {
    const link = state.link;
    if (state.pendingBurstShots > 0 && now >= state.nextBurstShotAt && liveCount < maxLiveVectorBullets) {
      if (fireVectorBullet(link, state, now)) {
        liveCount += 1;
        state.sequence += 1;
      }
      state.pendingBurstShots -= 1;
      state.nextBurstShotAt = now + state.burstShotSpacing;
    }

    state.bullets = state.bullets.filter((bullet) => {
      const source = nodeVectorPosition(vectorBulletNode(link.source));
      const target = nodeVectorPosition(vectorBulletNode(link.target));
      if (!source || !target) {
        disposeVectorBullet(bullet);
        return false;
      }

      const path = vectorRenderPath(link, source, target);
      if (!path.valid) {
        const shot = bullet.userData.vectorBullet;
        if (!shot.completed) {
          shot.completed = true;
          completedVectorPackets += 1;
          triggerPacketReceiptShapeCycle(shot.targetId);
        }
        disposeVectorBullet(bullet);
        return false;
      }

      const shot = bullet.userData.vectorBullet;
      const progress = Math.min(1, (now - shot.firedAt) / shot.duration);
      const straightPathPosition = interpolateVectorPath(path.points, progress);
      if (straightPathPosition) bullet.position.copy(straightPathPosition);
      if (bullet.material) {
        applyServerMaterialDescriptor(bullet.material, currentServerMaterialMode(link)?.packet, vectorFlowOpacity);
      }
      if (progress < 1) return true;
      if (!shot.completed) {
        shot.completed = true;
        completedVectorPackets += 1;
        triggerPacketReceiptShapeCycle(shot.targetId);
      }
      disposeVectorBullet(bullet);
      return false;
    });
  }
}

function markInteraction() {
  lastInteractionAt = Date.now();
  scheduleIdleFit();
}

function displayIsIdle() {
  return Date.now() - lastInteractionAt >= idleFitMs - 250;
}

function findNodeById(nodeId) {
  return (rawGraph.nodes || []).find((item) => item.id === nodeId);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function nodeVisibleDegree(node) {
  if (!node?.id) return 0;
  return (rawGraph.links || []).filter((link) => (
    linkEndpointId(link.source) === node.id || linkEndpointId(link.target) === node.id
  )).length;
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString() : "unavailable";
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "unavailable";
  if (bytes < 1024) return `${Math.round(bytes).toLocaleString()} B`;
  const units = ["KB", "MB", "GB"];
  let amount = bytes / 1024;
  let unitIndex = 0;
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024;
    unitIndex += 1;
  }
  return `${amount >= 10 ? amount.toFixed(1) : amount.toFixed(2)} ${units[unitIndex]}`;
}

function formatTimestamp(value) {
  const time = Number(value);
  const date = Number.isFinite(time) ? new Date(time) : new Date(value || 0);
  if (Number.isNaN(date.getTime())) return "unavailable";
  return date.toISOString();
}

function formatLocation(node) {
  const x = Number(node?.x);
  const y = Number(node?.y);
  const z = Number(node?.z);
  if (![x, y, z].every(Number.isFinite)) return "unavailable";
  return `x ${x.toFixed(2)}, y ${y.toFixed(2)}, z ${z.toFixed(2)}`;
}

function orbitSummary(node) {
  if (!node?.orbitAnchorId) return "not orbiting";
  const anchor = findNodeById(node.orbitAnchorId);
  const anchorName = anchor?.label || anchor?.name || node.orbitAnchorId;
  const parts = [`${anchorName}`];
  if (Number.isFinite(Number(node.orbitCurrentLongitude)) && Number.isFinite(Number(node.orbitCurrentLatitude))) {
    parts.push(`lon ${Number(node.orbitCurrentLongitude).toFixed(2)}, lat ${Number(node.orbitCurrentLatitude).toFixed(2)}`);
  }
  if (Number.isFinite(Number(node.orbitRadius))) parts.push(`radius ${Number(node.orbitRadius).toFixed(2)}`);
  return parts.join("; ");
}

function renderSelectedNode(node = null) {
  const current = node?.id ? findNodeById(node.id) || node : selectedNodeId ? findNodeById(selectedNodeId) : null;
  if (!current) {
    detailsEl.innerHTML = '<p class="empty">Click a node to inspect it.</p>';
    return;
  }
  const rows = [
    ["3D object", selectedNodeShapeText(current)],
    ["Object faces", formatNumber(nodeGeometryFaceCount(current))],
    ["Type", current.group || current.type || "unavailable"],
    ["Location", formatLocation(current)],
    ["Timestamp", formatTimestamp(current.timestampMs || current.lastSeen)],
    ["Orbit", orbitSummary(current)],
    ["Data size", formatBytes(current.dataByteSize)],
    ["Data rows", formatNumber(current.dataRows)],
    ["Visible vectors", nodeVisibleDegree(current)],
    ["Rendered radius", Number(current.renderedRadius || visualNodeVal(current)).toFixed(2)],
    ["Collision radius", Number(visualNodeCameraRadius(current)).toFixed(2)]
  ];
  detailsEl.innerHTML = `
    <strong>${escapeHtml(current.label || current.name || current.id)}</strong>
    <dl>
      ${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}
    </dl>
  `;
}

function graphBounds(graph = rawGraph) {
  const nodes = graph.nodes || [];
  const positioned = nodes
    .map((node) => ({
      id: node.id,
      x: Number(node.x),
      y: Number(node.y),
      z: Number(node.z),
      radius: visualNodeCameraRadius(node)
    }))
    .filter((node) => [node.x, node.y, node.z].every(Number.isFinite));
  if (!positioned.length) return null;
  const min = {
    x: Math.min(...positioned.map((node) => node.x - node.radius)),
    y: Math.min(...positioned.map((node) => node.y - node.radius)),
    z: Math.min(...positioned.map((node) => node.z - node.radius))
  };
  const max = {
    x: Math.max(...positioned.map((node) => node.x + node.radius)),
    y: Math.max(...positioned.map((node) => node.y + node.radius)),
    z: Math.max(...positioned.map((node) => node.z + node.radius))
  };
  const center = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2
  };
  const radius = Math.max(
    ...positioned.map((node) => Math.hypot(node.x - center.x, node.y - center.y, node.z - center.z) + node.radius),
    1
  );
  const largestNode = positioned.reduce((largest, node) => (!largest || node.radius > largest.radius ? node : largest), null);
  const span = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, radius * 2, 1);
  return { center, span, radius, largestNode };
}

function cameraFitDistanceForRadius(radius, padding = 1.0) {
  const camera = typeof Graph?.camera === "function" ? Graph.camera() : null;
  const verticalFov = Number(camera?.fov);
  const verticalRadians = (Number.isFinite(verticalFov) ? verticalFov : 60) * (Math.PI / 180);
  const aspect = Math.max(0.66, graphEl.clientWidth / Math.max(1, graphEl.clientHeight));
  const horizontalRadians = 2 * Math.atan(Math.tan(verticalRadians / 2) * aspect);
  const limitingRadians = Math.max(0.1, Math.min(verticalRadians, horizontalRadians));
  return Math.max(60, (Math.max(1, radius) * padding) / Math.sin(limitingRadians / 2));
}

function currentViewDirection(target) {
  const camera = typeof Graph?.camera === "function" ? Graph.camera() : null;
  const controls = typeof Graph?.controls === "function" ? Graph.controls() : null;
  const origin = controls?.target || target;
  const dx = Number(camera?.position?.x) - Number(origin?.x);
  const dy = Number(camera?.position?.y) - Number(origin?.y);
  const dz = Number(camera?.position?.z) - Number(origin?.z);
  const distance = Math.hypot(dx, dy, dz);
  if (Number.isFinite(distance) && distance > 0.01) {
    return { x: dx / distance, y: dy / distance, z: dz / distance };
  }
  return { x: 0, y: 0, z: 1 };
}

function rotatedViewDirection(direction, yawRadians = 0.14, pitchRadians = 0.04) {
  const vector = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
  if (!Number.isFinite(vector.x) || vector.lengthSq() < 1e-8) return direction;
  vector.applyAxisAngle(new THREE.Vector3(0, 1, 0), yawRadians);
  vector.applyAxisAngle(new THREE.Vector3(1, 0, 0), pitchRadians);
  vector.normalize();
  return { x: vector.x, y: vector.y, z: vector.z };
}

function largestNodeBackDirection(bounds) {
  const largest = bounds?.largestNode;
  const center = bounds?.center;
  if (!largest || !center) return currentViewDirection(center);
  const fromLargestToCenter = new THREE.Vector3(
    Number(center.x) - Number(largest.x),
    Number(center.y) - Number(largest.y),
    Number(center.z) - Number(largest.z)
  );
  if (!Number.isFinite(fromLargestToCenter.x) || fromLargestToCenter.lengthSq() < 1e-8) {
    return currentViewDirection(center);
  }
  fromLargestToCenter.normalize();
  return {
    x: fromLargestToCenter.x,
    y: fromLargestToCenter.y,
    z: fromLargestToCenter.z
  };
}

function fitGraphToPage(delay = 300, duration = 900, options = {}) {
  if (!Graph) return;
  const timer = setTimeout(() => {
    if (!options.force && !displayIsIdle()) {
      scheduleIdleFit();
      return;
    }
    const bounds = graphBounds(filteredGraph());
    if (!bounds) return;
    const baseDirection = options.largestBack === false ? currentViewDirection(bounds.center) : largestNodeBackDirection(bounds);
    const direction = options.rotate ? rotatedViewDirection(baseDirection) : baseDirection;
    const distance = cameraFitDistanceForRadius(bounds.radius, graphFitScreenFill);
    Graph.cameraPosition(
      {
        x: bounds.center.x + direction.x * distance,
        y: bounds.center.y + direction.y * distance,
        z: bounds.center.z + direction.z * distance
      },
      bounds.center,
      duration
    );
  }, delay);
  fitTimers.push(timer);
  while (fitTimers.length > 5) clearTimeout(fitTimers.shift());
}

function clearPendingFits() {
  while (fitTimers.length) clearTimeout(fitTimers.shift());
  if (fitActivityTimer) {
    clearTimeout(fitActivityTimer);
    fitActivityTimer = null;
  }
}

function getNodePosition(point) {
  const x = Number(point.x);
  const y = Number(point.y);
  const z = Number(point.z);
  if (![x, y, z].every(Number.isFinite)) return;
  return { x, y, z };
}

function syncControlsTarget(point) {
  if (!Graph || !point || typeof Graph.controls !== "function") return;
  const controls = Graph.controls();
  if (!controls?.target?.set) return;
  controls.target.set(point.x, point.y, point.z);
  if (typeof controls.update === "function") controls.update();
}

function centerCameraOnPoint(point, duration = 900, options = {}) {
  if (!Graph || !point) return false;
  const position = getNodePosition(point);
  if (!position) return false;
  const { x, y, z } = position;
  const radius = Math.max(6, visualNodeCameraRadius(point));
  const distance = cameraFitDistanceForRadius(radius, nodeFocusScreenFill);
  const currentCamera = typeof Graph.camera === "function" ? Graph.camera()?.position : null;
  const dx = Number(currentCamera?.x) - x;
  const dy = Number(currentCamera?.y) - y;
  const dz = Number(currentCamera?.z) - z;
  const offsetDistance = Math.hypot(dx, dy, dz);
  const direction = Number.isFinite(offsetDistance) && offsetDistance > 0.01
    ? { x: dx / offsetDistance, y: dy / offsetDistance, z: dz / offsetDistance }
    : currentViewDirection({ x, y, z });
  const cameraOffset = {
    x: direction.x * distance,
    y: direction.y * distance,
    z: direction.z * distance
  };
  if (!options.preserveHold) clearPendingFits();
  if (point.id && !options.transient) focusedNodeId = point.id;
  if (point.id && !options.transient) lastFocusedNodePosition = { x, y, z };
  if (!options.preserveHold) scheduleIdleFit();
  Graph.cameraPosition(
    {
      x: x + cameraOffset.x,
      y: y + cameraOffset.y,
      z: z + cameraOffset.z
    },
    { x, y, z },
    duration
  );
  syncControlsTarget({ x, y, z });
  return true;
}

function centerCameraOnLink(link, duration = 900) {
  const source = typeof link.source === "object" ? link.source : rawGraph.nodes.find((node) => node.id === linkEndpointId(link.source));
  const target = typeof link.target === "object" ? link.target : rawGraph.nodes.find((node) => node.id === linkEndpointId(link.target));
  if (!source || !target) return;
  centerCameraOnPoint({
    x: (Number(source.x) + Number(target.x)) / 2,
    y: (Number(source.y) + Number(target.y)) / 2,
    z: (Number(source.z) + Number(target.z)) / 2,
    val: Math.max(12, visualLinkWidth(link) * 10)
  }, duration);
}

function multiplyMatrixVector(matrix, vector) {
  const e = matrix?.elements;
  if (!e) return null;
  return [
    e[0] * vector[0] + e[4] * vector[1] + e[8] * vector[2] + e[12] * vector[3],
    e[1] * vector[0] + e[5] * vector[1] + e[9] * vector[2] + e[13] * vector[3],
    e[2] * vector[0] + e[6] * vector[1] + e[10] * vector[2] + e[14] * vector[3],
    e[3] * vector[0] + e[7] * vector[1] + e[11] * vector[2] + e[15] * vector[3]
  ];
}

function projectNodeToScreen(node) {
  if (!Graph || !node || typeof Graph.camera !== "function") return null;
  const position = getNodePosition(node);
  if (!position) return null;
  const camera = Graph.camera();
  if (!camera?.projectionMatrix || !camera?.matrixWorldInverse) return null;
  if (typeof camera.updateMatrixWorld === "function") camera.updateMatrixWorld();
  if (camera.matrixWorldInverse?.copy && camera.matrixWorld?.invert) {
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
  }
  const viewPosition = multiplyMatrixVector(camera.matrixWorldInverse, [position.x, position.y, position.z, 1]);
  const projected = viewPosition ? multiplyMatrixVector(camera.projectionMatrix, viewPosition) : null;
  if (!projected || !Number.isFinite(projected[3]) || Math.abs(projected[3]) < 1e-9) return null;
  const ndc = { x: projected[0] / projected[3], y: projected[1] / projected[3], z: projected[2] / projected[3] };
  if (![ndc.x, ndc.y, ndc.z].every(Number.isFinite) || ndc.z < -1 || ndc.z > 1) return null;
  const rect = graphEl.getBoundingClientRect();
  return {
    x: rect.left + ((ndc.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - ndc.y) / 2) * rect.height,
    z: ndc.z
  };
}

function nearestNodeAtScreenPoint(clientX, clientY) {
  let best = null;
  for (const node of rawGraph.nodes || []) {
    const point = projectNodeToScreen(node);
    if (!point) continue;
    const screenDistance = Math.hypot(point.x - clientX, point.y - clientY);
    const pickRadius = Math.max(18, Math.min(96, visualNodeVal(node) * 0.7));
    if (screenDistance <= pickRadius && (!best || screenDistance < best.screenDistance)) {
      best = { node, screenDistance };
    }
  }
  return best?.node || null;
}

function focusNodeFromClick(node) {
  if (!node) return false;
  lastGraphNodeClickAt = Date.now();
  markInteraction();
  focusedNodeId = node.id;
  selectedNodeId = node.id;
  renderSelectedNode(node);
  lastFocusedNodePosition = null;
  const focused = centerCameraOnPoint(node, 800, { allowDuringInteraction: true });
  return focused;
}

function focusNodeFromPointerEvent(event) {
  const rect = graphEl.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) {
    lastPointerFocusAttempt = { x: event.clientX, y: event.clientY, inside: false };
    return false;
  }
  const node = nearestNodeAtScreenPoint(event.clientX, event.clientY);
  lastPointerFocusAttempt = { x: event.clientX, y: event.clientY, inside: true, nodeId: node?.id || null };
  if (!node) return false;
  event.preventDefault();
  event.stopPropagation();
  const focused = focusNodeFromClick(node);
  lastPointerFocusAttempt.focused = focused;
  lastPointerFocusAttempt.focusedNodeId = focusedNodeId;
  return focused;
}

function rememberGraphPointerDown(event) {
  graphPointerDown = { x: event.clientX, y: event.clientY, at: performance.now() };
}

function maybeFocusGraphPointerUp(event) {
  if (!graphPointerDown) return;
  const travel = Math.hypot(event.clientX - graphPointerDown.x, event.clientY - graphPointerDown.y);
  const elapsed = performance.now() - graphPointerDown.at;
  graphPointerDown = null;
  if (travel > 9 || elapsed > 900) return;
  focusNodeFromPointerEvent(event);
}

function refreshFocusedNode(duration = 0) {
  if (!focusedNodeId) return false;
  const node = findNodeById(focusedNodeId);
  if (!node) return false;
  const position = getNodePosition(node);
  if (!position) return false;
  if (!lastFocusedNodePosition) {
    lastFocusedNodePosition = position;
    return true;
  }
  const dx = position.x - lastFocusedNodePosition.x;
  const dy = position.y - lastFocusedNodePosition.y;
  const dz = position.z - lastFocusedNodePosition.z;
  lastFocusedNodePosition = position;
  if (![dx, dy, dz].every(Number.isFinite)) return false;
  if (!Graph || typeof Graph.camera !== "function" || typeof Graph.controls !== "function") return true;
  const camera = Graph.camera();
  const controls = Graph.controls();
  if (camera?.position?.set) {
    camera.position.set(
      Number(camera.position.x) + dx,
      Number(camera.position.y) + dy,
      Number(camera.position.z) + dz
    );
  }
  if (controls?.target?.set) {
    controls.target.set(
      Number(controls.target.x) + dx,
      Number(controls.target.y) + dy,
      Number(controls.target.z) + dz
    );
  }
  if (typeof controls?.update === "function") controls.update();
  if (typeof Graph.refresh === "function") Graph.refresh();
  return true;
}

function scheduleIdleFit() {
  if (fitActivityTimer) clearTimeout(fitActivityTimer);
  fitActivityTimer = setTimeout(() => {
    if (!displayIsIdle()) {
      scheduleIdleFit();
      return;
    }
    focusedNodeId = null;
    lastFocusedNodePosition = null;
    renderSelectedNode();
    fitGraphToPage(0, 1200);
  }, idleFitMs);
}

try {
  Graph = window.ForceGraph3D()(graphEl)
    .backgroundColor("rgba(0,0,0,0)")
    .nodeLabel((node) => `${node.group}: ${node.label}`)
    .nodeColor(visualNodeColor)
    .nodeVal(visualNodeVal)
    .nodeThreeObject(buildNodeObject)
    .linkLabel((link) => link.type || "")
    .linkWidth(visualLinkWidth)
    .linkColor(visualLinkColor)
    .linkOpacity(visualLinkOpacity)
    .linkDirectionalParticles(0)
    .d3VelocityDecay(0.58)
    .cooldownTicks(0)
    .enableNodeDrag(true)
    .onNodeClick((node) => {
      focusNodeFromClick(node);
    })
    .onLinkClick((link) => {
      markInteraction();
      centerCameraOnLink(link);
    });

  Graph.d3Force("charge").strength(0);
  Graph.d3Force("link").strength(0);
  Graph.d3Force("center").strength(0);
  Graph.scene().add(vectorBulletGroup);
  graphEl.addEventListener("pointerdown", rememberGraphPointerDown, { capture: true, passive: true });
  graphEl.addEventListener("pointerup", maybeFocusGraphPointerUp, { capture: true });
  document.addEventListener("mousedown", rememberGraphPointerDown, { capture: true, passive: true });
  document.addEventListener("mouseup", maybeFocusGraphPointerUp, { capture: true });
  graphEl.addEventListener("click", (event) => {
    if (Date.now() - lastGraphNodeClickAt < 160) return;
    focusNodeFromPointerEvent(event);
  }, { capture: true });
  document.addEventListener("click", (event) => {
    if (Date.now() - lastGraphNodeClickAt < 160) return;
    focusNodeFromPointerEvent(event);
  }, { capture: true });
} catch (error) {
  graphEl.dataset.unavailable = "true";
  graphEl.dataset.error = `3D game unavailable: ${error.message}`;
}

function normalizeNodePosition(node) {
  const x = Number(node.x);
  const y = Number(node.y);
  const z = Number(node.z);
  if (![x, y, z].every(Number.isFinite)) return node;
  node.x = x;
  node.y = y;
  node.z = z;
  node.fx = x;
  node.fy = y;
  node.fz = z;
  return node;
}

window.zorgMemory3D = {
  getGraph: () => rawGraph,
  getEngine: () => engineState,
  getGraphApi: () => Graph,
  getCamera: () => (typeof Graph?.camera === "function" ? Graph.camera() : null),
  getFocusedNodeId: () => focusedNodeId,
  getSelectedNodeId: () => selectedNodeId,
  getSelectedNodeFaceCount: () => {
    const node = selectedNodeId ? findNodeById(selectedNodeId) : null;
    return nodeGeometryFaceCount(node);
  },
  getLastPointerFocusAttempt: () => lastPointerFocusAttempt,
  pickNodeAt: (x, y) => nearestNodeAtScreenPoint(x, y)?.id || null,
  projectNodeToScreen,
  focusNodeById: (nodeId, duration = 0) => {
    const node = (rawGraph.nodes || []).find((item) => item.id === nodeId);
    if (node?.id) {
      focusedNodeId = node.id;
      selectedNodeId = node.id;
      lastFocusedNodePosition = null;
      renderSelectedNode(node);
    }
    return centerCameraOnPoint(node, duration);
  },
  fitGraphToPage,
  centerCameraOnPoint,
  centerCameraOnLink
};

function fitGraph(delay = 450) {
  fitGraphToPage(delay, 900);
}

function resize() {
  if (Graph) {
    Graph.width(graphEl.clientWidth).height(graphEl.clientHeight);
    if (!refreshFocusedNode(0) && displayIsIdle()) fitGraph(250);
    return;
  }
}

window.addEventListener("resize", resize);
["pointerdown", "wheel", "keydown", "touchstart"].forEach((eventName) => {
  window.addEventListener(eventName, markInteraction, { passive: true });
});
["pointermove", "touchmove", "wheel", "pointerdown", "touchstart"].forEach((eventName) => {
  graphEl.addEventListener(eventName, markInteraction, { passive: true });
});
resize();

function applyFilter() {
  if (!Graph) {
    graphEl.dataset.unavailable = "true";
    graphEl.dataset.error = "3D game unavailable: WebGL graph renderer did not initialize.";
    return;
  }
  Graph.graphData(rawGraph);
}

function filteredGraph() {
  return rawGraph;
}

function numberSetting(input, key, fallback, min, max, round = false) {
  const parsed = Number(input?.[key]);
  const value = Number.isFinite(parsed) ? parsed : fallback;
  const bounded = Math.max(min, Math.min(max, value));
  return round ? Math.round(bounded) : bounded;
}

function compactInteger(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(number);
}

function renderEngineDisplayCounts(engine = engineState) {
  const counts = engine?.historyDisplayCounts || {};
  for (const item of engineCountEls) {
    const key = item.dataset.engineCount;
    const valueEl = item.querySelector("strong");
    if (valueEl) valueEl.textContent = compactInteger(counts[key]);
  }
}

function refreshRuntimeVisuals() {
  if (!Graph) return;
  Graph.linkWidth(visualLinkWidth);
  Graph.linkColor(visualLinkColor);
  Graph.linkOpacity(visualLinkOpacity);
  Graph.nodeThreeObject(buildNodeObject);
  for (const state of vectorBulletStates.values()) {
    for (const bullet of state.bullets) recolorVectorBullet(bullet, state.link);
  }
  if (typeof Graph.refresh === "function") Graph.refresh();
}

function applyRuntimeEngineConfig(config = null) {
  const render = config?.renderSettings;
  if (!render) return;
  const previousVectorScale = vectorDiameterVisualScale;
  const previousPacketScale = packetDataNodeVisualScale;
  const previousNodeOpacity = nodeShapeOpacity;
  const previousVectorOpacity = vectorOpacity;
  const previousPacketOpacity = vectorFlowOpacity;
  vectorDiameterVisualScale = numberSetting(render, "vectorDiameterVisualScale", vectorDiameterVisualScale, 0.1, 20);
  packetDataNodeVisualScale = numberSetting(render, "packetDataNodeVisualScale", packetDataNodeVisualScale, 0.1, 20);
  nodeShapeOpacity = numberSetting(render, "nodeOpacity", nodeShapeOpacity, 0.02, 1);
  vectorOpacity = numberSetting(render, "vectorOpacity", vectorOpacity, 0.02, 1);
  vectorFlowOpacity = numberSetting(render, "packetOpacity", vectorFlowOpacity, 0.02, 1);
  maxLiveVectorBullets = numberSetting(render, "maxLiveVectorBullets", maxLiveVectorBullets, 0, 2000, true);
  packetBurstMin = numberSetting(render, "packetBurstMin", packetBurstMin, 1, 40, true);
  packetBurstMax = Math.max(packetBurstMin, numberSetting(render, "packetBurstMax", packetBurstMax, 1, 60, true));
  packetBurstShotSpacingMin = numberSetting(render, "packetBurstShotSpacingMin", packetBurstShotSpacingMin, 10, 2000);
  packetBurstShapeCycleMs = numberSetting(render, "packetBurstShapeCycleMs", packetBurstShapeCycleMs, 100, 10000);
  if (
    previousVectorScale !== vectorDiameterVisualScale ||
    previousPacketScale !== packetDataNodeVisualScale ||
    previousNodeOpacity !== nodeShapeOpacity ||
    previousVectorOpacity !== vectorOpacity ||
    previousPacketOpacity !== vectorFlowOpacity
  ) {
    refreshRuntimeVisuals();
  }
}

function linkKey(link) {
  return `${linkEndpointId(link.source)}->${linkEndpointId(link.target)}:${link.type || "link"}`;
}

function setGraphData(graph, options = {}) {
  rawGraph = {
    nodes: (graph.nodes || []).map((node) => normalizeNodePosition(node)),
    links: graph.links || []
  };
  applyMemoryIdentity(graph.engine?.identity);
  applyRuntimeEngineConfig(graph.engine?.engineConfig);
  renderEngineDisplayCounts(graph.engine);
  resize();
  if (Graph) {
    Graph.graphData(rawGraph);
    Graph.nodeThreeObject(buildNodeObject);
    if (typeof Graph.refresh === "function") Graph.refresh();
  }
  applyFilter();
  syncVectorBulletStates();
  queuePacketEvents(graph.recentPacketEvents || []);
  refreshFocusedNode(0);
  renderSelectedNode();
  scheduleShapeCycleRefresh();
  if (options.fit) fitGraphToPage(0, 1200, { force: true });
}

function applyMemoryIdentity(identity = null) {
  if (!identity) return;
  const name = identity.name || "Memory";
  const databaseLabel = identity.databaseLabel || `${name} Memory DB`;
  const statusLabel = identity.statusLabel || "Memory Brain Status";
  const browserTitle = identity.browserTitle || `${name} Memory Brain 3D`;
  if (memoryDbNameEl) memoryDbNameEl.textContent = databaseLabel;
  if (memoryStatusTitleEl) memoryStatusTitleEl.textContent = statusLabel;
  document.title = browserTitle;
}

function applyEngineEvents(events = [], engine = null) {
  if (engine) engineState = engine;
  applyRuntimeEngineConfig(engineState?.engineConfig);
  renderEngineDisplayCounts(engineState);
  if (!events.length) return;

  const nodes = new Map((rawGraph.nodes || []).map((node) => [node.id, node]));
  const links = new Map((rawGraph.links || []).map((link) => [link.key || linkKey(link), link]));

  for (const event of events) {
    if (event.node) {
      if (event.type === "node_dormant") {
        const current = nodes.get(event.nodeId);
        if (current) normalizeNodePosition(Object.assign(current, event.node, { engineState: "dormant" }));
      } else {
        const current = nodes.get(event.node.id);
        if (current) Object.assign(current, event.node);
        else nodes.set(event.node.id, event.node);
        normalizeNodePosition(nodes.get(event.node.id));
      }
    }
    if (event.link) {
      const key = event.link.key || event.linkKey || linkKey(event.link);
      if (event.type === "link_dormant") links.delete(key);
      else links.set(key, { ...event.link, key });
    }
  }

  rawGraph = { nodes: [...nodes.values()].map((node) => normalizeNodePosition(node)), links: [...links.values()] };
  if (Graph) {
    Graph.graphData(rawGraph);
    if (typeof Graph.refresh === "function") Graph.refresh();
  }
  applyFilter();
  syncVectorBulletStates();
  queuePacketEvents(events);
  applyMemoryIdentity(engineState?.identity);
  refreshFocusedNode(0);
  renderSelectedNode();
  scheduleShapeCycleRefresh();
}

async function joinGameEngine() {
  const response = await fetch(proxiedPath("/api/game/snapshot"));
  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  engineState = data.engine;
  setGraphData(data, { fit: !initialSnapshotLoaded });
  initialSnapshotLoaded = true;
  renderSelectedNode();
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "light" ? "Dark View" : "Light View";
  themeToggle.setAttribute("aria-pressed", theme === "light" ? "true" : "false");
  localStorage.setItem("zorg-memory-3d-theme", theme);
  if (Graph) {
    Graph.nodeColor(visualNodeColor);
    Graph.nodeThreeObject(buildNodeObject);
    Graph.linkColor(visualLinkColor);
    Graph.linkOpacity(visualLinkOpacity);
    updateVectorBulletTheme();
    if (typeof Graph.refresh === "function") Graph.refresh();
  }
}

themeToggle.addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
});

const requestedTheme = urlParams.get("theme");
const storedTheme = localStorage.getItem("zorg-memory-3d-theme");
setTheme(requestedTheme === "light" || requestedTheme === "dark" ? requestedTheme : storedTheme === "light" ? "light" : "dark");
scheduleIdleFit();

joinGameEngine().catch((error) => {
  graphEl.dataset.unavailable = "true";
  graphEl.dataset.error = error.message;
});
setInterval(() => {
  joinGameEngine().catch(() => undefined);
}, embedMode ? 1600 : 2200);
setTimeout(resize, 500);
setTimeout(resize, 2000);

try {
  const socket = proxyPrefix
    ? null
    : new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`);
  socket?.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "engine_snapshot") {
      engineState = message.data.engine;
      setGraphData(message.data, { fit: !initialSnapshotLoaded });
      initialSnapshotLoaded = true;
      renderSelectedNode();
    }
    if (message.type === "engine_events") applyEngineEvents(message.events, message.engine);
  });
} catch {
  // Periodic fetch remains active when websockets are unavailable.
}
