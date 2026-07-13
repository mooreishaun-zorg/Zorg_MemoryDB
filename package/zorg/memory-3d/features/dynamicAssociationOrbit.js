function timestampOrbitPhase(node) {
  const timestamp = Number(node.timestampMs);
  if (Number.isFinite(timestamp)) {
    const date = new Date(timestamp);
    const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
    return (
      ((minuteOfDay / 1440) * Math.PI * 2 + (date.getUTCSeconds() / 60) * 0.18) % (Math.PI * 2)
    );
  }
  return null;
}

function flatOrbitVector(longitudeDeg, latitudeDeg) {
  const longitude = (Number(longitudeDeg) * Math.PI) / 180;
  const latitude = (Number(latitudeDeg) * Math.PI) / 180;
  const x = Math.cos(latitude) * Math.cos(longitude);
  const y = Math.sin(latitude);
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length < 0.01) {
    return { x: Math.cos(longitude), y: Math.sin(longitude), z: 0 };
  }
  return { x: x / length, y: y / length, z: 0 };
}

function timestampOrbitCoordinates(node) {
  const timestamp = Number(node.timestampMs);
  if (!Number.isFinite(timestamp)) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
  const second = date.getUTCSeconds() + date.getUTCMilliseconds() / 1000;
  const longitude = (minuteOfDay / 1440) * 360 - 180;
  const latitude = (second / 60) * 180 - 90;
  return {
    longitude,
    latitude,
    minuteOfDay,
    second,
    timestampIso: date.toISOString(),
    vector: flatOrbitVector(longitude, latitude),
  };
}

function timestampAgeSlotOffsets(slot = 0) {
  const safeSlot = Math.max(0, Number.isFinite(Number(slot)) ? Number(slot) : 0);
  if (safeSlot === 0) return { longitudeOffset: 0, latitudeOffset: 0, shell: 0 };
  const angle = safeSlot * 2.399963229728653;
  const spread = Math.min(18, 1.8 + Math.sqrt(safeSlot) * 0.9);
  return {
    longitudeOffset: Math.cos(angle) * spread,
    latitudeOffset: Math.sin(angle) * Math.min(12, spread * 0.68),
    shell: Math.floor(safeSlot / 48),
  };
}

function timestampOrbitVectorForSatellite(satellite) {
  const baseLongitude = Number.isFinite(Number(satellite.orbitLongitude))
    ? Number(satellite.orbitLongitude)
    : 0;
  const baseLatitude = Number.isFinite(Number(satellite.orbitLatitude))
    ? Number(satellite.orbitLatitude)
    : 0;
  const offsets = timestampAgeSlotOffsets(satellite.orbitAnchorSlot);
  const longitude = ((baseLongitude + offsets.longitudeOffset + 540) % 360) - 180;
  const latitude = Math.max(-89.8, Math.min(89.8, baseLatitude + offsets.latitudeOffset));
  return {
    longitude,
    latitude,
    shell: offsets.shell,
    vector: flatOrbitVector(longitude, latitude),
  };
}

