import { redirect } from 'next/navigation';
import { AppFrame } from '@/components/layout/AppFrame';
import { SignupScreen } from '@/components/auth/SignupScreen';
import { currentUser } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  if (await currentUser()) redirect('/app');

  return (
    <AppFrame>
      <SignupScreen />
    </AppFrame>
  );
}
