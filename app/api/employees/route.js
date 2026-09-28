import { run } from '../../../lib/api';
import { addEmployee } from '../../../lib/hrm';
export const dynamic = 'force-dynamic';
export const POST = (req) => run(req, (s, u, b) => addEmployee(s, u, b));
