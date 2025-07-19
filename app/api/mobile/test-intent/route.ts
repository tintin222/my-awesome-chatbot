import { NextResponse } from 'next/server';
import { z } from 'zod';

// Simple keyword-based intent detection as fallback
function detectIntentFromKeywords(message: string): string {
  const lowerMessage = message.toLowerCase();
  
  // Reservation keywords
  if (lowerMessage.includes('book') || lowerMessage.includes('reserve') || 
      lowerMessage.includes('rezervasyon') || lowerMessage.includes('rezervasyonu')) {
    return 'reservation';
  }
  
  // Hotel room keywords
  if (lowerMessage.includes('room') || lowerMessage.includes('oda') || 
      lowerMessage.includes('hotel room') || lowerMessage.includes('available rooms')) {
    return 'hotelRoom';
  }
  
  // Activities keywords
  if (lowerMessage.includes('activity') || lowerMessage.includes('aktivit') || 
      lowerMessage.includes('event') || lowerMessage.includes('etkinlik')) {
    return 'activities';
  }
  
  // Shuttle keywords
  if (lowerMessage.includes('shuttle') || lowerMessage.includes('transfer') || 
      lowerMessage.includes('airport') || lowerMessage.includes('havaalanı')) {
    return 'shuttle';
  }
  
  // Guest request keywords
  if (lowerMessage.includes('help') || lowerMessage.includes('problem') || 
      lowerMessage.includes('fix') || lowerMessage.includes('maintenance')) {
    return 'guestRequest';
  }
  
  // Local recommendation keywords
  if (lowerMessage.includes('recommend') || lowerMessage.includes('nearby') || 
      lowerMessage.includes('restaurant') || lowerMessage.includes('local')) {
    return 'localRecommendation';
  }
  
  // Hotel places keywords
  if (lowerMessage.includes('spa') || lowerMessage.includes('restaurant') || 
      lowerMessage.includes('pool') || lowerMessage.includes('gym')) {
    return 'hotelPlaces';
  }
  
  return 'text';
}

const testSchema = z.object({
  message: z.string().min(1).max(2000),
});

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const { message } = testSchema.parse(json);
    
    const keywordIntent = detectIntentFromKeywords(message);
    
    return NextResponse.json({
      message,
      keywordIntent,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
} 