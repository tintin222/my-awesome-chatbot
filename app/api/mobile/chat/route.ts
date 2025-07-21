import { myProvider } from '@/lib/ai/providers';
import {
  getAllActiveGlobalContext,
  getChatById,
  saveChat,
  saveMessages,
  getUser,
  createUser,
} from '@/lib/db/queries';
import { type GlobalContext } from '@/lib/db/schema';
import { generateUUID } from '@/lib/utils';
import { generateText } from 'ai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createHash } from 'crypto';

export const maxDuration = 60;

// Helper function to convert mobile userId to UUID format
function mobileUserIdToUUID(mobileUserId: string): string {
  // Create a consistent hash from the mobile user ID
  const hash = createHash('md5').update(`mobile_${mobileUserId}`).digest('hex');
  // Format as UUID v4
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32)
  ].join('-');
}

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
  
  // Hotel places keywords (check this BEFORE local recommendation)
  if (lowerMessage.includes('spa') || lowerMessage.includes('pool') || 
      lowerMessage.includes('gym') || lowerMessage.includes('restaurant') ||
      lowerMessage.includes('bar') || lowerMessage.includes('cafe') ||
      lowerMessage.includes('lounge') || lowerMessage.includes('dining')) {
    return 'hotelPlaces';
  }
  
  // Local recommendation keywords (check this AFTER hotel places)
  if (lowerMessage.includes('recommend') || lowerMessage.includes('nearby') || 
      lowerMessage.includes('local') || lowerMessage.includes('outside') ||
      lowerMessage.includes('around') || lowerMessage.includes('near')) {
    return 'localRecommendation';
  }
  
  return 'text';
}

// Create fallback JSON response when AI doesn't return proper JSON
function createFallbackResponse(responseType: string, originalText: string) {
  const currentDate = new Date().toISOString().split('T')[0];
  const currentTime = new Date().toISOString().split('T')[1].split('.')[0];
  
  switch (responseType) {
    case 'reservation':
      return {
        type: "reservation",
        options: [
          {
            id: "spa-001",
            type: "spa",
            name: "Relaxing Spa Session",
            description: "A relaxing spa treatment session",
            availableSlots: [
              {
                time: "14:30",
                date: currentDate,
                available: true
              }
            ],
            price: {
              amount: 150.0,
              currency: "EUR"
            }
          }
        ],
        booking: {
          optionId: "spa-001",
          date: currentDate,
          time: "14:30",
          guestInfo: {
            name: "Guest",
            numberOfPeople: 1,
            roomNumber: "",
            phoneNumber: ""
          },
          status: "pending"
        }
      };
      
    case 'hotelRoom':
      return {
        type: "hotel_room",
        rooms: [
          {
            roomType: "Deluxe Sea View Room",
            price: "€200/night",
            amenities: ["Sea View", "Balcony", "King Bed", "Free WiFi"],
            imageUrl: "https://example.com/room-image.jpg",
            description: "Spacious room with beautiful sea view and modern amenities"
          }
        ]
      };
      
    case 'hotelPlaces':
      return {
        type: "hotel_places",
        places: [
          {
            name: "Spa & Wellness Center",
            category: "Wellness",
            description: "Relaxing spa treatments and wellness services",
            location: "Ground Floor",
            operatingHours: {
              monday: {"open": "09:00", "close": "20:00"},
              tuesday: {"open": "09:00", "close": "20:00"},
              wednesday: {"open": "09:00", "close": "20:00"},
              thursday: {"open": "09:00", "close": "20:00"},
              friday: {"open": "09:00", "close": "20:00"},
              saturday: {"open": "09:00", "close": "20:00"},
              sunday: {"open": "09:00", "close": "20:00"}
            },
            rules: ["Reservation required", "No children under 16"],
            amenities: ["Massage", "Sauna", "Steam Room"],
            imageUrl: "https://example.com/spa-image.jpg",
            reservationRequired: true,
            contactInfo: {
              phone: "+90 555 123 4567",
              email: "spa@gloriaserenity.com"
            },
            metadata: {
              capacity: 10,
              dressCode: "Comfortable",
              cuisine: "",
              priceRange: "€50-200",
              seasonalAvailability: "Year-round"
            }
          }
        ]
      };
      
    case 'activities':
      return {
        type: "activities",
        activities: [
          {
            id: "yoga-001",
            name: "Morning Yoga",
            category: "Wellness",
            description: "Start your day with relaxing yoga session",
            schedule: {
              startDate: currentDate,
              endDate: currentDate,
              startTime: "07:00",
              endTime: "08:00",
              recurrence: "daily",
              daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
            },
            location: {
              venue: "Garden Terrace",
              meetingPoint: "Main Lobby"
            },
            instructor: {
              name: "Yoga Instructor",
              specialization: "Hatha Yoga",
              languages: ["English", "Turkish"]
            },
            participation: {
              maxParticipants: 15,
              currentParticipants: 0,
              ageRestriction: {
                minimum: 16,
                maximum: 99
              },
              difficultyLevel: "Beginner",
              requiresReservation: false
            },
            pricing: {
              amount: 0.0,
              currency: "EUR",
              isComplimentary: true
            },
            equipment: {
              provided: ["Yoga Mats", "Cushions"],
              required: ["Comfortable Clothes"]
            },
            imageUrl: "https://example.com/yoga-image.jpg",
            weatherDependent: false,
            tags: ["Wellness", "Morning", "Free"],
            status: "active"
          }
        ],
        filters: {
          dates: [currentDate],
          categories: ["Wellness", "Entertainment"],
          ageGroups: ["Adults", "Seniors"],
          priceRanges: ["Free", "Paid"]
        }
      };
      
    case 'shuttle':
      return {
        type: "shuttle",
        services: [
          {
            routeName: "Airport Transfer",
            schedules: [
              {
                departureTime: `${currentDate}T${currentTime}`,
                pickupLocation: "Hotel Lobby",
                dropoffLocation: "Istanbul Airport",
                availableSeats: 8,
                duration: 45,
                isWheelchairAccessible: true
              }
            ],
            price: {
              amount: 50.0,
              currency: "EUR"
            },
            vehicleType: "Luxury Van",
            amenities: ["WiFi", "Air Conditioning", "Luggage Space"],
            notes: "Reservation required 24 hours in advance",
            reservationRequired: true
          }
        ]
      };
      
    case 'localRecommendation':
      return {
        type: "local_recommendation",
        places: [
          {
            placeName: "Local Restaurant",
            description: "Authentic local cuisine with beautiful views",
            distance: "5 minutes walk",
            rating: 4.5,
            imageUrl: "https://example.com/restaurant-image.jpg"
          }
        ]
      };
      
    case 'guestRequest':
      return {
        type: "guest_request",
        request: {
          category: "Maintenance",
          priority: "Medium",
          issue: {
            title: "Technical Issue",
            description: originalText,
            location: "Guest Room",
            reportedAt: new Date().toISOString()
          },
          guest: {
            name: "Guest",
            roomNumber: "",
            phoneNumber: "",
            email: "",
            preferredContactMethod: "Phone"
          },
          status: "pending",
          availableTimeSlots: [
            {
              date: currentDate,
              startTime: "09:00",
              endTime: "17:00"
            }
          ],
          attachments: []
        }
      };
      
    case 'email':
      return {
        type: "email",
        subject: "Hotel Inquiry",
        content: originalText,
        recipient: "guest@example.com"
      };
      
    default:
      return {
        type: "text",
        content: originalText
      };
  }
}

