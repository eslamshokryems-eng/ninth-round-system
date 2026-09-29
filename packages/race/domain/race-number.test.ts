import { describe, expect, it } from "vitest";
import { RACE_NUMBER_PATTERN, formatRaceNumber, parseRaceNumberQuery } from "./race-number";

describe("formatRaceNumber", () => {
  it("pads to three digits", () => {
    expect(formatRaceNumber(1)).toBe("N001");
    expect(formatRaceNumber(27)).toBe("N027");
    expect(formatRaceNumber(999)).toBe("N999");
  });
  it("grows to four digits, never truncates", () => {
    expect(formatRaceNumber(1000)).toBe("N1000");
    expect(formatRaceNumber(9999)).toBe("N9999");
  });
  it("matches the database's race_number constraint", () => {
    for (const n of [1, 9, 10, 99, 100, 999, 1000, 9999]) expect(RACE_NUMBER_PATTERN.test(formatRaceNumber(n))).toBe(true);
  });
  it("refuses out-of-range sequences", () => {
    expect(() => formatRaceNumber(0)).toThrow(RangeError);
    expect(() => formatRaceNumber(10000)).toThrow(RangeError);
    expect(() => formatRaceNumber(1.5)).toThrow(RangeError);
  });
});

describe("parseRaceNumberQuery", () => {
  it.each([
    ["27", "N027"],
    ["n27", "N027"],
    ["N027", "N027"],
    ["027", "N027"],
    ["  N27 ", "N027"],
    ["1", "N001"],
    ["N1000", "N1000"],
    ["٢٧", "N027"],
  ])("%j → %j", (input, expected) => {
    expect(parseRaceNumberQuery(input)).toBe(expected);
  });
  it.each(["", "ahmed", "0100123", "N", "N0", "0", "12345", "N27x"])("%j is not a race-number query", (input) => {
    expect(parseRaceNumberQuery(input)).toBeNull();
  });
});
