'use client';

import { useState } from 'react';
import type { GlobalContext } from '@/lib/db/schema'; // Use 'import type'
import { Button } from '@/components/ui/button';
import { PlusIcon, PenIcon, TrashIcon } from './icons'; // Changed EditIcon to PenIcon
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  createGlobalContext,
  updateGlobalContext,
  deleteGlobalContext,
} from '@/app/(chat)/actions'; // Import server actions
import { toast } from './toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useRouter } from 'next/navigation'; // Import useRouter

interface ContextManagerProps {
  initialItems: GlobalContext[];
}

export function ContextManager({ initialItems }: ContextManagerProps) {
  // State for the list of items (might use SWR later for auto-updates)
  const [items, setItems] = useState<GlobalContext[]>(initialItems);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  // Add states for edit/delete dialogs
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GlobalContext | null>(null);
  const [editCategory, setEditCategory] = useState('');
  const [editContent, setEditContent] = useState('');
  const [deletingItem, setDeletingItem] = useState<GlobalContext | null>(null);
  // Saving state
  const [isSaving, setIsSaving] = useState(false);
  // Add states for edit/delete dialogs later
  const [newCategory, setNewCategory] = useState('');
  const [newContent, setNewContent] = useState('');
  const router = useRouter(); // Get router instance

  // Handler for saving new context
  const handleAddNewContext = async () => {
    if (!newCategory || !newContent) {
      toast({
        type: 'error',
        description: 'Category and content cannot be empty.',
      });
      return;
    }
    setIsSaving(true);
    try {
      // We need to get the new item back or refetch to update the list
      // For now, let's just call the action and manually update state (simplest)
      // Ideally, use SWR mutation for better state handling
      await createGlobalContext({ category: newCategory, content: newContent });
      // Refetch or manually add to state - fetching is safer
      // For simplicity now, we assume refetch/revalidation happens elsewhere or manually added later
      toast({ type: 'success', description: 'New context added.' });
      setNewCategory('');
      setNewContent('');
      setIsAddDialogOpen(false);
      router.refresh(); // Refresh data on success
    } catch (error) {
      toast({ type: 'error', description: 'Failed to add context.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Handlers for editing
  const openEditDialog = (item: GlobalContext) => {
    setEditingItem(item);
    setEditCategory(item.category);
    setEditContent(item.content);
    setIsEditDialogOpen(true);
  };

  const handleUpdateContext = async () => {
    if (!editingItem || !editCategory || !editContent) {
      toast({
        type: 'error',
        description: 'Category and content cannot be empty.',
      });
      return;
    }
    setIsSaving(true);
    try {
      await updateGlobalContext({
        id: editingItem.id,
        category: editCategory,
        content: editContent,
      });
      toast({ type: 'success', description: 'Context updated.' });
      setIsEditDialogOpen(false);
      setEditingItem(null);
      router.refresh(); // Refresh data on success
    } catch (error) {
      toast({ type: 'error', description: 'Failed to update context.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Handler for deleting
  const handleDeleteContext = async () => {
    if (!deletingItem) return;
    setIsSaving(true);
    try {
      await deleteGlobalContext({ id: deletingItem.id });
      toast({ type: 'success', description: 'Context deleted.' });
      setDeletingItem(null);
      router.refresh(); // Refresh data on success
    } catch (error) {
      toast({ type: 'error', description: 'Failed to delete context.' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        {/* Add New Button - Placeholder Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <PlusIcon size={16} /> Add New Context
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Global Context</DialogTitle>
              <DialogDescription>
                Enter a category and content for this new context item.
              </DialogDescription>
            </DialogHeader>
            {/* Add form */}
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-category" className="text-right">
                  Category
                </Label>
                <Input
                  id="new-category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="col-span-3"
                  placeholder="e.g., Menu, Shuttle, Events"
                />
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label htmlFor="new-content" className="text-right pt-2">
                  Content
                </Label>
                <Textarea
                  id="new-content"
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  className="col-span-3 h-40 resize-none"
                  placeholder="Enter the context information here..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="secondary"
                onClick={() => setIsAddDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button onClick={handleAddNewContext} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Context'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Display Items - Placeholder */}
      <div className="border rounded-md p-4">
        <h2 className="text-lg font-medium mb-2">Existing Context Items</h2>
        {items.length === 0 ? (
          <p className="text-muted-foreground">
            No global context items found.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => (
              <li
                key={item.id}
                className="border-b pb-2 flex justify-between items-start"
              >
                <div>
                  <p className="font-semibold">{item.category}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {item.content}
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0 ml-4">
                  {/* Edit Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEditDialog(item)}
                  >
                    <PenIcon size={16} />
                  </Button>
                  {/* Delete Button -> Triggers AlertDialog */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeletingItem(item)}
                      >
                        <TrashIcon size={16} />
                      </Button>
                    </AlertDialogTrigger>
                    {/* Conditionally render content only when deletingItem matches */}
                    {deletingItem?.id === item.id && (
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Are you absolutely sure?
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently
                            delete the context item with category &quot;
                            {deletingItem.category}&quot;.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            onClick={() => setDeletingItem(null)}
                          >
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={handleDeleteContext}
                            disabled={isSaving}
                          >
                            {isSaving ? 'Deleting...' : 'Delete'}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    )}
                  </AlertDialog>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Global Context</DialogTitle>
            <DialogDescription>
              Modify the category or content for this context item.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-category" className="text-right">
                Category
              </Label>
              <Input
                id="edit-category"
                value={editCategory}
                onChange={(e) => setEditCategory(e.target.value)}
                className="col-span-3"
              />
            </div>
            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-content" className="text-right pt-2">
                Content
              </Label>
              <Textarea
                id="edit-content"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="col-span-3 h-40 resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => setIsEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={handleUpdateContext} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
