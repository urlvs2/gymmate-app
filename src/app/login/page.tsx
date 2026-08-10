import { redirect } from 'next/navigation';
import { AppFrame } from '@/components/layout/AppFrame';
import { LoginScreen } from '@/components/auth/LoginScreen';
import { currentUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await currentUser()) redirect('/app');

  return (
    <AppFrame>
      <LoginScreen />
    </AppFrame>
  );
}
