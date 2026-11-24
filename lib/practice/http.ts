import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { ApiError } from "./errors";

const NO_STORE = { "Cache-Control": "no-store" } as const;

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ data }, { status, headers: NO_STORE });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json(
      { error: { code: error.code, message: error.message, details: error.details } },
      { status: error.status, headers: NO_STORE }
    );
  }
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: {
          code: "validation_error",
          message: "Request validation failed",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
      { status: 400, headers: NO_STORE }
    );
  }
  // Next signals "this needs request time" (cookies(), request.url) by throwing; that is not a
  // failure, so let Next handle it instead of logging it or answering 500.
  unstable_rethrow(error);
  // Never leak internal messages (they can contain SQL/schema details or keys).
  console.error("[practice-api] unexpected error:", error);
  return Response.json(
    { error: { code: "internal_error", message: "Something went wrong" } },
    { status: 500, headers: NO_STORE }
  );
}
