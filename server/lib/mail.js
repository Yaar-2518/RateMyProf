import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import nodemailer from "nodemailer";
import { HttpError } from "./errors.js";
export function createMailer(config) {
  const transport =
    config.mail.mode === "smtp"
      ? nodemailer.createTransport({
          host: config.mail.host,
          port: config.mail.port,
          secure: config.mail.secure,
          requireTLS: !config.mail.secure,
          auth: config.mail.user
            ? { user: config.mail.user, pass: config.mail.password }
            : undefined,
        })
      : null;
  return async function sendOtp({ to, otp, purpose = "reset" }) {
    const isVerify = purpose === "verify";
    const subject = isVerify
      ? "Verify your RateMyProf email"
      : "Reset your RateMyProf password";
    const text = isVerify
      ? `Your RateMyProf email verification code is ${otp}.\n\nIt expires in 10 minutes. Never share this code. If you did not request it, ignore this message.`
      : `Your RateMyProf password reset code is ${otp}.\n\nIt expires in 10 minutes. Never share this code. If you did not request it, ignore this message.`;
    const message = {
      from: config.mail.from,
      to,
      subject,
      text,
    };
    try {
      if (transport) await transport.sendMail(message);
      else {
        await fs.mkdir(config.mail.directory, { recursive: true, mode: 0o700 });
        await fs.writeFile(
          path.join(
            config.mail.directory,
            `${Date.now()}-${randomUUID()}.json`,
          ),
          JSON.stringify(
            { ...message, createdAt: new Date().toISOString() },
            null,
            2,
          ),
          { mode: 0o600 },
        );
      }
    } catch {
      throw new HttpError(
        503,
        "Email delivery failed. Please try requesting a new code shortly.",
        "EMAIL_DELIVERY_FAILED",
      );
    }
  };
}
