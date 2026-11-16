import fs from "fs";

const openExclusive = (filePath: string) => new Promise<number>((resolve, reject) => {
  fs.open(filePath, "wx", (error, descriptor) => {
    if (error) reject(error);
    else resolve(descriptor);
  });
});

const writeChunk = (descriptor: number, chunk: Buffer) => new Promise<void>((resolve, reject) => {
  let offset = 0;

  const writeRemaining = () => {
    fs.write(descriptor, chunk, offset, chunk.length - offset, null, (error, bytesWritten) => {
      if (error) {
        reject(error);
        return;
      }
      if (bytesWritten <= 0) {
        reject(new Error("The recording file stopped accepting data."));
        return;
      }
      offset += bytesWritten;
      if (offset < chunk.length) writeRemaining();
      else resolve();
    });
  };

  writeRemaining();
});

const closeFile = (descriptor: number) => new Promise<void>((resolve, reject) => {
  fs.close(descriptor, (error) => {
    if (error) reject(error);
    else resolve();
  });
});

export class RecordingDiskSession {
  private writeQueue: Promise<void> = Promise.resolve();
  private writeError: unknown = null;
  private state: "active" | "sealing" | "closed" = "active";
  private descriptor: number | null;
  private writtenBytes = 0;

  private constructor(
    readonly filePath: string,
    descriptor: number
  ) {
    this.descriptor = descriptor;
  }

  static async create(filePath: string) {
    return new RecordingDiskSession(filePath, await openExclusive(filePath));
  }

  get bytesWritten() {
    return this.writtenBytes;
  }

  append(data: Uint8Array) {
    if (this.state !== "active" || this.descriptor === null) {
      return Promise.reject(new Error("The recording session is no longer active."));
    }

    // Own only this short MediaRecorder chunk while its disk write is pending.
    const chunk = Buffer.from(data);
    const operation = this.writeQueue.then(async () => {
      if (this.writeError) throw this.writeError;
      if (this.descriptor === null) throw new Error("The recording file is closed.");
      await writeChunk(this.descriptor, chunk);
      this.writtenBytes += chunk.length;
    });

    this.writeQueue = operation.catch((error) => {
      if (!this.writeError) this.writeError = error;
    });
    return operation;
  }

  async seal() {
    if (this.state !== "active") {
      throw new Error("The recording session is no longer active.");
    }
    this.state = "sealing";
    await this.writeQueue;

    const descriptor = this.descriptor;
    this.descriptor = null;
    try {
      if (descriptor !== null) await closeFile(descriptor);
    } finally {
      this.state = "closed";
    }

    if (this.writeError) throw this.writeError;
    return this.writtenBytes;
  }

  async cancel() {
    if (this.state === "closed") return;
    this.state = "sealing";
    await this.writeQueue;

    const descriptor = this.descriptor;
    this.descriptor = null;
    try {
      if (descriptor !== null) await closeFile(descriptor).catch(() => undefined);
    } finally {
      this.state = "closed";
      await fs.promises.unlink(this.filePath).catch(() => undefined);
    }
  }

  disposeSync() {
    if (this.state === "closed") return;
    this.state = "closed";
    const descriptor = this.descriptor;
    this.descriptor = null;
    if (descriptor !== null) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // The descriptor may already be closing during shutdown.
      }
    }
    try {
      fs.unlinkSync(this.filePath);
    } catch {
      // The temporary file may already be finalized or unavailable.
    }
  }
}
