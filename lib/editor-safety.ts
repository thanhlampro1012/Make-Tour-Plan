import { type Trip } from "./travel";

/** Compare the exact snapshot a user edited; never silently restore an older remote version. */
export function sameSnapshot(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function assertUnchangedRecord(baseline: unknown, current: unknown): void {
  if (!current) throw new Error("Mục này đã bị xóa ở phiên khác. Đóng cửa sổ để xem lịch mới nhất.");
  if (!sameSnapshot(baseline, current)) throw new Error("Mục này đã thay đổi ở phiên khác khi bạn đang sửa. Chép phần cần giữ, đóng cửa sổ rồi mở lại mục mới nhất.");
}

export function canUndoTrips(current: Trip[], expectedAfter: string): boolean {
  return JSON.stringify(current) === expectedAfter;
}
