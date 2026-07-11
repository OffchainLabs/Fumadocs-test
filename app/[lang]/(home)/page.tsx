import Link from 'next/link';

export default async function HomePage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  const prefix = lang === 'en' ? '' : `/${lang}`;

  return (
    <main className="flex flex-col items-center justify-center text-center flex-1 px-4 py-24 gap-6 bg-linear-to-b from-black to-[#565656] text-white">
      <h1 className="text-4xl font-semibold tracking-tight">Arbitrum docs</h1>
      <p className="text-white/70 max-w-xl">
        Documentation for Arbitrum chains, the Arbitrum stack, and Orbit.
      </p>
      <div className="flex gap-3">
        <Link
          href={`${prefix}/docs/get-started`}
          className="bg-fd-primary text-fd-primary-foreground px-5 py-2 font-medium"
        >
          Get started
        </Link>
        <Link
          href="https://github.com/OffchainLabs/Fumadocs-test"
          className="border border-fd-border px-5 py-2 font-medium"
        >
          GitHub
        </Link>
      </div>
    </main>
  );
}
