import { describe, it, expect } from 'vitest';
import { mapMetaLead } from '@/lib/bestie/lead-intake';

// Shape confirmed from a real Meta test lead, 2026-07-26.
const realTestLead = {
  ad_id: '', email: 'test@meta.com', form_id: '1816400769736719',
  adset_id: '', form_name: '', full_name: '<test lead: dummy data for שם_מלא>',
  leadgen_id: '1726215075243575', campaign_id: '',
  created_time: '2026-07-26T13:47:53.000Z',
  phone_number: '<test lead: dummy data for מספר_טלפון>',
};

describe('mapMetaLead', () => {
  it('maps a production-shaped lead', () => {
    const mapped = mapMetaLead({
      full_name: 'ישראל ישראלי', phone_number: '050-123-4567',
      email: 'israel@example.com', form_id: '1816400769736719',
      leadgen_id: 'L1', ad_id: 'A1', adset_id: 'S1', campaign_id: 'C1',
    });
    expect(mapped.waId).toBe('972501234567');
    expect(mapped.firstName).toBe('ישראל');
    expect(mapped.deliverable).toBe(true);
    expect(mapped.campaignId).toBe('C1');
  });

  it('marks a Meta test lead undeliverable instead of messaging a placeholder', () => {
    const mapped = mapMetaLead(realTestLead);
    expect(mapped.waId).toBeNull();
    expect(mapped.deliverable).toBe(false);
    expect(mapped.leadgenId).toBe('1726215075243575');
  });

  it('treats empty attribution fields as absent, not as empty strings', () => {
    const mapped = mapMetaLead(realTestLead);
    expect(mapped.adId).toBeNull();
    expect(mapped.adsetId).toBeNull();
    expect(mapped.campaignId).toBeNull();
  });

  it('accepts the alternate field names Make setups produce', () => {
    const mapped = mapMetaLead({ name: 'דנה כהן', phone: '0521112222' });
    expect(mapped.fullName).toBe('דנה כהן');
    expect(mapped.waId).toBe('972521112222');
  });

  it('derives a usable first name, falling back when there is no name', () => {
    expect(mapMetaLead({ full_name: 'דנה כהן לוי' }).firstName).toBe('דנה');
    expect(mapMetaLead({}).firstName).toBeNull();
  });

  it('never greets someone by a Meta placeholder', () => {
    const mapped = mapMetaLead(realTestLead);
    expect(mapped.fullName).toBeNull();
    expect(mapped.firstName).toBeNull();
  });
});
