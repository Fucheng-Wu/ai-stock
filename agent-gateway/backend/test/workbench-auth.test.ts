import assert from "node:assert/strict";
import test from "node:test";
import { authenticateWorkbench, requireCommandPermission, WorkbenchAuthError, WorkbenchServiceError } from "../src/lib/workbench-auth.js";

test("workbench authentication trusts RuoYi identity, enforces permission and rejects expired tokens", async () => {
  const previousFetch = globalThis.fetch;
  const previousBaseUrl = process.env.STOCK_API_BASE_URL;
  let calls = 0;
  let result: Record<string, unknown> = { code: 200, user: { userId: 42 }, permissions: ["agent:chat:use"] };
  process.env.STOCK_API_BASE_URL = "http://127.0.0.1:8080/workbench";
  globalThis.fetch = async (input, init) => {
    calls++;
    assert.equal(String(input), "http://127.0.0.1:8080/workbench/getInfo");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer current-user-token");
    assert.equal(init?.redirect, "error");
    return Response.json(result);
  };
  const rejectsAuth = (error: unknown) => error instanceof WorkbenchAuthError && error.code === "AUTH_REQUIRED";
  try {
    for (const token of [undefined, "", "Bearer other-token", "token\r\nInjected: value"]) {
      await assert.rejects(authenticateWorkbench(token), rejectsAuth);
    }
    assert.equal(calls, 0);
    const identity = await authenticateWorkbench("current-user-token");
    assert.equal(identity.userId, "42");
    assert.equal(identity.token, "current-user-token");
    assert.ok(identity.authorizedUntil > Date.now());
    assert.equal(identity.canManage, false);
    for (const command of ["init", "prompt", "load_session", "list_sessions", "rename_session", "delete_session"]) {
      assert.doesNotThrow(() => requireCommandPermission(identity, command));
    }
    for (const command of ["get_models_config", "save_models_config", "provider_login", "auth_response", "create_skill", "plugin_action", "save_mcp_config", "get_feature_settings"]) {
      assert.throws(() => requireCommandPermission(identity, command), /agent:chat:manage/);
    }
    result = { code: 200, user: { userId: 42 }, permissions: ["agent:chat:use", "agent:chat:manage"] };
    const manager = await authenticateWorkbench("current-user-token");
    assert.equal(manager.canManage, true);
    assert.doesNotThrow(() => requireCommandPermission(manager, "save_models_config"));
    result = { code: 200, user: { userId: 7 }, permissions: ["*:*:*"] };
    const admin = await authenticateWorkbench("current-user-token");
    assert.equal(admin.userId, "7");
    assert.equal(admin.canManage, true);
    result = { code: 200, user: { userId: 42 }, permissions: ["stock:analyzer:analyze"] };
    await assert.rejects(authenticateWorkbench("current-user-token"),
      (error: unknown) => error instanceof WorkbenchAuthError && error.code === "FORBIDDEN");
    result = { code: 401, msg: "expired" };
    await assert.rejects(authenticateWorkbench("current-user-token"), rejectsAuth);
    result = { code: 200, user: { userId: "../another-user" }, permissions: ["agent:chat:use"] };
    await assert.rejects(authenticateWorkbench("current-user-token"), rejectsAuth);
    globalThis.fetch = async () => { throw new Error("network unavailable"); };
    await assert.rejects(authenticateWorkbench("current-user-token"), WorkbenchServiceError);
    globalThis.fetch = async () => new Response("maintenance", { status: 503 });
    await assert.rejects(authenticateWorkbench("current-user-token"), WorkbenchServiceError);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousBaseUrl === undefined) delete process.env.STOCK_API_BASE_URL;
    else process.env.STOCK_API_BASE_URL = previousBaseUrl;
  }
});
