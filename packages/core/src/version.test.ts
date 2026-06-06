import { describe, expect, it } from "vitest";
import {
  SCHEMA_VERSION,
  VALID_OUTPUT_FORMATS,
  VALID_PROTOCOL_VERSIONS,
  getToolVersion,
  setToolVersion,
} from "./version.js";

describe("version", () => {
  it("exposes the stable schema version", () => {
    expect(SCHEMA_VERSION).toBe("1.0");
  });

  it("lists valid output and protocol versions", () => {
    expect(VALID_OUTPUT_FORMATS).toEqual(["json", "ndjson", "text"]);
    expect(VALID_PROTOCOL_VERSIONS).toEqual(["0.2"]);
  });

  it("tool version is empty by default and settable", () => {
    expect(getToolVersion()).toBe("");
    setToolVersion("1.2.3");
    expect(getToolVersion()).toBe("1.2.3");
    setToolVersion("");
  });
});