function updateTimestampOrbitMetadata(
  satellite,
  coordinates,
  ageRank = satellite.orbitAgeRank,
  anchorSlot = satellite.orbitAnchorSlot,
  siblingCount = satellite.orbitAnchorSiblingCount,
) {
  satellite.orbitLongitude = Number(coordinates.longitude.toFixed(6));
  satellite.orbitLatitude = Number(coordinates.latitude.toFixed(6));
  satellite.orbitMinute = coordinates.minuteOfDay;
  satellite.orbitSecond = Number(coordinates.second.toFixed(3));
  satellite.orbitTimestampIso = coordinates.timestampIso;
  satellite.orbitTimestampSource = satellite.timestampSource || "timestampMs";
  satellite.orbitAgeRank = Number.isFinite(Number(ageRank))
    ? Number(ageRank)
    : satellite.orbitAgeRank;
  satellite.orbitAnchorSlot = Number.isFinite(Number(anchorSlot)) ? Number(anchorSlot) : 0;
  satellite.orbitAnchorSiblingCount = Number.isFinite(Number(siblingCount))
    ? Number(siblingCount)
    : satellite.orbitAnchorSiblingCount;
  const slotVector = timestampOrbitVectorForSatellite(satellite);
  satellite.orbitCurrentLongitude = Number(slotVector.longitude.toFixed(6));
  satellite.orbitCurrentLatitude = Number(slotVector.latitude.toFixed(6));
  satellite.orbitLongitudeSlot = Number(
    (slotVector.longitude - satellite.orbitLongitude).toFixed(6),
  );
  satellite.orbitLatitudeSlot = Number((slotVector.latitude - satellite.orbitLatitude).toFixed(6));
  satellite.orbitShell = slotVector.shell;
  satellite.orbitCoordinateRule = "timestamp-minute-longitude-second-latitude-flat-z-age-slot";
  satellite.orbitBaseX = Number(coordinates.vector.x.toFixed(6));
  satellite.orbitBaseY = Number(coordinates.vector.y.toFixed(6));
  satellite.orbitBaseZ = Number(coordinates.vector.z.toFixed(6));
}

const orbitMetadataKeys = Object.freeze([
  "orbitAnchorId",
  "orbitAssociationLinkKey",
  "orbitAssociationType",
  "orbitAssociationValue",
  "orbitRule",
  "orbitPhase",
  "orbitAngularSpeed",
  "orbitLongitude",
  "orbitLatitude",
  "orbitCurrentLongitude",
  "orbitCurrentLatitude",
  "orbitMinute",
  "orbitSecond",
  "orbitTimestampIso",
  "orbitTimestampSource",
  "orbitAgeRank",
  "orbitAnchorSlot",
  "orbitAnchorSiblingCount",
  "orbitLongitudeSlot",
  "orbitLatitudeSlot",
  "orbitShell",
  "orbitCoordinateRule",
  "orbitBaseX",
  "orbitBaseY",
  "orbitBaseZ",
  "orbitRadius",
  "orbitFlatZPlacementRule",
]);

