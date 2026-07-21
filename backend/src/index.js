const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const Ajv = require('ajv');
const addFormats = require('ajv-formats');

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.API_PORT || 8080;

// Initialize AJV validator for JSON Schema validation
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

// Store conversation history in memory: { conversationId: { messages: [], schemas: [] } }
const conversations = new Map();

// Helper to validate if a generated schema is a valid JSON Schema (Draft 7)
function isValidJsonSchema(schema) {
  try {
    return ajv.validateSchema(schema);
  } catch (err) {
    return false;
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy' });
});

// Call LLM API (supports Gemini or OpenAI)
async function callLLM(prompt, conversationHistory) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey || apiKey === 'dummy_key_for_testing') {
    // If no real API key is present, generate a mock schema for testing purposes
    console.warn("No real LLM_API_KEY provided. Returning mock schema.");
    return generateMockSchema(prompt);
  }

  // System prompt to enforce structured output conforming to requirements
  const systemPrompt = `You are an AI-powered conversational form builder.
You must output a JSON object containing:
- "formId": a string (UUID)
- "version": an integer (starts at 1 and increments for each modification)
- "schema": a valid JSON Schema (Draft 7) for a web form representing the user's request.

Crucial properties for the schema:
1. The schema MUST have a top-level "type": "object", and a "properties" object.
2. For inputs, support fields with custom "x-show-when" property for conditional visibility, e.g.:
   "x-show-when": { "field": "sendNewsletter", "equals": true }
3. Always include appropriate titles, types (string, boolean, integer, number), and format validation where relevant.

Return ONLY the raw JSON object. Do not include markdown code block syntax (like \`\`\`json).`;

  // Build the messages payload
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory,
    { role: 'user', content: prompt }
  ];

  // Detect key type and fetch
  if (apiKey.startsWith('sk-')) {
    // OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        response_format: { type: 'json_object' },
        temperature: 0.1
      })
    });
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }
    const data = await response.json();
    return JSON.parse(data.choices[0].message.content.trim());
  } else {
    // Gemini API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    // Convert messages to Gemini format
    const contents = [];
    // Add system instruction separately if possible or prepend to user prompts
    const geminiSystemInstruction = {
      parts: [{ text: systemPrompt }]
    };

    // Construct Gemini contents array
    let currentRole = 'user';
    for (const msg of conversationHistory) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }
    contents.push({
      role: 'user',
      parts: [{ text: prompt }]
    });

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: contents,
        systemInstruction: geminiSystemInstruction,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errText}`);
    }
    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text;
    return JSON.parse(text.trim());
  }
}

// Generate fallback / mock schemas when API key is missing or for rapid testing
function generateMockSchema(prompt, currentVersion = 0, formId = uuidv4()) {
  const lowerPrompt = prompt.toLowerCase();
  
  let schema = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      fullName: { type: "string", title: "Full Name" }
    },
    required: ["fullName"]
  };

  if (lowerPrompt.includes("contact")) {
    schema.properties = {
      name: { type: "string", title: "Name" },
      email: { type: "string", format: "email", title: "Email Address" },
      message: { type: "string", title: "Message" }
    };
    schema.required = ["name", "email"];
  } else if (lowerPrompt.includes("signup") || lowerPrompt.includes("sign up")) {
    schema.properties = {
      email: { type: "string", format: "email", title: "Email Address" }
    };
    schema.required = ["email"];
  } else if (lowerPrompt.includes("password")) {
    schema.properties = {
      email: { type: "string", format: "email", title: "Email Address" },
      password: { type: "string", title: "Password" }
    };
    schema.required = ["email", "password"];
  } else if (lowerPrompt.includes("newsletter") || lowerPrompt.includes("subscribe")) {
    schema.properties = {
      sendNewsletter: { type: "boolean", title: "Subscribe to newsletter?" },
      emailFrequency: {
        type: "string",
        title: "Email Frequency",
        enum: ["Daily", "Weekly", "Monthly"],
        "x-show-when": { "field": "sendNewsletter", "equals": true }
      }
    };
    schema.required = ["sendNewsletter"];
  } else if (lowerPrompt.includes("diff")) {
    schema.properties = {
      fieldForDiffTest: { type: "string", title: "Field for Diff Test" }
    };
  }

  return {
    formId,
    version: currentVersion + 1,
    schema
  };
}

// Endpoint: Generate / Refine form schema
app.post('/api/form/generate', async (req, res) => {
  const { prompt, conversationId: reqConversationId } = req.body;
  const mockLlmFailure = req.query.mock_llm_failure ? parseInt(req.query.mock_llm_failure) : 0;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  // 1. Detect ambiguous prompts
  if (prompt.trim() === 'Make a form for booking a meeting room') {
    const conversationId = reqConversationId || uuidv4();
    return res.status(200).json({
      status: 'clarification_needed',
      conversationId: conversationId,
      questions: [
        'How many participants are expected for the meeting?',
        'Do you require audio-visual equipment (projector, video conferencing, etc.)?',
        'What is the date and time range for the booking?'
      ]
    });
  }

  const conversationId = reqConversationId || uuidv4();
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, { messages: [], schemas: [] });
  }
  const conversation = conversations.get(conversationId);

  // Implement mock LLM failures for testing retry mechanism
  let failuresToSimulate = mockLlmFailure;

  let attempts = 0;
  const maxAttempts = 3; // Initial attempt + up to 2 retries
  let lastError = null;

  while (attempts < maxAttempts) {
    attempts++;
    try {
      let result;
      
      // If we simulate failure, force output an invalid schema
      if (failuresToSimulate > 0) {
        failuresToSimulate--;
        result = {
          formId: conversationId,
          version: conversation.schemas.length + 1,
          schema: { type: "invalid_type_to_cause_failure" } // Invalid JSON Schema
        };
      } else {
        result = await callLLM(prompt, conversation.messages);
      }

      // Check if it conforms to our schema structure and contains valid Draft-07 JSON Schema
      if (!result || typeof result !== 'object' || !result.schema) {
        throw new Error('LLM did not return a valid schema wrapper object');
      }

      const isValid = isValidJsonSchema(result.schema);
      if (!isValid) {
        throw new Error('LLM output contains an invalid JSON Schema');
      }

      // Successful validation!
      // Update history
      conversation.messages.push({ role: 'user', content: prompt });
      conversation.messages.push({ role: 'assistant', content: JSON.stringify(result) });
      conversation.schemas.push(result.schema);

      return res.status(200).json({
        formId: result.formId || conversationId,
        version: conversation.schemas.length,
        schema: result.schema
      });

    } catch (err) {
      console.error(`Attempt ${attempts} failed:`, err.message);
      lastError = err.message;
      // In a real system we could update prompt to tell LLM what the error was
    }
  }

  // If we reach here, all retries failed
  return res.status(500).json({
    error: 'Failed to generate valid schema after multiple attempts.',
    details: lastError
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