const postRequestBodySchema = z.object({
  chatId: z.string().uuid().describe('The UUID of the chat session. Generate a new one for each new conversation.'),
  userId: z.string().min(1).max(100).describe('The mobile app user ID (can be device ID, app-specific user ID, etc.)'),
  message: z.string().min(1).max(2000).describe('The user\'s message.'),
  selectedChatModel: z.enum([
    'chat-model',
    'chat-model-reasoning',
    'chat-model-fast',
    'gemini-2.5-pro-preview',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
  ]).optional().describe('The chat model to use for the response.'),
  responseType: z.enum([
    'email',
    'guestRequest', 
    'activities',
    'hotelPlaces',
    'hotelRoom',
    'localRecommendation',
    'reservation',
    'shuttle',
    'text'
  ]).optional().describe('The type of response format expected. If not provided, will be auto-detected from the message.'),
  debug: z.boolean().optional().describe('Enable debug mode to see intent detection details'),
});

// Base persona prompt for Gloria Serenity Resort
const PERSONA_PROMPT = `You are Oria, the AI assistant. You provide helpful, friendly, and accurate information about our hotel services, facilities, and local recommendations.

**Response Guidelines:**
*   Address guests directly and politely.
*   Answer concisely and focus on the specific question asked.
*   **Crucially: NEVER mention the context, documents, knowledge base, or how you obtained the information.** Simply provide the answer as if it's known hotel information.
*   **Avoid phrases like:** "Based on the document...", "According to the information I have...", "The context states...", "In the provided text...".
*   If the information needed to answer the question is NOT present in the provided context, politely respond with: "I apologize, but I don't have information about [specific topic] in my current resources. For the most accurate and up-to-date details about this, I recommend contacting the hotel directly."
*   Do not invent information or answer questions outside the scope of the provided context.
*   Maintain a friendly and professional tone.

---
Provided Context & Instructions:
`;

