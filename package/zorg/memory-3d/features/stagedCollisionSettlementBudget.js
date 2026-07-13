const stagedNodePassCap = 2;
const stagedSettlementPassCap = 1;
const liveNodePassCap = 1;
const liveVectorPassCap = 1;
const liveSettlementPassCap = 1;
const stagedNodePairBudget = 24000;
const liveNodePairBudget = 32000;
const largeGraphNodeThreshold = 120;
const largeGraphPairThreshold = 18000;

function capPositiveInteger(value, cap) {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number) || number < 1) return 1;
  return Math.max(1, Math.min(cap, number));
}

export function collisionSettlementBudgetForStage({
  physicsTunables = {},
  stagedBuildInProgress = false,
  reason = "runtime-frame",
  nodeCount = 0,
  linkCount = 0,
} = {}) {
  const runtimeFrame = reason === "runtime-frame";
  const pairLoad = Math.max(0, Number(nodeCount) || 0) * Math.max(0, Number(linkCount) || 0);
  const largeLiveGraph =
    Math.max(0, Number(nodeCount) || 0) >= largeGraphNodeThreshold ||
    pairLoad >= largeGraphPairThreshold;

  if (!stagedBuildInProgress) {
    if (runtimeFrame || largeLiveGraph) {
      return {
        physicsTunables: {
          ...physicsTunables,
          nodeCollisionPasses: capPositiveInteger(physicsTunables.nodeCollisionPasses, liveNodePassCap),
          nodeCollisionPairBudget: liveNodePairBudget,
          vectorCollisionPasses: capPositiveInteger(
            physicsTunables.vectorCollisionPasses,
            liveVectorPassCap,
          ),
          settlementMaxPasses: capPositiveInteger(
            physicsTunables.settlementMaxPasses,
            liveSettlementPassCap,
          ),
        },
        enableNodeBoundary: true,
        enableVectorBoundary: true,
        rule: runtimeFrame
          ? "incremental-runtime-collision-settlement"
          : "incremental-large-graph-collision-settlement",
        reason,
        nodeCount,
        linkCount,
        pairLoad,
      };
    }

    return {
      physicsTunables,
      enableNodeBoundary: true,
      enableVectorBoundary: true,
      rule: "full-collision-settlement",
      reason,
      nodeCount,
      linkCount,
      pairLoad,
    };
  }

  return {
    physicsTunables: {
      ...physicsTunables,
      nodeCollisionPasses: capPositiveInteger(
        physicsTunables.nodeCollisionPasses,
        stagedNodePassCap,
      ),
      nodeCollisionPairBudget: stagedNodePairBudget,
      settlementMaxPasses: capPositiveInteger(
        physicsTunables.settlementMaxPasses,
        stagedSettlementPassCap,
      ),
    },
    enableNodeBoundary: true,
    enableVectorBoundary: false,
    rule: runtimeFrame
      ? "staged-admission-bounded-runtime-node-collision-vector-deferred"
      : "staged-admission-bounded-node-collision-vector-deferred",
    reason,
    nodeCount,
    linkCount,
    pairLoad,
  };
}
