import { describe, expect, it } from "vitest";
import { isAuthorized, timingSafeEqual } from "../src/auth";

const TOKEN = "test-token-value";

function request(authorization?: string): Request {
  const headers = new Headers();
  if (authorization) {
    headers.set("authorization", authorization);
  }
  return new Request("https://osv-mcp.example/mcp", {
    method: "POST",
    headers,
  });
}

describe("timingSafeEqual", () => {
  it("matches identical strings", () => {
    expect(timingSafeEqual(TOKEN, TOKEN)).toBe(true);
  });

  it("rejects a longer candidate", () => {
    expect(timingSafeEqual(`${TOKEN}x`, TOKEN)).toBe(false);
  });

  it("rejects empty input", () => {
    expect(timingSafeEqual("", TOKEN)).toBe(false);
  });
});

describe("isAuthorized", () => {
  it("accepts a valid bearer token", () => {
    expect(isAuthorized(request(`Bearer ${TOKEN}`), TOKEN)).toBe(true);
  });

  it("accepts a case-insensitive bearer scheme", () => {
    expect(isAuthorized(request(`bearer ${TOKEN}`), TOKEN)).toBe(true);
  });

  it("rejects a missing header", () => {
    expect(isAuthorized(request(), TOKEN)).toBe(false);
  });

  it("rejects a wrong token", () => {
    expect(isAuthorized(request("Bearer nope"), TOKEN)).toBe(false);
  });

  it("rejects a non-bearer scheme", () => {
    expect(isAuthorized(request(`Basic ${TOKEN}`), TOKEN)).toBe(false);
  });

  it("fails closed when no secret is configured", () => {
    expect(isAuthorized(request(`Bearer ${TOKEN}`), undefined)).toBe(false);
  });
});
