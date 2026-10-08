import { formatMinutes } from './duration';

describe('formatMinutes', () => {
  it.each([
    [0, ''],
    [-5, ''],
    [5, '5 min'],
    [45, '45 min'],
    [60, '1 h'],
    [90, '1 h 30 min'],
    [240, '4 h'],
    [255, '4 h 15 min'],
  ])('formats %i minutes as "%s"', (minutes, expected) => {
    expect(formatMinutes(minutes)).toBe(expected);
  });
});
