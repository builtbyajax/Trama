import { test, expect } from "@playwright/test";

test("the local command bridge refuses rebinding and cross-origin writes", async ({
  request,
}) => {
  const snapshot = async () =>
    (
      await (
        await request.post("/api/command", {
          data: { command: "load_snapshot", args: {} },
        })
      ).json()
    ).result;
  const before = await snapshot();
  const attempts: Record<string, string>[] = [
    { Host: "evil.example", Origin: "http://evil.example" },
    { Host: "127.0.0.1:1423", Origin: "https://evil.example" },
    { Host: "evil.example:1423" },
    { Host: "127.0.0.1:9999", Origin: "http://127.0.0.1:9999" },
  ];
  for (const headers of attempts) {
    const response = await request.post("/api/command", {
      headers,
      data: { command: "save_project", args: { name: "Must never exist" } },
    });
    expect(response.status()).toBe(403);
  }
  expect(await snapshot()).toEqual(before);
  for (const host of ["localhost:1423", "127.0.0.1:1423", "[::1]:1423"]) {
    expect(
      (
        await request.post("/api/command", {
          headers: { Host: host, Origin: `http://${host}` },
          data: { command: "load_snapshot", args: {} },
        })
      ).status(),
    ).toBe(200);
  }
  expect((await request.get("/api/command")).status()).toBe(405);
  expect(
    (await request.post("/api/command", { data: "plain text" })).status(),
  ).toBe(415);
});
