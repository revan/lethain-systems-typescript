/** Collection of reused algorithms. Port of `systems/algos.py`. */
import { ValueError } from "./py.js";

/**
 * Peel off nodes with no incoming edges until nothing changes.
 *
 * Mirrors the Python implementation exactly, including mutating `inGraph`
 * and relying on insertion order. Returns `[hasCycle, cycles, deps]`.
 */
export function findCycles(
  inGraph: Map<string, string[]>,
  outGraph: Map<string, string[]>,
): [boolean, Map<string, string[]>, string[]] {
  const cycles = new Map(outGraph);
  const deps: string[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const [node, edges] of cycles) {
      // if you have no incoming edges and do have outgoing edges,
      // then trim those edges away
      if (inGraph.get(node)?.length === 0 && edges.length > 0) {
        for (const edge of edges) {
          const incoming = inGraph.get(edge) ?? [];
          const idx = incoming.indexOf(node);
          if (idx === -1) throw new ValueError("list.remove(x): x not in list");
          incoming.splice(idx, 1);
          cycles.set(node, []);
        }
        deps.push(node);
        changed = true;
      }
    }
  }
  const hasCycle = [...cycles.values()].some((x) => x.length > 0);
  return [hasCycle, cycles, deps.reverse()];
}
