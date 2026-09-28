import { run } from '../../../lib/api';
import { createLeave } from '../../../lib/hrm';
export const dynamic = 'force-dynamic';
export const POST = (req) => run(req, (s, u, b) => createLeave(s, u, b));
