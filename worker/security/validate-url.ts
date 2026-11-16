/**
 * SSRF and Destination Validation for Cloudflare Worker Gateway
 * Aggressively verifies target URLs against private, reserved, loopback, and cloud metadata addresses.
 */

export interface ValidationResult {
  isValid: boolean;
  normalizedUrl?: string;
  error?: string;
}

// Blocked internal hostname patterns
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'local',
  'broadcasthost',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata',
  'instance-data',
]);

const BLOCKED_DOMAINS_SUFFIXES = ['.local', '.internal', '.lan', '.home', '.corp', '.arpa'];

/**
 * Checks if a string is a standard IPv4 address in dotted-decimal format
 */
function isDottedIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return false;
    const num = parseInt(part, 10);
    if (num < 0 || num > 255) return false;
  }
  return true;
}

/**
 * Converts a 32-bit integer IPv4 address to a standard dotted-decimal string
 */
function intToIpv4(int: number): string {
  const part1 = (int >>> 24) & 255;
  const part2 = (int >>> 16) & 255;
  const part3 = (int >>> 8) & 255;
  const part4 = int & 255;
  return `${part1}.${part2}.${part3}.${part4}`;
}

/**
 * Parses alternative numeric IP representations (decimal, octal, hex)
 */
function parseNumericIpv4(host: string): string | null {
  // Hex notation: 0x7f000001
  if (/^0x[0-9a-f]+$/i.test(host)) {
    const num = parseInt(host, 16);
    if (num >= 0 && num <= 0xffffffff) {
      return intToIpv4(num);
    }
  }

  // Decimal integer notation: 2130706433 (127.0.0.1)
  if (/^\d+$/.test(host)) {
    const num = parseInt(host, 10);
    if (num >= 0 && num <= 0xffffffff) {
      return intToIpv4(num);
    }
  }

  // Octal/Dotted notation: 0177.0.0.1
  const parts = host.split('.');
  if (parts.length === 4) {
    const nums: number[] = [];
    for (const part of parts) {
      let n: number;
      if (part.startsWith('0x') || part.startsWith('0X')) {
        n = parseInt(part, 16);
      } else if (part.length > 1 && part.startsWith('0')) {
        n = parseInt(part, 8);
      } else if (/^\d+$/.test(part)) {
        n = parseInt(part, 10);
      } else {
        return null;
      }
      if (isNaN(n) || n < 0 || n > 255) return null;
      nums.push(n);
    }
    return nums.join('.');
  }

  return null;
}

/**
 * Checks whether an IPv4 address belongs to private, reserved, or loopback ranges
 */
function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map((p) => parseInt(p, 10));
  if (parts.length !== 4) return true;

  const [a, b, c, _d] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;

  // 10.0.0.0/8 (Private RFC 1918)
  if (a === 10) return true;

  // 100.64.0.0/10 (Carrier-Grade NAT RFC 6598)
  if (a === 100 && b >= 64 && b <= 127) return true;

  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;

  // 169.254.0.0/16 (Link-local & Cloud Metadata: 169.254.169.254)
  if (a === 169 && b === 254) return true;

  // 172.16.0.0/12 (Private RFC 1918)
  if (a === 172 && b >= 16 && b <= 31) return true;

  // 192.0.0.0/24 (IETF Protocol Assignments)
  if (a === 192 && b === 0 && c === 0) return true;

  // 192.0.2.0/24 (TEST-NET-1)
  if (a === 192 && b === 0 && c === 2) return true;

  // 192.88.99.0/24 (6to4 Relay)
  if (a === 192 && b === 88 && c === 99) return true;

  // 192.168.0.0/16 (Private RFC 1918)
  if (a === 192 && b === 168) return true;

  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;

  // 198.51.100.0/24 (TEST-NET-2)
  if (a === 198 && b === 51 && c === 100) return true;

  // 203.0.113.0/24 (TEST-NET-3)
  if (a === 203 && b === 0 && c === 113) return true;

  // 224.0.0.0/4 (Multicast)
  if (a >= 224 && a <= 239) return true;

  // 240.0.0.0/4 (Reserved / Future Use)
  if (a >= 240) return true;

  // 255.255.255.255/32 (Broadcast)
  if (a === 255 && b === 255 && c === 255 && _d === 255) return true;

  return false;
}

/**
 * Checks whether an IPv6 address is loopback, unique-local, link-local, or IPv4-mapped private
 */