// Response type specific prompts
const RESPONSE_PROMPTS = {
  email: `CRITICAL: You MUST return ONLY a valid JSON object. No additional text, no markdown, no explanations.

You are a helpful assistant specialized in writing emails. 
Return ONLY a JSON object in this exact format:
{
  "type": "email",
  "subject": "Email subject",
  "content": "Email body content",
  "recipient": "recipient@example.com"
}

IMPORTANT: Start your response with { and end with }. Do not include any other text.`,

  guestRequest: `CRITICAL: You MUST return ONLY a valid JSON object. No additional text, no markdown, no explanations.

You are a guest service assistant for Gloria Serenity Resort.
Return ONLY a JSON object in this exact format:
{
  "type": "guest_request",
  "request": {
    "category": "string",
    "priority": "string",
    "issue": {
      "title": "string",
      "description": "string", 
      "location": "string",
      "reportedAt": "2024-03-21T14:30:00Z"
    },
    "guest": {
      "name": "string",
      "roomNumber": "string",
      "phoneNumber": "string",
      "email": "string",
      "preferredContactMethod": "string"
    },
    "status": "pending",
    "availableTimeSlots": [
      {
        "date": "2024-03-21",
        "startTime": "14:30",
        "endTime": "16:30"
      }
    ],
    "attachments": [
      {
        "type": "image",
        "url": "string"
      }
    ]
  }
}

IMPORTANT: Start your response with { and end with }. Do not include any other text.`,

  activities: `You are an activities and events coordinator assistant for Gloria Serenity Resort.
Return ONLY a JSON object without any additional text or markdown formatting.
Format:
{
  "type": "activities",
  "activities": [
    {
      "id": "string",
      "name": "string",
      "category": "string",
      "description": "string",
      "schedule": {
        "startDate": "2024-03-21",
        "endDate": "2024-03-21",
        "startTime": "14:30",
        "endTime": "16:30",
        "recurrence": "string",
        "daysOfWeek": ["monday", "wednesday", "friday"]
      },
      "location": {
        "venue": "string",
        "meetingPoint": "string"
      },
      "instructor": {
        "name": "string",
        "specialization": "string",
        "languages": ["string"]
      },
      "participation": {
        "maxParticipants": 20,
        "currentParticipants": 0,
        "ageRestriction": {
          "minimum": 0,
          "maximum": 99
        },
        "difficultyLevel": "string",
        "requiresReservation": true
      },
      "pricing": {
        "amount": 0.0,
        "currency": "string",
        "isComplimentary": true
      },
      "equipment": {
        "provided": ["string"],
        "required": ["string"]
      },
      "imageUrl": "string",
      "weatherDependent": false,
      "tags": ["string"],
      "status": "string"
    }
  ],
  "filters": {
    "dates": ["2024-03-21"],
    "categories": ["string"],
    "ageGroups": ["string"],
    "priceRanges": ["string"]
  }
}`,

  hotelPlaces: `You are a hotel information assistant for Gloria Serenity Resort.
Return ONLY a JSON object without any additional text or markdown formatting.
Format:
{
  "type": "hotel_places",
  "places": [
    {
      "name": "string",
      "category": "string",
      "description": "string",
      "location": "string",
      "operatingHours": {
        "monday": {"open": "09:00", "close": "22:00"},
        "tuesday": {"open": "09:00", "close": "22:00"},
        "wednesday": {"open": "09:00", "close": "22:00"},
        "thursday": {"open": "09:00", "close": "22:00"},
        "friday": {"open": "09:00", "close": "22:00"},
        "saturday": {"open": "09:00", "close": "22:00"},
        "sunday": {"open": "09:00", "close": "22:00"}
      },
      "rules": ["string"],
      "amenities": ["string"],
      "imageUrl": "string",
      "reservationRequired": false,
      "contactInfo": {
        "phone": "string",
        "email": "string"
      },
      "metadata": {
        "capacity": 0,
        "dressCode": "string",
        "cuisine": "string",
        "priceRange": "string",
        "seasonalAvailability": "string"
      }
    }
  ]
}`,

  hotelRoom: `CRITICAL: You MUST return ONLY a valid JSON object. No additional text, no markdown, no explanations.

You are a hotel concierge assistant for Gloria Serenity Resort. 
Return ONLY a JSON object in this exact format:
{
  "type": "hotel_room",
  "rooms": [
    {
      "roomType": "Room name with category",
      "price": "Price in EUR or USD with currency symbol",
      "amenities": ["amenity1", "amenity2"],
      "imageUrl": "Find and use hotel room image url",
      "description": "Detailed room description"
    }
  ]
}

IMPORTANT: Start your response with { and end with }. Do not include any other text.`,

  localRecommendation: `You are a local guide assistant for Gloria Serenity Resort. 
Return ONLY a JSON object without any additional text or markdown formatting.
Format:
{
  "type": "local_recommendation",
  "places": [
    {
      "placeName": "Name of the place",
      "description": "Detailed description",
      "distance": "Distance from Gloria Serenity Resort",
      "rating": 4.5,
      "imageUrl": "Find and use local place image url"
    }
  ]
}`,

  reservation: `CRITICAL: You MUST return ONLY a valid JSON object. No additional text, no markdown, no explanations.

You are a reservation assistant for Gloria Serenity Resort.
Return ONLY a JSON object in this exact format:
{
  "type": "reservation",
  "options": [
    {
      "id": "string",
      "type": "string",
      "name": "string",
      "description": "string",
      "availableSlots": [
        {
          "time": "14:30",
          "date": "2024-03-21",
          "available": true
        }
      ],
      "price": {
        "amount": 0.0,
        "currency": "EUR"
      }
    }
  ],
  "booking": {
    "optionId": "string",
    "date": "2024-03-21",
    "time": "14:30",
    "guestInfo": {
      "name": "string",
      "numberOfPeople": 2,
      "roomNumber": "string",
      "phoneNumber": "string"
    },
    "status": "pending"
  }
}

IMPORTANT: Start your response with { and end with }. Do not include any other text.`,

  shuttle: `You are a shuttle service assistant for Gloria Serenity Resort.
Return ONLY a JSON object without any additional text or markdown formatting.
Format:
{
  "type": "shuttle",
  "services": [
    {
      "routeName": "string",
      "schedules": [
        {
          "departureTime": "2024-03-21T14:30:00Z",
          "pickupLocation": "string",
          "dropoffLocation": "string",
          "availableSeats": 8,
          "duration": 30,
          "isWheelchairAccessible": true
        }
      ],
      "price": {
        "amount": 0.0,
        "currency": "EUR"
      },
      "vehicleType": "string",
      "amenities": ["WiFi", "Air Conditioning"],
      "notes": "string",
      "reservationRequired": true
    }
  ]
}`,

  text: `CRITICAL: You MUST return ONLY a valid JSON object. No additional text, no markdown, no explanations.

You are Oria, the AI assistant for Gloria Serenity Resort. 
Return ONLY a JSON object in this exact format:
{
  "type": "text",
  "content": "Your response message here"
}

IMPORTANT: Start your response with { and end with }. Do not include any other text.`
};

