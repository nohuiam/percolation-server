// BaNano Protocol - Binary encoding for InterLock mesh signals

export interface BaNanoPacket {
  version: number;
  code: string;
  source: string;
  target: string;
  timestamp: number;
  payload: Buffer;
  checksum: number;
}

export class BaNanoProtocol {
  private static VERSION = 1;

  static encode(signal: {
    code: string;
    source: string;
    target: string;
    payload: Record<string, any>;
  }): Buffer {
    const payloadJson = JSON.stringify(signal.payload);
    const payloadBuffer = Buffer.from(payloadJson, 'utf8');

    // Calculate sizes
    const codeBuffer = Buffer.from(signal.code, 'utf8');
    const sourceBuffer = Buffer.from(signal.source, 'utf8');
    const targetBuffer = Buffer.from(signal.target, 'utf8');

    // Header: version(1) + code_len(1) + source_len(1) + target_len(1) + payload_len(4) + timestamp(8) + checksum(4)
    const headerSize = 20;
    const totalSize = headerSize + codeBuffer.length + sourceBuffer.length + targetBuffer.length + payloadBuffer.length;

    const buffer = Buffer.alloc(totalSize);
    let offset = 0;

    // Write header
    buffer.writeUInt8(this.VERSION, offset++);
    buffer.writeUInt8(codeBuffer.length, offset++);
    buffer.writeUInt8(sourceBuffer.length, offset++);
    buffer.writeUInt8(targetBuffer.length, offset++);
    buffer.writeUInt32BE(payloadBuffer.length, offset);
    offset += 4;
    buffer.writeBigInt64BE(BigInt(Date.now()), offset);
    offset += 8;

    // Placeholder for checksum
    const checksumOffset = offset;
    offset += 4;

    // Write data
    codeBuffer.copy(buffer, offset);
    offset += codeBuffer.length;
    sourceBuffer.copy(buffer, offset);
    offset += sourceBuffer.length;
    targetBuffer.copy(buffer, offset);
    offset += targetBuffer.length;
    payloadBuffer.copy(buffer, offset);

    // Calculate and write checksum
    const checksum = this.calculateChecksum(buffer, checksumOffset);
    buffer.writeUInt32BE(checksum, checksumOffset);

    return buffer;
  }

  static decode(buffer: Buffer): BaNanoPacket | null {
    if (buffer.length < 20) return null;

    try {
      let offset = 0;

      // Read header
      const version = buffer.readUInt8(offset++);
      if (version !== this.VERSION) return null;

      const codeLen = buffer.readUInt8(offset++);
      const sourceLen = buffer.readUInt8(offset++);
      const targetLen = buffer.readUInt8(offset++);
      const payloadLen = buffer.readUInt32BE(offset);
      offset += 4;
      const timestamp = Number(buffer.readBigInt64BE(offset));
      offset += 8;
      const checksum = buffer.readUInt32BE(offset);
      offset += 4;

      // Verify checksum
      const expectedChecksum = this.calculateChecksum(buffer, offset - 4);
      if (checksum !== expectedChecksum) return null;

      // Read data
      const code = buffer.toString('utf8', offset, offset + codeLen);
      offset += codeLen;
      const source = buffer.toString('utf8', offset, offset + sourceLen);
      offset += sourceLen;
      const target = buffer.toString('utf8', offset, offset + targetLen);
      offset += targetLen;
      const payload = buffer.subarray(offset, offset + payloadLen);

      return {
        version,
        code,
        source,
        target,
        timestamp,
        payload,
        checksum
      };
    } catch (error) {
      return null;
    }
  }

  static decodePayload(payload: Buffer): Record<string, any> {
    try {
      return JSON.parse(payload.toString('utf8'));
    } catch {
      return {};
    }
  }

  private static calculateChecksum(buffer: Buffer, excludeOffset: number): number {
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (i >= excludeOffset && i < excludeOffset + 4) continue;
      sum = (sum + buffer[i]) >>> 0;
    }
    return sum;
  }
}

export default BaNanoProtocol;
