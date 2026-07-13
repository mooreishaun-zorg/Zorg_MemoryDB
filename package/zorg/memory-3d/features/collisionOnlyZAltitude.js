export function createCollisionOnlyZAltitudeFeature() {
  function apply(nodeList = []) {
    for (const node of nodeList) {
      if (!node?.id) continue;
      delete node.collisionOnlyZParentZ;
      node.collisionOnlyZAltitudeRule = "disabled-no-fixed-z-lock";
      node.collisionOnlyZFlattened = false;
    }

    return {
      rule: "disabled-no-fixed-z-lock",
      flattened: 0,
    };
  }

  return {
    id: "collisionOnlyZAltitude",
    file: "features/collisionOnlyZAltitude.js",
    apply,
  };
}
