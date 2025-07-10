'use client';

import { useState, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from './ui/button';
import { SparklesIcon, CrossIcon } from './icons';
import type { UseChatHelpers } from '@ai-sdk/react';

interface SuggestionsPanelProps {
  chatId: string;
  append: UseChatHelpers['append'];
}

const hotelSuggestions = [
  // Restaurant & Dining
  {
    category: 'Dining',
    title: 'Restaurant Information',
    suggestions: [
      'What restaurants are available at Gloria Hotels?',
      'Show me the menu for the main restaurant',
      'What are the restaurant opening hours?',
      'Do you have vegetarian/vegan options?',
      'Can I book a table for dinner?',
      'What cuisines are available at the resort?',
    ],
  },
  // Spa & Wellness
  {
    category: 'Spa & Wellness',
    title: 'Spa Services',
    suggestions: [
      'Show me the spa services and treatment options',
      'What are the spa opening hours?',
      'How do I book a spa treatment?',
      'What wellness facilities are available?',
      'Do you have a sauna or steam room?',
      'What massage treatments do you offer?',
    ],
  },
  // Activities & Entertainment
  {
    category: 'Activities',
    title: 'Activities & Entertainment',
    suggestions: [
      'What activities are available for children?',
      'What water sports do you offer?',
      'Are there any evening entertainment shows?',
      'What fitness facilities are available?',
      'Do you have a kids club?',
      'What excursions can I book?',
    ],
  },
  // Transportation
  {
    category: 'Transportation',
    title: 'Transportation Services',
    suggestions: [
      'How do I book airport shuttle service?',
      'What are the shuttle timings?',
      'Is there a shuttle to nearby attractions?',
      'How much does the airport transfer cost?',
      'Do you provide car rental services?',
      'How far is the hotel from the airport?',
    ],
  },
  // Room & Facilities
  {
    category: 'Accommodation',
    title: 'Room & Hotel Facilities',
    suggestions: [
      'What room types are available?',
      'What amenities are included in my room?',
      'Do you have connecting rooms for families?',
      'Is there a minibar in the room?',
      'What is the WiFi password?',
      'Can I request a late checkout?',
    ],
  },
  // Policies & Information
  {
    category: 'Policies',
    title: 'Hotel Policies & Information',
    suggestions: [
      'What is your cancellation policy?',
      'What time is check-in and check-out?',
      'Do you allow pets?',
      'What payment methods do you accept?',
      'Is smoking allowed in the hotel?',
      'Do you have facilities for disabled guests?',
    ],
  },
];

function PureSuggestionsPanel({ chatId, append }: SuggestionsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSuggestionClick = (suggestion: string) => {
    window.history.replaceState({}, '', `/chat/${chatId}`);
    append({
      role: 'user',
      content: suggestion,
    });
    setIsOpen(false);
  };

  return (
    <>
      {/* Floating Button */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.3 }}
        className="fixed bottom-24 right-6 z-40"
      >
        <Button
          onClick={() => setIsOpen(!isOpen)}
          className="rounded-full p-3 shadow-lg bg-primary hover:bg-primary/90"
          title="Show all suggestions"
        >
          <SparklesIcon size={20} />
        </Button>
      </motion.div>

      {/* Suggestions Panel */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/50 z-40"
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 20 }}
              className="fixed right-0 top-0 h-full w-full sm:w-[480px] bg-background border-l shadow-xl z-50 overflow-hidden flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b">
                <div>
                  <h2 className="text-xl font-semibold">Suggested Questions</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Click any question to ask about Gloria Hotels
                  </p>
                </div>
                <Button
                  onClick={() => setIsOpen(false)}
                  variant="ghost"
                  size="icon"
                  className="rounded-full"
                >
                  <CrossIcon size={20} />
                </Button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="space-y-8">
                  {hotelSuggestions.map((category, categoryIndex) => (
                    <motion.div
                      key={category.category}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: categoryIndex * 0.1 }}
                    >
                      <h3 className="text-sm font-medium text-muted-foreground mb-3">
                        {category.title}
                      </h3>
                      <div className="grid gap-2">
                        {category.suggestions.map((suggestion, index) => (
                          <motion.div
                            key={`${category.category}-${index}`}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{
                              delay: categoryIndex * 0.1 + index * 0.02,
                            }}
                          >
                            <Button
                              variant="outline"
                              className="w-full justify-start text-left p-3 h-auto hover:bg-accent"
                              onClick={() => handleSuggestionClick(suggestion)}
                            >
                              <span className="text-sm">{suggestion}</span>
                            </Button>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export const SuggestionsPanel = memo(PureSuggestionsPanel);
