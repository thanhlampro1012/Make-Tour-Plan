import { z } from "zod";

/** All amounts are in Vietnamese đồng. Per-person values apply to the whole party. */
export const categories = {
  food: { label: "Ăn uống", color: "#C87643", icon: "utensils" },
  visit: { label: "Tham quan", color: "#527969", icon: "camera" },
  transport: { label: "Di chuyển", color: "#567CA1", icon: "car" },
  stay: { label: "Lưu trú", color: "#8A74A2", icon: "bed" },
  coffee: { label: "Cà phê", color: "#A97C59", icon: "coffee" },
  shopping: { label: "Mua sắm", color: "#B86C85", icon: "shopping-bag" },
  other: { label: "Khác", color: "#71818A", icon: "ellipsis" },
} as const;

export type Category = keyof typeof categories;
export const categoryKeys = Object.keys(categories) as Category[];
export const DEFAULT_TIMEZONE = "Asia/Ho_Chi_Minh";
/** Google Maps mobile web accepts three intermediate waypoints. */
export const MAX_ROUTE_STOPS = 5;
export const MAX_MAP_URL_LENGTH = 2048;
/** Compact UTF-8 backup size. Leave room for API and browser-cache metadata. */
export const MAX_STATE_BYTES = 1_800_000;
export const MAX_BACKUP_BYTES = 4_000_000;

export interface Activity {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  endNextDay: boolean;
  title: string;
  category: Category;
  place: string;
  address: string;
  transport: string;
  /** Minutes needed to reach this activity from the preceding activity. */
  travelMinutes: number;
  cost: number;
  actualCost: number | null;
  perPerson: boolean;
  status: "planned" | "booked" | "done";
  notes: string;
  bookingId: string;
  url: string;
  priority: "normal" | "must";
  backup: string;
  paidBy?: string;
  /** Party size when a per-person actual cost was recorded. */
  actualPeople?: number;
  previousStatus?: "planned" | "booked";
}

export interface Expense {
  id: string;
  title: string;
  category: Category;
  cost: number;
  actualCost: number | null;
  perPerson: boolean;
  paidBy: string;
  notes: string;
  actualPeople?: number;
}

export interface Booking {
  id: string;
  title: string;
  type: string;
  date: string;
  time: string;
  reference: string;
  provider: string;
  url: string;
  phone: string;
  total: number;
  paid: number;
  status: "pending" | "confirmed" | "cancelled";
  notes: string;
  refunded?: number;
  paidBy?: string;
}

export interface Place {
  id: string;
  name: string;
  address: string;
  category: Category;
  url: string;
  notes: string;
  visited: boolean;
}

export interface CheckItem {
  id: string;
  text: string;
  group: string;
  done: boolean;
  assignee: string;
}

export interface SourceReference {
  id: string;
  title: string;
  url: string;
  place: string;
  notes: string;
  read: boolean;
  addedOn: string;
}

export interface Trip {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  people: number;
  budget: number;
  timezone: string;
  notes: string;
  sample: boolean;
  activities: Activity[];
  expenses: Expense[];
  bookings: Booking[];
  places: Place[];
  checklist: CheckItem[];
  dayNotes: Record<string, string>;
  travelers?: string[];
  references?: SourceReference[];
}

const DAY_MS = 86_400_000;
const MAX_AMOUNT = 1_000_000_000_000;
const categorySchema = z.enum(["food", "visit", "transport", "stay", "coffee", "shopping", "other"]);
const idSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/, "Mã dữ liệu không hợp lệ.");
const amountSchema = z.number().finite().min(0, "Chi phí không được âm.").max(MAX_AMOUNT, "Chi phí quá lớn.");
const titleSchema = z.string().trim().min(1, "Vui lòng nhập tên.").max(180, "Tên tối đa 180 ký tự.");
const text = (max = 500) => z.string().max(max, `Nội dung tối đa ${max} ký tự.`);
const actualPeopleSchema = z.number().int().min(1).max(100).optional();

export function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase("vi-VN").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim().replace(/\s+/g, " ");
}

function validDate(value: string): boolean {
  if (!/^(19|20|21)\d{2}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const result = new Date(Date.UTC(year, month - 1, day));
  return result.getUTCFullYear() === year && result.getUTCMonth() === month - 1 && result.getUTCDate() === day;
}

export const dateSchema = z.string().refine(validDate, "Ngày phải có dạng YYYY-MM-DD và nằm trong năm 1900–2199.");
const timeSchema = z.string().regex(/^$|^(?:[01]\d|2[0-3]):[0-5]\d$/, "Giờ phải có dạng HH:mm.");
const urlSchema = z.string().max(2048).refine((value) => {
  if (value === "") return true;
  if (!/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}, "Đường dẫn phải bắt đầu bằng https:// hoặc http://.");

function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(0);
    return true;
  } catch {
    return false;
  }
}

export const activitySchema: z.ZodType<Activity> = z.object({
  id: idSchema,
  date: dateSchema,
  startTime: timeSchema,
  endTime: timeSchema,
  endNextDay: z.boolean(),
  title: titleSchema,
  category: categorySchema,
  place: text(240),
  address: text(600),
  transport: text(80),
  travelMinutes: z.number().int().min(0).max(1440),
  cost: amountSchema,
  actualCost: amountSchema.nullable(),
  perPerson: z.boolean(),
  status: z.enum(["planned", "booked", "done"]),
  notes: text(5000),
  bookingId: z.union([z.literal(""), idSchema]),
  url: urlSchema,
  priority: z.enum(["normal", "must"]),
  backup: text(2000),
  paidBy: text(120).optional(),
  actualPeople: actualPeopleSchema,
  previousStatus: z.enum(["planned", "booked"]).optional(),
}).strict().superRefine((item, ctx) => {
  if (Boolean(item.startTime) !== Boolean(item.endTime)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [item.startTime ? "endTime" : "startTime"], message: "Nhập cả giờ bắt đầu và kết thúc, hoặc để trống cả hai." });
  }
  if (!item.startTime && item.endNextDay) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endNextDay"], message: "Cần nhập giờ trước khi chọn kết thúc vào ngày hôm sau." });
  }
  if (item.startTime && item.endTime) {
    const length = duration(item);
    if (length <= 0 || length > 1440) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endTime"], message: "Thời lượng phải lớn hơn 0 và không quá 24 giờ. Chọn ngày hôm sau nếu đi qua nửa đêm." });
    }
  }
});

