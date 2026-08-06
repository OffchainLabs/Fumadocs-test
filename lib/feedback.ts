'use server';

import { type PageFeedback, pageFeedback } from '@/components/feedback/schema';

// Docs feedback sink. Upstream Fumadocs opens a GitHub Discussion per page (apps/docs/lib/github.ts,
// which needs a GitHub App plus two secrets); this site sends the submission to PostHog instead, so
// feedback lands alongside the readership data already queried for content-gap analysis.
//
// Capture happens here on the server rather than through `window.posthog`: the browser-side bridge
// in lib/inkeep.ts no-ops because the PostHog client SDK is not loaded in this app, so a
// client-side `capture()` would discard the feedback silently.
//
// API: https://posthog.com/docs/api/capture

const POSTHOG_HOST = 'https://us.i.posthog.com';

export async function submitPageFeedback(feedback: PageFeedback): Promise<void> {
  // A server action is a public endpoint — re-validate rather than trusting the caller.
  const { opinion, url, message } = pageFeedback.parse(feedback);

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) {
    throw new Error(
      'Cannot record docs feedback: NEXT_PUBLIC_POSTHOG_KEY is unset. Set it to the PostHog ' +
        'project token (Project settings → Project API key) in .env.local and on Vercel.',
    );
  }

  const response = await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      event: 'docs_feedback',
      // Feedback is anonymous, so the distinct_id is a throwaway. `$process_person_profile: false`
      // stops each submission from minting a PostHog person profile keyed to it.
      distinct_id: crypto.randomUUID(),
      properties: {
        $process_person_profile: false,
        $current_url: url,
        $pathname: new URL(url).pathname,
        opinion,
        message,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(
      `PostHog rejected the docs feedback event (${response.status}): ${await response.text()}`,
    );
  }
}
