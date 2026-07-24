import { JwtService } from '@nestjs/jwt';
import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
  const jwt = new JwtService({ secret: process.env.JWT_SECRET });
  // The user from check-user
  const payload = {
    sub: '500ce843-8fbf-436a-81aa-034d8324d7ba',
    email: 'company1@test.com',
    role: 'COMPANY',
    isVerified: true,
    fullName: null,
    profileId: '4277ad2e-f24b-4748-b6a2-ec31ab9c255a' // From my test clone script
  };
  const token = jwt.sign(payload);

  // We need the templateId. Let's find one.
  const templateRes = await fetch('https://api.podorukunspk.fun/api/v1/templates');
  const templates = await templateRes.json();
  const templateId = templates[0]?.id;

  if (!templateId) {
    console.log('No templates found');
    return;
  }

  console.log('Cloning template:', templateId);
  const cloneRes = await fetch(`https://api.podorukunspk.fun/api/v1/templates/${templateId}/clone`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  console.log('Status:', cloneRes.status);
  const data = await cloneRes.text();
  console.log('Response:', data);
}
main();
