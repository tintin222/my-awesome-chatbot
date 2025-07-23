'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  AlertCircle,
  Plus,
  Eye,
  Trash2,
  Sparkles,
  Upload,
  Image,
  Video,
  FileText,
  Music,
} from 'lucide-react';
import {
  getAvailableContextForEnhancement,
  createEnhancedContentFromContext,
  getEnhancedContentList,
  getEnhancedContentWithEntities,
  addEntityEnhancement,
  deleteEntityEnhancementAction,
  deleteMultimediaAttachmentAction,
} from '@/app/(chat)/actions';

// Types
interface GlobalContext {
  id: string;
  category: string;
  content: string;
  isActive: boolean;
}

interface EnhancedContent {
  id: string;
  originalContentId: string;
  title: string;
  status: 'draft' | 'reviewing' | 'published';
  createdAt: Date;
  updatedAt: Date | null;
  originalTitle: string | null;
}

interface ContentEntity {
  id: string;
  type: string;
  name: string;
  description: string | null;
  originalText: string;
  startPosition: number | null;
  endPosition: number | null;
  confidence: string | null;
  metadata: any;
  enhancements: EntityEnhancement[];
  attachments: MultimediaAttachment[];
}

interface EntityEnhancement {
  id: string;
  enhancementType: string;
  title: string;
  content: string;
  sortOrder: number | null;
}

interface MultimediaAttachment {
  id: string;
  type: 'image' | 'video' | 'audio' | 'document';
  filename: string;
  originalFilename: string | null;
  url: string | null;
  altText: string | null;
  caption: string | null;
}