export const expenseSchema: z.ZodType<Expense> = z.object({
  id: idSchema,
  title: titleSchema,
  category: categorySchema,
  cost: amountSchema,
  actualCost: amountSchema.nullable(),
  perPerson: z.boolean(),
  paidBy: text(120),
  notes: text(5000),
  actualPeople: actualPeopleSchema,
}).strict();

export const bookingSchema: z.ZodType<Booking> = z.object({
  id: idSchema,
  title: titleSchema,
  type: text(60).min(1),
  date: dateSchema,
  time: timeSchema,
  reference: text(160),
  provider: text(240),
  url: urlSchema,
  phone: text(80),
  total: amountSchema,
  paid: amountSchema,
  status: z.enum(["pending", "confirmed", "cancelled"]),
  notes: text(5000),
  refunded: amountSchema.optional(),
  paidBy: text(120).optional(),
}).strict().superRefine((item, ctx) => {
  if (item.paid > item.total) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["paid"], message: "Số tiền đã trả không được lớn hơn tổng tiền đặt chỗ." });
  }
  if ((item.refunded ?? 0) > item.paid) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["refunded"], message: "Số tiền hoàn lại không được lớn hơn khoản đã trả." });
  }
});

export const placeSchema: z.ZodType<Place> = z.object({
  id: idSchema,
  name: titleSchema,
  address: text(600),
  category: categorySchema,
  url: urlSchema,
  notes: text(5000),
  visited: z.boolean(),
}).strict();

export const checkItemSchema: z.ZodType<CheckItem> = z.object({
  id: idSchema,
  text: z.string().trim().min(1, "Vui lòng nhập nội dung.").max(500),
  group: z.string().trim().min(1).max(80),
  done: z.boolean(),
  assignee: text(120),
}).strict();

export const referenceSchema: z.ZodType<SourceReference> = z.object({
  id: idSchema,
  title: titleSchema,
  url: urlSchema.refine(value => Boolean(value), "Vui lòng nhập đường dẫn bài viết hoặc địa điểm."),
  place: text(240),
  notes: text(5000),
  read: z.boolean(),
  addedOn: dateSchema,
}).strict();

export const tripSchema: z.ZodType<Trip> = z.object({
  id: idSchema,
  title: titleSchema,
  destination: z.string().trim().min(1, "Vui lòng nhập điểm đến.").max(240),
  startDate: dateSchema,
  endDate: dateSchema,
  people: z.number().int().min(1).max(100),
  budget: amountSchema,
  timezone: z.string().max(80).refine(validTimezone, "Múi giờ không hợp lệ. Ví dụ: Asia/Ho_Chi_Minh."),
  notes: text(10000),
  sample: z.boolean(),
  activities: z.array(activitySchema).max(600, "Mỗi chuyến đi tối đa 600 hoạt động."),
  expenses: z.array(expenseSchema).max(400),
  bookings: z.array(bookingSchema).max(100),
  places: z.array(placeSchema).max(300),
  checklist: z.array(checkItemSchema).max(500),
  dayNotes: z.record(dateSchema, text(5000)).refine((value) => Object.keys(value).length <= 180, "Tối đa 180 ghi chú ngày."),
  travelers: z.array(z.string().trim().min(1, "Tên người đi cùng không được để trống.").max(120)).max(100).optional(),
  references: z.array(referenceSchema).max(300, "Mỗi chuyến tối đa 300 nguồn tham khảo.").optional(),
}).strict().superRefine((trip, ctx) => {
  if (validDate(trip.startDate) && validDate(trip.endDate)) {
    const days = (dayTimestamp(trip.endDate) - dayTimestamp(trip.startDate)) / DAY_MS;
    if (days < 0 || days > 89) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "Ngày kết thúc phải sau hoặc trùng ngày bắt đầu; một chuyến đi tối đa 90 ngày." });
    }
  }
  for (const key of ["activities", "expenses", "bookings", "places", "checklist"] as const) {
    const seen = new Set<string>();
    trip[key].forEach((item, index) => {
      if (seen.has(item.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key, index, "id"], message: "Mã dữ liệu bị trùng trong danh sách." });
      seen.add(item.id);
    });
  }
  const referenceIds = new Set<string>();
  for (const item of trip.references ?? []) {
    if (referenceIds.has(item.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["references"], message: "Mã nguồn tham khảo bị trùng." });
    referenceIds.add(item.id);
  }
  if (trip.travelers) {
    if (trip.travelers.length > trip.people) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["travelers"], message: "Số tên người đi cùng không được nhiều hơn số người của chuyến đi." });
    }
    const names = new Set<string>();
    trip.travelers.forEach((name, index) => {
      const normalized = normalizeSearch(name);
      if (names.has(normalized)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["travelers", index], message: "Tên người đi cùng bị trùng. Hãy dùng tên phân biệt cho từng người." });
      names.add(normalized);
    });
  }
  const entries = costEntries(trip);
  const planned = entries.reduce((sum, item) => sum + item.planned, 0);
  const spent = entries.reduce((sum, item) => sum + item.spent, 0);
  if (planned > Number.MAX_SAFE_INTEGER - 1000 || spent > Number.MAX_SAFE_INTEGER - 1000) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["budget"], message: "Tổng chi phí quá lớn để đối soát chính xác tới từng đồng. Hãy kiểm tra lại số tiền và số người." });
  }
});

export const backupSchema = z.object({
  version: z.literal(1),
  trips: z.array(tripSchema).max(30, "Tối đa 30 chuyến đi trong một bản sao lưu."),
}).strict().superRefine((backup, ctx) => {
  const ids = new Set<string>();
  backup.trips.forEach((trip, index) => {
    if (ids.has(trip.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["trips", index, "id"], message: "Có chuyến đi trùng mã trong bản sao lưu." });
    ids.add(trip.id);
  });
  if (new TextEncoder().encode(JSON.stringify(backup)).byteLength > MAX_STATE_BYTES) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["trips"], message: "Dữ liệu vượt giới hạn lưu 1,8 MB. Hãy xuất bản sao rồi bớt các chuyến đi hoặc ghi chú dài trước khi lưu." });
  }
});

