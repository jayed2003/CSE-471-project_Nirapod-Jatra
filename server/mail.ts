import nodemailer, { type Transporter } from "nodemailer";

type SosEmailParams = {
  requesterName: string;
  message?: string;
  locationUrl?: string;
  timestamp: Date;
};

let transporter: Transporter | null | undefined;

function getTransporter() {
  if (transporter !== undefined) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    transporter = null;
    return transporter;
  }
  const port = Number(SMTP_PORT ?? 587);
  transporter = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
  return transporter;
}

export async function sendSosAlertEmail(to: string, params: SosEmailParams): Promise<boolean> {
  const client = getTransporter();
  if (!client) {
    console.warn(`SOS email not sent to ${to}: SMTP is not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS)`);
    return false;
  }
  const { requesterName, message, locationUrl, timestamp } = params;
  const lines = [
    `${requesterName} has triggered an emergency SOS on Nirapod Jatra.`,
    message ? `Message: ${message}` : null,
    locationUrl ? `Last known location: ${locationUrl}` : null,
    `Time: ${timestamp.toLocaleString()}`,
  ].filter((line): line is string => Boolean(line));
  try {
    await client.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
      to,
      subject: `Emergency SOS alert from ${requesterName}`,
      text: lines.join("\n"),
    });
    return true;
  } catch (error) {
    console.error(`Failed to send SOS email to ${to}`, error);
    return false;
  }
}
