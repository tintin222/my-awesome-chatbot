import { z } from 'zod';
import { myProvider } from '../providers';
import { contextAnalysisPrompt } from '../prompts';
import { getAllActiveGlobalContext } from '@/lib/db/queries';
import { streamText } from 'ai';

const contextAnalysisSchema = z.object({
  relevantCategories: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});

export async function analyzeContextRelevance(userMessage: string) {
  try {
    console.log(`[Context Analysis] Analyzing message: "${userMessage}"`);
    
    // Get all available categories from the database
    const allContextItems = await getAllActiveGlobalContext();
    const availableCategories = [...new Set(allContextItems.map(item => item.category))];
    
    console.log(`[Context Analysis] Available categories: ${availableCategories.join(', ')}`);
    
    // Create the analysis prompt with available categories
    const analysisPrompt = `${contextAnalysisPrompt}

**Available Context Categories:**
${availableCategories.map(cat => `- ${cat}`).join('\n')}

**User Message:** "${userMessage}"

Analyze the above user message and return a JSON response with the relevant categories.`;

    console.log(`[Context Analysis] Sending prompt to AI for analysis...`);

    // Call AI to analyze the message
    const { fullStream } = await streamText({
      model: myProvider.languageModel('gemini-2.0-flash'),
      prompt: analysisPrompt,
      maxTokens: 500,
      temperature: 0.1, // Low temperature for consistent analysis
    });

    // Extract text from the result
    let responseText = '';
    for await (const delta of fullStream) {
      const { type } = delta;
      
      if (type === 'text-delta') {
        const { textDelta } = delta;
        responseText += textDelta;
      }
    }
    
    responseText = responseText.trim();
    console.log(`[Context Analysis] AI response: "${responseText}"`);
    
    // Try to extract JSON from the response
    let jsonMatch = responseText.match(/\[.*\]/);
    if (!jsonMatch) {
      // Fallback: try to find any array-like structure
      jsonMatch = responseText.match(/\[[^\]]*\]/);
    }

    if (jsonMatch) {
      try {
        const relevantCategories = JSON.parse(jsonMatch[0]);
        console.log(`[Context Analysis] Parsed categories: ${relevantCategories.join(', ')}`);
        
        // Validate that all categories exist in our database
        const validCategories = relevantCategories.filter((cat: string) => 
          availableCategories.includes(cat)
        );

        console.log(`[Context Analysis] Valid categories: ${validCategories.join(', ')}`);

        return {
          relevantCategories: validCategories,
          confidence: 0.8, // Default confidence
          reasoning: `AI analysis selected categories: ${validCategories.join(', ')}`,
        };
      } catch (parseError) {
        console.error('[Context Analysis] Failed to parse AI response:', parseError);
      }
    }

    // Fallback: use keyword-based analysis
    console.log(`[Context Analysis] Using fallback keyword analysis`);
    return fallbackContextAnalysis(userMessage, availableCategories);
    
  } catch (error) {
    console.error('[Context Analysis] Analysis failed:', error);
    return {
      relevantCategories: [],
      confidence: 0.5,
      reasoning: 'Analysis failed, using fallback method',
    };
  }
}

// Fallback keyword-based analysis
function fallbackContextAnalysis(userMessage: string, availableCategories: string[]): {
  relevantCategories: string[];
  confidence: number;
  reasoning: string;
} {
  const lowerMessage = userMessage.toLowerCase();
  const relevantCategories: string[] = [];
  
  // Keyword mapping
  const keywordMap: Record<string, string[]> = {
    'restaurant': ['Restaurant Information/Menu'],
    'menu': ['Restaurant Information/Menu'],
    'food': ['Restaurant Information/Menu'],
    'dining': ['Restaurant Information/Menu'],
    'eat': ['Restaurant Information/Menu'],
    'shuttle': ['Shuttle services'],
    'transport': ['Shuttle services'],
    'airport': ['Shuttle services'],
    'transfer': ['Shuttle services'],
    'event': ['Events Information'],
    'activity': ['Events Information'],
    'happening': ['Events Information'],
    'faq': ['FaQ'],
    'question': ['FaQ'],
    'help': ['FaQ', 'General Catalog'],
    'service': ['Hotel services and service prices'],
    'price': ['Hotel services and service prices'],
    'cost': ['Hotel services and service prices'],
    'amenity': ['Hotel services and service prices', 'General Catalog'],
    'facility': ['Hotel services and service prices', 'General Catalog'],
    'wifi': ['FaQ', 'General Catalog'],
    'internet': ['FaQ', 'General Catalog'],
    'password': ['FaQ', 'General Catalog'],
  };

  // Check for keywords
  for (const [keyword, categories] of Object.entries(keywordMap)) {
    if (lowerMessage.includes(keyword)) {
      categories.forEach(cat => {
        if (availableCategories.includes(cat) && !relevantCategories.includes(cat)) {
          relevantCategories.push(cat);
        }
      });
    }
  }

  // If no specific categories found, include general ones
  if (relevantCategories.length === 0) {
    if (availableCategories.includes('General Catalog')) {
      relevantCategories.push('General Catalog');
    }
    if (availableCategories.includes('FaQ')) {
      relevantCategories.push('FaQ');
    }
  }

  return {
    relevantCategories,
    confidence: 0.6,
    reasoning: `Keyword-based analysis found: ${relevantCategories.join(', ')}`,
  };
} 