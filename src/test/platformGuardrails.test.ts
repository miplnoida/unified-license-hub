import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  AppError,
  ValidationError,
  PermissionDeniedError,
  errorToToast,
  toAppError,
  logger,
  scrub,
  newCorrelationId,
} from "@/platform";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { invokeFn } from "@/platform/http/invokeFn";

describe("platform/errors", () => {
  it("AppError subclasses expose stable codes", () => {
    expect(new ValidationError().code).toBe("VALIDATION_ERROR");
    expect(new PermissionDeniedError().code).toBe("PERMISSION_DENIED");
    expect(new AppError("x").code).toBe("APP_ERROR");
  });

  it("errorToToast returns user-safe messages", () => {
    expect(errorToToast(new ValidationError())).toMatch(/invalid/i);
    expect(errorToToast(new PermissionDeniedError("nope", { correlationId: "abcd1234efgh" }))).toContain("abcd1234");
    expect(errorToToast("boom")).toMatch(/went wrong/i);
  });

  it("toAppError wraps unknown values", () => {
    expect(toAppError(new ValidationError())).toBeInstanceOf(ValidationError);
    expect(toAppError(new Error("x")).code).toBe("UNEXPECTED_ERROR");
    expect(toAppError("s").code).toBe("UNEXPECTED_ERROR");
  });
});

describe("platform/logger", () => {
  it("scrubs sensitive keys", () => {
    const out = scrub({ password: "p", nested: { access_token: "t", ok: 1 } }) as any;
    expect(out.password).toBe("[REDACTED]");
    expect(out.nested.access_token).toBe("[REDACTED]");
    expect(out.nested.ok).toBe(1);
  });

  it("logger.info emits without throwing", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logger.info("test.event", { correlationId: "cid" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("platform/http/invokeFn", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns ok on standard EFResult success", async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { ok: true, data: { hello: "world" } },
      error: null,
    });
    const res = await invokeFn<{ hello: string }>("fn", { a: 1 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.hello).toBe("world");
    expect(res.correlationId).toBeTruthy();
  });

  it("returns error when EF returns ok:false", async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: { ok: false, error: { code: "VALIDATION_ERROR", message: "bad" } },
      error: null,
    });
    const res = await invokeFn("fn", {});
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("VALIDATION_ERROR");
  });

  it("wraps transport errors as RemoteServiceError", async () => {
    (supabase.functions.invoke as any).mockResolvedValue({
      data: null,
      error: { message: "network down" },
    });
    const res = await invokeFn("fn");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("REMOTE_SERVICE_ERROR");
  });

  it("propagates the caller-supplied correlation id", async () => {
    (supabase.functions.invoke as any).mockResolvedValue({ data: { ok: true, data: {} }, error: null });
    const cid = newCorrelationId();
    const res = await invokeFn("fn", {}, { correlationId: cid });
    expect(res.correlationId).toBe(cid);
    const call = (supabase.functions.invoke as any).mock.calls[0][1];
    expect(call.headers["x-correlation-id"]).toBe(cid);
    expect(call.body.correlation_id).toBe(cid);
  });
});
