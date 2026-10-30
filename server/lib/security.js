import {
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
const scryptAsync = promisify(scrypt);
const scryptOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scryptAsync(password, salt, 64, scryptOptions);
  return `scrypt$${salt}$${key.toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  if (typeof password !== "string" || password.length > 128) return false;
  const [algorithm, salt, hash] = encoded.split("$");
  if (
    algorithm !== "scrypt" ||
    !/^[a-f0-9]{32}$/.test(salt) ||
    !/^[a-f0-9]{128}$/.test(hash)
  )
    return false;
  const key = await scryptAsync(password, salt, 64, scryptOptions);
  return timingSafeEqual(Buffer.from(hash, "hex"), key);
}
export const randomSecret = () => randomBytes(32).toString("hex");
export const generateOtp = () => String(randomInt(0, 1000000)).padStart(6, "0");
export function otpHash(secret, userId, otp) {
  return createHmac("sha256", secret)
    .update(JSON.stringify([userId, "reset", otp]))
    .digest("hex");
}
export function safeEqual(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
// Module 3 will call this on the server. Never send it to a public review API.
export function anonymousReviewKey(
  secret,
  anonymousSeed,
  professorId,
  courseId,
) {
  return createHmac("sha256", secret)
    .update(JSON.stringify([anonymousSeed, professorId, courseId]))
    .digest("hex");
}
