import { parseDecimal } from './parse-decimal';

describe('parseDecimal', () => {
  it.each([
    ['0.5', 0.5],
    ['0,5', 0.5],
    [' 1000 ', 1000],
    ['2,25', 2.25],
    [3, 3],
  ])('reads %j as %j', (input, expected) => {
    expect(parseDecimal(input)).toBe(expected);
  });

  it.each([[''], ['   '], [null], [undefined], ['abc'], ['1,2,3'], [Number.NaN]])(
    'treats %j as no number',
    (input) => {
      expect(parseDecimal(input)).toBeNull();
    },
  );
});
