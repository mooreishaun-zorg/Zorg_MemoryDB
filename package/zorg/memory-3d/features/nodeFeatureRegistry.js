const featureDefinitions = Object.freeze({
  databaseMeasurements: {
    id: "databaseMeasurements",
    file: "features/nodeFeatureRegistry.js",
    scope: "node",
  },
  vectorDegreeSizing: {
    id: "vectorDegreeSizing",
    file: "features/nodeFeatureRegistry.js",
    scope: "node",
  },
  collisionRadius: {
    id: "collisionRadius",
    file: "features/collisionBoundary.js",
    scope: "node",
  },
  electromagneticRepulsion: {
    id: "electromagneticRepulsion",
    file: "features/electromagneticRepulsion.js",
    scope: "node",
  },
  dynamicParentOrigin: {
    id: "dynamicParentOrigin",
    file: "gamePieceFeatureLayers.js",
    scope: "node",
  },
  timestampSatelliteOrbit: {
    id: "timestampSatelliteOrbit",
    file: "features/dynamicAssociationOrbit.js",
    scope: "satellite",
  },
  nodeCollisionBoundary: {
    id: "nodeCollisionBoundary",
    file: "features/collisionBoundary.js",
    scope: "node",
  },
  vectorCollisionBoundary: {
    id: "vectorCollisionBoundary",
    file: "features/collisionBoundary.js",
    scope: "vector",
  },
  collisionOnlyZAltitude: {
    id: "collisionOnlyZAltitude",
    file: "features/collisionOnlyZAltitude.js",
    scope: "node",
  },
  positionSanity: {
    id: "positionSanity",
    file: "features/positionSanity.js",
    scope: "node",
  },
});

export function featureDefinitionsSummary() {
  return Object.fromEntries(
    Object.entries(featureDefinitions).map(([id, definition]) => [id, { ...definition }]),
  );
}

export function assignedFeatureIdsForNode({ isSatellite = false, isOriginAuthority = false } = {}) {
  const ids = [
    "databaseMeasurements",
    "vectorDegreeSizing",
    "collisionRadius",
    "electromagneticRepulsion",
    "dynamicParentOrigin",
    "nodeCollisionBoundary",
    "collisionOnlyZAltitude",
    "positionSanity",
  ];
  if (isSatellite) ids.push("timestampSatelliteOrbit");
  if (!isOriginAuthority) ids.push("vectorCollisionBoundary");
  return ids;
}

export function attachNodeFeatureRegistry(node, assignment = {}) {
  const ids = assignedFeatureIdsForNode(assignment);
  const files = [...new Set(ids.map((id) => featureDefinitions[id]?.file).filter(Boolean))];
  node.assignedFeatureIds = ids;
  node.assignedFeatureFiles = files;
  return { ids, files };
}
