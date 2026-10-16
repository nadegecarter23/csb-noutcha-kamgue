import { errors } from './errors.js';

const signatures = {
  'application/pdf': (body: Buffer) => body.subarray(0, 5).toString('ascii') === '%PDF-',
  'image/png': (body: Buffer) =>
    body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  'image/jpeg': (body: Buffer) => body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (body: Buffer) =>
    body[0] === 0x50 && body[1] === 0x4b && body[2] === 0x03 && body[3] === 0x04,
} as const;

export function assertFileSignature(body: Buffer, mimeType: keyof typeof signatures): void {
  if (!signatures[mimeType]?.(body))
    throw errors.validation('Le contenu du fichier ne correspond pas à son type déclaré.');
}

export function assertProofFile(body: Buffer, mimeType: string): void {
  if (!(mimeType in signatures) || mimeType.includes('spreadsheet'))
    throw errors.validation('Format de justificatif refusé. Utilisez PDF, PNG ou JPEG.');
  assertFileSignature(body, mimeType as 'application/pdf' | 'image/png' | 'image/jpeg');
}
