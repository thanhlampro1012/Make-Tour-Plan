import { type Trip, type Activity, type Booking, activitySchema, bookingCategory, duration, getTravelers, normalizeSearch, shiftTripDates, uid } from "./travel";

const metadataLabels = {
  title: "tên chuyến đi", destination: "điểm đến", startDate: "ngày khởi hành",
  endDate: "ngày kết thúc", people: "số người", budget: "ngân sách",
  timezone: "múi giờ", notes: "ghi chú chung", travelers: "tên người đi cùng",
} as const;
type MetadataKey = keyof typeof metadataLabels;

function metadataValue(key: MetadataKey, value: unknown): unknown {
  if (key === "travelers") {
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every(name => typeof name === "string")) throw new Error("Tên người đi cùng phải là một danh sách tên hợp lệ.");
    return value.map(name => name.trim());
  }
  if ((key === "title" || key === "destination") && typeof value === "string") return value.trim();
  return value;
}

const sameMetadata = (key: MetadataKey, a: unknown, b: unknown) => JSON.stringify(metadataValue(key, a)) === JSON.stringify(metadataValue(key, b));

/**
 * Edit metadata against the latest trip. A form baseline enables a three-way
 * merge: untouched fields retain remote edits, divergent edits conflict.
 * Collections and future model fields always come from the latest trip.
 */
export function prepareTripEdit(previous: Trip | undefined, draft: Record<string, any>, baseline?: Trip): Trip {
  const { shiftAll, travelersText, ...values } = draft;
  if (typeof travelersText === "string") values.travelers = travelersText.split("\n").map(x => x.trim()).filter(Boolean);
  if (baseline && !previous) throw new Error("Chuyến đi này đã bị xóa ở phiên khác. Nội dung đang nhập vẫn được giữ; không thể lưu lại như một chuyến đi mới.");
  if (previous && (values.id !== previous.id || (baseline && baseline.id !== previous.id))) throw new Error("Chuyến đi đang chỉnh sửa không còn khớp. Hãy mở lại đúng chuyến đi trước khi lưu.");
  let next: Trip;
  if (!previous) {
    next = { ...values } as Trip;
  } else {
    const merged: Record<string, any> = { ...previous };
    const conflicts: string[] = [];
    for (const key of Object.keys(metadataLabels) as MetadataKey[]) {
      if (!Object.hasOwn(values, key)) continue;
      const value = metadataValue(key, values[key]);
      if (baseline && sameMetadata(key, value, baseline[key])) continue;
      if (baseline && !sameMetadata(key, previous[key], baseline[key]) && !sameMetadata(key, previous[key], value)) {
        conflicts.push(metadataLabels[key]);
        continue;
      }
      merged[key] = value;
    }
    if (conflicts.length) throw new Error(`Các mục ${conflicts.join(", ")} đã được sửa ở phiên khác. Nội dung bạn đang nhập vẫn được giữ; hãy kiểm tra bản mới trước khi lưu.`);
    next = merged as Trip;
  }
  if (!Number.isInteger(next.people) || next.people < 1 || next.people > 100) throw new Error("Số người phải là số nguyên từ 1 đến 100.");
  if (!previous) return next;
  if (shiftAll && previous.startDate !== next.startDate) {
    const shifted = shiftTripDates(previous, next.startDate, next.endDate);
    next = { ...next, activities: shifted.activities, bookings: shifted.bookings, dayNotes: shifted.dayNotes };
  }
  const before = getTravelers(previous), after = getTravelers(next);
  const beforeKeys = before.map(normalizeSearch), afterKeys = after.map(normalizeSearch);
  const rename = (payer: string | undefined) => {
    const key = normalizeSearch(payer || "");
    // Keeping or reordering a known name never changes who made its payments.
    const retained = afterKeys.indexOf(key);
    if (retained >= 0) return after[retained];
    const index = beforeKeys.indexOf(key);
    // A different existing member in this row means a removal/reorder, not a rename.
    if (index >= 0 && index < after.length && !beforeKeys.includes(afterKeys[index])) return after[index];
    return payer;
  };
  const historical = <T extends { actualCost: number | null; perPerson: boolean; actualPeople?: number; paidBy?: string }>(item: T): T => ({ ...item, paidBy: rename(item.paidBy), ...(item.actualCost !== null && item.perPerson && item.actualPeople === undefined ? { actualPeople: previous.people } : {}) });
  next.activities = next.activities.map(historical);
  next.expenses = next.expenses.map(item => ({ ...historical(item), paidBy: rename(item.paidBy) || "" }));
  next.bookings = next.bookings.map(item => ({ ...item, paidBy: rename(item.paidBy) }));
  return next;
}

/** Duplicate the currently edited draft, keeping its plan but no recorded payments. */
export function duplicateActivity(draft: Activity): Activity {
  const parsed = activitySchema.parse(draft);
  return { ...parsed, id: uid(), title: `${parsed.title} (bản sao)`.slice(0, 180), actualCost: null, actualPeople: undefined, paidBy: "", bookingId: "", status: "planned", previousStatus: undefined };
}

export function activityFromBooking(booking: Booking): Omit<Activity, "id"> {
  const start = booking.time || "09:00";
  const [h, m] = start.split(":").map(Number); const end = h * 60 + m + 60;
  return { title: booking.title, category: bookingCategory(booking.type), date: booking.date, startTime: start, endTime: `${String(Math.floor(end / 60) % 24).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`, endNextDay: end >= 1440, place: booking.provider, address: "", transport: "", travelMinutes: 0, cost: 0, actualCost: null, perPerson: false, paidBy: "", status: booking.status === "confirmed" ? "booked" : "planned", notes: "Thời lượng ban đầu là 1 giờ. Điều chỉnh giờ, địa chỉ và thời lượng theo xác nhận đặt chỗ.", bookingId: booking.id, url: booking.url, priority: "normal", backup: "" };
}
