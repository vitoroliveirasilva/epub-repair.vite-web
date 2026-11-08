/**
 * SMIL 3.0 clock-value, em segundos. Full clock hh:mm:ss e partial clock
 * mm:ss usam segundos < 60; full clock também requer minutos < 60.
 * Retorna NaN quando presente mas inválido, undefined quando ausente.
 */
export function parseSmilClock(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const value = raw.trim().replace(/^npt=/iu, '');
  const quantity = /^(?:\d+(?:\.\d+)?)(?:ms|min|h|s)?$/iu;
  if (quantity.test(value)) {
    const numeric = Number.parseFloat(value);
    if (!Number.isFinite(numeric)) return Number.NaN;
    if (/ms$/iu.test(value)) return numeric / 1000;
    if (/min$/iu.test(value)) return numeric * 60;
    if (/h$/iu.test(value)) return numeric * 3600;
    return numeric;
  }
  const fields = value.split(':');
  if (fields.length !== 2 && fields.length !== 3) return Number.NaN;
  if (!fields.every((part, index) =>
    index === fields.length - 1 ? /^\d+(?:\.\d+)?$/u.test(part) : /^\d+$/u.test(part))) {
    return Number.NaN;
  }
  const values = fields.map(Number);
  const seconds = values.at(-1)!;
  const minutes = values.at(-2)!;
  if (!Number.isFinite(seconds) || !Number.isFinite(minutes) ||
      seconds >= 60 || (fields.length === 3 && minutes >= 60)) return Number.NaN;
  const hours = fields.length === 3 ? values[0]! : 0;
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) ? total : Number.NaN;
}
