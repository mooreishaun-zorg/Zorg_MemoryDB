function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function deterministicFlatDirection(key = "") {
  let hash = 2166136261;
  for (const char of String(key)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const angle = ((hash >>> 0) / 4294967296) * Math.PI * 2;
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

function stronger(current, next) {
  if (!current) return next;
  return next.magnitude > current.magnitude ? next : current;
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

export function createElectromagneticRepulsionFeature({
  nodeCollisionRadius,
  maxPairsPerTick = 16000,
  fieldScale = 1,
  strength = 0.18,
  maxDisplacement = 2.75,
} = {}) {
  function fieldRadius(node) {
    return Math.max(0, finiteNumber(nodeCollisionRadius?.(node), finiteNumber(node?.collisionRadius)));
  }

  let pairCursor = 0;

  function apply(nodeList) {
    const nodes = Array.isArray(nodeList) ? nodeList.filter((node) => node?.id) : [];
    for (const node of nodes) {
      const radius = fieldRadius(node);
      node.electromagneticFeatureFile = "features/electromagneticRepulsion.js";
      node.electromagneticPolarity = "same";
      node.electromagneticFieldRadius = Number(radius.toFixed(6));
      node.electromagneticRule = "same-polarity-bounded-non-stacking-collision-field";
    }

    const displacements = new Map();
    let checkedPairs = 0;
    let interactions = 0;
    let maxApplied = 0;
    const totalPairs = totalPairCount(nodes.length);
    const pairBudget = Math.max(0, Math.min(totalPairs, Math.round(Number(maxPairsPerTick)) || 0));

    if (pairBudget > 0 && totalPairs > 0) {
      let [leftIndex, rightIndex] = pairFromOrdinal(nodes.length, pairCursor % totalPairs);
      while (checkedPairs < pairBudget) {
        const left = nodes[leftIndex];
        checkedPairs += 1;
        const right = nodes[rightIndex];
        const leftField = fieldRadius(left) * fieldScale;
        const rightField = fieldRadius(right) * fieldScale;
        const fieldContactDistance = leftField + rightField;
        if (fieldContactDistance > 0) {
          const dx = finiteNumber(right.x) - finiteNumber(left.x);
          const dy = finiteNumber(right.y) - finiteNumber(left.y);
          const dz = finiteNumber(right.z) - finiteNumber(left.z);
          const distance = Math.hypot(dx, dy, dz);
          if (Number.isFinite(distance) && distance < fieldContactDistance) {
            const flatDistance = Math.hypot(dx, dy);
            const direction =
              flatDistance > 0.001
                ? { x: dx / flatDistance, y: dy / flatDistance }
                : deterministicFlatDirection(`electromagnetic:${left.id}:${right.id}`);
            const magnitude = Math.min(
              maxDisplacement,
              Math.max(0, fieldContactDistance - distance) * strength,
            );
            if (magnitude > 0) {
              interactions += 1;
              maxApplied = Math.max(maxApplied, magnitude);
              displacements.set(
                left.id,
                stronger(displacements.get(left.id), {
                  dx: -direction.x * magnitude,
                  dy: -direction.y * magnitude,
                  magnitude,
                }),
              );
              displacements.set(
                right.id,
                stronger(displacements.get(right.id), {
                  dx: direction.x * magnitude,
                  dy: direction.y * magnitude,
                  magnitude,
                }),
              );
            }
          }
        }
        rightIndex += 1;
        if (rightIndex >= nodes.length) {
          leftIndex += 1;
          if (leftIndex >= nodes.length - 1) leftIndex = 0;
          rightIndex = leftIndex + 1;
        }
      }
      pairCursor = (pairCursor + checkedPairs) % totalPairs;
    }

    let affectedNodes = 0;
    for (const node of nodes) {
      const displacement = displacements.get(node.id);
      if (!displacement) continue;
      node.x = finiteNumber(node.x) + displacement.dx;
      node.y = finiteNumber(node.y) + displacement.dy;
      affectedNodes += 1;
    }

    return {
      affectedNodes,
      interactions,
      checkedPairs,
      pairLimitReached: checkedPairs < totalPairs,
      pairCursor,
      totalPairs,
      maxApplied: Number(maxApplied.toFixed(6)),
      rule: "same-polarity-electromagnetic-repulsion-bounded-non-stacking-no-coordinate-lock",
    };
  }

  return {
    id: "electromagneticRepulsion",
    file: "features/electromagneticRepulsion.js",
    apply,
  };
}