// Intent detection prompt
const INTENT_DETECTION_PROMPT = `You are an intent classifier for a hotel AI assistant. Analyze the user message and classify it into one of the following categories.

**Available Intents:**
- "hotelRoom" - Questions about hotel rooms, availability, booking rooms
- "reservation" - Making reservations for any service (spa, restaurant, activities, etc.)
- "hotelPlaces" - Information about hotel facilities, amenities, operating hours (restaurants, spa, pool, gym, bar, cafe, lounge)
- "activities" - Questions about hotel activities, events, entertainment programs
- "shuttle" - Shuttle services, schedules, transportation
- "localRecommendation" - Recommendations for local places, restaurants, attractions OUTSIDE the hotel
- "guestRequest" - Maintenance requests, housekeeping, room service, technical support
- "email" - Email-related topics
- "text" - General conversation or unclear intent

**Classification Rules:**
1. If user wants to BOOK/RESERVE something → "reservation"
2. If user asks about hotel facilities (restaurants, spa, pool, etc.) → "hotelPlaces"
3. If user asks about local places OUTSIDE the hotel → "localRecommendation"
4. If user wants INFORMATION about something → use appropriate info category
5. If intent is unclear → "text"

**Examples:**
- "Show me available rooms" → "hotelRoom"
- "I want to book a spa session" → "reservation"
- "What are the spa opening hours?" → "hotelPlaces"
- "Which restaurants are in the hotel?" → "hotelPlaces"
- "Can I book a table?" → "reservation"
- "Recommend restaurants nearby" → "localRecommendation"
- "What restaurants are around the hotel?" → "localRecommendation"
- "When is the next shuttle?" → "shuttle"
- "I need help with my TV" → "guestRequest"

**Important:** If the user asks about restaurants, cafes, bars, or dining options, classify as "hotelPlaces" unless they specifically mention "nearby", "around", "outside", or "local" which indicates they want recommendations for places outside the hotel.

Return ONLY a JSON object in this exact format:
{
  "language_code": "en",
  "intent": "hotelRoom",
  "date": "2024-03-21T14:30:00Z",
  "confidence": 0.95
}`;

