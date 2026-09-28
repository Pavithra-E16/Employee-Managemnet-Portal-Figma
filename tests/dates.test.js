import { describe, it, expect } from 'vitest';
import { todayISO, addDays, fmtShort, fmtDay, fmtStamp, to12, to24, toMin, overlaps, periodRange, relDay, durationHours } from '../lib/dates';

describe('local date/time helpers', () => {
  it('uses the LOCAL calendar day, not UTC (late evening stays on the same day)', () => {
    expect(todayISO(new Date(2026, 8, 24, 23, 59))).toBe('2026-09-24');
    expect(todayISO(new Date(2026, 8, 24, 0, 1))).toBe('2026-09-24');
  });
  it('adds days across month and year ends', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('formats dates and the timestamp like the design', () => {
    expect(fmtShort('2026-09-05')).toBe('Sept 5');
    expect(fmtDay('2026-09-24')).toBe('Thu, Sept 24');
    expect(fmtStamp(new Date(2026, 8, 24, 16, 12))).toBe('Sept 24, 2026 · 4:12 PM');
  });
  it('converts between 12h and 24h', () => {
    expect(to12('08:00')).toBe('8:00 AM');
    expect(to12('16:30')).toBe('4:30 PM');
    expect(to24('12:00 PM')).toBe('12:00');
    expect(to24('12:00 AM')).toBe('00:00');
    expect(to24('8:00 PM')).toBe('20:00');
    expect(toMin('4:00 PM')).toBe(960);
  });
  it('detects overlapping shifts on the same date only', () => {
    const a = { date: 'd1', s: '8:00 AM', e: '4:00 PM' };
    expect(overlaps(a, { date: 'd1', s: '12:00 PM', e: '8:00 PM' })).toBe(true);
    expect(overlaps(a, { date: 'd1', s: '4:00 PM', e: '8:00 PM' })).toBe(false);
    expect(overlaps(a, { date: 'd2', s: '8:00 AM', e: '4:00 PM' })).toBe(false);
  });
  it('durationHours: the 1st and 2nd Shifts are 8 hours; the overnight 3rd Shift (11:30 PM - 7:00 AM) is 7.5 hours', () => {
    expect(durationHours('7:30 AM', '3:30 PM')).toBe(8); // 1st Shift
    expect(durationHours('3:30 PM', '11:30 PM')).toBe(8); // 2nd Shift
    expect(durationHours('11:30 PM', '7:00 AM')).toBe(7.5); // 3rd Shift - crosses midnight
  });
  it('an overnight shift does not falsely overlap the shift that ends exactly when it starts, but does overlap a genuinely overlapping night shift', () => {
    const night = { date: 'd1', s: '11:30 PM', e: '7:30 AM' };
    expect(overlaps(night, { date: 'd1', s: '3:30 PM', e: '11:30 PM' })).toBe(false); // 2nd Shift ends exactly when 3rd starts - touching, not overlapping
    expect(overlaps(night, { date: 'd1', s: '11:00 PM', e: '6:00 AM' })).toBe(true); // another overnight shift that genuinely overlaps it
  });
  it('period ranges: day, week (Mon-Sun), month, year', () => {
    expect(periodRange('2026-09-24', 'Day')).toEqual(['2026-09-24', '2026-09-24']);
    expect(periodRange('2026-09-24', 'Week')).toEqual(['2026-09-21', '2026-09-27']);
    expect(periodRange('2026-09-24', 'Month')).toEqual(['2026-09-01', '2026-09-30']);
    expect(periodRange('2026-09-24', 'Year')).toEqual(['2026-01-01', '2026-12-31']);
  });
  it('relative day tags', () => {
    expect(relDay('2026-09-24', '2026-09-24')).toBe('Today');
    expect(relDay('2026-09-25', '2026-09-24')).toBe('Tomorrow');
    expect(relDay('2026-09-26', '2026-09-24')).toBe('');
  });
});