function isBlockedIpv6(host: string): boolean {
  // Strip brackets if present
  let clean = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  clean = clean.toLowerCase();

  // ::1 loopback or :: unspecified
  if (clean === '::1' || clean === '::' || clean === '0:0:0:0:0:0:0:1') return true;

  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or WHATWG normalized ::ffff:7f00:1)
  if (clean.startsWith('::ffff:')) {
    const mapped = clean.substring(7);
    if (isDottedIpv4(mapped)) {
      return isBlockedIpv4(mapped);
    }
    // Handle hex words like 7f00:1 (127.0.0.1) or c0a8:101 (192.168.1.1)
    if (mapped.includes(':')) {
      const parts = mapped.split(':');
      if (parts.length === 2) {
        const w1 = parseInt(parts[0], 16);
        const w2 = parseInt(parts[1], 16);
        if (!isNaN(w1) && !isNaN(w2) && w1 >= 0 && w1 <= 0xffff && w2 >= 0 && w2 <= 0xffff) {
          const a = (w1 >>> 8) & 0xff;
          const b = w1 & 0xff;
          const c = (w2 >>> 8) & 0xff;
          const d = w2 & 0xff;
          return isBlockedIpv4(`${a}.${b}.${c}.${d}`);
        }
      }
    }
    const numIp = parseNumericIpv4(mapped);
    if (numIp) {
      return isBlockedIpv4(numIp);
    }
  }

  // Link-local: fe80::/10
  if (
    clean.startsWith('fe8') ||
    clean.startsWith('fe9') ||
    clean.startsWith('fea') ||
    clean.startsWith('feb')
  ) {
    return true;
  }

  // Unique local: fc00::/7 (fc00:: and fd00::)
  if (clean.startsWith('fc') || clean.startsWith('fd')) {
    return true;
  }

  return false;
}

/**
 * Validates an outbound destination URL against all SSRF safety rules
 *
 * @param rawUrl - The target URL to inspect
 * @returns ValidationResult with status, normalized URL or rejection reason
 */
export function validateOutboundUrl(rawUrl: string): ValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { isValid: false, error: 'Empty or non-string URL provided' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { isValid: false, error: 'Malformed URL syntax' };
  }

  // 1. Strict Protocol Check
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return {
      isValid: false,
      error: `Forbidden protocol "${parsed.protocol}". Only HTTP and HTTPS are permitted`,
    };
  }

  // 2. Reject User Credentials (e.g. https://user:pass@example.com)
  if (parsed.username || parsed.password) {
    return {
      isValid: false,
      error: 'URLs containing embedded credentials (user:password) are forbidden',
    };
  }

  // 3. Port Whitelist: Standard 80, 443 only (or empty)
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    return {
      isValid: false,
      error: `Non-standard port "${parsed.port}" is forbidden. Only ports 80 and 443 are allowed`,
    };
  }

  let hostname = parsed.hostname.toLowerCase();

  // Strip trailing dot if present (FQDN)
  if (hostname.endsWith('.')) {
    hostname = hostname.slice(0, -1);
  }

  // 4. Blocked Hostnames and Internal Domain Suffixes
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { isValid: false, error: `Forbidden host destination: "${hostname}"` };
  }

  for (const suffix of BLOCKED_DOMAINS_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      return { isValid: false, error: `Internal domain suffix "${suffix}" is forbidden` };
    }
  }

  // 5. Direct IPv4 Check
  if (isDottedIpv4(hostname)) {
    if (isBlockedIpv4(hostname)) {
      return {
        isValid: false,
        error: `Private or reserved IPv4 address "${hostname}" is forbidden`,
      };
    }
    return { isValid: true, normalizedUrl: parsed.href };
  }

  // 6. Alternate Numeric IPv4 Check (decimal, octal, hex)
  const resolvedNumeric = parseNumericIpv4(hostname);
  if (resolvedNumeric) {
    if (isBlockedIpv4(resolvedNumeric)) {
      return {
        isValid: false,
        error: `Numeric IPv4 encoding resolving to blocked IP "${resolvedNumeric}" is forbidden`,
      };
    }
    // Rewritten to standard canonical dotted form
    parsed.hostname = resolvedNumeric;
    return { isValid: true, normalizedUrl: parsed.href };
  }

  // 7. Direct IPv6 Check
  if (hostname.includes(':') || (hostname.startsWith('[') && hostname.endsWith(']'))) {
    if (isBlockedIpv6(hostname)) {
      return { isValid: false, error: `Private, loopback, or local IPv6 address is forbidden` };
    }
  }

  return { isValid: true, normalizedUrl: parsed.href };
}
