import { redirect } from 'next/navigation';
import { AppFrame } from '@/components/layout/AppFrame';
import { StartScreen } from '@/components/auth/StartScreen';
import { currentUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  // Someone already signed in has no reason to see the front door.
  const user = await currentUser();
  if (user) redirect('/app');

  return (
    <AppFrame>
      <StartScreen />
    </AppFrame>
  );
}
