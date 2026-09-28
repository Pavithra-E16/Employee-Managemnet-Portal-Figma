import { run } from '../../../../lib/api';
import { verifyTimesheetPin } from '../../../../lib/hrm';
export const dynamic = 'force-dynamic';
export const POST = (req) => run(req, (s, u, b) => verifyTimesheetPin(s, u, b));
