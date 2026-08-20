import nodemailer, { type Transporter } from "nodemailer";

type SosEmailParams = {
  requesterName: string;
  requesterEmail?: string;
  message?: string;
  locationUrl?: string;
  timestamp: Date;
  /** Pre-composed SOS script (coordinates, landmark, situation). Preferred over the loose fields above. */
  script?: string;
  situation?: string;
};

type LocationShareEmailParams = {
  requesterName: string;
  requesterEmail?: string;
  shareUrl: string;
  expiresAt: Date;
};

let transporter: Promise<Transporter | null> | undefined;
let usingEthereal = false;

async function getTransporter(): Promise<Transporter | null> {
  if (transporter !== undefined) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    const port = Number(SMTP_PORT ?? 587);
    transporter = Promise.resolve(
      nodemailer.createTransport({
        host: SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      }),
    );
    return transporter;
  }
  if (process.env.NODE_ENV === "production") {
    transporter = Promise.resolve(null);
    return transporter;
  }
  // No SMTP configured: fall back to a disposable Ethereal test inbox so
  // email-dependent flows are fully exercisable locally without any provider
  // signup. Real recipients won't receive these — each send logs a preview URL instead.
  transporter = nodemailer
    .createTestAccount()
    .then((account) => {
      usingEthereal = true;
      console.warn(
        "SMTP not configured: routing emails through a temporary Ethereal test inbox (not delivered to real recipients). Set SMTP_HOST/SMTP_USER/SMTP_PASS to send real email.",
      );
      return nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: account.user, pass: account.pass },
      });
    })
    .catch((error) => {
      console.error("Failed to create Ethereal test inbox", error);
      return null;
    });
  return transporter;
}

export type SosEmailResult = { sent: boolean; testPreviewUrl?: string };

async function sendPlainTextEmail(
  to: string,
  subject: string,
  lines: Array<string | null>,
  replyTo: string | undefined,
  logLabel: string,
): Promise<SosEmailResult> {
  const client = await getTransporter();
  if (!client) {
    console.warn(
      `${logLabel} not sent to ${to}: SMTP is not configured (set SMTP_HOST/SMTP_USER/SMTP_PASS)`,
    );
    return { sent: false };
  }
  try {
    const info = await client.sendMail({
      from: process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "sos@nirapod-jatra.local",
      to,
      ...(replyTo ? { replyTo } : {}),
      subject,
      text: lines.filter((line): line is string => Boolean(line)).join("\n"),
    });
    if (!usingEthereal) return { sent: true };
    const testPreviewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    console.log(`${logLabel} preview (not a real inbox): ${testPreviewUrl}`);
    return { sent: true, testPreviewUrl };
  } catch (error) {
    console.error(`Failed to send ${logLabel.toLowerCase()} to ${to}`, error);
    return { sent: false };
  }
}

export async function sendSosAlertEmail(
  to: string,
  params: SosEmailParams,
): Promise<SosEmailResult> {
  const { requesterName, requesterEmail, message, locationUrl, timestamp, script, situation } =
    params;
  const subject = situation
    ? `Emergency SOS (${situation}) from ${requesterName}`
    : `Emergency SOS alert from ${requesterName}`;
  return sendPlainTextEmail(
    to,
    subject,
    [
      `${requesterName} has triggered an emergency SOS on Nirapod Jatra.`,
      "",
      // The generated script already carries coordinates, landmark and situation in the exact
      // wording meant to be read to a 999 operator, so send that verbatim when we have it.
      script ??
        [
          message ? `Message: ${message}` : null,
          locationUrl ? `Last known location: ${locationUrl}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      "",
      `Time: ${timestamp.toLocaleString()}`,
      requesterEmail
        ? `\nReply to this email to reach ${requesterName} directly at ${requesterEmail}.`
        : null,
    ],
    requesterEmail,
    "SOS email",
  );
}

export async function sendLocationShareEmail(
  to: string,
  params: LocationShareEmailParams,
): Promise<SosEmailResult> {
  const { requesterName, requesterEmail, shareUrl, expiresAt } = params;
  return sendPlainTextEmail(
    to,
    `${requesterName} is sharing their live location with you`,
    [
      `${requesterName} is sharing their live location with you on Nirapod Jatra.`,
      `View it here: ${shareUrl}`,
      `This link updates in real time until ${expiresAt.toLocaleString()}, or until ${requesterName} stops sharing.`,
      requesterEmail
        ? `\nReply to this email to reach ${requesterName} directly at ${requesterEmail}.`
        : null,
    ],
    requesterEmail,
    "Location share email",
  );
}
