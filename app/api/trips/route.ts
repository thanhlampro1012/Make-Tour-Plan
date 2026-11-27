import { getChatGPTUser } from "../../chatgpt-auth";
import { getDb } from "../../../db";
import { travelStates } from "../../../db/schema";
import { backupSchema, MAX_BACKUP_BYTES } from "../../../lib/travel";
import { and, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";
const response = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
const identityChanged = () => response({ code: "identity_changed", error: "Tài khoản đăng nhập đã thay đổi hoặc trang đang dùng phiên cũ. Hãy xuất bản nháp rồi làm mới trang bằng trình duyệt để tiếp tục; dữ liệu chưa bị ghi đè." }, 403);

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return response({ error: "Vui lòng đăng nhập để lưu chuyến đi." }, 401);
  if (request.headers.get("x-expected-user-id") !== user.userId) return identityChanged();
  try {
    const rows = await getDb().select().from(travelStates).where(eq(travelStates.userId, user.userId)).limit(1);
    const row = rows[0];
    return response({ trips: row ? JSON.parse(row.payload) : null, revision: row?.revision ?? 0 });
  } catch {
    return response({ error: "Chưa đọc được dữ liệu. Vui lòng thử lại." }, 503);
  }
}

export async function PUT(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return response({ error: "Vui lòng đăng nhập để lưu chuyến đi." }, 401);
  if (request.headers.get("x-expected-user-id") !== user.userId) return identityChanged();
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return response({ error: "Yêu cầu không hợp lệ." }, 403);
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BACKUP_BYTES) return response({ error: "Dữ liệu quá lớn." }, 413);
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) return response({ error: "Dữ liệu quá lớn." }, 413);
    const body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) return response({ error: "Dữ liệu phải là một đối tượng JSON." }, 400);
    const parsed = backupSchema.safeParse({ version: 1, trips: body.trips });
    if (!parsed.success || !Number.isSafeInteger(body.revision) || body.revision < 0) return response({ error: "Dữ liệu chuyến đi không hợp lệ." }, 400);
    const db = getDb();
    const values = { payload: JSON.stringify(parsed.data.trips), revision: body.revision + 1, updatedAt: new Date().toISOString() };
    const result = body.revision === 0
      ? await db.insert(travelStates).values({ userId: user.userId, ...values }).onConflictDoNothing().returning({ revision: travelStates.revision })
      : await db.update(travelStates).set(values).where(and(eq(travelStates.userId, user.userId), eq(travelStates.revision, body.revision))).returning({ revision: travelStates.revision });
    if (!result.length) return response({ error: "Có thay đổi mới trên thiết bị khác. Hãy tải bản sao trước khi nạp lại." }, 409);
    return response({ revision: result[0].revision });
  } catch (error) {
    if (error instanceof SyntaxError) return response({ error: "Tệp JSON không hợp lệ." }, 400);
    return response({ error: "Chưa lưu được dữ liệu. Bản nháp vẫn ở thiết bị này." }, 503);
  }
}
