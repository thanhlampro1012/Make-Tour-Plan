"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { type Trip, backupSchema, sampleTrip, uid } from "./travel";

export type SaveStatus = "loading" | "saving" | "saved" | "local" | "error" | "conflict";
export type RecoverableDraft = { id: string; updatedAt: string; trips: Trip[] };

export interface TravelStoreSnapshot {
  trips: Trip[];
  status: SaveStatus;
  message: string;
  ready: boolean;
  storageWarning: string;
  recoverableDrafts: RecoverableDraft[];
}

type StoragePort = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
type CleanRecord = { version: 1; trips: Trip[]; revision: number; dirty: false };
type LegacyRecord = Omit<CleanRecord, "dirty"> & { dirty: boolean };
type OutboxRecord = { version: 1; kind: "outbox"; trips: Trip[]; baseRevision: number | null; updatedAt: string };
type AdoptedSource = { key: string; raw: string };
type KnownRecoveredDraft = { id: string; key: string; raw: string };
type RemoteState = { trips: Trip[] | null; revision: number };

/** Browser boundaries are injectable so regression tests use the real controller. */
export interface TravelStoreEnvironment {
  localStorage?: StoragePort | null;
  sessionStorage?: StoragePort | null;
  fetcher?: typeof fetch;
  now?: () => Date;
  makeId?: () => string;
  debounceMs?: number;
  timeoutMs?: number;
}

export interface TravelStoreController {
  getSnapshot: () => TravelStoreSnapshot;
  getServerSnapshot: () => TravelStoreSnapshot;
  subscribe: (listener: () => void) => () => void;
  start: () => Promise<void>;
  stop: () => void;
  change: (trips: Trip[], expectedCurrent?: Trip[]) => void;
  discardDraft: (id: string) => boolean;
  retry: () => Promise<void>;
  reloadServer: () => Promise<void>;
  refreshFromStorage: () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function parseTrips(value: unknown): Trip[] | null {
  const parsed = backupSchema.safeParse({ version: 1, trips: value });
  return parsed.success ? parsed.data.trips : null;
}

function parseLegacy(raw: string | null): LegacyRecord | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !validRevision(value.revision) || typeof value.dirty !== "boolean") return null;
    const trips = parseTrips(value.trips);
    return trips ? { version: 1, trips, revision: value.revision, dirty: value.dirty } : null;
  } catch {
    return null;
  }
}

function parseOutbox(raw: string | null): OutboxRecord | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || value.kind !== "outbox" || !(value.baseRevision === null || validRevision(value.baseRevision)) || typeof value.updatedAt !== "string" || value.updatedAt.length > 80 || !Number.isFinite(Date.parse(value.updatedAt))) return null;
    const trips = parseTrips(value.trips);
    return trips ? { version: 1, kind: "outbox", trips, baseRevision: value.baseRevision, updatedAt: value.updatedAt } : null;
  } catch {
    return null;
  }
}

function sameTrips(a: Trip[], b: Trip[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly code: string | null = null) {
    super(message);
  }
}

/**
 * A page owns one outbox. A clean save in another tab can only change the clean
 * cache, never this page's draft. The old v1 cache stays read-only until an
 * adopted snapshot is acknowledged and its original bytes are still unchanged.
 */
