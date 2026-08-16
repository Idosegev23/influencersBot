import { describe, it, expect } from 'vitest';
import { identityPhone, identityKey, whatsappIdentity, type CsIdentity } from '@/lib/cs/identity';

describe('CsIdentity helpers', () => {
  it('whatsappIdentity builds a channel_verified identity keyed on waId', () => {
    const id = whatsappIdentity('972501112222', 'ch-1');
    expect(id).toEqual({ channel: 'whatsapp', waId: '972501112222', waChannelId: 'ch-1', trust: 'channel_verified' });
  });

  it('identityPhone: whatsapp → waId; claimed channels → claimed phone or null', () => {
    expect(identityPhone(whatsappIdentity('972501112222', 'ch-1'))).toBe('972501112222');
    const ig: CsIdentity = { channel: 'instagram', igsid: 'ig-1', trust: 'unverified' };
    expect(identityPhone(ig)).toBeNull();
    const widget: CsIdentity = { channel: 'widget', visitorId: 'v-1', phone: '0501112222', trust: 'phone_claimed' };
    expect(identityPhone(widget)).toBe('0501112222');
  });

  it('identityPhone treats a whitespace-only claimed phone as absent', () => {
    const w: CsIdentity = { channel: 'web_chat', sessionId: 's-1', phone: '   ', trust: 'phone_claimed' };
    expect(identityPhone(w)).toBeNull();
  });

  it('identityKey maps each channel to its (channel, channel_user_id) pair', () => {
    expect(identityKey(whatsappIdentity('972501112222', 'ch-1'))).toEqual({ channel: 'whatsapp', channelUserId: '972501112222', waChannelId: 'ch-1' });
    expect(identityKey({ channel: 'instagram', igsid: 'ig-1', trust: 'unverified' })).toEqual({ channel: 'instagram', channelUserId: 'ig-1', waChannelId: null });
    expect(identityKey({ channel: 'widget', visitorId: 'v-1', trust: 'unverified' })).toEqual({ channel: 'widget', channelUserId: 'v-1', waChannelId: null });
    expect(identityKey({ channel: 'web_chat', sessionId: 's-1', trust: 'unverified' })).toEqual({ channel: 'web_chat', channelUserId: 's-1', waChannelId: null });
  });
});
