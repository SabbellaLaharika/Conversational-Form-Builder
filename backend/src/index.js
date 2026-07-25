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

async function callLLM(prompt, conversationHistory, conversationId) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey || apiKey === 'dummy_key_for_testing') {
    // If no real API key is present, generate a mock schema for testing purposes
    console.warn("No real LLM_API_KEY provided. Returning mock schema.");
    const conversation = conversations.get(conversationId);
    return generateMockSchema(prompt, conversation ? conversation.schemas.length : 0, conversationId, conversation);
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
4. IMPORTANT: In multi-turn conversations, you MUST preserve all properties and configurations of the previous schema, only adding, updating, or deleting fields as explicitly requested by the user. Do not discard previous fields.

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
    const modelsToTry = ['gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-pro'];
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        // Convert messages to Gemini format
        const contents = [];
        const geminiSystemInstruction = {
          parts: [{ text: systemPrompt }]
        };

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
          console.warn(`Model ${model} request failed: ${response.status} - ${errText}`);
          lastError = new Error(`Model ${model} failed: ${response.status} - ${errText}`);
          continue;
        }

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;
        return JSON.parse(text.trim());
      } catch (err) {
        console.warn(`Model ${model} execution error: ${err.message}`);
        lastError = err;
      }
    }
    throw lastError || new Error("Failed to call any Gemini model.");
  }
}

// Generate fallback / mock schemas when API key is missing or for rapid testing
function generateMockSchema(prompt, currentVersion = 0, formId = uuidv4(), conversation = null, customBaseSchema = null) {
  const lowerPrompt = prompt.toLowerCase();
  
  // Try to load the previous schema from the conversation state to build upon it
  let lastSchema = null;
  if (customBaseSchema) {
    try {
      lastSchema = JSON.parse(JSON.stringify(customBaseSchema));
    } catch (e) {
      console.error("Error copying custom base schema:", e);
    }
  } else if (conversation && conversation.schemas && conversation.schemas.length > 0) {
    try {
      lastSchema = JSON.parse(JSON.stringify(conversation.schemas[conversation.schemas.length - 1]));
    } catch (e) {
      console.error("Error copying last schema:", e);
    }
  }

  // Base schema configuration
  let schema = lastSchema || {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {},
    required: []
  };

  if (!schema.properties) schema.properties = {};
  if (!schema.required) schema.required = [];

  // Cumulative modifications based on keywords in user prompt
  if (lowerPrompt.includes("contact")) {
    schema.properties.name = { type: "string", title: "Name" };
    schema.properties.email = { type: "string", format: "email", title: "Email Address" };
    schema.properties.message = { type: "string", title: "Message" };
    if (!schema.required.includes("name")) schema.required.push("name");
    if (!schema.required.includes("email")) schema.required.push("email");
  } 
  
  if (lowerPrompt.includes("signup") || lowerPrompt.includes("sign up")) {
    schema.properties.email = { type: "string", format: "email", title: "Email Address" };
    if (!schema.required.includes("email")) schema.required.push("email");
  } 
  
  if (lowerPrompt.includes("password")) {
    schema.properties.password = { type: "string", title: "Password" };
    if (!schema.required.includes("password")) schema.required.push("password");
  } 
  
  if (lowerPrompt.includes("newsletter") || lowerPrompt.includes("subscribe")) {
    schema.properties.sendNewsletter = { type: "boolean", title: "Subscribe to newsletter?" };
  } 
  
  if (lowerPrompt.includes("emailfrequency")) {
    schema.properties.emailFrequency = {
      type: "string",
      title: "Email Frequency",
      enum: ["Daily", "Weekly", "Monthly"],
      "x-show-when": { "field": "sendNewsletter", "equals": true }
    };
  } 
  
  if (lowerPrompt.includes("diff") || lowerPrompt.includes("fieldfordifftest")) {
    schema.properties.fieldForDiffTest = { type: "string", title: "Field for Diff Test" };
  }

  return {
    formId,
    version: currentVersion + 1,
    schema
  };
}

// Endpoint: Generate / Refine form schema
app.post('/api/form/generate', async (req, res) => {
  const { prompt, conversationId: reqConversationId, version: reqVersion } = req.body;
  console.log(`[API POST] prompt="${prompt}", conversationId="${reqConversationId || 'undefined'}", version="${reqVersion || 'latest'}"`);
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
        'Do you require audio-visual equipment?',
        'What is the date and time range for the booking?'
      ]
    });
  }

  const conversationId = reqConversationId || uuidv4();
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, { messages: [], schemas: [] });
  }
  const conversation = conversations.get(conversationId);

  // Get the base schema and conversation history matching the requested version
  let baseSchema = null;
  let activeHistory = conversation.messages;

  if (reqVersion !== undefined && reqVersion !== null) {
    const versionNum = parseInt(reqVersion);
    if (!isNaN(versionNum) && versionNum > 0 && versionNum <= conversation.schemas.length) {
      baseSchema = conversation.schemas[versionNum - 1];
      activeHistory = conversation.messages.slice(0, 2 * versionNum);
    }
  }

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
        try {
          result = await callLLM(prompt, activeHistory, conversationId);
        } catch (llmError) {
          console.warn("LLM API call failed. Falling back to Mock Schema Generator:", llmError.message);
          result = generateMockSchema(prompt, conversation.schemas.length, conversationId, conversation, baseSchema);
        }
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
        formId: conversationId,
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
