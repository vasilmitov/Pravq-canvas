'use client';

import dynamic from 'next/dynamic';

const Canvas = dynamic(
  () => import('@/components/workspace/Canvas'),
  { ssr: false }
);

export default function Home() {
  return (
    <main className="workspace-viewport">
      <Canvas />
    </main>
  );
}