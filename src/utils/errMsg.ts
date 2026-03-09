// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function errMsg(e: any): string {
  if (!e) return 'Unknown error';
  if (typeof e === 'string') return e;
  if (e.message) return e.message;
  if (e.error_description) return e.error_description;
  return JSON.stringify(e);
}
