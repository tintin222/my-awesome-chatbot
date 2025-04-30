import { getAllGlobalContext } from '@/lib/db/queries';
import { ContextManager } from '@/components/context-manager'; // We will create this next
import { auth } from '@/app/(auth)/auth';
import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Manage Global Context',
};

export default async function ManageContextPage() {
  // Basic auth check - redirect if not logged in
  // You might want more robust role-based access control later
  const session = await auth();
  if (!session?.user) {
    redirect('/api/auth/guest'); // Or redirect to login
  }

  const initialContextItems = await getAllGlobalContext();

  return (
    <div className="container mx-auto p-4 md:p-6">
      <h1 className="text-2xl font-semibold mb-4">Manage Global Context</h1>
      <p className="text-muted-foreground mb-6">
        Add, edit, or delete global context items (like hotel information,
        menus, etc.) that the AI can use across different chats.
      </p>
      {/* Pass initial data to the client component */}
      <ContextManager initialItems={initialContextItems} />
    </div>
  );
}
