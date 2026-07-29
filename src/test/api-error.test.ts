// ApiError.message is what most screens put in front of the user, so it has to
// carry the backend's own words ("Email already registered"), not the status
// line. Both FastAPI detail shapes matter: a plain string for raised
// HTTPExceptions, and a list of {loc, msg} for 422 validation errors.

import { describe, it, expect } from "vitest";
import { ApiError } from "@/lib/api";

describe("ApiError.message", () => {
  it("uses a string detail verbatim", () => {
    const err = new ApiError(409, "Conflict", { detail: "Email already registered" }, "/x");
    expect(err.message).toBe("Email already registered");
    // The debugging context is still on the instance, just not in the message.
    expect(err.status).toBe(409);
    expect(err.url).toBe("/x");
  });

  it("joins the msg fields of a 422 validation list", () => {
    const err = new ApiError(
      422,
      "Unprocessable Entity",
      { detail: [{ loc: ["query", "email"], msg: "Field required" }] },
      "/x",
    );
    expect(err.message).toBe("Field required");
  });

  it("falls back to the status line when there is nothing usable", () => {
    for (const body of [null, "gateway timeout", {}, { detail: "" }, { detail: [{}] }]) {
      expect(new ApiError(500, "Internal Server Error", body, "/x").message).toBe(
        "API 500 Internal Server Error — /x",
      );
    }
  });
});
