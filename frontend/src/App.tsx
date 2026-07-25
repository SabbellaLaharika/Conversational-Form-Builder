import { useState } from 'react';
import { FormRenderer } from './components/FormRenderer';
import { Send, Download, Copy, Code, Terminal, MessageSquare, RefreshCw, AlertCircle } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  questions?: string[];
  status?: string;
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hello! I am your AI Form Builder. Tell me what kind of form you would like to build. For example, 'Create a contact form with a name, email and message field.'",
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [currentSchema, setCurrentSchema] = useState<any>(null);
  const [previousSchema, setPreviousSchema] = useState<any>(null);
  const [schemasHistory, setSchemasHistory] = useState<{ version: number; schema: any }[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const handleSendMessage = async (promptToSend?: string) => {
    const text = (promptToSend || inputPrompt).trim();
    if (!text) return;

    if (!promptToSend) {
      setInputPrompt('');
    }

    // Add user message to UI
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch('http://localhost:8080/api/form/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: text,
          conversationId: conversationId || undefined,
          version: selectedVersion || undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Server error generating form');
      }

      const data = await response.json();

      if (data.status === 'clarification_needed') {
        // Clarification questions returned
        if (data.conversationId) {
          setConversationId(data.conversationId);
        }
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: 'I need some clarification to build the perfect form:',
            questions: data.questions,
            status: 'clarification_needed',
          },
        ]);
      } else {
        // Form schema generated successfully
        if (data.formId) {
          setConversationId(data.formId);
        }
        // Save current schema as previous schema for diff comparison
        if (currentSchema) {
          setPreviousSchema(currentSchema);
        }
        setCurrentSchema(data.schema);
        
        // Update schemas history timeline
        setSchemasHistory((prev) => {
          if (!conversationId || data.version === 1) {
            return [{ version: 1, schema: data.schema }];
          }
          const nextVersion = data.version || (prev.length + 1);
          if (prev.some((item) => item.version === nextVersion)) {
            return prev;
          }
          return [...prev, { version: nextVersion, schema: data.schema }];
        });
        setSelectedVersion(data.version || 1);

        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `Form generated successfully (v${data.version || 1})!`,
          },
        ]);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const getDiffText = () => {
    if (!previousSchema || !currentSchema) return '';
    const prevProps = previousSchema.properties || {};
    const currProps = currentSchema.properties || {};

    const added: string[] = [];
    const removed: string[] = [];
    const modified: string[] = [];

    // Check added and modified
    Object.keys(currProps).forEach((key) => {
      if (!prevProps[key]) {
        added.push(key);
      } else if (JSON.stringify(prevProps[key]) !== JSON.stringify(currProps[key])) {
        modified.push(key);
      }
    });

    // Check removed
    Object.keys(prevProps).forEach((key) => {
      if (!currProps[key]) {
        removed.push(key);
      }
    });

    let diffOutput = '';
    if (added.length > 0) {
      diffOutput += added.map((field) => `+ ${field}`).join('\n') + '\n';
    }
    if (removed.length > 0) {
      diffOutput += removed.map((field) => `- ${field}`).join('\n') + '\n';
    }
    if (modified.length > 0) {
      diffOutput += modified.map((field) => `~ ${field}`).join('\n') + '\n';
    }

    return diffOutput.trim() || 'No structural changes detected between versions.';
  };

  const showDiff = previousSchema && currentSchema;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const downloadJsonSchema = () => {
    if (!currentSchema) return;
    const blob = new Blob([JSON.stringify(currentSchema, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `form-schema-${conversationId || 'export'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const reactCodeSnippet = currentSchema
    ? `import React, { useState } from 'react';

const schema = ${JSON.stringify(currentSchema, null, 2)};

export default function MyForm() {
  const [formData, setFormData] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    console.log("Submitted Data:", formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      {Object.entries(schema.properties).map(([key, prop]) => (
        <div key={key}>
          <label>{prop.title || key}</label>
          <input 
            type={prop.type === 'integer' ? 'number' : 'text'} 
            onChange={(e) => setFormData(prev => ({...prev, [key]: e.target.value}))}
          />
        </div>
      ))}
      <button type="submit">Submit</button>
    </form>
  );
}`
    : '';

  const curlSnippet = `curl -X POST \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "A contact form", "conversationId": "${conversationId || 'new'}"}' \\
  http://localhost:8080/api/form/generate`;

  return (
    <div className="app-wrapper">
      <header className="app-header">
        <div className="header-title-container">
          <RefreshCw className="header-icon" />
          <h1>AI-Powered Form Builder</h1>
        </div>
        <p className="header-subtitle">Enforcing reliable JSON Schema through natural conversation</p>
      </header>

      <main className="split-pane-layout">
        {/* Chat Pane */}
        <section className="pane chat-pane" data-testid="chat-pane">
          <div className="pane-header">
            <MessageSquare className="pane-header-icon" />
            <h2>Conversational Agent</h2>
          </div>

          <div className="messages-list">
            {messages.map((msg, index) => (
              <div key={index} className={`message-bubble-wrapper ${msg.role}`}>
                <div className={`message-bubble ${msg.role}`}>
                  <p>{msg.content}</p>
                  {msg.questions && msg.questions.length > 0 && (
                    <ul className="clarification-list">
                      {msg.questions.map((q, idx) => (
                        <li key={idx} className="clarification-item">
                          <button
                            onClick={() => {
                              setInputPrompt(`Answer: ${q}`);
                            }}
                            className="clarification-btn-helper"
                          >
                            {q}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message-bubble-wrapper assistant">
                <div className="message-bubble assistant loading-bubble">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
            {errorMsg && (
              <div className="error-message-banner">
                <AlertCircle className="error-icon" />
                <p>{errorMsg}</p>
              </div>
            )}
          </div>

          <div className="chat-input-area">
            <input
              type="text"
              placeholder="e.g. Add a phone number field to the form..."
              value={inputPrompt}
              onChange={(e) => setInputPrompt(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              disabled={isLoading}
              className="chat-input"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isLoading || !inputPrompt.trim()}
              className="chat-send-btn"
            >
              <Send size={18} />
            </button>
          </div>
        </section>

        {/* Form Renderer Pane */}
        <section className="pane form-renderer-pane" data-testid="form-renderer-pane">
          <div className="pane-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Code className="pane-header-icon" />
              <h2>Live Form Preview</h2>
            </div>
            {schemasHistory.length > 1 && (
              <div className="version-selector-container" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Version:</span>
                <select
                  value={selectedVersion || ''}
                  onChange={(e) => {
                    const ver = parseInt(e.target.value);
                    setSelectedVersion(ver);
                    const selectedItem = schemasHistory.find(h => h.version === ver);
                    const prevItem = schemasHistory.find(h => h.version === ver - 1);
                    if (selectedItem) {
                      setCurrentSchema(selectedItem.schema);
                    }
                    if (prevItem) {
                      setPreviousSchema(prevItem.schema);
                    } else {
                      setPreviousSchema(null);
                    }
                  }}
                  style={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#22d3ee',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '0.85rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  {schemasHistory.map((item) => (
                    <option key={item.version} value={item.version}>
                      v{item.version} {item.version === schemasHistory[schemasHistory.length - 1].version ? '(Latest)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="pane-content-scroll">
            <FormRenderer schema={currentSchema || {}} />

            {/* Schema Diff Panel */}
            {showDiff && (
              <div className="schema-diff-panel" data-testid="schema-diff-panel">
                <h3>Schema Version Diff</h3>
                <pre>{getDiffText()}</pre>
              </div>
            )}

            {/* Export Panel */}
            {currentSchema && (
              <div className="export-panel" data-testid="export-panel">
                <h3>Export Actions</h3>
                <div className="export-buttons-row">
                  <button
                    onClick={downloadJsonSchema}
                    data-testid="export-json-button"
                    className="export-action-btn"
                  >
                    <Download size={16} />
                    Export JSON Schema
                  </button>
                  <button
                    onClick={() => handleCopy(reactCodeSnippet, 'Code')}
                    data-testid="copy-code-button"
                    className="export-action-btn"
                  >
                    <Copy size={16} />
                    {copiedText === 'Code' ? 'Copied!' : 'Copy React Code'}
                  </button>
                  <button
                    onClick={() => handleCopy(curlSnippet, 'Curl')}
                    data-testid="copy-curl-button"
                    className="export-action-btn"
                  >
                    <Terminal size={16} />
                    {copiedText === 'Curl' ? 'Copied!' : 'Copy cURL'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
