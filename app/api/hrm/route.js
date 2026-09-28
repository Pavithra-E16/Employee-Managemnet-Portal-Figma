import { json, whoami, view } from '../../../lib/api';
import { getState } from '../../../lib/store';
export const dynamic = 'force-dynamic';
export async function GET(req) {
  const u = whoami(req);
  return u ? json(view(getState(), u)) : json({ error: 'Sign in required' }, 401);
}
