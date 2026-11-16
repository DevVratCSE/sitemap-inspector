/**
 * Browser-first gzip decompressor using Web Streams DecompressionStream
 */

export interface DecompressOptions {
  maxBytes?: number; // Default: 2 MB
}

export const MAX_DECOMPRESSED_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Decompresses a gzip-compressed ArrayBuffer or Uint8Array into a UTF-8 string.
 *
 * @param buffer - Binary compressed buffer
 * @param options - Configuration options such as byte limits
 * @returns Decompressed text content
 */
export async function decompressGzip(
  buffer: ArrayBuffer | Uint8Array,
  options?: DecompressOptions,
): Promise<string> {
  const maxBytes = options?.maxBytes ?? MAX_DECOMPRESSED_BYTES;

  if (
    !buffer ||
    (buffer instanceof ArrayBuffer && buffer.byteLength === 0) ||
    (buffer instanceof Uint8Array && buffer.length === 0)
  ) {
    return '';
  }

  // Verify gzip magic number (0x1f 0x8b)
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length >= 2 && (bytes[0] !== 0x1f || bytes[1] !== 0x8b)) {
    // Not actually gzipped, return as text
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(bytes);
  }

  if (typeof DecompressionStream === 'undefined') {
    throw new Error('DecompressionStream is not supported in this runtime environment');
  }

  const stream = new Response(buffer).body;
  if (!stream) {
    throw new Error('Failed to create stream from buffer');
  }

  const decompressionStream = new DecompressionStream('gzip');
  const decompressedStream = stream.pipeThrough(decompressionStream);

  const reader = decompressedStream.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  let reading = true;
  try {
    while (reading) {
      const { done, value } = await reader.read();
      if (done) {
        reading = false;
        break;
      }

      if (value) {
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel('Decompressed size exceeded maximum allowed limit');
          throw new Error(
            `Decompressed content exceeded maximum allowed limit of ${Math.round(maxBytes / (1024 * 1024))} MB`,
          );
        }
        chunks.push(value);
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error) {
      throw err;
    }
    throw new Error(`Failed to decompress gzip content: ${String(err)}`);
  }

  // Concatenate chunks and decode UTF-8
  const concatenated = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    concatenated.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const decoder = new TextDecoder('utf-8');
  return decoder.decode(concatenated);
}
