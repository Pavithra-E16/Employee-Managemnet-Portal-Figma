import { run } from '../../../lib/api';
import { submitTimesheet } from '../../../lib/hrm';
export const dynamic = 'force-dynamic';
export const POST = (req) => run(req, (s, u, b) => submitTimesheet(s, u, b));
