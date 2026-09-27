/**
 * Incremental Server-Sent Events parser.
 *
 * Network reads do not line up with SSE frames: one read can hold half a frame, several frames, or
 * a frame whose terminating blank line has not arrived yet. This buffers text and emits one parsed
 * JSON payload per complete `data:` frame. Comment frames (": keepalive") and other fields are ignored.
 */
export interface SseParser {
  /** Feed decoded text. Throws SseFormatError if a COMPLETE frame carries invalid JSON. */
  push(text: string): void;
  /** Call when the stream ends: processes a final frame that never received its blank-line terminator. */
  flush(): void;
}

export class SseFormatError extends Error {
  constructor() {
    super('Malformed event in response stream');
    this.name = 'SseFormatError';
  }
}

const FRAME_BREAK = /\r\n\r\n|\n\n|\r\r/;

function frameData(frame: string): string | null {
  const parts: string[] = [];
  for (const line of frame.split(/\r\n|\n|\r/)) {
    if (!line.startsWith('data:')) continue;
    parts.push(line.slice(5).replace(/^ /, ''));
  }
  return parts.length ? parts.join('\n') : null;
}

export function createSseParser(onPayload: (payload: unknown) => void): SseParser {
  let buffer = '';

  const emit = (frame: string, tolerateTruncation: boolean) => {
    const data = frameData(frame);
    if (data === null) return;
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      // A trailing frame cut off by a dropped connection is not a protocol error: the missing
      // terminal event is reported by the caller. A complete-but-corrupt frame is.
      if (tolerateTruncation) return;
      throw new SseFormatError();
    }
    onPayload(payload);
  };

  return {
    push(text) {
      buffer += text;
      for (;;) {
        const match = FRAME_BREAK.exec(buffer);
        if (!match) return;
        const frame = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        emit(frame, false);
      }
    },
    flush() {
      const rest = buffer;
      buffer = '';
      if (rest.trim()) emit(rest, true);
    },
  };
}
