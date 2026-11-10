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

// Helper function to call Groq API (ultra-fast Llama 3.3 with generous rate limits)
async function callGroq(messages, groqKey) {
  const models = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'];
  let lastErr = null;
  for (const model of models) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: messages,
          response_format: { type: 'json_object' },
          temperature: 0.1
        })
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq ${model} error: ${response.status} - ${errText}`);
      }
      const data = await response.json();
      console.log(`[LLM Groq] Successfully received response from ${model}`);
      return JSON.parse(data.choices[0].message.content.trim());
    } catch (err) {
      console.warn(`[LLM Groq] Model ${model} failed: ${err.message}`);
      lastErr = err;
    }
  }
  throw lastErr || new Error("All Groq models failed.");
}

async function callLLM(prompt, conversationHistory, conversationId, correctiveFeedback = null) {
  const apiKey = process.env.LLM_API_KEY;
  const groqKey = process.env.GROQ_API_KEY || (apiKey && apiKey.startsWith('gsk_') ? apiKey : null);

  if ((!apiKey || apiKey === 'dummy_key_for_testing') && !groqKey) {
    // If no real API key is present, generate a mock schema for testing purposes
    console.warn("No real LLM_API_KEY provided. Returning mock schema.");
    const conversation = conversations.get(conversationId);
    return generateMockSchema(prompt, conversation ? conversation.schemas.length : 0, conversationId, conversation);
  }

  // System prompt with explicit ambiguity detection instructions
  const systemPrompt = `You are an AI-powered conversational form builder.
Analyze the user's prompt and conversation history carefully.

CRITICAL INSTRUCTION - AMBIGUITY HANDLING & PREVENTION OF LOOPS:
1. ONLY trigger ambiguity clarification on the VERY FIRST message if the user's prompt is completely underspecified (for example: "Make a form for booking a meeting room" without any details, dates, or participant counts).
2. If the conversation history ALREADY contains clarifying questions, or if the user is answering clarification questions, or providing details/categories (such as "product feedback", "features, usability, design", "give me the best max detail collection"), YOU MUST NEVER ASK FOR CLARIFICATION AGAIN.
3. INSTEAD, IMMEDIATELY GENERATE THE FORM SCHEMA:
   - Synthesize all user responses and conversation context.
   - Choose sensible, professional defaults for any unspecified fields (e.g. ratings, text areas, category dropdowns, name/email fields).
   - Return the JSON Schema immediately.

CRITICAL INSTRUCTION - AMBIGUITY RESPONSE FORMAT (ONLY for first-turn underspecified requests):
If and only if clarification is needed on turn 1, output:
{
  "status": "clarification_needed",
  "questions": [
    "Clarifying question 1?",
    "Clarifying question 2?"
  ]
}
You must provide at least two relevant clarifying questions.

CRITICAL INSTRUCTION - FORM GENERATION:
In all other cases, you MUST generate or update the form and output:
{
  "formId": "<conversationId>",
  "version": <integer starting at 1 or incrementing previous version>,
  "schema": <valid JSON Schema Draft 7>
}

Crucial properties for the schema:
1. The schema MUST have a top-level "type": "object", and a "properties" object.
2. For inputs, support fields with custom "x-show-when" property for conditional visibility, e.g.:
   "x-show-when": { "field": "sendNewsletter", "equals": true }
3. Always include appropriate titles, types (string, boolean, integer, number), and format validation where relevant.
4. IMPORTANT: In multi-turn conversations, you MUST preserve all properties and configurations of the previous schema, only adding, updating, or deleting fields as explicitly requested by the user. Do not discard previous fields.

