import { requireValue } from "./errors.js";
export function text(value, label, max, optional = false) {
  requireValue(typeof value === "string", `${label} must be text.`);
  const trimmed = value.trim();
  requireValue(
    (optional || trimmed.length > 0) && trimmed.length <= max,
    `${label} must ${optional ? "" : "not be empty and "}contain at most ${max} characters.`,
  );
  return trimmed;
}
export function email(value) {
  const normalized = text(value, "Email", 254).toLowerCase();
  requireValue(
    /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/.test(
      normalized,
    ),
    "Enter a valid email address.",
  );
  return normalized;
}
export function studentEmail(value, domains) {
  const normalized = email(value);
  requireValue(
    !normalized.split("@")[0].includes("+"),
    "Use your original student email without a plus-address alias.",
  );
  requireValue(
    domains.includes(normalized.split("@")[1]),
    `Use a student email from: ${domains.join(", ")}.`,
  );
  return normalized;
}
export function password(value) {
  requireValue(
    typeof value === "string" && value.length >= 12 && value.length <= 128,
    "Password must contain 12–128 characters.",
  );
  return value;
}
export function id(value) {
  requireValue(
    typeof value === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(value),
    "Invalid catalog identifier.",
  );
  return value;
}
export function code(value) {
  const result = text(value, "Code", 20).toUpperCase();
  requireValue(
    /^[A-Z0-9][A-Z0-9 -]*$/.test(result),
    "Code may contain letters, numbers, spaces, and hyphens.",
  );
  return result;
}
