// Weekly expiration: the Friday of the current trading week (UTC).
// 7-DTE Iron Condor entries target the Friday of the week they are opened.

export function nextFridayExpiration(from: Date = new Date()): Date {
  const d = new Date(from);
  // Move forward to Friday (5).
  const day = d.getUTCDay(); // 0 Sun ... 6 Sat
  let add = (5 - day + 7) % 7;
  // If today is Friday after market close, we still treat today's Friday as
  // this week's expiration (entries target this week). For simplicity the
  // caller decides Monday/Friday window; this returns the upcoming Friday
  // (or today if it's already Friday).
  if (day === 5) add = 0;
  d.setUTCDate(d.getUTCDate() + add);
  d.setUTCHours(21, 0, 0, 0); // 21:00 UTC ≈ 16:00 ET Friday close
  return d;
}

export function expirationISO(from: Date = new Date()): string {
  return nextFridayExpiration(from).toISOString();
}