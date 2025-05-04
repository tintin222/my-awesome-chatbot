'use client';

import { useState } from 'react';
import type { GlobalContext } from '@/lib/db/schema'; // Use 'import type'
import { Button } from '@/components/ui/button';
import { PlusIcon, PenIcon, TrashIcon, SparklesIcon } from './icons'; // Changed EditIcon to PenIcon
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
  refactorGlobalContext,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip';
import { LoaderIcon } from './icons'; // Import a loader icon

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

// Define hotel options
const HOTEL_OPTIONS = ['all', 'serenity', 'golf', 'verde'];

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
  const [isRefactoringId, setIsRefactoringId] = useState<string | null>(null); // State for refactoring loading
  const router = useRouter(); // Get router instance
  const [associatedHotels, setAssociatedHotels] = useState<string[]>(['all']); // Default to ['all']
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editedAssociatedHotels, setEditedAssociatedHotels] = useState<
    string[]
  >([]); // State for edit dialog hotels

  // Handler for saving new context
  const handleAddNewContext = async () => {
    if (!newCategory || !newContent || associatedHotels.length === 0) {
      toast({
        type: 'error',
        description:
          'Category, content, and at least one hotel association are required.',
      });
      return;
    }
    setIsSaving(true);
    try {
      await createGlobalContext({
        category: newCategory,
        content: newContent,
        isActive: newIsActive,
        associatedHotels,
      });
      toast({ type: 'success', description: 'New context added.' });
      setNewCategory('');
      setNewContent('');
      setNewIsActive(true);
      setAssociatedHotels(['all']); // Reset to default
      setIsAddDialogOpen(false);
      router.refresh();
    } catch (error) {
      toast({ type: 'error', description: 'Failed to add context.' });
    } finally {
      setIsSaving(false);
    }
  };

  // Function to open the edit dialog
  const handleEditClick = (item: GlobalContext) => {
    setEditingItem(item);
    setEditCategory(item.category);
    setEditContent(item.content);
    setEditIsActive(item.isActive);
    setEditedAssociatedHotels(item.associatedHotels || ['all']); // Populate hotels for editing
    setIsEditDialogOpen(true);
    setEditError(null); // Clear previous errors
  };

  // Handler for saving edited context
  const handleSaveChanges = async () => {
    if (!editingItem) return;
    // Validate required fields for edit
    if (!editCategory || !editContent || editedAssociatedHotels.length === 0) {
      setEditError(
        'Category, Content, and at least one Hotel Association are required.',
      );
      return;
    }

    setIsSavingEdit(true);
    setEditError(null);
    try {
      await updateGlobalContext({
        id: editingItem.id,
        category: editCategory,
        content: editContent,
        isActive: editIsActive,
        associatedHotels: editedAssociatedHotels, // Pass edited hotels
      });
      toast({ type: 'success', description: 'Context updated.' });
      setIsEditDialogOpen(false);
      setEditingItem(null); // Clear editing state
      router.refresh();
    } catch (error) {
      console.error('Failed to update context:', error);
      setEditError('Failed to save changes. Please try again.');
      toast({ type: 'error', description: 'Failed to update context.' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleEditHotelChange = (hotel: string, checked: boolean) => {
    setEditedAssociatedHotels((prev) =>
      checked ? [...prev, hotel] : prev.filter((h) => h !== hotel),
    );
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

  // Handler for refactoring
  const handleRefactorContext = async (item: GlobalContext) => {
    setIsRefactoringId(item.id);
    try {
      const result = await refactorGlobalContext({ contextId: item.id });
      if (result.success) {
        toast({
          type: 'success',
          description: 'Context refactored successfully.',
        });
        router.refresh(); // Refresh to show updated content
      } else {
        throw new Error(result.error || 'Failed to refactor context.');
      }
    } catch (error) {
      console.error('Refactor error:', error);
      toast({
        type: 'error',
        description:
          error instanceof Error ? error.message : 'Refactoring failed.',
      });
    } finally {
      setIsRefactoringId(null);
    }
  };

  const handleHotelChange = (hotel: string, checked: boolean) => {
    setAssociatedHotels((prev) =>
      checked ? [...prev, hotel] : prev.filter((h) => h !== hotel),
    );
  };

  return (
    <TooltipProvider>
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
                <div className="space-y-2">
                  <Label>Associated Hotels</Label>
                  <div className="flex flex-wrap gap-4">
                    {HOTEL_OPTIONS.map((hotel) => (
                      <div key={hotel} className="flex items-center space-x-2">
                        <Checkbox
                          id={`add-${hotel}`}
                          checked={associatedHotels.includes(hotel)}
                          onCheckedChange={(checked) =>
                            handleHotelChange(hotel, Boolean(checked))
                          }
                        />
                        <Label htmlFor={`add-${hotel}`} className="capitalize">
                          {hotel}
                        </Label>
                      </div>
                    ))}
                  </div>
                  {associatedHotels.length === 0 && (
                    <p className="text-sm text-destructive">
                      Please select at least one hotel association.
                    </p>
                  )}
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
                    {/* Refactor Button */}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => handleRefactorContext(item)}
                          disabled={isRefactoringId === item.id}
                          className="h-8 w-8"
                        >
                          {isRefactoringId === item.id ? (
                            <LoaderIcon />
                          ) : (
                            <SparklesIcon size={14} />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Refactor with AI</TooltipContent>
                    </Tooltip>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => handleEditClick(item)}
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
                              This action cannot be undone. This will
                              permanently delete the context item with category
                              &quot;
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
        {editingItem && (
          <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Edit Context Item</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
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
                <div className="space-y-2">
                  <Label>Associated Hotels</Label>
                  <div className="flex flex-wrap gap-4">
                    {HOTEL_OPTIONS.map((hotel) => (
                      <div key={hotel} className="flex items-center space-x-2">
                        <Checkbox
                          id={`edit-${hotel}`}
                          checked={editedAssociatedHotels.includes(hotel)}
                          onCheckedChange={(checked) =>
                            handleEditHotelChange(hotel, Boolean(checked))
                          }
                        />
                        <Label htmlFor={`edit-${hotel}`} className="capitalize">
                          {hotel}
                        </Label>
                      </div>
                    ))}
                  </div>
                  {editedAssociatedHotels.length === 0 && (
                    <p className="text-sm text-destructive">
                      Please select at least one hotel association.
                    </p>
                  )}
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
                {editError && (
                  <div className="text-sm text-destructive">{editError}</div>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setIsEditDialogOpen(false)}
                  disabled={isSavingEdit || editedAssociatedHotels.length === 0}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveChanges}
                  disabled={isSavingEdit || editedAssociatedHotels.length === 0}
                >
                  {isSavingEdit ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </TooltipProvider>
  );
}
