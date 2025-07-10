import { ContentEnhancementManager } from '@/components/content-enhancement-manager';

export const metadata = {
  title: 'Content Enhancement',
  description: 'Analyze and enhance content with AI-powered entity extraction',
};

export default function EnhanceContentPage() {
  return (
    <div className="flex flex-col h-screen">
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">
              Content Enhancement
            </h1>
            <p className="text-gray-600 mt-2">
              Analyze your content with AI to extract entities and enrich them
              with additional information and multimedia.
            </p>
          </div>
          <ContentEnhancementManager />
        </div>
      </div>
    </div>
  );
}
