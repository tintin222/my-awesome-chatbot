'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/components/toast';
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  AlertCircle,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PDFUploadProps {
  onUploadSuccess: (data: {
    filename: string;
    extractedText: string;
    category: string;
    associatedHotels: string[];
    pdfUrl?: string;
  }) => void;
  category: string;
  associatedHotels: string[];
  disabled?: boolean;
}

export function PDFUpload({ 
  onUploadSuccess, 
  category, 
  associatedHotels, 
  disabled = false 
}: PDFUploadProps) {
  const [uploadState, setUploadState] = useState<{
    status: 'idle' | 'uploading' | 'processing' | 'success' | 'error';
    progress: number;
    filename?: string;
    error?: string;
  }>({
    status: 'idle',
    progress: 0,
  });

  const uploadPDF = useCallback(async (file: File) => {
    if (!category) {
      toast({
        type: 'error',
        description: 'Please select a category before uploading a PDF.',
      });
      return;
    }

    if (associatedHotels.length === 0) {
      toast({
        type: 'error',
        description: 'Please select at least one hotel association before uploading.',
      });
      return;
    }

    setUploadState({
      status: 'uploading',
      progress: 20,
      filename: file.name,
    });

    let progressInterval: NodeJS.Timeout | null = null;

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', category);
      formData.append('associatedHotels', JSON.stringify(associatedHotels));

      setUploadState(prev => ({
        ...prev,
        status: 'processing',
        progress: 50,
      }));

      // Simulate progress during processing
      progressInterval = setInterval(() => {
        setUploadState(prev => {
          if (prev.progress < 90) {
            return { ...prev, progress: prev.progress + 5 };
          }
          return prev;
        });
      }, 200);

      const response = await fetch('/api/pdf-upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      setUploadState({
        status: 'success',
        progress: 100,
        filename: file.name,
      });

      toast({
        type: 'success',
        description: `PDF "${file.name}" processed successfully!`,
      });

      onUploadSuccess(result.data);

      // Reset state after a delay
      setTimeout(() => {
        setUploadState({ status: 'idle', progress: 0 });
      }, 2000);

    } catch (error) {
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      
      setUploadState({
        status: 'error',
        progress: 0,
        filename: file.name,
        error: errorMessage,
      });

      toast({
        type: 'error',
        description: errorMessage,
      });
    }
  }, [category, associatedHotels, onUploadSuccess]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        uploadPDF(file);
      }
    },
    [uploadPDF]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024, // 10MB
    disabled: disabled || uploadState.status === 'uploading' || uploadState.status === 'processing',
  });

  const resetUpload = () => {
    setUploadState({ status: 'idle', progress: 0 });
  };

  const getStatusIcon = () => {
    switch (uploadState.status) {
      case 'uploading':
      case 'processing':
        return <Loader2 className="size-8 animate-spin text-blue-500" />;
      case 'success':
        return <CheckCircle className="size-8 text-green-500" />;
      case 'error':
        return <AlertCircle className="size-8 text-red-500" />;
      default:
        return <FileText className="size-8 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    switch (uploadState.status) {
      case 'uploading':
        return 'Uploading PDF...';
      case 'processing':
        return 'Extracting and enhancing text with AI...';
      case 'success':
        return 'PDF processed successfully!';
      case 'error':
        return uploadState.error || 'Upload failed';
      default:
        return isDragActive ? 'Drop PDF here...' : 'Drop PDF here or click to browse';
    }
  };

  if (uploadState.status !== 'idle') {
    return (
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
        <div className="flex flex-col items-center space-y-4">
          {getStatusIcon()}
          
          <div className="text-center">
            <p className="text-sm font-medium text-gray-900">
              {uploadState.filename}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {getStatusText()}
            </p>
          </div>

          {(uploadState.status === 'uploading' || uploadState.status === 'processing') && (
            <div className="w-full max-w-xs">
              <Progress value={uploadState.progress} className="h-2" />
              <p className="text-xs text-center text-muted-foreground mt-1">
                {uploadState.progress}%
              </p>
            </div>
          )}

          {uploadState.status === 'error' && (
            <Button
              onClick={resetUpload}
              variant="outline"
              size="sm"
              className="mt-2"
            >
              Try Again
            </Button>
          )}

          {uploadState.status === 'success' && (
            <div className="text-xs text-center text-muted-foreground">
              Content will be added to context automatically
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950"
            : "border-gray-300 hover:border-gray-400",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center space-y-4">
                          <Upload className="size-12 text-muted-foreground" />
          
          <div>
            <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
              {getStatusText()}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              PDF files up to 10MB are supported
            </p>
          </div>

          <Button type="button" variant="outline" size="sm">
            Browse Files
          </Button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-1">
        <p>• AI will extract text content from your PDF</p>
        <p>• Content will be added to the selected category</p>
        <p>• Make sure to select category and hotels before uploading</p>
      </div>
    </div>
  );
} 