// Map intent to response type
const INTENT_TO_RESPONSE_TYPE = {
  'email': 'email',
  'hotelRoom': 'hotelRoom',
  'reservation': 'reservation',
  'localRecommendation': 'localRecommendation',
  'shuttle': 'shuttle',
  'hotelPlaces': 'hotelPlaces',
  'activities': 'activities',
  'guestRequest': 'guestRequest',
  'text': 'text'
};

// Map common incorrect intents to correct ones
const INTENT_CORRECTION_MAP = {
  'hotel_service': 'hotelPlaces',
  'hotel_services': 'hotelPlaces',
  'hotel_facilities': 'hotelPlaces',
  'hotel_amenities': 'hotelPlaces',
  'restaurant_info': 'hotelPlaces',
  'dining_info': 'hotelPlaces',
  'spa_info': 'hotelPlaces',
  'pool_info': 'hotelPlaces',
  'gym_info': 'hotelPlaces',
  'local_restaurant': 'localRecommendation',
  'nearby_restaurant': 'localRecommendation',
  'external_restaurant': 'localRecommendation'
};

export async function POST(request: Request) {
  console.log('[POST /api/mobile/chat] Received request');
  let requestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
    console.log(
      '[POST /api/mobile/chat] Parsed request body for chat:',
      requestBody.chatId,
      'user:',
      requestBody.userId,
      'responseType:',
      requestBody.responseType,
    );
  } catch (error) {
    console.error('[POST /api/mobile/chat] Invalid request body:', error);
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }

  try {
    const { chatId, userId, message, selectedChatModel, responseType, debug } = requestBody;
    const modelToUse = selectedChatModel || 'gemini-1.5-pro';

    // Auto-detect response type if not provided
    let detectedResponseType = responseType;
    if (!responseType) {
      console.log('[POST /api/mobile/chat] Auto-detecting response type from message:', message);
      
      try {
        const intentDetectionModel = myProvider.languageModel('gemini-1.5-flash');
        const { text: intentResult } = await generateText(
        
        {
          model: intentDetectionModel,
          system: INTENT_DETECTION_PROMPT,
          messages: [{ role: 'user', content: message }],
        });

        console.log('[POST /api/mobile/chat] Raw intent detection result:', intentResult);

        // Clean the response - remove any markdown formatting
        const cleanedResult = intentResult.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        const intentData = JSON.parse(cleanedResult);
        
        // Validate the response structure
        if (!intentData.intent || !intentData.confidence) {
          throw new Error('Invalid intent detection response structure');
        }
        
        let detectedIntent = intentData.intent as keyof typeof INTENT_TO_RESPONSE_TYPE;
        
        // Check if the detected intent needs correction
        if (INTENT_CORRECTION_MAP[detectedIntent as keyof typeof INTENT_CORRECTION_MAP]) {
          const correctedIntent = INTENT_CORRECTION_MAP[detectedIntent as keyof typeof INTENT_CORRECTION_MAP];
          console.log(`[POST /api/mobile/chat] Correcting intent from ${detectedIntent} to ${correctedIntent}`);
          detectedIntent = correctedIntent as keyof typeof INTENT_TO_RESPONSE_TYPE;
        }
        
        // Check if the detected intent is valid, if not use keyword fallback
        if (!INTENT_TO_RESPONSE_TYPE[detectedIntent]) {
          console.log(`[POST /api/mobile/chat] Invalid intent detected: ${detectedIntent}, using keyword fallback`);
          const keywordIntent = detectIntentFromKeywords(message);
          detectedResponseType = (INTENT_TO_RESPONSE_TYPE[keywordIntent as keyof typeof INTENT_TO_RESPONSE_TYPE] as typeof detectedResponseType) || 'text';
        } else if (intentData.confidence >= 0.7) {
          detectedResponseType = (INTENT_TO_RESPONSE_TYPE[detectedIntent] as typeof detectedResponseType) || 'text';
        } else {
          console.log(`[POST /api/mobile/chat] Low confidence (${intentData.confidence}), using text response type`);
          detectedResponseType = 'text';
        }
        
        // Final validation - ensure we only use valid response types
        const validResponseTypes = ['email', 'guestRequest', 'activities', 'hotelPlaces', 'hotelRoom', 'localRecommendation', 'reservation', 'shuttle', 'text'];
        if (!validResponseTypes.includes(detectedResponseType)) {
          console.log(`[POST /api/mobile/chat] Invalid response type detected: ${detectedResponseType}, defaulting to text`);
          detectedResponseType = 'text';
        }
        
        console.log(`[POST /api/mobile/chat] Detected intent: ${intentData.intent}, confidence: ${intentData.confidence}, using response type: ${detectedResponseType}`);
      } catch (error) {
        console.error('[POST /api/mobile/chat] Failed to detect intent with AI, using keyword fallback:', error);
        
        // Use keyword-based fallback
        const keywordIntent = detectIntentFromKeywords(message);
        detectedResponseType = (INTENT_TO_RESPONSE_TYPE[keywordIntent as keyof typeof INTENT_TO_RESPONSE_TYPE] as typeof detectedResponseType) || 'text';
        
        console.log(`[POST /api/mobile/chat] Keyword fallback detected intent: ${keywordIntent}, using response type: ${detectedResponseType}`);
      }
    }

    // Convert mobile userId to a consistent UUID format
    const mobileUserUUID = mobileUserIdToUUID(userId);
    console.log(`[POST /api/mobile/chat] Mobile user ${userId} converted to UUID: ${mobileUserUUID}`);

    // Ensure the mobile user exists in the User table
    const mobileUserEmail = `mobile_${userId}@app.local`;
    let existingUsers = await getUser(mobileUserEmail);
    let actualUserId: string;
    
    if (existingUsers.length === 0) {
      console.log(`[POST /api/mobile/chat] Creating new mobile user: ${mobileUserEmail}`);
      try {
        await createUser(mobileUserEmail, 'mobile_user_password');
        console.log(`[POST /api/mobile/chat] Mobile user created successfully`);
        // Get the newly created user to find their actual ID
        existingUsers = await getUser(mobileUserEmail);
        if (existingUsers.length === 0) {
          return NextResponse.json(
            { error: 'Failed to create mobile user' },
            { status: 500 },
          );
        }
        actualUserId = existingUsers[0].id;
      } catch (error) {
        console.error(`[POST /api/mobile/chat] Failed to create mobile user:`, error);
        // If user creation fails, it might already exist due to race condition
        existingUsers = await getUser(mobileUserEmail);
        if (existingUsers.length === 0) {
          return NextResponse.json(
            { error: 'Failed to create or find mobile user' },
            { status: 500 },
          );
        }
        actualUserId = existingUsers[0].id;
      }
    } else {
      actualUserId = existingUsers[0].id;
      console.log(`[POST /api/mobile/chat] Using existing mobile user ID: ${actualUserId}`);
    }

    // Check if chat exists, if not create it
    let savedChat = await getChatById({ id: chatId });
    if (!savedChat) {
      console.log(
        `[POST /api/mobile/chat] Chat ${chatId} not found, creating new one for mobile user: ${userId}`,
      );
      
      await saveChat({ 
        id: chatId, 
        userId: actualUserId, 
        title: `Mobile Chat - ${new Date().toLocaleDateString()}` 
      });
      savedChat = await getChatById({ id: chatId });
    }

    if (!savedChat) {
      return NextResponse.json(
        { error: 'Failed to create or find chat' },
        { status: 500 },
      );
    }
    
    // Verify that this chat belongs to this mobile user
    if (savedChat.userId !== actualUserId) {
        console.log(`[POST /api/mobile/chat] Chat ownership mismatch. Expected: ${actualUserId}, Found: ${savedChat.userId}`);
        return NextResponse.json({ error: 'Chat does not belong to this user' }, { status: 403 });
    }

    // Prepare messages array with just the current message for simplicity
    // In production, you might want to include chat history
    const messages = [{ role: 'user' as const, content: message }];

    // --- Start: Fetch and Process Context ---
    const chatBehaviorPrompt = savedChat?.systemPrompt || '';

    const allActiveContextItems = await getAllActiveGlobalContext();
    console.log(
      `[POST /api/mobile/chat] Fetched ${allActiveContextItems.length} active global context items.`,
    );

    let targetHotel: string | null = null;
    const lowerCaseMessage = message.toLowerCase();
    if (lowerCaseMessage.includes('serenity')) {
      targetHotel = 'serenity';
    } else if (lowerCaseMessage.includes('golf')) {
      targetHotel = 'golf';
    } else if (lowerCaseMessage.includes('verde')) {
      targetHotel = 'verde';
    }

    let filteredContextItems: GlobalContext[] = [];
    if (targetHotel) {
      filteredContextItems = allActiveContextItems.filter((item) =>
        item.associatedHotels?.includes(targetHotel),
      );
    } else {
      filteredContextItems = allActiveContextItems.filter((item) =>
        item.associatedHotels?.includes('all'),
      );
    }

    let formattedContext = '';
    const groupedContext: Record<string, string[]> = {};

    filteredContextItems.forEach((item) => {
      if (!groupedContext[item.category]) {
        groupedContext[item.category] = [];
      }
      groupedContext[item.category].push(item.content);
    });
    
    if (targetHotel && Object.keys(groupedContext).length > 0) {
      const hotelName = targetHotel.charAt(0).toUpperCase() + targetHotel.slice(1);
      formattedContext += `Context Specifically for Gloria ${hotelName}:\n`;
    } else if (Object.keys(groupedContext).length > 0) {
      formattedContext += `General Context (Applies to All Hotels):\n`;
    }

    for (const category in groupedContext) {
      formattedContext += `\n## ${category}\n`;
      groupedContext[category].forEach((content) => {
        formattedContext += `${content}\n`;
      });
    }

    // --- End: Fetch and Process Context ---

    // Build the system prompt based on response type
    let finalSystemPrompt = PERSONA_PROMPT;

    if (formattedContext.trim() !== '') {
      finalSystemPrompt += `${formattedContext.trim()}\n\n---\n\n`;
    }

    if (chatBehaviorPrompt.trim() !== '') {
      finalSystemPrompt += `Chat Behavior Instructions:\n${chatBehaviorPrompt.trim()}\n\n---\n\n`;
    }

    // Add response type specific prompt
    if (detectedResponseType && detectedResponseType !== 'text') {
      finalSystemPrompt += RESPONSE_PROMPTS[detectedResponseType];
      finalSystemPrompt += `\n\nCRITICAL INSTRUCTIONS:\n- You MUST return ONLY valid JSON\n- No explanations, no markdown, no extra text\n- Start with { and end with }\n- If you cannot provide the requested information, return a JSON with an error message in the content field\n- NEVER add any text before or after the JSON object\n- The "type" field in your JSON MUST be one of: "email", "guest_request", "activities", "hotel_places", "hotel_room", "local_recommendation", "reservation", "shuttle", "text"`;
    } else {
      finalSystemPrompt += RESPONSE_PROMPTS.text;
    }
    
    const model = myProvider.languageModel(modelToUse);

    console.log(
      `[POST /api/mobile/chat] Calling AI model ${modelToUse} with response type: ${detectedResponseType}. System Prompt length: ${finalSystemPrompt.length}`,
    );

    const { text } = await generateText({
        model,
        system: finalSystemPrompt,
        messages: messages,
    });
    
    console.log('[POST /api/mobile/chat] Raw AI response:', text);
    
    // Save user and assistant messages to the database
    const userMessageId = generateUUID();
    const assistantMessageId = generateUUID();

    await saveMessages({
        messages: [
            {
                id: userMessageId,
                chatId: chatId,
                role: 'user',
                parts: [{ type: 'text', text: message }],
                attachments: [],
                createdAt: new Date(),
            },
            {
                id: assistantMessageId,
                chatId: chatId,
                role: 'assistant',
                parts: [{ type: 'text', text }],
                attachments: [],
                createdAt: new Date(),
            }
        ]
    });

    console.log(
      `[POST /api/mobile/chat] Successfully processed message for mobile user ${userId}, chat ${chatId}`,
    );

    // Parse the response if it's JSON format
    let parsedResponse;
    let isJsonResponse = false;
    
    if (detectedResponseType && detectedResponseType !== 'text') {
      try {
        let cleanedText = text.trim();
        // Remove all code block markers at the start and end (even with extra newlines)
        while (/^```(json)?\s*\n?/i.test(cleanedText)) {
          cleanedText = cleanedText.replace(/^```(json)?\s*\n?/i, '').trim();
        }
        while (/```\s*$/i.test(cleanedText)) {
          cleanedText = cleanedText.replace(/```\s*$/i, '').trim();
        }
        // Remove any remaining code block markers inside
        cleanedText = cleanedText.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
        // Try to extract JSON from the response if it's wrapped in other text
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanedText = jsonMatch[0];
        }
        parsedResponse = JSON.parse(cleanedText);
        const validTypes = ['email', 'guest_request', 'activities', 'hotel_places', 'hotel_room', 'local_recommendation', 'reservation', 'shuttle', 'text'];
        const RESPONSE_TYPE_TO_TYPE_FIELD = {
          email: 'email',
          guestRequest: 'guest_request',
          activities: 'activities',
          hotelPlaces: 'hotel_places',
          hotelRoom: 'hotel_room',
          localRecommendation: 'local_recommendation',
          reservation: 'reservation',
          shuttle: 'shuttle',
          text: 'text',
        };
        const expectedType = RESPONSE_TYPE_TO_TYPE_FIELD[detectedResponseType];
        // Validate that the parsed response has the correct type
        if (parsedResponse.type !== expectedType) {
          console.warn(`[POST /api/mobile/chat] Mismatched type in JSON response: expected ${expectedType}, got ${parsedResponse.type}. Forcing responseType to 'text' and creating fallback.`);
          detectedResponseType = 'text';
          parsedResponse = {
            type: 'text',
            content: typeof text === 'string' ? text : JSON.stringify(text)
          };
        }
        // Ek kontrol: Sadece 'content' alanı varsa ve başka beklenen alanlar yoksa, yine text'e çevir
        if (
          parsedResponse.type === expectedType &&
          Object.keys(parsedResponse).length === 2 &&
          typeof parsedResponse.content === 'string'
        ) {
          console.warn(`[POST /api/mobile/chat] Only 'content' field present for type ${expectedType}. Forcing responseType to 'text' and creating fallback.`);
          detectedResponseType = 'text';
          parsedResponse = {
            type: 'text',
            content: parsedResponse.content
          };
        }
        if (parsedResponse.type && !validTypes.includes(parsedResponse.type)) {
          console.warn(`[POST /api/mobile/chat] Invalid type in JSON response: ${parsedResponse.type}, creating fallback`);
          parsedResponse = createFallbackResponse(detectedResponseType, text);
        }
        isJsonResponse = true;
        console.log('[POST /api/mobile/chat] Successfully parsed JSON response');
      } catch (error) {
        console.warn('[POST /api/mobile/chat] Failed to parse JSON response:', error);
        console.warn('[POST /api/mobile/chat] Raw response was:', text);
        // Create a fallback JSON response based on the detected type
        console.log('[POST /api/mobile/chat] Creating fallback JSON response for type:', detectedResponseType);
        // Fallback: content'e temizlenmiş düz metni koy
        let fallbackContent = text.trim();
        while (/^```(json)?\s*\n?/i.test(fallbackContent)) {
          fallbackContent = fallbackContent.replace(/^```(json)?\s*\n?/i, '').trim();
        }
        while (/```\s*$/i.test(fallbackContent)) {
          fallbackContent = fallbackContent.replace(/```\s*$/i, '').trim();
        }
        fallbackContent = fallbackContent.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
        parsedResponse = {
          type: 'text',
          content: fallbackContent
        };
        detectedResponseType = 'text';
        isJsonResponse = true;
      }
    } else {
      // For text type, try to parse as JSON first, then fallback to simple text
      try {
        let cleanedText = text.trim();
        // Remove all code block markers at the start and end (even with extra newlines)
        while (/^```(json)?\s*\n?/i.test(cleanedText)) {
          cleanedText = cleanedText.replace(/^```(json)?\s*\n?/i, '').trim();
        }
        while (/```\s*$/i.test(cleanedText)) {
          cleanedText = cleanedText.replace(/```\s*$/i, '').trim();
        }
        // Remove any remaining code block markers inside
        cleanedText = cleanedText.replace(/```json\n?/gi, '').replace(/```\n?/g, '').trim();
        
        // Try to extract JSON from the response if it's wrapped in other text
        const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          cleanedText = jsonMatch[0];
        }
        
        console.log('[POST /api/mobile/chat] Attempting to parse JSON for text type:', cleanedText);
        
        parsedResponse = JSON.parse(cleanedText);
        
        // Validate that the parsed response has the correct type
        if (parsedResponse.type !== 'text') {
          console.warn(`[POST /api/mobile/chat] Invalid type in text response: ${parsedResponse.type}, creating fallback`);
          parsedResponse = {
            type: "text",
            content: text
          };
        }
        
        isJsonResponse = true;
        console.log('[POST /api/mobile/chat] Successfully parsed JSON response for text type');
      } catch (error) {
        console.warn('[POST /api/mobile/chat] Failed to parse JSON for text type, creating fallback:', error);
        console.warn('[POST /api/mobile/chat] Raw response was:', text);
        
        // Create a fallback JSON response for text type
        parsedResponse = {
          type: "text",
          content: text
        };
        isJsonResponse = true;
        console.log('[POST /api/mobile/chat] Created fallback JSON response for text type');
      }
    }

    const responseData: any = { 
      response: isJsonResponse ? parsedResponse : text,
      chatId: chatId,
      timestamp: new Date().toISOString(),
      responseType: detectedResponseType,
      isJson: isJsonResponse
    };

    // Add debug information if requested
    if (debug) {
      responseData.debug = {
        originalMessage: message,
        detectedResponseType: detectedResponseType,
        modelUsed: modelToUse,
        contextItemsCount: allActiveContextItems.length,
        keywordFallbackIntent: detectIntentFromKeywords(message),
        availableResponseTypes: Object.keys(INTENT_TO_RESPONSE_TYPE),
        intentCorrectionMap: INTENT_CORRECTION_MAP,
        rawAIResponse: text,
        isJsonResponse: isJsonResponse
      };
    }

    return NextResponse.json(responseData);

  } catch (error) {
    console.error('[POST /api/mobile/chat] Critical error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 },
    );
  }
} 