import type { GitCommit } from "./types";
export interface Segment {
  from: number;
  to: number;
  color: number;
}
export interface GraphRow {
  lane: number;
  color: number;
  incoming: Segment[];
  outgoing: Segment[];
  passing: Segment[];
  laneCount: number;
}
export function commitGraph(commits: GitCommit[]): GraphRow[] {
  let lanes: ({ id: string; color: number } | null)[] = [];
  let nextColor = 0;
  return commits.map((commit) => {
    const before = [...lanes];
    let node = lanes.findIndex((l) => l?.id === commit.id);
    if (node < 0) {
      node = lanes.findIndex((l) => l === null);
      if (node < 0) node = lanes.length;
      lanes[node] = { id: commit.id, color: nextColor++ };
    }
    const color = lanes[node]!.color;
    const row: GraphRow = {
      lane: node,
      color,
      incoming: [],
      outgoing: [],
      passing: [],
      laneCount: 1,
    };
    before.forEach((entry, index) => {
      if (entry?.id === commit.id)
        row.incoming.push({ from: index, to: node, color: entry.color });
    });
    lanes = lanes.map((l, i) => (i !== node && l?.id === commit.id ? null : l));
    lanes[node] = null;
    const adopted: Segment[] = [];
    commit.parents.forEach((parent, position) => {
      const existing = lanes.findIndex((l) => l?.id === parent);
      if (existing >= 0) {
        if (position === 0 && existing > node) {
          adopted.push({
            from: existing,
            to: node,
            color: lanes[existing]!.color,
          });
          lanes[existing] = null;
          lanes[node] = { id: parent, color };
          row.outgoing.push({ from: node, to: node, color });
        } else
          row.outgoing.push({
            from: node,
            to: existing,
            color: lanes[existing]!.color,
          });
        return;
      }
      let target = node;
      let parentColor = color;
      if (position > 0) {
        target = lanes.findIndex((l) => l === null);
        if (target < 0) target = lanes.length;
        parentColor = nextColor++;
      }
      lanes[target] = { id: parent, color: parentColor };
      row.outgoing.push({ from: node, to: target, color: parentColor });
    });
    before.forEach((entry, index) => {
      if (entry && entry.id !== commit.id && lanes[index]?.id === entry.id)
        row.passing.push({ from: index, to: index, color: entry.color });
    });
    row.passing.push(...adopted);
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    row.laneCount = Math.max(before.length, lanes.length, node + 1);
    return row;
  });
}
