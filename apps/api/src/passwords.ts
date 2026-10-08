import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import argon2 from 'argon2';
import bcrypt from 'bcryptjs';

export const ARGON_OPTIONS = { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1, hashLength: 32 } as const;
@Injectable()
export class Passwords {
  async hash(password: string) { return argon2.hash(password, ARGON_OPTIONS); }
  async verify(encoded: string | null, password: string): Promise<boolean> {
    if (!encoded || password.length > 128 || password.includes('\0')) return false;
    try {
      // Bounded imported parameters prevent malformed hashes exhausting runtime.
      const phc=encoded.match(/^\$argon2id\$v=19\$([^$]+)\$/);
      if (phc && encoded.length<=512) {
        const parts=phc[1]!.split(',');
        if(parts.length!==3||parts.some(part=>!/^[mtp]=[0-9]+$/.test(part)))return false;
        const parameters=Object.fromEntries(parts.map(part=>part.split('=')));
        if(Object.keys(parameters).length!==3||!parameters.m||!parameters.t||!parameters.p||+parameters.m>65536||+parameters.t>6||+parameters.p>4)return false;
        return await argon2.verify(encoded, password);
      }
      if (/^\$2[aby]\$(0[4-9]|1[0-4])\$[./A-Za-z0-9]{53}$/.test(encoded) && !bcrypt.truncates(password)) return await bcrypt.compare(password, encoded);
      return false;
    } catch { return false; }
  }
  needsRehash(encoded: string) { return !encoded.startsWith('$argon2id$') || argon2.needsRehash(encoded, ARGON_OPTIONS); }
  async assertAllowed(password: string) {
    if (password.length < 10 || password.length > 128 || password.includes('\0')) throw new BadRequestException();
    // HIBP range: only five SHA-1 hex characters leave the server; never send
    // email/password/full digest. Padding reduces response-size correlation.
    const digest = createHash('sha1').update(password).digest('hex').toUpperCase();
    let response: Response;
    try { response = await fetch('https://api.pwnedpasswords.com/range/' + digest.slice(0,5), { headers: { 'Add-Padding': 'true', 'User-Agent': 'Asisteam-password-screening' }, redirect: 'error', signal: AbortSignal.timeout(3000) }); }
    catch { throw new ServiceUnavailableException(); }
    if (!response.ok) throw new ServiceUnavailableException();
    const entries = (await response.text()).split(/\r?\n/);
    if (!entries.some(line => /^[A-F0-9]{35}:\d+$/.test(line))) throw new ServiceUnavailableException();
    if (entries.some(line => line.split(':')[0] === digest.slice(5) && Number(line.split(':')[1]) > 0)) throw new BadRequestException();
  }
}
