import { appendFile } from "node:fs/promises";

export class AuditLog {
  constructor(private readonly logPath: string) {}

  async write(event: string, details: Record<string, unknown> = {}): Promise<void> {
    const entry = {
      at: new Date().toISOString(),
      event,
      ...details,
    };

    await appendFile(this.logPath, `${JSON.stringify(entry)}\n`, "utf8");
  }
}
