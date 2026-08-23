'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { PageSpinner } from '@/components/ui/misc';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    router.replace(isAuthenticated ? '/dashboard' : '/login');
  }, [isAuthenticated, router]);

  return <PageSpinner />;
}
