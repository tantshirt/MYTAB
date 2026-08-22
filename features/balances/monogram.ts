/** First letter of a group or merchant name, for the 40px chip. */
export function monogram(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}
