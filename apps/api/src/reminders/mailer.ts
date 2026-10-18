import nodemailer from 'nodemailer';

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export interface SmtpConfig {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly username: string | null;
  readonly password: string | null;
}

const TIMEOUT_MS = 10_000;

/** SMTP từ cấu hình trong DB hoặc một chuỗi kết nối (`smtps://user:pass@host:465`); bí mật không bao giờ vào nhật ký. */
export function createSmtpMailer(config: SmtpConfig | string, from: string): Mailer {
  const timeouts = {
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  };
  const transport =
    typeof config === 'string'
      ? nodemailer.createTransport({ url: config, ...timeouts })
      : nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          ...(config.username
            ? { auth: { user: config.username, pass: config.password ?? '' } }
            : {}),
          ...timeouts,
        });
  return {
    async send(message) {
      await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
    },
  };
}
