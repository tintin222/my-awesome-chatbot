'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { PlusIcon, PenIcon, TrashIcon, SparklesIcon, LoaderIcon } from './icons'; // Changed EditIcon to PenIcon
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
  createGlobalContextFromPDF,
  getUniqueCategoriesAction,
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
import { PDFUpload } from './pdf-upload';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import useSWR from 'swr';
import type { GlobalContext } from '@/lib/db/schema';
// import { getAllGlobalContext } from '@/lib/db/queries'; // Kaldırıldı

const fetcher = async (): Promise<GlobalContext[]> => {
  const res = await fetch('/api/global-context');
  if (!res.ok) throw new Error('Failed to fetch context');
  return res.json();
};

// Define default categories (fallback)
const DEFAULT_CATEGORIES = [
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
  // SWR ile context listesini fetch et
  const { data: items = [], mutate } = useSWR<GlobalContext[]>('/api/global-context', fetcher, {
    fallbackData: initialItems,
  });
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

  // New state for dynamic categories
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [customCategory, setCustomCategory] = useState('');

  // Yeni state: PDF preview/edit
  const [pdfPreview, setPdfPreview] = useState<{
    filename: string;
    extractedText: string;
    category: string;
    associatedHotels: string[];
  } | null>(null);
  const [pdfPreviewContent, setPdfPreviewContent] = useState('');
  const [isPdfDialogOpen, setIsPdfDialogOpen] = useState(false);

  // Load categories on component mount
  useEffect(() => {
    const loadCategories = async () => {
      try {
        setIsLoadingCategories(true);
        const uniqueCategories = await getUniqueCategoriesAction();
        // Combine default categories with database categories, removing duplicates
        const allCategories = [...new Set([...DEFAULT_CATEGORIES, ...uniqueCategories])];
        setCategories(allCategories.sort());
      } catch (error) {
        console.error('Failed to load categories:', error);
        // Fallback to default categories
        setCategories(DEFAULT_CATEGORIES);
      } finally {
        setIsLoadingCategories(false);
      }
    };

    loadCategories();
  }, []);

  // Handler for adding custom category
  const handleAddCustomCategory = () => {
    if (customCategory.trim() && !categories.includes(customCategory.trim())) {
      setCategories(prev => [...prev, customCategory.trim()].sort());
      
      // Set the category based on which dialog is open
      if (isAddDialogOpen) {
        setNewCategory(customCategory.trim());
      } else if (isEditDialogOpen) {
        setEditCategory(customCategory.trim());
      }
      
      setCustomCategory('');
    }
  };

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
      setAssociatedHotels(['all']);
      setIsAddDialogOpen(false);
      // SWR ile veriyi yeniden fetch et
      mutate();
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
      mutate();
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
    try {
      await toggleGlobalContextActive({
        id: item.id,
        isActive: !item.isActive,
      });
      mutate();
    } catch (error) {
      toast({ type: 'error', description: 'Failed to update status.' });
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
      mutate();
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
        mutate(); // router.refresh() yerine mutate()
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

  // Handler for PDF upload success
  const handlePDFUploadSuccess = async (data: {
    filename: string;
    extractedText: string;
    category: string;
    associatedHotels: string[];
  }) => {
    setPdfPreview({
      filename: data.filename,
      extractedText: data.extractedText,
      category: data.category,
      associatedHotels: data.associatedHotels,
    });
    setPdfPreviewContent(data.extractedText);
    setIsPdfDialogOpen(true);
    setIsAddDialogOpen(false);
  };

  // PDF preview dialogunda onayla/ekle
  const handleConfirmPDFContext = async () => {
    if (!pdfPreview) return;
    try {
      await createGlobalContextFromPDF({
        filename: pdfPreview.filename,
        extractedText: pdfPreviewContent,
        category: pdfPreview.category,
        associatedHotels: pdfPreview.associatedHotels,
        isActive: true,
      });
      toast({
        type: 'success',
        description: `PDF content from "${pdfPreview.filename}" added successfully!`,
      });
      setIsPdfDialogOpen(false);
      setPdfPreview(null);
      setPdfPreviewContent('');
      mutate(); // router.refresh() yerine mutate()
    } catch (error) {
      toast({
        type: 'error',
        description: 'Failed to save PDF content to context.',
      });
    }
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
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add New Global Context</DialogTitle>
                <DialogDescription>
                  Add context manually or upload a PDF to extract content automatically.
                </DialogDescription>
              </DialogHeader>
              
              <Tabs defaultValue="manual" className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                  <TabsTrigger value="pdf">PDF Upload</TabsTrigger>
                </TabsList>
                
                <TabsContent value="manual" className="space-y-4">
                  {/* Manual form */}
                  <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="new-category" className="text-right">
                    Category
                  </Label>
                  <div className="col-span-3 space-y-2">
                    <Select value={newCategory} onValueChange={setNewCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingCategories ? "Loading categories..." : "Select a category"} />
                      </SelectTrigger>
                      <SelectContent>
                        {isLoadingCategories ? (
                          <SelectItem value="" disabled>
                            Loading categories...
                          </SelectItem>
                        ) : (
                          categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add new category"
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddCustomCategory();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddCustomCategory}
                        disabled={!customCategory.trim()}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
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
            </TabsContent>
            
            <TabsContent value="pdf" className="space-y-4">
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="pdf-category" className="text-right">
                    Category
                  </Label>
                  <div className="col-span-3 space-y-2">
                    <Select value={newCategory} onValueChange={setNewCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingCategories ? "Loading categories..." : "Select a category"} />
                      </SelectTrigger>
                      <SelectContent>
                        {isLoadingCategories ? (
                          <SelectItem value="" disabled>
                            Loading categories...
                          </SelectItem>
                        ) : (
                          categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add new category"
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddCustomCategory();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddCustomCategory}
                        disabled={!customCategory.trim()}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Associated Hotels</Label>
                  <div className="flex flex-wrap gap-4">
                    {HOTEL_OPTIONS.map((hotel) => (
                      <div key={hotel} className="flex items-center space-x-2">
                        <Checkbox
                          id={`pdf-${hotel}`}
                          checked={associatedHotels.includes(hotel)}
                          onCheckedChange={(checked) =>
                            handleHotelChange(hotel, Boolean(checked))
                          }
                        />
                        <Label htmlFor={`pdf-${hotel}`} className="capitalize">
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

                <div className="space-y-2">
                  <Label>Upload PDF</Label>
                  <PDFUpload
                    onUploadSuccess={handlePDFUploadSuccess}
                    category={newCategory}
                    associatedHotels={associatedHotels}
                    disabled={!newCategory || associatedHotels.length === 0}
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
              </DialogFooter>
            </TabsContent>
          </Tabs>
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
                          className="size-8"
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
                      className="size-8"
                    >
                      <PenIcon size={14} />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => setDeletingItem(item)}
                          className="size-8"
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
                  <div className="col-span-3 space-y-2">
                    <Select value={editCategory} onValueChange={setEditCategory}>
                      <SelectTrigger>
                        <SelectValue placeholder={isLoadingCategories ? "Loading categories..." : "Select a category"} />
                      </SelectTrigger>
                      <SelectContent>
                        {isLoadingCategories ? (
                          <SelectItem value="" disabled>
                            Loading categories...
                          </SelectItem>
                        ) : (
                          categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add new category"
                        value={customCategory}
                        onChange={(e) => setCustomCategory(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleAddCustomCategory();
                          }
                        }}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleAddCustomCategory}
                        disabled={!customCategory.trim()}
                      >
                        Add
                      </Button>
                    </div>
                  </div>
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
      {isPdfDialogOpen && pdfPreview && (
        <Dialog open={isPdfDialogOpen} onOpenChange={setIsPdfDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Review and Edit Extracted PDF Content</DialogTitle>
              <DialogDescription>
                AI tarafından çıkarılan metni gözden geçirin, gerekirse düzenleyin ve onaylayın. Onayladığınızda context&apos;e eklenecek.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">Category</Label>
                <div className="col-span-3">{pdfPreview.category}</div>
              </div>
              <div className="grid grid-cols-4 items-start gap-4">
                <Label className="text-right pt-2">Content</Label>
                <Textarea
                  value={pdfPreviewContent}
                  onChange={e => setPdfPreviewContent(e.target.value)}
                  className="col-span-3 h-40 resize-none"
                />
              </div>
              <div className="space-y-2">
                <Label>Associated Hotels</Label>
                <div className="flex flex-wrap gap-4">
                  {pdfPreview.associatedHotels.map(hotel => (
                    <span key={hotel} className="px-2 py-1 bg-muted rounded text-xs capitalize">
                      {hotel}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPdfDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmPDFContext}>
                Onayla ve Ekle
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </TooltipProvider>
  );
}
