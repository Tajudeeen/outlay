import { describe, expect, it } from "vitest";
import { parseNearJson } from "../src/near-json.js";

describe("parseNearJson", () => {
  it("preserves large u64 and u128 integers as strings", () => {
    const json = '{"u64":18446744073709551615,"u128":340282366920938463463374607431768211455,"zero":0}';
    const parsed = parseNearJson(json) as Record<string, unknown>;
    expect(parsed["u64"]).toBe("18446744073709551615");
    expect(parsed["u128"]).toBe("340282366920938463463374607431768211455");
    expect(parsed["zero"]).toBe("0");
  });

  it("handles negative integers", () => {
    const json = '{"negative":-42}';
    const parsed = parseNearJson(json) as Record<string, unknown>;
    expect(parsed["negative"]).toBe("-42");
  });

  it("preserves standard floating-point numbers as numbers", () => {
    const json = '{"float":1.5,"negative_float":-3.14159,"scientific":1e5,"exp":2.5e-3}';
    const parsed = parseNearJson(json) as Record<string, unknown>;
    expect(parsed["float"]).toBe(1.5);
    expect(parsed["negative_float"]).toBe(-3.14159);
    expect(parsed["scientific"]).toBe(100000);
    expect(parsed["exp"]).toBe(0.0025);
  });

  it("does not mutate numbers inside string literals", () => {
    const json = '{"message":"Invoice 12345 for 100 units","nested":"{\\"inner\\":999}"}';
    const parsed = parseNearJson(json) as Record<string, unknown>;
    expect(parsed["message"]).toBe("Invoice 12345 for 100 units");
    expect(parsed["nested"]).toBe('{"inner":999}');
  });

  it("handles arrays and deeply nested structures", () => {
    const json = '{"items":[1,2,{"id":3,"amount":100000000000000000000}]}';
    const parsed = parseNearJson(json) as { items: unknown[] };
    expect(parsed.items[0]).toBe("1");
    expect(parsed.items[1]).toBe("2");
    expect((parsed.items[2] as Record<string, unknown>)["id"]).toBe("3");
    expect((parsed.items[2] as Record<string, unknown>)["amount"]).toBe("100000000000000000000");
  });

  it("handles boolean, null, and empty structures", () => {
    const json = '{"emptyObj":{},"emptyArr":[],"truth":true,"lie":false,"nothing":null}';
    const parsed = parseNearJson(json) as Record<string, unknown>;
    expect(parsed).toEqual({
      emptyObj: {},
      emptyArr: [],
      truth: true,
      lie: false,
      nothing: null,
    });
  });
});
