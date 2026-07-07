import { describe, it, expect } from 'vitest';
import { classifyProjectType, statusBucket, commissionOf } from '@/lib/crm/overview';

describe('classifyProjectType', () => {
  it('respects an explicit override', () => {
    expect(classifyProjectType({ project_type: 'multi_month' }, [])).toBe('multi_month');
    expect(classifyProjectType({ project_type: 'single_month' }, [{ notes: 'חודשי' }])).toBe('single_month');
  });
  it('multi-month when a line item has a cadence', () => {
    expect(classifyProjectType({}, [{ deliverable_type: 'פעימה', notes: 'רבעוני' }])).toBe('multi_month');
    expect(classifyProjectType({}, [{ notes: 'תזכורת חודשית' }])).toBe('multi_month');
    expect(classifyProjectType({}, [{ deliverable_type: 'monthly reminder' }])).toBe('multi_month');
  });
  it('single-month otherwise', () => {
    expect(classifyProjectType({}, [{ deliverable_type: 'reel' }])).toBe('single_month');
    expect(classifyProjectType({}, [])).toBe('single_month');
  });
});

describe('statusBucket', () => {
  it('signed / open / cancelled / moved', () => {
    expect(statusBucket({ status: 'active' })).toBe('signed');
    expect(statusBucket({ status: 'completed' })).toBe('signed');
    expect(statusBucket({ status: 'proposal' })).toBe('open');
    expect(statusBucket({ status: 'cancelled' })).toBe('cancelled');
    expect(statusBucket({ status: 'proposal', moved_to_month: '2026-09' })).toBe('moved');
  });
});

describe('commissionOf', () => {
  it('percent of amount', () => {
    expect(commissionOf(80000, 15)).toBe(12000);
    expect(commissionOf(80000, 0)).toBe(0);
    expect(commissionOf(null, 15)).toBe(0);
  });
});
