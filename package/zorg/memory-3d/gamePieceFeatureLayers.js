import {
  attachNodeFeatureRegistry,
  featureDefinitionsSummary,
} from "./features/nodeFeatureRegistry.js";

const gamePieceLayerVersion = 1;

function endpointId(endpoint) {
  return endpoint?.id || endpoint;
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function rounded(value, digits = 6) {
  const number = Number(value);
  return Number.isFinite(number) ? Number(number.toFixed(digits)) : null;
}

function graphDegreeMap(links = []) {
  const degrees = new Map();
  for (const link of links) {
    for (const id of [endpointId(link.source), endpointId(link.target)]) {
      if (!id) continue;
      degrees.set(id, (degrees.get(id) || 0) + 1);
    }
  }
  return degrees;
}

function strongerParent(left, right, satelliteCounts, degrees) {
  if (!left) return right || null;
  if (!right) return left || null;
  const leftSatellites = satelliteCounts.get(left.id) || 0;
  const rightSatellites = satelliteCounts.get(right.id) || 0;
  if (leftSatellites !== rightSatellites) return leftSatellites > rightSatellites ? left : right;
  const leftDegree = degrees.get(left.id) || finiteNumber(left.degree);
  const rightDegree = degrees.get(right.id) || finiteNumber(right.degree);
  if (leftDegree !== rightDegree) return leftDegree > rightDegree ? left : right;
  const leftRadius = finiteNumber(left.renderedRadius || left.collisionRadius || left.val);
  const rightRadius = finiteNumber(right.renderedRadius || right.collisionRadius || right.val);
  if (leftRadius !== rightRadius) return leftRadius > rightRadius ? left : right;
  return String(left.id).localeCompare(String(right.id)) <= 0 ? left : right;
}

export function applyGamePieceFeatureLayers(nodes = [], links = [], options = {}) {
  const nodeList = [...nodes].filter(Boolean);
  const nodeMap = new Map(nodeList.map((node) => [node.id, node]));
  const degrees = graphDegreeMap(links);
  const satelliteCounts = new Map();
  const parentCandidates = new Map();

  for (const node of nodeList) {
    if (node.orbitAnchorId && nodeMap.has(node.orbitAnchorId)) {
      satelliteCounts.set(node.orbitAnchorId, (satelliteCounts.get(node.orbitAnchorId) || 0) + 1);
      parentCandidates.set(node.id, nodeMap.get(node.orbitAnchorId));
    }
  }

  for (const link of links) {
    const source = nodeMap.get(endpointId(link.source));
    const target = nodeMap.get(endpointId(link.target));
    if (!source || !target) continue;
    const parent = strongerParent(source, target, satelliteCounts, degrees);
    const child = parent === source ? target : source;
    const existing = parentCandidates.get(child.id);
    parentCandidates.set(child.id, strongerParent(existing, parent, satelliteCounts, degrees));
  }

  let originAuthority = null;
  for (const node of nodeList) {
    originAuthority = strongerParent(originAuthority, node, satelliteCounts, degrees);
  }
  const originAuthorityId = originAuthority?.id || null;

  let satellites = 0;
  let parents = 0;
  for (const node of nodeList) {
    const degree = degrees.get(node.id) || finiteNumber(node.degree);
    const satelliteCount = satelliteCounts.get(node.id) || 0;
    const parent = parentCandidates.get(node.id) || null;
    const isSatellite = Boolean(node.orbitAnchorId);
    const isOriginAuthority = Boolean(originAuthorityId && node.id === originAuthorityId);
    const role = isOriginAuthority
      ? "origin-parent"
      : isSatellite
        ? "satellite"
        : satelliteCount > 0
          ? "parent"
          : parent
            ? "child"
            : "piece";

    if (isSatellite) satellites += 1;
    if (satelliteCount > 0 || isOriginAuthority) parents += 1;

    node.parentNodeId = isOriginAuthority ? null : parent?.id || node.orbitAnchorId || null;
    node.satelliteCount = satelliteCount;
    node.childVectorCount = Math.max(0, degree - satelliteCount);
    node.originAuthority = isOriginAuthority;
    node.originAuthorityId = originAuthorityId;
    node.originCoordinate = null;
    const assignedFeatures = attachNodeFeatureRegistry(node, {
      isSatellite,
      isOriginAuthority,
      satelliteCount,
      role,
    });
    node.gamePieceRole = role;
    node.gamePieceLayerVersion = gamePieceLayerVersion;
    node.gamePiece = {
      version: gamePieceLayerVersion,
      rule: "database-derived-game-piece-feature-layers",
      role,
      parentNodeId: node.parentNodeId,
      originAuthority: isOriginAuthority,
      originAuthorityId,
      originCoordinate: null,
      assignedFeatureIds: assignedFeatures.ids,
      assignedFeatureFiles: assignedFeatures.files,
      featureLayers: [
        "database-measurements",
        "vector-degree-sizing",
        "collision-radius",
        "dynamic-parent-origin",
        isSatellite ? "satellite-orbit" : "parent-candidate",
      ],
      variables: {
        visibleVectorCount: finiteNumber(node.visibleVectorCount),
        targetVisibleVectorCount: finiteNumber(node.targetVisibleVectorCount || degree),
        degree,
        satelliteCount,
        childVectorCount: node.childVectorCount,
        renderedRadius: rounded(node.renderedRadius),
        collisionRadius: rounded(node.collisionRadius),
        baseRenderedSize: rounded(node.baseRenderedSize),
        connectionSizeMultiplier: rounded(node.connectionSizeMultiplier),
        dataRows: finiteNumber(node.dataRows, 1),
        dataByteSize: finiteNumber(node.dataByteSize),
      },
    };
  }

  return {
    enabled: true,
    rule: "additive-database-derived-game-piece-feature-layers",
    version: gamePieceLayerVersion,
    featureFiles: featureDefinitionsSummary(),
    nodes: nodeList.length,
    parents,
    satellites,
    originAuthorityId,
  };
}