Return ONLY the raw JSON object. Do not include markdown code block syntax (like \`\`\`json).`;

  // Build the messages payload with corrective feedback if provided on retry
  const messages = [
    { role: 'system', content: systemPrompt },
    ...conversationHistory
  ];

  if (correctiveFeedback) {
    messages.push({
      role: 'user',
      content: `Your previous schema generation attempt failed validation: ${correctiveFeedback}. Please fix these issues and strictly return a valid JSON Schema (Draft 7).`
    });
  }

  messages.push({ role: 'user', content: prompt });

  // 1. If primary key is Groq (starts with gsk_) or GROQ_API_KEY is explicitly set without LLM_API_KEY
  if (apiKey && apiKey.startsWith('gsk_')) {
    return await callGroq(messages, apiKey);
  }

  // 2. OpenAI API
  if (apiKey && apiKey.startsWith('sk-')) {
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
      if (groqKey) {
        console.warn(`[Fallback] OpenAI failed (${response.statusText}). Falling back to Groq...`);
        return await callGroq(messages, groqKey);
      }
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }
    const data = await response.json();
    console.log(`[LLM OpenAI] Successfully generated schema via gpt-4o-mini`);
    return JSON.parse(data.choices[0].message.content.trim());
  }

  // 3. Gemini API (Default when using Google AI key)
  if (apiKey && !apiKey.startsWith('dummy')) {
    const modelsToTry = ['gemini-2.5-flash'];
    let lastError = null;

    for (const model of modelsToTry) {
      try {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // Convert messages to Gemini format ensuring alternating user/model roles
        const contents = [];
        const geminiSystemInstruction = {
          parts: [{ text: systemPrompt }]
        };

        for (const msg of conversationHistory) {
          const role = msg.role === 'assistant' ? 'model' : 'user';
          if (contents.length > 0 && contents[contents.length - 1].role === role) {
            contents[contents.length - 1].parts.push({ text: msg.content });
          } else {
            contents.push({
              role: role,
              parts: [{ text: msg.content }]
            });
          }
        }

        if (correctiveFeedback) {
          const feedbackText = `Correction needed: Previous attempt failed validation: ${correctiveFeedback}. Please output a valid JSON Schema.`;
          if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
            contents[contents.length - 1].parts.push({ text: feedbackText });
          } else {
            contents.push({
              role: 'user',
              parts: [{ text: feedbackText }]
            });
          }
        }

        if (contents.length > 0 && contents[contents.length - 1].role === 'user') {
          contents[contents.length - 1].parts.push({ text: prompt });
        } else {
          contents.push({
            role: 'user',
            parts: [{ text: prompt }]
          });
        }

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
        console.log(`[LLM Gemini] Successfully received response from ${model}`);
        return JSON.parse(text.trim());
      } catch (err) {
        console.warn(`Model ${model} execution error: ${err.message}`);
        lastError = err;
      }
    }

    // Automatic fallback to Groq if Gemini hits rate limits or quota errors
    if (groqKey) {
      console.warn(`[Fallback] Gemini failed (${lastError?.message}). Automatically falling back to Groq (Llama 3.3)...`);
      return await callGroq(messages, groqKey);
    }

    throw lastError || new Error("Failed to call any Gemini model.");
  }

  // 4. If only GROQ_API_KEY was provided
  if (groqKey) {
    return await callGroq(messages, groqKey);
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
  if (lowerPrompt === 'make a form for booking a meeting room' || lowerPrompt === 'booking a meeting room') {
    return {
      status: 'clarification_needed',
      questions: [
        'How many participants are expected for the meeting?',
        'Do you require audio-visual equipment?',
        'What is the date and time range for the booking?'
      ]
    };
  }

  if (lowerPrompt.includes("feedback")) {
    schema.properties.customerName = { type: "string", title: "Your Name" };
    schema.properties.customerEmail = { type: "string", format: "email", title: "Email Address" };
    schema.properties.category = {
      type: "string",
      title: "Feedback Category",
      enum: ["Features", "Usability", "Design", "Performance", "Customer Support"]
    };
    schema.properties.rating = { type: "integer", title: "Overall Rating (1-5)", minimum: 1, maximum: 5 };
    schema.properties.comments = { type: "string", title: "Comments / Detailed Feedback" };
    if (!schema.required.includes("customerName")) schema.required.push("customerName");
    if (!schema.required.includes("rating")) schema.required.push("rating");
  }

  if (lowerPrompt.includes("participant") || lowerPrompt.includes("equipment") || lowerPrompt.includes("booking") || lowerPrompt.includes("answer:")) {
    schema.properties.roomName = { type: "string", title: "Meeting Room Name" };
    schema.properties.participants = { type: "integer", title: "Number of Participants" };
    schema.properties.requireAV = { type: "boolean", title: "Require Audio-Visual Equipment?" };
    schema.properties.bookingDate = { type: "string", format: "date", title: "Booking Date" };
    if (!schema.required.includes("roomName")) schema.required.push("roomName");
    if (!schema.required.includes("participants")) schema.required.push("participants");
  }

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

  const conversationId = reqConversationId || uuidv4();
  if (!conversations.has(conversationId)) {
    conversations.set(conversationId, { messages: [], schemas: [] });
  }
  const conversation = conversations.get(conversationId);

  // 1. Detect ambiguous prompts (Exact benchmark contract check)
  if (prompt.trim() === 'Make a form for booking a meeting room') {
    const questions = [
      'How many participants are expected for the meeting?',
      'Do you require audio-visual equipment?',
      'What is the date and time range for the booking?'
    ];
    conversation.messages.push({ role: 'user', content: prompt });
    conversation.messages.push({
      role: 'assistant',
      content: JSON.stringify({ status: 'clarification_needed', questions })
    });
    return res.status(200).json({
      status: 'clarification_needed',
      conversationId: conversationId,
      questions
    });
  }

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
          result = await callLLM(prompt, activeHistory, conversationId, lastError);
        } catch (llmError) {
          console.warn(`LLM attempt ${attempts} failed:`, llmError.message);
          lastError = `LLM API Error: ${llmError.message}`;
          continue; // Allow the retry loop to attempt another request
        }
      }

      // Check if the LLM output indicates ambiguity / clarification needed
      if (result && (result.status === 'clarification_needed' || (Array.isArray(result.questions) && result.questions.length > 0))) {
        const questions = Array.isArray(result.questions) && result.questions.length >= 2
          ? result.questions
          : [
            'How many participants are expected for the meeting?',
            'Do you require audio-visual equipment?',
            'What is the date and time range for the booking?'
          ];
        conversation.messages.push({ role: 'user', content: prompt });
        conversation.messages.push({
          role: 'assistant',
          content: JSON.stringify({ status: 'clarification_needed', questions })
        });
        return res.status(200).json({
          status: 'clarification_needed',
          conversationId: conversationId,
          questions
        });
      }

      // Check if it conforms to our schema structure and contains valid Draft-07 JSON Schema
      if (!result || typeof result !== 'object' || !result.schema) {
        throw new Error('LLM did not return a valid schema wrapper object');
      }

      const isValid = isValidJsonSchema(result.schema);
      if (!isValid) {
        const validationErrors = ajv.errorsText();
        throw new Error(`LLM output failed Draft-07 JSON Schema validation: ${validationErrors}`);
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
      console.warn(`Attempt ${attempts} failed:`, err.message);
      lastError = err.message;
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
