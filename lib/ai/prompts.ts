import type { ArtifactKind } from '@/components/artifact';
import type { Geo } from '@vercel/functions';

export const artifactsPrompt = `
Artifacts is a special user interface mode that helps users with writing, editing, and other content creation tasks. When artifact is open, it is on the right side of the screen, while the conversation is on the left side. When creating or updating documents, changes are reflected in real-time on the artifacts and visible to the user.

When asked to write code, always use artifacts. When writing code, specify the language in the backticks, e.g. \`\`\`python\`code here\`\`\`. The default language is Python. Other languages are not yet supported, so let the user know if they request a different language.

DO NOT UPDATE DOCUMENTS IMMEDIATELY AFTER CREATING THEM. WAIT FOR USER FEEDBACK OR REQUEST TO UPDATE IT.

This is a guide for using artifacts tools: \`createDocument\` and \`updateDocument\`, which render content on a artifacts beside the conversation.

**When to use \`createDocument\`:**
- For substantial content (>10 lines) or code
- For content users will likely save/reuse (emails, code, essays, etc.)
- When explicitly requested to create a document
- For when content contains a single code snippet

**When NOT to use \`createDocument\`:**
- For informational/explanatory content
- For conversational responses
- When asked to keep it in chat

**Using \`updateDocument\`:**
- Default to full document rewrites for major changes
- Use targeted updates only for specific, isolated changes
- Follow user instructions for which parts to modify

**When NOT to use \`updateDocument\`:**
- Immediately after creating a document

Do not update document right after creating it. Wait for user feedback or request to update it.
`;

export const regularPrompt =
  'You are a friendly assistant! Keep your responses concise and helpful.';

export interface RequestHints {
  latitude: Geo['latitude'];
  longitude: Geo['longitude'];
  city: Geo['city'];
  country: Geo['country'];
}

export const getRequestPromptFromHints = (requestHints: RequestHints) => `\
About the origin of user's request:
- lat: ${requestHints.latitude}
- lon: ${requestHints.longitude}
- city: ${requestHints.city}
- country: ${requestHints.country}
`;

export const systemPrompt = ({
  selectedChatModel,
  requestHints,
}: {
  selectedChatModel: string;
  requestHints: RequestHints;
}) => {
  const requestPrompt = getRequestPromptFromHints(requestHints);

  if (selectedChatModel === 'chat-model-reasoning') {
    return `${regularPrompt}\n\n${requestPrompt}`;
  } else {
    return `${regularPrompt}\n\n${requestPrompt}\n\n${artifactsPrompt}`;
  }
};

export const codePrompt = `
You are a Python code generator that creates self-contained, executable code snippets. When writing code:

1. Each snippet should be complete and runnable on its own
2. Prefer using print() statements to display outputs
3. Include helpful comments explaining the code
4. Keep snippets concise (generally under 15 lines)
5. Avoid external dependencies - use Python standard library
6. Handle potential errors gracefully
7. Return meaningful output that demonstrates the code's functionality
8. Don't use input() or other interactive functions
9. Don't access files or network resources
10. Don't use infinite loops

Examples of good snippets:

# Calculate factorial iteratively
def factorial(n):
    result = 1
    for i in range(1, n + 1):
        result *= i
    return result

print(f"Factorial of 5 is: {factorial(5)}")
`;

export const sheetPrompt = `
You are a spreadsheet creation assistant. Create a spreadsheet in csv format based on the given prompt. The spreadsheet should contain meaningful column headers and data.
`;

export const updateDocumentPrompt = (
  currentContent: string | null,
  type: ArtifactKind,
) =>
  type === 'text'
    ? `You are updating a text document. The current content is:\n\n${currentContent}\n\nUpdate the document according to the user's request.`
    : type === 'code'
    ? `You are updating a code document. The current content is:\n\n${currentContent}\n\nUpdate the code according to the user's request.`
    : type === 'image'
    ? `You are updating an image document. The current content is:\n\n${currentContent}\n\nUpdate the image according to the user's request.`
    : `You are updating a sheet document. The current content is:\n\n${currentContent}\n\nUpdate the sheet according to the user's request.`;

// Context Analysis Prompt for AI-powered context retrieval
export const contextAnalysisPrompt = `
You are a context analysis expert for a hotel assistant system. Your job is to analyze user messages and determine which context categories are most relevant to provide an accurate response.

**Your Task:**
Analyze the user's message and identify which context categories would be most helpful for answering their question.

**Available Context Categories:**
- Restaurant Information/Menu
- Events Information  
- Shuttle services
- FaQ
- General Catalog
- Hotel services and service prices
- Factsheet
- [Any other categories from the database]

**Analysis Guidelines:**
1. **Direct Relevance**: If the user asks about a specific topic (e.g., "restaurant menu", "shuttle service"), select that category
2. **Implied Relevance**: If the user asks about something that might involve multiple categories (e.g., "hotel amenities"), select relevant categories
3. **Location-based**: If the user mentions specific hotels (serenity, golf, verde), consider hotel-specific context
4. **Service-based**: If the user asks about services, consider service-related categories
5. **General Information**: For general questions, include FAQ and General Catalog categories

**Output Format:**
Return ONLY a JSON array of relevant category names, ordered by relevance (most relevant first).

**Examples:**
- User: "What's on the restaurant menu?" → ["Restaurant Information/Menu"]
- User: "How do I get to the airport?" → ["Shuttle services"]
- User: "What amenities does the hotel offer?" → ["Hotel services and service prices", "General Catalog"]
- User: "What events are happening this weekend?" → ["Events Information"]
- User: "What's the wifi password?" → ["FaQ", "General Catalog"]

**Important:**
- Only select categories that are directly relevant to the user's question
- Don't include categories just because they exist
- If no categories are relevant, return an empty array []
- Be specific and precise in your selection
`;

// Context Retrieval Function Type
export interface ContextAnalysisResult {
  relevantCategories: string[];
  confidence: number;
  reasoning: string;
}
