import { ALLOWED_EXT, MAX_IMPORT_BYTES } from "./constants";

export type PickProblem = "wrongType" | "tooLarge";

/** Check a picked file before uploading it. */
export function checkPickedFile(file: { name: string; size: number }): PickProblem | null {
  const name = file.name.toLowerCase();
  if (!ALLOWED_EXT.some((ext) => name.endsWith(ext))) return "wrongType";
  if (file.size > MAX_IMPORT_BYTES) return "tooLarge";
  return null;
}

/** Base64 of raw bytes, built in chunks so a large file does not blow the call stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** FileReader rather than `Blob.arrayBuffer()`: same result, and it also exists in jsdom. */
export function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(bytesToBase64(new Uint8Array(reader.result as ArrayBuffer)));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsArrayBuffer(file);
  });
}
