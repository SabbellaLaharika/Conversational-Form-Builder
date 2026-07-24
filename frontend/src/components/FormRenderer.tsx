import React, { useState, useEffect } from 'react';

interface SchemaProperty {
  type?: string;
  title?: string;
  format?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  'x-show-when'?: {
    field: string;
    equals: any;
  };
  description?: string;
}

interface FormSchema {
  type?: string;
  properties?: {
    [key: string]: SchemaProperty;
  };
  required?: string[];
}

interface FormRendererProps {
  schema: FormSchema;
}

export const FormRenderer: React.FC<FormRendererProps> = ({ schema }) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [submittedData, setSubmittedData] = useState<any>(null);

  // Reset form data when schema changes
  useEffect(() => {
    const initialData: Record<string, any> = {};
    if (schema.properties) {
      Object.keys(schema.properties).forEach((key) => {
        const prop = schema.properties![key];
        if (prop.type === 'boolean') {
          initialData[key] = false;
        } else {
          initialData[key] = '';
        }
      });
    }
    setFormData(initialData);
    setSubmittedData(null);
  }, [schema]);

  const handleChange = (fieldName: string, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [fieldName]: value,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedData(formData);
  };

  if (!schema || !schema.properties || Object.keys(schema.properties).length === 0) {
    return (
      <div className="empty-form-state">
        <p>No form schema generated yet. Describe the form you need in the chat to start!</p>
      </div>
    );
  }

  // Determine if a field should be shown based on "x-show-when" property
  const shouldShowField = (prop: SchemaProperty) => {
    if (!prop['x-show-when']) {
      return true;
    }
    const condition = prop['x-show-when'];
    const dependentValue = formData[condition.field];
    return dependentValue === condition.equals;
  };

  return (
    <div className="form-container">
      <form onSubmit={handleSubmit} className="form-renderer-body">
        {Object.keys(schema.properties).map((key) => {
          const prop = schema.properties![key];
          if (!shouldShowField(prop)) {
            return null;
          }

          const isRequired = schema.required?.includes(key);

          return (
            <div key={key} className="form-field-group" data-testid={`field-container-${key}`}>
              <label htmlFor={key} className="form-label">
                {prop.title || key} {isRequired && <span className="required-asterisk">*</span>}
              </label>

              {prop.enum && prop.enum.length <= 3 ? (
                <div className="radio-group" style={{ display: 'flex', gap: '15px', marginTop: '5px' }}>
                  {prop.enum.map((option) => (
                    <label key={option} className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name={key}
                        value={option}
                        checked={formData[key] === option}
                        onChange={(e) => handleChange(key, e.target.value)}
                        required={isRequired}
                        data-testid={`field-${key}-${option}`}
                        className="form-radio"
                      />
                      <span className="radio-text" style={{ fontSize: '0.9rem', color: '#e2e8f0' }}>{option}</span>
                    </label>
                  ))}
                </div>
              ) : prop.enum ? (
                <select
                  id={key}
                  name={key}
                  value={formData[key] || ''}
                  onChange={(e) => handleChange(key, e.target.value)}
                  required={isRequired}
                  data-testid={`field-${key}`}
                  className="form-select"
                >
                  <option value="">Select option...</option>
                  {prop.enum.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (prop.type === 'number' || prop.type === 'integer') && prop.minimum !== undefined && prop.maximum !== undefined ? (
                <div className="slider-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <input
                    type="range"
                    id={key}
                    name={key}
                    min={prop.minimum}
                    max={prop.maximum}
                    value={formData[key] !== undefined ? formData[key] : prop.minimum}
                    onChange={(e) => handleChange(key, Number(e.target.value))}
                    data-testid={`field-${key}`}
                    className="form-slider"
                    style={{ flex: 1, accentColor: '#22d3ee', cursor: 'pointer' }}
                  />
                  <span className="slider-value" style={{ minWidth: '30px', textAlign: 'center', fontSize: '0.9rem', color: '#22d3ee', fontWeight: 'bold' }}>
                    {formData[key] !== undefined ? formData[key] : prop.minimum}
                  </span>
                </div>
              ) : prop.type === 'boolean' ? (
                <div className="checkbox-wrapper">
                  <input
                    type="checkbox"
                    id={key}
                    name={key}
                    checked={!!formData[key]}
                    onChange={(e) => handleChange(key, e.target.checked)}
                    data-testid={`field-${key}`}
                    className="form-checkbox"
                  />
                  <span className="checkbox-custom-label">{prop.description || 'Enable'}</span>
                </div>
              ) : key.toLowerCase().includes('message') || 
                  key.toLowerCase().includes('description') || 
                  key.toLowerCase().includes('comments') || 
                  key.toLowerCase().includes('address') ? (
                <textarea
                  id={key}
                  name={key}
                  value={formData[key] || ''}
                  onChange={(e) => handleChange(key, e.target.value)}
                  required={isRequired}
                  placeholder={prop.description || `Enter ${prop.title || key}`}
                  data-testid={`field-${key}`}
                  className="form-textarea"
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '0.75rem',
                    borderRadius: '0.375rem',
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    color: '#f8fafc',
                    fontFamily: 'inherit',
                    fontSize: '0.95rem',
                    resize: 'vertical',
                    marginTop: '5px'
                  }}
                />
              ) : (
                <input
                  type={
                    prop.format === 'data-url' || 
                    key.toLowerCase().includes('resume') || 
                    key.toLowerCase().includes('coverletter') || 
                    key.toLowerCase().includes('file') || 
                    key.toLowerCase().includes('upload')
                      ? 'file'
                      : key.toLowerCase().includes('password')
                      ? 'password'
                      : prop.format === 'email'
                      ? 'email'
                      : prop.format === 'date'
                      ? 'date'
                      : prop.format === 'time'
                      ? 'time'
                      : prop.format === 'date-time'
                      ? 'datetime-local'
                      : prop.type === 'integer' || prop.type === 'number'
                      ? 'number'
                      : 'text'
                  }
                  id={key}
                  name={key}
                  value={
                    prop.format === 'data-url' || 
                    key.toLowerCase().includes('resume') || 
                    key.toLowerCase().includes('coverletter') || 
                    key.toLowerCase().includes('file') || 
                    key.toLowerCase().includes('upload')
                      ? undefined 
                      : formData[key] || ''
                  }
                  onChange={(e) => {
                    if (e.target.type === 'file') {
                      handleChange(key, e.target.files?.[0]?.name || '');
                    } else {
                      handleChange(key, e.target.value);
                    }
                  }}
                  required={isRequired}
                  placeholder={prop.description || `Enter ${prop.title || key}`}
                  data-testid={`field-${key}`}
                  className="form-input"
                />
              )}
            </div>
          );
        })}

        <button type="submit" className="form-submit-button">
          Submit Form Data
        </button>
      </form>

      {submittedData && (
        <div className="submitted-data-output">
          <h4>Submitted Data</h4>
          <pre>{JSON.stringify(submittedData, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};
