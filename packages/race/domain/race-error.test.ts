import { describe, expect, it } from "vitest";
import { describeRaceError, parseRaceErrorCode } from "./race-error";

describe("race errors", () => {
  it("extracts the code from a Postgres exception message", () => {
    expect(parseRaceErrorCode("RACE_ALREADY_REGISTERED: this athlete is already registered for the event")).toBe("RACE_ALREADY_REGISTERED");
    expect(parseRaceErrorCode("RACE_FORBIDDEN")).toBe("RACE_FORBIDDEN");
    expect(parseRaceErrorCode("duplicate key value violates unique constraint")).toBeNull();
  });
  it("uses friendly wording for known codes and the server text otherwise", () => {
    expect(describeRaceError("RACE_WAIVER_REQUIRED")).toMatch(/waiver/i);
    expect(describeRaceError("RACE_SOMETHING_NEW", "server detail")).toBe("server detail");
    expect(describeRaceError("RACE_SOMETHING_NEW")).toMatch(/try again/i);
  });
});
