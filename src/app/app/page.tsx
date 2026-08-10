import { redirect } from 'next/navigation';
import { AppFrame } from '@/components/layout/AppFrame';
import { AppTabs } from '@/components/layout/AppTabs';
import { currentUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** The app itself. Signed-in accounts only. */
export default async function AppPage() {
  const user = await currentUser();
  if (!user) redirect('/login');

  return (
    <AppFrame>
      <AppTabs />
    </AppFrame>
  );
}
