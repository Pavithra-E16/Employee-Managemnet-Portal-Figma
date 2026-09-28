import { run } from '../../../lib/api';
import { createSwap } from '../../../lib/hrm';
export const dynamic = 'force-dynamic';
export const POST = (req) => run(req, (s, u, b) => createSwap(s, u, b));
