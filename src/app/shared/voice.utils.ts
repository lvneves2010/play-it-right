export function normalizeSpeechText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[.,!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function includesAnyPhrase(value: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => value.includes(phrase));
}

export function calculateRootMeanSquare(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }

  const sumOfSquares = samples.reduce((sum, sample) => sum + sample * sample, 0);
  return Math.sqrt(sumOfSquares / samples.length);
}
