export function createPositionSanityFeature({ usableRuntimePosition, runtimeSpawnPosition }) {
  function apply(nodeList) {
    let repaired = 0;
    for (const node of nodeList) {
      if (usableRuntimePosition(node)) continue;
      Object.assign(node, runtimeSpawnPosition(node, nodeList));
      repaired += 1;
    }
    return repaired;
  }

  return {
    id: "positionSanity",
    file: "features/positionSanity.js",
    apply,
  };
}
