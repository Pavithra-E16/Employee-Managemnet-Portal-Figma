import { run } from '../../../lib/api';
import { completeTodo } from '../../../lib/hrm';
export const dynamic = 'force-dynamic';
export const POST = (req) => run(req, (s, u, b) => completeTodo(s, u, b));