export function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function dayTimestamp(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function addDays(date: string, count: number): string {
  if (!validDate(date) || !Number.isInteger(count)) throw new Error("Ngày hoặc số ngày không hợp lệ.");
  return new Date(dayTimestamp(date) + count * DAY_MS).toISOString().slice(0, 10);
}

/** Includes preserved activity/notes dates even after trip dates are shortened. */
export function dayList(trip: Trip): string[] {
  const result = new Set<string>();
  if (validDate(trip.startDate) && validDate(trip.endDate)) {
    const length = Math.min(90, Math.max(0, Math.floor((dayTimestamp(trip.endDate) - dayTimestamp(trip.startDate)) / DAY_MS) + 1));
    for (let index = 0; index < length; index++) result.add(addDays(trip.startDate, index));
  }
  trip.activities.forEach((item) => { if (validDate(item.date)) result.add(item.date); });
  Object.entries(trip.dayNotes).forEach(([date, note]) => { if (note.trim() && validDate(date)) result.add(date); });
  return [...result].sort();
}

export function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "2-digit" }): string {
  if (!validDate(date)) return "";
  return new Intl.DateTimeFormat("vi-VN", { ...options, timeZone: "UTC" }).format(dayTimestamp(date));
}

export function shortDate(date: string): string {
  return dateLabel(date, { day: "2-digit", month: "2-digit" });
}

