import { describe, it, expect } from 'vitest';
import { validateOutboundUrl } from '../../worker/security/validate-url';

describe('Security & SSRF Destination Policy', () => {
  it('blocks loopback and localhost hostnames', () => {
    expect(validateOutboundUrl('http://localhost').isValid).toBe(false);
    expect(validateOutboundUrl('http://localhost:80/admin').isValid).toBe(false);
    expect(validateOutboundUrl('https://127.0.0.1').isValid).toBe(false);
    expect(validateOutboundUrl('http://127.0.0.2').isValid).toBe(false);
    expect(validateOutboundUrl('http://[::1]').isValid).toBe(false);
  });

  it('blocks Cloud metadata addresses (AWS, GCP, Azure)', () => {
    // 169.254.169.254 link-local cloud metadata
    expect(validateOutboundUrl('http://169.254.169.254/latest/meta-data/').isValid).toBe(false);
    expect(validateOutboundUrl('http://metadata.google.internal/computeMetadata/v1/').isValid).toBe(
      false,
    );
    expect(validateOutboundUrl('http://instance-data/latest/meta-data').isValid).toBe(false);
  });

  it('blocks RFC 1918 private IPv4 networks', () => {
    // 10.0.0.0/8
    expect(validateOutboundUrl('http://10.0.0.1/').isValid).toBe(false);
    expect(validateOutboundUrl('https://10.255.255.255/').isValid).toBe(false);

    // 172.16.0.0/12
    expect(validateOutboundUrl('http://172.16.0.1/').isValid).toBe(false);
    expect(validateOutboundUrl('http://172.31.255.255/').isValid).toBe(false);

    // 192.168.0.0/16
    expect(validateOutboundUrl('http://192.168.0.1/').isValid).toBe(false);
    expect(validateOutboundUrl('http://192.168.1.100/').isValid).toBe(false);
  });

  it('blocks internal domain suffixes (.local, .internal, .lan, etc.)', () => {
    expect(validateOutboundUrl('http://myserver.local/').isValid).toBe(false);
    expect(validateOutboundUrl('http://db.internal/').isValid).toBe(false);
    expect(validateOutboundUrl('http://router.lan/').isValid).toBe(false);
  });

  it('blocks alternative numeric IPv4 notations attempting to evade filters', () => {
    // Decimal notation for 127.0.0.1
    expect(validateOutboundUrl('http://2130706433/').isValid).toBe(false);

    // Hex notation for 127.0.0.1 (0x7f000001)
    expect(validateOutboundUrl('http://0x7f000001/').isValid).toBe(false);

    // Octal notation for 127.0.0.1 (0177.0.0.1)
    expect(validateOutboundUrl('http://0177.0.0.1/').isValid).toBe(false);

    // Decimal notation for 169.254.169.254 (2852039166)
    expect(validateOutboundUrl('http://2852039166/').isValid).toBe(false);
  });

  it('blocks IPv4-mapped IPv6 loopback and private addresses', () => {
    expect(validateOutboundUrl('http://[::ffff:127.0.0.1]/').isValid).toBe(false);
    expect(validateOutboundUrl('http://[::ffff:192.168.1.1]/').isValid).toBe(false);
  });

  it('blocks forbidden protocols and arbitrary schemes', () => {
    expect(validateOutboundUrl('file:///etc/passwd').isValid).toBe(false);
    expect(validateOutboundUrl('ftp://example.com/').isValid).toBe(false);
    expect(validateOutboundUrl('javascript:alert(1)').isValid).toBe(false);
    expect(validateOutboundUrl('data:text/plain;base64,SGVsbG8=').isValid).toBe(false);
  });

  it('blocks embedded user credentials to prevent credential leaks', () => {
    expect(validateOutboundUrl('https://admin:secret@example.com/').isValid).toBe(false);
    expect(validateOutboundUrl('http://user@example.com/').isValid).toBe(false);
  });

  it('blocks non-web port access to prevent internal port scanning', () => {
    expect(validateOutboundUrl('http://example.com:22/').isValid).toBe(false);
    expect(validateOutboundUrl('http://example.com:3306/').isValid).toBe(false);
    expect(validateOutboundUrl('http://example.com:6379/').isValid).toBe(false);
    expect(validateOutboundUrl('http://example.com:8080/').isValid).toBe(false);
  });

  it('permits valid public web destinations on ports 80 and 443', () => {
    expect(validateOutboundUrl('https://example.com').isValid).toBe(true);
    expect(validateOutboundUrl('http://example.com/sitemap.xml').isValid).toBe(true);
    expect(validateOutboundUrl('https://sub.domain.co.uk:443/page').isValid).toBe(true);
    expect(validateOutboundUrl('http://sub.domain.co.uk:80/page').isValid).toBe(true);
  });
});
