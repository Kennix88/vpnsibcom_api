/**
 * Interface for word forms in Russian language
 * @interface WordForms
 */
export interface WordForms {
  one: string;   // Form for 1, 21, 31, etc.
  two: string;   // Form for 2-4, 22-24, etc.
  five: string;  // Form for 5-20, 25-30, etc.
}

/**
 * Common word forms for time units
 */
export const TIME_UNITS: Record<string, WordForms> = {
  SECONDS: { one: 'секунда', two: 'секунды', five: 'секунд' },
  MINUTES: { one: 'минута', two: 'минуты', five: 'минут' },
  HOURS: { one: 'час', two: 'часа', five: 'часов' },
  DAYS: { one: 'день', two: 'дня', five: 'дней' },
  WEEKS: { one: 'неделя', two: 'недели', five: 'недель' },
  MONTHS: { one: 'месяц', two: 'месяца', five: 'месяцев' },
  YEARS: { one: 'год', two: 'года', five: 'лет' },
};

/**
 * Returns the correct word form based on the number in Russian language.
 * 
 * @param {number} n - The number to determine the word form
 * @param {WordForms} words - Object containing three word forms
 * @returns {string} The correct word form for the given number
 * 
 * @example
 * // Returns "день"
 * declOfNum(1, TIME_UNITS.DAYS);
 * 
 * @example
 * // Returns "дня"
 * declOfNum(3, TIME_UNITS.DAYS);
 * 
 * @example
 * // Returns "дней"
 * declOfNum(5, TIME_UNITS.DAYS);
 */
export function declOfNum(
  n: number,
  words: WordForms,
): string {
  // Handle negative numbers and get absolute value
  n = Math.abs(n) % 100;
  const n1 = n % 10;
  
  // Numbers between 11-19 use the "five" form
  if (n > 10 && n < 20) {
    return words.five;
  }
  
  // Numbers ending with 2-4 use the "two" form
  if (n1 > 1 && n1 < 5) {
    return words.two;
  }
  
  // Numbers ending with 1 use the "one" form
  if (n1 === 1) {
    return words.one;
  }
  
  // All other cases use the "five" form
  return words.five;
}

/**
 * Returns a formatted string with number and correctly declined word
 * 
 * @param {number} n - The number to format
 * @param {WordForms} words - Object containing three word forms
 * @returns {string} Formatted string with number and word
 * 
 * @example
 * // Returns "1 день"
 * formatWithNum(1, TIME_UNITS.DAYS);
 */
export function formatWithNum(
  n: number,
  words: WordForms,
): string {
  return `${n} ${declOfNum(n, words)}`;
}
