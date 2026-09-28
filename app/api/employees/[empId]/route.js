import { run } from '../../../../lib/api';
import { updateEmployee } from '../../../../lib/hrm';
export const dynamic = 'force-dynamic';
export const PATCH = (req, { params }) => run(req, (s, u, b) => updateEmployee(s, u, params.empId, b));
