'use client';

import { memo } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './ui/card';
import { Badge } from './ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { cn } from '@/lib/utils';

interface FormattedMessageProps {
  content: string;
}

// Helper function to detect if content contains structured data
function detectContentType(
  content: string,
): 'restaurant' | 'spa' | 'pricing' | 'schedule' | 'facilities' | 'general' {
  const lowerContent = content.toLowerCase();

  if (
    lowerContent.includes('restaurant') ||
    lowerContent.includes('menu') ||
    lowerContent.includes('cuisine')
  ) {
    return 'restaurant';
  }
  if (
    lowerContent.includes('spa') ||
    lowerContent.includes('treatment') ||
    lowerContent.includes('massage')
  ) {
    return 'spa';
  }
  if (
    lowerContent.includes('price') ||
    lowerContent.includes('cost') ||
    lowerContent.includes('€') ||
    lowerContent.includes('$')
  ) {
    return 'pricing';
  }
  if (
    lowerContent.includes('schedule') ||
    lowerContent.includes('timing') ||
    lowerContent.includes('hours')
  ) {
    return 'schedule';
  }
  if (
    lowerContent.includes('facility') ||
    lowerContent.includes('amenity') ||
    lowerContent.includes('feature')
  ) {
    return 'facilities';
  }

  return 'general';
}

// Parse content into sections
function parseContent(content: string) {
  const lines = content.split('\n').filter((line) => line.trim());
  const sections: Array<{ title: string; items: string[] }> = [];
  let currentSection: { title: string; items: string[] } | null = null;

  lines.forEach((line) => {
    // Check if it's a header (starts with ## or ###)
    if (line.match(/^#{2,3}\s+/)) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        title: line.replace(/^#{2,3}\s+/, '').trim(),
        items: [],
      };
    } else if (currentSection && line.trim()) {
      // Remove bullet points and dashes
      const cleanLine = line.replace(/^[-*•]\s*/, '').trim();
      if (cleanLine) {
        currentSection.items.push(cleanLine);
      }
    }
  });

  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

// Extract pricing information
function extractPricing(text: string): Array<{ item: string; price: string }> {
  const pricePattern =
    /([^:]+):\s*([\d,]+\s*€|€\s*[\d,]+|\$\s*[\d,]+|[\d,]+\s*\$)/g;
  const matches = Array.from(text.matchAll(pricePattern));

  return matches.map((match) => ({
    item: match[1].trim(),
    price: match[2].trim(),
  }));
}

// Extract schedule/timing information
function extractSchedule(text: string): Array<{ day: string; hours: string }> {
  const schedulePattern =
    /(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Daily|Weekdays|Weekends)[:\s-]+([0-9:\s-]+(?:am|pm|AM|PM)?(?:\s*-\s*[0-9:\s]+(?:am|pm|AM|PM)?)?)/gi;
  const matches = Array.from(text.matchAll(schedulePattern));

  return matches.map((match) => ({
    day: match[1].trim(),
    hours: match[2].trim(),
  }));
}

function PureFormattedMessage({ content }: FormattedMessageProps) {
  const contentType = detectContentType(content);
  const sections = parseContent(content);

  // For pricing content, extract and format as table
  if (contentType === 'pricing') {
    const prices = extractPricing(content);
    if (prices.length > 0) {
      return (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Pricing Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">Service/Item</th>
                    <th className="text-right p-2">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((item, index) => (
                    <tr
                      key={`${item.item}-${index}`}
                      className="border-b hover:bg-muted/50"
                    >
                      <td className="p-2">{item.item}</td>
                      <td className="text-right p-2 font-semibold">
                        {item.price}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      );
    }
  }

  // For schedule content
  if (contentType === 'schedule') {
    const schedule = extractSchedule(content);
    if (schedule.length > 0) {
      return (
        <Card className="w-full">
          <CardHeader>
            <CardTitle>Operating Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {schedule.map((item, index) => (
                <div
                  key={index}
                  className="flex justify-between items-center p-2 rounded-lg bg-muted/30"
                >
                  <span className="font-medium">{item.day}</span>
                  <Badge variant="secondary">{item.hours}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      );
    }
  }

  // For restaurant content with multiple sections
  if (contentType === 'restaurant' && sections.length > 1) {
    return (
      <Tabs defaultValue="0" className="w-full">
        <TabsList
          className="grid w-full"
          style={{
            gridTemplateColumns: `repeat(${Math.min(sections.length, 4)}, 1fr)`,
          }}
        >
          {sections.slice(0, 4).map((section, index) => (
            <TabsTrigger key={index} value={index.toString()}>
              {section.title}
            </TabsTrigger>
          ))}
        </TabsList>
        {sections.map((section, index) => (
          <TabsContent key={index} value={index.toString()}>
            <Card>
              <CardHeader>
                <CardTitle>{section.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {section.items.map((item, itemIndex) => (
                    <li key={itemIndex} className="flex items-start">
                      <span className="text-primary mr-2">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    );
  }

  // For spa/wellness content
  if (contentType === 'spa' && sections.length > 0) {
    return (
      <div className="space-y-4">
        {sections.map((section, index) => (
          <Card key={index}>
            <CardHeader>
              <CardTitle className="text-lg">{section.title}</CardTitle>
              {section.title.toLowerCase().includes('spa') && (
                <CardDescription>
                  Relax and rejuvenate with our premium services
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {section.items.map((item, itemIndex) => (
                  <div
                    key={itemIndex}
                    className="p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // For facilities/amenities
  if (contentType === 'facilities' && sections.length > 0) {
    return (
      <div className="space-y-4">
        {sections.map((section, index) => (
          <Card key={index}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                {section.title}
                {section.items.length > 0 && (
                  <Badge variant="secondary">
                    {section.items.length} items
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {section.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-primary" />
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  // Default formatting for general content
  if (sections.length > 0) {
    return (
      <div className="space-y-4">
        {sections.map((section, index) => (
          <div key={index}>
            <h3 className="font-semibold text-lg mb-2">{section.title}</h3>
            <ul className="space-y-1 ml-4">
              {section.items.map((item, itemIndex) => (
                <li key={itemIndex} className="list-disc">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  // Fallback to original content if no structure detected
  return (
    <div className="prose dark:prose-invert max-w-none">
      {content.split('\n').map((line, index) => (
        <p
          key={index}
          className={cn('mb-2', {
            'font-semibold text-lg': line.startsWith('##'),
            'font-medium': line.startsWith('###'),
          })}
        >
          {line.replace(/^#{2,3}\s*/, '')}
        </p>
      ))}
    </div>
  );
}

export const FormattedMessage = memo(PureFormattedMessage);
