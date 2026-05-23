/**
 * FAL AI client — server-side only.
 * Never import this in frontend/browser code.
 */
import { fal } from '@fal-ai/client';

let configured = false;

export function configureFal() {
  if (configured) return fal;

  const key = process.env.FAL_KEY;
  if (!key) {
    throw new Error(
      'FAL_KEY is not set.\n' +
      'Copy .env.example → .env and add your FAL AI API key from https://fal.ai/dashboard/keys'
    );
  }

  fal.config({ credentials: key });
  configured = true;
  return fal;
}

export { fal };
