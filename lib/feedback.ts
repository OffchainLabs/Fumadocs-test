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

/**
 * Records one page rating in PostHog.
 *
 * Never throws. Every failure path logs to the server console (visible in `vercel logs`) and
 * returns `false`, because an unhandled rejection here propagates out of the client's
 * `startTransition` and takes down the whole page render — a docs page must not break because an
 * analytics write failed.
 *
 * @returns whether the event reached PostHog.
 */
export async function submitPageFeedback(feedback: PageFeedback): Promise<boolean> {
  // A server action is a public endpoint — re-validate rather than trusting the caller.
  const parsed = pageFeedback.safeParse(feedback);
  if (!parsed.success) {
    console.error('[feedback] rejected malformed payload:', parsed.error.issues);
    return false;
  }
  const { opinion, url, message } = parsed.data;

  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) {
    console.error(
      '[feedback] dropping submission: NEXT_PUBLIC_POSTHOG_KEY is unset. Set it to the PostHog ' +
        'project token (Project settings → Project API key) in .env.local, and on Vercel for ' +
        'both Preview and Production.',
    );
    return false;
  }

  try {
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
      console.error(
        `[feedback] PostHog rejected the event (${response.status}): ${await response.text()}`,
      );
      return false;
    }

    return true;
  } catch (error) {
    console.error('[feedback] could not reach PostHog:', error);
    return false;
  }
}
