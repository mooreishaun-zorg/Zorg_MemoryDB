function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function deterministicUnitDirection(key = "") {
  let hash = 2166136261;
  for (const char of String(key)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const unit = (hash >>> 0) / 4294967296;
  const angle = unit * Math.PI * 2;
  const z = (((Math.imul(hash, 2246822519) >>> 0) / 4294967296) - 0.5) * 2;
  const flatScale = Math.sqrt(Math.max(0, 1 - z * z));
  return { nx: Math.cos(angle) * flatScale, ny: Math.sin(angle) * flatScale, nz: z };
}

function buildCollisionPressureMap(nodeList, nodeCollisionRadius, noTouchEpsilon, scale = 1.1) {
  const pressure = new Map(nodeList.map((node) => [node.id, 0]));

  for (let leftIndex = 0; leftIndex < nodeList.length; leftIndex += 1) {
    const left = nodeList[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < nodeList.length; rightIndex += 1) {
      const right = nodeList[rightIndex];
      const dx = finiteNumber(right.x) - finiteNumber(left.x);
      const dy = finiteNumber(right.y) - finiteNumber(left.y);
      const dz = finiteNumber(right.z) - finiteNumber(left.z);
      const distance = Math.hypot(dx, dy, dz);
      const desired =
        (nodeCollisionRadius(left) + nodeCollisionRadius(right) + noTouchEpsilon) * scale;

      if (Number.isFinite(distance) && distance < desired) {
        pressure.set(left.id, (pressure.get(left.id) || 0) + 1);
        pressure.set(right.id, (pressure.get(right.id) || 0) + 1);
      }
    }
  }

  return pressure;
}

function totalPairCount(count) {
  const safeCount = Math.max(0, Math.round(Number(count)) || 0);
  return safeCount > 1 ? (safeCount * (safeCount - 1)) / 2 : 0;
}

function pairFromOrdinal(count, ordinal) {
  let remaining = Math.max(0, Math.round(Number(ordinal)) || 0);
  for (let leftIndex = 0; leftIndex < count - 1; leftIndex += 1) {
    const rowPairs = count - leftIndex - 1;
    if (remaining < rowPairs) return [leftIndex, leftIndex + 1 + remaining];
    remaining -= rowPairs;
  }
  return [0, 1];
}

function nodeCollisionDisplacement({
  left,
  right,
  desired,
  dx,
  dy,
  dz,
  pressureMap,
  key = "",
}) {
  const distance = Math.hypot(dx, dy, dz);
  const leftPressure = pressureMap.get(left.id) || 0;
  const rightPressure = pressureMap.get(right.id) || 0;
  if (Number.isFinite(distance) && distance >= desired) return null;
  const current = Number.isFinite(distance) && distance > 0.01 ? distance : null;
  const fallback = current ? null : deterministicUnitDirection(key);
  return {
    nx: current ? dx / current : fallback.nx,
    ny: current ? dy / current : fallback.ny,
    nz: current ? dz / current : fallback.nz,
    overlap: Math.max(0, desired - (current || 0)),
    rule: "collision-only-3d-contact-no-fixed-coordinate-lock",
    leftPressure,
    rightPressure,
  };
}

function vectorCollisionDisplacement({ dx, dy, dz, desired, key = "" }) {
  const distance = Math.hypot(dx, dy, dz);
  if (Number.isFinite(distance) && distance >= desired) return null;
  const current = Number.isFinite(distance) && distance > 0.01 ? distance : null;
  const fallback = current ? null : deterministicUnitDirection(key);
  return {
    nx: current ? dx / current : fallback.nx,
    ny: current ? dy / current : fallback.ny,
    nz: current ? dz / current : fallback.nz,
    overlap: Math.max(0, desired - (current || 0)),
    rule: "vector-collision-3d-contact-no-fixed-coordinate-lock",
  };
}

function closestSegmentParameter3d(start, end, point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const lengthSq = dx * dx + dy * dy + dz * dz;
  if (!Number.isFinite(lengthSq) || lengthSq < 1e-8) return 0;
  const t =
    ((point.x - start.x) * dx + (point.y - start.y) * dy + (point.z - start.z) * dz) / lengthSq;
  return Math.max(0, Math.min(1, t));
}

export function createCollisionBoundaryFeature({
  endpointId,
  graphLinkKey,
  nodeCollisionRadius,
  renderedNodeRadius,
  noTouchEpsilon,
  currentPhysicsTunablesConfig,
  normalizeRenderSettingsConfig,
  resolveZeroDistanceDirection,
}) {
  let nodeBoundaryPairCursor = 0;

  function applyNodeBoundary(nodeList, physicsConfig = null) {
    const physics = currentPhysicsTunablesConfig(physicsConfig);
    const totalPairs = totalPairCount(nodeList.length);
    const configuredPairBudget = Math.round(Number(physicsConfig?.nodeCollisionPairBudget) || 0);
    const pairBudget =
      configuredPairBudget > 0 ? Math.max(1, Math.min(totalPairs, configuredPairBudget)) : totalPairs;
    let collisions = 0;
    let maxPressure = 0;
    let zEscalations = 0;
    let pairsProcessed = 0;
    let pairBudgetReached = false;
    for (let pass = 0; pass < physics.nodeCollisionPasses; pass += 1) {
      if (totalPairs <= 0) break;
      const pressureMap =
        configuredPairBudget > 0
          ? new Map(nodeList.map((node) => [node.id, 0]))
          : buildCollisionPressureMap(nodeList, nodeCollisionRadius, noTouchEpsilon);
      let passCollisions = 0;
      let processedThisPass = 0;
      let [leftIndex, rightIndex] = pairFromOrdinal(
        nodeList.length,
        nodeBoundaryPairCursor % totalPairs,
      );
      while (processedThisPass < pairBudget && processedThisPass < totalPairs) {
        const left = nodeList[leftIndex];
        const right = nodeList[rightIndex];
        let dx = Number(right.x) - Number(left.x);
        let dy = Number(right.y) - Number(left.y);
        let dz = Number(right.z) - Number(left.z);
        let distance = Math.hypot(dx, dy, dz);
        if (!Number.isFinite(distance) || distance < 0.01) {
          ({ dx, dy, dz, distance } = resolveZeroDistanceDirection(
            `collision:${left.id}:${right.id}`,
          ));
        }
        const desired = nodeCollisionRadius(left) + nodeCollisionRadius(right) + noTouchEpsilon;
        const contact = nodeCollisionDisplacement({
          left,
          right,
          desired,
          dx,
          dy,
          dz,
          pressureMap,
          key: `collision:${left.id}:${right.id}:${pass}`,
        });
        if (contact && contact.overlap > 0) {
          const leftRadius = renderedNodeRadius(left);
          const rightRadius = renderedNodeRadius(right);
          const totalRadius = Math.max(0.01, leftRadius + rightRadius);
          const leftShare = Math.min(
            physics.collisionShareMax,
            Math.max(physics.collisionShareMin, rightRadius / totalRadius),
          );
          const rightShare = Math.min(
            physics.collisionShareMax,
            Math.max(physics.collisionShareMin, leftRadius / totalRadius),
          );
          left.x -= contact.nx * contact.overlap * leftShare;
          left.y -= contact.ny * contact.overlap * leftShare;
          left.z -= contact.nz * contact.overlap * leftShare;
          right.x += contact.nx * contact.overlap * rightShare;
          right.y += contact.ny * contact.overlap * rightShare;
          right.z += contact.nz * contact.overlap * rightShare;
          maxPressure = Math.max(maxPressure, contact.leftPressure, contact.rightPressure);
          collisions += 1;
          passCollisions += 1;
        }
        processedThisPass += 1;
        pairsProcessed += 1;
        rightIndex += 1;
        if (rightIndex >= nodeList.length) {
          leftIndex += 1;
          if (leftIndex >= nodeList.length - 1) leftIndex = 0;
          rightIndex = leftIndex + 1;
        }
      }
      nodeBoundaryPairCursor = (nodeBoundaryPairCursor + processedThisPass) % totalPairs;
      if (processedThisPass < totalPairs) pairBudgetReached = true;
      if (passCollisions === 0) break;
    }
    return {
      collisions,
      zEscalations,
      maxPressure,
      pairsProcessed,
      pairBudget,
      pairBudgetReached,
      rule: "collision-only-3d-contact-no-fixed-coordinate-lock",
    };
  }

  function runtimeVectorRadius(link, renderConfig = null) {
    const render = normalizeRenderSettingsConfig(renderConfig);
    const width = Number(link.visualWidth ?? link.thickness ?? link.width);
    const baseWidth = Number.isFinite(width) ? Math.max(0.08, width) : 0.68;
    return Math.max(0.04, (baseWidth * render.vectorDiameterVisualScale) / 2);
  }

  function applyVectorBoundary(nodeList, linkList, renderConfig = null, physicsConfig = null) {
    const physics = currentPhysicsTunablesConfig(physicsConfig);
    const nodes = new Map(nodeList.map((node) => [node.id, node]));
    const adjustedNodeIds = new Set();
    let collisions = 0;
    let maxOverlapBefore = 0;
    let maxOverlapAfter = 0;

    for (let pass = 0; pass < physics.vectorCollisionPasses; pass += 1) {
      let passCollisions = 0;
      for (const link of linkList) {
        const sourceId = endpointId(link.source);
        const targetId = endpointId(link.target);
        const source = nodes.get(sourceId);
        const target = nodes.get(targetId);
        if (!source || !target) continue;
        const start = { x: Number(source.x), y: Number(source.y), z: Number(source.z) };
        const end = { x: Number(target.x), y: Number(target.y), z: Number(target.z) };
        if (![start.x, start.y, start.z, end.x, end.y, end.z].every(Number.isFinite)) continue;
        const vectorRadius = runtimeVectorRadius(link, renderConfig);

        for (const node of nodeList) {
          if (!node?.id || node.id === sourceId || node.id === targetId) continue;
          const point = { x: Number(node.x), y: Number(node.y), z: Number(node.z) };
          if (![point.x, point.y, point.z].every(Number.isFinite)) continue;
          const t = closestSegmentParameter3d(start, end, point);
          if (t <= physics.vectorEndpointPadding || t >= 1 - physics.vectorEndpointPadding) {
            continue;
          }
          const closest = {
            x: start.x + (end.x - start.x) * t,
            y: start.y + (end.y - start.y) * t,
            z: start.z + (end.z - start.z) * t,
          };
          let dx = point.x - closest.x;
          let dy = point.y - closest.y;
          let dz = point.z - closest.z;
          let distance = Math.hypot(dx, dy, dz);
          if (!Number.isFinite(distance) || distance < 0.01) {
            const resolved = resolveZeroDistanceDirection(
              `vector-collision:${graphLinkKey(link)}:${node.id}:${pass}`,
            );
            dx = resolved.dx;
            dy = resolved.dy;
            dz = resolved.dz;
            distance = resolved.distance;
          }
          const desired = nodeCollisionRadius(node) + vectorRadius + noTouchEpsilon;
          const contact = vectorCollisionDisplacement({
            dx,
            dy,
            dz,
            desired,
            key: `vector-collision:${graphLinkKey(link)}:${node.id}:${pass}`,
          });
          if (!contact || contact.overlap <= 0) continue;
          node.x += contact.nx * contact.overlap;
          node.y += contact.ny * contact.overlap;
          node.z += contact.nz * contact.overlap;
          collisions += 1;
          passCollisions += 1;
          adjustedNodeIds.add(node.id);
          maxOverlapBefore = Math.max(maxOverlapBefore, contact.overlap);
          maxOverlapAfter = Math.max(maxOverlapAfter, 0);
        }
      }
      if (passCollisions === 0) break;
    }

    return {
      collisions,
      adjustedNodes: adjustedNodeIds.size,
      maxOverlapBefore: Number(maxOverlapBefore.toFixed(6)),
      maxOverlapAfter: Number(maxOverlapAfter.toFixed(6)),
    };
  }

  function settle(nodeList, linkList, renderConfig = null, options = {}) {
    const physics = currentPhysicsTunablesConfig(options.physicsTunables || options.physicsConfig);
    const enableNodeBoundary = options.enableNodeBoundary !== false;
    const enableVectorBoundary = options.enableVectorBoundary !== false;
    const maxPasses = Math.max(
      1,
      Math.min(160, Math.round(Number(options.maxPasses) || physics.settlementMaxPasses)),
    );
    let moved = 0;
    let collisionBoundary = {
      collisions: 0,
      zEscalations: 0,
      maxPressure: 0,
      pairsProcessed: 0,
      pairBudget: 0,
      pairBudgetReached: false,
      rule: "collision-only-3d-contact-no-fixed-coordinate-lock",
    };
    let vectorCollisionBoundary = {
      collisions: 0,
      adjustedNodes: 0,
      maxOverlapBefore: 0,
      maxOverlapAfter: 0,
    };

    for (let pass = 0; pass < maxPasses; pass += 1) {
      const vectorStats = enableVectorBoundary
        ? applyVectorBoundary(nodeList, linkList, renderConfig, physics)
        : vectorCollisionBoundary;
      const nodeCollisions = enableNodeBoundary
        ? applyNodeBoundary(nodeList, physics)
        : collisionBoundary;
      moved += vectorStats.collisions + nodeCollisions.collisions;
      collisionBoundary = nodeCollisions;
      vectorCollisionBoundary = vectorStats;
      if (vectorStats.collisions === 0 && nodeCollisions.collisions === 0) break;
    }

    return { moved, collisionBoundary, vectorCollisionBoundary };
  }

  return {
    id: "collisionBoundary",
    file: "features/collisionBoundary.js",
    applyNodeBoundary,
    applyVectorBoundary,
    settle,
  };
}
