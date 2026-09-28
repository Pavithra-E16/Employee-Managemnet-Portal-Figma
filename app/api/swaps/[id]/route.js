import { run } from '../../../../lib/api';
import { actOnSwap } from '../../../../lib/hrm';
export const dynamic = 'force-dynamic';
export const PATCH = (req, { params }) => run(req, (s, u, b) => actOnSwap(s, u, Number(params.id), b.action));
