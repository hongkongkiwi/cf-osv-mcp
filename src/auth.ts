const encoder = new TextEncoder();

// Length-independent comparison so a wrong token does not leak its prefix.
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  const length = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let index = 0; index < length; index += 1) {
    diff |= (aBytes[index] ?? 0) ^ (bBytes[index] ?? 0);
  }
  return diff === 0;
}

export function isAuthorized(
  request: Request,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken) {
    return false;
  }
  const header = request.headers.get("authorization");
  if (!header) {
    return false;
  }
  const [scheme, ...rest] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer") {
    return false;
  }
  return timingSafeEqual(rest.join(" ").trim(), expectedToken);
}
