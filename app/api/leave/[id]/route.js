import { run } from '../../../../lib/api';
import { decideLeave } from '../../../../lib/hrm';
export const dynamic = 'force-dynamic';
export const PATCH = (req, { params }) => run(req, (s, u, b) => decideLeave(s, u, Number(params.id), b.status, b.comment));
