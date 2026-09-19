import { describe, expect, it } from "vitest";
import { headerSafetyProblem } from "../supabase/config";

describe("headerSafetyProblem", () => {
  it("passes an ordinary key", () => {
    expect(headerSafetyProblem("KEY", "sb_publishable_TlRF59wY4c6kddF4TnUJgA")).toBeNull();
    expect(headerSafetyProblem("KEY", "eyJhbGciOiJIUzI1NiJ9.abc-_123")).toBeNull();
  });

  it("names the character, its position and the variable", () => {
    // A zero-width space, the kind of thing a copy picks up invisibly.
    const problem = headerSafetyProblem("MY_KEY", "abc​def");
    expect(problem).toContain("MY_KEY");
    expect(problem).toContain("U+200B");
    expect(problem).toContain("position 4");
  });

  it("catches a curly quote and an em dash", () => {
    expect(headerSafetyProblem("K", "ab’cd")).toContain("U+2019");
    expect(headerSafetyProblem("K", "ab—cd")).toContain("U+2014");
  });

  it("allows Latin-1 characters, which headers can carry", () => {
    // é is U+00E9, inside the range, so it is not what breaks a header.
    expect(headerSafetyProblem("K", "café")).toBeNull();
  });

  it("is fine with an empty value", () => {
    expect(headerSafetyProblem("K", "")).toBeNull();
  });
});