export function createTravelStoreController(userId: string | null, environment: TravelStoreEnvironment = {}): TravelStoreController {
  const legacyKey = `len-duong:v1:${userId ?? "preview"}`;
  const cleanKey = `${legacyKey}:clean`;
  const outboxPrefix = `${legacyKey}:outbox:`;
  const sessionKey = `${legacyKey}:active-draft`;
  const now = environment.now ?? (() => new Date());
  const makeId = environment.makeId ?? uid;
  const initialSnapshot: TravelStoreSnapshot = { trips: [], status: "loading", message: "", ready: false, storageWarning: "", recoverableDrafts: [] };
  let snapshot = initialSnapshot;
  const listeners = new Set<() => void>();
  let current: Trip[] = [];
  let baseRevision: number | null = null;
  let dirty = false;
  let serial = 0;
  let ownKey = "";
  let ownPersistedRaw: string | null = null;
  let modifiedAt = "";
  let adopted: AdoptedSource[] = [];
  let knownRecoveredDrafts = new Map<string, KnownRecoveredDraft>();
  let initialized = false;
  let running = false;
  let generation = 0;
  let needsLoad = Boolean(userId);
  let conflict = false;
  let loadedOnce = false;
  let reloading = false;
  let loadPromise: Promise<void> | null = null;
  let savePromise: Promise<void> | null = null;
  let reloadPromise: Promise<void> | null = null;
  let debounce: ReturnType<typeof setTimeout> | null = null;
  let localWarning = "";
  let sessionWarning = "";
  let recoveryWarning = "";
  let detachEvents: (() => void) | null = null;
  const requests = new Set<AbortController>();

  const publish = (patch: Partial<TravelStoreSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  const publishWarnings = () => publish({ storageWarning: [localWarning, sessionWarning, recoveryWarning].filter(Boolean).join(" ") });
  const storageFailure = () => {
    localWarning = "Không ghi hoặc đọc được bộ nhớ trình duyệt. Nếu có thay đổi chưa đồng bộ, giữ trang mở và xuất JSON để giữ bản nháp.";
    publishWarnings();
  };
  const local = () => environment.localStorage !== undefined ? environment.localStorage : typeof window === "undefined" ? null : window.localStorage;
  const session = () => environment.sessionStorage !== undefined ? environment.sessionStorage : typeof window === "undefined" ? null : window.sessionStorage;
  const read = (key: string): { ok: boolean; raw: string | null } => {
    try {
      const port = local();
      if (!port) throw new Error("Storage unavailable");
      return { ok: true, raw: port.getItem(key) };
    } catch {
      storageFailure();
      return { ok: false, raw: null };
    }
  };
  const write = (key: string, raw: string): boolean => {
    try {
      const port = local();
      if (!port) throw new Error("Storage unavailable");
      port.setItem(key, raw);
      if (localWarning) { localWarning = ""; publishWarnings(); }
      return true;
    } catch {
      storageFailure();
      return false;
    }
  };
  const removeIfUnchanged = (key: string, expectedRaw: string): boolean => {
    try {
      const port = local();
      if (!port) throw new Error("Storage unavailable");
      if (port.getItem(key) !== expectedRaw) return false;
      port.removeItem(key);
      return true;
    } catch {
      storageFailure();
      return false;
    }
  };
  const readSessionPointer = (): string | null => {
    try {
      const port = session();
      if (!port) throw new Error("Session storage unavailable");
      const key = port.getItem(sessionKey);
      return key?.startsWith(outboxPrefix) ? key : null;
    } catch {
      sessionWarning = "Trình duyệt không giữ được liên kết khôi phục cho tab này. Các bản nháp lưu thành công vẫn có trong mục bản nháp có thể khôi phục.";
      publishWarnings();
      return null;
    }
  };
  const pointSessionToOwnDraft = () => {
    try {
      const port = session();
      if (!port) throw new Error("Session storage unavailable");
      port.setItem(sessionKey, ownKey);
      if (sessionWarning) { sessionWarning = ""; publishWarnings(); }
    } catch {
      sessionWarning = "Trình duyệt không giữ được liên kết khôi phục cho tab này. Các bản nháp lưu thành công vẫn có trong mục bản nháp có thể khôi phục.";
      publishWarnings();
    }
  };
  const clearOwnSessionPointer = () => {
    try {
      const port = session();
      if (port?.getItem(sessionKey) === ownKey) port.removeItem(sessionKey);
    } catch {
      // Startup verifies that a stale pointer still identifies an existing outbox.
    }
  };
  const noteUnreadable = () => {
    recoveryWarning = "Có bản dự phòng không đúng định dạng; dữ liệu gốc vẫn được giữ lại, chưa bị xóa.";
    publishWarnings();
  };

  function bestCleanCache(): CleanRecord | null {
    const primaryRaw = read(cleanKey).raw;
    const oldRaw = read(legacyKey).raw;
    const primary = parseLegacy(primaryRaw);
    const old = parseLegacy(oldRaw);
    if ((primaryRaw && (!primary || primary.dirty)) || (oldRaw && !old)) noteUnreadable();
    const candidates = [primary, old].filter((value): value is CleanRecord => Boolean(value && !value.dirty));
    return candidates.sort((a, b) => b.revision - a.revision)[0] ?? null;
  }

  function writeCleanCache(trips: Trip[], revision: number): CleanRecord {
    const incoming: CleanRecord = { version: 1, trips, revision, dirty: false };
    const existing = bestCleanCache();
    if (existing && existing.revision > revision) return existing;
    const previous = read(cleanKey);
    if (!previous.ok) return incoming;
    if (previous.raw && (!parseLegacy(previous.raw) || parseLegacy(previous.raw)?.dirty)) {
      if (!write(`${legacyKey}:unreadable:${makeId()}`, previous.raw)) return incoming;
      noteUnreadable();
    }
    write(cleanKey, JSON.stringify(incoming));
    return incoming;
  }

  function scanDrafts() {
    const drafts: RecoverableDraft[] = [];
    const known = new Map<string, KnownRecoveredDraft>();
    const previousByKey = new Map([...knownRecoveredDrafts.values()].map((entry) => [entry.key, entry]));
    const add = (key: string, raw: string, record: { trips: Trip[]; updatedAt: string }) => {
      const previous = previousByKey.get(key);
      // The UI receives an opaque ID for these exact bytes, so an old confirmation
      // cannot accidentally refer to a newer snapshot published under the same key.
      const id = previous?.raw === raw ? previous.id : `${key}:snapshot:${makeId()}`;
      known.set(id, { id, key, raw });
      drafts.push({ id, updatedAt: record.updatedAt, trips: record.trips });
    };
    try {
      const port = local();
      if (!port) throw new Error("Storage unavailable");
      const keys: string[] = [];
      for (let index = 0; index < port.length; index++) {
        const key = port.key(index);
        if (key?.startsWith(outboxPrefix) && key !== ownKey) keys.push(key);
      }
      for (const key of keys) {
        const raw = port.getItem(key);
        if (adopted.some((source) => source.key === key && source.raw === raw)) continue;
        const record = parseOutbox(raw);
        if (record && raw) add(key, raw, record);
        else if (raw) noteUnreadable();
      }
      const legacyRaw = port.getItem(legacyKey);
      const legacy = parseLegacy(legacyRaw);
      if (legacy?.dirty && legacyRaw && !adopted.some((source) => source.key === legacyKey && source.raw === legacyRaw)) add(legacyKey, legacyRaw, { trips: legacy.trips, updatedAt: modifiedAt || now().toISOString() });
      drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      knownRecoveredDrafts = known;
      publish({ recoverableDrafts: drafts });
    } catch {
      storageFailure();
    }
  }

  function discardDraft(id: string): boolean {
    const known = knownRecoveredDrafts.get(id);
    if (!running || !known || known.key === ownKey || !(known.key.startsWith(outboxPrefix) || known.key === legacyKey)) {
      publish({ message: "Bản nháp này không còn nằm trong danh sách đang xem hoặc đang được trang hiện tại sử dụng. Chưa có dữ liệu nào bị xóa." });
      return false;
    }
    const currentRaw = read(known.key);
    if (!currentRaw.ok) {
      publish({ message: "Chưa đọc được bản nháp để xác nhận. App chưa xóa dữ liệu; hãy thử lại khi bộ nhớ trình duyệt hoạt động." });
      return false;
    }
    if (currentRaw.raw !== known.raw) {
      scanDrafts();
      publish({ message: "Bản nháp đã thay đổi hoặc được xử lý ở phiên khác. Hãy xem lại danh sách trước khi chọn xóa; app chưa xóa bản mới." });
      return false;
    }
    if (!removeIfUnchanged(known.key, known.raw)) {
      scanDrafts();
      publish({ message: "Chưa xóa được bản nháp vì dữ liệu vừa thay đổi hoặc bộ nhớ trình duyệt từ chối thao tác. Hãy kiểm tra lại danh sách." });
      return false;
    }
    scanDrafts();
    return true;
  }

  function persistDraft(): boolean {
    if (!ownKey) ownKey = `${outboxPrefix}${makeId()}`;
    if (!modifiedAt) modifiedAt = now().toISOString();
    const record: OutboxRecord = { version: 1, kind: "outbox", trips: current, baseRevision, updatedAt: modifiedAt };
    const raw = JSON.stringify(record);
    const saved = write(ownKey, raw);
    if (saved) { ownPersistedRaw = raw; pointSessionToOwnDraft(); }
    scanDrafts();
    return saved;
  }

  function removeOwnDraft() {
    if (ownPersistedRaw && removeIfUnchanged(ownKey, ownPersistedRaw)) {
      ownPersistedRaw = null;
      clearOwnSessionPointer();
    } else {
      const remaining = read(ownKey);
      if (remaining.ok && remaining.raw === null) {
        ownPersistedRaw = null;
        clearOwnSessionPointer();
      }
    }
  }

  function removeAcknowledgedSources(acknowledgedTrips: Trip[]) {
    for (const source of adopted) {
      const original = parseOutbox(source.raw) ?? parseLegacy(source.raw);
      // A cloned tab can still own this exact source. A different descendant save
      // does not acknowledge that tab's original snapshot, even if its bytes stayed unchanged.
      if (original && sameTrips(original.trips, acknowledgedTrips)) removeIfUnchanged(source.key, source.raw);
    }
    adopted = [];
  }

  function bootstrap() {
    ownKey = `${outboxPrefix}${makeId()}`;
    modifiedAt = now().toISOString();
    const clean = bestCleanCache();
    const previousKey = readSessionPointer();
    const previousRaw = previousKey ? read(previousKey).raw : null;
    const previous = parseOutbox(previousRaw);
    const legacyRaw = read(legacyKey).raw;
    const legacy = parseLegacy(legacyRaw);
    if (previousKey && previousRaw && !previous) noteUnreadable();
    if (previous && previousKey && previousRaw) {
      current = previous.trips;
      baseRevision = previous.baseRevision;
      modifiedAt = previous.updatedAt;
      dirty = true;
      adopted = [{ key: previousKey, raw: previousRaw }];
      if (legacy?.dirty && legacyRaw && legacy.revision === baseRevision && sameTrips(legacy.trips, current)) adopted.push({ key: legacyKey, raw: legacyRaw });
    } else if (legacy?.dirty && legacyRaw) {
      current = legacy.trips;
      baseRevision = legacy.revision;
      dirty = true;
      adopted = [{ key: legacyKey, raw: legacyRaw }];
    } else {
      current = clean?.trips ?? (userId ? [] : [sampleTrip()]);
      baseRevision = clean?.revision ?? (userId ? null : 0);
      dirty = !userId;
    }
    publish({ trips: current });
    if (dirty) persistDraft();
    scanDrafts();
    initialized = true;
  }

  function cancelDebounce() {
    if (debounce) clearTimeout(debounce);
    debounce = null;
  }

  function schedule() {
    cancelDebounce();
    if (!running || reloading || !userId || !dirty || conflict) return;
    debounce = setTimeout(() => { debounce = null; void retry(); }, environment.debounceMs ?? 700);
  }

  async function requestJSON(method: "GET" | "PUT", body?: unknown): Promise<unknown> {
    const controller = new AbortController();
    requests.add(controller);
    let timedOut = false;
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, environment.timeoutMs ?? 15000);
    try {
      const response = await (environment.fetcher ?? fetch)("/api/trips", {
        method, cache: "no-store", credentials: "same-origin", signal: controller.signal,
        headers: { ...(userId ? { "X-Expected-User-Id": userId } : {}), ...(method === "PUT" ? { "Content-Type": "application/json" } : {}) },
        ...(method === "PUT" ? { body: JSON.stringify(body) } : {}),
      });
      let value: unknown = null;
      try { value = await response.json(); } catch {
        if (response.ok) throw new Error("Máy chủ trả về dữ liệu không đọc được. Vui lòng thử lại.");
      }
      if (!response.ok) {
        const fallback = response.status === 401 ? "Phiên đăng nhập đã hết. Hãy giữ bản nháp rồi tải lại trang để đăng nhập." : response.status === 413 ? "Dữ liệu lớn hơn giới hạn lưu. Hãy xuất JSON để giữ bản đầy đủ trước khi giảm nội dung." : "Chưa kết nối được máy chủ. Vui lòng thử lại.";
        throw new HttpError(response.status, isRecord(value) && typeof value.error === "string" ? value.error : fallback, isRecord(value) && typeof value.code === "string" ? value.code : null);
      }
      return value;
    } catch (error) {
      if (timedOut) throw new Error("Kết nối mất quá nhiều thời gian. Vui lòng thử lại.");
      throw error;
    } finally {
      clearTimeout(timeout);
      requests.delete(controller);
    }
  }

  async function readRemote(): Promise<RemoteState> {
    const value = await requestJSON("GET");
    if (!isRecord(value) || !validRevision(value.revision)) throw new Error("Phiên bản dữ liệu máy chủ không hợp lệ. Bản nháp hiện tại vẫn được giữ nguyên.");
    if (value.trips === null && value.revision === 0) return { trips: null, revision: 0 };
    const trips = parseTrips(value.trips);
    if (!trips) throw new Error("Dữ liệu máy chủ cần được kiểm tra. Kế hoạch hiện tại chưa bị thay thế.");
    return { trips, revision: value.revision };
  }

  function acceptRemote(remote: RemoteState) {
    const latest = writeCleanCache(remote.trips ?? [], remote.revision);
    needsLoad = false;
    if (dirty) {
      if ((remote.trips !== null || latest.revision > 0) && sameTrips(current, latest.trips)) {
        baseRevision = latest.revision;
        dirty = false;
        conflict = false;
        removeOwnDraft();
        removeAcknowledgedSources(current);
        publish({ trips: current, status: "saved", message: "", ready: true });
      } else {
        if (baseRevision === null && latest.trips.length === 0) baseRevision = latest.revision;
        conflict = baseRevision === null || baseRevision !== latest.revision;
        persistDraft();
        publish({ trips: current, ready: true, status: conflict ? "conflict" : "saving", message: conflict ? "Có bản nháp của trang này và một phiên bản khác trên máy chủ. Xuất bản nháp trước khi tải bản đã lưu; app chưa ghi đè bản nào." : "" });
      }
    } else {
      current = latest.trips;
      baseRevision = latest.revision;
      conflict = false;
      if (remote.trips === null && latest.revision === 0 && !loadedOnce) {
        current = [sampleTrip()];
        dirty = true;
        modifiedAt = now().toISOString();
        persistDraft();
      }
      publish({ trips: current, status: dirty ? "saving" : "saved", message: "", ready: true });
    }
    loadedOnce = true;
    scanDrafts();
  }

  async function load(): Promise<void> {
    if (loadPromise) return loadPromise;
    if (!running || !userId) return;
    const epoch = generation;
    publish({ status: "loading" });
    const operation = (async () => {
      try {
        const remote = await readRemote();
        if (!running || epoch !== generation) return;
        acceptRemote(remote);
      } catch (error) {
        if (!running || epoch !== generation) return;
        needsLoad = true;
        if (dirty) persistDraft();
        publish({ ready: true, status: "error", message: error instanceof HttpError && error.code === "identity_changed" ? error.message : `${error instanceof Error ? error.message : "Không tải được chuyến đi."} Kế hoạch hiện có chưa bị thay thế. Bấm Thử lưu lại khi có mạng để kết nối lại.` });
      }
    })();
    loadPromise = operation;
    try { await operation; } finally {
      if (loadPromise === operation) loadPromise = null;
      if (running && epoch === generation && !needsLoad && !conflict && dirty) schedule();
    }
  }

  async function save(): Promise<void> {
    if (savePromise) return savePromise;
    if (!running || !userId || !dirty || conflict || needsLoad || baseRevision === null || reloading) return;
    cancelDebounce();
    const epoch = generation;
    const sentTrips = current;
    const sentSerial = serial;
    const sentRevision = baseRevision;
    publish({ status: "saving", message: "" });
    const operation = (async () => {
      try {
        const value = await requestJSON("PUT", { trips: sentTrips, revision: sentRevision });
        if (!running || epoch !== generation) return;
        if (!isRecord(value) || !validRevision(value.revision) || value.revision !== sentRevision + 1) throw new Error("Chưa xác nhận được phiên bản đã lưu. App giữ nguyên bản nháp để kiểm tra lại.");
        const latest = writeCleanCache(sentTrips, value.revision);
        baseRevision = value.revision;
        dirty = serial !== sentSerial;
        conflict = false;
        needsLoad = false;
        if (dirty) {
          persistDraft();
          publish({ trips: current, status: "saving", message: "" });
        } else {
          removeOwnDraft();
          removeAcknowledgedSources(sentTrips);
          current = latest.trips;
          baseRevision = latest.revision;
          publish({ trips: current, status: "saved", message: "" });
        }
        scanDrafts();
      } catch (error) {
        if (!running || epoch !== generation) return;
        persistDraft();
        needsLoad = true;
        conflict = error instanceof HttpError && error.status === 409;
        publish({ status: conflict ? "conflict" : "error", message: error instanceof HttpError && error.code === "identity_changed" ? error.message : conflict ? "Chuyến đi đã thay đổi ở tab hoặc thiết bị khác. Bản của trang này chưa ghi đè bản đã lưu. Xuất bản nháp trước khi chọn tải lại." : `${error instanceof Error ? error.message : "Chưa lưu được dữ liệu."} Giữ trang mở hoặc xuất JSON; bấm Thử lưu lại để kiểm tra và đồng bộ.` });
      }
    })();
    savePromise = operation;
    try { await operation; } finally {
      if (savePromise === operation) savePromise = null;
      if (running && epoch === generation && dirty && !conflict && !needsLoad) schedule();
    }
  }

  function savePreview() {
    const saved = persistDraft();
    if (saved) { writeCleanCache(current, 0); removeAcknowledgedSources(current); }
    publish({ trips: current, ready: true, status: saved ? "local" : "error", message: saved ? "" : "Bản xem thử chưa lưu được trên thiết bị. Giữ trang mở và xuất JSON trước khi rời trang." });
    scanDrafts();
  }

  async function retry(): Promise<void> {
    if (!running || reloading) return;
    if (!userId) { savePreview(); return; }
    if (loadPromise) await loadPromise;
    if (needsLoad || baseRevision === null || conflict) await load();
    if (running && !needsLoad && !conflict && dirty) await save();
  }

  function refreshFromStorage() {
    if (!running || !initialized) return;
    scanDrafts();
    if (!userId || dirty || savePromise || loadPromise || reloading) return;
    const clean = bestCleanCache();
    if (clean && (baseRevision === null || clean.revision > baseRevision)) {
      current = clean.trips;
      baseRevision = clean.revision;
      publish({ trips: current, status: needsLoad ? snapshot.status : "saved" });
    }
  }

  async function reloadServer(): Promise<void> {
    if (reloadPromise) return reloadPromise;
    if (!running) return;
    const epoch = generation;
    const requestedSerial = serial;
    reloading = true;
    cancelDebounce();
    const operation = (async () => {
      try {
        if (savePromise) await savePromise;
        if (loadPromise) await loadPromise;
        if (!running || epoch !== generation) return;
        const remote = userId ? await readRemote() : (() => {
          const clean = bestCleanCache();
          if (!clean) throw new Error("Chưa có bản lưu trên thiết bị để tải lại.");
          return { trips: clean.trips, revision: clean.revision };
        })();
        if (!running || epoch !== generation) return;
        if (serial !== requestedSerial) {
          publish({ message: "Bạn vừa sửa thêm trong lúc tải lại. App giữ bản nháp mới nhất; hãy xuất bản nháp hoặc chọn tải lại một lần nữa." });
          return;
        }
        const latest = writeCleanCache(remote.trips ?? [], remote.revision);
        current = latest.trips;
        baseRevision = latest.revision;
        dirty = false;
        conflict = false;
        needsLoad = false;
        loadedOnce = true;
        removeOwnDraft();
        adopted = [];
        publish({ trips: current, ready: true, status: userId ? "saved" : "local", message: "" });
        if (!userId) { dirty = true; modifiedAt = now().toISOString(); savePreview(); }
        scanDrafts();
      } catch (error) {
        if (!running || epoch !== generation) return;
        needsLoad = Boolean(userId);
        if (dirty) persistDraft();
        publish({ ready: true, status: "error", message: error instanceof HttpError && error.code === "identity_changed" ? error.message : `${error instanceof Error ? error.message : "Chưa tải lại được."} Kế hoạch hiện có và bản nháp chưa bị xóa.` });
      }
    })();
    reloadPromise = operation;
    try { await operation; } finally {
      if (reloadPromise === operation) reloadPromise = null;
      if (epoch === generation) {
        reloading = false;
        if (running && dirty && !needsLoad && !conflict) schedule();
      }
    }
  }

  function change(next: Trip[], expectedCurrent?: Trip[]) {
    if (expectedCurrent !== undefined) {
      const expected = backupSchema.safeParse({ version: 1, trips: expectedCurrent });
      if (!expected.success || !sameTrips(current, expected.data.trips)) throw new Error("Kế hoạch đã có thay đổi mới. Hãy kiểm tra bản hiện tại rồi thử lại; bản mới chưa bị ghi đè.");
    }
    const checked = backupSchema.safeParse({ version: 1, trips: next });
    if (!checked.success) throw new Error(checked.error.issues[0]?.message || "Dữ liệu không hợp lệ.");
    current = checked.data.trips;
    serial += 1;
    dirty = true;
    modifiedAt = now().toISOString();
    if (!userId) { savePreview(); return; }
    persistDraft();
    publish({ trips: current, status: conflict ? "conflict" : needsLoad ? "error" : "saving" });
    schedule();
  }

  async function start(): Promise<void> {
    if (running) return loadPromise ?? Promise.resolve();
    running = true;
    generation += 1;
    if (!initialized) bootstrap();
    if (typeof window !== "undefined") {
      const onStorage = (event: StorageEvent) => { if (event.key === null || event.key === legacyKey || event.key === cleanKey || event.key?.startsWith(outboxPrefix)) refreshFromStorage(); };
      const onOnline = () => { void retry(); };
      const onFocus = () => { refreshFromStorage(); if (needsLoad || dirty) void retry(); };
      window.addEventListener("storage", onStorage);
      window.addEventListener("online", onOnline);
      window.addEventListener("focus", onFocus);
      detachEvents = () => {
        window.removeEventListener("storage", onStorage);
        window.removeEventListener("online", onOnline);
        window.removeEventListener("focus", onFocus);
      };
    }
    if (!userId) { savePreview(); return; }
    needsLoad = true;
    await load();
  }

  function stop() {
    running = false;
    generation += 1;
    cancelDebounce();
    detachEvents?.();
    detachEvents = null;
    requests.forEach((request) => request.abort());
    requests.clear();
    loadPromise = null;
    savePromise = null;
    reloadPromise = null;
    reloading = false;
  }

  return {
    getSnapshot: () => snapshot,
    getServerSnapshot: () => initialSnapshot,
    subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    start, stop, change, discardDraft, retry, reloadServer, refreshFromStorage,
  };
}

export function useTravelStore(user: { id: string; name: string } | null) {
  const controller = useMemo(() => createTravelStoreController(user?.id ?? null), [user?.id]);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getServerSnapshot);
  useEffect(() => { void controller.start(); return () => controller.stop(); }, [controller]);
  return { ...state, change: controller.change, discardDraft: controller.discardDraft, retry: controller.retry, reloadServer: controller.reloadServer };
}