export function minutes(time: string): number {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return 0;
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

export function duration(activity: Pick<Activity, "startTime" | "endTime" | "endNextDay">): number {
  if (!activity.startTime || !activity.endTime) return 0;
  return minutes(activity.endTime) + (activity.endNextDay ? 1440 : 0) - minutes(activity.startTime);
}

export function money(amount: number): string {
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(Number.isFinite(amount) ? amount : 0);
}

function searchMapUrl(query: string): string {
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query }).toString()}`;
}

function fittingSearchMapUrl(query: string): string {
  const characters = Array.from(query);
  let low = 0;
  let high = characters.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (searchMapUrl(characters.slice(0, middle).join("")).length <= MAX_MAP_URL_LENGTH) low = middle;
    else high = middle - 1;
  }
  return searchMapUrl(characters.slice(0, low).join(""));
}

function mapSearch(name: string, address = ""): { url: string; note?: string } {
  const query = [name.trim(), address.trim()].filter(Boolean).join(", ") || "Việt Nam";
  const complete = searchMapUrl(query);
  if (complete.length <= MAX_MAP_URL_LENGTH) return { url: complete };
  const namedQuery = name.trim() || address.trim() || "Việt Nam";
  const nameFits = searchMapUrl(namedQuery).length <= MAX_MAP_URL_LENGTH;
  return {
    url: nameFits ? searchMapUrl(namedQuery) : fittingSearchMapUrl(namedQuery),
    note: name.trim()
      ? `Thông tin địa điểm vượt giới hạn liên kết. Maps sẽ tìm theo tên${nameFits ? "" : " rút gọn"}; hãy kiểm tra đúng vị trí.`
      : "Địa chỉ vượt giới hạn liên kết. Maps sẽ mở tìm kiếm rút gọn; hãy kiểm tra đúng vị trí.",
  };
}

export function mapsUrl(name: string, address = ""): string {
  return mapSearch(name, address).url;
}

type LocatedStop = { name: string; address: string; query: string };
export type RouteMode = "driving" | "walking" | "transit" | "bicycling" | "two-wheeler";

function locatedStops(activities: Activity[]): LocatedStop[] {
  const stops: LocatedStop[] = [];
  for (const item of [...activities].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "99:99").localeCompare(b.startTime || "99:99"))) {
    const name = item.place.trim();
    const address = item.address.trim();
    const query = [name, address].filter(Boolean).join(", ");
    if (query && stops[stops.length - 1]?.query !== query) stops.push({ name, address, query });
  }
  return stops;
}

export function routeStops(activities: Activity[]): string[] {
  return locatedStops(activities).map((stop) => stop.query);
}

function routeMapUrl(stops: string[], mode?: RouteMode): string {
  const params = new URLSearchParams({ api: "1", origin: stops[0], destination: stops[stops.length - 1] });
  if (stops.length > 2) params.set("waypoints", stops.slice(1, -1).join("|"));
  if (mode) params.set("travelmode", mode);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export interface RouteSegment {
  /** Full location text, including when the URL must use a named-search fallback. */
  stops: string[];
  url: string;
  note?: string;
}

/** Covers every located stop. Transit uses pairs; normal route segments share an endpoint. */
export function routeSegments(activities: Activity[], mode?: RouteMode): RouteSegment[] {
  if (mode !== undefined && !["driving", "walking", "transit", "bicycling", "two-wheeler"].includes(mode)) throw new Error("Phương tiện chỉ đường không hợp lệ.");
  const all = locatedStops(activities);
  const result: RouteSegment[] = [];
  const maxStops = mode === "transit" ? 2 : MAX_ROUTE_STOPS;
  let index = 0;
  while (index < all.length) {
    let selected: RouteSegment | undefined;
    for (let count = Math.min(maxStops, all.length - index); count >= 2; count--) {
      const stops = all.slice(index, index + count).map((stop) => stop.query);
      const url = routeMapUrl(stops, mode);
      if (url.length <= MAX_MAP_URL_LENGTH) {
        selected = { stops, url };
        break;
      }
    }
    if (selected) {
      result.push(selected);
      if (index + selected.stops.length === all.length) break;
      index += selected.stops.length - 1;
      continue;
    }
    const stop = all[index];
    const previous = result[result.length - 1];
    // An endpoint already appears in the preceding route; do not add a redundant search.
    if (previous?.stops[previous.stops.length - 1] !== stop.query) {
      const search = mapSearch(stop.name, stop.address);
      const notes = [
        search.note || (all.length > 1 ? "Tuyến dài đã được tách để giữ liên kết hợp lệ. Mở riêng điểm này trên Maps." : ""),
        mode ? "Liên kết này mở tìm kiếm địa điểm; chọn điểm xuất phát và phương tiện trên Maps." : "",
      ].filter(Boolean);
      result.push({
        stops: [stop.query],
        url: search.url,
        ...(notes.length ? { note: notes.join(" ") } : {}),
      });
    }
    index++;
  }
  return result;
}

/** Compatibility helper: the first route segment. Use routeSegments() for the full journey. */
export function directionsUrl(activities: Activity[]): string {
  return routeSegments(activities)[0]?.url ?? mapsUrl("Việt Nam");
}

export function bookingCategory(type: string): Category {
  if (categoryKeys.includes(type as Category)) return type as Category;
  const normalized = type.toLocaleLowerCase("vi-VN");
  if (/hotel|homestay|accommodation|khách sạn|lưu trú/.test(normalized)) return "stay";
  if (/flight|train|bus|transport|máy bay|xe|tàu|di chuyển/.test(normalized)) return "transport";
  if (/restaurant|food|nhà hàng|ăn/.test(normalized)) return "food";
  if (/ticket|visit|vé|tham quan/.test(normalized)) return "visit";
  return "other";
}

export interface Summary {
  planned: number;
  spent: number;
  /** Budget less recorded payments/actual costs. */
  remaining: number;
  /** Budget less all planned costs. */
  plannedRemaining: number;
  byCategory: { category: Category; planned: number; spent: number }[];
}

export function plannedAmount(item: Pick<Activity | Expense, "cost" | "perPerson">, people: number): number {
  return item.cost * (item.perPerson ? people : 1);
}

export function actualAmount(item: Pick<Activity | Expense, "actualCost" | "perPerson" | "actualPeople">, people: number): number {
  return (item.actualCost ?? 0) * (item.perPerson ? item.actualPeople ?? people : 1);
}

export function bookingBudget(booking: Booking): { planned: number; spent: number; remaining: number } {
  const net = booking.paid - (booking.refunded ?? 0);
  return booking.status === "cancelled"
    ? { planned: net, spent: net, remaining: 0 }
    : { planned: booking.total, spent: net, remaining: booking.total - net };
}

type CostEntry = { category: Category; planned: number; spent: number; paidBy: string };

function costEntries(trip: Trip): CostEntry[] {
  const bookingIds = new Set(trip.bookings.map((item) => item.id));
  const entries: CostEntry[] = [];
  for (const item of [...trip.activities, ...trip.expenses]) {
    // A cancelled reservation still owns its payments. Unlink explicitly to count an activity again.
    if ("bookingId" in item && item.bookingId && bookingIds.has(item.bookingId)) continue;
    entries.push({ category: item.category, planned: plannedAmount(item, trip.people), spent: actualAmount(item, trip.people), paidBy: item.paidBy ?? "" });
  }
  for (const booking of trip.bookings) {
    const values = bookingBudget(booking);
    entries.push({ category: bookingCategory(booking.type), planned: values.planned, spent: values.spent, paidBy: booking.paidBy ?? "" });
  }
  return entries;
}

export function summarize(trip: Trip): Summary {
  const rows = Object.fromEntries(categoryKeys.map((category) => [category, { category, planned: 0, spent: 0 }])) as Record<Category, Summary["byCategory"][number]>;
  for (const item of costEntries(trip)) {
    rows[item.category].planned += item.planned;
    rows[item.category].spent += item.spent;
  }
  const byCategory = categoryKeys.map((key) => rows[key]);
  const planned = byCategory.reduce((sum, row) => sum + row.planned, 0);
  const spent = byCategory.reduce((sum, row) => sum + row.spent, 0);
  return { planned, spent, remaining: trip.budget - spent, plannedRemaining: trip.budget - planned, byCategory };
}

export function getTravelers(trip: Pick<Trip, "people" | "travelers">): string[] {
  const names = (trip.travelers ?? []).slice(0, trip.people).map((name) => name.trim());
  const used = new Set(names.map(normalizeSearch));
  while (names.length < trip.people) {
    let number = names.length + 1;
    let name = `Người ${number}`;
    while (used.has(normalizeSearch(name))) name = `Người ${++number}`;
    names.push(name);
    used.add(normalizeSearch(name));
  }
  return names;
}

export interface Settlement {
  totalAssigned: number;
  unassigned: number;
  /** Mathematical average. Individual shares below distribute any whole-đồng remainder. */
  perPerson: number;
  balances: { name: string; paid: number; share: number; balance: number }[];
  transfers: { from: string; to: string; amount: number }[];
}

/** Equal split of attributed recorded spending; no transfer is performed. */
export function settleExpenses(trip: Trip): Settlement {
  const names = getTravelers(trip);
  const memberIndex = new Map(names.map((name, index) => [normalizeSearch(name), index]));
  // The last bucket is unassigned; it is never included in member shares or transfers.
  const rawPaid = new Array<number>(names.length + 1).fill(0);
  for (const item of costEntries(trip)) {
    const member = memberIndex.get(normalizeSearch(item.paidBy));
    rawPaid[member ?? names.length] += item.spent;
  }
  // Round collectively so imported fractional amounts cannot create or destroy a đồng.
  const paid = rawPaid.map(Math.floor);
  const total = Math.round(rawPaid.reduce((sum, value) => sum + value, 0));
  const roundingOrder = rawPaid.map((value, index) => ({ index, fraction: value - Math.floor(value) })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  const roundingRemainder = total - paid.reduce((sum, value) => sum + value, 0);
  for (let index = 0; index < roundingRemainder; index++) paid[roundingOrder[index].index]++;
  const unassigned = paid[names.length];
  const totalAssigned = paid.slice(0, names.length).reduce((sum, value) => sum + value, 0);
  const baseShare = Math.floor(totalAssigned / names.length);
  const remainder = totalAssigned - baseShare * names.length;
  const balances = names.map((name, index) => {
    const share = baseShare + (index < remainder ? 1 : 0);
    return { name, paid: paid[index], share, balance: paid[index] - share };
  });
  const debtors = balances.filter((item) => item.balance < 0).map((item) => ({ name: item.name, amount: -item.balance }));
  const creditors = balances.filter((item) => item.balance > 0).map((item) => ({ name: item.name, amount: item.balance }));
  const transfers: Settlement["transfers"] = [];
  let debtor = 0;
  let creditor = 0;
  while (debtor < debtors.length && creditor < creditors.length) {
    const amount = Math.min(debtors[debtor].amount, creditors[creditor].amount);
    if (amount > 0) transfers.push({ from: debtors[debtor].name, to: creditors[creditor].name, amount });
    debtors[debtor].amount -= amount;
    creditors[creditor].amount -= amount;
    if (debtors[debtor].amount === 0) debtor++;
    if (creditors[creditor].amount === 0) creditor++;
  }
  return { totalAssigned, unassigned, perPerson: totalAssigned / names.length, balances, transfers };
}

export function toggleActivityDone(activity: Activity): Activity {
  if (activity.status !== "done") return { ...activity, previousStatus: activity.status, status: "done" };
  const { previousStatus, ...rest } = activity;
  return { ...rest, status: previousStatus ?? "planned" };
}

/** Shift all dated records by the start-date delta, preserving times and historical amounts. */
export function shiftTripDates(trip: Trip, newStart: string, newEnd: string): Trip {
  dateSchema.parse(newStart);
  dateSchema.parse(newEnd);
  const delta = (dayTimestamp(newStart) - dayTimestamp(trip.startDate)) / DAY_MS;
  return tripSchema.parse({
    ...trip,
    startDate: newStart,
    endDate: newEnd,
    activities: trip.activities.map((item) => ({ ...item, date: addDays(item.date, delta) })),
    bookings: trip.bookings.map((item) => ({ ...item, date: addDays(item.date, delta) })),
    dayNotes: Object.fromEntries(Object.entries(trip.dayNotes).map(([date, note]) => [addDays(date, delta), note])),
  });
}

/** Copy a day's plan, retaining target notes but never duplicating payments or reservations. */
export function copyDay(trip: Trip, from: string, to: string): Trip {
  dateSchema.parse(from);
  dateSchema.parse(to);
  if (from === to) throw new Error("Chọn một ngày khác để sao chép lịch trình.");
  const sourceActivities = trip.activities.filter((item) => item.date === from);
  const sourceNote = trip.dayNotes[from] ?? "";
  if (!sourceActivities.length && !sourceNote.trim()) throw new Error("Ngày nguồn chưa có hoạt động hoặc ghi chú để sao chép.");
  const copies = sourceActivities.map((activity): Activity => {
    const { actualPeople: _actualPeople, previousStatus: _previousStatus, ...rest } = activity;
    return { ...rest, id: uid(), date: to, actualCost: null, bookingId: "", paidBy: "", status: "planned" };
  });
  const dayNotes = { ...trip.dayNotes };
  if (sourceNote.trim()) {
    const existing = dayNotes[to] ?? "";
    dayNotes[to] = !existing.trim() || existing === sourceNote ? sourceNote : `${existing}\n\n${sourceNote}`;
  }
  return tripSchema.parse({ ...trip, activities: [...trip.activities, ...copies], dayNotes });
}

export function warnings(trip: Trip, date: string): { id: string; message: string }[] {
  const result: { id: string; message: string }[] = [];
  if (!validDate(date)) return result;
  const dayStart = dayTimestamp(date) / 60000;
  const dayEnd = dayStart + 1440;
  const intervals = trip.activities.filter((item) => item.startTime && item.endTime).map((item) => {
    const start = dayTimestamp(item.date) / 60000 + minutes(item.startTime);
    return { item, start, end: start + duration(item) };
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  if ((date < trip.startDate || date > trip.endDate) && (trip.activities.some((item) => item.date === date) || trip.dayNotes[date]?.trim())) {
    result.push({ id: `outside-${date}`, message: "Ngày này nằm ngoài khoảng ngày của chuyến đi. Lịch trình và ghi chú vẫn được giữ lại." });
  }
  for (let index = 0; index < intervals.length; index++) {
    const current = intervals[index];
    if (current.start >= dayEnd || current.end <= dayStart) continue;
    for (let otherIndex = index + 1; otherIndex < intervals.length; otherIndex++) {
      const other = intervals[otherIndex];
      if (other.start >= current.end) break;
      if (Math.max(current.start, other.start, dayStart) < Math.min(current.end, other.end, dayEnd)) {
        result.push({ id: `overlap-${current.item.id}-${other.item.id}`, message: `“${current.item.title}” trùng giờ với “${other.item.title}”.` });
      }
    }
    if (current.item.date !== date || !current.item.travelMinutes) continue;
    // The latest preceding finish is the effective departure point even with overlapping plans.
    const previous = intervals.slice(0, index).filter((item) => item.end <= current.start && (item.item.date === date || item.end >= dayStart)).sort((a, b) => b.end - a.end)[0];
    const overlapsPrevious = intervals.slice(0, index).some((item) => item.end > current.start);
    if (previous && !overlapsPrevious) {
      const gap = current.start - previous.end;
      if (gap < current.item.travelMinutes) {
        result.push({ id: `travel-${previous.item.id}-${current.item.id}`, message: `Chỉ có ${gap} phút trước “${current.item.title}”, nhưng bạn dự kiến cần ${current.item.travelMinutes} phút di chuyển.` });
      }
    }
  }
  return result;
}

function todayInVietnam(): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function defaultChecklist(): CheckItem[] {
  const groups: Record<string, string[]> = {
    "Giấy tờ & đặt chỗ": ["CCCD / hộ chiếu còn hiệu lực", "Lưu vé di chuyển và xác nhận đặt phòng", "Kiểm tra giờ nhận phòng, trả phòng", "Chụp lại giấy tờ và thông tin cần thiết"],
    "Hành lý": ["Quần áo theo số ngày đi", "Áo khoác nhẹ & áo mưa / ô", "Giày đi bộ thoải mái", "Đồ vệ sinh cá nhân"],
    "Thiết bị": ["Điện thoại, dây sạc & pin dự phòng", "Giải phóng bộ nhớ để chụp ảnh", "Tải bản đồ để xem khi mạng yếu"],
    "Trước khi đi": ["Kiểm tra dự báo thời tiết gần ngày đi", "Thống nhất giờ và điểm xuất phát", "Chuẩn bị tiền mặt và thẻ thanh toán", "Kiểm tra điện, nước và khóa cửa"],
    "Sức khỏe": ["Thuốc cá nhân đang dùng", "Nước uống, kem chống nắng & đồ sơ cứu nhỏ"],
  };
  return Object.entries(groups).flatMap(([group, values]) => values.map((value) => ({ id: uid(), text: value, group, done: false, assignee: "" })));
}

export function createTrip(overrides: Partial<Trip> = {}): Trip {
  const startDate = overrides.startDate ?? todayInVietnam();
  return tripSchema.parse({
    id: uid(),
    title: "Chuyến đi mới",
    destination: "Điểm đến của bạn",
    startDate,
    endDate: overrides.endDate ?? addDays(startDate, 2),
    people: 2,
    budget: 5_000_000,
    timezone: DEFAULT_TIMEZONE,
    notes: "",
    sample: false,
    activities: [],
    expenses: [],
    bookings: [],
    places: [],
    checklist: defaultChecklist(),
    dayNotes: {},
    ...overrides,
  });
}

function escapeICS(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

/** Fold physical content lines to 75 UTF-8 octets, including continuation spaces. */
function foldICS(line: string): string {
  const encoder = new TextEncoder();
  let output = "";
  let length = 0;
  for (const character of line) {
    const bytes = encoder.encode(character).length;
    if (length + bytes > 75) {
      output += "\r\n ";
      length = 1;
    }
    output += character;
    length += bytes;
  }
  return output;
}

function utcCalendarTime(timestamp: number): string {
  return new Date(timestamp).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Resolve an IANA-zone wall time to UTC, choosing the first occurrence at a DST fold. */
function wallTimeUTC(date: string, time: string, timezone: string): number {
  const desired = dayTimestamp(date) + minutes(time) * 60000;
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const localValue = (timestamp: number) => {
    const parts = formatter.formatToParts(timestamp);
    const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    return Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  };
  const offsets = new Set<number>();
  for (const hours of [-36, -24, -12, 0, 12, 24, 36]) {
    const point = desired + hours * 3_600_000;
    offsets.add(localValue(point) - point);
  }
  const candidates = [...offsets].map((offset) => desired - offset).filter((candidate) => localValue(candidate) === desired).sort((a, b) => a - b);
  if (!candidates.length) throw new Error(`Giờ ${time} ngày ${shortDate(date)} không tồn tại trong múi giờ ${timezone} do thay đổi giờ mùa hè. Hãy đổi khung giờ trước khi xuất lịch.`);
  return candidates[0];
}

export function exportICS(input: Trip): string {
  const trip = tripSchema.parse(input);
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Len Duong//Lich trinh chuyen di//VI", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${escapeICS(trip.title)}`, `X-WR-TIMEZONE:${trip.timezone}`];
  const stamp = utcCalendarTime(Date.now());
  const activities = [...trip.activities].sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || "99:99").localeCompare(b.startTime || "99:99"));
  for (const item of activities) {
    const booking = trip.bookings.find((value) => value.id === item.bookingId && value.status !== "cancelled");
    const notes = [
      categories[item.category].label,
      item.notes,
      item.transport ? `Di chuyển: ${item.transport}${item.travelMinutes ? `, dự kiến ${item.travelMinutes} phút` : ""}` : item.travelMinutes ? `Dự kiến ${item.travelMinutes} phút để đến đây` : "",
      item.priority === "must" ? "Ưu tiên: nhất định muốn đi" : "",
      item.backup ? `Phương án dự phòng: ${item.backup}` : "",
      booking ? `Đặt chỗ: ${booking.title}${booking.reference ? ` · Mã: ${booking.reference}` : ""}` : "",
      trip.sample ? "Lịch mẫu minh họa. Kiểm tra địa điểm, giá và giờ hoạt động trước khi đi." : "",
    ].filter(Boolean).join("\n\n");
    lines.push("BEGIN:VEVENT", `UID:${trip.id}.${item.id}@len-duong.app`, `DTSTAMP:${stamp}`);
    if (item.startTime && item.endTime) {
      const start = wallTimeUTC(item.date, item.startTime, trip.timezone);
      const end = wallTimeUTC(item.endNextDay ? addDays(item.date, 1) : item.date, item.endTime, trip.timezone);
      if (end <= start) throw new Error(`Giờ kết thúc của “${item.title}” cần sau giờ bắt đầu trong múi giờ đã chọn.`);
      lines.push(`DTSTART:${utcCalendarTime(start)}`, `DTEND:${utcCalendarTime(end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${item.date.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(item.date, 1).replace(/-/g, "")}`);
    }
    lines.push(`SUMMARY:${escapeICS(item.title)}`, `LOCATION:${escapeICS([item.place, item.address].filter(Boolean).join(", "))}`, `DESCRIPTION:${escapeICS(notes)}`, "STATUS:CONFIRMED", "TRANSP:OPAQUE");
    if (item.url) lines.push(`URL:${item.url}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldICS).join("\r\n") + "\r\n";
}

export function sampleTrip(): Trip {
  const outbound = "sample-bus-out";
  const hotel = "sample-hotel";
  const inbound = "sample-bus-back";
  const activity = (id: string, date: string, startTime: string, endTime: string, title: string, category: Category, extra: Partial<Activity> = {}): Activity => ({
    id: `sample-${id}`, date, startTime, endTime, endNextDay: false, title, category,
    place: "", address: "Đà Lạt, Lâm Đồng", transport: "Đi bộ", travelMinutes: 15,
    cost: 0, actualCost: null, perPerson: false, status: "planned", notes: "", bookingId: "", url: "", priority: "normal", backup: "", ...extra,
  });
  return createTrip({
    id: "sample-dalat-weekend",
    title: "Đà Lạt, mình đi thôi",
    destination: "Đà Lạt, Lâm Đồng",
    startDate: "2026-12-04",
    endDate: "2026-12-06",
    people: 2,
    budget: 6_000_000,
    sample: true,
    notes: "LỊCH MẪU MINH HỌA · 3 ngày 2 đêm cho hai người.\n\nChi phí, thời gian di chuyển, thông tin chỗ ở và trạng thái đặt chỗ là dữ liệu mẫu để bạn thử app, chưa được xác minh trực tiếp. Hãy chọn nhà cung cấp, kiểm tra giá, giờ mở cửa và địa chỉ cụ thể trên Google Maps trước khi đặt dịch vụ.\n\nNhịp đi chậm, có khoảng nghỉ buổi trưa. Để dành một buổi cà phê không vội, mang áo khoác và có phương án trong nhà nếu trời mưa.",
    dayNotes: {
      "2026-12-04": "Ngày đầu đi nhẹ nhàng, ưu tiên nghỉ sau khi di chuyển. Gửi hành lý trước, nhận phòng theo giờ đã thống nhất với chỗ ở.",
      "2026-12-05": "Xem thời tiết và kiểm tra đường đi từ tối hôm trước. Nếu mưa hoặc khó di chuyển, thay buổi sáng ngoài trời bằng cà phê trong nhà.",
      "2026-12-06": "Soát lại đồ trước khi trả phòng; để đủ thời gian ra điểm đón. Giữ một ít tiền mặt cho bữa trưa và di chuyển cuối chuyến.",
    },
    bookings: [
      { id: outbound, title: "Xe đi TP.HCM → Đà Lạt", type: "transport", date: "2026-12-04", time: "00:30", reference: "", provider: "Nhà xe bạn chọn · dữ liệu mẫu", url: "", phone: "", total: 560000, paid: 560000, status: "confirmed", notes: "Mẫu minh họa, chưa có vé thực tế. Xác nhận điểm đón, thời gian đến và quy định hành lý." },
      { id: hotel, title: "Chỗ ở 2 đêm cho hai người", type: "stay", date: "2026-12-04", time: "14:00", reference: "", provider: "Chỗ ở bạn chọn · dữ liệu mẫu", url: "", phone: "", total: 1400000, paid: 300000, status: "pending", notes: "Mẫu minh họa. Hỏi về gửi hành lý sớm, chỗ đỗ xe, nước nóng, giờ trả phòng và điều kiện hủy." },
      { id: inbound, title: "Xe về Đà Lạt → TP.HCM", type: "transport", date: "2026-12-06", time: "13:30", reference: "", provider: "Nhà xe bạn chọn · dữ liệu mẫu", url: "", phone: "", total: 560000, paid: 0, status: "pending", notes: "Mẫu minh họa. Có mặt ở điểm đón sớm hơn giờ khởi hành 30 phút." },
    ],
    activities: [
      activity("arrival", "2026-12-04", "07:00", "07:30", "Chào Đà Lạt, gửi hành lý thôi", "transport", { place: "Chỗ ở bạn chọn", transport: "Xe trung chuyển", travelMinutes: 0, bookingId: outbound, status: "booked", notes: "Báo chỗ ở giờ đến, gửi hành lý và kiểm tra lịch nhận phòng. Chi phí xe đi được tính ở mục đặt chỗ." }),
      activity("breakfast-1", "2026-12-04", "08:00", "08:45", "Bữa sáng nóng giữa trời se lạnh", "food", { place: "Quán ăn sáng bạn chọn", cost: 60000, perPerson: true, notes: "Chọn một quán gần chỗ ở; ưu tiên ăn nhẹ sau chuyến xe đêm. Giá chỉ là dự toán mẫu." }),
      activity("lake", "2026-12-04", "09:15", "10:30", "Dạo quanh hồ Xuân Hương", "visit", { place: "Hồ Xuân Hương", priority: "must", notes: "Đi dạo chậm, chụp vài tấm ảnh và nghỉ ở ghế ven hồ. Mang nước, giày dễ đi.", backup: "Nếu mưa: ngồi cà phê trong nhà, chuyển đi dạo sang chiều." }),
      activity("coffee-1", "2026-12-04", "10:45", "11:45", "Một góc cà phê, một buổi sáng chậm", "coffee", { place: "Quán cà phê gần hồ bạn chọn", cost: 65000, perPerson: true, travelMinutes: 10, notes: "Chọn quán có chỗ ngồi trong nhà. Đây là khoảng nghỉ, có thể kéo dài nếu cả hai muốn." }),
      activity("lunch-1", "2026-12-04", "12:15", "13:15", "Ăn trưa & về nhận phòng", "food", { place: "Quán ăn gần chỗ ở", cost: 100000, perPerson: true, transport: "Xe máy / taxi", notes: "Không đặt lịch quá sát giờ nhận phòng. Hỏi trước về món ăn và khẩu vị." }),
      activity("checkin", "2026-12-04", "14:00", "15:30", "Nhận phòng, nghỉ ngơi và sạc pin", "stay", { place: "Chỗ ở bạn chọn", bookingId: hotel, transport: "Xe máy / taxi", notes: "Kiểm tra phòng, gửi giấy tờ theo yêu cầu, hỏi giờ trả phòng và số liên hệ hỗ trợ. Nghỉ ít nhất một giờ." }),
      activity("square", "2026-12-04", "16:00", "17:15", "Ngắm chiều ở quảng trường Lâm Viên", "visit", { place: "Quảng trường Lâm Viên", transport: "Xe máy / taxi", travelMinutes: 20, notes: "Dành thời gian đi bộ quanh khu vực, không cần chạy theo quá nhiều điểm.", backup: "Ghé quán trong nhà nếu thời tiết không thuận lợi." }),
      activity("dinner-1", "2026-12-04", "18:00", "19:15", "Bữa tối đầu tiên của chuyến đi", "food", { place: "Quán ăn tối bạn chọn", cost: 150000, perPerson: true, transport: "Xe máy / taxi", notes: "Gọi xác nhận chỗ nếu chọn quán đông. Chừa một chút bụng cho đồ ăn vặt buổi tối." }),
      activity("night-market", "2026-12-04", "19:45", "20:45", "Dạo chợ đêm & ăn vặt", "shopping", { place: "Chợ đêm Đà Lạt", cost: 80000, perPerson: true, notes: "Mua vừa đủ, hỏi giá trước. Có thể về sớm nếu mệt sau ngày di chuyển." }),
      activity("sunrise", "2026-12-05", "05:30", "07:00", "Hẹn nhau với một buổi bình minh", "visit", { place: "Điểm ngắm bình minh bạn chọn", transport: "Xe có tài xế / taxi", travelMinutes: 40, cost: 80000, perPerson: true, priority: "must", notes: "Điểm đến chưa chốt. Xác nhận thời tiết, đường đi và chi phí; chuẩn bị áo ấm từ tối trước. Đặt báo thức và giờ rời chỗ ở phù hợp.", backup: "Nếu mưa, đường khó đi hoặc quá mệt: bỏ buổi bình minh, ngủ thêm rồi ăn sáng." }),
      activity("breakfast-2", "2026-12-05", "08:00", "09:00", "Ăn sáng rồi thong thả vào ngày mới", "food", { place: "Quán ăn sáng bạn chọn", transport: "Xe máy / taxi", travelMinutes: 30, cost: 60000, perPerson: true }),
      activity("garden", "2026-12-05", "09:30", "11:00", "Một điểm tham quan, đi thật chậm", "visit", { place: "Vườn hoa / điểm tham quan bạn chọn", transport: "Xe máy / taxi", travelMinutes: 20, cost: 100000, perPerson: true, notes: "Chọn một nơi phù hợp sở thích của cả hai, kiểm tra giá vé và giờ mở cửa trước khi đi. Dành thời gian chụp ảnh và nghỉ chân.", backup: "Đổi sang một không gian trong nhà nếu trời mưa." }),
      activity("lunch-2", "2026-12-05", "11:30", "12:30", "Ăn trưa & nghỉ một chút", "food", { place: "Quán ăn bạn chọn", transport: "Xe máy / taxi", travelMinutes: 20, cost: 120000, perPerson: true }),
      activity("rest-2", "2026-12-05", "13:00", "14:00", "Về phòng nghỉ, không vội", "stay", { place: "Chỗ ở bạn chọn", transport: "Xe máy / taxi", travelMinutes: 20, notes: "Khoảng nghỉ có chủ đích để buổi chiều thoải mái hơn. Chi phí chỗ ở đã nằm trong đặt chỗ." }),
      activity("coffee-2", "2026-12-05", "14:30", "16:30", "Chiều dành cho cà phê & chuyện trò", "coffee", { place: "Quán cà phê có góc nhìn bạn thích", transport: "Xe máy / taxi", travelMinutes: 20, cost: 75000, perPerson: true, priority: "must", notes: "Để trống phần còn lại của buổi chiều. Có thể đi dạo gần quán nếu thời tiết đẹp." }),
      activity("dinner-2", "2026-12-05", "18:00", "19:30", "Một bữa tối thật dễ chịu", "food", { place: "Nhà hàng / quán ăn bạn chọn", transport: "Xe máy / taxi", travelMinutes: 20, cost: 180000, perPerson: true, notes: "Chọn và gọi đặt chỗ trước nếu muốn một không gian yên tĩnh. Cập nhật xác nhận thật ở mục Đặt chỗ." }),
      activity("breakfast-3", "2026-12-06", "07:30", "08:15", "Bữa sáng cuối ở Đà Lạt", "food", { place: "Quán ăn gần chỗ ở", cost: 60000, perPerson: true, travelMinutes: 10 }),
      activity("station", "2026-12-06", "08:45", "10:00", "Ghé ga Đà Lạt, lưu vài kỷ niệm", "visit", { place: "Ga Đà Lạt", transport: "Xe máy / taxi", travelMinutes: 20, cost: 30000, perPerson: true, notes: "Kiểm tra giờ mở cửa và phí tham quan hiện hành. Lịch mẫu không bao gồm chuyến tàu du lịch." }),
      activity("checkout", "2026-12-06", "10:30", "11:15", "Thu dọn hành lý & trả phòng", "stay", { place: "Chỗ ở bạn chọn", transport: "Xe máy / taxi", travelMinutes: 20, notes: "Kiểm tra sạc, giấy tờ, tủ đồ và phòng tắm. Đối chiếu khoản còn thanh toán với chỗ ở." }),
      activity("lunch-3", "2026-12-06", "11:30", "12:30", "Ăn trưa trước khi về", "food", { place: "Quán ăn gần điểm đón", cost: 100000, perPerson: true, travelMinutes: 10, notes: "Chọn chỗ gần điểm đón để không phải vội. Mua nước cho hành trình về." }),
      activity("return", "2026-12-06", "13:00", "20:00", "Tạm biệt Đà Lạt, về nhà thôi", "transport", { place: "Điểm đón xe đã xác nhận", transport: "Xe khách", travelMinutes: 20, bookingId: inbound, notes: "Có mặt trước giờ khởi hành. Thời gian đến là dự kiến mẫu, tùy giao thông và nhà xe. Kiểm tra lại điểm trả khách." }),
    ],
    expenses: [
      { id: "sample-local-transport", title: "Di chuyển trong thành phố", category: "transport", cost: 450000, actualCost: null, perPerson: false, paidBy: "", notes: "Khoản dự trù chung: thuê xe / taxi và nhiên liệu. Không cộng lại cùng khoản vào từng hoạt động." },
      { id: "sample-gift", title: "Một ít quà mang về", category: "shopping", cost: 200000, actualCost: null, perPerson: false, paidBy: "", notes: "Có thể bỏ nếu không cần; ưu tiên vừa đủ hành lý." },
    ],
    places: [
      { id: "sample-place-lake", name: "Hồ Xuân Hương", address: "Đà Lạt, Lâm Đồng", category: "visit", url: "", notes: "Đi bộ nhẹ nhàng, chọn đoạn ven hồ thuận tiện từ chỗ ở.", visited: false },
      { id: "sample-place-square", name: "Quảng trường Lâm Viên", address: "Đà Lạt, Lâm Đồng", category: "visit", url: "", notes: "Gợi ý trong lịch mẫu; kiểm tra thời tiết trước khi đi.", visited: false },
      { id: "sample-place-market", name: "Chợ đêm Đà Lạt", address: "Đà Lạt, Lâm Đồng", category: "shopping", url: "", notes: "Hỏi giá trước khi mua; có thể đông vào buổi tối.", visited: false },
      { id: "sample-place-station", name: "Ga Đà Lạt", address: "Đà Lạt, Lâm Đồng", category: "visit", url: "", notes: "Kiểm tra thông tin mở cửa và vé trực tiếp trước khi đến.", visited: false },
    ],
    checklist: defaultChecklist().map((item, index) => ({ ...item, id: `sample-check-${index + 1}` })),
  });
}