export function createDynamicAssociationOrbitFeature({
  endpointId,
  graphLinkKey,
  renderedNodeRadius,
  nodeCollisionRadius,
  noTouchEpsilon,
  currentPhysicsTunablesConfig,
}) {
  function clearNodeMetadata(node) {
    for (const key of orbitMetadataKeys) delete node[key];
  }

  function linkAssociationScore(link, larger, smaller) {
    const value = Math.max(0.05, Number(link.value || 1));
    const largerRadius = renderedNodeRadius(larger);
    const smallerRadius = renderedNodeRadius(smaller);
    const sizeRatio = largerRadius / Math.max(0.01, smallerRadius);
    const largerDegree = Math.max(0, Number(larger.degree || 0));
    return value * sizeRatio * (1 + Math.log2(largerDegree + 1) * 0.14);
  }

  function assign(nodes, links, physicsConfig = null) {
    const physics = currentPhysicsTunablesConfig(physicsConfig);
    const candidates = new Map();
    for (const node of nodes.values()) clearNodeMetadata(node);

    for (const link of links.values()) {
      const source = nodes.get(endpointId(link.source));
      const target = nodes.get(endpointId(link.target));
      if (!source || !target) continue;

      const sourceRadius = renderedNodeRadius(source);
      const targetRadius = renderedNodeRadius(target);
      const sourceDegree = Number(source.degree || 0);
      const targetDegree = Number(target.degree || 0);
      if (
        Math.abs(sourceRadius - targetRadius) <
        Math.max(2, Math.min(sourceRadius, targetRadius) * 0.12)
      ) {
        continue;
      }

      const larger = sourceRadius > targetRadius ? source : target;
      const smaller = sourceRadius > targetRadius ? target : source;
      if (
        Number(larger.degree || 0) <= Number(smaller.degree || 0) &&
        sourceDegree === targetDegree
      ) {
        continue;
      }

      const score = linkAssociationScore(link, larger, smaller);
      const existing = candidates.get(smaller.id);
      if (existing && existing.score >= score) continue;
      candidates.set(smaller.id, { anchor: larger, satellite: smaller, link, score });
    }

    const assignments = [...candidates.values()]
      .map((candidate) => ({
        ...candidate,
        coordinates: timestampOrbitCoordinates(candidate.satellite),
      }))
      .filter((candidate) => candidate.coordinates)
      .sort(
        (left, right) =>
          Number(left.satellite.timestampMs || 0) - Number(right.satellite.timestampMs || 0),
      );

    let count = 0;
    const anchorSlotCounts = new Map();
    const anchorSiblingCounts = assignments.reduce((acc, assignment) => {
      acc.set(assignment.anchor.id, (acc.get(assignment.anchor.id) || 0) + 1);
      return acc;
    }, new Map());
    for (const { anchor, satellite, link, coordinates } of assignments) {
      const anchorRadius = nodeCollisionRadius(anchor);
      const satelliteRadius = nodeCollisionRadius(satellite);
      const anchorSlot = anchorSlotCounts.get(anchor.id) || 0;
      anchorSlotCounts.set(anchor.id, anchorSlot + 1);
      satellite.orbitAnchorId = anchor.id;
      satellite.orbitAssociationLinkKey = link.key || graphLinkKey(link);
      satellite.orbitAssociationType = link.type || "direct-neural-association";
      satellite.orbitAssociationValue = Number(link.value || 1);
      satellite.orbitRule = "dynamic-direct-association-orbit";
      satellite.orbitPhase = Number(timestampOrbitPhase(satellite).toFixed(6));
      satellite.orbitAngularSpeed = 0;
      updateTimestampOrbitMetadata(
        satellite,
        coordinates,
        count,
        anchorSlot,
        anchorSiblingCounts.get(anchor.id) || 1,
      );
      satellite.orbitRadius = Number(
        (
          anchorRadius +
          satelliteRadius +
          noTouchEpsilon +
          (satellite.orbitShell || 0) *
            (satelliteRadius * physics.orbitShellSpacingScale + noTouchEpsilon)
        ).toFixed(6),
      );
      count += 1;
    }
    return count;
  }

  function applyTargets(nodes, physicsConfig = null) {
    const physics = currentPhysicsTunablesConfig(physicsConfig);
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const orbitingSatellites = nodes
      .filter((node) => node.orbitAnchorId)
      .sort((left, right) => nodeCollisionRadius(right) - nodeCollisionRadius(left));
    let targetUpdates = 0;
    for (const satellite of orbitingSatellites) {
      const anchor = nodeMap.get(satellite.orbitAnchorId);
      if (!anchor) continue;

      const desired = nodeCollisionRadius(anchor) + nodeCollisionRadius(satellite) + noTouchEpsilon;
      const coordinates = timestampOrbitCoordinates(satellite);
      if (coordinates) updateTimestampOrbitMetadata(satellite, coordinates);
      const slotVector = timestampOrbitVectorForSatellite(satellite);
      const currentLongitude = slotVector.longitude;
      const currentLatitude = slotVector.latitude;
      satellite.orbitCurrentLongitude = Number(currentLongitude.toFixed(6));
      satellite.orbitCurrentLatitude = Number(currentLatitude.toFixed(6));
      satellite.orbitShell = slotVector.shell;

      const shellDistance =
        slotVector.shell *
        (nodeCollisionRadius(satellite) * physics.orbitShellSpacingScale + noTouchEpsilon);
      const orbitDistance = desired + shellDistance;
      satellite.orbitRadius = Number(orbitDistance.toFixed(6));
      satellite.orbitFlatZPlacementRule = "disabled-collision-only-roaming";
      targetUpdates += 1;
    }
    return targetUpdates;
  }

  return {
    id: "dynamicAssociationOrbit",
    file: "features/dynamicAssociationOrbit.js",
    clearNodeMetadata,
    assign,
    applyTargets,
    isSatellite: (node) => Boolean(node?.orbitAnchorId),
  };
}
