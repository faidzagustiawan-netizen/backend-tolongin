import { JwtService } from '@nestjs/jwt';
import * as dotenv from 'dotenv';
import * as http from 'http';
import * as https from 'https';

dotenv.config();

async function main() {
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  const payload = {
    sub: '500ce843-8fbf-436a-81aa-034d8324d7ba',
    email: 'company1@test.com',
    role: 'COMPANY',
    isVerified: true,
    fullName: null,
    profileId: 'ef89ab4d-e89b-452f-9fd2-0c24dfb36e17'
  };
  const token = jwt.sign(payload);

  // Using fetch via https to podorukunspk.fun, but since my sandbox has ENOTFOUND,
  // I will just use fetch against the VPS IP directly or try to resolve it.
  // Wait, if api.podorukunspk.fun is proxied by Cloudflare, it might block direct IP.
  // Let me just see if I can hit the frontend URL.
  // Actually, I can just modify frontend page.tsx to console.log(await res.text())!
  // No, I want to see the error right now.
  console.log("I will not run this script. I will check frontend first.");
}
main();
