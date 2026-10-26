import { boardStatuses, type TaskStatus } from "./types";
export function nextBoardStatus(
  status: TaskStatus,
  direction: -1 | 1,
): TaskStatus {
  const index = boardStatuses.indexOf(status);
  return boardStatuses[
    Math.max(0, Math.min(boardStatuses.length - 1, index + direction))
  ];
}