export function ContentEnhancementManager() {
  const [availableContext, setAvailableContext] = useState<GlobalContext[]>([]);
  const [enhancedContentList, setEnhancedContentList] = useState<
    EnhancedContent[]
  >([]);
  const [selectedContent, setSelectedContent] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingContentId, setLoadingContentId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('available');
  const [showEntityDialog, setShowEntityDialog] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<ContentEntity | null>(
    null,
  );
  const [enhancementForm, setEnhancementForm] = useState({
    type: '',
    title: '',
    content: '',
  });

  // Load data on component mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [available, enhanced] = await Promise.all([
        getAvailableContextForEnhancement(),
        getEnhancedContentList(),
      ]);
      setAvailableContext(available);
      setEnhancedContentList(enhanced);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnalyzeContent = async (contextId: string) => {
    try {
      setIsLoading(true);
      const result = await createEnhancedContentFromContext({
        originalContentId: contextId,
      });

      if (result.success) {
        await loadData(); // Refresh the lists
        setActiveTab('enhanced'); // Switch to enhanced tab
      } else {
        console.error('Failed to analyze content:', result.error);
      }
    } catch (error) {
      console.error('Error analyzing content:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewContent = async (enhancedContentId: string) => {
    try {
      console.log('[View Content] Starting for ID:', enhancedContentId);
      setLoadingContentId(enhancedContentId);
      const content = await getEnhancedContentWithEntities({
        enhancedContentId,
      });
      console.log('[View Content] Loaded content:', content);

      if (!content) {
        throw new Error('No content returned from server');
      }

      setSelectedContent(content);
      setActiveTab('viewer'); // Ensure we switch to the viewer tab
      console.log('[View Content] Switched to viewer tab');
    } catch (error) {
      console.error('Failed to load content details:', error);
      // Could add a toast notification here
      alert('Failed to load content details. Please try again.');
    } finally {
      setLoadingContentId(null);
    }
  };

  const handleEntitySelect = (entity: ContentEntity) => {
    setSelectedEntity(entity);
    setShowEntityDialog(true);
  };

  const handleAddEnhancement = async () => {
    if (
      !selectedEntity ||
      !enhancementForm.type ||
      !enhancementForm.title ||
      !enhancementForm.content
    ) {
      return;
    }

    try {
      await addEntityEnhancement({
        entityId: selectedEntity.id,
        enhancementType: enhancementForm.type,
        title: enhancementForm.title,
        content: enhancementForm.content,
      });

      // Refresh the content data
      if (selectedContent) {
        const refreshed = await getEnhancedContentWithEntities({
          enhancedContentId: selectedContent.content.id,
        });
        setSelectedContent(refreshed);

        // Update the selected entity
        const updatedEntity = refreshed?.entities.find(
          (e: ContentEntity) => e.id === selectedEntity.id,
        );
        if (updatedEntity) {
          setSelectedEntity(updatedEntity);
        }
      }

      // Reset form
      setEnhancementForm({ type: '', title: '', content: '' });
    } catch (error) {
      console.error('Failed to add enhancement:', error);
    }
  };

  const getEntityTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'restaurant':
      case 'facility':
        return '🏢';
      case 'service':
      case 'amenity':
        return '🛎️';
      case 'location':
        return '📍';
      case 'contact':
        return '📞';
      case 'pricing':
        return '💰';
      case 'event':
        return '🎉';
      default:
        return '📄';
    }
  };

  const getConfidenceColor = (confidence: string | null) => {
    if (!confidence) return 'bg-gray-500';
    const conf = Number.parseFloat(confidence);
    if (conf >= 0.8) return 'bg-green-500';
    if (conf >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getMediaIcon = (type: string) => {
    switch (type) {
      case 'image':
        return <Image className="size-4" />;
      case 'video':
        return <Video className="size-4" />;
      case 'audio':
        return <Music className="size-4" />;
      case 'document':
        return <FileText className="size-4" />;
      default:
        return <FileText className="size-4" />;
    }
  };

  const enhancementTypes = [
    'description',
    'hours',
    'contact',
    'pricing',
    'features',
    'policies',
    'location',
    'amenities',
    'menu',
    'specifications',
    'booking',
    'reviews',
  ];

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="available">Available Content</TabsTrigger>
          <TabsTrigger value="enhanced">Enhanced Content</TabsTrigger>
          <TabsTrigger value="viewer">Content Viewer</TabsTrigger>
        </TabsList>

        <TabsContent value="available" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Available Content for Enhancement</CardTitle>
              <CardDescription>
                Select content to analyze and extract entities for enhancement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {availableContext.map((context) => (
                  <Card
                    key={context.id}
                    className="border-l-4 border-l-blue-500"
                  >
                    <CardContent className="pt-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">
                            {context.category}
                          </h3>
                          <p className="text-gray-600 text-sm mt-1 line-clamp-3">
                            {context.content.substring(0, 200)}...
                          </p>
                          <div className="mt-2">
                            <Badge
                              variant={
                                context.isActive ? 'default' : 'secondary'
                              }
                            >
                              {context.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </div>
                        <Button
                          onClick={() => handleAnalyzeContent(context.id)}
                          disabled={isLoading}
                          className="ml-4"
                        >
                          <Sparkles className="size-4 mr-2" />
                          Analyze
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {availableContext.length === 0 && !isLoading && (
                  <div className="text-center py-8 text-gray-500">
                    <AlertCircle className="size-12 mx-auto mb-4 opacity-50" />
                    <p>No content available for enhancement.</p>
                    <p className="text-sm">
                      All available content has been processed.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="enhanced" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Enhanced Content</CardTitle>
              <CardDescription>
                Content that has been analyzed and enhanced with entities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {enhancedContentList.map((content) => (
                  <Card
                    key={content.id}
                    className="border-l-4 border-l-green-500"
                  >
                    <CardContent className="pt-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg">
                            {content.title}
                          </h3>
                          <p className="text-gray-600 text-sm">
                            Category: {content.originalTitle}
                          </p>
                          <div className="mt-2 flex gap-2">
                            <Badge
                              variant={
                                content.status === 'published'
                                  ? 'default'
                                  : content.status === 'reviewing'
                                    ? 'secondary'
                                    : 'outline'
                              }
                            >
                              {content.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="ml-4 flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={loadingContentId === content.id}
                            onClick={() => {
                              console.log(
                                '[View Button] Clicked for content ID:',
                                content.id,
                              );
                              handleViewContent(content.id);
                            }}
                          >
                            <Eye className="size-4 mr-2" />
                            {loadingContentId === content.id
                              ? 'Loading...'
                              : 'View'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {enhancedContentList.length === 0 && !isLoading && (
                  <div className="text-center py-8 text-gray-500">
                    <AlertCircle className="size-12 mx-auto mb-4 opacity-50" />
                    <p>No enhanced content available.</p>
                    <p className="text-sm">
                      Start by analyzing content from the Available Content tab.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="viewer" className="space-y-4">
          {selectedContent ? (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>{selectedContent.content.title}</CardTitle>
                  <CardDescription>
                    Status: {selectedContent.content.status} | Entities:{' '}
                    {selectedContent.entities.length}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="prose max-w-none">
                    <h4>Original Content:</h4>
                    <div className="bg-gray-50 p-4 rounded-lg text-sm whitespace-pre-wrap">
                      {selectedContent.content.originalContent}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Extracted Entities</CardTitle>
                  <CardDescription>
                    Click on an entity to view and add enhancements
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    {selectedContent.entities.map((entity: ContentEntity) => (
                      <Card
                        key={entity.id}
                        className="cursor-pointer hover:shadow-md transition-shadow border-l-4 border-l-purple-500"
                        onClick={() => handleEntitySelect(entity)}
                      >
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <span className="text-lg">
                                  {getEntityTypeIcon(entity.type)}
                                </span>
                                <h4 className="font-semibold">{entity.name}</h4>
                                <Badge variant="outline">{entity.type}</Badge>
                                {entity.confidence && (
                                  <Badge
                                    className={`text-white ${getConfidenceColor(entity.confidence)}`}
                                  >
                                    {Math.round(
                                      Number.parseFloat(entity.confidence) *
                                        100,
                                    )}
                                    %
                                  </Badge>
                                )}
                              </div>
                              {entity.description && (
                                <p className="text-gray-600 text-sm mb-2">
                                  {entity.description}
                                </p>
                              )}
                              <div className="text-xs text-gray-500 bg-gray-100 p-2 rounded">
                                &ldquo;{entity.originalText}&rdquo;
                              </div>
                              <div className="mt-2 flex gap-2">
                                <Badge variant="secondary">
                                  {entity.enhancements.length} enhancements
                                </Badge>
                                <Badge variant="secondary">
                                  {entity.attachments.length} attachments
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8 text-gray-500">
                                      <Eye className="size-12 mx-auto mb-4 opacity-50" />
                  <p>Select enhanced content to view details and entities.</p>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Entity Enhancement Dialog */}
      <Dialog open={showEntityDialog} onOpenChange={setShowEntityDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-lg">
                {selectedEntity && getEntityTypeIcon(selectedEntity.type)}
              </span>
              {selectedEntity?.name}
            </DialogTitle>
            <DialogDescription>
              Enhance this entity with additional information and multimedia
            </DialogDescription>
          </DialogHeader>

          {selectedEntity && (
            <div className="space-y-6">
              {/* Entity Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Entity Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Type</Label>
                    <Badge variant="outline" className="ml-2">
                      {selectedEntity.type}
                    </Badge>
                  </div>

                  <div>
                    <Label className="text-sm font-medium">Original Text</Label>
                    <div className="text-sm bg-gray-100 p-3 rounded mt-1">
                      &ldquo;{selectedEntity.originalText}&rdquo;
                    </div>
                  </div>

                  {selectedEntity.description && (
                    <div>
                      <Label className="text-sm font-medium">Description</Label>
                      <p className="text-sm mt-1">
                        {selectedEntity.description}
                      </p>
                    </div>
                  )}

                  {selectedEntity.confidence && (
                    <div>
                      <Label className="text-sm font-medium">
                        AI Confidence
                      </Label>
                      <Badge
                        className={`ml-2 text-white ${getConfidenceColor(selectedEntity.confidence)}`}
                      >
                        {Math.round(
                          Number.parseFloat(selectedEntity.confidence) * 100,
                        )}
                        %
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Existing Enhancements */}
              {selectedEntity.enhancements.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      Current Enhancements
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {selectedEntity.enhancements.map((enhancement) => (
                        <div
                          key={enhancement.id}
                          className="border rounded p-3"
                        >
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Badge variant="outline">
                                  {enhancement.enhancementType}
                                </Badge>
                                <h5 className="font-medium">
                                  {enhancement.title}
                                </h5>
                              </div>
                              <p className="text-sm text-gray-600">
                                {enhancement.content}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                deleteEntityEnhancementAction({
                                  id: enhancement.id,
                                })
                              }
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Add New Enhancement */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Add Enhancement</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Enhancement Type</Label>
                    <Select
                      value={enhancementForm.type}
                      onValueChange={(value) =>
                        setEnhancementForm((prev) => ({ ...prev, type: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {enhancementTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type.charAt(0).toUpperCase() + type.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Title</Label>
                    <Input
                      value={enhancementForm.title}
                      onChange={(e) =>
                        setEnhancementForm((prev) => ({
                          ...prev,
                          title: e.target.value,
                        }))
                      }
                      placeholder="Enhancement title"
                    />
                  </div>

                  <div>
                    <Label>Content</Label>
                    <Textarea
                      value={enhancementForm.content}
                      onChange={(e) =>
                        setEnhancementForm((prev) => ({
                          ...prev,
                          content: e.target.value,
                        }))
                      }
                      placeholder="Enhancement content..."
                      rows={4}
                    />
                  </div>

                  <Button onClick={handleAddEnhancement} className="w-full">
                    <Plus className="size-4 mr-2" />
                    Add Enhancement
                  </Button>
                </CardContent>
              </Card>

              {/* Multimedia Attachments */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">
                    Multimedia Attachments
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedEntity.attachments.length > 0 ? (
                    <div className="grid gap-3">
                      {selectedEntity.attachments.map((attachment) => (
                        <div
                          key={attachment.id}
                          className="flex items-center justify-between p-3 border rounded"
                        >
                          <div className="flex items-center gap-3">
                            {getMediaIcon(attachment.type)}
                            <div>
                              <p className="font-medium">
                                {attachment.originalFilename ||
                                  attachment.filename}
                              </p>
                              <p className="text-sm text-gray-500">
                                {attachment.type}
                              </p>
                              {attachment.caption && (
                                <p className="text-sm text-gray-600">
                                  {attachment.caption}
                                </p>
                              )}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              deleteMultimediaAttachmentAction({
                                id: attachment.id,
                              })
                            }
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      <Upload className="size-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No multimedia attachments yet</p>
                    </div>
                  )}

                  <Separator className="my-4" />

                  <Button variant="outline" className="w-full">
                    <Upload className="size-4 mr-2" />
                    Add Multimedia
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
