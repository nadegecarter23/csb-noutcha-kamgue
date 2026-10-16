import { rgb } from 'pdf-lib';

const hex = (value: string) =>
  rgb(
    parseInt(value.slice(1, 3), 16) / 255,
    parseInt(value.slice(3, 5), 16) / 255,
    parseInt(value.slice(5, 7), 16) / 255,
  );

/** Printable version of the official CSB navy, royal blue and orange palette. */
export const documentColors = {
  brand: hex('#0B1B3D'),
  ink: hex('#2C3E50'),
  line: hex('#D9E0EA'),
};

/** Full printable palette (docs/07-CHARTE-GRAPHIQUE.md §3) for richly designed documents. */
export const documentPalette = {
  navy: hex('#0B1B3D'),
  royal: hex('#1F3D80'),
  orange: hex('#F08524'),
  orangeDeep: hex('#E67E22'),
  gold: hex('#F1C40F'),
  white: hex('#FFFFFF'),
  softBlue: hex('#F2F5FB'),
  track: hex('#E3E8F1'),
  ink: hex('#2C3E50'),
  muted: hex('#667085'),
  line: hex('#D9E0EA'),
  lineStrong: hex('#A9B7CC'),
  onNavyMuted: hex('#AEB9D1'),
  success: hex('#067647'),
  danger: hex('#B42318'),
  warningBg: hex('#FFFAEB'),
  warning: hex('#B54708'),
};

export const spreadsheetColors = { brand: 'FF0B1B3D', ink: 'FF2C3E50', white: 'FFFFFFFF' };
