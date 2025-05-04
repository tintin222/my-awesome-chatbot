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
  toggleGlobalContextActive,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

// Define categories
const CONTEXT_CATEGORIES = [
  'Restaurant Information/Menu',
  'Events Information',
  'Shuttle services',
  'FaQ',
  'General Catalog',
  'Hotel services and service prices',
  'Factsheet',
];

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
  const [newIsActive, setNewIsActive] = useState(true);
  const [editIsActive, setEditIsActive] = useState(true);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null); // State for expansion
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
      await createGlobalContext({
        category: newCategory,
        content: newContent,
        isActive: newIsActive,
      });
      toast({ type: 'success', description: 'New context added.' });
      setNewCategory('');
      setNewContent('');
      setNewIsActive(true);
      setIsAddDialogOpen(false);
      router.refresh();
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
    setEditIsActive(item.isActive);
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
        isActive: editIsActive,
      });
      toast({ type: 'success', description: 'Context updated.' });
      setIsEditDialogOpen(false);
      setEditingItem(null);
      router.refresh();
    } catch (error) {
      toast({ type: 'error', description: 'Failed to update context.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Handler for toggling active state
  const handleToggleActive = async (item: GlobalContext) => {
    const originalItems = [...items];
    setItems((currentItems) =>
      currentItems.map((i) =>
        i.id === item.id ? { ...i, isActive: !i.isActive } : i,
      ),
    );

    try {
      await toggleGlobalContextActive({
        id: item.id,
        isActive: !item.isActive,
      });
      router.refresh();
    } catch (error) {
      toast({ type: 'error', description: 'Failed to update status.' });
      setItems(originalItems);
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

  // Toggle expansion handler
  const handleToggleExpand = (itemId: string) => {
    setExpandedItemId((currentId) => (currentId === itemId ? null : itemId));
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
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger className="col-span-3">
                    <SelectValue placeholder="Select a category" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTEXT_CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="new-isActive" className="text-right">
                  Active
                </Label>
                <div className="col-span-3 flex items-center space-x-2">
                  <Checkbox
                    id="new-isActive"
                    checked={newIsActive}
                    onCheckedChange={(checked: boolean | 'indeterminate') =>
                      setNewIsActive(Boolean(checked))
                    }
                  />
                  <label
                    htmlFor="new-isActive"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Include this context for the AI
                  </label>
                </div>
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
                className="border-b pb-2 flex justify-between items-start gap-4"
              >
                {/* Info Section - Made clickable */}
                <div
                  className="flex-1 min-w-0 cursor-pointer"
                  onClick={() => handleToggleExpand(item.id)}
                  role="button" // Accessibility
                  tabIndex={0} // Accessibility
                  onKeyDown={(e) => {
                    // Accessibility for keyboard users
                    if (e.key === 'Enter' || e.key === ' ') {
                      handleToggleExpand(item.id);
                    }
                  }}
                >
                  <p className="font-semibold">{item.category}</p>
                  {/* Conditionally render content */}
                  {expandedItemId === item.id && (
                    <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap break-words">
                      {item.content}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-auto">
                  <div className="flex flex-col items-center space-y-1">
                    <Switch
                      id={`active-switch-${item.id}`}
                      checked={item.isActive}
                      onCheckedChange={() => handleToggleActive(item)}
                    />
                    <Label
                      htmlFor={`active-switch-${item.id}`}
                      className="text-xs text-muted-foreground"
                    >
                      {item.isActive ? 'Active' : 'Inactive'}
                    </Label>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => openEditDialog(item)}
                    className="h-8 w-8"
                  >
                    <PenIcon size={14} />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => setDeletingItem(item)}
                        className="h-8 w-8"
                      >
                        <TrashIcon size={14} />
                      </Button>
                    </AlertDialogTrigger>
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
              <Select value={editCategory} onValueChange={setEditCategory}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {CONTEXT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-isActive" className="text-right">
                Active
              </Label>
              <div className="col-span-3 flex items-center space-x-2">
                <Checkbox
                  id="edit-isActive"
                  checked={editIsActive}
                  onCheckedChange={(checked: boolean | 'indeterminate') =>
                    setEditIsActive(Boolean(checked))
                  }
                />
                <label
                  htmlFor="edit-isActive"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Include this context for the AI
                </label>
              </div>
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
